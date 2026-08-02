export type SatelliteViewerMode = "multispectral" | "analysis" | "download";
export type SatelliteAnalysisType =
  | "RGB"
  | "NDVI"
  | "NDWI"
  | "NDMI"
  | "NDBI"
  | "SAVI"
  | "EVI"
  | "BSI"
  // Sentinel-1 (Radar / SAR)
  | "VV"
  | "VH"
  | "RATIO"
  | "SAR_RGB"
  | "FLOOD"
  | "CHANGE"
  // Copernicus DEM
  | "ELEVATION"
  | "SLOPE"
  | "HILLSHADE"
  | "ASPECT"
  | "CONTOURS"
  // Sentinel-5P (Atmosphere)
  | "NO2"
  | "SO2"
  | "CO"
  | "OZONE"
  // MODIS (fire + LST)
  | "FIRE"
  | "LST"
  // ASTER-only
  | "MINERALS"
  | "THERMAL"
  // Sentinel-3 (OLCI / SLSTR / SYNERGY)
  | "SST"
  | "S3_LST"
  | "OCEAN_COLOR"
  | "CHLOROPHYLL"
  | "FRP"
  | "AEROSOL";

// ─── Satellite Sources ────────────────────────────────────────────────────────
// كل مصدر قمر صناعي له الـ indices الخاصة بيه بس (SOURCE_INDICES) — ده اللي
// بيخلي الـ band dropdown في SatelliteDataPanel يعرض RGB/NDVI... لسنتينل-2 وLandsat
// بس، ويعرض VV/VH/Flood/Change لسنتينل-1 وهكذا، بدل ما يعرض كل حاجة مع الكل.
// ⚠️ VIIRS اتشالت بالكامل (كانت هنا "sentinel-1" | ... | "viirs" | "aster").
// اتأكدنا (2026-08-01) بالفحص المباشر لـ /api/stac/v1/collections بتاع
// Planetary Computer إن مفيش ولا collection واحد اسمه فيه "viirs" — مش مشكلة
// اسم غلط، الداتا دي مش موجودة على المصدر ده أصلًا. لو حد احتاجها تاني لازم
// مصدر مختلف تمامًا (زي NASA LAADS/Earthdata) مش نفس pipeline الـ STAC/TiTiler ده.
export type SatSource = "sentinel-2" | "landsat" | "sentinel-1" | "cop-dem" | "sentinel-5p" | "modis" | "aster" | "sentinel-3";

export const SOURCE_INDICES: Record<SatSource, SatelliteAnalysisType[]> = {
  "sentinel-2": ["RGB", "NDVI", "NDWI", "NDMI", "NDBI", "SAVI", "EVI", "BSI"],
  "landsat":    ["RGB", "NDVI", "NDWI", "NDMI", "NDBI", "SAVI", "EVI", "BSI"],
  "sentinel-1": ["VV", "VH", "RATIO", "SAR_RGB", "FLOOD", "CHANGE"],
  "cop-dem":    ["ELEVATION", "SLOPE", "HILLSHADE", "ASPECT", "CONTOURS"],
  "sentinel-5p": ["NO2", "SO2", "CO", "OZONE"],
  // ⚠️ المصادر دي بتتعمل عن طريق TiTiler مباشرة (STAC Search -> asset
  // URLs -> TiTiler tiles)، مش عن طريق /api/raster-proxy/analyze زي الباقي.
  // شوفي TITILER_STYLES و buildTitilerTileUrl() تحت.
  // ⚠️ collection IDs اتأكدت فعليًا (2026-08-01) بفحص مباشر لكتالوج Planetary
  // Computer: modis-13A1-061 (NDVI/EVI), modis-14A1-061 (FIRE), modis-11A1-061
  // (LST) كلهم موجودين ومظبوطين زي ما هما.
  "modis":  ["NDVI", "EVI", "FIRE", "LST"],
  // ⚠️ ELEVATION اتشالت من هنا: aster-l1t (الـ collection الوحيد بتاع ASTER
  // الموجود فعليًا على PC) مفهوش asset اسمه DEM — ده منتج مختلف (ASTER GDEM)
  // ومش موجود على PC خالص. لو محتاجة elevation استخدمي مصدر Cop-DEM المنفصل
  // (شغال أصلًا 100%) بدل ما تحاولي تجيبها من ASTER.
  "aster":  ["RGB", "MINERALS", "THERMAL"],
  // Sentinel-3: زي MODIS، كل تحليل هنا (SST/Land LST/Ocean Color/Chlorophyll/
  // FRP/Aerosol) جاي من STAC collection مختلف تمامًا على Planetary Computer
  // (مش نفس الـ collection زي Sentinel-2). شوفي SOURCE_ANALYSIS_COLLECTIONS تحت.
  "sentinel-3": ["SST", "S3_LST", "OCEAN_COLOR", "CHLOROPHYLL", "FRP", "AEROSOL"],
};

