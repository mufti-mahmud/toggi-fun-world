// Append-only activity log for analysing a day afterwards: data changes, user actions, WhatsApp traffic, errors,
// slow requests and 5-minute health samples. Kept apart from tfw.db in data/activity-log.db so it never enlarges
// the database snapshot that is saved and sent to browsers. Read it through /api/activity-log (see server.ts).
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { storedImageInfo } from './imageFiles';

export type ActivityLevel = 'info' | 'warn' | 'error';

interface Row {
  ts: string;
  day: string;
  category: string;
  action: string;
  actor: string;
  level: ActivityLevel;
  detail: string;
}

const RETENTION_DAYS = Math.max(7, Number(process.env.ACTIVITY_LOG_RETENTION_DAYS) || 90);
const MAX_DETAIL_CHARS = 4000;
const MAX_BUFFERED_ROWS = 5000;
const FLUSH_INTERVAL_MS = 2000;
const LONG_STRING_CHARS = 300;
// The log shares the volume with tfw.db; below this it stops writing so the database can still save.
const MIN_FREE_DISK_BYTES = 500 * 1024 * 1024;
// Rows per Dhaka day; a normal day writes about 2,500 in total. Past the limit rows are only counted.
const DAILY_ROW_LIMITS: Record<string, number> = { request: 5000, server: 5000, browser: 2000, whatsapp: 5000, data: 100000, user: 100000 };
const DEFAULT_DAILY_LIMIT = 20000;
export const ACTIVITY_PAGE_SIZE = 5000;

// Building an Intl.DateTimeFormat per row held on to native memory until GC (874 MB under a request flood).
const DHAKA_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' });
const DHAKA_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const SECRET_KEY = /password|passcode|token|secret|api_?key/i;

let state: 'pending' | 'on' | 'off' = 'pending';
let db: DatabaseSync | null = null;
let insertRow: StatementSync | null = null;
let buffer: Row[] = [];
let secrets: string[] = [];
let dataDirPath = '';
let rowsToday = { day: '', counts: {} as Record<string, number>, suppressed: {} as Record<string, number> };
let droppedRows = 0;
let lowDisk = false;
let lastDiskCheck = 0;
let lastFailureMessage = 0;

export function dhakaDay(d: Date = new Date()): string {
  return DHAKA_DAY.format(d);
}

/** Opens the log. secretValues are replaced with [redacted] wherever they would be written. */
export function initActivityLog(dataDir: string, secretValues: string[]): boolean {
  const plain = secretValues.filter(s => typeof s === 'string' && s.length >= 4);
  // Also catch the copies that appear inside JSON text or a URL.
  secrets = [...new Set(plain.flatMap(s => [s, JSON.stringify(s).slice(1, -1), encodeURIComponent(s)]))].sort((a, b) => b.length - a.length);
  dataDirPath = dataDir;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    db = new DatabaseSync(path.join(dataDir, 'activity-log.db'));
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        day TEXT NOT NULL,
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT '',
        level TEXT NOT NULL DEFAULT 'info',
        detail TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_activity_day ON activity_log(day, id);
      CREATE INDEX IF NOT EXISTS idx_activity_day_level ON activity_log(day, level);
    `);
    insertRow = db.prepare('INSERT INTO activity_log (ts, day, category, action, actor, level, detail) VALUES (?, ?, ?, ?, ?, ?, ?)');
    loadTodayCounts();
    pruneOldDays();
    setInterval(flushActivityLog, FLUSH_INTERVAL_MS).unref();
    setInterval(pruneOldDays, 6 * 3600 * 1000).unref();
    state = 'on';
    return true;
  } catch (err) {
    db = null;
    insertRow = null;
    buffer = [];
    state = 'off';
    process.stderr.write(`[Activity Log] disabled: ${String(err)}\n`);
    return false;
  }
}

// After a restart the daily limits continue from what is already stored for today.
function loadTodayCounts(): void {
  const day = dhakaDay();
  rowsToday = { day, counts: {}, suppressed: {} };
  if (!db) return;
  for (const r of db.prepare('SELECT category, count(*) AS n FROM activity_log WHERE day = ? GROUP BY category').all(day) as any[]) {
    rowsToday.counts[r.category] = Number(r.n) || 0;
  }
}

function redact(text: string): string {
  let out = text;
  for (const s of secrets) if (out.includes(s)) out = out.split(s).join('[redacted]');
  return out;
}

// Photos are stored as data URLs; keep their size, not their bytes. Role passwords and pasted tokens are never kept.
function shortenLongStrings(key: string, value: unknown) {
  if (key && SECRET_KEY.test(key) && value !== null && typeof value !== 'object' && value !== '') return '[redacted]';
  if (typeof value === 'string' && value.length < 64 && dataDirPath) {
    // Photos now stored in data/images keep the wording they had as data URLs.
    const stored = storedImageInfo(path.join(dataDirPath, 'images'), value);
    if (stored && stored.dataUrlLength > LONG_STRING_CHARS) return `[${stored.mime} ${Math.round(stored.dataUrlLength / 1024)} KB]`;
  }
  if (typeof value === 'string' && value.length > LONG_STRING_CHARS) {
    return value.startsWith('data:') ? `[${value.slice(5, value.indexOf(';') > 0 ? value.indexOf(';') : 20)} ${Math.round(value.length / 1024)} KB]` : `${value.slice(0, LONG_STRING_CHARS)}… (${value.length} chars)`;
  }
  return value;
}

export function toDetailText(detail: unknown): string {
  if (detail === undefined || detail === null) return '';
  let text: string;
  if (typeof detail === 'string') text = detail;
  else if (detail instanceof Error) text = detail.stack || detail.message;
  else {
    try { text = JSON.stringify(detail, shortenLongStrings); } catch { text = String(detail); }
  }
  text = redact(text);
  return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}…` : text;
}

