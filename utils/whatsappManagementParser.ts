import { ManagementWhatsAppReport, ManagementCounterBreakdown } from '../types';

/**
 * Strips currency symbols, commas, and suffixes like '/=' or '/-' into a clean integer amount.
 * Examples: '22,650/=' -> 22650, '1,100 BDT' -> 1100, '5,24,000/=' -> 524000
 */
export function cleanCurrencyAmount(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  const str = String(val).trim();
  if (!str) return 0;
  // Remove commas, '/=', '/-', and non-numeric chars except digits and dot
  const cleaned = str.replace(/,/g, '').replace(/[^\d.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

/**
 * Checks whether a text message is a Management Sales Closing report from "TFW Management Team".
 */
export function isManagementSalesMessage(text: string): boolean {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  
  if (lower.includes('tfw total cash collection') || lower.includes('tfw management team daily sales closing')) {
    return true;
  }

  const hasKiddo = lower.includes('kiddo sale') || lower.includes('toggi kiddo') || lower.includes('kiddo package');
  const hasXtreme = lower.includes('xtreme sale') || lower.includes('toggi xtreme') || lower.includes('xtreme package');
  const hasVip = lower.includes('vip concierge') || lower.includes('concierge sale');
  const hasEntry = lower.includes('entry ticket') || lower.includes('entry sale') || lower.includes('entry counter');
  const hasRevenue = lower.includes('total revenue') || lower.includes('total sale') || lower.includes('total cash collection');
  const hasCounter = lower.includes('counter & cashier') || lower.includes('individual sales') || lower.includes('kiddo pack ratio') || lower.includes('basement 01');

  let matchScore = 0;
  if (hasKiddo) matchScore++;
  if (hasXtreme) matchScore++;
  if (hasVip) matchScore++;
  if (hasEntry) matchScore++;
  if (hasRevenue) matchScore++;
  if (hasCounter) matchScore += 2;

  return matchScore >= 2;
}

/**
 * Extracts a normalized YYYY-MM-DD date from a message body, or falls back to provided date / Dhaka today.
 */
export function extractReportDate(text: string, fallbackDate?: string): string {
  if (text) {
    // The closing report puts "Date: 05/11/2026." right under "Sir, TFW Total Cash Collection."
    const dMatch = text.match(/Date\s*[:=-]?\s*([0-9]{1,4})[-/.]([0-9]{1,2})[-/.]([0-9]{2,4})/i);
    if (dMatch) {
      const [, p1, p2, p3] = dMatch;
      let iso = '';
      if (p1.length === 4) iso = `${p1}-${p2.padStart(2, '0')}-${p3.padStart(2, '0')}`;
      else if (p3.length === 4) iso = `${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      else if (p3.length === 2) iso = `20${p3}-${p2.padStart(2, '0')}-${p1.padStart(2, '0')}`;
      if (isValidIsoDate(iso)) return iso;
    }

    const monthMap: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const monMatch = text.match(/([0-9]{1,2})[-/\s]+([a-zA-Z]{3,9})[-/\s,]+([0-9]{4})/i);
    if (monMatch) {
      const monStr = monMatch[2].slice(0, 3).toLowerCase();
      const iso = monthMap[monStr] ? `${monMatch[3]}-${monthMap[monStr]}-${monMatch[1].padStart(2, '0')}` : '';
      if (isValidIsoDate(iso)) return iso;
    }
  }

  if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
    return fallbackDate;
  }

  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Dhaka',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

function isValidIsoDate(iso: string): boolean {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * Reads the first amount after the label, e.g. "Individual sales (entry): 1,350/=" -> 1350, "Kiddo package sold: 52 pcs." -> 52.
 */
function readAmount(line: string): number {
  const colon = line.indexOf(':');
  const valuePart = colon >= 0 ? line.slice(colon + 1) : line;
  const m = valuePart.match(/\d[\d,]*(?:\.\d+)?/);
  return m ? cleanCurrencyAmount(m[0]) : 0;
}

function hasAmount(line: string): boolean {
  const colon = line.indexOf(':');
  return /\d/.test(colon >= 0 ? line.slice(colon + 1) : line);
}

/**
 * Turns the rest of a level header into a readable label: "Basement 01, ( counter 01)Entry counter." -> "(counter 01) Entry counter".
 */
function cleanCounterDetails(rest: string): string {
  return rest
    .replace(/^[\s,.:;-]+/, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\)(?=[^\s).,])/g, ') ')
    .replace(/\s+/g, ' ')
    .replace(/[\s.,]+$/, '')
    .trim();
}

/**
 * Parses raw WhatsApp message string from "TFW Management Team" into a strongly-typed ManagementWhatsAppReport.
 * Handles both layouts: day-end summary at the bottom after every level (the nightly "TFW Total Cash Collection"
 * message) and the older summary-first layout.
 */
export function parseManagementReportText(
  text: string,
  options?: {
    fallbackDate?: string;
    senderName?: string;
    senderPhone?: string;
    groupName?: string;
    timestamp?: string;
  }
): ManagementWhatsAppReport | null {
  if (!text || typeof text !== 'string') return null;

  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return null;

  const reportDate = extractReportDate(text, options?.fallbackDate);
  const nowIso = options?.timestamp || new Date().toISOString();

  let toggiKiddoSale = 0;
  let toggiXtremeSale = 0;
  let toggiVipConciergeSale = 0;
  let entryTicketSale = 0;
  let totalFootFall = 0;
  let discount = 0;
  let totalRevenue = 0;
  let kiddoPackageSold = 0;
  let xtremePackageSold = 0;

  const counterBreakdown: ManagementCounterBreakdown[] = [];
  let currentCounter: ManagementCounterBreakdown | null = null;

  const closeCounter = () => {
    if (!currentCounter) return;
    if (!currentCounter.totalRevenue) {
      currentCounter.totalRevenue = currentCounter.individualSales + currentCounter.kiddoPackRatio + currentCounter.xtremePackRatio;
    }
    counterBreakdown.push(currentCounter);
    currentCounter = null;
  };

  // The amount sometimes wraps onto the next line ("Total Foot Fall:" then "258 person").
  const amountAt = (i: number): { value: number; consumedNext: boolean } => {
    if (hasAmount(rawLines[i])) return { value: readAmount(rawLines[i]), consumedNext: false };
    const next = rawLines[i + 1];
    if (next && /^\d/.test(next)) return { value: readAmount(next), consumedNext: true };
    return { value: 0, consumedNext: false };
  };

  // Summary-first layout writes "Toggi Kiddo sale - 22,650/=", so the amount follows a dash rather than a colon.
  const readSummaryAmount = (line: string) => readAmount(line.replace(/^[^-–:=]*[-–=]/, ':'));

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (/^kiddo\s*package\s*sold/i.test(line)) {
      closeCounter();
      kiddoPackageSold = readAmount(line);
      if (i + 1 < rawLines.length && /^revenue\b/i.test(rawLines[i + 1])) {
        toggiKiddoSale = readAmount(rawLines[i + 1]);
        i++;
      }
      continue;
    }

    if (/^xtreme\s*package\s*sold/i.test(line)) {
      closeCounter();
      xtremePackageSold = readAmount(line);
      if (i + 1 < rawLines.length && /^revenue\b/i.test(rawLines[i + 1])) {
        toggiXtremeSale = readAmount(rawLines[i + 1]);
        i++;
      }
      continue;
    }

    if (/^(total\s*)?foot\s*fall/i.test(line)) {
      closeCounter();
      const { value, consumedNext } = amountAt(i);
      totalFootFall = value;
      if (consumedNext) i++;
      continue;
    }

    if (/^discount/i.test(line)) {
      closeCounter();
      discount = readAmount(line);
      continue;
    }

    if (/^total\s*revenue\s*\(\s*day\s*end\s*\)/i.test(line) || (/^total\s*revenue/i.test(line) && !currentCounter)) {
      closeCounter();
      const { value, consumedNext } = amountAt(i);
      totalRevenue = value;
      if (consumedNext) i++;
      continue;
    }

    if (/toggi\s*kiddo\s*sale/i.test(line)) {
      toggiKiddoSale = readSummaryAmount(line);
      continue;
    }
    if (/toggi\s*xtreme\s*sale/i.test(line)) {
      toggiXtremeSale = readSummaryAmount(line);
      continue;
    }
    if (/vip\s*concierge/i.test(line)) {
      toggiVipConciergeSale = readSummaryAmount(line);
      continue;
    }
    if (/entry\s*ticket\s*sale/i.test(line) || (/^entry\s*ticket/i.test(line) && !currentCounter)) {
      entryTicketSale = readSummaryAmount(line);
      continue;
    }

    // Level header, e.g. "Basement 01, ( counter 01)Entry counter.", "Level -08(Entry counter 04)", "Level-12 (VR zone)"
    const headerMatch = line.match(/^(Basement\s*[-]?\s*0?\d+|Level\s*[-]?\s*0?\d+|Counter\s*[-]?\s*0?\d+|Main\s*Counter|B\s*[-]?\s*0?\d+|L\s*[-]?\s*0?\d+)/i);
    if (headerMatch) {
      closeCounter();
      const details = cleanCounterDetails(line.slice(headerMatch[0].length));
      currentCounter = {
        counterName: normalizeCounterName(headerMatch[1]),
        ...(details ? { details } : {}),
        individualSales: 0,
        kiddoPackRatio: 0,
        xtremePackRatio: 0,
        totalRevenue: 0
      };
      continue;
    }

    if (currentCounter) {
      if (/individual\s*sales/i.test(line)) {
        currentCounter.individualSales = readAmount(line);
      } else if (/kiddo\s*pack/i.test(line)) {
        currentCounter.kiddoPackRatio = readAmount(line);
      } else if (/xtreme\s*pack/i.test(line)) {
        currentCounter.xtremePackRatio = readAmount(line);
      } else if (/total\s*revenue/i.test(line) || /total\s*sale/i.test(line)) {
        currentCounter.totalRevenue = readAmount(line);
      }
    }
  }

  closeCounter();

  const countersTotal = counterBreakdown.reduce((acc, c) => acc + c.totalRevenue, 0);
  if (totalRevenue === 0 && countersTotal > 0) {
    totalRevenue = countersTotal;
  }

  return {
    date: reportDate,
    timestamp: nowIso,
    rawMessage: text,
    senderName: options?.senderName || 'TFW Management Team',
    senderPhone: options?.senderPhone,
    groupName: options?.groupName || 'TFW Management Team',
    salesAndRevenue: {
      toggiKiddoSale,
      toggiXtremeSale,
      toggiVipConciergeSale,
      entryTicketSale,
      totalFootFall,
      discount,
      totalRevenue,
      kiddoPackageSold: kiddoPackageSold > 0 ? kiddoPackageSold : undefined,
      xtremePackageSold: xtremePackageSold > 0 ? xtremePackageSold : undefined
    },
    counterBreakdown
  };
}

/**
 * Normalizes counter / level header string into standard TFW level name
 */
export function normalizeCounterName(raw: string): string {
  const trimmed = (raw || '').trim();
  if (/^Basement\s*[-]?\s*0?1(?!\d)/i.test(trimmed) || /^B\s*[-]?\s*0?1(?!\d)/i.test(trimmed)) {
    return 'Basement 01';
  }
  if (/^Level\s*[-]?\s*0?1(?!\d)/i.test(trimmed) || /^L\s*[-]?\s*0?1(?!\d)/i.test(trimmed)) {
    return 'Level - 01';
  }
  const lvlMatch = trimmed.match(/^Level\s*[-]?\s*0?(\d+)/i) || trimmed.match(/^L\s*[-]?\s*0?(\d+)/i);
  if (lvlMatch) {
    return `Level ${parseInt(lvlMatch[1], 10)}`;
  }
  return trimmed.replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * All active levels in Toggi Fun World (Basement 01, Level - 01, and Level 8 to Level 17)
 */
export const ALL_TFW_LEVELS = [
  'Basement 01',
  'Level - 01',
  'Level 8',
  'Level 9',
  'Level 10',
  'Level 11',
  'Level 12',
  'Level 13',
  'Level 14',
  'Level 15',
  'Level 16',
  'Level 17'
];
