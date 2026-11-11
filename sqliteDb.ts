import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export interface SqliteDbStats {
  version: number;
  lastUpdated: string;
  ridesCount: number;
  staffCount: number;
  countersCount: number;
  packagesCount: number;
  ticketsCount: number;
  operationalDatesCount: number;
  historyLogsCount: number;
}

let sqliteInstance: DatabaseSync | null = null;
const DEFAULT_SQLITE_PATH = path.join(process.cwd(), 'data', 'tfw.db');

/**
 * Initialize SQLite Database connection and create schema
 */
export function getSqliteDatabase(dbPath: string = DEFAULT_SQLITE_PATH): DatabaseSync {
  if (sqliteInstance) {
    return sqliteInstance;
  }

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Performance optimizations for high-concurrency operations and permanent disk efficiency
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 10000;');
    db.exec('PRAGMA wal_autocheckpoint = 1000;');
    db.exec('PRAGMA auto_vacuum = INCREMENTAL;');
  } catch (e) {
    console.warn('Note on SQLite PRAGMAs:', e);
  }

  // Create Tables & Indexes
  db.exec(`
    -- 1. System Metadata & Config
    CREATE TABLE IF NOT EXISTS system_config (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      last_updated TEXT NOT NULL,
      config_json TEXT NOT NULL,
      whatsapp_config TEXT,
      app_config TEXT,
      deleted_ticket_ids TEXT,
      deleted_wa_msg_ids TEXT
    );

    -- 2. Master Catalog Tables
    CREATE TABLE IF NOT EXISTS rides (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      floor TEXT,
      capacity INTEGER,
      status TEXT DEFAULT 'active',
      min_height TEXT,
      notes TEXT,
      image_url TEXT,
      updated_at TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY,
      department TEXT NOT NULL, -- 'operator', 'sales', 'maintenance', 'cx'
      name TEXT NOT NULL,
      phone TEXT,
      role TEXT,
      active INTEGER DEFAULT 1,
      notes TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS counters (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      location TEXT,
      active INTEGER DEFAULT 1,
      price REAL,
      ticket_price REAL,
      counter_number TEXT,
      raw_json TEXT
    );

    CREATE TABLE IF NOT EXISTS packages (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT,
      description TEXT,
      active INTEGER DEFAULT 1,
      raw_json TEXT
    );

    -- 3. Operational: Maintenance Tickets
    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      ride_id INTEGER,
      ride_name TEXT NOT NULL,
      problem TEXT NOT NULL,
      status TEXT NOT NULL, -- 'reported', 'in-progress', 'solved'
      priority TEXT DEFAULT 'normal',
      source TEXT DEFAULT 'operator',
      reported_by_id INTEGER,
      reported_by_name TEXT,
      reported_by_role TEXT,
      assigned_to_id INTEGER,
      assigned_to_name TEXT,
      helper_ids TEXT,
      helper_names TEXT,
      guest_details TEXT,
      reported_at TEXT NOT NULL,
      in_progress_at TEXT,
      solved_at TEXT,
      resolution_notes TEXT,
      solution_image_url TEXT,
      photo_url TEXT,
      whatsapp_group TEXT,
      whatsapp_chat_id TEXT,
      whatsapp_message_id TEXT,
      updated_at TEXT,
      raw_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_date ON maintenance_tickets(date);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON maintenance_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_ride ON maintenance_tickets(ride_id);

    -- 4. Date-Indexed Operations (Attendance, Counts, Assignments, Sales)
    CREATE TABLE IF NOT EXISTS daily_operations (
      operational_date TEXT PRIMARY KEY,
      attendance TEXT,
      operator_assignments TEXT,
      ticket_sales_assignments TEXT,
      daily_counts TEXT,
      daily_package_counts TEXT,
      daily_ticket_counts TEXT,
      ticket_sales_data TEXT,
      package_sales TEXT,
      updated_at TEXT NOT NULL
    );

    -- 5. Audit History Log
    CREATE TABLE IF NOT EXISTS history_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id INTEGER,
      timestamp TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_history_timestamp ON history_logs(timestamp);

    -- 6. WhatsApp Management Reports (Sales & Revenue closing from "TFW Management Team")
    CREATE TABLE IF NOT EXISTS whatsapp_management_reports (
      report_date TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      sender_name TEXT,
      sender_phone TEXT,
      group_name TEXT,
      kiddo_sale REAL,
      xtreme_sale REAL,
      vip_concierge_sale REAL,
      entry_ticket_sale REAL,
      total_foot_fall REAL,
      discount REAL,
      total_revenue REAL,
      counter_breakdown_json TEXT,
      raw_message TEXT,
      raw_json TEXT
    );
  `);

  try {
    db.exec(`ALTER TABLE whatsapp_management_reports ADD COLUMN total_foot_fall REAL;`);
  } catch (_) {}

  try {
    db.exec(`ALTER TABLE daily_operations ADD COLUMN daily_package_counts TEXT;`);
  } catch (_) {}
  try {
    db.exec(`ALTER TABLE daily_operations ADD COLUMN daily_ticket_counts TEXT;`);
  } catch (_) {}

  // Rows written by older builds have no hash and are rewritten once by the first save.
  for (const table of ['system_config', ...SYNCED_TABLES]) {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN row_hash TEXT;`);
    } catch (_) {}
  }
  try {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_history_log_id ON history_logs(log_id);
      CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS data_collections (
        collection TEXT NOT NULL,
        item_key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        row_hash TEXT,
        PRIMARY KEY (collection, item_key)
      );
    `);
  } catch (_) {}

  sqliteInstance = db;
  return db;
}

