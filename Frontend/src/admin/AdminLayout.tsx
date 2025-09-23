import { Outlet, NavLink, Link, useLocation} from "react-router-dom";
import { useState, useMemo, useEffect, useRef } from "react";
import { getThemeColor, setThemeColor } from "../lib/themeColor"; // ajusta ruta
import {setTitle} from "../lib/title";
import {
  CalendarDays, Layers, Clock, PlugZap, LogOut, Menu, X
} from "lucide-react";

import { adminLogout } from "../lib/apiAdmin";
import BookingLinkButton from "../components/CopyButton";

const NAV = [
  { to: "/admin/bookings", icon: CalendarDays, label: "Reservas" },
  { to: "/admin/event-types", icon: Layers, label: "Tipos de evento" },
  { to: "/admin/availability", icon: Clock, label: "Disponibilidad" },
  { to: "/admin/integrations", icon: PlugZap, label: "Ajustes" },
];
// pill helper
function NavItem({ to, icon: Icon, label }: any) {
  useEffect(() => {
    setTitle("Dapp: Dashboard");
  }, []);
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex   items-center justify-center gap-3 px-3 lg:px-0 py-2 rounded-xl text-sm ${
          isActive ? "bg-white/15 text-white" : "text-white/80 hover:text-white"
        }`
      }
    >
      <Icon size={18} className={'hover:bg-white/10 pill '} /> <span className="hidden lg:hidden">{label}</span>
    </NavLink>
  );
}

export default function AdminLayout() {


  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const prevColor = useRef<string | null>(null);

  useEffect(() => {
    // color para cuando el menú está abierto (combina con tu backdrop oscuro)
    const OPEN_COLOR = '#000'; // puedes poner el que combine con tu overlay

    if (open) {
      if (!prevColor.current) prevColor.current = getThemeColor();
      setThemeColor(OPEN_COLOR);
    } else if (prevColor.current) {
      setThemeColor(prevColor.current);
      prevColor.current = null;
    }
  }, [open]);
  const title = useMemo(() => {
    const item = NAV.find(n => loc.pathname.startsWith(n.to));
    return item ? item.label : "Panel";
  }, [loc.pathname]);

  return (
    <div className="min-h-screen">
      {/* GRID principal: sidebar | contenido | right-rail */}
      <div className="grid h-[100dvh] overflow-hidden grid-cols-1 lg:grid-cols-[84px_minmax(0,1fr)]">

        {/* SIDEBAR (desk) */}
        <aside className="hidden lg:flex h-full sticky top-0 bg-gradient-to-b from-[#1a2c8c] via-[#192a7a] to-[#101a58] text-white px-3 py-4 overflow-y-auto">
          <div className="flex flex-col w-full items-center gap-3">
            {/* logo */}
            <Link to="/admin/bookings" className="mb-4 mt-1">
              <div className="w-10 h-10 rounded-xl bg-white/10 grid place-items-center font-semibold">MA</div>
            </Link>

            {/* nav vertical (solo iconos en lg, texto en xl) */}
            <nav className="flex-1 w-full grid gap-2">
              {NAV.map(n => (
                <NavItem key={n.to} {...n} />
              ))}
            </nav>

            <button className="icon-btn mb-2" onClick={() => { adminLogout(); window.location.href = "/admin/login"; }}>
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* SIDEBAR (mobile drawer) */}
        <div className={open&&"bg-indigo-500"|| "lg:hidden"}>
          <div className="sticky top-0 z-30  shadow-soft px-3 py-2 flex items-center justify-between">
            <button className="btn bg-transparent" onClick={() => setOpen(v => !v)}>
              {open ? <X size={18}/> : <Menu size={18}/>}
            </button>
            <div className={open ? "text-white":"font-semibold text-black"}>{title}</div>
            <div className="w-9" />
          </div>
          {open && (
            <div className="px-3 py-2 pb-5 border-b-5 border-b-indigo-500 text-white">
              <nav className="grid gap-2">
                {NAV.map(n => (
                  <NavLink key={n.to} to={n.to} onClick={()=>setOpen(false)}
                    className={({isActive}) =>
                      `px-3 py-3 rounded-xl ${isActive ? "bg-white/15" : "hover:bg-white/10"}`
                    }>
                    {n.label}
                  </NavLink>
                ))}
                <button
                  className="mt-2 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-left"
                  onClick={() => { adminLogout(); window.location.href = "/admin/login"; }}
                >Salir</button>
              </nav>
            </div>
          )}
        </div>

        {/* CONTENIDO */}
        <main className="h-full w-full overflow-y-auto px-4 py-6 lg:px-8">
          {/* Header contenido */}
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="hidden lg:block text-xs text-slate-500">Hoy</div>
              <h1 className="hidden lg:block text-2xl font-semibold">{title}</h1>
            </div>
            <div className="hidden md:flex items-center gap-2">
            <BookingLinkButton />
            </div>
          </div>

          {/* Slot del enrutador */}
          <div className="grid gap-6">
            <Outlet />
          </div>
        </main>

       

      </div>
    </div>
  );
}