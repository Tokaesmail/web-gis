"use client";

// ─── PlanetaryRasterPanel.tsx ───────────────────────────────────────────────
// Raster Calculator — WebGIS Backend (webgiss.duckdns.org/gis/raster-calc)
//
// الفكرة: مفيش حسابات في الفرونت خالص. اليوزر بيكتب expression زي:
//   (B08 - B04) / (B08 + B04)        ← NDVI
//   (B03 - B08) / (B03 + B08)        ← NDWI
// إحنا بنبعتها للـ backend اللي بيجيب الباندات، يطبق المعادلة،
// ويرجع GeoTIFF جاهز. إحنا بس بنعرضه كـ overlay على الخريطة.

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useSelectedScene, setSelectedScene } from "./sharedSceneSelection";
import { useSharedDateRange } from "./sharedDateRange";

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
  // NDVI — نفس صورة NDVI اللي بعتيها: أحمر/بني bare → أصفر → أخضر غامق
  { key: "rdylgn",    label: "Vegetation", gradient: "linear-gradient(90deg,#a50026 0%,#d73027 10%,#f46d43 20%,#fdae61 30%,#fee08b 40%,#ffffbf 50%,#d9ef8b 60%,#a6d96a 70%,#66bd63 80%,#1a9850 90%,#006837 100%)" },
  // NDWI Water — نفس صورة NDWI: أخضر-أصفر أرض → تركواز → أزرق غامق مياه
  { key: "rdbu",      label: "Water",      gradient: "linear-gradient(90deg,#d9ef8b 0%,#a6d96a 17%,#66c2a5 33%,#3288bd 50%,#2166ac 67%,#08306b 83%,#062254 100%)" },
  // NDMI Moisture — درجات مسحوبة فعليًا من colorbar صورة NDMI
  { key: "rdbu_r",    label: "Moisture",   gradient: "linear-gradient(90deg,#f3f1f4 0%,#f0cac1 13%,#eeb780 25%,#ebb25b 38%,#e8c32d 50%,#e7e600 63%,#9fd601 75%,#2ab900 88%,#02a402 100%)" },
  // Spectral — Viridis زي صورة الـ bands
  { key: "spectral",  label: "Spectral",   gradient: "linear-gradient(90deg,#440154 0%,#482878 11%,#3e4989 22%,#31688e 33%,#26828e 44%,#1f9e89 56%,#35b779 67%,#6ece58 78%,#b5de2b 89%,#fde725 100%)" },
  // Spectral_R — False-color زي صورة Landsat
  { key: "spectral_r",label: "Spectral R", gradient: "linear-gradient(90deg,#08306b 0%,#2166ac 14%,#4393c3 28%,#92c5de 43%,#f4a582 57%,#d6604d 71%,#b2182b 86%,#67001f 100%)" },
  // Thermal — درجات مسحوبة فعليًا من colorbar صورة الحرارة (Surface Temp)
  { key: "magma",     label: "Thermal",    gradient: "linear-gradient(90deg,#f6f6fd 0%,#a0abed 11%,#358dc5 22%,#278da6 33%,#78b49c 44%,#e3dc85 56%,#f4b46b 67%,#da5b52 78%,#a21643 89%,#61031f 100%)" },
  // Greens — زي خريطة GRASS الغطاء النباتي
  { key: "greens",    label: "Greens",     gradient: "linear-gradient(90deg,#f7fcf5 0%,#e5f5e0 13%,#c7e9c0 25%,#a1d99b 38%,#74c476 50%,#41ab5d 63%,#238b45 75%,#006d2c 88%,#00441b 100%)" },
  // Heat — بنفسجي/أزرق → سماوي → أخضر → أصفر → برتقالي → أحمر زي صورة الكثافة
  { key: "rdylbu_r",  label: "Heat",       gradient: "linear-gradient(90deg,#4b0082 0%,#6a00a8 13%,#0000ff 25%,#00bfff 38%,#00ffea 50%,#00ff40 63%,#ffff00 75%,#ff8000 88%,#ff0000 100%)" },
  // Inferno — matplotlib inferno الرسمي زي آخر صورة
  { key: "inferno",   label: "Inferno",    gradient: "linear-gradient(90deg,#000004 0%,#1b0c41 11%,#4a0c6b 22%,#781c6d 33%,#a52c60 44%,#cf4446 56%,#ed6925 67%,#fb9b06 78%,#f7d13d 89%,#fcffa4 100%)" },
];



const BACKEND_RASTER_URL = "https://webgiss.duckdns.org/gis/raster-calc";

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

