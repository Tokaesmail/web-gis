// app/api/raster-proxy/analyze/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint واحد بيغطي كل أنواع الـ Band Selector:
//   - rgb / swir  → "composite": 3 bands، كل باند ياخد 2%-98% stretch لوحده،
//                   gamma، sharpen (زي true color بالظبط، بس أي bands اللي
//                   الفرونت هيبعتها)
//   - ndvi/ndwi/ndmi/ndbi/savi/evi/bsi → "index": من بانداتين لحد 4 بانداتات،
//                   بتتحسب معادلة الـ index لكل بكسل، وبعدين linear stretch +
//                   colormap + شفافية حوالين الصفر
//   - change_*    → "change": نفس معادلة الـ index بتاعها، بس بتتحسب مرتين
//                   (قبل/بعد) ويتصنف كل بكسل Gain/No Change/Loss/Other/No Data
//                   بناءً على الفرق بينهم
//
// Usage:
//   GET /api/raster-proxy/analyze
//       ?type=rgb|swir|ndvi|ndwi|ndmi|ndbi|savi|evi|bsi|change_rgb|change_swir|change_ndvi|change_ndwi|change_ndbi|change_ndmi|change_savi|change_evi|change_bsi
//       &urls=<url1>,<url2>[,...]      ← بالترتيب المطلوب لكل نوع (تحت)
//       &bbox=west,south,east,north     ← إلزامي (WGS84) — بيحدد الـ pixel window
//                                          المطلوب قراءته بدل تحميل الـ scene كاملة
//       &token=...
//
//   rgb  → urls = B04,B03,B02  (R,G,B)
//   swir → urls = <SWIR>,<NIR>,<Red>  (حسب الكومبينيشن اللي الفرونت عايزاه، مثلًا B12,B8A,B04)
//   ndvi → urls = B08,B04         (NIR, Red)
//   ndwi → urls = B03,B08         (Green, NIR)
//   ndmi → urls = B08,B11         (NIR, SWIR1)
//   ndbi → urls = B11,B08         (SWIR1, NIR)
//   savi → urls = B08,B04         (NIR, Red) — L=0.5 مبني جوه المعادلة
//   evi  → urls = B08,B04,B02     (NIR, Red, Blue)
//   bsi  → urls = B11,B04,B08,B02 (SWIR1, Red, NIR, Blue)
//
//   change_<index> → urls = [...نفس بانداتات الـ index بتاعته لـ Before, ...نفس البانداتات لـ After]
//     مثال change_evi → urls = beforeB08,beforeB04,beforeB02,afterB08,afterB04,afterB02
//     change_rgb  → urls = beforeB04,beforeB03,beforeB02,afterB04,afterB03,afterB02  (R,G,B × before/after)
//     change_swir → urls = beforeB12,beforeB8A,beforeB04,afterB12,afterB8A,afterB04 (SWIR,NIR,Red × before/after)
//
//   vv_vh_ratio → urls = vv,vh   (VV, VH amplitude assets) — dB difference: 20·log10(VV) − 20·log10(VH)
//   sar_rgb     → urls = vv,vh   (VV, VH amplitude assets) — composite: R=VV dB, G=VH dB, B=VV/VH ratio dB
//     (كل قناة بتتحسب dB لوحدها وبعدين تتعمللها 2%-98% stretch مستقلة، زي composite العادي)
//
// اختياري لـ composite: gamma (افتراضي 1.1), sharpen (0/1), low/high (2/98)
// اختياري لـ index: colormap, min/max (افتراضي -1/1), zero, alphaLow/alphaHigh, transparent
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { fromUrl, fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { toProj4 } from "geotiff-geokeys-to-proj4";
import { RAMPS, buildLUT } from "@/lib/rasterColor"; 
export const runtime = "nodejs";

type BandRaster = {
  data: Float32Array | Uint16Array | Uint8Array;
  width: number;
  height: number;
  bbox: [number, number, number, number] | null;
};

// ── SAS signing + GeoTIFF-header caching ────────────────────────────────────
// قبل كده الفرونت كانت بتعمل request منفصل لكل asset لـ
// planetarycomputer.microsoft.com/api/sas/v1/sign *قبل* ما تبعت أي حاجة
// للباك (2-3 requests لوحدهم)، وبعدين الباك كان بيعمل fromUrl على كل باند
// من الأول تاني (header/IFD fetches) حتى لو نفس الـ scene اتطلبت قبل كده
// بثواني. دلوقتي التوقيع بقى مسؤولية الباك وحده، ومعاه cache قصير المدى
// عشان الطلبات المتكررة (تغيير باند/لون على نفس الـ scene) متعملش
// signing/header-fetch جديد كل مرة.

// الحجم النهائي المستهدف للصورة الخارجة (نفس القيمة المستخدمة في renderComposite/renderIndex).
// بنستخدمها هنا كمان عشان نختار أنسب overview level بدل ما نقرا الصورة كاملة الدقة.
const TARGET_MAX_DIM = 1024;

const SIGN_CACHE_TTL_MS = 50 * 60 * 1000; // التوكن بتاع PC صالح ~ساعة، بنجدده قبلها بأمان
const IMAGE_CACHE_TTL_MS = 4 * 60 * 1000; // مجرد تقليل header round-trips على الطلبات المتقاربة

type SignedEntry = { href: string; expiresAt: number };
const signCache = new Map<string, SignedEntry>();

type GeotiffImage = Awaited<ReturnType<Awaited<ReturnType<typeof fromUrl>>["getImage"]>>;
type OverviewLevel = { image: GeotiffImage; width: number; height: number };
type ImageCacheEntry = {
  // levels[0] هي دايمًا الصورة كاملة الدقة (base)، والباقي overviews بترتيب
  // تنازلي في الدقة — Sentinel-2 COGs عادة فيها 3-5 مستويات زي كده جوه نفس
  // الملف، فقراءة مستوى مناسب بدل الـ base بتقلل البيانات المنقولة جدًا.
  levels: OverviewLevel[];
  fullWidth: number;
  fullHeight: number;
  geoKeys: unknown;
  nativeBbox: [number, number, number, number];
  nativeIsDegrees: boolean;
  expiresAt: number;
};
const imageCache = new Map<string, ImageCacheEntry>();

// بتختار أنسب overview level لنافذة الـ AOI المطلوبة: أوطى دقة تقدر توفي
// بالحجم المستهدف (TARGET_MAX_DIM) من غير ما تنزل تحته (عشان مايبانش ضبابي).
function pickOverviewLevel(
  levels: OverviewLevel[],
  windowWidthFull: number,
  windowHeightFull: number
): OverviewLevel {
  const desiredFactor = Math.max(windowWidthFull, windowHeightFull) / TARGET_MAX_DIM;
  if (desiredFactor <= 1) return levels[0]; // الـ AOI أصلًا أصغر من الهدف — استخدمي الـ base

  const base = levels[0];
  let best = base;
  let bestFactor = 1;
  for (const level of levels) {
    const factor = base.width / level.width; // downsample ratio بالنسبة للـ base
    if (factor <= desiredFactor && factor > bestFactor) {
      best = level;
      bestFactor = factor;
    }
  }
  return best;
}

function isPlanetaryComputerBlobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".blob.core.windows.net");
  } catch {
    return false;
  }
}

function isAlreadySigned(url: string): boolean {
  try {
    const params = new URL(url).searchParams;
    // Azure SAS tokens بتحتوي على sig= و se= (وغيرهم)
    return params.has("sig") && params.has("se");
  } catch {
    return false;
  }
}