// ⚠️ الـ collection IDs دي أسماء الـ STAC collections على Planetary Computer.
// sentinel-1-grd و cop-dem-glo-30 و sentinel-5p-l2-netcdf لازم يترفدوا بردهم
// لما توصلي الـ route بتاع الباك، ده مبدئي عشان يشتغل نفس منطق fetchScenes
// الموجود حاليًا لـ sentinel-2/landsat.
export const SOURCE_COLLECTIONS: Record<SatSource, string> = {
  "sentinel-2": "sentinel-2-l2a",
  "landsat": "landsat-c2-l2",
  "sentinel-1": "sentinel-1-grd",
  "cop-dem": "cop-dem-glo-30",
  "sentinel-5p": "sentinel-5p-l2-netcdf",
  // ⚠️ دول Defaults بس (بيتستخدموا لو مفيش analysis محدد بعد، زي أول تحميل
  // للـ SOURCE_META). الـ collection الحقيقي اللي بيتبعت لـ STAC Search بييجي
  // من SOURCE_ANALYSIS_COLLECTIONS تحت — لإن MODIS كل analysis فيه
  // (Vegetation/Fire/Temperature.. إلخ) عبارة عن collection مختلف تمامًا على
  // Planetary Computer، مش نفس الـ collection زي Sentinel-2/Landsat.
  "modis": "modis-13A1-061",
  // ⚠️ aster-l1t اتأكد إنه موجود فعليًا على PC (2026-08-01، فحص مباشر للكتالوج).
  "aster": "aster-l1t",
  // ⚠️ ده Default بس (زي MODIS بالظبط) — بيتستخدم أول ما تفتحي SOURCE_META
  // قبل ما تختاري تحليل معيّن. الـ collection الحقيقي اللي بيتبعت لـ STAC
  // Search بييجي من SOURCE_ANALYSIS_COLLECTIONS تحت، لإن SST مختلف تمامًا عن
  // Land LST ومختلف عن Ocean Color... إلخ (5 collections منفصلين فعليًا).
  // sentinel-3-slstr-wst-l2-netcdf اتأكد وجوده على PC (2026-08-01، فحص مباشر
  // لصفحة الـ dataset + STAC collection endpoint).
  "sentinel-3": "sentinel-3-slstr-wst-l2-netcdf",
};

// ⚠️ خريطة إضافية: لكل analysis على MODIS، الـ STAC collection الحقيقي
// اللي المفروض نبحث فيه (مختلف عن بعضه، على عكس Sentinel-2 اللي كل الـ
// indices بتاعته من نفس الـ collection). fetchScenes() في الفرونت لازم
// يستخدم الخريطة دي بدل SOURCE_COLLECTIONS[source] المباشرة للمصادر دي.
export const SOURCE_ANALYSIS_COLLECTIONS: Partial<
  Record<SatSource, Partial<Record<SatelliteAnalysisType, string>>>
> = {
  modis: {
    NDVI: "modis-13A1-061", // MODIS Vegetation Indices 16-Day (500m) — 500m_16_days_NDVI
    EVI:  "modis-13A1-061", // نفس الـ collection — 500m_16_days_EVI
    FIRE: "modis-14A1-061", // MODIS Thermal Anomalies/Fire Daily — asset "FireMask"
    LST:  "modis-11A1-061", // MODIS LST/Emissivity Daily 1km — LST_Day_1km / LST_Night_1km
  },
  aster: {
    RGB:       "aster-l1t",
    MINERALS:  "aster-l1t",
    THERMAL:   "aster-l1t",
  },
  // ⚠️ الـ collection IDs الخمسة دول اتأكدوا (2026-08-01) عن طريق فحص صفحات
  // الـ dataset بتاعتهم على Planetary Computer + STAC collection endpoint بتاع
  // كل واحد فيهم. لكن ده مصادر NetCDF (مش COG بسيطة زي MODIS/ASTER) — كل
  // item فيه ملف NetCDF واحد بمتغيرات (variables) جوّاه، مش أصول (assets)
  // منفصلة لكل باند. ده معناه إن buildTitilerTileUrl تحت ممكن يحتاج فعليًا
  // query param اسمه "variable=" بدل "assets=" (TiTiler-xarray) عشان يعرض
  // الصورة صح — لازم نتأكد من ده بفحص مباشر لـ /tilejson.json بتاع أول scene
  // حقيقي قبل ما نعتبر الـ preview شغالة 100%.
  "sentinel-3": {
    SST:          "sentinel-3-slstr-wst-l2-netcdf",     // SLSTR Water Surface (Sea) Temperature
    S3_LST:       "sentinel-3-slstr-lst-l2-netcdf",     // SLSTR Land Surface Temperature
    OCEAN_COLOR:  "sentinel-3-olci-wfr-l2-netcdf",       // OLCI Water Full Resolution (ocean color / reflectance)
    CHLOROPHYLL:  "sentinel-3-olci-wfr-l2-netcdf",       // نفس الـ collection — بس متغير الكلوروفيل (chl_nn/chl_oc4me)
    FRP:          "sentinel-3-slstr-frp-l2-netcdf",     // SLSTR Fire Radiative Power
    AEROSOL:      "sentinel-3-synergy-aod-l2-netcdf",   // SYNERGY Global Aerosol Optical Depth
  },
};

export const SOURCE_META: Record<SatSource, {
  title: string; subtitle: string; resolution: string; cadence: string; color: string;
}> = {
  "sentinel-2": { title: "Sentinel-2", subtitle: "Primary source", resolution: "10m", cadence: "5 days", color: "#22d3ee" },
  "landsat":    { title: "Landsat", subtitle: "Secondary source", resolution: "30m", cadence: "16 days", color: "#f59e0b" },
  "sentinel-1": { title: "Sentinel-1", subtitle: "Radar (SAR)", resolution: "10m", cadence: "6 days", color: "#a78bfa" },
  "cop-dem":    { title: "Copernicus DEM", subtitle: "Elevation model", resolution: "30m", cadence: "static", color: "#94a3b8" },
  "sentinel-5p": { title: "Sentinel-5P", subtitle: "Atmosphere", resolution: "~7km", cadence: "daily", color: "#f472b6" },
  "modis":  { title: "MODIS", subtitle: "Vegetation / Fire / Temperature", resolution: "250m-1km", cadence: "daily-16 days", color: "#84cc16" },
  "aster":  { title: "ASTER", subtitle: "RGB / Minerals / Thermal", resolution: "15m-90m", cadence: "on-demand", color: "#fb7185" },
  "sentinel-3": { title: "Sentinel-3", subtitle: "Ocean / Land / Atmosphere", resolution: "300m-1km", cadence: "~daily", color: "#2dd4bf" },
};

