"use client";

// ─── VolumeCalculationPanel.tsx ──────────────────────────────────────────────
// Volume calculation from DEM data within a selected polygon.
//
// Method:
//   1. Sample a grid of elevation points inside the polygon bounds
//      (using Open-Elevation batch API — same service as elevationService.ts)
//   2. Filter only points that fall inside the polygon (point-in-polygon via @turf/turf)
//   3. Integrate: Volume = Σ (elevation[i] - base_elevation) × cell_area
//      where cell_area = (grid_spacing_m)²
//
// Reference plane options:
//   - Min elevation inside polygon (cut from lowest point)
//   - Custom user-defined base elevation (m)
//   - Mean elevation (balance cut/fill)

import { useState, useMemo, useRef } from "react";
import * as turf from "@turf/turf";

// ── Types ──────────────────────────────────────────────────────────────────────
type RefPlaneMode = "min" | "mean" | "custom";

type SamplePoint = {
  lat: number;
  lng: number;
  elevation: number; // meters
};

type VolumeResult = {
  volumeAbove: number;   // m³
  volumeBelow: number;   // m³ (cut)
  netVolume: number;     // above - below
  cellArea: number;      // m² per cell
  sampledPoints: number; // points inside polygon
  minElev: number;
  maxElev: number;
  meanElev: number;
  basePlane: number;     // m
  polygonAreaM2: number;
};

// ── Grid resolution options ────────────────────────────────────────────────────
const RESOLUTION_OPTIONS = [
  { label: "Coarse (200 m)", value: 200, desc: "Fast, ~50–200 pts" },
  { label: "Medium (100 m)", value: 100, desc: "Balanced, ~200–800 pts" },
  { label: "Fine (50 m)",    value: 50,  desc: "Detailed, ~800–3000 pts" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function getPolygonCoords(feature: GeoJSON.Feature): [number, number][] | null {
  const g = feature.geometry;
  if (!g) return null;
  if (g.type === "Polygon") return g.coordinates[0] as [number, number][];
  if (g.type === "MultiPolygon") return g.coordinates[0][0] as [number, number][];
  return null;
}

function getFeatureBbox(feature: GeoJSON.Feature) {
  const coords: number[][] = [];
  const walk = (v: any) => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number" && typeof v[1] === "number") { coords.push(v); return; }
    v.forEach(walk);
  };
  walk((feature.geometry as any)?.coordinates);
  if (!coords.length) return null;
  return {
    west:  Math.min(...coords.map(c => c[0])),
    east:  Math.max(...coords.map(c => c[0])),
    south: Math.min(...coords.map(c => c[1])),
    north: Math.max(...coords.map(c => c[1])),
  };
}

// degrees → meters approximation
function degToMeters(latDeg: number) {
  return latDeg * 111_320;
}
function lngDegToMeters(lngDeg: number, lat: number) {
  return lngDeg * 111_320 * Math.cos((lat * Math.PI) / 180);
}

// Build grid of lat/lng points inside bbox, spacing in meters
function buildGrid(
  bbox: { west: number; east: number; south: number; north: number },
  spacingM: number,
): { lat: number; lng: number }[] {
  const midLat = (bbox.south + bbox.north) / 2;
  const latStep = spacingM / 111_320;
  const lngStep = spacingM / (111_320 * Math.cos((midLat * Math.PI) / 180));

  const pts: { lat: number; lng: number }[] = [];
  for (let lat = bbox.south + latStep / 2; lat < bbox.north; lat += latStep) {
    for (let lng = bbox.west + lngStep / 2; lng < bbox.east; lng += lngStep) {
      pts.push({ lat, lng });
    }
  }
  return pts;
}

// Filter grid points that fall inside a GeoJSON polygon
function filterInsidePolygon(
  pts: { lat: number; lng: number }[],
  feature: GeoJSON.Feature,
): { lat: number; lng: number }[] {
  try {
    const poly = feature.geometry.type === "Polygon"
      ? turf.polygon((feature.geometry as GeoJSON.Polygon).coordinates)
      : turf.multiPolygon((feature.geometry as GeoJSON.MultiPolygon).coordinates);

    return pts.filter(p => {
      const pt = turf.point([p.lng, p.lat]);
      return turf.booleanPointInPolygon(pt, poly as any);
    });
  } catch {
    return pts;
  }
}

// Batch elevation fetch from Open-Elevation (max 100 pts per request)
async function fetchElevationBatch(pts: { lat: number; lng: number }[]): Promise<number[]> {
  const BATCH = 100;
  const results: number[] = [];

  for (let i = 0; i < pts.length; i += BATCH) {
    const slice = pts.slice(i, i + BATCH);
    const locations = slice.map(p => ({ latitude: p.lat, longitude: p.lng }));

    const res = await fetch("/api/elevation", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ locations }),
    });

    if (!res.ok) throw new Error(`Elevation API error ${res.status}`);
    const data = await res.json();
    const elevs = (data?.results ?? []).map((r: any) => r?.elevation ?? 0);
    results.push(...elevs);
  }

  return results;
}

