import { useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
// si ya tienes un helper que agrega ?host=, úsalo; si no:
const API = import.meta.env.VITE_API_BASE || "https://api.auraux.dev";
const HOST = window.location.host; // agenda.auraux.dev

export default function Success() {
  const { id } = useParams();                // id de la reserva
  const [qs] = useSearchParams();
  const auto = qs.get("dl") === "ics";

  useEffect(() => {
    if (!id || !auto) return;
    const icsUrl = `${API}/public/booking/${id}/ics?host=${HOST}`;

    // método principal: <a download> + click programático
    const a = document.createElement("a");
    a.href = icsUrl;
    a.download = `booking-${id}.ics`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();

    // fallback (Safari iOS suele abrir el calendario):
    const t = setTimeout(() => {
      try { window.open(icsUrl, "_blank"); } catch {}
    }, 1500);
    return () => clearTimeout(t);
  }, [id, auto]);

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold mb-2">¡Reserva confirmada!</h1>
      <p className="text-gray-600">
        Te enviamos un email con los detalles. Si tu descarga del evento no comenzó, 
        <a className="link" href={`${API}/public/booking/${id}/ics?host=${HOST}`}> descárgalo aquí</a>.
      </p>
      {/* … resto del contenido de confirmación … */}
    </div>
  );
}