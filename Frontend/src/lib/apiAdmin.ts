// src/lib/apiAdmin.ts
const API_BASE = import.meta.env.VITE_API_BASE || "https://api.dappointment.com";

function authHeaders() {
  const t = localStorage.getItem("ma_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    headers: { ...authHeaders() },
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function sendJSON<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    mode: "cors",
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`${r.status} ${t}`);
  }
  return r.json();
}

// === Auth ===
export async function adminLogin(email: string, password: string, accountSlug?: string) {
  // accountSlug es opcional: lo enviamos si quieres desambiguar (multi-tenant con mismo email)
  const r = await sendJSON<{ token: string; owner: { id: string; slug: string; name: string; email: string } }>(
    "/admin/login",
    "POST",
    { email, password, u: accountSlug }
  );
  localStorage.setItem("ma_token", r.token);
  return r;
}
export function adminLogout() { localStorage.removeItem("ma_token"); }
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
