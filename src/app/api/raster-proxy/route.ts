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
  // 1) Vegetation — NDVI classic RdYlGn (زي أول صورة: أحمر/بني bare → أصفر → أخضر غامق)
  rdylgn: [
    "#a50026","#d73027","#f46d43","#fdae61","#fee08b",
    "#ffffbf","#d9ef8b","#a6d96a","#66bd63","#1a9850","#006837"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 2) Water — NDWI (زي تاني صورة: أخضر-أصفر أرض → تركواز → أزرق غامق مياه)
  rdbu: [
    "#d9ef8b","#a6d96a","#66c2a5","#3288bd","#2166ac","#08306b","#062254"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 3) Moisture — NDMI (درجات مسحوبة فعليًا من الـ colorbar بتاع صورة 3:
  // أبيض/وردي جفاف → بيج/برتقالي → أصفر → أخضر فاتح → أخضر غامق رطوبة)
  rdbu_r: [
    "#f3f1f4","#f0cac1","#eeb780","#ebb25b","#e8c32d",
    "#e7e600","#9fd601","#2ab900","#02a402"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 4) Spectral — Viridis (زي صورة الـ bands: بنفسجي غامق → أزرق → أخضر → أصفر)
  spectral: [
    "#440154","#482878","#3e4989","#31688e","#26828e",
    "#1f9e89","#35b779","#6ece58","#b5de2b","#fde725"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 5) Spectral R — False-color احمر/بني (زي صورة Landsat false color)
  spectral_r: [
    "#08306b","#2166ac","#4393c3","#92c5de","#f4a582","#d6604d","#b2182b","#67001f"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 6) Thermal — درجات مسحوبة فعليًا من colorbar صورة الحرارة (Surface Temp):
  // أبيض/بنفسجي فاتح بارد → أزرق → تركواز → أخضر → أصفر → برتقالي → أحمر → عنابي حار
  magma: [
    "#f6f6fd","#a0abed","#358dc5","#278da6","#78b49c",
    "#e3dc85","#f4b46b","#da5b52","#a21643","#61031f"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 7) Greens — ColorBrewer Greens sequential (زي خريطة GRASS الغطاء النباتي)
  greens: [
    "#f7fcf5","#e5f5e0","#c7e9c0","#a1d99b","#74c476",
    "#41ab5d","#238b45","#006d2c","#00441b"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 8) Heat — بنفسجي/أزرق → سماوي → أخضر → أصفر → برتقالي → أحمر (زي صورة الكثافة)
  rdylbu_r: [
    "#4b0082","#6a00a8","#0000ff","#00bfff","#00ffea",
    "#00ff40","#ffff00","#ff8000","#ff0000"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  // 9) Inferno — matplotlib inferno الرسمي (زي آخر صورة)
  inferno: [
    "#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60",
    "#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),
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

// ── Sieve filter: بيدمج أي connected region (4-neighbor) أصغر من minPixels
// جوه أقرب class مجاور ليها (الأكتر تكرارًا على حدودها) — زي GDAL sieve
// filter بالظبط، وده اللي بيخلي "Min zone area" فعليًا يشيل الجزر الصغيرة
// بدل ما يفضل شكل الصورة زي ما هو أيًا كان الرقم المكتوب.
function sieveClasses(classIndex: Int16Array, width: number, height: number, minPixels: number): Int16Array {
  if (minPixels <= 1) return classIndex;

  const n = width * height;
  const out = new Int16Array(classIndex); // نعدل نسخة، مش الأصل
  const MAX_PASSES = 4;

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const labels = new Int32Array(n).fill(-1);
    const stack = new Int32Array(n);
    const regionPixels: number[][] = []; // pixel indices لكل label
    const regionClass: number[] = [];

    let nextLabel = 0;
    for (let start = 0; start < n; start++) {
      if (out[start] < 0 || labels[start] !== -1) continue;
      const cls = out[start];
      let sp = 0;
      stack[sp++] = start;
      labels[start] = nextLabel;
      const pixels: number[] = [];
      while (sp > 0) {
        const idx = stack[--sp];
        pixels.push(idx);
        const x = idx % width, y = (idx / width) | 0;
        if (x > 0) { const ni = idx - 1; if (labels[ni] === -1 && out[ni] === cls) { labels[ni] = nextLabel; stack[sp++] = ni; } }
        if (x < width - 1) { const ni = idx + 1; if (labels[ni] === -1 && out[ni] === cls) { labels[ni] = nextLabel; stack[sp++] = ni; } }
        if (y > 0) { const ni = idx - width; if (labels[ni] === -1 && out[ni] === cls) { labels[ni] = nextLabel; stack[sp++] = ni; } }
        if (y < height - 1) { const ni = idx + width; if (labels[ni] === -1 && out[ni] === cls) { labels[ni] = nextLabel; stack[sp++] = ni; } }
      }
      regionPixels.push(pixels);
      regionClass.push(cls);
      nextLabel++;
    }

    const order = regionPixels.map((_, i) => i).filter((i) => regionPixels[i].length < minPixels);
    order.sort((a, b) => regionPixels[a].length - regionPixels[b].length);
    if (order.length === 0) break;

    let mergedAny = false;
    for (const labelId of order) {
      const pixels = regionPixels[labelId];
      if (pixels.length >= minPixels) continue;

      const neighborCounts = new Map<number, number>();
      for (const idx of pixels) {
        const x = idx % width, y = (idx / width) | 0;
        const neighbors = [
          x > 0 ? idx - 1 : -1,
          x < width - 1 ? idx + 1 : -1,
          y > 0 ? idx - width : -1,
          y < height - 1 ? idx + width : -1,
        ];
        for (const ni of neighbors) {
          if (ni < 0) continue;
          const nc = out[ni];
          if (nc < 0 || nc === regionClass[labelId]) continue;
          neighborCounts.set(nc, (neighborCounts.get(nc) ?? 0) + 1);
        }
      }
      if (neighborCounts.size === 0) continue;

      let bestClass = regionClass[labelId], bestCount = -1;
      for (const [cls, count] of neighborCounts) {
        if (count > bestCount) { bestCount = count; bestClass = cls; }
      }
      for (const idx of pixels) out[idx] = bestClass;
      mergedAny = true;
    }
    if (!mergedAny) break;
  }

  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tifUrl   = searchParams.get("url");
  const token    = searchParams.get("token");
  const rMin     = parseFloat(searchParams.get("min") ?? "-1");
  const rMax     = parseFloat(searchParams.get("max") ?? "1");
  const colormap = searchParams.get("colormap") ?? "rdylgn";
  // ── عدد خانات الـ histogram بقى قابل للتحكم من الفرونت (مش ثابت 10) ──
  // كل ما الرقم يكبر، كل ما قدرنا نقسم البيانات على أي عدد Zones/Classes
  // بدقة أعلى بعدين في الواجهة (مش لازم يكون قاسم للعدد بالظبط). 100 قيمة
  // افتراضية كويسة (دقة كفاية) لو الفرونت مبعتش الباراميتر ده.
  const bins = Math.max(2, Math.min(500, parseInt(searchParams.get("bins") ?? "100", 10) || 100));

  // ── Zones/Classes classification (discrete, EOS-style) ────────────────────
  // لو الفرونت بعت classes، بنرجع صورة بألوان flat (مش continuous gradient)
  // + نعمل sieve merge للـ zones الأصغر من minZoneArea (م²) جوه أقرب جار.
  // classesParam === null يعني الفرونت لسه بتستخدم القديم (continuous colormap).
  const classesParam = searchParams.get("classes");
  const numClasses = classesParam ? Math.max(2, Math.min(50, parseInt(classesParam, 10) || 5)) : null;
  const minZoneAreaM2 = Math.max(0, parseFloat(searchParams.get("minZoneArea") ?? "0") || 0);

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
  let nodataMask: Uint8Array | null = null; // 1 = pixel is masked/outside the polygon, 0 = valid
  try {
    const arrayBuffer = tifBuffer.buffer.slice(
      tifBuffer.byteOffset,
      tifBuffer.byteOffset + tifBuffer.byteLength
    );
    const tiff = await fromArrayBuffer(arrayBuffer as ArrayBuffer);
    const image = await tiff.getImage();
    let bbox = image.getBoundingBox(); // [west, south, east, north] في الـ CRS الأصلي بتاع الملف

    // ── نقرا الـ nodata الحقيقي (اللي كتبه raster_calc.py، الافتراضي -9999)
    // من الـ GDAL_NODATA tag جوه الملف نفسه — عشان نعرف بالظبط أنهي بكسلات
    // اتحطت NaN بسبب إنها برّه الـ polygon اللي رسمه اليوزر.
    const gdalNoData = image.getGDALNoData?.();
    if (gdalNoData !== null && gdalNoData !== undefined && Number.isFinite(gdalNoData)) {
      try {
        const rasters = await image.readRasters({ interleave: false });
        const band = rasters[0] as unknown as Float32Array | Float64Array;
        const mask = new Uint8Array(band.length);
        for (let i = 0; i < band.length; i++) {
          const v = band[i];
          if (Number.isNaN(v) || Math.abs(v - gdalNoData) < 1e-3) {
            mask[i] = 1;
          }
        }
        nodataMask = mask;
        console.log("🎭 raster-proxy: nodata mask built, masked pixels:", mask.reduce((a, b) => a + b, 0), "/", mask.length);
      } catch (maskErr) {
        console.warn("⚠️ raster-proxy: could not build nodata mask, falling back to unmasked render:", maskErr);
      }
    }

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
  //
  // ⚠️ ملحوظة مهمة: الـ alpha ده غرضه بصري بحت (يخبي على الخريطة البكسلات
  // اللي مفيهاش إشارة قوية) — مش المفروض يتستخدم عشان "يستبعد" بكسلات من
  // حساب الـ Zones/Histogram. لو استخدمناه في الإحصاء، أي بكسل قريب من
  // الصفر (زي أرض جرداء NDVI~0) بيختفي من العدّ خالص، والزونز بتطلع
  // متمركزة بشكل غير حقيقي على نطاق ضيق قريب من حافة الشفافية (وده اللي
  // كان بيحصل قبل الإصلاح ده).
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

  const histogram = new Array(bins).fill(0);
  let validPixels = 0;
  let grayMin = 255;
  let grayMax = 0;
  let graySum = 0;

  const rgbaData = Buffer.alloc(width * height * 4);
  // نتأكد إن الـ mask بنفس حجم الصورة قبل ما نستخدمه (احتياطًا لو فيه
  // اختلاف نادر بين قراءة sharp وقراءة geotiff.js لأي سبب)
  const maskUsable = nodataMask !== null && nodataMask.length === width * height;
  if (nodataMask !== null && !maskUsable) {
    console.warn("⚠️ raster-proxy: nodata mask size mismatch, ignoring mask:", nodataMask.length, "vs", width * height);
  }

  for (let i = 0; i < width * height; i++) {
    const v = grayData[i];                // 0-255
    const isMasked = maskUsable && nodataMask![i] === 1;
    const alpha = isMasked ? 0 : alphaLUT[v]; // بصري بس — بيتحط في الـ PNG

    // ✅ الإصلاح: الإحصاء (histogram/zones/stats) بيشمل أي بكسل حقيقي
    // (مش nodata/مش برّه الـ polygon)، بغض النظر هو شفاف بصريًا على
    // الخريطة ولا لأ. قبل كده كان الشرط `if (alpha > 0)` بيستبعد كل
    // البكسلات القريبة من الصفر من العدّ كمان، مش بس من العرض — وده
    // اللي كان بيخلي الـ Zones تتلخبط وتتركّز في زون واحدة غريبة.
    if (!isMasked) {
      validPixels += 1;
      grayMin = Math.min(grayMin, v);
      grayMax = Math.max(grayMax, v);
      graySum += v;
      histogram[Math.min(bins - 1, Math.floor((v / 256) * bins))] += 1;
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

  // ── 3.5. Zones/Classes discrete classification (لو numClasses !== null) ───
  let zoneStats: Array<{
    zone: number; label: string; color: string; pixels: number;
    pct: number; areaM2: number; lo: number; hi: number;
  }> | null = null;

  if (numClasses !== null && validPixels > 0) {
    // equal-interval breaks على الـ range الحقيقي للبيانات (زي EOS بالظبط:
    // بتقسم من أصغر قيمة فعلية لأكبر قيمة فعلية جوه الـ AOI، مش من rMin/rMax
    // الثابتين بتوع الـ colormap)
    const classSpan = Math.max(1, grayMax - grayMin);

    const classIndex = new Int16Array(width * height).fill(-1);
    for (let i = 0; i < width * height; i++) {
      const isMasked = maskUsable && nodataMask![i] === 1;
      if (isMasked) continue;
      const v = grayData[i];
      let cls = Math.floor(((v - grayMin) / classSpan) * numClasses);
      cls = Math.max(0, Math.min(numClasses - 1, cls));
      classIndex[i] = cls;
    }

    // ── Pixel area (م²) من الـ bbox الحقيقي — لازم عشان نحول minZoneArea
    // (م²) لعدد بكسلات فعلي (minPixels) للـ sieve filter ──────────────────
    let pixelAreaM2: number | null = null;
    if (realBbox) {
      const [w, s, e, n] = realBbox;
      const latMid = (s + n) / 2;
      const metersPerDegLat = 111320;
      const metersPerDegLon = 111320 * Math.cos((latMid * Math.PI) / 180);
      const pixelW = (Math.abs(e - w) / width) * metersPerDegLon;
      const pixelH = (Math.abs(n - s) / height) * metersPerDegLat;
      pixelAreaM2 = pixelW * pixelH;
    }

    const minPixels = minZoneAreaM2 > 0 && pixelAreaM2 ? Math.round(minZoneAreaM2 / pixelAreaM2) : 0;
    const finalClassIndex = minPixels > 1 ? sieveClasses(classIndex, width, height, minPixels) : classIndex;

    // ── لون كل class من نفس الـ colormap المختار (نفس الـ ramp اللي شكل
    // الـ continuous gradient، بس مقسّم flat) ──────────────────────────────
    const zoneColorsRgb: [number, number, number][] = Array.from({ length: numClasses }, (_, i) => {
      const t = (i + 0.5) / numClasses;
      return applyColormap(stops, t);
    });

    // ── إعادة بناء rgbaData بألوان flat بدل الـ continuous gradient ──────
    for (let i = 0; i < width * height; i++) {
      const cls = finalClassIndex[i];
      const isMasked = cls < 0;
      const [r, g, b] = isMasked ? [0, 0, 0] : zoneColorsRgb[cls];
      rgbaData[i * 4] = r;
      rgbaData[i * 4 + 1] = g;
      rgbaData[i * 4 + 2] = b;
      rgbaData[i * 4 + 3] = isMasked ? 0 : 255;
    }

    // ── إحصائيات كل zone (بعد الـ sieve) عشان الفرونت يعرضها زي ما هي، من
    // غير ما يحتاج يعيد حسابها من histogram تقريبي ─────────────────────────
    const counts = new Array(numClasses).fill(0);
    for (let i = 0; i < width * height; i++) {
      const cls = finalClassIndex[i];
      if (cls >= 0) counts[cls]++;
    }
    zoneStats = counts.map((count, i) => {
      const lo = grayToValue(grayMin + (classSpan * i) / numClasses);
      const hi = grayToValue(grayMin + (classSpan * (i + 1)) / numClasses);
      const [r, g, b] = zoneColorsRgb[i];
      const hexColor = "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
      return {
        zone: i + 1,
        label: `Zone ${i + 1}`,
        color: hexColor,
        pixels: count,
        pct: (count / validPixels) * 100,
        areaM2: pixelAreaM2 ? count * pixelAreaM2 : 0,
        lo, hi,
      };
    });
  }

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
      ...(zoneStats ? { "X-Zone-Stats": JSON.stringify(zoneStats) } : {}),
    },
  });
}