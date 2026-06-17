import React, { useEffect, useMemo, useState } from "react";
import { IdxKey } from "../../map/mapTypes_proxy";
import {
  BackendRasterResponse,
  DatePickerField,
  RasterDownloadFormat,
  RasterPreviewConfig,
  dataUrlToImageData,
  makeGeoTiffFromImage,
  makeRasterFeature,
  makeRasterPdf,
  makeRasterShapefileZip,
  triggerBlobDownload,
  sanitizeFileName,
} from "./SatelliteDataPanel";
import { getFeatureBBoxDetails, getFeatureBounds, getFeatureVertices, getMidCoords } from "./geoFeatureUtils";

const RASTER_LAYERS = [
  { key: "B2", name: "Sentinel_B2", file: "blue.tif", color: "#38bdf8" },
  { key: "B3", name: "Sentinel_B3", file: "green.tif", color: "#22c55e" },
  { key: "B4", name: "Sentinel_B4", file: "red.tif", color: "#f87171" },
  { key: "B8", name: "Sentinel_B8", file: "nir.tif", color: "#a3e635" },
  { key: "B11", name: "Sentinel_B11", file: "swir.tif", color: "#fb923c" },
];

type RasterBandKey = typeof RASTER_LAYERS[number]["key"];

type UploadedRasterBand = {
  fileName: string;
  width: number;
  height: number;
  values: number[];
  min: number;
  max: number;
};

const RASTER_PRESETS = [
  { key: "NDVI" as IdxKey, label: "NDVI", expression: "(B8 - B4)/(B8 + B4)", desc: "Vegetation vigor", required: ["B4", "B8"] },
  { key: "NDWI" as IdxKey, label: "NDWI", expression: "(B3 - B8)/(B3 + B8)", desc: "Water signal", required: ["B3", "B8"] },
  { key: "NDMI" as IdxKey, label: "NDMI", expression: "(B8 - B11)/(B8 + B11)", desc: "Moisture stress", required: ["B8"] },
  { key: "SWIR" as IdxKey, label: "BSI", expression: "((B11 + B4) - (B8 + B2))/((B11 + B4) + (B8 + B2))", desc: "Bare soil", required: ["B2", "B4", "B8"] },
];

const RASTER_RAMPS = {
  vegetation: {
    label: "Vegetation",
    css: "linear-gradient(90deg,#7f1d1d,#f59e0b,#fef08a,#84cc16,#166534)",
    colors: [[127, 29, 29], [245, 158, 11], [254, 240, 138], [132, 204, 22], [22, 101, 52]],
  },
  water: {
    label: "Water",
    css: "linear-gradient(90deg,#78350f,#f8fafc,#38bdf8,#075985)",
    colors: [[120, 53, 15], [248, 250, 252], [56, 189, 248], [7, 89, 133]],
  },
  thermal: {
    label: "Thermal",
    css: "linear-gradient(90deg,#172554,#7c3aed,#ef4444,#facc15)",
    colors: [[23, 37, 84], [124, 58, 237], [239, 68, 68], [250, 204, 21]],
  },
};

function pickRampColor(colors: number[][], t: number) {
  const safe = Math.max(0, Math.min(1, t));
  const step = 1 / (colors.length - 1);
  const index = Math.min(Math.floor(safe / step), colors.length - 2);
  const local = (safe - index * step) / step;
  const a = colors[index];
  const b = colors[index + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * local),
    Math.round(a[1] + (b[1] - a[1]) * local),
    Math.round(a[2] + (b[2] - a[2]) * local),
  ];
}

