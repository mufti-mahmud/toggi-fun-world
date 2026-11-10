import crypto from 'crypto';
import type express from 'express';

const COOKIE_NAME = 'tfw_session';
const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_DAYS = 30;
const REFRESH_BELOW_DAYS = 15;
const MAX_FAILED_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;

// Files the browser fetches without cookies (manifest) or that the login page and notifications need.
const PUBLIC_PATHS = new Set(['/api/health', '/manifest.json', '/sw.js', '/tbg-logo.svg', '/bcdl-logo.svg']);
const LOGIN_PATHS = new Set(['/login', '/api/auth/login', '/api/auth/logout']);

export interface SiteAuthOptions {
  sitePassword: string;
  sessionSecret: string;
  ticketApiKey: string;
  webhookSecret: string;
  isProduction: boolean;
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function readCookie(req: express.Request, name: string): string {
  const raw = req.headers.cookie;
  if (!raw) return '';
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

function isHttps(req: express.Request): boolean {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

export function clientIp(req: express.Request): string {
  return String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

/** Counts failed password attempts per key and blocks the key for the rest of the window once the limit is hit. */
export function createAttemptLimiter(maxFailures: number, windowMs: number) {
  const failures = new Map<string, { count: number; first: number }>();
  return {
    blockedForMs(key: string): number {
      const record = failures.get(key);
      if (!record) return 0;
      const elapsed = Date.now() - record.first;
      if (elapsed >= windowMs) {
        failures.delete(key);
        return 0;
      }
      return record.count >= maxFailures ? windowMs - elapsed : 0;
    },
    fail(key: string) {
      const now = Date.now();
      if (failures.size > 5000) {
        for (const [k, v] of failures) if (now - v.first >= windowMs) failures.delete(k);
      }
      const record = failures.get(key);
      if (!record || now - record.first >= windowMs) failures.set(key, { count: 1, first: now });
      else record.count++;
    },
    reset(key: string) {
      failures.delete(key);
    }
  };
}

function isTicketApiPath(path: string): boolean {
  return path.startsWith('/api/ticket-sales') || path.startsWith('/api/tickets/sales');
}

export function readApiKey(req: express.Request): string {
  const header = req.headers['x-api-key'];
  if (header) return String(header);
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  const query = req.query.apiKey || req.query.key;
  return query ? String(query) : '';
}

export function createSiteAuth(opts: SiteAuthOptions) {
  const enabled = opts.sitePassword.length > 0;
  // Deriving the key from the password means changing SITE_PASSWORD signs everyone out.
  const key = crypto.createHash('sha256').update(opts.sessionSecret || `tfw-session|${opts.sitePassword}`).digest();
  const loginAttempts = createAttemptLimiter(MAX_FAILED_ATTEMPTS, ATTEMPT_WINDOW_MS);

  const sign = (exp: number) => crypto.createHmac('sha256', key).update(`v1.${exp}`).digest('base64url');

  function verifySession(token: string): number | null {
    const match = /^v1\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(token);
    if (!match) return null;
    const exp = Number(match[1]);
    if (!(exp > Date.now())) return null;
    return safeEqual(match[2], sign(exp)) ? exp : null;
  }

  function setSessionCookie(req: express.Request, res: express.Response, value: string, maxAgeSeconds: number) {
    const parts = [`${COOKIE_NAME}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (isHttps(req)) parts.push('Secure');
    res.append('Set-Cookie', parts.join('; '));
  }

  function issueSession(req: express.Request, res: express.Response) {
    const exp = Date.now() + SESSION_DAYS * DAY_MS;
    setSessionCookie(req, res, `v1.${exp}.${sign(exp)}`, SESSION_DAYS * 24 * 60 * 60);
  }

  function hasValidTicketKey(req: express.Request): boolean {
    const provided = readApiKey(req);
    return Boolean(opts.ticketApiKey && provided && safeEqual(provided, opts.ticketApiKey));
  }

  function hasValidWebhookSecret(req: express.Request): boolean {
    if (!opts.webhookSecret) return true;
    const provided = String(req.query.secret || req.headers['x-webhook-secret'] || '');
    return Boolean(provided) && safeEqual(provided, opts.webhookSecret);
  }

  const gate: express.RequestHandler = (req, res, next) => {
    const path = req.path;

    if (path === '/api/webhooks/whatsapp') {
      return hasValidWebhookSecret(req) ? next() : res.status(401).json({ error: 'invalid_webhook_secret' });
    }
    if (PUBLIC_PATHS.has(path)) return next();

    if (!enabled) {
      if (!opts.isProduction) return next();
      return res.status(503).type('text/plain').send('Login is not configured. Set the SITE_PASSWORD environment variable and restart.');
    }
    if (LOGIN_PATHS.has(path)) return next();

    const exp = verifySession(readCookie(req, COOKIE_NAME));
    if (exp) {
      if (exp - Date.now() < REFRESH_BELOW_DAYS * DAY_MS) issueSession(req, res);
      return next();
    }
    if (isTicketApiPath(path) && hasValidTicketKey(req)) return next();

    if ((req.method === 'GET' || req.method === 'HEAD') && !path.startsWith('/api/') && !path.startsWith('/data/')) {
      return res.redirect(302, `/login?next=${encodeURIComponent(req.originalUrl)}`);
    }
    return res.status(401).json({ error: 'auth_required' });
  };

  function registerRoutes(app: express.Express) {
    app.get('/login', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(LOGIN_PAGE_HTML);
    });

    app.post('/api/auth/login', (req, res) => {
      const ip = clientIp(req);
      const waitMs = loginAttempts.blockedForMs(ip);
      if (waitMs > 0) {
        res.setHeader('Retry-After', String(Math.ceil(waitMs / 1000)));
        return res.status(429).json({ error: 'too_many_attempts' });
      }

      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!password || !safeEqual(password, opts.sitePassword)) {
        loginAttempts.fail(ip);
        return res.status(401).json({ error: 'invalid_password' });
      }

      loginAttempts.reset(ip);
      issueSession(req, res);
      res.json({ success: true });
    });

    app.post('/api/auth/logout', (req, res) => {
      setSessionCookie(req, res, '', 0);
      res.json({ success: true });
    });
  }

  return { enabled, gate, registerRoutes };
}

const LOGIN_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Sign in - TBG Entertainment &amp; Park Portal</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a192f;color:#e2e8f0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:16px}
  main{width:100%;max-width:380px;background:#112240;border:1px solid #233554;border-radius:16px;padding:32px 28px;box-shadow:0 20px 50px rgba(0,0,0,.35)}
  img{display:block;height:56px;margin:0 auto 16px}
  h1{font-size:1.25rem;margin:0 0 4px;text-align:center}
  p.sub{margin:0 0 24px;text-align:center;color:#94a3b8;font-size:.9rem}
  label{display:block;font-size:.875rem;margin-bottom:6px;color:#cbd5e1}
  input{width:100%;padding:12px 14px;border-radius:10px;border:1px solid #334155;background:#0a192f;color:#f1f5f9;font-size:1rem}
  input:focus{outline:2px solid #6366f1;outline-offset:1px;border-color:#6366f1}
  button{width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;background:#4f46e5;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
  button:hover{background:#4338ca}
  button:disabled{opacity:.6;cursor:wait}
  button:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
  #error{min-height:1.25rem;margin:12px 0 0;color:#fca5a5;font-size:.875rem;text-align:center}
  @media (prefers-reduced-motion:no-preference){button{transition:background .15s}}
</style>
</head>
<body>
<main>
  <img src="/tbg-logo.svg" alt="Tanvir Bashundhara Group">
  <h1>TBG Entertainment &amp; Park Portal</h1>
  <p class="sub">Staff access only. Enter the site password to continue.</p>
  <form id="form" novalidate>
    <label for="password">Site password</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
    <button id="submit" type="submit">Sign in</button>
    <p id="error" role="alert" aria-live="assertive"></p>
  </form>
</main>
<script>
  (function () {
    var form = document.getElementById('form');
    var input = document.getElementById('password');
    var button = document.getElementById('submit');
    var error = document.getElementById('error');
    function nextPath() {
      var next = new URLSearchParams(location.search).get('next') || '/';
      return next.charAt(0) === '/' && next.charAt(1) !== '/' && next.charAt(1) !== '\\\\' ? next : '/';
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value) { error.textContent = 'Enter the password.'; input.focus(); return; }
      button.disabled = true;
      error.textContent = '';
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: input.value })
      }).then(function (res) {
        if (res.ok) { location.replace(nextPath()); return; }
        error.textContent = res.status === 429
          ? 'Too many attempts. Wait 10 minutes and try again.'
          : 'Wrong password. Try again.';
        input.select();
      }).catch(function () {
        error.textContent = 'Cannot reach the server. Check your connection.';
      }).finally(function () { button.disabled = false; });
    });
  })();
</script>
</body>
</html>`;
