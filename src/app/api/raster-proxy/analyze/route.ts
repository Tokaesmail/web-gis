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
import { fromArrayBuffer } from "geotiff";
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

type AnalysisType = "rgb" | "swir" | "ndvi" | "ndwi" | "ndmi";

type CompositeConfig = { kind: "composite"; bandCount: 3; label: string };
type IndexConfig = {
  kind: "index";
  bandCount: 2;
  label: string;
  formula: (a: number, b: number) => number;
  defaultColormap: string;
};

const ANALYSIS_CONFIG: Record<AnalysisType, CompositeConfig | IndexConfig> = {
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
};

// ── fetch + read GeoTIFF band (نفس منطق الـ bbox reprojection من route.ts) ──
async function fetchTiffBuffer(url: string, token?: string | null): Promise<ArrayBuffer> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Upstream fetch failed (${res.status}): ${url}`);
  return res.arrayBuffer();
}

async function readBand(arrayBuffer: ArrayBuffer): Promise<BandRaster> {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const width = image.getWidth();
  const height = image.getHeight();
  const rasters = await image.readRasters({ interleave: false });
  const data = rasters[0] as Float32Array | Uint16Array | Uint8Array;

  let bbox: [number, number, number, number] | null = null;
  try {
    let bb = image.getBoundingBox();
    const geoKeys = image.getGeoKeys();
    const looksLikeDegrees =
      Math.abs(bb[0]) <= 180 && Math.abs(bb[2]) <= 180 &&
      Math.abs(bb[1]) <= 90 && Math.abs(bb[3]) <= 90;

    if (!looksLikeDegrees && geoKeys) {
      const { proj4: srcProj4 } = toProj4(geoKeys);
      if (srcProj4) {
        const [w, s] = proj4(srcProj4, "EPSG:4326", [bb[0], bb[1]]);
        const [e, n] = proj4(srcProj4, "EPSG:4326", [bb[2], bb[3]]);
        bb = [w, s, e, n];
      }
    }

    if (
      bb.every((v) => Number.isFinite(v)) &&
      Math.abs(bb[0]) <= 180 && Math.abs(bb[2]) <= 180 &&
      Math.abs(bb[1]) <= 90 && Math.abs(bb[3]) <= 90
    ) {
      bbox = bb as [number, number, number, number];
    }
  } catch {
    bbox = null;
  }

  return { data, width, height, bbox };
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
  const TARGET_MAX_DIM = 1024;
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

  const TARGET_MAX_DIM = 1024;
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
  const { searchParams } = req.nextUrl;
  const type = (searchParams.get("type") ?? "rgb") as AnalysisType;
  const urlsParam = searchParams.get("urls");
  const token = searchParams.get("token");

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

  let bands: BandRaster[];
  try {
    const buffers = await Promise.all(urls.map((u) => fetchTiffBuffer(u, token)));
    bands = await Promise.all(buffers.map((buf) => readBand(buf)));
  } catch (err) {
    return NextResponse.json({ error: `Failed to read bands: ${(err as Error).message}` }, { status: 502 });
  }

  if (!checkSameGrid(bands)) {
    return NextResponse.json(
      { error: "Bands have mismatched dimensions — align/reproject to the same grid before compositing" },
      { status: 422 }
    );
  }

  const realBbox = bands[0].bbox;
  let pngBuffer: Buffer;
  let stats: unknown;

  if (config.kind === "composite") {
    const gamma = parseFloat(searchParams.get("gamma") ?? "1.1");
    const doSharpen = (searchParams.get("sharpen") ?? "1") !== "0";
    const low = parseFloat(searchParams.get("low") ?? "2");
    const high = parseFloat(searchParams.get("high") ?? "98");
    const result = await renderComposite(bands, gamma, doSharpen, low, high);
    pngBuffer = result.pngBuffer;
    stats = result.stats;
  } else {
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
  }

  return new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type":      "image/png",
      "Cache-Control":     "public, max-age=300",
      "X-Real-Bbox":       realBbox ? realBbox.join(",") : "",
      "X-Raster-Stats":    JSON.stringify(stats),
      "X-Analysis-Type":   type,
    },
  });
}