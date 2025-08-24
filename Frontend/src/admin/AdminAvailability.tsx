import { useEffect, useState } from "react";
import { adminGetAvailability, adminPutAvailability } from "../lib/apiAdmin";

type Range = { start_min:number; end_min:number };
type Day = { weekday:number; ranges: Range[] };

const DAYN = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

function toHHMM(m:number) {
  const h = Math.floor(m/60), mm = m%60;
  return `${String(h).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
}
function fromHHMM(s:string) {
  const [h,m] = s.split(':').map(Number);
  return (h*60 + m);
}

export default function AdminAvailability() {
  const [days, setDays] = useState<Day[]>(() => Array.from({length:7}, (_,i)=>({weekday:i, ranges:[]})));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    (async () => {
      try {
        const res = await adminGetAvailability();
        // normaliza
        const map = new Map<number, Range[]>();
        res.items.forEach((r:any) => {
          const arr = map.get(r.weekday) || [];
          arr.push({ start_min: r.start_min, end_min: r.end_min });
          map.set(r.weekday, arr);
        });
        setDays(Array.from({length:7}, (_,i)=>({ weekday:i, ranges: map.get(i)||[] })));
      } catch (e:any) {
        setErr("No se pudo cargar la disponibilidad");
      }
    })();
  }, []);

  function setRange(idx:number, ridx:number, field:'start_min'|'end_min', value:string) {
    setDays(cur => {
      const copy = structuredClone(cur) as Day[];
      const v = fromHHMM(value);
      (copy[idx].ranges[ridx] as any)[field] = v;
      return copy;
    });
  }

  function addRange(idx:number) {
    setDays(cur => {
      const copy = structuredClone(cur) as Day[];
      copy[idx].ranges.push({ start_min: 9*60, end_min: 12*60 });
      return copy;
    });
  }
  function delRange(idx:number, ridx:number) {
    setDays(cur => {
      const copy = structuredClone(cur) as Day[];
      copy[idx].ranges.splice(ridx,1);
      return copy;
    });
  }

  async function save() {
    setSaving(true); setErr(undefined);
    try {
      // filtra rangos válidos
      const payload = days.map(d => ({
        weekday: d.weekday,
        ranges: d.ranges.filter(r => r.end_min > r.start_min)
      }));
      await adminPutAvailability(payload);
      alert("Disponibilidad guardada");
    } catch (e:any) {
      setErr("Error al guardar");
    } finally { setSaving(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Disponibilidad</h1>
      {err && <div className="alert-error mb-3">{err}</div>}

      <div className="grid gap-3">
        {days.map((d, idx) => (
          <div key={d.weekday} className="card">
            <div className="font-medium mb-2">{DAYN[d.weekday]}</div>
            {d.ranges.map((r, ridx) => (
              <div key={ridx} className="flex items-center gap-2 mb-2">
                <input className="input" type="time" value={toHHMM(r.start_min)} onChange={e=>setRange(idx, ridx, 'start_min', e.target.value)} />
                <span>—</span>
                <input className="input" type="time" value={toHHMM(r.end_min)} onChange={e=>setRange(idx, ridx, 'end_min', e.target.value)} />
                <button className="btn" onClick={()=>delRange(idx, ridx)}>Eliminar</button>
              </div>
            ))}
            <button className="btn" onClick={()=>addRange(idx)}>+ Añadir franja</button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? "Guardando…" : "Guardar disponibilidad"}
        </button>
      </div>
    </div>
  );
}
