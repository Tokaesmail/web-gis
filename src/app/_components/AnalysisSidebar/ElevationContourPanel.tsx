"use client";

// ─── ElevationContourPanel.tsx ──────────────────────────────────────────────────
// Now hosts TWO contour modes, switched via tabs at the top:
//   🗻 Elevation Contours (existing) — Open-Elevation/Open-Meteo elevation grid
//      → marching-squares interpolation → lines colored/labeled by meters.
//   🌡 Weather Contours (new)       — Open-Meteo current-temperature grid
//      → the SAME marching-squares interpolation (lib/marchingSquares.ts is
//        generic over any numeric grid) → isotherm lines colored by °C.
//
// Both modes share: the live weather card, the AOI bounds box, and the
// "Add to Map" action (which emits a GeoJSON FeatureCollection the same way
// for either mode via onContoursGenerated).
//
// FloatingElevationPanel wraps ElevationContourPanel in a draggable, resizable
// floating panel that sits above the map — no sidebar needed.

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { buildElevationGrid, type ElevationGrid } from "../../../../lib/elevation";
import { gridToContours } from "../../../../lib/marchingSquares";
import { buildTemperatureGrid, type TemperatureGrid } from "../../../../lib/temperatureGrid";
import { gridToTemperatureContours } from "../../../../lib/temperatureContours";