/**
 * Helper to normalize key-value map or array of entities into array with IDs
 */
function normalizeEntityList(container: any): Array<{ id: string | number; [key: string]: any }> {
  if (!container) return [];
  if (Array.isArray(container)) {
    return container
      .filter(item => item != null)
      .map((item, index) => ({
        id: item.id != null ? item.id : index + 1,
        ...item
      }));
  }
  if (typeof container === 'object') {
    return Object.entries(container)
      .filter(([_, val]) => val != null)
      .map(([id, val]: [string, any]) => ({
        id: isNaN(Number(id)) ? id : Number(id),
        ...(typeof val === 'object' ? val : { value: val })
      }));
  }
  return [];
}

/**
 * Extract all maintenance tickets from either flat map or date-nested maps
 */
function extractAllTickets(rawTickets: any, fallbackDate: string): any[] {
  if (!rawTickets || typeof rawTickets !== 'object') return [];
  const results: any[] = [];

  for (const [key, val] of Object.entries(rawTickets)) {
    if (!val || typeof val !== 'object') continue;

    // Check if this object is a ticket directly
    if ((val as any).id && ((val as any).problem || (val as any).status || (val as any).reportedAt)) {
      results.push({
        date: (val as any).date || (key.startsWith('202') ? key.slice(0, 10) : fallbackDate),
        ...(val as any)
      });
    } else {
      // It's a sub-map (e.g. key is a date like '2026-09-05')
      for (const [subId, subVal] of Object.entries(val as object)) {
        if (subVal && typeof subVal === 'object') {
          results.push({
            id: (subVal as any).id || subId,
            date: (subVal as any).date || (key.startsWith('202') ? key.slice(0, 10) : fallbackDate),
            ...(subVal as any)
          });
        }
      }
    }
  }

  return results;
}

const SYNCED_TABLES = ['rides', 'staff', 'counters', 'packages', 'maintenance_tickets', 'daily_operations', 'history_logs', 'whatsapp_management_reports', 'data_collections'] as const;
type SyncedTable = typeof SYNCED_TABLES[number];

// data_collections keys are "<collection>\u0001<item_key>": '' holds the section ('{}' for an object), 'k:<key>' one entry of it.
const ITEM_SEPARATOR = '\u0001';

const KEY_SQL: Record<SyncedTable, string> = {
  rides: 'CAST(id AS TEXT)',
  staff: 'CAST(id AS TEXT)',
  counters: 'CAST(id AS TEXT)',
  packages: 'CAST(id AS TEXT)',
  maintenance_tickets: 'CAST(id AS TEXT)',
  daily_operations: 'operational_date',
  history_logs: 'CAST(COALESCE(log_id, id) AS TEXT)',
  whatsapp_management_reports: 'report_date',
  data_collections: 'collection || char(1) || item_key'
};

const DELETE_SQL: Record<SyncedTable, string> = {
  rides: 'DELETE FROM rides WHERE id = ?',
  staff: 'DELETE FROM staff WHERE id = ?',
  counters: 'DELETE FROM counters WHERE id = ?',
  packages: 'DELETE FROM packages WHERE id = ?',
  maintenance_tickets: 'DELETE FROM maintenance_tickets WHERE id = ?',
  daily_operations: 'DELETE FROM daily_operations WHERE operational_date = ?',
  history_logs: 'DELETE FROM history_logs WHERE log_id = ? OR (log_id IS NULL AND id = ?)',
  whatsapp_management_reports: 'DELETE FROM whatsapp_management_reports WHERE report_date = ?',
  data_collections: 'DELETE FROM data_collections WHERE collection = ? AND item_key = ?'
};

const NUMERIC_KEY_TABLES = new Set<SyncedTable>(['rides', 'staff', 'counters']);

