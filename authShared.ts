// Shared by the browser and the server: which database fields are secrets and how writes to them are filtered.
// Pure module, no Node or DOM imports.

export const SECRET_FIELD_RE = /password|passcode|recoverypin/i;

export const ROLE_SECRET_KEYS = [
  'admin',
  'management',
  'operation-officer',
  'maintenance',
  'maintenance-kpi',
  'cx',
  'information-desk',
  'info-desk-add',
  'info-desk-edit'
] as const;
export type RoleSecretKey = typeof ROLE_SECRET_KEYS[number];

export const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const WHATSAPP_TOKEN_KEYS = new Set(['apiTokenInstance', 'whapiToken']);

export function pathSegments(p: string): string[] {
  return String(p || '').split('/').filter(Boolean);
}

const isMap = (v: any): v is Record<string, any> => v !== null && typeof v === 'object' && !Array.isArray(v);

function omitKeys(obj: Record<string, any>, drop: (k: string) => boolean): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of Object.keys(obj)) if (!drop(k)) out[k] = obj[k];
  return out;
}

export function stripAppConfig(value: any): any {
  return isMap(value) ? omitKeys(value, k => SECRET_FIELD_RE.test(k)) : value;
}

export function stripWhatsappConfig(value: any): any {
  return isMap(value) ? omitKeys(value, k => WHATSAPP_TOKEN_KEYS.has(k)) : value;
}

export function stripConfig(value: any): any {
  if (!isMap(value)) return value;
  const out = omitKeys(value, k => SECRET_FIELD_RE.test(k) || k === 'authSecrets' || k === 'authStatus');
  if ('appConfig' in out) out.appConfig = stripAppConfig(out.appConfig);
  if ('whatsappConfig' in out) out.whatsappConfig = stripWhatsappConfig(out.whatsappConfig);
  return out;
}

export function stripData(value: any): any {
  return isMap(value) ? omitKeys(value, k => k === 'staffCredentials') : value;
}

export type SecretWriteResult = { skip: true } | { skip: false; value: any };

/** Writes to secret paths are skipped; config, data and root objects lose their secret fields. */
export function filterSecretWrite(seg: string[], value: any): SecretWriteResult {
  const [a, b, c] = seg;
  if (a === 'config' && (b === 'authSecrets' || b === 'authStatus')) return { skip: true };
  if (a === 'data' && b === 'staffCredentials') return { skip: true };
  if (seg.length === 2 && a === 'config' && SECRET_FIELD_RE.test(b)) return { skip: true };
  if (seg.length === 3 && a === 'config' && b === 'appConfig' && SECRET_FIELD_RE.test(c)) return { skip: true };
  if (seg.length === 3 && a === 'config' && b === 'whatsappConfig' && WHATSAPP_TOKEN_KEYS.has(c)) return { skip: true };

  if (!isMap(value)) return { skip: false, value };
  if (seg.length === 2 && a === 'config' && b === 'appConfig') return { skip: false, value: stripAppConfig(value) };
  if (seg.length === 2 && a === 'config' && b === 'whatsappConfig') return { skip: false, value: stripWhatsappConfig(value) };
  if (seg.length === 1 && a === 'config') return { skip: false, value: stripConfig(value) };
  if (seg.length === 1 && a === 'data') return { skip: false, value: stripData(value) };
  if (seg.length === 0) {
    const out = { ...value };
    if ('config' in out) out.config = stripConfig(out.config);
    if ('data' in out) out.data = stripData(out.data);
    return { skip: false, value: out };
  }
  return { skip: false, value };
}

export interface StaffCredentialPublic { createdAt: string; updatedAt?: string }

export function publicStaffEntry(c: any): StaffCredentialPublic {
  return { createdAt: String(c?.createdAt || ''), ...(c?.updatedAt ? { updatedAt: String(c.updatedAt) } : {}) };
}

/** Removes every secret from a database copy held in the browser. Mutates db; true when anything changed. */
export function scrubClientDb(db: any): boolean {
  if (!isMap(db)) return false;
  let changed = false;
  const cfg = db.config;
  if (isMap(cfg)) {
    for (const k of Object.keys(cfg)) {
      if (k === 'authSecrets' || SECRET_FIELD_RE.test(k)) { delete cfg[k]; changed = true; }
    }
    if (isMap(cfg.appConfig)) {
      for (const k of Object.keys(cfg.appConfig)) {
        if (SECRET_FIELD_RE.test(k)) { delete cfg.appConfig[k]; changed = true; }
      }
    }
    if (isMap(cfg.whatsappConfig)) {
      for (const k of WHATSAPP_TOKEN_KEYS) {
        if (k in cfg.whatsappConfig) { delete cfg.whatsappConfig[k]; changed = true; }
      }
    }
  }
  const data = db.data;
  if (isMap(data) && 'staffCredentials' in data) {
    const creds = data.staffCredentials;
    if (!isMap(creds)) {
      delete data.staffCredentials;
      changed = true;
    } else {
      for (const [k, v] of Object.entries(creds)) {
        if (!isMap(v)) { delete creds[k]; changed = true; continue; }
        if (Object.keys(v).some(f => f !== 'createdAt' && f !== 'updatedAt')) {
          creds[k] = publicStaffEntry(v);
          changed = true;
        }
      }
    }
  }
  return changed;
}
