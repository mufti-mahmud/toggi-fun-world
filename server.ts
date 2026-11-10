import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import compression from 'compression';
import { 
  RIDES, 
  OPERATORS, 
  TICKET_SALES_PERSONNEL, 
  COUNTERS, 
  MAINTENANCE_PERSONNEL, 
  CX_PERSONNEL,
  FLOORS, 
  DEFAULT_PACKAGES,
  DEFAULT_APP_CONFIG,
  DEFAULT_STAFF_ROLES,
  getDhakaDateString,
  formatDhakaTime
} from './constants';
import { saveToSqlite, loadFromSqlite, getSqliteStats, getSqliteDatabase, checkpointSqlite } from './sqliteDb';
import { TOGGI_RIDES_IMAGE_MAP } from './data/rideImagesCatalog';
import { isManagementSalesMessage, parseManagementReportText } from './utils/whatsappManagementParser';
import { createSiteAuth, readApiKey, safeEqual, clientIp, createAttemptLimiter } from './siteAuth';

// Ensure production mode if running from compiled server.cjs bundle
if (typeof __filename !== 'undefined' && __filename.endsWith('.cjs')) {
  process.env.NODE_ENV = 'production';
}

// Global exception guards to prevent unexpected container crashes
process.on('uncaughtException', (err) => {
  console.error('⚠️ Uncaught Exception in server process:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ Unhandled Rejection in server process:', reason);
});

const PORT = Number(process.env.PORT) || 3000;

// Secrets come only from the environment; see .env.example.
const TICKET_API_MASTER_KEY = String(process.env.TICKET_API_KEY || '').trim();
const WHATSAPP_WEBHOOK_SECRET = String(process.env.WHATSAPP_WEBHOOK_SECRET || '').trim();
const GREEN_API_ENV_ID_INSTANCE = String(process.env.GREEN_API_ID_INSTANCE || '').trim();
const GREEN_API_ENV_TOKEN_INSTANCE = String(process.env.GREEN_API_TOKEN_INSTANCE || '').trim();
const WHAPI_ENV_TOKEN = String(process.env.WHAPI_API_TOKEN || '').trim();
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Initialize Data Directory
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create data directory:', e);
  }
}

// -------------------------------------------------------------
// Offline-Only Local SQLite Persistence Layer
// -------------------------------------------------------------
// Set of processed WhatsApp message IDs to prevent duplicate tickets
const processedWhatsAppMessageIds = new Set<string>();

function markWhatsAppMessageProcessed(messageId: string) {
  if (!messageId) return;
  processedWhatsAppMessageIds.add(String(messageId));
  try {
    const db = memoryDb;
    if (db) {
      if (!db.config) db.config = {};
      if (!db.config.whatsappConfig) db.config.whatsappConfig = {};
      if (!Array.isArray(db.config.whatsappConfig.processedMessageIds)) {
        db.config.whatsappConfig.processedMessageIds = [];
      }
      if (!db.config.whatsappConfig.processedMessageIds.includes(messageId)) {
        db.config.whatsappConfig.processedMessageIds.push(messageId);
        if (db.config.whatsappConfig.processedMessageIds.length > 2000) {
          db.config.whatsappConfig.processedMessageIds = db.config.whatsappConfig.processedMessageIds.slice(-2000);
        }
      }
    }
  } catch (e) {}
}

const DEFAULT_DELETED_TICKET_IDS: string[] = [];

const DEFAULT_DELETED_WA_MSG_IDS: string[] = [];

const DEFAULT_DELETED_SIGNATURES: string[] = [];

function isTicketDeleted(
  db: any,
  ticketId?: string,
  whatsappMessageId?: string,
  rideId?: number | string,
  problem?: string
): boolean {
  if (!db) return false;
  const config = db.config || {};
  const deletedTicketIds: string[] = [
    ...DEFAULT_DELETED_TICKET_IDS,
    ...(Array.isArray(config.deletedTicketIds) ? config.deletedTicketIds : [])
  ];
  const deletedWhatsAppMessageIds: string[] = [
    ...DEFAULT_DELETED_WA_MSG_IDS,
    ...(Array.isArray(config.deletedWhatsAppMessageIds) ? config.deletedWhatsAppMessageIds : [])
  ];
  const deletedSignatures: string[] = [
    ...DEFAULT_DELETED_SIGNATURES,
    ...(Array.isArray(config.deletedTicketSignatures) ? config.deletedTicketSignatures : [])
  ];

  if (ticketId && deletedTicketIds.includes(String(ticketId))) return true;
  if (whatsappMessageId && deletedWhatsAppMessageIds.includes(String(whatsappMessageId))) return true;

  // Real park rides repeatedly experience recurring issues (e.g. sound playing, sensor calibration, motion problem).
  // Active new tickets must never be suppressed by generic problem text matching.
  return false;
}

function cleanupDeletedTicket(
  db: any,
  ticketId?: string,
  dateHint?: string,
  whatsappMessageId?: string,
  rideId?: number | string,
  problem?: string
): { deletedCount: number; deletedIds: string[] } {
  if (!db) return { deletedCount: 0, deletedIds: [] };
  if (!db.config) db.config = {};
  if (!Array.isArray(db.config.deletedTicketIds)) db.config.deletedTicketIds = [];
  if (!Array.isArray(db.config.deletedWhatsAppMessageIds)) db.config.deletedWhatsAppMessageIds = [];
  if (!Array.isArray(db.config.deletedTicketSignatures)) db.config.deletedTicketSignatures = [];

  const deletedIds: string[] = [];
  if (ticketId && !db.config.deletedTicketIds.includes(ticketId)) {
    db.config.deletedTicketIds.push(ticketId);
    deletedIds.push(ticketId);
  }

  if (whatsappMessageId) {
    if (!db.config.deletedWhatsAppMessageIds.includes(whatsappMessageId)) {
      db.config.deletedWhatsAppMessageIds.push(whatsappMessageId);
    }
    markWhatsAppMessageProcessed(whatsappMessageId);
  }

  let deletedCount = 0;
  if (db.data?.maintenanceTickets && typeof db.data.maintenanceTickets === 'object') {
    for (const [dKey, dayMap] of Object.entries(db.data.maintenanceTickets as Record<string, any>)) {
      if (!dayMap || typeof dayMap !== 'object') continue;
      for (const [tKey, tObjRaw] of Object.entries(dayMap)) {
        if (!tObjRaw || typeof tObjRaw !== 'object') continue;
        const tObj = tObjRaw as any;

        const isSameId = Boolean(ticketId && (tKey === ticketId || tObj.id === ticketId));
        const isSameMsg = Boolean(whatsappMessageId && tObj.whatsappMessageId && tObj.whatsappMessageId === whatsappMessageId);

        if (isSameId || isSameMsg) {
          if (tObj.whatsappMessageId) {
            if (!db.config.deletedWhatsAppMessageIds.includes(tObj.whatsappMessageId)) {
              db.config.deletedWhatsAppMessageIds.push(tObj.whatsappMessageId);
            }
            markWhatsAppMessageProcessed(tObj.whatsappMessageId);
          }
          if (tObj.id && !db.config.deletedTicketIds.includes(tObj.id)) {
            db.config.deletedTicketIds.push(tObj.id);
            deletedIds.push(tObj.id);
          }
          if (tKey && !db.config.deletedTicketIds.includes(tKey)) {
            db.config.deletedTicketIds.push(tKey);
            deletedIds.push(tKey);
          }
          delete dayMap[tKey];
          deletedCount++;
        }
      }
      if (Object.keys(dayMap).length === 0) {
        delete db.data.maintenanceTickets[dKey];
      }
    }
  }
  try {
    const sqlite = getSqliteDatabase();
    if (ticketId) {
      sqlite.prepare('DELETE FROM maintenance_tickets WHERE id = ?').run(String(ticketId));
    }
    if (whatsappMessageId) {
      sqlite.prepare('DELETE FROM maintenance_tickets WHERE whatsapp_message_id = ?').run(String(whatsappMessageId));
    }
    for (const dId of deletedIds) {
      sqlite.prepare('DELETE FROM maintenance_tickets WHERE id = ?').run(String(dId));
    }
  } catch (e) {}

  return { deletedCount, deletedIds };
}

function normalizeAppConfigAndRoles(targetDb: any): boolean {
  if (!targetDb || typeof targetDb !== 'object') return false;
  let changed = false;
  if (!targetDb.config || typeof targetDb.config !== 'object') {
    targetDb.config = {};
    changed = true;
  }
  if (!targetDb.config.appConfig || typeof targetDb.config.appConfig !== 'object') {
    targetDb.config.appConfig = { ...DEFAULT_APP_CONFIG };
    changed = true;
  }

  const appConfig = targetDb.config.appConfig;
  if (appConfig.loginLeftTitle === 'TOGGI FUN WORLD' || !appConfig.loginLeftTitle) {
    appConfig.loginLeftTitle = 'Tanvir Bashundhara Group';
    changed = true;
  }
  if (!appConfig.loginLeftLogo || appConfig.loginLeftLogo.trim() === '') {
    appConfig.loginLeftLogo = '/tbg-logo.svg';
    changed = true;
  }
  if (appConfig.loginLeftSubtitle === 'Bashundhara City • Operations Portal' || !appConfig.loginLeftSubtitle) {
    appConfig.loginLeftSubtitle = 'Operations & Management Portal';
    changed = true;
  }
  if (appConfig.loginRightTitle === 'BASHUNDHARA GROUP' || !appConfig.loginRightTitle) {
    appConfig.loginRightTitle = 'Bashundhara City Development Ltd';
    changed = true;
  }
  if (!appConfig.loginRightLogo || appConfig.loginRightLogo.trim() === '') {
    appConfig.loginRightLogo = '/bcdl-logo.svg';
    changed = true;
  }
  if (appConfig.loginRightSubtitle === 'For the People, for the Country' || !appConfig.loginRightSubtitle) {
    appConfig.loginRightSubtitle = 'Bashundhara Group';
    changed = true;
  }
  if (!appConfig.appName || appConfig.appName === 'TFW Operations Manager') {
    appConfig.appName = 'Tanvir Bashundhara Group';
    changed = true;
  }
  if (!targetDb.config.appName || targetDb.config.appName === 'TFW Operations Manager') {
    targetDb.config.appName = 'Tanvir Bashundhara Group';
    changed = true;
  }

  // Filter out Ticket Sales and Sales Executive roles from database configuration
  if (Array.isArray(appConfig.roles)) {
    const prevLen = appConfig.roles.length;
    appConfig.roles = appConfig.roles.filter((r: any) => 
      r.id !== 'role-6' && 
      r.id !== 'role-7' && 
      r.id !== 'role-8' && 
      r.id !== 'role-9' &&
      r.loginRole !== 'ticket-sales' &&
      r.loginRole !== 'sales-officer' &&
      !r.name?.toLowerCase().includes('ticket sales') &&
      !r.name?.toLowerCase().includes('sales executive') &&
      !r.name?.toLowerCase().includes('lead cashier')
    );
    if (appConfig.roles.length !== prevLen) changed = true;
    appConfig.roles.forEach((r: any) => {
      if (r.name === 'Electrical Specialist' || r.id === 'role-10') {
        r.name = 'Maintenance';
        r.description = 'Maintenance technician for ride motors, sensors, and power systems';
        changed = true;
      }
    });
  } else {
    appConfig.roles = DEFAULT_STAFF_ROLES;
    changed = true;
  }

  if (Array.isArray(targetDb.config.roles)) {
    const prevLen = targetDb.config.roles.length;
    targetDb.config.roles = targetDb.config.roles.filter((r: any) => 
      r.id !== 'role-6' && 
      r.id !== 'role-7' && 
      r.id !== 'role-8' && 
      r.id !== 'role-9' &&
      r.loginRole !== 'ticket-sales' &&
      r.loginRole !== 'sales-officer' &&
      !r.name?.toLowerCase().includes('ticket sales') &&
      !r.name?.toLowerCase().includes('sales executive') &&
      !r.name?.toLowerCase().includes('lead cashier')
    );
    if (targetDb.config.roles.length !== prevLen) changed = true;
    targetDb.config.roles.forEach((r: any) => {
      if (r.name === 'Electrical Specialist' || r.id === 'role-10') {
        r.name = 'Maintenance';
        r.description = 'Maintenance technician for ride motors, sensors, and power systems';
        changed = true;
      }
    });
  } else {
    targetDb.config.roles = appConfig.roles;
    changed = true;
  }

  // Ensure default githubUrl
  if (!appConfig.githubUrl) {
    appConfig.githubUrl = 'https://github.com';
    changed = true;
  }

  // Password synchronization: add 79 to all passwords except maintenance
  if (appConfig.adminPassword === 'admin' || !appConfig.adminPassword) {
    appConfig.adminPassword = 'admin79';
    changed = true;
  }
  if (appConfig.operationOfficerPassword === 'ops' || !appConfig.operationOfficerPassword) {
    appConfig.operationOfficerPassword = 'ops79';
    changed = true;
  }
  if (appConfig.salesOfficerPassword) {
    delete appConfig.salesOfficerPassword;
    changed = true;
  }
  if (appConfig.cxPassword === 'cx' || !appConfig.cxPassword) {
    appConfig.cxPassword = 'cx79';
    changed = true;
  }
  if (!appConfig.maintenancePassword) {
    appConfig.maintenancePassword = 'maint';
    changed = true;
  }
  if (!appConfig.informationDeskUser) {
    appConfig.informationDeskUser = 'info';
    changed = true;
  }
  if (!appConfig.informationDeskPassword) {
    appConfig.informationDeskPassword = 'info79';
    changed = true;
  }

  if (targetDb.config.adminPassword !== appConfig.adminPassword) {
    targetDb.config.adminPassword = appConfig.adminPassword;
    changed = true;
  }
  if (targetDb.config.operationOfficerPassword !== appConfig.operationOfficerPassword) {
    targetDb.config.operationOfficerPassword = appConfig.operationOfficerPassword;
    changed = true;
  }
  if (targetDb.config.salesOfficerPassword !== appConfig.salesOfficerPassword) {
    targetDb.config.salesOfficerPassword = appConfig.salesOfficerPassword;
    changed = true;
  }
  if (targetDb.config.cxPassword !== appConfig.cxPassword) {
    targetDb.config.cxPassword = appConfig.cxPassword;
    changed = true;
  }
  if (targetDb.config.maintenancePassword !== appConfig.maintenancePassword) {
    targetDb.config.maintenancePassword = appConfig.maintenancePassword;
    changed = true;
  }

  // Ensure real packages are permanently preserved and never overridden by legacy mock data
  if (
    !Array.isArray(targetDb.config.packages) ||
    targetDb.config.packages.length === 0 ||
    targetDb.config.packages.some((p: any) => p.id === 'pkg-1' || p.name === 'Single Entry')
  ) {
    targetDb.config.packages = DEFAULT_PACKAGES;
    changed = true;
  }

  return changed;
}

// Initial Database Structure
function getInitialDatabase() {
  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    config: {
      appConfig: DEFAULT_APP_CONFIG,
      appName: 'Tanvir Bashundhara Group',
      appLogo: null,
      adminPassword: 'admin79',
      operationOfficerPassword: 'ops79',
      salesOfficerPassword: 'sales79',
      maintenancePassword: 'maint',
      cxPassword: 'cx79',
      cutoffHour: 22,
      currency: 'BDT',
      floors: FLOORS,
      packages: DEFAULT_PACKAGES,
      rides: RIDES,
      operators: OPERATORS,
      ticketSalesPersonnel: TICKET_SALES_PERSONNEL,
      counters: COUNTERS,
      maintenancePersonnel: MAINTENANCE_PERSONNEL,
      cxPersonnel: CX_PERSONNEL,
      otherSalesCategories: ['Merchandise', 'Food & Beverage', 'Photo Booth', 'Locker Rental', 'Game Tokens']
    },
    data: {
      dailyCounts: {},
      ticketSalesData: {},
      operatorAssignments: {},
      ticketSalesAssignments: {},
      attendance: {},
      packageSales: {},
      maintenanceTickets: {},
      historyLog: {
        [Date.now()]: {
          timestamp: new Date().toISOString(),
          user: 'System',
          action: 'SYSTEM_STARTUP',
          details: 'Automated database engine started successfully.'
        }
      }
    }
  };
}

// In-Memory Database with Disk Persistence
let memoryDb: any = null;
let sseClients: Array<{ id: number; res: express.Response }> = [];
let clientCounter = 0;

function loadDatabase(): any {
  if (memoryDb) return memoryDb;
  try {
    // 1. Prioritize offline SQLite Database
    try {
      const sqliteState = loadFromSqlite();
      if (sqliteState && sqliteState.config && sqliteState.data && Object.keys(sqliteState.config.rides || {}).length > 0) {
        if (!sqliteState.data.dailyCounts) sqliteState.data.dailyCounts = {};
        if (!sqliteState.data.dailyPackageCounts) sqliteState.data.dailyPackageCounts = {};
        if (!sqliteState.data.dailyTicketCounts) sqliteState.data.dailyTicketCounts = {};
        
        // Dates that exist only in database.json (written before the SQLite move) are copied across unchanged.
        if (fs.existsSync(DB_FILE)) {
          try {
            const jsonDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
            const jsonOnlyDates = Object.keys(jsonDb?.data?.dailyCounts || {}).filter(d => !sqliteState.data.dailyCounts[d]);
            for (const d of jsonOnlyDates) {
              for (const coll of ['dailyCounts', 'dailyPackageCounts', 'dailyTicketCounts'] as const) {
                const counts = jsonDb.data[coll]?.[d];
                if (counts && typeof counts === 'object') sqliteState.data[coll][d] = counts;
              }
            }
          } catch (_) {}
        }

        if (sqliteState.config?.rides) {
          if (Array.isArray(sqliteState.config.rides)) {
            sqliteState.config.rides.forEach((r: any) => {
              if (r && !r.imageUrl && TOGGI_RIDES_IMAGE_MAP[r.id]) {
                r.imageUrl = TOGGI_RIDES_IMAGE_MAP[r.id];
              }
            });
          } else if (typeof sqliteState.config.rides === 'object') {
            Object.values(sqliteState.config.rides).forEach((r: any) => {
              if (r && !r.imageUrl && TOGGI_RIDES_IMAGE_MAP[r.id]) {
                r.imageUrl = TOGGI_RIDES_IMAGE_MAP[r.id];
              }
            });
          }
        }

        if (!sqliteState.data) sqliteState.data = {};

        console.log(`⚡ Loaded database state from offline SQLite database (version: ${sqliteState.version}, rides: ${Object.keys(sqliteState.config.rides || {}).length})`);
        memoryDb = sqliteState;
        return memoryDb;
      }
    } catch (sqliteErr) {
      console.warn('SQLite initial load attempt:', sqliteErr);
    }

    let targetFileToRead = DB_FILE;
    if (!fs.existsSync(DB_FILE) && fs.existsSync(`${DB_FILE}.backup`)) {
      targetFileToRead = `${DB_FILE}.backup`;
    }

    if (fs.existsSync(targetFileToRead)) {
      const fileData = fs.readFileSync(targetFileToRead, 'utf-8');
      const parsed = JSON.parse(fileData);
      
      // Ensure basic structure without overwriting existing data or user deletions
      if (!parsed.config || typeof parsed.config !== 'object') parsed.config = {};
      if (!parsed.data || typeof parsed.data !== 'object') parsed.data = {};
      if (!parsed.version) parsed.version = 1;
      
      // Initialize only missing data collections (preserve empty objects if user cleared them)
      if (parsed.data.dailyCounts === undefined) parsed.data.dailyCounts = {};
      if (parsed.data.dailyPackageCounts === undefined) parsed.data.dailyPackageCounts = {};
      if (parsed.data.dailyTicketCounts === undefined) parsed.data.dailyTicketCounts = {};
      if (parsed.data.ticketSalesData === undefined) parsed.data.ticketSalesData = {};
      if (parsed.data.operatorAssignments === undefined) parsed.data.operatorAssignments = {};
      if (parsed.data.ticketSalesAssignments === undefined) parsed.data.ticketSalesAssignments = {};
      if (parsed.data.attendance === undefined) parsed.data.attendance = {};
      if (parsed.data.packageSales === undefined) parsed.data.packageSales = {};
      if (parsed.data.maintenanceTickets === undefined) parsed.data.maintenanceTickets = {};
      if (parsed.data.historyLog === undefined) parsed.data.historyLog = {};
      
      let healed = false;


      // Auto-heal / correct any tickets where Virtual Egg was previously tagged as VR Tank

      if (parsed.data.maintenanceTickets) {
        for (const dayTickets of Object.values(parsed.data.maintenanceTickets) as any[]) {
          if (dayTickets && typeof dayTickets === 'object') {
            for (const ticket of Object.values(dayTickets) as any[]) {
              if (ticket && ticket.problem && (ticket.problem.toLowerCase().includes('virtual egg') || ticket.problem.toLowerCase().includes('vr egg')) && (ticket.rideName === 'VR Tank' || ticket.rideId === 103)) {
                ticket.rideId = 110;
                ticket.rideName = 'VR Egg';
                healed = true;
              }
            }
          }
        }
      }

      // Initialize only missing config fields
      if (parsed.config.appConfig === undefined) {
        parsed.config.appConfig = DEFAULT_APP_CONFIG;
      } else {
        parsed.config.appConfig = {
          ...DEFAULT_APP_CONFIG,
          ...parsed.config.appConfig,
          roles: Array.isArray(parsed.config.appConfig.roles)
            ? parsed.config.appConfig.roles 
            : DEFAULT_STAFF_ROLES
        };
      }

      if (normalizeAppConfigAndRoles(parsed)) {
        healed = true;
      }
      if (parsed.config.rides === undefined) {
        parsed.config.rides = RIDES;
      } else {
        if (Array.isArray(parsed.config.rides)) {
          parsed.config.rides.forEach((r: any) => {
            if (r && !r.imageUrl && TOGGI_RIDES_IMAGE_MAP[r.id]) {
              r.imageUrl = TOGGI_RIDES_IMAGE_MAP[r.id];
              healed = true;
            }
          });
        } else if (typeof parsed.config.rides === 'object') {
          Object.values(parsed.config.rides).forEach((r: any) => {
            if (r && !r.imageUrl && TOGGI_RIDES_IMAGE_MAP[r.id]) {
              r.imageUrl = TOGGI_RIDES_IMAGE_MAP[r.id];
              healed = true;
            }
          });
        }
      }
      if (parsed.config.operators === undefined) parsed.config.operators = OPERATORS;
      if (parsed.config.ticketSalesPersonnel === undefined) parsed.config.ticketSalesPersonnel = TICKET_SALES_PERSONNEL;
      if (parsed.config.counters === undefined) parsed.config.counters = COUNTERS;
      if (parsed.config.maintenancePersonnel === undefined) parsed.config.maintenancePersonnel = MAINTENANCE_PERSONNEL;
      if (parsed.config.packages === undefined) {
        parsed.config.packages = DEFAULT_PACKAGES;
      } else if (Array.isArray(parsed.config.packages)) {
        DEFAULT_PACKAGES.forEach(defPkg => {
          if (!parsed.config.packages.some((p: any) => p.name.trim().toLowerCase() === defPkg.name.trim().toLowerCase())) {
            parsed.config.packages.push(defPkg);
            healed = true;
          }
        });
      }
      if (parsed.config.floors === undefined) parsed.config.floors = FLOORS;
      if (parsed.config.otherSalesCategories === undefined) {
        parsed.config.otherSalesCategories = ['Merchandise', 'Food & Beverage', 'Photo Booth', 'Locker Rental', 'Game Tokens'];
      }

      if (!parsed.config.whatsappConfig) {
        parsed.config.whatsappConfig = {
          targetGroupName: 'TFW Issue Resolve (Tech+ Guest Feedback)',
          detectedGroupName: 'TFW Issue Resolve (Tech+ Guest Feedback)',
          autoNotifyOnSolved: true,
          autoNotifyOnAssigned: false
        };
        healed = true;
      } else if (parsed.config.whatsappConfig.targetGroupName === 'Technical support TFW' || !parsed.config.whatsappConfig.targetGroupName) {
        parsed.config.whatsappConfig.targetGroupName = 'TFW Issue Resolve (Tech+ Guest Feedback)';
        parsed.config.whatsappConfig.detectedGroupName = 'TFW Issue Resolve (Tech+ Guest Feedback)';
        healed = true;
      }

      // Re-align any maintenance tickets whose reportedAt date doesn't match its container key
      if (parsed.data?.maintenanceTickets && typeof parsed.data.maintenanceTickets === 'object') {
        const maint = parsed.data.maintenanceTickets;
        for (const dateKey of Object.keys(maint)) {
          const group = maint[dateKey];
          if (group && typeof group === 'object') {
            for (const [tId, ticket] of Object.entries(group) as [string, any][]) {
              if (ticket && ticket.reportedAt) {
                const realDate = getDhakaDateString(new Date(ticket.reportedAt));
                if (realDate !== dateKey || ticket.date !== realDate) {
                  ticket.date = realDate;
                  const ticketId = ticket.id || tId;
                  ticket.id = ticketId;
                  if (!maint[realDate]) maint[realDate] = {};
                  maint[realDate][ticketId] = ticket;
                  if (realDate !== dateKey || ticketId !== tId) {
                    delete maint[dateKey][tId];
                  }
                  healed = true;
                }
              }
            }
          }
        }

        // De-duplicate maintenance tickets (merge multiple copies of the same issue into one canonical ticket)
        const statusRank: Record<string, number> = { 'solved': 3, 'in-progress': 2, 'reported': 1 };
        const seenSignatures = new Map<string, { dateKey: string; ticketId: string; ticket: any }>();

        for (const dateKey of Object.keys(maint)) {
          const group = maint[dateKey];
          if (!group || typeof group !== 'object') continue;
          for (const [tId, ticket] of Object.entries(group) as [string, any][]) {
            if (!ticket || typeof ticket !== 'object') continue;
            const sig = ticket.whatsappMessageId 
              ? `msg-${ticket.whatsappMessageId}` 
              : `id-${ticket.id || tId}`;
            
            if (seenSignatures.has(sig)) {
              const prev = seenSignatures.get(sig)!;
              const prevRank = statusRank[prev.ticket.status] || 0;
              const currRank = statusRank[ticket.status] || 0;
              
              if (currRank > prevRank) {
                prev.ticket.status = ticket.status;
                if (ticket.assignedToId) prev.ticket.assignedToId = ticket.assignedToId;
                if (ticket.assignedToName) prev.ticket.assignedToName = ticket.assignedToName;
                if (ticket.helperIds) prev.ticket.helperIds = ticket.helperIds;
                if (ticket.helperNames) prev.ticket.helperNames = ticket.helperNames;
                if (ticket.resolutionNotes) prev.ticket.resolutionNotes = ticket.resolutionNotes;
                if (ticket.solutionImageUrl) prev.ticket.solutionImageUrl = ticket.solutionImageUrl;
                if (ticket.solvedAt) prev.ticket.solvedAt = ticket.solvedAt;
                if (ticket.inProgressAt) prev.ticket.inProgressAt = ticket.inProgressAt;
              } else if (prevRank > currRank) {
                ticket.status = prev.ticket.status;
                if (prev.ticket.assignedToId) ticket.assignedToId = prev.ticket.assignedToId;
                if (prev.ticket.assignedToName) ticket.assignedToName = prev.ticket.assignedToName;
                if (prev.ticket.helperIds) ticket.helperIds = prev.ticket.helperIds;
                if (prev.ticket.helperNames) ticket.helperNames = prev.ticket.helperNames;
                if (prev.ticket.resolutionNotes) ticket.resolutionNotes = prev.ticket.resolutionNotes;
                if (prev.ticket.solutionImageUrl) ticket.solutionImageUrl = prev.ticket.solutionImageUrl;
                if (prev.ticket.solvedAt) ticket.solvedAt = prev.ticket.solvedAt;
                if (prev.ticket.inProgressAt) ticket.inProgressAt = prev.ticket.inProgressAt;
              }
              // Delete the duplicate entry!
              if (prev.dateKey !== dateKey || prev.ticketId !== tId) {
                delete maint[dateKey][tId];
                healed = true;
              }
            } else {
              seenSignatures.set(sig, { dateKey, ticketId: tId, ticket });
            }
          }
        }
      }

      memoryDb = parsed;
      if (healed) {
        saveDatabaseToDisk();
      }
      return memoryDb;
    }
  } catch (err) {
    console.error('Error reading database file, creating fresh initial db:', err);
  }

  memoryDb = getInitialDatabase();
  saveDatabaseToDisk();
  return memoryDb;
}

