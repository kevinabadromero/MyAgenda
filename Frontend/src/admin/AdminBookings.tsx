import { useEffect, useMemo, useState } from "react";
import MonthCalendar, { startOfMonth, endOfMonth } from "../components/MonthCalendar";
import { adminBookingsRange, type AdminBooking, adminCreateBooking } from "../lib/apiAdmin";
import { listEventTypes, getSlots } from "../lib/api"; // ya los usas en público
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile } from "../profile";

function toYMD(d: Date) {
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,"0"), day=String(d.getUTCDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function hexToRGBA(hex: string, alpha = 0.28) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(79,70,229,${alpha})`; // fallback
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
export default function AdminBookings() {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [items, setItems] = useState<AdminBooking[]>([]);
  const [tz, setTz] = useState<string>("UTC");
  const [selectedYMD, setSelectedYMD] = useState<string>(toYMD(new Date()));

  const loc = useLocation();
  const nav = useNavigate();
  const newMode = loc.pathname.endsWith("/new"); // ← abre modal si /new

  useEffect(() => {
    const from = toYMD(startOfMonth(anchor));
    const to   = toYMD(endOfMonth(anchor));
    (async () => {
      const r = await adminBookingsRange(from, to);
      setItems(r.items || []);
      setTz(r.timezone || "UTC");
      const sel = new Date(selectedYMD+"T00:00:00Z");
      if (sel < startOfMonth(anchor) || sel > endOfMonth(anchor)) setSelectedYMD(from);
    })();
  }, [anchor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { id:string; title:string; startsAt:string; endsAt:string; color?:string }[]>();
    for (const b of items) {
      const d = new Date(b.startsAt);
      const ymd = toYMD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
      const arr = map.get(ymd) || [];
      arr.push({
        id: b.id,
        title: `${new Date(b.startsAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', timeZone: tz})} ${b.eventType.name}`,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        color: "#4f46e5"
      });
      map.set(ymd, arr);
    }
    return map;
  }, [items, tz]);
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
  
  const dayList = useMemo(() => {
    return items
      .filter(b => ymd(new Date(b.startsAt)) === selectedYMD)
      .sort((a,b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  }, [items, selectedYMD]);
  
  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });

  const dayAgenda = useMemo(
    () => (eventsByDay.get(selectedYMD) || [])
            .sort((a,b) => +new Date(a.startsAt) - +new Date(b.startsAt)),
    [eventsByDay, selectedYMD]
  );

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <button className="btn"
            onClick={() => setAnchor(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth()-1, 1)))}>
            ←
          </button>
          <div className="text-sm text-slate-500">TZ: {tz}</div>
          <button className="btn"
            onClick={() => setAnchor(prev => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth()+1, 1)))}>
            →
          </button>
        </div>
        <MonthCalendar
          month={anchor}
          eventsByDay={eventsByDay}
          selectedDayYMD={selectedYMD}
          onSelectDay={setSelectedYMD}
        />
      </div>

      <div className="lg:col-span-2">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-slate-500">Agenda de</div>
              <div className="text-lg font-semibold">
                {new Date(selectedYMD+"T00:00:00Z").toLocaleDateString([], { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
              </div>
            </div>
            <button className="btn btn-primary" onClick={()=>nav("/admin/bookings/new")}>Nuevo</button>
          </div>

          {dayList.length === 0 ? (
            <div className="text-slate-500">Sin reservas</div>
          ) : (
            <ul className="space-y-5">
              {dayList.map(b => {
                const color = b.eventType.colorHex || "#4f46e5"; // fallback si aún no traes color desde el backend
                return (
                  <li key={b.id} className="flex items-center justify-center gap-4">
                    {/* Hora inicio (grande) + fin (gris debajo) */}
                    <div className="lg:w-[10%] w-[68px] text-right">
                      <div className="text-[22px] leading-6 font-semibold text-brand-700">
                        {fmt(b.startsAt)}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {fmt(b.endsAt)}
                      </div>
                    </div>

                    {/* Barra vertical del color del servicio */}
                    {(() => {
                        const glow = hexToRGBA(color, 0.65); // 0.20–0.35 según gusto
                        return (
                          <div
                            className="w-1.5 self-stretch rounded-full my-1"
                            style={{
                              background: color,
                              boxShadow: `0 4px 12px ${glow}`, // sombra mínima del mismo color
                            }}
                            aria-hidden
                          />
                        );
                      })()}

                    {/* Detalles: tipo (arriba) + nombre del paciente (abajo) */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wide text-slate-400">
                        {b.eventType.name}
                      </div>
                      <div className="text-sm truncate">
                        {b.guestName}
                      </div>
                    </div>

                    {/* Si luego quieres menú de acciones:
                    <button className="btn btn-ghost px-2 py-1">⋯</button> */}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {newMode && (
        <NewBookingModal
          defaultDate={selectedYMD}
          onClose={() => nav("/admin/bookings")}
          onCreated={() => {
            // refresca el mes actual y cierra
            const from = toYMD(startOfMonth(anchor));
            const to   = toYMD(endOfMonth(anchor));
            adminBookingsRange(from, to).then(r => setItems(r.items || []));
            nav("/admin/bookings");
          }}
        />
      )}
    </div>
  );
}

/* ================= Modal para crear reserva ================= */
function NewBookingModal({ defaultDate, onClose, onCreated }:{
  defaultDate: string; onClose: ()=>void; onCreated: ()=>void;
}) {
  const { profile } = useProfile();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [eventTypes, setEventTypes] = useState<{id:string; slug:string; name:string; durationMin:number}[]>([]);
  const [eventType, setEventType] = useState<string>("");
  const [date, setDate] = useState<string>(defaultDate);
  const [slots, setSlots] = useState<{iso:string; label:string}[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    (async () => {
      try {
        const { items } = await listEventTypes(); // público: ya respeta host
        setEventTypes(items as any);
        const first = items[0];
        if (first) setEventType(first.slug);
      } catch { setErr("No se pudieron cargar los tipos de evento"); }
    })();
  }, []);

  useEffect(() => {
    if (!eventType || !date) return;
    setLoading(true);
    getSlots(eventType, date).then(r => {
      setSlots(r.slots);
      // si había selección y ya no está, la limpias
      if (selectedISO && !r.slots.some(s => s.iso === selectedISO)) setSelectedISO(null);
    }).catch(()=>setErr("No se pudo cargar la disponibilidad"))
      .finally(()=>setLoading(false));
  }, [eventType, date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!eventType || !selectedISO) { setErr("Completa tipo y hora."); return; }
    if (!guestName.trim()) { setErr("Ingresa el nombre del cliente."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) { setErr("Email inválido."); return; }

    setSubmitting(true);
    try {
      await adminCreateBooking({
        eventType, guestName: guestName.trim(), guestEmail: guestEmail.trim(), startISO: selectedISO
      });
      onCreated();
    } catch (e:any) {
      setErr("No se pudo crear la reserva.");
    } finally { setSubmitting(false); }
  }

  const labelFromISO = (iso:string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Nueva reserva</div>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label className="label">Tipo de evento</label>
            <select className="select" value={eventType} onChange={e=>setEventType(e.target.value)}>
              {eventTypes.map(et => <option key={et.id} value={et.slug}>{et.name} ({et.durationMin} min)</option>)}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Fecha</label>
              <input className="input" type="date" value={date} onChange={e=>setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Horario</label>
            {loading ? (
              <div className="text-slate-500">Cargando horarios…</div>
            ) : slots.length === 0 ? (
              <div className="text-slate-500">No hay horarios disponibles.</div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map(s => (
                  <button
                    type="button"
                    key={s.iso}
                    className={`slot ${selectedISO===s.iso ? "slot--active" : ""}`}
                    onClick={()=>setSelectedISO(s.iso)}
                    title={s.iso}
                  >
                    {labelFromISO(s.iso)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre del cliente</label>
              <input className="input" value={guestName} onChange={e=>setGuestName(e.target.value)} />
            </div>
            <div>
              <label className="label">Email del cliente</label>
              <input className="input" type="email" value={guestEmail} onChange={e=>setGuestEmail(e.target.value)} />
            </div>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={submitting || !selectedISO}>
              {submitting ? "Guardando…" : "Crear reserva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
