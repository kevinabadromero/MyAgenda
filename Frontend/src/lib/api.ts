// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || "http://147.93.113.199:5354";

function withHost(path: string) {
  const host = window.location.host.replace(/^www\./, "");
  const sep = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${sep}host=${encodeURIComponent(host)}`;
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "X-Owner-Host": window.location.host } });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Owner-Host": window.location.host,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`${r.status} ${text}`);
  }
  return r.json();
}


export async function listEventTypes() {
  return getJSON<{ items: { id:string; slug:string; name:string; description:string|null; durationMin:number }[] }>(
    withHost("/public/event-types")
  );
}

export async function getSlots(eventType: string, dateYMD: string) {
  return getJSON<{ slots: { iso:string; label:string }[] }>(
    withHost(`/public/slots?eventType=${encodeURIComponent(eventType)}&date=${dateYMD}`)
  );
}
export async function getProfile() {
  return getJSON<{ id:string; slug:string; name:string; timezone:string;
                   favicon:string|null; logo:string|null;
                   theme:{primary:string;bg:string;fg:string} }>(
    withHost("/public/profile")
  );
}

export async function createBooking(payload: {
  eventType: string; guestName: string; guestEmail: string; startISO: string;
}) {
  return postJSON<{ ok: boolean; id: string }>(withHost("/public/book"), payload);
}