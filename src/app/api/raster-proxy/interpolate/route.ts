import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { fromUrl } from "geotiff";
import proj4 from "proj4";
import { toProj4 } from "geotiff-geokeys-to-proj4";
import { RAMPS, buildLUT } from "@/lib/rasterColor";
import {
  INDEX_FORMULAS,
  S2_INDEX_ASSETS,
  DEFAULT_MASKED_SCL_CLASSES,
  daysBetween,
  type InterpolationRequestBody,
  type InterpolationMeta,
} from "@/src/app/_components/AnalysisSidebar/temporalInterpolation";

export const runtime = "nodejs";
// كل مشهد = قراءة 2-4 باندات + SCL، فالطلب هنا أتقل بطبيعته من /analyze.
export const maxDuration = 300;

// ─── إعدادات عامة ────────────────────────────────────────────────────────────
const TARGET_MAX_DIM = 1024;
const SIGN_CACHE_TTL_MS = 50 * 60 * 1000;
const IMAGE_CACHE_TTL_MS = 4 * 60 * 1000;
/** سقف أمان: أكتر من كده والقراءة بتاخد وقت غير معقول (وبتفضي الميموري). */
const MAX_SCENES = 12;
/**
 * أقصى عدد مشاهد بتتقرا في نفس اللحظة. كل مشهد = 2-5 باندات + SCL، فـ 12 مشهد بالتوازي
 * = عشرات الاتصالات المفتوحة على Azure Blob مرة واحدة، وده بيطلّع "fetch failed"
 * (connection reset / timeout) خصوصًا على النت البطيء أو الـ dev server.
 */
const SCENE_READ_CONCURRENCY = 3;
/** عدد محاولات قراءة الباند الواحد قبل ما نفشّل الطلب (بنعيد بس على أخطاء الشبكة). */
const READ_ATTEMPTS = 3;

type BandRaster = {
  data: Float32Array | Uint16Array | Uint8Array;
  width: number;
  height: number;
  bbox: [number, number, number, number] | null;
};

// ─── SAS signing + header cache (منسوخة من analyze/route.ts) ─────────────────
type SignedEntry = { href: string; expiresAt: number };
const signCache = new Map<string, SignedEntry>();

type GeotiffImage = Awaited<ReturnType<Awaited<ReturnType<typeof fromUrl>>["getImage"]>>;
type OverviewLevel = { image: GeotiffImage; width: number; height: number };
type ImageCacheEntry = {
  levels: OverviewLevel[];
  fullWidth: number;
  fullHeight: number;
  geoKeys: unknown;
  nativeBbox: [number, number, number, number];
  nativeIsDegrees: boolean;
  expiresAt: number;
};
const imageCache = new Map<string, ImageCacheEntry>();

function pickOverviewLevel(
  levels: OverviewLevel[],
  windowWidthFull: number,
  windowHeightFull: number
): OverviewLevel {
  const desiredFactor = Math.max(windowWidthFull, windowHeightFull) / TARGET_MAX_DIM;
  if (desiredFactor <= 1) return levels[0];
  const base = levels[0];
  let best = base;
  let bestFactor = 1;
  for (const level of levels) {
    const factor = base.width / level.width;
    if (factor <= desiredFactor && factor > bestFactor) {
      best = level;
      bestFactor = factor;
    }
  }
  return best;
}

function isPlanetaryComputerBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".blob.core.windows.net");
  } catch {
    return false;
  }
}

function isAlreadySigned(url: string): boolean {
  try {
    const params = new URL(url).searchParams;
    return params.has("sig") && params.has("se");
  } catch {
    return false;
  }
}

// Sentinel-2 L2A collection id on Planetary Computer (this route is Sentinel-2 only).
const S2_COLLECTION_ID = "sentinel-2-l2a";

// One SAS token per collection, shared by every band/scene. Signing each URL
// separately fires dozens of parallel calls to the sign API (scenes x bands),
// which gets rate-limited — and the old code then silently fell back to the
// UNSIGNED url, which Azure rejects ("Error fetching data").
const collectionTokenCache = new Map<string, { token: string; expiresAt: number }>();
const collectionTokenInflight = new Map<string, Promise<string>>();

