import { useEffect, useMemo, useState } from "react";
import {
  adminListEventTypes, adminCreateEventType, adminUpdateEventType, adminDeleteEventType,
  type EventTypeAdmin
} from "../lib/apiAdmin";
import { Pencil, Trash2 } from "lucide-react";
type Form = {
  name: string;
  slug?: string;
  durationMin: number;
  bufferMin: number;
  colorHex: string;
  isActive: boolean;
};

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
   .toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

export default function AdminEventTypes() {
  const [list, setList] = useState<EventTypeAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{mode:'create'|'edit', id?:string}|null>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await adminListEventTypes();
      setList(r.items);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const current = useMemo(() =>
    modal?.mode === 'edit' ? list.find(x => x.id === modal.id) || null : null
  , [modal, list]);

  return (
    <div className="grid gap-4">
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">Todos los eventos</div>
          <button className="btn btn-primary" onClick={()=>setModal({mode:'create'})}>Nuevo</button>
        </div>

        {loading ? (
          <div className="text-slate-500">Cargando…</div>
        ) : list.length === 0 ? (
          <div className="text-slate-500">Aún no tienes tipos de evento.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="hidden lg:table-cell py-2">Color</th>
                  <th className="lg:hidden px-2 py-2">#</th>
                  <th className="py-2">Nombre</th>
                  {/* oculto en móvil, visible en desktop */}
                  <th className="py-2 hidden lg:table-cell">Slug</th>
                  <th className="py-2">Duración</th>
                  {/* oculto en móvil, visible en desktop */}
                  <th className="py-2 hidden lg:table-cell">Buffer</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2"></th>
                </tr>
              </thead>

              <tbody>
                {list.map(et => (
                  <tr key={et.id} className="border-t border-slate-100">
                    <td className="py-2">
                      <span
                        className="inline-block w-4 h-4 rounded"
                        style={{ background: et.colorHex }}
                      />
                    </td>

                    <td className="py-2">{et.name}</td>

                    {/* Slug: oculto en móvil */}
                    <td className="py-2 text-slate-500 hidden lg:table-cell">
                      {et.slug}
                    </td>

                    <td className="py-2">{et.durationMin} min</td>

                    {/* Buffer: oculto en móvil */}
                    <td className="py-2 hidden lg:table-cell">
                      {et.bufferMin} min
                    </td>

                    {/* Estado: punto en móvil, texto en desktop */}
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${
                            et.isActive ? "bg-emerald-500" : "bg-rose-500"
                          }`}
                          aria-label={et.isActive ? "Activo" : "Inactivo"}
                          title={et.isActive ? "Activo" : "Inactivo"}
                        />
                        <span className="hidden lg:inline">
                          {et.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </div>
                    </td>

                    {/* Acciones: iconos en móvil, texto en desktop */}
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          className="btn"
                          onClick={() => setModal({ mode: "edit", id: et.id })}
                          aria-label="Editar"
                          title="Editar"
                        >
                          <Pencil size={16} className="lg:mr-1" />
                          <span className="hidden lg:inline">Editar</span>
                        </button>

                        <button
                          className="btn btn-ghost"
                          onClick={async () => {
                            if (!confirm("¿Eliminar este tipo?")) return;
                            await adminDeleteEventType(et.id);
                            load();
                          }}
                          aria-label="Eliminar"
                          title="Eliminar"
                        >
                          <Trash2 size={16} className="lg:mr-1" />
                          <span className="hidden lg:inline">Eliminar</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>
        )}
      </div>

      {modal && (
        <EventTypeModal
          mode={modal.mode}
          initial={modal.mode==='edit' && current ? {
            name: current.name, slug: current.slug,
            durationMin: current.durationMin, bufferMin: current.bufferMin,
            colorHex: current.colorHex, isActive: current.isActive
          } : {
            name: '', slug: '',
            durationMin: 30, bufferMin: 0,
            colorHex: '#4f46e5', isActive: true
          }}
          onClose={()=>setModal(null)}
          onSave={async (values) => {
            if (modal.mode === 'create') {
              await adminCreateEventType(values as any);
            } else if (modal.mode === 'edit' && modal.id) {
              await adminUpdateEventType(modal.id, values as any);
            }
            setModal(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EventTypeModal({
  mode, initial, onClose, onSave
}:{
  mode: 'create'|'edit';
  initial: Form;
  onClose: ()=>void;
  onSave: (values: Form)=>Promise<void>;
}) {
  const [v, setV] = useState<Form>(initial);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => setV(initial), [initial]);

  function set<K extends keyof Form>(k: K, val: Form[K]) { setV(prev => ({ ...prev, [k]: val })); }

  // autogenerar slug desde nombre si el usuario no lo tocó manualmente
  useEffect(() => {
    if (!initial.slug && !v.slug) setV(prev => ({ ...prev, slug: slugify(v.name) }));
  }, [v.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(undefined);
    if (!v.name.trim()) return setErr("Nombre requerido");
    const dd = Number(v.durationMin), bb = Number(v.bufferMin);
    if (!/^#[0-9a-fA-F]{6}$/.test(v.colorHex)) return setErr("Color inválido (usa #RRGGBB)");
    if (dd < 5) return setErr("Duración mínima 5 min");
    if (bb < 0) return setErr("Buffer inválido");

    setBusy(true);
    try { await onSave({ ...v, durationMin: dd, bufferMin: bb }); }
    catch { setErr("No se pudo guardar"); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/30 grid place-items-center p-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl card">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-semibold">
            {mode === 'create' ? 'Nuevo tipo de evento' : 'Editar tipo de evento'}
          </div>
          <button className="btn" onClick={onClose}>Cerrar</button>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={v.name} onChange={e=>set('name', e.target.value)} />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input" value={v.slug} onChange={e=>set('slug', e.target.value)} />
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="label">Duración (min)</label>
              <input className="input" type="number" min={5} step={5}
                     value={v.durationMin} onChange={e=>set('durationMin', Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Buffer (min)</label>
              <input className="input" type="number" min={0} step={5}
                     value={v.bufferMin} onChange={e=>set('bufferMin', Number(e.target.value))}/>
            </div>
            <div>
              <label className="label">Color</label>
              <div className="flex items-center gap-2">
                <input className="h-10 w-16 rounded border border-slate-200" type="color"
                       value={v.colorHex} onChange={e=>set('colorHex', e.target.value)}/>
                <input className="input" value={v.colorHex} onChange={e=>set('colorHex', e.target.value)}/>
                <span className="inline-block w-6 h-6 rounded" style={{background: v.colorHex}} />
              </div>
            </div>
          </div>

          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={v.isActive} onChange={e=>set('isActive', e.target.checked)} />
            Activo
          </label>

          {err && <div className="text-red-600 text-sm">{err}</div>}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
