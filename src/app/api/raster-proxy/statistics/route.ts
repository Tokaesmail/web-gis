// app/api/raster-proxy/statistics/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Endpoint منفصل بيقرا GeoTIFF واحد (band واحد) ويرجّع إحصائيات حقيقية
// (min/max/mean/percentiles) عن قيم البكسلات الفعلية. الهدف الأساسي: تلوين
// أدق للـ Sentinel-5P/Sentinel-3 heatmaps — كل غاز (NO2/SO2/CO/O3/CH4/...)
// له مدى قيم مختلف تمامًا (مثلاً NO2 تروبوسفيري ~1e-5 لـ 1e-4 mol/m²، SST
// ~270-310 كلفن)، فمفيش رقم rescale ثابت واحد يظبط لكل المتغيرات مع بعض.
//
// الفكرة: قبل ما تعرضي الصورة عن طريق /api/raster-proxy/analyze (اللي
// بيطبّق الـ colormap فعليًا)، استدعي الـ endpoint ده الأول على نفس رابط
// الـ GeoTIFF، خدي min/max (أو p2/p98 لتباين أوضح مع تجاهل الـ outliers)،
// وبعدين ابعتيهم كـ ?min=&max= لـ /api/raster-proxy/analyze.
//
// ⚠️ ده مختلف عمدًا عن readBand() الموجودة في route.ts (analyze): تلك مبنية
// لقراءة نافذة (window) من scene كبير على Azure Blob مع إعادة إسقاط CRS
// واختيار overview level مناسب — مصمّمة لـ Sentinel-2/Landsat الأصليين.
// الـ GeoTIFFs الراجعة من /gis/sentinel5p/decode بالعكس: already cropped
// بالظبط على الـ bbox المطلوب من الباك (نفس bbox اللي بعتناه في الطلب)،
// فمفيش داعي لأي windowing/reprojection — بنقرا الملف كامل زي ما هو ونحسب
// الإحصائيات على كل البكسلات الصالحة (مش NaN/nodata).
//
// Usage:
//   GET /api/raster-proxy/statistics?url=<geotiff_url>[&low=2&high=98][&token=...]
//   → { min, max, mean, p2, p98, validPixels, width, height }
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { fromUrl } from "geotiff";

export const runtime = "nodejs";

function computeStats(values: Float64Array, low: number, high: number) {
  // نسخة قابلة للفرز — قيم البكسلات هنا already فلترة (finite + non-nodata)
  const sorted = Array.from(values).sort((a, b) => a - b);
  const n = sorted.length;
  const pick = (p: number) =>
    sorted[Math.min(n - 1, Math.max(0, Math.floor((p / 100) * n)))];

  let sum = 0;
  for (let i = 0; i < n; i++) sum += sorted[i];

  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean: sum / n,
    p2: pick(low),
    p98: pick(high),
    validPixels: n,
  };
}

// ⚠️ "fetch failed" من Node بيبقى غامض جدًا (مفيش status code خالص — فشل
// على مستوى الشبكة قبل حتى ما يوصل السيرفر التاني). بنستخرج هنا أي تفاصيل
// إضافية (err.cause: ECONNREFUSED/ENOTFOUND/شهادة SSL/timeout...) لو
// موجودة، عشان الرسالة النهائية تبقى قابلة للتشخيص بدل "fetch failed" وبس.
function describeFetchError(err: unknown): string {
  const e = err as Error & { cause?: unknown };
  const base = e?.message || String(err);
  const cause = e?.cause as { code?: string; message?: string } | undefined;
  if (cause) {
    const causeMsg = cause.code ? `${cause.code} — ${cause.message ?? ""}` : cause.message;
    if (causeMsg) return `${base} (cause: ${causeMsg})`;
  }
  return base;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const url = searchParams.get("url");
  const token = searchParams.get("token");
  const low = parseFloat(searchParams.get("low") ?? "2");
  const high = parseFloat(searchParams.get("high") ?? "98");

  if (!url) {
    return NextResponse.json({ error: "Missing url param — expected ?url=<geotiff_url>" }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    // 👇 (1) بنسجّل الرابط اللي هنحاول نفتحه فعليًا قبل أي حاجة — لو فشل،
    // أول حاجة تتأكدي منها هي إن الرابط ده نفسه شغّال (افتحيه مباشرة في
    // المتصفح أو curl -I من نفس الجهاز اللي شغّال عليه dev server).
    console.log("[raster-statistics] fetching →", url);

    const tiff = await fromUrl(url, { headers });
    const image = await tiff.getImage(0);
    const width = image.getWidth();
    const height = image.getHeight();

    const rasters = await image.readRasters({ interleave: false });
    // منتظرين band واحد بس (single-band gas/SST GeoTIFF) — لو فيه أكتر من
    // باند لأي سبب، بنقرا الأول بس (نفس افتراض "index" kind في route.ts).
    const band = rasters[0] as unknown as ArrayLike<number>;

    // ⚠️ nodata ممكن يبقى مسجّل جوه الـ GeoTIFF header (GDAL_NODATA tag) —
    // لو موجود بنستبعده. لو مش موجود، بنستبعد بس القيم الغير-محدودة (NaN/Inf)
    // ومنستبعدش الصفر أو السالب — للغازات دي أرقام صغيرة جدًا وممكن يبقى فيه
    // ضوضاء استشعار سالبة شرعية حوالين الصفر، استبعادها كان هيفسد الـ stretch.
    let nodata: number | null = null;
    try {
      const raw = (image.getGDALNoData?.() ?? null) as number | null;
      if (typeof raw === "number" && Number.isFinite(raw)) nodata = raw;
    } catch {
      // لو الميتاداتا مش موجودة أو الدالة مش متاحة في النسخة، نتجاهل الفلترة دي
    }

    const values = new Float64Array(band.length);
    let count = 0;
    for (let i = 0; i < band.length; i++) {
      const v = Number(band[i]);
      if (!Number.isFinite(v)) continue;
      if (nodata !== null && v === nodata) continue;
      values[count++] = v;
    }

    if (count === 0) {
      return NextResponse.json(
        { error: "No valid (finite, non-nodata) pixels found in this raster" },
        { status: 422 }
      );
    }

    const stats = computeStats(values.subarray(0, count), low, high);

    return NextResponse.json(
      { ...stats, width, height },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (err) {
    // 👇 (2) بنطبع تفاصيل الخطأ كاملة في السيرفر (terminal بتاع npm run dev)
    // كمان، مش بس نرجعها في الـ response — أحيانًا err.cause بيحتوي معلومات
    // إضافية (زي TLS/certificate errors) اللي مش دايمًا بتتسلسل صح جوه
    // NextResponse.json.
    console.error("[raster-statistics] failed for", url, err);
    return NextResponse.json(
      { error: `Failed to read statistics: ${describeFetchError(err)}` },
      { status: 502 }
    );
  }
}