async function getCollectionSasToken(collection: string): Promise<string> {
  const cached = collectionTokenCache.get(collection);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  // De-duplicate concurrent callers: they all await the same request.
  const inflight = collectionTokenInflight.get(collection);
  if (inflight) return inflight;

  const promise = (async () => {
    const res = await fetch(`https://planetarycomputer.microsoft.com/api/sas/v1/token/${collection}`);
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`PC token API ${res.status}: ${bodyText.slice(0, 200)}`);
    }
    const data = await res.json();
    const token = typeof data?.token === "string" ? data.token : null;
    if (!token) throw new Error("PC token API returned no token");

    let expiresAt = Date.now() + SIGN_CACHE_TTL_MS;
    const expiryRaw = data?.["msft:expiry"];
    if (typeof expiryRaw === "string") {
      const parsed = Date.parse(expiryRaw);
      if (Number.isFinite(parsed)) expiresAt = Math.min(expiresAt, parsed - 2 * 60 * 1000);
    }
    collectionTokenCache.set(collection, { token, expiresAt });
    return token;
  })().finally(() => collectionTokenInflight.delete(collection));

  collectionTokenInflight.set(collection, promise);
  return promise;
}

async function signPlanetaryComputerUrl(url: string): Promise<string> {
  if (!isPlanetaryComputerBlobUrl(url) || isAlreadySigned(url)) return url;
  const cached = signCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.href;

  // 1) Preferred: append the shared collection token (one API call for everything).
  let tokenErr: unknown = null;
  try {
    const token = await getCollectionSasToken(S2_COLLECTION_ID);
    return `${url}${url.includes("?") ? "&" : "?"}${token}`;
  } catch (err) {
    tokenErr = err;
    console.error("[interp/sign] collection token failed:", err instanceof Error ? err.message : err);
  }

  // 2) Fallback: sign this single href. If this fails too we THROW instead of
  //    returning the unsigned url, so the real reason reaches the client.
  try {
    const res = await fetch(
      `https://planetarycomputer.microsoft.com/api/sas/v1/sign?href=${encodeURIComponent(url)}`
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(`PC sign API ${res.status}: ${bodyText.slice(0, 200)}`);
    }
    const data = await res.json();
    const href = typeof data?.href === "string" ? data.href : null;
    if (!href || !isAlreadySigned(href)) throw new Error("PC sign API returned an unsigned href");

    let expiresAt = Date.now() + SIGN_CACHE_TTL_MS;
    const expiryRaw = data?.["msft:expiry"];
    if (typeof expiryRaw === "string") {
      const parsed = Date.parse(expiryRaw);
      if (Number.isFinite(parsed)) expiresAt = Math.min(expiresAt, parsed - 2 * 60 * 1000);
    }
    signCache.set(url, { href, expiresAt });
    return href;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const tokenReason = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
    console.error(`[interp/sign] failed ${url}: ${reason}`);
    throw new Error(`Could not sign Planetary Computer URL (token: ${tokenReason}; sign: ${reason})`);
  }
}

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

