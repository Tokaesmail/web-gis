import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFeatureBounds, getMidCoords } from "./geoFeatureUtils";

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
}> = {
  NDVI: { label: "NDVI", desc: "Vegetation change (NIR, Red)", assets: ["B08", "B04"], color: "#22c55e" },
  NDWI: { label: "NDWI", desc: "Water extent change (Green, NIR)", assets: ["B03", "B08"], color: "#38bdf8" },
  NDBI: { label: "NDBI", desc: "Built-up / urban change (SWIR, NIR)", assets: ["B11", "B08"], color: "#f97316" },
};

// Diverging ramp: red = decrease, gray = no change, green = increase
function diffColor(delta: number): [number, number, number] {
  // delta expected roughly in [-1, 1] (difference of two normalized indices)
  const t = Math.max(-1, Math.min(1, delta));
  if (t >= 0) {
    // 0 -> gray, 1 -> green
    const k = t;
    return [
      Math.round(226 - k * 190),
      Math.round(232 - k * 30),
      Math.round(240 - k * 200),
    ];
  }
  const k = -t;
  return [
    Math.round(226 + k * 25),
    Math.round(232 - k * 170),
    Math.round(240 - k * 200),
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

function makePreviewUrl(scene: SatelliteScene, assets: [string, string]) {
  if (!scene.id || !scene.collection) return scene.thumbnail;
  const aHref = getSceneAssetUrl(scene, assets[0]);
  const bHref = getSceneAssetUrl(scene, assets[1]);
  if (!aHref || !bHref) return scene.thumbnail;

  const url = new URL("https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png");
  url.searchParams.set("collection", scene.collection);
  url.searchParams.set("item", scene.id);
  url.searchParams.set("max_size", "512");
  assets.forEach((asset) => {
    url.searchParams.append("assets", asset);
    url.searchParams.append("asset_bidx", `${asset}|1`);
  });
  url.searchParams.set("asset_as_band", "true");
  url.searchParams.set("expression", `(${assets[0]}-${assets[1]})/(${assets[0]}+${assets[1]})`);
  url.searchParams.set("rescale", "-1,1");
  url.searchParams.set("colormap_name", "rdylgn");
  return url.toString();
}

// load an <img> from a URL into a same-size canvas and return its ImageData
async function loadImageData(url: string, size = 256): Promise<ImageData> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to load scene preview image"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(img, 0, 0, size, size);
  return ctx.getImageData(0, 0, size, size);
}

// The preview PNGs from Planetary Computer are already colorized (rdylgn) per-scene index images.
// We approximate each pixel's index value back from luminance-weighted green-vs-red channel balance,
// which is sufficient for relative change detection between two same-style renders.
function approxIndexFromRGB(r: number, g: number, b: number): number {
  // rdylgn colormap: red ~ -1, yellow ~ 0, green ~ +1
  // Use (G - R) normalized as a proxy for index value
  return Math.max(-1, Math.min(1, (g - r) / 255));
}

interface DiffResult {
  canvas: HTMLCanvasElement;
  stats: { meanDelta: number; increasedPct: number; decreasedPct: number; stablePct: number };
}

function computeDiff(beforeData: ImageData, afterData: ImageData, threshold: number): DiffResult {
  const { width, height } = beforeData;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d")!;
  const outData = ctx.createImageData(width, height);

  let sum = 0;
  let inc = 0;
  let dec = 0;
  let stable = 0;
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const beforeVal = approxIndexFromRGB(beforeData.data[o], beforeData.data[o + 1], beforeData.data[o + 2]);
    const afterVal = approxIndexFromRGB(afterData.data[o], afterData.data[o + 1], afterData.data[o + 2]);
    const delta = afterVal - beforeVal;
    sum += delta;

    if (Math.abs(delta) < threshold) {
      stable++;
      outData.data[o] = 30;
      outData.data[o + 1] = 41;
      outData.data[o + 2] = 59;
      outData.data[o + 3] = 60;
    } else {
      if (delta > 0) inc++; else dec++;
      const [r, g, b] = diffColor(delta);
      outData.data[o] = r;
      outData.data[o + 1] = g;
      outData.data[o + 2] = b;
      outData.data[o + 3] = 235;
    }
  }

  ctx.putImageData(outData, 0, 0);

  return {
    canvas: out,
    stats: {
      meanDelta: sum / total,
      increasedPct: (inc / total) * 100,
      decreasedPct: (dec / total) * 100,
      stablePct: (stable / total) * 100,
    },
  };
}

