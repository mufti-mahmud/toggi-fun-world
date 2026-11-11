import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// The server answers 401 on /api once the site session has expired; send the user back to the login page.
const nativeFetch = window.fetch.bind(window);
let redirectingToLogin = false;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await nativeFetch(input, init);
  if (response.status === 401 && !redirectingToLogin) {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(rawUrl, window.location.href);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/auth/')) {
      redirectingToLogin = true;
      const next = window.location.pathname + window.location.search + window.location.hash;
      window.location.href = `/login?next=${encodeURIComponent(next)}`;
    }
  }
  return response;
};

// Errors on staff devices go to the server's activity log (at most 20 per page load) so they can be analysed later.
let clientProblemsReported = 0;
const reportClientProblem = (kind: string, detail: Record<string, unknown>) => {
  if (clientProblemsReported++ >= 20) return;
  try {
    nativeFetch('/api/activity-log/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, page: window.location.pathname, userAgent: navigator.userAgent, ...detail }),
      keepalive: true
    }).catch(() => {});
  } catch (_) {
    // Reporting must never break the page.
  }
};
window.addEventListener('error', (e) => {
  reportClientProblem('error', { message: e.message, source: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack });
});
window.addEventListener('unhandledrejection', (e) => {
  const reason: any = e.reason;
  reportClientProblem('unhandled-rejection', { message: String(reason?.message ?? reason), stack: reason?.stack });
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
