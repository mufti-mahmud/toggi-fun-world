import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Photos and logos kept as base64 inside the database are re-serialised on every save, pushed to every tab and stored
// in each browser's localStorage, so they are written once to data/images and the field holds the file's URL instead.
// SVG is left inline: served from this origin, a script inside it would run when the file is opened directly.
const DATA_URL = /^data:image\/(jpeg|jpg|png|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i;
const EXT: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp' };
const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' };
const LOCAL_URL = /^\/(?:data|api)\/images\/([A-Za-z0-9_-][A-Za-z0-9._-]*)$/;
const STORED_URL = /^\/(?:data|api)\/images\/(img_[0-9a-f]{24}\.(jpg|png|gif|webp))$/;
const STORED_REF = /\/(?:data|api)\/images\/(img_[0-9a-f]{24}\.(?:jpg|png|gif|webp))/g;

const sha256 = (b: Buffer) => crypto.createHash('sha256').update(b).digest('hex');
const verifiedThisRun = new Set<string>();

function isInlineImage(v: string): boolean {
  return v.startsWith('data:image/') && DATA_URL.test(v);
}

// null keeps the data URL: not a convertible picture, or the file could not be written and verified.
export function storeDataUrl(dir: string, value: string): string | null {
  if (!value.startsWith('data:image/')) return null;
  const m = DATA_URL.exec(value);
  if (!m) return null;
  try {
    const bytes = Buffer.from(m[2].replace(/\s+/g, ''), 'base64');
    if (bytes.length === 0) return null;
    const hash = sha256(bytes);
    // Named by content: the same picture is stored once, and the 30-day browser cache can never show a stale file.
    const name = `img_${hash.slice(0, 24)}.${EXT[m[1].toLowerCase()]}`;
    const file = path.join(dir, name);
    if (verifiedThisRun.has(name) && fs.existsSync(file)) return `/data/images/${name}`;
    if (!(fs.existsSync(file) && sha256(fs.readFileSync(file)) === hash)) {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      const fd = fs.openSync(tmp, 'w');
      try {
        fs.writeFileSync(fd, bytes);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, file);
      if (sha256(fs.readFileSync(file)) !== hash) return null;
    }
    verifiedThisRun.add(name);
    return `/data/images/${name}`;
  } catch (e) {
    console.error('Could not store a picture as a file; it stays inside the database:', e);
    return null;
  }
}

export function externalizeImages(dir: string, container: any): number {
  let count = 0;
  const walk = (node: any) => {
    const keys = Array.isArray(node) ? node.keys() : Object.keys(node);
    for (const k of keys as Iterable<any>) {
      const v = node[k];
      if (typeof v === 'string') {
        const url = storeDataUrl(dir, v);
        if (url) { node[k] = url; count++; }
      } else if (v && typeof v === 'object') {
        walk(v);
      }
    }
  };
  if (container && typeof container === 'object') walk(container);
  return count;
}

export function countInlineImages(value: any): number {
  if (typeof value === 'string') return isInlineImage(value) ? 1 : 0;
  if (!value || typeof value !== 'object') return 0;
  let n = 0;
  for (const v of Array.isArray(value) ? value : Object.values(value)) n += countInlineImages(v);
  return n;
}

// null: the URL points into data/images but the file is missing.
export function resolveLocalImage(dir: string, value: string): string | null {
  const m = LOCAL_URL.exec(String(value || '').trim());
  if (!m) return value;
  const file = path.join(dir, m[1]);
  if (!fs.existsSync(file)) return null;
  const ext = path.extname(m[1]).slice(1).toLowerCase();
  return `data:${MIME[ext === 'jpeg' ? 'jpg' : ext] || 'image/jpeg'};base64,${fs.readFileSync(file).toString('base64')}`;
}

// Names of the stored pictures (img_*) that the data still points to.
export function referencedImageFiles(value: any, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (value.includes('/images/img_')) for (const m of value.matchAll(STORED_REF)) found.add(m[1]);
  } else if (value && typeof value === 'object') {
    for (const v of Array.isArray(value) ? value : Object.values(value)) referencedImageFiles(v, found);
  }
  return found;
}

const storedSizes = new Map<string, number>();

// Mime type and length of the data URL a stored picture was made from, so logs can describe it as before; null if not one.
export function storedImageInfo(dir: string, value: string): { mime: string; dataUrlLength: number } | null {
  const m = STORED_URL.exec(value);
  if (!m) return null;
  let size = storedSizes.get(m[1]);
  if (size === undefined) {
    try { size = fs.statSync(path.join(dir, m[1])).size; } catch { return null; }
    if (storedSizes.size >= 10000) storedSizes.clear();
    storedSizes.set(m[1], size);
  }
  const mime = MIME[m[2]];
  return { mime, dataUrlLength: `data:${mime};base64,`.length + 4 * Math.ceil(size / 3) };
}