// ─── TiTiler direct pipeline (MODIS / ASTER) ──────────────────────────
// عكس باقي المصادر (اللي بتعدي على /api/raster-proxy/analyze بتاعنا)، المصادر
// دي بتتعرض عن طريق STAC Search عادي -> نجيب asset URLs من الـ item -> نبني
// tile URL بيكلم TiTiler بتاع Planetary Computer (Data API) مباشرة، فالخريطة
// بتحمل XYZ tiles جاهزة (Leaflet L.tileLayer) بدل ما تستنى صورة PNG واحدة من
// الباك. ده أخف وأسرع للمصادر دي لإنها كتير ومعندهاش custom index logic زي
// Sentinel-1 GCPs.
export type TitilerStyle = {
  assets: string[];
  expression?: string;
  rescale: string;           // "min,max"
  colormapName?: string;     // titiler colormap_name (matplotlib/rio-tiler names)
  colorFormula?: string;     // rio-color formula، بديل لو مفيش colormap مناسب
  variable?: string;         // NetCDF variable name (xarray tiler) — لازم لـ SST/AEROSOL
  bidx?: number | number[];  // band index (1-based) — لازم لو الـ asset راجع بيه أكتر من band وTiTiler مش عارف يفهم لوحده أي واحد يعرض (زي MODIS FireMask). Array = كذا bidx= param (RGB composite من ملف multi-band واحد، زي ASTER VNIR).
  dynamicRescale?: boolean;  // true = متجيبش rescale ثابت من هنا، دي بس fallback. نجيب الـ min/max الحقيقي من TiTiler /item/statistics على نفس الـ scene وقت العرض (شوفي fetchDynamicRescale تحت). لازم للمصادر اللي قيمها raw DN مش معايرة (زي ASTER TIR/SWIR).
};

