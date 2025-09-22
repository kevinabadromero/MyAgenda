// src/lib/title.ts
export function setTitle(title: string) {
    if (typeof document !== "undefined") document.title = title;
  }
  
  // fallback por si falla la API: capitaliza y reemplaza guiones
  export function prettifySlug(slug: string) {
    if (!slug) return "Dapp";
    const s = slug.replace(/[-_]+/g, " ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }