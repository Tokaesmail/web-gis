"use client";

// ─── ElevationContourPanel.tsx ──────────────────────────────────────────────────
// Combines:
//   • Open-Meteo weather (same pattern as WeatherLivePanel in AnalysisSidebar)
//   • Open-Elevation / Open-Meteo elevation grid sampling (lib/elevation.ts)
//   • Client-side marching-squares contour interpolation (lib/marchingSquares.ts)
//
// The generated contour lines are emitted as a GeoJSON FeatureCollection via
// onContoursGenerated, so the parent (MapClient/AnalysisSidebar) can add them
// to the map the same way uploaded GeoJSON layers are added.

import React, { useState, useCallback, useMemo } from "react";
import { buildElevationGrid, type ElevationGrid } from "../../../../lib/elevation";
import { gridToContours } from "../../../../lib/marchingSquares";

// ── helper: bbox from a GeoJSON feature, with sane fallback ────────────────────
function getFeatureBounds(feature?: GeoJSON.Feature | null) {
  const coords: number[][] = [];
  const walk = (value: any) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      coords.push(value);
      return;
    }
    value.forEach(walk);
  };
  walk((feature?.geometry as any)?.coordinates);

  if (coords.length) {
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const pad = Math.max(0.001, Math.max(north - south, east - west) * 0.15);
    return { north: north + pad, south: south - pad, east: east + pad, west: west - pad };
  }

  // Fallback: small box around Cairo
  return { north: 30.08, south: 30.0, east: 31.27, west: 31.17 };
}

function midOf(bounds: { north: number; south: number; east: number; west: number }) {
  return { lat: (bounds.north + bounds.south) / 2, lng: (bounds.east + bounds.west) / 2 };
}

const wmoIcon = (c: number) =>
  c === 0 ? "☀️" : c <= 3 ? "⛅" : c <= 49 ? "🌫️" : c <= 67 ? "🌧️" : c <= 77 ? "🌨️" : "⛈️";

