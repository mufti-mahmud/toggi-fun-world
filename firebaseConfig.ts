// Automated High-Performance Real-Time Database Client
// Built for high concurrency, zero-lag delta sync, optimistic UI, persistent offline mutation queue, and auto-sync on reconnect

import { 
  RIDES, 
  OPERATORS, 
  TICKET_SALES_PERSONNEL, 
  COUNTERS, 
  MAINTENANCE_PERSONNEL, 
  FLOORS, 
  DEFAULT_PACKAGES,
  DEFAULT_APP_CONFIG
} from './constants';
import { playReportedIssueSound } from './utils/soundAlerts';
import { filterSecretWrite, pathSegments, publicStaffEntry, scrubClientDb } from './authShared';

export const isFirebaseConfigured = true; // Local SQLite database persistence is active
export const isDatabaseConfigured = true;
export const clientFirestore: any = null;

// Known permanently deleted tickets and WhatsApp messages to prevent resurrection
export const DEFAULT_DELETED_TICKET_IDS: string[] = [];

export const DEFAULT_DELETED_WA_MSG_IDS: string[] = [];

export const DEFAULT_DELETED_SIGNATURES: string[] = [];

// Server message types that handleServerDelta applies to the cache from the message alone.
const DELTA_APPLIED_TYPES = new Set([
  'set', 'increment', 'ride-count-increment', 'ride-count-set', 'update', 'remove',
  'delete-ticket', 'clear-reported-tickets', 'reset-day', 'clean-older-than', 'reset-cycle'
]);
const SETTLE_QUIET_MS = 15000;
const SETTLE_MAX_WAIT_MS = 60000;

// Device clocks can be a day off (flat battery, NTP off), so the working day follows the server's clock.
let serverClockOffsetMs = 0;
const serverClockListeners = new Set<() => void>();
export const serverNow = (): number => Date.now() + serverClockOffsetMs;
export const onServerClockChange = (listener: () => void): (() => void) => {
  serverClockListeners.add(listener);
  return () => { serverClockListeners.delete(listener); };
};
const noteServerTime = (serverIso: unknown, sentAt: number, receivedAt: number) => {
  const serverMs = typeof serverIso === 'string' ? Date.parse(serverIso) : NaN;
  if (Number.isNaN(serverMs) || receivedAt - sentAt > 10000) return;
  const measured = serverMs - (sentAt + receivedAt) / 2;
  // Round-trip jitter is a few seconds at most; only a real clock error should move the device's day.
  const next = Math.abs(measured) < 5000 ? 0 : measured;
  if (Math.abs(next - serverClockOffsetMs) < 5000) return;
  serverClockOffsetMs = next;
  serverClockListeners.forEach(listener => { try { listener(); } catch { /* ignore */ } });
};

type ValueCallback = (snapshot: { val: () => any }) => void;

const isPlainObject = (v: any) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Delta from the server or from another tab (possibly an old bundle): secrets are dropped, public fields kept.
function sanitizeDeltaValue(path: string, value: any): { drop: true } | { drop: false; value: any } {
  const seg = pathSegments(path);
  if (seg[0] === 'config' && seg[1] === 'authStatus') return seg.length === 2 ? { drop: false, value } : { drop: true };
  if (seg[0] === 'data' && seg[1] === 'staffCredentials') {
    if (seg.length === 2) {
      const out: Record<string, any> = {};
      if (isPlainObject(value)) for (const [k, c] of Object.entries(value)) if (isPlainObject(c)) out[k] = publicStaffEntry(c);
      return { drop: false, value: out };
    }
    if (seg.length === 3) return value == null ? { drop: false, value } : isPlainObject(value) ? { drop: false, value: publicStaffEntry(value) } : { drop: true };
    return { drop: true };
  }
  const f = filterSecretWrite(seg, value);
  return f.skip ? { drop: true } : { drop: false, value: f.value };
}

function sanitizeDelta(msg: any): any {
  let out = msg;
  if (typeof msg.path === 'string') {
    const f = sanitizeDeltaValue(msg.path, msg.value);
    if (f.drop) return null;
    if (f.value !== msg.value) out = { ...out, value: f.value };
  }
  if (isPlainObject(msg.updates)) {
    const updates: Record<string, any> = {};
    for (const [p, v] of Object.entries(msg.updates)) {
      const f = sanitizeDeltaValue(p, v);
      if (!f.drop) updates[p] = f.value;
    }
    if (Object.keys(updates).length === 0 && Object.keys(msg.updates).length > 0) return null;
    out = { ...out, updates };
  }
  return out;
}

// Queued offline writes saved by an older build can hold passwords; those writes are dropped or stripped.
function sanitizeQueuedMutation(item: any): any {
  if (!item || typeof item !== 'object') return null;
  if (typeof item.path === 'string') {
    const f = filterSecretWrite(pathSegments(item.path), item.type === 'remove' ? null : item.value);
    if (f.skip) return null;
    if (item.type === 'set' && f.value !== item.value) item = { ...item, value: f.value };
  }
  if (item.type === 'update' && isPlainObject(item.updates)) {
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(item.updates)) {
      const full = !key.startsWith('data/') && !key.startsWith('config/') && item.basePath ? `${item.basePath}/${key}` : key;
      const f = filterSecretWrite(pathSegments(full), value);
      if (!f.skip) updates[key] = f.value;
    }
    if (Object.keys(updates).length === 0) return null;
    item = { ...item, updates };
  }
  return item;
}

interface QueuedMutation {
  id: string;
  timestamp: number;
  type: 'set' | 'increment' | 'update' | 'remove' | 'delete-ticket' | 'clear-reported-tickets' | 'increment-ride-count' | 'set-ride-count';
  path?: string;
  value?: any;
  delta?: number;
  min?: number;
  updates?: Record<string, any>;
  basePath?: string;
  ticketId?: string;
  whatsappMessageId?: string;
  rideId?: number;
  problem?: string;
  date?: string;
  category?: 'package' | 'ticket' | 'total';
}

class ServerDatabaseEngine {
  private cache: Record<string, any> = {};
  private listeners: Map<string, Set<ValueCallback>> = new Map();
  private sse: EventSource | null = null;
  private isConnected: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private isSseConnected: boolean = false;
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private pollInterval: any = null;
  private dbVersion: number = 0;
  public clientId: string = 'cli_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
  private syncDebounceTimer: any = null;
  private settleTimer: any = null;
  private settleDeadline = 0;
  private lastForeignDeltaAt = 0;
  // Set by this tab's own writes and echoes; cleared by a full download that started after them. While set, the
  // tab's version number includes its own guesses, so a "next" version does not prove the screen matches the server.
  private lastOwnWriteAt = 0;
  private reconnectTimer: any = null;
  private offlineQueue: QueuedMutation[] = [];
  private isFlushingQueue: boolean = false;

  private isServerApiAvailable: boolean = true;
  private sseFailCount: number = 0;
  private lastLocalEditTime: number = 0;
  private lastSsePingTime: number = Date.now();
  private broadcastChannel: BroadcastChannel | null = null;
  // High-concurrency rapid tap accumulator for rush-hour peak times
  private pendingRideIncrements: Map<string, {
    date: string;
    rideId: number | string;
    category: 'package' | 'ticket' | 'total';
    accumulatedDelta: number;
    timer: any;
  }> = new Map();

  private pendingPathIncrements: Map<string, {
    path: string;
    accumulatedDelta: number;
    min: number;
    timer: any;
  }> = new Map();

  private clientOpsCounter: number = 0;
  private peakOpsPerMinute: number = 0;
  private opsLastMinute: number = 0;

