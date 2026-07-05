import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFeatureBounds, getMidCoords } from "./geoFeatureUtils";
import { clipImageToPolygon, getPolygonRing } from "./geoClipUtils";

// ─── Types ──────────────────────────────────────────────────────────────────
type ChangeIndexKey = "NDVI" | "NDWI" | "NDBI";
type ChangeDirection = "increase" | "decrease" | "both";

export interface ChangeDetectionPreviewConfig {
  name: string;
  indexKey: ChangeIndexKey;
  expression: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]];
  opacity: number;
  colorRamp: string;
  dataUrl: string;
}

/** Real, georeferenced on-map Before/After swipe config — Change Detection only */
export interface ChangeDetectionSwipeConfig {
  beforeUrl: string;
  afterUrl: string;
  bounds: [[number, number], [number, number]];
  beforeLabel?: string;
  afterLabel?: string;
}

interface StacFeature {
  id?: string;
  geometry?: GeoJSON.Geometry | null;
  bbox?: number[];
  properties?: {
    datetime?: string;
    "eo:cloud_cover"?: number;
    "landsat:cloud_cover_land"?: number;
  };
  assets?: Record<string, { href?: string; type?: string; title?: string } | undefined>;
}

interface SatelliteScene {
  id: string;
  date: string;
  cloud: number;
  collection: string;
  thumbnail?: string;
  assets: Record<string, string>;
  bbox?: number[];
}

const CHANGE_INDEX_DEFS: Record<ChangeIndexKey, {
  label: string;
  desc: string;
  assets: [string, string]; // [a, b] -> (a-b)/(a+b)
  color: string;
  // tighter rescale than the raw [-1,1] index range = much more vivid, less washed-out preview colors
  rescale: string;
}> = {
  NDVI: { label: "NDVI", desc: "Vegetation change (NIR, Red)", assets: ["B08", "B04"], color: "#22c55e", rescale: "-0.2,0.75" },
  NDWI: { label: "NDWI", desc: "Water extent change (Green, NIR)", assets: ["B03", "B08"], color: "#38bdf8", rescale: "-0.3,0.5" },
  NDBI: { label: "NDBI", desc: "Built-up / urban change (SWIR, NIR)", assets: ["B11", "B08"], color: "#f97316", rescale: "-0.35,0.35" },
};

// Maps the panel's index selector to the server-side change-detection analysis
// type exposed by /api/raster-proxy/analyze — the actual classification (5
// clear classes, computed from real band math, not colorized-PNG guessing)
// happens server-side in that route.
const CHANGE_API_TYPE: Record<ChangeIndexKey, string> = {
  NDVI: "change_ndvi",
  NDWI: "change_ndwi",
  NDBI: "change_ndbi",
};

interface ChangeLegendItem { key: string; label: string; color: string }
interface ChangeStats {
  noDataPct: number;
  noChangePct: number;
  gainPct: number;
  lossPct: number;
  otherPct: number;
}

// Fallback legend (labels/colors) in case the API response is missing the
// X-Change-Legend header for some reason — mirrors route.ts exactly.
function defaultChangeLegend(indexKey: ChangeIndexKey): ChangeLegendItem[] {
  const GAIN_LOSS_LABELS: Record<ChangeIndexKey, [string, string]> = {
    NDVI: ["Vegetation Gain", "Vegetation Loss"],
    NDWI: ["Water Gain", "Water Loss"],
    NDBI: ["Built-up Gain", "Built-up Loss"],
  };
  const [gainLabel, lossLabel] = GAIN_LOSS_LABELS[indexKey];
  return [
    { key: "gain", label: gainLabel, color: "#00c853" },
    { key: "noChange", label: "No Change", color: "#228b22" },
    { key: "loss", label: lossLabel, color: "#e53935" },
    { key: "other", label: "Other Change", color: "#eab308" },
    { key: "noData", label: "No Data", color: "#9ca3af" },
  ];
}

function bboxGeometry(bbox: number[]): GeoJSON.Polygon {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return {
    type: "Polygon",
    coordinates: [[
      [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
    ]],
  };
}

function stacBBoxToBounds(bbox?: number[], fallback?: [[number, number], [number, number]]) {
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [west, south, east, north] = bbox.map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      return [[south, west], [north, east]] as [[number, number], [number, number]];
    }
  }
  return fallback ?? [[30.0094, 31.2007], [30.0794, 31.2707]] as [[number, number], [number, number]];
}

