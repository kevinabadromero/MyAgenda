// src/lib/api.ts
const API_BASE = import.meta.env.VITE_API_BASE || "https://api.dappointment.com";
const AURAUX_BASE = import.meta.env.VITE_AURAUX_BASE || "https://api.auraux.dev";

async function getJSONAbs<T>(url: string): Promise<T> {
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

function getUsernameFromURL(): string {
  const u = new URLSearchParams(window.location.search).get("u");
  if (!u || !u.trim()) {
    throw new Error("Falta el parámetro obligatorio ?u=usuario en la URL.");
  }
  return u.trim();
}

function withUser(path: string) {
  const u = getUsernameFromURL();
  const sep = path.includes("?") ? "&" : "?";
  return `${API_BASE}${path}${sep}u=${encodeURIComponent(u)}`;
}

async function getJSON<T>(url: string): Promise<T> {
  const u = getUsernameFromURL();
  const r = await fetch(url, {mode: 'cors'});
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const u = getUsernameFromURL();
  const r = await fetch(url, {
    method: "POST",
    mode: 'cors',
    headers: {
      "Content-Type": "application/json",
      "X-Owner-User": u,
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
  return getJSON<{ items: { id: string; slug: string; name: string; description: string | null; durationMin: number }[] }>(
    withUser("/public/event-types")
  );
}

export async function getSlots(eventType: string, dateYMD: string) {
  return getJSON<{ slots: { iso: string; label: string }[] }>(
    withUser(`/public/slots?eventType=${encodeURIComponent(eventType)}&date=${dateYMD}`)
  );
}

export async function getProfile() {
  return getJSON<{
    id: string;
    slug: string;
    name: string;
    timezone: string;
    favicon: string | null;
    logo: string | null;
    theme: { primary: string; bg: string; fg: string };
  }>(withUser("/public/profile"));
}

export async function createBooking(payload: {
  eventType: string;
  guestName: string;
  guestEmail: string;
  startISO: string;
}) {
  return postJSON<{ ok: boolean; id: string }>(withUser("/public/book"), payload);
}

export async function vesRate() {
  return getJSONAbs<{ ves: number }>(`${AURAUX_BASE}/rates/ves`);
}