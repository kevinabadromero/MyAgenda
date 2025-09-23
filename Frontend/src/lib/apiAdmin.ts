// ====== CONFIG ======
const API_BASE = import.meta.env.VITE_API_BASE || "https://api.dappointment.com";

// ====== ACCESS TOKEN storage (access_token) ======
function __getAccess(): string {
  try { return localStorage.getItem("access_token") || ""; } catch { return ""; }
}
function __setAccess(tok: string) {
  try { localStorage.setItem("access_token", tok); } catch {}
}
function __clearAccess() {
  try { localStorage.removeItem("access_token"); } catch {}
}

function authHeaders() {
  const t = __getAccess();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// ====== REFRESH (mutex para evitar múltiples refrescos simultáneos) ======
let refreshPromise: Promise<boolean> | null = null;

async function __tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const r = await fetch(`${API_BASE}/admin/refresh`, {
      method: "POST",
      credentials: "include", // cookie HttpOnly
    });
    if (!r.ok) return false;

    let data: any = null;
    try { data = await r.json(); } catch { data = null; } // tolera 204/body vacío

    if (data?.token) { __setAccess(data.token); return true; }
    return false;
  })();

  try { return await refreshPromise; }
  finally { refreshPromise = null; }
}

// ====== HELPERS con reintento tras 401 ======
export async function getJSON<T>(path: string): Promise<T> {
  const doFetch = () => fetch(`${API_BASE}${path}`, {
    mode: "cors",
    headers: { ...authHeaders() },
    credentials: "include",
  });

  let r = await doFetch();
  if (r.status === 401 && (await __tryRefresh())) r = await doFetch();
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export async function sendJSON<T>(path: string, method: string, body?: unknown): Promise<T> {
  const doFetch = () => fetch(`${API_BASE}${path}`, {
    mode: "cors",
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  let r = await doFetch();
  if (r.status === 401 && (await __tryRefresh())) r = await doFetch();

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${t}`);
  }
  return r.json();
}

// (opcional) multipart para subir avatar u otros archivos
export async function sendFORM<T>(path: string, form: FormData, method = "POST"): Promise<T> {
  const doFetch = () => fetch(`${API_BASE}${path}`, {
    mode: "cors",
    method,
    headers: { ...authHeaders() }, // NO setear Content-Type
    body: form,
    credentials: "include",
  });

  let r = await doFetch();
  if (r.status === 401 && (await __tryRefresh())) r = await doFetch();

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${t}`);
  }
  return r.json();
}

// ====== usa estos en login/logout ======
export async function adminLogin(params: { email: string; password: string; u?: string }) {
  const out = await sendJSON<{ token?: string; owner: any }>(`/admin/login`, "POST", params);
  if (out?.token) __setAccess(out.token);
  return out;
}
export async function adminLogout() {
  try { await sendJSON(`/admin/logout`, "POST"); }
  finally { __clearAccess(); }
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

export async function adminGetProfile() {
  return getJSON<{ email: string; name?: string; avatarUrl?: string }>("/admin/profile");
}
export async function adminUploadAvatar(file: File) {
  const form = new FormData(); form.append("file", file);
  return sendFORM<{ avatarUrl: string }>("/admin/profile/avatar", form, "POST");
}