// ── الـ endpoint الجديد /gis/raster-calc بقى بياخد "geometry" (Polygon
// GeoJSON حقيقي) مش بس bbox — يعني الباكند دلوقتي يقدر يعمل clip على
// الشكل الفعلي اللي رسمه اليوزر، مش بس مستطيل الـ bbox بتاعه.
// الدالة دي بتحول أي feature (Polygon / MultiPolygon / Circle) لصيغة
// GeoJSON صالحة نبعتها في الـ request — وده اللي بيحل مشكلة إن الـ clip
// كان شغال بس مع المستطيلات ومش شغال مع الدوائر أو الـ polygons.
function getRequestGeometry(
  feature?: GeoJSON.Feature | null
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const g = feature?.geometry as any;
  if (!g) return null;

  // Polygon / MultiPolygon مرسومة عادي — تتبعت زي ما هي
  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    return g as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }

  // Circle: عادة بتتخزن كـ Point + radius (بالمتر) — إما جوه properties
  // (شائع مع leaflet-draw / geoman) أو جنب الإحداثيات نفسها
  const radius: number | undefined =
    (feature as any)?.properties?.radius ??
    (feature as any)?.properties?.circleRadius ??
    (g as any)?.radius;

  if (g.type === "Point" && typeof radius === "number" && radius > 0) {
    const [lng, lat] = g.coordinates as [number, number];
    return circleToPolygon(lat, lng, radius);
  }

  return null;
}

function getPolygonVertices(feature?: GeoJSON.Feature | null) {
  const geometry = getRequestGeometry(feature);

  if (!geometry || geometry.type !== "Polygon") return [];

  return geometry.coordinates[0]
    .slice(0, -1) // إزالة آخر نقطة لأنها مكررة
    .map(([lng, lat]) => ({
      lat,
      lng,
    }));
}

// بيحول دايرة (مركز lat/lng بالدرجات + نصف قطر بالمتر) لـ polygon مقفول
// بـ 64 نقطة، باستخدام geodesic offset دقيق (نفس فكرة turf's circle)
function circleToPolygon(lat: number, lng: number, radiusMeters: number, points = 64): GeoJSON.Polygon {
  const EARTH_RADIUS = 6371008.8; // متوسط نصف قطر الأرض بالمتر
  const latRad = (lat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.cos(bearing)) / EARTH_RADIUS;
    const dLng = (radiusMeters * Math.sin(bearing)) / (EARTH_RADIUS * Math.cos(latRad));
    const ptLat = lat + (dLat * 180) / Math.PI;
    const ptLng = lng + (dLng * 180) / Math.PI;
    ring.push([ptLng, ptLat]);
  }
  return { type: "Polygon", coordinates: [ring] };
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

function readRasterStatsFromHeaders(res: Response, fallbackMin: number, fallbackMax: number) {
  const histogramHeader = res.headers.get("X-Raster-Histogram");
  const statsHeader = res.headers.get("X-Raster-Stats");
  const histogram = histogramHeader
    ? histogramHeader.split(",").map((v) => Number(v)).filter((v) => Number.isFinite(v))
    : [];

  let parsedStats: { min?: number; max?: number; mean?: number; validPixels?: number } = {};
  if (statsHeader) {
    try {
      parsedStats = JSON.parse(statsHeader);
    } catch {
      parsedStats = {};
    }
  }

  return {
    min: Number.isFinite(parsedStats.min) ? Number(parsedStats.min) : fallbackMin,
    max: Number.isFinite(parsedStats.max) ? Number(parsedStats.max) : fallbackMax,
    mean: Number.isFinite(parsedStats.mean) ? Number(parsedStats.mean) : (fallbackMin + fallbackMax) / 2,
    validPixels: Number.isFinite(parsedStats.validPixels) ? Number(parsedStats.validPixels) : histogram.reduce((a, b) => a + b, 0),
    // الباكند بقى بيبعت bins متغيّر (100 افتراضيًا)، مش 10 ثابتة — أي طول
    // مقبول دلوقتي (كان قبل كده بيرفض أي حاجة مش 10 ويصفّرها بالغلط)
    histogram: histogram.length > 0 ? histogram : new Array(100).fill(0),
  };
}

// ── Zone/Classes stats — جايين جاهزين من الباكند (X-Zone-Stats)، بعد الـ
// sieve merge الحقيقي، مش محسوبين تقريبيًا من الـ histogram في الفرونت ──────
type ZoneStat = {
  zone: number; label: string; color: string; pixels: number;
  pct: number; areaM2: number; lo: number; hi: number;
};

