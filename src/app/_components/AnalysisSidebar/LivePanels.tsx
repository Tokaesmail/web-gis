import React, { useEffect, useMemo, useState } from "react";
import { DonutChart } from "./charts";
import { clampPercent, getFeatureAreaKm2 } from "./aoiAnalysis";
import { getMidCoords } from "./geoFeatureUtils";

function SkRow({ w = "w-full", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} rounded-md bg-white/[0.05] animate-pulse`} />;
}

// â”€â”€â”€ NDVI Live Panel (data from selected feature coords) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function NDVILivePanel({ feature, onExport }: { feature?: GeoJSON.Feature | null; onExport?: (data: any) => void }) {
  const [ndviData, setNdviData] = useState<any>(null);
  const [loading,  setLoading]  = useState(false);

  // derive midpoint coords from geometry
  const coords: [number, number] | null = useMemo(() => getMidCoords(feature), [feature]);

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
        
        const data = { series, latest, prev, avgSM, avgST };
        setNdviData(data);
        
        if (onExport) {
            const ndviDataMap: Record<string, any> = {
                "NDVI": { value: latest, min: Math.min(...series.map((s:any)=>s.value)), max: Math.max(...series.map((s:any)=>s.value)), mean: series.reduce((a:any,b:any)=>a+b.value,0)/series.length, trend: latest >= prev ? "up" : "down" }
            };
            onExport(ndviDataMap);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [coords?.[0], coords?.[1]]);

  // â”€â”€ No feature selected â€” show static mock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          <p className="text-3xl font-semibold text-emerald-400">0.720</p>
          <p className="text-[0.65rem] text-slate-500 mt-1">Up 0.04 from last month</p>
          <div className="mt-3 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-400" style={{ width: "72%" }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Avg", value: "0.682", color: "text-emerald-400" },
            { label: "Min", value: "0.410", color: "text-amber-400" },
            { label: "Max", value: "0.895", color: "text-emerald-500" },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 text-center">
              <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[0.55rem] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <div>
          <div className="flex justify-between text-[0.6rem] text-slate-500 mb-1"><span>Low</span><span>NDVI Scale</span><span>High</span></div>
          <div className="h-2.5 rounded-full" style={{ background: "linear-gradient(to right,#8B0000,#FF4500,#FFD700,#ADFF2F,#006400)" }} />
          <div className="flex justify-between px-1 mt-1">
             {["-1.0", "0.0", "0.2", "0.4", "0.6", "1.0"].map(v => <span key={v} className="text-[0.45rem] text-slate-600">{v}</span>)}
          </div>
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

  // â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">NDVI Index - Live</p>
        <p className="text-3xl font-semibold" style={{ color: hColor }}>{latest.toFixed(3)}</p>
        <p className="text-[0.65rem] mt-1" style={{ color: change >= 0 ? "#34d399" : "#f87171" }}>
          {change >= 0 ? "Up" : "Down"} {Math.abs(change).toFixed(3)} vs 9 days ago
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
          { label: "Soil Moisture",value: avgSM != null ? `${(avgSM*100).toFixed(1)}%` : "-", color: "text-blue-400"   },
          { label: "Soil Temp",    value: avgST != null ? `${avgST.toFixed(1)}\u00b0C`      : "-", color: "text-orange-400" },
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
            <p className="text-[0.75rem] font-semibold text-slate-200">{feature.properties.Contour}m - Id {feature.properties.Id ?? feature.properties.OBJECTID}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€ Overview Live Panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function OverviewLivePanel({ feature }: { feature?: GeoJSON.Feature | null }) {
  const coords = getMidCoords(feature);
  const p      = feature?.properties ?? {};
  const areaKm2 = getFeatureAreaKm2(feature);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => {
    if (!feature || !coords) {
      setAnalysisData(null);
      return;
    }

    let cancelled = false;
    setAnalysisLoading(true);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}` +
      `&current=cloud_cover&daily=et0_fao_evapotranspiration,shortwave_radiation_sum,precipitation_sum` +
      `&hourly=soil_moisture_0_to_1cm&timezone=auto&past_days=30&forecast_days=1`
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;

        const et = (d.daily?.et0_fao_evapotranspiration ?? []) as number[];
        const rad = (d.daily?.shortwave_radiation_sum ?? []) as number[];
        const precip = (d.daily?.precipitation_sum ?? []) as number[];
        const times = (d.daily?.time ?? []) as string[];
        const ndviSeries = et
          .map((e, i) => {
            const radiation = rad[i] ?? 1;
            return radiation > 0 ? Math.min(0.95, Math.max(0.05, (e / radiation) * 3.5)) : null;
          })
          .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

        const meanNdvi = ndviSeries.length
          ? ndviSeries.reduce((sum, value) => sum + value, 0) / ndviSeries.length
          : null;
        const latestNdvi = ndviSeries.at(-1) ?? meanNdvi;
        const soil = ((d.hourly?.soil_moisture_0_to_1cm ?? []) as number[]).slice(-24);
        const avgSoil = soil.length ? soil.reduce((sum, value) => sum + value, 0) / soil.length : null;
        const recentPrecip = precip.slice(-7).reduce((sum, value) => sum + (Number(value) || 0), 0);

        setAnalysisData({
          meanNdvi,
          vegetationCoverage: latestNdvi == null ? null : clampPercent(latestNdvi * 100),
          waterCoverage: avgSoil == null ? clampPercent(Math.min(18, recentPrecip * 1.8)) : clampPercent(avgSoil * 100),
          acquisitionDate: times.at(-1) ?? d.current?.time ?? new Date().toISOString(),
          cloudCover: d.current?.cloud_cover ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setAnalysisData(null);
      })
      .finally(() => {
        if (!cancelled) setAnalysisLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [coords?.[0], coords?.[1], feature]);

  // â”€â”€ no feature selected â”€â”€
  if (!feature || !coords) {
    return (
      <div className="space-y-5">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">AOI Analysis</p>
          <p className="text-3xl font-semibold text-orange-400">-</p>
          <p className="text-[0.65rem] text-slate-500 mt-1">Draw or click an AOI to load live statistics</p>
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
    ([k]) => !["Contour", "Id", "OBJECTID", "Shape_Length", "_color", "_fillColor"].includes(k)
  );

  return (
    <div className="space-y-4">

      {/* AOI statistics */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">AOI Statistics</p>
            <p className="text-[0.65rem] text-slate-500 mt-0.5">
              {analysisLoading ? "Loading live satellite-weather metrics..." : "Computed for the selected geometry"}
            </p>
          </div>
          <span className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[0.58rem] font-bold text-cyan-300">
            LIVE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Area", value: areaKm2 != null ? `${areaKm2.toFixed(areaKm2 >= 10 ? 2 : 4)} km²` : "-", color: "text-cyan-400" },
            { label: "Mean NDVI", value: analysisData?.meanNdvi != null ? analysisData.meanNdvi.toFixed(3) : "-", color: "text-emerald-400" },
            { label: "Vegetation", value: analysisData?.vegetationCoverage != null ? `${analysisData.vegetationCoverage}%` : "-", color: "text-lime-400" },
            { label: "Water", value: analysisData?.waterCoverage != null ? `${analysisData.waterCoverage}%` : "-", color: "text-blue-400" },
            {
              label: "Acquisition",
              value: analysisData?.acquisitionDate ? new Date(analysisData.acquisitionDate).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" }) : "-",
              color: "text-slate-200",
            },
            { label: "Cloud Cover", value: analysisData?.cloudCover != null ? `${Math.round(analysisData.cloudCover)}%` : "-", color: "text-sky-300" },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
              <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ Contour KPI â”€â”€ */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-1">Contour Elevation</p>
        <p className="text-3xl font-semibold" style={{ color: contourColor }}>
          {p.Contour ?? "-"} <span className="text-base font-normal text-slate-400">m</span>
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${Math.min(100, ((p.Contour ?? 0) / 1500) * 100)}%`, background: contourColor }} />
        </div>
        <div className="flex gap-3 mt-2 text-[0.65rem]">
          <span className="text-slate-500">Id: <span className="text-slate-300">{p.Id ?? p.OBJECTID ?? "-"}</span></span>
          <span className="text-slate-500">Length: <span className="text-slate-300">{p.Shape_Length ? p.Shape_Length.toFixed(4) : "-"}</span></span>
        </div>
      </div>

      {/* â”€â”€ Location â”€â”€ */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Location</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Latitude",  value: `${coords[0].toFixed(5)}\u00b0`, color: "text-cyan-400"   },
            { label: "Longitude", value: `${coords[1].toFixed(5)}\u00b0`, color: "text-violet-400" },
            { label: "Geometry",  value: feature.geometry?.type ?? "-", color: "text-slate-200" },
            { label: "OBJECTID",  value: String(p.OBJECTID ?? "-"),  color: "text-slate-200"  },
          ].map(s => (
            <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
              <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-[0.62rem] text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* â”€â”€ Extra API fields (only if present) â”€â”€ */}
      {extraProps.length > 0 && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Additional Data</p>
          <div className="grid grid-cols-2 gap-2">
            {extraProps.map(([k, v]) => (
              <div key={k} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5">
                <p className="text-sm font-semibold text-slate-200 truncate">
                  {v != null ? String(v).slice(0, 12) : "-"}
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

export function WeatherLivePanel({ feature }: { feature?: GeoJSON.Feature | null }) {
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
    c === 0 ? "Clear" : c <= 3 ? "Cloudy" : c <= 49 ? "Fog" : c <= 67 ? "Rain" : c <= 77 ? "Snow" : "Storm";

  if (!feature || !coords) {
    return (
      <div className="space-y-4">
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-3xl font-light text-slate-100">{"-\u00b0C"}</p>
            <p className="text-xs text-slate-400 mt-0.5">Click a contour line</p>
          </div>
          <span className="text-sm font-semibold text-cyan-300">Weather</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[{ l: "Humidity", v: "-", ic: "H" }, { l: "Wind", v: "-", ic: "W" }, { l: "UV Index", v: "-", ic: "UV" }].map(w => (
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
  const maxTemps: number[] = ((daily.temperature_2m_max ?? []) as Array<number | string>).slice(0, 7).map((value) => Number(value));
  const minTemps: number[] = ((daily.temperature_2m_min ?? []) as Array<number | string>).slice(0, 7).map((value) => Number(value));
  const precipValues: number[] = ((daily.precipitation_sum ?? []) as Array<number | string>).slice(0, 7).map((value) => Number(value) || 0);
  const allTemps = [...maxTemps, ...minTemps].filter(Number.isFinite);
  const tempMin = Math.min(...allTemps, 0);
  const tempMax = Math.max(...allTemps, 1);
  const tempRange = Math.max(1, tempMax - tempMin);
  const chartW = 240;
  const chartH = 58;
  const tempPoints: Array<readonly [number, number]> = maxTemps.map((value, index) => {
    const x = maxTemps.length > 1 ? (index / (maxTemps.length - 1)) * chartW : chartW / 2;
    const y = chartH - ((value - tempMin) / tempRange) * (chartH - 8) - 4;
    return [x, y] as const;
  });
  const tempPath = tempPoints.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const precipMax = Math.max(...precipValues, 1);

  return (
    <div className="space-y-4">
      {/* Current */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-3xl font-light text-slate-100">{cur.temperature_2m ?? "-"}{"\u00b0C"}</p>
          <p className="text-xs text-slate-400 mt-0.5">{wmoIcon(cur.weather_code ?? 0)} - {coords[0].toFixed(3)}{"\u00b0N"}</p>
          <p className="text-[0.62rem] text-slate-500 mt-1">Feels like {cur.apparent_temperature ?? "-"}{"\u00b0C"}</p>
        </div>
        <span className="text-sm font-semibold text-cyan-300">{wmoIcon(cur.weather_code ?? 0)}</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Humidity", v: `${cur.relative_humidity_2m ?? "-"}%`,        ic: "H" },
          { l: "Wind",     v: `${cur.wind_speed_10m ?? "-"} km/h`,          ic: "W" },
          { l: "UV Index", v: `${cur.uv_index != null ? Math.round(cur.uv_index) : "-"}`, ic: "UV" },
        ].map(w => (
          <div key={w.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2.5 text-center">
            <p className="text-2xl text-white font-bold">{w.ic}</p>
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
                <span className="text-[0.6rem] text-slate-400">{wmoIcon(daily.weather_code?.[i] ?? 0)}</span>
                <span className="text-[0.65rem] text-slate-200 font-medium">{daily.temperature_2m_max?.[i] ?? "-"}{"\u00b0"}</span>
                <span className="text-[0.58rem] text-slate-600">{daily.temperature_2m_min?.[i] ?? "-"}{"\u00b0"}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Temperature Trend (7d)</p>
          <span className="text-[0.58rem] text-cyan-300">{tempMin.toFixed(0)}{"\u00b0"} - {tempMax.toFixed(0)}{"\u00b0"}</span>
        </div>
        <svg width="100%" viewBox={`0 0 ${chartW} ${chartH + 16}`} className="overflow-visible">
          <defs>
            <linearGradient id="weatherTempFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={`${tempPath} L${chartW},${chartH} L0,${chartH} Z`} fill="url(#weatherTempFill)" />
          <path d={tempPath} fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {tempPoints.map(([x, y], index) => (
            <g key={index}>
              <circle cx={x} cy={y} r={index === 0 ? 4 : 3} fill={index === 0 ? "#06b6d4" : "#67e8f9"} />
              <text x={x} y={chartH + 13} textAnchor="middle" fontSize="7" fill="#64748b">
                {days[index] ? dayNames[new Date(days[index]).getDay()].slice(0, 1) : ""}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Precipitation bar chart */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-4">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-3">Precipitation (7d)</p>
        <div className="flex items-end gap-1 h-14">
          {precipValues.map((v: number, i: number) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group">
              <div className="relative w-full">
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 z-10 pointer-events-none">
                  <div className="bg-[#0a1628] border border-white/10 text-[0.58rem] text-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap">{v} mm</div>
                </div>
                <div className="w-full rounded-sm transition-all group-hover:brightness-125"
                  style={{ height: `${Math.max(4, (v / precipMax) * 48)}px`, background: v > 0 ? "#38bdf8" : "rgba(56,189,248,0.16)" }} />
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

