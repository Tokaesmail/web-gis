// app/api/palm-heatmap/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Palm Trees — Density Heatmap
//
// الفكرة: Palm Detection endpoint (/gis/palm-detection) بيرجع نقط بس
// (geojson_url + csv_url + total_palms) — مفيش GeoTIFF جاهز زي الأندكسات
// (NDVI/NDWI/...) في raster-calc. عشان الهيت ماب تبقى "زيها بالظبط" —
// نفس الألوان، نفس منطق الـ rescale، نفس تدرّج الشفافية حوالين الصفر —
// إحنا مش بنعيد اختراع نظام تلوين جديد: بنستخدم *نفس* الـ RAMPS/buildLUT
// اللي renderIndex() في app/api/raster-proxy/analyze/route.ts بيستخدمهم،
// وبنطبّق *نفس* منطق alphaLow/alphaHigh smoothstep بالظبط. الفرق الوحيد
// هو مصدر القيم: هنا كل بكسل قيمته "كثافة نخل" (Gaussian-splatted count)
// بدل قيمة NDVI/NDWI محسوبة من بانداتات.
//
// Usage:
//   GET /api/palm-heatmap
//       ?geojsonUrl=<palm geojson_url من رد /gis/palm-detection>
//       &bbox=west,south,east,north     ← نفس bbox الشكل المرسوم (WGS84)
//       &colormap=inferno               ← أي مفتاح من نفس COLOR_RAMPS بتاعة raster-calc
//       &min=0&max=...                  ← اختياري؛ لو مش موجودين بيتحسبوا تلقائيًا من أعلى كثافة فعلية
//       &alphaLow=0&alphaHigh=0.18      ← نفس القيم الافتراضية اللي raster-calc بيبعتها فعليًا للـ proxy
//       &radius=16                      ← نصف قطر كل نخلة بالبكسل في الصورة الناتجة (Gaussian sigma = radius/2.5)
//
// الرد: PNG (RGBA) + headers بنفس الأسماء اللي PlanetaryRasterPanel.tsx
// شايفها أصلًا (readRasterStatsFromHeaders بتقرا X-Raster-Stats/X-Raster-Histogram،
// وonPreview بيقرا X-Real-Bbox) — عشان أي كود عرض على الخريطة موجود بالفعل
// يشتغل من غير أي تعديل.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { RAMPS, buildLUT } from "@/lib/rasterColor";

export const runtime = "nodejs";

// نفس القيمة المستخدمة في raster-proxy/analyze لأطول ضلع في الصورة الناتجة
const TARGET_MAX_DIM = 1024;

type LngLat = [number, number];

/** بيمشي على أي شكل GeoJSON (FeatureCollection/Feature/Geometry) ويطلع كل
 *  نقطة نخلة موجودة. لو الباكند رجّع Polygon/MultiPolygon (bounding box لكل
 *  نخلة مثلًا) بدل Point، بناخد centroid الحلقة الأولى كـ fallback. */
function extractPointsFromGeoJSON(gj: any): LngLat[] {
  const points: LngLat[] = [];

  const pushIfValid = (lng: unknown, lat: unknown) => {
    if (typeof lng === "number" && typeof lat === "number" && Number.isFinite(lng) && Number.isFinite(lat)) {
      points.push([lng, lat]);
    }
  };

  const walkGeometry = (g: any) => {
    if (!g) return;
    if (g.type === "Point") {
      pushIfValid(g.coordinates?.[0], g.coordinates?.[1]);
    } else if (g.type === "MultiPoint") {
      (g.coordinates ?? []).forEach((c: number[]) => pushIfValid(c?.[0], c?.[1]));
    } else if (g.type === "Polygon" || g.type === "MultiPolygon") {
      const ring = g.type === "Polygon" ? g.coordinates?.[0] : g.coordinates?.[0]?.[0];
      if (Array.isArray(ring) && ring.length) {
        const lngs = ring.map((c: number[]) => c[0]).filter(Number.isFinite);
        const lats = ring.map((c: number[]) => c[1]).filter(Number.isFinite);
        if (lngs.length && lats.length) {
          pushIfValid(
            lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
            lats.reduce((a: number, b: number) => a + b, 0) / lats.length
          );
        }
      }
    }
  };

  if (gj?.type === "FeatureCollection" && Array.isArray(gj.features)) {
    gj.features.forEach((f: any) => walkGeometry(f?.geometry));
  } else if (gj?.type === "Feature") {
    walkGeometry(gj.geometry);
  } else if (gj?.type) {
    walkGeometry(gj);
  }
  return points;
}