function readZoneStatsFromHeaders(res: Response): ZoneStat[] | null {
  const header = res.headers.get("X-Zone-Stats");
  if (!header) return null;
  try {
    const parsed = JSON.parse(header);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ── الـ extent الحقيقي بقى جاي من الـ proxy نفسه (header: X-Real-Bbox) ──
// شوف /app/api/raster-proxy/route.ts — بيقرا الـ TIFF server-side، فمفيش
// مشكلة CORS، ومفيش fetch إضافي للملف من المتصفح.

export default function PlanetaryRasterPanel({ selectedFeature, onPreview }: Props) {
  const { data: session } = useSession();
  const accessToken = (session?.user as any)?.accessToken as string | undefined;

  const coords = getMidCoords(selectedFeature);
  const fallbackCoords = coords ? { lat: coords[0], lng: coords[1] } : undefined;

  const [expression, setExpression] = useState(EXPRESSION_PRESETS[0].expression);
  const [activePreset, setActivePreset] = useState<string>("NDVI");
  const [colormap, setColormap] = useState(EXPRESSION_PRESETS[0].colormap);
  const [rescaleMin, setRescaleMin] = useState(EXPRESSION_PRESETS[0].rescale[0]);
  const [rescaleMax, setRescaleMax] = useState(EXPRESSION_PRESETS[0].rescale[1]);
  // Tracks whether the user manually typed into Rescale Min/Max. While false,
  // the backend's auto-computed display range (from the actual result data)
  // is applied after each render — needed because -0.2..0.9 is only correct
  // for normalized indices like NDVI, not a plain ratio like B07/B06.
  const [userEditedRescale, setUserEditedRescale] = useState(false);
  const [opacity, setOpacity] = useState(85);
  const [clipToShape, setClipToShape] = useState(true);
  // ── Classes (Zones) + Min zone area — دلوقتي فعليًا متوصلين للباكند
  // (كانوا قبل كده مش موجودين خالص، والـ zones كانت ثابتة على 5 دايمًا) ──
  const [nClasses, setNClasses] = useState(5);
  const [minZoneArea, setMinZoneArea] = useState(2000); // م²
  // ── وضع العرض: continuous = تدرّج لوني ناعم (الافتراضي)، zones = تصنيف
  // لـ N مناطق بألوان مصمتة (فلات). الـ Classes/Min zone area تحت دول
  // بيبقى ليهم تأثير فعلي بس لما الوضع يكون "zones" — في continuous
  // إحنا أصلاً مش بنبعتهم للباك خالص، فمفيش داعي يتلمسوا وهم من غير تأثير.
  const [renderMode, setRenderMode] = useState<"continuous" | "zones">("continuous");
  const [zoneStats, setZoneStats] = useState<ZoneStat[] | null>(null);
  const pickedScene = useSelectedScene();
  const [cloudCover, setCloudCover] = useState(10); // kept for potential future use
  // التاريخ بقى مشترك بين البانلز (sharedDateRange.ts) بدل local state —
  // نفس التاريخ اللي اخترتيه في Satellite Data (أو هنا) بيفضل موجود لما
  // تفتحي preset تاني أو تتنقلي بين البانلز، مش بيرجع للديفولت.
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useSharedDateRange();
  // ── UI state للـ redesign الجديد: زراير الباندات بقت popover جوه
  // الـ Expression نفسها (بتظهر لما تدخلي التكست، وتختفي لما تختاري باند)،
  // والـ presets السته بقوا dropdown واحد بدل شبكة 7 زراير تاخد مساحة كبيرة
  const [showBandPicker, setShowBandPicker] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [colorMenuOpen, setColorMenuOpen] = useState(false);


  const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [stats, setStats] = useState<{
  min: number;
  max: number;
  mean: number;
  validPixels?: number;
  histogram: number[];
} | null>(null);
const [classification, setClassification] = useState<string>("");
// ── بيانات الصورة اللي فعليًا اتحسبت عليها النتيجة، جايين تلقائي مع كل
// رد من الباكند (used_scene_id + method: "explicit_id" لو اليوزر اختار
// سين معينة من Satellite Data، أو "date_fallback" لو النظام هو اللي دور
// واختار تلقائي جوه الـ date range) ──────────────────────────────────
const [sceneMeta, setSceneMeta] = useState<{ usedSceneId: string; method: string } | null>(null);

const bbox = useMemo(
  () => getFeatureBBox(selectedFeature, fallbackCoords, true),
  [selectedFeature, fallbackCoords?.lat, fallbackCoords?.lng]
);

// bbox للـ render — بدون padding عشان يتطابق مع الـ polygon
const renderBbox = useMemo(
  () => getFeatureBBox(selectedFeature, fallbackCoords, false),
  [selectedFeature, fallbackCoords?.lat, fallbackCoords?.lng]
);  
// جيوميتري حقيقية (Polygon/MultiPolygon/Circle-as-polygon) نبعتها للباكند
// الجديد عشان الـ clip يبقى مطابق للشكل الفعلي مش مجرد الـ bbox المستطيل
const requestGeometry = useMemo(() => getRequestGeometry(selectedFeature), [selectedFeature]);
  const validation = useMemo(() => validateExpression(expression), [expression]);
  const activeIndexPreset = useMemo(
    () => EXPRESSION_PRESETS.find((p) => p.key === activePreset) ?? null,
    [activePreset]
  );
  const activeColorRamp = useMemo(
    () => COLOR_RAMPS.find((r) => r.key === colormap) ?? COLOR_RAMPS[COLOR_RAMPS.length - 2],
    [colormap]
  );



  const applyPreset = (presetKey: string) => {
    const preset = EXPRESSION_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    setActivePreset(presetKey);
    setExpression(preset.expression);
    setColormap(preset.colormap);
    setRescaleMin(preset.rescale[0]);
    setRescaleMax(preset.rescale[1]);
    setUserEditedRescale(false);
    setPresetMenuOpen(false);
  };

  const insertBand = (bandId: string) => {
    setActivePreset("");
    setExpression((prev) => (prev ? `${prev}${bandId}` : bandId));
    setUserEditedRescale(false);
    setShowBandPicker(false);
  };



const runPreview = async () => {
  if (!validation.ok) return;
  setPreviewStatus("loading");
  setPreviewError(null);
  setStats(null);
  setClassification("");
  setSceneMeta(null);

  try {
    // ── 1. Build date range string ────────────────────────────────────────
    const dateRange = `${dateFrom}/${dateTo}`;

    // ── 2. Call custom backend ─────────────────────────────────────────────
    const polygonVertices = getPolygonVertices(selectedFeature);

console.log("Polygon vertices:", polygonVertices);
if (!requestGeometry) {
  throw new Error("No polygon selected");
}
    const res = await fetch(BACKEND_RASTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
  geometry: requestGeometry,
  date: dateRange,
  expression,
  collection: pickedScene?.collection ?? "sentinel-2-l2a",
  // When set, the backend fetches this exact scene by ID and skips its
  // own date/cloud-cover search entirely (picked from Satellite Data).
  ...(pickedScene ? { scene_id: pickedScene.id } : {}),
})
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Backend render failed (${res.status}). ${text.slice(0, 160)}`);
    }

    const rawPayload = await res.json();
    console.log("raster-calc response:", JSON.stringify(rawPayload, null, 2));
    console.log("bbox sent (renderBbox):", renderBbox);

    if (!rawPayload?.success) throw new Error(rawPayload?.message ?? "Render failed");

    // ── الباكند أحيانًا بيرجّع الشكل القديم المسطّح:
    //      { success, data: { url, scene_id_used, display_range } }
    //    وأحيانًا بيرجّع نسخة متلغّمة (double-nested):
    //      { success, data: { success, data: { url, ... } } }
    //    عشان مانتكسرش لو الباكند رجع لأي شكل من الاتنين، بنفكّ الطبقة
    //    الزيادة هنا لو موجودة، وبعد كده كل الكود تحت شغال زي ما هو من
    //    غير أي تعديل تاني (payload?.data?.url، payload?.data?.scene_id_used، إلخ).
    const innerData =
      rawPayload?.data?.data && typeof rawPayload.data.data === "object"
        ? rawPayload.data.data
        : rawPayload?.data;
    const payload = { ...rawPayload, data: innerData };

    const tifUrl: string = payload?.data?.url ?? "";
    if (!tifUrl) throw new Error("Backend returned no output URL");

    // ── الـ scene id اللي فعليًا اتحسب عليها الناتج، جاي من الباكند ──
    // ملحوظة: الباكند بيرجّعه باسم "scene_id_used" (مش "used_scene_id")،
    // وكمان مفيش حقل "method" خالص في الـ response — فبنستنتجه إحنا:
    // لو إحنا أصلاً بعتنا scene_id في الـ request (يعني فيه pickedScene
    // من "Use this scene in Raster Calculator")، يبقى ده اختيار يدوي
    // (explicit_id)، غير كده الباكند هو اللي دوّر واختار تلقائي جوه
    // الـ date range (date_fallback).
    const usedSceneId: string | undefined =
      payload?.data?.scene_id_used ?? payload?.data?.used_scene_id;
    const usedMethod: string = pickedScene ? "explicit_id" : "date_fallback";
    if (usedSceneId) {
      setSceneMeta({ usedSceneId, method: usedMethod });
    }

    // ── 3. Rescale — بناخد القيم من preset (لو موجود)، وإلا من الـ display
    // range اللي الباكند بيحسبه فعليًا من قيم الناتج (2%-98% percentile)
    // لو اليوزر ملمسش حقول Rescale بنفسه، وإلا من الـ input اليدوي.
    // السبب: -0.2..0.9 صح بس للمؤشرات المعيارية زي NDVI؛ معادلة عادية
    // زي B07/B06 قيمتها ممكن تطلع 0..3+ وتتقص كلها لون واحد لو سبناها كده.
    const currentPreset = EXPRESSION_PRESETS.find((p) => p.key === activePreset);
    const autoRange = payload?.data?.display_range as { min: number; max: number } | undefined;

    let finalMin: number;
    let finalMax: number;

    // ── ملحوظة: لازم نتشيّك على userEditedRescale الأول، قبل حتى ما نتشيّك
    // هل فيه preset (زي NDVI) مختار — عشان لو اليوزر لمس حقول Scale بإيده
    // بعد ما اختار preset، تعديله يبقى هو الأولوية، مش القيم الثابتة
    // بتاعة الـ preset. غير كده، السلوك القديم كان بيتجاهل أي تعديل يدوي
    // طول ما فيه preset مختار (وده كان الباج اللي بيمنع تغيير الـ scale).
    if (userEditedRescale) {
      finalMin = rescaleMin;
      finalMax = rescaleMax;
    } else if (currentPreset) {
      finalMin = currentPreset.rescale[0];
      finalMax = currentPreset.rescale[1];
    } else if (autoRange) {
      finalMin = autoRange.min;
      finalMax = autoRange.max;
      setRescaleMin(finalMin);
      setRescaleMax(finalMax);
    } else {
      finalMin = rescaleMin;
      finalMax = rescaleMax;
    }
    if (finalMax === finalMin) finalMax = finalMin + 0.01;

    // ── 4. Convert TIF → PNG via Next.js proxy ────────────────────────────
    // L.imageOverlay بيشتغل بس مع PNG/JPG — مش TIF
    // الـ proxy route بيجيب الـ TIF ويحوله PNG بـ sharp، وبيرجّع كمان
    // الـ extent الحقيقي (X-Real-Bbox header) اللي قراه من جوه الملف نفسه
    const zeroMode = finalMin >= 0 ? "at-or-below" : "around";
    const proxyUrl = `/api/raster-proxy?url=${encodeURIComponent(tifUrl)}&min=${finalMin}&max=${finalMax}&colormap=${colormap}&zero=0&alphaLow=0&alphaHigh=0.18&zeroMode=${zeroMode}${
      renderMode === "zones" ? `&classes=${nClasses}&minZoneArea=${minZoneArea}` : ""
    }${accessToken ? `&token=${encodeURIComponent(accessToken)}` : ""}`;
    const pngRes = await fetch(proxyUrl);
    if (!pngRes.ok) throw new Error(`PNG conversion failed (${pngRes.status})`);

    // ← extent حقيقي للـ TIFF، جاي من الـ proxy نفسه (مفيش CORS، مفيش fetch إضافي)
    const realBboxHeader = pngRes.headers.get("X-Real-Bbox");
    const realBbox = realBboxHeader
      ? (realBboxHeader.split(",").map(Number) as [number, number, number, number])
      : null;
    const actualBounds = realBbox && realBbox.every(Number.isFinite) ? realBbox : null;
    console.log("🛰️ actual TIFF bounds (from proxy):", actualBounds, "| requested:", renderBbox);

    const pngBlob = await pngRes.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Could not read PNG"));
      reader.readAsDataURL(pngBlob);
    });

    // ── 5. Geometry info for bounds ────────────────────────────────────────
    // لو الباكند عمل snapping للـ bbox (شبكة بكسلات المصدر)، الصورة
    // الحقيقية بتكون أكبر من اللي طلبناه — وده اللي ArcGIS Pro بيوضحه.
    const [west, south, east, north_] = actualBounds ?? renderBbox;
    const renderedBounds: [[number, number], [number, number]] = [[south, west], [north_, east]];

    // ── 6. Pixel stats from the converted PNG ─────────────────────────────
    const rasterStats = readRasterStatsFromHeaders(pngRes, finalMin, finalMax);
    setStats({
      min:       finalMin,
      max:       finalMax,
      mean:      rasterStats.mean,
      validPixels: rasterStats.validPixels,
      histogram: rasterStats.histogram,
    });
    // ── Zones الحقيقية (بعد الـ classification + sieve merge) جايين من
    // الباكند مباشرة — دلوقتي فعلاً بيتغيروا لما تغيّري Classes أو Min zone
    // area، مش ثابتين على 5 زونز دايمًا زي الأول ─────────────────────────
    setZoneStats(readZoneStatsFromHeaders(pngRes));
    setClassification(activePreset
      ? `📊 ${activePreset} · ${finalMin.toFixed(3)} → ${finalMax.toFixed(3)}`
      : rasterStats.mean > 0.3  ? "📈 High response"
      : rasterStats.mean > 0.05 ? "📉 Moderate response"
      : "⏳ Low response"
    );

    setPreviewImg(dataUrl);
    setPreviewStatus("success");

    onPreview?.({
      name:      `${activePreset || "Expression"} · ${dateFrom}→${dateTo}`,
      indexKey:  activePreset || "CUSTOM",
      expression,
      date:      dateFrom,
      dataUrl,          // ← PNG base64 — Leaflet imageOverlay يقدر يعرضه
      tileUrl:   tifUrl,
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
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Raster Calculator · WebGIS Backend</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Write a band expression — the server fetches Sentinel-2 bands, computes it, and returns a GeoTIFF.
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
          <input type="date" lang="en-GB" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
        </label>
        <label className="space-y-1">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">To</span>
          <input type="date" lang="en-GB" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
        </label>
      </div>



      {/* Index presets — dropdown واحد مضغوط بدل شبكة 7 زراير كبيرة.
          ملحوظة: العنصر ده جوه الـ flow العادي للصفحة (مش absolute) —
          يعني لما يفتح بيدفع اللي تحته (Color ramp..) لتحت عادي، ولما
          يتقفل كل حاجة بترجع مكانها بالظبط. كده مفيش أي تراكب/شفافية
          غريبة بين طبقتين فوق بعض زي ما كان بيحصل قبل كده. */}
      <div className="space-y-1.5">
        <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Index preset</span>
        <button
          type="button"
          onClick={() => setPresetMenuOpen((p) => !p)}
          className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
            presetMenuOpen ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/[0.08] bg-[#020817]/70 hover:border-white/[0.16]"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/[0.12]"
              style={{ background: colormapPreviewGradient(activeIndexPreset?.colormap ?? colormap) }}
            />
            <span className="min-w-0">
              <span className="block text-xs font-bold text-slate-200">
                {activeIndexPreset ? activeIndexPreset.label : "Custom expression"}
              </span>
              <span className="block truncate text-[0.55rem] text-slate-500">
                {activeIndexPreset ? activeIndexPreset.desc : "Not matching a preset — written manually"}
              </span>
            </span>
          </span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`shrink-0 text-slate-500 transition-transform ${presetMenuOpen ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {presetMenuOpen && (
          <div className="overflow-hidden rounded-lg border border-white/[0.1] bg-[#050b1a]">
            <div className="max-h-64 overflow-y-auto p-1">
              {EXPRESSION_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => applyPreset(preset.key)}
                  className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors cursor-pointer ${
                    activePreset === preset.key ? "bg-cyan-400/10" : "hover:bg-white/[0.05]"
                  }`}
                >
                  <span
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/[0.12]"
                    style={{ background: colormapPreviewGradient(preset.colormap) }}
                  />
                  <span className="min-w-0">
                    <span className={`block text-[0.68rem] font-bold ${activePreset === preset.key ? "text-cyan-300" : "text-slate-200"}`}>
                      {preset.label}
                    </span>
                    <span className="block truncate text-[0.53rem] text-slate-500">{preset.desc}</span>
                  </span>
                  {activePreset === preset.key && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                      className="ml-auto shrink-0 text-cyan-300">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Expression input — زراير الباندات بقت تظهر جوه هنا (تحت التكست
          مباشرة، جوه الـ flow العادي برضو مش absolute)، بتظهر لما تدخلي
          التكست وتختفي أول ما تختاري باند أو تقفليها بنفسك */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Expression</span>
          <span className={`text-[0.58rem] font-medium ${validation.ok ? "text-emerald-400" : "text-amber-400"}`}>
            {validation.ok ? `${validation.usedBands.length} band${validation.usedBands.length === 1 ? "" : "s"} used` : "incomplete"}
          </span>
        </div>

        <textarea
          value={expression}
          onChange={(e) => { setExpression(e.target.value); setActivePreset(""); setUserEditedRescale(false); }}
          onFocus={() => setShowBandPicker(true)}
          onBlur={() => setShowBandPicker(false)}
          rows={3}
          spellCheck={false}
          placeholder="e.g. (B08-B04)/(B08+B04)"
          className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#020817]/80 px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-400/40"
        />

        {showBandPicker && (
          <div className="overflow-hidden rounded-lg border border-cyan-400/25 bg-[#050b1a]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-2.5 py-1.5">
              <span className="text-[0.55rem] uppercase tracking-wider text-cyan-300/80">Tap a band to insert</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowBandPicker(false)}
                className="rounded-full p-0.5 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300 cursor-pointer"
                aria-label="Close band picker"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto p-2">
              {SENTINEL2_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  // بيمنع الـ textarea من عمل blur قبل ما الـ click يتسجل،
                  // فالـ insertBand يتنفذ والـ picker يتقفل بشكل نضيف
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertBand(band.id)}
                  title={`Insert ${band.id} into expression`}
                  className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.08] cursor-pointer"
                >
                  <span>
                    <span className="block font-mono text-[0.65rem] font-bold text-cyan-300">{band.id}</span>
                    <span className="block text-[0.55rem] text-slate-500">{band.label}</span>
                  </span>
                  <span className="shrink-0 text-[0.5rem] text-slate-600">{band.gsd}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {validation.unknownTokens.length > 0 && (
          <p className="text-[0.58rem] text-amber-300">
            Unknown token{validation.unknownTokens.length > 1 ? "s" : ""}?: {validation.unknownTokens.join(", ")} — use band IDs like B08, B04.
          </p>
        )}
        <p className="text-[0.55rem] text-slate-600">
          Sent as-is to Planetary Computer's <code className="text-slate-500">expression</code> parameter. Nothing is calculated locally.
        </p>
      </div>


      {/* Colormap + Render mode (Continuous → Rescale, Zones → Classes) */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-3">
        <div className="space-y-1.5">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Color ramp</span>
          <button
            type="button"
            onClick={() => setColorMenuOpen((p) => !p)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer ${
              colorMenuOpen ? "border-cyan-400/40 bg-cyan-400/[0.06]" : "border-white/[0.08] bg-[#020817]/70 hover:border-white/[0.16]"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className="h-5 w-9 shrink-0 rounded-md ring-1 ring-white/[0.12]"
                style={{ background: activeColorRamp.gradient }}
              />
              <span className="text-xs font-bold text-slate-200 truncate">{activeColorRamp.label}</span>
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`shrink-0 text-slate-500 transition-transform ${colorMenuOpen ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {colorMenuOpen && (
            <div className="overflow-hidden rounded-lg border border-white/[0.1] bg-[#050b1a]">
              <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-2">
                {COLOR_RAMPS.map((ramp) => (
                  <button
                    key={ramp.key}
                    type="button"
                    onClick={() => { setColormap(ramp.key); setColorMenuOpen(false); }}
                    title={ramp.label}
                    className={`group rounded-lg border p-1.5 text-left transition-all cursor-pointer ${
                      colormap === ramp.key ? "border-cyan-400/45 bg-cyan-400/[0.08]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16]"
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
          )}
        </div>

        {/* Render mode toggle — Continuous يظهر تحته Rescale (Min/Max)،
            و Zones يظهر تحته Classes/Min zone area. كل تاب بيعرض بس
            الكنترولز اللي فعليًا بتأثر على الطلب في الوضع ده، بدل ما
            تفضل الحقول ظاهرة ومالهاش تأثير في التاب التاني. */}
        <div className="space-y-1.5">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Render mode</span>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/[0.08] bg-[#020817]/70 p-1">
            <button
              type="button"
              onClick={() => setRenderMode("continuous")}
              className={`rounded-md px-2.5 py-1.5 text-[0.65rem] font-bold transition-colors cursor-pointer ${
                renderMode === "continuous" ? "bg-cyan-400/15 text-cyan-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Continuous
            </button>
            <button
              type="button"
              onClick={() => setRenderMode("zones")}
              className={`rounded-md px-2.5 py-1.5 text-[0.65rem] font-bold transition-colors cursor-pointer ${
                renderMode === "zones" ? "bg-cyan-400/15 text-cyan-300" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              Zones
            </button>
          </div>
        </div>

        {renderMode === "continuous" ? (
          <div className="space-y-1.5">
            <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Rescale</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[0.55rem] text-slate-600">Min</span>
                <input type="number" step="0.1" value={rescaleMin} onChange={(e) => {
                  const raw = e.target.value;
                  setUserEditedRescale(raw.trim() !== "");
                  setRescaleMin(raw.trim() === "" ? EXPRESSION_PRESETS[0].rescale[0] : Number(raw));
                }}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
              </label>
              <label className="space-y-1">
                <span className="text-[0.55rem] text-slate-600">Max</span>
                <input type="number" step="0.1" value={rescaleMax} onChange={(e) => {
                  const raw = e.target.value;
                  setUserEditedRescale(raw.trim() !== "");
                  setRescaleMax(raw.trim() === "" ? EXPRESSION_PRESETS[0].rescale[1] : Number(raw));
                }}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
              </label>
            </div>
            <p className="text-[0.55rem] text-slate-600 leading-relaxed">
              Smooth color gradient stretched between Min and Max — values outside this range are clipped to the nearest end color.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Classes (Zones)</span>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[0.55rem] text-slate-600">Classes</span>
                <input
                  type="number"
                  min={2}
                  max={50}
                  step={1}
                  value={nClasses}
                  onChange={(e) => {
                    const v = Math.round(Number(e.target.value));
                    setNClasses(Number.isFinite(v) ? Math.max(2, Math.min(50, v)) : 5);
                  }}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[0.55rem] text-slate-600">Min zone area (m²)</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  value={minZoneArea}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setMinZoneArea(Number.isFinite(v) ? Math.max(0, v) : 0);
                  }}
                  className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40"
                />
              </label>
            </div>
            <p className="text-[0.55rem] text-slate-600 leading-relaxed">
              Reclassifies the map into flat colored zones (equal-interval breaks over the actual data range) and
              merges any zone smaller than the min area into its largest neighbor — re-run to apply.
            </p>
          </div>
        )}
      </div>

      {pickedScene && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
          <div className="min-w-0">
            <p className="text-[0.62rem] uppercase tracking-wider text-emerald-300">Using picked scene</p>
            <p className="mt-1 truncate text-[0.58rem] text-slate-500" title={pickedScene.id}>
              {pickedScene.id}
            </p>
            <p className="mt-0.5 text-[0.58rem] text-slate-500">
              {pickedScene.date} | cloud {pickedScene.cloud}% | {pickedScene.collection} — date/cloud search below is skipped
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedScene(null)}
            className="h-7 shrink-0 rounded-md border border-white/[0.1] bg-white/[0.04] px-2 text-[0.62rem] font-medium text-slate-300 transition-colors hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-200"
          >
            Clear
          </button>
        </div>
      )}

      {/* Clip to shape */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Clip to drawn shape</p>
          <p className="mt-1 text-[0.58rem] text-slate-500 leading-relaxed">
            {requestGeometry
              ? "Mask everything outside your shape — polygons and circles are both clipped exactly."
              : "No polygon/circle selected — server returns a rectangle covering the AOI."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setClipToShape((p) => !p)}
          disabled={!requestGeometry}
          className={`w-11 h-6 shrink-0 rounded-full border transition-all cursor-pointer relative disabled:cursor-not-allowed disabled:opacity-40 ${
            clipToShape && requestGeometry ? "bg-cyan-400/20 border-cyan-400/30" : "bg-white/[0.03] border-white/[0.08]"
          }`}
          aria-pressed={clipToShape && !!requestGeometry}
        >
          <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
            clipToShape && requestGeometry ? "left-5 bg-cyan-400" : "left-0.5 bg-slate-600"
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
        disabled={!validation.ok || previewStatus === "loading"}
        className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {previewStatus === "loading" ? "Processing on WebGIS Backend…" : "Render & Preview on Map"}
      </button>
      {stats && previewStatus === "success" && (() => {
        // ── Zone distribution — real (from backend classification + sieve
        // merge) لما يكون متاح، وإلا fallback لتقريب الـ histogram القديم
        // (مثلًا لو الباكند مش محدّث لسه أو الـ response قديم من الكاش) ──────
        const totalPixels = stats.histogram.reduce((a, b) => a + b, 0) || 1;
        const range = stats.max - stats.min;

        const numZones = zoneStats ? zoneStats.length : nClasses;
        const zoneCounts = zoneStats
          ? zoneStats.map((z) => z.pixels)
          : Array.from({ length: numZones }, (_, zi) => {
              const binsPerZone = stats.histogram.length / numZones;
              const start = Math.floor(zi * binsPerZone);
              const end = Math.floor((zi + 1) * binsPerZone);
              return stats.histogram.slice(start, end).reduce((a, b) => a + b, 0);
            });
        // الألوان بتتولد من نفس الـ colormap المختار (من الباكند لو متاح،
        // وإلا محسوبة محليًا) عشان الـ Legend تطابق فعليًا اللي ظاهر على الخريطة
        const zoneColors = zoneStats
          ? zoneStats.map((z) => z.color)
          : Array.from({ length: numZones }, (_, i) => sampleColormapColor(colormap, (i + 0.5) / numZones));
        const zoneLabels = zoneStats
          ? zoneStats.map((z) => `Zone ${z.zone}: ${z.lo.toFixed(3)} – ${z.hi.toFixed(3)}`)
          : Array.from({ length: numZones }, (_, i) => {
              const lo = stats.min + (range * i) / numZones;
              const hi = stats.min + (range * (i + 1)) / numZones;
              return `Zone ${i + 1}: ${lo.toFixed(3)} – ${hi.toFixed(3)}`;
            });
        // مساحة حقيقية (م²→كم²) لكل zone لو جاية من الباكند، غير كده تقدير
        // تقريبي زي الأول من الـ bbox
        const zoneAreasKm2: (number | null)[] = zoneStats
          ? zoneStats.map((z) => z.areaM2 / 1_000_000)
          : new Array(numZones).fill(null);

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
                  const areaSqKm = (
                    zoneAreasKm2[i] ??
                    // fallback تقريبي من bbox، بس لو مفيش zoneStats حقيقي من الباكند
                    (count / totalPixels) * (
                      Math.abs(renderBbox[2] - renderBbox[0]) *
                      Math.abs(renderBbox[3] - renderBbox[1]) *
                      12321
                    )
                  ).toFixed(3);
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

          {/* Scene used — used_scene_id + method جايين من الباكند ── */}
          {sceneMeta && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
              <div className="min-w-0">
                <p className="text-[0.55rem] uppercase tracking-wider text-slate-500">Scene used</p>
                <p className="mt-0.5 truncate font-mono text-[0.55rem] text-slate-400" title={sceneMeta.usedSceneId}>
                  {sceneMeta.usedSceneId}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[0.52rem] font-bold ${
                  sceneMeta.method === "explicit_id"
                    ? "bg-cyan-400/10 text-cyan-300"
                    : "bg-amber-400/10 text-amber-300"
                }`}
                title={
                  sceneMeta.method === "explicit_id"
                    ? "Computed on the scene you picked from Satellite Data"
                    : "Scene auto-selected by the server within the date range"
                }
              >
                {sceneMeta.method === "explicit_id" ? "MANUAL PICK" : "AUTO (DATE)"}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// looks up the same gradient used in the color-ramp picker, for the result legend bar
function colormapPreviewGradient(name: string): string {
  return COLOR_RAMPS.find((r) => r.key === name)?.gradient ?? COLOR_RAMPS[COLOR_RAMPS.length - 2].gradient;
}

// ── يقرا stops الـ CSS gradient بتاعت الـ ramp المختار ويرجع لون فعلي عند أي
// نقطة t (0-1)، عشان نقدر نولّد ألوان الـ Zones من نفس الـ colormap اللي
// ظاهر على الخريطة، بدل لون أخضر-أصفر-أحمر ثابت مش له علاقة بالاختيار ────────
function parseGradientStops(gradient: string): { pos: number; hex: string }[] {
  const matches = [...gradient.matchAll(/(#[0-9a-fA-F]{6})\s+([\d.]+)%/g)];
  return matches.map((m) => ({ hex: m[1], pos: parseFloat(m[2]) / 100 }));
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

function sampleColormapColor(name: string, t: number): string {
  const stops = parseGradientStops(colormapPreviewGradient(name));
  if (stops.length === 0) return "#888888";
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) {
      const prev = stops[i - 1], next = stops[i];
      const f = (t - prev.pos) / (next.pos - prev.pos || 1);
      const [r1, g1, b1] = hexToRgb(prev.hex);
      const [r2, g2, b2] = hexToRgb(next.hex);
      return rgbToHex(r1 + f * (r2 - r1), g1 + f * (g2 - g1), b1 + f * (b2 - b1));
    }
  }
  return stops[stops.length - 1].hex;
}