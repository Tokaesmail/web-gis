// app/api/raster-proxy/analyze/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint واحد بيغطي كل أنواع الـ Band Selector:
//   - rgb / swir  → "composite": 3 bands، كل باند ياخد 2%-98% stretch لوحده،
//                   gamma، sharpen (زي true color بالظبط، بس أي bands اللي
//                   الفرونت هيبعتها)
//   - ndvi/ndwi/ndmi → "index": بانداتين، بتتحسب معادلة الـ index لكل بكسل،
//                   وبعدين linear stretch + colormap + شفافية حوالين الصفر
//                   (نفس منطق route.ts الأصلي بتاع الباند الواحد)
//
// Usage:
//   GET /api/raster-proxy/analyze
//       ?type=rgb|swir|ndvi|ndwi|ndmi
//       &urls=<url1>,<url2>[,<url3>]   ← بالترتيب المطلوب لكل نوع (تحت)
//       &bbox=west,south,east,north     ← إلزامي (WGS84) — بيحدد الـ pixel window
//                                          المطلوب قراءته بدل تحميل الـ scene كاملة
//       &token=...
//
//   rgb  → urls = B04,B03,B02  (R,G,B)
//   swir → urls = <SWIR>,<NIR>,<Red>  (حسب الكومبينيشن اللي الفرونت عايزاه، مثلًا B12,B8A,B04)
//   ndvi → urls = B08,B04   (NIR, Red)
//   ndwi → urls = B03,B08   (Green, NIR)
//   ndmi → urls = B08,B11   (NIR, SWIR1)
//
// اختياري لـ composite: gamma (افتراضي 1.1), sharpen (0/1), low/high (2/98)
// اختياري لـ index: colormap, min/max (افتراضي -1/1), zero, alphaLow/alphaHigh, transparent
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { fromUrl } from "geotiff";
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
    if (!res.ok) return url;
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
  } catch {
    return url;
  }
}

type AnalysisType = "rgb" | "swir" | "ndvi" | "ndwi" | "ndmi" | "change_ndvi" | "change_ndwi" | "change_ndbi";

type CompositeConfig = { kind: "composite"; bandCount: 3; label: string };
type IndexConfig = {
  kind: "index";
  bandCount: 2;
  label: string;
  formula: (a: number, b: number) => number;
  defaultColormap: string;
};
type ChangeConfig = {
  kind: "change";
  bandCount: 4; // [beforeA, beforeB, afterA, afterB]
  label: string;
  formula: (a: number, b: number) => number;
  /** label shown for a positive (increase) change — e.g. "Vegetation Gain" */
  gainLabel: string;
  /** label shown for a negative (decrease) change — e.g. "Vegetation Loss" */
  lossLabel: string;
};

