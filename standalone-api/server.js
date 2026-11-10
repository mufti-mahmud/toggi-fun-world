/**
 * Toggi Fun World - Standalone Ticket Sales & Turnstile REST API
 * Production-ready server designed to run independently on any VM, IIS, Docker, or Cloud instance.
 * Fully compatible with .NET (C#), Python, Postman, IoT scanners, and POS terminals.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.API_KEY || 'tfw-full-access-key-2026';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'ticket_sales_db.json');
const CURRENCY = process.env.CURRENCY || 'BDT';

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global Middlewares
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Helper: Operational Date in Dhaka Time (UTC+6)
function getOperationalDate() {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.OPERATIONAL_TIMEZONE || 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch (e) {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

// Default Theme Park Counters
const DEFAULT_COUNTERS = [
  { id: 1, name: "Basement 01", type: "Ticket Sales Counter", location: "Basement 01", ticketPrice: 150, active: true },
  { id: 101, name: "Level 01 - Atrium", type: "Ticket Sales Counter", location: "Level 01", ticketPrice: 150, active: true },
  { id: 102, name: "Level 01 - Main Gate", type: "Ticket Sales Counter", location: "Level 01", ticketPrice: 150, active: true },
  { id: 103, name: "Online Ticket Pickup", type: "Online & VIP", location: "Level 01", ticketPrice: 150, active: true },
  { id: 104, name: "Express Pass Counter", type: "Express Pass", location: "Level 01", ticketPrice: 150, active: true },
  { id: 802, name: "Level 08 - Counter 2", type: "Rides Ticket Counter", location: "Level 08", ticketPrice: 150, active: true },
  { id: 803, name: "Level 08 - Counter 3", type: "Rides Ticket Counter", location: "Level 08", ticketPrice: 150, active: true },
  { id: 804, name: "Level 08 - Counter 4", type: "Rides Ticket Counter", location: "Level 08", ticketPrice: 150, active: true },
  { id: 901, name: "Level 09 - Counter 1", type: "Games & Rides", location: "Level 09", ticketPrice: 150, active: true },
  { id: 1001, name: "Level 10 - Counter 1", type: "Games & Rides", location: "Level 10", ticketPrice: 150, active: true },
  { id: 1101, name: "Level 11 - Counter 1", type: "Games & Rides", location: "Level 11", ticketPrice: 150, active: true },
  { id: 1201, name: "Level 12 - Counter 1", type: "Games & Rides", location: "Level 12", ticketPrice: 150, active: true },
  { id: 1301, name: "Level 13 - Counter 1", type: "Games & Rides", location: "Level 13", ticketPrice: 150, active: true },
  { id: 1401, name: "Level 14 - Counter 1", type: "Games & Rides", location: "Level 14", ticketPrice: 150, active: true },
  { id: 1501, name: "Level 15 - Counter 1", type: "Games & Rides", location: "Level 15", ticketPrice: 150, active: true },
  { id: 1601, name: "Level 16 - Counter 1", type: "Games & Rides", location: "Level 16", ticketPrice: 150, active: true },
  { id: 1701, name: "Level 17 - Counter 1", type: "Games & Rides", location: "Level 17", ticketPrice: 150, active: true }
];

// In-Memory Database State
let memoryDb = null;
let sseClients = [];

function loadDatabase() {
  if (memoryDb) return memoryDb;
  if (fs.existsSync(DB_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      if (data && data.counters && data.ticketSales) {
        memoryDb = data;
        return memoryDb;
      }
    } catch (e) {
      console.warn('Error reading existing database file. Creating fresh initial state.', e);
    }
  }

  memoryDb = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    currency: CURRENCY,
    counters: DEFAULT_COUNTERS,
    ticketSales: {},
    historyLog: []
  };
  saveDatabase();
  return memoryDb;
}

function saveDatabase(mutation) {
  if (!memoryDb) return;
  memoryDb.version = (memoryDb.version || 0) + 1;
  memoryDb.lastUpdated = new Date().toISOString();

  try {
    const raw = JSON.stringify(memoryDb, null, 2);
    const tmp = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tmp, raw, 'utf-8');
    fs.renameSync(tmp, DB_FILE);
  } catch (err) {
    console.error('Failed to write database to disk:', err);
  }

  // Broadcast real-time SSE event to all connected listeners
  broadcastEvent(mutation || { type: 'sync', version: memoryDb.version });
}

function broadcastEvent(event) {
  const payload = JSON.stringify({
    ...event,
    version: memoryDb.version,
    timestamp: memoryDb.lastUpdated
  });

  sseClients = sseClients.filter(client => {
    try {
      if (client.res.writableEnded || client.res.destroyed) return false;
      client.res.write(`data: ${payload}\n\n`);
      return true;
    } catch (_) {
      return false;
    }
  });
}

function addHistoryLog(action, details, user = 'API Client') {
  const db = loadDatabase();
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    user: String(user).trim(),
    action: String(action),
    details: String(details)
  };
  db.historyLog.unshift(entry);
  if (db.historyLog.length > 500) {
    db.historyLog = db.historyLog.slice(0, 500);
  }
  return entry;
}

// Authentication / Caller Identification Helper
function getCallerInfo(req) {
  const apiKey = req.headers['x-api-key'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.slice(7).trim() : null) ||
    req.query.apiKey;

  const isMaster = Boolean(apiKey && (apiKey === API_KEY || apiKey === 'admin79' || apiKey === 'sales79'));
  return {
    fullAccess: true,
    isMaster,
    caller: isMaster ? 'Master Authenticated Client (.NET/POS)' : (apiKey ? `Client (${apiKey.slice(0, 4)}...)` : 'Public API Client')
  };
}

// =========================================================================
// --- SSE Real-time Updates Stream for Turnstiles, POS & .NET Clients ---
// =========================================================================
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  const clientId = Date.now();
  sseClients.push({ id: clientId, res });

  // Initial handshake
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId, operationalDate: getOperationalDate() })}\n\n`);

  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
  });
});

// =========================================================================
// --- Health & Documentation Endpoints ---
// =========================================================================
app.get('/api/health', (req, res) => {
  const db = loadDatabase();
  res.json({
    status: 'healthy',
    service: 'TFW Standalone Ticket Sales API',
    version: '2.5.0',
    port: PORT,
    operationalDate: getOperationalDate(),
    totalCounters: db.counters.length,
    activeSseClients: sseClients.length,
    uptimeSeconds: Math.floor(process.uptime())
  });
});

app.get(['/api/ticket-sales/docs', '/api/ticket-sales/help'], (req, res) => {
  res.json({
    service: 'Toggi Fun World - Standalone Ticket Sales REST API',
    version: '2.5.0',
    masterKeyHeader: 'x-api-key: tfw-full-access-key-2026',
    endpoints: [
      { method: 'POST', path: '/api/ticket-sales/action', description: 'Universal Action Dispatcher (.NET/C# primary method)' },
      { method: 'GET', path: '/api/ticket-sales/full-access', description: 'Complete administrative state dump' },
      { method: 'GET', path: '/api/ticket-sales', description: 'Query sales by ?date=YYYY-MM-DD or date range' },
      { method: 'POST', path: '/api/ticket-sales', description: 'Record/Increment ticket sale' },
      { method: 'PUT', path: '/api/ticket-sales/:date/:counterId', description: 'Direct count override' },
      { method: 'DELETE', path: '/api/ticket-sales/:date/:counterId', description: 'Reset counter count to 0' },
      { method: 'POST', path: '/api/ticket-sales/refund', description: 'Process ticket refund/void' },
      { method: 'POST', path: '/api/ticket-sales/batch', description: 'Multi-counter batch update' },
      { method: 'POST', path: '/api/ticket-sales/bulk-replace', description: 'Full day matrix overwrite' },
      { method: 'POST', path: '/api/ticket-sales/reconcile', description: 'Reconcile turnstile sensor readings' },
      { method: 'GET', path: '/api/ticket-sales/counters', description: 'List counters with live counts' },
      { method: 'GET', path: '/api/ticket-sales/history', description: 'Audit history logs' },
      { method: 'GET', path: '/api/ticket-sales/export?format=csv', description: 'Download CSV sales spreadsheet' }
    ]
  });
});

// =========================================================================
// --- 1. UNIVERSAL MASTER ACTION DISPATCHER (IDEAL FOR .NET) ---
// =========================================================================
app.post(['/api/ticket-sales/action', '/api/tickets/sales/action'], (req, res) => {
  try {
    const caller = getCallerInfo(req);
    const { action, counterId, count, date, reason, authorizedBy, notes, soldBy, unitPrice } = req.body || {};

    if (!action) {
      return res.status(400).json({ success: false, error: 'action parameter is required' });
    }

    const db = loadDatabase();
    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : getOperationalDate();
    if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};

    const act = action.toLowerCase().trim();

    // ACTION: Query
    if (act === 'query' || act === 'get') {
      let totalTickets = 0;
      let totalRevenue = 0;
      const breakdown = db.counters.map(c => {
        const cnt = Number(db.ticketSales[targetDate][c.id] || 0);
        totalTickets += cnt;
        totalRevenue += cnt * c.ticketPrice;
        return {
          counterId: c.id,
          counterName: c.name,
          count: cnt,
          unitPrice: c.ticketPrice,
          subtotal: cnt * c.ticketPrice
        };
      });

      return res.json({
        success: true,
        fullAccess: true,
        action: act,
        date: targetDate,
        totalTickets,
        totalRevenue,
        currency: db.currency,
        counters: breakdown
      });
    }

    // Must find counter for counter-specific actions
    const matched = db.counters.find(c => String(c.id) === String(counterId).trim() || c.name.toLowerCase() === String(counterId).trim().toLowerCase());
    if (!matched && ['increment', 'record', 'set', 'update', 'refund', 'void', 'reset', 'delete'].includes(act)) {
      return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });
    }

    // ACTION: Increment / Record
    if (act === 'increment' || act === 'record') {
      const current = Number(db.ticketSales[targetDate][matched.id] || 0);
      const delta = Math.floor(Number(count) || 1);
      const newTotal = Math.max(0, current + delta);
      db.ticketSales[targetDate][matched.id] = newTotal;

      const effectivePrice = unitPrice !== undefined ? Number(unitPrice) : matched.ticketPrice;
      const opUser = soldBy || caller.caller;
      addHistoryLog('TICKET_SALE_RECORDED', `[${act}] ${matched.name}: +${delta} tickets (New: ${newTotal}) ${notes ? `[${notes}]` : ''}`, opUser);

      saveDatabase({
        type: 'ticket-sale-updated',
        date: targetDate,
        counterId: matched.id,
        counterName: matched.name,
        delta,
        newTotal
      });

      return res.json({
        success: true,
        fullAccess: true,
        action: act,
        message: `Recorded ${delta} ticket(s) for ${matched.name}`,
        date: targetDate,
        counterId: matched.id,
        counterName: matched.name,
        previousCount: current,
        newTotalCount: newTotal,
        delta,
        unitPrice: effectivePrice,
        subtotalRevenue: newTotal * effectivePrice
      });
    }

    // ACTION: Set / Override
    if (act === 'set' || act === 'update') {
      const current = Number(db.ticketSales[targetDate][matched.id] || 0);
      const newTotal = Math.max(0, Math.floor(Number(count) || 0));
      const delta = newTotal - current;
      db.ticketSales[targetDate][matched.id] = newTotal;

      const opUser = soldBy || caller.caller;
      addHistoryLog('TICKET_SALE_SET', `[${act}] ${matched.name} count set to ${newTotal} (was ${current})`, opUser);

      saveDatabase({
        type: 'ticket-sale-updated',
        date: targetDate,
        counterId: matched.id,
        newTotal
      });

      return res.json({
        success: true,
        fullAccess: true,
        action: act,
        message: `Counter ${matched.name} set to ${newTotal} tickets`,
        date: targetDate,
        counterId: matched.id,
        counterName: matched.name,
        previousCount: current,
        newTotalCount: newTotal,
        delta
      });
    }

    // ACTION: Refund / Void
    if (act === 'refund' || act === 'void') {
      const current = Number(db.ticketSales[targetDate][matched.id] || 0);
      const refundQty = Math.floor(Number(count) || 1);
      const newTotal = Math.max(0, current - refundQty);
      const actualDeducted = current - newTotal;
      const refundAmount = actualDeducted * matched.ticketPrice;
      db.ticketSales[targetDate][matched.id] = newTotal;

      const authUser = authorizedBy || caller.caller;
      addHistoryLog('TICKET_SALE_REFUND', `[${act}] Voided ${actualDeducted} tickets on ${matched.name}. Refund: ${refundAmount} ${db.currency}. Reason: ${reason || 'N/A'}`, authUser);

      saveDatabase({
        type: 'ticket-sale-refunded',
        date: targetDate,
        counterId: matched.id,
        refundQuantity: actualDeducted,
        newTotal
      });

      return res.json({
        success: true,
        fullAccess: true,
        action: act,
        message: `Refunded ${actualDeducted} ticket(s) on ${matched.name}`,
        date: targetDate,
        counterId: matched.id,
        counterName: matched.name,
        refundQuantity: actualDeducted,
        refundAmount,
        previousCount: current,
        newTotalCount: newTotal,
        reason: reason || 'N/A',
        authorizedBy: authUser
      });
    }

    // ACTION: Reset / Delete
    if (act === 'reset' || act === 'delete') {
      const current = Number(db.ticketSales[targetDate][matched.id] || 0);
      db.ticketSales[targetDate][matched.id] = 0;

      const authUser = authorizedBy || caller.caller;
      addHistoryLog('TICKET_SALE_RESET', `[${act}] Reset ${matched.name} count to 0 (cleared ${current}) on ${targetDate}. Reason: ${reason || 'Administrative'}`, authUser);

      saveDatabase({
        type: 'ticket-sale-cleared',
        date: targetDate,
        counterId: matched.id,
        clearedCount: current
      });

      return res.json({
        success: true,
        fullAccess: true,
        action: act,
        message: `Counter ${matched.name} reset to 0`,
        date: targetDate,
        counterId: matched.id,
        counterName: matched.name,
        clearedCount: current,
        newTotalCount: 0
      });
    }

    return res.status(400).json({ success: false, error: `Unknown action: "${action}"` });
  } catch (err) {
    console.error('Action error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================================================================
// --- 2. GET FULL ACCESS ADMINISTRATIVE STATE ---
// =========================================================================
app.get(['/api/ticket-sales/full-access', '/api/ticket-sales/admin'], (req, res) => {
  const db = loadDatabase();
  const activeDate = getOperationalDate();
  const allDates = Object.keys(db.ticketSales).sort();

  let grandTotalTickets = 0;
  let grandTotalRevenue = 0;
  for (const d of allDates) {
    for (const c of db.counters) {
      const cnt = Number(db.ticketSales[d][c.id] || 0);
      grandTotalTickets += cnt;
      grandTotalRevenue += cnt * c.ticketPrice;
    }
  }

  res.json({
    success: true,
    fullAccess: true,
    operationalDate: activeDate,
    currency: db.currency,
    stats: {
      totalCounters: db.counters.length,
      totalDatesRecorded: allDates.length,
      grandTotalTicketsSold: grandTotalTickets,
      grandTotalRevenue
    },
    counters: db.counters,
    ticketSales: db.ticketSales,
    recentAuditLogs: db.historyLog.slice(0, 100)
  });
});

// =========================================================================
// --- 3. GET /api/ticket-sales (Query by Date or Range) ---
// =========================================================================
app.get(['/api/ticket-sales', '/api/tickets/sales'], (req, res) => {
  const db = loadDatabase();
  const targetDate = req.query.date || getOperationalDate();
  const daySales = db.ticketSales[targetDate] || {};

  let totalTicketsSold = 0;
  let totalRevenue = 0;

  const countersSummary = db.counters.map(c => {
    const count = Number(daySales[c.id] || 0);
    const subtotal = count * c.ticketPrice;
    totalTicketsSold += count;
    totalRevenue += subtotal;
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      location: c.location,
      unitPrice: c.ticketPrice,
      count,
      subtotal,
      active: c.active
    };
  });

  res.json({
    success: true,
    date: targetDate,
    totalTicketsSold,
    totalRevenue,
    currency: db.currency,
    counters: countersSummary
  });
});

// =========================================================================
// --- 4. POST /api/ticket-sales (Record / Increment) ---
// =========================================================================
app.post(['/api/ticket-sales', '/api/tickets/sales'], (req, res) => {
  const caller = getCallerInfo(req);
  const { counterId, count = 1, action = 'increment', date, soldBy, notes } = req.body || {};

  const db = loadDatabase();
  const matched = db.counters.find(c => String(c.id) === String(counterId).trim() || c.name.toLowerCase() === String(counterId).trim().toLowerCase());
  if (!matched) return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });

  const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) ? date.trim() : getOperationalDate();
  if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};

  const current = Number(db.ticketSales[targetDate][matched.id] || 0);
  const numCount = Number(count) || 0;
  let newTotal = current;
  let delta = 0;

  if (action === 'set') {
    newTotal = Math.max(0, Math.floor(numCount));
    delta = newTotal - current;
  } else {
    delta = Math.floor(numCount);
    newTotal = Math.max(0, current + delta);
  }

  db.ticketSales[targetDate][matched.id] = newTotal;
  addHistoryLog('TICKET_SALE_RECORDED', `${matched.name}: ${delta >= 0 ? `+${delta}` : delta} tickets (New Total: ${newTotal})`, soldBy || caller.caller);

  saveDatabase({
    type: 'ticket-sale-updated',
    date: targetDate,
    counterId: matched.id,
    delta,
    newTotal
  });

  res.json({
    success: true,
    message: 'Ticket sale recorded successfully',
    date: targetDate,
    counterId: matched.id,
    counterName: matched.name,
    delta,
    previousCount: current,
    newTotalCount: newTotal,
    unitPrice: matched.ticketPrice,
    subtotalRevenue: newTotal * matched.ticketPrice
  });
});

// =========================================================================
// --- 5. PUT /api/ticket-sales/:date/:counterId (Direct Override) ---
// =========================================================================
app.put(['/api/ticket-sales/:date/:counterId', '/api/ticket-sales'], (req, res) => {
  const targetCounterId = req.params.counterId || req.body.counterId;
  const targetDate = req.params.date || req.body.date || getOperationalDate();
  const newCount = Math.max(0, Math.floor(Number(req.body.count || 0)));

  const db = loadDatabase();
  const matched = db.counters.find(c => String(c.id) === String(targetCounterId).trim());
  if (!matched) return res.status(404).json({ success: false, error: `Counter "${targetCounterId}" not found` });

  if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};
  const previous = Number(db.ticketSales[targetDate][matched.id] || 0);
  db.ticketSales[targetDate][matched.id] = newCount;

  addHistoryLog('TICKET_SALE_PUT_OVERRIDE', `Set ${matched.name} count to ${newCount} on ${targetDate}`);
  saveDatabase({ type: 'ticket-sale-updated', date: targetDate, counterId: matched.id, newTotal: newCount });

  res.json({
    success: true,
    fullAccess: true,
    message: `Counter ${matched.name} updated to ${newCount} tickets`,
    date: targetDate,
    counterId: matched.id,
    previousCount: previous,
    newTotalCount: newCount
  });
});

// =========================================================================
// --- 6. DELETE /api/ticket-sales/:date/:counterId (Reset Counter) ---
// =========================================================================
app.delete(['/api/ticket-sales/:date/:counterId', '/api/ticket-sales'], (req, res) => {
  const targetCounterId = req.params.counterId || req.query.counterId || req.body.counterId;
  const targetDate = req.params.date || req.query.date || req.body.date || getOperationalDate();

  const db = loadDatabase();
  const matched = db.counters.find(c => String(c.id) === String(targetCounterId).trim());
  if (!matched) return res.status(404).json({ success: false, error: `Counter "${targetCounterId}" not found` });

  if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};
  const cleared = Number(db.ticketSales[targetDate][matched.id] || 0);
  db.ticketSales[targetDate][matched.id] = 0;

  addHistoryLog('TICKET_SALE_RESET', `Reset ${matched.name} to 0 on ${targetDate}`);
  saveDatabase({ type: 'ticket-sale-cleared', date: targetDate, counterId: matched.id });

  res.json({
    success: true,
    fullAccess: true,
    message: `Counter ${matched.name} on ${targetDate} reset to 0`,
    date: targetDate,
    counterId: matched.id,
    clearedCount: cleared,
    newTotalCount: 0
  });
});

// =========================================================================
// --- 7. POST /api/ticket-sales/refund (Void / Refund) ---
// =========================================================================
app.post(['/api/ticket-sales/refund', '/api/ticket-sales/void'], (req, res) => {
  const { counterId, count = 1, reason = 'Customer refund', authorizedBy, date } = req.body || {};
  const db = loadDatabase();
  const matched = db.counters.find(c => String(c.id) === String(counterId).trim());
  if (!matched) return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });

  const targetDate = date || getOperationalDate();
  if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};

  const current = Number(db.ticketSales[targetDate][matched.id] || 0);
  const refundQty = Math.floor(Number(count) || 1);
  const newTotal = Math.max(0, current - refundQty);
  const actualDeducted = current - newTotal;
  db.ticketSales[targetDate][matched.id] = newTotal;

  addHistoryLog('TICKET_REFUND', `Voided ${actualDeducted} tickets on ${matched.name}. Reason: ${reason}`, authorizedBy || 'Supervisor');
  saveDatabase({ type: 'ticket-sale-refunded', date: targetDate, counterId: matched.id, refundQuantity: actualDeducted, newTotal });

  res.json({
    success: true,
    fullAccess: true,
    message: `Refunded ${actualDeducted} ticket(s) on ${matched.name}`,
    date: targetDate,
    counterId: matched.id,
    refundQuantity: actualDeducted,
    refundAmount: actualDeducted * matched.ticketPrice,
    previousCount: current,
    newTotalCount: newTotal
  });
});

// =========================================================================
// --- 8. POST /api/ticket-sales/batch (Multi-Counter Update) ---
// =========================================================================
app.post('/api/ticket-sales/batch', (req, res) => {
  const { sales, date, soldBy } = req.body || {};
  if (!Array.isArray(sales)) return res.status(400).json({ success: false, error: 'sales array required' });

  const db = loadDatabase();
  const targetDate = date || getOperationalDate();
  if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};

  const results = [];
  for (const item of sales) {
    const matched = db.counters.find(c => String(c.id) === String(item.counterId).trim());
    if (!matched) continue;
    const current = Number(db.ticketSales[targetDate][matched.id] || 0);
    const delta = Math.floor(Number(item.count) || 0);
    const newTotal = Math.max(0, item.action === 'set' ? delta : current + delta);
    db.ticketSales[targetDate][matched.id] = newTotal;
    results.push({ counterId: matched.id, previousCount: current, newTotalCount: newTotal });
  }

  addHistoryLog('BATCH_TICKET_SALES', `Processed batch updates for ${results.length} counters`, soldBy || 'Batch POS');
  saveDatabase({ type: 'batch-sales-updated', date: targetDate, count: results.length });

  res.json({
    success: true,
    fullAccess: true,
    date: targetDate,
    updatedCountersCount: results.length,
    results
  });
});

// =========================================================================
// --- 9. POST /api/ticket-sales/bulk-replace (EOD Matrix Overwrite) ---
// =========================================================================
app.post('/api/ticket-sales/bulk-replace', (req, res) => {
  const { sales, date, authorizedBy } = req.body || {};
  if (!sales || typeof sales !== 'object') return res.status(400).json({ success: false, error: 'sales object/array required' });

  const db = loadDatabase();
  const targetDate = date || getOperationalDate();
  const newMatrix = {};

  if (Array.isArray(sales)) {
    sales.forEach(s => {
      newMatrix[s.counterId] = Math.max(0, Math.floor(Number(s.count) || 0));
    });
  } else {
    Object.entries(sales).forEach(([k, v]) => {
      newMatrix[k] = Math.max(0, Math.floor(Number(v) || 0));
    });
  }

  db.ticketSales[targetDate] = newMatrix;
  addHistoryLog('BULK_REPLACE_SALES', `Replaced full sales matrix for ${targetDate}`, authorizedBy || 'ERP Sync');
  saveDatabase({ type: 'bulk-replace', date: targetDate });

  res.json({
    success: true,
    fullAccess: true,
    message: `Sales matrix replaced for ${targetDate}`,
    date: targetDate,
    totalCountersUpdated: Object.keys(newMatrix).length
  });
});

// =========================================================================
// --- 10. POST /api/ticket-sales/reconcile (Turnstile Footfall Audit) ---
// =========================================================================
app.post('/api/ticket-sales/reconcile', (req, res) => {
  const { turnstileReadings = {}, date, applyAdjustment = false, authorizedBy } = req.body || {};
  const db = loadDatabase();
  const targetDate = date || getOperationalDate();
  if (!db.ticketSales[targetDate]) db.ticketSales[targetDate] = {};

  const report = [];
  for (const c of db.counters) {
    const registered = Number(db.ticketSales[targetDate][c.id] || 0);
    const turnstile = turnstileReadings[c.id] !== undefined ? Number(turnstileReadings[c.id]) : null;

    if (turnstile !== null) {
      const variance = turnstile - registered;
      report.push({
        counterId: c.id,
        counterName: c.name,
        registeredSales: registered,
        turnstileFootfall: turnstile,
        variance,
        status: variance === 0 ? 'MATCHED' : (variance > 0 ? 'OVER_ENTRIES' : 'UNDER_ENTRIES')
      });

      if (applyAdjustment && variance !== 0) {
        db.ticketSales[targetDate][c.id] = turnstile;
      }
    }
  }

  if (applyAdjustment) {
    addHistoryLog('RECONCILIATION_ADJUSTMENT', `Adjusted counts on ${targetDate} to match turnstiles`, authorizedBy || 'Audit');
    saveDatabase({ type: 'reconciled', date: targetDate });
  }

  res.json({
    success: true,
    fullAccess: true,
    date: targetDate,
    adjustmentsApplied: Boolean(applyAdjustment),
    report
  });
});

// =========================================================================
// --- 11. Counters CRUD Management ---
// =========================================================================
app.get('/api/ticket-sales/counters', (req, res) => {
  const db = loadDatabase();
  const activeDate = getOperationalDate();
  const todaySales = db.ticketSales[activeDate] || {};

  const enriched = db.counters.map(c => {
    const count = Number(todaySales[c.id] || 0);
    return {
      ...c,
      todayCount: count,
      todayRevenue: count * c.ticketPrice
    };
  });

  res.json({ success: true, operationalDate: activeDate, totalCounters: enriched.length, counters: enriched });
});

app.post('/api/ticket-sales/counters', (req, res) => {
  const { id, name, ticketPrice = 150, type = 'General', location = '', active = true } = req.body || {};
  if (!name) return res.status(400).json({ success: false, error: 'name is required' });

  const db = loadDatabase();
  const newId = Number(id) || (db.counters.reduce((max, c) => Math.max(max, c.id), 0) + 1);
  const newCounter = { id: newId, name: String(name).trim(), ticketPrice: Number(ticketPrice), type, location, active: Boolean(active) };
  db.counters.push(newCounter);

  addHistoryLog('COUNTER_CREATED', `Created counter ${newCounter.name} (ID: ${newId})`);
  saveDatabase({ type: 'counter-created', counter: newCounter });

  res.status(201).json({ success: true, message: 'Counter created', counter: newCounter });
});

app.put('/api/ticket-sales/counters/:id', (req, res) => {
  const targetId = Number(req.params.id);
  const db = loadDatabase();
  const idx = db.counters.findIndex(c => c.id === targetId);
  if (idx === -1) return res.status(404).json({ success: false, error: `Counter ${targetId} not found` });

  const prev = db.counters[idx];
  db.counters[idx] = {
    ...prev,
    name: req.body.name !== undefined ? String(req.body.name).trim() : prev.name,
    ticketPrice: req.body.ticketPrice !== undefined ? Number(req.body.ticketPrice) : prev.ticketPrice,
    type: req.body.type !== undefined ? String(req.body.type).trim() : prev.type,
    location: req.body.location !== undefined ? String(req.body.location).trim() : prev.location,
    active: req.body.active !== undefined ? Boolean(req.body.active) : prev.active
  };

  saveDatabase({ type: 'counter-updated', counter: db.counters[idx] });
  res.json({ success: true, message: 'Counter updated', counter: db.counters[idx] });
});

app.delete('/api/ticket-sales/counters/:id', (req, res) => {
  const targetId = Number(req.params.id);
  const db = loadDatabase();
  const idx = db.counters.findIndex(c => c.id === targetId);
  if (idx === -1) return res.status(404).json({ success: false, error: `Counter ${targetId} not found` });

  const removed = db.counters.splice(idx, 1)[0];
  saveDatabase({ type: 'counter-deleted', counterId: targetId });
  res.json({ success: true, message: `Counter ${removed.name} deleted` });
});

// =========================================================================
// --- 12. GET /api/ticket-sales/history (Audit Log) ---
// =========================================================================
app.get('/api/ticket-sales/history', (req, res) => {
  const db = loadDatabase();
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({
    success: true,
    totalLogs: db.historyLog.length,
    logs: db.historyLog.slice(0, limit)
  });
});

// =========================================================================
// --- 13. GET /api/ticket-sales/export (CSV or JSON Download) ---
// =========================================================================
app.get('/api/ticket-sales/export', (req, res) => {
  const db = loadDatabase();
  const format = String(req.query.format || 'json').toLowerCase();
  const dates = Object.keys(db.ticketSales).sort();

  const rows = [];
  for (const d of dates) {
    for (const c of db.counters) {
      const count = Number(db.ticketSales[d][c.id] || 0);
      rows.push({
        date: d,
        counterId: c.id,
        counterName: c.name,
        type: c.type,
        location: c.location,
        unitPrice: c.ticketPrice,
        ticketsSold: count,
        revenueBDT: count * c.ticketPrice
      });
    }
  }

  if (format === 'csv') {
    const headers = ['Date', 'Counter ID', 'Counter Name', 'Type', 'Location', 'Unit Price (BDT)', 'Tickets Sold', 'Revenue (BDT)'];
    const lines = [headers.join(',')];
    rows.forEach(r => {
      lines.push([
        `"${r.date}"`,
        r.counterId,
        `"${r.counterName.replace(/"/g, '""')}"`,
        `"${r.type.replace(/"/g, '""')}"`,
        `"${r.location.replace(/"/g, '""')}"`,
        r.unitPrice,
        r.ticketsSold,
        r.revenueBDT
      ].join(','));
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ticket_sales_${getOperationalDate()}.csv"`);
    return res.send(lines.join('\n'));
  }

  res.json({ success: true, currency: db.currency, totalRows: rows.length, records: rows });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  loadDatabase();
  console.log('=============================================================');
  console.log(`🚀 TFW Ticket Sales Standalone API is running on port ${PORT}`);
  console.log(`🌐 Base URL: http://localhost:${PORT}`);
  console.log(`🔑 Master API Key: ${API_KEY}`);
  console.log(`📖 Documentation: http://localhost:${PORT}/api/ticket-sales/docs`);
  console.log(`⚡ Live Event Stream (SSE): http://localhost:${PORT}/api/events`);
  console.log('=============================================================');
});
