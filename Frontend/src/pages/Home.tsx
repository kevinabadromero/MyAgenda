// src/pages/Home.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useProfile } from "../profile";
import { listEventTypes } from "../lib/api";
import type { EventType } from "../types";

export default function Home(){
  const { loading, profile, error } = useProfile();
  const [items, setItems] = useState<EventType[]>([]);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    if (!loading && profile)
      listEventTypes().then(r => setItems(r.items)).catch(e => setErr(String(e)));
  }, [loading, profile]);

  if (loading) return <div className="p-6">Cargando…</div>;
  if (error || err) return <div className="p-6 text-red-600">No disponible: {(error||err)?.toString()}</div>;

  return (
    <div className="mx-auto max-w-2xl p-6">
      <header className="mb-6 flex items-center gap-3">
        {profile?.logo && <img src={profile.logo} alt="" style={{height:36}}/>}
        <h1 className="text-2xl font-semibold">{profile?.name}</h1>
      </header>

      <h2 className="text-lg font-semibold mb-3">Tipos de evento</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map(et => (
          <Link key={et.id} to={`/book/${et.slug}`} className="block border rounded-lg p-4 hover:shadow">
            <div className="font-medium">{et.name}</div>
            <div className="text-sm text-gray-600">{et.durationMin} min</div>
            {et.description && <div className="text-sm text-gray-600 mt-1">{et.description}</div>}
          </Link>
        ))}
      </div>
      {items.length===0 && <div className="text-gray-500">Aún no hay tipos de evento.</div>}
    </div>
  );
}