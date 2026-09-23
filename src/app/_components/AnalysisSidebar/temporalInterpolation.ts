// ─────────────────────────────────────────────────────────────────────────────
// Temporal Interpolation — الإعدادات المشتركة بين الفرونت (البانل) والباك (الراوت)
// ─────────────────────────────────────────────────────────────────────────────
// الفيتشر دي بتاخد مجموعة مشاهد Sentinel-2 في مدى زمني، وتحسب الـ index المطلوب
// بكسل بكسل لكل مشهد، وبعدين تعمل انتربوليشن زمني لكل بكسل لوحده عشان تطلع صورة
// الـ index في تاريخ مفيهوش صورة أصلًا (target date).
//
// ⚠️ ليه الملف ده فيه نسخة من الـ assets/formulas بتاعت Sentinel-2 بدل ما يستورد
// من SatelliteDataPanel.getVisualization أو من ANALYSIS_CONFIG بتاعة
// /api/raster-proxy/analyze/route.ts؟
//   1) getVisualization دي دالة جوّه الكمبوننت نفسه (مش exported) وبتعتمد على
//      state بتاع البانل (source) — مينفعش تتستدعى من الباك.
//   2) ملفات app/api/**/route.ts في Next.js App Router مسموح ليها تـ export بس
//      الـ HTTP handlers (GET/POST/...) — لو عملنا export لـ ANALYSIS_CONFIG أو
//      readBand من route.ts عشان نستوردهم هنا، الـ build type-check بيشتكي.
// فالنسخة دي مقصودة، والمصدر اللي اتنقلت منه هو نفسه الـ expressions المتأكد منها
// في getVisualization (فرع sentinel-2) — أي index جديد يتضاف هناك لازم يتضاف هنا
// كمان في S2_INDEX_ASSETS + INDEX_FORMULAS.
// ─────────────────────────────────────────────────────────────────────────────

import { SOURCE_INDICES, type SatelliteAnalysisType } from "./SatellitePipelines";

/**
 * طريقة الانتربوليشن — خطي بس (أقرب قيمة صالحة قبل + أقرب قيمة صالحة بعد).
 * لسه نوع بدل ما نشيله خالص عشان الـ meta وإعدادات الـ overlay بتحمل `method`.
 */
export type InterpolationMethod = "linear";

export const LINEAR_METHOD_LABEL = "Linear (nearest before/after)";
export const LINEAR_METHOD_HINT =
  "For each pixel: linear interpolation between its nearest valid observation before the target date and its nearest valid observation after it.";

// ─── الـ indices المدعومة ────────────────────────────────────────────────────
// Sentinel-2 بس (طلب صريح) — و RGB مستبعدة لإنها composite مش index، مفيش قيمة
// رقمية واحدة لكل بكسل ينفع نعمل عليها انتربوليشن زمني.
export const INTERPOLATION_INDICES: SatelliteAnalysisType[] =
  SOURCE_INDICES["sentinel-2"].filter((a) => a !== "RGB");

// ─── الباندات المطلوبة لكل index (بترتيب مهم!) ───────────────────────────────
// الترتيب ده هو نفس ترتيب الـ arguments اللي INDEX_FORMULAS تحت متوقعاه، ونفس
// ترتيب getVisualization في SatelliteDataPanel.tsx بالظبط.
export const S2_INDEX_ASSETS: Partial<Record<SatelliteAnalysisType, string[]>> = {
  NDVI: ["B08", "B04"],
  NDWI: ["B03", "B08"],
  NDMI: ["B08", "B11"],
  NDBI: ["B11", "B08"],
  SAVI: ["B08", "B04"],
  EVI: ["B08", "B04", "B02"],
  BSI: ["B11", "B04", "B08", "B02"],
  NDRE: ["B08", "B05"],
  GNDVI: ["B08", "B03"],
  MSAVI2: ["B08", "B04"],
  CCCI: ["B08", "B05", "B04"],
  NDDI: ["B08", "B04", "B03"],
  SI: ["B04", "B08"],
  CVI: ["B08", "B04", "B03"],
  VARI: ["B03", "B04", "B02"],
  RED_EDGE: ["B04", "B05", "B06", "B07"],
  MTVI: ["B08", "B04", "B03"],
  TVI: ["B08", "B04", "B03"],
  GRVI: ["B03", "B04"],
  RECI: ["B08", "B05"],
  SIPI: ["B08", "B02", "B04"],
  GCI: ["B08", "B03"],
  PSRI: ["B04", "B02", "B06"],
  NBRI: ["B08", "B12"],
  MSI: ["B11", "B08"],
  NDSI: ["B03", "B11"],
  OSI: ["B04", "B02", "B03"],
  RENDVI: ["B06", "B05"],
  REIP: ["B04", "B05", "B06", "B07"],
  NMDI_SOIL: ["B08", "B11", "B12"],
  NMDI_VEG: ["B08", "B11", "B12"],
  ARI: ["B03", "B05"],
  ARI2: ["B07", "B03", "B05"],
  CMR: ["B11", "B12"],
  FMR: ["B11", "B08"],
  IOI: ["B04", "B02"],
  NDCI: ["B05", "B04"],
  FAI: ["B08", "B04", "B11"],
  MNDWI: ["B03", "B11"],
  GEMI: ["B08", "B04"],
  MCARI: ["B05", "B04", "B03"],
  CRI1: ["B02", "B03"],
  CRI2: ["B02", "B05"],
  LAI: ["B08", "B04", "B02"],
  CCC: ["B08", "B05"],
  CI: ["B04", "B05", "B06"],
  EVI2: ["B08", "B04"],
  MTCI: ["B06", "B05", "B04"],
  NDVI705: ["B06", "B05"],
  NDTI: ["B04", "B03"],
  TCARI: ["B05", "B04", "B03"],
  WQI: ["B03", "B04", "B05", "B06"],
};