export const TITILER_STYLES: Partial<Record<SatelliteAnalysisType, TitilerStyle>> = {
  // MODIS Vegetation Indices 16-Day (500m) — القيم أصلاً NDVI/EVI جاهزة
  // ومضروبة *10000 في الملف الخام، فبنعمل rescale على أساس كده.
  NDVI: { assets: ["500m_16_days_NDVI"], rescale: "-2000,10000", colormapName: "rdylgn" },
  EVI:  { assets: ["500m_16_days_EVI"],  rescale: "-2000,10000", colormapName: "plasma" },
  // MODIS Fire — FireMask band: قيم confidence مبنية على categories (0-9)
  // ⚠️ FireMask بيرجع "Source data must be 1 band" من غير bidx — الأصل (asset)
  // فيه أكتر من band جوّه، وbidx=1 بيحدد للتيلر يقرا بس الباند الأول (فئة
  // الحريق نفسها). لو اتغيّر واتأكدنا إن الترقيم مختلف، غيّري الرقم هنا بس.
  FIRE: { assets: ["FireMask"], bidx: 1, rescale: "0,9", colormapName: "hot" },
  // MODIS LST — كلفن * 50 (scale factor 0.02) في الملف الخام. rescale ضُيّق
  // من المدى الكامل (260-330K) لمدى أكتر واقعية ليوم/منطقة واحدة (285-325K)
  // عشان فروق درجة الحرارة الصغيرة جوه AOI واحد تبان في الألوان بدل ما تضيع
  // في مدى واسع أوي كان بيخلي كل حاجة تبان لون شبه ثابت. لو منطقتك بارد جدًا
  // (شتاء/جبال) هتحتاجي تنزلي الرقم الأول لحد 250 مثلًا.
  LST:  { assets: ["LST_Day_1km"], rescale: "14250,16250", colormapName: "inferno" },
  // ⚠️ ASTER L1T (aster-l1t) اتصلحت (2026-08-02) — الـ item_assets الحقيقية
  // بتاعت الـ collection ده اتفحصت مباشرة، ومفيش asset لكل band لوحده خالص
  // (زي B01/B02/B03 اللي كانت متحطوطة هنا غلط، منسوخة من عادة Landsat/
  // Sentinel-2). الـ bands كلها متجمّعة جوه 3 composite files بس:
  //   • VNIR → 3 bands (Band1 أخضر=idx1، Band2 أحمر=idx2، Band3N NIR=idx3)
  //   • SWIR → 6 bands (Band4=idx1 ... Band9=idx6)
  //   • TIR  → 5 bands (Band10=idx1 ... Band14=idx5)
  // فأي scene حقيقي كان بيفشل على "does not include required asset(s):
  // B01, B02, B03" لإن الـ asset ده معندوش وجود من الأساس.
  // RGB composite = عرض مباشر لـ VNIR bands 1،2،3 (idx 1,2,3) كـ 3 bidx
  // منفصلين على نفس الـ asset الواحد (multi-band file، مش 3 files منفصلة).
  RGB: { assets: ["VNIR"], bidx: [1, 2, 3], rescale: "0,255" },
  // MINERALS composite (كان B04/B06;B08/B06;B04/B08) = نفس النسب لكن جوه
  // ملف SWIR الواحد: Band4=idx1, Band6=idx3, Band8=idx5. رio-tiler بيقرأ
  // بانداته المتعددة في expression بصيغة "{asset}_b{index}".
  // ⚠️ rescale "0,4" هنا كان تخمين — الفيديو الحقيقي بيّن إن النسب الفعلية
  // بتقع في range تاني تمامًا فكل حاجة كانت بتتقص للون واحد. dynamicRescale
  // بيجيب الـ range الحقيقي وقت العرض بدل التخمين الثابت.
  MINERALS: { assets: ["SWIR"], expression: "SWIR_b1/SWIR_b3;SWIR_b5/SWIR_b3;SWIR_b1/SWIR_b5", rescale: "0,4", dynamicRescale: true },
  // THERMAL (كان B10) = TIR band10 اللي هو idx1 جوه ملف TIR.
  // ⚠️ TIR asset دي raw Digital Numbers (uint16) مش Brightness Temperature
  // بالكلفن زي MODIS LST — رقم "200,330" هنا كان افتراض غلط فيزيائيًا (قيم
  // DN الحقيقية أصغر بكتير)، فكل البيكسلات كانت بتتقص عند نفس الطرف وتطلع
  // لون ثابت في كل الصورة. dynamicRescale بيحل المشكلة دي بجلب الـ range
  // الحقيقي من الـ scene نفسها، لكن ده contrast stretch بصري بس — مش
  // brightness temperature معاير فعليًا (ده محتاج معايرة radiometric كاملة
  // بمعادلة Planck لو عايزاها درجة حرارة حقيقية بالكلفن).
  THERMAL:  { assets: ["TIR"], bidx: 1, rescale: "200,330", colormapName: "magma", dynamicRescale: true },

  // ── Sentinel-3 ──────────────────────────────────────────────────────────
  // ⚠️ الأسطر دي اتصلحت بعد فحص مباشر (2026-08-01) لـ item_assets الحقيقية
  // بتاعة الـ 4 collections دول عن طريق GET على /api/stac/v1/collections/<id>
  // (مش تخمين زي أول مرة). اللي اكتشفناه:
  //   • WST (SST) و AOD (Aerosol): كل الـ variables متجمّعة في ملف NetCDF
  //     واحد بس لكل item (asset key واحد: "l2p" أو "ntc-aod")، فمحتاجين
  //     "variable=" كمان جنب "assets=" عشان نحدد أي متغير جوه الملف نعرضه.
  //   • LST (lst-in) وFRP (frp-in) وOLCI WFR (oa0X-reflectance / chl-nn):
  //     كل واحد فيهم ملف NetCDF منفصل خاص بيه (زي MODIS تقريبًا)، فمش
  //     محتاجين "variable=" غالبًا لإن الملف الواحد بيحتوي متغير القياس
  //     الأساسي بس (لسه محتاج تأكيد نهائي بفحص /tilejson.json فعلي).
  // أسماء الـ variables (sea_surface_temperature, LST, FRP_MWIR, AOD_0550)
  // جايه من الـ product spec الرسمي (GHRSST/SLSTR/SYNERGY User Guides) —
  // دي أضعف نقطة لسه محتاجة تأكيد مباشر، على عكس أسماء الـ assets فوق.
  SST: {
    assets: ["l2p"],
    variable: "sea_surface_temperature",
    rescale: "271,305",
    colormapName: "turbo",
  },
  S3_LST: {
    assets: ["lst-in"],
    variable: "LST",
    rescale: "250,330",
    colormapName: "turbo",
  },
  OCEAN_COLOR: {
    // تركيبة true-color من قنوات OLCI المنفصلة فعليًا كـ assets (أحمر Oa08≈665nm/
    // أخضر Oa06≈560nm/أزرق Oa04≈490nm)، بدل تخمين إنهم جوه ملف واحد.
    assets: ["oa08-reflectance", "oa06-reflectance", "oa04-reflectance"],
    rescale: "0,0.3",
  },
  CHLOROPHYLL: {
    // ملف NetCDF منفصل خاص بالكلوروفيل (Neural-Net algorithm).
    assets: ["chl-nn"],
    variable: "CHL_NN",
    rescale: "0,10",
    colormapName: "turbo",
  },
  FRP: {
    assets: ["frp-in"],
    variable: "FRP_MWIR",
    rescale: "0,100",
    colormapName: "hot",
  },
  AEROSOL: {
    assets: ["ntc-aod"],
    variable: "AOD_0550",
    rescale: "0,1.5",
    colormapName: "turbo",
  },
};

/**
 * بعض المصادر (زي ASTER TIR raw DN، وband ratios بتاعت MINERALS) قيمها
 * الحقيقية بعيدة عن أي rescale ثابت نقدر نخمنه مقدمًا (على عكس MODIS LST
 * اللي جاي معاير بالفعل بالكلفن*50). بدل ما نفضل نخمن رقم وممكن يغلط لكل
 * scene، بنجيب statistics حقيقية لنفس الـ item/asset من TiTiler
 * (/item/statistics — نفس base بتاع /item/tiles و /item/bbox فوق) ونبني
 * rescale من percentile_2 -> percentile_98 (contrast stretch بيقص القيم
 * الشاذة الجدًا من غير ما نحتاج نعرف الوحدة الفيزيائية للبيانات مقدمًا).
 *
 * ⚠️ ده بس تحسين بصري (visual stretch) — مش معايرة radiometric حقيقية.
 * لو النتيجة برضه طلعت لون شبه ثابت بعد كده، يبقى المشكلة مكان تاني
 * (زي nodata/masking كامل على الـ AOI ده في الـ scene المختارة).
 *
 * بنعمل cache بالـ scene+style key عشان buildTitilerTileUrl و
 * buildTitilerBboxUrl (اللي بينادوا مع بعض على نفس الـ scene) ميعملوش
 * نفس طلب الـ statistics مرتين.
 */
