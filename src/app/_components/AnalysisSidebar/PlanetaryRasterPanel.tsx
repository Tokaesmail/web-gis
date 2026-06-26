"use client";

// ─── PlanetaryRasterPanel.tsx ───────────────────────────────────────────────
// Raster Calculator مبني على Planetary Computer Data API (titiler).
//
// الفكرة: مفيش حسابات في الفرونت خالص. اليوزر بيكتب expression زي:
//   (B08 - B04) / (B08 + B04)        ← NDVI
//   (B03 - B08) / (B03 + B08)        ← NDWI
// إحنا بنبعتها كـ query param اسمها `expression` لـ:
//   /api/data/v1/item/preview.png?collection=...&item=...&expression=...&rescale=...&colormap_name=...
// السيرفر (Planetary Computer) هو اللي بيجيب الباندات، يطبق المعادلة،
// ويرجع صورة PNG جاهزة. إحنا بس بنعرضها كـ image overlay على الخريطة.

import { useEffect, useMemo, useState } from "react";
import { getPolygonRing, clipImageToPolygon } from "./geoClipUtils";

// ─── Sentinel-2 L2A band reference (so the user writes valid expressions) ──
const SENTINEL2_BANDS: { id: string; label: string; gsd: string; desc: string }[] = [
  { id: "B01", label: "Coastal aerosol", gsd: "60m", desc: "Coastal / aerosol" },
  { id: "B02", label: "Blue",            gsd: "10m", desc: "Visible blue" },
  { id: "B03", label: "Green",           gsd: "10m", desc: "Visible green" },
  { id: "B04", label: "Red",             gsd: "10m", desc: "Visible red" },
  { id: "B05", label: "Red Edge 1",      gsd: "20m", desc: "Vegetation red edge" },
  { id: "B06", label: "Red Edge 2",      gsd: "20m", desc: "Vegetation red edge" },
  { id: "B07", label: "Red Edge 3",      gsd: "20m", desc: "Vegetation red edge" },
  { id: "B08", label: "NIR",             gsd: "10m", desc: "Near-infrared" },
  { id: "B8A", label: "NIR Narrow",      gsd: "20m", desc: "Narrow near-infrared" },
  { id: "B09", label: "Water Vapour",    gsd: "60m", desc: "Water vapour" },
  { id: "B11", label: "SWIR 1",          gsd: "20m", desc: "Short-wave infrared" },
  { id: "B12", label: "SWIR 2",          gsd: "20m", desc: "Short-wave infrared" },
];