// قراءة نافذة الـ AOI بس من الـ COG — نفس منطق readBand في analyze/route.ts،
// من غير فرع Sentinel-1 GCP (مش محتاجينه هنا، المصدر Sentinel-2 بس).
async function readBand(
  url: string,
  token: string | null | undefined,
  queryBboxWGS84: [number, number, number, number]
): Promise<BandRaster> {
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
  } else {
    const signedUrl = await signPlanetaryComputerUrl(url);
    const headers: Record<string, string> = {};
    // Azure Blob rejects requests that carry both a SAS query string and an
    // Authorization header, so never send the app token to blob hosts.
    if (token && !isPlanetaryComputerBlobUrl(signedUrl)) headers["Authorization"] = `Bearer ${token}`;

    let tiff;
    try {
      tiff = await fromUrl(signedUrl, { headers });
    } catch (err) {
      throw new Error(
        `Upstream fetch failed: ${url} (${(err as Error).message}) [signed=${isAlreadySigned(signedUrl)}]`
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

    levels = [{ image: baseImage, width: fullWidth, height: fullHeight }];
    try {
      const count = await tiff.getImageCount();
      for (let i = 1; i < count; i++) {
        const img = await tiff.getImage(i);
        levels.push({ image: img, width: img.getWidth(), height: img.getHeight() });
      }
    } catch {
      /* مفيش overviews — نكمل بالـ base */
    }

    imageCache.set(cacheKey, {
      levels, fullWidth, fullHeight, geoKeys, nativeBbox, nativeIsDegrees,
      expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
    });
  }

  const queryNative = wgs84ToNative(queryBboxWGS84, geoKeys, nativeIsDegrees);
  if (!queryNative) throw new Error("Could not project the AOI bbox into the scene CRS");

  const xRes = (nativeBbox[2] - nativeBbox[0]) / fullWidth;
  const yRes = (nativeBbox[3] - nativeBbox[1]) / fullHeight;

  let bx0 = Math.floor((queryNative[0] - nativeBbox[0]) / xRes);
  let bx1 = Math.ceil((queryNative[2] - nativeBbox[0]) / xRes);
  let by0 = Math.floor((nativeBbox[3] - queryNative[3]) / yRes);
  let by1 = Math.ceil((nativeBbox[3] - queryNative[1]) / yRes);

  bx0 = Math.max(0, Math.min(fullWidth - 1, bx0));
  bx1 = Math.max(bx0 + 1, Math.min(fullWidth, bx1));
  by0 = Math.max(0, Math.min(fullHeight - 1, by0));
  by1 = Math.max(by0 + 1, Math.min(fullHeight, by1));

  const windowNativeBbox: [number, number, number, number] = [
    nativeBbox[0] + bx0 * xRes,
    nativeBbox[3] - by1 * yRes,
    nativeBbox[0] + bx1 * xRes,
    nativeBbox[3] - by0 * yRes,
  ];

  const level = pickOverviewLevel(levels, bx1 - bx0, by1 - by0);
  const sx = level.width / fullWidth;
  const sy = level.height / fullHeight;

  let x0 = Math.floor(bx0 * sx);
  let x1 = Math.ceil(bx1 * sx);
  let y0 = Math.floor(by0 * sy);
  let y1 = Math.ceil(by1 * sy);
  x0 = Math.max(0, Math.min(level.width - 1, x0));
  x1 = Math.max(x0 + 1, Math.min(level.width, x1));
  y0 = Math.max(0, Math.min(level.height - 1, y0));
  y1 = Math.max(y0 + 1, Math.min(level.height, y1));

  const rasters = await level.image.readRasters({
    window: [x0, y0, x1, y1],
    interleave: false,
  });

  return {
    data: rasters[0] as Float32Array | Uint16Array | Uint8Array,
    width: x1 - x0,
    height: y1 - y0,
    bbox: reprojectToWGS84(windowNativeBbox, geoKeys),
  };
}

// Node's fetch (undici) بيرمي "fetch failed" من غير تفاصيل؛ السبب الحقيقي
// (ECONNRESET / UND_ERR_CONNECT_TIMEOUT / ENOTFOUND ...) في err.cause.
function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as Error & { cause?: unknown }).cause as { code?: string; message?: string } | undefined;
  const detail = cause ? [cause.code, cause.message].filter(Boolean).join(" ") : "";
  return detail ? `${err.message} (${detail})` : err.message;
}

// نفس Promise.all بس بحد أقصى `limit` مهام شغّالة في نفس الوقت، والنتايج بنفس ترتيب المدخلات.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false; // أول فشل بيوقّف باقي الـ workers بدل ما يكملوا يقرأوا في الخلفية
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        results[idx] = await fn(items[idx]);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function readBandWithRetry(
  url: string,
  token: string | null | undefined,
  queryBboxWGS84: [number, number, number, number]
): Promise<BandRaster> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    try {
      return await readBand(url, token, queryBboxWGS84);
    } catch (err) {
      lastErr = err;
      // أخطاء حتمية (الـ AOI برة الـ CRS) مفيش فايدة من إعادتها.
      if (err instanceof Error && err.message.startsWith("Could not project")) throw err;
      console.warn(
        `[interp] read attempt ${attempt}/${READ_ATTEMPTS} failed for ${url.split("?")[0]}: ${describeError(err)}`
      );
      if (attempt < READ_ATTEMPTS) await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw lastErr;
}