// Compute volume results from sampled points
function computeVolume(
  samples: SamplePoint[],
  cellAreaM2: number,
  refMode: RefPlaneMode,
  customBase: number,
  feature: GeoJSON.Feature,
): VolumeResult {
  const elevs = samples.map(s => s.elevation);
  const minElev  = Math.min(...elevs);
  const maxElev  = Math.max(...elevs);
  const meanElev = elevs.reduce((a, b) => a + b, 0) / elevs.length;

  const basePlane =
    refMode === "min"    ? minElev :
    refMode === "mean"   ? meanElev :
    customBase;

  let above = 0;
  let below = 0;
  for (const s of samples) {
    const diff = s.elevation - basePlane;
    if (diff >= 0) above += diff * cellAreaM2;
    else           below += Math.abs(diff) * cellAreaM2;
  }

  // polygon area from turf
  let polygonAreaM2 = 0;
  try {
    polygonAreaM2 = turf.area(feature);
  } catch {}

  return {
    volumeAbove:   above,
    volumeBelow:   below,
    netVolume:     above - below,
    cellArea:      cellAreaM2,
    sampledPoints: samples.length,
    minElev, maxElev, meanElev,
    basePlane,
    polygonAreaM2,
  };
}

function fmtVol(m3: number): string {
  if (Math.abs(m3) >= 1_000_000) return (m3 / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 3 }) + " Mm³";
  if (Math.abs(m3) >= 1_000)     return (m3 / 1_000).toLocaleString(undefined,     { maximumFractionDigits: 3 }) + " km³/1000";
  return m3.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " m³";
}
function fmtArea(m2: number): string {
  if (m2 >= 1_000_000) return (m2 / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " km²";
  return (m2 / 10_000).toLocaleString(undefined, { maximumFractionDigits: 2 }) + " ha";
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function VolumeCalculationPanel({
  selectedFeature,
}: {
  selectedFeature?: GeoJSON.Feature | null;
}) {
  const [resolution,   setResolution]   = useState(100);
  const [refMode,      setRefMode]      = useState<RefPlaneMode>("min");
  const [customBase,   setCustomBase]   = useState(0);
  const [status,       setStatus]       = useState<"idle" | "sampling" | "fetching" | "computing" | "done" | "error">("idle");
  const [progress,     setProgress]     = useState(0); // 0–100
  const [result,       setResult]       = useState<VolumeResult | null>(null);
  const [errorMsg,     setErrorMsg]     = useState<string>("");
  const [samples,      setSamples]      = useState<SamplePoint[]>([]);
  const abortRef = useRef(false);

  const bbox = useMemo(() => selectedFeature ? getFeatureBbox(selectedFeature) : null, [selectedFeature]);
  const polygonCoords = useMemo(() => selectedFeature ? getPolygonCoords(selectedFeature) : null, [selectedFeature]);

  // Estimate point count before running
  const estimatedPoints = useMemo(() => {
    if (!bbox) return 0;
    const midLat = (bbox.south + bbox.north) / 2;
    const widthM  = lngDegToMeters(bbox.east - bbox.west, midLat);
    const heightM = degToMeters(bbox.north - bbox.south);
    const cols = Math.ceil(widthM / resolution);
    const rows = Math.ceil(heightM / resolution);
    // rough: ~60% inside polygon on average for typical shapes
    return Math.round(cols * rows * 0.6);
  }, [bbox, resolution]);

  const cellAreaM2 = resolution * resolution;

  const handleCalculate = async () => {
    if (!selectedFeature || !bbox) return;

    abortRef.current = false;
    setStatus("sampling");
    setProgress(5);
    setResult(null);
    setErrorMsg("");

    try {
      // 1. Build bbox grid
      const grid = buildGrid(bbox, resolution);
      if (!grid.length) throw new Error("Grid is empty — try a larger polygon or coarser resolution");

      setProgress(15);

      // 2. Filter inside polygon
      setStatus("sampling");
      const inside = filterInsidePolygon(grid, selectedFeature);
      if (!inside.length) throw new Error("No grid points fell inside the polygon");

      setProgress(25);

      // 3. Check point limit
      if (inside.length > 500) {
        // warn but continue — Open-Elevation can handle ~500 pts in batches
        // For very large counts, auto-bump resolution
      }

      // 4. Fetch elevation in batches with progress tracking
      setStatus("fetching");
      const BATCH = 100;
      const allElevs: number[] = [];

      for (let i = 0; i < inside.length; i += BATCH) {
        if (abortRef.current) throw new Error("Cancelled");
        const slice = inside.slice(i, i + BATCH);
        const elevs = await fetchElevationBatch(slice);
        allElevs.push(...elevs);
        setProgress(25 + Math.round(((i + BATCH) / inside.length) * 60));
      }

      setStatus("computing");
      setProgress(88);

      // 5. Assemble samples
      const pts: SamplePoint[] = inside.map((p, idx) => ({
        lat: p.lat,
        lng: p.lng,
        elevation: allElevs[idx] ?? 0,
      }));
      setSamples(pts);

      // 6. Compute volume
      const res = computeVolume(pts, cellAreaM2, refMode, customBase, selectedFeature);
      setResult(res);
      setProgress(100);
      setStatus("done");

    } catch (err: any) {
      if (abortRef.current) { setStatus("idle"); return; }
      setErrorMsg(err?.message ?? "Unknown error");
      setStatus("error");
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    setStatus("idle");
    setProgress(0);
  };

  const handleExport = () => {
    if (!result || !samples.length) return;
    const data = {
      summary: result,
      samples: samples.map(s => ({ lat: s.lat, lng: s.lng, elevation_m: s.elevation })),
      polygon: selectedFeature?.geometry,
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `volume_calc_${Date.now()}.json`;
    a.click();
  };

  const isBusy = status === "sampling" || status === "fetching" || status === "computing";

  // ── Status label ──────────────────────────────────────────────────────────────
  const statusLabel =
    status === "sampling"  ? "Building sample grid…"         :
    status === "fetching"  ? "Fetching elevation data…"       :
    status === "computing" ? "Computing volume…"              :
    status === "done"      ? "Done"                           :
    status === "error"     ? "Error"                          : "";

  return (
    <div className="flex flex-col gap-4 text-slate-200 text-sm">

      {/* ── Header chip ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-widest font-semibold">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3h18v18H3z"/><path d="m3 9 9-6 9 6"/><path d="M9 21V9l3-2 3 2v12"/>
        </svg>
        DEM Volume Calculator
      </div>

      {/* ── AOI Status ───────────────────────────────────────────────────────── */}
      <div className={`rounded-xl border px-3 py-2.5 text-xs flex items-center gap-2 ${
        selectedFeature
          ? "bg-cyan-400/5 border-cyan-400/25 text-cyan-300"
          : "bg-white/[0.03] border-white/10 text-slate-500"
      }`}>
        {selectedFeature ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-cyan-400">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span>
              Polygon selected
              {bbox && (
                <span className="text-slate-400 ml-1">
                  · {((bbox.east - bbox.west) * 111_320 / 1000).toFixed(1)} × {((bbox.north - bbox.south) * 111_320 / 1000).toFixed(1)} km
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            Draw a polygon on the map first (Polygon or Rectangle tool)
          </>
        )}
      </div>

      {/* ── Grid Resolution ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">Sample Grid Resolution</label>
        <div className="grid grid-cols-3 gap-1.5">
          {RESOLUTION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setResolution(opt.value)}
              className={`rounded-lg border px-2 py-2 text-[0.65rem] text-center transition-all cursor-pointer leading-tight ${
                resolution === opt.value
                  ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-300"
                  : "bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20"
              }`}
            >
              <div className="font-semibold text-[0.7rem]">{opt.label.split(" ")[0]}</div>
              <div className="text-slate-500">{opt.label.split("(")[1]?.replace(")", "")}</div>
            </button>
          ))}
        </div>
        {bbox && (
          <p className="text-[0.65rem] text-slate-500">
            ~{estimatedPoints.toLocaleString()} sample points inside polygon
            {estimatedPoints > 400 && (
              <span className="text-amber-400 ml-1">· may be slow, consider Coarse</span>
            )}
          </p>
        )}
      </div>

      {/* ── Reference Plane ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <label className="text-xs text-slate-400 font-medium">Reference Base Plane</label>
        <div className="flex flex-col gap-1.5">
          {([
            { id: "min",    label: "Minimum elevation",  desc: "Volume above lowest point" },
            { id: "mean",   label: "Mean elevation",     desc: "Cut/fill balance plane" },
            { id: "custom", label: "Custom altitude",    desc: "Specify exact base (m)" },
          ] as { id: RefPlaneMode; label: string; desc: string }[]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setRefMode(opt.id)}
              className={`rounded-lg border px-3 py-2 flex items-center gap-2.5 text-left transition-all cursor-pointer ${
                refMode === opt.id
                  ? "bg-cyan-400/10 border-cyan-400/30 text-slate-200"
                  : "bg-white/[0.02] border-white/[0.08] text-slate-400 hover:border-white/15"
              }`}
            >
              <div className={`w-3 h-3 rounded-full border-2 shrink-0 transition-all ${
                refMode === opt.id ? "border-cyan-400 bg-cyan-400" : "border-slate-600"
              }`} />
              <div>
                <div className="text-xs font-medium">{opt.label}</div>
                <div className="text-[0.62rem] text-slate-500">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {refMode === "custom" && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={customBase}
              onChange={e => setCustomBase(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-[#0d1f3c] border border-white/15 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400/50"
              placeholder="Base elevation (m)"
              step="1"
            />
            <span className="text-xs text-slate-500 shrink-0">meters (MSL)</span>
          </div>
        )}
      </div>

      {/* ── Calculate Button ──────────────────────────────────────────────────── */}
      {!isBusy ? (
        <button
          onClick={handleCalculate}
          disabled={!selectedFeature || !bbox}
          className={`w-full rounded-xl py-2.5 text-sm font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${
            selectedFeature
              ? "bg-cyan-400 text-[#040d1a] hover:bg-cyan-300 shadow-[0_0_20px_rgba(0,212,255,0.3)]"
              : "bg-white/[0.06] text-slate-500 cursor-not-allowed"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 3h18v18H3z"/><path d="m3 9 9-6 9 6"/><path d="M9 21V9l3-2 3 2v12"/>
          </svg>
          Calculate Volume
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          {/* Progress bar */}
          <div className="w-full h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{statusLabel}</span>
            <button
              onClick={handleCancel}
              className="text-[0.65rem] text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {status === "error" && (
        <div className="rounded-xl bg-red-400/10 border border-red-400/25 px-3 py-2.5 text-xs text-red-300 flex items-start gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
          </svg>
          {errorMsg || "Calculation failed. Try a coarser resolution or smaller polygon."}
        </div>
      )}

      {/* ── Results ──────────────────────────────────────────────────────────── */}
      {result && status === "done" && (
        <div className="flex flex-col gap-3">

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[0.62rem] text-slate-600 uppercase tracking-widest">Results</span>
            <div className="flex-1 h-px bg-white/[0.06]" />
          </div>

          {/* Main volume cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-cyan-400/8 border border-cyan-400/20 px-3 py-3">
              <div className="text-[0.6rem] text-cyan-400/70 uppercase tracking-widest mb-1">Volume Above</div>
              <div className="text-base font-bold text-cyan-300">{fmtVol(result.volumeAbove)}</div>
              <div className="text-[0.6rem] text-slate-500 mt-0.5">above base plane</div>
            </div>
            <div className="rounded-xl bg-amber-400/8 border border-amber-400/20 px-3 py-3">
              <div className="text-[0.6rem] text-amber-400/70 uppercase tracking-widest mb-1">Volume Below</div>
              <div className="text-base font-bold text-amber-300">{fmtVol(result.volumeBelow)}</div>
              <div className="text-[0.6rem] text-slate-500 mt-0.5">below base plane (cut)</div>
            </div>
          </div>

          {/* Net volume */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 flex items-center justify-between">
            <div>
              <div className="text-[0.6rem] text-slate-500 uppercase tracking-widest">Net Volume (Fill − Cut)</div>
              <div className={`text-sm font-bold mt-0.5 ${result.netVolume >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {result.netVolume >= 0 ? "+" : ""}{fmtVol(result.netVolume)}
              </div>
            </div>
            <div className="text-2xl">{result.netVolume >= 0 ? "⛰️" : "🕳️"}</div>
          </div>

          {/* Stats grid */}
          <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] overflow-hidden">
            {[
              { label: "Base Plane",       value: `${result.basePlane.toFixed(1)} m` },
              { label: "Min Elevation",    value: `${result.minElev.toFixed(1)} m` },
              { label: "Max Elevation",    value: `${result.maxElev.toFixed(1)} m` },
              { label: "Mean Elevation",   value: `${result.meanElev.toFixed(1)} m` },
              { label: "Polygon Area",     value: fmtArea(result.polygonAreaM2) },
              { label: "Sample Points",    value: result.sampledPoints.toLocaleString() },
              { label: "Cell Size",        value: `${Math.sqrt(result.cellArea).toFixed(0)} × ${Math.sqrt(result.cellArea).toFixed(0)} m` },
            ].map((row, i) => (
              <div key={row.label} className={`flex items-center justify-between px-3 py-2 ${i > 0 ? "border-t border-white/[0.05]" : ""}`}>
                <span className="text-xs text-slate-500">{row.label}</span>
                <span className="text-xs text-slate-200 font-mono">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Elevation mini-histogram */}
          <ElevationMiniChart samples={samples} basePlane={result.basePlane} />

          {/* Export */}
          <button
            onClick={handleExport}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 text-xs py-2 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export JSON (samples + summary)
          </button>

          {/* Data source note */}
          <p className="text-[0.6rem] text-slate-600 text-center leading-relaxed">
            Elevation data: Open-Elevation (SRTM 30m) · {result.sampledPoints} pts × {Math.sqrt(result.cellArea).toFixed(0)} m grid
          </p>
        </div>
      )}
    </div>
  );
}

// ── Mini elevation histogram ───────────────────────────────────────────────────
function ElevationMiniChart({
  samples,
  basePlane,
}: {
  samples: SamplePoint[];
  basePlane: number;
}) {
  if (!samples.length) return null;

  const elevs = samples.map(s => s.elevation);
  const min = Math.min(...elevs);
  const max = Math.max(...elevs);
  const range = Math.max(max - min, 1);

  // 20-bin histogram
  const BINS = 20;
  const counts = new Array(BINS).fill(0);
  for (const e of elevs) {
    const idx = Math.min(BINS - 1, Math.floor(((e - min) / range) * BINS));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);

  // base plane position as fraction
  const baseFrac = Math.max(0, Math.min(1, (basePlane - min) / range));

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.08] p-3">
      <div className="text-[0.6rem] text-slate-500 uppercase tracking-widest mb-2">Elevation Distribution</div>
      <div className="flex items-end gap-0.5 h-12 relative">
        {counts.map((c, i) => {
          const h = maxCount > 0 ? (c / maxCount) * 100 : 0;
          const elev = min + (i / BINS) * range;
          const isAbove = elev >= basePlane;
          return (
            <div
              key={i}
              title={`${elev.toFixed(0)}m: ${c} pts`}
              className="flex-1 rounded-t-sm transition-all"
              style={{
                height: `${Math.max(2, h)}%`,
                background: isAbove
                  ? "rgba(0,212,255,0.6)"
                  : "rgba(251,191,36,0.5)",
              }}
            />
          );
        })}
        {/* Base plane line */}
        <div
          className="absolute bottom-0 top-0 w-px bg-white/40"
          style={{ left: `${baseFrac * 100}%` }}
        />
      </div>
      <div className="flex justify-between text-[0.58rem] text-slate-600 mt-1">
        <span>{min.toFixed(0)} m</span>
        <span className="text-slate-500">base: {basePlane.toFixed(0)} m</span>
        <span>{max.toFixed(0)} m</span>
      </div>
      <div className="flex gap-3 mt-2 text-[0.58rem]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background:"rgba(0,212,255,0.6)"}}/> Above base (fill)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block" style={{background:"rgba(251,191,36,0.5)"}}/> Below base (cut)</span>
      </div>
    </div>
  );
}