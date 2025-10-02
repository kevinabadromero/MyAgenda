import * as React from "react";
import {
  adminGetProfile,
  adminUploadAvatar,
  adminUpdateEmail,
  adminChangePassword,
  adminGoogleStatus,
  adminGoogleAuthUrl,
  adminGoogleCalendars,
  adminGoogleSaveSettings,
  adminGoogleDisconnect,
  // === Pago Móvil ===
  adminGetMobilePay,
  adminSaveMobilePay,
} from "../lib/apiAdmin";

export default function AdminIntegrations() {
  // ===== Perfil =====
  const [avatarUrl, setAvatarUrl] = React.useState<string | undefined>();
  const [name, setName] = React.useState<string>("");
  const [email, setEmail] = React.useState<string>("");

  const [savingProfile, setSavingProfile] = React.useState(false);
  const [savingPass, setSavingPass] = React.useState(false);
  const [fileBusy, setFileBusy] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const p = await adminGetProfile();
        setAvatarUrl(p.avatarUrl);
        setName(p.name || "");
        setEmail(p.email || "");
      } catch {
        /* no-op */
      }
    })();
  }, []);

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileBusy(true);
    try {
      const { avatarUrl: url } = await adminUploadAvatar(f);
      setAvatarUrl(url);
      // refresca el nav sin reload
      window.dispatchEvent(new CustomEvent("avatar:updated", { detail: url }));
    } catch {
      alert("No se pudo subir la imagen");
    } finally {
      setFileBusy(false);
      e.target.value = "";
    }
  }

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await adminUpdateEmail(email.trim());
      alert("Perfil actualizado");
    } catch (err: any) {
      alert(`No se pudo actualizar: ${err?.message || "error"}`);
    } finally {
      setSavingProfile(false);
    }
  }

  async function onSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) return alert("La nueva contraseña debe tener al menos 8 caracteres.");
    if (newPassword !== confirmPassword) return alert("Las contraseñas no coinciden.");
    setSavingPass(true);
    try {
      await adminChangePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      alert("Contraseña actualizada");
    } catch (err: any) {
      alert(`No se pudo cambiar la contraseña: ${err?.message || "error"}`);
    } finally {
      setSavingPass(false);
    }
  }

  const initials = React.useMemo(() => {
    const base = name || email || "MA";
    return base
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join(" ");
  }, [name, email]);

  // ===== Google Calendar =====
  type GCalItem = { id: string; summary: string; primary: boolean };

  const [gConnected, setGConnected] = React.useState(false);
  const [gSyncEnabled, setGSyncEnabled] = React.useState(false);
  const [gCalendarId, setGCalendarId] = React.useState<string>("");
  const [gCalendars, setGCalendars] = React.useState<GCalItem[]>([]);
  const [gLoading, setGLoading] = React.useState(true);
  const [gSaving, setGSaving] = React.useState(false);

  async function loadGoogleStatus() {
    setGLoading(true);
    try {
      const s = await adminGoogleStatus(); // { connected, calendarId, syncEnabled }
      setGConnected(!!s.connected);
      setGCalendarId(s.calendarId || "");
      setGSyncEnabled(!!s.syncEnabled);

      if (s.connected) {
        const list = await adminGoogleCalendars(); // { connected, items: [] }
        setGCalendars(list.items || []);
        // si no hay calendarId, pre-selecciona el primary si existe
        if (!s.calendarId) {
          const primary = list.items?.find((c) => c.primary) || list.items?.[0];
          if (primary?.id) setGCalendarId(primary.id);
        }
      } else {
        setGCalendars([]);
      }
    } catch {
      // no-op
    } finally {
      setGLoading(false);
    }
  }

  React.useEffect(() => {
    loadGoogleStatus();
  }, []);

  async function onGoogleConnect() {
    try {
      const { url } = await adminGoogleAuthUrl();
      window.location.href = url; // redirige a Google OAuth
    } catch {
      alert("No se pudo iniciar la conexión con Google");
    }
  }

  async function onGoogleSave() {
    setGSaving(true);
    try {
      await adminGoogleSaveSettings(gCalendarId, gSyncEnabled);
      alert("Preferencias de Google guardadas");
    } catch (err: any) {
      alert(`No se pudo guardar: ${err?.message || "error"}`);
    } finally {
      setGSaving(false);
    }
  }

  async function onGoogleDisconnect() {
    if (!confirm("¿Desconectar Google Calendar?")) return;
    try {
      await adminGoogleDisconnect();
      await loadGoogleStatus();
      alert("Cuenta de Google desconectada");
    } catch (err: any) {
      alert(`No se pudo desconectar: ${err?.message || "error"}`);
    }
  }

  // ===== Pago Móvil (Settings) =====
  const [pmLoading, setPmLoading] = React.useState(true);
  const [pmSaving, setPmSaving] = React.useState(false);
  const [pmEnabled, setPmEnabled] = React.useState(false);
  const [pmBank, setPmBank] = React.useState("");           // código: 0114, 0134, etc
  const [pmPhone, setPmPhone] = React.useState("");         // 0412-...
  const [pmIdn, setPmIdn] = React.useState("");             // V- / J-
  const [pmName, setPmName] = React.useState("");           // Titular
  const [pmPercent, setPmPercent] = React.useState<number>(30);

  React.useEffect(() => {
    (async () => {
      setPmLoading(true);
      try {
        const s = await adminGetMobilePay(); // {enabled, bank_code, phone, id_number, account_name, deposit_percent}
        setPmEnabled(!!s.enabled);
        setPmBank(s.bank_code || "");
        setPmPhone(s.phone || "");
        setPmIdn(s.id_number || "");
        setPmName(s.account_name || "");
        setPmPercent(s.deposit_percent ?? 30);
      } catch {
        // no-op
      } finally {
        setPmLoading(false);
      }
    })();
  }, []);

  async function onSaveMobile(e: React.FormEvent) {
    e.preventDefault();
    setPmSaving(true);
    try {
      await adminSaveMobilePay({
        enabled: pmEnabled,
        bank_code: pmBank.trim() || undefined,
        phone: pmPhone.trim() || undefined,
        id_number: pmIdn.trim() || undefined,
        account_name: pmName.trim() || undefined,
        deposit_percent: pmPercent,
      });
      alert("Pago Móvil guardado");
    } catch (err: any) {
      alert(`No se pudo guardar Pago Móvil: ${err?.message || "error"}`);
    } finally {
      setPmSaving(false);
    }
  }

  // ===== Render =====
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-semibold mb-2">Información de la cuenta</h1>

      {/* === Tarjeta combinada de Perfil === */}
      <div className="rounded-2xl bg-white mb-4">
        {/* Header / Avatar */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center text-lg font-semibold text-gray-700 select-none">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="avatar"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                ) : (
                  initials
                )}
              </div>

              {/* Botón lápiz (input file oculto) */}
              <label className="absolute right-0 bottom-0 grid h-7 w-7 place-items-center rounded-full bg-indigo-600 text-white text-xs shadow cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickAvatar}
                  disabled={fileBusy}
                />
                {fileBusy ? "…" : "✎"}
              </label>
            </div>

            <div>
              <div className="text-sm text-gray-500">Cuenta</div>
              <div className="text-lg font-semibold">{name || email || "—"}</div>
            </div>
          </div>
        </div>

        {/* Body: formularios */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Perfil (name/email) */}
          <form onSubmit={onSaveProfile} className="space-y-4">
            <h3 className="font-semibold">Información básica</h3>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="(opcional)"
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {/* cuando haya endpoint para nombre, lo guardamos junto al email */}
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2 cursor-pointer rounded-lg btnx btn-burst btn-brand hover:scale(0,8) text-white disabled:opacity-50"
                disabled={savingProfile}
              >
                {savingProfile ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>

          {/* Cambiar contraseña */}
          <form onSubmit={onSavePassword} className="space-y-4">
            <h3 className="font-semibold">Cambiar contraseña</h3>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Contraseña actual</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Nueva contraseña</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Confirmar</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="px-4 py-2 cursor-pointer btn-brand rounded-lg btnx btn-burst bg-secondary text-white disabled:opacity-50"
                disabled={savingPass}
              >
                <span className="">
                  {savingPass ? "Guardando…" : "Actualizar contraseña"}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* === Integraciones === */}
      <h1 className="text-xl font-semibold mb-2">Integraciones</h1>

      {/* Google Calendar */}
      <div className="rounded-2xl bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Google Calendar</h3>
          {gLoading && <span className="text-sm text-gray-500">Cargando…</span>}
        </div>

        {!gConnected ? (
          <div className="mt-4">
            <p className="text-sm text-gray-600 mb-3">
              Conecta tu cuenta de Google para sincronizar eventos automáticamente.
            </p>
            <button
              className="px-4 py-2 rounded-lg bg-green-600 text-white cursor-pointer"
              onClick={onGoogleConnect}
            >
              Conectar con Google
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Calendario</label>
                <select
                  className="w-full rounded-xl border px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                  value={gCalendarId}
                  onChange={(e) => setGCalendarId(e.target.value)}
                >
                  {gCalendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary} {c.primary ? "(principal)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={gSyncEnabled}
                    onChange={(e) => setGSyncEnabled(e.target.checked)}
                  />
                  <span>Sincronización automática</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                className="px-4 py-2 rounded-lg btnx btn-burst cursor-pointer text-white disabled:opacity-50"
                onClick={onGoogleSave}
                disabled={gSaving}
              >
                {gSaving ? "Guardando…" : "Guardar preferencias"}
              </button>

              <button
                className="px-4 py-2 rounded-lg cursor-pointer border"
                onClick={onGoogleDisconnect}
              >
                Desconectar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Pago Móvil */}
      <div className="rounded-2xl bg-white p-6 mt-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Pago Móvil (Venezuela)</h3>
          {pmLoading && <span className="text-sm text-gray-500">Cargando…</span>}
        </div>

        <form onSubmit={onSaveMobile} className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={pmEnabled}
              onChange={(e) => setPmEnabled(e.target.checked)}
            />
            <span>Habilitar depósito por Pago Móvil</span>
          </label>
          <div />

          <div>
            <label className="block text-sm text-gray-600 mb-1">Banco (código)</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Ej: 0114"
              value={pmBank}
              onChange={(e) => setPmBank(e.target.value)}
            />
            <p className="text-[11px] text-gray-500 mt-1">Ejemplos: 0114 (Bancaribe), 0134 (Banesco)…</p>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Teléfono</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Ej: 0412-5526681"
              value={pmPhone}
              onChange={(e) => setPmPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Cédula/RIF</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Ej: V-12345678 / J-123456789"
              value={pmIdn}
              onChange={(e) => setPmIdn(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Titular</label>
            <input
              className="w-full rounded-xl border px-3 py-2"
              placeholder="Nombre del titular"
              value={pmName}
              onChange={(e) => setPmName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">% de abono por defecto</label>
            <input
              type="number"
              min={0}
              max={100}
              className="w-full rounded-xl border px-3 py-2"
              value={pmPercent}
              onChange={(e) => setPmPercent(Number(e.target.value || 30))}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Se usa solo si el tipo de evento no define su propio porcentaje.
            </p>
          </div>

          <div className="md:col-span-2 pt-2">
            <button className="px-4 py-2 rounded-lg btnx btn-burst btn-brand text-white disabled:opacity-50" disabled={pmSaving}>
              {pmSaving ? "Guardando…" : "Guardar Pago Móvil"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