const rescaleStatsCache = new Map<string, Promise<string | null>>();

async function fetchDynamicRescale(
  collection: string,
  itemId: string,
  style: TitilerStyle
): Promise<string | null> {
  const cacheKey = `${collection}|${itemId}|${style.assets.join(",")}|${style.expression ?? ""}|${style.bidx ?? ""}`;
  if (rescaleStatsCache.has(cacheKey)) return rescaleStatsCache.get(cacheKey)!;

  const promise = (async () => {
    try {
      const params = new URLSearchParams();
      params.set("collection", collection);
      params.set("item", itemId);
      params.set("assets", style.assets.join(","));
      if (style.expression) params.set("expression", style.expression);
      if (Array.isArray(style.bidx)) {
        style.bidx.forEach((b) => params.append("bidx", String(b)));
      } else if (style.bidx) {
        params.set("bidx", String(style.bidx));
      }

      const res = await fetch(
        `https://planetarycomputer.microsoft.com/api/data/v1/item/statistics?${params.toString()}`
      );
      if (!res.ok) return null;
      const stats = await res.json();

      // شكل الرد بيختلف شوية حسب TiTiler version، فبندور جوه أي مفتاح
      // فيه percentile_2/percentile_98 (أو min/max لو الـ percentiles مش
      // موجودة)، وناخد أوسع range يغطي كل الـ bands/channels المطلوبة.
      let lo = Infinity;
      let hi = -Infinity;
      Object.values(stats ?? {}).forEach((band: any) => {
        const bandLo = band?.percentile_2 ?? band?.min;
        const bandHi = band?.percentile_98 ?? band?.max;
        if (typeof bandLo === "number") lo = Math.min(lo, bandLo);
        if (typeof bandHi === "number") hi = Math.max(hi, bandHi);
      });

      if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) return null;
      return `${lo},${hi}`;
    } catch (_) {
      // فشل الطلب (شبكة/endpoint مش موجود بنفس الاسم) — بنرجع null هنا
      // والـ caller هيقع على الـ rescale الثابت في TITILER_STYLES كـ fallback.
      return null;
    }
  })();

  rescaleStatsCache.set(cacheKey, promise);
  return promise;
}

/**
 * بيبني tile URL template (بصيغة {z}/{x}/{y}) بيكلم TiTiler بتاع Planetary
 * Computer Data API مباشرة (نفس الـ endpoint اللي الباك بيستخدمه لـ crop في
 * Sentinel-1، بس هنا للـ tiles). محتاجة الـ collection + item id بتوع الـ
 * STAC feature المختار + الـ analysis عشان تجيب الـ style الصح.
 *
 * ⚠️ الرابط ده بيتحط في scenePreview.tileUrl (مش previewUrl) عشان الخريطة
 * تستخدم L.tileLayer بدل L.imageOverlay. لازم تتأكدي إن LeafletMap.tsx/
 * MapClient.tsx بيتشيك على tileUrl ويعمل tileLayer بيه لو موجود.
 *
 * ⚠️ بقت async دلوقتي (كانت sync) عشان styles اللي عندها dynamicRescale
 * لازم تستنى رد /item/statistics الأول. لازم تعدّلي أي مكان بينادي عليها
 * يستخدم await/​.then() بدل ما يفترضها بترجع string مباشرة.
 */
export async function buildTitilerTileUrl(
  collection: string,
  itemId: string,
  analysis: SatelliteAnalysisType
): Promise<string | null> {
  const style = TITILER_STYLES[analysis];
  if (!style) return null;

  const params = new URLSearchParams();
  params.set("collection", collection);
  params.set("item", itemId);
  params.set("assets", style.assets.join(","));
  if (style.expression) params.set("expression", style.expression);
  // ⚠️ لازم بس للـ Sentinel-3 collections اللي بتجمع كذا متغير في NetCDF واحد
  // (SST/Aerosol). لو الـ tiler بتاع PC مش بيقبل "variable=" بنفس الاسم ده،
  // ده أول باراميتر تتأكدي منه لو الصورة رجعت فاضية/خطأ.
  if (style.variable) params.set("variable", style.variable);
  // ⚠️ bidx ممكن يبقى array دلوقتي (زي ASTER RGB: VNIR asset واحد فيه 3
  // bands). لازم نبعتها كـ 3 query params منفصلين (bidx=1&bidx=2&bidx=3)،
  // مش قيمة واحدة "1,2,3"، عشان TiTiler يفهمها كـ RGB composite صح —
  // params.set() بيمسح أي قيمة قبلها فبنستخدم append هنا بدلها.
  if (Array.isArray(style.bidx)) {
    style.bidx.forEach((b) => params.append("bidx", String(b)));
  } else if (style.bidx) {
    params.set("bidx", String(style.bidx));
  }
  const rescale = style.dynamicRescale
    ? (await fetchDynamicRescale(collection, itemId, style)) ?? style.rescale
    : style.rescale;
  params.set("rescale", rescale);
  if (style.colormapName) params.set("colormap_name", style.colormapName);
  if (style.colorFormula) params.set("color_formula", style.colorFormula);
  params.set("format", "png");

  return `https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@2x.png?${params.toString()}`;
}

