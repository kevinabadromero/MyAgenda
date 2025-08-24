import { useEffect, useState } from "react";
import { adminListEventTypes, adminCreateEventType, adminDeleteEventType, adminUpdateEventType } from "../lib/apiAdmin";

type Item = { id:string; slug:string; name:string; description?:string|null; duration_min?:number; durationMin?:number; buffer_min?:number; bufferMin?:number; is_active?:0|1|boolean };

export default function AdminEventTypes() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>();

  const [form, setForm] = useState({ slug:"", name:"", description:"", durationMin:30, bufferMin:0 });

  async function load() {
    setLoading(true); setErr(undefined);
    try {
      const { items } = await adminListEventTypes();
      setItems(items as any);
    } catch (e:any) {
      setErr("No se pudieron cargar los tipos de evento");
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await adminCreateEventType({
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description || null,
        durationMin: Number(form.durationMin),
        bufferMin: Number(form.bufferMin) || 0,
      });
      setForm({ slug:"", name:"", description:"", durationMin:30, bufferMin:0 });
      await load();
    } catch (e:any) {
      alert("Error al crear tipo de evento.");
    }
  }

  async function onDelete(id: string) {
    if (!confirm("¿Eliminar este tipo de evento?")) return;
    try { await adminDeleteEventType(id); await load(); }
    catch { alert("No se pudo eliminar."); }
  }

  async function toggleActive(it: Item) {
    try {
      await adminUpdateEventType(it.id, { isActive: !(it.is_active ? it.is_active : false) });
      await load();
    } catch { alert("No se pudo actualizar."); }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Tipos de evento</h1>
      <form onSubmit={onCreate} className="card mb-6 grid gap-3">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="label">Slug</label>
            <input className="input w-full" value={form.slug} onChange={e=>setForm({...form, slug:e.target.value})} placeholder="consulta-30" />
          </div>
          <div>
            <label className="label">Nombre</label>
            <input className="input w-full" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Consulta (30 min)" />
          </div>
          <div>
            <label className="label">Duración (min)</label>
            <input className="input w-full" type="number" min={5} max={480} value={form.durationMin} onChange={e=>setForm({...form, durationMin:+e.target.value})} />
          </div>
          <div>
            <label className="label">Buffer (min)</label>
            <input className="input w-full" type="number" min={0} max={240} value={form.bufferMin} onChange={e=>setForm({...form, bufferMin:+e.target.value})} />
          </div>
        </div>
        <div>
          <label className="label">Descripción</label>
          <input className="input w-full" value={form.description} onChange={e=>setForm({...form, description:e.target.value})} />
        </div>
        <div>
          <button className="btn btn-primary">Crear</button>
        </div>
      </form>

      {loading && <div>Cargando…</div>}
      {err && <div className="alert-error">{err}</div>}

      {!loading && !err && (
        <div className="grid gap-2">
          {items.map(it => (
            <div key={it.id} className="card flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{it.name} <span className="text-gray-600">({it.slug})</span></div>
                <div className="text-sm text-gray-600">{it.description || "—"} · {it.durationMin ?? it.duration_min} min · buf {it.bufferMin ?? it.buffer_min} min</div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn" onClick={() => toggleActive(it)}>{(it.is_active ? it.is_active : false) ? "Desactivar" : "Activar"}</button>
                <button className="btn" onClick={() => onDelete(it.id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