// ─── Quick-pick presets (still just plain expressions, nothing computed locally) ──
const EXPRESSION_PRESETS: { key: string; label: string; expression: string; colormap: string; rescale: [number, number]; desc: string }[] = [
  // NDVI: real-world desert-agriculture range is roughly -0.1 (sand) to 0.75 (dense crops).
  // Using viridis clips variation — rdylgn maps red(bare)→green(vegetation) which is intuitive.
  { key: "NDVI", label: "NDVI",  expression: "(B08-B04)/(B08+B04)",         colormap: "rdylgn", rescale: [-0.2, 0.9],  desc: "Vegetation vigor" },
  // NDWI: water is positive, dry land negative. rdbu: blue=water, red=dry.
  { key: "NDWI", label: "NDWI",  expression: "(B03-B08)/(B03+B08)",         colormap: "rdbu",   rescale: [-0.5, 0.5],  desc: "Water content" },
  // NDMI: moisture stress. Full -1→1 range, reversed so moist=blue, dry=brown.
  { key: "NDMI", label: "NDMI",  expression: "(B8A-B11)/(B8A+B11)",         colormap: "rdbu_r", rescale: [-0.5, 0.5],  desc: "Moisture / drought stress" },
  // NDBI: built-up positive, vegetation negative. magma shows density well.
  { key: "NDBI", label: "NDBI",  expression: "(B11-B08)/(B11+B08)",         colormap: "magma",  rescale: [-0.5, 0.5],  desc: "Built-up / urban areas" },
  // SAVI: soil-adjusted, values ~0 (bare)→0.7 (dense). rdylgn matches NDVI palette.
  { key: "SAVI", label: "SAVI",  expression: "1.5*(B08-B04)/(B08+B04+0.5)", colormap: "rdylgn", rescale: [0.0, 0.7],   desc: "Soil-adjusted vegetation" },
  // EVI: enhanced vegetation, range wider than NDVI in dense canopy.
  { key: "EVI",  label: "EVI",   expression: "2.5*(B08-B04)/(B08+6*B04-7.5*B02+1)", colormap: "rdylgn", rescale: [-0.1, 0.8], desc: "Enhanced vegetation" },
  // True Color: R/G/B visual composite — rescale 0→3000 SR → 0→255.
  { key: "BSI",  label: "BSI",   expression: "((B11+B04)-(B08+B02))/((B11+B04)+(B08+B02))", colormap: "spectral_r", rescale: [-0.5, 0.5], desc: "Bare soil index" },
];
// ─── Color ramps shown as visual swatches (matching the app's existing
// "Water / Vegetation / Spectral" style) instead of a plain colormap name list ──
const COLOR_RAMPS: { key: string; label: string; gradient: string }[] = [
  // NDVI — GEE classic rdylgn: dark-red → orange → yellow → yellow-green → green → dark-green
  { key: "rdylgn",    label: "Vegetation", gradient: "linear-gradient(90deg,#d73027 0%,#f46d43 13%,#fdae61 26%,#fee08b 39%,#d9ef8b 52%,#a6d96a 65%,#66bd63 78%,#1a9850 100%)" },
  // NDWI Water — RdBu: crimson(dry) → salmon → white → steel-blue → deep-navy(water)
  { key: "rdbu",      label: "Water",      gradient: "linear-gradient(90deg,#67001f 0%,#b2182b 14%,#d6604d 26%,#f4a582 38%,#fddbc7 50%,#d1e5f0 62%,#4393c3 76%,#2166ac 88%,#053061 100%)" },
  // NDMI Moisture — PuOr: burnt-orange(dry) → beige → purple(moist) matches Landsat NDMI
  { key: "rdbu_r",    label: "Moisture",   gradient: "linear-gradient(90deg,#b35806 0%,#e08214 14%,#fdb863 26%,#fee0b6 38%,#f7f7f7 50%,#d8daeb 62%,#998ec3 76%,#7b3294 88%,#40004b 100%)" },
  // Spectral — full spectral ramp matching USGS/EE style
  { key: "spectral",  label: "Spectral",   gradient: "linear-gradient(90deg,#9e0142 0%,#d53e4f 14%,#f46d43 25%,#fdae61 37%,#fee08b 50%,#e6f598 62%,#abdda4 72%,#66c2a5 82%,#3288bd 91%,#5e4fa2 100%)" },
  // NDBI Spectral_R — red(built-up high) → yellow → blue(vegetation/low) matches NDBI maps
  { key: "spectral_r",label: "Spectral R", gradient: "linear-gradient(90deg,#d73027 0%,#f46d43 12%,#fdae61 24%,#ffffbf 38%,#d9ef8b 50%,#a6d96a 62%,#74add1 74%,#4575b4 86%,#313695 100%)" },
  // Thermal / Magma — exact matplotlib magma: black → purple → pink → orange → yellow
  { key: "magma",     label: "Thermal",    gradient: "linear-gradient(90deg,#000004 0%,#1b0c41 16%,#4a0c4e 26%,#781c6d 36%,#a52c60 46%,#cf4446 56%,#ed6925 66%,#fb9b06 76%,#f7d13d 88%,#fcfdbf 100%)" },
  // SAVI Greens — YlGn: white(bare=0) → pale-yellow-green → lime → medium → dark-green
  { key: "greens",    label: "Greens",     gradient: "linear-gradient(90deg,#ffffe5 0%,#f7fcb9 16%,#d9f0a3 30%,#addd8e 44%,#78c679 58%,#41ab5d 70%,#238443 82%,#005a32 100%)" },
  // NDWI Blues — Climate Engine: white → pale-sky → steel-blue → deep-navy
  { key: "rdylbu_r",  label: "Heat",       gradient: "linear-gradient(90deg,#f7fbff 0%,#deebf7 16%,#c6dbef 28%,#9ecae1 40%,#6baed6 52%,#4292c6 64%,#2171b5 76%,#08519c 88%,#08306b 100%)" },
];


const PC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
const PC_DATA_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png";
const PC_BBOX_URL  = "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox";

