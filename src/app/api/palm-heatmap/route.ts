// app/api/palm-heatmap/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Palm Trees — Heatmap (Density أو Value)
//
// فيه دلوقتي وضعين للهيت ماب، بيتحددوا بـ ?mode=:
//
//  • mode=density (الافتراضي — زي ما كان بالظبط، صفر تغيير في السلوك القديم):
//    بيرسم "كثافة نخل" — كل نخلة بتضيف تل Gaussian حواليها، والألوان بتعكس
//    عدد النخل المتجمع في كل بكسل. مفيدة لمعرفة "فين النخل مركّز" بغض النظر
//    عن قيمة أي معادلة.
//
//  • mode=value:
//    بيرسم قيمة عمود بعينه من نتيجة الكشف (مثلاً "NDVI Value" أو "NDMI Value"
//    أو "Stress Score" — نفس أعمدة CSV/Excel بالحرف الواحد) — يعني لو
//    اليوزر دخل معادلة NDVI في الـ Formula box، وعايز يشوف قيمة الـ NDVI
//    الفعلية اتوزعت إزاي مكانيًا على النخل، مش بس "فين النخل"، ده الوضع ده.
//    كل نخلة بتساهم بقيمتها (مش عدّها) في كل بكسل حواليها بنفس Gaussian
//    kernel المستخدم في الكثافة، وبيتحسب weighted average (IDW-style) —
//    مش مجموع تراكمي زي الكثافة. الشفافية هنا معناها "فيه بيانات كفاية
//    حوالين البكسل ده نثق فيها" (تغطية)، مش "بعيد عن الصفر" زي الكثافة.
//
// القيمة بتتقرا بالأولوية من properties كل feature في نفس الـ geojson (لو
// الباك إند حاطط NDVI Value/... جوا كل نقطة أصلًا)، ولو مش لاقيها هناك
// وكان csvUrl متبعت، بيرجع يجيب الـ CSV (من السيرفر — مفيش CORS، زي أي
// راوت تاني هنا) ويعمل join بالـ Palm ID.
//
// باقي المنطق (حجم الصورة، bbox، ألوان RAMPS/buildLUT، الـ headers اللي
// PlanetaryRasterPanel.tsx بيقراها) زي ما هو بالظبط — عشان أي كود موجود في
// الفرونت يشتغل من غير تعديل حتى لو محدش بعت mode خالص.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { RAMPS, buildLUT } from "@/lib/rasterColor";

export const runtime = "nodejs";

// نفس القيمة المستخدمة في raster-proxy/analyze لأطول ضلع في الصورة الناتجة
const TARGET_MAX_DIM = 1024;

type LngLat = [number, number];

type PointWithProps = {
  lng: number;
  lat: number;
  /** كل properties الـ feature زي ما هي — عشان نقدر ندوّر فيها على أي عمود
   *  (Palm ID، NDVI Value، ...) من غير ما نفترض اسم مفتاح واحد بالظبط */
  props: Record<string, unknown>;
};

/** بيدوّر على قيمة property جوا object بأي شكل من أشكال الاسم (مسافات/
 *  underscores/camelCase/lowercase) — لأن مفيش ضمان إن الباك إند حاطط
 *  المفتاح "NDVI Value" بالحرف الواحد جوا الـ geojson properties. */
function findPropertyValue(props: Record<string, unknown>, fieldName: string): number | null {
  if (!props) return null;
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const target = normalize(fieldName);
  for (const key of Object.keys(props)) {
    if (normalize(key) === target) {
      const v = props[key];
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return n;
      return null;
    }
  }
  return null;
}

/** نفس فكرة findPropertyValue بس لعمود "Palm ID" تحديدًا (بيتقرأ كنص/رقم) —
 *  مستخدم للـ join مع الـ CSV لما القيمة مش موجودة جوا الـ geojson properties. */
