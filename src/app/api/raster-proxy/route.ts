// app/api/raster-proxy/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Proxy: يجيب الـ GeoTIFF من الـ backend ويحوله PNG ملوّن بـ sharp
// بيطبق نفس الـ color ramps الموجودة في الـ UI (rdylgn, magma, إلخ)
// Usage: GET /api/raster-proxy?url=...&token=...&min=-0.2&max=0.9&colormap=rdylgn
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { fromArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { toProj4 } from "geotiff-geokeys-to-proj4";

export const runtime = "nodejs";

// ── Color ramps — نفس الـ stops الموجودة في PlanetaryRasterPanel ─────────────
// كل ramp: مصفوفة من { pos: 0-1, r, g, b }
type Stop = { pos: number; r: number; g: number; b: number };

function hex(h: string): [number, number, number] {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ── شد الإشباع/التباين لأي لون عشان يطلع "vivid" زي ستايل Aurora ─────────────
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// satBoost: ضرب الإشباع (1 = زي ما هو، 1.4 = +40%)
// contrastPush: بيشد الـ lightness بعيد عن النص (0.5) عشان الألوان الفاتحة
// تفتح أكتر والغامقة تغمق أكتر — ده اللي بيدي الإحساس بـ "حدّة" زي Aurora
function vivid(h: string, satBoost = 1.4, contrastPush = 0.12): [number, number, number] {
  const [r, g, b] = hex(h);
  let [hh, s, l] = rgbToHsl(r, g, b);
  s = Math.min(1, s * satBoost);
  l = l + (l - 0.5) * contrastPush;
  l = Math.max(0.04, Math.min(0.96, l));
  return hslToRgb(hh, s, l);
}

const RAMPS: Record<string, Stop[]> = {
  // NDVI-style — أخضر/أصفر/برتقالي حاد وواضح (زي Aurora)
  rdylgn: [
    "#8b0000","#e31a1c","#fd8d3c","#ffe600","#a6d96a","#31a354","#006837"
  ].map((c, i, a) => { const [r,g,b] = vivid(c, 1.5, 0.16); return { pos: i/(a.length-1), r, g, b }; }),

  rdbu: [
    "#67001f","#b2182b","#d6604d","#f4a582","#fddbc7","#d1e5f0","#4393c3","#2166ac","#053061"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdbu_r: [
    "#b35806","#e08214","#fdb863","#fee0b6","#f7f7f7","#d8daeb","#998ec3","#7b3294","#40004b"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  spectral: [
    "#9e0142","#d53e4f","#f46d43","#fdae61","#fee08b","#e6f598","#abdda4","#66c2a5","#3288bd","#5e4fa2"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  spectral_r: [
    "#d73027","#f46d43","#fdae61","#ffffbf","#d9ef8b","#a6d96a","#74add1","#4575b4","#313695"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  // OSI / Oil-Spill style — بنفسجي/وردي/برتقالي/أصفر حاد (زي Aurora)
  magma: [
    "#2c0735","#6a0dad","#c71585","#ff1493","#ff6347","#ffa500","#ffd700","#ffff66"
  ].map((c, i, a) => { const [r,g,b] = vivid(c, 1.5, 0.16); return { pos: i/(a.length-1), r, g, b }; }),

  greens: [
    "#ffffe5","#f7fcb9","#d9f0a3","#addd8e","#78c679","#41ab5d","#238443","#005a32"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdylbu_r: [
    "#f7fbff","#deebf7","#c6dbef","#9ecae1","#6baed6","#4292c6","#2171b5","#08519c","#08306b"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  // Inferno — كثافة/heatmap: غامق-بنفسجي → بنفسجي → وردي-أحمر → برتقالي → أصفر فاقع
  inferno: [
    "#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"
  ].map((c, i, a) => { const [r,g,b] = vivid(c, 1.45, 0.14); return { pos: i/(a.length-1), r, g, b }; }),
};

// interpolate بين أقرب stopين
function applyColormap(stops: Stop[], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) {
      const prev = stops[i - 1], next = stops[i];
      const f = (t - prev.pos) / (next.pos - prev.pos);
      return [
        Math.round(prev.r + f * (next.r - prev.r)),
        Math.round(prev.g + f * (next.g - prev.g)),
        Math.round(prev.b + f * (next.b - prev.b)),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.r, last.g, last.b];
}

// ابني LUT كاملة 256 قيمة → [R,G,B]
function buildLUT(stops: Stop[]): Buffer {
  const lut = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = applyColormap(stops, i / 255);
    lut[i * 3]     = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tifUrl   = searchParams.get("url");
  const token    = searchParams.get("token");
  const rMin     = parseFloat(searchParams.get("min") ?? "-1");
  const rMax     = parseFloat(searchParams.get("max") ?? "1");
  const colormap = searchParams.get("colormap") ?? "rdylgn";

  // ── شفافية ذكية: نخفي البكسلات "المحايدة" (قريبة من الصفر = مفيش تحليل
  // حقيقي) ونوريّ بس البكسلات اللي بعيدة عن الصفر (إشارة قوية فعلًا) ──────────
  // zero: القيمة اللي بتعتبر "محايدة"/مفيش فيها إشارة (افتراضيًا 0 لمعظم indices)
  // alphaLow/alphaHigh: نسبة المسافة من نقطة الصفر (0→1) اللي يبدأ/يكتمل عندها الظهور
  const zeroVal    = parseFloat(searchParams.get("zero") ?? "0");
  const alphaLow   = parseFloat(searchParams.get("alphaLow")  ?? "0.12");
  const alphaHigh  = parseFloat(searchParams.get("alphaHigh") ?? "0.45");
  const zeroMode   = searchParams.get("zeroMode") ?? "around";
  const transparent = (searchParams.get("transparent") ?? "1") !== "0"; // قابلة للإيقاف لو حد عايز solid زي الأول

  if (!tifUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // ── 1. جيب الـ TIF ────────────────────────────────────────────────────────
  const fetchHeaders: Record<string, string> = {};
  if (token) fetchHeaders["Authorization"] = `Bearer ${token}`;

  const upstream = await fetch(tifUrl, { headers: fetchHeaders });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream fetch failed: ${upstream.status}` },
      { status: 502 }
    );
  }

  const tifBuffer = Buffer.from(await upstream.arrayBuffer());

  // ── 1.5. اقرا الـ extent الحقيقي من جوه الـ TIFF نفسه (مش الـ bbox المطلوب) ──
  // ده بيمسك الحالة اللي الباكند بيـ"snap" فيها الـ bbox لشبكة بكسلات المصدر
  // فيرجّع صورة بتغطي مساحة أكبر شوية من اللي اتطلبت (مشكلة ArcGIS Pro).
  let realBbox: [number, number, number, number] | null = null;
  try {
    const arrayBuffer = tifBuffer.buffer.slice(
      tifBuffer.byteOffset,
      tifBuffer.byteOffset + tifBuffer.byteLength
    );
    const tiff = await fromArrayBuffer(arrayBuffer as ArrayBuffer);
    const image = await tiff.getImage();
    let bbox = image.getBoundingBox(); // [west, south, east, north] في الـ CRS الأصلي بتاع الملف

    // ── الـ CRS مش بالضرورة WGS84! لو Sentinel-2 محفوظ بـ UTM مثلًا، الأرقام
    // دي بتكون متر (آلاف) مش درجات — وده اللي بيعمل الزوم-أوت الجامد.
    // بنقرا الـ GeoKeys ونحول لـ EPSG:4326 لو مكانش أصلاً جغرافي.
    const geoKeys = image.getGeoKeys();
    console.log("🗺️ raster-proxy: raw bbox (native CRS):", bbox, "| geoKeys:", geoKeys);

    const looksLikeDegrees =
      Math.abs(bbox[0]) <= 180 && Math.abs(bbox[2]) <= 180 &&
      Math.abs(bbox[1]) <= 90  && Math.abs(bbox[3]) <= 90;

    if (!looksLikeDegrees && geoKeys) {
      const { proj4: srcProj4 } = toProj4(geoKeys);
      if (srcProj4) {
        const [w, s] = proj4(srcProj4, "EPSG:4326", [bbox[0], bbox[1]]);
        const [e, n] = proj4(srcProj4, "EPSG:4326", [bbox[2], bbox[3]]);
        bbox = [w, s, e, n];
        console.log("🗺️ raster-proxy: reprojected bbox → WGS84:", bbox);
      }
    }

    if (
      bbox.length === 4 &&
      bbox.every((v) => Number.isFinite(v)) &&
      Math.abs(bbox[0]) <= 180 && Math.abs(bbox[2]) <= 180 &&
      Math.abs(bbox[1]) <= 90  && Math.abs(bbox[3]) <= 90
    ) {
      realBbox = bbox as [number, number, number, number];
    } else {
      console.warn("⚠️ raster-proxy: bbox still not valid WGS84 after reprojection attempt, ignoring it:", bbox);
    }
  } catch (err) {
    console.warn("⚠️ raster-proxy: could not read real TIFF bounds:", err);
  }

  // ── 2. Linear stretch: float [rMin→rMax] → uint8 [0→255] ─────────────────
  const range = rMax - rMin || 0.001;
  const a = 255 / range;
  const b = -rMin * a;

  const grayBuffer = await sharp(tifBuffer, { failOn: "none" })
    .linear(a, b)
    .toColorspace("b-w")
    .raw()           // pixel data كـ raw bytes (grayscale)
    .toBuffer({ resolveWithObject: true });

  const { data: grayData, info } = grayBuffer;
  const { width, height } = info;

  // ── 3. طبّق الـ colormap — كل pixel grayscale → RGBA ─────────────────────
  const stops = RAMPS[colormap] ?? RAMPS["rdylgn"];
  const lut   = buildLUT(stops);

  // ── Alpha LUT: بناءً على "بعد" كل قيمة عن نقطة الصفر/المحايدة جوه مدى
  // [rMin, rMax]. القيم القريبة من الصفر (مفيش تحليل فعلي) تبقى شفافة،
  // والقيم البعيدة (إشارة قوية في أي اتجاه، موجبة أو سالبة) تتلوّن وتظهر.
  // ده بيشتغل صح مع كل أنواع الـ ramps (sequential زي Vegetation، أو
  // diverging زي Water/Moisture اللي الإشارة فيها ممكن تكون في الطرفين).
  const t0 = Math.max(0, Math.min(1, (zeroVal - rMin) / range)); // موقع الصفر داخل 0-1
  const maxDist = Math.max(t0, 1 - t0) || 1;
  const zeroByte = Math.max(0, Math.min(255, Math.round(t0 * 255)));

  const alphaLUT = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    if (!transparent) { alphaLUT[i] = 255; continue; }
    if (zeroMode === "at-or-below") {
      if (i <= zeroByte) {
        alphaLUT[i] = 0;
        continue;
      }
      const dist = (i - zeroByte) / Math.max(1, 255 - zeroByte);
      const eased = Math.max(0, Math.min(1, (dist - alphaLow) / Math.max(0.001, alphaHigh - alphaLow)));
      const smooth = eased * eased * (3 - 2 * eased);
      alphaLUT[i] = Math.round(smooth * 255);
      continue;
    }
    if (Math.abs(i - zeroByte) <= 1) {
      alphaLUT[i] = 0;
      continue;
    }
    const t = i / 255;
    const dist = Math.abs(t - t0) / maxDist; // 0 = عند الصفر بالظبط، 1 = أقصى طرف
    const eased = Math.max(0, Math.min(1, (dist - alphaLow) / Math.max(0.001, alphaHigh - alphaLow)));
    // smoothstep بسيط عشان التلاشي يبقى ناعم مش حرف فجأة
    const smooth = eased * eased * (3 - 2 * eased);
    alphaLUT[i] = Math.round(smooth * 255);
  }

  const histogram = new Array(10).fill(0);
  let validPixels = 0;
  let grayMin = 255;
  let grayMax = 0;
  let graySum = 0;

  const rgbaData = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const v = grayData[i];                // 0-255
    const alpha = alphaLUT[v];
    if (alpha > 0) {
      validPixels += 1;
      grayMin = Math.min(grayMin, v);
      grayMax = Math.max(grayMax, v);
      graySum += v;
      histogram[Math.min(9, Math.floor((v / 256) * 10))] += 1;
    }
    rgbaData[i * 4]     = lut[v * 3];
    rgbaData[i * 4 + 1] = lut[v * 3 + 1];
    rgbaData[i * 4 + 2] = lut[v * 3 + 2];
    rgbaData[i * 4 + 3] = alpha;
  }

  const grayToValue = (v: number) => rMin + (v / 255) * range;
  const valueStats = validPixels > 0
    ? {
        min: grayToValue(grayMin),
        max: grayToValue(grayMax),
        mean: grayToValue(graySum / validPixels),
        validPixels,
      }
    : { min: rMin, max: rMax, mean: 0, validPixels: 0 };

  // ── 4. تحسين الدقة الظاهرية + شد الألوان (vivid, زي أوروبا/Pixxel) ────────
  // الصورة الأصلية غالبًا صغيرة (حسب دقة Sentinel-2)، فبنكبّرها بـ Lanczos3
  // (interpolation ناعم) بدل ما المتصفح يكبرها بـ nearest-neighbor مبكسل.
  const TARGET_MAX_DIM = 1024; // اكبر بعد للصورة الناتجة
  const scale = Math.min(4, Math.max(1, TARGET_MAX_DIM / Math.max(width, height)));
  const outW = Math.round(width * scale);
  const outH = Math.round(height * scale);

  const pngBuffer = await sharp(rgbaData, {
    raw: { width, height, channels: 4 },
  })
    .resize(outW, outH, { kernel: sharp.kernel.lanczos3 })
    // الـ ramps بقت vivid من نفسها، فبنزود شوية بسيطة بس مش هنحرق الألوان
    // (modulate ما بيلمسش قناة الـ alpha)
    .modulate({ saturation: 1.12, brightness: 1.03 })
    // كنتراست خفيف على قنوات RGB بس (مش الـ alpha) عشان الشفافية متتأثرش
    .linear([1.05, 1.05, 1.05, 1], [-6, -6, -6, 0])
    .png({ compressionLevel: 6 })
    .toBuffer();

  // ── تفعيل إرسال الـ extent الحقيقي للفرونت عشان يحط الصورة في مكانها
  // الصح بدل ما يعتمد على renderBbox المطلوب (اللي بيكون أصغر من المساحة
  // الفعلية اللي الباكند بيرجّعها بعد الـ snap لشبكة البكسلات).
  const SEND_REAL_BBOX = true;

  return new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type":  "image/png",
      "Cache-Control": "public, max-age=300",
      // ← الفرونت بيقرا الهيدر ده عشان يحط الصورة في مكانها الصح على الخريطة
      "X-Real-Bbox": SEND_REAL_BBOX && realBbox ? realBbox.join(",") : "",
      "X-Raster-Histogram": histogram.join(","),
      "X-Raster-Stats": JSON.stringify(valueStats),
    },
  });
}
