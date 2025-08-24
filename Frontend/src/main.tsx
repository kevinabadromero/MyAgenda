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
import NotFound from "./pages/NotFound";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("ma_token");
  if (!token) {
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
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <AdminBookings /> },         
      { path: "bookings", element: <AdminBookings /> },
      { path: "event-types", element: <AdminEventTypes /> },
      { path: "availability", element: <AdminAvailability /> },
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