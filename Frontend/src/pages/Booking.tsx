import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { listEventTypes, getSlots, createBooking } from "../lib/api";
import { useProfile } from "../profile";

type EventType = { id:string; slug:string; name:string; durationMin:number; description?:string|null };
type Slot = { iso:string; label:string };

const toYMD = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromYMD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}; 
const addDays = (s: string, n: number) => {
  const d = fromYMD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toYMD(d);
};

// util: hash simple para comparar arrays de slots sin provocar renders
const hashSlots = (arr: Slot[]) => arr.map(s => s.iso).join("|");

export default function Booking() {
  const { eventType: eventTypeParam } = useParams();
  const nav = useNavigate();
  const { profile } = useProfile();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedType, setSelectedType] = useState<string>(eventTypeParam || "");
  const [date, setDate] = useState(() => toYMD(new Date()));

  const [slots, setSlots] = useState<Slot[]>([]);
  const [initialized, setInitialized] = useState(false);       // ★ loader solo 1ra vez
  const [err, setErr] = useState<string>();
  const [freeSlots, setFreeSlots] = useState<Slot[]>([]);
  const [gridSlots, setGridSlots] = useState<Slot[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();


  const freeSet = useMemo(() => new Set(freeSlots.map(s => s.iso)), [freeSlots]);
  const slotStillFree = !selectedISO || freeSet.has(selectedISO);

  const controllerRef = useRef<AbortController | null>(null); // ★ aborta fetch antiguo
  const lastHashRef = useRef<string>("");                      // ★ evita updates inútiles
  const firstLoadRef = useRef(true);

  const title = useMemo(() => {
    const et = eventTypes.find(e => e.slug === selectedType);
    return et ? `${et.name} (${et.durationMin} min)` : "Reservar";
  }, [eventTypes, selectedType]);

  const labelFromISO = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });

  // Tipos de evento
  useEffect(() => {
    (async () => {
      try {
        const { items } = await listEventTypes();
        setEventTypes(items as any);
        if (!selectedType && items.length) setSelectedType(items[0].slug);
      } catch {
        setErr("No se pudieron cargar los tipos de evento");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ★ carga/refresh de slots (silencioso por defecto)
  async function loadDay(opts?: { silent?: boolean; resetSelection?: boolean }) {
    const silent = !!opts?.silent;
    const resetSelection = !!opts?.resetSelection;
  
    controllerRef.current?.abort();
    const ac = new AbortController();
    controllerRef.current = ac;
  
    try {
      if (!silent && firstLoadRef.current) setErr(undefined);
  
      // 1) pedir SOLO libres
      const res = await getSlots(selectedType, date, { signal: ac.signal } as any);
      if (ac.signal.aborted) return;
  
      // ordenados
      const ordered = [...res.slots].sort(
        (a, b) => new Date(a.iso).getTime() - new Date(b.iso).getTime()
      );
      const freeHash = hashSlots(ordered);
  
      // 2) construir GRILLA con step = durationMin del tipo
      const et = eventTypes.find(e => e.slug === selectedType);
      const stepMin = Math.max(5, Math.min(240, et?.durationMin || 30));
      const stepMs  = stepMin * 60000;
  
      let candidates: Slot[] = [];
      if (ordered.length > 0) {
        const startISO = ordered[0].iso;
        const endISO   = ordered[ordered.length - 1].iso;
  
        for (let t = new Date(startISO).getTime();
             t <= new Date(endISO).getTime() + 1000;
             t += stepMs) {
          const iso = new Date(t).toISOString();
          candidates.push({ iso, label: labelFromISO(iso) });
        }
      } else {
        candidates = [];
      }
      const gridHash = hashSlots(candidates);
  
      // 3) aplicar cambios SOLO si realmente cambiaron (evita parpadeo)
      if (freeHash !== lastHashRef.current) {
        lastHashRef.current = freeHash;
        startTransition(() => setFreeSlots(ordered));
      }
      if (hashSlots(gridSlots) !== gridHash) {
        startTransition(() => setGridSlots(candidates));
      }
  
      // 4) si el slot elegido ya no está libre, des-selecciónalo
      if (selectedISO && !ordered.some(s => s.iso === selectedISO)) {
        setSelectedISO(null);
      }
      if (resetSelection) setSelectedISO(null);
  
      if (!initialized) setInitialized(true);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setErr("No se pudo cargar la disponibilidad");
    }
  }
  // Cargar al cambiar tipo/fecha (no silencioso) 
  useEffect(() => {
    if (!selectedType) return;
    firstLoadRef.current = false;
    loadDay({ silent: false, resetSelection: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, date]);

  // Polling pasivo (silencioso) + pausa cuando la pestaña esté oculta
  useEffect(() => {
    if (!selectedType) return;
    const tick = () => document.visibilityState === "visible" && loadDay({ silent: true });
    const ms = selectedISO ? 5000 : 10000;
    const id = setInterval(tick, ms);
    const onVis = () => tick();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, date, selectedISO]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);

    if (!selectedType) return setFormError("Selecciona un tipo de evento.");
    if (!selectedISO)  return setFormError("Selecciona un horario.");
    if (!freeSet.has(selectedISO)) {
      setFormError("Ese horario se acaba de ocupar. Actualizamos la disponibilidad.");
      loadDay({ silent: true });
      setSelectedISO(null);
      return;
    }
    if (!guestName.trim()) return setFormError("Ingresa tu nombre.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()))
      return setFormError("Ingresa un email válido.");

    setSubmitting(true);
    try {
      const r = await createBooking({
        eventType: selectedType,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        startISO: selectedISO
      });
    
      // r.ok, r.id, r.status ("confirmed" | "pending")
      if (r?.ok && r?.id) {
        if (r.status === "confirmed") {
          nav(`/success/${r.id}?dl=ics&u=${encodeURIComponent(profile?.slug)}`);    // descarga automática del .ics
        } else {
          nav(`/success/${r.id}?u=${encodeURIComponent(profile?.slug)}`);           // muestra Pago Móvil y referencia
        }
        return;
      }
      setFormError("No se pudo confirmar la reserva.");
    } catch (e:any) {
      const msg = String(e);
      if (msg.includes("slot_taken") || msg.includes("409")) {
        setFormError("Ese horario se acaba de ocupar. Actualizamos la disponibilidad.");
        loadDay({ silent: true });
        setSelectedISO(null);
      } else {
        setFormError("Error al confirmar la reserva.");
      }
    } finally { setSubmitting(false); }
  }
  
  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-2">{title}</h1>
      <div className="text-sm text-gray-600 mb-4">Selecciona el tipo, día y horario para reservar.</div>

      {/* Tipo de evento */}
      <div className="mb-4">
        <label className="label">Tipo de evento</label>
        <select className="input w-full" value={selectedType} onChange={(e)=>setSelectedType(e.target.value)}>
          {eventTypes.map(et => (
            <option key={et.id} value={et.slug}>{et.name} ({et.durationMin} min)</option>
          ))}
        </select>
      </div>

      {/* Fecha */}
      <div className="mb-4 flex items-center gap-2">
        <button className="btn" onClick={() => setDate(addDays(date, -1))}>&larr;</button>
        <input type="date" className="input" value={date} onChange={(e)=>setDate(e.target.value)} />
        <button className="btn" onClick={() => setDate(addDays(date, +1))}>&rarr;</button>
      </div>

      {!initialized && <div className="text-gray-600 mb-3">Cargando horarios…</div>}
      {err && <div className="alert-error mb-3">{err}</div>}

      {gridSlots.length === 0 ? (
        <div className="text-gray-500 mb-3">No hay horarios disponibles para este día.</div>
      ) : (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {gridSlots.map(s => {
            const isFree = freeSet.has(s.iso);
            const active = selectedISO === s.iso;
            return (
              <button
                key={s.iso}
                onClick={() => isFree && setSelectedISO(s.iso)}
                className={`slot ${active ? "slot--active" : ""} ${!isFree ? "slot--disabled" : ""}`}
                title={s.iso}
                disabled={!isFree}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      {selectedISO && !slotStillFree && (
        <div className="alert-error mb-3">Ese horario se acaba de ocupar. Selecciona otro.</div>
      )}

      <form onSubmit={onSubmit} className="card">
        <div className="mb-2 text-sm text-gray-700">
          {selectedISO
            ? <>Reservar para: {new Date(selectedISO).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: tz })} <span className="text-gray-500"></span></>
            : "Selecciona un horario disponible"}
        </div>

        <div className="mb-2">
          <label className="label">Nombre</label>
          <input className="input w-full" value={guestName}
                 onChange={(e)=>setGuestName(e.target.value)}
                 disabled={!selectedISO || !slotStillFree || submitting}/>
        </div>

        <div className="mb-3">
          <label className="label">Email</label>
          <input className="input w-full" type="email" value={guestEmail}
                 onChange={(e)=>setGuestEmail(e.target.value)}
                 disabled={!selectedISO || !slotStillFree || submitting}/>
        </div>

        {formError && <div className="alert-error mb-3">{formError}</div>}

        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={submitting || !selectedISO || !slotStillFree}>
            {submitting ? "Confirmando…" : "Confirmar reserva"}
          </button>
          <button type="button" className="btn btn-ghost"
                  onClick={()=>{ setSelectedISO(null); setGuestName(""); setGuestEmail(""); setFormError(undefined); }}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