const INSERT_SQL: Record<SyncedTable, string> = {
  rides: `INSERT OR REPLACE INTO rides (id, name, floor, capacity, status, min_height, notes, image_url, updated_at, raw_json, row_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  staff: `INSERT OR REPLACE INTO staff (id, department, name, phone, role, active, notes, raw_json, row_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  counters: `INSERT OR REPLACE INTO counters (id, name, type, location, active, price, ticket_price, counter_number, raw_json, row_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  packages: `INSERT OR REPLACE INTO packages (id, name, price, category, description, active, raw_json, row_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  maintenance_tickets: `INSERT OR REPLACE INTO maintenance_tickets (
      id, date, ride_id, ride_name, problem, status, priority, source,
      reported_by_id, reported_by_name, reported_by_role, assigned_to_id, assigned_to_name,
      helper_ids, helper_names, guest_details, reported_at, in_progress_at, solved_at,
      resolution_notes, solution_image_url, photo_url, whatsapp_group, whatsapp_chat_id,
      whatsapp_message_id, updated_at, raw_json, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  daily_operations: `INSERT OR REPLACE INTO daily_operations (
      operational_date, attendance, operator_assignments, ticket_sales_assignments, daily_counts, daily_package_counts, daily_ticket_counts, ticket_sales_data, package_sales, updated_at, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  history_logs: `INSERT INTO history_logs (log_id, timestamp, user_name, action, details, row_hash) VALUES (?, ?, ?, ?, ?, ?)`,
  whatsapp_management_reports: `INSERT OR REPLACE INTO whatsapp_management_reports (
      report_date, timestamp, sender_name, sender_phone, group_name, kiddo_sale, xtreme_sale, vip_concierge_sale, entry_ticket_sale, total_foot_fall, discount, total_revenue, counter_breakdown_json, raw_message, raw_json, row_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  data_collections: `INSERT OR REPLACE INTO data_collections (collection, item_key, value_json, row_hash) VALUES (?, ?, ?, ?)`
};

const DAILY_COLLECTIONS = ['attendance', 'operatorAssignments', 'ticketSalesAssignments', 'dailyCounts', 'dailyPackageCounts', 'dailyTicketCounts', 'ticketSalesData', 'packageSales'];
const TABLE_DATA_KEYS = new Set(['maintenanceTickets', ...DAILY_COLLECTIONS, 'historyLog', 'whatsappManagementReports']);

/** False for data sections without a table of their own (staff credentials, ride pre-checks, park issues, ...). */
export function isTableBackedDataKey(key: string): boolean {
  return TABLE_DATA_KEYS.has(key);
}

// Mirror of the key -> row_hash pairs in SQLite; null means it is read from SQLite again at the next save.
let storedHashes: Map<string, Map<string, string | null>> | null = null;
// Keys this process has held in memory (adopted load or a save): only these rows may be deleted, never unseen ones.
const deletableKeys = new Map<string, Set<string>>();
let lastLoadedKeys: Map<string, Set<string>> | null = null;
let metaMarkerWritten = false;
const keptUnknownLogged = new Set<string>();

const JSON_DATES_MARKER = 'json_only_dates_merged';
const JSON_SECTIONS_MARKER = 'json_sections_merged';

function rowHash(text: string): string {
  return crypto.createHash('sha1').update(text).digest('base64');
}

let statementDb: DatabaseSync | null = null;
const statements = new Map<string, ReturnType<DatabaseSync['prepare']>>();
function cachedStatement(db: DatabaseSync, sql: string) {
  if (statementDb !== db) {
    statements.clear();
    statementDb = db;
  }
  let stmt = statements.get(sql);
  if (!stmt) statements.set(sql, (stmt = db.prepare(sql)));
  return stmt;
}

const str = (v: any) => (v ? String(v) : null);

type RowSink = (table: SyncedTable, key: string, hashSource: string, params: any[]) => void;

// Rows are handed over one at a time so a save never holds a second copy of the whole database.
function emitRows(appDb: any, lastUpdated: string, put: RowSink): void {
  const config = appDb.config || {};
  const data = appDb.data || {};
  const numericKey = (id: any) => (Number.isFinite(Number(id)) ? String(Number(id)) : null);

  for (const r of normalizeEntityList(config.rides)) {
    const key = r.id == null ? null : numericKey(r.id);
    if (key == null) continue;
    const raw = JSON.stringify(r);
    put('rides', key, raw, [
      Number(r.id), String(r.name || `Ride #${r.id}`), str(r.floor), r.capacity != null ? Number(r.capacity) : null,
      String(r.status || 'active'), str(r.minHeight), str(r.notes), str(r.imageUrl),
      r.updatedAt ? String(r.updatedAt) : lastUpdated, raw
    ]);
  }

  const staffCategories: Array<[any, string]> = [
    [config.operators, 'operator'],
    [config.ticketSalesPersonnel, 'sales'],
    [config.maintenancePersonnel, 'maintenance'],
    [config.cxPersonnel, 'cx']
  ];
  for (const [list, dept] of staffCategories) {
    for (const s of normalizeEntityList(list)) {
      const key = s.id == null ? null : numericKey(s.id);
      if (key == null) continue;
      const raw = JSON.stringify(s);
      put('staff', key, `${dept}\n${raw}`, [
        Number(s.id), dept, String(s.name || `Staff #${s.id}`), str(s.phone), str(s.role),
        s.active !== false ? 1 : 0, str(s.notes), raw
      ]);
    }
  }

  for (const c of normalizeEntityList(config.counters)) {
    const key = c.id == null ? null : numericKey(c.id);
    if (key == null) continue;
    const raw = JSON.stringify(c);
    put('counters', key, raw, [
      Number(c.id), String(c.name || `Counter #${c.id}`), str(c.type), str(c.location), c.active !== false ? 1 : 0,
      c.price != null ? Number(c.price) : null, c.ticketPrice != null ? Number(c.ticketPrice) : null,
      c.counterNumber != null ? String(c.counterNumber) : null, raw
    ]);
  }

  for (const p of normalizeEntityList(config.packages)) {
    if (p.id == null) continue;
    const raw = JSON.stringify(p);
    put('packages', String(p.id), raw, [
      String(p.id), String(p.name || 'Package'), Number(p.price) || 0, str(p.category), str(p.description),
      p.active !== false ? 1 : 0, raw
    ]);
  }

  for (const t of extractAllTickets(data.maintenanceTickets, lastUpdated.slice(0, 10))) {
    if (!t || !t.id) continue;
    const raw = JSON.stringify(t);
    put('maintenance_tickets', String(t.id), raw, [
      String(t.id), String(t.date || lastUpdated.slice(0, 10)), t.rideId != null ? Number(t.rideId) : null,
      String(t.rideName || 'Unknown Ride'), String(t.problem || ''), String(t.status || 'reported'),
      String(t.priority || 'normal'), String(t.source || 'operator'),
      t.reportedById != null ? Number(t.reportedById) : null, str(t.reportedByName), str(t.reportedByRole),
      t.assignedToId != null ? Number(t.assignedToId) : null, str(t.assignedToName),
      t.helperIds ? JSON.stringify(t.helperIds) : null, t.helperNames ? JSON.stringify(t.helperNames) : null,
      str(t.guestDetails), String(t.reportedAt || lastUpdated), str(t.inProgressAt), str(t.solvedAt),
      str(t.resolutionNotes), str(t.solutionImageUrl), str(t.photoUrl), str(t.whatsappGroup),
      str(t.whatsappChatId), str(t.whatsappMessageId), t.updatedAt ? String(t.updatedAt) : lastUpdated, raw
    ]);
  }

  const allDates = new Set<string>();
  for (const coll of DAILY_COLLECTIONS) {
    for (const d of Object.keys(data[coll] || {})) allDates.add(d);
  }
  for (const date of allDates) {
    // NULL for a collection without this date, so a cleared collection is not reloaded as an empty object.
    const cols = DAILY_COLLECTIONS.map(coll => {
      const v = data[coll]?.[date];
      return v == null ? null : JSON.stringify(v);
    });
    put('daily_operations', date, cols.map(c => (c == null ? '\u0000' : c)).join('\u0001'), [date, ...cols, lastUpdated]);
  }

  for (const [key, h] of historyEntries(data.historyLog)) {
    const numeric = Number(key);
    put('history_logs', key, JSON.stringify([h.timestamp ?? null, h.user ?? null, h.action ?? null, h.details ?? null]), [
      Number.isFinite(numeric) ? numeric : key,
      String(h.timestamp || lastUpdated), String(h.user || 'system'), String(h.action || 'update'),
      typeof h.details === 'object' ? JSON.stringify(h.details) : String(h.details || '')
    ]);
  }

  const reports = data.whatsappManagementReports && typeof data.whatsappManagementReports === 'object' ? data.whatsappManagementReports : {};
  for (const [rDate, rep] of Object.entries(reports as Record<string, any>)) {
    if (!rep || !rDate) continue;
    const sr = rep.salesAndRevenue || {};
    const raw = JSON.stringify(rep);
    put('whatsapp_management_reports', rDate, raw, [
      rDate, String(rep.timestamp || lastUpdated), str(rep.senderName), str(rep.senderPhone),
      String(rep.groupName || 'TFW Management Team'), Number(sr.toggiKiddoSale || 0), Number(sr.toggiXtremeSale || 0),
      Number(sr.toggiVipConciergeSale || 0), Number(sr.entryTicketSale || 0), Number(sr.totalFootFall || 0),
      Number(sr.discount || 0), Number(sr.totalRevenue || 0), JSON.stringify(rep.counterBreakdown || []),
      str(rep.rawMessage), raw
    ]);
  }

  // One row per entry, so a new staff credential or pre-check rewrites only its own row.
  for (const [name, value] of Object.entries(data)) {
    if (TABLE_DATA_KEYS.has(name)) continue;
    const isMap = value !== null && typeof value === 'object' && !Array.isArray(value);
    const base = isMap ? '{}' : JSON.stringify(value);
    if (base === undefined) continue;
    put('data_collections', `${name}${ITEM_SEPARATOR}`, base, [name, '', base]);
    if (!isMap) continue;
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      const json = JSON.stringify(v);
      if (json === undefined) continue;
      put('data_collections', `${name}${ITEM_SEPARATOR}k:${k}`, json, [name, `k:${k}`, json]);
    }
  }
}

