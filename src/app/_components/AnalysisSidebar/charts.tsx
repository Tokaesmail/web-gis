import React from "react";

export function DonutChart({ value, total, color, bg }: { value: number; total: number; color: string; bg: string }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const pct = value / total;
  const dash = pct * circ;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke={bg} strokeWidth="12" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="12"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 50 50)" />
      <text x="50" y="54" textAnchor="middle" fontSize="13" fontWeight="600" fill="white">
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

function BarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(...data.map((d) => d.value));
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="text-[0.6rem] text-slate-500 w-16 shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-3 bg-white/[0.05] rounded-sm overflow-hidden">
            <div
              className="h-full rounded-sm transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
          <span className="text-[0.6rem] text-slate-400 w-8 text-right shrink-0">
            {d.value > 1000 ? `${(d.value / 1000).toFixed(1)}k` : d.value}
          </span>
        </div>
      ))}
    </div>
  );
}


function StackedBarChart({ data }: { data: { label: string; a: number; b: number }[] }) {
  const max = Math.max(...data.map((d) => d.a + d.b));
  return (
    <div className="space-y-1.5">
      {data.map((d) => {
        const total = d.a + d.b;
        const pctA = (d.a / max) * 100;
        const pctB = (d.b / max) * 100;
        return (
          <div key={d.label} className="flex items-center gap-2">
            <span className="text-[0.6rem] text-slate-500 w-16 shrink-0 truncate">{d.label}</span>
            <div className="flex-1 h-3 bg-white/[0.05] rounded-sm overflow-hidden flex">
              <div className="h-full transition-all duration-500" style={{ width: `${pctA}%`, background: "#6d28d9" }} />
              <div className="h-full transition-all duration-500" style={{ width: `${pctB}%`, background: "#f97316" }} />
            </div>
            <span className="text-[0.6rem] text-slate-400 w-10 text-right shrink-0">
              {total > 1000 ? `${(total / 1000).toFixed(0)}k` : total}
            </span>
          </div>
        );
      })}
    </div>
  );
}



