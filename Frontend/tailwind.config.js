/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html","./src/**/*.{ts,tsx,js,jsx}"],
    theme: {
      extend: {
        colors: {
          brand: {
            50:  "#eef2ff",
            100: "#e0e7ff",
            200: "#c7d2fe",
            500: "#635bff", // acento principal (botones/focos)
            600: "#4f46e5",
            700: "#4338ca",
          },
          accent: "#ff02ff",
          accent2: "#ff7a45",
          primary: "#8207c9",
          secondary: "#7143e1",
          text: "#221952",
          ink: "#0f172a",     // textos oscuros
          panel: "#ffffff",   // paneles
          surface: "#f6f7fb",     // fondo app
        },
        borderRadius: { '2xl': '1rem' },
        boxShadow: {
          soft: "0 10px 30px rgba(2,6,23,.08)",
          ring: "0 0 0 3px rgba(99,91,255,.25)"
        }
      }
    },
    plugins: [],
  };