/** History records as [key, record]; the app keeps them as an object keyed by Date.now(), older data as an array. */
function historyEntries(historyLog: any): Array<[string, any]> {
  if (Array.isArray(historyLog)) {
    return historyLog
      .map((h, i): [string, any] => [String(h?.id ?? i), h])
      .filter(([, h]) => h && typeof h === 'object');
  }
  if (historyLog && typeof historyLog === 'object') {
    return Object.entries(historyLog).filter(([, h]) => h && typeof h === 'object') as Array<[string, any]>;
  }
  return [];
}

function readStoredHashes(db: DatabaseSync): { hashes: Map<string, Map<string, string | null>>; duplicated: SyncedTable[] } {
  const all = new Map<string, Map<string, string | null>>();
  const duplicated: SyncedTable[] = [];
  const cfg = db.prepare("SELECT row_hash FROM system_config WHERE id = 'primary'").get() as any;
  all.set('system_config', new Map(cfg ? [['primary', cfg.row_hash ?? null]] : []));
  for (const table of SYNCED_TABLES) {
    const rows = db.prepare(`SELECT ${KEY_SQL[table]} AS k, row_hash AS h FROM ${table}`).all() as any[];
    const m = new Map<string, string | null>();
    for (const r of rows) {
      if (r.k == null) continue;
      if (m.has(String(r.k)) && !duplicated.includes(table)) duplicated.push(table);
      m.set(String(r.k), r.h ?? null);
    }
    all.set(table, m);
  }
  return { hashes: all, duplicated };
}

