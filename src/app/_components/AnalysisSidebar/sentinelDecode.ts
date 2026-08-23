// ─── sentinelDecode.ts ────────────────────────────────────────────────────
// كلاينت للـ endpoint الجديد الموحّد اللي بيفك ملفات Sentinel-5P و Sentinel-3:
//   POST https://webgiss.duckdns.org/gis/sentinel5p/decode
//   Headers: Authorization: Bearer <JWT_TOKEN>
//   Body: { source, item_id, variable, bbox: [west, south, east, north] }
//
// ⚠️ ده بيحل محل fetchSentinel5pCog القديمة (المايكروسيرفس المنفصل على
// بورت 8001، GET، من غير auth، ومحتاج assetUrl نازل من STAC الأول). الـ
// endpoint الجديد:
//   - على نفس الدومين الرئيسي (مش بورت منفصل) وتحت مسار /gis/* العادي.
//   - محمي بـ JWT (نفس accessToken اللي بنستخدمه مع /gis/contours في
//     MapClient.tsx — session.user.accessToken).
//   - بياخد item_id مباشرة (STAC id) — مش محتاج نجيب رابط NetCDF الأصلي
//     بنفسنا الأول، الباك عامل ده جوّاه.
//   - نفس الـ endpoint شغّال لـ Sentinel-3 (SST) كمان، مش بس Sentinel-5P.
//
// الريسبونس مضاعف (data.data.url) — بنتعامل مع الاتنين احتياطًا لو الشكل
// اتبسّط لاحقًا لمستوى واحد بس.

export type SentinelDecodeSource = "sentinel-5p" | "sentinel-3";

export const SENTINEL5P_DECODE_VARIABLES = [
  "NO2",
  "SO2",
  "O3",
  "CO",
  "CH4",
  "HCHO",
  "CLOUD",
] as const;

// ⚠️ (2026-08-04) الباك بقى بيدعم التلاتة الجداد دول كمان (LST/FRP_MWIR/
// CHL_NN) جنب SST — قبل كده كانوا شغّالين بس عن طريق TiTiler
// المباشر بتاع Planetary Computer (SatelliteDataPanel.tsx: buildTitilerTileUrl)،
// اللي كان بيفشل مع NetCDF+"variable=" ويرجّع RGB overview بدل heatmap
// ملوّن. دلوقتي بياخدوا نفس مسار SST (decode → GeoTIFF → colormap).
// ⚠️ (2026-08-05) ضفنا "OA08_REFLECTANCE" لـ OCEAN_COLOR (كان لسه ماشي على
// TiTiler المباشر بـ 3 قنوات RGB مع بعض وكان بيفشل بـ 400 — شوفي
// SatelliteDataPanel.tsx). ⚠️ الباك إند لسه محتاج يضيف دعم للمتغير ده فعليًا
// (مش موجود في الليست القديمة اللي كان بيدعمها SENTINEL3_DECODE_VARIABLES) —
// من غير ده، أي طلب لـ OCEAN_COLOR هيرجع نفس نوع 400 اللي بترجعه
// CHLOROPHYLL/FRP دلوقتي، لحد ما الباك يتظبط.
export const SENTINEL3_DECODE_VARIABLES = ["SST", "LST", "FRP_MWIR", "CHL_NN", "OA08_REFLECTANCE"] as const;

export type Sentinel5pDecodeVariable = (typeof SENTINEL5P_DECODE_VARIABLES)[number];
export type Sentinel3DecodeVariable = (typeof SENTINEL3_DECODE_VARIABLES)[number];
export type SentinelDecodeVariable = Sentinel5pDecodeVariable | Sentinel3DecodeVariable;

