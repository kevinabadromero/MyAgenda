import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import { ProfileProvider } from "./profile";

import Booking from "./pages/Booking";
import Success from "./pages/Success";

import AdminLogin from "./admin/AdminLogin";
import AdminBookings from "./admin/AdminBookings";
import AdminLayout from "./admin/AdminLayout";
import AdminEventTypes from "./admin/AdminEventTypes";
import AdminAvailability from "./admin/AdminAvailability";
import AdminIntegrations from "./admin/AdminIntegrations";
import NotFound from "./pages/NotFound";

function RequireAuth({ children }: { children: React.ReactNode }) {
  // 1) migración (una vez) del token viejo
  const old = localStorage.getItem("ma_token");
  if (old && !localStorage.getItem("access_token")) {
    localStorage.setItem("access_token", old);
    localStorage.removeItem("ma_token");
  }

  const [ok, setOk] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const access = localStorage.getItem("access_token");
    if (access) {
      setOk(true);
      return;
    }

    // 2) refresh silencioso si no hay access
    fetch((import.meta as any).env?.VITE_API_BASE ?? "https://api.dappointment.com" + "/admin/refresh", {
      method: "POST",
      credentials: "include",
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.token) {
          localStorage.setItem("access_token", data.token);
          setOk(true);
        } else {
          setOk(false);
        }
      })
      .catch(() => setOk(false));
  }, []);

  if (ok === null) return null; // puedes poner un spinner aquí
  if (!ok) {
    window.location.href = "/admin/login";
    return null;
  }
  return <>{children}</>;
}

const router = createBrowserRouter([
  { path: "/", element: <Booking /> },
  { path: "/book/:eventType?", element: <Booking /> },
  { path: "/success/:id", element: <Success /> },

  { path: "/admin/login", element: <AdminLogin /> },
  {
    path: "/admin",
    element: <RequireAuth><AdminLayout /></RequireAuth>,
    children: [
      { index: true, element: <AdminBookings /> },
      { path: "bookings", element: <AdminBookings /> },
      { path: "bookings/new", element: <AdminBookings /> },
      { path: "event-types", element: <AdminEventTypes /> },
      { path: "availability", element: <AdminAvailability /> },
      { path: "integrations", element: <AdminIntegrations /> },  // ← nueva
    ],
  },

  { path: "*", element: <NotFound /> },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProfileProvider>
      <RouterProvider router={router} />
    </ProfileProvider>
  </React.StrictMode>
);