function boundsCenter(bounds: [[number, number], [number, number]]) {
  const [[south, west], [north, east]] = bounds;
  return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

function normalizeBandAssetKey(key: string) {
  const upper = key.toUpperCase();
  const match = upper.match(/^B0?(\d{1,2})$/);
  return match ? `B${match[1].padStart(2, "0")}` : upper;
}

function getAssetLookupKeys(assetKey: string) {
  const normalizedKey = normalizeBandAssetKey(assetKey);
  return Array.from(new Set([
    assetKey, normalizedKey, assetKey.toLowerCase(), assetKey.toUpperCase(),
    assetKey.replace(/^B0/, "B"), normalizedKey.replace(/^B0/, "B"),
  ]));
}

function getSceneAssetUrl(scene: SatelliteScene, assetKey: string) {
  return getAssetLookupKeys(assetKey).map((key) => scene.assets[key]).find(Boolean);
}

function makePreviewUrl(
  scene: SatelliteScene,
  indexKey: ChangeIndexKey,
  bbox: [number, number, number, number], // [west, south, east, north] — the AOI, not the scene tile
) {
  const { assets, rescale } = CHANGE_INDEX_DEFS[indexKey];
  if (!scene.id || !scene.collection) return scene.thumbnail;
  const aHref = getSceneAssetUrl(scene, assets[0]);
  const bHref = getSceneAssetUrl(scene, assets[1]);
  if (!aHref || !bHref) return scene.thumbnail;

  const [west, south, east, north] = bbox;
  // Keep the rendered image's pixel aspect ratio matched to the AOI's geographic
  // aspect ratio, so it doesn't stretch — and so downstream bbox-based clipping
  // (clipImageToPolygon) can assume the image covers exactly this bbox.
  const aoiW = east - west;
  const aoiH = north - south;
  const ratio = aoiW / (aoiH || 0.001);
  const BASE = 640;
  const imgW = ratio >= 1 ? BASE : Math.round(BASE * ratio);
  const imgH = ratio >= 1 ? Math.round(BASE / ratio) : BASE;

  // IMPORTANT: use the /bbox/ path endpoint, not /preview.png — /preview.png ignores
  // bbox entirely and always returns the full scene tile (~110x110km), which is why
  // the swipe used to render a huge stretched image and why AOI-shaped clipping was
  // misaligned (the image didn't actually cover the AOI bounds it was told to cover).
  const bboxPath = `${west},${south},${east},${north}`;
  const url = new URL(`https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxPath}/${imgW}x${imgH}.png`);
  url.searchParams.set("collection", scene.collection);
  url.searchParams.set("item", scene.id);
  assets.forEach((asset) => {
    url.searchParams.append("assets", asset);
    url.searchParams.append("asset_bidx", `${asset}|1`);
  });
  url.searchParams.set("asset_as_band", "true");
  url.searchParams.set("expression", `(${assets[0]}-${assets[1]})/(${assets[0]}+${assets[1]})`);
  // tighter rescale per index = the colormap uses its full range where pixel values actually
  // cluster, instead of stretching across the theoretical [-1,1] and looking pale/washed out
  url.searchParams.set("rescale", rescale);
  url.searchParams.set("colormap_name", "rdylgn");
  return url.toString();
}

function formatDateDMY(value: string) {
  const [year, month, day] = (value || "").split("-");
  if (!year || !month || !day) return value || "DD/MM/YYYY";
  return `${day}/${month}/${year}`;
}

function ImageSwipeCompare({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const draggingRef = useRef(false);

  const setPositionFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(2, Math.min(98, pct)));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      setPositionFromClientX(e.clientX);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [setPositionFromClientX]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] rounded-md overflow-hidden border border-white/[0.07] bg-slate-950 cursor-ew-resize select-none touch-none"
        onPointerDown={(e) => {
          draggingRef.current = true;
          containerRef.current?.setPointerCapture(e.pointerId);
          setPositionFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          setPositionFromClientX(e.clientX);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeUrl} alt={beforeLabel} draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ filter: "saturate(1.35) contrast(1.12)" }}
        />
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={afterUrl} alt={afterLabel} draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "saturate(1.35) contrast(1.12)" }}
          />
        </div>

        <div
          className="absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)] pointer-events-none"
          style={{ left: `${position}%` }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-cyan-400 bg-[#020817]/90 shadow-lg text-cyan-300 text-xs font-bold">
            ↔
          </div>
        </div>

        <span className="absolute top-2 left-2 z-10 text-[0.55rem] font-bold uppercase bg-black/65 text-sky-300 px-2 py-0.5 rounded pointer-events-none">
          {beforeLabel}
        </span>
        <span className="absolute top-2 right-2 z-10 text-[0.55rem] font-bold uppercase bg-black/65 text-orange-300 px-2 py-0.5 rounded pointer-events-none">
          {afterLabel}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="w-full accent-cyan-400"
        aria-label="Swipe between before and after images"
      />
      <p className="text-[0.52rem] text-slate-600 text-center">اسحبي على الصورة أو الـ slider لمقارنة Before ↔ After</p>
    </div>
  );
}