// ⚠️ الواجهة الحالية عندها "OZONE" كـ IdxKey مش "O3" (شوفي bandOptions في
// SatelliteDataPanel.tsx). الـ endpoint الجديد بياخد "O3" بالظبط، فلازم
// mapping بين اسم الـ band في الواجهة واسم الـ variable اللي الـ API بتفهمه.
// نفس الكلام لو عندكوا اختصارات تانية مختلفة عن أسماء الـ API.
export const UI_BAND_TO_SENTINEL_VARIABLE: Record<string, SentinelDecodeVariable> = {
  NO2: "NO2",
  SO2: "SO2",
  OZONE: "O3",
  O3: "O3",
  CO: "CO",
  CH4: "CH4",
  HCHO: "HCHO",
  CLOUD: "CLOUD",
  SST: "SST",
  // ⚠️ التلاتة دول أسماء الـ IdxKey بتاعتهم في bandOptions/SatelliteDataPanel.tsx
  // (S3_LST/CHLOROPHYLL/FRP) مختلفة عن اسم الـ variable اللي الـ API
  // بتفهمه (LST/CHL_NN/FRP_MWIR) — نفس فكرة OZONE→O3 فوق بالظبط.
  S3_LST: "LST",
  CHLOROPHYLL: "CHL_NN",
  FRP: "FRP_MWIR",
  // ⚠️ (2026-08-05) شوفي الكومنت فوق SENTINEL3_DECODE_VARIABLES — الباك إند
  // لسه محتاج يدعم "OA08_REFLECTANCE" فعليًا.
  OCEAN_COLOR: "OA08_REFLECTANCE",
};

const SENTINEL_DECODE_URL = "https://webgiss.duckdns.org/gis/sentinel5p/decode";

// ⚠️⚠️ (2026-08-05) 3 أعطال معروفة حاليًا على الـ backend نفسه (مش قابلة
// للإصلاح من الفرونت إند — الملف ده بس بيبعت الطلب الصح، لكن معالجته
// جوّه /gis/sentinel5p/decode هي اللي غلط). لو حد بيدخل يظبط الـ backend،
// دي أعراضها بالظبط زي ما رجعت من الـ API نفسه:
//
// 1) CHLOROPHYLL (variable=CHL_NN, collection=sentinel-3-olci-wfr-l2-netcdf):
//    400 → "مفيش latitude/longitude جوه الـ NetCDF لهذا الـ variable. لازم
//    تحددي منين نجيب الإحداثيات." منتج OLCI L2 WFR بيفصل الإحداثيات في asset
//    منفصل اسمه عادة "geo_coordinates" (ملف geo_coordinates.nc جوه نفس الـ
//    STAC item) — مش متضمّنة جوه ملف chl_nn.nc نفسه. الباك محتاج يجيب
//    الـ asset ده كمان من نفس الـ item ويستخدم lat/lon بتاعته لعمل الـ
//    georeferencing لملف الكلوروفيل قبل ما يطلع GeoTIFF.
//
// 2) FRP (variable=FRP_MWIR):
//    400 → "مفيش نقط صالحة جوه الـ bbox المطلوب. تأكدي إن الـ item فعلاً
//    بيغطي المنطقة." الـ item ده جه من STAC search أصلاً على أساس تقاطع
//    bbox الـ scene مع bbox الـ AOI (يعني في نظري لازم يغطيها)، فالسبب
//    الأرجح: منتج FRP ده narrow-swath (خط ضيق مش مربع كامل)، فرغم
//    إن الـ bounding box بتاعها بيتقاطع مع الـ AOI، البيانات الفعلية
//    (الخط نفسه) ممكن تكون مش عدّت فوق المنطقة بالظبط. الباك محتاج (أ) يتأكد
//    إن فحص "نقط صالحة" بتاعه بيقارن على mask/geometry الحقيقي مش bbox
//    مستطيل بس، و(ب) لو فعلاً مفيش تقاطع حقيقي، يرجّع رسالة توضح إن الـ scene
//    ده تحديدًا مش بيغطي المنطقة عشان نختار غيره من نتائج STAC، مش نفشل
//    صامتين كل مرة.
//
// 3) OCEAN_COLOR (variable=OA08_REFLECTANCE): الباك لسه ملوش دعم للمتغير ده
//    خالص (كان بيتعرض قبل كده كـ true-color composite عن طريق TiTiler
//    المباشر، مش عن طريق الـ decode endpoint ده) — محتاج يتضاف زي ما اتضاف
//    LST/FRP_MWIR/CHL_NN قبل كده.