// ─── محاذاة الشبكات ──────────────────────────────────────────────────────────
// باندات Sentinel-2 مش كلها نفس الدقة (B11/B12/SCL = 20م، B02-B08 = 10م)، وكمان
// مشاهد مختلفة ممكن ترجع نافذة أكبر/أصغر ببكسل أو اتنين حسب الـ overview level
// اللي اتختار. بنعيد أخذ العينات (nearest) لكل الباندات على شبكة مرجعية واحدة —
// أعلى دقة موجودة في أول مشهد — قبل أي حساب.
// ⚠️ الافتراض هنا إن كل القراءات لنفس الـ AOI المطلوب بالظبط، فالفرق بينها
// جزء من بكسل (sub-pixel) مش إزاحة حقيقية. ده صحيح لإن كل readBand بيقصّ على
// نفس queryBbox؛ لو ظهرت إزاحة واضحة بين تواريخ، ده مكان البداية للتشخيص.
function resampleNearest(band: BandRaster, targetWidth: number, targetHeight: number): BandRaster {
  if (band.width === targetWidth && band.height === targetHeight) return band;
  const out = new Float32Array(targetWidth * targetHeight);
  const xRatio = band.width / targetWidth;
  const yRatio = band.height / targetHeight;
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(band.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(band.width - 1, Math.floor(x * xRatio));
      out[y * targetWidth + x] = band.data[sy * band.width + sx];
    }
  }
  return { data: out, width: targetWidth, height: targetHeight, bbox: band.bbox };
}

// ─── الرسم (نفس منطق renderIndex في analyze/route.ts) ────────────────────────
function computePercentiles(
  values: Float32Array,
  valid: Uint8Array,
  low: number,
  high: number,
  sampleStep = 4
) {
  const sample: number[] = [];
  for (let i = 0; i < values.length; i += sampleStep) {
    if (valid[i] && Number.isFinite(values[i])) sample.push(values[i]);
  }
  if (sample.length < 32) return null;
  sample.sort((a, b) => a - b);
  const at = (p: number) =>
    sample[Math.max(0, Math.min(sample.length - 1, Math.round((p / 100) * (sample.length - 1))))];
  return { lo: at(low), hi: at(high) };
}

