import { useMemo } from "react";

type EventItem = {
  id: string;
  title: string;
  color?: string;     // opcional, p.ej. por tipo
  startsAt: string;   // ISO UTC
  endsAt: string;     // ISO UTC
};

export const startOfMonth = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const endOfMonth = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0, 23,59,59,999));

const ymdUTC = (d: Date) => {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

/** 6 filas x 7 columnas empezando en Lunes */
function buildCells(anchor: Date) {
  const first = startOfMonth(anchor);
  const w = (first.getUTCDay() + 6) % 7; // 0..6 (0=Lun)
  const startGrid = new Date(first.getTime() - w*86400000);
  const cells: Date[] = [];
  for (let i=0;i<42;i++) cells.push(new Date(startGrid.getTime() + i*86400000));
  return cells;
}

export default function MonthCalendar({
  month,                // Date dentro del mes a mostrar (UTC)
  eventsByDay,          // Map<YYYY-MM-DD, EventItem[]>
  onSelectDay,
  selectedDayYMD
}: {
  month: Date;
  eventsByDay: Map<string, EventItem[]>;
  onSelectDay?: (ymd: string) => void;
  selectedDayYMD?: string | null;
}) {
  const cells = useMemo(() => buildCells(month), [month]);
  const monthIdx = month.getUTCMonth();
  const monthName = month.toLocaleString("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold capitalize">{monthName}</div>
      </div>

      <div className="grid grid-cols-7 text-xs text-slate-500 mb-2">
        {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const ymd = ymdUTC(d);
          const items = eventsByDay.get(ymd) || [];
          const isOtherMonth = d.getUTCMonth() !== monthIdx;
          const isSelected = selectedDayYMD === ymd;
          return (
            <button
              key={ymd}
              onClick={() => onSelectDay?.(ymd)}
              className={`rounded-xl p-2 text-left min-h-[88px] transition ${
                isSelected ? "ring-4 ring-brand-200 bg-white" : "bg-white hover:shadow-[0_10px_30px_rgba(2,6,23,.08)]"
              } ${isOtherMonth ? "opacity-40" : ""}`}
            >
              <div className="text-xs font-medium mb-1">{d.getUTCDate()}</div>
              <div className="space-y-1">
                {items.slice(0,3).map(ev => (
                  <div key={ev.id} className="h-1.5 rounded-full" style={{ background: ev.color || "#4f46e5" }} />
                ))}
                {items.length > 3 && (
                  <div className="text-[10px] text-slate-500">+{items.length-3} más</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}