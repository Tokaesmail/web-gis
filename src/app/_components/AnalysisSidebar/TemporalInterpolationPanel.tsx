"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Temporal Interpolation Panel (Insight ▸ Interpolation)
// ─────────────────────────────────────────────────────────────────────────────
// Flow: the user draws a shape on the map → picks a Sentinel-2 index → sets a
// date range (from/to) plus the target date in between → searches STAC scenes →
// ticks the scenes to use → Run. The backend (/api/raster-proxy/interpolate)
// computes the index per pixel for every date and interpolates it to the
// target date; the result is placed on the map as a georeferenced overlay.
//
// Same path as SatelliteDataPanel for: STAC search, cloud filter, reading the
// assets from the item, and showing the result as an overlay. What is new here
// is the temporal stack and the interpolation itself.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getFeatureBounds, getMidCoords } from "./geoFeatureUtils";
import { SOURCE_COLLECTIONS, type SatelliteAnalysisType } from "./SatellitePipelines";
import {
  INTERPOLATION_INDICES,
  LINEAR_METHOD_HINT,
  LINEAR_METHOD_LABEL,
  DEFAULT_MASKED_SCL_CLASSES,
  daysBetween,
  getInterpolationStyle,
  indexRouteType,
  resolveSceneBandUrls,
  resolveSclUrl,
  S2_INDEX_ASSETS,
  type InterpolationMeta,
  type InterpolationPreviewConfig,
} from "./temporalInterpolation";

type InterpScene = {
  id: string;
  date: string;
  cloud: number;
  thumbnail?: string;
  assets: Record<string, string>;
};

type StacFeature = {
  id?: string;
  properties?: { datetime?: string; "eo:cloud_cover"?: number };
  assets?: Record<string, { href?: string } | undefined>;
};

type ResultState = {
  dataUrl: string;
  bounds: [[number, number], [number, number]];
  stats?: { min: number; max: number; mean: number; validPixels: number; appliedRange: [number, number] };
  meta?: InterpolationMeta;
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const shiftISO = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);

// The native <input type="date"> picker's displayed order (day/month/year vs
// month/day/year) is controlled by the browser/OS locale, not by the page's
// `lang` attribute — it isn't reliably forceable, and overlaying custom text
// on top of the native input is fragile (it renders differently across
// browsers). So instead: the native input stays off-screen (sr-only, still
// used for its picker + validation), and a plain button shows our own
// DD/MM/YYYY label and opens the picker on click.
const formatDMY = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

// Opt-in selection shortcut (the "Select N before + N after" button): the N closest
// scenes strictly before the target date (date < target) plus the N closest strictly
// after it (date > target). A scene ON the target date is deliberately left out — it
// is neither "before" nor "after", and taking it would skip the interpolation.
// N = 6 → 12 scenes, which is exactly the route's MAX_SCENES.
const NEAREST_PER_SIDE = 6;
const pickNearestScenes = <T extends { date: string }>(sorted: T[], target: string): T[] => {
  const before = sorted.filter((s) => s.date < target).slice(-NEAREST_PER_SIDE);
  const after = sorted.filter((s) => s.date > target).slice(0, NEAREST_PER_SIDE);
  return [...before, ...after];
};

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 opacity-70">
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