// ⚠️ خطأ متخصص بدل Error عادي — الهدف إن SatelliteDataPanel.tsx (أو أي
// caller تاني) يقدر يفرّق برمجيًا بين "المنطقة/المشهد ده مفيهوش بيانات
// صالحة" (isNoDataForArea=true، يعني رسالة UI ودّية "جربي منطقة تانية")
// وبين أي خطأ حقيقي تاني (شبكة/توكن/بگ) من غير ما يعتمد على regex هش على
// نص رسالة الخطأ نفسه في كل مكان بيستخدمها.
export class SentinelDecodeError extends Error {
  status?: number;
  isNoDataForArea: boolean;
  constructor(message: string, opts?: { status?: number; isNoDataForArea?: boolean }) {
    super(message);
    this.name = "SentinelDecodeError";
    this.status = opts?.status;
    this.isNoDataForArea = opts?.isNoDataForArea ?? false;
  }
}

// أنماط الرسائل المعروفة من الباك (شوفي كومنت "3 أعطال معروفة" فوق) اللي
// معناها الفعلي "الـ scene/bbox ده مفيهوش بيانات صالحة للـ variable ده" —
// مش خطأ شبكة أو bug. لو الباك غيّر صياغة الرسالة دي يوم ما يتظبط، لازم
// تتحدّث هنا كمان.
const NO_DATA_MESSAGE_PATTERNS = [
  /مفيش نقط صالحة/i,
  /no valid (points|pixels|data)/i,
  /مفيش latitude|longitude/i,
  /no (lat(itude)?|lon(gitude)?|coordinates)/i,
  /out of (bounds|range)/i,
  /does not (cover|overlap|intersect)/i,
  // ⚠️ (2026-08-22) FRP-specific: الباك بيرجّع الرسالة دي تحديدًا لما مفيش
  // حرايق نشطة في السينة/المنطقة دي — نفس معنى "no data for area" بالظبط،
  // بس بصياغة مختلفة عن باقي الأنماط فوق (مش "no valid points/pixels").
  /no active fires? detected/i,
];

function looksLikeNoDataForArea(status: number, text: string): boolean {
  if (status === 404) return true;
  if (status === 400 && NO_DATA_MESSAGE_PATTERNS.some((re) => re.test(text))) return true;
  return false;
}

export type SentinelDecodeResult = {
  /** رابط GeoTIFF خام (single-band) — لسه محتاج يتلوّن (colormap/stretch)
   *  قبل ما يتعرض كـ heatmap فوق الخريطة، شوفي buildRasterProxyAnalyzeUrl تحت. */
  url: string;
  source: SentinelDecodeSource;
  variable: SentinelDecodeVariable;
  itemId: string;
};

/** شكل الريسبونس زي ما اتحدد في السبيك: مضاعف { success, message, data: { success, message, data: { url, ... } } } */
type RawSentinelDecodeResponse = {
  success?: boolean;
  message?: string;
  data?: {
    success?: boolean;
    message?: string;
    data?: {
      url?: string;
      source?: string;
      variable?: string;
      item_id?: string;
    };
  };
};

// ── كاش + de-duplication لطلبات الـ decode ──────────────────────────────────
// (2026-08-22) قبل كده كل preview لنفس السينة/الـ variable/الـ bbox كان
// بيعيد نفس الرحلة الشبكية التقيلة لـ /gis/sentinel5p/decode من الصفر (فك
// NetCDF جوّه الباك — العملية دي هي أغلب سبب الـ 2-3 دقايق انتظار)، حتى لو
// المستخدم بس فتح نفس الـ scene تاني أو رجع لها بعد ما شاف واحدة غيرها.
// دلوقتي:
//   1) نتايج ناجحة بتتخزن في memory (Map) طول عمر التاب — أي طلب تاني بنفس
//      المفتاح (source+itemId+variable+bbox) بيرجع فورًا من الكاش.
//   2) طلبات "في نفس اللحظة" لنفس المفتاح (مثلًا useEffect اتنين اشتغلوا مع
//      بعض) بيتشاركوا نفس الـ Promise بدل ما كل واحد يبعت request منفصل
//      (de-duplication) — عن طريق الـ pending map تحت.
// ⚠️ الكاش ده في الـ memory بس (مش sessionStorage/localStorage) — بيتصفّر
// لو المستخدم عمل refresh للصفحة، وده مقصود: روابط الـ GeoTIFF الراجعة من
// الباك على الأغلب presigned/مؤقتة (زي روابط PC الـ SAS-signed)، فمش آمن
// نخزنها لمدة أطول من الـ session الحالية من غير ما نعرف مدة صلاحيتها فعليًا.
const decodeResultCache = new Map<string, SentinelDecodeResult>();
const decodePendingRequests = new Map<string, Promise<SentinelDecodeResult>>();