/**
 * بديل buildTitilerTileUrl لكن بيرجع رابط صورة واحدة مقصوصة بالظبط على الـ
 * bbox المطلوب (مش XYZ tiles) — عن طريق نفس crop/bbox endpoint بتاع
 * Planetary Computer Data API المستخدم فعلًا لـ Sentinel-1 في route.ts
 * (sentinel1CropUrl). ده بيحل مشكلة إن التحليل كان بيغطي مساحة أكبر من الـ
 * AOI كل ما نزوم أوت (لإن tile endpoint مبني على شبكة XYZ عالمية مش على
 * حدود الـ AOI). النتيجة هنا لازم تتحط في scenePreview.previewUrl (مش
 * tileUrl) عشان LeafletMap تستخدم L.imageOverlay بحدود الـ AOI بالظبط.
 * ⚠️ بقت async دلوقتي (كانت sync) عشان styles اللي عندها dynamicRescale
 * لازم تستنى رد /item/statistics الأول. لازم تعدّلي أي مكان بينادي عليها
 * يستخدم await/​.then() بدل ما يفترضها بترجع string مباشرة.
 */
export async function buildTitilerBboxUrl(
  collection: string,
  itemId: string,
  analysis: SatelliteAnalysisType,
  bbox: [number, number, number, number] // [west, south, east, north] WGS84
): Promise<string | null> {
  const style = TITILER_STYLES[analysis];
  if (!style) return null;

  const [w, s, e, n] = bbox;
  const params = new URLSearchParams();
  params.set("collection", collection);
  params.set("item", itemId);
  params.set("assets", style.assets.join(","));
  if (style.expression) params.set("expression", style.expression);
  if (style.variable) params.set("variable", style.variable);
  // ⚠️ نفس ملاحظة buildTitilerTileUrl فوق: bidx array (ASTER RGB) لازم
  // append مش set، عشان يطلع bidx=1&bidx=2&bidx=3 مش قيمة واحدة مجمّعة.
  if (Array.isArray(style.bidx)) {
    style.bidx.forEach((b) => params.append("bidx", String(b)));
  } else if (style.bidx) {
    params.set("bidx", String(style.bidx));
  }
  // ⚠️ نفس منطق buildTitilerTileUrl: لو dynamicRescale مفعّل، بنستنى
  // /item/statistics ونستخدم الرينج الحقيقي بدل الرقم الثابت. الـ cache
  // في fetchDynamicRescale بيمنع طلب مكرر لو buildTitilerTileUrl سبق
  // ونادى على نفس الـ scene+style قبل كده.
  const rescale = style.dynamicRescale
    ? (await fetchDynamicRescale(collection, itemId, style)) ?? style.rescale
    : style.rescale;
  params.set("rescale", rescale);
  if (style.colormapName) params.set("colormap_name", style.colormapName);
  if (style.colorFormula) params.set("color_formula", style.colorFormula);
  // ⚠️ من غير width/height، TiTiler بيرجع الصورة بأصغر حجم ممكن يمثّل
  // البيانات فعليًا — لو الـ AOI أصغر من (أو قريب من) بيكسل واحد أصلي (زي
  // MODIS 1km LST على مساحة ~1كم)، بترجع صورة 1×1 بيكسل، يعني عمليًا مفيش
  // حاجة تتعرض على الخريطة خالص. بنثبت حجم عرض معقول (512×512) عشان TiTiler
  // يعمل resample للبيانات على المساحة دي مهما كان حجم الـ AOI الجغرافي الحقيقي.
  params.set("width", "512");
  params.set("height", "512");
  params.set("format", "png");

  return `https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${w},${s},${e},${n}.png?${params.toString()}`;
}

export const SATELLITE_PIPELINES: Array<{
  key: SatelliteViewerMode;
  label: string;
  pipeline: string;
  desc: string;
}> = [
  {
    key: "multispectral",
    label: "Multispectral Viewer",
    pipeline: "STAC -> B02/B03/B04/B08 -> Composite -> Layers switch",
    desc: "Bands, false color, and NDVI.",
  },
  {
    key: "download",
    label: "Download System",
    pipeline: "Selected scene -> PNG/GeoJSON/SHP/GeoTIFF",
    desc: "Exports stay isolated.",
  },
];