function DateField({
  value,
  onChange,
  min,
  max,
  accent = false,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  accent?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    if (typeof (el as HTMLInputElement & { showPicker?: () => void }).showPicker === "function") {
      (el as HTMLInputElement & { showPicker: () => void }).showPicker();
    } else {
      el.focus();
      el.click();
    }
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPicker}
        className={`flex h-8 w-full items-center justify-between rounded-lg border px-2.5 font-mono text-[0.8rem] outline-none transition ${
          accent
            ? "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-200 hover:border-cyan-400/50"
            : "border-white/[0.08] bg-[#020817]/70 text-slate-200 hover:border-cyan-400/40"
        }`}
      >
        <span>{formatDMY(value)}</span>
        <CalendarIcon />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        // Inline style (not a class) so it can't be overridden by any global
        // CSS in the app — this is what was leaking the native field visibly
        // below the button before.
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

export default function TemporalInterpolationPanel({
  selectedFeature,
  onPreview,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  onPreview?: (config: InterpolationPreviewConfig | null) => void;
}) {
  const { data: session } = useSession();
  const token = (session as unknown as { accessToken?: string })?.accessToken ?? null;

  // ── AOI ───────────────────────────────────────────────────────────────────
  const bounds = useMemo(() => getFeatureBounds(selectedFeature), [selectedFeature]);
  const coords = useMemo(() => getMidCoords(selectedFeature), [selectedFeature]);
  const bbox = useMemo<[number, number, number, number] | null>(() => {
    if (!bounds) return null;
    const [[south, west], [north, east]] = bounds as [[number, number], [number, number]];
    return [west, south, east, north];
  }, [bounds]);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<SatelliteAnalysisType>("NDVI");
  const [dateFrom, setDateFrom] = useState(() => shiftISO(todayISO(), -90));
  const [dateTo, setDateTo] = useState(() => todayISO());
  const [targetDate, setTargetDate] = useState(() => shiftISO(todayISO(), -45));
  const [cloudCover, setCloudCover] = useState(30);
  const [useScl, setUseScl] = useState(true);
  const [opacity, setOpacity] = useState(0.85);

  // ── Scenes ────────────────────────────────────────────────────────────────
  const [scenes, setScenes] = useState<InterpScene[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // ── Result ────────────────────────────────────────────────────────────────
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Revoke old blob URLs — same object-URL build-up issue that was fixed in MapClient.
  const setResultImage = (next: ResultState | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = next?.dataUrl ?? null;
    setResult(next);
  };
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  // If the user changes the shape or the index, the old result becomes
  // misleading — remove it from the map instead of leaving it displayed
  // under different settings.
  useEffect(() => {
    setResultImage(null);
    onPreview?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis, selectedFeature]);

  const requiredBands = S2_INDEX_ASSETS[analysis] ?? [];
  const targetInRange = targetDate >= dateFrom && targetDate <= dateTo;
  const selectedScenes = scenes.filter((s) => selectedIds.includes(s.id));
  // Strict sides: before = date < target, after = date > target.
  const hasBefore = selectedScenes.some((s) => s.date < targetDate);
  const hasAfter = selectedScenes.some((s) => s.date > targetDate);
  // A selected scene on the target date itself: pixels valid in it are used as-is.
  const targetIsObservedScene = selectedScenes.some((s) => s.date === targetDate);

  // ── Scene search (STAC) ───────────────────────────────────────────────────
  const searchScenes = async () => {
    if (!bbox) return;
    setSearchStatus("loading");
    setError(null);
    setScenes([]);
    setSelectedIds([]);

    try {
      const baseBody = {
        collections: [SOURCE_COLLECTIONS["sentinel-2"]],
        bbox,
        datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
        limit: 100,
      };

      let features: StacFeature[] = [];
      let nextReq: { url: string; body: Record<string, unknown> } | null = {
        url: "/api/stac-proxy/search",
        body: baseBody,
      };
      let page = 0;
      while (nextReq && page < 5 && features.length < 300) {
        const res: Response = await fetch(nextReq.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextReq.body),
        });
        if (!res.ok) throw new Error(`STAC API ${res.status}`);
        const payload: any = await res.json();
        const pageFeatures: StacFeature[] = Array.isArray(payload?.features) ? payload.features : [];
        features = features.concat(pageFeatures);
        const nextLink = Array.isArray(payload?.links)
          ? payload.links.find((l: { rel?: string }) => l?.rel === "next")
          : null;
        nextReq = nextLink?.href && nextLink?.body ? { url: nextLink.href, body: nextLink.body } : null;
        page += 1;
        if (!pageFeatures.length) break;
      }

      const mapped = features
        .map((f): InterpScene => {
          const props = f.properties ?? {};
          const assets = Object.entries(f.assets ?? {}).reduce<Record<string, string>>((acc, [key, asset]) => {
            if (!asset?.href) return acc;
            acc[key] = asset.href;
            acc[key.toUpperCase()] = asset.href;
            acc[key.toLowerCase()] = asset.href;
            return acc;
          }, {});
          return {
            id: String(f.id ?? "scene"),
            date: String(props.datetime ?? "").slice(0, 10) || dateTo,
            cloud: Math.round(Number(props["eo:cloud_cover"] ?? 0)),
            thumbnail: f.assets?.rendered_preview?.href ?? f.assets?.thumbnail?.href,
            assets,
          };
        })
        .filter((s) => s.cloud <= cloudCover)
        // The scene must contain every band this index needs, otherwise it is unusable.
        .filter((s) => Boolean(resolveSceneBandUrls(s.assets, analysis)))
        // One scene per date is enough (a date can return several tiles) — keep the clearest.
        .sort((a, b) => (a.date === b.date ? a.cloud - b.cloud : a.date.localeCompare(b.date)))
        .filter((s, i, arr) => i === 0 || arr[i - 1].date !== s.date);

      setScenes(mapped);
      setSearchStatus("success");

      if (!mapped.length) {
        setError("No Sentinel-2 scenes matched this AOI / date range / cloud filter.");
        return;
      }

      // No auto-selection: the user picks the scenes they want (selection was cleared
      // when the search started). The "Select N before + N after" button is an opt-in shortcut.
    } catch (err) {
      setSearchStatus("error");
      setError(err instanceof Error ? err.message : "STAC search failed.");
    }
  };

  const toggleScene = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // ── Run interpolation ─────────────────────────────────────────────────────
  const runInterpolation = async () => {
    if (!bbox || selectedScenes.length < 2) return;
    setRunning(true);
    setError(null);

    try {
      const style = getInterpolationStyle(analysis);
      const payload = {
        type: indexRouteType(analysis),
        bbox,
        target: targetDate,
        useScl,
        maskClasses: DEFAULT_MASKED_SCL_CLASSES,
        colormap: style.colormap,
        min: style.min,
        max: style.max,
        token,
        scenes: selectedScenes.map((s) => ({
          id: s.id,
          date: s.date,
          urls: resolveSceneBandUrls(s.assets, analysis) ?? [],
          sclUrl: useScl ? resolveSclUrl(s.assets) : null,
        })),
      };

      const res = await fetch("/api/raster-proxy/interpolate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? `Interpolation failed (${res.status})`);
      }

      const realBbox = (res.headers.get("X-Real-Bbox") ?? "").split(",").map(Number);
      const stats = JSON.parse(res.headers.get("X-Raster-Stats") ?? "null") ?? undefined;
      const meta = JSON.parse(res.headers.get("X-Interp-Meta") ?? "null") ?? undefined;

      const blob = await res.blob();
      const dataUrl = URL.createObjectURL(blob);

      // X-Real-Bbox = [west, south, east, north] → Leaflet bounds [[S,W],[N,E]]
      const outBounds: [[number, number], [number, number]] =
        realBbox.length === 4 && realBbox.every(Number.isFinite)
          ? [
              [realBbox[1], realBbox[0]],
              [realBbox[3], realBbox[2]],
            ]
          : (bounds as [[number, number], [number, number]]);

      setResultImage({ dataUrl, bounds: outBounds, stats, meta });

      onPreview?.({
        name: `${analysis} — interpolated ${targetDate}`,
        indexKey: indexRouteType(analysis),
        analysis,
        method: "linear",
        targetDate,
        bounds: outBounds,
        coords: { lat: coords?.[0] ?? 0, lng: coords?.[1] ?? 0 },
        opacity,
        colorRamp: getInterpolationStyle(analysis).colormap,
        dataUrl,
        stats,
        meta,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Interpolation failed.");
    } finally {
      setRunning(false);
    }
  };

  // ── UI ────────────────────────────────────────────────────────────────────
  const canRun = Boolean(bbox) && selectedScenes.length >= 2 && targetInRange && !running;

  return (
    <div className="space-y-3">
      {!selectedFeature && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" className="shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p dir="rtl" className="flex-1 text-[0.78rem] leading-relaxed text-amber-300">
First, draw a shape on the map             </p>
        </div>
      )}

      {/* Index */}
      <label className="block space-y-1">
        <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">Index (Sentinel-2)</span>
        <select
          value={analysis}
          onChange={(e) => setAnalysis(e.target.value as SatelliteAnalysisType)}
          className="h-8 w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 text-[0.8rem] text-slate-200 outline-none focus:border-cyan-400/40"
        >
          {INTERPOLATION_INDICES.map((idx) => (
            <option key={idx} value={idx}>{idx}</option>
          ))}
        </select>
        <span className="block text-[0.72rem] text-slate-500">Bands: {requiredBands.join(", ")}</span>
      </label>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">From</span>
          <DateField value={dateFrom} onChange={setDateFrom} max={dateTo} />
        </label>
        <label className="space-y-1">
          <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">To</span>
          <DateField value={dateTo} onChange={setDateTo} min={dateFrom} />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[0.72rem] uppercase tracking-wider text-cyan-400/80">Target date (interpolated)</span>
        <DateField value={targetDate} onChange={setTargetDate} min={dateFrom} max={dateTo} accent />
        {!targetInRange && (
          <span dir="rtl" className="block text-[0.78rem] leading-relaxed text-amber-300">لازم التاريخ المطلوب يكون جوه المدى (From → To)</span>
        )}
      </label>

      {/* Method */}
      <div className="space-y-1">
        <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">Interpolation method</span>
        <div className="flex h-8 w-full items-center rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 text-[0.8rem] text-slate-200">
          {LINEAR_METHOD_LABEL}
        </div>
        <span className="block text-[0.78rem] leading-relaxed text-slate-400">{LINEAR_METHOD_HINT}</span>
      </div>

      {/* Cloud + SCL */}
      <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">Max cloud cover</span>
          <span className="text-[0.8rem] font-semibold text-cyan-300">{cloudCover}%</span>
        </div>
        <input type="range" min={0} max={80} value={cloudCover}
          onChange={(e) => setCloudCover(Number(e.target.value))} className="w-full accent-cyan-400" />

        <button
          type="button"
          onClick={() => setUseScl((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
        >
          <span className="min-w-0 flex-1 pr-2">
            <span className="block text-[0.78rem] text-slate-200">Per-pixel cloud mask (SCL)</span>
            <span dir="rtl" className="block text-[0.78rem] leading-relaxed text-slate-400">
It removes cloud, shadow, and cirrus pixels from each image prior to interpolation—it is more accurate, but it reads an additional band for each scene.            </span>
          </span>
          <span className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition ${useScl ? "bg-cyan-400/70" : "bg-slate-700"}`}>
            <span className={`block h-4 w-4 rounded-full bg-white transition ${useScl ? "translate-x-4" : ""}`} />
          </span>
        </button>
      </div>

      {/* Search */}
      <button
        type="button"
        onClick={searchScenes}
        disabled={!bbox || searchStatus === "loading"}
        className="h-8 w-full rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-[0.8rem] font-medium text-cyan-300 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {searchStatus === "loading" ? "Searching…" : "Search scenes"}
      </button>

      {/* Scene list */}
      {scenes.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">
              Scenes ({selectedScenes.length}/{scenes.length} selected)
            </span>
            <button
              type="button"
              onClick={() =>
                setSelectedIds(selectedIds.length ? [] : pickNearestScenes(scenes, targetDate).map((s) => s.id))
              }
              className="text-[0.72rem] text-cyan-400 hover:text-cyan-300"
            >
              {selectedIds.length ? "Clear" : `Select ${NEAREST_PER_SIDE} before + ${NEAREST_PER_SIDE} after`}
            </button>
          </div>

          <div className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
            {scenes.map((scene) => {
              const active = selectedIds.includes(scene.id);
              const delta = Math.round(daysBetween(targetDate, scene.date));
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => toggleScene(scene.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition ${
                    active
                      ? "border-cyan-400/30 bg-cyan-400/[0.08]"
                      : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                      active ? "border-cyan-400 bg-cyan-400/70" : "border-slate-600"
                    }`}
                  >
                    {active && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-2 w-2">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[0.78rem] text-slate-200">{scene.date}</span>
                    <span className="block text-[0.72rem] text-slate-500">
                      {delta === 0 ? "Same as target date" : delta < 0 ? `${Math.abs(delta)} d before target` : `${delta} d after target`}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[0.68rem] ${
                    scene.cloud <= 10 ? "bg-emerald-400/10 text-emerald-300" : "bg-amber-400/10 text-amber-300"
                  }`}>
                    {scene.cloud}% cloud
                  </span>
                </button>
              );
            })}
          </div>

          {selectedScenes.length >= 2 && (!hasBefore || !hasAfter) && (
            <p dir="rtl" className="rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1.5 text-[0.75rem] leading-relaxed text-amber-300">
              كل المشاهد المختارة على جنب واحد من التاريخ المطلوب — النتيجة هتبقى امتداد (extrapolation) مش انتربوليشن حقيقي.
              اختار مشهد واحد على الأقل {hasBefore ? "بعد" : "قبل"} {targetDate}.
            </p>
          )}

          {targetIsObservedScene && (
            <p className="rounded-lg border border-sky-400/20 bg-sky-400/[0.07] px-2.5 py-1.5 text-[0.75rem] leading-relaxed text-sky-300">
              Target date matches an observed scene — no interpolation is required.
            </p>
          )}
        </div>
      )}

      {/* Run */}
      <button
        type="button"
        onClick={runInterpolation}
        disabled={!canRun}
        className="flex h-8 w-full items-center justify-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-[0.8rem] font-medium text-cyan-300 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running && (
          <svg className="h-4 w-4 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {running ? "Interpolating…" : `Interpolate ${analysis} → ${targetDate}`}
      </button>
      {selectedScenes.length < 2 && scenes.length > 0 && (
        <p dir="rtl" className="text-center text-[0.78rem] text-slate-400">اختار مشهدين على الأقل</p>
      )}

      {error && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/[0.07] px-2.5 py-2 text-[0.78rem] leading-relaxed text-red-300">
          {error}
        </p>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
          <img src={result.dataUrl} alt={`${analysis} interpolated`} className="w-full rounded-lg border border-white/[0.06]" />

          <label className="block space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[0.72rem] uppercase tracking-wider text-slate-500">Overlay opacity</span>
              <span className="text-[0.8rem] font-semibold text-cyan-300">{Math.round(opacity * 100)}%</span>
            </div>
            <input
              type="range" min={0.1} max={1} step={0.05} value={opacity}
              onChange={(e) => {
                const next = Number(e.target.value);
                setOpacity(next);
                // ⚠️ Send the full config built from the current result values (not from
                // state inside a stale closure) — same stale-closure bug that was fixed
                // in PalmTreesPanel when the colormap toggle sent an old value.
                onPreview?.({
                  name: `${analysis} — interpolated ${result.meta?.targetDate ?? targetDate}`,
                  indexKey: indexRouteType(analysis),
                  analysis,
                  method: "linear",
                  targetDate: result.meta?.targetDate ?? targetDate,
                  bounds: result.bounds,
                  coords: { lat: coords?.[0] ?? 0, lng: coords?.[1] ?? 0 },
                  opacity: next,
                  colorRamp: getInterpolationStyle(analysis).colormap,
                  dataUrl: result.dataUrl,
                  stats: result.stats,
                  meta: result.meta,
                });
              }}
              className="w-full accent-cyan-400"
            />
          </label>

          {result.meta && (
            <dl className="grid grid-cols-2 gap-1.5 text-[0.75rem]">
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <dt className="text-slate-500" title="Share of pixels that received a valid output value">Output coverage</dt>
                <dd className="font-mono text-slate-200">{result.meta.coverage}%</dd>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <dt className="text-slate-500" title="Pixels whose valid observations are all on one side of the target date">One-sided (held)</dt>
                <dd className="font-mono text-slate-200">{result.meta.extrapolated}%</dd>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <dt className="text-slate-500">Valid observations / pixel</dt>
                <dd className="font-mono text-slate-200">{result.meta.meanValidObservations}</dd>
              </div>
              <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
                <dt
                  className="text-slate-500"
                  title="Mean time between the observation used before the target and the one used after it — only pixels with both"
                >
                  Mean interpolation gap
                </dt>
                <dd className="font-mono text-slate-200">
                  {result.meta.meanInterpolationGapDays != null ? `${result.meta.meanInterpolationGapDays} d` : "—"}
                </dd>
              </div>
              <div
                className="col-span-2 rounded-lg bg-white/[0.03] px-2 py-1.5"
                title="Mean distance from the target date to the nearest observation — only one-sided pixels"
              >
                <dt className="text-slate-500">Mean extrapolation distance</dt>
                <dd className="font-mono text-slate-200">
                  {result.meta.meanExtrapolationDistanceDays != null ? `${result.meta.meanExtrapolationDistanceDays} d` : "—"}
                </dd>
              </div>
            </dl>
          )}

          {result.stats && (
            <p className="text-[0.72rem] text-slate-500">
              min {result.stats.min.toFixed(3)} · max {result.stats.max.toFixed(3)} · mean {result.stats.mean.toFixed(3)}
            </p>
          )}

          {result.meta?.perScene?.length ? (
            <details className="text-[0.72rem] text-slate-500">
              <summary className="cursor-pointer text-slate-400">Valid pixels per scene</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {result.meta.perScene.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span>{s.date}</span>
                    <span>{s.validPercent}%</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <button
            type="button"
            onClick={() => { setResultImage(null); onPreview?.(null); }}
            className="h-8 w-full rounded-lg border border-white/[0.08] text-[0.78rem] text-slate-400 transition hover:bg-white/[0.05]"
          >
            Remove from map
          </button>
        </div>
      )}
    </div>
  );
}