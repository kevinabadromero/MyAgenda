import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { adminLogout } from "../lib/apiAdmin";

export default function AdminLayout() {
  const loc = useLocation();
  const nav = useNavigate();
  const active = (p: string) => (loc.pathname.startsWith(p) ? "font-semibold" : "text-gray-600");

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 p-4 border-r bg-white">
        <h2 className="text-xl mb-4">Admin</h2>
        <nav className="grid gap-2 text-sm">
            <Link className={active("/admin/bookings")} to="/admin/bookings">Reservas</Link>
            <Link className={active("/admin/event-types")} to="/admin/event-types">Tipos de evento</Link>
            <Link className={active("/admin/availability")} to="/admin/availability">Disponibilidad</Link>
            <button className="btn mt-4" onClick={() => { adminLogout(); nav("/admin/login"); }}>Salir</button>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}