type ContourMode = "elevation" | "weather";

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
  mode,
}: {
  grid: ElevationGrid | TemperatureGrid;
  contours: GeoJSON.FeatureCollection | null;
  mode: ContourMode;
}) {
  const W = 260;
  const H = 170;
  const { cols, rowsCount, rows, min, max, bounds } = grid;
  const span = Math.max(max - min, 1);

  const colorFor = (v: number) => {
    if (!Number.isFinite(v)) return "rgba(255,255,255,0.03)";
    const t = (v - min) / span;
    const stops: [number, number, number][] =
      mode === "weather"
        ? [
            [29, 78, 216], // cold blue
            [56, 189, 248], // sky
            [250, 204, 21], // yellow
            [249, 115, 22], // orange
            [220, 38, 38], // hot red
          ]
        : [
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

  // ── Mode switch ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<ContourMode>("elevation");

  // ── Elevation state ──────────────────────────────────────────────────────
  const [resolution, setResolution] = useState(18);
  const [interval, setIntervalM] = useState(25);
  const [grid, setGrid] = useState<ElevationGrid | null>(null);
  const [contours, setContours] = useState<GeoJSON.FeatureCollection | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Weather (isotherm) state ─────────────────────────────────────────────
  const [tempResolution, setTempResolution] = useState(8);
  const [tempInterval, setTempInterval] = useState(2);
  const [tempGrid, setTempGrid] = useState<TemperatureGrid | null>(null);
  const [tempContours, setTempContours] = useState<GeoJSON.FeatureCollection | null>(null);
  const [tempLoading, setTempLoading] = useState(false);
  const [tempError, setTempError] = useState<string | null>(null);

  // ── Shared live weather card ─────────────────────────────────────────────
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

  const runWeatherContours = useCallback(async () => {
    setTempLoading(true);
    setTempError(null);
    try {
      const g = await buildTemperatureGrid(bounds, tempResolution);
      setTempGrid(g);
      const c = gridToTemperatureContours(g, { interval: tempInterval });
      setTempContours(c);
      if (c.features.length === 0) {
        setTempError("No isotherm crossings found in this AOI — try a smaller interval or a larger area.");
      }
    } catch (e: any) {
      setTempError(e?.message ?? "Temperature lookup failed");
    } finally {
      setTempLoading(false);
    }
  }, [bounds, tempResolution, tempInterval]);

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

  const handleAddElevationToMap = useCallback(() => {
    if (!contours) return;
    const fileName = `elevation-contours-${Date.now()}.geojson`;
    onContoursGenerated?.(contours, fileName);
  }, [contours, onContoursGenerated]);

  const handleAddWeatherToMap = useCallback(() => {
    if (!tempContours) return;
    const fileName = `weather-contours-${Date.now()}.geojson`;
    onContoursGenerated?.(tempContours, fileName);
  }, [tempContours, onContoursGenerated]);

  // re-interpolate contours instantly when interval changes (no new fetch needed)
  const handleIntervalChange = (val: number) => {
    setIntervalM(val);
    if (grid) setContours(gridToContours(grid, { interval: val }));
  };

  const handleTempIntervalChange = (val: number) => {
    setTempInterval(val);
    if (tempGrid) setTempContours(gridToTemperatureContours(tempGrid, { interval: val }));
  };

  const cur = weather?.current;
  const daily = weather?.daily;

  return (
    <div className="space-y-4">
      {/* ── Mode switch ── */}
      <div className="flex items-center bg-white/[0.03] border border-white/[0.07] rounded-xl p-1 gap-1">
        {([
          { key: "elevation" as ContourMode, icon: "🗻", label: "Elevation Contours" },
          { key: "weather" as ContourMode, icon: "🌡", label: "Weather Contours" },
        ]).map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => setMode(m.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              mode === m.key
                ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_12px_rgba(0,212,255,0.3)]"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <span>{m.icon}</span>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">
          {mode === "elevation" ? "Elevation & Contours" : "Weather & Isotherms"}
        </p>
        <p className="text-xs text-slate-300">
          {mode === "elevation"
            ? "Open-Meteo weather · Open-Elevation terrain · client-side contour interpolation"
            : "Open-Meteo current temperature · client-side isotherm interpolation"}
        </p>
      </div>

      {/* ── Weather (shared current conditions card) ── */}
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

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* ELEVATION MODE */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {mode === "elevation" && (
        <>
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

              <GridPreview grid={grid} contours={contours} mode="elevation" />

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
                onClick={handleAddElevationToMap}
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
        </>
      )}

      {/* ════════════════════════════════════════════════════════════════ */}
      {/* WEATHER MODE (Isotherms) */}
      {/* ════════════════════════════════════════════════════════════════ */}
      {mode === "weather" && (
        <>
          <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-3">
            <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Temperature Sample Grid</p>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] text-slate-400">Grid resolution</span>
                <span className="text-[0.65rem] text-cyan-300 font-mono">{tempResolution}×{tempResolution}</span>
              </div>
              <input
                type="range" min={3} max={14} value={tempResolution}
                onChange={(e) => setTempResolution(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
              <p className="text-[0.55rem] text-slate-600">
                Each cell is one live API call — keep this modest to stay fast.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[0.65rem] text-slate-400">Isotherm interval</span>
                <span className="text-[0.65rem] text-cyan-300 font-mono">{tempInterval} °C</span>
              </div>
              <input
                type="range" min={0.5} max={5} step={0.5} value={tempInterval}
                onChange={(e) => handleTempIntervalChange(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <p className="text-[0.58rem] text-slate-600">
              BBOX {bounds.west.toFixed(4)}, {bounds.south.toFixed(4)}, {bounds.east.toFixed(4)}, {bounds.north.toFixed(4)}
            </p>

            <button
              onClick={runWeatherContours}
              disabled={tempLoading}
              className="w-full h-9 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-wait text-[#03101d] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {tempLoading ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Sampling temperature…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                  </svg>
                  Build Weather Contours
                </>
              )}
            </button>

            {tempError && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-[0.62rem] text-amber-300">
                {tempError}
              </div>
            )}
          </div>

          {tempGrid && (
            <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Preview</p>
                <span className="text-[0.55rem] px-1.5 py-0.5 rounded-full border bg-cyan-400/10 text-cyan-300 border-cyan-400/20">
                  Open-Meteo · live
                </span>
              </div>

              <GridPreview grid={tempGrid} contours={tempContours} mode="weather" />

              {/* Temperature color legend */}
              <div>
                <div className="flex justify-between text-[0.6rem] text-slate-500 mb-1">
                  <span>{tempGrid.min.toFixed(1)}°C</span>
                  <span>Isotherm Scale</span>
                  <span>{tempGrid.max.toFixed(1)}°C</span>
                </div>
                <div className="h-2 rounded-full" style={{ background: "linear-gradient(to right,#1d4ed8,#38bdf8,#facc15,#f97316,#dc2626)" }} />
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { l: "Min", v: `${tempGrid.min.toFixed(1)}°C`, c: "text-blue-400" },
                  { l: "Max", v: `${tempGrid.max.toFixed(1)}°C`, c: "text-orange-400" },
                  { l: "Lines", v: String(tempContours?.features.length ?? 0), c: "text-cyan-400" },
                ].map((s) => (
                  <div key={s.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 text-center">
                    <p className={`text-xs font-bold ${s.c}`}>{s.v}</p>
                    <p className="text-[0.55rem] text-slate-500 mt-0.5">{s.l}</p>
                  </div>
                ))}
              </div>

              {tempGrid.sampledAt && (
                <p className="text-[0.55rem] text-slate-600 text-center">
                  Sampled at {new Date(tempGrid.sampledAt).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}

              <button
                onClick={handleAddWeatherToMap}
                disabled={!tempContours?.features.length}
                className="w-full h-9 rounded-lg bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/25 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-300 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add Isotherms to Map
              </button>
            </div>
          )}

          <p className="text-[0.58rem] text-slate-600 text-center leading-relaxed">
            Temperature comes live from Open-Meteo's current-conditions endpoint, sampled per grid cell.
            Isotherms (lines of constant temperature) are interpolated locally using the same marching-squares
            technique as elevation contours.
          </p>
        </>
      )}
    </div>
  );
}

// ── FloatingElevationPanel ────────────────────────────────────────────────────
// Draggable floating panel that wraps ElevationContourPanel and renders above
// the map. Import and use this instead of ElevationContourPanel directly when
// you want a free-floating widget over the map canvas.
//
// Usage example (inside your Map component):
//   import { FloatingElevationPanel } from "./ElevationContourPanel";
//   const [open, setOpen] = useState(false);
//   <FloatingElevationPanel
//     open={open}
//     onClose={() => setOpen(false)}
//     selectedFeature={activeFeature}
//     onContoursGenerated={handleContours}
//   />

interface FloatingProps extends Props {
  /** whether the panel is visible */
  open: boolean;
  /** called when the user clicks × */
  onClose: () => void;
  /** starting position in px from viewport top-left — defaults to {x:16, y:16} */
  initialPosition?: { x: number; y: number };
}

export function FloatingElevationPanel({
  open,
  onClose,
  initialPosition = { x: 16, y: 16 },
  ...panelProps
}: FloatingProps) {
  const [pos, setPos] = useState(initialPosition);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);
  const origin = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ── drag ────────────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragging.current = true;
    origin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: origin.current.px + (e.clientX - origin.current.mx),
        y: origin.current.py + (e.clientY - origin.current.my),
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 1000,
        width: 320,
      }}
      className="flex flex-col rounded-2xl overflow-hidden
        shadow-[0_8px_40px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)]
        border border-white/[0.08]
        bg-[#040d1a]/90 backdrop-blur-xl"
    >
      {/* ── header / drag handle ── */}
      <div
        onMouseDown={onMouseDown}
        className="flex items-center gap-2 px-3.5 py-2.5
          cursor-grab active:cursor-grabbing select-none
          border-b border-white/[0.07] bg-white/[0.025]"
      >
        {/* grip dots */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-slate-600 shrink-0">
          {([0, 4, 8] as const).map((cy) =>
            ([0, 4, 8] as const).map((cx) => (
              <circle key={`${cx}-${cy}`} cx={cx + 2} cy={cy + 2} r="1" fill="currentColor" />
            ))
          )}
        </svg>

        <span className="flex-1 text-[0.68rem] font-semibold text-slate-300 tracking-wide truncate">
          Elevation &amp; Weather Contours
        </span>

        {/* collapse */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-6 h-6 flex items-center justify-center rounded
            hover:bg-white/[0.08] text-slate-500 hover:text-slate-300
            transition-colors cursor-pointer"
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            {collapsed ? (
              <path d="M2 3.5l3 3 3-3" />
            ) : (
              <path d="M2 6.5l3-3 3 3" />
            )}
          </svg>
        </button>

        {/* close */}
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded
            hover:bg-red-500/20 text-slate-500 hover:text-red-400
            transition-colors cursor-pointer"
          title="Close panel"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 2l6 6M8 2l-6 6" />
          </svg>
        </button>
      </div>

      {/* ── scrollable content ── */}
      {!collapsed && (
        <div
          className="overflow-y-auto p-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
          style={{ maxHeight: "calc(100vh - 96px)" }}
        >
          <ElevationContourPanel {...panelProps} />
        </div>
      )}
    </div>
  );
}