import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getSlots, createBooking } from "../lib/api";
import type { Slot } from "../types";

// Helpers sin dependencias
const toYMD = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromYMD = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  // Date UTC puro para que no se desplace por TZ del navegador
  return new Date(Date.UTC(y, m - 1, d));
};
const addDays = (s: string, n: number) => {
  const d = fromYMD(s);
  d.setUTCDate(d.getUTCDate() + n);
  return toYMD(d);
};

export default function Booking() {
  const { eventType = "" } = useParams();
  const nav = useNavigate();

  const [date, setDate] = useState(() => toYMD(new Date())); // hoy
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();

  const [selectedISO, setSelectedISO] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string>();

  const title = useMemo(() => eventType.replace(/-/g, " "), [eventType]);

  async function load() {
    if (!eventType) return;
    setLoading(true);
    setErr(undefined);
    setSelectedISO(null);
    try {
      const { slots } = await getSlots(eventType, date);
      setSlots(slots);
    } catch (e: any) {
      setErr(e?.message || "No se pudo cargar la disponibilidad");
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(); // al montar y cuando cambie fecha
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, date]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(undefined);

    if (!selectedISO) {
      setFormError("Selecciona un horario.");
      return;
    }
    if (!guestName.trim()) {
      setFormError("Ingresa tu nombre.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setFormError("Ingresa un email válido.");
      return;
    }

    setSubmitting(true);
    try {
      const r = await createBooking({
        eventType,
        guestName: guestName.trim(),
        guestEmail: guestEmail.trim(),
        startISO: selectedISO,
      });
      if (r.ok) {
        nav(`/success/${r.id}`);
        return;
      }
      setFormError("No se pudo confirmar la reserva.");
    } catch (e: any) {
      const msg = String(e);
      // Caso típico de choque
      if (msg.includes("slot_taken") || msg.includes("409")) {
        setFormError("Ese horario se acaba de ocupar. Actualizamos la disponibilidad.");
        // Recargar slots para reflejar el choque
        await load();
        setSelectedISO(null);
      } else {
        setFormError("Error al confirmar la reserva.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      <Link to="/" className="text-blue-600 text-sm">&larr; Volver</Link>
      <h1 className="text-2xl font-semibold mb-2 capitalize">{title}</h1>

      {/* Controles de fecha */}
      <div className="mb-4 flex items-center gap-2">
        <button className="btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
          &larr;
        </button>
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <button className="btn" onClick={() => setDate(addDays(date, +1))} aria-label="Día siguiente">
          &rarr;
        </button>
      </div>

      {/* Estado de carga y error */}
      {loading && <div className="text-gray-600 mb-3">Cargando horarios…</div>}
      {err && <div className="alert-error mb-3">{err}</div>}

      {/* Slots */}
      {!loading && !err && (
        <>
          {slots.length === 0 ? (
            <div className="text-gray-500 mb-3">No hay horarios disponibles para este día.</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 mb-4">
              {slots.map((s) => {
                const active = selectedISO === s.iso;
                return (
                  <button
                    key={s.iso}
                    onClick={() => setSelectedISO(s.iso)}
                    className={`slot ${active ? "slot--active" : ""}`}
                    title={s.iso}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Formulario inline al elegir un slot */}
          {selectedISO && (
            <form onSubmit={onSubmit} className="card">
              <div className="mb-2 text-sm text-gray-700">
                Reservar para: <code>{selectedISO}</code> (UTC)
              </div>

              <div className="mb-2">
                <label className="label">Nombre</label>
                <input
                  className="input w-full"
                  type="text"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>

              <div className="mb-3">
                <label className="label">Email</label>
                <input
                  className="input w-full"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="tu@email.com"
                />
              </div>

              {formError && <div className="alert-error mb-3">{formError}</div>}

              <div className="flex gap-2">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Confirmando…" : "Confirmar reserva"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setSelectedISO(null);
                    setGuestName("");
                    setGuestEmail("");
                    setFormError(undefined);
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
