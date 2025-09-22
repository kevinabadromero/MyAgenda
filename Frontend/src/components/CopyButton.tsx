// BookingLinkButton.tsx
import { useMemo, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { X, Copy } from "lucide-react";

// 🔹 Ajusta esta importación a tu proyecto
//   Ejemplos posibles:
//   import { useProfile } from "@/providers/ProfileProvider";
//   import { useProfile } from "../providers/ProfileProvider";
import { useProfile } from "../profile";

function getTenantFromProfile(profile: any): string | undefined {
  if (!profile) return undefined;

  // Ajusta estos accesos a la forma real de tu perfil
  // (dejo varias rutas comunes como fallback):
  return (
    profile.tenant ||
    profile.slug ||
    profile.username ||
    profile.user?.tenant ||
    profile.user?.slug ||
    profile.user?.username ||
    profile.company?.slug ||
    profile.account?.slug ||
    profile.org?.slug ||
    undefined
  );
}

export default function BookingLinkButton() {
  const { profile } = useProfile(); // <- de tu ProfileProvider
  console.log(profile);
  const [open, setOpen] = useState(false);

  const tenant = useMemo(
    () => (getTenantFromProfile(profile) || "clinicacaracas").toString(),
    [profile]
  );

  const bookingUrl = useMemo(
    () => `https://booking.dappointment.com/?u=${encodeURIComponent(tenant)}`,
    [tenant]
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(bookingUrl);
      alert("Enlace copiado");
    } catch {
      window.prompt("Copia el enlace:", bookingUrl);
    }
  };

  const openInNew = () =>
    window.open(bookingUrl, "_blank", "noopener,noreferrer");

  return (
    <>
      {/* Trigger */}
      <button className="btn" onClick={() => setOpen(true)}>
        <Copy size={16} className="mr-1" />
        Mi enlace
      </button>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white text-slate-900 shadow-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Mi enlace público</h2>
              <button
                className="p-2 rounded-lg hover:bg-slate-100"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-2">
              Usuario: <span className="font-medium">{tenant}</span>
            </p>

            {/* Input solo lectura */}
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={bookingUrl}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <button className="btn" onClick={copyLink} title="Copiar">
                Copiar
              </button>
              <button className="btn" onClick={openInNew} title="Abrir">
                Abrir
              </button>
            </div>

            {/* QR */}
            <div className="flex justify-center">
              <QRCodeCanvas value={bookingUrl} size={180} />
            </div>

            <div className="mt-4 text-xs text-slate-500 text-center">
              Formato: <code>https://booking.dappointment.com/?u=[username]</code>
            </div>
          </div>
        </div>
      )}
    </>
  );
}