// صفر في المقام = بكسل ميّت؛ بنستخدم epsilon زي ما route.ts بتعمل بالظبط
// ((nir + red) || 1e-6) عشان منطلّعش Infinity/NaN.
const d = (x: number) => (x === 0 ? 1e-6 : x);
/** DN → reflectance حقيقي (0..1). Sentinel-2 L2A scale = 10000. */
const r = (x: number) => x / 10000;

// ─── معادلة كل index (نفس الـ expressions المستخدمة في getVisualization) ─────
// كل دالة بتاخد قيم الباندات بنفس ترتيب S2_INDEX_ASSETS فوق.
export const INDEX_FORMULAS: Partial<
  Record<SatelliteAnalysisType, (...v: number[]) => number>
> = {
  NDVI: (nir, red) => (nir - red) / d(nir + red),
  NDWI: (green, nir) => (green - nir) / d(green + nir),
  NDMI: (nir, swir1) => (nir - swir1) / d(nir + swir1),
  NDBI: (swir1, nir) => (swir1 - nir) / d(swir1 + nir),
  SAVI: (nir, red) => ((nir - red) / d(nir + red + 0.5)) * 1.5,
  EVI: (nir, red, blue) => (2.5 * (nir - red)) / d(nir + 6 * red - 7.5 * blue + 1),
  BSI: (swir1, red, nir, blue) =>
    (swir1 + red - (nir + blue)) / d(swir1 + red + (nir + blue)),
  NDRE: (nir, re1) => (nir - re1) / d(nir + re1),
  GNDVI: (nir, green) => (nir - green) / d(nir + green),
  MSAVI2: (nir, red) =>
    (2 * nir + 1 - Math.sqrt(Math.max(0, (2 * nir + 1) * (2 * nir + 1) - 8 * (nir - red)))) / 2,
  CCCI: (nir, re1, red) => ((nir - re1) / d(nir + re1)) / d((nir - red) / d(nir + red)),
  NDDI: (nir, red, green) => {
    const ndvi = (nir - red) / d(nir + red);
    const ndwi = (green - nir) / d(green + nir);
    return (ndvi - ndwi) / d(ndvi + ndwi);
  },
  SI: (red, nir) => (red - nir) / d(red + nir),
  CVI: (nir, red, green) => r(nir) * (r(red) / d(r(green) * r(green))),
  VARI: (green, red, blue) => (green - red) / d(green + red - blue),
  RED_EDGE: (red, re1, re2, re3) => 705 + 35 * (((re3 + red) / 2 - re1) / d(re2 - re1)),
  MTVI: (nir, red, green) =>
    (1.5 * (1.2 * (r(nir) - r(green)) - 2.5 * (r(red) - r(green)))) /
    d(
      Math.sqrt(
        Math.max(
          0,
          (2 * r(nir) + 1) * (2 * r(nir) + 1) -
            (6 * r(nir) - 5 * Math.sqrt(Math.max(0, r(red)))) -
            0.5
        )
      )
    ),
  TVI: (nir, red, green) =>
    0.5 * (120 * (r(nir) * 100 - r(green) * 100) - 200 * (r(red) * 100 - r(green) * 100)),
  GRVI: (green, red) => (green - red) / d(green + red),
  RECI: (nir, re1) => nir / d(re1) - 1,
  SIPI: (nir, blue, red) => (nir - blue) / d(nir - red),
  GCI: (nir, green) => nir / d(green) - 1,
  PSRI: (red, blue, re2) => (red - blue) / d(re2),
  NBRI: (nir, swir2) => (nir - swir2) / d(nir + swir2),
  MSI: (swir1, nir) => swir1 / d(nir),
  NDSI: (green, swir1) => (green - swir1) / d(green + swir1),
  OSI: (red, blue, green) => (red + blue - green) / d(red + blue + green),
  RENDVI: (re2, re1) => (re2 - re1) / d(re2 + re1),
  REIP: (red, re1, re2, re3) => 700 + 40 * (((red + re3) / 2 - re1) / d(re2 - re1)),
  NMDI_SOIL: (nir, swir1, swir2) => (nir - (swir1 - swir2)) / d(nir + (swir1 - swir2)),
  NMDI_VEG: (nir, swir1, swir2) => (nir - (swir1 - swir2)) / d(nir + (swir1 - swir2)),
  ARI: (green, re1) => 10000 / d(green) - 10000 / d(re1),
  ARI2: (re3, green, re1) => re3 / d(green) - re3 / d(re1),
  CMR: (swir1, swir2) => swir1 / d(swir2),
  FMR: (swir1, nir) => swir1 / d(nir),
  IOI: (red, blue) => red / d(blue),
  NDCI: (re1, red) => (re1 - red) / d(re1 + red),
  FAI: (nir, red, swir1) => nir - (red + (swir1 - red) * 0.1772),
  MNDWI: (green, swir1) => (green - swir1) / d(green + swir1),
  GEMI: (nir, red) => {
    const n = r(nir);
    const rd = r(red);
    const eta = (2 * (n * n - rd * rd) + 1.5 * n + 0.5 * rd) / d(n + rd + 0.5);
    return eta * (1 - 0.25 * eta) - (rd - 0.125) / d(1 - rd);
  },
  MCARI: (re1, red, green) =>
    (r(re1) - r(red) - 0.2 * (r(re1) - r(green))) * (r(re1) / d(r(red))),
  CRI1: (blue, green) => 1 / d(r(blue)) - 1 / d(r(green)),
  CRI2: (blue, re1) => 1 / d(r(blue)) - 1 / d(r(re1)),
  LAI: (nir, red, blue) => 3.618 * ((2.5 * (nir - red)) / d(nir + 6 * red - 7.5 * blue + 1)) - 0.118,
  CCC: (nir, re1) => nir / d(re1) - 1,
  CI: (red, re1, re2) => red + (re2 - red) * 0.5333 - re1,
  EVI2: (nir, red) => (2.5 * (nir - red)) / d(nir + 2.4 * red + 1),
  MTCI: (re2, re1, red) => (re2 - re1) / d(re1 - red),
  NDVI705: (re2, re1) => (re2 - re1) / d(re2 + re1),
  NDTI: (red, green) => (red - green) / d(red + green),
  TCARI: (re1, red, green) =>
    3 * (r(re1) - r(red) - 0.2 * (r(re1) - r(green)) * (r(re1) / d(r(red)))),
  WQI: (green, red, re1, re2) =>
    0.4 * ((re1 - red) / d(re1 + red)) +
    0.35 * ((red - green) / d(red + green)) +
    0.25 * ((red + (re2 - red) * 0.5333 - re1) * 8),
};