interface ServerMutationEvent {
  type: string;
  path?: string;
  value?: any;
  updates?: Record<string, any>;
  delta?: number;
  date?: string;
  activeDate?: string;
  senderId?: string;
  version?: number;
  force?: boolean;
  cutoffDate?: string;
  newCycleStartDate?: string;
  [key: string]: any;
}

// -------------------------------------------------------------
// High-Concurrency Non-Blocking Coalesced Write-Behind Persistence Engine
// Provides sub-millisecond in-memory mutation, immediate real-time SSE broadcast,
// and coalesced disk/SQLite serialization to handle high-frequency peak traffic smoothly.
// -------------------------------------------------------------
let diskFlushTimer: NodeJS.Timeout | null = null;
let maxDelayTimer: NodeJS.Timeout | null = null;
let isFlushingToDisk = false;
let needsReFlush = false;
let lastFlushTime = Date.now();
const MIN_FLUSH_INTERVAL_MS = 250; // Debounce window during peak rush
const MAX_FLUSH_INTERVAL_MS = 1200; // Ceiling to guarantee disk writes regularly during sustained bursts

// Concurrency & Peak Throughput Metrics Monitor
export const concurrencyMetrics = {
  operationsTotal: 0,
  operationsLastMinute: 0,
  peakOperationsPerMinute: 0,
  lastOperationTime: Date.now(),
  queuedDiskFlushes: 0,
  successfulDiskFlushes: 0,
  isPeakRushActive: false,
  activeClientsCount: 0
};

// Operations monitor rolling window
let opsCounter = 0;
setInterval(() => {
  concurrencyMetrics.operationsLastMinute = opsCounter * 6;
  if (concurrencyMetrics.operationsLastMinute > concurrencyMetrics.peakOperationsPerMinute) {
    concurrencyMetrics.peakOperationsPerMinute = concurrencyMetrics.operationsLastMinute;
  }
  concurrencyMetrics.isPeakRushActive = concurrencyMetrics.operationsLastMinute >= 25;
  concurrencyMetrics.activeClientsCount = sseClients.length;
  opsCounter = 0;
}, 10000);

function executeDiskFlush() {
  if (isFlushingToDisk) {
    needsReFlush = true;
    return;
  }
  if (!memoryDb) return;

  isFlushingToDisk = true;
  concurrencyMetrics.queuedDiskFlushes++;

  // Execute on next tick so in-flight HTTP requests and SSE dispatches are processed without blocking
  setImmediate(() => {
    try {
      const serialized = JSON.stringify(memoryDb, null, 2);
      const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempFile, serialized, 'utf-8');
      fs.renameSync(tempFile, DB_FILE);

      // Rotating backup every 10 flushes
      if (concurrencyMetrics.successfulDiskFlushes % 10 === 0) {
        fs.writeFileSync(`${DB_FILE}.backup`, serialized, 'utf-8');
      }

      // Synchronous atomic write to SQLite database
      try {
        saveToSqlite(memoryDb);
      } catch (sqlErr) {
        console.error('Failed to write database to SQLite:', sqlErr);
      }

      concurrencyMetrics.successfulDiskFlushes++;
      lastFlushTime = Date.now();
    } catch (e) {
      console.error('Failed to write database to disk safely:', e);
    } finally {
      isFlushingToDisk = false;
      if (needsReFlush) {
        needsReFlush = false;
        scheduleDiskFlush(true);
      }
    }
  });
}

function scheduleDiskFlush(immediate: boolean = false) {
  if (immediate) {
    if (diskFlushTimer) clearTimeout(diskFlushTimer);
    if (maxDelayTimer) clearTimeout(maxDelayTimer);
    diskFlushTimer = null;
    maxDelayTimer = null;
    executeDiskFlush();
    return;
  }

  // Debounce rapid successive calls
  if (diskFlushTimer) clearTimeout(diskFlushTimer);
  diskFlushTimer = setTimeout(() => {
    diskFlushTimer = null;
    if (maxDelayTimer) {
      clearTimeout(maxDelayTimer);
      maxDelayTimer = null;
    }
    executeDiskFlush();
  }, MIN_FLUSH_INTERVAL_MS);

  // Maximum delay window to avoid starvation during heavy continuous input
  if (!maxDelayTimer) {
    maxDelayTimer = setTimeout(() => {
      maxDelayTimer = null;
      if (diskFlushTimer) {
        clearTimeout(diskFlushTimer);
        diskFlushTimer = null;
      }
      executeDiskFlush();
    }, MAX_FLUSH_INTERVAL_MS);
  }
}

// Clean process exit flushes
process.on('SIGINT', () => {
  try {
    if (memoryDb) {
      fs.writeFileSync(DB_FILE, JSON.stringify(memoryDb, null, 2), 'utf-8');
      saveToSqlite(memoryDb);
    }
  } catch (_) {}
  process.exit(0);
});

process.on('SIGTERM', () => {
  try {
    if (memoryDb) {
      fs.writeFileSync(DB_FILE, JSON.stringify(memoryDb, null, 2), 'utf-8');
      saveToSqlite(memoryDb);
    }
  } catch (_) {}
  process.exit(0);
});

function saveDatabaseToDisk(mutation?: ServerMutationEvent, immediate: boolean = false) {
  if (!memoryDb) return;
  memoryDb.version = (memoryDb.version || 0) + 1;
  memoryDb.lastUpdated = new Date().toISOString();
  concurrencyMetrics.operationsTotal++;
  opsCounter++;
  concurrencyMetrics.lastOperationTime = Date.now();

  // 1. Instant Real-Time SSE broadcast to all connected clients (0ms latency!)
  broadcastMutation(mutation || { type: 'sync' });

  // 2. Coalesced write-behind to disk & SQLite
  scheduleDiskFlush(immediate);
}

// /api/db and SSE send the whole config to browsers, so API tokens must never be stored in it.
function removeSecretsFromDatabase() {
  const waConfig = memoryDb?.config?.whatsappConfig;
  if (!waConfig) return;
  const secretKeys = ['apiTokenInstance', 'whapiToken'].filter(k => waConfig[k] !== undefined);
  if (secretKeys.length === 0) return;
  for (const k of secretKeys) delete waConfig[k];
  console.log(`🔐 Removed ${secretKeys.join(', ')} from the stored WhatsApp config; tokens are read from environment variables.`);
  saveDatabaseToDisk({ type: 'update', updates: { 'config/whatsappConfig': waConfig } }, true);
}

function broadcastMutation(mutation: ServerMutationEvent) {
  const payload = JSON.stringify({
    ...mutation,
    version: memoryDb.version,
    timestamp: memoryDb.lastUpdated,
    activeDate: memoryDb?.config?.appConfig?.activeOperationalDate
  });
  sseClients = sseClients.filter(client => {
    try {
      if (client.res.writableEnded || client.res.destroyed) {
        return false;
      }
      client.res.write(`data: ${payload}\n\n`);
      if (typeof (client.res as any).flush === 'function') {
        (client.res as any).flush();
      }
      return true;
    } catch (e) {
      return false;
    }
  });
}

// Saves a nightly "TFW Total Cash Collection" report. Polling sees the same message for hours, and a later
// correction (or a manual paste) must not be replaced by an older copy, so only a newer, different message wins.
function storeManagementReport(report: any, source: string): boolean {
  const db = loadDatabase();
  if (!db.data) db.data = {};
  if (!db.data.whatsappManagementReports) db.data.whatsappManagementReports = {};
  const existing = db.data.whatsappManagementReports[report.date];
  if (existing) {
    if (existing.rawMessage === report.rawMessage) return false;
    const existingTime = Date.parse(existing.timestamp || '');
    const newTime = Date.parse(report.timestamp || '');
    if (Number.isFinite(existingTime) && Number.isFinite(newTime) && newTime < existingTime) return false;
  }
  db.data.whatsappManagementReports[report.date] = report;
  saveDatabaseToDisk({
    type: 'set',
    path: `data/whatsappManagementReports/${report.date}`,
    value: report,
    senderId: 'whatsapp-mgmt-sync'
  }, true);
  broadcastMutation({
    type: 'whatsapp-management-report-received',
    report,
    date: report.date
  });
  console.log(`[Management Report] ${source}: stored ${report.date}, total revenue ${report.salesAndRevenue?.totalRevenue}, ${report.counterBreakdown?.length || 0} counters`);
  return true;
}

// Text of a Green API message in either the journal shape (lastIncomingMessages / getChatHistory) or the webhook shape.
function extractGreenApiText(m: any): string {
  return String(
    m?.textMessage ||
    m?.extendedTextMessage?.text ||
    m?.extendedTextMessageData?.textMessage ||
    m?.caption ||
    m?.imageMessageData?.caption ||
    m?.messageData?.textMessageData?.textMessage ||
    m?.messageData?.extendedTextMessageData?.textMessage ||
    m?.messageData?.imageMessageData?.caption ||
    ''
  ).trim();
}

// Logs Green API journal failures (401 bad token, 466 plan limit, 429) once per change, not once a minute.
let lastJournalStatus = 0;
function reportJournalStatus(status: number) {
  if (status === lastJournalStatus) return;
  lastJournalStatus = status;
  if (status === 200) {
    console.log('[WhatsApp Poll] Reading incoming WhatsApp messages from Green API.');
  } else {
    console.warn(`[WhatsApp Poll] Green API lastIncomingMessages answered HTTP ${status}; incoming reports are not being collected.`);
  }
}

// Clean up old history records if they exceed 500 items
function trimHistoryLogs(db: any) {
  try {
    if (db?.data?.historyLog && typeof db.data.historyLog === 'object') {
      const keys = Object.keys(db.data.historyLog);
      if (keys.length > 500) {
        keys.sort((a, b) => Number(a) - Number(b));
        const toDelete = keys.slice(0, keys.length - 500);
        toDelete.forEach(k => delete db.data.historyLog[k]);
      }
    }
  } catch (e) {
    // ignore
  }
}

