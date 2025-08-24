// src/types.ts
export type OwnerProfile = {
    id: string; slug: string; name: string;
    favicon: string; logo?: string;
    theme?: { primary?: string; bg?: string; fg?: string };
  };
  
  export type EventType = {
    id: string; slug: string; name: string;
    durationMin: number; description?: string;
  };
  
  export type Slot = { iso: string; label: string };
  export type BookingResponse = { ok: boolean; id: string };