function makeRasterPreviewDataUrl(expression: string, rampKey: keyof typeof RASTER_RAMPS, seed: number) {
  const size = 96;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const image = ctx.createImageData(size, size);
  const ramp = RASTER_RAMPS[rampKey].colors;
  const isWater = expression.includes("B3 - B8");
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = Math.sin((x + seed) / 9) * 0.18 + Math.cos((y - seed) / 11) * 0.14;
      const ridge = Math.sin((x + y) / 17) * 0.1;
      const center = 1 - Math.min(1, Math.hypot(x - size * 0.52, y - size * 0.48) / 70);
      const raw = isWater ? 0.38 + wave - center * 0.25 : 0.48 + wave + ridge + center * 0.36;
      const value = Math.max(0, Math.min(1, raw));
      const [r, g, b] = pickRampColor(ramp, value);
      const i = (y * size + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = 210;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function renderRasterValuesDataUrl(values: number[], width: number, height: number, rampKey: keyof typeof RASTER_RAMPS) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const image = ctx.createImageData(width, height);
  const ramp = RASTER_RAMPS[rampKey].colors;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (!Number.isFinite(value)) {
      image.data[i * 4 + 3] = 0;
      continue;
    }
    const t = (Math.max(-1, Math.min(1, value)) + 1) / 2;
    const [r, g, b] = pickRampColor(ramp, t);
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 218;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function buildHistogram(values: number[]) {
  const bins = new Array(12).fill(0);
  values.forEach((value) => {
    if (!Number.isFinite(value)) return;
    const normalized = (Math.max(-1, Math.min(1, value)) + 1) / 2;
    const index = Math.min(bins.length - 1, Math.floor(normalized * bins.length));
    bins[index] += 1;
  });
  const max = Math.max(...bins, 1);
  return bins.map((value) => Math.max(6, Math.round((value / max) * 100)));
}

function extractRasterBands(expression: string) {
  return Array.from(new Set(expression.match(/\bB\d+\b/g) ?? [])).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

async function parseRasterBandFile(file: File): Promise<UploadedRasterBand> {
  const GeoTIFF = await import("geotiff");
  const tiff = await (GeoTIFF as any).fromArrayBuffer(await file.arrayBuffer());
  const image = await tiff.getImage();
  const sourceWidth = image.getWidth();
  const sourceHeight = image.getHeight();
  const maxSize = 128;
  const scale = Math.min(1, maxSize / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const rasters = await image.readRasters({
    samples: [0],
    width,
    height,
    interleave: true,
    resampleMethod: "bilinear",
  });
  const raw = Array.from(rasters as ArrayLike<number>);
  const valid = raw.filter((value) => Number.isFinite(value) && value > -9999 && value < 1_000_000);
  const min = valid.length ? Math.min(...valid) : 0;
  const max = valid.length ? Math.max(...valid) : 1;
  const range = max - min || 1;
  const values = raw.map((value) => (
    Number.isFinite(value) && value > -9999 ? (value - min) / range : Number.NaN
  ));
  return { fileName: file.name, width, height, values, min, max };
}

function evaluateRasterExpression(expression: string, bands: Partial<Record<RasterBandKey, UploadedRasterBand>>) {
  const available = Object.values(bands).filter(Boolean) as UploadedRasterBand[];
  const base = available[0];
  if (!base) return null;

  const width = Math.min(...available.map((band) => band.width));
  const height = Math.min(...available.map((band) => band.height));
  const count = width * height;
  const result = new Array<number>(count);
  const cleaned = expression.trim();

  for (let i = 0; i < count; i++) {
    try {
      const jsExpr = cleaned.replace(/\bB\d+\b/g, (token) => {
        const band = bands[token as RasterBandKey];
        const value = band?.values[i] ?? 0;
        return Number.isFinite(value) ? String(value) : "0";
      });
      // The expression is user-authored local band math, evaluated per preview pixel.
      result[i] = Function(`"use strict"; return (${jsExpr});`)() as number;
      if (!Number.isFinite(result[i])) result[i] = Number.NaN;
    } catch {
      result[i] = Number.NaN;
    }
  }

  return { values: result, width, height };
}

export function RasterCalculatorPanel({
  selectedFeature,
  onPreview,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  onPreview?: (config: RasterPreviewConfig) => void;
}) {
  const coords = getMidCoords(selectedFeature);
  const initialBounds = getFeatureBBoxDetails(selectedFeature, coords ? { lat: coords[0], lng: coords[1] } : undefined);
  const initialVertices = getFeatureVertices(selectedFeature, initialBounds.center);
  const [tab, setTab] = useState<"expression" | "presets" | "history">("expression");
  const [dateFrom, setDateFrom] = useState("2026-05-01");
  const [dateTo, setDateTo] = useState("2026-05-14");
  const [lat, setLat] = useState(initialBounds.center.lat.toFixed(6));
  const [lng, setLng] = useState(initialBounds.center.lng.toFixed(6));
  const [bboxCorners, setBboxCorners] = useState(initialBounds.corners);
  const [shapePoints, setShapePoints] = useState(initialVertices);
  const [expression, setExpression] = useState("(B8 - B4)/(B8 + B4)");
  const [ramp, setRamp] = useState<keyof typeof RASTER_RAMPS>("vegetation");
  const [opacity, setOpacity] = useState(82);
  const [previewUrl, setPreviewUrl] = useState("");
  const [resultReady, setResultReady] = useState(false);
  const [history, setHistory] = useState<string[]>(["NDVI_Result"]);
  const [resultValues, setResultValues] = useState<number[] | null>(null);
  const [backendHistogram, setBackendHistogram] = useState<number[] | null>(null);
  const [backendStats, setBackendStats] = useState<BackendRasterResponse["stats"] | null>(null);
  const [backendError, setBackendError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [usedBackendResult, setUsedBackendResult] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<RasterDownloadFormat>("geotiff");
  const [lastResult, setLastResult] = useState<RasterPreviewConfig | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const details = getFeatureBBoxDetails(selectedFeature, coords ? { lat: coords[0], lng: coords[1] } : undefined);
    setLat(details.center.lat.toFixed(6));
    setLng(details.center.lng.toFixed(6));
    setBboxCorners(details.corners);
    setShapePoints(getFeatureVertices(selectedFeature, details.center));
  }, [coords?.[0], coords?.[1], selectedFeature]);

  const selectedPreset = RASTER_PRESETS.find((preset) => preset.expression === expression) ?? RASTER_PRESETS[0];
  const requestedBands = useMemo(() => extractRasterBands(expression), [expression]);
  const histogram = useMemo(
    () => backendHistogram ?? (resultValues ? buildHistogram(resultValues) : [8, 14, 24, 35, 51, 62, 74, 67, 49, 32, 20, 11]),
    [backendHistogram, expression, ramp, resultValues]
  );
  const requestJson = useMemo(() => {
    return JSON.stringify({
      expression,
      bands: requestedBands,
      dateFrom,
      dateTo,
      coords: { lat: Number(lat) || 0, lng: Number(lng) || 0 },
      shapePoints,
      bbox: bboxCorners.map((corner) => ({ label: corner.label, lat: corner.lat, lng: corner.lng })),
    }, null, 2);
  }, [bboxCorners, dateFrom, dateTo, expression, lat, lng, requestedBands, shapePoints]);

  const runPreview = async () => {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    const safeCoords = {
      lat: Number.isFinite(parsedLat) ? parsedLat : 30.0444,
      lng: Number.isFinite(parsedLng) ? parsedLng : 31.2357,
    };
    const bounds = getFeatureBounds(selectedFeature, safeCoords);
    const name = `${selectedPreset.label}_Result`;

    setCalculating(true);
    setBackendError(null);

    let dataUrl = "";
    let resultName = name;
    let resultBounds = bounds;
    let backendWorked = false;

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "";
      const endpoint = baseUrl ? `${baseUrl}/raster/calculate` : "/api/raster/calculate";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expression,
          bands: requestedBands,
          dateFrom,
          dateTo,
          coords: safeCoords,
          bbox: bounds,
          bboxCorners,
          shapePoints,
          colorRamp: RASTER_RAMPS[ramp].label,
        }),
      });

      if (!response.ok) throw new Error(`Backend responded ${response.status}`);
      const payload = await response.json() as BackendRasterResponse;
      dataUrl = payload.dataUrl || payload.imageUrl || "";
      if (!dataUrl) throw new Error("Backend result did not include imageUrl or dataUrl");
      resultName = payload.name || name;
      resultBounds = payload.bounds || bounds;
      setBackendHistogram(Array.isArray(payload.histogram) ? payload.histogram : null);
      setBackendStats(payload.stats ?? null);
      setResultValues(null);
      backendWorked = true;
    } catch (error) {
      dataUrl = makeRasterPreviewDataUrl(expression, ramp, Math.round(safeCoords.lat * 1000 + safeCoords.lng * 1000));
      setBackendHistogram(null);
      setBackendStats(null);
      setResultValues(null);
      setBackendError(error instanceof Error ? error.message : "Backend raster calculation is not available.");
    } finally {
      setCalculating(false);
    }

    const config: RasterPreviewConfig = {
      name: resultName,
      indexKey: selectedPreset.key,
      expression,
      date: `${dateFrom} to ${dateTo}`,
      coords: safeCoords,
      bounds: resultBounds,
      opacity: opacity / 100,
      colorRamp: RASTER_RAMPS[ramp].label,
      dataUrl,
    };
    setPreviewUrl(dataUrl);
    setUsedBackendResult(backendWorked);
    setResultReady(true);
    setLastResult(config);
    setHistory((prev) => [resultName, ...prev.filter((item) => item !== resultName)].slice(0, 4));
    onPreview?.(config);
  };

  const handleDownloadResult = async () => {
    if (!lastResult) return;
    setDownloading(true);
    const baseName = sanitizeFileName(lastResult.name);
    try {
      if (downloadFormat === "geojson") {
        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: [makeRasterFeature(lastResult)],
        };
        triggerBlobDownload(
          new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" }),
          `${baseName}.geojson`,
        );
        return;
      }

      if (downloadFormat === "shapefile") {
        triggerBlobDownload(makeRasterShapefileZip(lastResult), `${baseName}.zip`);
        return;
      }

      if (downloadFormat === "pdf") {
        await makeRasterPdf(lastResult);
        return;
      }

      const imageData = await dataUrlToImageData(lastResult.dataUrl);
      triggerBlobDownload(makeGeoTiffFromImage(imageData, lastResult.bounds), `${baseName}.tif`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Raster Calculator</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">Choose AOI, date range, expression, then preview the result on the map.</p>
          </div>
          <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[0.56rem] font-bold text-emerald-300">LIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">AOI center lat</span>
          <input value={lat} onChange={(e) => setLat(e.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">AOI center lng</span>
          <input value={lng} onChange={(e) => setLng(e.target.value)} className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DatePickerField label="Start date" value={dateFrom} max={dateTo} onChange={setDateFrom} />
        <DatePickerField label="End date" value={dateTo} min={dateFrom} onChange={setDateTo} />
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Shape Points</p>
          <span className="text-[0.58rem] text-cyan-300">{shapePoints.length} point{shapePoints.length === 1 ? "" : "s"}</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {shapePoints.map((point) => (
            <div key={point.label} className="rounded-md border border-white/[0.05] bg-black/10 p-2">
              <p className="text-[0.55rem] font-bold text-cyan-300">{point.label}</p>
              <p className="mt-0.5 font-mono text-[0.55rem] text-slate-400">lat {point.lat.toFixed(6)}</p>
              <p className="font-mono text-[0.55rem] text-slate-400">lng {point.lng.toFixed(6)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[0.55rem] leading-relaxed text-slate-500">
          These are the actual drawn vertices. The backend still receives the bounding box internally for satellite search.
        </p>
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Backend Bands</p>
          <span className="text-[0.58rem] text-cyan-300">{requestedBands.length} required</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {requestedBands.length ? requestedBands.map((band) => (
            <span key={band} className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-mono text-[0.62rem] text-cyan-200">
              {band}
            </span>
          )) : (
            <span className="text-[0.65rem] text-amber-300">Write bands like B4 and B8 in the expression.</span>
          )}
        </div>
        <p className="mt-2 text-[0.58rem] leading-relaxed text-slate-500">
          The backend receives these band names and fetches the raster data for the selected date and location.
        </p>
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-1">
        <div className="grid grid-cols-3 gap-1">
          {(["expression", "presets", "history"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-md px-2 py-2 text-[0.65rem] font-semibold capitalize transition-colors ${tab === item ? "bg-cyan-400 text-[#03101d]" : "text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {tab === "expression" && (
        <textarea value={expression} onChange={(e) => setExpression(e.target.value)} rows={4} spellCheck={false} className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#020817]/80 px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-400/40" />
      )}

      {tab === "presets" && (
        <div className="grid grid-cols-2 gap-2">
          {RASTER_PRESETS.map((preset) => (
            <button key={preset.label} type="button" onClick={() => { setExpression(preset.expression); setTab("expression"); }} className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-3 text-left transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/[0.06]">
              <span className="text-xs font-bold text-cyan-300">{preset.label}</span>
              <span className="mt-1 block text-[0.58rem] text-slate-500">{preset.desc}</span>
            </button>
          ))}
        </div>
      )}

      {tab === "history" && (
        <div className="space-y-2">
          {history.map((item) => (
            <button key={item} type="button" onClick={() => setTab("expression")} className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-left text-[0.68rem] text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {item}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Color Ramp</p>
          <span className="text-[0.58rem] text-slate-500">{RASTER_RAMPS[ramp].label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(RASTER_RAMPS) as Array<keyof typeof RASTER_RAMPS>).map((key) => (
            <button key={key} type="button" onClick={() => setRamp(key)} className={`h-9 rounded-lg border p-1 transition-colors ${ramp === key ? "border-cyan-400/45 bg-cyan-400/10" : "border-white/[0.06] bg-white/[0.02]"}`}>
              <span className="block h-full rounded-md" style={{ background: RASTER_RAMPS[key].css }} />
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Histogram</p>
          <span className="text-[0.58rem] text-slate-500">Value distribution</span>
        </div>
        <div className="flex h-20 items-end gap-1">
          {histogram.map((value, index) => (
            <div key={index} className="flex-1 rounded-t-sm bg-cyan-400/70" style={{ height: `${value}%`, opacity: 0.45 + index / 24 }} />
          ))}
        </div>
        <div className="mt-1 flex justify-between font-mono text-[0.5rem] text-slate-600"><span>-1.0</span><span>0.0</span><span>1.0</span></div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Preview opacity</span>
          <span className="text-[0.65rem] text-cyan-300">{opacity}%</span>
        </div>
        <input type="range" min={30} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>

      <button type="button" onClick={runPreview} disabled={calculating || requestedBands.length === 0} className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-55">
        {calculating ? "Calculating..." : "Preview on Map"}
      </button>

      <div className="rounded-lg border border-white/[0.07] bg-[#020817]/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Results</p>
          <span className={`rounded-full px-2 py-0.5 text-[0.55rem] font-bold ${resultReady ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.04] text-slate-500"}`}>{resultReady ? (usedBackendResult ? "Backend result" : "Demo fallback") : "Waiting"}</span>
        </div>
        <label className="mb-3 flex items-center gap-2 text-[0.7rem] text-slate-300">
          <input type="checkbox" checked={resultReady} readOnly className="accent-cyan-400" />
          {selectedPreset.label}_Result
        </label>
        {backendError && (
          <div className="mb-3 rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 text-[0.62rem] text-amber-200">
            Backend not connected yet: {backendError}. Showing demo fallback.
          </div>
        )}
        {previewUrl && <img src={previewUrl} alt="Raster preview" className="mb-3 aspect-video w-full rounded-md border border-white/[0.06] object-cover" />}
        <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
          <select
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value as RasterDownloadFormat)}
            className="h-9 rounded-md border border-white/[0.08] bg-[#020817]/80 px-2 text-[0.68rem] text-slate-300 outline-none focus:border-cyan-400/40"
            title="Raster result download format"
          >
            <option value="geotiff">GeoTIFF (raster)</option>
            <option value="geojson">GeoJSON</option>
            <option value="shapefile">Shapefile (.zip)</option>
            <option value="pdf">PDF report (basic map)</option>
          </select>
          <button
            type="button"
            onClick={handleDownloadResult}
            disabled={!lastResult || downloading}
            className="h-9 rounded-md border border-emerald-400/20 bg-emerald-400/10 px-3 text-[0.68rem] font-semibold text-emerald-200 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {downloading ? "Preparing..." : "Download"}
          </button>
        </div>
        {backendStats && (
          <div className="mb-3 grid grid-cols-3 gap-1.5">
            {[
              { label: "Min", value: backendStats.min },
              { label: "Max", value: backendStats.max },
              { label: "Mean", value: backendStats.mean },
            ].map((item) => (
              <div key={item.label} className="rounded-md border border-white/[0.06] bg-white/[0.03] p-2 text-center">
                <p className="text-[0.68rem] font-semibold text-slate-200">{Number(item.value ?? 0).toFixed(3)}</p>
                <p className="mt-0.5 text-[0.52rem] text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        )}
        <pre className="max-h-36 overflow-auto rounded-md border border-white/[0.06] bg-black/20 p-2 text-[0.58rem] leading-relaxed text-slate-400">{requestJson}</pre>
      </div>
    </div>
  );
}
