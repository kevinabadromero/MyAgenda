import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminLogin } from "../lib/apiAdmin";

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [u, setU] = useState(""); // opcional (slug/tenant), deja vacío si no lo usas
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    setLoading(true);
    try {
      await adminLogin({ email: email.trim(), password: pass });
      // Con token guardado, pasamos al dashboard
      nav("/admin/bookings");
    } catch (e: any) {
      setErr("Credenciales inválidas o host incorrecto.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold mb-3">Dappointment Admin</h1>
      <form onSubmit={onSubmit} className="card">
        <div className="mb-3">
          <label className="label">Email</label>
          <input
            className="input w-full"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@cliente.com"
            required
          />
        </div>

        <div className="mb-3">
          <label className="label">Contraseña</label>
          <input
            className="input w-full"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {err && <div className="alert-error mb-3">{err}</div>}
        <button className="btn btn-primary" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