// ─── ستايل العرض الافتراضي لكل index ─────────────────────────────────────────
// ⚠️ مش نسخة كاملة من getIndexPreviewStyle (اللي فيها ~50 حالة) — الراوت بيعمل
// auto percentile stretch (2-98) على القيم الفعلية جوه الـ AOI زي renderIndex
// بالظبط، فالمدى هنا مجرد fallback. الـ colormap هي اللي بتفرق بصريًا، فمحطوط
// هنا الشائع منها بس؛ أي index مش موجود بياخد "rdylgn".
export const INTERPOLATION_STYLES: Partial<
  Record<SatelliteAnalysisType, { colormap: string; min: number; max: number }>
> = {
  NDVI: { colormap: "rdylgn", min: -0.2, max: 0.9 },
  EVI: { colormap: "magma", min: -0.2, max: 0.9 },
  EVI2: { colormap: "magma", min: -0.2, max: 0.9 },
  SAVI: { colormap: "spectral", min: -0.2, max: 0.9 },
  MSAVI2: { colormap: "spectral", min: -0.2, max: 0.9 },
  GNDVI: { colormap: "rdylgn", min: -0.2, max: 0.9 },
  NDRE: { colormap: "rdylgn", min: -0.2, max: 0.6 },
  RENDVI: { colormap: "rdylgn", min: -0.2, max: 0.6 },
  NDVI705: { colormap: "rdylgn", min: -0.2, max: 0.6 },
  LAI: { colormap: "rdylgn", min: 0, max: 4 },
  CCC: { colormap: "rdylgn", min: 0, max: 8 },
  RECI: { colormap: "rdylgn", min: 0, max: 8 },
  GCI: { colormap: "rdylgn", min: 0, max: 8 },
  NDWI: { colormap: "rdbu", min: -0.5, max: 0.7 },
  MNDWI: { colormap: "rdbu", min: -0.5, max: 0.7 },
  NDMI: { colormap: "greens", min: -0.5, max: 0.7 },
  NDBI: { colormap: "inferno", min: -0.5, max: 0.5 },
  BSI: { colormap: "rdbu_r", min: -0.5, max: 0.5 },
  NBRI: { colormap: "rdylgn", min: -0.5, max: 0.9 },
  NDSI: { colormap: "rdbu", min: -0.5, max: 0.7 },
  MSI: { colormap: "rdylgn_r", min: 0.2, max: 2 },
  FMR: { colormap: "inferno", min: 0.2, max: 2 },
  CMR: { colormap: "inferno", min: 0.5, max: 2.5 },
  IOI: { colormap: "inferno", min: 0.5, max: 2.5 },
  NDCI: { colormap: "spectral_r", min: -0.2, max: 0.4 },
  NDTI: { colormap: "spectral_r", min: -0.2, max: 0.4 },
  WQI: { colormap: "spectral_r", min: -0.2, max: 0.4 },
};