function buildDecodeCacheKey(params: {
  source: SentinelDecodeSource;
  itemId: string;
  variable: SentinelDecodeVariable;
  bbox: [number, number, number, number];
}): string {
  const { source, itemId, variable, bbox } = params;
  return `${source}::${itemId}::${variable}::${bbox.join(",")}`;
}

export async function decodeSentinelDataset(params: {
  /** JWT بتاع اليوزر — session.user.accessToken من next-auth (زي MapClient.tsx) */
  token?: string;
  source: SentinelDecodeSource;
  itemId: string;
  /** اسم الـ variable زي ما الـ API بتفهمه (NO2/SO2/O3/CO/CH4/HCHO/CLOUD لـ Sentinel-5P، أو SST/LST/FRP_MWIR/CHL_NN لـ Sentinel-3) */
  variable: SentinelDecodeVariable;
  // ⚠️ (2026-08-04) ضروري لـ Sentinel-3 دلوقتي: الـ 4 variables بتاعته (SST/
  // LST/CHL_NN/FRP_MWIR) كل واحد فيهم جاي من STAC collection مختلف
  // تمامًا (sentinel-3-slstr-wst/-lst/-frp-l2-netcdf، sentinel-3-olci-wfr-l2-
  // netcdf). من غير الحقل ده، الـ backend
  // معندوش طريقة يعرف بيها إن item_id معين جاي من أنهي collection فيهم —
  // كان بيدوّر (على الأقل قبل كده) في collection SST الافتراضي بس، فأي
  // item من الأربعة الجداد كان بيرجع 400 "مفيش item بالـ id ده" حتى لو
  // الـ id نفسه صحيح 100% (مؤكد من STAC search). لازم الـ backend يستخدم
  // الحقل ده فعليًا في الـ lookup — لو لسه بيرجع نفس الخطأ بعد إضافته، يبقى
  // الباك محتاج تعديل مطابق (يقرا collection من الـ body مش يفترضه).
  collection?: string;
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  signal?: AbortSignal;
}): Promise<SentinelDecodeResult> {
  const { token, source, itemId, variable, collection, bbox, signal } = params;

  if (source === "sentinel-3" && !(SENTINEL3_DECODE_VARIABLES as readonly string[]).includes(variable)) {
    throw new Error(`"${variable}" is not a valid Sentinel-3 variable (expected one of: ${SENTINEL3_DECODE_VARIABLES.join(", ")}).`);
  }

  // 👇 كاش/de-dup — لو نفس (source+itemId+variable+bbox) اتفكت قبل كده أو
  // لسه بتتفك دلوقتي (طلب تاني اشتغل في نفس اللحظة)، منعملش رحلة شبكية
  // جديدة. شوفي الكومنت فوق decodeResultCache لتفاصيل أكتر.
  const cacheKey = buildDecodeCacheKey({ source, itemId, variable, bbox });
  const cached = decodeResultCache.get(cacheKey);
  if (cached) {
    console.log("[sentinelDecode] cache hit →", cacheKey);
    return cached;
  }
  const pending = decodePendingRequests.get(cacheKey);
  if (pending) {
    console.log("[sentinelDecode] joining in-flight request →", cacheKey);
    return pending;
  }

  const requestPromise = decodeSentinelDatasetUncached(params);
  decodePendingRequests.set(cacheKey, requestPromise);
  try {
    const result = await requestPromise;
    decodeResultCache.set(cacheKey, result);
    return result;
  } finally {
    decodePendingRequests.delete(cacheKey);
  }
}

