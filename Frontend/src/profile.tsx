import { createContext, useContext, useEffect, useState } from "react";
import type { OwnerProfile } from "./types";
import { getProfile } from "./lib/api";

type State = { loading: boolean; profile?: OwnerProfile; error?: string };
const Ctx = createContext<State>({ loading: true });

function applyBranding(p?: OwnerProfile) {
  if (!p) return;
  document.title = p.name || "MyAgenda";
  document.querySelectorAll('link[rel="icon"].brand-dyn').forEach(n => n.remove());
  const link = document.createElement('link');
  link.rel = 'icon'; link.href = p.favicon; link.className = 'brand-dyn';
  document.head.appendChild(link);
  if (p.theme?.bg) document.documentElement.style.setProperty('--bg', p.theme.bg);
  if (p.theme?.fg) document.documentElement.style.setProperty('--fg', p.theme.fg);
  if (p.theme?.primary) document.documentElement.style.setProperty('--primary', p.theme.primary);
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ loading: true });
  useEffect(() => {
    getProfile()
      .then(p => { applyBranding(p); setState({ loading:false, profile:p }); })
      .catch(e => setState({ loading:false, error:String(e) }));
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
export const useProfile = () => useContext(Ctx);