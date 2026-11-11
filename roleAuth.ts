// Role passwords and staff credentials: salted scrypt hashes kept only on the server, the public view every client gets,
// write filtering, signed role sessions and the /api/role-auth/* routes.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import type express from 'express';
import { createAttemptLimiter, safeEqual } from './siteAuth';
import {
  SECRET_FIELD_RE,
  ROLE_SECRET_KEYS,
  type RoleSecretKey,
  FORBIDDEN_SEGMENTS,
  pathSegments,
  filterSecretWrite,
  stripConfig,
  stripAppConfig,
  stripWhatsappConfig,
  publicStaffEntry
} from './authShared';

const MAX_INPUT_CHARS = 1024;
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const MAX_SCRYPT_MEM = 256 * 1024 * 1024;
export const ROLE_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const ROLE_COOKIE = 'tfw_role_session';
const STAFF_KEY_RE = /^operator_([A-Za-z0-9-]{1,40})$/;

export const TICKET_ROLES = ['admin', 'maintenance', 'maintenance-kpi'];
export const ADMIN_ROLES = ['admin'];
export const HISTORY_ROLES = ['admin', 'operation-officer'];
export const REPORT_ROLES = ['admin', 'management'];
export const KPI_ROLES = ['admin', 'maintenance-kpi'];

const isMap = (v: any): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------------------------------------------