export const getInterpolationStyle = (analysis: SatelliteAnalysisType) =>
  INTERPOLATION_STYLES[analysis] ?? { colormap: "rdylgn", min: -1, max: 1 };

/** اسم الـ index زي ما الراوت متوقعه في body.type (نفس منطق route.ts: lowercase). */
export const indexRouteType = (analysis: SatelliteAnalysisType) => analysis.toLowerCase();

// ─── ماسك السحب (SCL) ────────────────────────────────────────────────────────
// Scene Classification Layer بييجي جاهز مع كل item بتاع sentinel-2-l2a تحت المفتاح
// "SCL" (20م). القيم: 0 nodata، 1 saturated/defective، 2 dark area، 3 cloud shadow،
// 4 vegetation، 5 bare soil، 6 water، 7 unclassified، 8 cloud medium prob،
// 9 cloud high prob، 10 thin cirrus، 11 snow/ice.
export const SCL_ASSET_KEY = "SCL";

/** الكلاسات اللي بنعتبرها "بكسل مش صالح" ونشيلها من الـ stack قبل الانتربوليشن. */
export const DEFAULT_MASKED_SCL_CLASSES = [0, 1, 3, 8, 9, 10];

export const SCL_CLASS_LABELS: Record<number, string> = {
  0: "No data",
  1: "Saturated / defective",
  2: "Dark area",
  3: "Cloud shadow",
  4: "Vegetation",
  5: "Bare soil",
  6: "Water",
  7: "Unclassified",
  8: "Cloud (medium prob.)",
  9: "Cloud (high prob.)",
  10: "Thin cirrus",
  11: "Snow / ice",
};

// ─── شكل الطلب/الرد بتاع /api/raster-proxy/interpolate ────────────────────────

/** مشهد واحد داخل الـ stack — روابط الباندات الخام (unsigned) زي ما جت من STAC. */
export type InterpolationSceneInput = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** روابط الباندات بترتيب S2_INDEX_ASSETS[analysis] بالظبط. */
  urls: string[];
  /** رابط باند SCL (اختياري — بيتبعت بس لو ماسك السحب مفعّل). */
  sclUrl?: string | null;
};

export type InterpolationRequestBody = {
  /** lowercase index key — indexRouteType() */
  type: string;
  bbox: [number, number, number, number];
  /** YYYY-MM-DD — التاريخ اللي عايزين نطلّع صورته */
  target: string;
  scenes: InterpolationSceneInput[];
  useScl: boolean;
  maskClasses?: number[];
  colormap?: string;
  min?: number;
  max?: number;
  transparent?: boolean;
};