export function logActivity(category: string, action: string, opts: { actor?: string; level?: ActivityLevel; detail?: unknown } = {}): void {
  if (state === 'off') return;
  const now = new Date();
  const day = dhakaDay(now);
  if (rowsToday.day !== day) rowsToday = { day, counts: {}, suppressed: {} };
  const used = rowsToday.counts[category] || 0;
  if (used >= (DAILY_ROW_LIMITS[category] ?? DEFAULT_DAILY_LIMIT)) {
    rowsToday.suppressed[category] = (rowsToday.suppressed[category] || 0) + 1;
    return;
  }
  rowsToday.counts[category] = used + 1;
  buffer.push({
    ts: now.toISOString(),
    day,
    category,
    action: redact(String(action)).slice(0, 200),
    actor: redact(String(opts.actor || '')).slice(0, 120),
    level: opts.level || 'info',
    detail: toDetailText(opts.detail)
  });
  // If the disk is failing, keep the newest rows rather than growing without bound.
  if (buffer.length > MAX_BUFFERED_ROWS) {
    droppedRows += buffer.length - MAX_BUFFERED_ROWS;
    buffer = buffer.slice(-MAX_BUFFERED_ROWS);
  }
}

/** Rows not written today because a category reached its daily limit (reported in the health sample). */
export function suppressedActivityRows(): Record<string, number> {
  return { ...rowsToday.suppressed };
}

function diskIsLow(): boolean {
  const now = Date.now();
  if (now - lastDiskCheck < 60000) return lowDisk;
  lastDiskCheck = now;
  try {
    const s = fs.statfsSync(dataDirPath);
    lowDisk = s.bavail * s.bsize < MIN_FREE_DISK_BYTES;
  } catch { lowDisk = false; }
  return lowDisk;
}

function reportFailure(message: string): void {
  const now = Date.now();
  if (now - lastFailureMessage < 60000) return;
  lastFailureMessage = now;
  process.stderr.write(`[Activity Log] ${message}\n`);
}

export function flushActivityLog(): void {
  if (!db || !insertRow || buffer.length === 0) return;
  if (diskIsLow()) {
    droppedRows += buffer.length;
    buffer = [];
    reportFailure('less than 500 MB free on the data volume: not writing log rows');
    return;
  }
  const rows = buffer;
  buffer = [];
  if (droppedRows > 0) {
    const now = new Date();
    rows.push({ ts: now.toISOString(), day: dhakaDay(now), category: 'system', action: 'log rows dropped', actor: '', level: 'warn', detail: JSON.stringify({ rows: droppedRows }) });
  }
  try {
    db.exec('BEGIN');
    for (const r of rows) insertRow.run(r.ts, r.day, r.category, r.action, r.actor, r.level, r.detail);
    db.exec('COMMIT');
    droppedRows = 0;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    const kept = (droppedRows > 0 ? rows.slice(0, -1) : rows).concat(buffer);
    droppedRows += Math.max(0, kept.length - MAX_BUFFERED_ROWS);
    buffer = kept.slice(-MAX_BUFFERED_ROWS);
    reportFailure(`write failed: ${String(err)}`);
  }
}

function pruneOldDays(): void {
  if (!db) return;
  try {
    const cutoff = dhakaDay(new Date(Date.now() - RETENTION_DAYS * 86400000));
    db.prepare('DELETE FROM activity_log WHERE day < ?').run(cutoff);
  } catch { /* retried in 6 hours */ }
}

export interface ActivityEntry { id?: number; ts: string; category: string; action: string; actor: string; level: string; detail: string }

/** One page of a day in time order: rows after afterId, at most limit of them. */
export function readActivityDay(day: string, category?: string, afterId = 0, limit = ACTIVITY_PAGE_SIZE): ActivityEntry[] {
  flushActivityLog();
  if (!db) return [];
  const sql = `SELECT id, ts, category, action, actor, level, detail FROM activity_log WHERE day = ? AND id > ?${category ? ' AND category = ?' : ''} ORDER BY id LIMIT ?`;
  const stmt = db.prepare(sql);
  return (category ? stmt.all(day, afterId, category, limit) : stmt.all(day, afterId, limit)) as unknown as ActivityEntry[];
}