type SceneOption = {
  id: string;
  collection: string;
  date: string;
  cloud: number;
  bbox: [number, number, number, number];
};

// Matches the RasterPreviewConfig type already used by onRasterPreview
// (see AnalysisSidebar.tsx / MapClient.tsx) so this panel is a drop-in
// alternative to the existing RasterCalculatorPanel — same callback shape.
type RasterPreviewConfig = {
  name: string;
  indexKey: string;
  expression: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]]; // [[south, west],[north, east]]
  opacity: number;
  colorRamp: string;
  dataUrl: string;
  tileUrl: string;
};

type Props = {
  selectedFeature?: GeoJSON.Feature | null;
  /** called with the resulting PNG + geographic bounds so MapClient/LeafletMap can overlay it */
  onPreview?: (config: RasterPreviewConfig) => void;
};

function getMidCoords(feature?: GeoJSON.Feature | null): [number, number] | null {
  const g = feature?.geometry as any;
  if (!g?.coordinates) return null;
  try {
    if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
    if (g.type === "Polygon") {
      const ring = g.coordinates[0];
      const mid = ring[Math.floor(ring.length / 2)];
      return [mid[1], mid[0]];
    }
    if (g.type === "MultiPolygon") {
      const ring = g.coordinates[0][0];
      const mid = ring[Math.floor(ring.length / 2)];
      return [mid[1], mid[0]];
    }
  } catch {}
  return null;
}

// السطر 116 — عدّل الدالة تبعت bbox نوعين
function getFeatureBBox(
  feature?: GeoJSON.Feature | null,
  fallback?: { lat: number; lng: number },
  withPadding = true   // ← أضف parameter
): [number, number, number, number] {
  const coords: number[][] = [];
  const walk = (v: any) => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number" && typeof v[1] === "number") { coords.push(v); return; }
    v.forEach(walk);
  };
  walk((feature?.geometry as any)?.coordinates);

  if (coords.length) {
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const west = Math.min(...lngs), east = Math.max(...lngs);
    const south = Math.min(...lats), north = Math.max(...lats);
    
    // ← padding بس للـ STAC search، مش للـ render
    const pad = withPadding
      ? Math.max(0.0008, Math.max(east - west, north - south) * 0.12)
      : 0;
    return [west - pad, south - pad, east + pad, north + pad];
  }

  const lat = fallback?.lat ?? 30.0444;
  const lng = fallback?.lng ?? 31.2357;
  const pad = withPadding ? 0.03 : 0.01;
  return [lng - pad, lat - pad, lng + pad, lat + pad];
}

// quick syntax check: only known band tokens + numbers/operators allowed
function validateExpression(expr: string): { ok: boolean; usedBands: string[]; unknownTokens: string[] } {
  const tokens = expr.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
  const known = new Set(SENTINEL2_BANDS.map((b) => b.id));
  const usedBands = Array.from(new Set(tokens.filter((t) => known.has(t.toUpperCase())).map((t) => t.toUpperCase())));
  const unknownTokens = Array.from(new Set(tokens.filter((t) => !known.has(t.toUpperCase()))));
  const bracketsOk = (expr.match(/\(/g) ?? []).length === (expr.match(/\)/g) ?? []).length;
  return { ok: usedBands.length > 0 && unknownTokens.length === 0 && bracketsOk, usedBands, unknownTokens };
}

function analyzeImage(imgSrc: string) {
  return new Promise<{ min: number; max: number; mean: number; histogram: number[] }>((resolve) => {
    const img = new Image();
    img.src = imgSrc;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let min = 255, max = 0, sum = 0;
      const histogram = new Array(10).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i];
        if (data[i + 3] < 10) continue;
        min = Math.min(min, v); max = Math.max(max, v); sum += v;
        histogram[Math.min(9, Math.floor((v / 255) * 10))]++;
      }
      resolve({ min, max, mean: sum / (data.length / 4), histogram });
    };
    img.onerror = () => resolve({ min: 0, max: 255, mean: 128, histogram: new Array(10).fill(0) });
  });
}