function formatDateDMY(value: string) {
  const [year, month, day] = (value || "").split("-");
  if (!year || !month || !day) return value || "DD/MM/YYYY";
  return `${day}/${month}/${year}`;
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
        <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scroll pr-0.5">
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
      )}
    </div>
  );
}

interface ChangeDetectionPanelProps {
  selectedFeature?: GeoJSON.Feature | null;
  onPreview?: (config: ChangeDetectionPreviewConfig) => void;
}

export function ChangeDetectionPanel({ selectedFeature, onPreview }: ChangeDetectionPanelProps) {
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

  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [diffDataUrl, setDiffDataUrl] = useState<string | null>(null);
  const [compareSlider, setCompareSlider] = useState(50);

  const resultCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const indexDef = CHANGE_INDEX_DEFS[indexKey];
  const collection = source === "sentinel-2" ? "sentinel-2-l2a" : "landsat-c2-l2";

  const searchScenes = useCallback(async (
    dateFrom: string,
    dateTo: string,
    cloud: number,
    setScenes: (s: SatelliteScene[]) => void,
    setStatus: (s: "idle" | "loading" | "success" | "error") => void,
    setError: (e: string | null) => void,
  ) => {
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
    } catch (err) {
      setScenes([]);
      setStatus("error");
      setError(err instanceof Error ? err.message : "STAC search failed.");
    }
  }, [collection, west, south, east, north]);

  const handleSelectBefore = (scene: SatelliteScene) => {
    setBeforeScene(scene);
    setDiffResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
  };
  const handleSelectAfter = (scene: SatelliteScene) => {
    setAfterScene(scene);
    setDiffResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
  };

  // refresh preview URLs whenever scene or index changes
  useEffect(() => {
    setBeforePreviewUrl(beforeScene ? makePreviewUrl(beforeScene, indexDef.assets) ?? null : null);
  }, [beforeScene, indexDef]);
  useEffect(() => {
    setAfterPreviewUrl(afterScene ? makePreviewUrl(afterScene, indexDef.assets) ?? null : null);
  }, [afterScene, indexDef]);

  const canRun = !!beforePreviewUrl && !!afterPreviewUrl;

  const runChangeDetection = useCallback(async () => {
    if (!beforePreviewUrl || !afterPreviewUrl || !beforeScene || !afterScene) return;
    setComputing(true);
    setComputeError(null);
    setDiffResult(null);
    setDiffDataUrl(null);

    try {
      const [beforeImg, afterImg] = await Promise.all([
        loadImageData(beforePreviewUrl),
        loadImageData(afterPreviewUrl),
      ]);
      const result = computeDiff(beforeImg, afterImg, threshold);
      setDiffResult(result);
      setDiffDataUrl(result.canvas.toDataURL("image/png"));

      const resultBounds = stacBBoxToBounds(afterScene.bbox ?? beforeScene.bbox, bounds);
      const center = boundsCenter(resultBounds);

      onPreview?.({
        name: `ChangeDetection_${indexKey}_${beforeScene.date}_to_${afterScene.date}`,
        indexKey,
        expression: `${indexDef.assets[0]}/${indexDef.assets[1]} diff (${beforeScene.date} → ${afterScene.date})`,
        date: `${beforeScene.date} → ${afterScene.date}`,
        coords: center,
        bounds: resultBounds,
        opacity: 0.78,
        colorRamp: "Change (red=decrease, green=increase)",
        dataUrl: result.canvas.toDataURL("image/png"),
      });
    } catch (err) {
      setComputeError(err instanceof Error ? err.message : "Change detection computation failed.");
    } finally {
      setComputing(false);
    }
  }, [beforePreviewUrl, afterPreviewUrl, beforeScene, afterScene, threshold, indexKey, indexDef, bounds, onPreview]);

  const downloadDiff = useCallback(() => {
    if (!diffDataUrl) return;
    const a = document.createElement("a");
    a.href = diffDataUrl;
    a.download = `change_detection_${indexKey}_${Date.now()}.png`;
    a.click();
  }, [diffDataUrl, indexKey]);

  const filteredStats = useMemo(() => {
    if (!diffResult) return null;
    const { increasedPct, decreasedPct, stablePct, meanDelta } = diffResult.stats;
    return { increasedPct, decreasedPct, stablePct, meanDelta };
  }, [diffResult]);

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
                onClick={() => { setIndexKey(key); setDiffResult(null); setDiffDataUrl(null); }}
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
        onSearch={() => searchScenes(beforeFrom, beforeTo, cloudCoverBefore, setBeforeScenes, setBeforeStatus, setBeforeError)}
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
        onSearch={() => searchScenes(afterFrom, afterTo, cloudCoverAfter, setAfterScenes, setAfterStatus, setAfterError)}
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
      <button
        type="button"
        onClick={runChangeDetection}
        disabled={!canRun || computing}
        className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {computing ? "Computing change map..." : canRun ? "Run Change Detection" : "Select both scenes first"}
      </button>

      {computeError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[0.62rem] text-red-300">
          {computeError}
        </div>
      )}

      {/* Results */}
      {diffResult && diffDataUrl && (
        <div className="rounded-lg border border-white/[0.07] bg-[#020817]/70 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change Map</p>
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

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diffDataUrl} alt="Change detection heat map" className="w-full rounded-md border border-white/[0.06]" />

          <div className="flex items-center gap-2">
            <span className="text-[0.55rem] text-slate-500">Decrease</span>
            <div className="flex-1 h-2 rounded-full" style={{ background: "linear-gradient(to right, #f87171, #1e293b, #4ade80)" }} />
            <span className="text-[0.55rem] text-slate-500">Increase</span>
          </div>

          {filteredStats && (
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-md border border-emerald-400/15 bg-emerald-400/[0.06] p-2 text-center">
                <p className="text-xs font-bold text-emerald-300">{filteredStats.increasedPct.toFixed(1)}%</p>
                <p className="text-[0.5rem] text-slate-500 mt-0.5">Increased</p>
              </div>
              <div className="rounded-md border border-red-400/15 bg-red-400/[0.06] p-2 text-center">
                <p className="text-xs font-bold text-red-300">{filteredStats.decreasedPct.toFixed(1)}%</p>
                <p className="text-[0.5rem] text-slate-500 mt-0.5">Decreased</p>
              </div>
              <div className="rounded-md border border-white/[0.06] bg-white/[0.03] p-2 text-center">
                <p className="text-xs font-bold text-slate-300">{filteredStats.stablePct.toFixed(1)}%</p>
                <p className="text-[0.5rem] text-slate-500 mt-0.5">Stable</p>
              </div>
            </div>
          )}

          {/* Before / After comparison slider */}
          {beforePreviewUrl && afterPreviewUrl && (
            <div className="space-y-2">
              <p className="text-[0.58rem] uppercase tracking-wider text-slate-500">Before / After comparison</p>
              <div className="relative w-full aspect-square rounded-md overflow-hidden border border-white/[0.07] bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={beforePreviewUrl} alt="Before" className="absolute inset-0 w-full h-full object-cover" />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - compareSlider}% 0 0)` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={afterPreviewUrl} alt="After" className="w-full h-full object-cover" style={{ width: `${10000 / compareSlider}%`, maxWidth: "none" }} />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                  style={{ left: `${compareSlider}%` }}
                />
                <span className="absolute top-1.5 left-1.5 text-[0.5rem] font-bold uppercase bg-black/60 text-sky-300 px-1.5 py-0.5 rounded">Before</span>
                <span className="absolute top-1.5 right-1.5 text-[0.5rem] font-bold uppercase bg-black/60 text-orange-300 px-1.5 py-0.5 rounded">After</span>
              </div>
              <input
                type="range" min={0} max={100} value={compareSlider}
                onChange={(e) => setCompareSlider(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>
          )}
        </div>
      )}

      <p className="text-[0.55rem] text-slate-600 text-center leading-relaxed">
        Scenes are sourced from Microsoft Planetary Computer (Sentinel-2 L2A) via STAC search. Index values are
        derived client-side from the rendered preview images for the selected band pair.
      </p>
    </div>
  );
}

export default ChangeDetectionPanel;