// A damaged B-tree can hold two rows for one id; DELETE and REPLACE seek by id and leave the other copy behind.
function rebuildTable(db: DatabaseSync, table: SyncedTable): void {
  const objects = db.prepare('SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? AND sql IS NOT NULL').all(table) as any[];
  const create = objects.find(o => o.type === 'table' && o.name === table)?.sql as string | undefined;
  if (!create) return;
  const tmp = `${table}__rebuild`;
  db.exec('SAVEPOINT rebuild_table;');
  try {
    db.exec(`DROP TABLE IF EXISTS ${tmp};`);
    db.exec(create.replace(/^CREATE TABLE\s+"?\w+"?/i, `CREATE TABLE ${tmp}`));
    // WHERE 1 turns off the page-copy transfer, which rejects the duplicate ids; the copy scanned last wins, as in loadFromSqlite.
    db.exec(`INSERT OR REPLACE INTO ${tmp} SELECT * FROM ${table} WHERE 1;`);
    if (table === 'history_logs') {
      db.exec(`DELETE FROM ${tmp} WHERE id NOT IN (SELECT max(id) FROM ${tmp} GROUP BY ${KEY_SQL.history_logs});`);
    }
    db.exec(`DROP TABLE ${table};`);
    db.exec(`ALTER TABLE ${tmp} RENAME TO ${table};`);
    for (const o of objects) {
      if (o.type === 'index' || o.type === 'trigger') db.exec(o.sql);
    }
    db.exec('RELEASE rebuild_table;');
    console.warn(`SQLite ${table}: rebuilt the table because it held more than one row for the same id.`);
  } catch (err) {
    db.exec('ROLLBACK TO rebuild_table;');
    db.exec('RELEASE rebuild_table;');
    console.error(`SQLite ${table}: could not rebuild a table with duplicate ids:`, err);
  }
}

function loadStoredHashes(db: DatabaseSync): Map<string, Map<string, string | null>> {
  const first = readStoredHashes(db);
  if (first.duplicated.length === 0) return first.hashes;
  for (const table of first.duplicated) rebuildTable(db, table);
  return readStoredHashes(db).hashes;
}

/** Call after any direct SQL write outside saveToSqlite, so the next save compares against SQLite again. */
export function resetSqliteRowCache(): void {
  storedHashes = null;
}

/** The server took the state from the last loadFromSqlite as memoryDb: those rows may now be deleted when removed. */
export function adoptLoadedSqliteState(): void {
  if (!lastLoadedKeys) return;
  for (const [table, keys] of lastLoadedKeys) {
    let set = deletableKeys.get(table);
    if (!set) deletableKeys.set(table, (set = new Set()));
    for (const k of keys) set.add(k);
  }
  lastLoadedKeys = null;
}

/** True once a save by this build has reached SQLite; from then on database.json can only be older than SQLite. */
export function jsonOnlyDatesAlreadyMerged(dbPath: string = DEFAULT_SQLITE_PATH): boolean {
  try {
    const db = getSqliteDatabase(dbPath);
    return Boolean(db.prepare('SELECT 1 AS x FROM app_meta WHERE key = ?').get(JSON_DATES_MARKER));
  } catch (_) {
    return false;
  }
}

/** True once a build that keeps History and every other data section in SQLite has saved. */
export function jsonSectionsAlreadyMerged(dbPath: string = DEFAULT_SQLITE_PATH): boolean {
  try {
    const db = getSqliteDatabase(dbPath);
    return Boolean(db.prepare('SELECT 1 AS x FROM app_meta WHERE key = ?').get(JSON_SECTIONS_MARKER));
  } catch (_) {
    return false;
  }
}

/**
 * Write only the rows that changed since the last save and delete rows that left memoryDb, in one transaction
 */