export default function PlanetaryRasterPanel({ selectedFeature, onPreview }: Props) {
  const coords = getMidCoords(selectedFeature);
  const fallbackCoords = coords ? { lat: coords[0], lng: coords[1] } : undefined;

  const [expression, setExpression] = useState(EXPRESSION_PRESETS[0].expression);
  const [activePreset, setActivePreset] = useState<string>("NDVI");
  const [colormap, setColormap] = useState(EXPRESSION_PRESETS[0].colormap);
  const [rescaleMin, setRescaleMin] = useState(EXPRESSION_PRESETS[0].rescale[0]);
  const [rescaleMax, setRescaleMax] = useState(EXPRESSION_PRESETS[0].rescale[1]);
  const [opacity, setOpacity] = useState(85);
  const [clipToShape, setClipToShape] = useState(true);
  const [cloudCover, setCloudCover] = useState(10);
  const [dateFrom, setDateFrom] = useState("2026-04-01");
  const [dateTo, setDateTo] = useState("2026-05-31");
  const [showBandRef, setShowBandRef] = useState(true);

  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [sceneError, setSceneError] = useState<string | null>(null);

  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [stats, setStats] = useState<{
  min: number;
  max: number;
  mean: number;
  histogram: number[];
} | null>(null);
const [classification, setClassification] = useState<string>("");

const bbox = useMemo(
  () => getFeatureBBox(selectedFeature, fallbackCoords, true),
  [selectedFeature, fallbackCoords?.lat, fallbackCoords?.lng]
);

// bbox للـ render — بدون padding عشان يتطابق مع الـ polygon
const renderBbox = useMemo(
  () => getFeatureBBox(selectedFeature, fallbackCoords, false),
  [selectedFeature, fallbackCoords?.lat, fallbackCoords?.lng]
);  
const polygonRing = useMemo(() => getPolygonRing(selectedFeature), [selectedFeature]);
  const validation = useMemo(() => validateExpression(expression), [expression]);
  const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

  // search for matching scenes whenever AOI / dates / cloud filter change
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setSceneStatus("loading");
      setSceneError(null);
      try {
        const res = await fetch(PC_STAC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            collections: ["sentinel-2-l2a"],
            bbox,
            datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
            query: { "eo:cloud_cover": { lt: cloudCover } },
            limit: 20,
          }),
        });
        if (!res.ok) throw new Error(`STAC search failed (${res.status})`);
        const payload = await res.json();
        const features = Array.isArray(payload?.features) ? payload.features : [];
        const next: SceneOption[] = features
          .map((f: any) => ({
            id: String(f.id),
            collection: "sentinel-2-l2a",
            date: String(f.properties?.datetime ?? "").slice(0, 10),
            cloud: Math.round(Number(f.properties?.["eo:cloud_cover"] ?? 0)),
            bbox: f.bbox ?? bbox,
          }))
          .sort((a: SceneOption, b: SceneOption) => a.cloud - b.cloud);

        if (cancelled) return;
        setScenes(next);
        setSelectedSceneId(next[0]?.id ?? null);
        setSceneStatus("success");
        if (!next.length) setSceneError("No Sentinel-2 scenes found for this AOI/date/cloud filter.");
      } catch (err) {
        if (cancelled) return;
        setScenes([]);
        setSelectedSceneId(null);
        setSceneStatus("error");
        setSceneError(err instanceof Error ? err.message : "Scene search failed.");
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox.join(","), dateFrom, dateTo, cloudCover]);

  const applyPreset = (presetKey: string) => {
    const preset = EXPRESSION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setActivePreset(presetKey);
    setExpression(preset.expression);
    setColormap(preset.colormap);
    setRescaleMin(preset.rescale[0]);
    setRescaleMax(preset.rescale[1]);
  };

  const insertBand = (bandId: string) => {
    setActivePreset("");
    setExpression((prev) => (prev ? `${prev}${bandId}` : bandId));
  };