// بتوقّع رابط Planetary Computer (لو محتاج توقيع فعلاً) مع caching، عشان
// نفس الـ asset متتوقعش تاني في كل preview جديد قبل ما التوكن ينتهي.
async function signPlanetaryComputerUrl(url: string): Promise<string> {
  if (!isPlanetaryComputerBlobUrl(url) || isAlreadySigned(url)) return url;

  const cached = signCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.href;

  try {
    const res = await fetch(
      `https://planetarycomputer.microsoft.com/api/sas/v1/sign?href=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      // ⚠️ كان بيرجع الرابط الأصلي (الغير موقّع) بصمت هنا، فأي فشل حقيقي في
      // التوقيع كان بيظهر بعدين كـ "Request failed" مبهمة من geotiff.js لما
      // Azure يرفض الرابط الغير موقّع (403) — بدل ما نعرف السبب الحقيقي فورًا.
      const bodyText = await res.text().catch(() => "");
      console.error(`[sign] PC sign API returned ${res.status} for ${url}: ${bodyText.slice(0, 300)}`);
      throw new Error(`PC SAS sign failed (${res.status}) for ${url}`);
    }
    const data = await res.json();
    const href = typeof data?.href === "string" ? data.href : url;

    let expiresAt = Date.now() + SIGN_CACHE_TTL_MS;
    const expiryRaw = data?.["msft:expiry"];
    if (typeof expiryRaw === "string") {
      const parsed = Date.parse(expiryRaw);
      if (Number.isFinite(parsed)) {
        // نسيب مساحة أمان 2 دقيقة قبل الانتهاء الفعلي
        expiresAt = Math.min(expiresAt, parsed - 2 * 60 * 1000);
      }
    }

    signCache.set(url, { href, expiresAt });
    return href;
  } catch (err) {
    // ⚠️ فشل الشبكة (DNS/فايروول/timeout) بيوصل هنا. كان بيترجع url من غير
    // توقيع بصمت — دلوقتي بنسجّل السبب الحقيقي في اللوج قبل ما نكمل، عشان
    // تقدري تفرّقي بين "فشل توقيع" و"فشل شبكة" من اللوج مباشرة بدل ما تلفّي
    // على fromUrl() تاني كل مرة.
    console.error(`[sign] Failed to sign ${url}:`, err instanceof Error ? err.message : err);
    return url;
  }
}

type AnalysisType =
  | "rgb" | "swir"
  | "ndvi" | "ndwi" | "ndmi" | "ndbi" | "savi" | "evi" | "bsi"
  | "change_rgb" | "change_swir"
  | "change_ndvi" | "change_ndwi" | "change_ndbi" | "change_ndmi"
  | "change_savi" | "change_evi" | "change_bsi"
  // Sentinel-1 (Radar / SAR)
  | "vv" | "vh"  | "change_vv" | "change_vh"
  | "vv_vh_ratio" | "sar_rgb"
  // Copernicus DEM
  | "elevation" | "slope" | "hillshade" | "aspect" 
  // Sentinel-5P (Atmosphere) — ✅ حقيقية دلوقتي عن طريق /gis/sentinel5p/decode
  // (شوفي sentinelDecode.ts في الفرونت). "o3" alias جديد لنفس "ozone" القديمة
  // (الـ endpoint الجديد بيرجّع اسم المتغير "O3" مش "OZONE").
  | "no2" | "so2" | "co" | "ozone" | "o3" | "ch4" | "hcho" | "cloud"
  // Sentinel-3 SST — عن طريق نفس الـ decode endpoint (شوفي الكومنت فوق no2/so2/co/ozone تحت)
  | "sst"
  // ⚠️ (2026-08-04) تلاتة Sentinel-3 analyses جداد بقوا يعدّوا على نفس
  // مسار SST/الغازات (decode → COG → هنا) بدل TiTiler المباشر بتاع Planetary
  // Computer، اللي كان بيفشل مع NetCDF+variable= ويرجّع RGB overview بدل
  // heatmap ملوّن (شوفي sentinelDecode.ts للتفاصيل). أسماء الـ type هنا هي
  // variable.toLowerCase() اللي buildRasterProxyAnalyzeUrl بتبعته:
  // LST→"lst", FRP_MWIR→"frp_mwir", CHL_NN→"chl_nn".
  | "lst" | "frp_mwir" | "chl_nn";

type CompositeConfig = { kind: "composite"; bandCount: 3; label: string };
type IndexConfig = {
  kind: "index";
  bandCount: 1 | 2 | 3 | 4;
  label: string;
  /** Applied per-pixel with each band's value as one arg, in the order listed in the type's `urls` doc. */
  formula: (...values: number[]) => number;
  defaultColormap: string;
  // ⚠️ اختياري: fallback rescale range (لو ?min=/?max= مفيش في الـ query).
  // الـ default العام تحت في GET (-1/1) مبني على افتراض إن القيمة index
  // معياري (NDVI/NDWI/...) — ده غلط تمامًا لغازات Sentinel-5P/SST اللي
  // قيمها الحقيقية بعيدة كل البعد عن مدى -1..1 (مثلاً NO2 ~1e-5..1e-4).
  // لو استُخدم الـ default العام لغاز بالغلط (مثلاً لو /statistics فشلت
  // ورجعت null)، كل بكسل كان بيقع جوه منطقة الشفافية القريبة من الصفر
  // وتطلع الصورة شفافة بالكامل — "مفيش حاجة بتظهر". القيم هنا تقريبية
  // (نطاق نموذجي معروف للمنتج ده) — أفضل بكتير لسه إنها تيجي من
  // /api/raster-proxy/statistics (p2/p98 حقيقيين لنفس الملف)، ده بس شبكة
  // أمان لو الـ statistics مش متاحة لأي سبب.
  defaultMin?: number;
  defaultMax?: number;
};
type ChangeConfig = {
  kind: "change";
  bandCount: 2 | 4 | 6 | 8; // 2x the underlying index's bandCount — [...beforeBands, ...afterBands]
  label: string;
  /** Same per-index formula, evaluated once for the "before" bands and once for "after". */
  formula: (...values: number[]) => number;
  /** label shown for a positive (increase) change — e.g. "Vegetation Gain" */
  gainLabel: string;
  /** label shown for a negative (decrease) change — e.g. "Vegetation Loss" */
  lossLabel: string;
};
// ── DEM (Copernicus) derivative products ────────────────────────────────────
// مختلفين معماريًا عن composite/index/change: دول محتاجين قيم البكسلات
// المجاورة (3x3 neighborhood) مش بس قيمة البكسل نفسه، عشان يحسبوا التدرّج
// (gradient) — فمش ممكن نعبّر عنهم بـ per-pixel formula زي باقي الأنواع.
// شوفي renderDemProduct تحت.
type DemConfig = {
  kind: "dem";
  bandCount: 1;
  label: string;
  product: "elevation" | "slope" | "hillshade" | "aspect";
  defaultColormap: string;
};
// ── Sentinel-5P (Atmosphere) — placeholder ──────────────────────────────────
// ⚠️ مش شغالة فعليًا لسه: الـ collection الحقيقي (sentinel-5p-l2-netcdf) بيانه
// NetCDF مش GeoTIFF، وgeotiff.js (اللي كل الملف ده مبني عليه عن طريق fromUrl)
// مبيقراش NetCDF أصلًا. محتاجة إما endpoint تاني في الباك بايثون بتاعك يحول
// الـ NetCDF لـ COG/PNG، أو نستخدم preview rendered من Planetary Computer API
// مباشرة بدل ما نحسب البكسلات إحنا. الأنواع دي بترجع 501 دلوقتي بدل ما تفشل
// بصمت أو تدّي نتيجة غلط.
type UnsupportedConfig = { kind: "unsupported"; label: string; reason: string };
// ── SAR RGB composite (Sentinel-1) ──────────────────────────────────────────
// مختلف عن CompositeConfig العادي: بياخد بس 2 assets (vv, vh) مش 3 — القناة
// التالتة (الـ ratio) بتتحسب داخليًا من نفس الاتنين دول، مش asset تالت منفصل.
// كل قناة (VV dB / VH dB / ratio dB) بتاخد dB conversion الأول وبعدين
// percentile stretch مستقلة، بنفس فكرة renderComposite العادي.
type SarCompositeConfig = { kind: "sar_composite"; bandCount: 2; label: string };

const ANALYSIS_CONFIG: Record<AnalysisType, CompositeConfig | IndexConfig | ChangeConfig | DemConfig | UnsupportedConfig | SarCompositeConfig> = {
  rgb:  { kind: "composite", bandCount: 3, label: "True color (e.g. B04,B03,B02 → R,G,B)" },
  swir: { kind: "composite", bandCount: 3, label: "SWIR false color (e.g. B12,B8A,B04 → R,G,B)" },
  ndvi: {
    kind: "index", bandCount: 2, label: "NDVI (NIR,Red — e.g. B08,B04)",
    formula: (nir, red) => (nir - red) / (nir + red || 1e-6),
    defaultColormap: "rdylgn",
  },
  ndwi: {
    kind: "index", bandCount: 2, label: "NDWI (Green,NIR — e.g. B03,B08)",
    formula: (green, nir) => (green - nir) / (green + nir || 1e-6),
    defaultColormap: "rdbu",
  },
  ndmi: {
    kind: "index", bandCount: 2, label: "NDMI (NIR,SWIR1 — e.g. B08,B11)",
    formula: (nir, swir1) => (nir - swir1) / (nir + swir1 || 1e-6),
    defaultColormap: "greens",
  },
  ndbi: {
    kind: "index", bandCount: 2, label: "NDBI (SWIR1,NIR — e.g. B11,B08)",
    formula: (swir1, nir) => (swir1 - nir) / (swir1 + nir || 1e-6),
    defaultColormap: "inferno",
  },
  savi: {
    // Soil-Adjusted Vegetation Index — same shape as NDVI but with a soil-brightness
    // correction factor L (0.5 is the standard default for intermediate vegetation
    // cover) so bare/sparse-canopy areas don't get over-read as high vegetation.
    kind: "index", bandCount: 2, label: "SAVI (NIR,Red — e.g. B08,B04)",
    formula: (nir, red) => ((nir - red) / (nir + red + 0.5 || 1e-6)) * 1.5,
    defaultColormap: "spectral",
  },
  evi: {
    // Enhanced Vegetation Index — standard MODIS/Sentinel coefficients
    // (G=2.5, C1=6, C2=7.5, L=1). Needs Blue in addition to NIR/Red to correct
    // for atmospheric scattering and canopy background, which is why it needs
    // 3 bands instead of NDVI's 2.
    kind: "index", bandCount: 3, label: "EVI (NIR,Red,Blue — e.g. B08,B04,B02)",
    formula: (nir, red, blue) => (2.5 * (nir - red)) / (nir + 6 * red - 7.5 * blue + 1 || 1e-6),
    defaultColormap: "magma",
  },
  bsi: {
    // Bare Soil Index — combines SWIR+Red (soil-responsive) vs NIR+Blue
    // (vegetation/water-responsive) into one normalized-difference-style ratio.
    kind: "index", bandCount: 4, label: "BSI (SWIR1,Red,NIR,Blue — e.g. B11,B04,B08,B02)",
    formula: (swir1, red, nir, blue) =>
      ((swir1 + red) - (nir + blue)) / ((swir1 + red) + (nir + blue) || 1e-6),
    defaultColormap: "rdbu_r",
  },
  change_rgb: {
    // True-color composite has no normalized index, so "before"/"after" are
    // reduced to standard perceptual luminance (Rec. 709 weights) and compared
    // like any other index — same threshold/classThreshold pipeline as below.
    kind: "change", bandCount: 6,
    label: "Change RGB (beforeRed,beforeGreen,beforeBlue,afterRed,afterGreen,afterBlue — e.g. B04,B03,B02,B04,B03,B02)",
    formula: (red, green, blue) => (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 10000,
    gainLabel: "Brightness Gain", lossLabel: "Brightness Loss",
  },
  change_swir: {
    // Same luminance-based reduction as change_rgb, applied to the SWIR false-color
    // combination — surfaces things like burn scars or moisture shifts that show up
    // as brightness swings in the SWIR/NIR/Red composite even without a named index.
    kind: "change", bandCount: 6,
    label: "Change SWIR (beforeSWIR,beforeNIR,beforeRed,afterSWIR,afterNIR,afterRed — e.g. B12,B8A,B04,B12,B8A,B04)",
    formula: (swir, nir, red) => (0.2126 * swir + 0.7152 * nir + 0.0722 * red) / 10000,
    gainLabel: "SWIR Signal Gain", lossLabel: "SWIR Signal Loss",
  },
  change_ndvi: {
    kind: "change", bandCount: 4, label: "Change NDVI (beforeNIR,beforeRed,afterNIR,afterRed — e.g. B08,B04,B08,B04)",
    formula: (nir, red) => (nir - red) / (nir + red || 1e-6),
    gainLabel: "Vegetation Gain", lossLabel: "Vegetation Loss",
  },
  change_ndwi: {
    kind: "change", bandCount: 4, label: "Change NDWI (beforeGreen,beforeNIR,afterGreen,afterNIR — e.g. B03,B08,B03,B08)",
    formula: (green, nir) => (green - nir) / (green + nir || 1e-6),
    gainLabel: "Water Gain", lossLabel: "Water Loss",
  },
  change_ndbi: {
    kind: "change", bandCount: 4, label: "Change NDBI (beforeSWIR,beforeNIR,afterSWIR,afterNIR — e.g. B11,B08,B11,B08)",
    formula: (swir, nir) => (swir - nir) / (swir + nir || 1e-6),
    gainLabel: "Built-up Gain", lossLabel: "Built-up Loss",
  },
  change_ndmi: {
    kind: "change", bandCount: 4, label: "Change NDMI (beforeNIR,beforeSWIR1,afterNIR,afterSWIR1 — e.g. B08,B11,B08,B11)",
    formula: (nir, swir1) => (nir - swir1) / (nir + swir1 || 1e-6),
    gainLabel: "Moisture Gain", lossLabel: "Moisture Loss",
  },
  change_savi: {
    kind: "change", bandCount: 4, label: "Change SAVI (beforeNIR,beforeRed,afterNIR,afterRed — e.g. B08,B04,B08,B04)",
    formula: (nir, red) => ((nir - red) / (nir + red + 0.5 || 1e-6)) * 1.5,
    gainLabel: "Vegetation Gain", lossLabel: "Vegetation Loss",
  },
  change_evi: {
    kind: "change", bandCount: 6,
    label: "Change EVI (beforeNIR,beforeRed,beforeBlue,afterNIR,afterRed,afterBlue — e.g. B08,B04,B02,B08,B04,B02)",
    formula: (nir, red, blue) => (2.5 * (nir - red)) / (nir + 6 * red - 7.5 * blue + 1 || 1e-6),
    gainLabel: "Vegetation Gain", lossLabel: "Vegetation Loss",
  },
  change_bsi: {
    kind: "change", bandCount: 8,
    label: "Change BSI (beforeSWIR1,beforeRed,beforeNIR,beforeBlue,afterSWIR1,afterRed,afterNIR,afterBlue — e.g. B11,B04,B08,B02,B11,B04,B08,B02)",
    formula: (swir1, red, nir, blue) => ((swir1 + red) - (nir + blue)) / ((swir1 + red) + (nir + blue) || 1e-6),
    gainLabel: "Bare Soil Gain", lossLabel: "Bare Soil Loss",
  },

  // ── Sentinel-1 (Radar / SAR) ──────────────────────────────────────────────
  // VV/VH بيجوا كـ band واحد جاهز (قيم dB) من الـ STAC item — formula هنا
  // identity (v => v) لأن مفيش حساب index، بس بنستفيد من نفس pipeline الـ
  // rescale/colormap/alpha بتاع renderIndex.
  vv: {
    kind: "index", bandCount: 1, label: "VV backscatter, dB (single band)",
    // Planetary Computer GRD pixels are detected amplitudes, while this
    // viewer's scale is in dB. Without this conversion almost every pixel is
    // clipped to one colour and the overlay appears missing.
    formula: (v) => v > 0 ? 20 * Math.log10(v) : -40,
    defaultColormap: "spectral_r",
  },
  vh: {
    kind: "index", bandCount: 1, label: "VH backscatter, dB (single band)",
    formula: (v) => v > 0 ? 20 * Math.log10(v) : -40,
    defaultColormap: "spectral",
  },
  // ⚠️ ده approximation: مفيش threshold classifier حقيقي هنا لسه، بنعتمد على
  // rescale ضيق حوالين قيمة الـ dB اللي بيميز المية (VV منخفضة = سطح أملس)
  // عشان يديلك إحساس بصري بمناطق الفيضان، مش تصنيف binary مضبوط. للتصنيف
  // الحقيقي محتاجين threshold value يتحدد من بيانات حقيقية (histogram) مش رقم
  // ثابت.
  change_vv: {
    kind: "change", bandCount: 2, label: "Surface Change — VV (beforeVV,afterVV)",
    formula: (v) => v > 0 ? 20 * Math.log10(v) : -40,
    gainLabel: "Backscatter Gain", lossLabel: "Backscatter Loss",
  },
  change_vh: {
    kind: "change", bandCount: 2, label: "Surface Change — VH (beforeVH,afterVH)",
    formula: (v) => v > 0 ? 20 * Math.log10(v) : -40,
    gainLabel: "Backscatter Gain", lossLabel: "Backscatter Loss",
  },
  vv_vh_ratio: {
    // Same dB conversion as vv/vh above, applied to both bands, then subtracted
    // (dB subtraction = ratio of the underlying amplitudes: 20log10(VV/VH)).
    // Separates smooth/specular surfaces (water, roads — low ratio spread)
    // from rough/volume-scattering ones (vegetation, urban — higher spread).
    kind: "index", bandCount: 2, label: "VV/VH Ratio, dB (VV,VH)",
    formula: (vv, vh) => {
      const vvDb = vv > 0 ? 20 * Math.log10(vv) : -40;
      const vhDb = vh > 0 ? 20 * Math.log10(vh) : -40;
      return vvDb - vhDb;
    },
    defaultColormap: "spectral",
  },
  sar_rgb: {
    // R=VV dB, G=VH dB, B=VV/VH ratio dB — classic SAR false-color composite:
    // water/roads read dark, vegetation greenish, urban/built-up brighter with
    // a distinct hue from the ratio channel. See renderSarComposite.
    kind: "sar_composite", bandCount: 2, label: "SAR RGB Composite (VV,VH → R=VV, G=VH, B=VV/VH ratio, dB)",
  },

  // ── Copernicus DEM ─────────────────────────────────────────────────────────
  // كلهم مبنيين على نفس elevation band ("data") — الفرق في المعالجة مش
  // الـ input، شوفي renderDemProduct.
  elevation: {
    kind: "dem", bandCount: 1, label: "Elevation (single DEM band)",
    // كان "spectral_r" (أزرق→أحمر ديفيرجينج) بيخالف الـ legend في البانل
    // ("أخضر=واطي، أصفر=نص، أحمر=عالي"). اتغيّر لـ "rdylgn" — شوفي عكس الـ
    // byte جوه renderDemProduct (قسم elevation) عشان اتجاه الألوان يطابق صح.
    product: "elevation", defaultColormap: "rdylgn",
  },
  slope: {
    kind: "dem", bandCount: 1, label: "Slope steepness in degrees (from DEM)",
    // كان "inferno" (أسود→بنفسجي→أصفر) بيخالف الـ legend ("0°=أخضر مسطح،
    // 45°+=أحمر شديد الانحدار"). اتغيّر لـ "rdylgn" مع عكس الـ byte جوه
    // renderDemProduct (قسم slope).
    product: "slope", defaultColormap: "rdylgn",
  },
  hillshade: {
    kind: "dem", bandCount: 1, label: "Shaded relief (from DEM)",
    product: "hillshade", defaultColormap: "",
  },
  aspect: {
    kind: "dem", bandCount: 1, label: "Slope direction / compass aspect (from DEM)",
    // الـ ramp نفسه فضل "rdylbu_r" — بس اتجاه عرضه اتعكس جوه renderDemProduct
    // (قسم aspect) عشان N(0°)=أحمر وE/S(90°-180°)=أخضر وW(270°)=بنفسجي
    // يطابقوا الـ legend بدل ما يبقوا معكوسين.
    product: "aspect", defaultColormap: "rdylbu_r",
  },

  // ── Sentinel-5P (Atmosphere) + Sentinel-3 (SST) ─────────────────────────
  // ✅ اتحلت (تاني): الفرونت بقى بيكلم /gis/sentinel5p/decode (JWT-protected،
  // شوفي sentinelDecode.ts) بدل sentinel5p_cog.py القديم — endpoint واحد
  // موحّد شغّال للـ 9 غازات دول مع بعض *و* Sentinel-3 SST، وبياخد item_id
  // مباشرة من غير ما الفرونت يجيب رابط NetCDF الأصلي بنفسه. بيرجّع GeoTIFF
  // عادي (band واحد، قيمة العمود الفعلية جاهزة، فـ identity function زي
  // قبل). rMin/rMax بييجوا من ?min=/?max= — الفرونت بقى بيجيبهم من
  // /api/raster-proxy/statistics (p2/p98 حقيقيين لكل متغير) قبل ما يبني
  // الرابط ده، مش أرقام ثابتة مخمّنة، عشان كل غاز/SST يتلوّن بمداه الطبيعي.
  no2: {
    kind: "index", bandCount: 1, label: "NO2 tropospheric column (mol/m², single band from COG)",
    formula: (v) => v, defaultColormap: "inferno",
    defaultMin: 0, defaultMax: 0.0001,
  },
  so2: {
    kind: "index", bandCount: 1, label: "SO2 column density (mol/m², single band from COG)",
    formula: (v) => v, defaultColormap: "rdylbu_r",
    defaultMin: 0, defaultMax: 0.001,
  },
  co: {
    kind: "index", bandCount: 1, label: "CO column density (mol/m², single band from COG)",
    formula: (v) => v, defaultColormap: "greens",
    defaultMin: 0.01, defaultMax: 0.05,
  },
  ozone: {
    kind: "index", bandCount: 1, label: "Total column ozone (mol/m², single band from COG)",
    formula: (v) => v, defaultColormap: "rdbu_r",
    defaultMin: 0.002, defaultMax: 0.008,
  },
  // "o3" == "ozone" بالظبط — alias عشان الـ decode endpoint بيرجّع اسم
  // المتغير "O3" (مش "OZONE")، فـ sentinelDecode.ts بيبعت type=o3.
  o3: {
    kind: "index", bandCount: 1, label: "Total column ozone (mol/m², single band from COG)",
    formula: (v) => v, defaultColormap: "rdbu_r",
    defaultMin: 0.002, defaultMax: 0.008,
  },
  ch4: {
    kind: "index", bandCount: 1, label: "CH4 column-averaged mixing ratio (ppb, single band from COG)",
    formula: (v) => v, defaultColormap: "magma",
    defaultMin: 1700, defaultMax: 1950,
  },
  hcho: {
    kind: "index", bandCount: 1, label: "HCHO (formaldehyde) tropospheric column (mol/m², single band from COG)",
    formula: (v) => v, defaultColormap: "spectral",
    defaultMin: 0, defaultMax: 0.0002,
  },
  cloud: {
    kind: "index", bandCount: 1, label: "Cloud fraction (0-1, single band from COG)",
    formula: (v) => v, defaultColormap: "spectral",
    defaultMin: 0, defaultMax: 1,
  },
  sst: {
    kind: "index", bandCount: 1, label: "Sea surface temperature (Kelvin, single band from COG)",
    formula: (v) => v, defaultColormap: "rdylbu_r",
    defaultMin: 270, defaultMax: 310,
  },
  // ⚠️ (2026-08-04) الأربعة دول defaultMin/defaultMax مبنيين على نفس نطاقات
  // TITILER_STYLES القديمة (SatellitePipelines.ts) قبل ما ننقلهم لمسار
  // decode ده — دي أرقام تقريبية نموذجية (product spec)، مش قياس فعلي لكل
  // scene. زي باقي الغازات، الفرونت المفروض يبعت ?min=/?max= حقيقيين من
  // /api/raster-proxy/statistics (p2/p98) لو الـ endpoint ده اتفعّل معاهم،
  // فـ defaultMin/Max هنا بس fallback لو الـ statistics فشلت.
  // ⚠️ colormap: مستخدمة هنا بس أسماء موجودة أصلًا في RAMPS (lib/rasterColor)
  // زي باقي الأنواع فوق — لو "turbo"/"hot" (المستخدمين في TITILER_STYLES
  // القديمة) مش معرّفين جوه RAMPS، الكود هيقع تلقائيًا على fallback الـ
  // ramp الافتراضي (rdylgn/rdbu_r حسب مكان الاستخدام) بدل error — لسه محتاج
  // تتأكدي من محتوى lib/rasterColor.ts.
  lst: {
    kind: "index", bandCount: 1, label: "SLSTR land surface temperature (Kelvin, single band from COG)",
    formula: (v) => v, defaultColormap: "inferno",
    defaultMin: 250, defaultMax: 330,
  },
  frp_mwir: {
    kind: "index", bandCount: 1, label: "SLSTR fire radiative power, MWIR channel (MW, single band from COG)",
    formula: (v) => v, defaultColormap: "inferno",
    defaultMin: 0, defaultMax: 100,
  },
  chl_nn: {
    kind: "index", bandCount: 1, label: "OLCI chlorophyll-a concentration, neural-net algorithm (mg/m³, single band from COG)",
    formula: (v) => v, defaultColormap: "greens",
    defaultMin: 0, defaultMax: 10,
  },
};

// ── reproject a native-CRS bbox into WGS84 (lon/lat), reused by full & windowed reads ──
function reprojectToWGS84(
  bbox: [number, number, number, number],
  geoKeys: unknown
): [number, number, number, number] | null {
  const looksLikeDegrees =
    Math.abs(bbox[0]) <= 180 && Math.abs(bbox[2]) <= 180 &&
    Math.abs(bbox[1]) <= 90 && Math.abs(bbox[3]) <= 90;

  let bb = bbox;
  if (!looksLikeDegrees && geoKeys) {
    try {
      const { proj4: srcProj4 } = toProj4(geoKeys as Parameters<typeof toProj4>[0]);
      if (srcProj4) {
        const [w, s] = proj4(srcProj4, "EPSG:4326", [bbox[0], bbox[1]]);
        const [e, n] = proj4(srcProj4, "EPSG:4326", [bbox[2], bbox[3]]);
        bb = [w, s, e, n];
      }
    } catch {
      return null;
    }
  }

  if (
    bb.every((v) => Number.isFinite(v)) &&
    Math.abs(bb[0]) <= 180 && Math.abs(bb[2]) <= 180 &&
    Math.abs(bb[1]) <= 90 && Math.abs(bb[3]) <= 90
  ) {
    return bb as [number, number, number, number];
  }
  return null;
}

// ── reproject a WGS84 (lon/lat) bbox into the image's native CRS ──
function wgs84ToNative(
  bboxWGS84: [number, number, number, number],
  geoKeys: unknown,
  nativeIsDegrees: boolean
): [number, number, number, number] | null {
  if (nativeIsDegrees) return bboxWGS84;
  try {
    const { proj4: dstProj4 } = toProj4(geoKeys as Parameters<typeof toProj4>[0]);
    if (!dstProj4) return null;
    const [w, s] = proj4("EPSG:4326", dstProj4, [bboxWGS84[0], bboxWGS84[1]]);
    const [e, n] = proj4("EPSG:4326", dstProj4, [bboxWGS84[2], bboxWGS84[3]]);
    return [w, s, e, n];
  } catch {
    return null;
  }
}

// ── فتح الـ GeoTIFF مباشرة من الـ URL (بيستفيد من HTTP range-requests بتاعة
// geotiff.js على COGs) وقراءة الـ pixel window المطابق للـ AOI بس — مش الصورة
// كلها. ده أساسي: Sentinel-2 scene كامل ~11000×11000 بكسل/باند، وتحميل/فك تشفير
// الملف كامل هو اللي كان بيخلي الـ request يعلّق أو يقعد "loading" لمدة طويلة جدًا.
// ── Sentinel-1 GRD raw measurement URLs use Ground Control Points (GCPs)
// instead of a plain affine geotransform. geotiff.js/fromUrl has no GCP
// resolution, so opening these directly and windowing by bbox (the normal
// readBand path below) reads whichever "unsolved" raw row/col block happens
// to land at those pixel indices — the same wrong patch every time,
// regardless of the actual AOI. That's why vv_vh_ratio/sar_rgb always
// rendered one flat color no matter what was selected (water, land, mixed —
// didn't matter, same broken window). Planetary Computer's own Data API
// resolves the GCPs server-side and hands back a normal, correctly
// georeferenced crop for exactly the requested bbox, so for this one URL
// shape we swap the raw blob URL for that crop endpoint instead of reading
// it directly. (VV/VH standalone previews never hit this bug because they
// go through TiTiler's own tilejson/bbox endpoint, not this route.)
const S1_GRD_MEASUREMENT_RE =
  /\/s1-grd\/GRD\/\d+\/\d+\/\d+\/IW\/[A-Z]{2}\/([^/]+)\/measurement\/iw\d?-(vv|vh|hh|hv)\.tiff$/i;

function sentinel1CropUrl(
  rawUrl: string,
  bboxWGS84: [number, number, number, number]
): string | null {
  let pathname: string;
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    return null;
  }
  const match = pathname.match(S1_GRD_MEASUREMENT_RE);
  if (!match) return null;
  const [, folderName, pol] = match;
  // ⚠️ اسم الفولدر في الـ blob (SAFE naming) بينتهي بـ "Product Unique ID"
  // (4 حروف/أرقام hex، مثلاً "_5A28") — الجزء ده مش موجود في الـ item id
  // المسجل فعليًا في Planetary Computer's STAC catalog، فلازم نشيله قبل ما
  // نبعته لـ crop endpoint، وإلا PC هترجع 404 على item مش موجود بالاسم ده
  // (وده كان بيطلع 502 "Failed to read bands" في الفرونت).
  const itemId = folderName.replace(/_[0-9A-F]{4}$/i, "");
  const [w, s, e, n] = bboxWGS84;
  // ⚠️ PC's public Data API (مبني على titiler-pgstac) بيسمي عملية الـ
  // cropping-by-bounding-box endpoint بتاعتها "bbox" مش "crop" — استخدام
  // "item/crop/..." كان بيضرب route مش موجود أصلًا، فـ PC كانت بترجع
  // FastAPI's generic 404 ({"detail":"Not Found"}) حتى لو الـ item نفسه
  // موجود فعلًا في الكتالوج (اتأكد إنه موجود عن طريق /stac/v1/search).
  return (
    `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${w},${s},${e},${n}.tif` +
    `?collection=sentinel-1-grd&item=${encodeURIComponent(itemId)}&assets=${pol.toLowerCase()}`
  );
}

async function readBand(
  url: string,
  token: string | null | undefined,
  queryBboxWGS84: [number, number, number, number] | null
): Promise<BandRaster & { timing: Record<string, number> }> {
  const t: Record<string, number> = { sign: 0, headerOpen: 0, overviewList: 0, pixelRead: 0, cacheHit: 0 };
  const tStart = performance.now();

  // لو الرابط ده raw Sentinel-1 measurement (GCP-referenced) وعندنا bbox،
  // بنستبدله بـ crop endpoint بتاع Planetary Computer Data API (شوفي الكومنت
  // فوق sentinel1CropUrl) — الكاش لازم يبقى keyed على الرابط الفعلي المستخدم
  // (اللي بيتغير مع كل bbox جديد) مش على الرابط الخام الثابت.
  const cropUrl = queryBboxWGS84 ? sentinel1CropUrl(url, queryBboxWGS84) : null;
  const effectiveUrl = cropUrl ?? url;

  // الكاش متعامل على الـ raw url (قبل التوقيع) عشان مفتاح ثابت حتى لو
  // التوكن اتجدد؛ التوقيع نفسه ليه cache منفصل جوه signPlanetaryComputerUrl.
  const cacheKey = effectiveUrl;
  const cached = imageCache.get(cacheKey);

  let levels: OverviewLevel[];
  let fullWidth: number;
  let fullHeight: number;
  let geoKeys: unknown;
  let nativeBbox: [number, number, number, number];
  let nativeIsDegrees: boolean;

  if (cached && cached.expiresAt > Date.now()) {
    ({ levels, fullWidth, fullHeight, geoKeys, nativeBbox, nativeIsDegrees } = cached);
    t.cacheHit = 1;
  } else {
    let tp = performance.now();
    // الـ crop endpoint عام (public) — مش محتاج SAS signing زيه زي الـ raw
    // blob urls، فبنتخطى signPlanetaryComputerUrl تمامًا في الحالة دي.
    const signedUrl = cropUrl ?? (await signPlanetaryComputerUrl(url));
    t.sign = performance.now() - tp;

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let tiff;
    tp = performance.now();
    try {
      if (cropUrl) {
        // Crop responses are already limited to the AOI (small) — fetch the
        // whole thing with a plain fetch() instead of geotiff.js's own
        // range-request fetcher, so a rejected/malformed request surfaces
        // the real HTTP status + response body instead of geotiff.js's
        // generic, undiagnosable "Error fetching data."
        const cropRes = await fetch(cropUrl, { headers });
        if (!cropRes.ok) {
          const bodyText = await cropRes.text().catch(() => "");
          throw new Error(
            `Planetary Computer crop endpoint returned ${cropRes.status}: ${bodyText.slice(0, 500)}`
          );
        }
        const buf = await cropRes.arrayBuffer();
        tiff = await fromArrayBuffer(buf);
      } else {
        tiff = await fromUrl(signedUrl, { headers });
      }
    } catch (err) {
      // ⚠️ بنضيف هنا هل الرابط كان اتوقّع فعليًا (sig= موجودة) ولا لأ —
      // ده بيفرّق فورًا بين "التوقيع فشل والسيرفر رفض 403" و"مشكلة شبكة/DNS
      // حتى مع رابط موقّع صح" من غير ما تحتاجي تبصي على لوجات الـ sign تانية.
      // ⚠️ بنطبع effectiveUrl (الرابط اللي اتحاول فعليًا — crop أو الخام)
      // مش url الخام دايمًا، عشان لو المشكلة في الـ crop endpoint بالذات
      // تبان في الرسالة نفسها بدل ما تفضل مخفية وراء الرابط الخام.
      const wasSigned = isAlreadySigned(signedUrl);
      throw new Error(
        `Upstream fetch failed: ${effectiveUrl} (${(err as Error).message}) [signed=${wasSigned}]`
      );
    }

    const baseImage = await tiff.getImage(0);
    fullWidth = baseImage.getWidth();
    fullHeight = baseImage.getHeight();
    geoKeys = baseImage.getGeoKeys();

    try {
      nativeBbox = baseImage.getBoundingBox() as [number, number, number, number];
    } catch {
      nativeBbox = [0, 0, fullWidth, fullHeight];
    }

    nativeIsDegrees =
      Math.abs(nativeBbox[0]) <= 180 && Math.abs(nativeBbox[2]) <= 180 &&
      Math.abs(nativeBbox[1]) <= 90 && Math.abs(nativeBbox[3]) <= 90;
    t.headerOpen = performance.now() - tp;

    levels = [{ image: baseImage, width: fullWidth, height: fullHeight }];
    // بناء قائمة overviews — دي metadata بس (مفيش pixel data بتتقرا هنا)،
    // فالتكلفة صغيرة جدًا مقارنة بقراءة الصورة كاملة الدقة لاحقًا
    tp = performance.now();
    try {
      const count = await tiff.getImageCount();
      for (let i = 1; i < count; i++) {
        const img = await tiff.getImage(i);
        levels.push({ image: img, width: img.getWidth(), height: img.getHeight() });
      }
    } catch {
      // لو الملف مفيهوش overviews أو فشل السرد، نكمل بالـ base بس
    }
    t.overviewList = performance.now() - tp;

    imageCache.set(cacheKey, {
      levels, fullWidth, fullHeight, geoKeys, nativeBbox, nativeIsDegrees,
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    });
  }

  // الخطوة 1: نحسب النافذة على دقة الـ base الأول، عشان نعرف حجم الـ AOI
  // بالبكسل ونقدر نختار أنسب overview level بناءً عليه.
  let baseWindow: [number, number, number, number] | undefined;
  let windowNativeBbox = nativeBbox;

  if (queryBboxWGS84) {
    const queryNative = wgs84ToNative(queryBboxWGS84, geoKeys, nativeIsDegrees);

    if (queryNative) {
      const xRes = (nativeBbox[2] - nativeBbox[0]) / fullWidth;
      const yRes = (nativeBbox[3] - nativeBbox[1]) / fullHeight;

      let x0 = Math.floor((queryNative[0] - nativeBbox[0]) / xRes);
      let x1 = Math.ceil((queryNative[2] - nativeBbox[0]) / xRes);
      let y0 = Math.floor((nativeBbox[3] - queryNative[3]) / yRes);
      let y1 = Math.ceil((nativeBbox[3] - queryNative[1]) / yRes);

      x0 = Math.max(0, Math.min(fullWidth - 1, x0));
      x1 = Math.max(x0 + 1, Math.min(fullWidth, x1));
      y0 = Math.max(0, Math.min(fullHeight - 1, y0));
      y1 = Math.max(y0 + 1, Math.min(fullHeight, y1));

      if (x1 > x0 && y1 > y0) {
        baseWindow = [x0, y0, x1, y1];
        windowNativeBbox = [
          nativeBbox[0] + x0 * xRes,
          nativeBbox[3] - y1 * yRes,
          nativeBbox[0] + x1 * xRes,
          nativeBbox[3] - y0 * yRes,
        ];
      }
    }
  }

  if (!baseWindow) {
    // مفيش bbox صالح — بنرجع لسلوك القراءة الكاملة (فallback بس، غير مستحسن للـ scenes الكبيرة)
    throw new Error("Missing/invalid bbox — refusing full-scene read to avoid timing out; pass ?bbox=west,south,east,north");
  }

  // الخطوة 2: نختار أنسب overview level بناءً على حجم النافذة، ونعيد حساب
  // نفس النافذة الجغرافية (windowNativeBbox) بمقاس البكسل بتاع الـ level ده.
  // ده اللي بيقلل البيانات المنقولة من الشبكة بشكل كبير للـ AOI الكبيرة —
  // بدل ما نقرا نافذة من صورة 11000×11000، بنقرا نفس المنطقة من overview
  // أصغر بكتير ومقاسه أصلًا قريب من حجم الإخراج المطلوب (~1024px).
  const baseWindowWidth = baseWindow[2] - baseWindow[0];
  const baseWindowHeight = baseWindow[3] - baseWindow[1];
  const level = pickOverviewLevel(levels, baseWindowWidth, baseWindowHeight);

  const levelScaleX = level.width / fullWidth;
  const levelScaleY = level.height / fullHeight;

  let x0 = Math.floor(baseWindow[0] * levelScaleX);
  let x1 = Math.ceil(baseWindow[2] * levelScaleX);
  let y0 = Math.floor(baseWindow[1] * levelScaleY);
  let y1 = Math.ceil(baseWindow[3] * levelScaleY);

  x0 = Math.max(0, Math.min(level.width - 1, x0));
  x1 = Math.max(x0 + 1, Math.min(level.width, x1));
  y0 = Math.max(0, Math.min(level.height - 1, y0));
  y1 = Math.max(y0 + 1, Math.min(level.height, y1));

  const window: [number, number, number, number] = [x0, y0, x1, y1];

  const tRead = performance.now();
  const rasters = await level.image.readRasters({ window, interleave: false });
  t.pixelRead = performance.now() - tRead;

  const data = rasters[0] as Float32Array | Uint16Array | Uint8Array;
  const width = window[2] - window[0];
  const height = window[3] - window[1];

  const bbox = reprojectToWGS84(windowNativeBbox, geoKeys);

  t.total = performance.now() - tStart;
  return { data, width, height, bbox, timing: t };
}

function checkSameGrid(bands: BandRaster[]) {
  const [first, ...rest] = bands;
  return rest.every((b) => b.width === first.width && b.height === first.height);
}

// ── Align mixed-resolution bands onto one common pixel grid ────────────────
// Sentinel-2 L2A stores B02/B03/B04/B08 at 10m but B11/B12 (SWIR) at 20m —
// each band's native GeoTIFF window is computed independently in readBand(),
// so even for the exact same AOI the SWIR band comes back with roughly half
// the width/height of the 10m bands (plus independent floor/ceil rounding on
// top of that). Any index mixing a SWIR band with a 10m band (NDMI, SWIR
// composite, NDBI, BSI) was failing checkSameGrid because of this, while
// indices built only from 10m bands (NDVI, NDWI, SAVI, EVI) never hit it.
// Fix: resample every band up/down to match the highest-resolution band in
// the set (nearest-neighbor — cheap, and band math doesn't need interpolation
// quality here, just aligned pixels) before compositing/index math runs.
function resampleNearest(band: BandRaster, targetWidth: number, targetHeight: number): BandRaster {
  if (band.width === targetWidth && band.height === targetHeight) return band;

  const ctor = band.data.constructor as new (len: number) => BandRaster["data"];
  const out = new ctor(targetWidth * targetHeight);
  const xRatio = band.width / targetWidth;
  const yRatio = band.height / targetHeight;

  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(band.height - 1, Math.floor(y * yRatio));
    const srcRowOffset = srcY * band.width;
    const dstRowOffset = y * targetWidth;
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(band.width - 1, Math.floor(x * xRatio));
      out[dstRowOffset + x] = band.data[srcRowOffset + srcX];
    }
  }

  return { ...band, data: out, width: targetWidth, height: targetHeight };
}

function alignBandsToCommonGrid(bands: BandRaster[]): BandRaster[] {
  if (bands.length <= 1) return bands;

  let refIdx = 0;
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].width * bands[i].height > bands[refIdx].width * bands[refIdx].height) refIdx = i;
  }
  const targetWidth = bands[refIdx].width;
  const targetHeight = bands[refIdx].height;

  return bands.map((b) => resampleNearest(b, targetWidth, targetHeight));
}

// ── Speckle filter (Lee filter) لبيانات SAR الخام ───────────────────────────
// كل بكسل في صورة SAR فيه speckle noise طبيعي (نتيجة التداخل البناء/الهدام
// لموجات الرادار المرتجعة من داخل نفس resolution cell). VH بالذات بيتأثر بيها
// أكتر من VV لإن إشارته أضعف وأقرب لـ noise floor، فبعد الـ dB conversion +
// الـ percentile stretch الضيق (2%-98%) الضوضاء دي بتتمدد على المدى اللوني
// كامل وتبين وكأنها عشوائية بالكامل حتى لو فيه بنية حقيقية تحتها.
//
// الـ Lee filter ده adaptive: بيحافظ على الحواف/البنية الحقيقية (بعكس boxcar
// mean اللي بيمسح كل حاجة زي بعض بما فيها الحواف) عن طريق مقارنة التباين
// المحلي حوالين كل بكسل بتباين الضوضاء العام في الصورة كلها:
//   - لو التباين المحلي عالي (يعني فيه حافة/بنية حقيقية) → نسيب البكسل قريب
//     من قيمته الأصلية.
//   - لو التباين المحلي واطي (يعني منطقة متجانسة والتباين اللي فيها أغلبه
//     ضوضاء) → نستبدله بالمتوسط المحلي (smoothing).
// بيشتغل على الـ amplitude الخام (قبل تحويل dB) عشان يبقى متوافق مع فيزياء
// الـ speckle نفسها (multiplicative noise على الـ amplitude/intensity).
function applySpeckleFilter(band: BandRaster, windowSize = 3): BandRaster {
  const { data, width, height } = band;
  const ctor = data.constructor as new (len: number) => BandRaster["data"];
  const out = new ctor(data.length);
  const r = Math.max(1, Math.floor(windowSize / 2));

  // تقدير عام لـ coefficient of variation بتاع الضوضاء من الصورة كلها —
  // ده اللي بيفرّق للـ Lee filter بين "تباين حقيقي في الإشارة" و"تباين ناتج
  // عن الـ speckle" في كل نافذة محلية بعد كده.
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const n = data.length || 1;
  const globalMean = sum / n;
  const globalVar = Math.max(sumSq / n - globalMean * globalMean, 0);
  const globalCV = globalMean > 0 ? Math.sqrt(globalVar) / globalMean : 0;
  const noiseVariance = globalCV * globalCV;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      let localSum = 0;
      let localSumSq = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        const rowOffset = yy * width;
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const v = data[rowOffset + xx];
          localSum += v;
          localSumSq += v * v;
          count++;
        }
      }
      const localMean = localSum / count;
      const localVar = Math.max(localSumSq / count - localMean * localMean, 0);

      // Lee filter weight: k = localVar / (localVar + localMean² · noiseVariance)
      const denom = localVar + localMean * localMean * noiseVariance;
      const k = denom > 0 ? localVar / denom : 0;

      out[idx] = localMean + k * (data[idx] - localMean);
    }
  }

  return { ...band, data: out };
}

// أنواع SAR اللي محتاجة speckle filtering قبل الـ dB conversion/rendering —
// باقي الأنواع (Sentinel-2 optical, DEM, ...) مالهاش دعوة بالـ speckle
// أصلًا فمبنطبقهوش عليها.
const SAR_SPECKLE_FILTER_TYPES = new Set<string>([
  "vv", "vh", "vv_vh_ratio", "sar_rgb", "change_vv", "change_vh",
]);

// Evaluates a per-pixel band-math formula against 2, 3, or 4 bands without
// allocating a temporary array every pixel (this runs once per pixel per
// band count, so for a ~1000x1000 AOI that's ~1M calls — allocation here
// would show up as real GC pressure).
function evalFormula(formula: (...values: number[]) => number, bands: BandRaster[], i: number): number {
  switch (bands.length) {
    case 2: return formula(bands[0].data[i], bands[1].data[i]);
    case 3: return formula(bands[0].data[i], bands[1].data[i], bands[2].data[i]);
    case 4: return formula(bands[0].data[i], bands[1].data[i], bands[2].data[i], bands[3].data[i]);
    default: return formula(...bands.map((b) => b.data[i]));
  }
}

// True if every band is 0 at pixel i — used as the "no data" signal (Sentinel-2
// L2A masks nodata pixels to 0 across bands).
function allZero(bands: BandRaster[], i: number): boolean {
  for (const b of bands) if (b.data[i] !== 0) return false;
  return true;
}

// ── Composite path (rgb / swir) ─────────────────────────────────────────────
function computePercentiles(data: ArrayLike<number>, low: number, high: number, sampleStep = 4) {
  const sample: number[] = [];
  for (let i = 0; i < data.length; i += sampleStep) {
    const v = data[i];
    if (Number.isFinite(v) && v > 0) sample.push(v);
  }
  if (sample.length === 0) return { p2: 0, p98: 1 };
  sample.sort((a, b) => a - b);
  const idx = (p: number) =>
    sample[Math.min(sample.length - 1, Math.max(0, Math.floor((p / 100) * sample.length)))];
  return { p2: idx(low), p98: idx(high) };
}

function stretchBandToUint8(data: ArrayLike<number>, p2: number, p98: number, gamma: number): Uint8Array {
  const out = new Uint8Array(data.length);
  const range = p98 - p2 || 1;
  const invGamma = 1 / gamma;
  for (let i = 0; i < data.length; i++) {
    let t = (data[i] - p2) / range;
    t = Math.max(0, Math.min(1, t));
    t = Math.pow(t, invGamma);
    out[i] = Math.round(t * 255);
  }
  return out;
}

async function renderComposite(bands: BandRaster[], gamma: number, doSharpen: boolean, low: number, high: number) {
  const { width, height } = bands[0];
  const stats = bands.map((band) => computePercentiles(band.data, low, high));
  const channels = bands.map((band, i) => stretchBandToUint8(band.data, stats[i].p2, stats[i].p98, gamma));

  const rgbaData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgbaData[i * 4]     = channels[0][i];
    rgbaData[i * 4 + 1] = channels[1][i];
    rgbaData[i * 4 + 2] = channels[2][i];
    rgbaData[i * 4 + 3] = 255;
  }

  // ── تكبير ناعم بـ Lanczos3 (مش nearest-neighbor) ──────────────────────────
  // Sentinel-2 دقتها الأصلية 10م/بكسل. لو الـ AOI صغير (مساحة قليلة بالهكتار)،
  // بترجع صورة صغيرة جدًا بالبكسل، ولو من غير الخطوة دي المتصفح/Leaflet هو
  // اللي بيكبرها nearest-neighbor فبتبان مربعات "colormap-style" بدل صورة
  // ناعمة. ملحوظة: ده بيحسّن العرض بس مش بيخترع تفاصيل تحت دقة الـ 10م الأصلية.
  const scale = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  let pipeline = sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 });
  if (doSharpen) pipeline = pipeline.sharpen({ sigma: 0.6 });
  const pngBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();
  return { pngBuffer, stats };
}

// ── SAR RGB composite path (sar_rgb) ────────────────────────────────────────
// زي computePercentiles العادية بالظبط، إلا إنها بتاخد كل القيم المنتهية
// (finite) مش بس الموجبة — قيم الـ dB هنا سالبة غالبًا (VV ~ -15..0, VH ~
// -25..-5, والفرق بينهم ممكن يبقى سالب أو موجب)، ففلتر "v > 0" العادي كان
// هيشيل كل حاجة تقريبًا.
function computePercentilesSigned(data: ArrayLike<number>, low: number, high: number, sampleStep = 4) {
  const sample: number[] = [];
  for (let i = 0; i < data.length; i += sampleStep) {
    const v = data[i];
    if (Number.isFinite(v)) sample.push(v);
  }
  if (sample.length === 0) return { p2: 0, p98: 1 };
  sample.sort((a, b) => a - b);
  const idx = (p: number) =>
    sample[Math.min(sample.length - 1, Math.max(0, Math.floor((p / 100) * sample.length)))];
  return { p2: idx(low), p98: idx(high) };
}

async function renderSarComposite(
  bands: BandRaster[], // [vv, vh] raw amplitude
  gamma: number,
  doSharpen: boolean,
  low: number,
  high: number
) {
  const { width, height } = bands[0];
  const n = width * height;
  const vv = bands[0].data;
  const vh = bands[1].data;

  const vvDb = new Float32Array(n);
  const vhDb = new Float32Array(n);
  const ratioDb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = vv[i];
    const h = vh[i];
    const vDb = v > 0 ? 20 * Math.log10(v) : -40;
    const hDb = h > 0 ? 20 * Math.log10(h) : -40;
    vvDb[i] = vDb;
    vhDb[i] = hDb;
    ratioDb[i] = vDb - hDb;
  }

  const channelValues = [vvDb, vhDb, ratioDb];
  const channelStats = channelValues.map((d) => computePercentilesSigned(d, low, high));
  const channels = channelValues.map((d, i) =>
    stretchBandToUint8(d, channelStats[i].p2, channelStats[i].p98, gamma)
  );

  const rgbaData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgbaData[i * 4]     = channels[0][i]; // R = VV (dB)
    rgbaData[i * 4 + 1] = channels[1][i]; // G = VH (dB)
    rgbaData[i * 4 + 2] = channels[2][i]; // B = VV/VH ratio (dB)
    rgbaData[i * 4 + 3] = 255;
  }

  const scale = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  let pipeline = sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 });
  if (doSharpen) pipeline = pipeline.sharpen({ sigma: 0.6 });
  const pngBuffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();

  const stats = {
    vvDb: { min: channelStats[0].p2, max: channelStats[0].p98 },
    vhDb: { min: channelStats[1].p2, max: channelStats[1].p98 },
    ratioDb: { min: channelStats[2].p2, max: channelStats[2].p98 },
  };

  return { pngBuffer, stats };
}

// ── Index path (ndvi / ndwi / ndmi / ndbi / savi / evi / bsi) ───────────────

// Same idea as computePercentiles() for composites, but over the *computed
// index values* (not raw band DNs), and only over pixels where the bands
// aren't all-zero (nodata). Needed because a fixed, "typical" rescale like
// NDWI's -0.3..0.8 assumes the AOI actually contains both dry land AND open
// water. Point the same rescale at a desert AOI with no water bodies at all
// and every real value clusters in a narrow low sub-band (e.g. -0.3..-0.05) —
// the whole tile then maps to one end of the colormap and renders as one flat
// color with no visible contrast between features, even though the bands
// themselves are fine. Stretching to the AOI's own 2nd/98th percentile makes
// whatever range is actually present fill the whole colormap instead.
function computeIndexPercentiles(
  values: Float32Array,
  validMask: Uint8Array,
  low: number,
  high: number,
  sampleStep = 4
): { lo: number; hi: number } | null {
  const sample: number[] = [];
  for (let i = 0; i < values.length; i += sampleStep) {
    if (validMask[i]) sample.push(values[i]);
  }
  if (sample.length < 8) return null;
  sample.sort((a, b) => a - b);
  const idx = (p: number) =>
    sample[Math.min(sample.length - 1, Math.max(0, Math.floor((p / 100) * sample.length)))];
  return { lo: idx(low), hi: idx(high) };
}

async function renderIndex(
  bands: BandRaster[],
  formula: (...values: number[]) => number,
  colormap: string,
  rMin: number,
  rMax: number,
  zeroVal: number,
  alphaLow: number,
  alphaHigh: number,
  transparent: boolean
) {
  const { width, height } = bands[0];
  const n = width * height;
  const indexValues = new Float32Array(n);
  const validMask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    indexValues[i] = evalFormula(formula, bands, i);
    validMask[i] = allZero(bands, i) ? 0 : 1;
  }

  // Auto-stretch to what's actually in this AOI (see comment above). Falls
  // back to the caller's rMin/rMax if there's too little valid data or the
  // AOI genuinely has almost no spread (near-uniform surface) — stretching a
  // near-zero range would just amplify sensor noise into fake contrast.
  let effMin = rMin;
  let effMax = rMax;
  const pct = computeIndexPercentiles(indexValues, validMask, 2, 98);
  if (pct && pct.hi - pct.lo > (rMax - rMin) * 0.03) {
    effMin = pct.lo;
    effMax = pct.hi;
  }

  const range = effMax - effMin || 0.001;
  const stops = RAMPS[colormap] ?? RAMPS["rdylgn"];
  const lut = buildLUT(stops);

  const t0 = Math.max(0, Math.min(1, (zeroVal - effMin) / range));
  const maxDist = Math.max(t0, 1 - t0) || 1;
  const zeroByte = Math.max(0, Math.min(255, Math.round(t0 * 255)));

  const alphaLUT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (!transparent) { alphaLUT[i] = 255; continue; }
    if (Math.abs(i - zeroByte) <= 1) { alphaLUT[i] = 0; continue; }
    const t = i / 255;
    const dist = Math.abs(t - t0) / maxDist;
    const eased = Math.max(0, Math.min(1, (dist - alphaLow) / Math.max(0.001, alphaHigh - alphaLow)));
    const smooth = eased * eased * (3 - 2 * eased);
    alphaLUT[i] = Math.round(smooth * 255);
  }

  const rgbaData = Buffer.alloc(n * 4);
  let validPixels = 0, sum = 0, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = indexValues[i];
    let t = (v - effMin) / range;
    t = Math.max(0, Math.min(1, t));
    const byte = Math.round(t * 255);
    const alpha = alphaLUT[byte];
    if (alpha > 0) {
      validPixels++;
      sum += v;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    rgbaData[i * 4]     = lut[byte * 3];
    rgbaData[i * 4 + 1] = lut[byte * 3 + 1];
    rgbaData[i * 4 + 2] = lut[byte * 3 + 2];
    rgbaData[i * 4 + 3] = alpha;
  }

  const stats = validPixels > 0
    ? { min: minV, max: maxV, mean: sum / validPixels, validPixels, appliedRange: [effMin, effMax] }
    : { min: rMin, max: rMax, mean: 0, validPixels: 0, appliedRange: [effMin, effMax] };

  const scale = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const pngBuffer = await sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { pngBuffer, stats };
}

// ── Change Detection path (change_ndvi / change_ndwi / change_ndbi / change_ndmi) ────────
// Classifies each pixel into one of 5 clear, distinct classes instead of a
// continuous diverging ramp — matches the "No Change / Gain / Loss / Other
// Change / No Data" legend style used by reference change-detection products.
type ChangeClass = "noData" | "noChange" | "gain" | "loss" | "other";

const CHANGE_COLORS: Record<ChangeClass, [number, number, number]> = {
  noData:   [156, 163, 175], // gray-400
  noChange: [34, 139, 34],   // forest green
  gain:     [0, 200, 83],    // vivid green
  loss:     [229, 57, 53],   // red
  other:    [234, 179, 8],   // amber/yellow
};

async function renderChange(
  beforeBands: BandRaster[],
  afterBands: BandRaster[],
  formula: (...values: number[]) => number,
  threshold: number,
  classThreshold: number,
) {
  const { width, height } = beforeBands[0];
  const n = width * height;
  const rgbaData = Buffer.alloc(n * 4);

  const counts: Record<ChangeClass, number> = { noData: 0, noChange: 0, gain: 0, loss: 0, other: 0 };

  for (let i = 0; i < n; i++) {
    let cls: ChangeClass;
    if (allZero(beforeBands, i) || allZero(afterBands, i)) {
      cls = "noData";
    } else {
      const beforeVal = evalFormula(formula, beforeBands, i);
      const afterVal = evalFormula(formula, afterBands, i);
      const delta = afterVal - beforeVal;

      if (Math.abs(delta) < threshold) {
        cls = "noChange";
      } else if (delta > 0 && afterVal >= classThreshold) {
        cls = "gain";
      } else if (delta < 0 && beforeVal >= classThreshold) {
        cls = "loss";
      } else {
        cls = "other";
      }
    }

    counts[cls]++;
    const [r, g, b] = CHANGE_COLORS[cls];
    const o = i * 4;
    rgbaData[o] = r;
    rgbaData[o + 1] = g;
    rgbaData[o + 2] = b;
    rgbaData[o + 3] = cls === "noData" ? 90 : 235;
  }

  const total = n || 1;
  const stats = {
    noDataPct: (counts.noData / total) * 100,
    noChangePct: (counts.noChange / total) * 100,
    gainPct: (counts.gain / total) * 100,
    lossPct: (counts.loss / total) * 100,
    otherPct: (counts.other / total) * 100,
  };

  const scale = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const pngBuffer = await sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { pngBuffer, stats };
}

// ── DEM derivative path (elevation / slope / hillshade / aspect / contours) ──
// المشترك بين الخمسة دول: بياخدوا بلد elevation واحد بس، وبيحسبوا لكل بكسل
// بناءً على الـ 3×3 neighborhood بتاعته (مش قيمة البكسل لوحدها زي renderIndex).
// عشان كده مش ممكن نستخدم evalFormula العادية هنا.

// متر/بكسل من الـ bbox الحقيقي بتاع النافذة (WGS84) — نفس الحسبة المستخدمة في
// /api/raster-proxy (route.ts التاني) لحساب مساحة البكسل بالمتر المربع.
function pixelSizeMeters(bbox: [number, number, number, number] | null, width: number, height: number) {
  if (!bbox) return { pw: 30, ph: 30 }; // fallback تقريبي (دقة Copernicus DEM الافتراضية)
  const [w, s, e, n] = bbox;
  const latMid = (s + n) / 2;
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos((latMid * Math.PI) / 180);
  const pw = (Math.abs(e - w) / width) * metersPerDegLon || 30;
  const ph = (Math.abs(n - s) / height) * metersPerDegLat || 30;
  return { pw, ph };
}

// بيرجع قيمة الـ elevation عند (x,y) مع clamp للحواف (edge-replicate) — أبسط
// وأنسب حل لبكسلات الحدود بدل ما نتعامل معاها كـ nodata ونعمل فجوة سودة حوالين
// إطار الصورة كله.
function sampleClamped(data: ArrayLike<number>, width: number, height: number, x: number, y: number) {
  const cx = Math.max(0, Math.min(width - 1, x));
  const cy = Math.max(0, Math.min(height - 1, y));
  return data[cy * width + cx];
}

async function renderDemProduct(
  band: BandRaster,
  product: DemConfig["product"],
  colormap: string,
  rMin: number,
  rMax: number,
  contourIntervalM: number,
  // ⚠️ زي renderIndex بالظبط: "v === 0" هو الطريقة اللي بنكتشف بيها nodata،
  // بس في مناطق قريبة من مستوى سطح البحر (زي بعض الدلتا/الواحات) قيمة
  // elevation الحقيقية ممكن فعلاً تساوي أو تقرب من 0 — فبيتفلتر بالغلط كـ
  // "لا بيانات" وتفضل شفافة بالكامل. forceOpaque (جاي من ?transparent=0)
  // بيقفل الفلتر ده تمامًا لـ elevation/slope/aspect/hillshade — مش لـ
  // contours لأن الشفافية هناك هي أصل الرسم (اللي مش خط بيبقى شفاف كده
  // مقصود، مش nodata).
  forceOpaque = false,
) {
  const { width, height, data, bbox } = band;
  const n = width * height;
  const { pw, ph } = pixelSizeMeters(bbox, width, height);

  const rgbaData = Buffer.alloc(n * 4);
  let validPixels = 0, sum = 0, minV = Infinity, maxV = -Infinity;

  if (product === "elevation") {
    const stops = RAMPS[colormap] ?? RAMPS["rdylgn"] ?? RAMPS["spectral_r"];
    const lut = buildLUT(stops);
    // A 0..1500 m global scale makes a small, almost-flat AOI look like one
    // colour. Stretch to its own 2nd..98th percentile when it has relief.
    const local = computePercentiles(data, 2, 98);
    const displayMin = local.p98 - local.p2 > 0.5 ? local.p2 : rMin;
    const displayMax = local.p98 - local.p2 > 0.5 ? local.p98 : rMax;
    const range = displayMax - displayMin || 1;
    for (let i = 0; i < n; i++) {
      const v = data[i];
      const isNoData = !forceOpaque && (v === 0 || !Number.isFinite(v));
      let t = (v - displayMin) / range;
      t = Math.max(0, Math.min(1, t));
      // ⚠️ كان بيستخدم "spectral_r" (أزرق غامق→أحمر غامق ديفيرجينج) بينما
      // الـ legend بيوصف "أخضر=واطي، أصفر=نص، أحمر/أبيض=عالي" — mismatch،
      // ده ليه كانت بتبين بقع زرقاء مالهاش تفسير في اللیجند. defaultColormap
      // اتغيّر لـ "rdylgn" (أحمر عند 0%، أخضر عند 100%)، وهنا بنعكس الـ byte
      // (1-t) عشان الارتفاع الواطي (t=0) يوصل لطرف الأخضر، والعالي (t=1)
      // يوصل لطرف الأحمر — يطابق اللیجند دلوقتي (عدا نقطة "أبيض" في القمة
      // اللي مش موجودة في الـ ramp ده، تفصيلة تجميلية بسيطة مش جوهرية).
      const byte = Math.round((1 - t) * 255);
      const alpha = isNoData ? 0 : 255;
      if (!isNoData) { validPixels++; sum += v; minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
      rgbaData[i * 4] = lut[byte * 3];
      rgbaData[i * 4 + 1] = lut[byte * 3 + 1];
      rgbaData[i * 4 + 2] = lut[byte * 3 + 2];
      rgbaData[i * 4 + 3] = alpha;
    }
  } else if (product === "slope" || product === "aspect" || product === "hillshade") {
    // Horn's method (نفس اللي GDAL/QGIS بيستخدموه) — gradient من 3×3 neighborhood
    const azimuthDeg = 315; // اتجاه الشمس الافتراضي (شمال غرب) — زي الـ hillshade القياسي
    const altitudeDeg = 45; // ارتفاع الشمس الافتراضي
    const zenithRad = ((90 - altitudeDeg) * Math.PI) / 180;
    // ⚠️ باگ حقيقي كان هنا: azimuthDeg (315، بالـ compass bearing — 0°=شمال،
    // بالساعة) كان بيتحول لراديان مباشرة من غير ما يتحول لنفس الـ math-angle
    // convention اللي بيستخدمها atan2(dzdy, -dzdx) تحت (0°=شرق، عكس عقارب
    // الساعة). الفرق بين الاتنين مش مجرد offset بسيط، فكان بيطلع بفرق قريب
    // من 180° في اتجاه الإضاءة الفعلي — يعني الـ hillshade كان بيرسم الظل
    // والضوء على العكس تقريبًا من مكان الشمس الحقيقي (315°/شمال غرب). التحويل
    // الصح (زي ESRI/GDAL): azimuth_math = 360 - azimuth_compass + 90 (mod 360).
    const azimuthMathDeg = (360 - azimuthDeg + 90) % 360;
    const azimuthRad = (azimuthMathDeg * Math.PI) / 180;

    const stops = RAMPS[colormap] ?? RAMPS["inferno"];
    const lut = buildLUT(stops);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const a = sampleClamped(data, width, height, x - 1, y - 1);
        const b = sampleClamped(data, width, height, x,     y - 1);
        const c = sampleClamped(data, width, height, x + 1, y - 1);
        const d = sampleClamped(data, width, height, x - 1, y);
        const f = sampleClamped(data, width, height, x + 1, y);
        const g = sampleClamped(data, width, height, x - 1, y + 1);
        const h = sampleClamped(data, width, height, x,     y + 1);
        const k = sampleClamped(data, width, height, x + 1, y + 1);

        const dzdx = ((c + 2 * f + k) - (a + 2 * d + g)) / (8 * pw);
        const dzdy = ((g + 2 * h + k) - (a + 2 * b + c)) / (8 * ph);
        const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));

        const center = data[i];
        const isNoData = !forceOpaque && (center === 0 || !Number.isFinite(center));

        let byte = 0;
        let value = 0;
        const alpha = isNoData ? 0 : 255;

        if (product === "slope") {
          value = (slopeRad * 180) / Math.PI; // درجات
          const t = Math.max(0, Math.min(1, value / (rMax || 45)));
          // ⚠️ كان بيستخدم colormap "inferno" (أسود→بنفسجي→أحمر→أصفر) بينما
          // الـ legend في البانل بيوصف "0°=أخضر (مسطح) → 45°+=أحمر (شديد
          // الانحدار)" — mismatch كامل، ده ليه الصورة كانت طالعة ماجنتا/بنفسجي
          // بدل أخضر-أصفر-أحمر. defaultColormap اتغيّر لـ "rdylgn" (نفس ramp
          // NDVI: أحمر عند 0%، أخضر عند 100%)، وهنا بنعكس الـ byte (1-t) عشان
          // "مسطح" (t=0) يوصل لطرف الأخضر (100%) و"شديد الانحدار" (t=1) يوصل
          // لطرف الأحمر (0%) — يطابق اللیجند بالظبط.
          byte = Math.round((1 - t) * 255);
        } else if (product === "aspect") {
          let aspectDeg = (Math.atan2(dzdy, -dzdx) * 180) / Math.PI;
          // تحويل من math angle لـ compass bearing (0°=شمال، بالساعة)
          if (aspectDeg < 0) aspectDeg = 90 - aspectDeg;
          else if (aspectDeg > 90) aspectDeg = 360 - aspectDeg + 90;
          else aspectDeg = 90 - aspectDeg;
          value = aspectDeg;
          // ⚠️ الـ legend بيوصف N(0°)=أحمر، E/S(90°-180°)=أخضر، W(270°)/N(360°)
          // =بنفسجي. ramp "rdylbu_r" (اسمها الحقيقي "Heat") ماشية بنفسجي(0%)→
          // أزرق→سماوي→أخضر(~63%)→أصفر→أحمر(100%) — يعني عكس الاتجاه المطلوب
          // بالظبط. بنعكس الـ byte (1-t) عشان 0°(شمال) يوصل لطرف الأحمر (100%
          // الأصلي)، و~180° يوصل لمنطقة الأخضر، و360° يرجع تاني قريب من طرف
          // البنفسجي (0% الأصلي) — بيطابق اللیجند دلوقتي.
          const t = aspectDeg / 360;
          byte = Math.round((1 - t) * 255);
        } else {
          // hillshade: قيمة 0-255 مباشرة (مش محتاجة colormap فعليًا)
          const shade =
            Math.cos(zenithRad) * Math.cos(slopeRad) +
            Math.sin(zenithRad) * Math.sin(slopeRad) * Math.cos(azimuthRad - Math.atan2(dzdy, -dzdx));
          value = Math.max(0, Math.min(255, Math.round(shade * 255)));
          byte = value;
        }

        if (!isNoData) { validPixels++; sum += value; minV = Math.min(minV, value); maxV = Math.max(maxV, value); }

        if (product === "hillshade") {
          // Grayscale مباشر — من غير LUT/colormap
          rgbaData[i * 4] = byte;
          rgbaData[i * 4 + 1] = byte;
          rgbaData[i * 4 + 2] = byte;
          rgbaData[i * 4 + 3] = alpha;
        } else {
          rgbaData[i * 4] = lut[byte * 3];
          rgbaData[i * 4 + 1] = lut[byte * 3 + 1];
          rgbaData[i * 4 + 2] = lut[byte * 3 + 2];
          rgbaData[i * 4 + 3] = alpha;
        }
      }
    }
  } else {
    // contours: بنقسم الارتفاع لشرائح كل contourIntervalM متر، وأي بكسل على
    // حدود شريحتين (مختلف عن أي جار من الـ 4 اللي حواليه) بيتلوّن كخط، والباقي
    // شفاف تمامًا — بديل بسيط عن الطريقة التقليدية (marching squares/vector
    // lines) بس شغال جوه نفس الـ PNG pipeline من غير ما نضيف endpoint تاني.
    const interval = contourIntervalM > 0 ? contourIntervalM : 50;
    const classIndex = new Int32Array(n);
    for (let i = 0; i < n; i++) classIndex[i] = Math.floor(data[i] / interval);

    const stops = RAMPS[colormap] ?? RAMPS["spectral"];
    const lut = buildLUT(stops);
    const elevRange = rMax - rMin || 1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const center = data[i];
        const isNoData = center === 0 || !Number.isFinite(center);
        const cls = classIndex[i];
        const neighborClasses = [
          classIndex[Math.max(0, y - 1) * width + x],
          classIndex[Math.min(height - 1, y + 1) * width + x],
          classIndex[y * width + Math.max(0, x - 1)],
          classIndex[y * width + Math.min(width - 1, x + 1)],
        ];
        const isLine = !isNoData && neighborClasses.some((c) => c !== cls);

        if (isLine) {
          const t = Math.max(0, Math.min(1, (center - rMin) / elevRange));
          const byte = Math.round(t * 255);
          rgbaData[i * 4] = lut[byte * 3];
          rgbaData[i * 4 + 1] = lut[byte * 3 + 1];
          rgbaData[i * 4 + 2] = lut[byte * 3 + 2];
          rgbaData[i * 4 + 3] = 255;
          validPixels++; sum += center; minV = Math.min(minV, center); maxV = Math.max(maxV, center);
        } else {
          rgbaData[i * 4 + 3] = 0;
        }
      }
    }
  }

  // A locally flat but not perfectly level area can have hillshade values in
  // a very narrow band (for example 170..178). Stretch that band to black →
  // white so the terrain direction remains visible; a truly flat AOI stays a
  // single tone, which is the correct analytical result.
  if (product === "hillshade" && validPixels > 0 && maxV - minV > 2) {
    const shadeRange = maxV - minV;
    for (let i = 0; i < n; i++) {
      if (rgbaData[i * 4 + 3] === 0) continue;
      const shade = rgbaData[i * 4];
      const stretched = Math.max(0, Math.min(255, Math.round(((shade - minV) / shadeRange) * 255)));
      rgbaData[i * 4] = stretched;
      rgbaData[i * 4 + 1] = stretched;
      rgbaData[i * 4 + 2] = stretched;
    }
  }

  const stats = validPixels > 0
    ? { min: minV, max: maxV, mean: sum / validPixels, validPixels }
    : { min: 0, max: 0, mean: 0, validPixels: 0 };

  const scaleOut = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scaleOut);
  const outH = Math.round(height * scaleOut);

  const pngBuffer = await sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { pngBuffer, stats };
}

export async function GET(req: NextRequest) {
  const tRequestStart = performance.now();
  const { searchParams } = req.nextUrl;
  const type = (searchParams.get("type") ?? "rgb") as AnalysisType;
  const urlsParam = searchParams.get("urls");
  const token = searchParams.get("token");
  const bboxParam = searchParams.get("bbox");

  const config = ANALYSIS_CONFIG[type];
  if (!config) {
    return NextResponse.json(
      { error: `Unknown type "${type}". Expected one of: ${Object.keys(ANALYSIS_CONFIG).join(", ")}` },
      { status: 400 }
    );
  }
  if (config.kind === "unsupported") {
    return NextResponse.json(
      { error: `"${type}" (${config.label}) is not supported yet: ${config.reason}` },
      { status: 501 }
    );
  }
  if (!urlsParam) {
    return NextResponse.json(
      { error: `Missing urls param — "${type}" needs ${config.bandCount} comma-separated URLs (${config.label})` },
      { status: 400 }
    );
  }
  const urls = urlsParam.split(",").map((u) => u.trim()).filter(Boolean);
  if (urls.length !== config.bandCount) {
    return NextResponse.json(
      { error: `"${type}" expects exactly ${config.bandCount} URLs (${config.label}), got ${urls.length}` },
      { status: 400 }
    );
  }

  // bbox إلزامي دلوقتي — من غيره هنضطر نقرا الـ scene كاملة وده اللي كان بيعلّق الطلب
  let queryBbox: [number, number, number, number] | null = null;
  if (bboxParam) {
    const parts = bboxParam.split(",").map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      queryBbox = parts as [number, number, number, number];
    }
  }
  if (!queryBbox) {
    return NextResponse.json(
      { error: "Missing/invalid bbox param — expected ?bbox=west,south,east,north (WGS84) to crop the read window" },
      { status: 400 }
    );
  }

  const tBandsStart = performance.now();
  let bands: BandRaster[];
  let bandTimings: Record<string, number>[];
  try {
    const results = await Promise.all(urls.map((u) => readBand(u, token, queryBbox)));
    bands = results;
    bandTimings = results.map((r) => r.timing);
  } catch (err) {
    return NextResponse.json({ error: `Failed to read bands: ${(err as Error).message}` }, { status: 502 });
  }
  const bandsMs = performance.now() - tBandsStart;

  // بعض الـ bands (زي SWIR في Sentinel-2) دقتها مختلفة عن الباقي (20م بدل 10م)،
  // فبيرجعوا بعرض/طول مختلفين حتى لو نفس الـ AOI بالظبط — نصلّحها هنا قبل أي
  // فحص/حساب عشان NDMI/SWIR/NDBI/BSI تشتغل زي أي index تاني.
  let referenceBandIdx = 0;
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].width * bands[i].height > bands[referenceBandIdx].width * bands[referenceBandIdx].height) {
      referenceBandIdx = i;
    }
  }
  const referenceBbox = bands[referenceBandIdx].bbox;
  bands = alignBandsToCommonGrid(bands);

  // ── SAR speckle filtering (Lee filter) ────────────────────────────────────
  // شغّال بس على أنواع Sentinel-1 (vv/vh/vv_vh_ratio/sar_rgb/change_vv/
  // change_vh)، وقبل أي dB conversion — الـ formula بتاعت كل نوع من دول
  // بتتوقع amplitude خام. اتفعل افتراضيًا (?speckle=0 لإلغاءه، ?speckleWindow=
  // 5 مثلًا لنافذة أكبر/تنعيم أقوى — الافتراضي 3).
  const speckleEnabled = (searchParams.get("speckle") ?? "1") !== "0";
  const speckleWindow = parseInt(searchParams.get("speckleWindow") ?? "3", 10);
  if (speckleEnabled && SAR_SPECKLE_FILTER_TYPES.has(type)) {
    bands = bands.map((b) => applySpeckleFilter(b, speckleWindow));
  }

  if (!checkSameGrid(bands)) {
    return NextResponse.json(
      { error: "Bands have mismatched dimensions — align/reproject to the same grid before compositing" },
      { status: 422 }
    );
  }

  const realBbox = referenceBbox;
  let pngBuffer: Buffer;
  let stats: unknown;
  const tRenderStart = performance.now();

  let changeLegend: { key: string; label: string; color: string }[] | null = null;

  if (config.kind === "composite") {
    const gamma = parseFloat(searchParams.get("gamma") ?? "1.1");
    const doSharpen = (searchParams.get("sharpen") ?? "1") !== "0";
    const low = parseFloat(searchParams.get("low") ?? "2");
    const high = parseFloat(searchParams.get("high") ?? "98");
    const result = await renderComposite(bands, gamma, doSharpen, low, high);
    pngBuffer = result.pngBuffer;
    stats = result.stats;
  } else if (config.kind === "index") {
    const colormap = searchParams.get("colormap") ?? config.defaultColormap;
    // ⚠️ لو ?min=/?max= مش موجودين في الـ query (يعني /statistics فشلت أو
    // اتخطّيت)، بنستخدم defaultMin/defaultMax بتاع الـ type نفسه (لو موجودين
    // — الغازات وSST عندهم قيم واقعية دلوقتي) بدل ما نقع في -1/1 اللي
    // مصمم لـ NDVI/NDWI/... بس. ده اللي كان بيخلي preview الغازات يطلع
    // شفاف بالكامل لما /statistics بترجع فشل.
    const rMin = parseFloat(searchParams.get("min") ?? String(config.defaultMin ?? -1));
    const rMax = parseFloat(searchParams.get("max") ?? String(config.defaultMax ?? 1));
    const zeroVal = parseFloat(searchParams.get("zero") ?? "0");
    const alphaLow = parseFloat(searchParams.get("alphaLow") ?? "0.12");
    const alphaHigh = parseFloat(searchParams.get("alphaHigh") ?? "0.45");
    const transparent = (searchParams.get("transparent") ?? "1") !== "0";
    const result = await renderIndex(
      bands, config.formula, colormap, rMin, rMax, zeroVal, alphaLow, alphaHigh, transparent
    );
    pngBuffer = result.pngBuffer;
    stats = result.stats;
  } else if (config.kind === "sar_composite") {
    const gamma = parseFloat(searchParams.get("gamma") ?? "1.1");
    const doSharpen = (searchParams.get("sharpen") ?? "1") !== "0";
    const low = parseFloat(searchParams.get("low") ?? "2");
    const high = parseFloat(searchParams.get("high") ?? "98");
    const result = await renderSarComposite(bands, gamma, doSharpen, low, high);
    pngBuffer = result.pngBuffer;
    stats = result.stats;
  } else if (config.kind === "dem") {
    const colormap = searchParams.get("colormap") ?? config.defaultColormap;
    const rMin = parseFloat(searchParams.get("min") ?? "0");
    const rMax = parseFloat(searchParams.get("max") ?? "1500");
    const contourInterval = parseFloat(searchParams.get("contourInterval") ?? "50");
    // زي index بالظبط: ?transparent=0 بيقفل فلتر "v===0 يبقى nodata" (مفيدة
    // لـ elevation/slope/aspect/hillshade فوق مناطق قريبة من الصفر فعليًا،
    // مش contours — هناك الشفافية جزء من الرسم نفسه).
    const demTransparent = (searchParams.get("transparent") ?? "1") !== "0";
    const result = await renderDemProduct(
      bands[0], config.product, colormap, rMin, rMax, contourInterval, !demTransparent
    );
    pngBuffer = result.pngBuffer;
    stats = result.stats;
  } else {
    // change_rgb / change_swir / change_ndvi / change_ndwi / change_ndbi / change_ndmi / change_savi / change_evi / change_bsi
    const threshold = parseFloat(searchParams.get("threshold") ?? "0.08");
    const classThreshold = parseFloat(searchParams.get("classThreshold") ?? "0.25");
    const half = config.bandCount / 2;
    const beforeBands = bands.slice(0, half);
    const afterBands = bands.slice(half);
    const result = await renderChange(
      beforeBands, afterBands, config.formula, threshold, classThreshold
    );
    pngBuffer = result.pngBuffer;
    stats = result.stats;
    changeLegend = [
      { key: "gain",     label: config.gainLabel, color: "#00c853" },
      { key: "noChange", label: "No Change",       color: "#228b22" },
      { key: "loss",     label: config.lossLabel,  color: "#e53935" },
      { key: "other",    label: "Other Change",    color: "#eab308" },
      { key: "noData",   label: "No Data",         color: "#9ca3af" },
    ];
  }
  const renderMs = performance.now() - tRenderStart;
  const totalMs = performance.now() - tRequestStart;

  // debug timing — بتبان في الـ Network tab (Response Headers) من غير ما تحتاجي
  // تدخلي لوجات السيرفر. لو عايزة تشوفيها بسرعة: افتحي DevTools → Network →
  // اضغطي على طلب /api/raster-proxy/analyze → Headers → دوّري على X-Debug-Timing.
  const debugTiming = {
    totalMs: Math.round(totalMs),
    bandsMs: Math.round(bandsMs),
    renderMs: Math.round(renderMs),
    perBand: bandTimings.map((bt) => ({
      cacheHit: bt.cacheHit === 1,
      signMs: Math.round(bt.sign),
      headerOpenMs: Math.round(bt.headerOpen),
      overviewListMs: Math.round(bt.overviewList),
      pixelReadMs: Math.round(bt.pixelRead),
      totalMs: Math.round(bt.total),
    })),
  };

  return new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type":      "image/png",
      "Cache-Control":     "public, max-age=300",
      "X-Real-Bbox":       realBbox ? realBbox.join(",") : "",
      "X-Raster-Stats":    JSON.stringify(stats),
      "X-Analysis-Type":   type,
      "X-Debug-Timing":    JSON.stringify(debugTiming),
      ...(changeLegend ? { "X-Change-Legend": JSON.stringify(changeLegend) } : {}),
    },
  });
}