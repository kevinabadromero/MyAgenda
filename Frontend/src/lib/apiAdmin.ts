// src/lib/apiAdmin.ts
const API_BASE = import.meta.env.VITE_API_BASE || "https://api.dappointment.com";
// ====== token storage (access) ======
function __getAccess(): string {
  try { return localStorage.getItem("access_token") || ""; } catch { return ""; }
}
function __setAccess(tok: string) {
  try { localStorage.setItem("access_token", tok); } catch {}
}
function __clearAccess() {
  try { localStorage.removeItem("access_token"); } catch {}
}

// úsalo donde ya lo tengas (no cambia el nombre externo si ya existe)
export function authHeaders() {
  const t = __getAccess();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ====== refresh flow ======
async function __tryRefresh(): Promise<boolean> {
  const r = await fetch(`${API_BASE}/admin/refresh`, {
    method: "POST",
    credentials: "include", // para que viaje la cookie HttpOnly
  });
  if (!r.ok) return false;
  const data = await r.json().catch(() => null);
  if (!data?.token) return false;
  __setAccess(data.token);
  return true;
}

// ====== reemplaza TUS helpers con estos (mismos nombres) ======
export async function getJSON<T>(path: string): Promise<T> {
  // 1er intento con el access actual
  let r = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    headers: { ...authHeaders() },
    credentials: "include", // inofensivo; útil si el server necesita cookie
  });
  // si no es 401, procede normal
  if (r.status !== 401) {
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  }

  // 401: intentamos refrescar y reintentar UNA sola vez
  const refreshed = await __tryRefresh();
  if (!refreshed) {
    throw new Error("401 unauthorized");
  }

  r = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    headers: { ...authHeaders() },
    credentials: "include",
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function sendJSON<T>(
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  // 1er intento
  let r = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (r.status !== 401) {
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`${r.status} ${t}`);
    }
    return r.json();
  }

  // 401: refresh + reintento
  const refreshed = await __tryRefresh();
  if (!refreshed) {
    const t = await r.text().catch(() => "");
    throw new Error(`401 ${t || "unauthorized"}`);
  }

  r = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${t}`);
  }
  return r.json();
}

export async function adminLogin(params: { email: string; password: string; }) {
  // POST /admin/login con sendJSON
  const body = await sendJSON<{ token?: string; owner: any }>("/admin/login", "POST", params);
  
  if (body?.token) __setAccess(body.token); // guarda el access token
  console.log(body.token);
  return body; // { token, owner: {...} }
}

export async function adminLogout() {
  try {
    // POST /admin/logout con sendJSON
    await sendJSON<{ ok: true }>("/admin/logout", "POST");
  } finally {
    __clearAccess(); // limpia el access token local
  }
}

export async function adminMe() { return getJSON("/admin/me"); }

// === Availability ===
export async function adminGetAvailability() { return getJSON<{ items: any[] }>("/admin/availability"); }
export async function adminPutAvailability(days: { weekday:number; ranges:{start_min:number;end_min:number}[] }[]) {
  return sendJSON<{ ok:boolean }>("/admin/availability", "PUT", { days });
}

// === Bookings ===
export type AdminBooking = {
  id: string;
  eventType: { id: string; name: string; slug: string; colorHex?: string };
  guestName: string;
  guestEmail: string;
  startsAt: string;
  endsAt: string;
  status: string;
  durationMin?: number;
  bufferMin?: number;
};

export async function adminListBookings(params: {
  date?: string; status?: "confirmed"|"cancelled"; eventType?: string;
  page?: number; pageSize?: number;
}) {
  const q = new URLSearchParams();
  if (params.date) q.set("date", params.date);
  if (params.status) q.set("status", params.status);
  if (params.eventType) q.set("eventType", params.eventType);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  return getJSON<{ items: AdminBooking[]; page: number; pageSize: number; timezone: string }>(
    `/admin/bookings?${q.toString()}`
  );
}

export async function adminUpdateBookingStatus(id: string|number, status: "confirmed"|"cancelled") {
  return sendJSON<{ ok:boolean; changed:number }>(`/admin/bookings/${id}/status`, "PUT", { status });
}

export async function adminBookingsRange(fromYMD: string, toYMD: string) {
  return getJSON<{ items: AdminBooking[]; timezone: string }>(
    `/admin/bookings?from=${fromYMD}&to=${toYMD}&pageSize=500`
  );
}

export async function adminCreateBooking(payload: {
  eventType: string; guestName: string; guestEmail: string; startISO: string;
}) {
  return sendJSON(`/admin/bookings`, "POST", payload);
}

// === Event types ===
export type EventTypeAdmin = {
  id: string; name: string; slug: string; durationMin: number;
  bufferMin: number; colorHex: string; isActive: boolean;
};

export async function adminListEventTypes() {
  return getJSON<{ items: EventTypeAdmin[] }>(`/admin/event-types`);
}
export async function adminCreateEventType(payload: Omit<EventTypeAdmin, "id">) {
  return sendJSON(`/admin/event-types`, "POST", payload);
}
export async function adminUpdateEventType(id: string, payload: Omit<EventTypeAdmin, "id">) {
  return sendJSON(`/admin/event-types/${id}`, "PUT", payload);
}
export async function adminDeleteEventType(id: string) {
  return sendJSON(`/admin/event-types/${id}`, "DELETE", {});
}

// === Profile / Security ===
export async function adminGetProfile() { return getJSON<{ email: string }>(`/admin/profile`); }
export async function adminUpdateEmail(email: string) { return sendJSON(`/admin/profile/email`, "PUT", { email }); }
export async function adminChangePassword(currentPassword: string, newPassword: string) {
  return sendJSON(`/admin/profile/password`, "PUT", { currentPassword, newPassword });
}

// === Google ===
export async function adminGoogleStatus() {
  return getJSON<{ connected: boolean; calendarId: string; syncEnabled: boolean }>(`/admin/google/status`);
}
export async function adminGoogleAuthUrl() {
  return getJSON<{ url: string }>(`/admin/google/auth-url`);
}
export async function adminGoogleDisconnect() {
  return sendJSON(`/admin/google/disconnect`, "DELETE", {});
}
export async function adminGoogleCalendars() {
  return getJSON<{ connected:boolean; items:{id:string; summary:string; primary:boolean}[] }>(`/admin/google/calendars`);
}
export async function adminGoogleSaveSettings(calendarId: string, syncEnabled: boolean) {
  return sendJSON(`/admin/google/settings`, "POST", { calendarId, syncEnabled });
}