/** بيبني شبكة كثافة (Gaussian splat لكل نخلة) على مساحة outW×outH، ممتدة
 *  على الـ bbox المطلوب. كل نخلة بتضيف "تل" لطيف حواليها بدل نقطة واحدة
 *  حادة — ده اللي بيعمل شكل الهيت ماب الناعم المعروف. */
function buildDensityGrid(
  points: LngLat[],
  bbox: [number, number, number, number],
  outW: number,
  outH: number,
  radiusPx: number
): Float32Array {
  const [west, south, east, north] = bbox;
  const grid = new Float32Array(outW * outH);
  const sigma = Math.max(1, radiusPx / 2.5);
  const twoSigmaSq = 2 * sigma * sigma;
  const r = Math.max(1, Math.ceil(radiusPx));

  for (const [lng, lat] of points) {
    if (lng < west || lng > east || lat < south || lat > north) continue; // برّه الـ bbox
    const px = ((lng - west) / (east - west)) * outW;
    const py = ((north - lat) / (north - south)) * outH; // north-up (زي أي صورة raster)

    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(outW - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(outH - 1, Math.ceil(py + r));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px;
        const dy = y + 0.5 - py;
        const distSq = dx * dx + dy * dy;
        if (distSq > r * r) continue;
        grid[y * outW + x] += Math.exp(-distSq / twoSigmaSq);
      }
    }
  }
  return grid;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const geojsonUrl = searchParams.get("geojsonUrl");
  const bboxParam = searchParams.get("bbox");
  const colormap = searchParams.get("colormap") ?? "inferno";
  const alphaLow = parseFloat(searchParams.get("alphaLow") ?? "0");
  const alphaHigh = parseFloat(searchParams.get("alphaHigh") ?? "0.18");
  const radiusPx = parseFloat(searchParams.get("radius") ?? "16");
  const minParam = searchParams.get("min");
  const maxParam = searchParams.get("max");

  if (!geojsonUrl) {
    return NextResponse.json({ error: "Missing geojsonUrl param" }, { status: 400 });
  }
  if (!bboxParam) {
    return NextResponse.json(
      { error: "Missing bbox param — expected ?bbox=west,south,east,north (WGS84)" },
      { status: 400 }
    );
  }
  const bboxParts = bboxParam.split(",").map(Number);
  if (bboxParts.length !== 4 || !bboxParts.every(Number.isFinite)) {
    return NextResponse.json({ error: "Invalid bbox param" }, { status: 400 });
  }
  const bbox = bboxParts as [number, number, number, number];
  const [west, south, east, north] = bbox;
  if (east <= west || north <= south) {
    return NextResponse.json({ error: "bbox must have east > west and north > south" }, { status: 400 });
  }

  // ── 1. هات نقط النخل — من السيرفر (مفيش CORS)، مش من المتصفح ────────────
  let geojson: any;
  try {
    const gjRes = await fetch(geojsonUrl);
    if (!gjRes.ok) throw new Error(`GeoJSON fetch failed (${gjRes.status})`);
    geojson = await gjRes.json();
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to fetch geojsonUrl: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  const points = extractPointsFromGeoJSON(geojson);
  if (points.length === 0) {
    return NextResponse.json({ error: "No point geometries found in geojsonUrl" }, { status: 422 });
  }

  // ── 2. حجم الصورة الناتجة — أطول ضلع = TARGET_MAX_DIM، والضلع التاني
  // بنسبة العرض/الارتفاع الحقيقية للـ bbox (زي renderIndex بالظبط) ─────────
  const aspect = (east - west) / (north - south);
  let outW: number, outH: number;
  if (aspect >= 1) {
    outW = TARGET_MAX_DIM;
    outH = Math.max(8, Math.round(TARGET_MAX_DIM / aspect));
  } else {
    outH = TARGET_MAX_DIM;
    outW = Math.max(8, Math.round(TARGET_MAX_DIM * aspect));
  }

  // ── 3. شبكة الكثافة ──────────────────────────────────────────────────────
  const grid = buildDensityGrid(points, bbox, outW, outH, radiusPx);

  let dataMax = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i] > dataMax) dataMax = grid[i];
  if (dataMax <= 0) dataMax = 1;

  const effMin = minParam !== null && Number.isFinite(Number(minParam)) ? Number(minParam) : 0;
  const effMax = maxParam !== null && Number.isFinite(Number(maxParam)) ? Number(maxParam) : dataMax;
  const range = effMax - effMin || 0.001;

  // ── 4. نفس نظام التلوين بالظبط اللي raster-calc بيستخدمه ────────────────
  const stops = RAMPS[colormap] ?? RAMPS["inferno"];
  const lut = buildLUT(stops);

  // زي renderIndex بالظبط: "صفر نخل" = شفاف، والشفافية بترجع تدريجيًا
  // (smoothstep) كل ما الكثافة تزيد بعيدًا عن الصفر بين alphaLow/alphaHigh
  const zeroT = Math.max(0, Math.min(1, (0 - effMin) / range));
  const maxDist = Math.max(zeroT, 1 - zeroT) || 1;
  const alphaLUT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const dist = Math.abs(t - zeroT) / maxDist;
    const eased = Math.max(0, Math.min(1, (dist - alphaLow) / Math.max(0.001, alphaHigh - alphaLow)));
    const smooth = eased * eased * (3 - 2 * eased);
    alphaLUT[i] = Math.round(smooth * 255);
  }

  const n = outW * outH;
  const rgbaData = Buffer.alloc(n * 4);
  let validPixels = 0, sum = 0, minV = Infinity, maxV = -Infinity;
  const bins = 100;
  const histogram = new Array(bins).fill(0);

  for (let i = 0; i < n; i++) {
    const v = grid[i];
    let t = (v - effMin) / range;
    t = Math.max(0, Math.min(1, t));
    const byte = Math.round(t * 255);
    const alpha = alphaLUT[byte];
    if (alpha > 0) {
      validPixels++;
      sum += v;
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
      histogram[Math.min(bins - 1, Math.floor(t * bins))]++;
    }
    rgbaData[i * 4] = lut[byte * 3];
    rgbaData[i * 4 + 1] = lut[byte * 3 + 1];
    rgbaData[i * 4 + 2] = lut[byte * 3 + 2];
    rgbaData[i * 4 + 3] = alpha;
  }

  const stats = validPixels > 0
    ? { min: minV, max: maxV, mean: sum / validPixels, validPixels, appliedRange: [effMin, effMax] }
    : { min: effMin, max: effMax, mean: 0, validPixels: 0, appliedRange: [effMin, effMax] };

  const pngBuffer = await sharp(rgbaData, { raw: { width: outW, height: outH, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer();

  return new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=120",
      // نفس أسماء الـ headers اللي PlanetaryRasterPanel.tsx بيقراها فعليًا
      // (readRasterStatsFromHeaders + onPreview) — صفر تعديل مطلوب هناك
      "X-Real-Bbox": bbox.join(","),
      "X-Raster-Stats": JSON.stringify(stats),
      "X-Raster-Histogram": histogram.join(","),
      "X-Palm-Count": String(points.length),
    },
  });
}