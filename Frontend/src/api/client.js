// Small API client for the Nexus CRM backend.
// Defaults to the PRODUCTION Sales Head API. Override with VITE_API_URL for local dev.
const API_BASE = import.meta.env.VITE_API_URL || 'https://api-saleshead.tescomanagement.com/api';

export const getToken = () => localStorage.getItem('crm_token');

export const setSession = (token, user) => {
  localStorage.setItem('crm_token', token);
  localStorage.setItem('crm_user', JSON.stringify(user));
  localStorage.setItem('crm_authenticated', 'true');
};

export const clearSession = () => {
  localStorage.removeItem('crm_token');
  localStorage.removeItem('crm_user');
  localStorage.removeItem('crm_authenticated');
};

export const getUser = () => {
  try {
    return JSON.parse(localStorage.getItem('crm_user'));
  } catch {
    return null;
  }
};

export async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Cannot reach server. Is the backend running?');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// Lightweight single-lead validation for the manual Lead ID input. Reads ONE lead by its
// business id (LD-xxxx) — never the whole list. This portal sees every lead, so existence
// is the only gate. Returns { status: 'ok'|'notfound'|'error', lead }.
export const validateLeadAccess = async (id) => {
  const key = String(id || '').trim();
  if (!key) return { status: 'notfound' };
  let res;
  try { res = await fetch(`${API_BASE}/leads/${encodeURIComponent(key)}`); }
  catch { return { status: 'error' }; }
  if (res.status === 404) return { status: 'notfound' };
  if (!res.ok) return { status: 'error' };
  const d = await res.json().catch(() => null);
  return (d && d.id) ? { status: 'ok', lead: d } : { status: 'notfound' };
};

export const notificationsApi = {
  getNotifications: () => api('/notifications'),
  getUnreadCount: () => api('/notifications/unread-count'),
  markRead: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => api('/notifications/read-all', { method: 'PATCH' }),
};

export const authApi = {
  login: (role, email, password) =>
    api('/auth/login', { method: 'POST', body: { role, email, password } }),
  logout: () => api('/auth/logout', { method: 'POST', auth: true }),
  forgotPassword: (email) =>
    api('/auth/forgot-password', { method: 'POST', body: { email } }),
  verifyOtp: (email, otp) =>
    api('/auth/verify-otp', { method: 'POST', body: { email, otp } }),
  resetPassword: (email, otp, newPassword) =>
    api('/auth/reset-password', { method: 'POST', body: { email, otp, newPassword } }),
  me: () => api('/auth/me', { auth: true }),
};
