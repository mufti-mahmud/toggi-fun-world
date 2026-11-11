// Working-date rules shared by the browser and the server. Days are Dhaka calendar days (YYYY-MM-DD).

/** A date the "Sync to all devices" action pushed to every device; it only counts on the Dhaka day it was set. */
export interface SharedWorkingDate {
  date: string;
  setOnDay: string;
  setAt: string;
  by?: string;
}

/** A date picked on one device, kept only for the Dhaka day it was picked. */
export interface WorkingDatePick {
  date: string;
  day: string;
}

export interface WorkingDateDecision {
  date: string;
  pick: WorkingDatePick | null;
  seenSyncAt: string | null;
}

export const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export const sharedDateForDay = (sync: Partial<SharedWorkingDate> | null | undefined, today: string): SharedWorkingDate | null => {
  if (!sync || typeof sync !== 'object') return null;
  if (!isDateKey(sync.date) || sync.setOnDay !== today || typeof sync.setAt !== 'string' || !sync.setAt) return null;
  return sync as SharedWorkingDate;
};

// setAt is always the server's clock, so a device never compares against its own.
const isNewerSync = (setAt: string, seenSyncAt: string | null | undefined): boolean => {
  if (!seenSyncAt) return true;
  const a = Date.parse(setAt);
  const b = Date.parse(seenSyncAt);
  if (Number.isNaN(a) || Number.isNaN(b)) return setAt !== seenSyncAt;
  return a > b;
};

/**
 * Today, unless a sync shared today is newer than the last one this device applied, or this device picked a date today.
 */
export const resolveWorkingDate = (
  today: string,
  pick: WorkingDatePick | null | undefined,
  sync: Partial<SharedWorkingDate> | null | undefined,
  seenSyncAt: string | null | undefined
): WorkingDateDecision => {
  const shared = sharedDateForDay(sync, today);
  if (shared && isNewerSync(shared.setAt, seenSyncAt)) {
    return { date: shared.date, pick: { date: shared.date, day: today }, seenSyncAt: shared.setAt };
  }
  const seen = seenSyncAt || null;
  if (pick && pick.day === today && isDateKey(pick.date)) {
    return { date: pick.date, pick, seenSyncAt: seen };
  }
  return { date: today, pick: null, seenSyncAt: seen };
};

/** Steps a date key by whole days in UTC, so the device's own time zone cannot skip or repeat a day. */
export const shiftDateKey = (date: string, days: number): string => {
  if (!isDateKey(date)) return date;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

export const parseWorkingDatePick = (raw: string | null): WorkingDatePick | null => {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    return p && isDateKey(p.date) && isDateKey(p.day) ? { date: p.date, day: p.day } : null;
  } catch {
    return null;
  }
};
