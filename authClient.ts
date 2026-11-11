// Browser side of /api/role-auth: every password and PIN is checked on the server, which answers with a role cookie.
import type { RoleSecretKey } from './authShared';

export interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  retryAfterSeconds?: number;
  passwordRequired?: boolean;
  authStatus?: { roles: Partial<Record<RoleSecretKey, boolean>> };
  scopes?: Array<{ role: string; staffKey?: string; expiresAt: number }>;
}

async function call(method: 'GET' | 'POST', url: string, body?: unknown): Promise<AuthResult> {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json: any = {};
    try {
      json = await res.json();
    } catch {
      json = {};
    }
    return { ...json, ok: res.ok && json.ok !== false, status: res.status, error: res.ok ? undefined : String(json.error || 'server_error') };
  } catch {
    return { ok: false, status: 0, error: 'offline' };
  }
}

export type LoginRole = 'admin' | 'management' | 'operation-officer' | 'maintenance' | 'maintenance-kpi' | 'cx' | 'information-desk' | 'operator' | 'info-desk-add' | 'info-desk-edit';

// server_busy means nothing was saved and no failed attempt was counted, so the same request is safe to send again.
async function callRetryingBusy(url: string, body: unknown): Promise<AuthResult> {
  let r = await call('POST', url, body);
  for (let attempt = 0; attempt < 3 && r.status === 429 && r.error === 'server_busy'; attempt++) {
    await new Promise(resolve => setTimeout(resolve, Math.min(10, Math.max(1, Number(r.retryAfterSeconds) || 5)) * 1000));
    r = await call('POST', url, body);
  }
  return r;
}

export function roleLogin(args: { role: LoginRole; password: string; staffKey?: string; user?: string; purpose?: 'login' | 'unlock' }) {
  return callRetryingBusy('/api/role-auth/login', args);
}

export function staffSetup(staffKey: string, password: string, recoveryPin: string) {
  return callRetryingBusy('/api/role-auth/staff/setup', { staffKey, password, recoveryPin });
}

export function staffReset(staffKey: string, recoveryPin: string, newPassword: string) {
  return callRetryingBusy('/api/role-auth/staff/reset', { staffKey, recoveryPin, newPassword });
}

export function roleLogout() {
  return call('POST', '/api/role-auth/logout', {});
}

export function changeRolePasswords(set: Partial<Record<RoleSecretKey, string>>, remove?: RoleSecretKey[]) {
  return call('POST', '/api/role-auth/role-passwords', { set, ...(remove ? { remove } : {}) });
}

export function changeKpiCredentials(user: string, password?: string) {
  return call('POST', '/api/role-auth/kpi-credentials', { user, ...(password ? { password } : {}) });
}

export function getRoleSession() {
  return call('GET', '/api/role-auth/session');
}

/** Shared wording for the server answers every sign-in screen can get. */
export function signInErrorText(r: AuthResult, wrongCredentials: string): string {
  if (r.status === 0) return 'Cannot reach the server. Signing in needs a connection; try again when you are online.';
  if (r.status === 429 && r.error === 'server_busy') return 'The server is busy with other sign-ins. Try again in a few seconds.';
  if (r.status === 429) {
    const minutes = Math.max(1, Math.ceil((Number(r.retryAfterSeconds) || 600) / 60));
    return `Too many attempts. Wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`;
  }
  if (r.error === 'invalid_credentials') return wrongCredentials;
  return 'Sign-in failed on the server. Try again.';
}
