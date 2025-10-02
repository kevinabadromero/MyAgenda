import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import MobilePayInstructions from "../components/MobilePayInstructions";
import { vesRate } from "../lib/api";
const API = import.meta.env.VITE_API_BASE || "https://api.dappointment.com";
const HOST = typeof window !== "undefined" ? window.location.host : "";

/** Tipos mínimos */
type DepositMobile = { bank_code: string; phone: string; id_number: string };
type DepositInfo = {
  amount_cents: number;
  mobile: DepositMobile;
  usd_amount?: number | null;
};
type PublicBooking = {
  id: number | string;
  status: "confirmed" | "pending" | "cancelled";
  starts_at: string;
  ends_at: string;
  guest_name: string;
  guest_email: string;
  event_type?: { name: string } | null;
  deposit?: DepositInfo | null;
};

export default function Success() {
  const { id } = useParams(); // /success/:id
  const [qs] = useSearchParams();

  // slug del tenant: toma ?u= si viene, o localStorage
  const u = useMemo(() => {
    const fromQs = qs.get("u") || "";
    const existing = localStorage.getItem("ma_u") || "";
    const val = fromQs || existing;
    if (val) localStorage.setItem("ma_u", val);
    return val;
  }, [qs]);

  const autoICS = qs.get("dl") === "ics";

  const [loading, setLoading] = useState(true);
  const [bk, setBk] = useState<PublicBooking | null>(null);
  const [error, setError] = useState<string>();
  const [sendingRef, setSendingRef] = useState(false);
  const [refValue, setRefValue] = useState("");
  const [conversion, setConversion] = useState(0);
  /** helper para intentar múltiples URLs en orden */
  async function tryFetchJSON(urls: string[]) {
    for (const url of urls) {
      const r = await fetch(url, { mode: "cors" });
      if (r.ok) return r.json();
    }
    throw new Error("not_found");
  }
  useEffect(() => {
    let cancelled = false;
  
    (async () => {
      try {
        const { ves } = await vesRate(); // -> { ves: number }
        if (!cancelled) setConversion(ves);
      } catch (e) {
        if (!cancelled) setConversion(0);
      }
    })();
  
    return () => { cancelled = true; };
  }, []);
  // 1) Traer la reserva pública
  useEffect(() => {
    if (!id) return;
    let off = false;
    (async () => {
      setLoading(true);
      setError(undefined);
      try {
        const data = await tryFetchJSON([
          // preferido: plural + ?u=
          `${API}/public/bookings/${id}?u=${encodeURIComponent(u)}`,
          // compat: singular + ?u=
          `${API}/public/booking/${id}?u=${encodeURIComponent(u)}`,
          // fallback final por host (si algún caso viejo aún usa host)
          `${API}/public/bookings/${id}?host=${HOST}`,
          `${API}/public/booking/${id}?host=${HOST}`,
        ]);
        if (!off) setBk(data as PublicBooking);
      } catch (e) {
        if (!off) setError("No pudimos cargar la reserva.");
      } finally {
        if (!off) setLoading(false);
      }
    })();
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, u]);

  // 2) Descarga automática del .ics solo si está confirmada
  useEffect(() => {
    if (!id || !bk || !autoICS || bk.status !== "confirmed") return;

    const icsPrefer = `${API}/public/bookings/${id}/ics?u=${encodeURIComponent(u)}`;
    const icsCompat = `${API}/public/booking/${id}/ics?u=${encodeURIComponent(u)}`;
    const icsHostP  = `${API}/public/bookings/${id}/ics?host=${HOST}`;
    const icsHostS  = `${API}/public/booking/${id}/ics?host=${HOST}`;

    function triggerDownload(url: string) {
      const a = document.createElement("a");
      a.href = url;
      a.download = `booking-${id}.ics`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    // Dispara la preferida; como fallback, abre compat/host en nueva pestaña
    triggerDownload(icsPrefer);
    const t = setTimeout(() => {
      try {
        window.open(icsCompat, "_blank");
      } catch {}
      setTimeout(() => {
        try {
          window.open(icsHostP, "_blank");
          window.open(icsHostS, "_blank");
        } catch {}
      }, 600);
    }, 1200);

    return () => clearTimeout(t);
  }, [id, bk, autoICS, u]);

  const title = useMemo(() => {
    if (!bk) return "Reserva";
    const name = bk.event_type?.name || "Reserva";
    return bk.status === "pending" ? `${name} (abono pendiente)` : `${name} confirmada`;
  }, [bk]);

  async function sendReference(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !refValue.trim()) return;
    setSendingRef(true);
    try {
      await fetch(`${API}/public/bookings/${id}/deposit-ref?u=${encodeURIComponent(u)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refValue.trim() }),
        mode: "cors",
      });
      alert("Referencia enviada. Te notificaremos cuando sea confirmada.");
      setRefValue("");
    } catch {
      alert("No se pudo enviar la referencia. Intenta de nuevo.");
    } finally {
      setSendingRef(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-6">
      {!bk ? (
        <>
          <h1 className="text-2xl font-semibold mb-2">Procesando…</h1>
          {error && <div className="alert-error">{error}</div>}
        </>
      ) : bk.status === "confirmed" ? (
        <>
          <h1 className="text-2xl font-semibold mb-2">¡Reserva confirmada!</h1>
          <p className="text-gray-600 mb-4">
            Te enviamos un email con los detalles. Si tu descarga del evento no comenzó,{" "}
            <a
              className="link"
              href={`${API}/public/bookings/${id}/ics?u=${encodeURIComponent(u)}`}
            >
              descárgalo aquí
            </a>
            .
          </p>

          <div className="rounded-2xl card p-4">
            <div className="text-sm text-gray-700">
              <div>
                <b>Fecha</b>: {new Date(bk.starts_at).toLocaleString()}
              </div>
              <div>
                <b>Invitado</b>: {bk.guest_name} ({bk.guest_email})
              </div>
            </div>
          </div>

          <div className="mt-6">
            <Link to={`/?u=${encodeURIComponent(u)}`} className="btn">
              Volver al inicio
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold mb-1">{title}</h1>
          <p className="text-gray-600 mb-4">
            Para confirmar tu cita debes abonar una parte con <b>Pago Móvil</b>.
          </p>

          {/* Card con instrucciones de Pago Móvil */}
          {bk.deposit?.mobile && (
            <MobilePayInstructions
              bankCode={bk.deposit.mobile.bank_code}
              idNumber={bk.deposit.mobile.id_number}
              phone={bk.deposit.mobile.phone}
              amountCentsVES={bk.deposit.amount_cents * conversion}
              amountUSD={bk.deposit.amount_cents ?? null}
              title="Pagar a la tienda"
            />
          )}

          {/* Campo para enviar referencia */}
          <form onSubmit={sendReference} className="card mt-6">
            <label className="label">Referencia de pago</label>
            <input
              className="input w-full"
              value={refValue}
              onChange={(e) => setRefValue(e.target.value)}
              placeholder="Ej: 1234567890"
            />
            <div className="flex gap-2 mt-3">
              <button className="btnx btn-burst cursor-pointer" disabled={sendingRef || !refValue.trim()}>
                {sendingRef ? "Enviando…" : "Enviar referencia"}
              </button>
              <Link to={`/?u=${encodeURIComponent(u)}`} className="btn">
                Volver al inicio
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
