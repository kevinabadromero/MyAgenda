import { http } from "./http";
import type { OwnerProfile, EventType, Slot, BookingResponse } from "../types";

export const getProfile       = () => http<OwnerProfile>('/public/profile');
export const listEventTypes   = () => http<{ items: EventType[] }>('/public/event-types');
export const getSlots         = (eventType:string, date:string) =>
  http<{ slots: Slot[] }>(`/public/slots?eventType=${encodeURIComponent(eventType)}&date=${date}`);
export const createBooking    = (payload:{ eventType:string; guestName:string; guestEmail:string; startISO:string; }) =>
  http<BookingResponse>('/public/book', { method:'POST', body: JSON.stringify(payload) });