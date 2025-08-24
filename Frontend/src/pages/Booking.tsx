// src/pages/Booking.tsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { listEventTypes, getSlots, createBooking } from "../lib/api";
import { useProfile } from "../profile";  // ← añade
import "../index.css"
type EventType = { id:string; slug:string; name:string; durationMin:number; description?:string|null };
type Slot = { iso:string; label:string };

// utilidades
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

// diferencia en minutos entre dos ISO UTC
const diffMin = (aISO: string, bISO: string) =>
  Math.round((new Date(bISO).getTime() - new Date(aISO).getTime()) / 60000);

// suma minutos a un ISO (UTC)
const addMinISO = (iso: string, mins: number) =>
  new Date(new Date(iso).getTime() + mins * 60000).toISOString();

// etiqueta local corta desde ISO
const labelFromISO = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function Booking() {
  const { eventType: eventTypeParam } = useParams();
  const nav = useNavigate();
  const { profile } = useProfile();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedType, setSelectedType] = useState<string>(eventTypeParam || "");
  const [date, setDate] = useState(() => toYMD(new Date()));

  const [freeSlots, setFreeSlots] = useState<Slot[]>([]); // libres desde API
  const [gridSlots, setGridSlots] = useState<Slot[]>([]); // todos (libres + ocupados)
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();

  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();

  // SELECTOR: ¿el slot elegido sigue libre?
  const freeSet = useMemo(() => new Set(freeSlots.map(s => s.iso)), [freeSlots]);
  const slotStillFree = !selectedISO || freeSet.has(selectedISO);
  const labelFromISO = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const prettyLocal = (iso?: string|null) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short", timeZone: tz }) : "";
  const title = useMemo(() => {
    const et = eventTypes.find(e => e.slug === selectedType);
    return et ? et.name : "Reservar";
  }, [eventTypes, selectedType]);

  // carga tipos
  useEffect(() => {
    (async () => {
      try {
        setErr(undefined);
        const { items } = await listEventTypes();
        setEventTypes(items as any);
        if (!selectedType && items.length) setSelectedType(items[0].slug);
      } catch {
        setErr("No se pudieron cargar los tipos de evento");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // carga slots libres + construye grid deshabilitando los no libres
  async function loadDay() {
    if (!selectedType) return;
    setLoading(true); setErr(undefined);
    setSelectedISO(null);
    try {
      const { slots } = await getSlots(selectedType, date); // solo libres
      // ordenar por hora
      const ordered = [...slots].sort((a,b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
      setFreeSlots(ordered);

      // construir grid:
      // - si hay >=2 libres: usar paso = diff mínimo entre consecutivos
      // - si hay 1 libre: usar paso = duration del tipo o 30 min fallback
      // - si no hay libres: grid vacío (o podrías mostrar un rango fijo si quieres)
      let step = 30;
      if (ordered.length >= 2) {
        let minStep = Infinity;
        for (let i=1;i<ordered.length;i++){
          const d = diffMin(ordered[i-1].iso, ordered[i].iso);
          if (d > 0 && d < minStep) minStep = d;
        }
        if (Number.isFinite(minStep)) step = minStep;
      } else if (ordered.length === 1) {
        const t = eventTypes.find(e => e.slug === selectedType);
        step = Math.max(5, Math.min(240, t?.durationMin || 30));
      }

      let candidates: Slot[] = [];
      if (ordered.length > 0) {
        const startISO = ordered[0].iso;
        const endISO   = ordered[ordered.length - 1].iso;

        // rellenar de start→end en paso 'step'
        let cur = startISO;
        while (new Date(cur).getTime() <= new Date(endISO).getTime() + 1000) {
          candidates.push({ iso: cur, label: labelFromISO(cur) });
          cur = addMinISO(cur, step);
        }

        // Si quieres ampliar 1 paso por delante y por detrás para visualizar huecos en los bordes:
        // candidates.unshift({ iso: addMinISO(startISO, -step), label: labelFromISO(addMinISO(startISO, -step)) });
        // candidates.push({ iso: addMinISO(endISO, step), label: labelFromISO(addMinISO(endISO, step)) });
      } else {
        candidates = [];
      }

      setGridSlots(candidates);
    } catch (e:any) {
      setErr("No se pudo cargar la disponibilidad");
      setFreeSlots([]);
      setGridSlots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDay(); /* eslint-disable-next-line */ }, [selectedType, date]);

  // refresco suave para reflejar ocupaciones en vivo
  useEffect(() => {
    if (!selectedType) return;
    const ms = selectedISO ? 5000 : 10000;
    const id = setInterval(loadDay, ms);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType, date, selectedISO]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);

    if (!selectedType) return setFormError("Selecciona un tipo de evento.");
    if (!selectedISO)  return setFormError("Selecciona un horario.");
    if (!freeSet.has(selectedISO)) {
      setFormError("Ese horario se acaba de ocupar. Selecciona otro.");
      await loadDay();
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
      if (r.ok) {
        nav(`/success/${r.id}`);
        return;
      }
      setFormError("No se pudo confirmar la reserva.");
    } catch (e:any) {
      const msg = String(e);
      if (msg.includes("slot_taken") || msg.includes("409")) {
        setFormError("Ese horario se acaba de ocupar. Actualizamos la disponibilidad.");
        await loadDay();
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

      {loading && <div className="text-gray-600 mb-3">Cargando horarios…</div>}
      {err && <div className="alert-error mb-3">{err}</div>}

      {/* GRID: mostrar todas las horas del rango, deshabilitando las no libres */}
      {!loading && !err && (
        <>
          {gridSlots.length === 0 ? (
            <div className="text-gray-500 mb-3">No hay horarios disponibles para este día.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {gridSlots.map((s) => {
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

          {/* Aviso si el slot elegido ya no está libre */}
          {selectedISO && !slotStillFree && (
            <div className="alert-error mb-3">Ese horario se acaba de ocupar. Selecciona otro.</div>
          )}

          <form onSubmit={onSubmit} className="card">
            <div className="mb-2 text-sm text-gray-700">
            {selectedISO
                ? <>Reservar para: <code>{selectedISO}</code> (UTC) — {prettyLocal(selectedISO)} <span className="text-gray-500">({tz})</span></>
                : "Selecciona un horario disponible"}
            </div>

            <div className="mb-2">
              <label className="label">Nombre</label>
              <input
                className="input w-full"
                value={guestName}
                onChange={(e)=>setGuestName(e.target.value)}
                placeholder="Tu nombre"
                disabled={!selectedISO || !slotStillFree || submitting}
              />
            </div>

            <div className="mb-3">
              <label className="label">Email</label>
              <input
                className="input w-full"
                type="email"
                value={guestEmail}
                onChange={(e)=>setGuestEmail(e.target.value)}
                placeholder="tu@email.com"
                disabled={!selectedISO || !slotStillFree || submitting}
              />
            </div>

            {formError && <div className="alert-error mb-3">{formError}</div>}

            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={submitting || !selectedISO || !slotStillFree}>
                {submitting ? "Confirmando…" : "Confirmar reserva"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setSelectedISO(null); setGuestName(""); setGuestEmail(""); setFormError(undefined); }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