function findPalmId(props: Record<string, unknown>): string | null {
  if (!props) return null;
  const candidates = ["palm id", "palmid", "id"];
  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  for (const key of Object.keys(props)) {
    const nk = normalize(key);
    if (candidates.includes(nk)) {
      const v = props[key];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
  }
  return null;
}

/** CSV parser بسيط بيحترم الحقول المتحاطة بـ "..." — نفس اللي في
 *  app/api/palm-excel/route.ts بالحرف الواحد (نسخة self-contained هنا). */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // تجاهل
    } else if (c === "\n") {
      row.push(field);
      field = "";
      if (!(row.length === 1 && row[0] === "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
  }
  return rows;
}

/** بيبني map: Palm ID → قيمة العمود المطلوب، من نص CSV خام */
function buildCsvValueMap(csvText: string, valueField: string): Map<string, number> {
  const map = new Map<string, number>();
  const rows = parseCSV(csvText);
  if (rows.length === 0) return map;
  const [header, ...dataRows] = rows;

  const normalize = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");
  const idIdx = header.findIndex((h) => ["palm id", "palmid", "id"].includes(normalize(h)));
  const valIdx = header.findIndex((h) => normalize(h) === normalize(valueField));
  if (idIdx === -1 || valIdx === -1) return map;

  for (const r of dataRows) {
    const idRaw = (r[idIdx] ?? "").trim();
    const valRaw = (r[valIdx] ?? "").trim();
    if (!idRaw || valRaw === "") continue;
    const n = Number(valRaw);
    if (Number.isFinite(n)) map.set(idRaw, n);
  }
  return map;
}

/** بيمشي على أي شكل GeoJSON (FeatureCollection/Feature/Geometry) ويطلع كل
 *  نقطة نخلة موجودة، مع الـ properties بتاعتها. لو الباكند رجّع Polygon/
 *  MultiPolygon (bounding box لكل نخلة مثلًا) بدل Point، بناخد centroid
 *  الحلقة الأولى كـ fallback — والـ properties بتتوّرث من الـ feature نفسه. */
function extractPointsFromGeoJSON(gj: any): PointWithProps[] {
  const points: PointWithProps[] = [];

  const pushIfValid = (lng: unknown, lat: unknown, props: Record<string, unknown>) => {
    if (typeof lng === "number" && typeof lat === "number" && Number.isFinite(lng) && Number.isFinite(lat)) {
      points.push({ lng, lat, props });
    }
  };

  const walkGeometry = (g: any, props: Record<string, unknown>) => {
    if (!g) return;
    if (g.type === "Point") {
      pushIfValid(g.coordinates?.[0], g.coordinates?.[1], props);
    } else if (g.type === "MultiPoint") {
      (g.coordinates ?? []).forEach((c: number[]) => pushIfValid(c?.[0], c?.[1], props));
    } else if (g.type === "Polygon" || g.type === "MultiPolygon") {
      const ring = g.type === "Polygon" ? g.coordinates?.[0] : g.coordinates?.[0]?.[0];
      if (Array.isArray(ring) && ring.length) {
        const lngs = ring.map((c: number[]) => c[0]).filter(Number.isFinite);
        const lats = ring.map((c: number[]) => c[1]).filter(Number.isFinite);
        if (lngs.length && lats.length) {
          pushIfValid(
            lngs.reduce((a: number, b: number) => a + b, 0) / lngs.length,
            lats.reduce((a: number, b: number) => a + b, 0) / lats.length,
            props
          );
        }
      }
    }
  };

  if (gj?.type === "FeatureCollection" && Array.isArray(gj.features)) {
    gj.features.forEach((f: any) => walkGeometry(f?.geometry, f?.properties ?? {}));
  } else if (gj?.type === "Feature") {
    walkGeometry(gj.geometry, gj?.properties ?? {});
  } else if (gj?.type) {
    walkGeometry(gj, {});
  }
  return points;
}

/** بيبني شبكة كثافة (Gaussian splat لكل نخلة) — نفس اللي كان موجود بالظبط،
 *  مستخدمة في mode=density. */
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
    if (lng < west || lng > east || lat < south || lat > north) continue;
    const px = ((lng - west) / (east - west)) * outW;
    const py = ((north - lat) / (north - south)) * outH;

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

/** mode=value: بدل ما نجمع "عدد"، بنعمل weighted average (IDW-style) لقيمة
 *  كل نخلة على الشبكة. بنرجّع مصفوفتين: values (المتوسط الموزون النهائي في
 *  كل بكسل) وcoverage (مجموع الأوزان الخام — بيتحول بعدين لشفافية: بكسل
 *  بعيد عن أي نخلة = coverage قريب من صفر = شفاف). */
function buildValueGrid(
  points: { lng: number; lat: number; value: number }[],
  bbox: [number, number, number, number],
  outW: number,
  outH: number,
  radiusPx: number
): { values: Float32Array; coverage: Float32Array } {
  const [west, south, east, north] = bbox;
  const numerator = new Float32Array(outW * outH);
  const coverage = new Float32Array(outW * outH);
  const sigma = Math.max(1, radiusPx / 2.5);
  const twoSigmaSq = 2 * sigma * sigma;
  const r = Math.max(1, Math.ceil(radiusPx));

  for (const { lng, lat, value } of points) {
    if (lng < west || lng > east || lat < south || lat > north) continue;
    const px = ((lng - west) / (east - west)) * outW;
    const py = ((north - lat) / (north - south)) * outH;

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
        const w = Math.exp(-distSq / twoSigmaSq);
        const idx = y * outW + x;
        numerator[idx] += w * value;
        coverage[idx] += w;
      }
    }
  }

  const values = new Float32Array(outW * outH);
  for (let i = 0; i < values.length; i++) {
    values[i] = coverage[i] > 1e-6 ? numerator[i] / coverage[i] : 0;
  }
  return { values, coverage };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = (searchParams.get("mode") ?? "density").toLowerCase() === "value" ? "value" : "density";
  const geojsonUrl = searchParams.get("geojsonUrl");
  const csvUrl = searchParams.get("csvUrl"); // اختياري — fallback لو القيمة مش جوا الـ geojson properties
  const valueField = searchParams.get("valueField"); // إجباري لو mode=value (مثلاً "NDVI Value")
  const bboxParam = searchParams.get("bbox");
  const colormap = searchParams.get("colormap") ?? "inferno";
  const alphaLow = parseFloat(searchParams.get("alphaLow") ?? "0");
  const alphaHigh = parseFloat(searchParams.get("alphaHigh") ?? "0.18");
  const radiusPx = parseFloat(searchParams.get("radius") ?? "16");
  const minParam = searchParams.get("min");
  const maxParam = searchParams.get("max");
  // عتبة "فيه بيانات كفاية هنا" لوضع value بس — منفصلة عمدًا عن alphaLow/
  // alphaHigh (اللي معناهم مختلف في وضع density) عشان صفر التباس بين الوضعين
  const covThreshold = parseFloat(searchParams.get("covThreshold") ?? "0.15");
  const covSoftness = parseFloat(searchParams.get("covSoftness") ?? "0.15");

  if (!geojsonUrl) {
    return NextResponse.json({ error: "Missing geojsonUrl param" }, { status: 400 });
  }
  if (!bboxParam) {
    return NextResponse.json(
      { error: "Missing bbox param — expected ?bbox=west,south,east,north (WGS84)" },
      { status: 400 }
    );
  }
  if (mode === "value" && !valueField) {
    return NextResponse.json(
      { error: "Missing valueField param — required when mode=value (e.g. valueField=NDVI Value)" },
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

  const rawPoints = extractPointsFromGeoJSON(geojson);
  if (rawPoints.length === 0) {
    return NextResponse.json({ error: "No point geometries found in geojsonUrl" }, { status: 422 });
  }

  // ── 2. حجم الصورة الناتجة — نفس renderIndex بالظبط ──────────────────────
  const aspect = (east - west) / (north - south);
  let outW: number, outH: number;
  if (aspect >= 1) {
    outW = TARGET_MAX_DIM;
    outH = Math.max(8, Math.round(TARGET_MAX_DIM / aspect));
  } else {
    outH = TARGET_MAX_DIM;
    outW = Math.max(8, Math.round(TARGET_MAX_DIM * aspect));
  }

  const stops = RAMPS[colormap] ?? RAMPS["inferno"];
  const lut = buildLUT(stops);

  // ── فرع mode=density: زي ما كان بالظبط، صفر تغيير في المنطق ─────────────
  if (mode === "density") {
    const points: LngLat[] = rawPoints.map((p) => [p.lng, p.lat]);
    const grid = buildDensityGrid(points, bbox, outW, outH, radiusPx);

    let dataMax = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > dataMax) dataMax = grid[i];
    if (dataMax <= 0) dataMax = 1;

    const effMin = minParam !== null && Number.isFinite(Number(minParam)) ? Number(minParam) : 0;
    const effMax = maxParam !== null && Number.isFinite(Number(maxParam)) ? Number(maxParam) : dataMax;
    const range = effMax - effMin || 0.001;

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
        "X-Real-Bbox": bbox.join(","),
        "X-Raster-Stats": JSON.stringify(stats),
        "X-Raster-Histogram": histogram.join(","),
        "X-Palm-Count": String(rawPoints.length),
        "X-Heatmap-Mode": "density",
      },
    });
  }

  // ── فرع mode=value: نفس شكل الرد، بس القيمة المرسومة هي متوسط عمود
  // المعادلة (NDVI Value / NDMI Value / Stress Score / ...) بدل الكثافة ───

  // (أ) هات القيمة من properties كل نقطة أول، ولو ملقاهاش وفيه csvUrl،
  // اجمع اللي ناقص من الـ CSV دفعة واحدة (join بالـ Palm ID)
  let csvValueMap: Map<string, number> | null = null;
  const valuedPoints: { lng: number; lat: number; value: number }[] = [];
  const missing: { lng: number; lat: number; palmId: string | null }[] = [];

  for (const p of rawPoints) {
    const direct = findPropertyValue(p.props, valueField!);
    if (direct !== null) {
      valuedPoints.push({ lng: p.lng, lat: p.lat, value: direct });
    } else {
      missing.push({ lng: p.lng, lat: p.lat, palmId: findPalmId(p.props) });
    }
  }

  if (missing.length > 0 && csvUrl) {
    try {
      const csvRes = await fetch(csvUrl);
      if (csvRes.ok) {
        const csvText = await csvRes.text();
        csvValueMap = buildCsvValueMap(csvText, valueField!);
      }
    } catch {
      // تجاهل — هنكمل بس بالنقط اللي عندها قيمة مباشرة من الـ geojson
    }
    if (csvValueMap) {
      for (const m of missing) {
        if (!m.palmId) continue;
        const v = csvValueMap.get(m.palmId);
        if (v !== undefined) valuedPoints.push({ lng: m.lng, lat: m.lat, value: v });
      }
    }
  }

  if (valuedPoints.length === 0) {
    return NextResponse.json(
      {
        error: `Could not find values for "${valueField}" — not present in the geojson properties, and either csvUrl was missing or the CSV had no matching column/Palm ID join.`,
      },
      { status: 422 }
    );
  }

  const { values: grid, coverage } = buildValueGrid(valuedPoints, bbox, outW, outH, radiusPx);

  const rawValues = valuedPoints.map((p) => p.value);
  const dataMin = Math.min(...rawValues);
  const dataMax = Math.max(...rawValues);

  const effMin = minParam !== null && Number.isFinite(Number(minParam)) ? Number(minParam) : dataMin;
  const effMax = maxParam !== null && Number.isFinite(Number(maxParam)) ? Number(maxParam) : dataMax;
  const range = effMax - effMin || 0.001;

  const n = outW * outH;
  const rgbaData = Buffer.alloc(n * 4);
  let validPixels = 0, sum = 0, minV = Infinity, maxV = -Infinity;
  const bins = 100;
  const histogram = new Array(bins).fill(0);

  const softLo = Math.max(0, covThreshold - covSoftness);
  const softHi = Math.max(softLo + 0.001, covThreshold);

  for (let i = 0; i < n; i++) {
    const cov = coverage[i];
    const eased = Math.max(0, Math.min(1, (cov - softLo) / (softHi - softLo)));
    const alphaT = eased * eased * (3 - 2 * eased); // smoothstep — نفس منطق density
    const alpha = Math.round(alphaT * 255);

    const v = grid[i];
    let t = (v - effMin) / range;
    t = Math.max(0, Math.min(1, t));
    const byte = Math.round(t * 255);

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
      "X-Real-Bbox": bbox.join(","),
      "X-Raster-Stats": JSON.stringify(stats),
      "X-Raster-Histogram": histogram.join(","),
      "X-Palm-Count": String(rawPoints.length),
      "X-Heatmap-Mode": "value",
      "X-Value-Field": valueField!,
      "X-Values-Resolved": String(valuedPoints.length),
    },
  });
}