// ── SVG preview of the elevation grid (filled heat cells) + contour overlay ───
function GridPreview({
  grid,
  contours,
}: {
  grid: ElevationGrid;
  contours: GeoJSON.FeatureCollection | null;
}) {
  const W = 260;
  const H = 170;
  const { cols, rowsCount, rows, min, max, bounds } = grid;
  const span = Math.max(max - min, 1);

  const colorFor = (v: number) => {
    if (!Number.isFinite(v)) return "rgba(255,255,255,0.03)";
    const t = (v - min) / span;
    // low → high: deep blue, teal, green, yellow, brown
    const stops: [number, number, number][] = [
      [30, 64, 175], [34, 197, 94], [250, 204, 21], [217, 119, 6], [120, 53, 15],
    ];
    const step = 1 / (stops.length - 1);
    const idx = Math.min(Math.floor(t / step), stops.length - 2);
    const local = (t - idx * step) / step;
    const a = stops[idx];
    const b = stops[idx + 1];
    const r = Math.round(a[0] + (b[0] - a[0]) * local);
    const g = Math.round(a[1] + (b[1] - a[1]) * local);
    const bch = Math.round(a[2] + (b[2] - a[2]) * local);
    return `rgb(${r},${g},${bch})`;
  };

  const cellW = W / cols;
  const cellH = H / rowsCount;

  // project contour lng/lat -> svg x/y using the same bounds
  const lngSpan = Math.max(bounds.east - bounds.west, 1e-6);
  const latSpan = Math.max(bounds.north - bounds.south, 1e-6);
  const toSvg = (lng: number, lat: number): [number, number] => [
    ((lng - bounds.west) / lngSpan) * W,
    ((bounds.north - lat) / latSpan) * H,
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="rounded-lg border border-white/[0.07] overflow-hidden">
      {rows.map((row, y) =>
        row.map((v, x) => (
          <rect
            key={`${x}-${y}`}
            x={x * cellW}
            y={y * cellH}
            width={cellW + 0.5}
            height={cellH + 0.5}
            fill={colorFor(v)}
          />
        ))
      )}
      {contours?.features.map((f, i) => {
        if (f.geometry.type !== "LineString") return null;
        const pts = (f.geometry.coordinates as [number, number][]).map(([lng, lat]) => toSvg(lng, lat));
        const d = pts.map((p, j) => `${j === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
        return <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8" />;
      })}
    </svg>
  );
}

interface Props {
  selectedFeature?: GeoJSON.Feature | null;
  onContoursGenerated?: (geojson: GeoJSON.FeatureCollection, fileName: string) => void;
}

export default function ElevationContourPanel({ selectedFeature, onContoursGenerated }: Props) {
  const bounds = useMemo(() => getFeatureBounds(selectedFeature), [selectedFeature]);
  const center = useMemo(() => midOf(bounds), [bounds]);

  const [resolution, setResolution] = useState(18);
  const [interval, setIntervalM] = useState(25);

  const [grid, setGrid] = useState<ElevationGrid | null>(null);
  const [contours, setContours] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  const runElevation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const g = await buildElevationGrid(bounds, resolution);
      setGrid(g);
      const c = gridToContours(g, { interval });
      setContours(c);
    } catch (e: any) {
      setError(e?.message ?? "Elevation lookup failed");
    } finally {
      setLoading(false);
    }
  }, [bounds, resolution, interval]);

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${center.lat}&longitude=${center.lng}` +
        `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
        `&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=5`
      );
      const data = await res.json();
      setWeather(data);
    } catch {
      setWeather(null);
    } finally {
      setWeatherLoading(false);
    }
  }, [center.lat, center.lng]);

  const handleAddToMap = useCallback(() => {
    if (!contours) return;
    const fileName = `elevation-contours-${Date.now()}.geojson`;
    onContoursGenerated?.(contours, fileName);
  }, [contours, onContoursGenerated]);

  // re-interpolate contours instantly when interval changes (no new fetch needed)
  const handleIntervalChange = (val: number) => {
    setIntervalM(val);
    if (grid) setContours(gridToContours(grid, { interval: val }));
  };

  const cur = weather?.current;
  const daily = weather?.daily;

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Elevation & Contours</p>
        <p className="text-xs text-slate-300">Open-Meteo weather · Open-Elevation terrain · client-side contour interpolation</p>
      </div>

      {/* ── Weather ── */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Weather · {center.lat.toFixed(3)}, {center.lng.toFixed(3)}</p>
          <button
            onClick={fetchWeather}
            disabled={weatherLoading}
            className="text-[0.6rem] px-2 py-1 rounded bg-cyan-400/10 text-cyan-300 border border-cyan-400/20 hover:bg-cyan-400/20 disabled:opacity-50 cursor-pointer"
          >
            {weatherLoading ? "Loading…" : weather ? "Refresh" : "Fetch"}
          </button>
        </div>

        {!weather ? (
          <p className="text-[0.65rem] text-slate-600 italic">No weather loaded yet</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-light text-slate-100">{cur?.temperature_2m ?? "—"}°C</p>
                <p className="text-[0.62rem] text-slate-500">💧 {cur?.relative_humidity_2m ?? "—"}% · 🌬️ {cur?.wind_speed_10m ?? "—"} km/h</p>
              </div>
              <span className="text-4xl">{wmoIcon(cur?.weather_code ?? 0)}</span>
            </div>
            <div className="flex gap-1">
              {(daily?.time ?? []).slice(0, 5).map((d: string, i: number) => (
                <div key={i} className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-lg p-1.5 text-center">
                  <p className="text-[0.55rem] text-slate-500">{new Date(d).toLocaleDateString("en", { weekday: "narrow" })}</p>
                  <p className="text-sm">{wmoIcon(daily?.weather_code?.[i] ?? 0)}</p>
                  <p className="text-[0.6rem] text-slate-300">{daily?.temperature_2m_max?.[i] ?? "—"}°</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Elevation controls ── */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-3">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Sample Grid</p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] text-slate-400">Grid resolution</span>
            <span className="text-[0.65rem] text-cyan-300 font-mono">{resolution}×{resolution}</span>
          </div>
          <input
            type="range" min={6} max={32} value={resolution}
            onChange={(e) => setResolution(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[0.65rem] text-slate-400">Contour interval</span>
            <span className="text-[0.65rem] text-cyan-300 font-mono">{interval} m</span>
          </div>
          <input
            type="range" min={5} max={200} step={5} value={interval}
            onChange={(e) => handleIntervalChange(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </div>

        <p className="text-[0.58rem] text-slate-600">
          BBOX {bounds.west.toFixed(4)}, {bounds.south.toFixed(4)}, {bounds.east.toFixed(4)}, {bounds.north.toFixed(4)}
        </p>

        <button
          onClick={runElevation}
          disabled={loading}
          className="w-full h-9 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-wait text-[#03101d] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Fetching elevation…
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17l4-8 4 4 4-6 4 10" />
              </svg>
              Build Elevation Grid
            </>
          )}
        </button>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 text-[0.62rem] text-red-300">
            {error}
          </div>
        )}
      </div>

      {/* ── Result ── */}
      {grid && (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Preview</p>
            <span className={`text-[0.55rem] px-1.5 py-0.5 rounded-full border ${
              grid.source === "open-meteo" ? "bg-cyan-400/10 text-cyan-300 border-cyan-400/20" :
              grid.source === "open-elevation" ? "bg-amber-400/10 text-amber-300 border-amber-400/20" :
              "bg-violet-400/10 text-violet-300 border-violet-400/20"
            }`}>
              {grid.source === "open-meteo" ? "Open-Meteo" : grid.source === "open-elevation" ? "Open-Elevation (fallback)" : "Mixed sources"}
            </span>
          </div>

          <GridPreview grid={grid} contours={contours} />

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { l: "Min", v: `${grid.min.toFixed(0)} m`, c: "text-blue-400" },
              { l: "Max", v: `${grid.max.toFixed(0)} m`, c: "text-amber-400" },
              { l: "Lines", v: String(contours?.features.length ?? 0), c: "text-cyan-400" },
            ].map((s) => (
              <div key={s.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 text-center">
                <p className={`text-xs font-bold ${s.c}`}>{s.v}</p>
                <p className="text-[0.55rem] text-slate-500 mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddToMap}
            disabled={!contours?.features.length}
            className="w-full h-9 rounded-lg bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/25 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-300 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Contours to Map
          </button>
        </div>
      )}

      <p className="text-[0.58rem] text-slate-600 text-center leading-relaxed">
        Elevation comes from Open-Meteo (Copernicus DEM, 90m) with automatic fallback to Open-Elevation (SRTM).
        Contours are interpolated locally using marching squares — no server round-trip.
      </p>
    </div>
  );
}