// الجسم الفعلي القديم لـ decodeSentinelDataset (نفس اللوجيك زي ما هو) —
// بس دلوقتي بيتنادى من ورا الكاش/de-dup فوق بدل ما يتنادى مباشرة، عشان
// نضمن إن أي مكان بينادي decodeSentinelDataset (سواء من هنا أو من
// decodeAndBuildHeatmapUrl) بيستفيد من الكاش تلقائيًا من غير تغيير في
// الـ call sites بتاعته.
async function decodeSentinelDatasetUncached(params: {
  token?: string;
  source: SentinelDecodeSource;
  itemId: string;
  variable: SentinelDecodeVariable;
  collection?: string;
  bbox: [number, number, number, number];
  signal?: AbortSignal;
}): Promise<SentinelDecodeResult> {
  const { token, source, itemId, variable, collection, bbox, signal } = params;

  const requestBody = {
    source,
    item_id: itemId,
    variable,
    bbox,
    ...(collection ? { collection } : {}),
  };
  // 👇 اطبعي الـ body اللي بيتبعت فعليًا للـ backend — لو الـ item_id مش
  // موجود في الـ collection اللي الـ backend بيدور فيها (زي رسالة "مفيش
  // item بالـ id ده")، أول حاجة تتأكدي منها هنا: هل الـ body ده ناقصه
  // "collection" (الـ backend مش عارف يفرّق بين collections الخمسة بتاعة
  // Sentinel-3 من غير ما نبعتها له صراحة)؟ لو الـ backend محتاج الحقل ده،
  // هيبان هنا إنه مش مبعوت أصلًا.
  console.log("[sentinelDecode] POST /gis/sentinel5p/decode →", requestBody);
  if (source === "sentinel-5p" && !(SENTINEL5P_DECODE_VARIABLES as readonly string[]).includes(variable)) {
    throw new Error(`"${variable}" is not a valid Sentinel-5P variable.`);
  }

  const res = await fetch(SENTINEL_DECODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 401/403 هنا غالبًا معناها الـ JWT مش متبعت أو منتهي — تأكدي إن
    // session.user.accessToken فعلاً موجود قبل ما تنادي الدالة دي.
    // 400 "مفيش item بالـ id ده" (زي ما حصل مع LST) — شوفي console.log فوق:
    // لو requestBody مفيهوش "collection"، يبقى الـ backend محتمل بيدور في
    // الـ collection الافتراضي (SST) مهما كان الـ variable المطلوب، وده
    // السبب الأرجح لفشل أي item من التلاتة الجداد (LST/FRP_MWIR/CHL_NN)
    // — كل واحد فيهم item_id بتاعه جايه من collection مختلف.
    // ⚠️ ده مقصود console.warn مش console.error: الخطأ ده متمسوك ومتعالج
    // فوق (decodeAndBuildHeatmapUrl → handlePreviewScene في
    // SatelliteDataPanel.tsx بيعرضه في sceneError UI box)، مش bug غير
    // متوقع. في Next.js dev mode أي console.error() بيتحوّل تلقائيًا
    // لـ full-page red overlay بيغطي الموقع كله — حتى لو الخطأ ده مش
    // uncaught فعليًا. استخدام console.error هنا هو اللي كان بيخلي فشل
    // الطلب (زي "المنطقة دي مفيهاش بيانات") يظهر كأنه crash عام للموقع.
    console.warn("[sentinelDecode] request failed", { status: res.status, body: text, requestBody });
    throw new SentinelDecodeError(`Sentinel decode failed (${res.status}). ${text.slice(0, 200)}`, {
      status: res.status,
      isNoDataForArea: looksLikeNoDataForArea(res.status, text),
    });
  }

  const payload = (await res.json().catch(() => null)) as RawSentinelDecodeResponse | null;

  // بندعم الشكل المضاعف (data.data.url) وكمان لو اتبسّط لمستوى واحد (data.url)
  // مستقبلًا من غير ما نكسر الكود.
  const inner = payload?.data?.data ?? (payload?.data as any);
  const tifUrl = typeof inner?.url === "string" ? inner.url : null;

  if (!payload?.success || !tifUrl) {
    const message = payload?.message || payload?.data?.message || "Sentinel decode returned no raster url.";
    throw new SentinelDecodeError(message, {
      isNoDataForArea: NO_DATA_MESSAGE_PATTERNS.some((re) => re.test(message)),
    });
  }

  return { url: tifUrl, source, variable, itemId };
}

