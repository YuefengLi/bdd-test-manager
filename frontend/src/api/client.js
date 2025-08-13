// frontend/src/api/client.js
// Centralized fetch helper for the frontend

export async function api(path, options) {
  const hasBody = options && Object.prototype.hasOwnProperty.call(options, 'body');
  const mergedOptions = { ...(options || {}) };
  // Ensure JSON headers so backend parses body; set headers last so they are not overwritten
  mergedOptions.headers = hasBody
    ? { 'Content-Type': 'application/json', ...((options && options.headers) || {}) }
    : (options && options.headers) || undefined;

  const base = process.env.REACT_APP_API_BASE || 'http://localhost:3000';
  const res = await fetch(`${base}${path}`, mergedOptions);
  if (!res.ok) {
    const errorBody = await res.text();
    console.error('API Error Response:', errorBody);
    throw new Error(`API Error: ${res.status} ${res.statusText} - ${errorBody}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
