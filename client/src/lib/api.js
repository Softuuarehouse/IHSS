export class ApiError extends Error {
  constructor(status, body) { super(body?.message || `Request failed (${status})`); this.status = status; this.body = body || {}; }
}

async function request(method, path, body) {
  const res = await fetch('/api' + path, {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ihss' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, data);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b = {}) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
  async upload(path, formData) {
    const res = await fetch('/api' + path, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'ihss' }, body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  },
  async download(path, filename) {
    const res = await fetch('/api' + path, { credentials: 'include', headers: { 'X-Requested-With': 'ihss' } });
    if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => ({})));
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  },
};