// ── تحويل الـ GeoTIFF الخام لصورة heatmap ملوّنة فوق الخريطة ───────────────
// نفس الـ pipeline المستخدم أصلاً لباقي الـ raster indices (Sentinel-5P
// القديم، NDVI، ...): بنبعت رابط الـ COG لـ /api/raster-proxy/analyze
// (الراوت بتاعنا احنا، مش الـ backend الخارجي) عشان يطبّق colormap/stretch
// ويرجّع PNG جاهز نحطه كـ imageOverlay. لو عندك min/max حقيقي (من إحصائيات
// الـ scene) مرّريهم لتلوين أدق، وإلا route.ts هيستخدم الـ default rescale
// بتاعه (يفضل يتاكد إنه مظبوط لكل variable من الـ 9).
export function buildRasterProxyAnalyzeUrl(params: {
  cogUrl: string;
  variable: SentinelDecodeVariable;
  bbox: [number, number, number, number];
  min?: number;
  max?: number;
}): string {
  const { cogUrl, variable, bbox, min, max } = params;
  const [west, south, east, north] = bbox;
  const qs = new URLSearchParams({
    type: variable.toLowerCase(),
    urls: cogUrl,
    bbox: `${west},${south},${east},${north}`,
  });
  if (typeof min === "number" && typeof max === "number") {
    qs.set("min", String(min));
    qs.set("max", String(max));
  }
  return `/api/raster-proxy/analyze?${qs.toString()}`;
}

// ── إحصائيات حقيقية للتلوين الأدق ───────────────────────────────────────────
// بننادي /api/raster-proxy/statistics (route جديد، شوفي statistics-route.ts)
// على رابط الـ GeoTIFF الراجع من decodeSentinelDataset، عشان ناخد min/max
// حقيقيين (أو p2/p98 لتجاهل الـ outliers) بدل ما نسيب route.ts يعتمد على
// الـ default rescale بتاعه (اللي مش مظبوط لكل الـ 10 متغيرات المختلفة).
const RASTER_STATISTICS_URL = "/api/raster-proxy/statistics";

export type RasterStatistics = {
  min: number;
  max: number;
  mean: number;
  /** 2nd percentile (افتراضيًا) — أفضل من min الخام لو فيه outliers/ضوضاء */
  p2: number;
  /** 98th percentile (افتراضيًا) */
  p98: number;
  validPixels: number;
  width: number;
  height: number;
};

// نفس فكرة كاش/de-dup الـ decode بالظبط، بس هنا المفتاح هو الـ cogUrl نفسه
// (+ percentile range) — لو نفس الـ GeoTIFF اتحسبله إحصائيات قبل كده (مثلًا
// نفس السينة اتفتحت تاني بعد ما اتقفلت)، منعملش نفس حساب الـ percentiles
// التقيل تاني من الصفر.
const statisticsResultCache = new Map<string, RasterStatistics>();
const statisticsPendingRequests = new Map<string, Promise<RasterStatistics>>();