export const SATELLITE_LEGENDS: Record<SatelliteAnalysisType, {
  label: string;
  gradient: string;
  min: string;
  mid: string;
  max: string;
  meaning?: string[];
}> = {
  RGB: {
    label: "True color reflectance",
    gradient: "linear-gradient(90deg,#0f172a,#64748b,#e2e8f0)",
    min: "shadow",
    mid: "mid tone",
    max: "bright",
  },
  NDVI: {
    label: "NDVI vegetation vigor",
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "-1",
    mid: "0",
    max: "+1",
  },
  NDWI: {
    label: "NDWI water signal",
    gradient: "linear-gradient(90deg,#67001f,#b2182b,#d6604d,#f4a582,#fddbc7,#d1e5f0,#4393c3,#2166ac,#053061)",
    min: "dry",
    mid: "mixed",
    max: "water",
  },
  NDMI: {
    label: "NDMI moisture",
    gradient: "linear-gradient(90deg,#ffffe5,#f7fcb9,#d9f0a3,#addd8e,#78c679,#41ab5d,#238443,#005a32)",
    min: "stress",
    mid: "normal",
    max: "wet",
  },
  NDBI: {
    label: "NDBI built-up / urban",
    gradient: "linear-gradient(90deg,#000004,#4a0c6b,#a52c60,#ed6925,#f7d13d,#fcffa4)",
    min: "vegetation/water",
    mid: "bare ground",
    max: "built-up",
  },
  SAVI: {
    label: "SAVI soil-adjusted vegetation",
    gradient: "linear-gradient(90deg,#9e0142,#f46d43,#fee08b,#abdda4,#3288bd,#5e4fa2)",
    min: "-1",
    mid: "0",
    max: "+1",
  },
  EVI: {
    label: "EVI enhanced vegetation",
    gradient: "linear-gradient(90deg,#2c0735,#c71585,#ff6347,#ffa500,#ffd700,#ffff66)",
    min: "sparse",
    mid: "moderate",
    max: "dense canopy",
  },
  BSI: {
    label: "BSI bare soil index",
    gradient: "linear-gradient(90deg,#b35806,#fdb863,#f7f7f7,#998ec3,#40004b)",
    min: "vegetated",
    mid: "mixed",
    max: "bare soil",
  },

  // ── Sentinel-1 (Radar) ──────────────────────────────────────────────────
  VV: {
    label: "VV backscatter (dB)",
    gradient: "linear-gradient(90deg,#08306b,#4393c3,#c6dbef,#f7f7f7,#fddbc7,#d6604d,#67001f)",
    min: "blue = low return",
    mid: "light = medium return",
    max: "red = high return",
    meaning: ["Blue: smooth surfaces and possible open water.", "Light tones: medium radar return from bare soil or mixed cover.", "Red: strong return from rough ground, dense structures, or urban fabric."],
  },
  VH: {
    label: "VH backscatter (dB)",
    gradient: "linear-gradient(90deg,#00441b,#238b45,#a1d99b,#f7f7f7,#fdae61,#d73027,#7f0000)",
    min: "green = low cross-pol.",
    mid: "light = medium cross-pol.",
    max: "red = high cross-pol.",
    meaning: ["Dark green: low cross-polarized radar response, often smooth or sparsely covered ground.", "Light tones: intermediate vegetation/roughness response.", "Orange-red: strong volume scattering, commonly dense vegetation or complex structures."],
  },
  FLOOD: {
    label: "Flood / surface water detection",
    gradient: "linear-gradient(90deg,#f7fbff,#c6dbef,#6baed6,#2171b5,#08306b)",
    min: "red = stronger return",
    mid: "light = intermediate",
    max: "blue = lower return",
    meaning: ["Blue indicates low VV return and is a water-likelihood signal, not a confirmed flood polygon.", "Light colours indicate intermediate radar response / possibly wet soil.", "Red indicates stronger radar return, usually rougher or drier surfaces."],
  },
  RATIO: {
    label: "VV/VH ratio (dB)",
    gradient: "linear-gradient(90deg,#9e0142,#f46d43,#fee08b,#e6f598,#66c2a5,#5e4fa2)",
    min: "low ratio = smooth/specular",
    mid: "mid ratio",
    max: "high ratio = rough/volume scatter",
    meaning: ["Low values: smooth, specular surfaces such as open water or paved roads.", "High values: rough or volume-scattering surfaces such as vegetation or dense urban fabric.", "Computed as 20·log10(VV) − 20·log10(VH), independent of either band's absolute brightness."],
  },
  SAR_RGB: {
    label: "SAR RGB composite (VV/VH/ratio)",
    gradient: "linear-gradient(90deg,#0f172a,#6b21a8,#db2777,#f97316,#facc15)",
    min: "dark",
    mid: "mixed",
    max: "bright",
    meaning: ["R = VV backscatter, G = VH backscatter, B = VV/VH ratio, all in dB.", "Water and smooth surfaces read dark; vegetation reads greenish; urban/built-up areas read brighter with a distinct hue from the ratio channel."],
  },
  CHANGE: {
    label: "Surface change (multi-date)",
    gradient: "linear-gradient(90deg,#a50026,#f46d43,#fee08b,#ffffbf,#d9ef8b,#66bd63,#006837)",
    min: "loss",
    mid: "no change",
    max: "gain",
    meaning: ["Requires a Before and an After scene. The single-scene preview is intentionally blocked.", "Use Change Detection to compare two dates before interpreting gain or loss."],
  },

  // ── Copernicus DEM ──────────────────────────────────────────────────────
  ELEVATION: {
    label: "Elevation",
    gradient: "linear-gradient(90deg,#1a9850,#a6d96a,#fee08b,#d73027,#7f0000,#ffffff)",
    min: "green = lower in this AOI",
    mid: "yellow = middle",
    max: "red/white = higher",
    meaning: ["Colors are stretched to the selected AOI so subtle local relief is visible.", "They express relative elevation inside the AOI; inspect the value/statistics for absolute metres."],
  },
  SLOPE: {
    label: "Slope steepness",
    gradient: "linear-gradient(90deg,#1a9850,#a6d96a,#ffffbf,#fdae61,#d73027)",
    min: "0° flat",
    mid: "~20°",
    max: "45°+ steep",
  },
  HILLSHADE: {
    label: "Hillshade relief",
    gradient: "linear-gradient(90deg,#000000,#404040,#808080,#c0c0c0,#ffffff)",
    min: "black = shadow",
    mid: "gray = intermediate",
    max: "white = sun-facing",
    meaning: ["Hillshade is illumination simulated from the DEM, not elevation itself.", "A flat AOI can legitimately appear nearly one gray tone because it has little slope."],
  },
  ASPECT: {
    label: "Slope aspect (direction)",
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#1a9850,#4393c3,#762a83,#d73027)",
    min: "N (0°)",
    mid: "E/S (90-180°)",
    max: "W (270°) / N (360°)",
  },
  CONTOURS: {
    label: "Elevation contour lines",
    gradient: "linear-gradient(90deg,#3288bd,#66c2a5,#abdda4,#e6f598,#fee08b,#fdae61,#d53e4f)",
    min: "blue lines = lower elevation",
    mid: "green/yellow = middle",
    max: "orange/red lines = higher",
    meaning: ["Only contour lines are coloured; transparent areas between lines are normal.", "Each line marks an elevation interval (currently 50 m), so a flat AOI may have few or no lines."],
  },

  // ── Sentinel-5P (Atmosphere) ────────────────────────────────────────────
  NO2: {
    label: "NO₂ tropospheric column",
    gradient: "linear-gradient(90deg,#000004,#4a0c6b,#a52c60,#ed6925,#f7d13d,#fcffa4)",
    min: "clean",
    mid: "moderate",
    max: "high NO₂",
  },
  SO2: {
    label: "SO₂ column density",
    gradient: "linear-gradient(90deg,#08306b,#4393c3,#a6d96a,#ffffbf,#fdae61,#d73027)",
    min: "clean",
    mid: "moderate",
    max: "high SO₂",
  },
  CO: {
    label: "CO column density",
    gradient: "linear-gradient(90deg,#ffffe5,#f7fcb9,#d9f0a3,#78c679,#238443,#005a32)",
    min: "clean",
    mid: "moderate",
    max: "high CO",
  },
  OZONE: {
    label: "Total column ozone",
    gradient: "linear-gradient(90deg,#2166ac,#67a9cf,#d1e5f0,#fddbc7,#ef8a62,#b2182b)",
    min: "low O₃",
    mid: "average",
    max: "high O₃",
  },

  // ── MODIS ────────────────────────────────────────────────────────────────
  FIRE: {
    label: "Active fire / thermal anomaly confidence",
    gradient: "linear-gradient(90deg,#000000,#7f0000,#d7301f,#fc8d59,#fdcc8a,#fef0d9)",
    min: "no detection",
    mid: "nominal confidence",
    max: "high confidence",
    meaning: ["Categorical FireMask classes, not a continuous index.", "High values mark pixels with high-confidence active fire detections for that day."],
  },
  LST: {
    label: "Land surface temperature",
    gradient: "linear-gradient(90deg,#08306b,#4393c3,#a6d96a,#fee08b,#f46d43,#a50026)",
    min: "cooler",
    mid: "average",
    max: "hotter",
    meaning: ["Raw MODIS LST is scaled Kelvin (×50); convert to °C before reading absolute values.", "Cloud-covered pixels are masked as no-data in the source product."],
  },
  // ── ASTER ────────────────────────────────────────────────────────────────
  MINERALS: {
    label: "Mineral / lithology band ratio composite",
    gradient: "linear-gradient(90deg,#3f0d12,#a63603,#e6550d,#fdae6b,#fee6ce)",
    min: "dark",
    mid: "mixed",
    max: "bright",
    meaning: ["R/G/B channels are SWIR band ratios commonly used for hydrothermal alteration / lithology mapping.", "Interpretation depends on the exact ratio recipe used — verify against the source you're following before publishing conclusions."],
  },
  THERMAL: {
    label: "Thermal infrared brightness",
    gradient: "linear-gradient(90deg,#0f172a,#6b21a8,#db2777,#f97316,#facc15)",
    min: "cooler",
    mid: "moderate",
    max: "hotter",
  },

  // ── Sentinel-3 ────────────────────────────────────────────────────────────
  SST: {
    label: "Sea surface temperature",
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a2fc3c,#fabb31,#e4460a,#7a0403)",
    min: "271K / -2°C",
    mid: "~288K / 15°C",
    max: "305K / 32°C",
    meaning: ["SLSTR skin sea surface temperature, GHRSST L2P product.", "Coastal and cloud-contaminated pixels are typically masked as no-data."],
  },
  S3_LST: {
    label: "Land surface temperature",
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a2fc3c,#fabb31,#e4460a,#7a0403)",
    min: "250K / -23°C",
    mid: "~290K / 17°C",
    max: "330K / 57°C",
    meaning: ["SLSTR Land Surface Temperature (skin temperature of the ground, not air temperature).", "Wider dynamic range than sea surface because land heats/cools faster."],
  },
  OCEAN_COLOR: {
    label: "Ocean color true-color composite",
    gradient: "linear-gradient(90deg,#022c43,#04628a,#1f9bb5,#7fd1c9,#e8f6dc)",
    min: "dark / turbid",
    mid: "mixed",
    max: "bright / clear",
    meaning: ["R/G/B from OLCI's red (~665nm), green (~560nm), and blue (~490nm) reflectance channels.", "Useful for spotting sediment plumes, algal blooms, and general water clarity by eye."],
  },
  CHLOROPHYLL: {
    label: "Chlorophyll-a concentration",
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a2fc3c,#fabb31,#e4460a,#7a0403)",
    min: "0 mg/m³ oligotrophic",
    mid: "~1-2 mg/m³",
    max: "10+ mg/m³ bloom",
    meaning: ["OLCI OC4Me/neural-network chlorophyll-a estimate, a proxy for phytoplankton biomass.", "High values along coasts often reflect river runoff/turbidity rather than open-ocean blooms."],
  },
  FRP: {
    label: "Fire radiative power",
    gradient: "linear-gradient(90deg,#000000,#7f0000,#d7301f,#fc8d59,#fdcc8a,#fef0d9)",
    min: "no detection",
    mid: "moderate MW",
    max: "high MW",
    meaning: ["SLSTR-detected active fire pixels with radiative power in megawatts, not a temperature map.", "Coarser detection grid than MODIS FIRE; small/cool fires can be missed."],
  },
  AEROSOL: {
    label: "Aerosol optical depth (550nm)",
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a2fc3c,#fabb31,#e4460a,#7a0403)",
    min: "clean atmosphere",
    mid: "moderate haze",
    max: "heavy smoke/dust",
    meaning: ["SYNERGY (OLCI+SLSTR) global AOD product, 4.5km super-pixel resolution.", "Snow/ice-covered and high-cloud-fraction pixels are excluded from retrieval."],
  },
};