import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Strict Light Mode enforcement: purge any legacy theme keys and enforce light class
try {
  localStorage.removeItem("adwords_theme");
  document.documentElement.classList.remove("dark");
  document.documentElement.classList.add("light");
} catch (_) {}

// Global Fetch Interceptor to include authentication headers
const originalFetch = window.fetch;
const customFetch = function (input: RequestInfo | URL, init?: RequestInit) {
  const stored = localStorage.getItem("adwords_session");
  const storedToken = localStorage.getItem("adwords_token");
  let username = "";
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.username) {
        username = parsed.username;
      }
    } catch (_) {}
  }

  const headers = new Headers(init?.headers || {});
  if (username && !headers.has("X-User-Session")) {
    headers.set("X-User-Session", username);
  }
  if (storedToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${storedToken}`);
  }
  init = {
    ...(init || {}),
    headers: headers
  };
  return originalFetch(input, init);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true,
    enumerable: true
  });
} catch (e) {
  console.warn("Unable to redefine window.fetch with Object.defineProperty, trying direct reference override", e);
  try {
    (window as any).fetch = customFetch;
  } catch (err) {
    console.error("Critical error overriding window.fetch:", err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