export async function getRasterStatistics(params: {
  cogUrl: string;
  /** lower/upper percentile — افتراضي 2/98 */
  low?: number;
  high?: number;
  signal?: AbortSignal;
}): Promise<RasterStatistics> {
  const { cogUrl, low = 2, high = 98, signal } = params;
  const cacheKey = `${cogUrl}::${low}::${high}`;

  const cached = statisticsResultCache.get(cacheKey);
  if (cached) return cached;
  const pending = statisticsPendingRequests.get(cacheKey);
  if (pending) return pending;

  const requestPromise = (async () => {
    const qs = new URLSearchParams({ url: cogUrl, low: String(low), high: String(high) });
    const res = await fetch(`${RASTER_STATISTICS_URL}?${qs.toString()}`, { signal });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || `Raster statistics failed (${res.status}).`);
    }
    return res.json() as Promise<RasterStatistics>;
  })();

  statisticsPendingRequests.set(cacheKey, requestPromise);
  try {
    const result = await requestPromise;
    statisticsResultCache.set(cacheKey, result);
    return result;
  } finally {
    statisticsPendingRequests.delete(cacheKey);
  }
}

// ── كل الخطوات مع بعض: decode → statistics → رابط heatmap ملوّن بدقة ───────
// دي الدالة اللي المفروض الواجهة تنادها مباشرة بدل ما تكرر الـ 3 خطوات كل مرة.
// لو جبت statistics فشلت لأي سبب (مثلاً الملف لسه بيتحمّل/timeout)، بنكمل من
// غير min/max ونسيب route.ts يستخدم الـ default بتاعه (أحسن من ما نوقف الـ
// preview كله بسبب فشل في خطوة "تحسين" مش أساسية).
export async function decodeAndBuildHeatmapUrl(params: {
  token?: string;
  source: SentinelDecodeSource;
  itemId: string;
  variable: SentinelDecodeVariable;
  /** شوفي الكومنت على نفس البارام في decodeSentinelDataset — ضروري لـ Sentinel-3 */
  collection?: string;
  bbox: [number, number, number, number];
  /** استخدمي p2/p98 (الافتراضي) بدل min/max الخام لتباين أوضح مع تجاهل القيم الشاذة */
  usePercentileStretch?: boolean;
  // ⚠️ (2026-08-22) progressive rendering: الـ decode step (فك NetCDF جوّه
  // الباك) هو أغلب وقت الانتظار (2-3 دقايق)، والـ statistics step بعده
  // بياخد وقت إضافي فوق كده. من غير الكولباك ده، الواجهة كانت مضطرة تستنى
  // الاتنين مع بعض قبل ما تعرض أي حاجة خالص. دلوقتي: لو الـ caller مرّر
  // onDecoded، بننادّيه فورًا بمجرد ما الـ decode يخلص (برابط default
  // rescale، من غير ما نستنى الـ statistics)، عشان الصورة تتعرض على طول —
  // وبعدين لما الـ statistics توصل، بنرجّع النتيجة النهائية (بالتلوين
  // الدقيق) من الـ Promise العادي زي ما هو، والـ caller يحدّث الصورة تاني.
  // لو مفيش onDecoded، السلوك زي ما هو بالظبط (تستني الاتنين مع بعض).
  onDecoded?: (preview: { tileUrl: string; cogUrl: string }) => void;
  signal?: AbortSignal;
}): Promise<{ tileUrl: string; cogUrl: string; stats: RasterStatistics | null }> {
  const { token, source, itemId, variable, collection, bbox, usePercentileStretch = true, onDecoded, signal } = params;

  const { url: cogUrl } = await decodeSentinelDataset({ token, source, itemId, variable, collection, bbox, signal });

  if (onDecoded) {
    // 👇 default rescale (من غير min/max) — route.ts هيستخدم الـ default
    // بتاعه لحد ما نرجّع نستدعيها تاني بالقيم الدقيقة تحت. مش مثالي لونيًا
    // بس بيوري المستخدم إن فيه صورة جاية بدل ما يفضل يستني شاشة فاضية.
    onDecoded({ tileUrl: buildRasterProxyAnalyzeUrl({ cogUrl, variable, bbox }), cogUrl });
  }

  let stats: RasterStatistics | null = null;
  try {
    stats = await getRasterStatistics({ cogUrl, signal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // ⚠️ لو الرسالة دي بالظبط ("no valid ... pixel...") مش مجرد فشل شبكة/
    // timeout عادي — فده معناه إن الـ crop بتاع الـ scene ده على الـ AOI
    // طلع nodata بالكامل. ده الأعراض بالظبط بتاعة known issue #2 فوق
    // (FRP narrow-swath): الـ scene's bbox بيتقاطع مع AOI (عشان
    // كده STAC رجّعتها أصلًا)، لكن المسار الفعلي الضيّق (swath) للبيانات
    // مبيعديش فوق المنطقة بالظبط. لو سبنا previewUrl يتبني عادي هنا (زي ما
    // كان بيحصل قبل كده)، هيرجع صورة شفافة تمامًا من raster-proxy/analyze
    // من غير أي خطأ يوضح للمستخدم السبب — فبنرمي هنا بدل ما نكمل بصمت.
    if (/no valid.*pixel/i.test(message)) {
      // 👇 لو الرسالة دي طلعت غلط في رأيك (يعني شكلك شايف إن الباك بيرجّع
      // بيانات صح للـ scene ده)، اختبري بالظبط نفس الـ cogUrl اللي اتطبع
      // هنا مباشرة على /api/raster-proxy/statistics (مش على /gis/sentinel5p/
      // decode) — الاتنين مختلفين: decode بيرجع لينك للـ GeoTIFF بنجاح
      // (success:true) حتى لو الملف ده كله nodata فعليًا لما تتقري بيكسلاته،
      // فـ "الباك رجع نتيجة" مش دليل كافي على إن البيكسلات نفسها صالحة —
      // لازم تتأكدي من نفس الرابط ده تحديدًا.
      console.warn("[sentinelDecode] statistics reported zero valid pixels for →", cogUrl);
      throw new SentinelDecodeError(
        "No valid pixel data in this scene for the selected area — the satellite's narrow data track likely didn't pass directly over this AOI. Try a different scene or location.",
        { isNoDataForArea: true }
      );
    }
    // console.warn هنا (مش console.error) لأن ده fallback سليم فعلًا (خطأ
    // مؤقت/شبكة في جيب الإحصائيات بس، مش دليل على إن الـ scene مفيهوش بيانات).
    console.warn("[sentinelDecode] statistics fetch failed — falling back to default rescale:", err);
  }

  // ⚠️ تغطية شبه معدومة (مش صفر بالظبط، بس عدد بيكسلات صالحة تافه جدًا نسبة
  // لمساحة الصورة كلها) — زي مثلًا 2 بيكسل بس من 59700 (narrow-swath زي
  // FRP بالكاد لمس ركن صغير جدًا من الـ AOI). تقنيًا فيه بيانات
  // "صالحة"، بس لو بنيناها heatmap عادي هتبان نقطة/نقطتين معزولتين على
  // مساحة شاسعة — يعني بصريًا زي ما مفيش حاجة خالص، من غير ما نوضح للمستخدم
  // إن ده تغطية حقيقية ضعيفة جدًا مش خطأ. بنعامل الحالة دي زي "no data"
  // برضو عشان تظهر نفس الرسالة الودّية بدل overlay شبه فاضي بصمت.
  const MIN_COVERAGE_FRACTION = 0.005; // 0.5% من مساحة الصورة كحد أدنى
  if (stats) {
    const totalPixels = stats.width * stats.height;
    const coverageFraction = totalPixels > 0 ? stats.validPixels / totalPixels : 0;
    if (coverageFraction < MIN_COVERAGE_FRACTION) {
      console.warn(
        "[sentinelDecode] coverage too sparse to render meaningfully →",
        { cogUrl, validPixels: stats.validPixels, totalPixels, coverageFraction }
      );
      throw new SentinelDecodeError(
        `Only ${stats.validPixels} of ${totalPixels} pixels have data in this area — the satellite's narrow data track barely clips this AOI. Try a different scene or a location closer to the track's center.`,
        { isNoDataForArea: true }
      );
    }
  }

  const tileUrl = buildRasterProxyAnalyzeUrl({
    cogUrl,
    variable,
    bbox,
    min: stats ? (usePercentileStretch ? stats.p2 : stats.min) : undefined,
    max: stats ? (usePercentileStretch ? stats.p98 : stats.max) : undefined,
  });

  return { tileUrl, cogUrl, stats };
}