const runPreview = async () => {
  if (!selectedScene || !validation.ok) return;
  setPreviewStatus("loading");
  setPreviewError(null);
  setStats(null);
  setClassification("");

  try {
    // ── 1. Rescale: دايما من الـ preset أو الـ manual input — مش من أي API
    // الـ statistics API بيرجع قيم لكامل الـ Sentinel tile (100+ كم صحراء)
    // فبيعطي p2/p98 ضيق جداً مش بيمثل الـ AOI
    const currentPreset = EXPRESSION_PRESETS.find(p => p.key === activePreset);
    let finalMin = currentPreset?.rescale[0] ?? rescaleMin;
    let finalMax = currentPreset?.rescale[1] ?? rescaleMax;
    if (finalMax === finalMin) finalMax = finalMin + 0.01;

    // ── 3. Helper: fetch one PNG from the bbox endpoint ──────────────────
    const aoiWidth   = renderBbox[2] - renderBbox[0];
    const aoiHeight  = renderBbox[3] - renderBbox[1];
    const aspectRatio = aoiWidth / aoiHeight;
    const BASE_PX = 1024;
    const imgW = aspectRatio >= 1 ? BASE_PX : Math.round(BASE_PX * aspectRatio);
    const imgH = aspectRatio >= 1 ? Math.round(BASE_PX / aspectRatio) : BASE_PX;
    const [west, south, east, north_] = renderBbox;
    const renderedBounds: [[number, number], [number, number]] = [[south, west], [north_, east]];

    const fetchRender = async (rMin: number, rMax: number): Promise<string> => {
      const p = new URLSearchParams({
        collection:    selectedScene.collection,
        item:          selectedScene.id,
        expression,
        asset_as_band: "true",
        rescale:       `${rMin},${rMax}`,
        colormap_name: colormap,
        resampling:    "nearest",
      });
      const bboxPath = `${west},${south},${east},${north_}`;
      const url = `${PC_BBOX_URL}/${bboxPath}/${imgW}x${imgH}.png?${p.toString()}`;
      console.log("Render URL:", url);
      const res = await fetch(url);
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Planetary Computer render failed (${res.status}). ${text.slice(0, 160)}`);
      }
      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read image data"));
        reader.readAsDataURL(blob);
      });
    };

    // ── 4. First render with current best-guess rescale ────────────────────
    let dataUrl = await fetchRender(finalMin, finalMax);

    // ── 5. Clip to polygon ─────────────────────────────────────────────────
    let clippedUrl = dataUrl;
    if (clipToShape && polygonRing) {
      try { clippedUrl = await clipImageToPolygon(dataUrl, renderedBounds, polygonRing); }
      catch { /* fall back to unclipped */ }
    }

    // ── 6. Final dataUrl = clipped ─────────────────────────────────────────
    const finalDataUrl = clippedUrl;

    // ── 7. tileUrl ───────────────────────────────────────────────────────────
    const tileParams = new URLSearchParams({
      collection:    selectedScene.collection,
      item:          selectedScene.id,
      expression,
      asset_as_band: "true",
      rescale:       `${finalMin},${finalMax}`,
      colormap_name: colormap,
      resampling:    "nearest",
    });
    const tileUrl = `${PC_DATA_URL.replace("/preview.png", "/tile/{z}/{x}/{y}.png")}?${tileParams.toString()}`;

    // ── 8. Quick pixel stats for the histogram display only ──────────────────
    const imageStats = await analyzeImage(finalDataUrl);
    const midVal = (finalMin + finalMax) / 2;
    setStats({
      min:       finalMin,
      max:       finalMax,
      mean:      midVal,
      histogram: imageStats.histogram,
    });
    setClassification(activePreset
      ? `📊 ${activePreset} · ${finalMin.toFixed(3)} → ${finalMax.toFixed(3)}`
      : midVal > 0.3  ? "📈 High response"
      : midVal > 0.05 ? "📉 Moderate response"
      : "⏳ Low response"
    );

    setPreviewImg(finalDataUrl);
    setPreviewStatus("success");

    onPreview?.({
      name:      `${activePreset || "Expression"} · ${selectedScene.id}`,
      indexKey:  activePreset || "CUSTOM",
      expression,
      date:      selectedScene.date,
      dataUrl:   finalDataUrl,
      tileUrl,
      bounds:    renderedBounds,
      opacity:   opacity / 100,
      colorRamp: colormap,
      coords:    fallbackCoords ?? { lat: (south + north_) / 2, lng: (west + east) / 2 },
    });

  } catch (err) {
    setPreviewStatus("error");
    setPreviewError(err instanceof Error ? err.message : "Render request failed.");
  }
};
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Raster Calculator · Planetary Computer</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Write a band expression — the server fetches the bands, computes it, and returns a ready PNG.
            </p>
          </div>
          <span className="shrink-0 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[0.56rem] font-bold text-cyan-300">
            SERVER-SIDE
          </span>
        </div>
      </div>

      {/* AOI info */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Area of interest</p>
            <p className="mt-1 text-[0.65rem] text-slate-400">
              {coords ? `Center ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}` : "No shape selected — using current map view"}
            </p>
            <p className="mt-1 font-mono text-[0.55rem] text-slate-600">
              BBOX {bbox.map((v) => v.toFixed(4)).join(", ")}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[0.55rem] font-semibold ${
            coords ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border border-amber-400/20 bg-amber-400/10 text-amber-300"
          }`}>
            {coords ? "AOI" : "MAP"}
          </span>
        </div>
      </div>

      {/* Date + cloud filter */}
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">From</span>
          <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">To</span>
          <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
        </label>
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Max cloud cover</span>
          <span className="text-xs font-semibold text-cyan-300">{cloudCover}%</span>
        </div>
        <input type="range" min={0} max={80} value={cloudCover} onChange={(e) => setCloudCover(Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>

      {/* Scene picker */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Scene</p>
          <span className="text-[0.58rem] text-slate-500">
            {sceneStatus === "loading" ? "searching…" : `${scenes.length} found`}
          </span>
        </div>
        {sceneError && (
          <div className="rounded-lg border border-amber-400/18 bg-amber-400/[0.05] px-3 py-2 text-[0.62rem] text-amber-200">
            {sceneError}
          </div>
        )}
        {scenes.length > 0 && (
          <select
            value={selectedSceneId ?? ""}
            onChange={(e) => setSelectedSceneId(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/80 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
          >
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · cloud {s.cloud}% · {s.id}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Band reference */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025]">
        <button
          type="button"
          onClick={() => setShowBandRef((p) => !p)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left cursor-pointer"
        >
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Sentinel-2 band reference</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`text-slate-500 transition-transform ${showBandRef ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {showBandRef && (
          <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
            {SENTINEL2_BANDS.map((band) => (
              <button
                key={band.id}
                type="button"
                onClick={() => insertBand(band.id)}
                title={`Insert ${band.id} into expression`}
                className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] cursor-pointer"
              >
                <span>
                  <span className="block font-mono text-[0.65rem] font-bold text-cyan-300">{band.id}</span>
                  <span className="block text-[0.55rem] text-slate-500">{band.label}</span>
                </span>
                <span className="shrink-0 text-[0.5rem] text-slate-600">{band.gsd}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Presets */}
      <div className="space-y-2">
        <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Index presets</p>
        <div className="grid grid-cols-2 gap-1.5">
          {EXPRESSION_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset.key)}
              className={`rounded-lg border p-2.5 text-left transition-all cursor-pointer ${
                activePreset === preset.key ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]"
              }`}
            >
              <p className={`text-[0.68rem] font-bold ${activePreset === preset.key ? "text-cyan-400" : "text-slate-300"}`}>{preset.label}</p>
              <p className="mt-0.5 text-[0.55rem] text-slate-500 leading-tight">{preset.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Expression input */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Expression</span>
          <span className={`text-[0.58rem] font-medium ${validation.ok ? "text-emerald-400" : "text-amber-400"}`}>
            {validation.ok ? `${validation.usedBands.length} band${validation.usedBands.length === 1 ? "" : "s"} used` : "incomplete"}
          </span>
        </div>
        <textarea
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setActivePreset(""); }}
          rows={3}
          spellCheck={false}
          placeholder="e.g. (B08-B04)/(B08+B04)"
          className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#020817]/80 px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-400/40"
        />
        {validation.unknownTokens.length > 0 && (
          <p className="text-[0.58rem] text-amber-300">
            Unknown token{validation.unknownTokens.length > 1 ? "s" : ""}?: {validation.unknownTokens.join(", ")} — use band IDs like B08, B04.
          </p>
        )}
        <p className="text-[0.55rem] text-slate-600">
          Sent as-is to Planetary Computer's <code className="text-slate-500">expression</code> parameter. Nothing is calculated locally.
        </p>
      </div>

      {/* Colormap + rescale */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-3">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Color ramp</p>
            <span className="text-[0.58rem] text-cyan-300">{COLOR_RAMPS.find((r) => r.key === colormap)?.label ?? colormap}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {COLOR_RAMPS.map((ramp) => (
              <button
                key={ramp.key}
                type="button"
                onClick={() => setColormap(ramp.key)}
                title={ramp.label}
                className={`group rounded-lg border p-1.5 transition-all cursor-pointer ${
                  colormap === ramp.key ? "border-cyan-400/45 bg-cyan-400/[0.06]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16]"
                }`}
              >
                <span className="block h-7 rounded-md" style={{ background: ramp.gradient }} />
                <span className={`mt-1.5 block text-[0.56rem] font-medium truncate ${
                  colormap === ramp.key ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300"
                }`}>
                  {ramp.label}
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Rescale min</span>
            <input type="number" step="0.1" value={rescaleMin} onChange={(e) => setRescaleMin(Number(e.target.value))}
              className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
          </label>
          <label className="space-y-1">
            <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Rescale max</span>
            <input type="number" step="0.1" value={rescaleMax} onChange={(e) => setRescaleMax(Number(e.target.value))}
              className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
          </label>
        </div>
      </div>

      {/* Clip to shape */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Clip to drawn shape</p>
          <p className="mt-1 text-[0.58rem] text-slate-500 leading-relaxed">
            {polygonRing
              ? "Mask everything outside your polygon — only the selected area shows."
              : "No polygon selected — server returns a rectangle covering the AOI."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setClipToShape((p) => !p)}
          disabled={!polygonRing}
          className={`w-11 h-6 shrink-0 rounded-full border transition-all cursor-pointer relative disabled:cursor-not-allowed disabled:opacity-40 ${
            clipToShape && polygonRing ? "bg-cyan-400/20 border-cyan-400/30" : "bg-white/[0.03] border-white/[0.08]"
          }`}
          aria-pressed={clipToShape && !!polygonRing}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
            clipToShape && polygonRing ? "left-5 bg-cyan-400" : "left-0.5 bg-slate-600"
          }`} />
        </button>
      </div>

      {/* Opacity */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Overlay opacity</span>
          <span className="text-[0.65rem] text-cyan-300">{opacity}%</span>
        </div>
        <input type="range" min={20} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>

      {/* Run */}
      <button
        type="button"
        onClick={runPreview}
        disabled={!selectedScene || !validation.ok || previewStatus === "loading"}
        className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {previewStatus === "loading" ? "Rendering on Planetary Computer…" : "Render & Preview on Map"}
      </button>
      {stats && previewStatus === "success" && (() => {
        // ── Compute zone distribution from histogram ──────────────────────────
        const totalPixels = stats.histogram.reduce((a, b) => a + b, 0) || 1;
        const range = stats.max - stats.min;
        const numZones = 5;
        // Merge histogram bins (10) into 5 zones
        const zoneCounts = Array.from({ length: numZones }, (_, zi) => {
          const start = zi * 2, end = start + 2;
          return stats.histogram.slice(start, end).reduce((a, b) => a + b, 0);
        });
        const zoneColors = ["#1a6b2f", "#4caf50", "#f9e04b", "#e05c1a", "#c0392b"];
        const zoneLabels = Array.from({ length: numZones }, (_, i) => {
          const lo = stats.min + (range * i) / numZones;
          const hi = stats.min + (range * (i + 1)) / numZones;
          return `Zone ${i + 1}: ${lo.toFixed(3)} – ${hi.toFixed(3)}`;
        });

        // ── Smooth histogram data for the bar chart ───────────────────────────
        const maxH = Math.max(...stats.histogram, 1);
        const histPct = stats.histogram.map((h) => (h / maxH) * 100);

        // ── Dynamic legend range ──────────────────────────────────────────────
        const legendMin = stats.min.toFixed(3);
        const legendMax = stats.max.toFixed(3);

        return (
          <div className="rounded-lg border border-white/[0.09] bg-[#050d1c]/80 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-white/[0.06]">
              <p className="text-[0.62rem] uppercase tracking-wider text-slate-400 font-semibold">Visualization</p>
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[0.55rem] font-bold text-emerald-300">
                {activePreset || "Custom"}
              </span>
            </div>

            <div className="p-3 space-y-3">
              {/* Histogram bars */}
              <div className="space-y-1">
                <div className="flex items-end gap-[3px] h-16">
                  {histPct.map((pct, i) => {
                    // colour each bar by which zone it falls in
                    const zoneIdx = Math.min(numZones - 1, Math.floor((i / histPct.length) * numZones));
                    return (
                      <div
                        key={i}
                        className="w-full rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max(pct, 2)}%`,
                          background: zoneColors[zoneIdx],
                          opacity: 0.75 + (pct / 100) * 0.25,
                        }}
                      />
                    );
                  })}
                </div>
                {/* X-axis labels */}
                <div className="flex justify-between">
                  <span className="text-[0.5rem] text-slate-600">{legendMin}</span>
                  <span className="text-[0.5rem] text-slate-600">{((+legendMin + +legendMax) / 2).toFixed(3)}</span>
                  <span className="text-[0.5rem] text-slate-600">{legendMax}</span>
                </div>
              </div>

              {/* Legend header */}
              <div className="flex items-center justify-between">
                <p className="text-[0.58rem] uppercase tracking-wider text-slate-500">Legend</p>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[0.55rem] text-slate-500">
                    <span className="inline-block w-2 h-2 rounded-full border border-slate-500" />
                    Theoretical
                  </span>
                  <span className="flex items-center gap-1 text-[0.55rem] text-cyan-400">
                    <span className="inline-block w-2 h-2 rounded-full bg-cyan-400" />
                    Dynamic
                  </span>
                </div>
              </div>

              {/* Gradient color bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-[0.5rem] text-slate-500">
                  <span>{legendMin} (Zone 1)</span>
                  <span>(Zone {numZones}) {legendMax}</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: colormapPreviewGradient(colormap) }} />
                <div className="flex justify-between text-[0.52rem] text-slate-400 font-mono">
                  <span>{(+legendMin + (+legendMax - +legendMin) * 0.15).toFixed(3)}</span>
                  <span>{(+legendMin + (+legendMax - +legendMin) * 0.85).toFixed(3)}</span>
                </div>
              </div>

              {/* Zone rows */}
              <div className="space-y-1.5">
                {zoneCounts.map((count, i) => {
                  const pct = ((count / totalPixels) * 100).toFixed(3);
                  const areaSqKm = ((count / totalPixels) * (
                    // rough area estimate from bbox
                    Math.abs(renderBbox[2] - renderBbox[0]) *
                    Math.abs(renderBbox[3] - renderBbox[1]) *
                    12321 // ~111km per degree squared
                  )).toFixed(3);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 shrink-0 rounded-sm"
                        style={{ background: zoneColors[i] }}
                      />
                      <span className="text-[0.62rem] text-slate-300 w-12 shrink-0">Zone {i + 1}</span>
                      <div className="flex-1 bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: zoneColors[i] }}
                        />
                      </div>
                      <span className="text-[0.6rem] font-semibold text-slate-200 w-12 text-right shrink-0">
                        {pct}%
                      </span>
                      <span className="text-[0.52rem] text-slate-500 w-14 text-right shrink-0">
                        ({areaSqKm}km²)
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Classification label */}
              <div className="pt-1 border-t border-white/[0.05]">
                <p className="text-[0.62rem] text-cyan-300 font-semibold">{classification}</p>
                <p className="text-[0.5rem] text-slate-600 mt-0.5">Pixel distribution · color bar = selected colormap</p>
              </div>
            </div>
          </div>
        );
      })()}

      {previewError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[0.65rem] text-red-300">
          {previewError}
        </div>
      )}

      {/* Result */}
      {previewImg && previewStatus === "success" && (
        <div className="space-y-2.5 rounded-lg border border-white/[0.07] bg-[#020817]/70 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Result</p>
            <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[0.55rem] font-bold text-emerald-300">Rendered</span>
          </div>
          <img src={previewImg} alt="Raster expression preview" className="w-full rounded-md border border-white/[0.06] object-cover" />
          <div className="flex items-center gap-2">
            <span className="text-[0.55rem] text-slate-600">{rescaleMin}</span>
            <div className="h-2 flex-1 rounded-full" style={{ background: colormapPreviewGradient(colormap) }} />
            <span className="text-[0.55rem] text-slate-600">{rescaleMax}</span>
          </div>
          <p className="break-all font-mono text-[0.52rem] leading-relaxed text-slate-600">{expression}</p>
        </div>
      )}
    </div>
  );
}

// looks up the same gradient used in the color-ramp picker, for the result legend bar
function colormapPreviewGradient(name: string): string {
  return COLOR_RAMPS.find((r) => r.key === name)?.gradient ?? COLOR_RAMPS[COLOR_RAMPS.length - 2].gradient;
}