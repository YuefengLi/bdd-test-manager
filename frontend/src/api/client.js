// frontend/src/api/client.js
// Centralized fetch helper for the frontend

export async function api(path, options) {
  const hasBody = options && Object.prototype.hasOwnProperty.call(options, 'body');
  const mergedOptions = { ...(options || {}) };
  // Ensure JSON headers so backend parses body; set headers last so they are not overwritten
  mergedOptions.headers = hasBody
    ? { 'Content-Type': 'application/json', ...((options && options.headers) || {}) }
    : (options && options.headers) || undefined;

  // Resolve API base URL in this order:
  // 1) Build-time env: REACT_APP_API_BASE
  // 2) Runtime global: window.__API_BASE__
  // 3) Runtime meta tag: <meta name="api-base" content="..." />
  // 4) Fallback: current origin (useful when backend is served from same origin)
  const runtimeBase = (typeof window !== 'undefined'
    ? (window.__API_BASE__ || (typeof document !== 'undefined' && document.querySelector('meta[name="api-base"]')?.getAttribute('content')))
    : undefined);
  const base = process.env.REACT_APP_API_BASE || runtimeBase || (typeof window !== 'undefined' ? window.location.origin : '');
  const res = await fetch(`${base}${path}`, mergedOptions);
  if (!res.ok) {
    const errorBody = await res.text();
    console.error('API Error Response:', errorBody);
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorBody}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