export function saveToSqlite(appDb: any, dbPath: string = DEFAULT_SQLITE_PATH): void {
  if (!appDb || !appDb.config || !appDb.data) return;

  const db = getSqliteDatabase(dbPath);
  const version = Number(appDb.version) || 1;
  const lastUpdated = String(appDb.lastUpdated || new Date().toISOString());
  const config = appDb.config || {};

  const configJson = JSON.stringify(config);
  const configHash = rowHash(configJson);
  const present = new Map<string, Map<string, string>>(SYNCED_TABLES.map(t => [t, new Map<string, string>()]));

  db.exec('BEGIN IMMEDIATE;');

  try {
    const current = storedHashes || loadStoredHashes(db);
    const next = new Map<string, Map<string, string | null>>();
    const deleteKey = (table: SyncedTable, key: string) => {
      if (table === 'history_logs') {
        const n = Number(key);
        cachedStatement(db, DELETE_SQL[table]).run(Number.isFinite(n) ? n : key, Number.isFinite(n) ? n : -1);
      } else if (table === 'data_collections') {
        const at = key.indexOf(ITEM_SEPARATOR);
        cachedStatement(db, DELETE_SQL[table]).run(key.slice(0, at), key.slice(at + 1));
      } else {
        cachedStatement(db, DELETE_SQL[table]).run(NUMERIC_KEY_TABLES.has(table) ? Number(key) : key);
      }
    };

    if (current.get('system_config')?.get('primary') === configHash) {
      cachedStatement(db, 'UPDATE system_config SET version = ?, last_updated = ? WHERE id = ?').run(version, lastUpdated, 'primary');
    } else {
      db.prepare(`
        INSERT OR REPLACE INTO system_config (
          id, version, last_updated, config_json, whatsapp_config, app_config, deleted_ticket_ids, deleted_wa_msg_ids, row_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'primary',
        version,
        lastUpdated,
        configJson,
        JSON.stringify(config.whatsappConfig || {}),
        JSON.stringify(config.appConfig || {}),
        JSON.stringify(config.deletedTicketIds || []),
        JSON.stringify(config.deletedWhatsAppMessageIds || []),
        configHash
      );
    }
    next.set('system_config', new Map([['primary', configHash]]));

    // A key seen twice in one save (same id under two dates or departments) ends with the last one, as before.
    emitRows(appDb, lastUpdated, (table, key, hashSource, params) => {
      const hash = rowHash(hashSource);
      const seen = present.get(table)!;
      const stored = current.get(table);
      const had = seen.has(key) || Boolean(stored?.has(key));
      if ((seen.has(key) ? seen.get(key) : stored?.get(key)) !== hash) {
        if (table === 'history_logs' && had) deleteKey(table, key);
        cachedStatement(db, INSERT_SQL[table]).run(...params, hash);
      }
      seen.set(key, hash);
    });

    const kept: Record<string, number> = {};
    for (const table of SYNCED_TABLES) {
      const seen = present.get(table)!;
      const deletable = deletableKeys.get(table);
      const result = new Map<string, string | null>(seen);
      for (const [key, h] of current.get(table) || []) {
        if (seen.has(key)) continue;
        if (deletable?.has(key)) {
          deleteKey(table, key);
        } else {
          result.set(key, h);
          kept[table] = (kept[table] || 0) + 1;
        }
      }
      next.set(table, result);
    }

    if (!metaMarkerWritten) {
      cachedStatement(db, 'INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)').run(JSON_DATES_MARKER, lastUpdated);
      cachedStatement(db, 'INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)').run(JSON_SECTIONS_MARKER, lastUpdated);
    }

    db.exec('COMMIT;');

    storedHashes = next;
    metaMarkerWritten = true;
    for (const table of SYNCED_TABLES) {
      let set = deletableKeys.get(table);
      if (!set) deletableKeys.set(table, (set = new Set()));
      for (const key of present.get(table)!.keys()) set.add(key);
    }
    for (const [table, n] of Object.entries(kept)) {
      if (keptUnknownLogged.has(table)) continue;
      keptUnknownLogged.add(table);
      console.warn(`SQLite ${table}: kept ${n} row(s) that are not in memory and were never loaded by this process.`);
    }
  } catch (err) {
    // SQLite has already rolled back on errors such as SQLITE_FULL; a second ROLLBACK would throw and hide err.
    try { db.exec('ROLLBACK;'); } catch { /* already rolled back */ }
    storedHashes = null;
    console.error('Failed to save state to SQLite database:', err);
    throw err;
  }
}

/**
 * Load complete application database state from SQLite
 */
export function loadFromSqlite(dbPath: string = DEFAULT_SQLITE_PATH): any | null {
  if (!fs.existsSync(dbPath)) {
    return null;
  }

  const db = getSqliteDatabase(dbPath);
  lastLoadedKeys = null;
  const loaded = new Map<string, Set<string>>(SYNCED_TABLES.map(t => [t, new Set<string>()]));
  const markLoaded = (table: SyncedTable, key: any) => loaded.get(table)!.add(String(key));

  try {
    const configRow = db.prepare('SELECT * FROM system_config WHERE id = ?').get('primary') as any;
    if (!configRow) {
      return null;
    }

    let config: any = {};
    try {
      config = JSON.parse(configRow.config_json);
    } catch {
      config = {};
    }

    // Reconstruct catalog items from normalized tables
    const ridesRows = db.prepare('SELECT * FROM rides ORDER BY id ASC').all() as any[];
    if (ridesRows && ridesRows.length > 0) {
      // Keep original format (dictionary by ID if original was dictionary)
      const isOriginalDictionary = typeof config.rides === 'object' && !Array.isArray(config.rides);
      if (isOriginalDictionary) {
        const rideMap: Record<string, any> = {};
        for (const r of ridesRows) {
          let parsed: any = {};
          try {
            parsed = r.raw_json ? JSON.parse(r.raw_json) : {};
          } catch {
            parsed = {};
          }
          markLoaded('rides', r.id);
          rideMap[String(r.id)] = {
            id: r.id,
            name: r.name,
            floor: r.floor || parsed.floor || 'L1',
            capacity: r.capacity !== null && r.capacity !== undefined ? r.capacity : parsed.capacity,
            status: r.status || parsed.status || 'active',
            minHeight: r.min_height || parsed.minHeight,
            notes: r.notes || parsed.notes,
            imageUrl: r.image_url || parsed.imageUrl || null,
            ...parsed,
            // Ensure table values take precedence over outdated raw_json
            ...(r.image_url ? { imageUrl: r.image_url } : {})
          };
        }
        config.rides = rideMap;
      } else {
        config.rides = ridesRows.map(r => {
          let parsed: any = {};
          try {
            parsed = r.raw_json ? JSON.parse(r.raw_json) : {};
          } catch {
            parsed = {};
          }
          markLoaded('rides', r.id);
          return {
            id: r.id,
            name: r.name,
            floor: r.floor || parsed.floor || 'L1',
            capacity: r.capacity !== null && r.capacity !== undefined ? r.capacity : parsed.capacity,
            status: r.status || parsed.status || 'active',
            minHeight: r.min_height || parsed.minHeight,
            notes: r.notes || parsed.notes,
            imageUrl: r.image_url || parsed.imageUrl || null,
            ...parsed,
            ...(r.image_url ? { imageUrl: r.image_url } : {})
          };
        });
      }
    }

    // Staff
    const staffRows = db.prepare('SELECT * FROM staff ORDER BY id ASC').all() as any[];
    if (staffRows && staffRows.length > 0) {
      const opsMap: Record<string, any> = {};
      const salesMap: Record<string, any> = {};
      const maintMap: Record<string, any> = {};
      const cxMap: Record<string, any> = {};

      for (const s of staffRows) {
        let item: any;
        try {
          item = s.raw_json ? JSON.parse(s.raw_json) : { id: s.id, name: s.name, role: s.role, active: !!s.active };
        } catch {
          item = { id: s.id, name: s.name, role: s.role, active: !!s.active };
        }

        if (s.department === 'operator') opsMap[String(s.id)] = item;
        else if (s.department === 'sales') salesMap[String(s.id)] = item;
        else if (s.department === 'maintenance') maintMap[String(s.id)] = item;
        else if (s.department === 'cx') cxMap[String(s.id)] = item;
        else continue;
        markLoaded('staff', s.id);
      }

      if (Object.keys(opsMap).length) config.operators = opsMap;
      if (Object.keys(salesMap).length) config.ticketSalesPersonnel = salesMap;
      if (Object.keys(maintMap).length) config.maintenancePersonnel = maintMap;
      if (Object.keys(cxMap).length) config.cxPersonnel = cxMap;
    }

    // Counters
    const countersRows = db.prepare('SELECT * FROM counters ORDER BY id ASC').all() as any[];
    if (countersRows && countersRows.length > 0) {
      const counterMap: Record<string, any> = {};
      for (const c of countersRows) {
        markLoaded('counters', c.id);
        try {
          counterMap[String(c.id)] = c.raw_json ? JSON.parse(c.raw_json) : { id: c.id, name: c.name, active: !!c.active };
        } catch {
          counterMap[String(c.id)] = { id: c.id, name: c.name, active: !!c.active };
        }
      }
      config.counters = counterMap;
    }

    // Packages
    const packageRows = db.prepare('SELECT * FROM packages ORDER BY id ASC').all() as any[];
    if (packageRows && packageRows.length > 0) {
      config.packages = packageRows.map(p => {
        markLoaded('packages', p.id);
        try {
          return p.raw_json ? JSON.parse(p.raw_json) : { id: p.id, name: p.name, price: p.price };
        } catch {
          return { id: p.id, name: p.name, price: p.price };
        }
      });
    }

    // Reconstruct Data Object
    const data: any = {
      attendance: {},
      operatorAssignments: {},
      ticketSalesAssignments: {},
      dailyCounts: {},
      dailyPackageCounts: {},
      dailyTicketCounts: {},
      ticketSalesData: {},
      packageSales: {},
      maintenanceTickets: {},
      historyLog: {}
    };

    // Reconstruct Maintenance Tickets nested by date (matching app convention)
    const ticketRows = db.prepare('SELECT * FROM maintenance_tickets ORDER BY date DESC, reported_at DESC').all() as any[];
    for (const t of ticketRows) {
      const date = t.date || 'unknown';
      if (!data.maintenanceTickets[date]) {
        data.maintenanceTickets[date] = {};
      }
      markLoaded('maintenance_tickets', t.id);
      try {
        data.maintenanceTickets[date][t.id] = t.raw_json ? JSON.parse(t.raw_json) : {
          id: t.id,
          date: t.date,
          rideName: t.ride_name,
          problem: t.problem,
          status: t.status
        };
      } catch {
        data.maintenanceTickets[date][t.id] = { id: t.id, date: t.date, rideName: t.ride_name, problem: t.problem, status: t.status };
      }
    }

    // Daily Operations
    const dailyRows = db.prepare('SELECT * FROM daily_operations').all() as any[];
    for (const row of dailyRows) {
      const d = row.operational_date;
      if (!d) continue;
      if (row.attendance) try { data.attendance[d] = JSON.parse(row.attendance); } catch {}
      if (row.operator_assignments) try { data.operatorAssignments[d] = JSON.parse(row.operator_assignments); } catch {}
      if (row.ticket_sales_assignments) try { data.ticketSalesAssignments[d] = JSON.parse(row.ticket_sales_assignments); } catch {}
      if (row.daily_counts) try { data.dailyCounts[d] = JSON.parse(row.daily_counts); } catch {}
      if (row.daily_package_counts) try { data.dailyPackageCounts[d] = JSON.parse(row.daily_package_counts); } catch {}
      if (row.daily_ticket_counts) try { data.dailyTicketCounts[d] = JSON.parse(row.daily_ticket_counts); } catch {}
      if (row.ticket_sales_data) try { data.ticketSalesData[d] = JSON.parse(row.ticket_sales_data); } catch {}
      if (row.package_sales) try { data.packageSales[d] = JSON.parse(row.package_sales); } catch {}
      if (DAILY_COLLECTIONS.some(coll => data[coll][d] !== undefined)) markLoaded('daily_operations', d);
    }

    // History Logs: the newest 500, keyed by id like the app writes them (data/historyLog/<Date.now()>)
    const historyRows = db.prepare('SELECT * FROM history_logs ORDER BY COALESCE(log_id, id) DESC LIMIT 500').all() as any[];
    for (const h of historyRows) {
      let details = h.details;
      try { details = JSON.parse(h.details); } catch {}
      const id = h.log_id ?? h.id;
      markLoaded('history_logs', id);
      data.historyLog[String(id)] = {
        id,
        timestamp: h.timestamp,
        user: h.user_name,
        action: h.action,
        details
      };
    }

    // WhatsApp Management Reports
    data.whatsappManagementReports = {};
    try {
      const reportRows = db.prepare('SELECT * FROM whatsapp_management_reports ORDER BY report_date DESC').all() as any[];
      for (const row of reportRows) {
        if (!row.report_date) continue;
        try {
          data.whatsappManagementReports[row.report_date] = row.raw_json ? JSON.parse(row.raw_json) : {
            date: row.report_date,
            timestamp: row.timestamp,
            senderName: row.sender_name,
            senderPhone: row.sender_phone,
            groupName: row.group_name || 'TFW Management Team',
            salesAndRevenue: {
              toggiKiddoSale: row.kiddo_sale || 0,
              toggiXtremeSale: row.xtreme_sale || 0,
              toggiVipConciergeSale: row.vip_concierge_sale || 0,
              entryTicketSale: row.entry_ticket_sale || 0,
              totalFootFall: row.total_foot_fall || 0,
              discount: row.discount || 0,
              totalRevenue: row.total_revenue || 0
            },
            counterBreakdown: row.counter_breakdown_json ? JSON.parse(row.counter_breakdown_json) : []
          };
          markLoaded('whatsapp_management_reports', row.report_date);
        } catch {}
      }
    } catch (_) {}

    // Other data sections: the section row first, then the entries of an object section.
    try {
      const sectionRows = db.prepare('SELECT collection, item_key, value_json FROM data_collections').all() as any[];
      for (const row of sectionRows) {
        if (row.item_key !== '' || TABLE_DATA_KEYS.has(row.collection)) continue;
        try {
          data[row.collection] = JSON.parse(row.value_json);
          markLoaded('data_collections', `${row.collection}${ITEM_SEPARATOR}`);
        } catch {}
      }
      for (const row of sectionRows) {
        const target = data[row.collection];
        if (!String(row.item_key).startsWith('k:') || TABLE_DATA_KEYS.has(row.collection)) continue;
        if (!target || typeof target !== 'object' || Array.isArray(target)) continue;
        try {
          target[String(row.item_key).slice(2)] = JSON.parse(row.value_json);
          markLoaded('data_collections', `${row.collection}${ITEM_SEPARATOR}${row.item_key}`);
        } catch {}
      }
    } catch (_) {}

    lastLoadedKeys = loaded;
    return {
      version: Number(configRow.version) || 1,
      lastUpdated: String(configRow.last_updated),
      config,
      data
    };
  } catch (err) {
    console.error('Error loading data from SQLite:', err);
    return null;
  }
}

/**
 * Get summary stats from SQLite
 */
export function getSqliteStats(dbPath: string = DEFAULT_SQLITE_PATH): SqliteDbStats | null {
  if (!fs.existsSync(dbPath)) return null;
  const db = getSqliteDatabase(dbPath);

  try {
    const configRow = db.prepare('SELECT version, last_updated FROM system_config WHERE id = ?').get('primary') as any;
    const rides = (db.prepare('SELECT count(*) as c FROM rides').get() as any)?.c || 0;
    const staff = (db.prepare('SELECT count(*) as c FROM staff').get() as any)?.c || 0;
    const counters = (db.prepare('SELECT count(*) as c FROM counters').get() as any)?.c || 0;
    const packages = (db.prepare('SELECT count(*) as c FROM packages').get() as any)?.c || 0;
    const tickets = (db.prepare('SELECT count(*) as c FROM maintenance_tickets').get() as any)?.c || 0;
    const dates = (db.prepare('SELECT count(*) as c FROM daily_operations').get() as any)?.c || 0;
    const history = (db.prepare('SELECT count(*) as c FROM history_logs').get() as any)?.c || 0;

    return {
      version: configRow?.version || 1,
      lastUpdated: configRow?.last_updated || '',
      ridesCount: rides,
      staffCount: staff,
      countersCount: counters,
      packagesCount: packages,
      ticketsCount: tickets,
      operationalDatesCount: dates,
      historyLogsCount: history
    };
  } catch (err) {
    console.error('Failed to get SQLite stats:', err);
    return null;
  }
}

/**
 * Checkpoint WAL log into the main database file to prevent disk growth
 */
export function checkpointSqlite(mode: 'PASSIVE' | 'TRUNCATE' | 'FULL' = 'TRUNCATE', dbPath: string = DEFAULT_SQLITE_PATH): { success: boolean; error?: string } {
  try {
    const db = getSqliteDatabase(dbPath);
    db.exec(`PRAGMA wal_checkpoint(${mode});`);
    try {
      db.exec('PRAGMA incremental_vacuum;');
    } catch (_) {}
    return { success: true };
  } catch (err: any) {
    console.error('SQLite checkpoint error:', err);
    return { success: false, error: err.message };
  }
}

/** Rewrites the whole file so old row versions left in free pages and the WAL are gone. */
export function vacuumSqlite(dbPath: string = DEFAULT_SQLITE_PATH): void {
  const db = getSqliteDatabase(dbPath);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.exec('VACUUM;');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  resetSqliteRowCache();
}

export function getAppMeta(key: string, dbPath: string = DEFAULT_SQLITE_PATH): string | null {
  try {
    const row = getSqliteDatabase(dbPath).prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as any;
    return row ? String(row.value ?? '') : null;
  } catch (_) {
    return null;
  }
}

export function setAppMeta(key: string, value: string, dbPath: string = DEFAULT_SQLITE_PATH): void {
  getSqliteDatabase(dbPath).prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value);
}
