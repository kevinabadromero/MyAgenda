// src/lib/http.ts
import { API_BASE, CURRENT_HOST } from "../config";

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}${path.includes('?') ? '&' : '?'}host=${encodeURIComponent(CURRENT_HOST)}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type':'application/json',
      'X-Owner-Host': CURRENT_HOST, // opcional, por si lo usas
      ...(init?.headers || {})
    },
    credentials:'omit'
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}