async function renderInterpolated(
  values: Float32Array,
  valid: Uint8Array,
  width: number,
  height: number,
  colormap: string,
  rMin: number,
  rMax: number,
  transparent: boolean
) {
  const n = width * height;

  let effMin = rMin;
  let effMax = rMax;
  const pct = computePercentiles(values, valid, 2, 98);
  if (pct && pct.hi - pct.lo > (rMax - rMin) * 0.03) {
    effMin = pct.lo;
    effMax = pct.hi;
  }
  const range = effMax - effMin || 0.001;

  const stops = RAMPS[colormap] ?? RAMPS["rdylgn"];
  const lut = buildLUT(stops);

  const rgba = Buffer.alloc(n * 4);
  let validPixels = 0;
  let sum = 0;
  let minV = Infinity;
  let maxV = -Infinity;

  for (let i = 0; i < n; i++) {
    // ⚠️ بعكس renderIndex العادي، الشفافية هنا معناها "مفيش بيانات كفاية
    // للانتربوليشن في البكسل ده" مش "القيمة قريبة من الصفر" — البكسل اللي
    // الانتربوليشن فشل فيه لازم يبان فاضي، مش يتلوّن بلون محايد ويوهم إن فيه
    // نتيجة. عشان كده مفيش alphaLow/alphaHigh هنا.
    if (!valid[i] || !Number.isFinite(values[i])) {
      rgba[i * 4 + 3] = 0;
      continue;
    }
    const v = values[i];
    const t = Math.max(0, Math.min(1, (v - effMin) / range));
    const byte = Math.round(t * 255);
    rgba[i * 4] = lut[byte * 3];
    rgba[i * 4 + 1] = lut[byte * 3 + 1];
    rgba[i * 4 + 2] = lut[byte * 3 + 2];
    rgba[i * 4 + 3] = transparent ? 235 : 255;

    validPixels++;
    sum += v;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  const stats =
    validPixels > 0
      ? { min: minV, max: maxV, mean: sum / validPixels, validPixels, appliedRange: [effMin, effMax] }
      : { min: rMin, max: rMax, mean: 0, validPixels: 0, appliedRange: [effMin, effMax] };

  const scale = Math.min(32, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const pngBuffer = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .resize(Math.round(width * scale), Math.round(height * scale), { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return { pngBuffer, stats };
}

// ─── الـ handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const tStart = performance.now();

  let body: InterpolationRequestBody & { token?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    type,
    bbox,
    target,
    scenes = [],
    useScl = true,
    maskClasses = DEFAULT_MASKED_SCL_CLASSES,
    colormap = "rdylgn",
    min: rMin = -1,
    max: rMax = 1,
    transparent = true,
    token,
  } = body;

  // ── فحص المدخلات ──────────────────────────────────────────────────────────
  const analysisKey = Object.keys(INDEX_FORMULAS).find(
    (k) => k.toLowerCase() === String(type ?? "").toLowerCase()
  );
  const formula = analysisKey ? INDEX_FORMULAS[analysisKey as keyof typeof INDEX_FORMULAS] : undefined;
  const expectedBands = analysisKey ? S2_INDEX_ASSETS[analysisKey as keyof typeof S2_INDEX_ASSETS] : undefined;

  if (!formula || !expectedBands) {
    return NextResponse.json(
      { error: `Unknown index "${type}". Supported: ${Object.keys(INDEX_FORMULAS).join(", ")}` },
      { status: 400 }
    );
  }
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every((v) => Number.isFinite(v))) {
    return NextResponse.json(
      { error: "Missing/invalid bbox — expected [west, south, east, north] in WGS84" },
      { status: 400 }
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(target ?? ""))) {
    return NextResponse.json({ error: "Missing/invalid target date — expected YYYY-MM-DD" }, { status: 400 });
  }
  if (scenes.length < 2) {
    return NextResponse.json(
      { error: `Interpolation needs at least 2 scenes, got ${scenes.length}. Pick more dates from the list.` },
      { status: 400 }
    );
  }
  if (scenes.length > MAX_SCENES) {
    return NextResponse.json(
      { error: `Too many scenes (${scenes.length}). Maximum is ${MAX_SCENES} — deselect a few.` },
      { status: 400 }
    );
  }
  const badScene = scenes.find((s) => !Array.isArray(s.urls) || s.urls.length !== expectedBands.length);
  if (badScene) {
    return NextResponse.json(
      {
        error:
          `Scene "${badScene.id}" sent ${badScene?.urls?.length ?? 0} band URL(s) — ` +
          `"${type}" needs exactly ${expectedBands.length} (${expectedBands.join(", ")}) in that order.`,
      },
      { status: 400 }
    );
  }

  // بنرتب المشاهد زمنيًا — كل منطق "أقرب قبل/بعد" تحت معتمد على الترتيب ده.
  const ordered = [...scenes].sort((a, b) => a.date.localeCompare(b.date));

  // ── (1) قراءة كل الباندات ─────────────────────────────────────────────────
  const tRead = performance.now();
  let perSceneBands: { scene: (typeof ordered)[number]; bands: BandRaster[]; scl: BandRaster | null }[];
  try {
    perSceneBands = await mapWithConcurrency(ordered, SCENE_READ_CONCURRENCY, async (scene) => {
      const bands = await Promise.all(
        scene.urls.map((u) => readBandWithRetry(u, token, bbox as [number, number, number, number]))
      );
      const scl =
        useScl && scene.sclUrl
          ? await readBandWithRetry(scene.sclUrl, token, bbox as [number, number, number, number]).catch((err) => {
              // ⚠️ فشل قراءة SCL مش سبب كافي إننا نفشّل الطلب كله — بنكمل
              // من غير ماسك للمشهد ده (وبيتسجل في اللوج) بدل ما نرمي 502 على
              // مشهد واحد مكسور جوه stack من 6.
              console.warn(`[interp] SCL read failed for ${scene.id}: ${describeError(err)}`);
              return null;
            })
          : null;
      return { scene, bands, scl };
    });
  } catch (err) {
    console.error(`[interp] band read failed: ${describeError(err)}`);
    return NextResponse.json({ error: `Failed to read bands: ${describeError(err)}` }, { status: 502 });
  }
  const readMs = performance.now() - tRead;

  // ── (2) محاذاة كل حاجة على شبكة واحدة ─────────────────────────────────────
  // الشبكة المرجعية = أعلى دقة موجودة في أول مشهد (عادةً باند 10م).
  let refBand = perSceneBands[0].bands[0];
  for (const { bands } of perSceneBands) {
    for (const b of bands) {
      if (b.width * b.height > refBand.width * refBand.height) refBand = b;
    }
  }
  const width = refBand.width;
  const height = refBand.height;
  const realBbox = refBand.bbox;
  const n = width * height;

  // ── (3) حساب الـ index لكل مشهد + ماسك السحب ──────────────────────────────
  const tCalc = performance.now();
  const maskSet = new Set<number>(maskClasses);

  const stack: { days: number; values: Float32Array; valid: Uint8Array; validCount: number }[] = [];
  const perScene: InterpolationMeta["perScene"] = [];

  for (const { scene, bands, scl } of perSceneBands) {
    const aligned = bands.map((b) => resampleNearest(b, width, height));
    const sclAligned = scl ? resampleNearest(scl, width, height) : null;

    const values = new Float32Array(n);
    const valid = new Uint8Array(n);
    let validCount = 0;
    const args: number[] = new Array(aligned.length);

    for (let i = 0; i < n; i++) {
      // بكسل خارج الـ swath / fill value: كل الباندات صفر (نفس فحص allZero
      // بتاع analyze/route.ts).
      let allZero = true;
      for (let b = 0; b < aligned.length; b++) {
        const v = Number(aligned[b].data[i]);
        args[b] = v;
        if (v !== 0) allZero = false;
      }
      if (allZero) continue;

      if (sclAligned && maskSet.has(Math.round(Number(sclAligned.data[i])))) continue;

      const value = formula(...args);
      if (!Number.isFinite(value)) continue;

      values[i] = value;
      valid[i] = 1;
      validCount++;
    }

    stack.push({ days: daysBetween(target, scene.date), values, valid, validCount });
    perScene.push({
      id: scene.id,
      date: scene.date,
      validPercent: n > 0 ? Math.round((validCount / n) * 1000) / 10 : 0,
    });
  }

  // ── (4) الانتربوليشن — بكسل بكسل ──────────────────────────────────────────
  // تعريف before/after (t = date − target بالأيام):
  //   before = date < target  (t < 0)
  //   after  = date > target  (t > 0)
  //   same-day = date === target (t === 0) — مش before ولا after، وبتتعامل لوحدها.
  const out = new Float32Array(n);
  const outValid = new Uint8Array(n);
  let observationsSum = 0;

  let exactPixels = 0; // فيه قيمة صالحة في نفس يوم الـ target → مفيش انتربوليشن
  let gapSum = 0; // Σ (afterT − beforeT) على البكسلات اللي فيها before + after
  let gapCount = 0;
  let extrapolatedPixels = 0; // البكسلات one-sided (hold / extrapolation)
  let extrapSum = 0; // Σ |t| لأقرب observation على البكسلات دي
  let extrapCount = 0;

  // تصنيف البكسل لمقاييس الميتا. Interpolation gap ≠ extrapolation distance، فكل واحد له
  // accumulator منفصل: الـ gap بيتحسب للبكسلات اللي فيها before + after بس، والمسافة
  // للـ one-sided بتتحسب لوحدها.
  const tally = (
    hasExact: boolean,
    hasBefore: boolean, beforeT: number,
    hasAfter: boolean, afterT: number
  ) => {
    if (hasExact) {
      exactPixels++;
    } else if (hasBefore && hasAfter) {
      gapSum += afterT - beforeT;
      gapCount++;
    } else {
      extrapolatedPixels++;
      extrapSum += Math.abs(hasBefore ? beforeT : afterT);
      extrapCount++;
    }
  };

  // أقرب قيمة صالحة قبل + أقرب قيمة صالحة بعد، لكل بكسل على حدة (انتربوليشن خطي).
  for (let i = 0; i < n; i++) {
    let beforeT = -Infinity, beforeV = 0, hasBefore = false;
    let afterT = Infinity, afterV = 0, hasAfter = false;
    let exactV = 0, hasExact = false;
    let count = 0;

    for (const s of stack) {
      if (!s.valid[i]) continue;
      count++;
      const t = s.days; // سالب = قبل التاريخ المطلوب، موجب = بعده، صفر = نفس اليوم
      if (t === 0) { exactV = s.values[i]; hasExact = true; }
      else if (t < 0) { if (t > beforeT) { beforeT = t; beforeV = s.values[i]; hasBefore = true; } }
      else if (t < afterT) { afterT = t; afterV = s.values[i]; hasAfter = true; }
    }

    if (!count) continue;
    observationsSum += count;
    tally(hasExact, hasBefore, beforeT, hasAfter, afterT);

    if (hasExact) {
      // فيه صورة صالحة في نفس يوم الـ target بالظبط — مفيش انتربوليشن أصلًا،
      // بناخد القيمة المرصودة مباشرة (منطقي رياضيًا، والـ UI بيوضّح ده لليوزر).
      out[i] = exactV;
    } else if (hasBefore && hasAfter) {
      // V(t*) = V₁ + (V₂ − V₁) × (t* − t₁)/(t₂ − t₁)، و t* = 0 هنا.
      const frac = (0 - beforeT) / (afterT - beforeT);
      out[i] = beforeV + (afterV - beforeV) * frac;
    } else {
      // جنب واحد بس (البكسل متغطي بسحاب في كل الصور اللي على الناحية التانية):
      // بنثبّت على أقرب قيمة متاحة (hold) بدل ما نمد الخط ونخترع قيمة.
      out[i] = hasBefore ? beforeV : afterV;
    }
    outValid[i] = 1;
  }

  const calcMs = performance.now() - tCalc;

  let validPixels = 0;
  for (let i = 0; i < n; i++) if (outValid[i]) validPixels++;

  if (!validPixels) {
    return NextResponse.json(
      {
        error:
          "No pixel had a single valid observation across the selected scenes. " +
          (useScl
            ? "The cloud mask (SCL) may have removed everything — try turning it off, loosening the cloud filter, or picking different dates."
            : "Check that the AOI actually falls inside the selected scenes."),
        perScene,
      },
      { status: 422 }
    );
  }

  // ── (5) الرسم ─────────────────────────────────────────────────────────────
  const tRender = performance.now();
  const { pngBuffer, stats } = await renderInterpolated(
    out, outValid, width, height, colormap, rMin, rMax, transparent
  );
  const renderMs = performance.now() - tRender;

  const pct = (x: number) => Math.round((x / n) * 1000) / 10;
  const mean1 = (sum: number, cnt: number) => (cnt ? Math.round((sum / cnt) * 10) / 10 : null);

  const meta: InterpolationMeta = {
    method: "linear",
    targetDate: target,
    usedScl: useScl,
    coverage: pct(validPixels),
    extrapolated: pct(extrapolatedPixels),
    exactDay: pct(exactPixels),
    meanValidObservations: Math.round((observationsSum / Math.max(1, validPixels)) * 100) / 100,
    meanInterpolationGapDays: mean1(gapSum, gapCount),
    meanExtrapolationDistanceDays: mean1(extrapSum, extrapCount),
    perScene,
  };

  return new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
      "X-Real-Bbox": realBbox ? realBbox.join(",") : "",
      "X-Raster-Stats": JSON.stringify(stats),
      "X-Interp-Meta": JSON.stringify(meta),
      "X-Debug-Timing": JSON.stringify({
        totalMs: Math.round(performance.now() - tStart),
        readMs: Math.round(readMs),
        calcMs: Math.round(calcMs),
        renderMs: Math.round(renderMs),
        scenes: ordered.length,
        grid: `${width}x${height}`,
      }),
    },
  });
}