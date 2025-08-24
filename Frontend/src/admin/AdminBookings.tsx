import { useEffect, useMemo, useState } from "react";
import { adminListBookings, adminUpdateBookingStatus } from "../lib/apiAdmin";
import { adminListEventTypes } from "../lib/apiAdmin";

type Row = {
  id: string;
  eventType: { id:string; name:string; slug:string };
  guestName: string;
  guestEmail: string;
  startsAt: string; // UTC
  endsAt: string;   // UTC
  status: "confirmed" | "cancelled";
};

const toYMD = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function AdminBookings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>();
  const [timezone, setTimezone] = useState<string>("UTC");

  // filtros
  const [date, setDate] = useState(() => toYMD(new Date()));
  const [status, setStatus] = useState<""|"confirmed"|"cancelled">("");
  const [eventType, setEventType] = useState<string>("");

  // lista de ET para el filtro
  const [etList, setEtList] = useState<{slug:string; name:string}[]>([]);

  async function load() {
    setLoading(true); setErr(undefined);
    try {
      const res = await adminListBookings({ date, status: status || undefined, eventType: eventType || undefined });
      setRows(res.items as any);
      setTimezone(res.timezone || "UTC");
    } catch (e:any) {
      setErr("No se pudieron cargar las reservas");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, status, eventType]);

  useEffect(() => {
    (async () => {
      try {
        const { items } = await adminListEventTypes();
        setEtList(items.map((i:any)=>({ slug:i.slug, name:i.name })));
      } catch {}
    })();
  }, []);

  const fmt = useMemo(() => new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium", timeStyle: "short", timeZone: timezone
  }), [timezone]);

  async function cancel(id: string) {
    if (!confirm("¿Cancelar esta reserva?")) return;
    try { await adminUpdateBookingStatus(id, "cancelled"); await load(); }
    catch { alert("No se pudo cancelar"); }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Reservas</h1>

      {/* Filtros */}
      <div className="card mb-4 grid md:grid-cols-4 gap-3">
        <div>
          <label className="label">Fecha</label>
          <input className="input w-full" type="date" value={date} onChange={e=>setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Estado</label>
          <select className="input w-full" value={status} onChange={e=>setStatus(e.target.value as any)}>
            <option value="">Todos</option>
            <option value="confirmed">Confirmadas</option>
            <option value="cancelled">Canceladas</option>
          </select>
        </div>
        <div>
          <label className="label">Tipo de evento</label>
          <select className="input w-full" value={eventType} onChange={e=>setEventType(e.target.value)}>
            <option value="">Todos</option>
            {etList.map(et => <option key={et.slug} value={et.slug}>{et.name}</option>)}
          </select>
        </div>
        <div className="flex items-end">
          <button className="btn" onClick={load}>Actualizar</button>
        </div>
      </div>

      {loading && <div>Cargando…</div>}
      {err && <div className="alert-error">{err}</div>}

      {!loading && !err && (
        <div className="card">
          <div className="grid grid-cols-7 gap-2 text-sm font-medium mb-2">
            <div>Inicio</div>
            <div>Fin</div>
            <div>Tipo</div>
            <div>Invitado</div>
            <div>Email</div>
            <div>Estado</div>
            <div>Acciones</div>
          </div>
          {rows.length === 0 && <div className="text-gray-500">Sin resultados.</div>}
          {rows.map(r => (
            <div key={r.id} className="grid grid-cols-7 gap-2 py-2 border-t">
              <div>{fmt.format(new Date(r.startsAt))}</div>
              <div>{fmt.format(new Date(r.endsAt))}</div>
              <div>{r.eventType.name}</div>
              <div>{r.guestName}</div>
              <div>{r.guestEmail}</div>
              <div>{r.status === "cancelled" ? "Cancelada" : "Confirmada"}</div>
              <div className="flex gap-2">
                {r.status !== "cancelled" && (
                  <button className="btn" onClick={()=>cancel(r.id)}>Cancelar</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}