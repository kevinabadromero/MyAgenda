// src/lib/apiAdmin.ts
const API_BASE = import.meta.env.VITE_API_BASE || "http://147.93.113.199:5354";
const HOST = window.location.host.replace(/^www\./, "");

function withHost(path: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${sep}host=${encodeURIComponent(HOST)}`;
}

function authHeaders() {
  const t = localStorage.getItem("ma_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(withHost(path), { headers: { "X-Owner-Host": HOST, ...authHeaders() } });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

async function sendJSON<T>(path: string, method: string, body?: unknown): Promise<T> {
  const r = await fetch(withHost(path), {
    method,
    headers: { "Content-Type": "application/json", "X-Owner-Host": HOST, ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text().catch(()=>"");
    throw new Error(`${r.status} ${t}`);
  }
  return r.json();
}

export async function adminLogin(email: string, password: string) {
  const r = await sendJSON<{token:string, owner:{id:string, name:string}}>("/admin/login", "POST", { email, password });
  localStorage.setItem("ma_token", r.token);
  return r;
}
export async function adminMe() { return getJSON("/admin/me"); }

export async function adminListEventTypes() { return getJSON<{items:any[]}>("/admin/event-types"); }
export async function adminCreateEventType(payload: {slug:string;name:string;description?:string|null;durationMin:number;bufferMin?:number;isActive?:boolean}) {
  return sendJSON<{ok:boolean; id:string}>("/admin/event-types", "POST", payload);
}
export async function adminUpdateEventType(id: string|number, payload: any) {
  return sendJSON<{ok:boolean;changed:number}>(`/admin/event-types/${id}`, "PUT", payload);
}
export async function adminDeleteEventType(id: string|number) {
  return sendJSON<{ok:boolean;deleted:number}>(`/admin/event-types/${id}`, "DELETE");
}

export async function adminGetAvailability() { return getJSON<{items:any[]}>("/admin/availability"); }
export async function adminPutAvailability(days: { weekday:number; ranges:{start_min:number;end_min:number}[] }[]) {
  return sendJSON<{ok:boolean}>("/admin/availability", "PUT", { days });
}

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
    return getJSON<{ items:any[]; page:number; pageSize:number; timezone:string }>(`/admin/bookings?${q.toString()}`);
  }
  
  export async function adminUpdateBookingStatus(id: string|number, status: "confirmed"|"cancelled") {
    return sendJSON<{ ok:boolean; changed:number }>(`/admin/bookings/${id}/status`, "PUT", { status });
  }

export function adminLogout() {
  localStorage.removeItem("ma_token");
}