function ComparePanel({
  url,
  label,
  accent,
}: {
  url: string;
  label: string;
  accent?: string;
}) {
  return (
    <figure className="flex flex-col gap-2 min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-white/[0.08] bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="absolute inset-0 h-full w-full object-cover" style={{ filter: "saturate(1.35) contrast(1.12)" }} />
      </div>
      <figcaption
        className="text-center text-xs font-medium text-slate-300"
        style={accent ? { color: accent } : undefined}
      >
        {label}
      </figcaption>
    </figure>
  );
}

function ChangeCompareModal({
  open,
  onClose,
  beforeUrl,
  afterUrl,
  changeUrl,
  beforeDate,
  afterDate,
  indexKey,
}: {
  open: boolean;
  onClose: () => void;
  beforeUrl: string;
  afterUrl: string;
  changeUrl?: string | null;
  beforeDate?: string;
  afterDate?: string;
  indexKey: ChangeIndexKey;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cols = changeUrl ? "grid-cols-3" : "grid-cols-2";

  return (
    <div
      className="fixed inset-0 z-[3600] flex items-center justify-center p-3 sm:p-6"
      style={{ pointerEvents: "all" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative z-10 flex w-full max-w-6xl max-h-[95dvh] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#060d1b] shadow-[0_32px_96px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3.5 shrink-0">
          <div>
            <p className="text-sm font-semibold text-slate-100">Before / After Comparison</p>
            <p className="text-[0.65rem] text-slate-500 mt-0.5">
              {beforeDate && afterDate
                ? `${formatDateDMY(beforeDate)} → ${formatDateDMY(afterDate)} · ${indexKey}`
                : indexKey}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-200"
            aria-label="Close comparison"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll">
          {/* ── Swipe comparison — full width, large ── */}
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[0.6rem] uppercase tracking-wider text-cyan-300/70 mb-2.5">
              ↔ اسحب للمقارنة بين Before و After
            </p>
            <ImageSwipeCompare
              beforeUrl={beforeUrl}
              afterUrl={afterUrl}
              beforeLabel={beforeDate ? `Before · ${formatDateDMY(beforeDate)}` : "Before"}
              afterLabel={afterDate ? `After · ${formatDateDMY(afterDate)}` : "After"}
              className="max-h-[55vh]"
            />
          </div>

          {/* ── 3 images side by side, always horizontal ── */}
          <div className="p-4">
            <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-3">Side-by-side view</p>
            <div className={`grid ${cols} gap-3`}>
              <ComparePanel url={beforeUrl} label="Before change" accent="#38bdf8" />
              <ComparePanel url={afterUrl} label="After Change" accent="#fb923c" />
              {changeUrl && <ComparePanel url={changeUrl} label="Change label" accent="#a78bfa" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DatePickerField({
  label, value, min, max, onChange,
}: { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 font-mono text-xs text-slate-200 outline-none transition [color-scheme:dark] focus:border-cyan-400/40"
        aria-label={label}
        title={formatDateDMY(value)}
      />
    </label>
  );
}

function SceneSlot({
  title,
  color,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  cloudCover,
  onCloudCoverChange,
  scenes,
  status,
  error,
  selectedScene,
  onSelectScene,
  onSearch,
}: {
  title: string;
  color: string;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  cloudCover: number;
  onCloudCoverChange: (v: number) => void;
  scenes: SatelliteScene[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  selectedScene: SatelliteScene | null;
  onSelectScene: (scene: SatelliteScene) => void;
  onSearch: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <p className="text-[0.68rem] font-semibold text-slate-200">{title}</p>
        {selectedScene && (
          <span className="ml-auto text-[0.55rem] text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            {formatDateDMY(selectedScene.date)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DatePickerField label="From" value={dateFrom} max={dateTo} onChange={onDateFromChange} />
        <DatePickerField label="To" value={dateTo} min={dateFrom} onChange={onDateToChange} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Max cloud cover</span>
          <span className="text-[0.62rem] font-semibold text-cyan-300">{cloudCover}%</span>
        </div>
        <input type="range" min={0} max={80} value={cloudCover} onChange={(e) => onCloudCoverChange(Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>

      <button
        type="button"
        onClick={onSearch}
        disabled={status === "loading"}
        className="h-8 w-full rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 text-[0.65rem] font-semibold transition-all hover:bg-cyan-400/15 hover:border-cyan-400/40 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "loading" ? "Searching scenes..." : "Search scenes"}
      </button>

      {error && (
        <div className="rounded-md border border-amber-400/18 bg-amber-400/[0.06] px-2.5 py-2 text-[0.6rem] text-amber-200">
          {error}
        </div>
      )}

      {scenes.length > 0 && (
        <div className="space-y-1.5">
          {!selectedScene && (
            <p className="text-[0.55rem] text-amber-300/90 px-0.5">← Click a scene below to select it</p>
          )}
          <div className="max-h-40 overflow-y-auto custom-scroll pr-0.5 space-y-1.5">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelectScene(scene)}
              className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                selectedScene?.id === scene.id
                  ? "border-cyan-400/40 bg-cyan-400/10"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]"
              }`}
            >
              {scene.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scene.thumbnail} alt="" className="w-6 h-6 rounded border border-white/[0.08] object-cover bg-slate-900 shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded border border-white/[0.08] bg-gradient-to-br from-slate-700 via-emerald-800 to-cyan-700 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[0.62rem] text-slate-200 truncate">{scene.id}</p>
                <p className="text-[0.55rem] text-slate-500">{formatDateDMY(scene.date)} · cloud {scene.cloud}%</p>
              </div>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChangeDetectionPanelProps {
  selectedFeature?: GeoJSON.Feature | null;
  onPreview?: (config: ChangeDetectionPreviewConfig) => void;
  /** Real, georeferenced Before/After swipe on the actual map. Pass null to hide it. */
  onSwipeCompare?: (config: ChangeDetectionSwipeConfig | null) => void;
}

export function ChangeDetectionPanel({ selectedFeature, onPreview, onSwipeCompare }: ChangeDetectionPanelProps) {
  const coords = getMidCoords(selectedFeature);
  const bounds = getFeatureBounds(selectedFeature, coords ? { lat: coords[0], lng: coords[1] } : undefined);
  const [[south, west], [north, east]] = bounds;

  const [source] = useState<"sentinel-2">("sentinel-2");
  const [indexKey, setIndexKey] = useState<ChangeIndexKey>("NDVI");
  const [threshold, setThreshold] = useState(0.08);
  const [direction, setDirection] = useState<ChangeDirection>("both");

  const [beforeFrom, setBeforeFrom] = useState("2025-11-01");
  const [beforeTo, setBeforeTo] = useState("2025-12-01");
  const [beforeScenes, setBeforeScenes] = useState<SatelliteScene[]>([]);
  const [beforeStatus, setBeforeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [beforeError, setBeforeError] = useState<string | null>(null);
  const [beforeScene, setBeforeScene] = useState<SatelliteScene | null>(null);

  const [afterFrom, setAfterFrom] = useState("2026-05-01");
  const [afterTo, setAfterTo] = useState("2026-06-01");
  const [afterScenes, setAfterScenes] = useState<SatelliteScene[]>([]);
  const [afterStatus, setAfterStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [afterError, setAfterError] = useState<string | null>(null);
  const [afterScene, setAfterScene] = useState<SatelliteScene | null>(null);

  const [cloudCoverBefore, setCloudCoverBefore] = useState(25);
  const [cloudCoverAfter, setCloudCoverAfter] = useState(25);

  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string | null>(null);
  const [beforeClippedUrl, setBeforeClippedUrl] = useState<string | null>(null);
  const [afterClippedUrl, setAfterClippedUrl] = useState<string | null>(null);
  const [clipToShape, setClipToShape] = useState(true);
  const polygonRing = useMemo(() => getPolygonRing(selectedFeature), [selectedFeature]);
  const bboxTuple = useMemo(() => [west, south, east, north] as [number, number, number, number], [west, south, east, north]);

  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<{ stats: ChangeStats | null; legend: ChangeLegendItem[] } | null>(null);
  const [diffDataUrl, setDiffDataUrl] = useState<string | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const indexDef = CHANGE_INDEX_DEFS[indexKey];
  const collection = source === "sentinel-2" ? "sentinel-2-l2a" : "landsat-c2-l2";

  const searchScenes = useCallback(async (
    dateFrom: string,
    dateTo: string,
    cloud: number,
    setScenes: (s: SatelliteScene[]) => void,
    setStatus: (s: "idle" | "loading" | "success" | "error") => void,
    setError: (e: string | null) => void,
  ): Promise<SatelliteScene[]> => {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("https://planetarycomputer.microsoft.com/api/stac/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: [collection],
          bbox: [west, south, east, north],
          datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
          limit: 12,
        }),
      });
      if (!response.ok) throw new Error(`STAC API ${response.status}`);
      const payload = await response.json();
      const features: StacFeature[] = Array.isArray(payload?.features) ? payload.features : [];

      const nextScenes: SatelliteScene[] = features
        .map((feature) => {
          const props = feature?.properties ?? {};
          const cloudVal = Number(props["eo:cloud_cover"] ?? props["landsat:cloud_cover_land"] ?? 0);
          const date = String(props.datetime ?? "").slice(0, 10) || dateTo;
          const thumbnail =
            (feature?.assets as any)?.rendered_preview?.href ??
            (feature?.assets as any)?.thumbnail?.href ??
            (feature?.assets as any)?.overview?.href;

          const assets = Object.entries(feature?.assets ?? {}).reduce<Record<string, string>>((acc, [key, asset]) => {
            if (!asset?.href) return acc;
            acc[key] = asset.href;
            acc[normalizeBandAssetKey(key)] = asset.href;
            acc[key.toLowerCase()] = asset.href;
            acc[key.toUpperCase()] = asset.href;
            return acc;
          }, {});

          return {
            id: String(feature?.id ?? "scene"),
            date,
            cloud: Number.isFinite(cloudVal) ? Math.round(cloudVal) : 0,
            collection,
            thumbnail,
            assets,
            bbox: feature.bbox,
          };
        })
        .filter((scene) => scene.cloud <= cloud)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8);

      setScenes(nextScenes);
      setStatus("success");
      if (!nextScenes.length) setError("No matching scenes for this AOI/date/cloud filter.");
      return nextScenes;
    } catch (err) {
      setScenes([]);
      setStatus("error");
      setError(err instanceof Error ? err.message : "STAC search failed.");
      return [];
    }
  }, [collection, west, south, east, north]);

  const pickSceneAfterSearch = useCallback((
    results: SatelliteScene[],
    current: SatelliteScene | null,
    select: (scene: SatelliteScene) => void,
  ) => {
    if (!results.length) return;
    const stillValid = current && results.some((s) => s.id === current.id);
    if (!stillValid) select(results[0]);
  }, []);

  const handleSelectBefore = useCallback((scene: SatelliteScene) => {
    setBeforeScene(scene);
    setChangeResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
  }, []);
  const handleSelectAfter = useCallback((scene: SatelliteScene) => {
    setAfterScene(scene);
    setChangeResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
  }, []);

  const handleSearchBefore = useCallback(async () => {
    const results = await searchScenes(
      beforeFrom, beforeTo, cloudCoverBefore,
      setBeforeScenes, setBeforeStatus, setBeforeError,
    );
    pickSceneAfterSearch(results, beforeScene, handleSelectBefore);
  }, [searchScenes, beforeFrom, beforeTo, cloudCoverBefore, beforeScene, pickSceneAfterSearch, handleSelectBefore]);

  const handleSearchAfter = useCallback(async () => {
    const results = await searchScenes(
      afterFrom, afterTo, cloudCoverAfter,
      setAfterScenes, setAfterStatus, setAfterError,
    );
    pickSceneAfterSearch(results, afterScene, handleSelectAfter);
  }, [searchScenes, afterFrom, afterTo, cloudCoverAfter, afterScene, pickSceneAfterSearch, handleSelectAfter]);

  // refresh preview URLs whenever scene, index, or AOI changes — cropped server-side
  // to the AOI bbox (see makePreviewUrl), not the whole scene tile.
  useEffect(() => {
    setBeforePreviewUrl(beforeScene ? makePreviewUrl(beforeScene, indexKey, bboxTuple) ?? null : null);
  }, [beforeScene, indexKey, bboxTuple]);
  useEffect(() => {
    setAfterPreviewUrl(afterScene ? makePreviewUrl(afterScene, indexKey, bboxTuple) ?? null : null);
  }, [afterScene, indexKey, bboxTuple]);

  // Once the bbox-cropped previews are in, clip them down to the exact drawn shape
  // (polygon/rectangle/circle-as-polygon) instead of leaving them as a rectangle.
  // Safe now because the image genuinely covers `bounds` (see makePreviewUrl fix),
  // so the lng/lat -> pixel mapping in clipImageToPolygon lines up correctly.
  useEffect(() => {
    let cancelled = false;
    if (!clipToShape || !polygonRing || !beforePreviewUrl) {
      setBeforeClippedUrl(null);
      return;
    }
    clipImageToPolygon(beforePreviewUrl, bounds, polygonRing)
      .then((clipped) => { if (!cancelled) setBeforeClippedUrl(clipped); })
      .catch(() => { if (!cancelled) setBeforeClippedUrl(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforePreviewUrl, clipToShape, polygonRing]);

  useEffect(() => {
    let cancelled = false;
    if (!clipToShape || !polygonRing || !afterPreviewUrl) {
      setAfterClippedUrl(null);
      return;
    }
    clipImageToPolygon(afterPreviewUrl, bounds, polygonRing)
      .then((clipped) => { if (!cancelled) setAfterClippedUrl(clipped); })
      .catch(() => { if (!cancelled) setAfterClippedUrl(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterPreviewUrl, clipToShape, polygonRing]);

  // Final URLs actually shown/pushed to the map — clipped-to-shape when available.
  const beforeDisplayUrl = beforeClippedUrl ?? beforePreviewUrl;
  const afterDisplayUrl = afterClippedUrl ?? afterPreviewUrl;

  // Push a real, georeferenced Before/After swipe onto the actual map as soon as both
  // scenes are selected — updates live as the user changes scenes/index, clears when not ready.
  // (This stays on the real map — only the sidebar preview card was removed.)
  useEffect(() => {
    if (!onSwipeCompare) return;
    if (beforeDisplayUrl && afterDisplayUrl && beforeScene && afterScene) {
      onSwipeCompare({
        beforeUrl: beforeDisplayUrl,
        afterUrl: afterDisplayUrl,
        bounds,
        beforeLabel: `Before · ${formatDateDMY(beforeScene.date)}`,
        afterLabel: `After · ${formatDateDMY(afterScene.date)}`,
      });
    } else {
      onSwipeCompare(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSwipeCompare, beforeDisplayUrl, afterDisplayUrl, beforeScene, afterScene, bounds]);

  // Make sure the swipe never lingers on the map after leaving Change Detection.
  useEffect(() => {
    return () => { onSwipeCompare?.(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRun = !!beforeScene && !!afterScene;

  const runButtonLabel = useMemo(() => {
    if (computing) return "Computing change map...";
    if (!beforeScene && !afterScene) return "Search & select Before + After scenes";
    if (!beforeScene) return "Select a Before scene ↑";
    if (!afterScene) return "Select an After scene ↑";
    return "Run Change Detection";
  }, [computing, beforeScene, afterScene]);

  // Runs the real change-detection computation server-side via
  // /api/raster-proxy/analyze (type=change_ndvi|change_ndwi|change_ndbi):
  // it reads the actual raw band pixels for Before + After and classifies
  // every pixel into 5 clear classes (Gain / No Change / Loss / Other / No
  // Data) — much more accurate than approximating index values back out of
  // already-colorized preview PNGs.
  const runChangeDetection = useCallback(async () => {
    if (!beforeScene || !afterScene) return;
    setComputing(true);
    setComputeError(null);
    setChangeResult(null);
    setDiffDataUrl(null);

    try {
      const [assetAKey, assetBKey] = indexDef.assets;
      const beforeAHref = getSceneAssetUrl(beforeScene, assetAKey);
      const beforeBHref = getSceneAssetUrl(beforeScene, assetBKey);
      const afterAHref = getSceneAssetUrl(afterScene, assetAKey);
      const afterBHref = getSceneAssetUrl(afterScene, assetBKey);

      if (!beforeAHref || !beforeBHref || !afterAHref || !afterBHref) {
        throw new Error("Could not resolve the required band URLs for the selected scenes.");
      }

      const params = new URLSearchParams({
        type: CHANGE_API_TYPE[indexKey],
        urls: [beforeAHref, beforeBHref, afterAHref, afterBHref].join(","),
        bbox: `${west},${south},${east},${north}`,
        threshold: String(threshold),
      });

      const res = await fetch(`/api/raster-proxy/analyze?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `Change detection API failed (${res.status})`);
      }

      const legendHeader = res.headers.get("X-Change-Legend");
      const statsHeader = res.headers.get("X-Raster-Stats");
      const legend: ChangeLegendItem[] = legendHeader ? JSON.parse(legendHeader) : defaultChangeLegend(indexKey);
      const stats: ChangeStats | null = statsHeader ? JSON.parse(statsHeader) : null;

      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read the change map image"));
        reader.readAsDataURL(blob);
      });

      setChangeResult({ stats, legend });
      setDiffDataUrl(dataUrl);
      // (no longer auto-opening the Before/After compare modal here — running
      // Change Detection should just show the diff/legend below; the person
      // can still open the full Before/After/Change compare manually via the
      // "Compare" button next to the Change Map.)

      // NOTE: we intentionally do NOT push the classified diff onto the real
      // map anymore — only the Before/After swipe stays on the real map, and
      // the diff/classification result stays in the sidebar (Change Map card
      // above). This also removes the old bug where the diff overlay used
      // `afterScene.bbox` (the whole raw satellite scene tile — tens of km
      // wide) instead of your actual selected AOI, which is why it used to
      // cover a much bigger area than what you drew/selected.
    } catch (err) {
      setComputeError(err instanceof Error ? err.message : "Change detection computation failed.");
    } finally {
      setComputing(false);
    }
  }, [beforeScene, afterScene, indexKey, indexDef, threshold, west, south, east, north]);

  const downloadDiff = useCallback(() => {
    if (!diffDataUrl) return;
    const a = document.createElement("a");
    a.href = diffDataUrl;
    a.download = `change_detection_${indexKey}_${Date.now()}.png`;
    a.click();
  }, [diffDataUrl, indexKey]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change Detection</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Compare two satellite scenes from different dates and visualize vegetation, water, or built-up change.
            </p>
          </div>
          <span className="rounded-md border border-orange-400/20 bg-orange-400/10 px-2 py-1 text-[0.56rem] font-bold text-orange-300">
            STAC
          </span>
        </div>
      </div>

      {/* Index selector */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <p className="text-[0.62rem] uppercase tracking-wider text-slate-500 mb-2.5">Index to compare</p>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(CHANGE_INDEX_DEFS) as ChangeIndexKey[]).map((key) => {
            const def = CHANGE_INDEX_DEFS[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => { setIndexKey(key); setChangeResult(null); setDiffDataUrl(null); }}
                className={`rounded-lg border p-2.5 text-left transition-all cursor-pointer ${
                  indexKey === key ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]"
                }`}
              >
                <span className="text-[0.68rem] font-bold" style={{ color: def.color }}>{def.label}</span>
                <span className="block text-[0.52rem] text-slate-500 mt-0.5 leading-tight">{def.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* AOI info */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
        <p className="text-[0.58rem] uppercase tracking-wider text-slate-500">AOI</p>
        <p className="text-[0.62rem] text-slate-400 mt-1 font-mono">
          BBOX {west.toFixed(4)}, {south.toFixed(4)}, {east.toFixed(4)}, {north.toFixed(4)}
        </p>
      </div>

      {/* Two scene slots */}
      <SceneSlot
        title="Before (older date)"
        color="#38bdf8"
        dateFrom={beforeFrom}
        dateTo={beforeTo}
        onDateFromChange={setBeforeFrom}
        onDateToChange={setBeforeTo}
        cloudCover={cloudCoverBefore}
        onCloudCoverChange={setCloudCoverBefore}
        scenes={beforeScenes}
        status={beforeStatus}
        error={beforeError}
        selectedScene={beforeScene}
        onSelectScene={handleSelectBefore}
        onSearch={handleSearchBefore}
      />

      <SceneSlot
        title="After (newer date)"
        color="#fb923c"
        dateFrom={afterFrom}
        dateTo={afterTo}
        onDateFromChange={setAfterFrom}
        onDateToChange={setAfterTo}
        cloudCover={cloudCoverAfter}
        onCloudCoverChange={setCloudCoverAfter}
        scenes={afterScenes}
        status={afterStatus}
        error={afterError}
        selectedScene={afterScene}
        onSelectScene={handleSelectAfter}
        onSearch={handleSearchAfter}
      />

      {/* Clip-to-drawn-shape control only — the auto Before/After swipe preview
          card that used to sit here was removed; the clipping still matters for
          the "Compare" view in the Results section and for the on-map overlay,
          so we keep the toggle itself, just without the swipe preview around it. */}
      {(beforeDisplayUrl || afterDisplayUrl) && polygonRing && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 flex items-center justify-between">
          <span className="text-[0.6rem] text-slate-400">Clip to drawn shape</span>
          <button
            type="button"
            onClick={() => setClipToShape((p) => !p)}
            className={`relative w-9 h-5 rounded-full border transition-colors ${clipToShape ? "bg-cyan-400/20 border-cyan-400/30" : "bg-white/[0.03] border-white/[0.08]"}`}
            aria-pressed={clipToShape}
          >
            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${clipToShape ? "left-[18px] bg-cyan-400" : "left-0.5 bg-slate-600"}`} />
          </button>
        </div>
      )}

      <ChangeCompareModal
        open={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        beforeUrl={beforeDisplayUrl ?? ""}
        afterUrl={afterDisplayUrl ?? ""}
        changeUrl={diffDataUrl}
        beforeDate={beforeScene?.date}
        afterDate={afterScene?.date}
        indexKey={indexKey}
      />

      {/* Sensitivity */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change sensitivity</span>
          <span className="text-[0.65rem] font-semibold text-cyan-300">{threshold.toFixed(2)}</span>
        </div>
        <input
          type="range" min={0.02} max={0.3} step={0.01} value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-cyan-400"
        />
        <p className="text-[0.55rem] text-slate-600">Lower = more sensitive to small pixel changes (more noise). Higher = only strong changes shown.</p>
      </div>

      {/* Run */}
      {!canRun && (
        <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 space-y-1">
          <p className="text-[0.58rem] text-amber-200 font-medium">Required before running:</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[0.55rem] rounded-full px-2 py-0.5 border ${beforeScene ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] text-slate-500"}`}>
              {beforeScene ? `✓ Before · ${formatDateDMY(beforeScene.date)}` : "✗ Before scene"}
            </span>
            <span className={`text-[0.55rem] rounded-full px-2 py-0.5 border ${afterScene ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] text-slate-500"}`}>
              {afterScene ? `✓ After · ${formatDateDMY(afterScene.date)}` : "✗ After scene"}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={runChangeDetection}
        disabled={!canRun || computing}
        className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {runButtonLabel}
      </button>

      {computeError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[0.62rem] text-red-300">
          {computeError}
        </div>
      )}

      {/* Results */}
      {changeResult && diffDataUrl && (
        <div className="rounded-lg border border-white/[0.07] bg-[#020817]/70 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change Map</p>
            <div className="flex items-center gap-1.5">
              
              <button
              type="button"
              onClick={downloadDiff}
              className="flex items-center gap-1.5 text-[0.6rem] text-slate-400 hover:text-cyan-400 border border-white/[0.08] hover:border-cyan-400/30 rounded-lg px-2 py-1 transition-all cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              PNG
            </button>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diffDataUrl} alt="Change detection classification map" className="w-full rounded-md border border-white/[0.06]" style={{ imageRendering: "pixelated" }} />

          {/* Legend — clear, distinct colors matching the classification, computed server-side */}
          <div className="space-y-1.5">
            {changeResult.legend.map((item) => {
              const pct = changeResult.stats
                ? (changeResult.stats as any)[`${item.key}Pct`] as number | undefined
                : undefined;
              return (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}88` }} />
                  <span className="text-[0.62rem] text-slate-300 flex-1">{item.label}</span>
                  {typeof pct === "number" && (
                    <span className="text-[0.62rem] font-semibold text-slate-400 font-mono">{pct.toFixed(1)}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[0.55rem] text-slate-600 text-center leading-relaxed">
        Scenes are sourced from Microsoft Planetary Computer (Sentinel-2 L2A) via STAC search. The change map is
        computed server-side from the real band pixel data for the selected index.
      </p>
    </div>
  );
}

export default ChangeDetectionPanel;