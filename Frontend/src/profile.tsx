// src/profile.tsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getProfile } from "./lib/api";

type Profile = {
  id:string; slug:string; name:string;
  timezone:string;                 // ← NUEVO
  favicon:string|null; logo:string|null;
  theme:{ primary:string; bg:string; fg:string };
};

const Ctx = createContext<{profile:Profile|null, loading:boolean, error?:string} | null>(null);

function setFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile|null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState<string>();

  useEffect(() => {
    (async () => {
      try {
        const p = await getProfile();
        setProfile(p as any);
        document.title = p.name || "MyAgenda";
        if (p.favicon) setFavicon(p.favicon);
        document.documentElement.style.setProperty("--primary", p.theme?.primary || "#2563EB");
        document.body.style.background = p.theme?.bg || "#fff";
        document.body.style.color = p.theme?.fg || "#111";
      } catch (e:any) {
        setErr(e?.message || "profile_error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const value = useMemo(() => ({ profile, loading, error }), [profile, loading, error]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useProfile must be inside ProfileProvider");
  return ctx;
}
