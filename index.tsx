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