function scryptAsync(secret: string, salt: Buffer, keylen: number, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, keylen, { N, r, p, maxmem: 128 * N * r + 128 * r * p + 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

interface ParsedHash { N: number; r: number; p: number; salt: Buffer; key: Buffer }

function parseHash(stored: unknown): ParsedHash | null {
  if (typeof stored !== 'string' || stored.length > 512) return null;
  const m = /^scrypt\$(\d{1,8})\$(\d{1,3})\$(\d{1,3})\$([A-Za-z0-9_-]{11,88})\$([A-Za-z0-9_-]{22,88})$/.exec(stored);
  if (!m) return null;
  const N = Number(m[1]), r = Number(m[2]), p = Number(m[3]);
  // A tampered database must not make every sign-in allocate gigabytes.
  if (!(N >= 2 && N <= 2 ** 20 && (N & (N - 1)) === 0) || r < 1 || r > 32 || p < 1 || p > 16) return null;
  if (128 * N * r > MAX_SCRYPT_MEM) return null;
  const salt = Buffer.from(m[4], 'base64url');
  const key = Buffer.from(m[5], 'base64url');
  if (salt.length < 8 || key.length < 16 || key.length > 64) return null;
  return { N, r, p, salt, key };
}

export function isHashed(stored: unknown): boolean {
  return parseHash(stored) !== null;
}

export async function hashSecret(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(plain, salt, SCRYPT_KEYLEN, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

// Each scrypt run takes 16 MB and a threadpool slot, so a flood of sign-ins must not starve the small server.
const SCRYPT_MAX_ACTIVE = 2;
// Sized for a whole shift signing in at once (about 150 devices): waiting a few seconds beats a refused sign-in.
const SCRYPT_MAX_QUEUED = 200;
// Caps the wait under a guessing flood; a load test of 150 sign-ins at once waited at most 25 s on the live CPU quota.
const SCRYPT_QUEUE_TIMEOUT_MS = 30000;
const SCRYPT_BUSY = Symbol('scrypt-busy');
let scryptActive = 0;
const scryptQueue: Array<() => void> = [];

async function withScryptSlot<T>(fn: () => Promise<T>): Promise<T | typeof SCRYPT_BUSY> {
  if (scryptActive >= SCRYPT_MAX_ACTIVE) {
    if (scryptQueue.length >= SCRYPT_MAX_QUEUED) return SCRYPT_BUSY;
    const gotSlot = await new Promise<boolean>(resolve => {
      const wake = () => { clearTimeout(timer); resolve(true); };
      const timer = setTimeout(() => {
        const i = scryptQueue.indexOf(wake);
        if (i !== -1) scryptQueue.splice(i, 1);
        resolve(false);
      }, SCRYPT_QUEUE_TIMEOUT_MS);
      scryptQueue.push(wake);
    });
    if (!gotSlot) return SCRYPT_BUSY;
  } else {
    scryptActive++;
  }
  try {
    return await fn();
  } finally {
    const next = scryptQueue.shift();
    if (next) next();
    else scryptActive--;
  }
}

export async function verifySecret(plain: unknown, stored: unknown): Promise<boolean> {
  if (typeof plain !== 'string' || plain.length > MAX_INPUT_CHARS) return false;
  const h = parseHash(stored);
  if (!h) return false;
  try {
    const key = await scryptAsync(plain, h.salt, h.key.length, h.N, h.r, h.p);
    return crypto.timingSafeEqual(key, h.key);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Stored secrets
// ---------------------------------------------------------------------------------------------------------------

export interface RoleSecret { hash: string; pv: number; updatedAt: string; legacyHash?: string }
export interface StaffCredentialStored { passwordHash: string | null; recoveryPinHash: string | null; pv: number; createdAt: string; updatedAt?: string }

function roleSecrets(db: any): Record<string, RoleSecret> {
  const roles = db?.config?.authSecrets?.roles;
  return isMap(roles) ? roles : {};
}

function roleSecret(db: any, key: RoleSecretKey): RoleSecret | null {
  const s = roleSecrets(db)[key];
  return s && isHashed(s.hash) ? s : null;
}

function staffMap(db: any): Record<string, any> {
  const m = db?.data?.staffCredentials;
  return isMap(m) ? m : {};
}

function hasStaffSecret(c: any): boolean {
  return isMap(c) && (isHashed(c.passwordHash) || isHashed(c.recoveryPinHash));
}

function ensureAuthSecrets(db: any): Record<string, RoleSecret> {
  if (!isMap(db.config)) db.config = {};
  if (!isMap(db.config.authSecrets)) db.config.authSecrets = { v: 1, roles: {} };
  if (!isMap(db.config.authSecrets.roles)) db.config.authSecrets.roles = {};
  return db.config.authSecrets.roles;
}

export function publicAuthStatus(db: any): { roles: Record<string, boolean> } {
  const roles: Record<string, boolean> = {};
  for (const k of ROLE_SECRET_KEYS) roles[k] = Boolean(roleSecret(db, k));
  return { roles };
}

export function publicStaffMap(value: any): Record<string, any> {
  const out: Record<string, any> = {};
  if (!isMap(value)) return out;
  for (const [k, c] of Object.entries(value)) if (hasStaffSecret(c)) out[k] = publicStaffEntry(c);
  return out;
}

// appConfig field each role password comes from, and whether that value was compared trimmed.
const MIGRATION_SOURCES: Array<[RoleSecretKey, string, boolean]> = [
  ['admin', 'adminPassword', false],
  ['management', 'managementPassword', false],
  ['operation-officer', 'operationOfficerPassword', false],
  ['maintenance', 'maintenancePassword', false],
  ['maintenance-kpi', 'maintenanceKpiPassword', true],
  ['cx', 'cxPassword', false],
  ['information-desk', 'infoDeskPassword', true],
  ['info-desk-add', 'infoDeskAddPassword', true],
  ['info-desk-edit', 'infoDeskEditPassword', true]
];
const TRIMMED_ROLES = new Set<RoleSecretKey>(MIGRATION_SOURCES.filter(s => s[2]).map(s => s[0]));
const KIOSK_LEGACY_PASSWORDS: Array<[RoleSecretKey, string, string]> = [
  ['info-desk-add', 'infoDeskAddPassword', 'toggi123'],
  ['info-desk-edit', 'infoDeskEditPassword', 'edit456']
];

function deleteSecretKeys(obj: any): number {
  if (!isMap(obj)) return 0;
  let n = 0;
  for (const k of Object.keys(obj)) {
    if (SECRET_FIELD_RE.test(k)) { delete obj[k]; n++; }
  }
  return n;
}

/** Converts every plain role password and staff credential to a hash. Idempotent; safe to rerun after a crash. */
export async function migrateAuthSecrets(db: any, opts: { initialAdminPassword?: string; persist: () => void }) {
  const stats = { rolesHashed: 0, staffHashed: 0, plainFieldsRemoved: 0, changed: false };
  if (!isMap(db)) return stats;
  if (!isMap(db.config)) db.config = {};
  const cfg = db.config;
  const before = isMap(cfg.authSecrets) ? cfg.authSecrets.roles : undefined;
  const roles: Record<string, RoleSecret> = {};
  if (isMap(before)) {
    for (const k of ROLE_SECRET_KEYS) {
      const s = before[k];
      if (!isMap(s) || !isHashed(s.hash)) continue;
      roles[k] = { hash: s.hash, pv: Number(s.pv) || 1, updatedAt: String(s.updatedAt || '') };
      if (isHashed(s.legacyHash)) roles[k].legacyHash = s.legacyHash;
    }
  }
  cfg.authSecrets = { v: 1, roles };

  const app = isMap(cfg.appConfig) ? cfg.appConfig : {};
  const now = new Date().toISOString();
  const fromOldBuild = MIGRATION_SOURCES.some(([, field]) => typeof app[field] === 'string' && app[field].trim() !== '');
  const hashedNow = new Set<string>();
  for (const [key, field, trimmed] of MIGRATION_SOURCES) {
    if (roles[key]) continue;
    const raw = app[field];
    if (typeof raw !== 'string') continue;
    const plain = trimmed ? raw.trim() : raw;
    if (!plain) continue;
    roles[key] = { hash: await hashSecret(plain), pv: 1, updatedAt: now };
    hashedNow.add(key);
    stats.rolesHashed++;
  }
  // The old kiosk screen never received appConfig, so its built-in passwords were the ones that worked; they keep
  // working beside the configured value until an admin sets a new kiosk password.
  if (fromOldBuild) {
    for (const [key, field, builtIn] of KIOSK_LEGACY_PASSWORDS) {
      const configured = typeof app[field] === 'string' ? app[field].trim() : '';
      if (configured === builtIn) continue;
      if (!roles[key]) {
        roles[key] = { hash: await hashSecret(builtIn), pv: 1, updatedAt: now };
        stats.rolesHashed++;
      } else if (hashedNow.has(key)) {
        roles[key].legacyHash = await hashSecret(builtIn);
      }
    }
  }
  if (!roles.admin && opts.initialAdminPassword) {
    roles.admin = { hash: await hashSecret(opts.initialAdminPassword), pv: 1, updatedAt: now };
    stats.rolesHashed++;
  }
  if (!roles.admin) console.warn('No admin password is set; set INITIAL_ADMIN_PASSWORD and restart.');
  if (stats.rolesHashed) opts.persist();

  stats.plainFieldsRemoved += deleteSecretKeys(cfg);
  stats.plainFieldsRemoved += deleteSecretKeys(cfg.appConfig);
  if ('authStatus' in cfg) { delete cfg.authStatus; stats.plainFieldsRemoved++; }

  const creds = db.data?.staffCredentials;
  if (creds !== undefined && isMap(db.data)) {
    if (!isMap(creds)) {
      delete db.data.staffCredentials;
      stats.plainFieldsRemoved++;
    } else {
      let sincePersist = 0;
      for (const [k, c] of Object.entries(creds)) {
        if (!isMap(c)) { delete creds[k]; stats.plainFieldsRemoved++; continue; }
        if (isHashed(c.passwordHash) || isHashed(c.recoveryPinHash)) {
          if ('password' in c || 'recoveryPin' in c) {
            delete c.password;
            delete c.recoveryPin;
            stats.plainFieldsRemoved++;
          }
          continue;
        }
        const hasPassword = typeof c.password === 'string' && c.password !== '';
        const hasPin = c.recoveryPin != null && String(c.recoveryPin) !== '';
        if (!hasPassword && !hasPin) {
          delete creds[k];
          stats.plainFieldsRemoved++;
          continue;
        }
        // Login stored both values trimmed already, so they are hashed exactly as stored.
        const entry: StaffCredentialStored = {
          passwordHash: hasPassword ? await hashSecret(c.password) : null,
          recoveryPinHash: hasPin ? await hashSecret(String(c.recoveryPin)) : null,
          pv: 1,
          createdAt: String(c.createdAt || now)
        };
        if (c.updatedAt) entry.updatedAt = String(c.updatedAt);
        creds[k] = entry;
        stats.staffHashed++;
        if (++sincePersist >= 5) { opts.persist(); sincePersist = 0; }
      }
    }
  }
  stats.changed = stats.rolesHashed + stats.staffHashed + stats.plainFieldsRemoved > 0;
  return stats;
}

// ---------------------------------------------------------------------------------------------------------------
// Outbound: what clients may see
// ---------------------------------------------------------------------------------------------------------------

function omitKeys(obj: Record<string, any>, drop: (k: string) => boolean): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (!drop(k)) out[k] = obj[k];
  return out;
}

/** Shallow copy of the database without any secret, plus the computed authStatus. */
export function toPublicDb(db: any): any {
  if (!isMap(db)) return db;
  const cfg = isMap(db.config) ? db.config : {};
  const pc = omitKeys(cfg, k => SECRET_FIELD_RE.test(k) || k === 'authSecrets' || k === 'authStatus');
  if (isMap(cfg.appConfig)) pc.appConfig = stripAppConfig(cfg.appConfig);
  if (isMap(cfg.whatsappConfig)) pc.whatsappConfig = stripWhatsappConfig(cfg.whatsappConfig);
  pc.authStatus = publicAuthStatus(db);
  const data = isMap(db.data) ? db.data : {};
  return { ...db, config: pc, data: 'staffCredentials' in data ? { ...data, staffCredentials: publicStaffMap(data.staffCredentials) } : data };
}

type Outbound = { drop: true } | { drop: false; value: any };

function outboundFilter(seg: string[], value: any, db: any): Outbound {
  const [a, b, c] = seg;
  if (a === 'config' && b === 'authSecrets') return { drop: true };
  if (a === 'config' && b === 'authStatus') return seg.length === 2 ? { drop: false, value: publicAuthStatus(db) } : { drop: true };
  if (a === 'data' && b === 'staffCredentials') {
    if (seg.length === 2) return { drop: false, value: publicStaffMap(value) };
    if (seg.length === 3) return { drop: false, value: value == null ? value : (hasStaffSecret(value) || isMap(value) ? publicStaffEntry(value) : null) };
    return { drop: true };
  }
  if (seg.length === 2 && a === 'config' && SECRET_FIELD_RE.test(b)) return { drop: true };
  if (seg.length === 3 && a === 'config' && b === 'appConfig' && SECRET_FIELD_RE.test(c)) return { drop: true };
  if (seg.length === 3 && a === 'config' && b === 'whatsappConfig' && (c === 'apiTokenInstance' || c === 'whapiToken')) return { drop: true };
  if (!isMap(value)) return { drop: false, value };
  if (seg.length === 0) return { drop: false, value: toPublicDb(value) };
  if (seg.length === 1 && a === 'config') return { drop: false, value: stripConfig(value) };
  if (seg.length === 1 && a === 'data') return { drop: false, value: 'staffCredentials' in value ? { ...value, staffCredentials: publicStaffMap(value.staffCredentials) } : value };
  if (seg.length === 2 && a === 'config' && b === 'appConfig') return { drop: false, value: stripAppConfig(value) };
  if (seg.length === 2 && a === 'config' && b === 'whatsappConfig') return { drop: false, value: stripWhatsappConfig(value) };
  return { drop: false, value };
}

/** The mutation as clients may see it, or null when nothing of it may be sent (clients then refetch). */
export function sanitizeMutationForClients<T extends Record<string, any>>(m: T, db: any): T | null {
  if (!m || typeof m !== 'object') return m;
  let out: any = m;
  if (typeof m.path === 'string') {
    const f = outboundFilter(pathSegments(m.path), m.value, db);
    if (f.drop) {
      if (m.type === 'set' || m.type === 'increment' || m.type === 'remove') return null;
      out = { ...out };
      delete out.path;
      delete out.value;
    } else if (f.value !== m.value) {
      out = { ...out, value: f.value };
    }
  }
  if (isMap(m.updates)) {
    const updates: Record<string, any> = {};
    let changed = false;
    for (const [p, v] of Object.entries(m.updates)) {
      const f = outboundFilter(pathSegments(p), v, db);
      if (f.drop) { changed = true; continue; }
      if (f.value !== v) changed = true;
      updates[p] = f.value;
    }
    if (changed) {
      if (Object.keys(updates).length === 0 && Object.keys(m.updates).length > 0) return null;
      out = { ...out, updates };
    }
  }
  if (isMap(m.db)) out = { ...out, db: toPublicDb(m.db) };
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Inbound: generic writes
// ---------------------------------------------------------------------------------------------------------------

const DAILY_COLLECTIONS = new Set(['attendance', 'operatorAssignments', 'ticketSalesAssignments', 'dailyCounts', 'dailyPackageCounts', 'dailyTicketCounts', 'ticketSalesData', 'packageSales', 'whatsappManagementReports']);

// For a whole collection or a ticket day, any value but a non-empty map wipes it ('x', 0, false and [1] included).
const wipes = (v: any, isRemove: boolean) => isRemove || !isMap(v) || Object.keys(v).length === 0;

// Public settings the server's sign-in checks read, and the roles that may change them.
const PROTECTED_APP_KEYS: Record<string, string[]> = { maintenanceKpiUser: KPI_ROLES, infoDeskUser: ADMIN_ROLES };

function operatorIds(v: any): Set<string> | null {
  if (Array.isArray(v)) return new Set(v.filter(isMap).map(o => String(o.id)));
  if (isMap(v)) return new Set(Object.keys(v).filter(k => isMap(v[k])));
  return null;
}

// Staff sign-in needs the operator in config.operators, so dropping one locks that person out.
function removesOperators(current: any, next: any): boolean {
  const cur = operatorIds(current);
  if (!cur || cur.size === 0) return false;
  const nxt = operatorIds(next);
  if (!nxt) return true;
  for (const id of cur) if (!nxt.has(id)) return true;
  return false;
}

/** Roles needed for a generic write that empties a collection, deletes tickets or operators, or changes a sign-in setting; null when it stays open. */
export function requiredRolesForGenericWrite(seg: string[], value: any, isRemove: boolean, db?: any): string[] | null {
  if (seg.length <= 1) return ADMIN_ROLES;
  if (seg[0] === 'config') {
    if (seg[1] === 'operators') {
      if (seg.length === 2) return removesOperators(db?.config?.operators, isRemove ? null : value) ? ADMIN_ROLES : null;
      if (seg.length === 3) return isRemove || !isMap(value) ? ADMIN_ROLES : null;
      return null;
    }
    // appConfig holds the shared date, sign-in users, roles and branding, so only an admin may delete or replace it with a non-map.
    if (seg[1] === 'appConfig' && seg.length === 2) return wipes(value, isRemove) ? ADMIN_ROLES : null;
    if (seg[1] === 'appConfig' && seg.length >= 3) return Object.prototype.hasOwnProperty.call(PROTECTED_APP_KEYS, seg[2]) ? PROTECTED_APP_KEYS[seg[2]] : null;
    return null;
  }
  if (seg[0] !== 'data') return null;
  if (seg[1] === 'maintenanceTickets') {
    if (seg.length <= 3) return wipes(value, isRemove) ? TICKET_ROLES : null;
    if (seg.length === 4) return isRemove || !isMap(value) ? TICKET_ROLES : null;
    // A remove anywhere inside a ticket deletes the whole ticket (cleanupDeletedTicket); field clears by set stay open.
    return isRemove ? TICKET_ROLES : null;
  }
  if (seg.length === 2 && seg[1] === 'historyLog' && wipes(value, isRemove)) return HISTORY_ROLES;
  if (seg.length === 2 && DAILY_COLLECTIONS.has(seg[1]) && wipes(value, isRemove)) return ADMIN_ROLES;
  return null;
}

const onlyMaps = (v: Record<string, any>) => omitKeys(v, k => !isMap(v[k]));

// Whole-map ticket writes are normal client traffic (every optimistic update), so without a ticket role the tickets a
// map omits are kept instead of deleted, and entries that are not tickets are dropped.
function keepOmittedTickets(db: any, seg: string[], value: any): any {
  if (!isMap(value)) return value;
  const current = db?.data?.maintenanceTickets;
  if (seg.length === 2) {
    const out: Record<string, any> = {};
    for (const [d, day] of Object.entries(value)) if (isMap(day)) out[d] = onlyMaps(day);
    if (!isMap(current)) return out;
    for (const [d, day] of Object.entries(current)) {
      if (!isMap(day)) { if (!(d in out)) out[d] = day; continue; }
      out[d] = isMap(out[d]) ? { ...day, ...out[d] } : day;
    }
    return out;
  }
  if (seg.length === 3) {
    const day = isMap(current) ? current[seg[2]] : undefined;
    return isMap(day) ? { ...day, ...onlyMaps(value) } : onlyMaps(value);
  }
  return value;
}

export type GenericWriteResult =
  | { invalid: true }
  | { ignored: true }
  | { forbidden: string[] }
  | { applied: true; value: any };

/**
 * Applies a client write through setter unless it targets a secret (ignored) or needs a role the caller lacks
 * (forbidden). Stored secrets survive replacement of the root, config or data.
 */
export function applyGenericWrite(
  db: any,
  pathStr: string,
  value: any,
  opts: { isRemove?: boolean; hasRole: (roles: string[]) => boolean; setter: (db: any, path: string, value: any) => void }
): GenericWriteResult {
  const seg = pathSegments(pathStr);
  if (seg.some(s => FORBIDDEN_SEGMENTS.has(s))) return { invalid: true };
  const f = filterSecretWrite(seg, opts.isRemove ? null : value);
  if (f.skip) return { ignored: true };
  const needed = requiredRolesForGenericWrite(seg, f.value, Boolean(opts.isRemove), db);
  if (needed && !opts.hasRole(needed)) return { forbidden: needed };
  let toWrite = opts.isRemove ? null : f.value;
  if (seg[0] === 'data' && seg[1] === 'maintenanceTickets' && (seg.length === 2 || seg.length === 3) && !opts.hasRole(TICKET_ROLES)) {
    toWrite = keepOmittedTickets(db, seg, toWrite);
  }
  // A whole-appConfig save from any screen keeps the sign-in settings the caller may not change.
  const keptAppKeys: Record<string, any> = {};
  if (seg.length === 2 && seg[0] === 'config' && seg[1] === 'appConfig' && isMap(toWrite)) {
    const storedApp = isMap(db.config?.appConfig) ? db.config.appConfig : {};
    const locked = Object.keys(PROTECTED_APP_KEYS).filter(k => !opts.hasRole(PROTECTED_APP_KEYS[k]));
    if (locked.length) {
      toWrite = omitKeys(toWrite, k => locked.includes(k));
      for (const k of locked) if (k in storedApp) keptAppKeys[k] = storedApp[k];
    }
  }
  const keepSecrets = db.config?.authSecrets;
  const keepCreds = db.data?.staffCredentials;
  opts.setter(db, pathStr, toWrite);
  if (Object.keys(keptAppKeys).length && isMap(db.config?.appConfig)) {
    Object.assign(db.config.appConfig, keptAppKeys);
    toWrite = { ...toWrite, ...keptAppKeys };
  }
  if (keepSecrets) {
    if (!isMap(db.config)) db.config = {};
    if (db.config.authSecrets !== keepSecrets) db.config.authSecrets = keepSecrets;
  }
  if (keepCreds) {
    if (!isMap(db.data)) db.data = {};
    if (db.data.staffCredentials !== keepCreds) db.data.staffCredentials = keepCreds;
  }
  return { applied: true, value: toWrite };
}

/**
 * broadcast-sync sections that cannot replace what is stored: a map or list swapped for another kind of value,
 * a map entry that is a map swapped for a non-map, and anything but a map where mapKeys requires one.
 */
export function keepStoredShapes(current: any, incoming: any, mapKeys: Set<string> = new Set()): Record<string, any> {
  if (!isMap(incoming)) return {};
  const cur = isMap(current) ? current : {};
  const out: Record<string, any> = {};
  const kind = (v: any) => (isMap(v) ? 'map' : Array.isArray(v) ? 'list' : 'other');
  for (const [k, v] of Object.entries(incoming)) {
    const c = cur[k];
    if (mapKeys.has(k) && kind(v) !== 'map') continue;
    if (kind(c) !== 'other' && kind(v) !== kind(c)) continue;
    out[k] = isMap(c) && isMap(v) ? omitKeys(v, e => isMap(c[e]) && !isMap(v[e])) : v;
  }
  if (isMap(out.maintenanceTickets)) {
    const days: Record<string, any> = {};
    for (const [d, day] of Object.entries(out.maintenanceTickets)) if (isMap(day)) days[d] = onlyMaps(day);
    out.maintenanceTickets = days;
  }
  return out;
}

/** Puts back the sign-in settings in next that the caller may not change. */
export function restoreProtectedAppConfig(currentApp: any, nextApp: any, hasRole: (roles: string[]) => boolean): void {
  if (!isMap(nextApp) || nextApp === currentApp) return;
  const cur = isMap(currentApp) ? currentApp : {};
  for (const [k, roles] of Object.entries(PROTECTED_APP_KEYS)) {
    if (hasRole(roles)) continue;
    if (k in cur) nextApp[k] = cur[k];
    else delete nextApp[k];
  }
}

/** Plain role values and staff credentials found in an uploaded backup, for adding the ones the server lacks. */
export function extractLegacySecrets(db: any): { roles: Partial<Record<RoleSecretKey, string>>; staff: Record<string, any> } {
  const roles: Partial<Record<RoleSecretKey, string>> = {};
  const app = isMap(db?.config?.appConfig) ? db.config.appConfig : {};
  for (const [key, field, trimmed] of MIGRATION_SOURCES) {
    const raw = app[field];
    if (typeof raw !== 'string') continue;
    const plain = trimmed ? raw.trim() : raw;
    if (plain) roles[key] = plain;
  }
  const staff: Record<string, any> = {};
  const creds = db?.data?.staffCredentials;
  if (isMap(creds)) {
    for (const [k, c] of Object.entries(creds)) {
      if (!isMap(c) || !STAFF_KEY_RE.test(k)) continue;
      if (hasStaffSecret(c) || (typeof c.password === 'string' && c.password !== '') || (c.recoveryPin != null && String(c.recoveryPin) !== '')) staff[k] = c;
    }
  }
  return { roles, staff };
}

/** Hashes what a restored backup brings that the server does not have yet; existing passwords never change. */
export async function prepareLegacySecrets(legacy: ReturnType<typeof extractLegacySecrets>, db: any) {
  const roles: Record<string, RoleSecret> = {};
  const now = new Date().toISOString();
  for (const [k, plain] of Object.entries(legacy.roles)) {
    if (roleSecret(db, k as RoleSecretKey) || !plain) continue;
    roles[k] = { hash: await hashSecret(plain), pv: 1, updatedAt: now };
  }
  const staff: Record<string, StaffCredentialStored> = {};
  const current = staffMap(db);
  for (const [k, c] of Object.entries(legacy.staff)) {
    if (hasStaffSecret(current[k])) continue;
    if (hasStaffSecret(c)) {
      staff[k] = {
        passwordHash: isHashed(c.passwordHash) ? c.passwordHash : null,
        recoveryPinHash: isHashed(c.recoveryPinHash) ? c.recoveryPinHash : null,
        pv: Number(c.pv) || 1,
        createdAt: String(c.createdAt || now),
        ...(c.updatedAt ? { updatedAt: String(c.updatedAt) } : {})
      };
      continue;
    }
    const hasPassword = typeof c.password === 'string' && c.password !== '';
    const hasPin = c.recoveryPin != null && String(c.recoveryPin) !== '';
    staff[k] = {
      passwordHash: hasPassword ? await hashSecret(c.password) : null,
      recoveryPinHash: hasPin ? await hashSecret(String(c.recoveryPin)) : null,
      pv: 1,
      createdAt: String(c.createdAt || now),
      ...(c.updatedAt ? { updatedAt: String(c.updatedAt) } : {})
    };
  }
  return { roles, staff };
}

// ---------------------------------------------------------------------------------------------------------------
// Role sessions
// ---------------------------------------------------------------------------------------------------------------

export interface SessionScope { s: string; d: Record<string, number>; e: number }

function readCookie(req: express.Request, name: string): string {
  const raw = req.headers.cookie;
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

function isHttps(req: express.Request): boolean {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function depVersion(db: any, dep: string): number | null {
  if (dep.startsWith('role:')) {
    const s = roleSecret(db, dep.slice(5) as RoleSecretKey);
    return s ? Number(s.pv) || 1 : null;
  }
  if (dep.startsWith('staff:')) {
    const c = staffMap(db)[dep.slice(6)];
    return hasStaffSecret(c) ? Number(c.pv) || 1 : null;
  }
  // A sign-in admitted without a password stays valid only while that role still has no password.
  if (dep.startsWith('none:')) return roleSecret(db, dep.slice(5) as RoleSecretKey) ? null : 0;
  return null;
}

const ROLE_SESSION_KEY_META = 'role_session_key';

/**
 * The key that signs role sessions. Never derived from SITE_PASSWORD, which every member of staff knows: it is
 * SESSION_SECRET when set, otherwise 32 random bytes kept in tfw.db's app_meta (never in config, so never sent).
 */
export function loadRoleSessionKey(opts: { sessionSecret: string; getMeta: (key: string) => string | null; setMeta: (key: string, value: string) => void }): Buffer {
  // Own derivation string, so site-login tokens and role tokens can never stand in for each other.
  if (opts.sessionSecret) return crypto.createHmac('sha256', opts.sessionSecret).update('tfw-role-session-v1').digest();
  const stored = opts.getMeta(ROLE_SESSION_KEY_META);
  if (stored && /^[A-Za-z0-9_-]{43}$/.test(stored)) return Buffer.from(stored, 'base64url');
  const key = crypto.randomBytes(32);
  try {
    opts.setMeta(ROLE_SESSION_KEY_META, key.toString('base64url'));
  } catch (e: any) {
    console.warn(`Could not store the role-session key, so role sign-ins end when the server restarts: ${e?.message || e}`);
  }
  return key;
}

export function createRoleSessions(key: Buffer, getDb: () => any) {
  const sign = (payload: string) => crypto.createHmac('sha256', key).update(`rs1.${payload}`).digest('base64url');

  function encode(scopes: SessionScope[]): string {
    const payload = Buffer.from(JSON.stringify({ iat: Date.now(), sc: scopes })).toString('base64url');
    return `rs1.${payload}.${sign(payload)}`;
  }

  function decode(token: string): SessionScope[] {
    if (!token || token.length > 4096) return [];
    const m = /^rs1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
    if (!m || !safeEqual(m[2], sign(m[1]))) return [];
    let payload: any;
    try {
      payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf-8'));
    } catch {
      return [];
    }
    if (!payload || !Array.isArray(payload.sc)) return [];
    const now = Date.now();
    const db = getDb();
    return payload.sc.filter((sc: any) =>
      sc && typeof sc.s === 'string' && typeof sc.e === 'number' && sc.e > now && isMap(sc.d) &&
      Object.entries(sc.d).every(([dep, pv]) => depVersion(db, dep) === Number(pv))
    );
  }

  function setCookie(req: express.Request, res: express.Response, value: string, maxAgeSeconds: number) {
    const parts = [`${ROLE_COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSeconds}`];
    if (isHttps(req)) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
  }

  return {
    read(req: express.Request): SessionScope[] {
      return decode(readCookie(req, ROLE_COOKIE));
    },
    issue(req: express.Request, res: express.Response, scopes: SessionScope[]) {
      if (scopes.length === 0) return setCookie(req, res, '', 0);
      const maxE = Math.max(...scopes.map(s => s.e));
      setCookie(req, res, encode(scopes), Math.max(1, Math.ceil((maxE - Date.now()) / 1000)));
    },
    clear(req: express.Request, res: express.Response) {
      setCookie(req, res, '', 0);
    },
    hasRole(req: express.Request, roles: string[]): boolean {
      return this.read(req).some(sc => sc.s === 'admin' || roles.includes(sc.s));
    }
  };
}

export type RoleSessions = ReturnType<typeof createRoleSessions>;

// 403, not 401: index.tsx treats 401 as an expired site login.
export function requireRole(sessions: RoleSessions, roles: string[]): express.RequestHandler {
  return (req, res, next) => {
    if (sessions.hasRole(req, roles)) return next();
    res.status(403).json({ error: 'role_session_required', roles });
  };
}

function describeScopes(scopes: SessionScope[]) {
  return scopes.map(sc => {
    const op = /^operator:(.+)$/.exec(sc.s);
    return op ? { role: 'operator', staffKey: `operator_${op[1]}`, expiresAt: sc.e } : { role: sc.s, expiresAt: sc.e };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------------------------------

const LOGIN_ROLES = new Set(['admin', 'management', 'operation-officer', 'maintenance', 'maintenance-kpi', 'cx', 'information-desk', 'operator', 'info-desk-add', 'info-desk-edit']);
const KIOSK_ROLES = new Set(['info-desk-add', 'info-desk-edit']);
const ROLE_ACCEPTS: Record<string, RoleSecretKey[]> = {
  admin: ['admin'],
  management: ['management', 'admin'],
  'operation-officer': ['operation-officer', 'admin'],
  maintenance: ['maintenance', 'admin'],
  'maintenance-kpi': ['maintenance-kpi', 'admin'],
  cx: ['cx', 'admin'],
  'information-desk': ['information-desk', 'admin'],
  'info-desk-add': ['info-desk-add', 'admin'],
  'info-desk-edit': ['info-desk-edit', 'admin']
};

function operatorExists(db: any, id: string): any {
  const ops = db?.config?.operators;
  if (Array.isArray(ops)) return ops.find((o: any) => o && String(o.id) === id) || null;
  if (isMap(ops)) {
    if (isMap(ops[id])) return ops[id];
    return Object.values(ops).find((o: any) => o && String(o.id) === id) || null;
  }
  return null;
}

export interface RoleAuthDeps {
  getDb: () => any;
  save: (mutation: { type: string; [key: string]: any }, immediate?: boolean) => void;
  logActivity: (category: string, action: string, opts?: { actor?: string; level?: 'info' | 'warn' | 'error'; detail?: unknown }) => void;
  sessions: RoleSessions;
}

/**
 * The caller's address as the nearest proxy saw it: the right-most X-Forwarded-For entry, which a client cannot
 * choose because the proxy appends it, unlike the first entry.
 */
export function requestIp(req: express.Request): string {
  const parts = String(req.headers['x-forwarded-for'] || '').split(',').map(p => p.trim()).filter(Boolean);
  return parts[parts.length - 1] || req.socket.remoteAddress || 'unknown';
}

export function registerRoleAuthRoutes(app: express.Express, deps: RoleAuthDeps) {
  const { getDb, save, logActivity, sessions } = deps;
  // Keyed per person, so typos by one member of staff never block colleagues behind the park's shared address.
  const loginLimiter = createAttemptLimiter(10, 10 * 60 * 1000);
  // Counted per stored secret across all addresses; a short window, because it also blocks the right password.
  const secretLimiter = createAttemptLimiter(30, 5 * 60 * 1000);
  const pinLimiter = createAttemptLimiter(10, 15 * 60 * 1000);

  const tooMany = (res: express.Response, waitMs: number) => {
    const seconds = Math.max(1, Math.ceil(waitMs / 1000));
    res.setHeader('Retry-After', String(seconds));
    return res.status(429).json({ error: 'too_many_attempts', retryAfterSeconds: seconds });
  };
  // A full hashing queue is not the caller's fault, so the answer says busy and the sign-in screens retry by themselves.
  const serverBusy = (res: express.Response) => {
    res.setHeader('Retry-After', '5');
    return res.status(429).json({ error: 'server_busy', retryAfterSeconds: 5 });
  };

  const audit = (req: express.Request, action: string, ok: boolean, detail: Record<string, unknown>, actor = '') => {
    logActivity('auth', action, { actor: actor || String(detail.role || ''), level: ok ? 'info' : 'warn', detail: { ...detail, ip: requestIp(req) } });
  };

  const staffLookup = (db: any, staffKey: unknown): { key: string; id: string; operator: any } | null => {
    if (typeof staffKey !== 'string') return null;
    const m = STAFF_KEY_RE.exec(staffKey);
    if (!m) return null;
    const operator = operatorExists(db, m[1]);
    return operator ? { key: staffKey, id: m[1], operator } : null;
  };

  app.post('/api/role-auth/login', async (req, res) => {
    const b = req.body || {};
    const role = String(b.role || '');
    const purpose = b.purpose === 'unlock' ? 'unlock' : 'login';
    const password = b.password;
    if (!LOGIN_ROLES.has(role) || typeof password !== 'string' || password.length > MAX_INPUT_CHARS || (role === 'operator' && (typeof b.staffKey !== 'string' || !b.staffKey))) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const user = typeof b.user === 'string' ? b.user.slice(0, 200) : '';
    const normUser = user.trim().toLowerCase();
    const staffKeyIn = role === 'operator' ? String(b.staffKey).slice(0, 64) : '';
    // The user name is part of the key only where it is checked; elsewhere a new value would mean a fresh allowance.
    const who = role === 'operator' ? staffKeyIn : (role === 'maintenance-kpi' || KIOSK_ROLES.has(role)) ? normUser : '';
    const limitKey = `${requestIp(req)}|${role}|${who}`;
    const waitMs = loginLimiter.blockedForMs(limitKey);
    if (waitMs > 0) {
      audit(req, 'login blocked', false, { role, staffKey: staffKeyIn || undefined, purpose, reason: 'too_many_attempts' });
      return tooMany(res, waitMs);
    }

    const db = getDb();
    const appCfg = isMap(db?.config?.appConfig) ? db.config.appConfig : {};
    const fail = (status: number, error: string, reason: string, actor = '', failedSecrets: string[] = []) => {
      loginLimiter.fail(limitKey);
      for (const k of failedSecrets) secretLimiter.fail(k);
      audit(req, 'login failed', false, { role, staffKey: staffKeyIn || undefined, purpose, reason }, actor);
      return res.status(status).json({ error });
    };

    let staff: ReturnType<typeof staffLookup> = null;
    let stored: any = null;
    if (role === 'operator') {
      staff = staffLookup(db, staffKeyIn);
      if (!staff) return fail(404, 'unknown_staff', 'unknown_staff');
      stored = staffMap(db)[staff.key];
      if (!hasStaffSecret(stored)) {
        audit(req, 'login failed', false, { role, staffKey: staff.key, purpose, reason: 'setup_required' }, String(staff.operator?.name || ''));
        return res.status(409).json({ error: 'setup_required' });
      }
    }

    if (role === 'maintenance-kpi') {
      const expected = String(appCfg.maintenanceKpiUser || 'kpi').trim().toLowerCase();
      if (normUser !== expected && normUser !== 'admin') return fail(403, 'invalid_credentials', 'wrong_user');
    }
    if (KIOSK_ROLES.has(role)) {
      const expected = String(appCfg.infoDeskUser || 'admin').trim().toLowerCase();
      if (normUser !== expected && normUser !== 'admin') return fail(403, 'invalid_credentials', 'wrong_user');
    }

    const input = role === 'maintenance-kpi' ? password.trim() : password;
    let via: string | null = null;
    let deps: Record<string, number> = {};
    let blockedMs = 0;
    let busy = false;
    const failedSecrets: string[] = [];
    // Staff passwords are limited per address only, so nobody can lock a named operator out from another device.
    const tryHashes = async (limiterKey: string | null, hashes: unknown[]): Promise<boolean> => {
      if (limiterKey) {
        const wait = secretLimiter.blockedForMs(limiterKey);
        if (wait > 0) { blockedMs = Math.max(blockedMs, wait); return false; }
      }
      for (const h of hashes) {
        if (!isHashed(h)) continue;
        const ok = await withScryptSlot(() => verifySecret(input, h));
        if (ok === SCRYPT_BUSY) { busy = true; return false; }
        if (ok) return true;
      }
      if (limiterKey) failedSecrets.push(limiterKey);
      return false;
    };
    const passwordless = role === 'information-desk' && !roleSecret(db, 'information-desk');
    if (passwordless) {
      via = 'none';
      deps = { 'none:information-desk': 0 };
    } else {
      if (role === 'operator' && await tryHashes(null, [stored.passwordHash])) {
        via = 'staff';
        deps = { [`staff:${staff!.key}`]: Number(stored.pv) || 1 };
      }
      const accepts: RoleSecretKey[] = role === 'operator' ? ['admin'] : ROLE_ACCEPTS[role];
      for (const k of accepts) {
        if (via || busy) break;
        const s = roleSecret(db, k);
        if (s && await tryHashes(`role:${k}`, [s.hash, s.legacyHash])) {
          via = k;
          deps = { [`role:${k}`]: Number(s.pv) || 1 };
        }
      }
    }
    const actor = staff ? String(staff.operator?.name || '') : '';
    if (!via) {
      if (busy) {
        audit(req, 'login blocked', false, { role, staffKey: staffKeyIn || undefined, purpose, reason: 'busy' }, actor);
        return serverBusy(res);
      }
      if (blockedMs > 0) {
        if (failedSecrets.length) loginLimiter.fail(limitKey);
        for (const k of failedSecrets) secretLimiter.fail(k);
        audit(req, 'login blocked', false, { role, staffKey: staffKeyIn || undefined, purpose, reason: 'too_many_attempts' }, actor);
        return tooMany(res, blockedMs);
      }
      return fail(403, 'invalid_credentials', 'wrong_password', actor, failedSecrets);
    }

    loginLimiter.reset(limitKey);
    audit(req, purpose === 'unlock' ? 'unlock ok' : 'login ok', true, { role, staffKey: staff?.key, purpose, via }, actor);

    // The kiosk unlocks only open local screens, so they need no server session.
    if (KIOSK_ROLES.has(role)) return res.json({ ok: true, role, scopes: [], expiresAt: null });

    const scope: SessionScope = { s: staff ? `operator:${staff.id}` : role, d: deps, e: Date.now() + ROLE_SESSION_TTL_MS };
    const scopes = purpose === 'unlock' && role === 'maintenance-kpi'
      ? [...sessions.read(req).filter(sc => sc.s !== scope.s), scope]
      : [scope];
    sessions.issue(req, res, scopes);
    res.json({
      ok: true,
      role,
      scopes: describeScopes(scopes),
      expiresAt: scope.e,
      ...(role === 'information-desk' ? { passwordRequired: !passwordless } : {})
    });
  });

  const validStaffPassword = (p: unknown): p is string => typeof p === 'string' && p.length <= MAX_INPUT_CHARS && p.trim() !== '' && p.length >= 3;
  const validPin = (p: unknown) => (typeof p === 'string' || typeof p === 'number') && /^\d{4}$/.test(String(p).trim());

  const issueStaffSession = (req: express.Request, res: express.Response, id: string, key: string, pv: number) => {
    const scope: SessionScope = { s: `operator:${id}`, d: { [`staff:${key}`]: pv }, e: Date.now() + ROLE_SESSION_TTL_MS };
    sessions.issue(req, res, [scope]);
    return scope;
  };

  app.post('/api/role-auth/staff/setup', async (req, res) => {
    const b = req.body || {};
    if (typeof b.staffKey !== 'string') return res.status(400).json({ error: 'invalid_request' });
    if (!validStaffPassword(b.password)) return res.status(400).json({ error: 'invalid_password' });
    if (!validPin(b.recoveryPin)) return res.status(400).json({ error: 'invalid_pin' });
    let db = getDb();
    const staff = staffLookup(db, b.staffKey);
    if (!staff) return res.status(404).json({ error: 'unknown_staff' });
    const actor = String(staff.operator?.name || '');
    if (hasStaffSecret(staffMap(db)[staff.key])) {
      audit(req, 'staff password setup refused', false, { role: 'operator', staffKey: staff.key, reason: 'already_set' }, actor);
      return res.status(409).json({ error: 'already_set' });
    }
    const hashed = await withScryptSlot(async () => [await hashSecret(b.password.trim()), await hashSecret(String(b.recoveryPin).trim())]);
    if (hashed === SCRYPT_BUSY) return serverBusy(res);
    const [passwordHash, recoveryPinHash] = hashed;
    db = getDb();
    // Checked again after hashing: two devices can submit the first password for the same name at once.
    if (hasStaffSecret(staffMap(db)[staff.key])) {
      audit(req, 'staff password setup refused', false, { role: 'operator', staffKey: staff.key, reason: 'already_set' }, actor);
      return res.status(409).json({ error: 'already_set' });
    }
    if (!isMap(db.data)) db.data = {};
    if (!isMap(db.data.staffCredentials)) db.data.staffCredentials = {};
    const entry: StaffCredentialStored = { passwordHash, recoveryPinHash, pv: 1, createdAt: new Date().toISOString() };
    db.data.staffCredentials[staff.key] = entry;
    save({ type: 'set', path: `data/staffCredentials/${staff.key}`, value: publicStaffEntry(entry), senderId: 'role-auth' }, true);
    const scope = issueStaffSession(req, res, staff.id, staff.key, 1);
    audit(req, 'staff password created', true, { role: 'operator', staffKey: staff.key }, actor);
    res.json({ ok: true, role: 'operator', scopes: describeScopes([scope]), expiresAt: scope.e });
  });

  app.post('/api/role-auth/staff/reset', async (req, res) => {
    const b = req.body || {};
    if (typeof b.staffKey !== 'string') return res.status(400).json({ error: 'invalid_request' });
    if (!validPin(b.recoveryPin)) return res.status(400).json({ error: 'invalid_pin' });
    if (!validStaffPassword(b.newPassword)) return res.status(400).json({ error: 'invalid_password' });
    const db = getDb();
    const staff = staffLookup(db, b.staffKey);
    if (!staff) return res.status(404).json({ error: 'unknown_staff' });
    const actor = String(staff.operator?.name || '');
    const current = staffMap(db)[staff.key];
    if (!hasStaffSecret(current)) return res.status(409).json({ error: 'setup_required' });
    const pinKey = `pin|${staff.key}`;
    const waitMs = pinLimiter.blockedForMs(pinKey);
    if (waitMs > 0) {
      audit(req, 'staff password reset blocked', false, { role: 'operator', staffKey: staff.key, reason: 'too_many_attempts' }, actor);
      return tooMany(res, waitMs);
    }
    const pinOk = isHashed(current.recoveryPinHash) ? await withScryptSlot(() => verifySecret(String(b.recoveryPin).trim(), current.recoveryPinHash)) : false;
    if (pinOk === SCRYPT_BUSY) return serverBusy(res);
    if (!pinOk) {
      pinLimiter.fail(pinKey);
      audit(req, 'staff password reset failed', false, { role: 'operator', staffKey: staff.key, reason: 'wrong_pin' }, actor);
      return res.status(403).json({ error: 'wrong_pin' });
    }
    pinLimiter.reset(pinKey);
    const passwordHash = await withScryptSlot(() => hashSecret(b.newPassword.trim()));
    if (passwordHash === SCRYPT_BUSY) return serverBusy(res);
    const latest = staffMap(getDb())[staff.key];
    if (!hasStaffSecret(latest)) return res.status(409).json({ error: 'setup_required' });
    latest.passwordHash = passwordHash;
    delete latest.password;
    delete latest.recoveryPin;
    latest.pv = (Number(latest.pv) || 1) + 1;
    latest.updatedAt = new Date().toISOString();
    save({ type: 'set', path: `data/staffCredentials/${staff.key}`, value: publicStaffEntry(latest), senderId: 'role-auth' }, true);
    const scope = issueStaffSession(req, res, staff.id, staff.key, latest.pv);
    audit(req, 'staff password reset', true, { role: 'operator', staffKey: staff.key }, actor);
    res.json({ ok: true, role: 'operator', scopes: describeScopes([scope]), expiresAt: scope.e });
  });

  app.post('/api/role-auth/logout', (req, res) => {
    const scopes = sessions.read(req);
    sessions.clear(req, res);
    if (scopes.length) audit(req, 'logout', true, { role: scopes.map(s => s.s).join(',') });
    res.json({ ok: true });
  });

  app.get('/api/role-auth/session', (req, res) => {
    res.json({ scopes: describeScopes(sessions.read(req)) });
  });

  // Re-signs the caller's scopes that were admitted by a secret whose version just changed.
  const reissueAfterChange = (req: express.Request, res: express.Response, before: SessionScope[], changed: RoleSecretKey[]) => {
    const db = getDb();
    let touched = false;
    const scopes = before.map(sc => {
      const d = { ...sc.d };
      for (const k of changed) {
        if (`role:${k}` in d) {
          d[`role:${k}`] = depVersion(db, `role:${k}`) ?? d[`role:${k}`];
          touched = true;
        }
      }
      return { ...sc, d };
    });
    if (touched) sessions.issue(req, res, scopes);
  };

  app.post('/api/role-auth/role-passwords', requireRole(sessions, ADMIN_ROLES), async (req, res) => {
    const b = req.body || {};
    const set = b.set === undefined ? {} : b.set;
    const remove = b.remove === undefined ? [] : b.remove;
    if (!isMap(set) || !Array.isArray(remove)) return res.status(400).json({ error: 'invalid_request' });
    const plain: Partial<Record<RoleSecretKey, string>> = {};
    for (const [k, v] of Object.entries(set)) {
      if (!(ROLE_SECRET_KEYS as readonly string[]).includes(k) || typeof v !== 'string' || v.length > MAX_INPUT_CHARS) {
        return res.status(400).json({ error: 'invalid_password', field: k });
      }
      const key = k as RoleSecretKey;
      const value = TRIMMED_ROLES.has(key) ? v.trim() : v;
      if (value.trim() === '') return res.status(400).json({ error: 'invalid_password', field: k });
      plain[key] = value;
    }
    for (const k of remove) {
      // Only the information desk may be passwordless; removing any other password would lock that role out.
      if (k !== 'information-desk' || k in plain) return res.status(400).json({ error: 'invalid_request', field: String(k) });
    }
    const keys = Object.keys(plain) as RoleSecretKey[];
    if (keys.length === 0 && remove.length === 0) return res.json({ ok: true, authStatus: publicAuthStatus(getDb()) });
    const before = sessions.read(req);
    const hashes: Partial<Record<RoleSecretKey, string>> = {};
    for (const k of keys) hashes[k] = await hashSecret(plain[k]!);
    const db = getDb();
    const roles = ensureAuthSecrets(db);
    const now = new Date().toISOString();
    for (const k of keys) {
      roles[k] = { hash: hashes[k]!, pv: (Number(roles[k]?.pv) || 0) + 1, updatedAt: now };
    }
    for (const k of remove) delete roles[k];
    const status = publicAuthStatus(db);
    save({ type: 'set', path: 'config/authStatus', value: status, senderId: 'role-auth' }, true);
    reissueAfterChange(req, res, before, [...keys, ...(remove as RoleSecretKey[])]);
    audit(req, 'role password changed', true, { role: 'admin', roles: keys, removed: remove });
    res.json({ ok: true, authStatus: status });
  });

  app.post('/api/role-auth/kpi-credentials', requireRole(sessions, KPI_ROLES), async (req, res) => {
    const b = req.body || {};
    if (typeof b.user !== 'string' || b.user.length > 200 || (b.password !== undefined && (typeof b.password !== 'string' || b.password.length > MAX_INPUT_CHARS))) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const newUser = b.user.trim() || 'kpi';
    const newPass = typeof b.password === 'string' ? b.password.trim() : '';
    const before = sessions.read(req);
    const hash = newPass ? await hashSecret(newPass) : null;
    const db = getDb();
    if (!isMap(db.config)) db.config = {};
    if (!isMap(db.config.appConfig)) db.config.appConfig = {};
    db.config.appConfig.maintenanceKpiUser = newUser;
    const updates: Record<string, any> = { 'config/appConfig/maintenanceKpiUser': newUser };
    if (hash) {
      const roles = ensureAuthSecrets(db);
      roles['maintenance-kpi'] = { hash, pv: (Number(roles['maintenance-kpi']?.pv) || 0) + 1, updatedAt: new Date().toISOString() };
      updates['config/authStatus'] = publicAuthStatus(db);
    }
    save({ type: 'update', updates, senderId: 'role-auth' }, true);
    if (hash) reissueAfterChange(req, res, before, ['maintenance-kpi']);
    audit(req, 'kpi credentials changed', true, { role: before.map(s => s.s).join(','), passwordChanged: Boolean(hash) });
    res.json({ ok: true, authStatus: publicAuthStatus(db) });
  });
}

// ---------------------------------------------------------------------------------------------------------------
// One-time scrub of plain copies left on disk by earlier builds
// ---------------------------------------------------------------------------------------------------------------

function stripSecretsInPlace(db: any): boolean {
  if (!isMap(db)) return false;
  let changed = false;
  const cfg = db.config;
  if (isMap(cfg)) {
    if ('authSecrets' in cfg) { delete cfg.authSecrets; changed = true; }
    if ('authStatus' in cfg) { delete cfg.authStatus; changed = true; }
    if (deleteSecretKeys(cfg)) changed = true;
    if (deleteSecretKeys(cfg.appConfig)) changed = true;
    if (isMap(cfg.whatsappConfig)) {
      for (const k of ['apiTokenInstance', 'whapiToken']) if (k in cfg.whatsappConfig) { delete cfg.whatsappConfig[k]; changed = true; }
    }
  }
  const creds = db.data?.staffCredentials;
  if (isMap(creds)) {
    for (const [k, c] of Object.entries(creds)) {
      if (!isMap(c)) { delete creds[k]; changed = true; continue; }
      if ('password' in c || 'recoveryPin' in c) {
        delete c.password;
        delete c.recoveryPin;
        changed = true;
      }
      if (!hasStaffSecret(c)) { delete creds[k]; changed = true; }
    }
  }
  return changed;
}

/** Removes secrets from the restore-point JSON files; files that cannot be read are kept as they are. */
export function scrubRestorePoints(dir: string): { scrubbed: string[]; failed: string[] } {
  const out = { scrubbed: [] as string[], failed: [] as string[] };
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter(n => n.endsWith('.json'));
  } catch {
    return out;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (!fs.statSync(file).isFile()) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const target = parsed?.format === 'tfw-backup' ? parsed.database : parsed;
      if (!stripSecretsInPlace(target)) continue;
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(parsed), 'utf-8');
      fs.renameSync(`${file}.tmp`, file);
      out.scrubbed.push(name);
    } catch (e: any) {
      out.failed.push(name);
      console.error(`Could not remove passwords from restore point ${name}: ${e?.message || e}`);
    }
  }
  return out;
}

const SIDE_COPY_RE = /^tfw\.db\.(before-deletions|unreadable)-(\d+)$/;
const SIDE_WAL_RE = /^tfw\.db-wal\.(before-deletions|unreadable)-(\d+)$/;
// The server names the db copy and its WAL copy with two Date.now() calls, so their stamps can differ slightly.
const SIDE_PAIR_WINDOW_MS = 10000;

/** Removes secrets from the tfw.db copies kept before deletions or after a failed load. Never touches tfw.db. */
export function scrubSqliteSideCopies(dataDir: string): { scrubbed: string[]; failed: string[]; walsRemoved: string[] } {
  const out = { scrubbed: [] as string[], failed: [] as string[], walsRemoved: [] as string[] };
  let names: string[] = [];
  try {
    names = fs.readdirSync(dataDir);
  } catch {
    return out;
  }
  const isFile = (f: string) => {
    try { return fs.statSync(f).isFile(); } catch { return false; }
  };
  const dbCopies = names.map(n => ({ name: n, m: SIDE_COPY_RE.exec(n) })).filter(x => x.m && isFile(path.join(dataDir, x.name)));
  const walFor = new Map<string, string>();
  for (const name of names) {
    const w = SIDE_WAL_RE.exec(name);
    if (!w) continue;
    let best: string | null = null;
    let bestGap = Infinity;
    for (const c of dbCopies) {
      const gap = Math.abs(Number(c.m![2]) - Number(w[2]));
      if (c.m![1] === w[1] && gap <= SIDE_PAIR_WINDOW_MS && gap < bestGap && !walFor.has(c.name)) { best = c.name; bestGap = gap; }
    }
    if (best) walFor.set(best, name);
  }
  const pairedWals = new Set(walFor.values());
  for (const { name } of dbCopies) {
    const copy = path.join(dataDir, name);
    const walOriginal = walFor.has(name) ? path.join(dataDir, walFor.get(name)!) : '';
    let sdb: DatabaseSync | null = null;
    try {
      if (walOriginal && isFile(walOriginal)) fs.copyFileSync(walOriginal, `${copy}-wal`);
      sdb = new DatabaseSync(copy);
      sdb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      const tables = new Set((sdb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[]).map(r => String(r.name)));
      if (tables.has('system_config')) {
        const rows = sdb.prepare('SELECT id, config_json, app_config, whatsapp_config FROM system_config').all() as any[];
        const update = sdb.prepare('UPDATE system_config SET config_json = ?, app_config = ?, whatsapp_config = ? WHERE id = ?');
        for (const r of rows) {
          const fix = (text: any, strip: (v: any) => any) => {
            if (typeof text !== 'string') return text;
            try { return JSON.stringify(strip(JSON.parse(text))); } catch { return text; }
          };
          update.run(
            fix(r.config_json, (c: any) => { const d = { config: c }; stripSecretsInPlace(d); return d.config; }),
            fix(r.app_config, (a: any) => { deleteSecretKeys(a); return a; }),
            fix(r.whatsapp_config, (w: any) => stripWhatsappConfig(w)),
            r.id
          );
        }
      }
      if (tables.has('data_collections')) sdb.exec("DELETE FROM data_collections WHERE collection = 'staffCredentials';");
      sdb.exec('VACUUM;');
      sdb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      sdb.close();
      sdb = null;
      for (const extra of [`${copy}-wal`, `${copy}-shm`, walOriginal].filter(Boolean)) {
        try { if (fs.existsSync(extra)) fs.unlinkSync(extra); }catch (e: any) { console.error(`Could not delete ${path.basename(extra)}: ${e?.message || e}`); }
      }
      out.scrubbed.push(name);
    } catch (e: any) {
      out.failed.push(name);
      console.error(`Could not remove passwords from ${name}: ${e?.message || e}`);
      try { sdb?.close(); } catch { /* already closed */ }
    }
  }
  for (const name of names) {
    if (!SIDE_WAL_RE.test(name) || pairedWals.has(name)) continue;
    try {
      fs.unlinkSync(path.join(dataDir, name));
      out.walsRemoved.push(name);
    } catch (e: any) {
      console.error(`Could not delete ${name}: ${e?.message || e}`);
    }
  }
  return out;
}
