import { useEffect, useRef, useState } from "react";
import {
  adminGoogleStatus, adminGoogleAuthUrl, adminGoogleDisconnect,
  adminGoogleCalendars, adminGoogleSaveSettings,
  adminGetProfile, adminUpdateEmail, adminChangePassword,
} from "../lib/apiAdmin";

/** Pequeño helper para mensajes */
function useFlash() {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  function ok(m: string)  { setErr(null); setMsg(m); setTimeout(()=>setMsg(null), 2000); }
  function bad(m: string) { setMsg(null); setErr(m); setTimeout(()=>setErr(null), 3000); }
  return { msg, err, ok, bad };
}

export default function AdminIntegrations() {
  // ---- Google ----
  const [status, setStatus] = useState<{connected:boolean; calendarId:string; syncEnabled:boolean}>();
  const [loading, setLoading] = useState(true);
  const [calendars, setCalendars] = useState<{id:string; summary:string; primary:boolean}[]>([]);
  const pollRef = useRef<number|undefined>();

  // ---- Cuenta ----
  const [email, setEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass]       = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);

  const flash = useFlash();

  // -------- Google: status inicial ----------
  async function loadStatus() {
    setLoading(true);
    try { setStatus(await adminGoogleStatus()); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadStatus(); }, []);

  // -------- Cuenta: perfil (email) ----------
  useEffect(() => {
    (async () => {
      try {
        const p = await adminGetProfile();
        setEmail(p.email || "");
      } catch {}
    })();
  }, []);

  // -------- Google: conectar / desconectar ----------
  async function connect() {
    const { url } = await adminGoogleAuthUrl();
    const win = window.open(url, "oauth", "width=520,height=680");
    // Poll hasta que se guarden los tokens
    pollRef.current = window.setInterval(async () => {
      const s = await adminGoogleStatus();
      if (s.connected) {
        window.clearInterval(pollRef.current);
        setStatus(s);
        try {
          const r = await adminGoogleCalendars();
          if (r.connected) setCalendars(r.items);
        } catch {}
        if (win && !win.closed) win.close();
      }
    }, 1000);
  }
  async function disconnect() {
    await adminGoogleDisconnect();
    setStatus({ connected: false, calendarId: "primary", syncEnabled: true });
    setCalendars([]);
  }

  async function loadCalendars() {
    try {
      const r = await adminGoogleCalendars();
      if (r.connected) setCalendars(r.items);
    } catch {}
  }

  async function saveGoogleSettings() {
    if (!status) return;
    await adminGoogleSaveSettings(status.calendarId, status.syncEnabled);
    flash.ok("Guardado");
  }

  // -------- Cuenta: guardar email ----------
  async function onSaveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return flash.bad("Email requerido");
    setSavingEmail(true);
    try {
      await adminUpdateEmail(email.trim());
      flash.ok("Email actualizado");
    } catch {
      flash.bad("No se pudo actualizar el email");
    } finally { setSavingEmail(false); }
  }

  // -------- Cuenta: cambiar contraseña ----------
  async function onSavePass(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPass || !newPass) return flash.bad("Completa las contraseñas");
    if (newPass !== confirmPass)   return flash.bad("Las contraseñas no coinciden");
    setSavingPass(true);
    try {
      await adminChangePassword(currentPass, newPass);
      setCurrentPass(""); setNewPass(""); setConfirmPass("");
      flash.ok("Contraseña actualizada");
    } catch {
      flash.bad("No se pudo actualizar la contraseña");
    } finally { setSavingPass(false); }
  }

  if (loading) return <div>Cargando…</div>;

  return (
    <div className="grid gap-4">
      {/* ================== GOOGLE ================== */}
      <div className="card">
        <h1 className="text-2xl font-semibold mb-4">Integraciones</h1>

        <div className="card">
          {/* Header responsive */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Google Calendar</div>
              <div className="text-sm text-gray-600">
                {status?.connected ? "Conectado ✓" : "No conectado"}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:auto-cols-max sm:grid-flow-col gap-2">
              {!status?.connected ? (
                <button className="btn btn-primary w-full sm:w-auto" onClick={connect}>
                  Conectar Google
                </button>
              ) : (
                <button className="btn w-full sm:w-auto" onClick={disconnect}>
                  Desconectar
                </button>
              )}
            </div>
          </div>

          {status?.connected && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {/* Calendario */}
              <div className="sm:col-span-2">
                <label className="label">Calendario destino</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    className="!w-[40%] input"
                    value={status.calendarId}
                    onChange={e => setStatus(s => s ? { ...s, calendarId: e.target.value } : s)}
                  >
                    <option value="primary">Principal</option>
                    {calendars.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.summary}{c.primary ? " (principal)" : ""}
                      </option>
                    ))}
                  </select>
                  <button className="btn w-full sm:w-auto" onClick={loadCalendars}>
                    Actualizar lista
                  </button>
                </div>
              </div>


              

              {/* Guardar */}
              <div className="sm:col-span-3 gap-10">
              <div className="flex my-5">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!status.syncEnabled}
                    onChange={e => setStatus(s => s ? { ...s, syncEnabled: e.target.checked } : s)}
                  />
                  Sincronizar reservas
                </label>
              </div>
                <button className="btn btn-primary w-full sm:w-auto" onClick={saveGoogleSettings}>
                  Guardar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================== CUENTA (Email / Password) ================== */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-3">Cuenta</h2>

        {/* Mensajes */}
        {(flash.msg || flash.err) && (
          <div className={`mb-3 text-sm ${flash.err ? "text-red-600" : "text-emerald-600"}`}>
            {flash.err || flash.msg}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* --- Email --- */}
          <form onSubmit={onSaveEmail} className="grid gap-3">
            <div className="text-sm font-medium text-slate-600">Email de acceso</div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
            </div>
            <div>
              <button className="btn btn-primary w-full sm:w-auto" disabled={savingEmail}>
                {savingEmail ? "Guardando…" : "Guardar email"}
              </button>
            </div>
          </form>

          {/* --- Password --- */}
          <form onSubmit={onSavePass} className="grid gap-3">
            <div className="text-sm font-medium text-slate-600">Cambiar contraseña</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Actual</label>
                <input className="input" type="password" value={currentPass} onChange={e=>setCurrentPass(e.target.value)} />
              </div>
              <div>
                <label className="label">Nueva</label>
                <input className="input" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Confirmar nueva</label>
                <input className="input" type="password" value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} />
              </div>
            </div>
            <div>
              <button className="btn btn-primary w-full sm:w-auto" disabled={savingPass}>
                {savingPass ? "Guardando…" : "Guardar contraseña"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
