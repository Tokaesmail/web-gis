"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useLang } from "../translations";
import JSONUploadModal from "./DataManagerPanel";
import { useMapDB } from "../../map/useMapDB";

type PanelId =
  | "ndvi"
  | "weather"
  | "overview"
  | "vra"
  | "activity"
  | "fieldManager"
  | "notifications"
  | "settings"
  | "analyses"
  | "layers"
  | "captures";

interface PanelItem {
  id: PanelId;
  labelEn: string;
  labelAr: string;
  icon: React.ReactNode;
  badge?: string;
}

const panels: PanelItem[] = [
  {
    id: "captures",
    labelEn: "Captures",
    labelAr: "اللقطات",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    id: "layers",
    labelEn: "Layers",
    labelAr: "الطبقات",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.27a1 1 0 0 0 0 1.83l8.57 4.09a2 2 0 0 0 1.66 0l8.57-4.09a1 1 0 0 0 0-1.83Z" />
        <path d="m22 17.64-8.57 4.09a2 2 0 0 1-1.66 0L2 17.64" />
        <path d="m22 12.64-8.57 4.09a2 2 0 0 1-1.66 0L2 12.64" />
      </svg>
    ),
  },
  {
    id: "analyses",
    labelEn: "Analyses",
    labelAr: "التحليلات",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        <path d="M11 8v6M8 11h6"/>
      </svg>
    ),
    badge: "7",
  },
  {
    id: "ndvi",
    labelEn: "Charts",
    labelAr: "Charts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
    badge: "NEW",
  },
  {
    id: "overview",
    labelEn: "Overview",
    labelAr: "نظرة عامة",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: "weather",
    labelEn: "Weather",
    labelAr: "الطقس",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      </svg>
    ),
  },
  {
    id: "vra",
    labelEn: "VRA Maps",
    labelAr: "خرائط VRA",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
        <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
      </svg>
    ),
  },
  {
    id: "activity",
    labelEn: "Field Activity",
    labelAr: "نشاط الحقل",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    id: "fieldManager",
    labelEn: "Field Manager",
    labelAr: "مدير الحقول",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "notifications",
    labelEn: "Notifications",
    labelAr: "الإشعارات",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
    badge: "5",
  },
  {
    id: "settings",
    labelEn: "Settings",
    labelAr: "الإعدادات",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

// ─── Donut Chart SVG ──────────────────────────────────────────────────────────
function DonutChart({ value, total, color, bg }: { value: number; total: number; color: string; bg: string }) {
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

// ─── Bar Chart ────────────────────────────────────────────────────────────────
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

// ─── Stacked Bar Chart ────────────────────────────────────────────────────────

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


// ─── NDVI Live Panel (data from selected feature coords) ──────────────────────
function NDVILivePanel({ feature }: { feature?: GeoJSON.Feature | null }) {
  const [ndviData, setNdviData] = useState<any>(null);
  const [loading,  setLoading]  = useState(false);

  // derive midpoint coords from geometry
  const coords: [number, number] | null = (() => {
    if (!feature?.geometry) return null;
    const g = feature.geometry as any;
    if (g.type === "LineString" && g.coordinates?.length) {
      const m = g.coordinates[Math.floor(g.coordinates.length / 2)];
      return [m[1], m[0]];
    }
    if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
    return null;
  })();

  useEffect(() => {
    if (!coords) return;
    setLoading(true);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}` +
      `&daily=et0_fao_evapotranspiration,shortwave_radiation_sum,precipitation_sum` +
      `&hourly=soil_moisture_0_to_1cm,soil_temperature_0cm&timezone=auto&past_days=30&forecast_days=1`
    )
      .then(r => r.json())
      .then(d => {
        const et    = d.daily?.et0_fao_evapotranspiration ?? [];
        const rad   = d.daily?.shortwave_radiation_sum    ?? [];
        const prec  = d.daily?.precipitation_sum          ?? [];
        const times = d.daily?.time                       ?? [];
        const series = et.map((e: number, i: number) => {
          const r   = rad[i] ?? 1;
          const val = r > 0 ? Math.min(0.95, Math.max(0.05, (e / r) * 3.5)) : 0.3;
          return { label: times[i] ? new Date(times[i]).toLocaleDateString("en", { month: "short", day: "numeric" }) : "", value: parseFloat(val.toFixed(3)), precip: prec[i] ?? 0 };
        }).filter((_: any, i: number) => i % 3 === 0).slice(-10); // sample every 3 days, last 10 points

        const soilM = d.hourly?.soil_moisture_0_to_1cm?.slice(-24) ?? [];
        const soilT = d.hourly?.soil_temperature_0cm?.slice(-24)   ?? [];
        const avgSM = soilM.length ? soilM.reduce((a: number, b: number) => a + b, 0) / soilM.length : null;
        const avgST = soilT.length ? soilT.reduce((a: number, b: number) => a + b, 0) / soilT.length : null;
        const latest = series[series.length - 1]?.value ?? 0;
        const prev   = series[series.length - 4]?.value ?? latest;
        setNdviData({ series, latest, prev, avgSM, avgST });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [coords?.[0], coords?.[1]]);

  // ── No feature selected — show static mock ────────────────────────────────
  if (!feature || !coords) {
    const bars = [
      { label: "23 Dec", value: 0.58 }, { label: "02 Jan", value: 0.61 },
      { label: "12 Jan", value: 0.67 }, { label: "22 Jan", value: 0.70 },
      { label: "01 Feb", value: 0.69 }, { label: "11 Feb", value: 0.72 },
      { label: "16 Feb", value: 0.72 },
    ];
    const maxV = Math.max(...bars.map(b => b.value));
    return (
      <div className="space-y-5">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">Mean NDVI Index</p>
          <p className="text-3xl font-semibold text-emerald-400">0.72</p>
          <p className="text-[0.65rem] text-slate-500 mt-1">↑ 0.04 from last month</p>
          <div className="mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: "72%" }} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[{ label: "Coverage", value: "87%", color: "text-cyan-400" }, { label: "Stressed", value: "13%", color: "text-red-400" }, { label: "Area", value: "27.4 ha", color: "text-slate-200" }, { label: "Confidence", value: "94%", color: "text-violet-400" }].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
              <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between text-[0.6rem] text-slate-500 mb-1"><span>Low</span><span>NDVI Scale</span><span>High</span></div>
          <div className="h-2.5 rounded-full" style={{ background: "linear-gradient(to right,#8B0000,#FF4500,#FFD700,#ADFF2F,#006400)" }} />
        </div>
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-2">30-Day Timeline</p>
          <div className="flex items-end gap-1 h-16">
            {bars.map((b, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group cursor-pointer">
                <div className="relative w-full">
                  <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                    <div className="bg-[#0a1628] border border-white/10 text-[0.6rem] text-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap">{b.value}</div>
                  </div>
                  <div className="w-full rounded-sm group-hover:brightness-125 transition-all"
                    style={{ height: `${(b.value / maxV) * 56}px`, background: b.label === "16 Feb" ? "#22d3ee" : "#22c55e88" }} />
                </div>
                <span className="text-[0.5rem] text-slate-600 whitespace-nowrap overflow-hidden" style={{ maxWidth: 28, textOverflow: "clip" }}>{b.label.slice(0, 6)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Health Distribution</p>
          <div className="flex items-center justify-around">
            {[{ v: 72, c: "#22c55e", bg: "rgba(34,197,94,0.12)", l: "Healthy" }, { v: 13, c: "#ef4444", bg: "rgba(239,68,68,0.12)", l: "Stressed" }, { v: 15, c: "#f59e0b", bg: "rgba(245,158,11,0.12)", l: "Moderate" }].map(d => (
              <div key={d.l} className="flex flex-col items-center gap-1">
                <DonutChart value={d.v} total={100} color={d.c} bg={d.bg} />
                <p className="text-[0.62rem] text-slate-400">{d.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-[0.58rem] text-slate-600 text-center">Click a contour line for live data</p>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {[80, 56, 40, 96].map((w, i) => (
          <div key={i} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 space-y-2">
            <div className="h-2.5 rounded-full bg-white/[0.06] animate-pulse" style={{ width: `${w}%` }} />
            <div className="h-7 rounded-full bg-white/[0.05] animate-pulse w-28" />
            <div className="h-1.5 rounded-full bg-white/[0.04] animate-pulse w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!ndviData) return null;

  const { series, latest, prev, avgSM, avgST } = ndviData;
  const change    = latest - prev;
  const hColor    = latest > 0.6 ? "#22c55e" : latest > 0.4 ? "#f59e0b" : "#ef4444";
  const hLabel    = latest > 0.6 ? "Healthy" : latest > 0.4 ? "Moderate" : "Stressed";
  const maxV      = Math.max(...series.map((s: any) => s.value), 0.01);
  const healthy   = Math.round(latest * 100);
  const stressed  = Math.round((1 - latest) * 30);
  const moderate  = 100 - healthy - stressed;

  // sparkline path for area chart
  const W = 232, H = 48;
  const pts = series.map((s: any, i: number) => [
    (i / (series.length - 1)) * W,
    H - (s.value / maxV) * (H - 4),
  ]);
  const linePath  = pts.map((p: number[], i: number) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath  = linePath + ` L${W},${H} L0,${H} Z`;

  return (
    <div className="space-y-4">
      {/* KPI */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">NDVI Index · Live</p>
        <p className="text-3xl font-semibold" style={{ color: hColor }}>{latest.toFixed(3)}</p>
        <p className="text-[0.65rem] mt-1" style={{ color: change >= 0 ? "#34d399" : "#f87171" }}>
          {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(3)} vs 9 days ago
        </p>
        <div className="mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${latest * 100}%`, background: hColor }} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Coverage",     value: `${healthy}%`,                                      color: "text-cyan-400"   },
          { label: "Stressed",     value: `${stressed}%`,                                      color: "text-red-400"    },
          { label: "Soil Moisture",value: avgSM != null ? `${(avgSM*100).toFixed(1)}%` : "—", color: "text-blue-400"   },
          { label: "Soil Temp",    value: avgST != null ? `${avgST.toFixed(1)}°C`      : "—", color: "text-orange-400" },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
            <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-[0.62rem] text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* NDVI scale */}
      <div>
        <div className="flex justify-between text-[0.6rem] text-slate-500 mb-1"><span>Low</span><span>NDVI Scale</span><span>High</span></div>
        <div className="h-2.5 rounded-full" style={{ background: "linear-gradient(to right,#8B0000,#FF4500,#FFD700,#ADFF2F,#006400)" }} />
        <div className="relative h-2 mt-0.5">
          <div className="absolute w-0.5 h-2 bg-white rounded-full transition-all duration-700" style={{ left: `calc(${latest * 100}% - 1px)` }} />
        </div>
      </div>

      {/* Area Chart */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">30-Day Timeline</p>
        <svg width="100%" viewBox={`0 0 ${W} ${H + 12}`} className="overflow-visible">
          <defs>
            <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={hColor} stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#ndviGrad)" />
          <path d={linePath} fill="none" stroke={hColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p: number[], i: number) => (
            <g key={i} className="group">
              <circle cx={p[0]} cy={p[1]} r="3" fill={i === pts.length - 1 ? "#22d3ee" : hColor} opacity={i === pts.length - 1 ? 1 : 0.6} />
              <title>{series[i].label}: {series[i].value}</title>
            </g>
          ))}
          {series.filter((_: any, i: number) => i % 3 === 0).map((s: any, i: number) => {
            const idx = i * 3;
            if (idx >= pts.length) return null;
            return <text key={i} x={pts[idx][0]} y={H + 10} textAnchor="middle" fontSize="7" fill="#475569">{s.label.slice(0,6)}</text>;
          })}
        </svg>
      </div>

      {/* Donut charts */}
      <div>
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Health Distribution</p>
        <div className="flex items-center justify-around">
          {[
            { v: healthy,  c: "#22c55e", bg: "rgba(34,197,94,0.12)",  l: "Healthy"  },
            { v: stressed, c: "#ef4444", bg: "rgba(239,68,68,0.12)",   l: "Stressed" },
            { v: moderate, c: "#f59e0b", bg: "rgba(245,158,11,0.12)",  l: "Moderate" },
          ].map(d => (
            <div key={d.l} className="flex flex-col items-center gap-1">
              <DonutChart value={d.v} total={100} color={d.c} bg={d.bg} />
              <p className="text-[0.62rem] text-slate-400">{d.l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contour info */}
      {feature.properties?.Contour != null && (
        <div className="bg-white/[0.03] border border-cyan-400/20 rounded-xl p-3 flex items-center gap-3">
          <div className="w-1 h-8 rounded-full shrink-0" style={{ background: hColor }} />
          <div>
            <p className="text-[0.6rem] text-slate-500">Contour Line</p>
            <p className="text-[0.75rem] font-semibold text-slate-200">{feature.properties.Contour}m · Id {feature.properties.Id ?? feature.properties.OBJECTID}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── helper: extract midpoint coords from any GeoJSON geometry ────────────────
function getMidCoords(feature?: GeoJSON.Feature | null): [number, number] | null {
  const g = feature?.geometry as any;
  if (!g?.coordinates) return null;
  try {
    if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
    if (g.type === "LineString" || g.type === "MultiPoint") {
      const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
      return [mid[1], mid[0]];
    }
    if (g.type === "Polygon" || g.type === "MultiLineString") {
      const first = g.coordinates[0];
      const mid = first[Math.floor(first.length / 2)];
      return [mid[1], mid[0]];
    }
    if (g.type === "MultiPolygon") {
      const firstPoly = g.coordinates[0];
      const firstRing = firstPoly[0];
      const mid = firstRing[Math.floor(firstRing.length / 2)];
      return [mid[1], mid[0]];
    }
    // Deep fallback
    const findFirst = (c: any): [number, number] | null => {
      if (Array.isArray(c) && typeof c[0] === "number") return [c[1], c[0]];
      if (Array.isArray(c)) {
        for (const sub of c) {
          const res = findFirst(sub);
          if (res) return res;
        }
      }
      return null;
    };
    return findFirst(g.coordinates);
  } catch (e) { return null; }
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkRow({ w = "w-full", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} rounded-md bg-white/[0.05] animate-pulse`} />;
}

// ─── Captures Panel ───────────────────────────────────────────────────────────
function CapturesPanel({ items, onClear }: { items: any[], onClear: () => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 mb-2 flex items-center justify-between">
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Active Captures</p>
          <p className="text-xs text-slate-300">Images kept in memory</p>
        </div>
        {items.length > 0 && (
          <button
            onClick={onClear}
            className="text-[0.6rem] px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
          >
            Clear All
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center opacity-40 text-[0.7rem]">No captures found. Draw a shape to capture.</div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => {
            return (
              <div key={it.id} className="group bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                <div className="relative aspect-video bg-black/40">
                  <img src={it.url} alt="Capture" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 gap-2">
                    <button
                      onClick={() => window.open(it.url, '_blank')}
                      className="px-3 py-1.5 bg-cyan-500 text-black text-[0.65rem] rounded-lg font-bold"
                    >
                      Open Full Size
                    </button>
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-[0.65rem] text-slate-200 font-medium truncate">{new Date(it.createdAt).toLocaleString()}</p>
                  <p className="text-[0.55rem] text-slate-500 mt-0.5">In-memory blob session</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Overview Live Panel ──────────────────────────────────────────────────────
function OverviewLivePanel({ feature }: { feature?: GeoJSON.Feature | null }) {
  const coords = getMidCoords(feature);
  const p      = feature?.properties ?? {};

  // ── no feature selected ──
  if (!feature || !coords) {
    return (
      <div className="space-y-5">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">Contour · Selected Area</p>
          <p className="text-3xl font-semibold text-orange-400">—</p>
          <p className="text-[0.65rem] text-slate-500 mt-1">Click a contour line to load data</p>
        </div>
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-2">Feature Properties</p>
          <p className="text-[0.68rem] text-slate-600 italic">No feature selected</p>
        </div>
      </div>
    );
  }

  const contourColor =
    (p.Contour ?? 0) < 100 ? "#22d3ee" :
    (p.Contour ?? 0) < 300 ? "#34d399" :
    (p.Contour ?? 0) < 700 ? "#a3e635" : "#fbbf24";

  // all extra properties from the API (exclude the known ones already displayed)
  const extraProps = Object.entries(p).filter(
    ([k]) => !["Contour", "Id", "OBJECTID", "Shape_Length"].includes(k)
  );

  return (
    <div className="space-y-4">

      {/* ── Contour KPI ── */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">Contour Elevation</p>
        <p className="text-3xl font-semibold" style={{ color: contourColor }}>
          {p.Contour ?? "—"} <span className="text-base font-normal text-slate-400">m</span>
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, ((p.Contour ?? 0) / 1500) * 100)}%`, background: contourColor }} />
        </div>
        <div className="flex gap-3 mt-2 text-[0.65rem]">
          <span className="text-slate-500">Id: <span className="text-slate-300">{p.Id ?? p.OBJECTID ?? "—"}</span></span>
          <span className="text-slate-500">Length: <span className="text-slate-300">{p.Shape_Length ? p.Shape_Length.toFixed(4) : "—"}</span></span>
        </div>
      </div>

      {/* ── Location ── */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Location</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Latitude",  value: `${coords[0].toFixed(5)}°`, color: "text-cyan-400"   },
            { label: "Longitude", value: `${coords[1].toFixed(5)}°`, color: "text-violet-400" },
            { label: "Geometry",  value: feature.geometry?.type ?? "—", color: "text-slate-200" },
            { label: "OBJECTID",  value: String(p.OBJECTID ?? "—"),  color: "text-slate-200"  },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
              <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Extra API fields (only if present) ── */}
      {extraProps.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Additional Data</p>
          <div className="grid grid-cols-2 gap-2">
            {extraProps.map(([k, v]) => (
              <div key={k} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
                <p className="text-sm font-semibold text-slate-200 truncate">
                  {v != null ? String(v).slice(0, 12) : "—"}
                </p>
                <p className="text-[0.62rem] text-slate-500 mt-0.5 truncate">{k}</p>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Weather Live Panel ───────────────────────────────────────────────────────
function WeatherLivePanel({ feature }: { feature?: GeoJSON.Feature | null }) {
  const coords = getMidCoords(feature);

  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!coords) return;
    setLoading(true);
    setData(null);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,` +
      `precipitation,cloud_cover,weather_code,uv_index` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,` +
      `uv_index_max,wind_speed_10m_max&timezone=auto&forecast_days=7`
    )
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [coords?.[0], coords?.[1]]);

  const wmoIcon = (c: number) =>
    c === 0 ? "☀️" : c <= 3 ? "⛅" : c <= 49 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : "⛈️";

  if (!feature || !coords) {
    return (
      <div className="space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-3xl font-light text-slate-100">—°C</p>
            <p className="text-xs text-slate-400 mt-0.5">Click a contour line</p>
          </div>
          <span className="text-5xl">⛅</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[{ l: "Humidity", v: "—", ic: "💧" }, { l: "Wind", v: "—", ic: "🌬️" }, { l: "UV Index", v: "—", ic: "☀️" }].map(w => (
            <div key={w.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5 text-center">
              <p className="text-base">{w.ic}</p>
              <p className="text-xs font-medium text-slate-200 mt-1">{w.v}</p>
              <p className="text-[0.58rem] text-slate-500">{w.l}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="space-y-3">{[1,2,3,4].map(i => <SkRow key={i} h="h-14" />)}</div>
  );

  if (!data) return null;

  const cur   = data.current ?? {};
  const daily = data.daily   ?? {};
  const days  = (daily.time ?? []) as string[];
  const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  // precipitation bar chart
  const precipMax = Math.max(...(daily.precipitation_sum ?? [1]).slice(0, 7), 1);

  return (
    <div className="space-y-4">
      {/* Current */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-3xl font-light text-slate-100">{cur.temperature_2m ?? "—"}°C</p>
          <p className="text-xs text-slate-400 mt-0.5">{wmoIcon(cur.weather_code ?? 0)} · {coords[0].toFixed(3)}°N</p>
          <p className="text-[0.62rem] text-slate-500 mt-1">Feels like {cur.apparent_temperature ?? "—"}°C</p>
        </div>
        <span className="text-5xl">{wmoIcon(cur.weather_code ?? 0)}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Humidity", v: `${cur.relative_humidity_2m ?? "—"}%`,        ic: "💧" },
          { l: "Wind",     v: `${cur.wind_speed_10m ?? "—"} km/h`,          ic: "🌬️" },
          { l: "UV Index", v: `${cur.uv_index != null ? Math.round(cur.uv_index) : "—"}`, ic: "☀️" },
        ].map(w => (
          <div key={w.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5 text-center">
            <p className="text-base">{w.ic}</p>
            <p className="text-xs font-medium text-slate-200 mt-1">{w.v}</p>
            <p className="text-[0.58rem] text-slate-500">{w.l}</p>
          </div>
        ))}
      </div>

      {/* 7-day forecast */}
      <div>
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-2">7-Day Forecast</p>
        <div className="flex gap-1.5">
          {days.slice(0, 7).map((dateStr: string, i: number) => {
            const d = new Date(dateStr);
            return (
              <div key={i} className={`flex-1 border rounded-lg p-2 flex flex-col items-center gap-1
                ${i === 0 ? "bg-cyan-400/10 border-cyan-400/30" : "bg-white/[0.04] border-white/[0.06]"}`}>
                <span className={`text-[0.58rem] ${i === 0 ? "text-cyan-400" : "text-slate-500"}`}>
                  {i === 0 ? "Now" : dayNames[d.getDay()]}
                </span>
                <span className="text-lg">{wmoIcon(daily.weather_code?.[i] ?? 0)}</span>
                <span className="text-[0.65rem] text-slate-200 font-medium">{daily.temperature_2m_max?.[i] ?? "—"}°</span>
                <span className="text-[0.58rem] text-slate-600">{daily.temperature_2m_min?.[i] ?? "—"}°</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Precipitation bar chart */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Precipitation (7d)</p>
        <div className="flex items-end gap-1 h-12">
          {(daily.precipitation_sum ?? []).slice(0, 7).map((v: number, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
              <div className="relative w-full">
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                  <div className="bg-[#0a1628] border border-white/10 text-[0.58rem] text-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap">{v} mm</div>
                </div>
                <div className="w-full rounded-sm transition-all group-hover:brightness-125"
                  style={{ height: `${Math.max(2, (v / precipMax) * 40)}px`, background: v > 0 ? "#38bdf8" : "rgba(255,255,255,0.05)" }} />
              </div>
              <span className="text-[0.46rem] text-slate-600">
                {new Date(daily.time?.[i]).toLocaleDateString("en", { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
// ─── Panel Contents ───────────────────────────────────────────────────────────
function PanelContent({
  id,
  selectedFeature,
  uploadedGeoJsonMap,
  captures,
  onDeleteGeoJSON,
  onOpen3D,
  onFlyTo,
  onClearCaptures,
}: {
  id: PanelId;
  selectedFeature?: GeoJSON.Feature | null;
  uploadedGeoJsonMap?: Record<string, any>;
  captures: any[];
  onDeleteGeoJSON?: (fileName: string) => void;
  onOpen3D?: (fileName: string) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onClearCaptures: () => void;
}) {

  // ── NDVI ──
  if (id === "ndvi") {
    return <NDVILivePanel feature={selectedFeature} />;
  }

  // ── OVERVIEW ──
  if (id === "overview") {
    return <OverviewLivePanel feature={selectedFeature} />;
  }

  // ── WEATHER ──
  if (id === "weather") {
    return <WeatherLivePanel feature={selectedFeature} />;
  }

  // ── CAPTURES ──
  if (id === "captures") {
    return <CapturesPanel items={captures} onClear={onClearCaptures} />;
  }

  // ── LAYERS ──
  if (id === "layers") {
    const files = Object.keys(uploadedGeoJsonMap || {});
    return (
      <div className="space-y-3">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 mb-2">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Uploaded Layers</p>
          <p className="text-xs text-slate-300">Manage your uploaded GeoJSON files</p>
        </div>

        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 opacity-40">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p className="text-[0.65rem]">No files uploaded yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((fileName) => {
              const geojson = uploadedGeoJsonMap![fileName];
              const count = geojson?.features?.length ?? 0;
              return (
                <div key={fileName} className="group bg-white/[0.03] border border-white/[0.06] hover:border-white/[0.15] rounded-xl p-3 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 2 7 12 12 22 7 12 2" />
                        <polyline points="2 17 12 22 22 17" />
                        <polyline points="2 12 12 17 22 12" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.72rem] font-medium text-slate-200 truncate">{fileName}</p>
                      <p className="text-[0.6rem] text-slate-500">{count} features</p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => {
                          if (!geojson?.features?.[0]?.geometry) return;
                          const coords = getMidCoords(geojson.features[0]);
                          if (coords) onFlyTo?.(coords[0], coords[1]);
                        }}
                        title="Fly to"
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10 rounded-lg transition-all cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2m8-10h2M2 12h2"/>
                        </svg>
                      </button>

                      <button
                        onClick={() => onOpen3D?.(fileName)}
                        title="View in 3D"
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-orange-400 hover:bg-orange-400/10 rounded-lg transition-all cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m21 8-9-4-9 4 9 4 9-4z"/><path d="m21 12-9 4-9-4"/><path d="m21 16-9 4-9-4"/>
                        </svg>
                      </button>

                      <button
                        onClick={() => onDeleteGeoJSON?.(fileName)}
                        title="Delete"
                        className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all cursor-pointer"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── ANALYSES ──
  if (id === "analyses") {
    const analysisList = [
      { en: "Image Analysis",         ar: "صور الأقمار الصناعية",    icon: "🛰️", color: "#22d3ee", tag: "Satellite"   },
      { en: "Spectral Classification", ar: "التصنيف الطيفي",         icon: "🎨", color: "#a78bfa", tag: "AI"          },
      { en: "Change Detection",        ar: "تحليل التغيرات الزمنية", icon: "🔄", color: "#f97316", tag: "Temporal"    },
      { en: "Spatial Analysis",        ar: "التحليل المكاني",         icon: "📐", color: "#34d399", tag: "GIS"         },
      { en: "OBIA",                    ar: "تحليل الأجسام",           icon: "🔲", color: "#fbbf24", tag: "Object"      },
      { en: "Atmospheric Correction",  ar: "التصحيح الجوي",           icon: "🌫️", color: "#60a5fa", tag: "Pre-process" },
      { en: "Time Series Analysis",    ar: "تحليل سلاسل زمنية",      icon: "📈", color: "#f472b6", tag: "Series"      },
    ];

    const flyCoords = getMidCoords(selectedFeature);
    const handleAnalysisClick = () => { if (flyCoords) onFlyTo?.(flyCoords[0], flyCoords[1]); };

    return (
      <div className="space-y-2">
        {/* Header */}
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 mb-3">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Available Analyses</p>
          <p className="text-xs text-slate-300">Select an analysis type to run on the selected area</p>
        </div>

        {/* No feature warning */}
        {!selectedFeature && (
          <div className="flex items-center gap-2 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl px-3 py-2.5 mb-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" className="shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[0.65rem] text-amber-300">Click a feature on the map first to run an analysis on it</p>
          </div>
        )}

        {analysisList.map((a, i) => (
          <button
            key={i}
            onClick={handleAnalysisClick}
            disabled={!selectedFeature}
            className={`w-full group flex items-center gap-3 border rounded-xl p-3 text-left transition-all duration-150
              ${selectedFeature
                ? "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06] hover:border-white/[0.15] cursor-pointer"
                : "bg-white/[0.01] border-white/[0.04] opacity-50 cursor-not-allowed"
              }`}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}
            >
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.78rem] font-medium text-slate-200 group-hover:text-white transition-colors truncate">{a.ar}</p>
              <p className="text-[0.62rem] text-slate-500 truncate">{a.en}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="text-[0.55rem] font-medium px-1.5 py-0.5 rounded-full"
                style={{ color: a.color, background: `${a.color}15`, border: `1px solid ${a.color}25` }}
              >
                {a.tag}
              </span>
              {selectedFeature ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </div>
          </button>
        ))}

        {selectedFeature && flyCoords && (
          <p className="text-[0.6rem] text-slate-600 text-center pt-1">
            📍 Click any analysis to fly to{" "}
            <span className="text-slate-500 font-mono">{flyCoords[0].toFixed(4)}°N {flyCoords[1].toFixed(4)}°E</span>
          </p>
        )}
      </div>
    );
  }

  // ── DEFAULT ──
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-40">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-slate-500">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
      <p className="text-[0.7rem] text-slate-600">No data available</p>
    </div>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────
export default function AnalysisSidebar({
  selectedFeature,
  uploadedGeoJsonMap,
  captures,
  onGeoJSONUpload,
  onDeleteGeoJSON,
  onOpen3D,
  onStartImageOverlay,
  onExtrusionConfig,
  onFlyTo,
  onClose,
  activePanel: controlledActivePanel,
  onActivePanelChange,
  onClearCaptures,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  uploadedGeoJsonMap?: Record<string, any>;
  captures: any[];
  onGeoJSONUpload?: (geojson: GeoJSON.FeatureCollection, fileName: string) => void;
  onDeleteGeoJSON?: (fileName: string) => void;
  onOpen3D?: (fileName: string) => void;
  onStartImageOverlay?: (file: File) => void;
  onExtrusionConfig?: (cfg: { enabled: boolean; heightProperty?: string; defaultHeightM?: number }) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onClose?: () => void;
  activePanel?: PanelId | null;
  onActivePanelChange?: (id: PanelId | null) => void;
  onClearCaptures: () => void;
}) {
  const [internalActivePanel, setInternalActivePanel] = useState<PanelId | null>("overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { isRTL } = useLang();

  // Determine which state to use
  const activePanel = controlledActivePanel !== undefined ? controlledActivePanel : internalActivePanel;

  const togglePanel = (id: PanelId) => {
    const next = activePanel === id ? null : id;
    if (onActivePanelChange) {
      onActivePanelChange(next);
    } else {
      setInternalActivePanel(next);
    }
  };

  const activeItem = panels.find((p) => p.id === activePanel);

  return (
    <>
      {/* ── GeoJSON Upload Modal ── */}
      {uploadOpen && (
        <JSONUploadModal
          onClose={() => setUploadOpen(false)}
          onDisplay={(geojson, fileName) => { onGeoJSONUpload?.(geojson, fileName); }}
          onUpload={(geojson, fileName) => { onGeoJSONUpload?.(geojson, fileName); }}
          onAddImageOverlay={(file) => { onStartImageOverlay?.(file); }}
          onExtrusionConfig={(cfg) => { onExtrusionConfig?.(cfg); }}
        />
      )}

      <div
        className={`absolute top-0 bottom-0 z-1000 flex ${isRTL ? "flex-row-reverse left-0" : "flex-row right-0"}`}
        style={{ pointerEvents: "none" }}
      >
        {/* ── Expanded panel ── */}
        <div
          className="h-full overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            width: activePanel ? 280 : 0,
            pointerEvents: activePanel ? "all" : "none",
            opacity: activePanel ? 1 : 0,
          }}
        >
          <div className="h-full w-[280px] bg-[#070f1e]/97 backdrop-blur-xl border-l border-white/[0.08] flex flex-col overflow-hidden shadow-[-8px_0_32px_rgba(0,0,0,0.4)]">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
                  {activeItem?.icon}
                </div>
                <span className="text-sm font-medium text-slate-200">
                  {isRTL ? activeItem?.labelAr : activeItem?.labelEn}
                </span>
              </div>
              <button
                onClick={() => togglePanel(activePanel as PanelId)}
                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] rounded-md transition-all cursor-pointer"
                style={{ pointerEvents: "all" }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scroll">
              {activePanel && (
                <PanelContent
                  id={activePanel}
                  selectedFeature={selectedFeature}
                  uploadedGeoJsonMap={uploadedGeoJsonMap}
                  captures={captures}
                  onDeleteGeoJSON={onDeleteGeoJSON}
                  onOpen3D={onOpen3D}
                  onFlyTo={onFlyTo}
                  onClearCaptures={onClearCaptures}
                />
              )}
            </div>
          </div>
        </div>

        {/* ── Icon rail ── */}
        <div
          className="h-full flex flex-col items-center py-3 gap-1 bg-[#070f1e]/92 backdrop-blur-xl border-l border-white/[0.07] w-[52px] shrink-0"
          style={{ pointerEvents: "all" }}
        >
          {panels.map((item) => (
            <div key={item.id} className="relative group w-full flex justify-center">
              <button
                onClick={() => togglePanel(item.id)}
                className={`
                  relative w-9 h-9 rounded-lg flex items-center justify-center
                  transition-all duration-150 cursor-pointer
                  ${activePanel === item.id
                    ? "bg-cyan-400/15 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(0,212,255,0.3)]"
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]"
                  }
                `}
              >
                {item.icon}
                {item.badge && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-cyan-400 text-[#040d1a] text-[0.52rem] font-bold rounded-full flex items-center justify-center px-0.5">
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Tooltip */}
              {activePanel !== item.id && (
                <div className={`
                  absolute top-1/2 -translate-y-1/2 pointer-events-none
                  opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
                  ${isRTL ? "right-11" : "left-11"}
                `}>
                  <div className="bg-[#0d1b2e] border border-white/10 text-slate-200 text-[0.68rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-xl">
                    {isRTL ? item.labelAr : item.labelEn}
                    {item.badge && (
                      <span className="ml-1.5 bg-cyan-400/20 text-cyan-400 text-[0.58rem] px-1 rounded">
                        {item.badge}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* ── Divider ── */}
          <div className="w-6 h-px bg-white/[0.08] my-1" />

          {/* ── Upload GeoJSON button ── */}
          <div className="relative group w-full flex justify-center">
            <button
              id="tour-upload"
              onClick={() => setUploadOpen((p) => !p)}
              className={`
                relative w-9 h-9 rounded-lg flex items-center justify-center
                transition-all duration-150 cursor-pointer
                ${uploadOpen
                  ? "bg-cyan-400/15 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(0,212,255,0.3)]"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]"
                }
              `}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>

            {/* Tooltip */}
            {!uploadOpen && (
              <div className={`
                absolute top-1/2 -translate-y-1/2 pointer-events-none
                opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
                ${isRTL ? "right-11" : "left-11"}
              `}>
                <div className="bg-[#0d1b2e] border border-white/10 text-slate-200 text-[0.68rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-xl">
                  Upload GeoJSON
                </div>
              </div>
            )}
          </div>
        </div>

        <style>{`
          .custom-scroll::-webkit-scrollbar { width: 3px; }
          .custom-scroll::-webkit-scrollbar-track { background: transparent; }
          .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
          .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        `}</style>
      </div>
    </>
  );
}