const ANALYSIS_CONFIG: Record<AnalysisType, CompositeConfig | IndexConfig | ChangeConfig> = {
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
async function readBand(
  url: string,
  token: string | null | undefined,
  queryBboxWGS84: [number, number, number, number] | null
): Promise<BandRaster & { timing: Record<string, number> }> {
  const t: Record<string, number> = { sign: 0, headerOpen: 0, overviewList: 0, pixelRead: 0, cacheHit: 0 };
  const tStart = performance.now();

  // الكاش متعامل على الـ raw url (قبل التوقيع) عشان مفتاح ثابت حتى لو
  // التوكن اتجدد؛ التوقيع نفسه ليه cache منفصل جوه signPlanetaryComputerUrl.
  const cacheKey = url;
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
    const signedUrl = await signPlanetaryComputerUrl(url);
    t.sign = performance.now() - tp;

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let tiff;
    tp = performance.now();
    try {
      tiff = await fromUrl(signedUrl, { headers });
    } catch (err) {
      throw new Error(`Upstream fetch failed: ${url} (${(err as Error).message})`);
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

// ── Index path (ndvi / ndwi / ndmi) ─────────────────────────────────────────
async function renderIndex(
  bandA: BandRaster,
  bandB: BandRaster,
  formula: (a: number, b: number) => number,
  colormap: string,
  rMin: number,
  rMax: number,
  zeroVal: number,
  alphaLow: number,
  alphaHigh: number,
  transparent: boolean
) {
  const { width, height } = bandA;
  const n = width * height;
  const indexValues = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    indexValues[i] = formula(bandA.data[i], bandB.data[i]);
  }

  const range = rMax - rMin || 0.001;
  const stops = RAMPS[colormap] ?? RAMPS["rdylgn"];
  const lut = buildLUT(stops);

  const t0 = Math.max(0, Math.min(1, (zeroVal - rMin) / range));
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
    let t = (v - rMin) / range;
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
    ? { min: minV, max: maxV, mean: sum / validPixels, validPixels }
    : { min: rMin, max: rMax, mean: 0, validPixels: 0 };

  const scale = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const pngBuffer = await sharp(rgbaData, { raw: { width, height, channels: 4 } })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { pngBuffer, stats };
}

// ── Change Detection path (change_ndvi / change_ndwi / change_ndbi) ────────
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

// alpha لكل كلاس — "noChange" بيغطي غالبًا 90%+ من أي صورة، فلو اديناه
// نفس شفافية باقي الكلاسات (235) هيرسم شبه معتم فوق الصورة كلها ويخلي
// الـ Change Map يبان "أخضر solid" ويغطي أي تفاصيل. هنا بنسيبه شبه شفاف
// (يبين إن الأرض متغيرتش من غير ما يخبي الصورة تحته)، وبنسيب الكلاسات
// الفعلية (gain/loss/other) واضحة وملفتة عشان هي بيت القصيد.
const CHANGE_ALPHA: Record<ChangeClass, number> = {
  noData:   90,
  noChange: 25,
  gain:     235,
  loss:     235,
  other:    235,
};

async function renderChange(
  beforeA: BandRaster,
  beforeB: BandRaster,
  afterA: BandRaster,
  afterB: BandRaster,
  formula: (a: number, b: number) => number,
  threshold: number,
  classThreshold: number,
) {
  const { width, height } = beforeA;
  const n = width * height;
  const rgbaData = Buffer.alloc(n * 4);

  const counts: Record<ChangeClass, number> = { noData: 0, noChange: 0, gain: 0, loss: 0, other: 0 };

  for (let i = 0; i < n; i++) {
    const bA = beforeA.data[i], bB = beforeB.data[i];
    const aA = afterA.data[i], aB = afterB.data[i];

    let cls: ChangeClass;
    if ((bA === 0 && bB === 0) || (aA === 0 && aB === 0)) {
      cls = "noData";
    } else {
      const beforeVal = formula(bA, bB);
      const afterVal = formula(aA, aB);
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
    rgbaData[o + 3] = CHANGE_ALPHA[cls];
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

  if (!checkSameGrid(bands)) {
    return NextResponse.json(
      { error: "Bands have mismatched dimensions — align/reproject to the same grid before compositing" },
      { status: 422 }
    );
  }

  const realBbox = bands[0].bbox;
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
    const rMin = parseFloat(searchParams.get("min") ?? "-1");
    const rMax = parseFloat(searchParams.get("max") ?? "1");
    const zeroVal = parseFloat(searchParams.get("zero") ?? "0");
    const alphaLow = parseFloat(searchParams.get("alphaLow") ?? "0.12");
    const alphaHigh = parseFloat(searchParams.get("alphaHigh") ?? "0.45");
    const transparent = (searchParams.get("transparent") ?? "1") !== "0";
    const result = await renderIndex(
      bands[0], bands[1], config.formula, colormap, rMin, rMax, zeroVal, alphaLow, alphaHigh, transparent
    );
    pngBuffer = result.pngBuffer;
    stats = result.stats;
  } else {
    // change_ndvi / change_ndwi / change_ndbi
    const threshold = parseFloat(searchParams.get("threshold") ?? "0.08");
    const classThreshold = parseFloat(searchParams.get("classThreshold") ?? "0.25");
    const result = await renderChange(
      bands[0], bands[1], bands[2], bands[3], config.formula, threshold, classThreshold
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