/** Every row of a day, one at a time, so a large day never sits in memory at once. */
export function* iterateActivityDay(day: string, category?: string): Generator<ActivityEntry> {
  flushActivityLog();
  if (!db) return;
  const sql = `SELECT id, ts, category, action, actor, level, detail FROM activity_log WHERE day = ?${category ? ' AND category = ?' : ''} ORDER BY id`;
  const stmt = db.prepare(sql);
  yield* (category ? stmt.iterate(day, category) : stmt.iterate(day)) as unknown as Iterable<ActivityEntry>;
}

export function listActivityDays(): Array<{ day: string; entries: number; errors: number }> {
  flushActivityLog();
  if (!db) return [];
  return db.prepare("SELECT day, count(*) AS entries, sum(level = 'error') AS errors FROM activity_log GROUP BY day ORDER BY day DESC").all() as any;
}

/** Counts per category and action, the latest errors and warnings, the slowest requests and the busiest people. */
export function summarizeActivityDay(day: string) {
  flushActivityLog();
  const empty = { day, entries: 0, byCategory: {}, byAction: {}, byActor: {}, errors: 0, warnings: 0, problems: [], slowestRequests: [], healthPeaks: null };
  if (!db) return empty;
  const toObject = (rows: any[]): Record<string, number> => Object.fromEntries(rows.map(r => [r.k, Number(r.n)]));
  const byCategory = toObject(db.prepare('SELECT category AS k, count(*) AS n FROM activity_log WHERE day = ? GROUP BY category ORDER BY n DESC').all(day) as any[]);
  const byAction = toObject(db.prepare("SELECT category || ': ' || action AS k, count(*) AS n FROM activity_log WHERE day = ? GROUP BY category, action ORDER BY n DESC").all(day) as any[]);
  const byActor = toObject(db.prepare("SELECT actor AS k, count(*) AS n FROM activity_log WHERE day = ? AND actor <> '' GROUP BY actor ORDER BY n DESC").all(day) as any[]);
  const levels = toObject(db.prepare('SELECT level AS k, count(*) AS n FROM activity_log WHERE day = ? GROUP BY level').all(day) as any[]);
  const problems = (db.prepare("SELECT ts, category, action, actor, level, detail FROM (SELECT * FROM activity_log WHERE day = ? AND level <> 'info' ORDER BY id DESC LIMIT 200) ORDER BY id").all(day) as unknown as ActivityEntry[]);
  const slow: Array<{ ts: string; action: string; ms: number; status?: number }> = [];
  for (const r of db.prepare("SELECT ts, action, detail FROM activity_log WHERE day = ? AND category = 'request'").iterate(day) as unknown as Iterable<ActivityEntry>) {
    try {
      const d = JSON.parse(r.detail);
      if (d.ms >= 1000) {
        slow.push({ ts: r.ts, action: r.action, ms: d.ms, status: d.status });
        if (slow.length > 100) { slow.sort((a, b) => b.ms - a.ms); slow.length = 25; }
      }
    } catch { /* not JSON */ }
  }
  const peaks = { openTabs: 0, cpuPercent: 0, rssMB: 0, eventLoopMaxMs: 0, requestsPer5Min: 0 };
  let healthRows = 0;
  for (const r of db.prepare("SELECT detail FROM activity_log WHERE day = ? AND category = 'health'").iterate(day) as unknown as Iterable<ActivityEntry>) {
    try {
      const h = JSON.parse(r.detail);
      healthRows++;
      peaks.openTabs = Math.max(peaks.openTabs, Number(h.openTabs) || 0);
      peaks.cpuPercent = Math.max(peaks.cpuPercent, Number(h.cpuPercent) || 0);
      peaks.rssMB = Math.max(peaks.rssMB, Number(h.rssMB) || 0);
      peaks.eventLoopMaxMs = Math.max(peaks.eventLoopMaxMs, Number(h.eventLoopMaxMs) || 0);
      peaks.requestsPer5Min = Math.max(peaks.requestsPer5Min, Number(h.requests) || 0);
    } catch { /* not JSON */ }
  }
  return {
    day,
    entries: Object.values(byCategory).reduce((a, b) => a + b, 0),
    byCategory,
    byAction,
    byActor,
    errors: levels.error || 0,
    warnings: levels.warn || 0,
    problems,
    slowestRequests: slow.sort((a, b) => b.ms - a.ms).slice(0, 25),
    healthPeaks: healthRows ? peaks : null
  };
}

export const ACTIVITY_CSV_HEADER = 'time_utc,time_dhaka,category,action,actor,level,detail\r\n';

// A leading = + - @ tab or CR makes Excel run the cell as a formula; the quote keeps it plain text.
function csvCell(v: unknown): string {
  const s = String(v ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function activityCsvRow(r: ActivityEntry): string {
  return [r.ts, DHAKA_TIME.format(new Date(r.ts)), r.category, r.action, r.actor, r.level, r.detail].map(csvCell).join(',') + '\r\n';
}

export function activityToCsv(rows: Iterable<ActivityEntry>): string {
  let out = ACTIVITY_CSV_HEADER;
  for (const r of rows) out += activityCsvRow(r);
  return out;
}
