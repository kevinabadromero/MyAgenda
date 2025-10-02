import { useEffect, useMemo, useState } from "react";
import MonthCalendar, { startOfMonth, endOfMonth } from "../components/MonthCalendar";
import {
  adminBookingsRange,
  type AdminBooking,
  adminCreateBooking,
  adminUpdateBookingStatus,
} from "../lib/apiAdmin";
import { listEventTypes, getSlots } from "../lib/api";
import { useLocation, useNavigate } from "react-router-dom";
import { useProfile } from "../profile";

/* utils */
function toYMD(d: Date) {
  const y = d.getUTCFullYear(),
    m = String(d.getUTCMonth() + 1).padStart(2, "0"),
    day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function hexToRGBA(hex: string, alpha = 0.28) {
  const h = (hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(79,70,229,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
const fmtUSD = (v: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(v);
const fromCents = (c?: number | null) => (c == null ? null : c / 100);

// Lee camelCase o snake_case indistintamente
const pick = (o: any, ...keys: string[]) =>
  keys.reduce<any>((v, k) => (v !== undefined && v !== null ? v : o?.[k]), undefined);





export default function AdminBookings() {
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [items, setItems] = useState<AdminBooking[]>([]);
  const [tz, setTz] = useState<string>("UTC");
  const [selectedYMD, setSelectedYMD] = useState<string>(toYMD(new Date()));
  const [detail, setDetail] = useState<any | null>(null); // booking seleccionado para modal

  const loc = useLocation();
  const nav = useNavigate();
  const newMode = loc.pathname.endsWith("/new");

  async function reloadMonth(a = anchor) {
    const from = toYMD(startOfMonth(a));
    const to = toYMD(endOfMonth(a));
    const r = await adminBookingsRange(from, to);
    setItems(r.items || []);
    setTz(r.timezone || "UTC");
    const sel = new Date(selectedYMD + "T00:00:00Z");
    if (sel < startOfMonth(a) || sel > endOfMonth(a)) setSelectedYMD(from);
  }

  useEffect(() => {
    reloadMonth(anchor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, { id: string; title: string; startsAt: string; endsAt: string; color?: string }[]>();
    for (const b of items) {
      const d = new Date(b.startsAt);
      const ymd = toYMD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
      const arr = map.get(ymd) || [];
      arr.push({
        id: b.id as any,
        title: `${new Date(b.startsAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: tz,
        })} ${b.eventType.name}`,
        startsAt: b.startsAt,
        endsAt: b.endsAt,
        color: "#4f46e5",
      });
      map.set(ymd, arr);
    }
    return map;
  }, [items, tz]);

  const dayList = useMemo(() => {
    const key = (iso: string) => {
      const d = new Date(iso);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(
        2,
        "0"
      )}`;
    };
    return items
      .filter((b) => key(b.startsAt) === selectedYMD)
      .sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  }, [items, selectedYMD]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <button
            className="btn"
            onClick={() =>
              setAnchor((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() - 1, 1)))
            }
          >
            ←
          </button>

          <button
            className="btn"
            onClick={() =>
              setAnchor((prev) => new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth() + 1, 1)))
            }
          >
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
                {new Date(selectedYMD + "T00:00:00Z").toLocaleDateString([], {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => nav("/admin/bookings/new")}>
              Nuevo
            </button>
          </div>

          {dayList.length === 0 ? (
            <div className="text-slate-500">Sin reservas</div>
          ) : (
            <ul className="space-y-5">
              {dayList.map((b) => {
                const color = b.eventType.colorHex || "#4f46e5";
                const priceAmount   = fromCents(pick(b, "priceCents", "price_cents"));
                const depositAmount = fromCents(pick(b, "depositCents", "deposit_cents"));
                const depositStatus = pick(b, "depositStatus", "deposit_status") as "pending"|"confirmed"|"waived"|undefined;
                const depositRef    = pick(b, "depositReference", "deposit_reference") as string|undefined;
              
                const status        = pick(b, "status", "status") as "pending"|"confirmed"|"cancelled"; // <-- FALTABA
                const hasPayment    = priceAmount != null && Number(priceAmount) > 0;
                const needsDeposit  = status === "pending"; // tu lógica original
              
                const glow = hexToRGBA(color, 0.65);

                return (
                  <li
                    key={String(b.id)}
                    className="flex items-center gap-4 rounded-xl p-2 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDetail(b)}
                    role="button"
                    title="Ver detalles"
                  >
                    {/* Hora */}
                    <div className="lg:w-[10%] w-[68px] text-right">
                      <div className="text-[22px] leading-6 font-semibold text-brand-700">{fmt(b.startsAt)}</div>
                      <div className="text-xs text-slate-400 mt-1">{fmt(b.endsAt)}</div>
                    </div>

                    {/* Barra de color */}
                    <div
                      className="w-1.5 self-stretch rounded-full my-1"
                      style={{ background: color, boxShadow: `0 4px 12px ${glow}` }}
                      aria-hidden
                    />

                    {/* Detalles */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs uppercase tracking-wide text-slate-400">{b.eventType.name}</div>
                      <div className="text-sm truncate">{b.guestName}</div>

                      {(priceAmount != null || needsDeposit) && (
                        <div className="mt-1 text-xs text-slate-500 flex flex-wrap items-center gap-2">
                          {priceAmount != null && <span>Precio: {fmtUSD(priceAmount)}</span>}
                          {depositAmount != null && <span>Abono: {fmtUSD(depositAmount)}</span>}
                        </div>
                      )}
                    </div>

                    {/* Chips */}
                    {hasPayment && (
                      <div className="flex items-center gap-2">
                        {depositRef && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100 text-slate-700">
                            Ref: {depositRef}
                          </span>
                        )}

                        {/* Sin referencia + pending */}
                        {!depositRef && status === "pending" && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                            Pago pendiente
                          </span>
                        )}

                        {/* Con referencia + pending */}
                        {depositRef && status === "pending" && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700">
                            Verificar pago
                          </span>
                        )}

                        {/* Pago confirmado (sólo cuando el depósito está confirmado) */}
                        {status === "confirmed" && depositStatus === "confirmed" && (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                            Pago completado
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {detail && (
        <BookingDetailModal
          tz={tz}
          booking={detail}
          onClose={() => setDetail(null)}
          onConfirmed={async () => {
            await reloadMonth();
            setDetail(null);
          }}
        />
      )}

      {newMode && (
        <NewBookingModal
          defaultDate={selectedYMD}
          onClose={() => nav("/admin/bookings")}
          onCreated={async () => {
            await reloadMonth();
            nav("/admin/bookings");
          }}
        />
      )}
    </div>
  );
}

/* ============ Modal Detalle ============ */
function BookingDetailModal({
  tz,
  booking,
  onClose,
  onConfirmed,
}: {
  tz: string;
  booking: any;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  
  const priceAmount     = fromCents(pick(booking, "priceCents", "price_cents"));
  const depositAmount   = fromCents(pick(booking, "depositCents", "deposit_cents"));
  const depositPercent  = pick(booking, "depositPercent", "deposit_percent") as number|undefined;
  const status          = pick(booking, "status", "status") as "confirmed"|"pending"|"cancelled";
  const priceCents     = pick(booking, "priceCents", "price_cents");
  const hasPayment     = priceCents != null && Number(priceCents) > 0;
  const depositRef     = pick(booking, "depositReference", "deposit_reference") as string | undefined;
  const depositStatus  = pick(booking, "depositStatus", "deposit_status") as "pending"|"confirmed"|"waived"|undefined;

  const depositLabel =
    !hasPayment ? "—" :
    !depositRef && status === "pending" ? "pago pendiente" :
    depositStatus === "confirmed"       ? "pago completado" :
    depositRef                           ? "por verificar" :
                                         (depositStatus ?? "—");
  const startLbl = new Date(booking.startsAt).toLocaleString([], { timeZone: tz });
  const endLbl = new Date(booking.endsAt).toLocaleString([], { timeZone: tz });
  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-3" role="dialog" aria-modal="true"
      onKeyDown={(e)=>{ if(e.key==='Escape') onClose(); }}>
      <div className="w-full max-w-2xl card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Detalle de reserva</div>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="grid md:grid-cols-2 gap-2">
            <Field label="Estado">{status}</Field>
            <Field label="Tipo">{booking.eventType?.name}</Field>
            <Field label="Inicio">{startLbl}</Field>
            <Field label="Fin">{endLbl}</Field>
            <Field label="Cliente">{booking.guestName}</Field>
            <Field label="Email">{booking.guestEmail}</Field>
          </div>

          <div className="mt-2 grid md:grid-cols-3 gap-2">
            <Field label="Precio">{priceAmount != null ? fmtUSD(priceAmount) : "—"}</Field>
            <Field label="% Abono">{depositPercent != null ? `${depositPercent}%` : "—"}</Field>
            <Field label="Monto abono">{depositAmount != null ? fmtUSD(depositAmount) : "—"}</Field>
          </div>

          <div className="grid md:grid-cols-2 gap-2">
            <Field label="Estado del abono">{depositLabel}</Field>
            <Field label="Referencia">
              {depositRef ? (
                <span className="inline-flex items-center justify-between gap-2">
                  <span className="font-mono">{depositRef}</span>
                  <button className="btnx btn-burst cursor-pointer btn-xs" onClick={() => copy(depositRef)}>Copiar</button>
                </span>
              ) : (
                "—"
              )}
            </Field>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-2 mt-3">
            {hasPayment && status === "pending" && (
              <button
                className="btnx btn-burst cursor-pointer"
                disabled={!depositRef} // si no hay referencia, no confirmes
                onClick={async () => {
                  await adminUpdateBookingStatus(String(booking.id), "confirmed");
                  onConfirmed();
                }}
              >
                {depositRef ? "Confirmar pago y cita" : "Esperando referencia"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: any }) {
  return (
    <div className="p-2 rounded-lg border">
      <div className="text-[11px] uppercase text-slate-500">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/* ================= Modal para crear reserva ================= */
function NewBookingModal({
  defaultDate,
  onClose,
  onCreated,
}: {
  defaultDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useProfile();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [eventTypes, setEventTypes] = useState<{ id: string; slug: string; name: string; durationMin: number }[]>([]);
  const [eventType, setEventType] = useState<string>("");
  const [date, setDate] = useState<string>(defaultDate);
  const [slots, setSlots] = useState<{ iso: string; label: string }[]>([]);
  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    (async () => {
      try {
        const { items } = await listEventTypes();
        setEventTypes(items as any);
        const first = items[0];
        if (first) setEventType(first.slug);
      } catch {
        setErr("No se pudieron cargar los tipos de evento");
      }
    })();
  }, []);

  useEffect(() => {
    if (!eventType || !date) return;
    setLoading(true);
    getSlots(eventType, date)
      .then((r) => {
        setSlots(r.slots);
        if (selectedISO && !r.slots.some((s) => s.iso === selectedISO)) setSelectedISO(null);
      })
      .catch(() => setErr("No se pudo cargar la disponibilidad"))
      .finally(() => setLoading(false));
  }, [eventType, date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!eventType || !selectedISO) {
      setErr("Completa tipo y hora.");
      return;
    }
    if (!guestName.trim()) {
      setErr("Ingresa el nombre del cliente.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setErr("Email inválido.");
      return;
    }

    setSubmitting(true);
    try {
      await adminCreateBooking({
        eventType,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        startISO: selectedISO,
      });
      onCreated();
    } catch (e: any) {
      setErr("No se pudo crear la reserva.");
    } finally {
      setSubmitting(false);
    }
  }

  const labelFromISO = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Nueva reserva</div>
          <button className="btn" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <div>
            <label className="label">Tipo de evento</label>
            <select className="select" value={eventType} onChange={(e) => setEventType(e.target.value)}>
              {eventTypes.map((et) => (
                <option key={et.id} value={et.slug}>
                  {et.name} ({et.durationMin} min)
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label">Fecha</label>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                {slots.map((s) => (
                  <button
                    type="button"
                    key={s.iso}
                    className={`slot ${selectedISO === s.iso ? "slot--active" : ""}`}
                    onClick={() => setSelectedISO(s.iso)}
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
              <input className="input" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
            </div>
            <div>
              <label className="label">Email del cliente</label>
              <input className="input" type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
            </div>
          </div>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="btn" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={submitting || !selectedISO}>
              {submitting ? "Guardando…" : "Crear reserva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