  constructor() {
    // 1. Initialize local cache and offline queue from localStorage for instant 0ms startup & persistence
    try {
      const stored = localStorage.getItem('TFW_PERSISTENT_DB') || localStorage.getItem('TFW_PERSISTENT_DB_FALLBACK');
      if (stored) {
        this.cache = JSON.parse(stored);
      }
      const storedQueue = localStorage.getItem('TFW_OFFLINE_QUEUE');
      if (storedQueue) {
        this.offlineQueue = JSON.parse(storedQueue);
      }
    } catch (e) {
      console.warn('Could not read from localStorage:', e);
    }
    this.purgeStoredSecrets();

    // Initialize BroadcastChannel for 0ms cross-tab real-time sync in the same browser
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel('TFW_REALTIME_CHANNEL');
        this.broadcastChannel.onmessage = (ev) => {
          if (ev && ev.data) {
            this.handleServerDelta(ev.data);
          }
        };
      } catch (e) {
        // ignore if not supported
      }
    }

    // Assume initial online if browser is online
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    if (isOnline) {
      this.isConnected = true;
      this.updateConnectionState();
    }

    // 2. Listen to browser native online/offline & visibility/focus events for instant sync
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateConnectionState();
        this.connectStream();
        this.flushOfflineQueue();
        this.fetchFullDatabase();
      });
      window.addEventListener('offline', () => {
        this.isSseConnected = false;
        this.updateConnectionState();
      });
      const handleMobileResume = () => {
        this.isServerApiAvailable = true;
        this.fetchFullDatabase();
        this.checkServerVersion();
        this.flushOfflineQueue();
        if (!this.isSseConnected || !this.sse || this.sse.readyState !== EventSource.OPEN || (Date.now() - this.lastSsePingTime > 10000)) {
          this.connectStream();
        }
      };
      window.addEventListener('focus', handleMobileResume);
      window.addEventListener('pageshow', handleMobileResume);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          handleMobileResume();
        }
      });
      // Mobile screen touch / interaction wake check
      let lastMobileTouchCheck = 0;
      const handleMobileTouchActivity = () => {
        const now = Date.now();
        if (now - lastMobileTouchCheck > 8000) {
          lastMobileTouchCheck = now;
          if (!this.isSseConnected || !this.sse || this.sse.readyState !== EventSource.OPEN || (now - this.lastSsePingTime > 10000)) {
            handleMobileResume();
          }
        }
      };
      window.addEventListener('touchstart', handleMobileTouchActivity, { passive: true });
      window.addEventListener('pointerdown', handleMobileTouchActivity, { passive: true });
      // Cross-tab storage event listener
      window.addEventListener('storage', (e) => {
        if (e.key === 'TFW_PERSISTENT_DB' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            // A tab still running the old bundle writes passwords back; clean them out of both copies again.
            if (scrubClientDb(parsed)) {
              const clean = JSON.stringify(parsed);
              localStorage.setItem('TFW_PERSISTENT_DB', clean);
              localStorage.setItem('TFW_PERSISTENT_DB_FALLBACK', clean);
            }
            if (parsed && (!parsed.version || parsed.version >= this.dbVersion)) {
              this.cache = parsed;
              this.dbVersion = Math.max(parsed.version || 1, this.dbVersion);
              this.notifyAllListeners();
            }
          } catch (err) {}
        }
      });
    }

    // 3. Start Real-time SSE Stream & initial authoritative database fetch
    this.connectStream();
    this.fetchFullDatabase();
    this.checkServerVersion();

    // 4. Background synchronization interval (active health & version check every 1.5s)
    this.pollInterval = setInterval(() => {
      // Continuous sync for both mobile and desktop
      if (!this.isSseConnected || !this.sse || this.sse.readyState !== EventSource.OPEN) {
        this.fetchFullDatabase();
        if (!this.sse || this.sse.readyState === EventSource.CLOSED) {
          this.connectStream();
        }
      } else if (Date.now() - this.lastSsePingTime > 12000) {
        // Detect silent dropped connection on mobile or proxy after background sleep
        this.connectStream();
        this.fetchFullDatabase();
      } else {
        // Periodic lightweight check to ensure multi-device version consistency
        this.checkServerVersion();
      }
    }, 1500);
  }

  // Builds before server-checked passwords kept role passwords and staff PINs on every device.
  private purgeStoredSecrets() {
    try {
      // Both copies are rewritten from the cleaned cache: the fallback copy can differ from the main one.
      if (this.cache && Object.keys(this.cache).length > 0) this.saveToLocalStorage();
      else {
        for (const key of ['TFW_PERSISTENT_DB', 'TFW_PERSISTENT_DB_FALLBACK']) {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (scrubClientDb(parsed)) localStorage.setItem(key, JSON.stringify(parsed));
          } catch (_) {
            localStorage.removeItem(key);
          }
        }
      }
      const queue = Array.isArray(this.offlineQueue) ? this.offlineQueue : [];
      this.offlineQueue = queue.map(sanitizeQueuedMutation).filter(Boolean);
      this.saveOfflineQueue();
      localStorage.removeItem('TFW_STAFF_CREDENTIALS');
      const legacyKeys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('tfw_cache_')) legacyKeys.push(k);
      }
      legacyKeys.forEach(k => localStorage.removeItem(k));
    } catch (e) {
      console.warn('Could not clean stored passwords from this device:', e);
    }
  }

  private updateConnectionState() {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const shouldBeConnected = isOnline && (this.isSseConnected || this.isServerApiAvailable);
    if (this.isConnected !== shouldBeConnected) {
      this.isConnected = shouldBeConnected;
      this.connectionListeners.forEach(cb => {
        try { cb(this.isConnected); } catch (e) {}
      });
      if (this.isConnected) {
        this.flushOfflineQueue();
      }
    }
  }

  // Anti-resurrection check: verifies whether a maintenance ticket has been permanently deleted by ID
  public isTicketDeleted(
    ticketId?: string,
    whatsappMessageId?: string,
    rideId?: number | string,
    problem?: string,
    configOverride?: any
  ): boolean {
    const config = configOverride || this.cache?.config || {};
    const deletedTicketIds: string[] = [
      ...DEFAULT_DELETED_TICKET_IDS,
      ...(Array.isArray(config.deletedTicketIds) ? config.deletedTicketIds : [])
    ];
    const deletedWhatsAppMessageIds: string[] = [
      ...DEFAULT_DELETED_WA_MSG_IDS,
      ...(Array.isArray(config.deletedWhatsAppMessageIds) ? config.deletedWhatsAppMessageIds : [])
    ];

    if (ticketId && deletedTicketIds.includes(String(ticketId))) return true;
    if (whatsappMessageId && deletedWhatsAppMessageIds.includes(String(whatsappMessageId))) return true;

    return false;
  }

  private applyCloudSnapshot(cloudData: any) {
    if (!cloudData || typeof cloudData !== 'object') return;

    // When the Express server is running, the server is the primary authoritative source of truth.
    // Firestore snapshots can be stale due to write quota limits, so do not overwrite active server data.
    if (this.isServerApiAvailable) return;
    if (cloudData.version && this.dbVersion && cloudData.version < this.dbVersion) return;

    const newVersion = Math.max(cloudData.version || 1, this.dbVersion || 1);
    const newLastUpdated = cloudData.lastUpdated || new Date().toISOString();

    const merged: any = {
      version: newVersion,
      lastUpdated: newLastUpdated,
      config: {
        ...(this.cache?.config || {}),
        ...(cloudData.config || {})
      },
      data: {
        ...(this.cache?.data || {}),
        ...(cloudData.data || {})
      }
    };

    if (cloudData.config?.appConfig) {
      merged.config.appConfig = { ...cloudData.config.appConfig };
    }
    if (cloudData.config?.roles !== undefined) {
      merged.config.roles = cloudData.config.roles;
    }
    if (cloudData.config?.hiddenLoginRoles !== undefined) {
      merged.config.hiddenLoginRoles = cloudData.config.hiddenLoginRoles;
    }
    if (cloudData.config?.operators !== undefined) {
      merged.config.operators = cloudData.config.operators;
    }
    if (cloudData.config?.ticketSalesPersonnel !== undefined) {
      merged.config.ticketSalesPersonnel = cloudData.config.ticketSalesPersonnel;
    }
    if (cloudData.config?.maintenancePersonnel !== undefined) {
      merged.config.maintenancePersonnel = cloudData.config.maintenancePersonnel;
    }
    if (cloudData.config?.cxPersonnel !== undefined) {
      merged.config.cxPersonnel = cloudData.config.cxPersonnel;
    }
    if (cloudData.config?.rides !== undefined) {
      merged.config.rides = cloudData.config.rides;
    }
    if (cloudData.config?.counters !== undefined) {
      merged.config.counters = cloudData.config.counters;
    }
    if (cloudData.config?.packages !== undefined) {
      const cloudPackages = cloudData.config.packages;
      const isCloudMock = Array.isArray(cloudPackages) && cloudPackages.some((p: any) => p.id === 'pkg-1' || p.name === 'Single Entry');
      const currentPackages = this.cache?.config?.packages;
      if (isCloudMock) {
        if (Array.isArray(currentPackages) && currentPackages.length > 0 && !currentPackages.some((p: any) => p.id === 'pkg-1')) {
          merged.config.packages = currentPackages;
        } else {
          merged.config.packages = DEFAULT_PACKAGES;
        }
      } else {
        merged.config.packages = cloudPackages;
      }
    } else if (!merged.config.packages || merged.config.packages.length === 0) {
      merged.config.packages = DEFAULT_PACKAGES;
    }
    if (cloudData.config?.officers !== undefined) {
      merged.config.officers = cloudData.config.officers;
    }

    // Anti-resurrection config sync: merge deleted ticket and message IDs and signatures
    if (!merged.config) merged.config = {};
    const localDeletedTickets = Array.isArray(this.cache?.config?.deletedTicketIds) ? this.cache.config.deletedTicketIds : [];
    const cloudDeletedTickets = Array.isArray(cloudData.config?.deletedTicketIds) ? cloudData.config.deletedTicketIds : [];
    merged.config.deletedTicketIds = Array.from(new Set([...localDeletedTickets, ...cloudDeletedTickets]));

    const localDeletedMsgs = Array.isArray(this.cache?.config?.deletedWhatsAppMessageIds) ? this.cache.config.deletedWhatsAppMessageIds : [];
    const cloudDeletedMsgs = Array.isArray(cloudData.config?.deletedWhatsAppMessageIds) ? cloudData.config.deletedWhatsAppMessageIds : [];
    merged.config.deletedWhatsAppMessageIds = Array.from(new Set([...localDeletedMsgs, ...cloudDeletedMsgs]));

    const localDeletedSigs = Array.isArray(this.cache?.config?.deletedTicketSignatures) ? this.cache.config.deletedTicketSignatures : [];
    const cloudDeletedSigs = Array.isArray(cloudData.config?.deletedTicketSignatures) ? cloudData.config.deletedTicketSignatures : [];
    merged.config.deletedTicketSignatures = Array.from(new Set([...localDeletedSigs, ...cloudDeletedSigs]));

    // Merge nested sub-collections inside data to prevent race-condition overwrite
    if (cloudData.data) {
      const collections = [
        'dailyCounts',
        'ticketSalesData',
        'operatorAssignments',
        'ticketSalesAssignments',
        'attendance',
        'packageSales',
        'historyLog',
        'cxComplaints'
      ];
      collections.forEach(col => {
        if (cloudData.data[col]) {
          merged.data[col] = {
            ...(this.cache?.data?.[col] || {}),
            ...cloudData.data[col]
          };
        }
      });

      // Special safe merge for maintenanceTickets: NEVER downgrade 'solved' to 'in-progress'/'reported', or 'in-progress' to 'reported'
      // AND STRICTLY NEVER resurrect deleted tickets from stale cloud snapshots
      if (cloudData.data.maintenanceTickets !== undefined) {
        const cloudDates: Record<string, Record<string, any>> = cloudData.data.maintenanceTickets || {};
        const statusRank: Record<string, number> = { 'solved': 3, 'in-progress': 2, 'reported': 1 };
        const hasOfflineMaint = this.offlineQueue.some(q => q.path?.startsWith('data/maintenanceTickets'));

        if (Object.keys(cloudDates).length === 0 && !hasOfflineMaint) {
          merged.data.maintenanceTickets = {};
        } else {
          let currentMaint = this.cache?.data?.maintenanceTickets;
          const localDates: Record<string, Record<string, any>> = currentMaint || {};
          const cleanDates: Record<string, Record<string, any>> = {};

          for (const [dateKey, cloudDayTickets] of Object.entries(cloudDates)) {
            if (!cloudDayTickets || typeof cloudDayTickets !== 'object') continue;
            const dayMap: Record<string, any> = {};
            const localDayMap = localDates[dateKey] || {};

            for (const [tId, cTicket] of Object.entries(cloudDayTickets)) {
              if (this.isTicketDeleted(tId, cTicket?.whatsappMessageId, cTicket?.rideId, cTicket?.problem, merged.config) || cTicket?.status === 'deleted') {
                continue;
              }
              const localTicket = localDayMap[tId];
              if (!localTicket) {
                dayMap[tId] = cTicket;
              } else {
                const localRank = statusRank[localTicket.status] || 0;
                const cloudRank = statusRank[cTicket.status] || 0;
                if (localRank > cloudRank) {
                  dayMap[tId] = {
                    ...cTicket,
                    ...localTicket,
                    status: localTicket.status,
                    assignedToId: localTicket.assignedToId ?? cTicket.assignedToId,
                    assignedToName: localTicket.assignedToName ?? cTicket.assignedToName,
                    helperIds: localTicket.helperIds ?? cTicket.helperIds,
                    helperNames: localTicket.helperNames ?? cTicket.helperNames,
                    resolutionNotes: (localTicket.resolutionNotes && localTicket.resolutionNotes.trim()) || cTicket.resolutionNotes || '',
                    solutionImageUrl: localTicket.solutionImageUrl || cTicket.solutionImageUrl,
                    solvedAt: localTicket.solvedAt || cTicket.solvedAt
                  };
                } else {
                  dayMap[tId] = {
                    ...localTicket,
                    ...cTicket,
                    status: cTicket.status,
                    assignedToId: cTicket.assignedToId ?? localTicket.assignedToId,
                    assignedToName: cTicket.assignedToName ?? localTicket.assignedToName,
                    inProgressAt: cTicket.inProgressAt ?? localTicket.inProgressAt,
                    helperIds: (cTicket.helperIds && cTicket.helperIds.length > 0) ? cTicket.helperIds : (localTicket.helperIds || []),
                    helperNames: (cTicket.helperNames && cTicket.helperNames.length > 0) ? cTicket.helperNames : (localTicket.helperNames || []),
                    resolutionNotes: (cTicket.resolutionNotes && cTicket.resolutionNotes.trim()) || localTicket.resolutionNotes || '',
                    solutionImageUrl: cTicket.solutionImageUrl || localTicket.solutionImageUrl,
                    solvedAt: cTicket.solvedAt || localTicket.solvedAt
                  };
                }
              }
            }
            if (Object.keys(dayMap).length > 0) {
              cleanDates[dateKey] = dayMap;
            }
          }

          // Overlay any offline mutations pending in queue
          if (hasOfflineMaint) {
            for (const item of this.offlineQueue) {
              if (item.path?.startsWith('data/maintenanceTickets')) {
                const parts = item.path.split('/').filter(Boolean);
                if (parts.length >= 4) {
                  const dKey = parts[2];
                  const tId = parts[3];
                  if (!cleanDates[dKey]) cleanDates[dKey] = {};
                  if (item.type === 'set' && item.value) {
                    cleanDates[dKey][tId] = item.value;
                  } else if (item.type === 'update' && item.updates) {
                    cleanDates[dKey][tId] = { ...(cleanDates[dKey][tId] || {}), ...item.updates };
                  }
                }
              }
            }
          }

          merged.data.maintenanceTickets = cleanDates;
        }
      }
    }

    this.cache = merged;
    this.dbVersion = newVersion;
    this.saveToLocalStorage();
    this.notifyPathListeners('data/maintenanceTickets');
    this.notifyAllListeners();
  }

  private async checkServerVersion() {
    try {
      const sentAt = Date.now();
      const res = await fetch(`/api/health?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        this.isServerApiAvailable = true;
        this.sseFailCount = 0;
        // One failed check marks the stream down; without this the tab re-downloads everything every 1.5 s until it writes.
        if (this.sse && this.sse.readyState === EventSource.OPEN && Date.now() - this.lastSsePingTime < 12000) this.isSseConnected = true;
        const json = await res.json();
        noteServerTime(json.time, sentAt, Date.now());
        if (
          (json.dbVersion && json.dbVersion !== this.dbVersion) ||
          (json.dbLastUpdated && this.cache?.lastUpdated && json.dbLastUpdated !== this.cache.lastUpdated) ||
          !this.cache?.data
        ) {
          this.fetchFullDatabase();
        }
      }
    } catch (e) {
      // Transient network hiccup on mobile or desktop - keep sync active
      this.isSseConnected = false;
    }
  }

  private connectStream() {
    try {
      if (typeof window === 'undefined' || !window.EventSource) return;

      if (this.sse) {
        try { this.sse.close(); } catch (e) { /* ignore */ }
      }

      this.sse = new EventSource('/api/db/stream');

      this.sse.onopen = () => {
        this.isServerApiAvailable = true;
        this.isSseConnected = true;
        this.lastSsePingTime = Date.now();
        this.sseFailCount = 0;
        this.updateConnectionState();
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.flushOfflineQueue();
      };

      this.sse.onmessage = (event) => {
        this.lastSsePingTime = Date.now();
        try {
          const msg = JSON.parse(event.data);
          this.handleServerDelta(msg);
        } catch (e) {
          // ignore parsing errors
        }
      };

      this.sse.onerror = () => {
        this.isSseConnected = false;
        this.updateConnectionState();
        try { this.sse?.close(); } catch (e) {}
        this.sse = null;

        if (!this.reconnectTimer) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectStream();
          }, 2000);
        }
      };
    } catch (e) {
      this.isSseConnected = false;
      this.updateConnectionState();
    }
  }

  private setConnected(connected: boolean) {
    if (this.isConnected !== connected) {
      this.isConnected = connected;
      this.connectionListeners.forEach(cb => cb(connected));
      if (connected) {
        this.flushOfflineQueue();
      }
    }
  }

  private saveOfflineQueue() {
    try {
      localStorage.setItem('TFW_OFFLINE_QUEUE', JSON.stringify(this.offlineQueue));
    } catch (e) {
      // ignore
    }
  }

  private enqueueOfflineMutation(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
    const clean = sanitizeQueuedMutation(mutation);
    if (!clean) return;
    const item: QueuedMutation = {
      ...clean,
      id: 'mut_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7),
      timestamp: Date.now()
    };
    this.offlineQueue.push(item);
    this.saveOfflineQueue();
  }

  // Flush and synchronize all queued mutations in exact order when back online
  public async flushOfflineQueue() {
    if (this.isFlushingQueue || this.offlineQueue.length === 0) return;
    this.isFlushingQueue = true;

    try {
      if (this.isServerApiAvailable) {
        const queueToSync = [...this.offlineQueue];
        const res = await fetch('/api/db/sync-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ queue: queueToSync, senderId: this.clientId })
        });

        if (res.ok) {
          const data = await res.json();
          const processedCount = data.processed !== undefined ? data.processed : queueToSync.length;
          this.offlineQueue = this.offlineQueue.slice(processedCount);
          this.saveOfflineQueue();
          if (data.version) this.dbVersion = data.version;
          this.updateConnectionState();
          return;
        }
      }

      this.offlineQueue = [];
      this.saveOfflineQueue();
      this.updateConnectionState();
    } catch (e) {
      // Will retry on next reconnect
    } finally {
      this.isFlushingQueue = false;
    }
  }

  // Handle incoming real-time deltas directly in memory without full-db roundtrip
  private handleServerDelta(msg: any) {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'connected') {
      if (!this.cache?.data || !this.dbVersion || (msg.version && msg.version !== this.dbVersion) || (msg.lastUpdated && msg.lastUpdated !== this.cache?.lastUpdated)) {
        this.fetchFullDatabase();
      }
      return;
    }

    if (msg.type === 'ping') {
      this.lastSsePingTime = Date.now();
      if (msg.version && this.dbVersion && msg.version !== this.dbVersion) {
        this.debouncedFetchFullDatabase();
      }
      return;
    }

    // High-priority operational issue alert: play sound and notify across all connected devices
    if (msg.type === 'issue-reported') {
      const ticket = msg.ticket || msg.value || msg;
      try {
        playReportedIssueSound(ticket);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('tfw:new-issue-reported', { detail: ticket }));
        }
      } catch (_) {}
      if (msg.senderId && msg.senderId === this.clientId) {
        if (msg.version) this.dbVersion = Math.max(this.dbVersion, msg.version);
        this.lastOwnWriteAt = Date.now();
        return;
      }
      // The ticket itself arrived in the set/update delta just before this alert; a full download per open tab per
      // report overloaded the server in a 150-device load test.
      if (msg.version) this.dbVersion = Math.max(this.dbVersion, msg.version);
      return;
    }

    // Echo suppression: If this client initiated the mutation, local cache was already optimistically updated
    if (msg.senderId && msg.senderId === this.clientId) {
      if (msg.version) this.dbVersion = Math.max(this.dbVersion, msg.version);
      this.lastOwnWriteAt = Date.now();
      return;
    }

    msg = sanitizeDelta(msg);
    if (!msg) return;

    const { type, path, value, delta, updates, date, version } = msg;
    const isExplicitReopen = Boolean(msg.isExplicitReopen || updates?.isExplicitReopen);
    const prevVersion = this.dbVersion;
    if (version) {
      this.dbVersion = Math.max(this.dbVersion, version);
    }

    switch (type) {
      case 'set': {
        if (path) {
          this.setValueLocal(path, value, isExplicitReopen);
          this.saveToLocalStorage();
          this.notifyPathListeners(path);
          if (path.startsWith('data/maintenanceTickets')) {
            this.notifyPathListeners('data/maintenanceTickets');
            if (value && typeof value === 'object' && (value as any).status === 'reported') {
              try {
                playReportedIssueSound(value);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('tfw:new-issue-reported', { detail: value }));
                }
              } catch (_) {}
            }
          }
          if (path.startsWith('config')) {
            this.notifyPathListeners('config');
          }
        }
        break;
      }
      case 'increment': {
        if (path) {
          if (value !== undefined) {
            this.setValueLocal(path, value);
          } else if (delta !== undefined) {
            const current = Number(this.getValue(path)) || 0;
            this.setValueLocal(path, Math.max(0, current + delta));
          }
          this.saveToLocalStorage();
          this.notifyPathListeners(path);
        }
        break;
      }
      case 'ride-count-increment':
      case 'ride-count-set': {
        const { date: d, rideId: rId, newPkg, newTkt, newTotal, updates: rUpdates } = msg;
        if (d && rId !== undefined) {
          if (newPkg !== undefined) this.setValueLocal(`data/dailyPackageCounts/${d}/${rId}`, newPkg);
          if (newTkt !== undefined) this.setValueLocal(`data/dailyTicketCounts/${d}/${rId}`, newTkt);
          if (newTotal !== undefined) this.setValueLocal(`data/dailyCounts/${d}/${rId}`, newTotal);
          if (rUpdates && typeof rUpdates === 'object') {
            for (const [p, val] of Object.entries(rUpdates)) {
              this.setValueLocal(p, val);
            }
          }
          this.saveToLocalStorage();
          this.notifyPathListeners(`data/dailyPackageCounts/${d}`);
          this.notifyPathListeners(`data/dailyTicketCounts/${d}`);
          this.notifyPathListeners(`data/dailyCounts/${d}`);
          this.notifyPathListeners(`data/dailyPackageCounts`);
          this.notifyPathListeners(`data/dailyTicketCounts`);
          this.notifyPathListeners(`data/dailyCounts`);
        }
        break;
      }
      case 'update': {
        if (updates && typeof updates === 'object') {
          const changedPaths: string[] = [];
          for (const [p, val] of Object.entries(updates)) {
            this.setValueLocal(p, val, isExplicitReopen);
            changedPaths.push(p);
          }
          this.saveToLocalStorage();
          changedPaths.forEach(p => this.notifyPathListeners(p));
          if (changedPaths.some(p => p.startsWith('data/maintenanceTickets'))) {
            this.notifyPathListeners('data/maintenanceTickets');
            for (const [p, val] of Object.entries(updates)) {
              if (p.startsWith('data/maintenanceTickets') && val && typeof val === 'object' && (val as any).status === 'reported') {
                try {
                  playReportedIssueSound(val);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tfw:new-issue-reported', { detail: val }));
                  }
                } catch (_) {}
              }
            }
          }
          if (changedPaths.some(p => p.startsWith('config'))) {
            this.notifyPathListeners('config');
          }
        }
        break;
      }
      case 'remove': {
        if (path) {
          if (path.startsWith('data/maintenanceTickets')) {
            const parts = path.split('/').filter(Boolean);
            if (parts.length >= 4) {
              const targetId = parts[3];
              if (!this.cache.config) this.cache.config = {} as any;
              if (!Array.isArray(this.cache.config.deletedTicketIds)) this.cache.config.deletedTicketIds = [];
              if (!this.cache.config.deletedTicketIds.includes(targetId)) {
                this.cache.config.deletedTicketIds.push(targetId);
              }
            }
          }
          this.setValueLocal(path, null);
          this.saveToLocalStorage();
          this.notifyPathListeners(path);
          if (path.startsWith('data/maintenanceTickets')) {
            this.notifyPathListeners('data/maintenanceTickets');
          }
        }
        break;
      }
      case 'delete-ticket': {
        const { ticketId, whatsappMessageId, rideId, problem, date, deletedIds, deletedSignatures, maintenanceTickets } = msg;
        if (!this.cache.config) this.cache.config = {} as any;
        if (!Array.isArray(this.cache.config.deletedTicketIds)) this.cache.config.deletedTicketIds = [];
        if (!Array.isArray(this.cache.config.deletedWhatsAppMessageIds)) this.cache.config.deletedWhatsAppMessageIds = [];
        if (!Array.isArray(this.cache.config.deletedTicketSignatures)) this.cache.config.deletedTicketSignatures = [];

        if (ticketId && !this.cache.config.deletedTicketIds.includes(ticketId)) {
          this.cache.config.deletedTicketIds.push(ticketId);
        }
        if (Array.isArray(deletedIds)) {
          deletedIds.forEach(id => {
            if (id && !this.cache.config.deletedTicketIds.includes(id)) {
              this.cache.config.deletedTicketIds.push(id);
            }
          });
        }
        if (whatsappMessageId && !this.cache.config.deletedWhatsAppMessageIds.includes(whatsappMessageId)) {
          this.cache.config.deletedWhatsAppMessageIds.push(whatsappMessageId);
        }
        if (Array.isArray(deletedSignatures)) {
          deletedSignatures.forEach(sig => {
            if (sig && !this.cache.config.deletedTicketSignatures.includes(sig)) {
              this.cache.config.deletedTicketSignatures.push(sig);
            }
          });
        }
        if (rideId && problem) {
          const normProb = String(problem).toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normProb.length > 5) {
            const sig = `ride-${rideId}-${normProb.slice(0, 30)}`;
            if (!this.cache.config.deletedTicketSignatures.includes(sig)) {
              this.cache.config.deletedTicketSignatures.push(sig);
            }
          }
        }

        if (maintenanceTickets && typeof maintenanceTickets === 'object') {
          if (!this.cache.data) this.cache.data = {};
          this.cache.data.maintenanceTickets = maintenanceTickets;
        } else if (this.cache.data?.maintenanceTickets) {
          for (const dKey of Object.keys(this.cache.data.maintenanceTickets)) {
            const dayMap = this.cache.data.maintenanceTickets[dKey];
            if (!dayMap || typeof dayMap !== 'object') continue;
            for (const [tKey, tObjRaw] of Object.entries(dayMap)) {
              const tObj = tObjRaw as any;
              if (this.isTicketDeleted(tKey, tObj?.whatsappMessageId, tObj?.rideId, tObj?.problem) ||
                  this.isTicketDeleted(tObj?.id, tObj?.whatsappMessageId, tObj?.rideId, tObj?.problem)) {
                delete dayMap[tKey];
              }
            }
            if (Object.keys(dayMap).length === 0) {
              delete this.cache.data.maintenanceTickets[dKey];
            }
          }
        }
        this.saveToLocalStorage();
        this.notifyPathListeners('data/maintenanceTickets');
        this.notifyPathListeners('config');
        this.notifyAllListeners();
        break;
      }
      case 'clear-reported-tickets': {
        const { date, maintenanceTickets } = msg;
        if (maintenanceTickets && typeof maintenanceTickets === 'object') {
          if (!this.cache.data) this.cache.data = {};
          this.cache.data.maintenanceTickets = maintenanceTickets;
        } else if (this.cache.data?.maintenanceTickets) {
          for (const dKey of Object.keys(this.cache.data.maintenanceTickets)) {
            const dayMap = this.cache.data.maintenanceTickets[dKey];
            if (!dayMap || typeof dayMap !== 'object') continue;
            for (const [tKey, tObjRaw] of Object.entries(dayMap)) {
              const tObj = tObjRaw as any;
              if (tObj && tObj.status === 'reported') {
                const isMatch = dKey === date || tObj.date === date || (tObj.reportedAt && tObj.reportedAt.startsWith(date));
                if (isMatch) {
                  if (tObj.id && !this.cache.config.deletedTicketIds.includes(tObj.id)) {
                    this.cache.config.deletedTicketIds.push(tObj.id);
                  }
                  if (tObj.whatsappMessageId && !this.cache.config.deletedWhatsAppMessageIds.includes(tObj.whatsappMessageId)) {
                    this.cache.config.deletedWhatsAppMessageIds.push(tObj.whatsappMessageId);
                  }
                  delete dayMap[tKey];
                }
              }
            }
            if (Object.keys(dayMap).length === 0) {
              delete this.cache.data.maintenanceTickets[dKey];
            }
          }
        }
        this.saveToLocalStorage();
        this.notifyPathListeners('data/maintenanceTickets');
        this.notifyPathListeners('config');
        this.notifyAllListeners();
        break;
      }
      case 'reset-day': {
        if (date) {
          if (this.cache?.data?.dailyCounts) delete this.cache.data.dailyCounts[date];
          if (this.cache?.data?.ticketSalesData) delete this.cache.data.ticketSalesData[date];
          if (this.cache?.data?.operatorAssignments) delete this.cache.data.operatorAssignments[date];
          if (this.cache?.data?.ticketSalesAssignments) delete this.cache.data.ticketSalesAssignments[date];
          if (this.cache?.data?.attendance) delete this.cache.data.attendance[date];
          if (this.cache?.data?.packageSales) delete this.cache.data.packageSales[date];
          if (this.cache?.data?.maintenanceTickets) delete this.cache.data.maintenanceTickets[date];
          this.saveToLocalStorage();
          this.notifyAllListeners();
        }
        break;
      }
      case 'clean-older-than': {
        if (msg.cutoffDate) {
          const collections = ['dailyCounts', 'ticketSalesData', 'operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales', 'maintenanceTickets'];
          collections.forEach(col => {
            if (this.cache?.data?.[col] && typeof this.cache.data[col] === 'object') {
              Object.keys(this.cache.data[col]).forEach(d => {
                if (d < msg.cutoffDate) {
                  delete this.cache.data[col][d];
                }
              });
            }
          });
          this.saveToLocalStorage();
          this.notifyAllListeners();
        }
        break;
      }
      case 'reset-cycle': {
        if (msg.newCycleStartDate) {
          const collections = ['dailyCounts', 'ticketSalesData', 'operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales', 'maintenanceTickets'];
          collections.forEach(col => {
            if (this.cache?.data?.[col] && typeof this.cache.data[col] === 'object') {
              Object.keys(this.cache.data[col]).forEach(d => {
                if (d < msg.newCycleStartDate) {
                  delete this.cache.data[col][d];
                }
              });
            }
          });
          if (this.cache?.config?.appConfig) {
            this.cache.config.appConfig.cycleStartDate = msg.newCycleStartDate;
            const startDateObj = new Date(msg.newCycleStartDate);
            const endDateObj = new Date(startDateObj);
            endDateObj.setMonth(endDateObj.getMonth() + 3);
            this.cache.config.appConfig.cycleEndDate = endDateObj.toISOString().split('T')[0];
            this.cache.config.appConfig.lastCycleResetDate = new Date().toISOString();
          }
          this.saveToLocalStorage();
          this.notifyAllListeners();
        }
        break;
      }
      case 'ping': {
        if (msg.version && msg.version > this.dbVersion) {
          this.debouncedFetchFullDatabase();
        }
        break;
      }
      case 'connected': {
        if (msg.activeView) {
          this.setValueLocal('config/appConfig/activeView', msg.activeView);
        }
        if (msg.maintenancePortal) {
          this.setValueLocal('config/appConfig/activeMaintenancePortal', msg.maintenancePortal);
        }
        if (msg.maintenanceStatusTab) {
          this.setValueLocal('config/appConfig/activeMaintenanceStatusTab', msg.maintenanceStatusTab);
        }
        if (msg.maintenanceViewScope) {
          this.setValueLocal('config/appConfig/activeMaintenanceViewScope', msg.maintenanceViewScope);
        }
        if (msg.activeView || msg.maintenancePortal || msg.maintenanceStatusTab || msg.maintenanceViewScope) {
          this.notifyPathListeners('config/appConfig');
          this.notifyPathListeners('config');
        }
        if (msg.version && msg.version > this.dbVersion) {
          this.fetchFullDatabase();
        }
        break;
      }
      case 'sync': {
        if (msg.activeView) {
          this.setValueLocal('config/appConfig/activeView', msg.activeView);
        }
        if (msg.maintenancePortal) {
          this.setValueLocal('config/appConfig/activeMaintenancePortal', msg.maintenancePortal);
        }
        if (msg.maintenanceStatusTab) {
          this.setValueLocal('config/appConfig/activeMaintenanceStatusTab', msg.maintenanceStatusTab);
        }
        if (msg.maintenanceViewScope) {
          this.setValueLocal('config/appConfig/activeMaintenanceViewScope', msg.maintenanceViewScope);
        }
        if (msg.activeView || msg.maintenancePortal || msg.maintenanceStatusTab || msg.maintenanceViewScope) {
          this.notifyPathListeners('config/appConfig');
          this.notifyPathListeners('config');
        }
        if (msg.force) {
          this.fetchFullDatabase();
        } else {
          this.debouncedFetchFullDatabase();
        }
        break;
      }
      default: {
        this.debouncedFetchFullDatabase();
        break;
      }
    }

    // Every server save bumps the version by one. When this message is the very next one and was applied above, the
    // cache matches the server again, so adopt its timestamp; otherwise the 1.5 s health check re-downloads everything.
    if (version && version === prevVersion + 1 && msg.timestamp && DELTA_APPLIED_TYPES.has(type) && this.cache && !this.lastOwnWriteAt) {
      this.cache.lastUpdated = msg.timestamp;
      this.scheduleSettleFetch();
    }
  }

  // Server-side side effects (duplicate tickets solved together, count mirroring) are not in the delta messages,
  // so one full download once changes go quiet keeps screens that stay open all day exact.
  private scheduleSettleFetch() {
    const now = Date.now();
    this.lastForeignDeltaAt = now;
    if (!this.settleDeadline) this.settleDeadline = now + SETTLE_MAX_WAIT_MS;
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.settleDeadline = 0;
      this.fetchFullDatabase();
    }, Math.max(0, Math.min(SETTLE_QUIET_MS, this.settleDeadline - now)));
  }

  private debouncedFetchFullDatabase() {
    if (this.syncDebounceTimer) return;
    this.syncDebounceTimer = setTimeout(() => {
      this.syncDebounceTimer = null;
      this.fetchFullDatabase();
    }, 200);
  }

  private mergeDatabases(localDb: any, serverDb: any): { merged: any; shouldPushToServer: boolean } {
    if (!localDb || typeof localDb !== 'object') {
      scrubClientDb(serverDb);
      return { merged: serverDb, shouldPushToServer: false };
    }
    if (!serverDb || typeof serverDb !== 'object') {
      scrubClientDb(localDb);
      return { merged: localDb, shouldPushToServer: true };
    }

    let shouldPushToServer = false;
    // version and lastUpdated must be the server's: the 1.5 s health check compares them to decide whether to re-download.
    const merged: any = {
      version: serverDb.version || Math.max(localDb.version || 1, 1),
      lastUpdated: serverDb.lastUpdated || new Date().toISOString(),
      config: { ...(localDb.config || {}), ...(serverDb.config || {}) },
      data: { ...(serverDb.data || {}) }
    };

    // 1. Roles and Config Protection: preserve customized roles
    const localRoles = localDb.config?.appConfig?.roles || localDb.config?.roles;
    const serverRoles = serverDb.config?.appConfig?.roles || serverDb.config?.roles;

    if (Array.isArray(localRoles) && localRoles.length > 0) {
      if (!Array.isArray(serverRoles) || serverRoles.length === 0 || localRoles.length >= (serverRoles.length || 0)) {
        if (!merged.config.appConfig) merged.config.appConfig = {};
        merged.config.appConfig.roles = localRoles;
        merged.config.roles = localRoles;
        if (!serverRoles || localRoles.length > (serverRoles.length || 0)) {
          shouldPushToServer = true;
        }
      }
    }

    // Merge appConfig details: server is authoritative
    merged.config.appConfig = {
      ...DEFAULT_APP_CONFIG,
      ...(localDb.config?.appConfig || {}),
      ...(serverDb.config?.appConfig || {})
    };
    if (localRoles && Array.isArray(localRoles) && localRoles.length > 0) {
      merged.config.appConfig.roles = localRoles;
      merged.config.roles = localRoles;
    }

    // Merge rides: preserve customized imageUrls and fields across local & server
    const serverRides = serverDb.config?.rides || {};
    const localRides = localDb.config?.rides || {};
    const mergedRides: Record<string, any> = { ...serverRides };
    if (localRides && typeof localRides === 'object') {
      for (const [rId, rVal] of Object.entries(localRides as Record<string, any>)) {
        if (!rVal || typeof rVal !== 'object') continue;
        if (!mergedRides[rId]) {
          mergedRides[rId] = rVal;
        } else {
          // The server copy wins: a device's stored copy can be days old, and letting it win kept showing an old
          // picture (or name) after an admin changed it, even across logout and reload.
          mergedRides[rId] = {
            ...rVal,
            ...mergedRides[rId],
            imageUrl: mergedRides[rId].imageUrl || rVal.imageUrl || null
          };
        }
      }
    }
    merged.config.rides = mergedRides;

    const mergedDeletedTicketIds = Array.from(new Set([
      ...(serverDb.config?.deletedTicketIds || []),
      ...(localDb.config?.deletedTicketIds || [])
    ]));
    const mergedDeletedMsgIds = Array.from(new Set([
      ...(serverDb.config?.deletedWhatsAppMessageIds || []),
      ...(localDb.config?.deletedWhatsAppMessageIds || [])
    ]));
    const mergedDeletedSigs = Array.from(new Set([
      ...(serverDb.config?.deletedTicketSignatures || []),
      ...(localDb.config?.deletedTicketSignatures || [])
    ]));
    merged.config.deletedTicketIds = mergedDeletedTicketIds;
    merged.config.deletedWhatsAppMessageIds = mergedDeletedMsgIds;
    merged.config.deletedTicketSignatures = mergedDeletedSigs;

    // 2. Data Collections Deep Merge (Preserve all historical dates and records)
    const collections = [
      'dailyCounts',
      'ticketSalesData',
      'operatorAssignments',
      'ticketSalesAssignments',
      'attendance',
      'packageSales',
      'maintenanceTickets',
      'historyLog'
    ];

    if (!merged.data) merged.data = {};

    collections.forEach(col => {
      const serverCol = serverDb.data?.[col] || {};
      const localCol = localDb.data?.[col] || {};
      
      const mergedCol: Record<string, any> = { ...serverCol };
      
      if (col === 'maintenanceTickets') {
        const statusRank: Record<string, number> = { 'solved': 3, 'in-progress': 2, 'reported': 1 };

        // 1. Purge any deleted tickets from serverCol copy first
        for (const dateKey of Object.keys(mergedCol)) {
          if (mergedCol[dateKey] && typeof mergedCol[dateKey] === 'object') {
            const cleanDay: Record<string, any> = {};
            for (const [tId, tObj] of Object.entries(mergedCol[dateKey] as Record<string, any>)) {
              if (this.isTicketDeleted(tId, tObj?.whatsappMessageId, tObj?.rideId, tObj?.problem, merged.config) || tObj?.status === 'deleted') {
                continue;
              }
              cleanDay[tId] = tObj;
            }
            if (Object.keys(cleanDay).length > 0) {
              mergedCol[dateKey] = cleanDay;
            } else {
              delete mergedCol[dateKey];
            }
          }
        }

        // 2. Merge localCol safely - SERVER IS AUTHORITATIVE for deletions
        Object.keys(localCol).forEach(dateKey => {
          if (!localCol[dateKey] || typeof localCol[dateKey] !== 'object') return;
          if (!mergedCol[dateKey]) {
            // If the server does not have this date, only keep local tickets if they are actively pending in offline queue
            const cleanDay: Record<string, any> = {};
            for (const [tId, locTicket] of Object.entries(localCol[dateKey] as Record<string, any>)) {
              if (this.isTicketDeleted(tId, locTicket?.whatsappMessageId, locTicket?.rideId, locTicket?.problem, merged.config) || locTicket?.status === 'deleted') {
                continue;
              }
              const isPendingOffline = this.offlineQueue.some(q => q.path?.includes(tId));
              if (isPendingOffline && (locTicket?.status === 'solved' || locTicket?.status === 'in-progress' || locTicket?.status === 'reported')) {
                cleanDay[tId] = locTicket;
              }
            }
            if (Object.keys(cleanDay).length > 0) {
              mergedCol[dateKey] = cleanDay;
              shouldPushToServer = true;
            }
          } else if (typeof localCol[dateKey] === 'object' && typeof mergedCol[dateKey] === 'object') {
            const mergedDay = { ...mergedCol[dateKey] };
            const localDay = localCol[dateKey];
            for (const [tId, locTicket] of Object.entries(localDay as Record<string, any>)) {
              if (this.isTicketDeleted(tId, locTicket?.whatsappMessageId, locTicket?.rideId, locTicket?.problem, merged.config) || locTicket?.status === 'deleted') {
                delete mergedDay[tId];
                continue;
              }
              const srvTicket = mergedDay[tId];
              if (!srvTicket) {
                // NEVER resurrect deleted, purged, or omitted tickets from local cache unless pending in offline queue
                const isPendingOffline = this.offlineQueue.some(q => q.path?.includes(tId));
                if (isPendingOffline && (locTicket?.status === 'solved' || locTicket?.status === 'in-progress')) {
                  mergedDay[tId] = locTicket;
                  shouldPushToServer = true;
                }
              } else {
                // Check if any server ticket with matching identity is solved across any day
                const coreSuffix = tId.replace(/^\d{4}-\d{2}-\d{2}-/, '');
                const normProb = (locTicket?.problem || '').trim().toLowerCase();
                let isSolvedOnServer = srvTicket.status === 'solved';
                let serverSolvedRecord: any = isSolvedOnServer ? srvTicket : null;
                if (!isSolvedOnServer && merged.data?.maintenanceTickets) {
                  for (const dayObj of Object.values(merged.data.maintenanceTickets)) {
                    if (dayObj && typeof dayObj === 'object') {
                      for (const [sId, sTicket] of Object.entries(dayObj as Record<string, any>)) {
                        if (sTicket?.status === 'solved') {
                          if (
                            (locTicket?.whatsappMessageId && sTicket.whatsappMessageId === locTicket.whatsappMessageId) ||
                            (coreSuffix && sId.endsWith(coreSuffix)) ||
                            (locTicket?.rideId && sTicket.rideId === locTicket.rideId && normProb && (sTicket.problem || '').trim().toLowerCase() === normProb)
                          ) {
                            isSolvedOnServer = true;
                            serverSolvedRecord = sTicket;
                            break;
                          }
                        }
                      }
                      if (isSolvedOnServer) break;
                    }
                  }
                }

                if (isSolvedOnServer && serverSolvedRecord) {
                  mergedDay[tId] = {
                    ...locTicket,
                    ...srvTicket,
                    ...serverSolvedRecord,
                    status: 'solved',
                    resolutionNotes: serverSolvedRecord.resolutionNotes || locTicket.resolutionNotes || '',
                    solutionImageUrl: serverSolvedRecord.solutionImageUrl || locTicket.solutionImageUrl,
                    solvedAt: serverSolvedRecord.solvedAt || locTicket.solvedAt || new Date().toISOString()
                  };
                } else {
                  const isPendingOffline = this.offlineQueue.some(q => q.path?.includes(tId));
                  if (isPendingOffline) {
                    const locRank = statusRank[locTicket.status] || 0;
                    const srvRank = statusRank[srvTicket.status] || 0;
                    if (locRank > srvRank) {
                      mergedDay[tId] = {
                        ...srvTicket,
                        ...locTicket,
                        status: locTicket.status,
                        resolutionNotes: (locTicket.resolutionNotes && locTicket.resolutionNotes.trim()) || srvTicket.resolutionNotes || '',
                        solutionImageUrl: locTicket.solutionImageUrl || srvTicket.solutionImageUrl,
                        solvedAt: locTicket.solvedAt || srvTicket.solvedAt
                      };
                      shouldPushToServer = true;
                    } else {
                      mergedDay[tId] = {
                        ...locTicket,
                        ...srvTicket,
                        status: srvTicket.status,
                        resolutionNotes: (srvTicket.resolutionNotes && srvTicket.resolutionNotes.trim()) || (locTicket.resolutionNotes && locTicket.resolutionNotes.trim()) || '',
                        solutionImageUrl: srvTicket.solutionImageUrl || locTicket.solutionImageUrl,
                        solvedAt: srvTicket.solvedAt || locTicket.solvedAt
                      };
                    }
                  } else {
                    // Server ticket is strictly authoritative across all devices when no pending offline edits exist
                    mergedDay[tId] = srvTicket;
                  }
                }
              }
            }
            mergedCol[dateKey] = mergedDay;
          }
        });
      } else {
        Object.keys(localCol).forEach(key => {
          if (mergedCol[key] === undefined || mergedCol[key] === null) {
            mergedCol[key] = localCol[key];
            shouldPushToServer = true;
          } else if (typeof localCol[key] === 'object' && typeof mergedCol[key] === 'object') {
            mergedCol[key] = { ...mergedCol[key], ...localCol[key] };
          }
        });
      }

      merged.data[col] = mergedCol;
    });

    const serverHistoryCount = Object.keys(serverDb.data?.historyLog || {}).length;
    const localHistoryCount = Object.keys(localDb.data?.historyLog || {}).length;
    if (serverHistoryCount <= 1 && localHistoryCount > 1) {
      shouldPushToServer = true;
    }

    // The local copy can still hold passwords an older build cached; they must not survive the merge.
    scrubClientDb(merged);
    return { merged, shouldPushToServer };
  }

  public async fetchFullDatabase() {
    const startedAt = Date.now();
    try {
      const res = await fetch(`/api/db?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json && json.db) {
          let localFallback = this.cache;
          if ((!localFallback || !localFallback.data) && typeof window !== 'undefined') {
            try {
              const raw = localStorage.getItem('TFW_PERSISTENT_DB');
              if (raw) localFallback = JSON.parse(raw);
            } catch (e) {}
          }
          const { merged, shouldPushToServer } = this.mergeDatabases(localFallback || {}, json.db);
          this.cache = merged;
          // The server's version is authoritative; a higher local number would never match the health check again.
          this.dbVersion = json.version || this.dbVersion;
          if (this.lastOwnWriteAt && this.lastOwnWriteAt < startedAt) this.lastOwnWriteAt = 0;
          if (this.settleTimer && this.lastForeignDeltaAt < startedAt) {
            clearTimeout(this.settleTimer);
            this.settleTimer = null;
            this.settleDeadline = 0;
          }
          this.saveToLocalStorage();
          this.notifyAllListeners();
          this.setConnected(true);

          if (shouldPushToServer && merged.data?.maintenanceTickets && this.offlineQueue.length > 0) {
            fetch('/api/db/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                updates: { 'data/maintenanceTickets': merged.data.maintenanceTickets },
                senderId: this.clientId
              })
            }).catch(() => {});
          }

          // Flush any pending offline mutations in order
          if (this.offlineQueue.length > 0) {
            this.flushOfflineQueue();
          }
          return;
        }
      }
    } catch (err) {
      this.setConnected(false);
    }
  }

  private saveToLocalStorage() {
    try {
      scrubClientDb(this.cache);
      const serialized = JSON.stringify(this.cache);
      localStorage.setItem('TFW_PERSISTENT_DB', serialized);
      localStorage.setItem('TFW_PERSISTENT_DB_FALLBACK', serialized);
    } catch (e) {
      // quota or private mode
    }
  }

  public subscribe(path: string, callback: ValueCallback) {
    const normalized = this.normalizePath(path);
    if (!this.listeners.has(normalized)) {
      this.listeners.set(normalized, new Set());
    }
    this.listeners.get(normalized)!.add(callback);

    // Immediate callback with current cached value
    const currentVal = this.getValue(normalized);
    callback({ val: () => currentVal });
  }

  public unsubscribe(path: string, callback?: ValueCallback) {
    const normalized = this.normalizePath(path);
    if (!callback) {
      this.listeners.delete(normalized);
      return;
    }
    const set = this.listeners.get(normalized);
    if (set) {
      set.delete(callback);
      if (set.size === 0) {
        this.listeners.delete(normalized);
      }
    }
  }

  public onConnectionChange(cb: (connected: boolean) => void) {
    this.connectionListeners.add(cb);
    cb(this.isConnected);
    return () => this.connectionListeners.delete(cb);
  }

  private normalizePath(path: string): string {
    if (!path) return '';
    return path.replace(/^\/+|\/+$/g, '');
  }

  // Fine-grained path listener notification to prevent unnecessary whole-app re-renders
  private notifyPathListeners(changedPath: string) {
    const normChanged = this.normalizePath(changedPath);

    this.listeners.forEach((callbacks, listenerPath) => {
      const normListener = this.normalizePath(listenerPath);
      
      // Match if listener is listening to root, or is parent/ancestor of changedPath, or is exact match/descendant
      const isMatch = 
        normListener === '' ||
        normChanged === '' ||
        normListener === normChanged ||
        normChanged.startsWith(normListener + '/') ||
        normListener.startsWith(normChanged + '/');

      if (isMatch) {
        const val = this.getValue(normListener);
        callbacks.forEach(cb => {
          try {
            cb({ val: () => val });
          } catch (e) {
            console.error('Error in listener callback:', e);
          }
        });
      }
    });
  }

  private notifyAllListeners() {
    this.listeners.forEach((callbacks, path) => {
      const val = this.getValue(path);
      callbacks.forEach(cb => {
        try {
          cb({ val: () => val });
        } catch (e) {
          console.error('Error in listener callback:', e);
        }
      });
    });
  }

  private cloneValue(val: any) {
    if (val === null || val === undefined) return val;
    if (typeof val !== 'object') return val;
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (e) {
      if (Array.isArray(val)) return [...val];
      return { ...val };
    }
  }

  // Local persistence helper (offline SQLite mode)
  private pushToFirestoreClient(immediate: boolean = false) {
    // Offline SQLite mode: all persistence is handled by server API / SQLite
  }

  // Force broadcast current view, active date, and maintenance tabs across all connected devices
  public async syncViewEverywhere(
    activeDate?: string, 
    activeView?: string,
    extraParams?: {
      portalType?: string;
      statusTab?: string;
      viewScope?: string;
      sharedBy?: string;
    }
  ): Promise<boolean> {
    if (activeView) {
      this.setValueLocal('config/appConfig/activeView', activeView);
      if (!this.cache.config) this.cache.config = {};
      if (!this.cache.config.appConfig) this.cache.config.appConfig = {};
      this.cache.config.appConfig.activeView = activeView;
    }
    if (extraParams?.portalType) {
      this.setValueLocal('config/appConfig/activeMaintenancePortal', extraParams.portalType);
      if (this.cache.config?.appConfig) this.cache.config.appConfig.activeMaintenancePortal = extraParams.portalType;
    }
    if (extraParams?.statusTab) {
      this.setValueLocal('config/appConfig/activeMaintenanceStatusTab', extraParams.statusTab);
      if (this.cache.config?.appConfig) this.cache.config.appConfig.activeMaintenanceStatusTab = extraParams.statusTab;
    }
    if (extraParams?.viewScope) {
      this.setValueLocal('config/appConfig/activeMaintenanceViewScope', extraParams.viewScope);
      if (this.cache.config?.appConfig) this.cache.config.appConfig.activeMaintenanceViewScope = extraParams.viewScope;
    }
    if (activeDate || activeView || extraParams) {
      this.notifyPathListeners('config/appConfig');
      this.notifyPathListeners('config');
    }
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    if (this.cache) {
      this.cache.version = this.dbVersion;
      this.cache.lastUpdated = new Date().toISOString();
    }
    this.saveToLocalStorage();
    this.notifyAllListeners();
    this.pushToFirestoreClient(true);

    // Server API broadcast if available
    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/broadcast-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            db: this.cache,
            activeDate,
            // The server stamps the shared date with its own Dhaka day; older bundles send activeDate alone.
            shareDate: Boolean(activeDate),
            sharedBy: extraParams?.sharedBy,
            activeView,
            maintenancePortal: extraParams?.portalType,
            maintenanceStatusTab: extraParams?.statusTab,
            maintenanceViewScope: extraParams?.viewScope,
            senderId: this.clientId
          })
        });
      } catch (e) {
        // Transient network error on mobile or desktop
      }
    }
    return true;
  }

  // Full Software Refresh: calls /api/db/refresh, syncs WhatsApp group, fetches full authoritative state, updates local cache, and notifies all listeners
  public async softwareRefresh(activeDate?: string): Promise<{ success: boolean; refreshedAt: string; db?: any }> {
    try {
      // 1. Try dedicated refresh endpoint on server
      const res = await fetch(`/api/db/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeDate,
          senderId: this.clientId
        })
      });

      if (res.ok) {
        const json = await res.json();
        if (json && json.db) {
          let localFallback = this.cache;
          const { merged } = this.mergeDatabases(localFallback || {}, json.db);
          this.cache = merged;
          if (activeDate) {
            this.setValueLocal('config/appConfig/activeOperationalDate', activeDate);
          }
          this.dbVersion = Math.max(json.version || 1, this.dbVersion);
          this.saveToLocalStorage();
          this.notifyAllListeners();
          this.setConnected(true);
          return { success: true, refreshedAt: json.refreshedAt || new Date().toISOString(), db: this.cache };
        }
      }
    } catch (e) {
      console.warn('Dedicated /api/db/refresh failed, falling back:', e);
    }

    // Fallback: sync WhatsApp then fetch database directly
    try {
      await fetch('/api/whatsapp/sync-now', { method: 'POST' }).catch(() => {});
      await this.fetchFullDatabase();
      this.checkServerVersion();
      if (activeDate) {
        this.setValueLocal('config/appConfig/activeOperationalDate', activeDate);
        this.notifyPathListeners('config/appConfig');
      }
      return { success: true, refreshedAt: new Date().toISOString(), db: this.cache };
    } catch (fallbackErr: any) {
      this.notifyAllListeners();
      return { success: false, refreshedAt: new Date().toISOString() };
    }
  }

  public getValue(path: string) {
    const norm = this.normalizePath(path);
    if (!norm) return this.cloneValue(this.cache);

    if (norm === 'data/maintenanceTickets') {
      const rawMaint = this.cache?.data?.maintenanceTickets;
      if (!rawMaint || typeof rawMaint !== 'object') return {};
      const cleanMaint: Record<string, Record<string, any>> = {};
      for (const [dKey, dayMap] of Object.entries(rawMaint as Record<string, any>)) {
        if (!dayMap || typeof dayMap !== 'object') continue;
        const cleanDay: Record<string, any> = {};
        for (const [tKey, tVal] of Object.entries(dayMap)) {
          const tObj = tVal as any;
          if (!tObj) continue;
          if (this.isTicketDeleted(tKey, tObj.whatsappMessageId, tObj.rideId, tObj.problem) ||
              this.isTicketDeleted(tObj.id, tObj.whatsappMessageId, tObj.rideId, tObj.problem) ||
              tObj.status === 'deleted') {
            continue;
          }
          cleanDay[tKey] = tObj;
        }
        if (Object.keys(cleanDay).length > 0) {
          cleanMaint[dKey] = cleanDay;
        }
      }
      return this.cloneValue(cleanMaint);
    }

    const parts = norm.split('/').filter(Boolean);
    let current = this.cache;
    for (const part of parts) {
      if (current === undefined || current === null) return undefined;
      current = current[part];
    }
    return this.cloneValue(current);
  }

  private setValueLocal(path: string, value: any, isExplicitReopen: boolean = false) {
    const norm = this.normalizePath(path);
    const parts = norm.split('/').filter(Boolean);
    if (parts.length === 0) {
      this.cache = value || {};
      return;
    }
    if (!this.cache || typeof this.cache !== 'object') {
      this.cache = {};
    } else {
      this.cache = { ...this.cache };
    }
    let current = this.cache;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      } else {
        current[part] = Array.isArray(current[part]) ? [...current[part]] : { ...current[part] };
      }
      current = current[part];
    }
    const lastPart = parts[parts.length - 1];

    // Allow normal status transitions between 'reported', 'in-progress', and 'solved'
    if (parts.length >= 3 && parts[0] === 'data' && parts[1] === 'maintenanceTickets') {
      if (lastPart === 'status' && !value) {
        return;
      }
    }

    if (value === null || value === undefined) {
      delete current[lastPart];
    } else {
      current[lastPart] = value;
    }
  }

  // 1. Optimistic set with cloud persistence & multi-device sync
  public async set(path: string, value: any) {
    const norm = this.normalizePath(path);
    const filtered = filterSecretWrite(pathSegments(norm), value);
    if (filtered.skip) {
      console.warn(`Not saved: ${norm} holds passwords, which are changed through the server only.`);
      return;
    }
    value = filtered.value;
    this.lastLocalEditTime = Date.now();
    this.setValueLocal(norm, value);
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyPathListeners(norm);

    // Instant 0ms broadcast to all other open tabs in the same browser
    try {
      this.broadcastChannel?.postMessage({
        type: 'set',
        path: norm,
        value,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    // Configuration/admin edits are pushed immediately to Firestore cloud with 0ms debounce
    const isConfigEdit = norm.startsWith('config');
    this.pushToFirestoreClient(isConfigEdit);

    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: norm, value, senderId: this.clientId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 403) {
          this.fetchFullDatabase();
        } else if (res.status === 404) {
          this.isServerApiAvailable = false;
        }
      } catch (e) {
        this.enqueueOfflineMutation({ type: 'set', path: norm, value });
      }
    }
    this.updateConnectionState();
  }

  // 2. Atomic increment with optimistic update (concurrency safe & multi-device sync)
  // Protected with a micro burst-accumulator to combine rapid successive clicks (e.g. +1 multiple times)
  // into consolidated atomic requests while updating the local UI with 0ms perceived lag.
  public async increment(path: string, delta: number = 1, min: number = 0) {
    const norm = this.normalizePath(path);
    if (filterSecretWrite(pathSegments(norm), 0).skip) return;
    this.lastLocalEditTime = Date.now();
    this.clientOpsCounter++;
    const currentVal = Number(this.getValue(norm)) || 0;
    const newVal = Math.max(min, currentVal + delta);
    
    // Optimistic local update (instant 0ms feedback)
    this.setValueLocal(norm, newVal);
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyPathListeners(norm);

    // Instant 0ms broadcast to all other open tabs in the same browser
    try {
      this.broadcastChannel?.postMessage({
        type: 'increment',
        path: norm,
        value: newVal,
        delta,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    this.pushToFirestoreClient(false);

    // Micro burst accumulator: merge rapid clicks within 80ms into a single network delta
    const existing = this.pendingPathIncrements.get(norm);
    if (existing) {
      existing.accumulatedDelta += delta;
    } else {
      const timer = setTimeout(() => {
        const item = this.pendingPathIncrements.get(norm);
        this.pendingPathIncrements.delete(norm);
        if (item && item.accumulatedDelta !== 0) {
          this.dispatchPathIncrement(norm, item.accumulatedDelta, item.min);
        }
      }, 80);
      this.pendingPathIncrements.set(norm, { path: norm, accumulatedDelta: delta, min, timer });
    }
  }

  private async dispatchPathIncrement(path: string, delta: number, min: number = 0) {
    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/increment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, delta, min, senderId: this.clientId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 404) {
          this.isServerApiAvailable = false;
        }
      } catch (e) {
        this.enqueueOfflineMutation({ type: 'increment', path, delta, min });
      }
    } else {
      this.enqueueOfflineMutation({ type: 'increment', path, delta, min });
    }
    this.updateConnectionState();
  }

  // 2b. High-concurrency Ride Guest Count Increment (Package / Ticket / Total)
  // Dedicated atomic multi-counter handler: increments category, updates total sum,
  // prevents race conditions, and bursts rapid taps smoothly.
  public async incrementRideCount(
    date: string,
    rideId: number | string,
    category: 'package' | 'ticket' | 'total',
    delta: number = 1
  ) {
    const d = String(date);
    const rId = String(rideId);
    const numDelta = Number(delta) || 0;
    this.lastLocalEditTime = Date.now();
    this.clientOpsCounter++;

    const pkgPath = `data/dailyPackageCounts/${d}/${rId}`;
    const tktPath = `data/dailyTicketCounts/${d}/${rId}`;
    const totalPath = `data/dailyCounts/${d}/${rId}`;

    const curPkg = Number(this.getValue(pkgPath)) || 0;
    const curTkt = Number(this.getValue(tktPath)) || 0;
    const curTotal = Number(this.getValue(totalPath)) || 0;

    let basePkg = curPkg;
    let baseTkt = curTkt;
    if (basePkg === 0 && baseTkt === 0 && curTotal > 0) {
      basePkg = curTotal;
    }

    let newPkg = basePkg;
    let newTkt = baseTkt;
    if (category === 'package') {
      newPkg = Math.max(0, basePkg + numDelta);
    } else if (category === 'ticket') {
      newTkt = Math.max(0, baseTkt + numDelta);
    } else {
      newPkg = Math.max(0, basePkg + numDelta);
    }
    const newTotal = newPkg + newTkt;

    // Immediate 0ms local optimistic UI update
    this.setValueLocal(pkgPath, newPkg);
    this.setValueLocal(tktPath, newTkt);
    this.setValueLocal(totalPath, newTotal);
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();

    this.notifyPathListeners(`data/dailyPackageCounts/${d}`);
    this.notifyPathListeners(`data/dailyTicketCounts/${d}`);
    this.notifyPathListeners(`data/dailyCounts/${d}`);
    this.notifyPathListeners(`data/dailyPackageCounts`);
    this.notifyPathListeners(`data/dailyTicketCounts`);
    this.notifyPathListeners(`data/dailyCounts`);

    // Instant 0ms broadcast to other browser tabs
    try {
      this.broadcastChannel?.postMessage({
        type: 'ride-count-increment',
        date: d,
        rideId: Number(rideId),
        category,
        delta: numDelta,
        newPkg,
        newTkt,
        newTotal,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    // Micro burst accumulator: merge rapid clicks within 80ms into a single network delta
    const key = `${d}:${rId}:${category}`;
    const existing = this.pendingRideIncrements.get(key);
    if (existing) {
      existing.accumulatedDelta += numDelta;
    } else {
      const timer = setTimeout(() => {
        const item = this.pendingRideIncrements.get(key);
        this.pendingRideIncrements.delete(key);
        if (item && item.accumulatedDelta !== 0) {
          this.dispatchRideIncrement(item.date, item.rideId, item.category, item.accumulatedDelta);
        }
      }, 80);
      this.pendingRideIncrements.set(key, {
        date: d,
        rideId: Number(rideId),
        category,
        accumulatedDelta: numDelta,
        timer
      });
    }
  }

  private async dispatchRideIncrement(
    date: string,
    rideId: number | string,
    category: 'package' | 'ticket' | 'total',
    delta: number
  ) {
    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/increment-ride-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date,
            rideId: Number(rideId),
            category,
            delta,
            senderId: this.clientId
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 404) {
          this.isServerApiAvailable = false;
        }
      } catch (e) {
        this.enqueueOfflineMutation({
          type: 'increment-ride-count',
          date: String(date),
          rideId: Number(rideId),
          category,
          delta
        });
      }
    } else {
      this.enqueueOfflineMutation({
        type: 'increment-ride-count',
        date: String(date),
        rideId: Number(rideId),
        category,
        delta
      });
    }
    this.updateConnectionState();
  }

  // 2c. Atomic Set Ride Count (Package / Ticket)
  public async setRideCount(
    date: string,
    rideId: number | string,
    category: 'package' | 'ticket',
    newCount: number
  ) {
    const d = String(date);
    const rId = String(rideId);
    const countVal = Math.max(0, Number(newCount) || 0);
    this.lastLocalEditTime = Date.now();
    this.clientOpsCounter++;

    const pkgPath = `data/dailyPackageCounts/${d}/${rId}`;
    const tktPath = `data/dailyTicketCounts/${d}/${rId}`;
    const totalPath = `data/dailyCounts/${d}/${rId}`;

    const curPkg = Number(this.getValue(pkgPath)) || 0;
    const curTkt = Number(this.getValue(tktPath)) || 0;
    const curTotal = Number(this.getValue(totalPath)) || 0;

    let basePkg = curPkg;
    let baseTkt = curTkt;
    if (basePkg === 0 && baseTkt === 0 && curTotal > 0) basePkg = curTotal;

    let newPkg = basePkg;
    let newTkt = baseTkt;
    if (category === 'package') newPkg = countVal;
    else if (category === 'ticket') newTkt = countVal;
    const newTotal = newPkg + newTkt;

    this.setValueLocal(pkgPath, newPkg);
    this.setValueLocal(tktPath, newTkt);
    this.setValueLocal(totalPath, newTotal);
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();

    this.notifyPathListeners(`data/dailyPackageCounts/${d}`);
    this.notifyPathListeners(`data/dailyTicketCounts/${d}`);
    this.notifyPathListeners(`data/dailyCounts/${d}`);
    this.notifyPathListeners(`data/dailyPackageCounts`);
    this.notifyPathListeners(`data/dailyTicketCounts`);
    this.notifyPathListeners(`data/dailyCounts`);

    try {
      this.broadcastChannel?.postMessage({
        type: 'ride-count-set',
        date: d,
        rideId: Number(rideId),
        category,
        newPkg,
        newTkt,
        newTotal,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/set-ride-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: d,
            rideId: Number(rideId),
            category,
            newCount: countVal,
            senderId: this.clientId
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 404) {
          this.isServerApiAvailable = false;
        }
      } catch (e) {
        this.enqueueOfflineMutation({
          type: 'set-ride-count',
          date: d,
          rideId: Number(rideId),
          category,
          value: countVal
        });
      }
    } else {
      this.enqueueOfflineMutation({
        type: 'set-ride-count',
        date: d,
        rideId: Number(rideId),
        category,
        value: countVal
      });
    }
    this.updateConnectionState();
  }

  // Peak metrics monitor for client
  public getPeakMetrics() {
    return {
      version: this.dbVersion,
      offlineQueueLength: this.offlineQueue.length,
      isConnected: this.isConnected,
      isSseConnected: this.isSseConnected,
      pendingRideBursts: this.pendingRideIncrements.size,
      pendingPathBursts: this.pendingPathIncrements.size,
      lastLocalEditTime: this.lastLocalEditTime
    };
  }

  // 3. Optimistic batch update & multi-device sync
  public async update(updates: Record<string, any>, basePath: string = '') {
    const normBase = this.normalizePath(basePath);
    this.lastLocalEditTime = Date.now();
    const formattedUpdates: Record<string, any> = {};
    const isExplicitReopen = Boolean(updates.isExplicitReopen);

    for (const [key, value] of Object.entries(updates)) {
      let fullPath = key;
      if (!key.startsWith('data/') && !key.startsWith('config/')) {
        fullPath = normBase ? `${normBase}/${key}` : key;
      }
      fullPath = this.normalizePath(fullPath);
      const filtered = filterSecretWrite(pathSegments(fullPath), value);
      if (filtered.skip) {
        console.warn(`Not saved: ${fullPath} holds passwords, which are changed through the server only.`);
        continue;
      }
      formattedUpdates[fullPath] = filtered.value;
      this.setValueLocal(fullPath, filtered.value, isExplicitReopen);
    }
    if (Object.keys(formattedUpdates).length === 0) return;

    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    Object.keys(formattedUpdates).forEach(p => this.notifyPathListeners(p));

    // Instant 0ms broadcast to all tabs
    try {
      this.broadcastChannel?.postMessage({
        type: 'update',
        updates: formattedUpdates,
        basePath: normBase,
        senderId: this.clientId,
        version: this.dbVersion,
        isExplicitReopen
      });
    } catch (e) {}

    const isConfigEdit = normBase.startsWith('config') || Object.keys(formattedUpdates).some(k => k.startsWith('config'));
    this.pushToFirestoreClient(isConfigEdit);

    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates: formattedUpdates, basePath: normBase, senderId: this.clientId, isExplicitReopen })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 403) {
          this.fetchFullDatabase();
        } else if (res.status === 404) {
          this.isServerApiAvailable = false;
        }
      } catch (e) {
        this.enqueueOfflineMutation({ type: 'update', updates: formattedUpdates, basePath: normBase });
      }
    }
    this.updateConnectionState();
  }

  // 4. Optimistic remove & multi-device sync
  public async remove(path: string) {
    const norm = this.normalizePath(path);
    if (norm.startsWith('data/maintenanceTickets')) {
      const parts = norm.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const targetDate = parts[2];
        const targetId = parts[3];
        return this.deleteMaintenanceTicket(targetId, targetDate);
      }
    }
    if (filterSecretWrite(pathSegments(norm), null).skip) {
      console.warn(`Not removed: ${norm} holds passwords, which are changed through the server only.`);
      return;
    }
    this.lastLocalEditTime = Date.now();
    this.setValueLocal(norm, null);
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyPathListeners(norm);

    // Instant 0ms broadcast to all tabs
    try {
      this.broadcastChannel?.postMessage({
        type: 'remove',
        path: norm,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    const isConfigEdit = norm.startsWith('config');
    this.pushToFirestoreClient(isConfigEdit);

    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/remove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: norm, senderId: this.clientId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 403) {
          this.fetchFullDatabase();
        } else if (res.status === 404) {
          this.isServerApiAvailable = false;
        }
      } catch (e) {
        this.enqueueOfflineMutation({ type: 'remove', path: norm });
      }
    }
    this.updateConnectionState();
  }

  // 4b. Dedicated Maintenance Ticket Deletion with cross-date duplicate purging and anti-resurrection
  public async deleteMaintenanceTicket(ticketOrId: any, dateHint?: string) {
    this.lastLocalEditTime = Date.now();
    const ticketId = typeof ticketOrId === 'string' ? ticketOrId : ticketOrId?.id;
    const whatsappMsgId = typeof ticketOrId === 'object' ? ticketOrId?.whatsappMessageId : undefined;
    const rideId = typeof ticketOrId === 'object' ? ticketOrId?.rideId : undefined;
    const problem = typeof ticketOrId === 'object' ? ticketOrId?.problem : undefined;
    const date = (typeof ticketOrId === 'object' ? ticketOrId?.date : dateHint) || '';

    if (!this.cache.config) this.cache.config = {} as any;
    if (!Array.isArray(this.cache.config.deletedTicketIds)) this.cache.config.deletedTicketIds = [];
    if (!Array.isArray(this.cache.config.deletedWhatsAppMessageIds)) this.cache.config.deletedWhatsAppMessageIds = [];
    if (!Array.isArray(this.cache.config.deletedTicketSignatures)) this.cache.config.deletedTicketSignatures = [];

    const idsBefore = new Set<string>(this.cache.config.deletedTicketIds);
    const msgIdsBefore = new Set<string>(this.cache.config.deletedWhatsAppMessageIds);
    if (ticketId && !this.cache.config.deletedTicketIds.includes(ticketId)) {
      this.cache.config.deletedTicketIds.push(ticketId);
    }
    if (whatsappMsgId && !this.cache.config.deletedWhatsAppMessageIds.includes(whatsappMsgId)) {
      this.cache.config.deletedWhatsAppMessageIds.push(whatsappMsgId);
    }

    const deletedIds: string[] = ticketId ? [ticketId] : [];

    // Purge locally from all dates immediately
    if (this.cache.data?.maintenanceTickets && typeof this.cache.data.maintenanceTickets === 'object') {
      const maint = this.cache.data.maintenanceTickets;
      for (const dKey of Object.keys(maint)) {
        if (!maint[dKey] || typeof maint[dKey] !== 'object') continue;
        for (const [tKey, tObjRaw] of Object.entries(maint[dKey])) {
          const tObj = tObjRaw as any;
          if (!tObj) continue;

          const isSameId = Boolean(ticketId && (tKey === ticketId || tObj.id === ticketId));
          const isSameMsg = Boolean(whatsappMsgId && tObj.whatsappMessageId && tObj.whatsappMessageId === whatsappMsgId);

          if (isSameId || isSameMsg) {
            if (tObj.id && !this.cache.config.deletedTicketIds.includes(tObj.id)) {
              this.cache.config.deletedTicketIds.push(tObj.id);
              deletedIds.push(tObj.id);
            }
            if (tKey && !this.cache.config.deletedTicketIds.includes(tKey)) {
              this.cache.config.deletedTicketIds.push(tKey);
              deletedIds.push(tKey);
            }
            if (tObj.whatsappMessageId && !this.cache.config.deletedWhatsAppMessageIds.includes(tObj.whatsappMessageId)) {
              this.cache.config.deletedWhatsAppMessageIds.push(tObj.whatsappMessageId);
            }
            delete maint[dKey][tKey];
          }
        }
        if (Object.keys(maint[dKey]).length === 0) {
          delete maint[dKey];
        }
      }
    }

    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyPathListeners('data/maintenanceTickets');
    this.notifyPathListeners('config');
    this.notifyAllListeners();

    // Multi-tab broadcast
    try {
      this.broadcastChannel?.postMessage({
        type: 'delete-ticket',
        ticketId,
        whatsappMessageId: whatsappMsgId,
        rideId,
        problem,
        date,
        deletedIds,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    // Server API call
    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/delete-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticketId,
            whatsappMessageId: whatsappMsgId,
            rideId,
            problem,
            date,
            senderId: this.clientId
          })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 403) {
          this.undoLocalDeletions(idsBefore, msgIdsBefore);
        }
      } catch (e) {
        this.enqueueOfflineMutation({
          type: 'delete-ticket',
          ticketId,
          whatsappMessageId: whatsappMsgId,
          date
        });
      }
    }
  }

  // 4c. Clear all reported maintenance tickets for a given date
  public async clearReportedTickets(date: string) {
    this.lastLocalEditTime = Date.now();
    if (!this.cache.config) this.cache.config = {} as any;
    if (!Array.isArray(this.cache.config.deletedTicketIds)) this.cache.config.deletedTicketIds = [];
    if (!Array.isArray(this.cache.config.deletedWhatsAppMessageIds)) this.cache.config.deletedWhatsAppMessageIds = [];
    const idsBefore = new Set<string>(this.cache.config.deletedTicketIds);
    const msgIdsBefore = new Set<string>(this.cache.config.deletedWhatsAppMessageIds);

    if (this.cache.data?.maintenanceTickets && typeof this.cache.data.maintenanceTickets === 'object') {
      const maint = this.cache.data.maintenanceTickets;
      for (const dKey of Object.keys(maint)) {
        if (!maint[dKey] || typeof maint[dKey] !== 'object') continue;
        for (const [tKey, tObjRaw] of Object.entries(maint[dKey])) {
          const tObj = tObjRaw as any;
          if (tObj && tObj.status === 'reported') {
            const isMatchDate = dKey === date || tObj.date === date || (tObj.reportedAt && tObj.reportedAt.startsWith(date));
            if (isMatchDate) {
              if (tObj.id && !this.cache.config.deletedTicketIds.includes(tObj.id)) {
                this.cache.config.deletedTicketIds.push(tObj.id);
              }
              if (tObj.whatsappMessageId && !this.cache.config.deletedWhatsAppMessageIds.includes(tObj.whatsappMessageId)) {
                this.cache.config.deletedWhatsAppMessageIds.push(tObj.whatsappMessageId);
              }
              delete maint[dKey][tKey];
            }
          }
        }
        if (Object.keys(maint[dKey]).length === 0) {
          delete maint[dKey];
        }
      }
    }

    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyPathListeners('data/maintenanceTickets');
    this.notifyPathListeners('config');
    this.notifyAllListeners();

    try {
      this.broadcastChannel?.postMessage({
        type: 'clear-reported-tickets',
        date,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/clear-reported-tickets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date, senderId: this.clientId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.version) this.dbVersion = data.version;
          this.isSseConnected = true;
          this.updateConnectionState();
        } else if (res.status === 403) {
          this.undoLocalDeletions(idsBefore, msgIdsBefore);
        }
      } catch (e) {}
    }
  }

  // The server refused a deletion: forget the ids marked deleted here, then take the server's tickets back.
  private undoLocalDeletions(idsBefore: Set<string>, msgIdsBefore: Set<string>) {
    const cfg = this.cache?.config;
    if (cfg) {
      if (Array.isArray(cfg.deletedTicketIds)) cfg.deletedTicketIds = cfg.deletedTicketIds.filter((id: string) => idsBefore.has(id));
      if (Array.isArray(cfg.deletedWhatsAppMessageIds)) cfg.deletedWhatsAppMessageIds = cfg.deletedWhatsAppMessageIds.filter((id: string) => msgIdsBefore.has(id));
    }
    this.lastOwnWriteAt = 0;
    this.fetchFullDatabase();
  }

  // 5. Force persist full state directly to SQLite database
  public async forceCloudSync(): Promise<{ success: boolean; message: string }> {
    this.lastLocalEditTime = Date.now();
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    if (this.cache) {
      this.cache.version = this.dbVersion;
      this.cache.lastUpdated = new Date().toISOString();
    }
    this.saveToLocalStorage();
    this.notifyAllListeners();

    let sqliteSuccess = false;

    // Server API persistence to SQLite
    if (this.isServerApiAvailable) {
      try {
        const res = await fetch('/api/db/cloud-sync', { method: 'POST' });
        if (res.ok) {
          sqliteSuccess = true;
        }
      } catch (e) {
        // Transient network error
      }
    }

    return {
      success: true,
      message: sqliteSuccess
        ? 'Successfully saved and synced full database to local SQLite database!'
        : 'All changes saved locally & queued for SQLite sync.'
    };
  }

  // 6. Direct snapshot export
  public getFullDatabase() {
    return this.cloneValue(this.cache || { data: {}, config: {} });
  }

  // 7. Full database restore & instant cloud broadcast
  public async importDatabase(importedData: any): Promise<{ success: boolean; message?: string }> {
    if (!importedData || typeof importedData !== 'object') {
      return { success: false, message: 'Invalid database structure' };
    }
    const clean = this.cloneValue(importedData);
    this.cache = clean;
    this.lastLocalEditTime = Date.now();
    this.dbVersion = (this.dbVersion || 1) + 10;
    this.saveToLocalStorage();
    this.notifyAllListeners();
    await this.forceCloudSync();
    return { success: true };
  }

  // 8. Reset specific day operations & sync cloud
  public async resetDay(dateStr: string): Promise<{ success: boolean }> {
    if (!dateStr) return { success: false };
    // The server checks the role session first; nothing changes on this device if it refuses.
    if (!(await this.postOk('/api/db/reset-day', { date: dateStr, senderId: this.clientId }))) return { success: false };
    if (!this.cache) this.cache = { data: {}, config: {} };
    if (!this.cache.data) this.cache.data = {};

    if (this.cache.data.dailyCounts) delete this.cache.data.dailyCounts[dateStr];
    if (this.cache.data.ticketSalesData) delete this.cache.data.ticketSalesData[dateStr];
    if (this.cache.data.operatorAssignments) delete this.cache.data.operatorAssignments[dateStr];
    if (this.cache.data.ticketSalesAssignments) delete this.cache.data.ticketSalesAssignments[dateStr];
    if (this.cache.data.attendance) delete this.cache.data.attendance[dateStr];
    if (this.cache.data.packageSales) delete this.cache.data.packageSales[dateStr];
    if (this.cache.data.maintenanceTickets) delete this.cache.data.maintenanceTickets[dateStr];

    this.lastLocalEditTime = Date.now();
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyAllListeners();

    try {
      this.broadcastChannel?.postMessage({
        type: 'reset-day',
        date: dateStr,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    await this.forceCloudSync();
    return { success: true };
  }

  // 9. Clean data older than specific date (e.g. 3-month cutoff)
  public async cleanDataOlderThan(cutoffDateStr: string): Promise<{ success: boolean; deletedDatesCount: number; deletedDates: string[] }> {
    if (!cutoffDateStr) return { success: false, deletedDatesCount: 0, deletedDates: [] };
    if (!(await this.postOk('/api/db/clean-older-than', { cutoffDate: cutoffDateStr, senderId: this.clientId }))) {
      return { success: false, deletedDatesCount: 0, deletedDates: [] };
    }
    if (!this.cache) this.cache = { data: {}, config: {} };
    if (!this.cache.data) this.cache.data = {};

    const allDates = new Set<string>();
    const collections = ['dailyCounts', 'ticketSalesData', 'operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales', 'maintenanceTickets'];
    
    collections.forEach(col => {
      if (this.cache.data[col] && typeof this.cache.data[col] === 'object') {
        Object.keys(this.cache.data[col]).forEach(d => {
          if (d < cutoffDateStr) {
            allDates.add(d);
          }
        });
      }
    });

    const deletedDates = Array.from(allDates);
    deletedDates.forEach(dateStr => {
      collections.forEach(col => {
        if (this.cache.data[col]) {
          delete this.cache.data[col][dateStr];
        }
      });
    });

    this.lastLocalEditTime = Date.now();
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyAllListeners();

    try {
      this.broadcastChannel?.postMessage({
        type: 'clean-older-than',
        cutoffDate: cutoffDateStr,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    await this.forceCloudSync();
    return { success: true, deletedDatesCount: deletedDates.length, deletedDates };
  }

  // 10. Reset 3-Month cycle, archive elapsed operational data, and advance to next interval
  public async resetQuarterlyCycle(newCycleStartDate: string): Promise<{ success: boolean; message?: string }> {
    if (!(await this.postOk('/api/db/reset-cycle', { newCycleStartDate, senderId: this.clientId }))) return { success: false };
    if (!this.cache) this.cache = { data: {}, config: {} };
    if (!this.cache.data) this.cache.data = {};
    if (!this.cache.config) this.cache.config = {};
    if (!this.cache.config.appConfig) this.cache.config.appConfig = {};

    const collections = ['dailyCounts', 'ticketSalesData', 'operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales', 'maintenanceTickets'];
    
    // Purge operational date entries that belong to the past 3-month cycle
    collections.forEach(col => {
      if (this.cache.data[col] && typeof this.cache.data[col] === 'object') {
        Object.keys(this.cache.data[col]).forEach(dateStr => {
          if (newCycleStartDate && dateStr < newCycleStartDate) {
            delete this.cache.data[col][dateStr];
          }
        });
      }
    });

    // Calculate end date for the new 3-month interval (3 calendar months forward)
    const startDateObj = new Date(newCycleStartDate || new Date().toISOString().split('T')[0]);
    const endDateObj = new Date(startDateObj);
    endDateObj.setMonth(endDateObj.getMonth() + 3);
    const newCycleEndDate = endDateObj.toISOString().split('T')[0];

    this.cache.config.appConfig.cycleStartDate = newCycleStartDate;
    this.cache.config.appConfig.cycleEndDate = newCycleEndDate;
    this.cache.config.appConfig.cycleIntervalMonths = 3;
    this.cache.config.appConfig.lastCycleResetDate = new Date().toISOString();
    this.cache.config.appConfig.lastBackupDate = new Date().toISOString();

    this.lastLocalEditTime = Date.now();
    this.dbVersion = (this.dbVersion || 1) + 1;
    this.lastOwnWriteAt = Date.now();
    this.saveToLocalStorage();
    this.notifyAllListeners();

    try {
      this.broadcastChannel?.postMessage({
        type: 'reset-cycle',
        newCycleStartDate,
        senderId: this.clientId,
        version: this.dbVersion
      });
    } catch (e) {}

    await this.forceCloudSync();
    return { success: true, message: `Cycle successfully reset. Next 3-Month Interval: ${newCycleStartDate} to ${newCycleEndDate}.` };
  }

  private async postOk(url: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  // 11. Get cycle operational statistics
  public getCycleStats(cycleStartDate?: string, cycleIntervalMonths: number = 3) {
    const data = this.cache?.data || {};
    const appConfig = this.cache?.config?.appConfig || {};
    
    const allDates = new Set<string>();
    let totalCounts = 0;
    let totalSales = 0;
    let totalTickets = 0;

    if (data.dailyCounts) {
      Object.keys(data.dailyCounts).forEach(d => {
        allDates.add(d);
        const dayCounts = data.dailyCounts[d] || {};
        Object.values(dayCounts).forEach((c: any) => { totalCounts += Number(c) || 0; });
      });
    }

    if (data.ticketSalesData) {
      Object.keys(data.ticketSalesData).forEach(d => {
        allDates.add(d);
        const daySales = data.ticketSalesData[d] || {};
        Object.values(daySales).forEach((s: any) => { totalSales += Number(s) || 0; });
      });
    }

    if (data.maintenanceTickets) {
      Object.keys(data.maintenanceTickets).forEach(d => {
        allDates.add(d);
        totalTickets += Object.keys(data.maintenanceTickets[d] || {}).length;
      });
    }

    ['operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales'].forEach(col => {
      if (data[col]) Object.keys(data[col]).forEach(d => allDates.add(d));
    });

    const sortedDates = Array.from(allDates).sort();
    const todayStr = new Date().toISOString().split('T')[0];
    const oldestDate = sortedDates[0] || todayStr;
    const newestDate = sortedDates[sortedDates.length - 1] || todayStr;

    const activeCycleStart = cycleStartDate || appConfig.cycleStartDate || oldestDate;
    const startObj = new Date(activeCycleStart);
    const endObj = new Date(startObj);
    endObj.setMonth(endObj.getMonth() + (appConfig.cycleIntervalMonths || cycleIntervalMonths));
    const activeCycleEnd = appConfig.cycleEndDate || endObj.toISOString().split('T')[0];

    const now = new Date();
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysElapsed = Math.max(0, Math.floor((now.getTime() - startObj.getTime()) / msPerDay));
    const totalCycleDays = Math.max(1, Math.floor((endObj.getTime() - startObj.getTime()) / msPerDay));
    const daysRemaining = Math.max(0, Math.ceil((endObj.getTime() - now.getTime()) / msPerDay));
    const isDue = daysElapsed >= totalCycleDays || daysRemaining === 0;

    return {
      cycleStartDate: activeCycleStart,
      cycleEndDate: activeCycleEnd,
      cycleIntervalMonths: appConfig.cycleIntervalMonths || cycleIntervalMonths,
      daysElapsed,
      daysRemaining,
      totalCycleDays,
      isDue,
      operatingDaysCount: sortedDates.length,
      oldestDate,
      newestDate,
      totalCounts,
      totalSales,
      totalTickets,
      lastBackupDate: appConfig.lastBackupDate,
      lastCycleResetDate: appConfig.lastCycleResetDate
    };
  }
}

// Global Engine Instance
const engine = new ServerDatabaseEngine();

class DatabaseReference {
  private path: string;
  private unsubscribeConnected?: () => void;

  constructor(path: string) {
    this.path = path;
  }

  on(eventType: string, callback: ValueCallback, errorCallback?: (error: any) => void) {
    if (this.path === '.info/connected') {
      const unsubscribe = engine.onConnectionChange((connected) => {
        callback({ val: () => connected });
      });
      this.unsubscribeConnected = unsubscribe;
      return unsubscribe;
    }

    engine.subscribe(this.path, callback);
    return callback;
  }

  off(eventType?: string, callback?: ValueCallback) {
    if (this.path === '.info/connected') {
      if (this.unsubscribeConnected) {
        this.unsubscribeConnected();
        this.unsubscribeConnected = undefined;
      }
      return;
    }
    engine.unsubscribe(this.path, callback);
  }

  async set(data: any) {
    return engine.set(this.path, data);
  }

  async increment(delta: number = 1, min: number = 0) {
    return engine.increment(this.path, delta, min);
  }

  async update(updates: Record<string, any>) {
    return engine.update(updates, this.path);
  }

  async remove() {
    if (this.path.startsWith('data/maintenanceTickets')) {
      const parts = this.path.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const targetDate = parts[2];
        const targetId = parts[3];
        return engine.deleteMaintenanceTicket(targetId, targetDate);
      }
    }
    return engine.remove(this.path);
  }

  async once(eventType: string, callback?: (snapshot: { val: () => any }) => void) {
    const value = engine.getValue(this.path);
    const snap = { val: () => value };
    if (callback) {
      callback(snap);
    }
    return snap;
  }
}

export const database = {
  ref: (path: string = '') => new DatabaseReference(path),
  incrementRideCount: (date: string, rideId: number | string, category: 'package' | 'ticket' | 'total', delta: number) =>
    engine.incrementRideCount(date, rideId, category, delta),
  setRideCount: (date: string, rideId: number | string, category: 'package' | 'ticket', newCount: number) =>
    engine.setRideCount(date, rideId, category, newCount),
  getPeakMetrics: () => engine.getPeakMetrics(),
  softwareRefresh: (activeDate?: string) => engine.softwareRefresh(activeDate),
  syncViewEverywhere: (
    activeDate?: string, 
    activeView?: string, 
    extraParams?: { portalType?: string; statusTab?: string; viewScope?: string; sharedBy?: string }
  ) => engine.syncViewEverywhere(activeDate, activeView, extraParams),
  forceCloudSync: () => engine.forceCloudSync(),
  getFullDatabase: () => engine.getFullDatabase(),
  importDatabase: (data: any) => engine.importDatabase(data),
  resetDay: (dateStr: string) => engine.resetDay(dateStr),
  cleanDataOlderThan: (cutoffDateStr: string) => engine.cleanDataOlderThan(cutoffDateStr),
  resetQuarterlyCycle: (newCycleStartDate: string) => engine.resetQuarterlyCycle(newCycleStartDate),
  getCycleStats: (cycleStartDate?: string, cycleIntervalMonths?: number) => engine.getCycleStats(cycleStartDate, cycleIntervalMonths),
  deleteMaintenanceTicket: (ticketOrId: any, dateHint?: string) => engine.deleteMaintenanceTicket(ticketOrId, dateHint),
  clearReportedTickets: (dateStr: string) => engine.clearReportedTickets(dateStr),
  isTicketDeleted: (ticketId?: string, whatsappMessageId?: string, rideId?: number, problem?: string) => engine.isTicketDeleted(ticketId, whatsappMessageId, rideId, problem),
  engine
};