/**
 * ملخص بيرجع في هيدر X-Interp-Meta.
 *
 * تصنيف البكسلات (كل بكسل فيه قيمة صالحة واحدة على الأقل بيقع في تصنيف واحد بس):
 *   • same-day     → فيه قيمة صالحة في نفس يوم الـ target بالظبط (date === target) — بتتاخد زي ما هي.
 *   • interpolated → فيه قيمة صالحة قبل الـ target (date < target) وقيمة بعده (date > target).
 *   • one-sided    → القيم الصالحة كلها على ناحية واحدة (hold / extrapolation).
 */
export type InterpolationMeta = {
  method: InterpolationMethod;
  targetDate: string;
  usedScl: boolean;
  /** Output coverage: نسبة البكسلات اللي طلع لها output صالح (same-day + interpolated + one-sided). */
  coverage: number;
  /** نسبة البكسلات اللي اتحسبت من ناحية واحدة بس (hold/extrapolation). */
  extrapolated: number;
  /** نسبة البكسلات اللي اتاخدت من مشهد في نفس يوم الـ target (مفيش انتربوليشن فيها). */
  exactDay: number;
  /** Valid observations / pixel: متوسط عدد القيم الصالحة لكل بكسل عبر المشاهد. */
  meanValidObservations: number;
  /**
   * Mean interpolation gap (بالأيام): متوسط الفترة بين الـ observation المستخدمة قبل الـ target
   * والـ observation المستخدمة بعده (afterT − beforeT)، على البكسلات اللي فيها before + after بس.
   * null لو مفيش ولا بكسل بالشكل ده.
   */
  meanInterpolationGapDays: number | null;
  /**
   * Mean extrapolation distance (بالأيام): متوسط المسافة بين الـ target وأقرب observation،
   * على البكسلات الـ one-sided بس. مقياس منفصل لأن extrapolation distance ≠ interpolation gap.
   * null لو مفيش بكسلات one-sided.
   */
  meanExtrapolationDistanceDays: number | null;
  perScene: { id: string; date: string; validPercent: number }[];
};

/** نفس شكل RasterPreviewConfig في SatelliteDataPanel — عشان نفس مسار الـ overlay على الخريطة. */
export type InterpolationPreviewConfig = {
  name: string;
  indexKey: string;
  analysis: SatelliteAnalysisType;
  method: InterpolationMethod;
  targetDate: string;
  bounds: [[number, number], [number, number]];
  coords: { lat: number; lng: number };
  opacity: number;
  colorRamp: string;
  dataUrl: string;
  stats?: { min: number; max: number; mean: number; validPixels: number; appliedRange: [number, number] };
  meta?: InterpolationMeta;
};

// ─── مساعدات مشتركة ──────────────────────────────────────────────────────────

/** نفس normalizeBandAssetKey/getAssetLookupKeys بتوع SatelliteDataPanel (مش exported هناك). */
export const normalizeBandAssetKey = (key: string) => {
  const upper = key.toUpperCase();
  const match = upper.match(/^B0?(\d{1,2})$/);
  return match ? `B${match[1].padStart(2, "0")}` : upper;
};

export const getAssetLookupKeys = (assetKey: string) => {
  const normalizedKey = normalizeBandAssetKey(assetKey);
  return Array.from(
    new Set([
      assetKey,
      normalizedKey,
      assetKey.toLowerCase(),
      assetKey.toUpperCase(),
      assetKey.replace(/^B0/, "B"),
      normalizedKey.replace(/^B0/, "B"),
    ])
  );
};

/** بتدوّر على روابط الباندات المطلوبة جوه assets بتاعة الـ STAC item. */
export const resolveSceneBandUrls = (
  sceneAssets: Record<string, string>,
  analysis: SatelliteAnalysisType
): string[] | null => {
  const needed = S2_INDEX_ASSETS[analysis];
  if (!needed) return null;
  const urls = needed.map((assetKey) =>
    getAssetLookupKeys(assetKey)
      .map((key) => sceneAssets[key])
      .find(Boolean)
  );
  return urls.every(Boolean) ? (urls as string[]) : null;
};

export const resolveSclUrl = (sceneAssets: Record<string, string>): string | null =>
  getAssetLookupKeys(SCL_ASSET_KEY)
    .map((key) => sceneAssets[key])
    .find(Boolean) ?? null;

/** عدد الأيام بين تاريخين (YYYY-MM-DD) — الأساس اللي الانتربوليشن كله مبني عليه. */
export const daysBetween = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;