// Helper to normalize issue text across English and Bengali scripts
function normalizeIssueText(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\s\u0980-\u09FF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nested property helpers
function getValueByPath(obj: any, pathStr: string) {
  if (!pathStr) return obj;
  const parts = pathStr.split('/').filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  return current;
}

// Global hook to dispatch WhatsApp resolution message to "TFW Issue Resolve (Tech+ Guest Feedback)" group
let notifyTicketResolvedToWhatsApp: (ticketData: {
  ticketId: string;
  rideId?: number;
  rideName?: string;
  technicianName?: string;
  helpers?: string[];
  reportedProblem?: string;
  notes?: string;
  photoData?: string;
  solvedAt?: string;
}) => Promise<{ success: boolean; messageId?: string; error?: string }> = async () => ({ success: false, error: 'Not initialized' });

function setValueByPath(obj: any, pathStr: string, value: any, isExplicitReopen: boolean = false) {
  const parts = pathStr.split('/').filter(Boolean);
  if (parts.length === 0) return value;
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  const lastPart = parts[parts.length - 1];

  // Allow normal status transitions between 'reported', 'in-progress', and 'solved'
  if (parts.length >= 3 && parts[0] === 'data' && parts[1] === 'maintenanceTickets') {
    if (lastPart === 'status' && !value) {
      return obj;
    }
  }

  const wasPreviouslySolved =
    parts.length >= 3 &&
    parts[0] === 'data' &&
    parts[1] === 'maintenanceTickets' &&
    (lastPart === 'status'
      ? current[lastPart] === 'solved'
      : Boolean(current[lastPart] && typeof current[lastPart] === 'object' && current[lastPart].status === 'solved'));

  if (value === null || value === undefined) {
    delete current[lastPart];
    if (parts.length === 4 && parts[0] === 'data' && parts[1] === 'maintenanceTickets') {
      const targetDate = parts[2];
      const targetId = parts[3];
      cleanupDeletedTicket(obj, targetId, targetDate);
    }
  } else {
    current[lastPart] = value;
  }

  // When a ticket becomes 'solved' or 'in-progress', synchronize any duplicate copies across all dates
  if (parts.length >= 3 && parts[0] === 'data' && parts[1] === 'maintenanceTickets' && obj.data?.maintenanceTickets) {
    const updatedStatus = lastPart === 'status' ? value : value?.status;
    if (updatedStatus === 'solved' || updatedStatus === 'in-progress') {
      const targetTicket = lastPart === 'status' ? current : value;
      const targetRideId = targetTicket?.rideId;
      const targetProb = (targetTicket?.problem || '').toLowerCase().trim();
      const targetMsgId = targetTicket?.whatsappMessageId;
      const targetId = lastPart === 'status' ? parts[parts.length - 2] : lastPart;
      const targetDate = parts[2];

      for (const [dKey, dayMap] of Object.entries(obj.data.maintenanceTickets as Record<string, any>)) {
        if (!dayMap || typeof dayMap !== 'object') continue;
        for (const [tId, tObjRaw] of Object.entries(dayMap)) {
          if (!tObjRaw || typeof tObjRaw !== 'object') continue;
          const tObj = tObjRaw as any;
          if (dKey === targetDate && tId === targetId) continue; // Same instance
          
          const isSameId = tId === targetId || tObj.id === targetId;
          const isSameMsg = Boolean(targetMsgId && tObj.whatsappMessageId === targetMsgId);
          const isSameRideAndProb = Boolean(
            targetRideId && tObj.rideId === targetRideId && 
            targetProb.length > 3 && (
              normalizeIssueText(tObj.problem) === normalizeIssueText(targetProb) ||
              normalizeIssueText(tObj.problem).includes(normalizeIssueText(targetProb)) ||
              normalizeIssueText(targetProb).includes(normalizeIssueText(tObj.problem))
            )
          );

          if (isSameId || isSameMsg || isSameRideAndProb) {
            tObj.status = updatedStatus;
            if (updatedStatus === 'solved') {
              tObj.solvedAt = targetTicket?.solvedAt || tObj.solvedAt || new Date().toISOString();
              if (targetTicket?.resolutionNotes) tObj.resolutionNotes = targetTicket.resolutionNotes;
              if (targetTicket?.solutionImageUrl) tObj.solutionImageUrl = targetTicket.solutionImageUrl;
              if (targetTicket?.assignedToId) tObj.assignedToId = targetTicket.assignedToId;
              if (targetTicket?.assignedToName) tObj.assignedToName = targetTicket.assignedToName;
            } else if (updatedStatus === 'in-progress') {
              tObj.inProgressAt = targetTicket?.inProgressAt || tObj.inProgressAt || new Date().toISOString();
              if (targetTicket?.assignedToId) tObj.assignedToId = targetTicket.assignedToId;
              if (targetTicket?.assignedToName) tObj.assignedToName = targetTicket.assignedToName;
              if (targetTicket?.helperIds) tObj.helperIds = targetTicket.helperIds;
              if (targetTicket?.helperNames) tObj.helperNames = targetTicket.helperNames;
            }
          }
        }
      }

      // If issue is newly marked solved, automatically notify the "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group via Whapi.cloud
      if (updatedStatus === 'solved' && !wasPreviouslySolved) {
        const ticketToNotify = targetTicket || {};
        const resolvedTicketId = String(ticketToNotify.id || targetId || '');
        if (resolvedTicketId && !resolvedTicketId.includes('-kpi-')) {
          setTimeout(() => {
            notifyTicketResolvedToWhatsApp({
              ticketId: resolvedTicketId,
              rideId: ticketToNotify.rideId,
              rideName: ticketToNotify.rideName,
              technicianName: ticketToNotify.assignedToName,
              helpers: ticketToNotify.helperNames,
              reportedProblem: ticketToNotify.problem,
              notes: ticketToNotify.resolutionNotes,
              photoData: ticketToNotify.solutionImageUrl || ticketToNotify.photoUrl,
              solvedAt: ticketToNotify.solvedAt
            }).catch(err => console.warn('Background WhatsApp notify failed:', err));
          }, 250);
        }
      }
    }
  }

  // Synchronize guest counts across dailyPackageCounts, dailyTicketCounts, and dailyCounts
  // Ensuring total guest count = package count + ticket count always
  if (parts.length === 4 && parts[0] === 'data') {
    const coll = parts[1];
    const targetDate = parts[2];
    const targetRideId = parts[3];

    if (['dailyCounts', 'dailyPackageCounts', 'dailyTicketCounts'].includes(coll)) {
      if (!obj.data) obj.data = {};
      if (!obj.data.dailyCounts) obj.data.dailyCounts = {};
      if (!obj.data.dailyPackageCounts) obj.data.dailyPackageCounts = {};
      if (!obj.data.dailyTicketCounts) obj.data.dailyTicketCounts = {};
      if (!obj.data.dailyCounts[targetDate]) obj.data.dailyCounts[targetDate] = {};
      if (!obj.data.dailyPackageCounts[targetDate]) obj.data.dailyPackageCounts[targetDate] = {};
      if (!obj.data.dailyTicketCounts[targetDate]) obj.data.dailyTicketCounts[targetDate] = {};

      if (coll === 'dailyPackageCounts') {
        const p = Number(value) || 0;
        const t = Number(obj.data.dailyTicketCounts[targetDate]?.[targetRideId]) || 0;
        obj.data.dailyCounts[targetDate][targetRideId] = p + t;
      } else if (coll === 'dailyTicketCounts') {
        const p = Number(obj.data.dailyPackageCounts[targetDate]?.[targetRideId]) || 0;
        const t = Number(value) || 0;
        obj.data.dailyCounts[targetDate][targetRideId] = p + t;
      } else if (coll === 'dailyCounts') {
        const tot = Number(value) || 0;
        const p = Number(obj.data.dailyPackageCounts[targetDate]?.[targetRideId]) || 0;
        const t = Number(obj.data.dailyTicketCounts[targetDate]?.[targetRideId]) || 0;
        if (p === 0 && t === 0 && tot > 0) {
          obj.data.dailyPackageCounts[targetDate][targetRideId] = tot;
        }
      }
    }
  }

  return obj;
}

async function startServer() {
  const app = express();
  app.use(cors());

  // Enable high-efficiency gzip/deflate compression for fast 2-3s mobile and desktop loading
  app.use(compression({
    filter: (req, res) => {
      // Do not compress SSE streams to prevent event buffering
      if (req.headers.accept === 'text/event-stream' || req.path === '/api/db/stream') {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Global anti-cache middleware for all API endpoints to prevent mobile Safari/Chrome caching
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  const siteAuth = createSiteAuth({
    sitePassword: String(process.env.SITE_PASSWORD || ''),
    sessionSecret: String(process.env.SESSION_SECRET || ''),
    ticketApiKey: TICKET_API_MASTER_KEY,
    webhookSecret: WHATSAPP_WEBHOOK_SECRET,
    isProduction: process.env.NODE_ENV === 'production'
  });
  if (!siteAuth.enabled) {
    console.warn(process.env.NODE_ENV === 'production'
      ? '🔒 SITE_PASSWORD is not set: every request except /api/health is refused until it is configured.'
      : '🔓 SITE_PASSWORD is not set: login gate disabled for local development.');
  }
  app.use(siteAuth.gate);
  siteAuth.registerRoutes(app);

  // 1. Load initial memory & local cache from SQLite
  loadDatabase();
  removeSecretsFromDatabase();

  // --- API Routes ---
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      dbVersion: memoryDb?.version || 1,
      dbLastUpdated: memoryDb?.lastUpdated || '',
      activeOperationalDate: memoryDb?.config?.appConfig?.activeOperationalDate || '',
      clients: sseClients.length,
      database: 'sqlite',
      sqliteConnected: true,
      time: new Date().toISOString()
    });
  });

  // Manual trigger for SQLite persistence
  app.post('/api/db/cloud-sync', async (req, res) => {
    try {
      saveToSqlite(memoryDb);
      res.json({ 
        success: true, 
        message: 'Database persisted to local SQLite database successfully.', 
        version: memoryDb?.version 
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to persist to SQLite' });
    }
  });

  // Broadcast current view and state to all devices
  app.post('/api/db/broadcast-sync', async (req, res) => {
    try {
      const { db, activeDate, activeView, maintenancePortal, maintenanceStatusTab, maintenanceViewScope, senderId } = req.body;
      if (db && typeof db === 'object') {
        memoryDb = {
          version: (memoryDb?.version || 1) + 1,
          lastUpdated: new Date().toISOString(),
          config: {
            ...(memoryDb?.config || {}),
            ...(db.config || {})
          },
          data: (() => {
            const currentData = memoryDb?.data || {};
            const incomingData = db.data || {};
            const mergedData = { ...currentData, ...incomingData };
            if (currentData.maintenanceTickets && incomingData.maintenanceTickets) {
              const statusRank: Record<string, number> = { 'solved': 3, 'in-progress': 2, 'reported': 1 };
              const mergedMaint = { ...incomingData.maintenanceTickets };
              Object.keys(currentData.maintenanceTickets).forEach(dKey => {
                if (!mergedMaint[dKey]) {
                  mergedMaint[dKey] = { ...currentData.maintenanceTickets[dKey] };
                } else {
                  const dayTickets = { ...mergedMaint[dKey] };
                  for (const [tId, curTicket] of Object.entries(currentData.maintenanceTickets[dKey] as Record<string, any>)) {
                    const incTicket = dayTickets[tId];
                    if (!incTicket) {
                      dayTickets[tId] = curTicket;
                    } else {
                      const curRank = statusRank[curTicket.status] || 0;
                      const incRank = statusRank[incTicket.status] || 0;
                      if (curRank >= incRank) {
                        dayTickets[tId] = {
                          ...incTicket,
                          ...curTicket,
                          resolutionNotes: (curTicket.resolutionNotes && curTicket.resolutionNotes.trim()) || incTicket.resolutionNotes || '',
                          solutionImageUrl: curTicket.solutionImageUrl || incTicket.solutionImageUrl,
                          solvedAt: curTicket.solvedAt || incTicket.solvedAt
                        };
                      }
                    }
                  }
                  mergedMaint[dKey] = dayTickets;
                }
              });
              mergedData.maintenanceTickets = mergedMaint;
            }
            return mergedData;
          })()
        };
      }
      if (!memoryDb.config.appConfig) memoryDb.config.appConfig = {};
      if (activeDate) memoryDb.config.appConfig.activeOperationalDate = activeDate;
      if (activeView) memoryDb.config.appConfig.activeView = activeView;
      if (maintenancePortal) memoryDb.config.appConfig.activeMaintenancePortal = maintenancePortal;
      if (maintenanceStatusTab) memoryDb.config.appConfig.activeMaintenanceStatusTab = maintenanceStatusTab;
      if (maintenanceViewScope) memoryDb.config.appConfig.activeMaintenanceViewScope = maintenanceViewScope;

      saveDatabaseToDisk({ 
        type: 'sync', 
        activeDate, 
        activeView, 
        maintenancePortal, 
        maintenanceStatusTab, 
        maintenanceViewScope, 
        senderId, 
        force: true 
      });
      // Broadcast current operators explicitly so all connected clients update associates immediately
      broadcastMutation({
        type: 'set',
        path: 'config/operators',
        value: memoryDb?.config?.operators || {},
        version: memoryDb?.version
      });
      broadcastMutation({ 
        type: 'sync', 
        activeDate, 
        activeView, 
        maintenancePortal, 
        maintenanceStatusTab, 
        maintenanceViewScope, 
        version: memoryDb?.version, 
        force: true 
      });
      res.json({ success: true, version: memoryDb?.version, message: 'Broadcast sync successful to all devices.' });
    } catch (err) {
      console.error('Error in broadcast-sync:', err);
      res.status(500).json({ error: 'Failed to broadcast sync.' });
    }
  });

  // Comprehensive Software Refresh: pulls latest WhatsApp messages, re-loads authoritative database, and broadcasts sync
  app.post('/api/db/refresh', async (req, res) => {
    try {
      const { activeDate, senderId } = req.body || {};
      
      // 1. Pull latest WhatsApp technical support messages
      try {
        await syncGreenApiGroupMessages(true);
      } catch (waErr) {
        console.warn('WhatsApp refresh skipped during software refresh:', waErr);
      }

      // 2. Load latest authoritative database state
      const db = loadDatabase();

      // 3. If activeDate is specified and valid, align operational date
      if (activeDate && /^\d{4}-\d{2}-\d{2}$/.test(activeDate)) {
        setValueByPath(db, 'config/appConfig/activeOperationalDate', activeDate);
      }

      // 4. Force disk commit and SSE broadcast to all connected devices
      saveDatabaseToDisk({ type: 'sync', force: true, senderId });

      res.json({
        success: true,
        db,
        version: db.version,
        refreshedAt: new Date().toISOString(),
        message: 'Software and date-wise data refreshed successfully.'
      });
    } catch (err: any) {
      console.error('Error in /api/db/refresh:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Full DB or subpath
  app.get('/api/db', (req, res) => {
    const pathQuery = req.query.path as string;
    const db = loadDatabase();
    if (pathQuery) {
      const val = getValueByPath(db, pathQuery);
      return res.json({ success: true, data: val, version: db.version });
    }
    res.json({ success: true, db, version: db.version });
  });

  // Set single path
  app.post('/api/db/set', (req, res) => {
    const { path: pathStr, value, senderId } = req.body;
    if (pathStr === undefined) {
      return res.status(400).json({ error: 'path is required' });
    }
    const db = loadDatabase();
    setValueByPath(db, pathStr, value);
    if (pathStr.startsWith('data/historyLog')) {
      trimHistoryLogs(db);
    }
    saveDatabaseToDisk({ type: 'set', path: pathStr, value, senderId });

    // Instantly broadcast dedicated issue-reported event if an issue was reported
    if (pathStr.startsWith('data/maintenanceTickets') && value && typeof value === 'object' && value.status === 'reported') {
      broadcastMutation({
        type: 'issue-reported',
        ticket: value,
        rideName: value.rideName,
        problem: value.problem,
        priority: value.priority,
        source: value.source,
        reportedByName: value.reportedByName,
        reportedByRole: value.reportedByRole,
        date: value.date,
        senderId
      });
    }

    res.json({ success: true, version: db.version });
  });

  // Dedicated Ride & Attraction Image Upload & Update Endpoint
  const RIDE_IMAGES_DIR = path.join(process.cwd(), 'data', 'images');
  if (!fs.existsSync(RIDE_IMAGES_DIR)) {
    try { fs.mkdirSync(RIDE_IMAGES_DIR, { recursive: true }); } catch (_) {}
  }
  app.use('/data/images', express.static(RIDE_IMAGES_DIR, { maxAge: '30d' }));
  app.use('/api/images', express.static(RIDE_IMAGES_DIR, { maxAge: '30d' }));

  app.post('/api/rides/:id/image', (req, res) => {
    try {
      const rideId = String(req.params.id);
      const { imageUrl, imageData, senderId } = req.body;
      let finalUrl = imageUrl || '';

      if (imageData && typeof imageData === 'string' && imageData.startsWith('data:image')) {
        const match = imageData.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (match) {
          const rawExt = match[1].toLowerCase();
          const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
          const base64Data = match[2];
          const fileName = `ride_${rideId}_${Date.now()}.${ext}`;
          const filePath = path.join(RIDE_IMAGES_DIR, fileName);
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          finalUrl = `/data/images/${fileName}`;
        }
      }

      const db = loadDatabase();
      if (!db.config) db.config = {};
      if (!db.config) db.config = {};
      if (!db.config.rides) db.config.rides = {};

      if (Array.isArray(db.config.rides)) {
        const targetRide = db.config.rides.find((r: any) => String(r.id) === rideId);
        if (targetRide) {
          targetRide.imageUrl = finalUrl;
        } else {
          db.config.rides.push({ id: Number(rideId) || rideId, imageUrl: finalUrl });
        }
      } else {
        if (db.config.rides[rideId]) {
          db.config.rides[rideId].imageUrl = finalUrl;
        } else {
          db.config.rides[rideId] = { id: Number(rideId) || rideId, imageUrl: finalUrl };
        }
      }

      saveDatabaseToDisk({
        type: 'set',
        path: `config/rides/${rideId}/imageUrl`,
        value: finalUrl,
        senderId
      }, true);

      res.json({ success: true, rideId, imageUrl: finalUrl, version: db.version });
    } catch (e: any) {
      console.error('Failed to save ride image:', e);
      res.status(500).json({ error: e.message || 'Failed to save ride image' });
    }
  });

  // Dedicated High-Priority Maintenance Ticket Reporting Endpoint with Guaranteed Multi-Device Broadcast
  app.post('/api/maintenance/report-issue', (req, res) => {
    const { ticket, senderId } = req.body;
    if (!ticket || !ticket.id || !ticket.date) {
      return res.status(400).json({ error: 'Valid ticket object with id and date is required.' });
    }
    const db = loadDatabase();
    const ticketPath = `data/maintenanceTickets/${ticket.date}/${ticket.id}`;
    setValueByPath(db, ticketPath, ticket);
    saveDatabaseToDisk({ type: 'set', path: ticketPath, value: ticket, senderId });

    // Guaranteed instant audio and state broadcast to ALL connected devices (mobile, tablet, desktop)
    broadcastMutation({
      type: 'issue-reported',
      ticket,
      rideName: ticket.rideName,
      problem: ticket.problem,
      priority: ticket.priority,
      source: ticket.source,
      reportedByName: ticket.reportedByName,
      reportedByRole: ticket.reportedByRole,
      date: ticket.date,
      senderId
    });

    res.json({ success: true, version: db.version, ticket });
  });

  // Atomic Increment/Decrement (High concurrency protection)
  app.post('/api/db/increment', (req, res) => {
    const { path: pathStr, delta = 1, min = 0, senderId } = req.body;
    if (!pathStr) {
      return res.status(400).json({ error: 'path is required' });
    }
    const db = loadDatabase();
    const currentVal = Number(getValueByPath(db, pathStr)) || 0;
    const newVal = Math.max(min, currentVal + Number(delta));
    setValueByPath(db, pathStr, newVal);
    saveDatabaseToDisk({ type: 'increment', path: pathStr, delta, value: newVal, senderId });
    res.json({ success: true, version: db.version, value: newVal });
  });

  // Dedicated Atomic Multi-Counter Ride Increment Endpoint
  // Guarantees zero race conditions during peak rush hours when multiple staff tap simultaneously
  app.post('/api/db/increment-ride-count', (req, res) => {
    const { date, rideId, category, delta = 1, senderId } = req.body;
    if (!date || rideId === undefined || !category) {
      return res.status(400).json({ error: 'date, rideId, and category are required' });
    }
    const db = loadDatabase();
    const d = String(date);
    const rId = String(rideId);
    const numDelta = Number(delta) || 0;

    if (!db.data) db.data = {};
    if (!db.data.dailyCounts) db.data.dailyCounts = {};
    if (!db.data.dailyPackageCounts) db.data.dailyPackageCounts = {};
    if (!db.data.dailyTicketCounts) db.data.dailyTicketCounts = {};

    if (!db.data.dailyCounts[d]) db.data.dailyCounts[d] = {};
    if (!db.data.dailyPackageCounts[d]) db.data.dailyPackageCounts[d] = {};
    if (!db.data.dailyTicketCounts[d]) db.data.dailyTicketCounts[d] = {};

    // Current values
    let curPkg = Number(db.data.dailyPackageCounts[d][rId] ?? db.data.dailyPackageCounts[d][rideId] ?? 0);
    let curTkt = Number(db.data.dailyTicketCounts[d][rId] ?? db.data.dailyTicketCounts[d][rideId] ?? 0);
    const curTotal = Number(db.data.dailyCounts[d][rId] ?? db.data.dailyCounts[d][rideId] ?? 0);

    if (curPkg === 0 && curTkt === 0 && curTotal > 0) {
      curPkg = curTotal;
    }

    let newPkg = curPkg;
    let newTkt = curTkt;

    if (category === 'package') {
      newPkg = Math.max(0, curPkg + numDelta);
    } else if (category === 'ticket') {
      newTkt = Math.max(0, curTkt + numDelta);
    } else {
      newPkg = Math.max(0, curPkg + numDelta);
    }

    const newTotal = newPkg + newTkt;

    db.data.dailyPackageCounts[d][rideId] = newPkg;
    db.data.dailyPackageCounts[d][rId] = newPkg;
    db.data.dailyTicketCounts[d][rideId] = newTkt;
    db.data.dailyTicketCounts[d][rId] = newTkt;
    db.data.dailyCounts[d][rideId] = newTotal;
    db.data.dailyCounts[d][rId] = newTotal;

    const updates: Record<string, number> = {
      [`data/dailyPackageCounts/${d}/${rideId}`]: newPkg,
      [`data/dailyTicketCounts/${d}/${rideId}`]: newTkt,
      [`data/dailyCounts/${d}/${rideId}`]: newTotal
    };

    saveDatabaseToDisk({
      type: 'ride-count-increment',
      date: d,
      rideId: Number(rideId),
      category,
      delta: numDelta,
      newPkg,
      newTkt,
      newTotal,
      updates,
      senderId
    });

    res.json({
      success: true,
      version: db.version,
      date: d,
      rideId: Number(rideId),
      newPkg,
      newTkt,
      newTotal
    });
  });

  // Dedicated Atomic Set Ride Count Endpoint
  app.post('/api/db/set-ride-count', (req, res) => {
    const { date, rideId, category, newCount = 0, senderId } = req.body;
    if (!date || rideId === undefined || !category) {
      return res.status(400).json({ error: 'date, rideId, and category are required' });
    }
    const db = loadDatabase();
    const d = String(date);
    const rId = String(rideId);
    const countVal = Math.max(0, Number(newCount) || 0);

    if (!db.data) db.data = {};
    if (!db.data.dailyCounts) db.data.dailyCounts = {};
    if (!db.data.dailyPackageCounts) db.data.dailyPackageCounts = {};
    if (!db.data.dailyTicketCounts) db.data.dailyTicketCounts = {};

    if (!db.data.dailyCounts[d]) db.data.dailyCounts[d] = {};
    if (!db.data.dailyPackageCounts[d]) db.data.dailyPackageCounts[d] = {};
    if (!db.data.dailyTicketCounts[d]) db.data.dailyTicketCounts[d] = {};

    let curPkg = Number(db.data.dailyPackageCounts[d][rId] ?? db.data.dailyPackageCounts[d][rideId] ?? 0);
    let curTkt = Number(db.data.dailyTicketCounts[d][rId] ?? db.data.dailyTicketCounts[d][rideId] ?? 0);
    const curTotal = Number(db.data.dailyCounts[d][rId] ?? db.data.dailyCounts[d][rideId] ?? 0);

    if (curPkg === 0 && curTkt === 0 && curTotal > 0) curPkg = curTotal;

    let newPkg = curPkg;
    let newTkt = curTkt;
    if (category === 'package') {
      newPkg = countVal;
    } else if (category === 'ticket') {
      newTkt = countVal;
    } else {
      newPkg = countVal;
    }

    const newTotal = newPkg + newTkt;
    db.data.dailyPackageCounts[d][rideId] = newPkg;
    db.data.dailyPackageCounts[d][rId] = newPkg;
    db.data.dailyTicketCounts[d][rideId] = newTkt;
    db.data.dailyTicketCounts[d][rId] = newTkt;
    db.data.dailyCounts[d][rideId] = newTotal;
    db.data.dailyCounts[d][rId] = newTotal;

    const updates: Record<string, number> = {
      [`data/dailyPackageCounts/${d}/${rideId}`]: newPkg,
      [`data/dailyTicketCounts/${d}/${rideId}`]: newTkt,
      [`data/dailyCounts/${d}/${rideId}`]: newTotal
    };

    saveDatabaseToDisk({
      type: 'ride-count-set',
      date: d,
      rideId: Number(rideId),
      category,
      newPkg,
      newTkt,
      newTotal,
      updates,
      senderId
    });

    res.json({
      success: true,
      version: db.version,
      date: d,
      rideId: Number(rideId),
      newPkg,
      newTkt,
      newTotal
    });
  });

  // Concurrency & Logic Monitoring Health Endpoint
  app.get('/api/db/peak-metrics', (req, res) => {
    res.json({
      status: 'ok',
      metrics: {
        ...concurrencyMetrics,
        dbVersion: memoryDb?.version || 1,
        lastUpdated: memoryDb?.lastUpdated,
        clientsCount: sseClients.length,
        serverUptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }
    });
  });

  // Batch sync queue for offline mutations
  app.post('/api/db/sync-queue', (req, res) => {
    const { queue, senderId } = req.body;
    if (!Array.isArray(queue) || queue.length === 0) {
      return res.json({ success: true, processed: 0, version: memoryDb?.version || 1 });
    }
    const db = loadDatabase();
    let processed = 0;
    const appliedUpdates: Record<string, any> = {};

    for (const op of queue) {
      if (!op || typeof op !== 'object') continue;
      const { type, path: pathStr, value, delta, min = 0, updates, basePath = '', date, rideId, category } = op;

      if (type === 'increment-ride-count' && date && rideId !== undefined && category) {
        const d = String(date);
        const rId = String(rideId);
        const numDelta = Number(delta || 1);

        if (!db.data) db.data = {};
        if (!db.data.dailyCounts) db.data.dailyCounts = {};
        if (!db.data.dailyPackageCounts) db.data.dailyPackageCounts = {};
        if (!db.data.dailyTicketCounts) db.data.dailyTicketCounts = {};

        if (!db.data.dailyCounts[d]) db.data.dailyCounts[d] = {};
        if (!db.data.dailyPackageCounts[d]) db.data.dailyPackageCounts[d] = {};
        if (!db.data.dailyTicketCounts[d]) db.data.dailyTicketCounts[d] = {};

        let curPkg = Number(db.data.dailyPackageCounts[d][rId] ?? db.data.dailyPackageCounts[d][rideId] ?? 0);
        let curTkt = Number(db.data.dailyTicketCounts[d][rId] ?? db.data.dailyTicketCounts[d][rideId] ?? 0);
        const curTotal = Number(db.data.dailyCounts[d][rId] ?? db.data.dailyCounts[d][rideId] ?? 0);

        if (curPkg === 0 && curTkt === 0 && curTotal > 0) curPkg = curTotal;

        let newPkg = curPkg;
        let newTkt = curTkt;
        if (category === 'package') {
          newPkg = Math.max(0, curPkg + numDelta);
        } else if (category === 'ticket') {
          newTkt = Math.max(0, curTkt + numDelta);
        }

        const newTotal = newPkg + newTkt;
        db.data.dailyPackageCounts[d][rideId] = newPkg;
        db.data.dailyPackageCounts[d][rId] = newPkg;
        db.data.dailyTicketCounts[d][rideId] = newTkt;
        db.data.dailyTicketCounts[d][rId] = newTkt;
        db.data.dailyCounts[d][rideId] = newTotal;
        db.data.dailyCounts[d][rId] = newTotal;

        appliedUpdates[`data/dailyPackageCounts/${d}/${rideId}`] = newPkg;
        appliedUpdates[`data/dailyTicketCounts/${d}/${rideId}`] = newTkt;
        appliedUpdates[`data/dailyCounts/${d}/${rideId}`] = newTotal;
        processed++;
      } else if (type === 'set-ride-count' && date && rideId !== undefined && category) {
        const d = String(date);
        const rId = String(rideId);
        const countVal = Math.max(0, Number(value) || 0);

        if (!db.data) db.data = {};
        if (!db.data.dailyCounts) db.data.dailyCounts = {};
        if (!db.data.dailyPackageCounts) db.data.dailyPackageCounts = {};
        if (!db.data.dailyTicketCounts) db.data.dailyTicketCounts = {};

        if (!db.data.dailyCounts[d]) db.data.dailyCounts[d] = {};
        if (!db.data.dailyPackageCounts[d]) db.data.dailyPackageCounts[d] = {};
        if (!db.data.dailyTicketCounts[d]) db.data.dailyTicketCounts[d] = {};

        let curPkg = Number(db.data.dailyPackageCounts[d][rId] ?? db.data.dailyPackageCounts[d][rideId] ?? 0);
        let curTkt = Number(db.data.dailyTicketCounts[d][rId] ?? db.data.dailyTicketCounts[d][rideId] ?? 0);
        const curTotal = Number(db.data.dailyCounts[d][rId] ?? db.data.dailyCounts[d][rideId] ?? 0);

        if (curPkg === 0 && curTkt === 0 && curTotal > 0) curPkg = curTotal;

        let newPkg = curPkg;
        let newTkt = curTkt;
        if (category === 'package') newPkg = countVal;
        else if (category === 'ticket') newTkt = countVal;

        const newTotal = newPkg + newTkt;
        db.data.dailyPackageCounts[d][rideId] = newPkg;
        db.data.dailyPackageCounts[d][rId] = newPkg;
        db.data.dailyTicketCounts[d][rideId] = newTkt;
        db.data.dailyTicketCounts[d][rId] = newTkt;
        db.data.dailyCounts[d][rideId] = newTotal;
        db.data.dailyCounts[d][rId] = newTotal;

        appliedUpdates[`data/dailyPackageCounts/${d}/${rideId}`] = newPkg;
        appliedUpdates[`data/dailyTicketCounts/${d}/${rideId}`] = newTkt;
        appliedUpdates[`data/dailyCounts/${d}/${rideId}`] = newTotal;
        processed++;
      } else if (type === 'set' && pathStr !== undefined) {
        setValueByPath(db, pathStr, value);
        appliedUpdates[pathStr] = value;
        processed++;
      } else if (type === 'increment' && pathStr) {
        const currentVal = Number(getValueByPath(db, pathStr)) || 0;
        const newVal = Math.max(min, currentVal + Number(delta || 1));
        setValueByPath(db, pathStr, newVal);
        appliedUpdates[pathStr] = newVal;
        processed++;
      } else if (type === 'update' && updates && typeof updates === 'object') {
        for (const [p, v] of Object.entries(updates)) {
          let full = p;
          if (!p.startsWith('data/') && !p.startsWith('config/')) {
            full = basePath ? `${basePath}/${p}` : p;
          }
          setValueByPath(db, full, v);
          appliedUpdates[full] = v;
        }
        processed++;
      } else if (type === 'remove' && pathStr) {
        if (pathStr.startsWith('data/maintenanceTickets')) {
          const parts = pathStr.split('/').filter(Boolean);
          if (parts.length >= 4) {
            cleanupDeletedTicket(db, parts[3], parts[2]);
          }
        }
        setValueByPath(db, pathStr, null);
        appliedUpdates[pathStr] = null;
        processed++;
      } else if (type === 'delete-ticket') {
        cleanupDeletedTicket(db, op.ticketId, op.date, op.whatsappMessageId, op.rideId, op.problem);
        processed++;
      } else if (type === 'clear-reported-tickets' && op.date) {
        if (db.data?.maintenanceTickets?.[op.date]) {
          for (const [tId, tObjRaw] of Object.entries(db.data.maintenanceTickets[op.date])) {
            const tObj = tObjRaw as any;
            if (tObj && tObj.status === 'reported') {
              if (tObj.id) {
                if (!db.config.deletedTicketIds) db.config.deletedTicketIds = [];
                if (!db.config.deletedTicketIds.includes(tObj.id)) db.config.deletedTicketIds.push(tObj.id);
              }
              if (tObj.whatsappMessageId) {
                if (!db.config.deletedWhatsAppMessageIds) db.config.deletedWhatsAppMessageIds = [];
                if (!db.config.deletedWhatsAppMessageIds.includes(tObj.whatsappMessageId)) db.config.deletedWhatsAppMessageIds.push(tObj.whatsappMessageId);
              }
              delete db.data.maintenanceTickets[op.date][tId];
            }
          }
          if (Object.keys(db.data.maintenanceTickets[op.date]).length === 0) {
            delete db.data.maintenanceTickets[op.date];
          }
        }
        processed++;
      }
    }

    if (Object.keys(appliedUpdates).some(k => k.includes('historyLog'))) {
      trimHistoryLogs(db);
    }

    saveDatabaseToDisk({ type: 'update', updates: appliedUpdates, senderId });
    res.json({ success: true, processed, version: db.version });
  });

  // =========================================================================
  // --- TICKET SALES REST API ---
  // Comprehensive API for physical counter tickets, online tickets, turnstiles,
  // POS terminals, and external theme park ticketing integrations.
  // =========================================================================

  // Interface for standardized ticket sales counter
  interface StandardCounter {
    id: number;
    name: string;
    type: string;
    location: string;
    price: number;
    ticketPrice: number;
    counterNumber: string | number;
    active: boolean;
  }

  // Master key for Full Access operations (can be customized via env var)
  // Helper to verify full access credentials or identify caller.
  // fullAccess stays true because the site gate already rejected callers without a session or a valid key.
  function getTicketApiAccess(req: express.Request) {
    const rawKey = readApiKey(req);
    const isMaster = Boolean(rawKey && TICKET_API_MASTER_KEY && safeEqual(rawKey, TICKET_API_MASTER_KEY));
    return {
      fullAccess: true,
      hasKey: Boolean(rawKey),
      isMasterKey: isMaster,
      caller: isMaster ? 'Master Authenticated Client' : (rawKey ? `API Client (${rawKey.slice(0, 4)}...)` : 'Public API Client')
    };
  }

  // Helper to extract list of counters with standard pricing and defaults
  function getStandardCounters(db: any): StandardCounter[] {
    if (!db || !db.config?.counters) return [];
    if (Array.isArray(db.config.counters)) {
      return db.config.counters.map((c: any) => ({
        id: Number(c.id),
        name: String(c.name || `Counter ${c.id}`),
        type: String(c.type || 'General'),
        location: String(c.location || ''),
        price: Number(c.ticketPrice !== undefined ? c.ticketPrice : (c.price !== undefined ? c.price : 150)),
        ticketPrice: Number(c.ticketPrice !== undefined ? c.ticketPrice : (c.price !== undefined ? c.price : 150)),
        counterNumber: c.counterNumber || c.id,
        active: c.active !== false
      }));
    }
    return Object.entries(db.config.counters).map(([id, c]: any) => ({
      id: Number(id),
      name: String(c.name || `Counter ${id}`),
      type: String(c.type || 'General'),
      location: String(c.location || ''),
      price: Number(c.ticketPrice !== undefined ? c.ticketPrice : (c.price !== undefined ? c.price : 150)),
      ticketPrice: Number(c.ticketPrice !== undefined ? c.ticketPrice : (c.price !== undefined ? c.price : 150)),
      counterNumber: c.counterNumber || id,
      active: c.active !== false
    }));
  }

  // 1. GET /api/ticket-sales/help or /api/ticket-sales/docs - API Documentation
  const ticketSalesApiDocs = {
    service: 'Toggi Fun World - Ticket Sales & Turnstile Full Access REST API',
    version: '2.5.0',
    description: 'Comprehensive Full Access API for querying, recording, updating, voiding, reconciling, managing ticket counters, and exporting turnstile footfall.',
    masterAuthentication: {
      header: 'x-api-key: <TICKET_API_KEY> (or Bearer token / ?apiKey=...); browser sessions need no key',
      note: 'All endpoints operate with full access enabled. Master key provides verified operator badge in audit trails.'
    },
    masterActionMethod: {
      method: 'POST',
      path: '/api/ticket-sales/action',
      description: 'Single universal method to execute ANY ticket sales operation (increment, set, refund, reset, batch, bulk-replace, reconcile, create-counter, update-counter, delete-counter, query, export).'
    },
    endpoints: [
      {
        method: 'POST',
        path: '/api/ticket-sales/action',
        description: 'Universal Full Access dispatcher for all ticketing actions.',
        samplePayload: {
          action: 'record | set | refund | reset | batch | bulk-replace | reconcile | create-counter | update-counter | delete-counter | query',
          counterId: 1,
          count: 5,
          date: '2026-09-27',
          soldBy: 'Central POS Gate 1'
        }
      },
      {
        method: 'GET',
        path: '/api/ticket-sales/full-access',
        aliases: ['/api/ticket-sales/admin'],
        description: 'Administrative full dump: all counters, all multi-day sales matrices, cashier packages, staff assignments, and audit trails.'
      },
      {
        method: 'GET',
        path: '/api/ticket-sales',
        aliases: ['/api/tickets/sales'],
        description: 'Query ticket sales breakdown and totals by date or date-range (?date=YYYY-MM-DD or ?startDate=...&endDate=...).'
      },
      {
        method: 'POST',
        path: '/api/ticket-sales',
        aliases: ['/api/tickets/sales', '/api/ticket-sales/record'],
        description: 'Record ticket sales (increment or set) for a counter with instant live SSE broadcast.'
      },
      {
        method: 'PUT',
        path: '/api/ticket-sales/:date/:counterId',
        aliases: ['/api/ticket-sales'],
        description: 'Full Access idempotent write: directly set/update ticket sales count for any counter and date.'
      },
      {
        method: 'DELETE',
        path: '/api/ticket-sales/:date/:counterId',
        aliases: ['/api/ticket-sales'],
        description: 'Full Access reset/clear ticket sales for a specific counter on a given date.'
      },
      {
        method: 'POST',
        path: '/api/ticket-sales/refund',
        aliases: ['/api/ticket-sales/void'],
        description: 'Process ticket refunds or void transactions with audit log and supervisor authorization note.'
      },
      {
        method: 'POST',
        path: '/api/ticket-sales/batch',
        description: 'Multi-counter atomic sales update in a single transaction.'
      },
      {
        method: 'POST',
        path: '/api/ticket-sales/bulk-replace',
        description: 'Atomic complete matrix overwrite for an operational date (e.g. ERP end-of-shift sync).'
      },
      {
        method: 'POST',
        path: '/api/ticket-sales/reconcile',
        description: 'Reconcile turnstile sensor readings with registered counter counts; flags discrepancies and optionally auto-adjusts.'
      },
      {
        method: 'GET',
        path: '/api/ticket-sales/counters',
        description: 'List all configured ticket sales counters with pricing, status, and today sales count.'
      },
      {
        method: 'POST',
        path: '/api/ticket-sales/counters',
        description: 'Full Access create a new ticket sales counter dynamically.'
      },
      {
        method: 'PUT',
        path: '/api/ticket-sales/counters/:id',
        description: 'Full Access update counter details (tariff price, name, location, active state).'
      },
      {
        method: 'DELETE',
        path: '/api/ticket-sales/counters/:id',
        description: 'Full Access delete or deactivate a ticket counter.'
      },
      {
        method: 'GET',
        path: '/api/ticket-sales/history',
        description: 'Retrieve ticketing audit history logs with filtering.'
      },
      {
        method: 'GET',
        path: '/api/ticket-sales/summary',
        description: 'High-level multi-day sales footfall and revenue analytics summary.'
      },
      {
        method: 'GET',
        path: '/api/ticket-sales/export',
        description: 'Full export of ticket sales data as JSON or downloadable CSV (?format=csv).'
      }
    ]
  };

  app.get(['/api/ticket-sales/help', '/api/ticket-sales/docs'], (req, res) => {
    res.json(ticketSalesApiDocs);
  });

  // 2. GET /api/ticket-sales/counters - List all counters with live counts
  app.get('/api/ticket-sales/counters', (req, res) => {
    const db = loadDatabase();
    const counters = getStandardCounters(db);
    const activeDate = db.config?.appConfig?.activeOperationalDate || getDhakaDateString();
    const todaySales = db.data?.ticketSalesData?.[activeDate] || {};

    const enriched = counters.map((c: StandardCounter) => {
      const count = Number(todaySales[c.id] || todaySales[String(c.id)] || 0);
      return {
        ...c,
        todayCount: count,
        todayRevenue: count * c.ticketPrice
      };
    });

    res.json({
      success: true,
      activeDate,
      totalCounters: enriched.length,
      counters: enriched
    });
  });

  // 3. GET /api/ticket-sales - Query sales data
  app.get(['/api/ticket-sales', '/api/tickets/sales'], (req, res) => {
    try {
      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const activeOperationalDate = db.config?.appConfig?.activeOperationalDate || getDhakaDateString();
      const requestedDate = req.query.date ? String(req.query.date).trim() : '';
      const startDate = req.query.startDate ? String(req.query.startDate).trim() : '';
      const endDate = req.query.endDate ? String(req.query.endDate).trim() : '';
      const counterFilter = req.query.counterId !== undefined ? String(req.query.counterId).trim() : '';

      // Date Range Query Mode
      if (startDate && endDate) {
        const ticketSalesData = db.data?.ticketSalesData || {};
        const dailyBreakdown: Record<string, any> = {};
        let grandTotalTickets = 0;
        let grandTotalRevenue = 0;

        const allDates = Object.keys(ticketSalesData)
          .filter(d => d >= startDate && d <= endDate)
          .sort();

        for (const d of allDates) {
          const daySales = ticketSalesData[d] || {};
          let dayTotalTickets = 0;
          let dayTotalRevenue = 0;
          const counterBreakdown: any[] = [];

          for (const c of counters) {
            if (counterFilter && String(c.id) !== counterFilter) continue;
            const count = Number(daySales[c.id] || daySales[String(c.id)] || 0);
            const subtotal = count * c.ticketPrice;
            dayTotalTickets += count;
            dayTotalRevenue += subtotal;
            counterBreakdown.push({
              counterId: c.id,
              counterName: c.name,
              count,
              unitPrice: c.ticketPrice,
              subtotal
            });
          }

          dailyBreakdown[d] = {
            totalTickets: dayTotalTickets,
            totalRevenue: dayTotalRevenue,
            counters: counterBreakdown
          };
          grandTotalTickets += dayTotalTickets;
          grandTotalRevenue += dayTotalRevenue;
        }

        return res.json({
          success: true,
          mode: 'date-range',
          startDate,
          endDate,
          grandTotalTickets,
          grandTotalRevenue,
          currency: db.config?.appConfig?.currency || 'BDT',
          daysCount: allDates.length,
          dailyBreakdown
        });
      }

      // Single Date Query Mode
      const targetDate = requestedDate || activeOperationalDate;
      const daySales = db.data?.ticketSalesData?.[targetDate] || {};
      const dayAssignments = db.data?.ticketSalesAssignments?.[targetDate] || {};

      let totalTicketsSold = 0;
      let totalRevenue = 0;

      const countersSummary = counters
        .filter((c: StandardCounter) => !counterFilter || String(c.id) === counterFilter)
        .map((c: StandardCounter) => {
          const count = Number(daySales[c.id] || daySales[String(c.id)] || 0);
          const subtotal = count * c.ticketPrice;
          totalTicketsSold += count;
          totalRevenue += subtotal;

          // Assigned staff IDs
          const assignedStaffIds = Array.isArray(dayAssignments[c.id]) 
            ? dayAssignments[c.id] 
            : (Array.isArray(dayAssignments[String(c.id)]) ? dayAssignments[String(c.id)] : []);

          return {
            id: c.id,
            name: c.name,
            type: c.type,
            location: c.location,
            unitPrice: c.ticketPrice,
            count,
            subtotal,
            active: c.active,
            assignedStaffIds
          };
        });

      // Optional cashier package sales summary for that date
      const cashierSales = db.data?.packageSales?.[targetDate] || {};
      let totalCashierPackageRevenue = 0;
      let totalCashierPackagesCount = 0;
      for (const pSale of Object.values(cashierSales) as any[]) {
        if (pSale && typeof pSale === 'object') {
          if (pSale.total) totalCashierPackageRevenue += Number(pSale.total) || 0;
          if (pSale.packages) {
            for (const q of Object.values(pSale.packages)) {
              totalCashierPackagesCount += Number(q) || 0;
            }
          }
        }
      }

      res.json({
        success: true,
        date: targetDate,
        isOperationalDate: targetDate === activeOperationalDate,
        totalTicketsSold,
        totalRevenue,
        currency: db.config?.appConfig?.currency || 'BDT',
        counters: countersSummary,
        cashierSalesSummary: {
          totalPackageRevenue: totalCashierPackageRevenue,
          totalPackagesSold: totalCashierPackagesCount,
          activeCashiersCount: Object.keys(cashierSales).length
        }
      });
    } catch (err: any) {
      console.error('[Ticket Sales API] GET error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve ticket sales', details: err?.message });
    }
  });

  // 4. POST /api/ticket-sales - Record ticket sale
  app.post(['/api/ticket-sales', '/api/tickets/sales', '/api/ticket-sales/record'], (req, res) => {
    try {
      const { 
        counterId, 
        count, 
        action = 'increment', 
        date, 
        unitPrice, 
        soldBy, 
        notes, 
        senderId = 'ticket-sales-api' 
      } = req.body || {};

      if (counterId === undefined || counterId === null || String(counterId).trim() === '') {
        return res.status(400).json({ success: false, error: 'counterId is required' });
      }

      const numCount = Number(count);
      if (isNaN(numCount) || !Number.isFinite(numCount)) {
        return res.status(400).json({ success: false, error: 'count must be a valid number' });
      }

      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const matchedCounter = counters.find((c: StandardCounter) => 
        String(c.id) === String(counterId).trim() || 
        c.name.toLowerCase() === String(counterId).trim().toLowerCase()
      );

      if (!matchedCounter) {
        return res.status(404).json({ 
          success: false, 
          error: `Counter with ID or name "${counterId}" not found.`,
          availableCounters: counters.map((c: StandardCounter) => ({ id: c.id, name: c.name }))
        });
      }

      const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
        ? date.trim()
        : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

      const currentVal = Number(
        db.data.ticketSalesData[targetDate][matchedCounter.id] !== undefined
          ? db.data.ticketSalesData[targetDate][matchedCounter.id]
          : (db.data.ticketSalesData[targetDate][String(matchedCounter.id)] || 0)
      );

      let newCount = currentVal;
      let delta = 0;

      if (action === 'set') {
        newCount = Math.max(0, Math.floor(numCount));
        delta = newCount - currentVal;
      } else {
        // Default: increment
        delta = Math.floor(numCount);
        newCount = Math.max(0, currentVal + delta);
      }

      db.data.ticketSalesData[targetDate][matchedCounter.id] = newCount;
      db.data.ticketSalesData[targetDate][String(matchedCounter.id)] = newCount;

      const effectivePrice = unitPrice !== undefined && Number(unitPrice) >= 0 
        ? Number(unitPrice) 
        : matchedCounter.ticketPrice;
      const subtotalRevenue = newCount * effectivePrice;

      // Add audit history log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      const operatorLabel = soldBy ? String(soldBy).trim() : 'Turnstile / POS API';
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: operatorLabel,
        action: 'TICKET_SALE_RECORDED',
        details: `[Ticket Sales API] ${matchedCounter.name}: ${delta >= 0 ? `+${delta}` : delta} tickets (New Total: ${newCount}) ${notes ? `[Notes: ${notes}]` : ''}`
      };
      db.data.historyLog[historyId] = historyEntry;
      trimHistoryLogs(db);

      const targetPath = `data/ticketSalesData/${targetDate}/${matchedCounter.id}`;

      // Persist to SQLite and JSON disk
      saveDatabaseToDisk({
        type: 'set',
        path: targetPath,
        value: newCount,
        senderId
      });

      // Broadcast real-time update event
      broadcastMutation({
        type: 'ticket-sale-updated',
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        delta,
        newCount,
        unitPrice: effectivePrice,
        subtotalRevenue,
        senderId
      });

      // Calculate new day total
      let totalDayTickets = 0;
      let totalDayRevenue = 0;
      for (const c of counters) {
        const cCount = Number(db.data.ticketSalesData[targetDate][c.id] || 0);
        totalDayTickets += cCount;
        totalDayRevenue += cCount * c.ticketPrice;
      }

      console.log(`[Ticket Sales API] Recorded sale for ${matchedCounter.name}: delta=${delta}, newTotal=${newCount} (Date: ${targetDate})`);

      res.status(200).json({
        success: true,
        message: 'Ticket sale recorded successfully',
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        action,
        delta,
        previousCount: currentVal,
        newTotalCount: newCount,
        unitPrice: effectivePrice,
        subtotalRevenue,
        totalDayTickets,
        totalDayRevenue,
        currency: db.config?.appConfig?.currency || 'BDT',
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Ticket Sales API] POST error:', err);
      res.status(500).json({ success: false, error: 'Failed to record ticket sale', details: err?.message });
    }
  });

  // 5. POST /api/ticket-sales/batch - Multi-counter batch recording
  app.post('/api/ticket-sales/batch', (req, res) => {
    try {
      const { sales, date, soldBy, senderId = 'ticket-sales-batch-api' } = req.body || {};

      if (!Array.isArray(sales) || sales.length === 0) {
        return res.status(400).json({ success: false, error: 'sales array is required and must not be empty' });
      }

      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
        ? date.trim()
        : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

      const results: any[] = [];
      const appliedUpdates: Record<string, any> = {};

      for (const item of sales) {
        if (!item || item.counterId === undefined) continue;
        const matched = counters.find((c: StandardCounter) => 
          String(c.id) === String(item.counterId).trim() || 
          c.name.toLowerCase() === String(item.counterId).trim().toLowerCase()
        );
        if (!matched) continue;

        const countVal = Number(item.count) || 0;
        const currentVal = Number(db.data.ticketSalesData[targetDate][matched.id] || 0);
        let newCount = currentVal;
        let delta = 0;

        if (item.action === 'set') {
          newCount = Math.max(0, Math.floor(countVal));
          delta = newCount - currentVal;
        } else {
          delta = Math.floor(countVal);
          newCount = Math.max(0, currentVal + delta);
        }

        db.data.ticketSalesData[targetDate][matched.id] = newCount;
        db.data.ticketSalesData[targetDate][String(matched.id)] = newCount;
        appliedUpdates[`data/ticketSalesData/${targetDate}/${matched.id}`] = newCount;

        results.push({
          counterId: matched.id,
          counterName: matched.name,
          delta,
          previousCount: currentVal,
          newTotalCount: newCount,
          subtotalRevenue: newCount * matched.ticketPrice
        });
      }

      if (results.length > 0) {
        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now();
        const historyEntry = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: soldBy ? String(soldBy).trim() : 'Batch Ticketing POS',
          action: 'BATCH_TICKET_SALES_RECORDED',
          details: `[Batch Sales API] Recorded sales across ${results.length} counters`
        };
        db.data.historyLog[historyId] = historyEntry;
        appliedUpdates[`data/historyLog/${historyId}`] = historyEntry;
        trimHistoryLogs(db);

        saveDatabaseToDisk({
          type: 'update',
          updates: appliedUpdates,
          senderId
        });
      }

      res.status(200).json({
        success: true,
        message: `Successfully processed batch ticket sales for ${results.length} counters`,
        date: targetDate,
        processedCountersCount: results.length,
        sales: results
      });
    } catch (err: any) {
      console.error('[Ticket Sales API] Batch error:', err);
      res.status(500).json({ success: false, error: 'Failed to process batch ticket sales', details: err?.message });
    }
  });

  // 6. GET /api/ticket-sales/summary - Analytical footfall & revenue summary
  app.get('/api/ticket-sales/summary', (req, res) => {
    try {
      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const ticketSalesData = db.data?.ticketSalesData || {};
      const dates = Object.keys(ticketSalesData).sort();

      let grandTotalTickets = 0;
      let grandTotalRevenue = 0;
      const counterTotals: Record<number, { name: string; type: string; totalTickets: number; totalRevenue: number }> = {};

      counters.forEach((c: StandardCounter) => {
        counterTotals[c.id] = {
          name: c.name,
          type: c.type,
          totalTickets: 0,
          totalRevenue: 0
        };
      });

      for (const d of dates) {
        const daySales = ticketSalesData[d] || {};
        for (const c of counters) {
          const count = Number(daySales[c.id] || daySales[String(c.id)] || 0);
          const revenue = count * c.ticketPrice;
          grandTotalTickets += count;
          grandTotalRevenue += revenue;
          if (counterTotals[c.id]) {
            counterTotals[c.id].totalTickets += count;
            counterTotals[c.id].totalRevenue += revenue;
          }
        }
      }

      res.json({
        success: true,
        totalRecordedOperationalDates: dates.length,
        grandTotalTickets,
        grandTotalRevenue,
        currency: db.config?.appConfig?.currency || 'BDT',
        counterBreakdown: Object.values(counterTotals)
      });
    } catch (err: any) {
      console.error('[Ticket Sales API] Summary error:', err);
      res.status(500).json({ success: false, error: 'Failed to generate ticket sales summary', details: err?.message });
    }
  });

  // =========================================================================
  // --- FULL ACCESS TICKET SALES API SUITE ---
  // =========================================================================

  // 7. GET /api/ticket-sales/full-access or /api/ticket-sales/admin
  // Full administrative dataset: all counters, multi-day sales matrices,
  // staff assignments, package sales, and audit trails.
  app.get(['/api/ticket-sales/full-access', '/api/ticket-sales/admin'], (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const activeDate = db.config?.appConfig?.activeOperationalDate || getDhakaDateString();
      const ticketSalesData = db.data?.ticketSalesData || {};
      const assignments = db.data?.ticketSalesAssignments || {};
      const packageSales = db.data?.packageSales || {};
      const historyLog = db.data?.historyLog || {};

      // Filter history log for ticket sales events
      const ticketHistory = Object.values(historyLog)
        .filter((h: any) => h && (
          (h.action && String(h.action).includes('TICKET')) ||
          (h.details && /ticket|counter|turnstile|pos/i.test(String(h.details)))
        ))
        .sort((a: any, b: any) => (b.id || 0) - (a.id || 0))
        .slice(0, 100);

      // Multi-day summaries
      let grandTotalTickets = 0;
      let grandTotalRevenue = 0;
      const allDates = Object.keys(ticketSalesData).sort();

      for (const d of allDates) {
        const daySales = ticketSalesData[d] || {};
        for (const c of counters) {
          const count = Number(daySales[c.id] || daySales[String(c.id)] || 0);
          grandTotalTickets += count;
          grandTotalRevenue += count * c.ticketPrice;
        }
      }

      res.json({
        success: true,
        fullAccess: true,
        caller: access.caller,
        isMasterKey: access.isMasterKey,
        activeOperationalDate: activeDate,
        currency: db.config?.appConfig?.currency || 'BDT',
        stats: {
          totalConfiguredCounters: counters.length,
          totalOperationalDatesRecorded: allDates.length,
          grandTotalTicketsSold: grandTotalTickets,
          grandTotalRevenue: grandTotalRevenue
        },
        counters,
        ticketSalesData,
        assignments,
        packageSalesSummary: {
          totalDatesWithPackageSales: Object.keys(packageSales).length,
          activeCashiersToday: Object.keys(packageSales[activeDate] || {}).length
        },
        recentAuditLogs: ticketHistory
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Admin error:', err);
      res.status(500).json({ success: false, error: 'Failed to fetch full access ticket sales state', details: err?.message });
    }
  });

  // 8. PUT /api/ticket-sales/:date?/:counterId? or PUT /api/ticket-sales
  // Full Access idempotent write: directly set/update ticket sales count for any counter and date.
  app.put(['/api/ticket-sales/:date/:counterId', '/api/ticket-sales'], (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const db = loadDatabase();
      const counters = getStandardCounters(db);

      const targetCounterId = req.params.counterId || req.body?.counterId;
      const targetDate = req.params.date || req.body?.date || db.config?.appConfig?.activeOperationalDate || getDhakaDateString();
      const countInput = req.body?.count !== undefined ? req.body.count : req.body?.value;
      const unitPriceInput = req.body?.unitPrice;
      const soldBy = req.body?.soldBy || access.caller;
      const notes = req.body?.notes || '';
      const senderId = req.body?.senderId || 'ticket-sales-full-access-put';

      if (targetCounterId === undefined || targetCounterId === null || String(targetCounterId).trim() === '') {
        return res.status(400).json({ success: false, error: 'counterId is required in URL path or request body' });
      }

      const numCount = Number(countInput);
      if (isNaN(numCount) || !Number.isFinite(numCount) || numCount < 0) {
        return res.status(400).json({ success: false, error: 'count must be a non-negative number' });
      }

      const matchedCounter = counters.find((c: StandardCounter) =>
        String(c.id) === String(targetCounterId).trim() ||
        c.name.toLowerCase() === String(targetCounterId).trim().toLowerCase()
      );

      if (!matchedCounter) {
        return res.status(404).json({
          success: false,
          error: `Counter with ID or name "${targetCounterId}" not found.`,
          availableCounters: counters.map((c: StandardCounter) => ({ id: c.id, name: c.name }))
        });
      }

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

      const currentVal = Number(db.data.ticketSalesData[targetDate][matchedCounter.id] || 0);
      const newCount = Math.floor(numCount);
      const delta = newCount - currentVal;

      db.data.ticketSalesData[targetDate][matchedCounter.id] = newCount;
      db.data.ticketSalesData[targetDate][String(matchedCounter.id)] = newCount;

      const effectivePrice = unitPriceInput !== undefined && Number(unitPriceInput) >= 0
        ? Number(unitPriceInput)
        : matchedCounter.ticketPrice;
      const subtotalRevenue = newCount * effectivePrice;

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: String(soldBy).trim(),
        action: 'TICKET_SALE_FULL_ACCESS_SET',
        details: `[Full Access API] Set ${matchedCounter.name} count to ${newCount} (was ${currentVal}, delta ${delta >= 0 ? `+${delta}` : delta}) on ${targetDate}. ${notes ? `[Notes: ${notes}]` : ''}`
      };
      db.data.historyLog[historyId] = historyEntry;
      trimHistoryLogs(db);

      // Persist and broadcast
      saveDatabaseToDisk({
        type: 'set',
        path: `data/ticketSalesData/${targetDate}/${matchedCounter.id}`,
        value: newCount,
        senderId
      });

      broadcastMutation({
        type: 'ticket-sale-updated',
        method: 'PUT',
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        delta,
        newCount,
        unitPrice: effectivePrice,
        subtotalRevenue,
        senderId
      });

      res.status(200).json({
        success: true,
        fullAccess: true,
        message: `Counter ${matchedCounter.name} updated to ${newCount} tickets`,
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        previousCount: currentVal,
        newTotalCount: newCount,
        delta,
        unitPrice: effectivePrice,
        subtotalRevenue,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] PUT error:', err);
      res.status(500).json({ success: false, error: 'Failed to update ticket sales via PUT', details: err?.message });
    }
  });

  // 9. DELETE /api/ticket-sales/:date?/:counterId? or DELETE /api/ticket-sales
  // Full Access reset / clear ticket sales for a specific counter on a given date.
  app.delete(['/api/ticket-sales/:date/:counterId', '/api/ticket-sales'], (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const db = loadDatabase();
      const counters = getStandardCounters(db);

      const targetCounterId = req.params.counterId || req.query.counterId || req.body?.counterId;
      const targetDate = req.params.date || req.query.date || req.body?.date || db.config?.appConfig?.activeOperationalDate || getDhakaDateString();
      const reason = req.query.reason || req.body?.reason || 'Full Access administrative reset';
      const authorizedBy = req.query.authorizedBy || req.body?.authorizedBy || access.caller;
      const senderId = req.body?.senderId || 'ticket-sales-full-access-delete';

      if (targetCounterId === undefined || targetCounterId === null || String(targetCounterId).trim() === '') {
        return res.status(400).json({ success: false, error: 'counterId is required in URL path, query params, or body' });
      }

      const matchedCounter = counters.find((c: StandardCounter) =>
        String(c.id) === String(targetCounterId).trim() ||
        c.name.toLowerCase() === String(targetCounterId).trim().toLowerCase()
      );

      if (!matchedCounter) {
        return res.status(404).json({ success: false, error: `Counter "${targetCounterId}" not found` });
      }

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

      const previousVal = Number(db.data.ticketSalesData[targetDate][matchedCounter.id] || 0);

      // Reset to 0
      db.data.ticketSalesData[targetDate][matchedCounter.id] = 0;
      db.data.ticketSalesData[targetDate][String(matchedCounter.id)] = 0;

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: String(authorizedBy).trim(),
        action: 'TICKET_SALE_RESET_FULL_ACCESS',
        details: `[Full Access API] Reset ${matchedCounter.name} count to 0 (cleared ${previousVal} tickets) on ${targetDate}. Reason: ${reason}`
      };
      db.data.historyLog[historyId] = historyEntry;
      trimHistoryLogs(db);

      // Persist and broadcast
      saveDatabaseToDisk({
        type: 'set',
        path: `data/ticketSalesData/${targetDate}/${matchedCounter.id}`,
        value: 0,
        senderId
      });

      broadcastMutation({
        type: 'ticket-sale-cleared',
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        previousCount: previousVal,
        newCount: 0,
        reason: String(reason),
        senderId
      });

      res.status(200).json({
        success: true,
        fullAccess: true,
        message: `Ticket sales for ${matchedCounter.name} on ${targetDate} reset to 0`,
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        clearedCount: previousVal,
        newTotalCount: 0,
        reason: String(reason),
        authorizedBy: String(authorizedBy),
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] DELETE error:', err);
      res.status(500).json({ success: false, error: 'Failed to reset ticket sales via DELETE', details: err?.message });
    }
  });

  // 10. POST /api/ticket-sales/refund (alias /api/ticket-sales/void)
  // Full Access refund / void transaction
  app.post(['/api/ticket-sales/refund', '/api/ticket-sales/void'], (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const {
        counterId,
        count = 1,
        reason = 'Customer cancellation',
        refundAmount,
        authorizedBy = access.caller,
        date,
        notes = '',
        senderId = 'ticket-sales-refund-api'
      } = req.body || {};

      if (counterId === undefined || counterId === null || String(counterId).trim() === '') {
        return res.status(400).json({ success: false, error: 'counterId is required' });
      }

      const numCount = Number(count);
      if (isNaN(numCount) || numCount <= 0) {
        return res.status(400).json({ success: false, error: 'count must be a positive number to refund' });
      }

      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const matchedCounter = counters.find((c: StandardCounter) =>
        String(c.id) === String(counterId).trim() ||
        c.name.toLowerCase() === String(counterId).trim().toLowerCase()
      );

      if (!matchedCounter) {
        return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });
      }

      const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
        ? date.trim()
        : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

      const currentVal = Number(db.data.ticketSalesData[targetDate][matchedCounter.id] || 0);
      const refundQuantity = Math.floor(numCount);
      const newCount = Math.max(0, currentVal - refundQuantity);
      const actualDeducted = currentVal - newCount;
      const calculatedRefundAmount = refundAmount !== undefined ? Number(refundAmount) : (actualDeducted * matchedCounter.ticketPrice);

      db.data.ticketSalesData[targetDate][matchedCounter.id] = newCount;
      db.data.ticketSalesData[targetDate][String(matchedCounter.id)] = newCount;

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: String(authorizedBy).trim(),
        action: 'TICKET_SALE_REFUND_PROCESSED',
        details: `[Refund API] Voided ${actualDeducted} tickets for ${matchedCounter.name} on ${targetDate}. Refund: ${calculatedRefundAmount} BDT. Reason: ${reason} ${notes ? `[Notes: ${notes}]` : ''}`
      };
      db.data.historyLog[historyId] = historyEntry;
      trimHistoryLogs(db);

      // Persist and broadcast
      saveDatabaseToDisk({
        type: 'set',
        path: `data/ticketSalesData/${targetDate}/${matchedCounter.id}`,
        value: newCount,
        senderId
      });

      broadcastMutation({
        type: 'ticket-sale-refunded',
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        refundQuantity: actualDeducted,
        refundAmount: calculatedRefundAmount,
        newCount,
        reason: String(reason),
        authorizedBy: String(authorizedBy),
        senderId
      });

      res.status(200).json({
        success: true,
        fullAccess: true,
        message: `Successfully processed refund for ${actualDeducted} ticket(s) on ${matchedCounter.name}`,
        date: targetDate,
        counterId: matchedCounter.id,
        counterName: matchedCounter.name,
        refundQuantity: actualDeducted,
        refundAmount: calculatedRefundAmount,
        previousCount: currentVal,
        newTotalCount: newCount,
        reason: String(reason),
        authorizedBy: String(authorizedBy),
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Refund error:', err);
      res.status(500).json({ success: false, error: 'Failed to process ticket refund', details: err?.message });
    }
  });

  // 11. POST /api/ticket-sales/bulk-replace
  // Atomic complete matrix overwrite for an operational date (e.g. ERP end-of-shift sync)
  app.post('/api/ticket-sales/bulk-replace', (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const { date, sales, authorizedBy = access.caller, notes = '', senderId = 'ticket-sales-bulk-replace-api' } = req.body || {};

      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
        ? date.trim()
        : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

      if (!sales || (typeof sales !== 'object')) {
        return res.status(400).json({ success: false, error: 'sales object or array is required' });
      }

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      const newDaySales: Record<string, number> = {};
      const appliedUpdates: Record<string, any> = {};
      const results: any[] = [];

      // If array format: [{ counterId: 1, count: 50 }, ...]
      if (Array.isArray(sales)) {
        for (const item of sales) {
          if (!item || item.counterId === undefined) continue;
          const matched = counters.find((c: StandardCounter) =>
            String(c.id) === String(item.counterId).trim() ||
            c.name.toLowerCase() === String(item.counterId).trim().toLowerCase()
          );
          if (!matched) continue;
          const countVal = Math.max(0, Math.floor(Number(item.count) || 0));
          newDaySales[matched.id] = countVal;
          newDaySales[String(matched.id)] = countVal;
          results.push({ counterId: matched.id, counterName: matched.name, newTotalCount: countVal });
        }
      } else {
        // If object format: { "1": 50, "2": 75 }
        for (const [key, val] of Object.entries(sales)) {
          const matched = counters.find((c: StandardCounter) =>
            String(c.id) === String(key).trim() ||
            c.name.toLowerCase() === String(key).trim().toLowerCase()
          );
          if (!matched) continue;
          const countVal = Math.max(0, Math.floor(Number(val) || 0));
          newDaySales[matched.id] = countVal;
          newDaySales[String(matched.id)] = countVal;
          results.push({ counterId: matched.id, counterName: matched.name, newTotalCount: countVal });
        }
      }

      db.data.ticketSalesData[targetDate] = newDaySales;
      appliedUpdates[`data/ticketSalesData/${targetDate}`] = newDaySales;

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: String(authorizedBy).trim(),
        action: 'TICKET_SALES_BULK_REPLACED',
        details: `[Bulk Replace API] Overwrote ticket sales matrix for ${targetDate} across ${results.length} counters. ${notes ? `[Notes: ${notes}]` : ''}`
      };
      db.data.historyLog[historyId] = historyEntry;
      appliedUpdates[`data/historyLog/${historyId}`] = historyEntry;
      trimHistoryLogs(db);

      saveDatabaseToDisk({
        type: 'update',
        updates: appliedUpdates,
        senderId
      });

      broadcastMutation({
        type: 'ticket-sales-bulk-replaced',
        date: targetDate,
        updatedCountersCount: results.length,
        sales: newDaySales,
        authorizedBy: String(authorizedBy),
        senderId
      });

      res.status(200).json({
        success: true,
        fullAccess: true,
        message: `Successfully bulk-replaced ticket sales matrix for ${targetDate}`,
        date: targetDate,
        updatedCountersCount: results.length,
        counters: results,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Bulk-replace error:', err);
      res.status(500).json({ success: false, error: 'Failed to bulk-replace ticket sales', details: err?.message });
    }
  });

  // 12. POST /api/ticket-sales/reconcile
  // Reconcile turnstile sensor readings with registered counter counts; flags discrepancies and optionally auto-adjusts
  app.post('/api/ticket-sales/reconcile', (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const {
        date,
        turnstileReadings = {},
        applyAdjustment = false,
        authorizedBy = access.caller,
        notes = '',
        senderId = 'ticket-sales-reconcile-api'
      } = req.body || {};

      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
        ? date.trim()
        : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

      if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
      if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

      const daySales = db.data.ticketSalesData[targetDate];
      const reconciliationReport: any[] = [];
      let totalDiscrepancies = 0;
      let totalTurnstileFootfall = 0;
      let totalRegisteredSales = 0;
      const appliedUpdates: Record<string, any> = {};

      for (const c of counters) {
        const registeredCount = Number(daySales[c.id] || daySales[String(c.id)] || 0);
        const turnstileCount = turnstileReadings[c.id] !== undefined
          ? Number(turnstileReadings[c.id])
          : (turnstileReadings[String(c.id)] !== undefined ? Number(turnstileReadings[String(c.id)]) : null);

        totalRegisteredSales += registeredCount;

        if (turnstileCount !== null) {
          totalTurnstileFootfall += turnstileCount;
          const variance = turnstileCount - registeredCount;
          if (variance !== 0) totalDiscrepancies++;

          const itemReport: any = {
            counterId: c.id,
            counterName: c.name,
            registeredSales: registeredCount,
            turnstileFootfall: turnstileCount,
            variance,
            status: variance === 0 ? 'MATCHED' : (variance > 0 ? 'OVER_ENTRIES' : 'UNDER_ENTRIES')
          };

          if (applyAdjustment && variance !== 0) {
            daySales[c.id] = turnstileCount;
            daySales[String(c.id)] = turnstileCount;
            appliedUpdates[`data/ticketSalesData/${targetDate}/${c.id}`] = turnstileCount;
            itemReport.adjustedTo = turnstileCount;
          }

          reconciliationReport.push(itemReport);
        }
      }

      if (applyAdjustment && Object.keys(appliedUpdates).length > 0) {
        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now();
        const historyEntry = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: String(authorizedBy).trim(),
          action: 'TICKET_SALES_RECONCILED_AND_ADJUSTED',
          details: `[Reconcile API] Adjusted ${Object.keys(appliedUpdates).length} counters to match turnstile readings on ${targetDate}. ${notes ? `[Notes: ${notes}]` : ''}`
        };
        db.data.historyLog[historyId] = historyEntry;
        appliedUpdates[`data/historyLog/${historyId}`] = historyEntry;
        trimHistoryLogs(db);

        saveDatabaseToDisk({
          type: 'update',
          updates: appliedUpdates,
          senderId
        });

        broadcastMutation({
          type: 'ticket-sales-reconciled',
          date: targetDate,
          reconciledCounters: reconciliationReport.length,
          adjustmentsApplied: true,
          senderId
        });
      }

      res.status(200).json({
        success: true,
        fullAccess: true,
        date: targetDate,
        totalRegisteredSales,
        totalTurnstileFootfall,
        netVariance: totalTurnstileFootfall - totalRegisteredSales,
        countersEvaluated: reconciliationReport.length,
        discrepanciesCount: totalDiscrepancies,
        adjustmentsApplied: Boolean(applyAdjustment),
        report: reconciliationReport,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Reconcile error:', err);
      res.status(500).json({ success: false, error: 'Failed to reconcile ticket sales', details: err?.message });
    }
  });

  // 13. POST /api/ticket-sales/counters - Full Access Create Counter
  app.post('/api/ticket-sales/counters', (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const { id, name, ticketPrice = 150, price = 150, type = 'General', location = '', counterNumber, active = true } = req.body || {};

      if (!name || String(name).trim() === '') {
        return res.status(400).json({ success: false, error: 'name is required for counter creation' });
      }

      const db = loadDatabase();
      if (!db.config) db.config = {};
      if (!db.config.counters) db.config.counters = {};

      const existingCounters = getStandardCounters(db);
      let newId = Number(id);
      if (!newId || isNaN(newId)) {
        const highestId = existingCounters.reduce((max, c) => Math.max(max, c.id), 0);
        newId = highestId + 1;
      }

      const finalPrice = Number(ticketPrice !== undefined ? ticketPrice : price);
      const counterObj = {
        id: newId,
        name: String(name).trim(),
        ticketPrice: finalPrice,
        price: finalPrice,
        type: String(type).trim(),
        location: String(location).trim(),
        counterNumber: counterNumber || newId,
        active: Boolean(active)
      };

      if (Array.isArray(db.config.counters)) {
        db.config.counters.push(counterObj);
      } else {
        db.config.counters[newId] = counterObj;
      }

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      db.data.historyLog[historyId] = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: access.caller,
        action: 'TICKET_COUNTER_CREATED_FULL_ACCESS',
        details: `[Counter API] Created counter ${counterObj.name} (ID: ${newId}, Tariff: ${finalPrice} BDT)`
      };
      trimHistoryLogs(db);

      saveDatabaseToDisk({
        type: 'set',
        path: `config/counters/${newId}`,
        value: counterObj
      });

      broadcastMutation({
        type: 'counter-created',
        counter: counterObj
      });

      res.status(201).json({
        success: true,
        fullAccess: true,
        message: `Counter "${counterObj.name}" created successfully`,
        counter: counterObj
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Create Counter error:', err);
      res.status(500).json({ success: false, error: 'Failed to create counter', details: err?.message });
    }
  });

  // 14. PUT /api/ticket-sales/counters/:id - Full Access Update Counter
  app.put('/api/ticket-sales/counters/:id', (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const targetId = Number(req.params.id);
      if (!targetId || isNaN(targetId)) {
        return res.status(400).json({ success: false, error: 'Valid counter ID is required in URL' });
      }

      const db = loadDatabase();
      if (!db.config || !db.config.counters) {
        return res.status(404).json({ success: false, error: 'No counters configured' });
      }

      let found = false;
      let updatedCounter: any = null;

      if (Array.isArray(db.config.counters)) {
        const idx = db.config.counters.findIndex((c: any) => Number(c.id) === targetId);
        if (idx !== -1) {
          const prev = db.config.counters[idx];
          const newPrice = req.body?.ticketPrice !== undefined ? Number(req.body.ticketPrice) : (req.body?.price !== undefined ? Number(req.body.price) : prev.ticketPrice || prev.price || 150);
          db.config.counters[idx] = {
            ...prev,
            name: req.body?.name !== undefined ? String(req.body.name).trim() : prev.name,
            ticketPrice: newPrice,
            price: newPrice,
            type: req.body?.type !== undefined ? String(req.body.type).trim() : prev.type,
            location: req.body?.location !== undefined ? String(req.body.location).trim() : prev.location,
            counterNumber: req.body?.counterNumber !== undefined ? req.body.counterNumber : prev.counterNumber,
            active: req.body?.active !== undefined ? Boolean(req.body.active) : prev.active
          };
          updatedCounter = db.config.counters[idx];
          found = true;
        }
      } else if (db.config.counters[targetId]) {
        const prev = db.config.counters[targetId];
        const newPrice = req.body?.ticketPrice !== undefined ? Number(req.body.ticketPrice) : (req.body?.price !== undefined ? Number(req.body.price) : prev.ticketPrice || prev.price || 150);
        db.config.counters[targetId] = {
          ...prev,
          name: req.body?.name !== undefined ? String(req.body.name).trim() : prev.name,
          ticketPrice: newPrice,
          price: newPrice,
          type: req.body?.type !== undefined ? String(req.body.type).trim() : prev.type,
          location: req.body?.location !== undefined ? String(req.body.location).trim() : prev.location,
          counterNumber: req.body?.counterNumber !== undefined ? req.body.counterNumber : prev.counterNumber,
          active: req.body?.active !== undefined ? Boolean(req.body.active) : prev.active
        };
        updatedCounter = { id: targetId, ...db.config.counters[targetId] };
        found = true;
      }

      if (!found) {
        return res.status(404).json({ success: false, error: `Counter ID ${targetId} not found` });
      }

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      db.data.historyLog[historyId] = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: access.caller,
        action: 'TICKET_COUNTER_UPDATED_FULL_ACCESS',
        details: `[Counter API] Updated counter ${updatedCounter.name} (ID: ${targetId}, Price: ${updatedCounter.ticketPrice} BDT, Active: ${updatedCounter.active})`
      };
      trimHistoryLogs(db);

      saveDatabaseToDisk({
        type: 'set',
        path: `config/counters/${targetId}`,
        value: updatedCounter
      });

      broadcastMutation({
        type: 'counter-updated',
        counter: updatedCounter
      });

      res.status(200).json({
        success: true,
        fullAccess: true,
        message: `Counter ${targetId} updated successfully`,
        counter: updatedCounter
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Update Counter error:', err);
      res.status(500).json({ success: false, error: 'Failed to update counter', details: err?.message });
    }
  });

  // 15. DELETE /api/ticket-sales/counters/:id - Full Access Delete or Deactivate Counter
  app.delete('/api/ticket-sales/counters/:id', (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const targetId = Number(req.params.id);
      const hardDelete = req.query.hardDelete === 'true' || req.body?.hardDelete === true;

      const db = loadDatabase();
      if (!db.config || !db.config.counters) {
        return res.status(404).json({ success: false, error: 'No counters configured' });
      }

      let removedName = `Counter ${targetId}`;

      if (hardDelete) {
        if (Array.isArray(db.config.counters)) {
          const idx = db.config.counters.findIndex((c: any) => Number(c.id) === targetId);
          if (idx !== -1) {
            removedName = db.config.counters[idx].name;
            db.config.counters.splice(idx, 1);
          }
        } else if (db.config.counters[targetId]) {
          removedName = db.config.counters[targetId].name;
          delete db.config.counters[targetId];
        }
      } else {
        // Soft delete: deactivate
        if (Array.isArray(db.config.counters)) {
          const idx = db.config.counters.findIndex((c: any) => Number(c.id) === targetId);
          if (idx !== -1) {
            removedName = db.config.counters[idx].name;
            db.config.counters[idx].active = false;
          }
        } else if (db.config.counters[targetId]) {
          removedName = db.config.counters[targetId].name;
          db.config.counters[targetId].active = false;
        }
      }

      // Audit Log
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = Date.now();
      db.data.historyLog[historyId] = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: access.caller,
        action: hardDelete ? 'TICKET_COUNTER_HARD_DELETED' : 'TICKET_COUNTER_DEACTIVATED',
        details: `[Counter API] ${hardDelete ? 'Permanently deleted' : 'Deactivated'} counter ${removedName} (ID: ${targetId})`
      };
      trimHistoryLogs(db);

      saveDatabaseToDisk({
        type: 'set',
        path: `config/counters`,
        value: db.config.counters
      });

      broadcastMutation({
        type: 'counter-removed',
        counterId: targetId,
        hardDelete
      });

      res.status(200).json({
        success: true,
        fullAccess: true,
        message: `Counter ${removedName} (ID: ${targetId}) ${hardDelete ? 'permanently deleted' : 'deactivated'}`,
        counterId: targetId,
        hardDelete
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Delete Counter error:', err);
      res.status(500).json({ success: false, error: 'Failed to delete counter', details: err?.message });
    }
  });

  // 16. GET /api/ticket-sales/history - Retrieve ticketing audit history logs
  app.get('/api/ticket-sales/history', (req, res) => {
    try {
      const db = loadDatabase();
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
      const counterFilter = req.query.counterId ? String(req.query.counterId).trim() : '';
      const dateFilter = req.query.date ? String(req.query.date).trim() : '';

      const historyLog = db.data?.historyLog || {};
      let logs = Object.values(historyLog)
        .filter((h: any) => h && (
          (h.action && String(h.action).includes('TICKET')) ||
          (h.details && /ticket|counter|turnstile|pos|refund|void/i.test(String(h.details)))
        ));

      if (counterFilter) {
        logs = logs.filter((h: any) => h.details && h.details.includes(counterFilter));
      }
      if (dateFilter) {
        logs = logs.filter((h: any) => (h.timestamp && h.timestamp.startsWith(dateFilter)) || (h.details && h.details.includes(dateFilter)));
      }

      logs.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));

      res.json({
        success: true,
        totalLogs: logs.length,
        limit,
        logs: logs.slice(0, limit)
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] History error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve ticket sales history', details: err?.message });
    }
  });

  // 17. GET /api/ticket-sales/export - Export Ticket Sales (JSON or CSV)
  app.get('/api/ticket-sales/export', (req, res) => {
    try {
      const db = loadDatabase();
      const counters = getStandardCounters(db);
      const ticketSalesData = db.data?.ticketSalesData || {};
      const format = String(req.query.format || 'json').toLowerCase();
      const startDate = req.query.startDate ? String(req.query.startDate).trim() : '';
      const endDate = req.query.endDate ? String(req.query.endDate).trim() : '';

      let dates = Object.keys(ticketSalesData).sort();
      if (startDate) dates = dates.filter(d => d >= startDate);
      if (endDate) dates = dates.filter(d => d <= endDate);

      const rows: any[] = [];
      for (const d of dates) {
        const daySales = ticketSalesData[d] || {};
        for (const c of counters) {
          const count = Number(daySales[c.id] || daySales[String(c.id)] || 0);
          rows.push({
            date: d,
            counterId: c.id,
            counterName: c.name,
            counterType: c.type,
            counterLocation: c.location,
            unitPrice: c.ticketPrice,
            ticketsSold: count,
            revenueBDT: count * c.ticketPrice
          });
        }
      }

      if (format === 'csv') {
        const headers = ['Date', 'Counter ID', 'Counter Name', 'Type', 'Location', 'Unit Price (BDT)', 'Tickets Sold', 'Revenue (BDT)'];
        const csvLines = [headers.join(',')];
        for (const r of rows) {
          csvLines.push([
            `"${r.date}"`,
            r.counterId,
            `"${r.counterName.replace(/"/g, '""')}"`,
            `"${r.counterType.replace(/"/g, '""')}"`,
            `"${r.counterLocation.replace(/"/g, '""')}"`,
            r.unitPrice,
            r.ticketsSold,
            r.revenueBDT
          ].join(','));
        }

        const csvContent = csvLines.join('\n');
        const fileName = `tfw_ticket_sales_export_${getDhakaDateString()}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.status(200).send(csvContent);
      }

      res.json({
        success: true,
        currency: db.config?.appConfig?.currency || 'BDT',
        exportedAt: new Date().toISOString(),
        totalRecords: rows.length,
        records: rows
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Export error:', err);
      res.status(500).json({ success: false, error: 'Failed to export ticket sales', details: err?.message });
    }
  });

  // 18. POST /api/ticket-sales/action or /api/tickets/sales/action
  // Universal Master Full Access Action Dispatcher
  app.post(['/api/ticket-sales/action', '/api/tickets/sales/action'], (req, res) => {
    try {
      const access = getTicketApiAccess(req);
      const action = String(req.body?.action || '').toLowerCase().trim();

      if (!action) {
        return res.status(400).json({
          success: false,
          error: 'action parameter is required in request body',
          allowedActions: [
            'record', 'increment', 'set', 'update', 'refund', 'void',
            'reset', 'delete', 'batch', 'bulk-replace', 'reconcile',
            'create-counter', 'update-counter', 'delete-counter',
            'query', 'export'
          ]
        });
      }

      // 1. Record / Increment
      if (action === 'record' || action === 'increment') {
        const { counterId, count, date, unitPrice, soldBy, notes } = req.body;
        if (!counterId) return res.status(400).json({ success: false, error: 'counterId is required' });

        const db = loadDatabase();
        const counters = getStandardCounters(db);
        const matched = counters.find((c: StandardCounter) =>
          String(c.id) === String(counterId).trim() ||
          c.name.toLowerCase() === String(counterId).trim().toLowerCase()
        );
        if (!matched) return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });

        const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
          ? date.trim()
          : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

        if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
        if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

        const currentVal = Number(db.data.ticketSalesData[targetDate][matched.id] || 0);
        const delta = Math.floor(Number(count) || 1);
        const newCount = Math.max(0, currentVal + delta);

        db.data.ticketSalesData[targetDate][matched.id] = newCount;
        db.data.ticketSalesData[targetDate][String(matched.id)] = newCount;

        const effectivePrice = unitPrice !== undefined ? Number(unitPrice) : matched.ticketPrice;

        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now();
        db.data.historyLog[historyId] = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: soldBy ? String(soldBy).trim() : access.caller,
          action: 'TICKET_SALE_RECORDED_ACTION',
          details: `[Action API: ${action}] ${matched.name}: +${delta} tickets (New Total: ${newCount}) ${notes ? `[Notes: ${notes}]` : ''}`
        };
        trimHistoryLogs(db);

        saveDatabaseToDisk({
          type: 'set',
          path: `data/ticketSalesData/${targetDate}/${matched.id}`,
          value: newCount
        });

        broadcastMutation({
          type: 'ticket-sale-updated',
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          delta,
          newCount,
          unitPrice: effectivePrice,
          subtotalRevenue: newCount * effectivePrice
        });

        return res.status(200).json({
          success: true,
          fullAccess: true,
          action,
          message: `Recorded sale of ${delta} ticket(s) for ${matched.name}`,
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          previousCount: currentVal,
          newTotalCount: newCount,
          delta,
          unitPrice: effectivePrice,
          subtotalRevenue: newCount * effectivePrice
        });
      }

      // 2. Set / Update
      if (action === 'set' || action === 'update') {
        const { counterId, count, date, unitPrice, soldBy, notes } = req.body;
        if (counterId === undefined || count === undefined) {
          return res.status(400).json({ success: false, error: 'counterId and count are required for action="set"' });
        }

        const db = loadDatabase();
        const counters = getStandardCounters(db);
        const matched = counters.find((c: StandardCounter) =>
          String(c.id) === String(counterId).trim() ||
          c.name.toLowerCase() === String(counterId).trim().toLowerCase()
        );
        if (!matched) return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });

        const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
          ? date.trim()
          : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

        if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
        if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

        const currentVal = Number(db.data.ticketSalesData[targetDate][matched.id] || 0);
        const newCount = Math.max(0, Math.floor(Number(count) || 0));
        const delta = newCount - currentVal;

        db.data.ticketSalesData[targetDate][matched.id] = newCount;
        db.data.ticketSalesData[targetDate][String(matched.id)] = newCount;

        const effectivePrice = unitPrice !== undefined ? Number(unitPrice) : matched.ticketPrice;

        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now();
        db.data.historyLog[historyId] = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: soldBy ? String(soldBy).trim() : access.caller,
          action: 'TICKET_SALE_SET_ACTION',
          details: `[Action API: ${action}] ${matched.name} count set to ${newCount} (was ${currentVal}) ${notes ? `[Notes: ${notes}]` : ''}`
        };
        trimHistoryLogs(db);

        saveDatabaseToDisk({
          type: 'set',
          path: `data/ticketSalesData/${targetDate}/${matched.id}`,
          value: newCount
        });

        broadcastMutation({
          type: 'ticket-sale-updated',
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          delta,
          newCount,
          unitPrice: effectivePrice,
          subtotalRevenue: newCount * effectivePrice
        });

        return res.status(200).json({
          success: true,
          fullAccess: true,
          action,
          message: `Counter ${matched.name} set to ${newCount} tickets`,
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          previousCount: currentVal,
          newTotalCount: newCount,
          delta,
          unitPrice: effectivePrice,
          subtotalRevenue: newCount * effectivePrice
        });
      }

      // 3. Refund / Void
      if (action === 'refund' || action === 'void') {
        const { counterId, count = 1, reason = 'Action API Refund', refundAmount, authorizedBy, date } = req.body;
        const db = loadDatabase();
        const counters = getStandardCounters(db);
        const matched = counters.find((c: StandardCounter) =>
          String(c.id) === String(counterId).trim() ||
          c.name.toLowerCase() === String(counterId).trim().toLowerCase()
        );
        if (!matched) return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });

        const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
          ? date.trim()
          : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

        if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
        if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

        const currentVal = Number(db.data.ticketSalesData[targetDate][matched.id] || 0);
        const refundQuantity = Math.floor(Number(count) || 1);
        const newCount = Math.max(0, currentVal - refundQuantity);
        const actualDeducted = currentVal - newCount;
        const calculatedRefund = refundAmount !== undefined ? Number(refundAmount) : (actualDeducted * matched.ticketPrice);

        db.data.ticketSalesData[targetDate][matched.id] = newCount;
        db.data.ticketSalesData[targetDate][String(matched.id)] = newCount;

        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now();
        db.data.historyLog[historyId] = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: authorizedBy ? String(authorizedBy).trim() : access.caller,
          action: 'TICKET_SALE_REFUND_ACTION',
          details: `[Action API: ${action}] Voided ${actualDeducted} tickets for ${matched.name}. Refund: ${calculatedRefund} BDT. Reason: ${reason}`
        };
        trimHistoryLogs(db);

        saveDatabaseToDisk({
          type: 'set',
          path: `data/ticketSalesData/${targetDate}/${matched.id}`,
          value: newCount
        });

        broadcastMutation({
          type: 'ticket-sale-refunded',
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          refundQuantity: actualDeducted,
          refundAmount: calculatedRefund,
          newCount
        });

        return res.status(200).json({
          success: true,
          fullAccess: true,
          action,
          message: `Processed refund of ${actualDeducted} tickets on ${matched.name}`,
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          refundQuantity: actualDeducted,
          refundAmount: calculatedRefund,
          previousCount: currentVal,
          newTotalCount: newCount
        });
      }

      // 4. Reset / Delete
      if (action === 'reset' || action === 'delete') {
        const { counterId, date, reason = 'Action API reset', authorizedBy } = req.body;
        const db = loadDatabase();
        const counters = getStandardCounters(db);
        const matched = counters.find((c: StandardCounter) =>
          String(c.id) === String(counterId).trim() ||
          c.name.toLowerCase() === String(counterId).trim().toLowerCase()
        );
        if (!matched) return res.status(404).json({ success: false, error: `Counter "${counterId}" not found` });

        const targetDate = (date && typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
          ? date.trim()
          : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());

        if (!db.data.ticketSalesData) db.data.ticketSalesData = {};
        if (!db.data.ticketSalesData[targetDate]) db.data.ticketSalesData[targetDate] = {};

        const previousVal = Number(db.data.ticketSalesData[targetDate][matched.id] || 0);
        db.data.ticketSalesData[targetDate][matched.id] = 0;
        db.data.ticketSalesData[targetDate][String(matched.id)] = 0;

        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now();
        db.data.historyLog[historyId] = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: authorizedBy ? String(authorizedBy).trim() : access.caller,
          action: 'TICKET_SALE_RESET_ACTION',
          details: `[Action API: ${action}] Reset ${matched.name} count to 0 (cleared ${previousVal} tickets) on ${targetDate}. Reason: ${reason}`
        };
        trimHistoryLogs(db);

        saveDatabaseToDisk({
          type: 'set',
          path: `data/ticketSalesData/${targetDate}/${matched.id}`,
          value: 0
        });

        broadcastMutation({
          type: 'ticket-sale-cleared',
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          previousCount: previousVal,
          newCount: 0
        });

        return res.status(200).json({
          success: true,
          fullAccess: true,
          action,
          message: `Ticket sales for ${matched.name} on ${targetDate} reset to 0`,
          date: targetDate,
          counterId: matched.id,
          counterName: matched.name,
          clearedCount: previousVal,
          newTotalCount: 0
        });
      }

      // 5. Query / Get
      if (action === 'query' || action === 'get') {
        const db = loadDatabase();
        const counters = getStandardCounters(db);
        const targetDate = (req.body?.date && typeof req.body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date.trim()))
          ? req.body.date.trim()
          : (db.config?.appConfig?.activeOperationalDate || getDhakaDateString());
        const daySales = db.data?.ticketSalesData?.[targetDate] || {};

        let totalTickets = 0;
        let totalRevenue = 0;
        const breakdown = counters.map((c: StandardCounter) => {
          const count = Number(daySales[c.id] || daySales[String(c.id)] || 0);
          totalTickets += count;
          totalRevenue += count * c.ticketPrice;
          return {
            id: c.id,
            name: c.name,
            count,
            unitPrice: c.ticketPrice,
            subtotal: count * c.ticketPrice
          };
        });

        return res.status(200).json({
          success: true,
          fullAccess: true,
          action,
          date: targetDate,
          totalTickets,
          totalRevenue,
          currency: db.config?.appConfig?.currency || 'BDT',
          counters: breakdown
        });
      }

      // Unknown action
      return res.status(400).json({
        success: false,
        error: `Unknown action "${action}"`,
        supportedActions: ['record', 'increment', 'set', 'update', 'refund', 'void', 'reset', 'delete', 'query']
      });
    } catch (err: any) {
      console.error('[Ticket Sales Full Access] Action dispatcher error:', err);
      res.status(500).json({ success: false, error: 'Failed to process ticket sales action', details: err?.message });
    }
  });

  // Helper to categorize concern and target department from WhatsApp message text
  function detectTargetDepartmentAndConcern(message: string): { 
    targetDepartment: 'maintenance' | 'operation-officer' | 'both'; 
    feedbackCategory: string 
  } {
    const text = (message || '').toLowerCase();

    const isSales = /ticket|counter|cashier|pos|price|package|refund|token|card|recharge|discount|payment|money|charge/i.test(text);
    const isOps = /crowd|line|queue|guest|customer|visitor|staff|behaviour|behavior|operator|guard|clean|washroom|toilet|entry|gate|ac /i.test(text);
    const isTech = /motor|sensor|belt|harness|sound|audio|speaker|screen|display|light|pc|computer|power|ups|wire|breakdown|not working|problem|issue|stuck|jam|error|fault|leak|pressure|cable|mechanic|technical/i.test(text);

    if (isTech && (isOps || isSales)) {
      return { targetDepartment: 'both', feedbackCategory: 'Tech + Guest Feedback' };
    }
    if (isSales || isOps) {
      return { targetDepartment: 'operation-officer', feedbackCategory: isSales ? 'Ticketing & Counter Feedback' : 'Guest Operations Feedback' };
    }
    return { targetDepartment: 'maintenance', feedbackCategory: 'Technical Support' };
  }

  // --- WhatsApp Webhook Integration for Maintenance Tickets ---
  // Verification challenge handler (supports Meta Cloud API, Green API, Whapi, etc.)
  app.get('/api/webhooks/whatsapp', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
      if (mode === 'subscribe') {
        return res.status(200).send(challenge);
      }
      return res.status(403).send('Verification failed');
    }

    res.json({
      status: 'online',
      service: 'TFW Maintenance WhatsApp Webhook Gateway',
      webhookEndpoint: '/api/webhooks/whatsapp',
      databaseSafety: 'Fully isolated in data/maintenanceTickets with zero impact on counters, sales, or attendance',
      supportedGateways: ['Green API', 'Whapi.cloud', 'UltraMsg', 'Twilio', 'Meta Cloud API', 'Direct JSON / HTTP POST']
    });
  });

  // Intelligent Ride Matcher for incoming WhatsApp messages
  // Prioritizes 1st line as instructed ("in the 1st line the game or ride name will be, so TAG name from there")
  function matchRideFromMessage(
    cleanMessage: string,
    ridesList: Array<{ id: number; name: string; floor?: string | number }>
  ): { id: number; name: string } {
    if (!ridesList || ridesList.length === 0) {
      return { id: 1, name: 'General Attraction' };
    }

    const normalize = (str: string) =>
      str
        .toLowerCase()
        .replace(/\bvirtual\b/gi, 'vr') // "Virtual Egg" -> "vr egg"
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const isSimilar = (w1: string, w2: string): boolean => {
      if (w1 === w2) return true;
      if (Math.abs(w1.length - w2.length) > 1) return false;
      let diff = 0, i = 0, j = 0;
      while (i < w1.length && j < w2.length) {
        if (w1[i] !== w2[j]) {
          diff++;
          if (diff > 1) return false;
          if (w1.length > w2.length) i++;
          else if (w2.length > w1.length) j++;
          else { i++; j++; }
        } else {
          i++; j++;
        }
      }
      return true;
    };

    const lines = cleanMessage.split('\n').map(l => l.trim()).filter(Boolean);
    const floorMatch = cleanMessage.match(/\b(?:level|floor|lvl|flr|l)[-\s:]*(\d+)\b/i);
    const detectedFloorNum = floorMatch ? floorMatch[1] : null;

    // Filter out standalone floor indicators (e.g. "L-11", "Level 11", "Floor 14") so the game/ride line is prioritized
    const candidateLines = lines.filter(l => !/^(?:level|floor|lvl|flr|l)[-\s:]*\d+$/i.test(l.trim()));
    const primaryLine = candidateLines[0] || lines[0] || cleanMessage;
    const normPrimary = normalize(primaryLine);
    const normFull = normalize(cleanMessage);

    // If floor is detected, prioritize rides on that floor first
    let candidateRides = [...ridesList].sort((a, b) => (b.name?.length || 0) - (a.name?.length || 0));
    if (detectedFloorNum) {
      const onFloor = candidateRides.filter(r => String(r.floor || '').includes(detectedFloorNum));
      const offFloor = candidateRides.filter(r => !String(r.floor || '').includes(detectedFloorNum));
      candidateRides = [...onFloor, ...offFloor];
    }

    // 1. Exact or substring match on primary line
    for (const r of candidateRides) {
      if (!r.name) continue;
      const normRide = normalize(r.name);
      const regex = new RegExp(`(?:^|\\s)${normRide}(?:\\s|$)`, 'i');
      if (regex.test(normPrimary) || normPrimary.includes(normRide)) {
        return { id: r.id, name: r.name };
      }
    }

    // 2. Fuzzy match on primary line (handles spelling variations like "Power Track" -> "Power Truck")
    const primaryWords = normPrimary.split(' ').filter(w => w.length >= 3 && !['the', 'and', 'not', 'working', 'sound', 'broken', 'problem', 'test', 'issue'].includes(w));
    if (primaryWords.length > 0) {
      for (const r of candidateRides) {
        if (!r.name) continue;
        const rideWords = normalize(r.name).split(' ').filter(w => w.length >= 3 && !['the', 'and'].includes(w));
        if (rideWords.length > 0) {
          const matchesAll = rideWords.every(rw => primaryWords.some(pw => isSimilar(rw, pw)));
          if (matchesAll) return { id: r.id, name: r.name };
        }
      }
    }

    // 3. Key phrases on primary line
    for (const r of candidateRides) {
      if (!r.name) continue;
      const normRide = normalize(r.name);
      const words = normRide.split(' ').filter(w => !['1', '2', '3', 'blue', 'red', 'seat'].includes(w));
      if (words.length > 0) {
        const phrase = words.join(' ');
        if (normPrimary.includes(phrase)) {
          return { id: r.id, name: r.name };
        }
      }
    }

    // 4. Distinctive single-word match on primary line
    for (const r of candidateRides) {
      if (!r.name) continue;
      const normRide = normalize(r.name);
      const words = normRide.split(' ').filter(w => w.length >= 3 && !['the', 'and', 'kids', 'car', 'tour', 'world', 'park', 'sports', 'flight', 'racer', 'vr', 'game', 'area', 'zone', 'line', 'door'].includes(w));
      for (const w of words) {
        const wRegex = new RegExp(`(?:^|\\s)${w}(?:\\s|$)`, 'i');
        if (wRegex.test(normPrimary)) {
          return { id: r.id, name: r.name };
        }
      }
    }

    // 5. Full message check
    for (const r of candidateRides) {
      if (!r.name) continue;
      const normRide = normalize(r.name);
      const regex = new RegExp(`(?:^|\\s)${normRide}(?:\\s|$)`, 'i');
      if (regex.test(normFull) || normFull.includes(normRide)) {
        return { id: r.id, name: r.name };
      }
    }

    // 6. Fuzzy multi-word match on full message
    const fullWords = normFull.split(' ').filter(w => w.length >= 3 && !['the', 'and', 'not', 'working', 'problem', 'test', 'issue'].includes(w));
    for (const r of candidateRides) {
      if (!r.name) continue;
      const rideWords = normalize(r.name).split(' ').filter(w => w.length >= 3 && !['the', 'and'].includes(w));
      if (rideWords.length >= 2) {
        const matchesAll = rideWords.every(rw => fullWords.some(pw => isSimilar(rw, pw)));
        if (matchesAll) return { id: r.id, name: r.name };
      }
    }

    // Fallback: Level / Floor if detected in message, otherwise general facility
    if (detectedFloorNum) {
      return {
        id: 1000 + Number(detectedFloorNum),
        name: `Level ${detectedFloorNum} Facility`
      };
    }

    return {
      id: 1,
      name: 'General Facility'
    };
  }

  function detectTicketPriority(message: string): 'normal' | 'high' | 'urgent' {
    if (/urgent|emergency|danger|smoke|fire|halt|injury|serious|hazard/i.test(message)) {
      return 'urgent';
    } else if (/broken|critical|stopped|stuck|high|not working|damaged|shutdown|down/i.test(message)) {
      return 'high';
    }
    return 'normal';
  }

  // Filter out any resolution reports, technician dispatches, leave requests, or general chatter
  function isResolutionOrSystemMessage(msg: string): boolean {
    if (!msg) return true;
    const lower = msg.toLowerCase().trim();
    if (lower.length < 3) return true;
    if (['ok', 'noted', 'done', 'received', 'good', 'thanks', 'thank you', 'yes', 'no', 'fine', 'clear', 'all ok', 'hi', 'hello'].includes(lower)) return true;
    
    // Filter leave requests or staff operational announcements
    if (
      lower.includes('ছুটি') ||
      lower.includes('সর্টলিপ') ||
      lower.includes('অনুমতি কামনা') ||
      lower.includes('আসেন') ||
      lower.includes('lunch') ||
      lower.includes('prayer') ||
      lower.includes('নামাজ') ||
      lower.includes('খাবার') ||
      lower.includes('attendance')
    ) {
      return true;
    }

    return (
      lower.includes('[tfw maintenance') ||
      lower.includes('tfw maintenance') ||
      lower.includes('maintenance team - solved') ||
      lower.includes('technician dispatched') ||
      lower.includes('[tfw technical support') ||
      lower.includes('resolution notes:') ||
      lower.includes('time solved:') ||
      lower.includes('dispatched at:') ||
      lower.includes('operational clearance') ||
      lower.includes('repaired and cleared') ||
      lower.includes('engineer / technician:') ||
      lower.includes('problem solved') ||
      lower.includes('issue resolved') ||
      lower.includes('issue solved') ||
      lower.includes('resolved') ||
      lower.includes('solved') ||
      lower.includes('solution') ||
      lower.includes('repaired') ||
      lower.includes('work done') ||
      lower.includes('fixed') ||
      lower.includes('cleared') ||
      lower.includes('operational') ||
      lower.includes('running fine') ||
      lower.includes('working now') ||
      lower.includes('all ok') ||
      lower.includes('all done') ||
      lower.includes('photo reported via whatsapp') ||
      lower.startsWith('✅') ||
      lower.startsWith('🔧') ||
      lower.startsWith('📢') ||
      (lower.includes('done') && (lower.includes('level') || lower.includes('problem') || lower.includes('issue') || lower.includes('ride') || lower.includes('bumper') || lower.includes('tag'))) ||
      lower.includes('in progress return') ||
      lower.includes('return gese') ||
      lower.includes('resolving theke')
    );
  }

  // Helper to check if an issue for this ride and problem was already solved anywhere in the database
  function isIssueAlreadySolved(
    db: any,
    rideId?: number,
    messageText?: string,
    whatsappMessageId?: string
  ): boolean {
    if (!db?.data?.maintenanceTickets) return false;

    // Only block if the EXACT same WhatsApp message ID was already solved
    if (whatsappMessageId) {
      for (const dayTickets of Object.values(db.data.maintenanceTickets)) {
        if (!dayTickets || typeof dayTickets !== 'object') continue;
        for (const t of Object.values(dayTickets as Record<string, any>)) {
          if (!t || typeof t !== 'object') continue;
          if (t.status === 'solved' && t.whatsappMessageId && t.whatsappMessageId === whatsappMessageId) {
            return true;
          }
        }
      }
    }
    // Recurring issues on rides are real new problems - never suppress them based on older solved tickets
    return false;
  }

  // Helper to find an existing ticket across all dates in memoryDb/db
  function findExistingMaintenanceTicket(
    db: any, 
    ticketId?: string, 
    whatsappMessageId?: string, 
    rideId?: number, 
    messageText?: string
  ): { dateKey: string; ticketId: string; ticket: any } | null {
    if (!db?.data?.maintenanceTickets) return null;
    const cleanMsg = normalizeIssueText(messageText || '');
    const coreId = ticketId ? ticketId.replace(/^\d{4}-\d{2}-\d{2}-/, '') : '';
    const now = Date.now();

    for (const [dateKey, dayTickets] of Object.entries(db.data.maintenanceTickets)) {
      if (!dayTickets || typeof dayTickets !== 'object') continue;
      for (const [tId, t] of Object.entries(dayTickets as Record<string, any>)) {
        if (!t || typeof t !== 'object') continue;
        if (ticketId && (tId === ticketId || t.id === ticketId)) {
          return { dateKey, ticketId: tId, ticket: t };
        }
        if (coreId && coreId.length > 5) {
          const targetCore = String(t.id || tId).replace(/^\d{4}-\d{2}-\d{2}-/, '');
          if (targetCore === coreId) {
            return { dateKey, ticketId: tId, ticket: t };
          }
        }
        if (whatsappMessageId && t.whatsappMessageId && t.whatsappMessageId === whatsappMessageId) {
          return { dateKey, ticketId: tId, ticket: t };
        }
        // Deduplication for rapid double-posts: only match if reported within the last 15 minutes on the same ride with exact problem text
        if (rideId && t.rideId === rideId && cleanMsg.length > 3 && t.status !== 'solved') {
          const tTime = new Date(t.reportedAt || t.date || 0).getTime();
          if (now - tTime < 15 * 60 * 1000) {
            const existingProb = normalizeIssueText(t.problem || '');
            if (existingProb && existingProb === cleanMsg) {
              return { dateKey, ticketId: tId, ticket: t };
            }
          }
        }
      }
    }
    return null;
  }

  // In-memory cache to prevent accidental duplicate ticket generation from duplicate webhooks within 5 seconds
  const recentWhatsAppTickets = new Map<string, number>();

  app.post('/api/webhooks/whatsapp', (req, res) => {
    try {
      const body = req.body || {};

      // Ignore outgoing API message webhook events generated by our dashboard/bot updates
      if (
        body.typeWebhook === 'outgoingMessageReceived' ||
        body.typeWebhook === 'outgoingAPIMessageReceived' || 
        body.typeWebhook === 'outgoingMessage' ||
        body.sendByApi === true ||
        body.messageData?.sendByApi === true
      ) {
        return res.status(200).json({ status: 'ignored', reason: 'Outgoing system/bot API message ignored' });
      }

      let messageText = '';
      let senderName = '';
      let senderPhone = '';
      let imageUrl = '';

      let detectedChatId = '';
      let detectedChatName = '';

      // 1. Direct / Generic JSON payload or Dashboard Simulator
      if (body.message || body.text || body.problem) {
        messageText = String(body.message || body.text || body.problem || '');
        senderName = String(body.senderName || body.sender || body.name || '');
        senderPhone = String(body.phone || body.from || '');
        imageUrl = String(body.imageUrl || body.photoUrl || '');
        detectedChatName = String(body.groupName || body.chatName || 'TFW Technical group');
        detectedChatId = String(body.chatId || '');
      }
      // 2. Green API (Incoming message from WhatsApp group)
      else if (body.typeWebhook === 'incomingMessageReceived' && body.messageData) {
        senderName = String(body.senderData?.senderName || body.senderData?.senderContactName || body.senderData?.chatName || (body.typeWebhook === 'outgoingMessageReceived' ? 'WhatsApp Member' : ''));
        senderPhone = String(body.senderData?.sender || body.senderData?.chatId || '').replace(/@c\.us|@s\.whatsapp\.net/g, '');
        detectedChatName = String(body.senderData?.chatName || 'TFW Technical group');
        detectedChatId = String(body.senderData?.chatId || '');

        const mData = body.messageData;
        const msgType = mData.typeMessage;

        if (msgType === 'textMessage') {
          messageText = String(mData.textMessageData?.textMessage || '');
        } else if (msgType === 'extendedTextMessage') {
          messageText = String(mData.extendedTextMessageData?.textMessage || mData.extendedTextMessageData?.description || '');
        } else if (msgType === 'quotedMessage') {
          messageText = String(mData.extendedTextMessageData?.textMessage || mData.quotedMessage?.textMessage || '');
        } else if (msgType === 'imageMessage') {
          messageText = String(mData.imageMessageData?.caption || 'Photo reported via WhatsApp');
          imageUrl = String(mData.imageMessageData?.downloadUrl || mData.fileMessageData?.downloadUrl || '');
        } else if (msgType === 'documentMessage') {
          messageText = String(mData.documentMessageData?.caption || mData.documentMessageData?.fileName || 'Document reported via WhatsApp');
          imageUrl = String(mData.documentMessageData?.downloadUrl || '');
        } else if (msgType === 'audioMessage') {
          messageText = String(mData.audioMessageData?.caption || 'Voice note reported via WhatsApp');
        } else if (msgType === 'videoMessage') {
          messageText = String(mData.videoMessageData?.caption || 'Video clip reported via WhatsApp');
          imageUrl = String(mData.videoMessageData?.downloadUrl || '');
        } else {
          messageText = String(
            mData.textMessageData?.textMessage || 
            mData.extendedTextMessageData?.textMessage || 
            mData.caption || 
            'Message from WhatsApp group'
          );
        }
      }
      // 3. Whapi.cloud (Group message event)
      else if (Array.isArray(body.messages) && body.messages.length > 0) {
        const m = body.messages[0];
        senderName = String(m.from_name || '');
        senderPhone = String(m.from || '');
        messageText = String(m.text?.body || m.caption || '');
        if (m.image?.link) imageUrl = String(m.image.link);
      }
      // 4. UltraMsg / Chat-API
      else if (body.data) {
        senderName = String(body.data.pushname || body.data.from || '');
        senderPhone = String(body.data.from || '');
        messageText = String(body.data.body || '');
        if (body.data.media) imageUrl = String(body.data.media);
      }
      // 5. Meta WhatsApp Cloud API
      else if (body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
        const val = body.entry[0].changes[0].value;
        const m = val.messages[0];
        senderName = String(val.contacts?.[0]?.profile?.name || '');
        senderPhone = String(m.from || '');
        messageText = String(m.text?.body || '');
      }
      // 6. Twilio WhatsApp
      else if (body.Body) {
        messageText = String(body.Body || '');
        senderName = String(body.ProfileName || '');
        senderPhone = String(body.From || '');
      }

      // If no valid text message in payload (e.g. status acknowledgment or read receipt), ignore gracefully
      if (!messageText.trim()) {
        return res.status(200).json({ status: 'ignored', reason: 'No message content in payload' });
      }

      const cleanMessage = messageText.trim().slice(0, 10000);

      // Check if message is a Management Sales Closing report from group "TFW Management Team"
      const isMgmtGroup =
        detectedChatName.toLowerCase().includes('management team') ||
        detectedChatName.toLowerCase().includes('tfw management');

      if (isManagementSalesMessage(cleanMessage)) {
        const msgTime = Number(body.timestamp) > 0 ? new Date(Number(body.timestamp) * 1000) : new Date();
        const parsedReport = parseManagementReportText(cleanMessage, {
          fallbackDate: getDhakaDateString(msgTime),
          senderName: senderName || 'TFW Management Team',
          senderPhone,
          groupName: 'TFW Management Team',
          timestamp: msgTime.toISOString()
        });

        if (parsedReport) {
          const stored = storeManagementReport(parsedReport, 'webhook');
          return res.status(200).json({
            status: stored ? 'success' : 'unchanged',
            reportType: 'management-closing-sales',
            date: parsedReport.date,
            totalRevenue: parsedReport.salesAndRevenue.totalRevenue
          });
        }
      }

      // Other chatter in the management group is neither a sales report nor a maintenance issue.
      if (isMgmtGroup) {
        return res.status(200).json({ status: 'ignored', reason: 'Management group message is not a closing report' });
      }

      // User directive: synced with WhatsApp group "TFW Issue Resolve (Tech+ Guest Feedback)"
      const TECH_SUPPORT_CHAT_ID = '120363024724303859@g.us';
      const isTechSupportGroup = (chatId: string, chatName: string) => {
        const id = String(chatId || '').toLowerCase().trim();
        const name = String(chatName || '').toLowerCase().trim();
        if (id === TECH_SUPPORT_CHAT_ID) return true;
        if (
          name.includes('tfw issue resolve') || 
          name.includes('guest feedback') || 
          name.includes('technical support') || 
          name.includes('tfw technical group')
        ) {
          return true;
        }
        return false;
      };

      if (detectedChatId && !isTechSupportGroup(detectedChatId, detectedChatName)) {
        return res.status(200).json({ status: 'ignored', reason: 'Only messages from TFW Issue Resolve (Tech+ Guest Feedback) or TFW Management Team are synced' });
      }
      if (detectedChatName && !isTechSupportGroup(detectedChatId, detectedChatName)) {
        return res.status(200).json({ status: 'ignored', reason: 'Only messages from TFW Issue Resolve (Tech+ Guest Feedback) or TFW Management Team are synced' });
      }

      // Block any resolved records or system notifications from entering Reported Issues
      if (isResolutionOrSystemMessage(cleanMessage)) {
        return res.status(200).json({ status: 'ignored', reason: 'Resolved record or system notification message ignored' });
      }

      if (
        senderName.toLowerCase().includes('tfw management') ||
        senderName.toLowerCase().includes('maintenance desk') ||
        senderName.toLowerCase().includes('maintenance dashboard')
      ) {
        return res.status(200).json({ status: 'ignored', reason: 'System / bot sender ignored' });
      }

      // Deduplication check: prevent same sender sending exact duplicate text within 5 seconds
      const dedupKey = `${senderPhone || senderName}:${cleanMessage}`;
      const now = Date.now();
      if (recentWhatsAppTickets.has(dedupKey)) {
        const lastTime = recentWhatsAppTickets.get(dedupKey) || 0;
        if (now - lastTime < 5000) {
          return res.status(200).json({ status: 'ignored', reason: 'Duplicate message filtered' });
        }
      }
      recentWhatsAppTickets.set(dedupKey, now);
      // Clean old keys from deduplication cache
      if (recentWhatsAppTickets.size > 200) {
        for (const [k, t] of recentWhatsAppTickets.entries()) {
          if (now - t > 60000) recentWhatsAppTickets.delete(k);
        }
      }

      const db = loadDatabase();

      // Retrieve configured rides to match against message
      let ridesList: Array<{ id: number; name: string; floor?: string }> = [];
      if (Array.isArray(db.config?.rides)) {
        ridesList = db.config.rides;
      } else if (db.config?.rides && typeof db.config.rides === 'object') {
        ridesList = Object.entries(db.config.rides).map(([id, r]: any) => ({
          id: Number(id),
          name: r.name || `Ride ${id}`,
          floor: r.floor
        }));
      }

      // Match ride using 1st-line prioritized matcher
      let matchedRide: { id: number; name: string } | null = null;
      if (body.rideId && ridesList.some(r => r.id === Number(body.rideId))) {
        matchedRide = ridesList.find(r => r.id === Number(body.rideId))!;
      } else {
        matchedRide = matchRideFromMessage(cleanMessage, ridesList);
      }

      // Detect ticket priority automatically from keywords
      const priority = detectTicketPriority(cleanMessage);

      // Check if ticket was permanently deleted or discarded
      const incomingMsgId = String(body.idMessage || body.messageData?.idMessage || '');
      if (incomingMsgId && processedWhatsAppMessageIds.has(incomingMsgId)) {
        return res.status(200).json({ status: 'ignored', reason: 'WhatsApp message already processed' });
      }
      if (isTicketDeleted(db, undefined, incomingMsgId, matchedRide.id, cleanMessage)) {
        if (incomingMsgId) markWhatsAppMessageProcessed(incomingMsgId);
        return res.status(200).json({ status: 'ignored', reason: 'Ticket was previously deleted/discarded' });
      }

      // Check if this issue is already solved anywhere in Resolved Records
      if (isIssueAlreadySolved(db, matchedRide.id, cleanMessage, incomingMsgId)) {
        if (incomingMsgId) markWhatsAppMessageProcessed(incomingMsgId);
        return res.status(200).json({ status: 'ignored', reason: 'Issue is already solved in Resolved Records' });
      }

      // Check if ticket already exists anywhere in the database
      const existing = findExistingMaintenanceTicket(db, undefined, incomingMsgId, matchedRide.id, cleanMessage);
      if (existing) {
        if (incomingMsgId) {
          markWhatsAppMessageProcessed(incomingMsgId);
        }
        if (existing.ticket.status === 'solved' || existing.ticket.status === 'in-progress') {
          return res.status(200).json({ status: 'ignored', reason: 'Ticket already exists and is active/resolved', ticketId: existing.ticketId });
        }
      }

      // Construct safe ticket object complying strictly with MaintenanceTicket interface
      const msgTime = new Date();
      const ticketDate = getDhakaDateString(msgTime);
      const ticketId = `${ticketDate}-${matchedRide.id}-${now}`;
      const deptInfo = detectTargetDepartmentAndConcern(cleanMessage);

      const newTicket = {
        id: ticketId,
        date: ticketDate,
        rideId: matchedRide.id,
        rideName: matchedRide.name,
        problem: cleanMessage,
        status: 'reported',
        reportedById: 9999,
        reportedByName: senderName ? `${senderName} (WhatsApp)` : 'WhatsApp Group Member',
        reportedByRole: senderPhone ? `WhatsApp: ${senderPhone}` : 'TFW Issue Resolve (Tech+ Guest Feedback)',
        source: 'whatsapp',
        targetDepartment: deptInfo.targetDepartment,
        feedbackCategory: deptInfo.feedbackCategory,
        priority,
        reportedAt: msgTime.toISOString(),
        photoUrl: imageUrl || undefined,
        whatsappGroup: 'TFW Issue Resolve (Tech+ Guest Feedback)',
        whatsappChatId: detectedChatId || TECH_SUPPORT_CHAT_ID,
        whatsappMessageId: incomingMsgId || undefined
      };

      // Ensure data.maintenanceTickets container exists
      if (!db.data.maintenanceTickets) db.data.maintenanceTickets = {};
      if (!db.data.maintenanceTickets[ticketDate]) db.data.maintenanceTickets[ticketDate] = {};

      if (!db.config.whatsappConfig) {
        db.config.whatsappConfig = {
          targetGroupName: 'TFW Issue Resolve (Tech+ Guest Feedback)',
          autoNotifyOnSolved: true,
          autoNotifyOnAssigned: false
        };
      }
      db.config.whatsappConfig.targetGroupName = 'TFW Issue Resolve (Tech+ Guest Feedback)';
      db.config.whatsappConfig.groupChatId = TECH_SUPPORT_CHAT_ID;
      db.config.whatsappConfig.detectedGroupName = 'TFW Issue Resolve (Tech+ Guest Feedback)';
      db.config.whatsappConfig.lastMessage = cleanMessage;
      db.config.whatsappConfig.lastSender = senderName;
      db.config.whatsappConfig.lastMessageAt = new Date().toISOString();

      // Completely isolated write: only touches data.maintenanceTickets[ticketDate][ticketId]
      db.data.maintenanceTickets[ticketDate][ticketId] = newTicket;

      // Add record to historyLog for auditability
      if (!db.data.historyLog) db.data.historyLog = {};
      const historyId = now;
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: senderName ? `${senderName} (WhatsApp)` : 'WhatsApp Gateway',
        action: 'WHATSAPP_TICKET_CREATED',
        details: `[WHATSAPP (${detectedChatName || 'TFW Issue Resolve (Tech+ Guest Feedback)'})] ${matchedRide.name}: ${cleanMessage.slice(0, 100)}`
      };
      db.data.historyLog[historyId] = historyEntry;
      trimHistoryLogs(db);

      // Save safely to atomic disk and broadcast immediately via SSE to all open tabs
      saveDatabaseToDisk({
        type: 'update',
        updates: {
          [`data/maintenanceTickets/${ticketDate}/${ticketId}`]: newTicket,
          [`data/historyLog/${historyId}`]: historyEntry,
          'config/whatsappConfig': db.config.whatsappConfig
        },
        senderId: 'whatsapp-webhook'
      });

      // Dedicated issue-reported broadcast to trigger audible alert and voice announcement on all open tabs
      broadcastMutation({
        type: 'issue-reported',
        ticket: newTicket,
        rideName: matchedRide.name,
        problem: cleanMessage,
        priority,
        source: 'whatsapp',
        reportedByName: newTicket.reportedByName,
        reportedByRole: newTicket.reportedByRole,
        targetDepartment: newTicket.targetDepartment,
        feedbackCategory: newTicket.feedbackCategory,
        date: ticketDate,
        senderId: 'whatsapp-webhook'
      });

      console.log(`[WhatsApp Webhook] Ticket created: ${ticketId} for ride "${matchedRide.name}" from ${senderName || senderPhone} (Group: ${detectedChatName || 'TFW Issue Resolve (Tech+ Guest Feedback)'})`);

      res.status(200).json({
        success: true,
        ticketId,
        rideId: matchedRide.id,
        rideName: matchedRide.name,
        groupName: detectedChatName || 'TFW Issue Resolve (Tech+ Guest Feedback)',
        groupChatId: detectedChatId,
        priority,
        reportedAt: newTicket.reportedAt,
        message: 'Maintenance ticket created and broadcasted to dashboard successfully'
      });
    } catch (err: any) {
      console.error('[WhatsApp Webhook] Processing error:', err);
      // Even in case of unexpected input error, return 500 without corrupting database
      res.status(500).json({ error: 'Failed to process WhatsApp webhook payload', details: err?.message });
    }
  });

  const WHAPI_DEFAULT_API_URL = process.env.WHAPI_API_URL || 'https://gate.whapi.cloud/';
  const TFW_ISSUE_RESOLVE_GROUP_NAME = 'TFW Issue Resolve (Tech+ Guest Feedback)';
  const TFW_ISSUE_RESOLVE_GROUP_ID = '120363024724303859@g.us';

  // Helper to send text message via Green-API (waInstance/sendMessage)
  async function sendViaGreenApiText(message: string, chatId: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    const idInstance = String(GREEN_API_ENV_ID_INSTANCE || cfg.idInstance || '').trim();
    const apiTokenInstance = GREEN_API_ENV_TOKEN_INSTANCE;

    if (!idInstance || !apiTokenInstance) {
      return { success: false, error: 'Green-API credentials not configured.' };
    }

    try {
      const url = `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.idMessage) {
        console.log(`[Green-API SUCCESS] Sent message to ${chatId}, idMessage: ${data.idMessage}`);
        return { success: true, messageId: String(data.idMessage) };
      }
      return {
        success: false,
        error: data?.message || data?.error || `Green-API sendMessage returned status ${res.status}`
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Green-API sendMessage network error' };
    }
  }

  // Helper to send media/photo via Green-API (waInstance/sendFileByUpload or sendFileByUrl)
  async function sendViaGreenApiMedia(mediaData: string, caption: string, chatId: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    const idInstance = String(GREEN_API_ENV_ID_INSTANCE || cfg.idInstance || '').trim();
    const apiTokenInstance = GREEN_API_ENV_TOKEN_INSTANCE;

    if (!idInstance || !apiTokenInstance) {
      return { success: false, error: 'Green-API credentials not configured.' };
    }

    try {
      const cleanMedia = mediaData.trim();
      // If it is a public URL
      if (cleanMedia.startsWith('http://') || cleanMedia.startsWith('https://')) {
        const url = `https://api.green-api.com/waInstance${idInstance}/sendFileByUrl/${apiTokenInstance}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            urlFile: cleanMedia,
            fileName: 'repair_proof.jpg',
            caption
          })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.idMessage) {
          console.log(`[Green-API Media SUCCESS] Sent photo URL to ${chatId}, idMessage: ${data.idMessage}`);
          return { success: true, messageId: String(data.idMessage) };
        }
      }

      // If it is Base64 data
      let base64Raw = cleanMedia;
      let mimeType = 'image/jpeg';
      if (cleanMedia.startsWith('data:')) {
        const commaIdx = cleanMedia.indexOf(',');
        if (commaIdx !== -1) {
          const mimeMatch = cleanMedia.substring(0, commaIdx).match(/data:(.*?);/);
          if (mimeMatch) mimeType = mimeMatch[1];
          base64Raw = cleanMedia.substring(commaIdx + 1);
        }
      }
      base64Raw = base64Raw.replace(/\s+/g, '');

      const buffer = Buffer.from(base64Raw, 'base64');
      const form = new FormData();
      form.append('chatId', chatId);
      form.append('fileName', 'repair_photo.jpg');
      form.append('caption', caption);
      form.append('file', new Blob([buffer], { type: mimeType }), 'repair_photo.jpg');

      const uploadUrl = `https://api.green-api.com/waInstance${idInstance}/sendFileByUpload/${apiTokenInstance}`;
      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        body: form
      });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (uploadRes.ok && uploadData?.idMessage) {
        console.log(`[Green-API Upload SUCCESS] Uploaded photo to ${chatId}, idMessage: ${uploadData.idMessage}`);
        return { success: true, messageId: String(uploadData.idMessage) };
      }
      console.warn('Green-API file upload returned status', uploadRes.status, uploadData);
      throw new Error(uploadData?.message || uploadData?.error || `Green-API upload status ${uploadRes.status}`);
    } catch (err: any) {
      console.warn('Green-API photo upload failed, falling back to text notification:', err.message);
      return sendViaGreenApiText(caption, chatId);
    }
  }

  // Unified Outgoing WhatsApp Message Helper (Green-API primary with Whapi fallback)
  async function sendGreenApiWhatsAppMessage(message: string, overrideChatId?: string): Promise<{ success: boolean; error?: string; messageId?: string }> {
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    const chatId = overrideChatId || cfg.groupChatId || TFW_ISSUE_RESOLVE_GROUP_ID;

    // 1. Try Green-API (primary, active & verified)
    const greenRes = await sendViaGreenApiText(message, chatId);
    if (greenRes.success) {
      return greenRes;
    }
    console.warn('[WhatsApp Dispatch] Green-API text failed, attempting Whapi fallback:', greenRes.error);

    // 2. Try Whapi.cloud fallback
    const apiUrl = String(cfg.whapiApiUrl || WHAPI_DEFAULT_API_URL).replace(/\/+$/, '');
    const apiToken = WHAPI_ENV_TOKEN;
    if (apiToken) {
      try {
        const res = await fetch(`${apiUrl}/messages/text`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ to: chatId, body: message })
        });
        const data = await res.json().catch(() => ({}));
        const msgId = data?.message?.id || data?.id || (data?.sent ? `whapi-${Date.now()}` : undefined);
        if (res.ok && (data?.sent || msgId)) {
          return { success: true, messageId: String(msgId) };
        }
      } catch (e: any) {
        console.warn('[WhatsApp Dispatch] Whapi fallback failed:', e.message);
      }
    }

    return {
      success: false,
      error: greenRes.error || 'Failed to dispatch message via WhatsApp gateways'
    };
  }

  // Unified Outgoing WhatsApp Media Helper (Green-API primary with Whapi fallback)
  async function sendGreenApiWhatsAppMedia(
    mediaData: string, 
    caption: string, 
    overrideChatId?: string
  ): Promise<{ success: boolean; error?: string; messageId?: string }> {
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    const chatId = overrideChatId || cfg.groupChatId || TFW_ISSUE_RESOLVE_GROUP_ID;

    // 1. Try Green-API media upload
    const greenRes = await sendViaGreenApiMedia(mediaData, caption, chatId);
    if (greenRes.success) {
      return greenRes;
    }
    console.warn('[WhatsApp Dispatch] Green-API media failed, attempting Whapi fallback:', greenRes.error);

    // 2. Try Whapi media fallback
    const apiUrl = String(cfg.whapiApiUrl || WHAPI_DEFAULT_API_URL).replace(/\/+$/, '');
    const apiToken = WHAPI_ENV_TOKEN;
    if (apiToken) {
      try {
        let mediaPayload = mediaData.trim();
        if (!mediaPayload.startsWith('data:') && !mediaPayload.startsWith('http')) {
          mediaPayload = `data:image/jpeg;base64,${mediaPayload.replace(/\s+/g, '')}`;
        }
        const res = await fetch(`${apiUrl}/messages/image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            to: chatId,
            media: mediaPayload,
            caption: caption.length > 1024 ? caption.slice(0, 1020) + '...' : caption
          })
        });
        const data = await res.json().catch(() => ({}));
        const msgId = data?.message?.id || data?.id || (data?.sent ? `whapi-img-${Date.now()}` : undefined);
        if (res.ok && (data?.sent || msgId)) {
          return { success: true, messageId: String(msgId) };
        }
      } catch (e: any) {
        console.warn('[WhatsApp Dispatch] Whapi media fallback failed:', e.message);
      }
    }

    // 3. Fallback to Green-API text message
    return sendViaGreenApiText(caption, chatId);
  }

  // Implementation of notifyTicketResolvedToWhatsApp targeting "TFW Issue Resolve (Tech+ Guest Feedback)" WhatsApp group
  notifyTicketResolvedToWhatsApp = async (ticketData: {
    ticketId: string;
    rideId?: number;
    rideName?: string;
    technicianName?: string;
    helpers?: string[];
    reportedProblem?: string;
    notes?: string;
    photoData?: string;
    solvedAt?: string;
  }) => {
    const { 
      ticketId, 
      rideName = 'Attraction', 
      technicianName = 'Maintenance Team', 
      helpers = [], 
      reportedProblem = 'Reported problem', 
      notes = 'Issue repaired and operational clearance given.', 
      photoData, 
      solvedAt 
    } = ticketData;

    // Deduplication check: do not resend for the same ticket within 20 seconds
    if (ticketId) {
      const lastSent = recentSolvedNotifications.get(ticketId);
      if (lastSent && Date.now() - lastSent < 20000) {
        return { success: true, messageId: 'already-sent' };
      }
      recentSolvedNotifications.set(ticketId, Date.now());
    }

    const targetDate = solvedAt ? new Date(solvedAt) : new Date();
    const validDate = isNaN(targetDate.getTime()) ? new Date() : targetDate;
    const timeStr = validDate.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const dateStr = validDate.toLocaleDateString('en-GB', {
      timeZone: 'Asia/Dhaka',
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const helperText = Array.isArray(helpers) && helpers.length > 0 ? ` (Helpers: ${helpers.join(', ')})` : '';

    const formattedMessage = 
      `[TFW Issue Resolve (Tech+ Guest Feedback) - ISSUE RESOLVED]\n\n` +
      `🎢 Ride / Attraction: ${rideName || 'Attraction'}\n` +
      `🛠️ Solved By: ${technicianName || 'Maintenance Team'}${helperText}\n` +
      `📋 Reported Issue: ${reportedProblem || 'Reported problem'}\n` +
      `💡 Resolution Notes: ${notes || 'Issue repaired and operational clearance given.'}\n` +
      `⏱️ Time Solved: ${timeStr}, ${dateStr} (BST)\n` +
      `🏢 Status: Solved & Ready for Operation`;

    let result: { success: boolean; error?: string; messageId?: string };

    if (photoData && typeof photoData === 'string' && photoData.trim().length > 10) {
      result = await sendGreenApiWhatsAppMedia(photoData.trim(), formattedMessage, TFW_ISSUE_RESOLVE_GROUP_ID);
    } else {
      result = await sendGreenApiWhatsAppMessage(formattedMessage, TFW_ISSUE_RESOLVE_GROUP_ID);
    }

    if (result.success && result.messageId) {
      markWhatsAppMessageProcessed(result.messageId);
      console.log(`[WhatsApp Resolution Sent] ${ticketId} for ${rideName} -> ${TFW_ISSUE_RESOLVE_GROUP_NAME} (${result.messageId})`);
    } else if (!result.success && ticketId) {
      // Allow retry if send failed
      recentSolvedNotifications.delete(ticketId);
      console.error(`[WhatsApp Resolution FAILED] ${ticketId} for ${rideName}: ${result.error}`);
    }

    return result;
  };

  // Management WhatsApp Reports API (Read-only collection from "TFW Management Team")
  app.get('/api/management/reports', (req, res) => {
    const db = loadDatabase();
    const reports = db.data?.whatsappManagementReports || {};
    res.json({
      status: 'success',
      reports,
      count: Object.keys(reports).length,
      groupName: 'TFW Management Team',
      listenerMode: 'read-only'
    });
  });

  app.post('/api/management/parse-report', (req, res) => {
    const { rawText, date, senderName } = req.body || {};
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const parsedReport = parseManagementReportText(rawText, {
      fallbackDate: date,
      senderName: senderName || 'TFW Management Team',
      groupName: 'TFW Management Team',
      timestamp: new Date().toISOString()
    });

    if (!parsedReport || (parsedReport.counterBreakdown.length === 0 && !parsedReport.salesAndRevenue.totalRevenue)) {
      return res.status(422).json({ error: 'Could not find any counter or revenue amounts in the pasted text' });
    }

    storeManagementReport(parsedReport, 'manual paste');

    return res.status(200).json({
      status: 'success',
      report: parsedReport
    });
  });

  // WhatsApp Configuration Endpoints
  app.get('/api/whatsapp/config', (req, res) => {
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    res.json({
      whapiApiUrl: cfg.whapiApiUrl || WHAPI_DEFAULT_API_URL,
      hasToken: Boolean(WHAPI_ENV_TOKEN),
      idInstance: GREEN_API_ENV_ID_INSTANCE || cfg.idInstance || '',
      groupChatId: cfg.groupChatId || cfg.detectedGroupChatId || TFW_ISSUE_RESOLVE_GROUP_ID,
      detectedGroupName: cfg.detectedGroupName || TFW_ISSUE_RESOLVE_GROUP_NAME,
      targetGroupName: cfg.targetGroupName || TFW_ISSUE_RESOLVE_GROUP_NAME,
      autoNotifyOnSolved: cfg.autoNotifyOnSolved !== false,
      autoNotifyOnAssigned: cfg.autoNotifyOnAssigned === true,
      lastMessage: cfg.lastMessage || null,
      lastSender: cfg.lastSender || null,
      lastMessageAt: cfg.lastMessageAt || null
    });
  });

  app.post('/api/whatsapp/config', (req, res) => {
    const { whapiApiUrl, whapiToken, idInstance, apiTokenInstance, groupChatId, targetGroupName, autoNotifyOnSolved, autoNotifyOnAssigned } = req.body || {};
    const db = loadDatabase();
    if (!db.config.whatsappConfig) db.config.whatsappConfig = {};

    // Tokens are not stored here: this config is broadcast to every browser. Set WHAPI_API_TOKEN / GREEN_API_TOKEN_INSTANCE instead.
    const tokenIgnored = [whapiToken, apiTokenInstance].some(t => t !== undefined && String(t).trim() !== '');
    if (whapiApiUrl !== undefined) db.config.whatsappConfig.whapiApiUrl = String(whapiApiUrl).trim();
    if (idInstance !== undefined) db.config.whatsappConfig.idInstance = String(idInstance).trim();
    if (groupChatId !== undefined) db.config.whatsappConfig.groupChatId = String(groupChatId).trim();
    if (targetGroupName !== undefined) db.config.whatsappConfig.targetGroupName = String(targetGroupName).trim();
    if (autoNotifyOnSolved !== undefined) db.config.whatsappConfig.autoNotifyOnSolved = Boolean(autoNotifyOnSolved);
    if (autoNotifyOnAssigned !== undefined) db.config.whatsappConfig.autoNotifyOnAssigned = Boolean(autoNotifyOnAssigned);

    saveDatabaseToDisk({
      type: 'update',
      updates: { 'config/whatsappConfig': db.config.whatsappConfig }
    });

    res.json({
      success: true,
      config: db.config.whatsappConfig,
      ...(tokenIgnored ? { warning: 'API tokens are not saved here. Set them as server environment variables.' } : {})
    });
  });

  // Outgoing message send endpoint (Direct chat to WhatsApp group)
  app.post('/api/whatsapp/send', async (req, res) => {
    const { message, chatId, sender = 'Maintenance Desk' } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const result = await sendGreenApiWhatsAppMessage(String(message).trim(), chatId);
    if (result.success) {
      if (result.messageId) {
        markWhatsAppMessageProcessed(result.messageId);
      }
      // Record outgoing broadcast in history log
      const db = loadDatabase();
      const now = Date.now();
      const historyId = now;
      const historyEntry = {
        id: historyId,
        timestamp: new Date().toISOString(),
        user: sender,
        action: 'WHATSAPP_MESSAGE_SENT',
        details: `[WHATSAPP OUTGOING] Sent to group: ${String(message).slice(0, 120)}`
      };
      if (!db.data.historyLog) db.data.historyLog = {};
      db.data.historyLog[historyId] = historyEntry;
      trimHistoryLogs(db);

      saveDatabaseToDisk({
        type: 'update',
        updates: { [`data/historyLog/${historyId}`]: historyEntry }
      });

      return res.json({ success: true, messageId: result.messageId });
    }

    res.status(400).json({ error: result.error });
  });

  // Deduplication cache for outgoing solved notifications (prevents duplicate WhatsApp messages within 10 seconds)
  const recentSolvedNotifications = new Map<string, number>();

  // Dispatch formatted ticket update to WhatsApp group
  app.post('/api/whatsapp/send-ticket-update', async (req, res) => {
    const { 
      ticketId, 
      rideName, 
      action, // 'solved' | 'assigned' | 'progress' | 'custom'
      dashboard,
      technicianName, 
      helpers = [], 
      notes, 
      reportedProblem,
      photoData,
      imageUrl,
      solutionImageUrl,
      sender = 'Maintenance Dashboard' 
    } = req.body || {};

    // Strict user rule: "Only Maintenance dashboard resolved issue will go what's up group ,rest of the other resolved dashboard issue will not go to the what's up group and not use green API."
    if (dashboard && dashboard !== 'maintenance-dashboard') {
      return res.json({ 
        success: true, 
        ignored: true, 
        message: 'Only issues resolved from the Maintenance Dashboard are sent to WhatsApp.' 
      });
    }

    if (action !== 'solved') {
      return res.json({ 
        success: true, 
        ignored: true, 
        message: 'Only resolved maintenance notifications are sent to the TFW Issue Resolve (Tech+ Guest Feedback) WhatsApp group.' 
      });
    }

    let resolvedTicketRef: any = null;

    if (ticketId) {
      // Auto-update ticket status in persistent database and broadcast via SSE to all clients in real-time
      try {
        const db = loadDatabase();
        if (db.data?.maintenanceTickets) {
          let updatedTicket: any = null;
          let targetDateKey: string = '';

          for (const [d, dayTickets] of Object.entries(db.data.maintenanceTickets)) {
            if (dayTickets && typeof dayTickets === 'object' && (dayTickets as any)[ticketId]) {
              targetDateKey = d;
              updatedTicket = (dayTickets as any)[ticketId];
              break;
            }
          }

          if (!updatedTicket && req.body?.rideId) {
            for (const [d, dayTickets] of Object.entries(db.data.maintenanceTickets)) {
              if (dayTickets && typeof dayTickets === 'object') {
                for (const [tId, t] of Object.entries(dayTickets as any)) {
                  if (t && (t as any).rideId === req.body.rideId && (t as any).status !== 'solved') {
                    targetDateKey = d;
                    updatedTicket = t;
                    break;
                  }
                }
              }
              if (updatedTicket) break;
            }
          }

          if (updatedTicket) {
            resolvedTicketRef = updatedTicket;
            const validSolvedAt = (req.body?.solvedAt && !isNaN(new Date(req.body.solvedAt).getTime()))
              ? new Date(req.body.solvedAt).toISOString()
              : new Date().toISOString();
            updatedTicket.status = 'solved';
            updatedTicket.solvedAt = validSolvedAt;
            updatedTicket.updatedAt = new Date().toISOString();
            if (notes) updatedTicket.resolutionNotes = notes;
            const incomingPhoto = photoData || imageUrl || solutionImageUrl || req.body?.photoUrl;
            if (incomingPhoto) {
              updatedTicket.solutionImageUrl = incomingPhoto;
              updatedTicket.photoUrl = incomingPhoto;
            }
            if (technicianName) updatedTicket.assignedToName = technicianName;
            if (Array.isArray(helpers) && helpers.length > 0) updatedTicket.helperNames = helpers;

            saveDatabaseToDisk({
              type: 'update',
              updates: {
                [`data/maintenanceTickets/${targetDateKey}/${updatedTicket.id || ticketId}`]: updatedTicket
              }
            });
          }
        }
      } catch (err) {
        console.error('Error auto-updating ticket in send-ticket-update:', err);
      }
    }

    let rawPhoto = photoData || imageUrl || solutionImageUrl || req.body?.photoUrl;
    if (!rawPhoto && resolvedTicketRef) {
      rawPhoto = resolvedTicketRef.solutionImageUrl || resolvedTicketRef.photoUrl || (Array.isArray(resolvedTicketRef.photos) && resolvedTicketRef.photos[0]);
    }
    if (!rawPhoto && ticketId) {
      try {
        const sqlite = getSqliteDatabase();
        const row: any = sqlite.prepare('SELECT solution_image_url, photo_url FROM maintenance_tickets WHERE id = ?').get(ticketId);
        if (row?.solution_image_url) {
          rawPhoto = row.solution_image_url;
        } else if (row?.photo_url) {
          rawPhoto = row.photo_url;
        }
      } catch (e) {
        // ignore
      }
    }

    const result = await notifyTicketResolvedToWhatsApp({
      ticketId: ticketId || '',
      rideId: req.body?.rideId,
      rideName,
      technicianName,
      helpers,
      reportedProblem,
      notes,
      photoData: rawPhoto,
      solvedAt: req.body?.solvedAt
    });

    if (result.success) {
      return res.json({
        success: true,
        alreadySent: result.messageId === 'already-sent',
        messageId: result.messageId,
        hasMedia: Boolean(rawPhoto)
      });
    }
    // Return friendly status without breaking the UI flow
    res.status(200).json({ success: false, error: result.error, fallbackLogged: true });
  });

  // Pre-seed processed IDs on startup from persistent database and all existing tickets
  try {
    const initialDb = loadDatabase();
    if (Array.isArray(initialDb.config?.whatsappConfig?.processedMessageIds)) {
      for (const id of initialDb.config.whatsappConfig.processedMessageIds) {
        if (id) processedWhatsAppMessageIds.add(String(id));
      }
    }
    if (initialDb.data?.maintenanceTickets) {
      for (const dayTickets of Object.values(initialDb.data.maintenanceTickets)) {
        if (dayTickets && typeof dayTickets === 'object') {
          for (const t of Object.values(dayTickets as Record<string, any>)) {
            if (t?.whatsappMessageId) {
              processedWhatsAppMessageIds.add(String(t.whatsappMessageId));
            }
          }
        }
      }
    }
  } catch (e) {}

  let greenApiRateLimitedUntil = 0;

  // Background WhatsApp Sync Engine: Directly polls Green API for new incoming group messages
  async function syncGreenApiGroupMessages(force = false): Promise<{ success: boolean; newTickets: number; error?: string }> {
    if (!force && Date.now() < greenApiRateLimitedUntil) {
      return { success: false, newTickets: 0, error: 'Green API rate limited (429) - waiting for cooldown' };
    }
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    const idInstance = GREEN_API_ENV_ID_INSTANCE || cfg.idInstance || '';
    const apiTokenInstance = GREEN_API_ENV_TOKEN_INSTANCE;

    if (!idInstance || !apiTokenInstance) {
      return { success: false, newTickets: 0, error: 'Green API credentials missing' };
    }

    // User directive: synced with WhatsApp group "TFW Issue Resolve (Tech+ Guest Feedback)"
    const targetGroupId = cfg.groupChatId || '120363024724303859@g.us';
    const targetGroupName = cfg.targetGroupName || cfg.detectedGroupName || 'TFW Issue Resolve (Tech+ Guest Feedback)';

    // Seed set of WhatsApp message IDs that already have tickets in maintenanceTickets
    const existingTicketMsgIds = new Set<string>();
    if (db.data?.maintenanceTickets) {
      for (const d of Object.keys(db.data.maintenanceTickets)) {
        for (const t of Object.values(db.data.maintenanceTickets[d]) as any[]) {
          if (t?.whatsappMessageId) {
            existingTicketMsgIds.add(String(t.whatsappMessageId));
          }
        }
      }
    }

    try {
      // Strictly fetch messages only from the official "Technical support TFW" group (120363024724303859@g.us)
      const allIncomingMessages: any[] = [];

      // 1. Primary method: lastIncomingMessages (high performance, no 429 rate limit)
      try {
        const minutesToFetch = force ? 1440 : 240;
        const incomingUrl = `https://api.green-api.com/waInstance${idInstance}/lastIncomingMessages/${apiTokenInstance}?minutes=${minutesToFetch}`;
        const res = await fetch(incomingUrl);
        reportJournalStatus(res.status);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            for (const m of list) {
              if (m) {
                const cId = String(m.chatId || '');
                const textPreview = extractGreenApiText(m);
                const isMgmt = cId.toLowerCase().includes('management') || String(m.chatName || '').toLowerCase().includes('management') || isManagementSalesMessage(textPreview);
                if (cId === targetGroupId || cId.includes('120363024724303859') || isMgmt) {
                  m._sourceChatId = isMgmt ? 'TFW Management Team' : targetGroupId;
                  allIncomingMessages.push(m);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[WhatsApp Sync] Error querying lastIncomingMessages:', e);
      }

      // 2. Secondary source: getChatHistory, only on a manual refresh (the background poll would hit its 1-per-second limit for nothing)
      if (force) {
        try {
          const historyUrl = `https://api.green-api.com/waInstance${idInstance}/getChatHistory/${apiTokenInstance}`;
          const res = await fetch(historyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: targetGroupId, count: 50 })
          });
          if (res.status === 429) {
            greenApiRateLimitedUntil = Date.now() + 30000;
          } else if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
              for (const m of list) {
                if (m) {
                  m._sourceChatId = targetGroupId;
                  allIncomingMessages.push(m);
                }
              }
            }
          }
        } catch (e) {
          // Gracefully ignore rate limit on chat history fallback
        }
      }

      // Deduplicate array by idMessage
      const uniqueMsgs = new Map<string, any>();
      for (const m of allIncomingMessages) {
        if (m && m.idMessage && !uniqueMsgs.has(m.idMessage)) {
          uniqueMsgs.set(m.idMessage, m);
        }
      }

      // Sort chronologically (oldest to newest)
      const sortedMsgs = Array.from(uniqueMsgs.values()).sort(
        (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
      );

      let newTicketsCount = 0;
      const now = Date.now();

      // Prepare rides list for auto-detection
      let ridesList: Array<{ id: number; name: string; floor?: number | string }> = [];
      if (Array.isArray(db.config?.rides)) {
        ridesList = db.config.rides;
      } else if (db.config?.rides && typeof db.config.rides === 'object') {
        ridesList = Object.entries(db.config.rides).map(([id, r]: any) => ({
          id: Number(id),
          name: r.name || `Ride ${id}`,
          floor: r.floor
        }));
      }

      const newTicketUpdates: { [path: string]: any } = {};

      for (const m of sortedMsgs) {
        const idMessage = String(m.idMessage || '');
        if (!idMessage) continue;

        // Skip automated bot messages sent by our system via API or outgoing messages
        if (m.sendByApi === true || m.type === 'outgoing') {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // Ignore pure reaction messages or status stubs
        if (m.typeMessage === 'reactionMessage') {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        const cleanMessage = extractGreenApiText(m);

        if (!cleanMessage) {
          continue;
        }

        // Check if message is a Management Sales Closing report from group "TFW Management Team"
        if (isManagementSalesMessage(cleanMessage)) {
          if (!force && processedWhatsAppMessageIds.has(idMessage)) {
            continue;
          }
          const senderNameRaw = String(
            m.senderContactName ||
            m.senderName ||
            m.senderData?.senderContactName ||
            m.senderData?.senderName ||
            'TFW Management Team'
          );
          const senderPhoneRaw = String(m.senderId || m.sender || m.chatId || m.senderData?.sender || '').replace(/@c\.us|@g\.us|@s\.whatsapp\.net/g, '');
          const msgTimeRaw = m.timestamp ? new Date(m.timestamp * 1000) : new Date();

          const parsedReport = parseManagementReportText(cleanMessage, {
            fallbackDate: getDhakaDateString(msgTimeRaw),
            senderName: senderNameRaw,
            senderPhone: senderPhoneRaw,
            groupName: 'TFW Management Team',
            timestamp: msgTimeRaw.toISOString()
          });

          if (parsedReport) {
            storeManagementReport(parsedReport, force ? 'manual WhatsApp sync' : 'WhatsApp poll');
          }
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // Sender info
        const senderName = String(
          m.senderContactName ||
          m.senderName ||
          m.senderData?.senderContactName ||
          m.senderData?.senderName ||
          (m.type === 'outgoing' ? 'TFW Staff' : 'WhatsApp Member')
        );
        if (
          senderName.toLowerCase().includes('tfw management') ||
          senderName.toLowerCase().includes('maintenance desk') ||
          senderName.toLowerCase().includes('maintenance dashboard')
        ) {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        const senderPhone = String(m.senderId || m.sender || m.chatId || m.senderData?.sender || '').replace(/@c\.us|@g\.us|@s\.whatsapp\.net/g, '');
        const imageUrl = String(
          m.downloadUrl ||
          m.fileMessageData?.downloadUrl ||
          m.imageMessageData?.downloadUrl ||
          m.messageData?.imageMessageData?.downloadUrl ||
          m.messageData?.fileMessageData?.downloadUrl ||
          ''
        );

        const msgTime = m.timestamp ? new Date(m.timestamp * 1000) : new Date();

        // Check if this message is a quoted reply to an earlier ticket
        const quotedStanzaId = String(
          m.quotedMessage?.stanzaId ||
          m.extendedTextMessage?.stanzaId ||
          m.messageData?.extendedTextMessageData?.stanzaId ||
          ''
        );

        if (quotedStanzaId) {
          const quotedExisting = findExistingMaintenanceTicket(db, '', quotedStanzaId, 0, '');
          if (quotedExisting) {
            const lower = cleanMessage.toLowerCase();
            const isWorkOnGoing = lower.includes('work is going on') || lower.includes('working') || lower.includes('in progress') || lower.includes('checking') || lower.includes('inspecting');
            const isSolvedMsg = lower.includes('problem solved') || lower.includes('game is operational') || lower.includes('operational') || lower.includes('issue resolved') || lower.includes('solved') || lower.includes('fixed') || lower.includes('repaired') || lower.includes('done');

            if (isSolvedMsg && quotedExisting.ticket.status !== 'solved') {
              quotedExisting.ticket.status = 'solved';
              quotedExisting.ticket.solvedAt = msgTime.toISOString();
              quotedExisting.ticket.resolutionNotes = cleanMessage;
              quotedExisting.ticket.assignedToName = senderName;

              // Parse helper technicians if mentioned: e.g. "Assist @Alif @Farhan"
              const mentionMatches = cleanMessage.match(/@([a-zA-Z0-9_.-]+)/g);
              if (mentionMatches && mentionMatches.length > 0) {
                quotedExisting.ticket.helperNames = mentionMatches.map((x: string) => x.replace(/^@/, '').trim());
              }

              db.data.maintenanceTickets[quotedExisting.dateKey][quotedExisting.ticketId] = quotedExisting.ticket;
              newTicketUpdates[`data/maintenanceTickets/${quotedExisting.dateKey}/${quotedExisting.ticketId}`] = quotedExisting.ticket;
              markWhatsAppMessageProcessed(idMessage);
              newTicketsCount++;
              continue;
            } else if (isWorkOnGoing && quotedExisting.ticket.status === 'reported') {
              quotedExisting.ticket.status = 'in-progress';
              quotedExisting.ticket.inProgressAt = msgTime.toISOString();
              quotedExisting.ticket.assignedToName = senderName;
              db.data.maintenanceTickets[quotedExisting.dateKey][quotedExisting.ticketId] = quotedExisting.ticket;
              newTicketUpdates[`data/maintenanceTickets/${quotedExisting.dateKey}/${quotedExisting.ticketId}`] = quotedExisting.ticket;
              markWhatsAppMessageProcessed(idMessage);
              newTicketsCount++;
              continue;
            } else {
              markWhatsAppMessageProcessed(idMessage);
              continue;
            }
          }
        }

        // Strictly filter out any resolved records or maintenance broadcasts so they never create new tickets
        if (isResolutionOrSystemMessage(cleanMessage)) {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // If this message already created a ticket that currently exists in maintenanceTickets, skip creation
        if (existingTicketMsgIds.has(idMessage)) {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // If user explicitly deleted this specific WhatsApp message, honor the deletion
        if (db.config?.deletedWhatsAppMessageIds?.includes(idMessage)) {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // In normal polling, skip if already marked processed
        if (!force && processedWhatsAppMessageIds.has(idMessage)) {
          continue;
        }

        // Match ride using prioritized matcher
        const matchedRide = matchRideFromMessage(cleanMessage, ridesList);

        // Detect priority
        const priority = detectTicketPriority(cleanMessage);

        const ticketDate = getDhakaDateString(msgTime);
        const ticketId = `${ticketDate}-${matchedRide.id}-${m.timestamp || now}`;

        // Check if ticket was deleted or discarded
        if (isTicketDeleted(db, ticketId, idMessage, matchedRide.id, cleanMessage)) {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // Check if this issue is already solved in Resolved Records
        if (isIssueAlreadySolved(db, matchedRide.id, cleanMessage, idMessage)) {
          markWhatsAppMessageProcessed(idMessage);
          continue;
        }

        // Check if ticket already exists across all dates
        const existing = findExistingMaintenanceTicket(db, ticketId, idMessage, matchedRide.id, cleanMessage);
        if (existing) {
          markWhatsAppMessageProcessed(idMessage);
          if (existing.ticket.status === 'solved' || existing.ticket.status === 'in-progress') {
            continue;
          }
          if (imageUrl && !existing.ticket.photoUrl) {
            existing.ticket.photoUrl = imageUrl;
            db.data.maintenanceTickets[existing.dateKey][existing.ticketId] = existing.ticket;
            newTicketUpdates[`data/maintenanceTickets/${existing.dateKey}/${existing.ticketId}/photoUrl`] = imageUrl;
          }
          continue;
        }

        const deptInfo = detectTargetDepartmentAndConcern(cleanMessage);

        const newTicket = {
          id: ticketId,
          date: ticketDate,
          rideId: matchedRide.id,
          rideName: matchedRide.name,
          problem: cleanMessage,
          status: 'reported',
          reportedById: 9999,
          reportedByName: `${senderName} (WhatsApp)`,
          reportedByRole: senderPhone ? `WhatsApp: ${senderPhone}` : 'TFW Issue Resolve (Tech+ Guest Feedback)',
          source: 'whatsapp',
          targetDepartment: deptInfo.targetDepartment,
          feedbackCategory: deptInfo.feedbackCategory,
          priority,
          reportedAt: msgTime.toISOString(),
          photoUrl: imageUrl || undefined,
          whatsappGroup: targetGroupName,
          whatsappChatId: targetGroupId,
          whatsappMessageId: idMessage
        };

        if (!db.data.maintenanceTickets) db.data.maintenanceTickets = {};
        if (!db.data.maintenanceTickets[ticketDate]) db.data.maintenanceTickets[ticketDate] = {};

        db.data.maintenanceTickets[ticketDate][ticketId] = newTicket;
        existingTicketMsgIds.add(idMessage);
        markWhatsAppMessageProcessed(idMessage);
        newTicketsCount++;

        // History log
        if (!db.data.historyLog) db.data.historyLog = {};
        const historyId = Date.now() + newTicketsCount;
        const historyEntry = {
          id: historyId,
          timestamp: new Date().toISOString(),
          user: `${senderName} (WhatsApp)`,
          action: 'WHATSAPP_TICKET_CREATED',
          details: `[WHATSAPP (${targetGroupName})] ${matchedRide.name}: ${cleanMessage.slice(0, 100)}`
        };
        db.data.historyLog[historyId] = historyEntry;

        // Update config
        if (!db.config.whatsappConfig) db.config.whatsappConfig = {};
        db.config.whatsappConfig.groupChatId = targetGroupId;
        db.config.whatsappConfig.detectedGroupName = targetGroupName;
        db.config.whatsappConfig.targetGroupName = targetGroupName;
        db.config.whatsappConfig.lastMessage = cleanMessage;
        db.config.whatsappConfig.lastSender = senderName;
        db.config.whatsappConfig.lastMessageAt = msgTime.toISOString();

        // Queue real-time delta update paths
        newTicketUpdates[`data/maintenanceTickets/${ticketDate}/${ticketId}`] = newTicket;
        newTicketUpdates[`data/historyLog/${historyId}`] = historyEntry;
        newTicketUpdates['config/whatsappConfig'] = db.config.whatsappConfig;
      }

      if (newTicketsCount > 0) {
        trimHistoryLogs(db);
        saveDatabaseToDisk({
          type: 'update',
          updates: newTicketUpdates
        });
        broadcastMutation({
          type: 'update',
          updates: newTicketUpdates,
          senderId: 'server-instance'
        });

        // Broadcast issue-reported event for newly synchronized tickets so alert chime and voice announce play immediately
        for (const [upPath, upVal] of Object.entries(newTicketUpdates)) {
          if (upPath.startsWith('data/maintenanceTickets/') && upVal && typeof upVal === 'object' && (upVal as any).status === 'reported') {
            const t = upVal as any;
            broadcastMutation({
              type: 'issue-reported',
              ticket: t,
              rideName: t.rideName,
              problem: t.problem,
              priority: t.priority,
              source: 'whatsapp',
              reportedByName: t.reportedByName,
              reportedByRole: t.reportedByRole,
              targetDepartment: t.targetDepartment,
              feedbackCategory: t.feedbackCategory,
              date: t.date,
              senderId: 'whatsapp-sync'
            });
          }
        }
        console.log(`[WhatsApp Sync Engine] Synchronized ${newTicketsCount} updates/new tickets from WhatsApp`);
      }

      return { success: true, newTickets: newTicketsCount };
    } catch (err: any) {
      console.error('[WhatsApp Sync Engine Error]:', err);
      return { success: false, newTickets: 0, error: err.message };
    }
  }

  // Manual WhatsApp Sync Now endpoint
  app.post('/api/whatsapp/sync-now', async (req, res) => {
    try {
      const result = await syncGreenApiGroupMessages(true);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reset processed WhatsApp message IDs (re-seeds only from actual existing tickets)
  app.post('/api/whatsapp/reset-processed', (req, res) => {
    processedWhatsAppMessageIds.clear();
    const db = loadDatabase();
    const existingTicketMsgIds = new Set<string>();
    if (db.data?.maintenanceTickets) {
      for (const dayTickets of Object.values(db.data.maintenanceTickets)) {
        if (dayTickets && typeof dayTickets === 'object') {
          for (const t of Object.values(dayTickets as Record<string, any>)) {
            if (t?.whatsappMessageId) {
              existingTicketMsgIds.add(String(t.whatsappMessageId));
              processedWhatsAppMessageIds.add(String(t.whatsappMessageId));
            }
          }
        }
      }
    }
    const cleanList = Array.from(existingTicketMsgIds);
    if (!db.config.whatsappConfig) db.config.whatsappConfig = {};
    db.config.whatsappConfig.processedMessageIds = cleanList;
    saveDatabaseToDisk({
      type: 'update',
      updates: { 'config/whatsappConfig/processedMessageIds': cleanList }
    });
    res.json({ success: true, message: 'Processed WhatsApp message IDs reset to active tickets', count: cleanList.length });
  });

  // Automatically configure Green API Webhook so incoming messages push immediately (<500ms)
  async function configureGreenApiWebhook() {
    const db = loadDatabase();
    const cfg = db.config?.whatsappConfig || {};
    const idInstance = GREEN_API_ENV_ID_INSTANCE || cfg.idInstance || '';
    const apiTokenInstance = GREEN_API_ENV_TOKEN_INSTANCE;
    if (!idInstance || !apiTokenInstance) return;

    const appUrl = process.env.APP_URL;
    const isPublicDomain = appUrl && 
      appUrl.startsWith('https://') && 
      !appUrl.includes('localhost') && 
      !appUrl.includes('127.0.0.1') &&
      !appUrl.includes('ais-dev-');

    try {
      if (isPublicDomain) {
        const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhooks/whatsapp${WHATSAPP_WEBHOOK_SECRET ? `?secret=${encodeURIComponent(WHATSAPP_WEBHOOK_SECRET)}` : ''}`;
        const res = await fetch(`https://api.green-api.com/waInstance${idInstance}/setSettings/${apiTokenInstance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl,
            incomingWebhook: 'yes',
            outgoingWebhook: 'yes',
            outgoingMessageWebhook: 'yes',
            outgoingAPIMessageWebhook: 'no'
          })
        });
        if (res.ok) {
          console.log(`[Green API] Webhook registered successfully to: ${webhookUrl}`);
        }
      } else {
        // Offline / Local deployment mode: Clear webhook so Green API delivers via direct API polling without failing
        const res = await fetch(`https://api.green-api.com/waInstance${idInstance}/setSettings/${apiTokenInstance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            webhookUrl: '',
            incomingWebhook: 'no'
          })
        });
        if (res.ok) {
          console.log('[Green API] Running in offline / direct API polling mode. Webhook cleared.');
        }
      }
    } catch (e) {
      console.error('[Green API] Failed to set webhook settings:', e);
    }
  }

  // Green API / WhatsApp polling removed per workflow requirements

  // Batch update
  app.post('/api/db/update', (req, res) => {
    const { updates, basePath = '', senderId } = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates object is required' });
    }
    const db = loadDatabase();
    const isExplicitReopen = Boolean(req.body.isExplicitReopen || updates.isExplicitReopen);
    for (const [p, val] of Object.entries(updates)) {
      setValueByPath(db, p, val, isExplicitReopen);
    }
    if (Object.keys(updates).some(k => k.includes('historyLog'))) {
      trimHistoryLogs(db);
    }
    saveDatabaseToDisk({ type: 'update', updates, senderId });
    res.json({ success: true, version: db.version });
  });

  // Remove path
  app.post('/api/db/remove', (req, res) => {
    const { path: pathStr, senderId } = req.body;
    if (!pathStr) {
      return res.status(400).json({ error: 'path is required' });
    }
    const db = loadDatabase();
    if (pathStr.startsWith('data/maintenanceTickets')) {
      const parts = pathStr.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const targetDate = parts[2];
        const targetId = parts[3];
        cleanupDeletedTicket(db, targetId, targetDate);
      }
    }
    setValueByPath(db, pathStr, null);
    saveDatabaseToDisk({ type: 'remove', path: pathStr, senderId });
    res.json({ success: true, version: db.version });
  });

  // Clear all maintenance issue records across database and disk
  app.post('/api/maintenance/clear-all', (req, res) => {
    const { senderId } = req.body || {};
    const db = loadDatabase();
    db.data.maintenanceTickets = {};
    if (!db.config) db.config = {};
    db.config.deletedTicketIds = [];
    db.config.deletedTicketSignatures = [];
    db.config.deletedWhatsAppMessageIds = [];
    try {
      const sqlite = getSqliteDatabase();
      sqlite.exec('DELETE FROM maintenance_tickets;');
      sqlite.prepare("UPDATE system_config SET deleted_ticket_ids = '[]', deleted_wa_msg_ids = '[]' WHERE id = 'primary'").run();
    } catch (e) {
      console.warn('Could not clear sqlite maintenance_tickets:', e);
    }
    saveDatabaseToDisk({
      type: 'update',
      updates: {
        'data/maintenanceTickets': {},
        'config/deletedTicketIds': [],
        'config/deletedTicketSignatures': [],
        'config/deletedWhatsAppMessageIds': []
      },
      senderId
    });
    broadcastMutation({
      type: 'update',
      updates: {
        'data/maintenanceTickets': {},
        'config/deletedTicketIds': [],
        'config/deletedTicketSignatures': [],
        'config/deletedWhatsAppMessageIds': []
      },
      senderId
    });
    res.json({ success: true, message: 'All maintenance records cleared successfully. Starting fresh from today.' });
  });

  // Permanently delete a maintenance ticket across all dates and cache
  app.post('/api/db/delete-ticket', (req, res) => {
    const { ticketId, date, whatsappMessageId, rideId, problem, senderId } = req.body;
    if (!ticketId && !whatsappMessageId) {
      return res.status(400).json({ error: 'ticketId or whatsappMessageId is required' });
    }
    const db = loadDatabase();
    const result = cleanupDeletedTicket(
      db,
      ticketId,
      date,
      whatsappMessageId,
      rideId ? Number(rideId) : undefined,
      problem
    );
    saveDatabaseToDisk({
      type: 'delete-ticket',
      ticketId,
      whatsappMessageId,
      rideId: rideId ? Number(rideId) : undefined,
      problem,
      date,
      deletedIds: result.deletedIds,
      deletedSignatures: db.config?.deletedTicketSignatures,
      maintenanceTickets: db.data?.maintenanceTickets,
      senderId
    });
    // Multi-device immediate broadcast: send clean maintenance tickets map directly
    broadcastMutation({
      type: 'set',
      path: 'data/maintenanceTickets',
      value: db.data?.maintenanceTickets || {},
      senderId
    });
    res.json({ success: true, deletedCount: result.deletedCount, version: db.version });
  });

  // Permanently clear all reported maintenance tickets for a given date
  app.post('/api/db/clear-reported-tickets', (req, res) => {
    const { date, senderId } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }
    const db = loadDatabase();
    if (!db.config) db.config = {};
    if (!Array.isArray(db.config.deletedTicketIds)) db.config.deletedTicketIds = [];
    if (!Array.isArray(db.config.deletedWhatsAppMessageIds)) db.config.deletedWhatsAppMessageIds = [];

    let deletedCount = 0;
    if (db.data?.maintenanceTickets && typeof db.data.maintenanceTickets === 'object') {
      const maint = db.data.maintenanceTickets;
      for (const dKey of Object.keys(maint)) {
        if (!maint[dKey] || typeof maint[dKey] !== 'object') continue;
        for (const [tId, tObjRaw] of Object.entries(maint[dKey])) {
          const tObj = tObjRaw as any;
          if (tObj && tObj.status === 'reported') {
            const isMatchDate = dKey === date || tObj.date === date || (tObj.reportedAt && tObj.reportedAt.startsWith(date));
            if (isMatchDate) {
              if (tObj.id && !db.config.deletedTicketIds.includes(tObj.id)) {
                db.config.deletedTicketIds.push(tObj.id);
              }
              if (tObj.whatsappMessageId) {
                if (!db.config.deletedWhatsAppMessageIds.includes(tObj.whatsappMessageId)) {
                  db.config.deletedWhatsAppMessageIds.push(tObj.whatsappMessageId);
                }
                markWhatsAppMessageProcessed(tObj.whatsappMessageId);
              }
              delete maint[dKey][tId];
              deletedCount++;
            }
          }
        }
        if (Object.keys(maint[dKey]).length === 0) {
          delete maint[dKey];
        }
      }
    }
    saveDatabaseToDisk({
      type: 'clear-reported-tickets',
      date,
      maintenanceTickets: db.data?.maintenanceTickets,
      senderId
    });
    // Multi-device immediate broadcast: send clean maintenance tickets map directly
    broadcastMutation({
      type: 'set',
      path: 'data/maintenanceTickets',
      value: db.data?.maintenanceTickets || {},
      senderId
    });
    res.json({ success: true, deletedCount, version: db.version });
  });

  // Reset specific day data
  app.post('/api/db/reset-day', (req, res) => {
    const { date, senderId } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }
    const db = loadDatabase();
    if (db.data.dailyCounts) delete db.data.dailyCounts[date];
    if (db.data.dailyPackageCounts) delete db.data.dailyPackageCounts[date];
    if (db.data.dailyTicketCounts) delete db.data.dailyTicketCounts[date];
    if (db.data.ticketSalesData) delete db.data.ticketSalesData[date];
    if (db.data.operatorAssignments) delete db.data.operatorAssignments[date];
    if (db.data.ticketSalesAssignments) delete db.data.ticketSalesAssignments[date];
    if (db.data.attendance) delete db.data.attendance[date];
    if (db.data.packageSales) delete db.data.packageSales[date];
    if (db.data.maintenanceTickets) delete db.data.maintenanceTickets[date];
    saveDatabaseToDisk({ type: 'reset-day', date, senderId });
    res.json({ success: true, message: `Data for ${date} successfully reset.` });
  });

  // Clean data older than cutoff date (e.g. 3 months / 90 days)
  app.post('/api/db/clean-older-than', (req, res) => {
    const { cutoffDate, senderId } = req.body;
    if (!cutoffDate) {
      return res.status(400).json({ error: 'cutoffDate is required' });
    }
    const db = loadDatabase();
    const collections = ['dailyCounts', 'dailyPackageCounts', 'dailyTicketCounts', 'ticketSalesData', 'operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales', 'maintenanceTickets'];
    const allDates = new Set<string>();
    
    collections.forEach(col => {
      if (db.data[col] && typeof db.data[col] === 'object') {
        Object.keys(db.data[col]).forEach(d => {
          if (d < cutoffDate) {
            allDates.add(d);
            delete db.data[col][d];
          }
        });
      }
    });

    saveDatabaseToDisk({ type: 'clean-older-than', cutoffDate, senderId });
    res.json({ success: true, deletedDatesCount: allDates.size, message: `Cleaned ${allDates.size} dates older than ${cutoffDate}.` });
  });

  // Reset 3-Month cycle, archive operational day logs, and start next interval
  app.post('/api/db/reset-cycle', (req, res) => {
    const { newCycleStartDate, senderId } = req.body;
    const db = loadDatabase();
    const collections = ['dailyCounts', 'ticketSalesData', 'operatorAssignments', 'ticketSalesAssignments', 'attendance', 'packageSales', 'maintenanceTickets'];
    
    collections.forEach(col => {
      if (db.data[col] && typeof db.data[col] === 'object') {
        Object.keys(db.data[col]).forEach(d => {
          if (newCycleStartDate && d < newCycleStartDate) {
            delete db.data[col][d];
          }
        });
      }
    });

    const startDateObj = new Date(newCycleStartDate || new Date().toISOString().split('T')[0]);
    const endDateObj = new Date(startDateObj);
    endDateObj.setMonth(endDateObj.getMonth() + 3);
    const newCycleEndDate = endDateObj.toISOString().split('T')[0];

    if (!db.config.appConfig) db.config.appConfig = {};
    db.config.appConfig.cycleStartDate = newCycleStartDate;
    db.config.appConfig.cycleEndDate = newCycleEndDate;
    db.config.appConfig.cycleIntervalMonths = 3;
    db.config.appConfig.lastCycleResetDate = new Date().toISOString();
    db.config.appConfig.lastBackupDate = new Date().toISOString();

    saveDatabaseToDisk({ type: 'reset-cycle', newCycleStartDate, senderId });
    res.json({ success: true, message: `Next 3-Month interval initialized from ${newCycleStartDate} to ${newCycleEndDate}.` });
  });

  // Backup and restore need BACKUP_PASSWORD, which only lives on the server. The admin role password
  // cannot guard them because /api/db sends appConfig (including that password) to every browser.
  const BACKUP_PASSWORD = String(process.env.BACKUP_PASSWORD || '');
  const backupAttempts = createAttemptLimiter(5, 10 * 60 * 1000);
  const RESTORE_POINTS_DIR = path.join(DATA_DIR, 'restore-points');
  const RESTORE_POINTS_KEPT = 5;

  // Not 401: the browser treats 401 as an expired site login and redirects to /login.
  function checkBackupPassword(req: express.Request, res: express.Response): boolean {
    if (!BACKUP_PASSWORD) {
      res.status(503).json({ error: 'backup_not_configured', message: 'Backup is not set up yet. Set BACKUP_PASSWORD on the server.' });
      return false;
    }
    const ip = clientIp(req);
    const waitMs = backupAttempts.blockedForMs(ip);
    if (waitMs > 0) {
      res.setHeader('Retry-After', String(Math.ceil(waitMs / 1000)));
      res.status(429).json({ error: 'too_many_attempts', message: `Too many wrong passwords. Try again in ${Math.ceil(waitMs / 60000)} minutes.` });
      return false;
    }
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !safeEqual(password, BACKUP_PASSWORD)) {
      backupAttempts.fail(ip);
      res.status(403).json({ error: 'wrong_backup_password', message: 'Wrong backup password.' });
      return false;
    }
    backupAttempts.reset(ip);
    return true;
  }

  function buildBackupFile() {
    const images: Record<string, string> = {};
    if (fs.existsSync(RIDE_IMAGES_DIR)) {
      for (const name of fs.readdirSync(RIDE_IMAGES_DIR)) {
        const filePath = path.join(RIDE_IMAGES_DIR, name);
        if (fs.statSync(filePath).isFile()) images[name] = fs.readFileSync(filePath).toString('base64');
      }
    }
    return { format: 'tfw-backup', formatVersion: 1, createdAt: new Date().toISOString(), database: loadDatabase(), images };
  }

  function saveRestorePoint() {
    fs.mkdirSync(RESTORE_POINTS_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.writeFileSync(path.join(RESTORE_POINTS_DIR, `before-restore-${stamp}.json`), JSON.stringify(buildBackupFile()), 'utf-8');
    const points = fs.readdirSync(RESTORE_POINTS_DIR).filter(f => f.startsWith('before-restore-')).sort();
    for (const old of points.slice(0, Math.max(0, points.length - RESTORE_POINTS_KEPT))) {
      fs.unlinkSync(path.join(RESTORE_POINTS_DIR, old));
    }
  }

  app.post('/api/admin/backup', (req, res) => {
    if (!checkBackupPassword(req, res)) return;
    const backup = buildBackupFile();
    const filename = `TFW_Backup_${getDhakaDateString()}.json`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    console.log(`💾 Backup downloaded (${Object.keys(backup.images).length} photos) by ${clientIp(req)}`);
    res.json(backup);
  });

  app.post('/api/admin/restore', (req, res) => {
    if (!checkBackupPassword(req, res)) return;
    const file = req.body?.backup;
    const isFullBackup = file?.format === 'tfw-backup';
    const db = isFullBackup ? file.database : file;
    if (!db || typeof db !== 'object' || !db.config || typeof db.config !== 'object' || !db.data || typeof db.data !== 'object') {
      return res.status(400).json({ error: 'invalid_backup', message: 'This file is not a Toggi Fun World backup.' });
    }

    try {
      saveRestorePoint();
    } catch (e) {
      console.error('Restore aborted: could not save restore point:', e);
      return res.status(500).json({ error: 'safety_copy_failed', message: 'Could not save a safety copy of the current data, so nothing was restored.' });
    }

    const waConfig = db.config.whatsappConfig;
    if (waConfig && typeof waConfig === 'object') {
      delete waConfig.apiTokenInstance;
      delete waConfig.whapiToken;
    }
    // Jump past every client's cached version so all devices take the restored data instead of their own copy.
    memoryDb = {
      version: Math.max(Number(memoryDb?.version) || 0, Number(db.version) || 0) + 10,
      lastUpdated: new Date().toISOString(),
      config: db.config,
      data: db.data
    };

    let restoredPhotos = 0;
    if (isFullBackup && file.images && typeof file.images === 'object') {
      fs.mkdirSync(RIDE_IMAGES_DIR, { recursive: true });
      for (const [name, base64] of Object.entries(file.images)) {
        if (!/^[A-Za-z0-9._-]+$/.test(name) || name.startsWith('.') || typeof base64 !== 'string') continue;
        fs.writeFileSync(path.join(RIDE_IMAGES_DIR, name), Buffer.from(base64, 'base64'));
        restoredPhotos++;
      }
    }

    saveDatabaseToDisk({ type: 'sync' }, true);
    console.log(`♻️ Database restored from backup (${restoredPhotos} photos) by ${clientIp(req)}`);
    res.json({ success: true, restoredPhotos, version: memoryDb.version });
  });

  app.get('/api/db/export', (req, res) => {
    res.status(410).json({ error: 'moved', message: 'Use Admin > Cloud Database & Backup with the backup password.' });
  });
  app.post('/api/db/import', (req, res) => {
    res.status(410).json({ error: 'moved', message: 'Use Admin > Cloud Database & Backup with the backup password.' });
  });

  // SQLite Stats & Diagnostics Endpoint
  app.get('/api/db/sqlite-stats', (req, res) => {
    try {
      const stats = getSqliteStats();
      res.json({
        engine: 'sqlite3 (node:sqlite / WAL mode)',
        active: Boolean(stats),
        stats: stats || 'No database initialized yet'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Comprehensive Database Information & Health Status Endpoint
  app.get('/api/db/info', (req, res) => {
    try {
      const stats = getSqliteStats();
      const dataDir = path.join(process.cwd(), 'data');
      const getFileSize = (fileName: string) => {
        try {
          const fp = path.join(dataDir, fileName);
          if (fs.existsSync(fp)) {
            return fs.statSync(fp).size;
          }
        } catch {}
        return 0;
      };

      const dbSize = getFileSize('tfw.db');
      const walSize = getFileSize('tfw.db-wal');
      const shmSize = getFileSize('tfw.db-shm');
      const jsonSize = getFileSize('database.json');
      const backupSize = getFileSize('database.json.backup');
      const totalSizeBytes = dbSize + walSize + shmSize + jsonSize + backupSize;

      res.json({
        success: true,
        engine: 'Embedded Offline SQLite 3 (node:sqlite) + Dual-Layer JSON Persistence',
        storageType: 'Self-Hosted Offline / Zero External Cloud Quotas',
        quotaStatus: 'UNLIMITED (Zero daily write limits, zero cloud subscription fees)',
        willFinishQuickly: false,
        durability: 'ACID Compliant with WAL (Write-Ahead Logging) + Auto-Compacting',
        retentionPolicy: 'Permanent (Logs and records stored indefinitely with incremental vacuuming)',
        files: {
          sqliteDb: { path: 'data/tfw.db', bytes: dbSize, sizeFormatted: `${(dbSize / (1024 * 1024)).toFixed(2)} MB`, role: 'Primary SQLite Binary Database (ACID transactions)' },
          sqliteWal: { path: 'data/tfw.db-wal', bytes: walSize, sizeFormatted: `${(walSize / 1024).toFixed(1)} KB`, role: 'Write-Ahead Log (Auto-checkpoints into primary database)' },
          jsonMirror: { path: 'data/database.json', bytes: jsonSize, sizeFormatted: `${(jsonSize / 1024).toFixed(1)} KB`, role: 'Real-time JSON mirror for human inspectability and easy exports' },
          jsonBackup: { path: 'data/database.json.backup', bytes: backupSize, sizeFormatted: `${(backupSize / 1024).toFixed(1)} KB`, role: 'Automated rotating disk snapshot' }
        },
        totalStorageBytes: totalSizeBytes,
        totalStorageFormatted: `${(totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`,
        stats: stats || {},
        personalServerReady: true,
        extractionInstructions: 'When copying this applet to your personal server, all records in the /data folder remain 100% self-contained. Simply run `npm install` and `npm start` (or `tsx server.ts`). No Google Cloud, Firebase, or external database setup is required.'
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Checkpoint & Truncate WAL to compact database file
  app.post('/api/db/checkpoint', (req, res) => {
    try {
      const result = checkpointSqlite('TRUNCATE');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger explicit migration to SQLite
  app.post('/api/db/sqlite-migrate', (req, res) => {
    try {
      const current = loadDatabase();
      saveToSqlite(current);
      const stats = getSqliteStats();
      res.json({
        success: true,
        message: 'Successfully migrated current state to SQLite database.',
        stats
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Server-Sent Events (SSE) for Real-Time synchronization with Keepalive Heartbeat
  app.get('/api/db/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clientId = ++clientCounter;
    const client = { id: clientId, res };
    sseClients.push(client);

    // Send immediate initial handshake
    res.write(`data: ${JSON.stringify({ 
      type: 'connected', 
      version: memoryDb?.version || 1,
      lastUpdated: memoryDb?.lastUpdated || '',
      activeDate: memoryDb?.config?.appConfig?.activeOperationalDate || '',
      activeView: memoryDb?.config?.appConfig?.activeView || '',
      maintenancePortal: memoryDb?.config?.appConfig?.activeMaintenancePortal || '',
      maintenanceStatusTab: memoryDb?.config?.appConfig?.activeMaintenanceStatusTab || '',
      maintenanceViewScope: memoryDb?.config?.appConfig?.activeMaintenanceViewScope || ''
    })}\n\n`);

    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
  });

  // Periodic Keepalive ping every 8s to keep connections alive and ensure client versions match
  setInterval(() => {
    const pingPayload = JSON.stringify({
      type: 'ping',
      version: memoryDb?.version || 1,
      lastUpdated: memoryDb?.lastUpdated || '',
      activeDate: memoryDb?.config?.appConfig?.activeOperationalDate || '',
      time: Date.now()
    });
    sseClients = sseClients.filter(client => {
      try {
        if (client.res.writableEnded || client.res.destroyed) return false;
        client.res.write(`data: ${pingPayload}\n\n`);
        if (typeof (client.res as any).flush === 'function') {
          (client.res as any).flush();
        }
        return true;
      } catch (e) {
        return false;
      }
    });
  }, 8000);

  // Without a Green API webhook pointing at this server, polling is the only way the nightly sales report and the
  // technicians' replies in the WhatsApp groups reach the app.
  if (GREEN_API_ENV_TOKEN_INSTANCE && process.env.WHATSAPP_POLL_DISABLED !== '1') {
    let pollRunning = false;
    const pollWhatsApp = async () => {
      if (pollRunning) return;
      pollRunning = true;
      try {
        const result = await syncGreenApiGroupMessages(false);
        if (!result.success && result.error) console.warn(`[WhatsApp Poll] ${result.error}`);
      } catch (err) {
        console.warn('[WhatsApp Poll] failed:', err);
      } finally {
        pollRunning = false;
      }
    };
    setTimeout(pollWhatsApp, 15 * 1000);
    setInterval(pollWhatsApp, 60 * 1000);
  }

  // Periodic SQLite WAL Checkpoint every 5 minutes to prevent disk growth & keep database compact
  setInterval(() => {
    try {
      checkpointSqlite('PASSIVE');
    } catch (_) {}
  }, 5 * 60 * 1000);

  // Vite middleware for development vs static asset serving in production
  const isDev = process.env.NODE_ENV !== 'production' && !(typeof __filename !== 'undefined' && __filename.endsWith('.cjs'));
  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.join(process.cwd(), 'dist'))
      ? path.join(process.cwd(), 'dist')
      : path.join(import.meta.dirname, 'dist');

    // Cache immutable assets for 1 year for instantaneous 0.2s reloads
    const assetsDir = path.join(distPath, 'assets');
    if (fs.existsSync(assetsDir)) {
      app.use('/assets', express.static(assetsDir, {
        maxAge: '1y',
        immutable: true
      }));
    }

    app.use(express.static(distPath, {
      maxAge: '1h'
    }));

    app.get('*', (req, res) => {
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not Found');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TFW Database and Operations Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
