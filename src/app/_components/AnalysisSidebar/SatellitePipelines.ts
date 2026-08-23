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
  // Agriculture add-ons (2026-08-09)
  | "NDRE"
  | "GNDVI"
  | "MSAVI2"
  | "CCCI"
  | "NDDI"
  | "SI"
  | "CVI"
  // Visible-only + Red-Edge add-ons (2026-08-11)
  | "VARI"
  | "RED_EDGE"
  // Triangular/visible vegetation add-ons (2026-08-11) — Sentinel-2 only
  | "MTVI"
  | "TVI"
  | "GRVI"
  // Pigment/chlorophyll add-ons (2026-08-11) — Sentinel-2 only
  | "RECI"
  | "SIPI"
  | "GCI"
  | "PSRI"
  // Burn severity add-on (2026-08-13) — NIR+SWIR2, works on Sentinel-2 and Landsat
  | "NBRI"
  // Moisture/snow/oil add-ons (2026-08-14) — Sentinel-2 only, see SOURCE_INDICES note
  | "MSI"
  | "NDSI"
  | "OSI"
  // Red-edge NDVI + classic red-edge inflection point add-ons (2026-08-14) —
  // Sentinel-2 only, see SOURCE_INDICES note below (needs B05/B06[/B07]).
  | "RENDVI"
  | "REIP"
  // Drought/pigment add-ons (2026-08-15) — Sentinel-2 only, see SOURCE_INDICES
  // note below. NMDI_SOIL/NMDI_VEG share the exact same formula (B08/B11/B12)
  // — Wang & Qu (2007) proved it works for both, just read in opposite
  // directions — so they're kept as two dropdown entries with the same
  // underlying calc but different legend/colormap, not two different formulas.
  | "NMDI_SOIL"
  | "NMDI_VEG"
  | "ARI"
  | "ARI2"
  // Geology / mineral-mapping add-ons (2026-08-15) — Sentinel-2 only, see
  // SOURCE_INDICES note below. FMR (SWIR1/NIR = B11/B08) is numerically
  // IDENTICAL to MSI already above — same ratio, different application
  // domain (bare rock/geology vs. vegetation moisture stress) — kept as a
  // separate dropdown entry with its own geology-oriented legend/colormap,
  // same reasoning as NMDI_SOIL/NMDI_VEG sharing one formula.
  | "CMR"
  | "FMR"
  // Iron oxide + water-quality add-ons (2026-08-15) — Sentinel-2 only, see
  // SOURCE_INDICES note below.
  | "IOI"
  | "NDCI"
  | "FAI"
  // Water/vegetation add-ons (2026-08-15) — Sentinel-2 only, see SOURCE_INDICES
  // note below. MNDWI shares its exact formula/bands with NDSI above (see note).
  | "MNDWI"
  | "GEMI"
  // Pigment/index add-ons (2026-08-15) — Sentinel-2 only, see SOURCE_INDICES
  // note below. GRVI already existed above (Visible-only/Red-Edge add-ons).
  | "MCARI"
  | "CRI1"
  | "CRI2"
  // Harmful algal bloom add-on (2026-08-15) — Sentinel-2 approximation of the
  // MERIS/OLCI-heritage Cyanobacteria Index, see SOURCE_INDICES note below
  // for the band-substitution caveat.
  | "CI"
  // Vegetation/chlorophyll add-ons (2026-08-15) — Sentinel-2 only, see
  // SOURCE_INDICES note below. NDRE already exists above (Agriculture
  // add-ons 2026-08-09).
  | "EVI2"
  | "MTCI"
  // 2026-08-15 batch (part 2) — Sentinel-2 only, see SOURCE_INDICES note
  // below. NDVI705 shares its exact formula/bands with RENDVI above.
  | "NDVI705"
  | "NDTI"
  | "TCARI"
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
  // Sentinel-3 (OLCI / SLSTR)
  | "SST"
  | "S3_LST"
  | "OCEAN_COLOR"
  | "CHLOROPHYLL"
  | "FRP";

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
  // ⚠️ NDRE و CCCI محتاجين red-edge band (B05) — موجود بس في Sentinel-2 (MSI)،
  // Landsat (OLI) معندوش red-edge بالمرة فمينفعش يتضافوا لـ landsat هنا.
  // GNDVI و MSAVI2 عادي، متوفرين في المصدرين لإنهم بس Green/Red+NIR.
  // ⚠️ VARI و RED_EDGE (S2REP) اتضافوا هنا بس لـ sentinel-2 (2026-08-11).
  // VARI (Green,Red,Blue) أصلًا ممكن تتحسب من أي مصدر فيه visible bands
  // (تقنيًا كانت تشتغل على Landsat كمان)، لكن اتضافت هنا بس بناءً على الطلب.
  // RED_EDGE (S2REP) محتاج B05/B06/B07 — زي NDRE/CCCI، Sentinel-2 (MSI) بس.
  // ⚠️ MTVI/TVI/GRVI اتضافوا هنا بس لـ sentinel-2 (2026-08-11) بناءً على
  // الطلب. GRVI (Green,Red) وTVI (NIR,Red,Green) تقنيًا ممكن تتحسب من أي
  // مصدر فيه نفس الباندات (تشتغل على Landsat كمان)، لكن اتضافت هنا بس زي
  // VARI. MTVI2 (NIR,Red,Green) نفس الكلام.
  // ⚠️ RECI/SIPI/GCI اتضافوا هنا بس لـ sentinel-2 (2026-08-11) بناءً على
  // الطلب. RECI محتاج B05 (red-edge) زي NDRE/CCCI فمينفعش يتضاف لـ landsat
  // (معندوش red-edge band). SIPI (NIR,Blue,Red) وGCI (NIR,Green) تقنيًا
  // ممكن تتحسبوا من أي مصدر فيه نفس الباندات (تشتغل على Landsat كمان)، لكن
  // اتضافوا هنا بس زي VARI/GRVI/TVI.
  // ⚠️ PSRI اتضاف هنا بس لـ sentinel-2 (2026-08-11) — محتاج B06 (red-edge 2)
  // زي RECI/NDRE/CCCI فمينفعش يتضاف لـ landsat (معندوش red-edge band).
  // ⚠️ NBRI (2026-08-13) — محتاج بس NIR+SWIR2 (زي NDMI/NDBI)، الاتنين
  // موجودين في Sentinel-2 (B08/B12) وLandsat (nir08/swir22)، فاتضاف للمصدرين.
  // ⚠️ MSI/NDSI/OSI (2026-08-14) — اتضافوا هنا بس لـ sentinel-2 بناءً على
  // الطلب (نفس نمط MTVI/TVI/GRVI/RECI/... فوق). MSI (B11/B08) وNDSI
  // (B03/B11) تقنيًا ممكن تتحسبوا على Landsat (عنده SWIR1 برضه) لكن اتضافوا
  // Sentinel-2 بس هنا. OSI (Oil Spill Index) heuristic بصري من visible bands
  // بس (B02/B03/B04) — شوفي التحذير في ANALYSIS_CONFIG (route.ts) عن حدود
  // كشف بقع الزيت بالـ optical مقارنة بالـ SAR.
  // ⚠️ RENDVI/REIP (2026-08-14) — اتضافوا هنا بس لـ sentinel-2 (زي
  // NDRE/CCCI/RECI/RED_EDGE فوق) لإن الاتنين محتاجين red-edge band(s)
  // (B05[/B06/B07]) — Landsat (OLI) معندوش red-edge بالمرة. RENDVI (B06,B05)
  // نفس فكرة NDRE بس بتستخدم الـ red-edge bands نفسها بدل NIR/RedEdge.
  // REIP محتاج B04/B05/B06/B07 زي RED_EDGE (S2REP) بالظبط، لكنه معادلة
  // مختلفة (Guyot & Baret 1988 الكلاسيكية بدل Frampton et al. 2013) —
  // شوفي التعليق جوه ANALYSIS_CONFIG.reip (route.ts) للفرق بين الاتنين.
  // ⚠️ NMDI_SOIL/NMDI_VEG (2026-08-15) — Wang & Qu (2007), محتاج NIR+SWIR1+SWIR2
  // (B08/B11/B12) — زي MSI/NBRI متاح تقنيًا على Landsat برضه (nir08/swir16/swir22)
  // بس اتضاف هنا بس لـ sentinel-2 بناءً على الطلب. الاتنين نفس المعادلة بالظبط
  // (B08-(B11-B12))/(B08+(B11-B12)) — الفرق بينهم legend/colormap بس (اتجاه
  // القراءة معكوس: قيمة عالية = تربة جافة لكن = محصول صحي/رطب لو غطاء نباتي كثيف).
  // ARI (2026-08-15) — Gitelson et al. (2001), محتاج Green+RedEdge1 (B03/B05).
  // ⚠️ مش scale-invariant زي باقي الـ ratios (reci/gci) — دي فرق reciprocals
  // (1/x) مش نسبة مباشرة، فلازم تطبيع /10000 قبل القسمة عشان يطلع بمدى
  // الأدبيات الحقيقي (~0-0.2) بدل ما يتضخم بمقياس الـ DN الخام — شوفي
  // التعليق جوه ANALYSIS_CONFIG.ari (route.ts).
  // ARI2/mARI (2026-08-15) — نفس ARI مضروبة في NIR reflectance (B07) عشان
  // تصحيح كثافة/سمك الورقة (leaf scattering) — محتاج B03/B05/B07. ⚠️ بعكس
  // ARI العادية، دي فعليًا scale-invariant تاني (الـ ÷10000 بتاعت الـ ARI
  // وضرب NIR/10000 بيلغوا بعض جبريًا) — شوفي ANALYSIS_CONFIG.ari2 (route.ts).
  // CMR/FMR (2026-08-15) — Clay Minerals Ratio (B11/B12) و Ferrous Minerals
  // Ratio (B11/B08)، الاتنين simple ratios جيولوجية عادية (ESRI ClayMinerals/
  // FerrousMinerals). ⚠️ FMR نفس بالظبط formula/bands زي MSI فوق (B11/B08) —
  // مش خطأ تكرار، القيمة نفسها بتتقرا كمؤشر جيولوجي (حديد حديدوز) هنا بدل
  // إجهاد مائي نباتي — legend/colormap مختلفين بس (شوفي SATELLITE_LEGENDS.FMR).
  // IOI (2026-08-15) — Iron Oxide ratio (ESRI): Red/Blue = B04/B02.
  // NDCI (2026-08-15) — Mishra & Mishra 2012، chlorophyll-a في المية الغائمة/المنتجة
  // (turbid productive waters) — (RedEdge1-Red)/(RedEdge1+Red) = (B05-B04)/(B05+B04).
  // FAI (2026-08-15) — Floating Algae Index (Hu 2009)، B04/B08/B11 — بيبني baseline
  // خطي بين Red وSWIR1 عند طول موجة NIR، والفرق بينه وبين NIR الحقيقي بيكشف
  // الطحالب/النباتات العائمة على سطح المية. شوفي ANALYSIS_CONFIG.fai (route.ts).
  // MNDWI (2026-08-15) — Xu (2006)، Modified NDWI: (Green-SWIR1)/(Green+SWIR1)
  // = B03/B11. ⚠️ نفس بالظبط بانداتات/معادلة NDSI فوق (NDSI هي كمان
  // (Green-SWIR1)/(Green+SWIR1) بنفس الترتيب) — مش خطأ تكرار، القيمة نفسها
  // بتتقرا هنا كإشارة استخراج مسطحات مائية (عالي = مية) بدل ثلج/جليد —
  // legend/colormap مختلفين بس، نفس منطق FMR/MSI وNMDI_SOIL/NMDI_VEG فوق.
  // GEMI (2026-08-15) — Global Environmental Monitoring Index (Pinty & Verhoef
  // 1992)، B08/B04 — محتاج تطبيع reflectance (÷10000) عشان فيها ثابت جمع
  // (0.125) مش نسبة/فرق بسيط زي NDVI، شوفي التعليق جوه ANALYSIS_CONFIG.gemi
  // (route.ts) للمعادلة كاملة.
  // MCARI (2026-08-15) — Daughtry et al. (2000)، B05/B04/B03 — محتاج تطبيع
  // reflectance (÷10000) زي CVI/TVI/MTVI فوق (فرق مضروب في نسبة، مش نسبة
  // بسيطة). CRI1/CRI2 (Gitelson et al. 2002) — فرق reciprocals (1/x) زي ARI
  // فوق بالظبط، فمحتاجين نفس تطبيع ÷10000 قبل القسمة. الثلاثة شوفي
  // ANALYSIS_CONFIG (route.ts) للمعادلات كاملة. ⚠️ GRVI (Green,Red) اتضافت
  // قبل كده فوق (Visible-only add-ons 2026-08-11) — مش محتاجة تتضاف تاني.
  // CI (2026-08-15) — Cyanobacteria Index (Wynne et al. 2008)، الأصل مبني على
  // بانداتات MERIS/OLCI عند 665/681/709nm — Sentinel-2 معندوش باند عند 681nm
  // بالظبط، فده تقريب باستخدام B04/B05/B06 (665/705/740nm) بدل الأصلية.
  // ⚠️ نفس منطق baseline-interpolation بتاعت FAI فوق، بس هنا الـ baseline بين
  // Red وRedEdge2 والقيمة المقاسة عندها RedEdge1 (بدل NIR/Red/SWIR1 بتاعت FAI
  // للمياه العامة). شوفي التحذير في ANALYSIS_CONFIG.ci (route.ts) عن حدود
  // التقريب ده مقارنة بالخوارزمية الأصلية على MERIS/OLCI.
  // EVI2 (2026-08-15) — Jiang et al. (2008)، B08/B04 — نسخة بانداتين من EVI
  // (بدون Blue)، نفس معاملات/معادلة العائلة، مش محتاجة تطبيع ÷10000 هنا عشان
  // متسقة مع EVI الأصلية فوق (نفس النمط، DN خام مباشرة).
  // MTCI (2026-08-15) — Dash & Curran (2004)، تقريب Sentinel-2 لـ MERIS
  // Terrestrial Chlorophyll Index الأصلي (753/709/681nm) — هنا B06/B05/B04
  // (740/705/665nm). فرق فوق فرق فبيتلغي أي ثابت تحويل DN->reflectance
  // (scale-invariant زي RECI/GCI)، مش محتاج ÷10000. شوفي ANALYSIS_CONFIG.mtci
  // (route.ts) للتفاصيل.
  // NDVI705 (2026-08-15) — Gitelson & Merzlyak (1994)، (R750-R705)/(R750+R705)
  // — تقريب Sentinel-2 باستخدام B06/B05 (740/705nm). ⚠️ نفس بالظبط
  // formula/bands بتاعة RENDVI فوق (نفس المعادلة) — مش خطأ تكرار، اسم تاني
  // شائع في الأدبيات لنفس الحساب، نفس منطق NDSI/MNDWI فوق.
  // NDTI (2026-08-15) — Normalized Difference Turbidity Index (Lacaux et al.
  // 2007)، (Red-Green)/(Red+Green) = B04/B03 — جودة مياه، مش تلاجة الأرض
  // (فيه اسم NDTI تاني مختلف تمامًا لـ tillage/SWIR بس ده مش المقصود هنا
  // بناءً على الطلب).
  // TCARI (2026-08-15) — Haboudane et al. (2002)، B05/B04/B03 — رفيقة MCARI
  // فوق بس معادلة مختلفة شوية (الضرب في النسبة جوه القوس التاني بس مش
  // القوسين مع بعض) — شوفي ANALYSIS_CONFIG.tcari (route.ts) للفرق بالظبط.
  "sentinel-2": ["RGB", "NDVI", "NDWI", "NDMI", "NDBI", "SAVI", "EVI", "BSI", "NDRE", "GNDVI", "MSAVI2", "CCCI", "NDDI", "SI", "CVI", "VARI", "RED_EDGE", "MTVI", "TVI", "GRVI", "RECI", "SIPI", "GCI", "PSRI", "NBRI", "MSI", "NDSI", "OSI", "RENDVI", "REIP", "NMDI_SOIL", "NMDI_VEG", "ARI", "ARI2", "CMR", "FMR", "IOI", "NDCI", "FAI", "MNDWI", "GEMI", "MCARI", "CRI1", "CRI2", "CI", "EVI2", "MTCI", "NDVI705", "NDTI", "TCARI"],
  "landsat":    ["RGB", "NDVI", "NDWI", "NDMI", "NDBI", "SAVI", "EVI", "BSI", "GNDVI", "MSAVI2", "NDDI", "SI", "CVI", "NBRI"],
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
  // FRP) جاي من STAC collection مختلف تمامًا على Planetary Computer
  // (مش نفس الـ collection زي Sentinel-2). شوفي SOURCE_ANALYSIS_COLLECTIONS تحت.
  "sentinel-3": ["SST", "S3_LST", "CHLOROPHYLL", "FRP"],
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
  },
};

// ⚠️ (2026-08-21) sentinel-5p-l2-netcdf عبارة عن collection واحد بيجمع كل
// الغازات مع بعض (NO2/SO2/CO/O3/CH4/HCHO/CLOUD) — على عكس MODIS/Sentinel-3
// اللي كل analysis فيهم collection منفصل خالص. من غير فلترة الـ STAC query
// بـ "producttype" الحقيقي بتاع كل غاز، searchScenes (في
// ChangeDetectionPanel.tsx) بترجع items مخلوطة من كل الغازات سوا — فاختيار
// مثلًا SO2 ممكن يرجع scene فعليًا item من نوع NO2 (لسه بيحقق بس bbox/date)،
// وبعدين طلب /gis/sentinel5p/decode بـ variable=SO2 على item من نوع تاني
// يفشل (الملف مفيهوش المتغير ده أصلًا) — نفس فئة الباگ اللي كانت في MODIS
// FIRE/LST (item من collection غلط)، بس هنا داخل نفس الـ collection مش
// collection مختلف، فمحتاج فلترة على مستوى الـ query مش الـ collection.
// ✅ (2026-08-22) أسماء الـ product type codes دي (L2__XX___) اتأكدت فعليًا
// من item حقيقي على Planetary Computer (S5P_L2_SO2____...45855):
// "s5p:product_type": "L2__SO2___" — مطابقة تمامًا للي كان متحطوط هنا. الحاجة
// الوحيدة اللي كانت غلط هي اسم الـ property نفسه (SENTINEL5P_PRODUCT_TYPE_PROPERTY
// تحت، كان "s5p:producttype" من غير underscore) — ده اللي كان بيخلي الفلتر
// كله يرجع صفر نتائج مهما كان الـ AOI أو التاريخ.
export const SENTINEL5P_PRODUCT_TYPE: Partial<Record<SatelliteAnalysisType, string>> = {
  NO2:   "L2__NO2___",
  SO2:   "L2__SO2___",
  CO:    "L2__CO____",
  OZONE: "L2__O3____",
};
// اسم الخاصية نفسها في properties الـ STAC item — منفصل عن القيم فوق عشان
// لو طلع غلط يبقى محتاج يتغيّر مكان واحد بس.
// ✅ (2026-08-22) اتأكدت مباشرة من item حقيقي (S5P_L2_SO2____...45855) على
// Planetary Computer: الاسم الصح هو "s5p:product_type" (بـ underscore بين
// product و type) — كان مكتوب هنا "s5p:producttype" (من غير underscore)،
// فالـ query كان بيفلتر على property مش موجودة أصلًا في properties الـ item،
// فيرجع صفر نتائج دايمًا لأي غاز ولأي AOI/تاريخ — مش مشكلة AOI ولا تاريخ
// خالص. القيم نفسها ("L2__NO2___"... إلخ) كانت صح زي ما هي، اتأكدت من
// "s5p:product_type": "L2__SO2___" في نفس الـ item.
export const SENTINEL5P_PRODUCT_TYPE_PROPERTY = "s5p:product_type";

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
  variable?: string;         // NetCDF variable name (xarray tiler) — لازم لـ SST
  bidx?: number | number[];  // band index (1-based) — لازم لو الـ asset راجع بيه أكتر من band وTiTiler مش عارف يفهم لوحده أي واحد يعرض (زي MODIS FireMask). Array = كذا bidx= param (RGB composite من ملف multi-band واحد، زي ASTER VNIR).
  dynamicRescale?: boolean;  // true = متجيبش rescale ثابت من هنا، دي بس fallback. نجيب الـ min/max الحقيقي من TiTiler /item/statistics على نفس الـ scene وقت العرض (شوفي fetchDynamicRescale تحت). لازم للمصادر اللي قيمها raw DN مش معايرة (زي ASTER TIR/SWIR).
  // ⚠️ (2026-08-22) nodata/resampling اتضافوا عشان يحلوا مشكلة الـ "بقع"
  // (مكان عليه بيانات ومكان فاضي جنبه في نفس الصورة) اللي كانت بتظهر في
  // FireMask/LST: من غيرهم، TiTiler كان بيتعامل مع بيكسلات الـ fill/nodata
  // الحقيقية كأنها قيمة عادية داخل الـ rescale، فيرسمها بلون (غالبًا نفس
  // لون أقرب طرف للـ colormap)، وكمان الـ resampling الافتراضي (bilinear)
  // كان بيخلط قيمة nodata مع البكسل الحقيقي جنبها عند تكبير الصورة لـ
  // 512×512 فيطلع حواف ملوّنة غلط حوالين كل بقعة بيانات ناقصة.
  nodata?: number;           // القيمة اللي المصدر بيحطها في البكسلات الناقصة (fill value)
  resampling?: string;      // "nearest" لازم للبيانات الفئوية (زي FireMask: 0-9 categories) عشان التكبير ميخترعش قيم متوسطة وهمية بين الفئات
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
  // ⚠️ (2026-08-21) dynamicRescale اتضافت هنا: كانت المشكلة إن FireMask
  // غالبًا في أي AOI عادي (مفيهوش حريق فعلي وقت الـ scene) قيمه كلها واقعة
  // في نطاق ضيق جدًا (0-1 "not processed"، أو 4 "non-fire land") من أصل
  // المدى الكامل 0-9 — يعني كل الصورة بتتلوّن بلون شبه ثابت (أسود قريب من
  // الصفر غالبًا مع colormap "hot")، فبتبان "مفيش heatmap خالص" رغم إن
  // الطلب رجع بنجاح. نفس فئة الباگ اللي كانت في ASTER MINERALS/THERMAL فوق
  // بالظبط، ونفس الحل: نجيب الـ range الحقيقي لنفس الـ scene بدل رقم ثابت.
  // ⚠️ nodata: 255 = فئة "fill value" الحقيقية في FireMask (مش 0 — 0 لسه
  // فئة معناها "not processed"، فمينفعش نعتبرها nodata أو هنشيل بيانات
  // حقيقية). resampling: "nearest" عشان الفئات 0-9 رقمية مش قيمة قياس
  // مستمرة — أي bilinear interpolation بين فئة 4 (أرض) وفئة 8 (حريق) بينتج
  // رقم زي 6 مالوش معنى فيزيائي، وده كان سبب رئيسي في اختلاط الألوان.
  FIRE: { assets: ["FireMask"], bidx: 1, rescale: "0,9", colormapName: "hot", dynamicRescale: true, nodata: 255, resampling: "nearest" },
  // MODIS LST — كلفن * 50 (scale factor 0.02) في الملف الخام. rescale ضُيّق
  // من المدى الكامل (260-330K) لمدى أكتر واقعية ليوم/منطقة واحدة (285-325K)
  // عشان فروق درجة الحرارة الصغيرة جوه AOI واحد تبان في الألوان بدل ما تضيع
  // في مدى واسع أوي كان بيخلي كل حاجة تبان لون شبه ثابت. لو منطقتك بارد جدًا
  // (شتاء/جبال) هتحتاجي تنزلي الرقم الأول لحد 250 مثلًا.
  // ⚠️ (2026-08-21) dynamicRescale اتضافت كمان هنا لنفس السبب: أي منطقة/يوم
  // فعليًا برّه نطاق 285-325K الثابت (صحراء حارة جدًا، أو منطقة باردة/ليلية)
  // كانت بتتقص بالكامل لطرف واحد من الـ colormap ("inferno") فتبان لون
  // موحّد بدل heatmap حقيقي — نفس أعراض FireMask بالظبط. الرقم الثابت فاضل
  // كـ fallback لو /item/statistics فشل.
  // ⚠️ nodata: 0 = fill value الحقيقي لـ LST_Day_1km (البكسلات المتغطية
  // بسحاب بتتحط صفر في الملف الخام). من غيرها كانت بتترسم كأنها "0 كلفن"
  // حقيقي، يعني جزء من الصورة يطلع أسود تمامًا بدل شفاف — وده أقرب توصيف
  // لـ"مكان فيه بيانات ومكان فاضي جنبه بلون غلط" اللي كانت بتظهر.
  LST:  { assets: ["LST_Day_1km"], rescale: "14250,16250", colormapName: "inferno", dynamicRescale: true, nodata: 0 },
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
  //   • WST (SST): كل الـ variables متجمّعة في ملف NetCDF واحد بس لكل item
  //     (asset key واحد: "l2p")، فمحتاجين "variable=" كمان جنب "assets="
  //     عشان نحدد أي متغير جوه الملف نعرضه.
  //   • LST (lst-in) وFRP (frp-in) وOLCI WFR (oa0X-reflectance / chl-nn):
  //     كل واحد فيهم ملف NetCDF منفصل خاص بيه (زي MODIS تقريبًا)، فمش
  //     محتاجين "variable=" غالبًا لإن الملف الواحد بيحتوي متغير القياس
  //     الأساسي بس (لسه محتاج تأكيد نهائي بفحص /tilejson.json فعلي).
  // أسماء الـ variables (sea_surface_temperature, LST, FRP_MWIR)
  // جايه من الـ product spec الرسمي (GHRSST/SLSTR User Guides) —
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
  analysis: SatelliteAnalysisType,
  // ⚠️ (2026-08-22) overrideRescale: لو الكولر جاي من fetchPairDynamicRescale
  // (شوفيها تحت)، بنستخدمه بدل ما نعمل fetchDynamicRescale لوحدها هنا —
  // ده اللي بيخلي صورتين (قبل/بعد) يستخدموا نفس نطاق الألوان بالظبط.
  overrideRescale?: string
): Promise<string | null> {
  const style = TITILER_STYLES[analysis];
  if (!style) return null;

  const params = new URLSearchParams();
  params.set("collection", collection);
  params.set("item", itemId);
  params.set("assets", style.assets.join(","));
  if (style.expression) params.set("expression", style.expression);
  // ⚠️ لازم بس للـ Sentinel-3 collections اللي بتجمع كذا متغير في NetCDF واحد
  // (SST). لو الـ tiler بتاع PC مش بيقبل "variable=" بنفس الاسم ده،
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
  const rescale = overrideRescale
    ?? (style.dynamicRescale
      ? (await fetchDynamicRescale(collection, itemId, style)) ?? style.rescale
      : style.rescale);
  params.set("rescale", rescale);
  if (style.colormapName) params.set("colormap_name", style.colormapName);
  if (style.colorFormula) params.set("color_formula", style.colorFormula);
  if (style.nodata !== undefined) params.set("nodata", String(style.nodata));
  if (style.resampling) params.set("resampling", style.resampling);
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
  bbox: [number, number, number, number], // [west, south, east, north] WGS84
  // ⚠️ (2026-08-22) overrideRescale: نفس فكرة buildTitilerTileUrl فوق —
  // بيتبعت من ChangeDetectionPanel.tsx (fetchPairDynamicRescale) عشان
  // صورة الـ "قبل" وصورة الـ "بعد" يستخدموا نفس نطاق الألوان بالظبط
  // بدل ما كل واحدة تحسب rescale منفصل عن سيناتها هي بس (وده اللي كان
  // بيخلي الألوان "تتغير كليًا" بين قبل/بعد رغم إنه نفس المؤشر).
  overrideRescale?: string
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
  // ⚠️ نفس منطق buildTitilerTileUrl: لو dynamicRescale مفعّل ومفيش
  // overrideRescale جاي من الكولر، بنستنى /item/statistics ونستخدم
  // الرينج الحقيقي بدل الرقم الثابت. الـ cache في fetchDynamicRescale
  // بيمنع طلب مكرر لو buildTitilerTileUrl سبق ونادى على نفس الـ scene+style
  // قبل كده.
  const rescale = overrideRescale
    ?? (style.dynamicRescale
      ? (await fetchDynamicRescale(collection, itemId, style)) ?? style.rescale
      : style.rescale);
  params.set("rescale", rescale);
  if (style.colormapName) params.set("colormap_name", style.colormapName);
  if (style.colorFormula) params.set("color_formula", style.colorFormula);
  if (style.nodata !== undefined) params.set("nodata", String(style.nodata));
  if (style.resampling) params.set("resampling", style.resampling);
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

/**
 * ⚠️ (2026-08-22) بتحل مشكلة "الألوان بتتغير كليًا بين قبل وبعد" في
 * ChangeDetectionPanel.tsx للمؤشرات اللي عندها dynamicRescale (FIRE/LST/
 * MINERALS/THERMAL): buildTitilerTileUrl/buildTitilerBboxUrl كانوا بيتناديوا
 * مرتين مستقلتين تمامًا (مرة لسينة الـ"قبل" ومرة لسينة الـ"بعد")، وكل مرة
 * كانت بتحسب /item/statistics *لنفس السينة دي بس*، يعني نفس القيمة الخام
 * ممكن تترسم بلون مختلف تمامًا في الصورتين لإن كل واحدة بتتقص (rescale) على
 * مدى مختلف عن التانية — ده مش "تغيّر حقيقي في البيانات"، ده بس اختلاف في
 * مقياس الألوان نفسه.
 *
 * الحل: نجيب إحصائيات الصورتين مع بعض، وناخد أوسع مدى يغطيهم الاتنين، ونرجّع
 * rescale واحد نستخدمه لصورة الـ"قبل" وصورة الـ"بعد" مع بعض — كده أي فرق لون
 * بين الصورتين معناه فرق حقيقي في القيمة، مش مجرد اختلاف مقياس.
 */
export async function fetchPairDynamicRescale(
  collection: string,
  beforeItemId: string,
  afterItemId: string,
  analysis: SatelliteAnalysisType
): Promise<string | null> {
  const style = TITILER_STYLES[analysis];
  if (!style || !style.dynamicRescale) return null;

  const [beforeRange, afterRange] = await Promise.all([
    fetchDynamicRescale(collection, beforeItemId, style),
    fetchDynamicRescale(collection, afterItemId, style),
  ]);

  let lo = Infinity;
  let hi = -Infinity;
  [beforeRange, afterRange].forEach((range) => {
    if (!range) return;
    const [a, b] = range.split(",").map(Number);
    if (Number.isFinite(a)) lo = Math.min(lo, a);
    if (Number.isFinite(b)) hi = Math.max(hi, b);
  });

  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo >= hi) return null;
  return `${lo},${hi}`;
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
    // ⚠️ (2026-08-14) اتصلح: كان متكتوب هنا تدرّج برتقالي->أبيض->بنفسجي
    // ("PuOr") بينما الكولورماب الحقيقي المستخدم فعليًا لـ BSI في
    // getIndexPreviewStyle هو "rdbu_r" (زي SIPI/PSRI فوق) — ديفيرجينج
    // أزرق->أبيض->أحمر. التدرّج هنا اتصلح عشان يطابق فعليًا اللي بيتلوّن
    // على الخريطة.
    gradient: "linear-gradient(90deg,#053061,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b,#67001f)",
    min: "vegetated (blue)",
    mid: "mixed (white/tan)",
    max: "bare soil (red)",
  },
  NDRE: {
    label: "NDRE red-edge chlorophyll",
    // ⚠️ (2026-08-09) الألوان الفعلية على الخريطة اتسابت زي ما هي (colormap
    // "spectral_r" في getIndexPreviewStyle، مش متغيّرة) — التدرّج هنا بس
    // اتصلح عشان يطابق فعليًا اللي بيتعرض (أحمر/برتقالي منخفض -> أصفر متوسط
    // -> أزرق مرتفع)، بدل التدرّج الأحمر/أخضر القديم اللي كان بيخالفه.
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "low chlorophyll (red/orange)",
    mid: "moderate (yellow)",
    max: "high chlorophyll (blue)",
    meaning: ["Stays sensitive to canopy chlorophyll later in the growth cycle, when NDVI saturates near +1 on dense/mature canopy.", "Most useful mid-to-late season; less informative on very young or sparse crops."],
  },
  GNDVI: {
    label: "GNDVI green-band vegetation",
    // ⚠️ (2026-08-09) لون جديد بطلب المستخدم (colormap "gndvi_warm" في
    // getIndexPreviewStyle) — برتقالي (stressed) -> أصفر -> أخضر (vigorous).
    gradient: "linear-gradient(90deg,#d94801,#fd8d3c,#fed976,#78c679,#238443)",
    min: "stressed / sparse",
    mid: "moderate",
    max: "vigorous, high N/water uptake",
    meaning: ["Green replaces Red vs. standard NDVI, giving better sensitivity to nitrogen and water uptake in mid/late growth stages.", "Useful for aged or advanced-stage crop canopies where NDVI has already saturated."],
  },
  MSAVI2: {
    label: "MSAVI2 soil-adjusted vegetation",
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "bare soil / sparse",
    mid: "moderate cover",
    max: "dense canopy",
    meaning: ["Self-adjusting soil correction (no fixed L constant like SAVI), so it's most accurate on early-season or sparse canopy where soil background dominates.", "Behaves like NDVI/SAVI once vegetation cover is moderate-to-dense."],
  },
  CCCI: {
    label: "CCCI canopy chlorophyll / nitrogen",
    // ⚠️ (2026-08-09) الألوان الفعلية على الخريطة اتسابت زي ما هي (colormap
    // "rdbu" في getIndexPreviewStyle، مش متغيّرة — ده اللي كنتِ شايفاه فعليًا
    // في الصورة: أحمر/أزرق). التدرّج هنا بس اتصلح عشان يطابق الحقيقي بدل
    // التدرّج الأحمر/أخضر القديم اللي كان بيخالفه.
    gradient: "linear-gradient(90deg,#67001f,#b2182b,#d6604d,#fddbc7,#d1e5f0,#4393c3,#053061)",
    min: "likely N-deficient (red)",
    mid: "moderate",
    max: "healthy chlorophyll/N status (blue)",
    meaning: ["Ratio of NDRE to NDVI — combines red-edge chlorophyll sensitivity with overall greenness for nitrogen-status mapping.", "Best read alongside NDRE/NDVI directly rather than in isolation; extreme low-NDVI areas can produce noisy ratios."],
  },
  NDDI: {
    label: "NDDI drought index",
    // ⚠️ (2026-08-09) الألوان الفعلية على الخريطة اتسابت زي ما هي (colormap
    // "greens" في getIndexPreviewStyle، مش متغيّرة) — sequential فاتح->غامق،
    // مش ديفيرجينج أزرق/أحمر زي ما كان متكتوب هنا غلط قبل كده.
    gradient: "linear-gradient(90deg,#ffffe5,#f7fcb9,#d9f0a3,#78c679,#238443,#005a32)",
    min: "low drought signal",
    mid: "moderate",
    max: "high drought stress",
    meaning: ["Combines NDVI and NDWI into a single drought signal — high values mean vegetation is present but the water signal is low relative to it.", "Most informative over vegetated land; open water or fully bare soil pixels are less meaningful to read on this scale."],
  },
  SI: {
    label: "SI soil salinity",
    // ⚠️ (2026-08-09) لون جديد بطلب المستخدم (colormap "salinity_clear" في
    // getIndexPreviewStyle) — تيل (healthy) -> ذهبي -> أحمر واضح (risk).
    gradient: "linear-gradient(90deg,#0891b2,#67e8f9,#fde68a,#f59e0b,#dc2626)",
    min: "healthy / low salinity",
    mid: "moderate",
    max: "high salinity risk",
    meaning: ["Normalized-difference formulation (Red,NIR) — one of several published Salinity Index variants, chosen here to stay scale-invariant like NDVI/NDWI.", "Best used as a relative screening signal within one AOI/date, then verified against soil sampling before drawing conclusions."],
  },
  CVI: {
    label: "CVI chlorophyll vegetation",
    // ⚠️ (2026-08-09) لون جديد بطلب المستخدم (colormap "cvi_ocean" في
    // getIndexPreviewStyle) — أزرق غامق (low) -> تيل -> أخضر حيوي (high).
    gradient: "linear-gradient(90deg,#1e3a8a,#0891b2,#22c55e,#15803d)",
    min: "low chlorophyll",
    mid: "moderate",
    max: "high chlorophyll",
    meaning: ["NIR × (Red / Green²) — most useful from early-to-mid crop growth across a wide range of soils and sowing conditions.", "⚠️ Not a normalized ratio like NDVI: its scale depends on the raw reflectance magnitude of the input bands, so its useful range shifts more between scenes/sensors than NDVI-style indices."],
  },
  VARI: {
    label: "VARI visible vegetation (no NIR)",
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "-1",
    mid: "0",
    max: "+1",
    meaning: ["(Green-Red)/(Green+Red-Blue) — built only from visible bands (no NIR), so it works on true-color-only imagery where NDVI-style indices can't.", "More sensitive to atmospheric haze and less standardized than NDVI; best as a quick visual-only vegetation check, not a substitute for NDVI where NIR is available."],
  },
  RED_EDGE: {
    label: "S2REP red-edge position (nm)",
    // ⚠️ (2026-08-11) مش normalized-difference زي NDRE — دي قيمة "طول موجي"
    // فعلية بالنانومتر (~700-740nm)، فمداها مختلف تمامًا. القيمة كل ما تعلى
    // (تتحرك نحو 720-740) كل ما يبقى فيه كلوروفيل/نيتروجين أكتر في المحصول.
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "~700nm (stressed/sparse)",
    mid: "~715nm (moderate)",
    max: "~730-740nm (dense, high chlorophyll)",
    meaning: ["S2REP: interpolates the wavelength (nm) where reflectance rises fastest between Red and NIR, using B04/B05/B06/B07. Distinct from NDRE (which is a normalized ratio, not a wavelength).", "Sensitive to canopy chlorophyll/nitrogen status, and — unlike NDVI/NDRE — tends not to saturate on dense mature canopy, so it stays informative later in the season too."],
  },
  MTVI: {
    label: "MTVI2 modified triangular vegetation",
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "bare soil / sparse",
    mid: "moderate cover",
    max: "dense, high chlorophyll",
    meaning: ["MTVI2 (Haboudane et al. 2004): normalized triangular-area index built from NIR/Red/Green reflectance, sensitive to leaf area/chlorophyll while staying resistant to soil background and — like MSAVI2 — mostly self-correcting for canopy density.", "Similar -1..1-ish normalized scale to NDVI-family indices, but built on a different geometric (triangle-area) formulation instead of a normalized difference."],
  },
  TVI: {
    label: "TVI triangular vegetation",
    // ⚠️ (2026-08-14) اتصلح: كان متكتوب هنا تدرّج "OrRd" (تسلسلي فاتح->غامق)
    // بينما الكولورماب الحقيقي المستخدم فعليًا في getIndexPreviewStyle
    // (SatelliteDataPanel.tsx) هو "spectral" (rainbow ديفيرجينج: أحمر->
    // برتقالي->أصفر->أخضر->أزرق->بنفسجي) — ده اللي كان بيخلي الألوان على
    // الخريطة (أحمر/أخضر/أزرق متبعثرة) تبان "غلط" بالمقارنة باللجند اللي
    // كان بيوعد بتدرّج واحد بس من الفاتح للأحمر الغامق. التدرّج هنا اتصلح
    // عشان يطابق فعليًا الـ "spectral" (نفس تدرّج SAVI اللي بيستخدم نفس
    // الكولورماب فوق).
    gradient: "linear-gradient(90deg,#9e0142,#f46d43,#fee08b,#abdda4,#3288bd,#5e4fa2)",
    min: "0 = low canopy chlorophyll (red)",
    mid: "~25 = moderate (yellow-green)",
    max: "50 = high canopy chlorophyll (blue/purple)",
    meaning: ["Broge & Leblanc (2000): estimates the area of the triangle formed by the Green, Red and NIR reflectance points — a larger triangle area means more chlorophyll absorption in Red and more NIR reflectance from canopy structure.", "⚠️ Not a normalized ratio like NDVI: its scale depends on the raw reflectance magnitude of the input bands, so treat the range as relative within one AOI/date rather than a fixed universal scale."],
  },
  GRVI: {
    label: "GRVI green-red vegetation (no NIR)",
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "-1",
    mid: "0",
    max: "+1",
    meaning: ["(Green-Red)/(Green+Red) — visible-only vegetation greenness, no NIR needed, so it works on true-color-only imagery same as VARI.", "Simpler and more haze-sensitive than VARI (no Blue correction term); best as a quick relative greenness check, not a substitute for NDVI where NIR is available."],
  },
  RECI: {
    label: "RECI red-edge chlorophyll (simple ratio)",
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "low chlorophyll",
    mid: "moderate",
    max: "high chlorophyll",
    meaning: ["(NIR/RedEdge) − 1 — a simple-ratio red-edge chlorophyll index, same B05 dependency as NDRE so it's Sentinel-2 only (Landsat has no red-edge band).", "Unlike NDRE's normalized-difference shape, RECI is a ratio and is NOT bounded to -1..1 — its useful range is typically ~0..3 on vegetated canopy."],
  },
  SIPI: {
    label: "SIPI pigment ratio (carotenoid/chlorophyll)",
    // ⚠️ (2026-08-14) اتصلح: كان متكتوب هنا تدرّج أحمر->برتقالي->أخضر بينما
    // الكولورماب الحقيقي المستخدم فعليًا في getIndexPreviewStyle
    // (SatelliteDataPanel.tsx) هو "rdbu_r" (ديفيرجينج أزرق->أبيض->أحمر،
    // زي NDWI بس معكوس). التدرّج هنا اتصلح عشان يطابق فعليًا اللي بيتلوّن
    // على الخريطة.
    gradient: "linear-gradient(90deg,#053061,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b,#67001f)",
    min: "0 = low ratio, high chlorophyll relative to carotenoids (blue)",
    mid: "~1 = moderate (white/tan)",
    max: "2 = high ratio, canopy/pigment stress (red)",
    meaning: ["(NIR − Blue) / (NIR − Red) — Structure Insensitive Pigment Index, a ratio of carotenoid to chlorophyll absorption used as a canopy-stress signal that's less sensitive to canopy structure/LAI than NDVI.", "Typical literature range is roughly 0..2 on vegetation; values well outside that on this AOI usually mean sparse/mixed cover rather than pigment stress."],
  },
  GCI: {
    label: "GCI green chlorophyll (simple ratio)",
    // ⚠️ (2026-08-14) اتصلح: كان متكتوب هنا نفس تدرّج GNDVI (برتقالي->أصفر->
    // أخضر، "gndvi_warm") بينما الكولورماب الحقيقي المستخدم فعليًا لـ GCI في
    // getIndexPreviewStyle هو "greens" العادي (تسلسلي أصفر فاتح جدًا -> أخضر
    // غامق، من غير أي برتقالي). التدرّج هنا اتصلح عشان يطابق فعليًا اللي
    // بيتلوّن على الخريطة (نفس تدرّج "greens" المستخدم في NDMI فوق).
    gradient: "linear-gradient(90deg,#ffffe5,#f7fcb9,#d9f0a3,#addd8e,#78c679,#41ab5d,#238443,#005a32)",
    min: "0 = low chlorophyll (pale)",
    mid: "~2 = moderate",
    max: "4+ = high chlorophyll (dark green)",
    meaning: ["(NIR/Green) − 1 — a simple-ratio chlorophyll index, same Green+NIR bands as GNDVI but without the normalized-difference bounding.", "Like RECI, this is a ratio and NOT bounded to -1..1 — its useful range is typically ~0..4+ on vegetated canopy, higher for denser/darker-green cover."],
  },
  PSRI: {
    label: "PSRI plant senescence / stress",
    // ⚠️ (2026-08-14) اتصلح: كان متكتوب هنا تدرّج أخضر->أصفر->أحمر (زي
    // "RdYlGn" معكوس) بينما الكولورماب الحقيقي المستخدم فعليًا لـ PSRI في
    // getIndexPreviewStyle هو "rdbu_r" (نفس المستخدم في SIPI فوق) —
    // ديفيرجينج أزرق->أبيض->أحمر، من غير أي أخضر خالص. التدرّج هنا اتصلح
    // عشان يطابق فعليًا اللي بيتلوّن على الخريطة.
    gradient: "linear-gradient(90deg,#053061,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b,#67001f)",
    min: "-0.2 = healthy, high chlorophyll (blue)",
    mid: "~0 (white/tan)",
    max: "+0.2 = senescent / stressed / low chlorophyll (red)",
    meaning: ["(Red − Blue) / RedEdge2 (Merzlyak et al. 1999) — ratio of carotenoid- to chlorophyll-sensitive reflectance, tracking leaf senescence and fruit ripening. Needs B06 (RedEdge2), so Sentinel-2 only, same as RECI.", "Typical healthy-canopy range is roughly -0.1..0, rising toward +0.2 as leaves senesce or canopy is under stress — opposite sign convention from NDVI-style indices, where higher usually means healthier."],
  },
  NBRI: {
    label: "NBRI burn severity",
    // ⚠️ (2026-08-13) نفس "rdylgn" اللي NDVI/MSAVI2/VARI بتستخدمه — لازم
    // تفضل مطابقة لـ colormap الحقيقي في getIndexPreviewStyle (SatelliteDataPanel.tsx)
    // عشان اللون هنا في اللجند يطابق فعليًا اللي ظاهر على الخريطة.
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "burned / severe damage",
    mid: "unburned baseline",
    max: "healthy / dense vegetation",
    meaning: ["(NIR − SWIR2) / (NIR + SWIR2) — same normalized-difference shape as NDVI, using B08/B12 (Sentinel-2) or nir08/swir22 (Landsat) instead of NIR/Red.", "Low/negative values flag recently burned or bare ground (low NIR, high SWIR2 from ash/exposed soil); high values indicate healthy, moisture-retaining vegetation. Comparing pre- and post-fire NBRI (dNBR) is the standard way to map burn severity, but this single-date version already highlights likely burn scars."],
  },
  MSI: {
    label: "MSI moisture stress",
    // colormap الحقيقي (getIndexPreviewStyle) هو "rdbu_r" زي RECI/GCI —
    // ديفيرجينج أزرق(صحي)->أحمر(إجهاد)، مش تسلسلي.
    gradient: "linear-gradient(90deg,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b)",
    min: "0.2 = wet / low stress (blue)",
    mid: "~1 = moderate",
    max: "2+ = severe water stress (red)",
    meaning: ["SWIR1/NIR simple ratio (B11/B08) — unlike NDMI (same two bands, normalized-difference shape), MSI is a plain ratio and is NOT bounded to -1..1.", "Rises as canopy/soil moisture drops (SWIR1 absorption weakens relative to NIR reflectance); best read alongside NDMI rather than in isolation."],
  },
  NDSI: {
    label: "NDSI snow/ice cover",
    // colormap الحقيقي "rdbu" (مش معكوس) — قيمة عالية (ثلج/جليد) = أزرق، زي NDWI للمية.
    gradient: "linear-gradient(90deg,#67001f,#d6604d,#fddbc7,#d1e5f0,#4393c3,#2166ac)",
    min: "-0.2 = no snow/ice",
    mid: "~0.2 (mixed/ambiguous)",
    max: "0.6+ = snow/ice cover (blue)",
    meaning: ["(Green − SWIR1) / (Green + SWIR1), B03/B11 — snow/ice reflects strongly in visible but absorbs strongly in SWIR1, which drives the normalized difference up.", "Literature threshold for confident snow/ice presence is typically NDSI > 0.4; values below that are more likely clouds, bare rock, or mixed pixels."],
  },
  OSI: {
    label: "OSI oil spill index (optical, heuristic)",
    // colormap "rdbu_r" زي MSI/RECI — قيمة منخفضة = مية نضيفة (أزرق)، قيمة
    // عالية = احتمال بقعة زيت/شريط سطحي (أحمر).
    gradient: "linear-gradient(90deg,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b)",
    min: "clean water (blue)",
    mid: "ambiguous / sun-glint risk",
    max: "possible oil sheen (red)",
    meaning: ["Visible-only ratio (Blue,Green,Red — B02/B03/B04) built on the idea that a thin oil film raises visible reflectance and flattens the water's usual blue>green>red spectral slope. ⚠️ There isn't one single agreed optical OSI formula in the literature (unlike NDVI) — treat this as a heuristic screening layer, not a validated detector.", "⚠️ Optical (Sentinel-2) oil-spill detection is fundamentally weaker than SAR: sun-glint, foam, algae blooms, and shallow-water turbidity all produce a similar visible signature. Sentinel-1 VV/VH (already in this pipeline) is the more reliable source for actual spill mapping — use OSI only as a quick optical cross-check, and confirm anything it flags against a same-date SAR pass before reporting it."],
  },
  RENDVI: {
    label: "RENDVI red-edge NDVI",
    // نفس شكل normalized-difference زي NDRE (colormap "spectral_r" في
    // getIndexPreviewStyle) — بس هنا الاتنين bands red-edge (B06,B05) مش
    // NIR/RedEdge زي NDRE، فأدق حتى من NDRE في تمييز إجهاد الكلوروفيل المبكر.
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "low chlorophyll (red/orange)",
    mid: "moderate (yellow)",
    max: "high chlorophyll (blue)",
    meaning: ["(RedEdge2 − RedEdge1) / (RedEdge2 + RedEdge1) — B06/B05. Same normalized-difference shape as NDRE, but built entirely from the red-edge region instead of swapping in NIR, so it's even more sensitive to early chlorophyll/nitrogen stress before it shows up in NDVI or NDRE.", "Same B05/B06 dependency as NDRE/RED_EDGE — Sentinel-2 only, Landsat has no red-edge band."],
  },
  REIP: {
    label: "REIP red-edge inflection point (nm, classic)",
    // ⚠️ نفس فكرة RED_EDGE (S2REP) فوق — قيمة طول موجي بالنانومتر مش
    // normalized-difference — لكن دي معادلة مختلفة (Guyot & Baret 1988
    // الكلاسيكية) مش Frampton et al. 2013. نفس colormap/مدى زي RED_EDGE
    // (spectral_r، ~700-740nm) عشان الاتنين بيتقروا بنفس المنطق.
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "~700nm (stressed/sparse)",
    mid: "~715nm (moderate)",
    max: "~730-740nm (dense, high chlorophyll)",
    meaning: ["Guyot & Baret (1988) classic linear formula: 700 + 40 × ((Red+RedEdge3)/2 − RedEdge1) / (RedEdge2 − RedEdge1), using B04/B05/B06/B07. Same four bands and output range as RED_EDGE (S2REP), but a different — older — set of coefficients, so the two won't produce identical pixel values even on the same scene.", "Same interpretation direction as RED_EDGE: higher wavelength (toward 730-740nm) means more canopy chlorophyll/nitrogen, and it tends not to saturate on dense mature canopy the way NDVI/NDRE do."],
  },
  NMDI_SOIL: {
    label: "NMDI soil moisture (drought)",
    // "rdbu_r" زي MSI/OSI — قيمة منخفضة = رطب (أزرق)، قيمة عالية = جاف (أحمر).
    gradient: "linear-gradient(90deg,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b)",
    min: "~0.15 = wet soil (blue)",
    mid: "~0.5 (mixed)",
    max: "0.85+ = extreme soil drought (red)",
    meaning: ["Wang & Qu (2007): (NIR − (SWIR1 − SWIR2)) / (NIR + (SWIR1 − SWIR2)), B08/B11/B12 — uses the slope between two liquid-water absorption bands (1640nm, 2130nm) instead of one, giving stronger drought sensitivity than a single-SWIR index like NDMI/MSI.", "Reads correctly on bare or sparsely vegetated ground: rising NMDI means the soil surface is drying out. Over a canopy with LAI ≳ 2 the same formula instead tracks vegetation water content — see NMDI_VEG, which shares this exact calculation but reads the opposite direction."],
  },
  NMDI_VEG: {
    label: "NMDI vegetation water content",
    // "rdbu" (مش معكوس) زي NDSI — قيمة عالية = رطب/صحي (أزرق)، قيمة منخفضة =
    // إجهاد مائي (أحمر). عكس NMDI_SOIL عمدًا لإن نفس القيمة بتتقرا بعكس الاتجاه.
    gradient: "linear-gradient(90deg,#b2182b,#d6604d,#f4a582,#fddbc7,#d1e5f0,#4393c3,#2166ac)",
    min: "low = severe canopy water stress (red)",
    mid: "moderate",
    max: "high = well-watered canopy (blue)",
    meaning: ["Same Wang & Qu (2007) formula as NMDI_SOIL — (NIR − (SWIR1 − SWIR2)) / (NIR + (SWIR1 − SWIR2)), B08/B11/B12 — but read in the opposite direction: on heavily vegetated ground (LAI ≳ 2) it behaves as a canopy water-content index rather than a soil-moisture index.", "Most reliable over dense, closed canopy; on bare or sparse ground the same pixel value is better read as NMDI_SOIL instead. Best interpreted alongside NDMI/MSI rather than in isolation."],
  },
  ARI: {
    label: "ARI anthocyanin pigment",
    // "rdbu_r" زي PSRI (senescence) — قيمة منخفضة = كلوروفيل غالب/أخضر سليم
    // (أزرق)، قيمة عالية = أنثوسيانين مرتفع (أحمر/بنفسجي — إجهاد/شيخوخة/نضج ثمار).
    gradient: "linear-gradient(90deg,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b)",
    min: "~0 = minimal anthocyanin (blue)",
    mid: "~0.1 (moderate)",
    max: "0.2+ = high anthocyanin content (red)",
    meaning: ["Gitelson et al. (2001): (1/Green) − (1/RedEdge1), B03/B05 — isolates the anthocyanin absorption peak near 550nm by subtracting out the 700nm band, which reflects chlorophyll only, not anthocyanins.", "Rising values flag increasing anthocyanin — useful for plant-stress detection, leaf senescence, autumn foliage change, and fruit-ripeness monitoring. ⚠️ Unlike NDVI-style ratios this is a difference of reciprocals (1/x), so raw DN must be converted to true reflectance (÷10000) before computing it or the result comes out ~10000× too small — see ANALYSIS_CONFIG.ari in route.ts."],
  },
  ARI2: {
    label: "ARI2 (mARI) anthocyanin, leaf-corrected",
    // نفس منطق ARI فوق (نفس اتجاه القراءة ونفس colormap) — بس مداه أوسع
    // بكتير (0 لحد 8+ بدل 0-0.2) لإنه مضروب في NIR reflectance كمان.
    gradient: "linear-gradient(90deg,#2166ac,#4393c3,#d1e5f0,#fddbc7,#f4a582,#d6604d,#b2182b)",
    min: "~0 = minimal anthocyanin (blue)",
    mid: "~4 (moderate)",
    max: "8+ = high anthocyanin content (red)",
    meaning: ["Modified ARI / ARI2 (Gitelson et al.): ARI × NIR reflectance, B03/B05/B07 — adds the near-infrared band on top of the plain ARI formula to correct for leaf density/thickness (leaf scattering), since a thick or multi-layered canopy scatters more NIR and would otherwise skew the raw ARI reading.", "Same interpretation direction as ARI (rising = more anthocyanin), but the NIR correction makes it more reliable across canopies of different density/thickness — prefer ARI2 over plain ARI when comparing leaves or canopies that differ a lot in structure, not just pigment."],
  },
  CMR: {
    label: "Clay Minerals Ratio (geology)",
    // ⚠️ (2026-08-15) اتصلحت — الـ colormap الفعلي على الخريطة هو "inferno"
    // (getIndexPreviewStyle في SatelliteDataPanel.tsx + defaultColormap في
    // route.ts)، مش الـ amber/brown القديم اللي كان هنا. inferno بيبدأ أسود
    // (قيمة منخفضة) وبيروح بنفسجي->أحمر->برتقالي->أصفر فاتح (قيمة عالية).
    gradient: "linear-gradient(90deg,#000004,#420a68,#932667,#dd513a,#fca50a,#fcffa4)",
    min: "~0.8 = low clay/alunite signal (dark)",
    mid: "~1.5 (moderate)",
    max: "2.5+ = high hydrous-mineral (clay/alunite) signal (bright)",
    meaning: ["ESRI Clay Minerals Ratio: SWIR1/SWIR2 (B11/B12) — hydrous minerals such as clays and alunite absorb strongly in the 2.0–2.3µm portion of the spectrum, so this simple ratio picks out that absorption without needing atmospheric correction (ratios cancel illumination/terrain effects).", "⚠️ Also responds to carbonate mineralization and recently burned areas, which show high SWIR2 reflectance too — treat a high value as \"hydrous/altered mineral signature\", not confirmed clay, without field or hyperspectral follow-up. Sentinel-2's broad SWIR bands are a coarse indicator only; true clay-species discrimination needs a hyperspectral sensor."],
  },
  FMR: {
    label: "Ferrous Minerals Ratio (geology)",
    // ⚠️ (2026-08-15) اتصلحت — الـ colormap الفعلي على الخريطة هو "hot" (زي
    // FIRE/FRP) مش الـ cyan/brown القديم اللي كان هنا (مالوش أي علاقة بـ
    // hot). "hot" بيبدأ أسود (قيمة منخفضة) وبيروح أحمر->برتقالي->أصفر->أبيض
    // (قيمة عالية) — نفس التدرّج المستخدم فعليًا في getIndexPreviewStyle
    // و defaultColormap في route.ts.
    gradient: "linear-gradient(90deg,#000000,#660000,#ff0000,#ff8000,#ffff00,#ffffff)",
    min: "~0.2 = low iron-oxide signal (dark)",
    mid: "~1 (moderate)",
    max: "2+ = strong ferrous/iron-oxide signal (bright/white)",
    meaning: ["ESRI Ferrous Minerals Ratio (Segal 1982): SWIR1/NIR (B11/B08) — highlights iron-bearing minerals by ratioing the SWIR band against NIR. ⚠️ Numerically identical formula/bands to MSI above — same calculation, read here as a geology signal (iron oxide content in bare rock/soil) instead of a vegetation moisture-stress signal.", "Most meaningful over exposed rock or bare/sparsely vegetated ground; on dense canopy the same value is better read as MSI (moisture stress) instead — pick whichever legend matches what's actually on the ground in your AOI."],
  },
  IOI: {
    label: "Iron Oxide ratio (geology)",
    // "magma" (زي THERMAL) — مؤكد موجود، تدرّج أسود->بنفسجي->برتقالي->أصفر
    // مناسب لإشارة أكسيد الحديد (لون الصدأ/الهيماتيت).
    gradient: "linear-gradient(90deg,#0f172a,#6b21a8,#db2777,#f97316,#facc15)",
    min: "~0.8 = low iron-oxide exposure",
    mid: "~1.5 (moderate)",
    max: "2.5+ = strong hematite/goethite signal",
    meaning: ["ESRI Iron Oxide ratio: Red/Blue (B04/B02) — limonitic iron-oxide alteration and iron-bearing phyllosilicates absorb strongly in the blue and reflect more in red, so this simple ratio picks up surface iron staining/alteration without atmospheric correction (ratios self-cancel illumination).", "Complements FMR/CMR above for mineral exploration: IOI targets surface oxidation staining specifically, while FMR targets broader iron-bearing minerals and CMR targets clay/hydrous alteration — the three together give a rough alteration-mineral picture, not a substitute for hyperspectral or field confirmation."],
  },
  NDCI: {
    label: "NDCI chlorophyll-a (turbid water)",
    // "turbo" — نفس colormap SST/CHLOROPHYLL (Sentinel-3) بالظبط، عشان يتقري
    // بنفس المنطق: قيمة منخفضة = مية صافية، قيمة عالية = تركيز كلوروفيل عالي/bloom.
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a2fc3c,#fabb31,#e4460a,#7a0403)",
    min: "-0.2 = clear water, minimal chlorophyll-a",
    mid: "~0 (moderate)",
    max: "0.4+ = high chlorophyll-a / algal bloom",
    meaning: ["Mishra & Mishra (2012): (RedEdge1-Red)/(RedEdge1+Red), B05/B04 — normalized-difference chlorophyll index calibrated for estuarine and coastal turbid, productive (case-2) waters where standard ocean-color chlorophyll algorithms break down.", "Designed for water pixels specifically — mask out land/vegetation first (e.g. with NDWI) since NDCI on terrestrial vegetation just reads as a weaker version of NDRE, not a meaningful chlorophyll-a estimate."],
  },
  FAI: {
    label: "FAI floating algae / surface vegetation",
    // Sequential أزرق(مية نضيفة)->أخضر(طحالب) — بديهي لموضوع الطحالب العائمة.
    gradient: "linear-gradient(90deg,#022c43,#04628a,#1f9bb5,#7fd1c9,#a6d96a,#238443)",
    min: "negative = open water, no floating material",
    mid: "~0 (baseline / threshold zone)",
    max: "positive = floating algae / vegetation mat",
    meaning: ["Hu (2009): FAI = NIR − NIR′, where NIR′ is a linear baseline interpolated between Red and SWIR1 at the NIR wavelength (B08 − [B04 + (B11−B04)×(λNIR−λRed)/(λSWIR1−λRed)]). Floating vegetation/algae reflects far more strongly in NIR than the Red–SWIR1 baseline predicts, so it stands out as a positive spike; open water sits close to zero or slightly negative.", "⚠️ Threshold-dependent and scene-specific — published Sentinel-2 studies use thresholds around 0.05-0.07 to separate floating algae from water, but sun-glint, thin clouds, and turbid sediment can also push FAI positive. Cross-check flagged areas visually (RGB) before treating a bloom as confirmed."],
  },
  MNDWI: {
    label: "MNDWI water body extraction",
    // "rdbu" زي NDWI — قيمة عالية = مية (أزرق)، قيمة منخفضة = يابسة (أحمر).
    gradient: "linear-gradient(90deg,#67001f,#d6604d,#fddbc7,#d1e5f0,#4393c3,#053061)",
    min: "low = built-up / dry land (red)",
    mid: "~0",
    max: "high = open water (blue)",
    meaning: ["Xu (2006): (Green−SWIR1)/(Green+SWIR1), B03/B11 — ⚠️ numerically identical formula/bands to NDSI above (same calculation), read here as a water-extraction signal instead of snow/ice. SWIR1 absorption by water is much stronger than green reflectance loss, so open water pushes this ratio strongly positive.", "Generally outperforms standard NDWI (Green/NIR) for suppressing built-up-area false positives, since SWIR1 also absorbs strongly over urban surfaces — best read alongside NDWI rather than in isolation, and note the NDSI overlap if the AOI has both water and snow/ice."],
  },
  GEMI: {
    label: "GEMI soil-adjusted, atmosphere-resistant vegetation",
    gradient: "linear-gradient(90deg,#8b0000,#e31a1c,#fd8d3c,#ffe600,#a6d96a,#31a354,#006837)",
    min: "bare soil / non-vegetated",
    mid: "moderate cover",
    max: "dense, healthy canopy",
    meaning: ["Pinty & Verhoef (1992): a two-step non-linear function of NIR/Red reflectance (η = [2(NIR²−Red²)+1.5·NIR+0.5·Red]/(NIR+Red+0.5); GEMI = η(1−0.25η) − (Red−0.125)/(1−Red)), B08/B04. Designed to stay stable across varying atmospheric conditions (aerosol/water-vapor content) where NDVI drifts scene-to-scene.", "Needs true reflectance (0–1) rather than raw DN — the additive 0.125/1 constants are calibrated to that scale, unlike simple-ratio or normalized-difference indices which are scale-invariant."],
  },
  MCARI: {
    label: "MCARI chlorophyll absorption (soil/PAR resistant)",
    gradient: "linear-gradient(90deg,#d94801,#fd8d3c,#fed976,#78c679,#238443)",
    min: "low chlorophyll absorption / sparse cover",
    mid: "moderate",
    max: "high chlorophyll absorption, dense canopy",
    meaning: ["Daughtry et al. (2000): [(R700−R670) − 0.2×(R700−R550)] × (R700/R670), B05/B04/B03 — combines a red-edge/red difference (chlorophyll absorption depth) with a green correction term (removes non-photosynthetic/soil background influence) and a ratio multiplier (further suppresses soil brightness).", "Needs true reflectance (÷10000), same reasoning as CVI/TVI/MTVI — the difference-times-ratio shape is not scale-invariant. Often paired with OSAVI (MCARI/OSAVI) to further reduce residual soil sensitivity; used standalone here."],
  },
  CRI1: {
    label: "CRI1 carotenoid pigment",
    // "rdbu_r" زي ARI عمدًا — نفس منطق فرق الـ reciprocals.
    gradient: "linear-gradient(90deg,#053061,#4393c3,#d1e5f0,#fddbc7,#d6604d,#67001f)",
    min: "low carotenoid signal (blue)",
    mid: "moderate",
    max: "high carotenoid signal (red)",
    meaning: ["Gitelson et al. (2002): (1/R510) − (1/R550) — approximated on Sentinel-2 as (1/Blue) − (1/Green), B02/B03. Isolates carotenoid pigment absorption near 510nm by subtracting out the overlapping absorption at 550nm.", "⚠️ Difference of reciprocals (1/x) like ARI above, not a direct ratio — needs reflectance normalization (÷10000) before dividing, or the result explodes far outside its literature range."],
  },
  CRI2: {
    label: "CRI2 carotenoid pigment (canopy-corrected)",
    gradient: "linear-gradient(90deg,#053061,#4393c3,#d1e5f0,#fddbc7,#d6604d,#67001f)",
    min: "low carotenoid signal (blue)",
    mid: "moderate",
    max: "high carotenoid signal (red)",
    meaning: ["Gitelson et al. (2002): (1/R510) − (1/R700) — approximated on Sentinel-2 as (1/Blue) − (1/RedEdge1), B02/B05. Same carotenoid-isolation idea as CRI1, but substitutes the red-edge (~700nm) band for green (~550nm), making it more robust on denser canopies where CRI1 saturates.", "Same reciprocal-difference caveat as CRI1 — needs reflectance normalization (÷10000), not raw DN. Best read alongside CRI1: a large gap between the two often indicates canopy structure effects rather than pigment differences alone."],
  },
  CI: {
    label: "CI cyanobacteria index (harmful algal bloom, water)",
    // "turbo" زي NDCI/CHLOROPHYLL عمدًا — نفس منطق تركيز الصبغة.
    gradient: "linear-gradient(90deg,#30123b,#4662d7,#36aaf9,#1ae4b6,#a2fc3c,#fabb31,#e4460a,#7a0403)",
    min: "negative = no bloom signal / clear water",
    mid: "~0 (baseline)",
    max: "positive = cyanobacteria bloom signal",
    meaning: ["Wynne et al. (2008): baseline-subtraction ('spectral shape') around the ~681nm phycocyanin/chlorophyll fluorescence feature, originally built for MERIS/OLCI's exact 665/681/709nm bands. ⚠️ Sentinel-2 has no band at 681nm, so this is an approximation using B04/B05/B06 (665/705/740nm) — CI = [Red + (RedEdge2−Red)×(705−665)/(740−665)] − RedEdge1, i.e. how far actual reflectance at 705nm dips below the Red→RedEdge2 baseline.", "Because it substitutes a different wavelength than the original algorithm targets, treat this as a coarse bloom-presence indicator rather than the validated Wynne CI — cross-check flagged water pixels with RGB/NDCI/turbidity before reporting a confirmed cyanobacteria bloom, and mask out land first (e.g. with NDWI/MNDWI)."],
  },
  EVI2: {
    label: "EVI2 two-band enhanced vegetation",
    gradient: "linear-gradient(90deg,#2c0735,#c71585,#ff6347,#ffa500,#ffd700,#ffff66)",
    min: "sparse",
    mid: "moderate",
    max: "dense canopy",
    meaning: ["Jiang et al. (2008): 2.5×(NIR−Red)/(NIR+2.4×Red+1), B08/B04 — a two-band simplification of EVI that drops the Blue-band atmospheric correction term, so it works when Blue isn't available or is noisy, at the cost of some aerosol resistance.", "Tracks the standard 3-band EVI closely on most scenes; the two diverge mainly under heavy atmospheric haze, where EVI's Blue-based correction still has an edge."],
  },
  MTCI: {
    label: "MTCI chlorophyll (MERIS-heritage, Sentinel-2 approximation)",
    // "spectral_r" زي NDRE/RECI/RENDVI عمدًا — نفس منطق كلوروفيل الـ red-edge.
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "low chlorophyll (red/orange)",
    mid: "moderate (yellow)",
    max: "high chlorophyll (blue)",
    meaning: ["Dash & Curran (2004): (R753−R709)/(R709−R681) on MERIS — approximated on Sentinel-2 as (RedEdge2−RedEdge1)/(RedEdge1−Red), B06/B05/B04 (740/705/665nm substituting for 753/709/681nm). A difference-over-difference ratio, so it's scale-invariant like RECI/GCI — no reflectance normalization needed.", "Designed to stay linear with canopy chlorophyll content further into high-biomass conditions than NDVI/NDRE, which saturate earlier — useful for dense, mature canopy where those two have already flattened out."],
  },
  NDVI705: {
    label: "NDVI705 red-edge NDVI (Gitelson & Merzlyak)",
    // نفس تدرّج RENDVI بالظبط — نفس المعادلة، اسم تاني بس.
    gradient: "linear-gradient(90deg,#d73027,#fdae61,#ffffbf,#a6d96a,#4575b4,#313695)",
    min: "low chlorophyll (red/orange)",
    mid: "moderate (yellow)",
    max: "high chlorophyll (blue)",
    meaning: ["Gitelson & Merzlyak (1994): (R750−R705)/(R750+R705), approximated on Sentinel-2 as (RedEdge2−RedEdge1)/(RedEdge2+RedEdge1), B06/B05. ⚠️ Numerically identical formula/bands to RENDVI above — same calculation, kept as a separate dropdown entry under the more widely-cited literature name, same reasoning as MNDWI/NDSI sharing one formula.", "Same early chlorophyll/nitrogen-stress sensitivity as RENDVI — Sentinel-2 only, Landsat has no red-edge band."],
  },
  NDTI: {
    label: "NDTI water turbidity",
    // "salinity_clear" زي SI عمدًا (تيل صافي -> ذهبي -> أحمر عكارة عالية) —
    // نفس التدرّج المستخدم فعليًا في getIndexPreviewStyle.
    gradient: "linear-gradient(90deg,#0891b2,#67e8f9,#fde68a,#f59e0b,#dc2626)",
    min: "low turbidity / clear water",
    mid: "moderate",
    max: "high turbidity / suspended sediment",
    meaning: ["Lacaux et al. (2007): (Red−Green)/(Red+Green), B04/B03 — suspended sediment scatters more strongly in red than green, so this ratio rises with turbidity. Same normalized-difference shape as NDVI/NDWI, scale-invariant, no ÷10000 needed.", "⚠️ Different index from the SWIR-based 'Normalized Difference Tillage Index' that shares the same acronym in some agriculture literature — this one targets water turbidity specifically, not crop residue/tillage. Mask out land first (e.g. with NDWI/MNDWI) since NDTI on vegetation or bare soil isn't a meaningful turbidity reading."],
  },
  TCARI: {
    label: "TCARI chlorophyll absorption (transformed)",
    gradient: "linear-gradient(90deg,#d94801,#fd8d3c,#fed976,#78c679,#238443)",
    min: "low chlorophyll absorption / sparse cover",
    mid: "moderate",
    max: "high chlorophyll absorption, dense canopy",
    meaning: ["Haboudane et al. (2002): 3×[(R700−R670) − 0.2×(R700−R550)×(R700/R670)], B05/B04/B03 — a companion to MCARI above with the same three bands, but the soil-correction term (0.2×(R700−R550)) is scaled by the ratio only, not the whole bracket, giving it different soil/PAR sensitivity than MCARI.", "Needs true reflectance (÷10000), same reasoning as MCARI/CVI/TVI — the difference-times-ratio shape is not scale-invariant. In the literature TCARI is most often paired as a TCARI/OSAVI ratio to further cancel soil background; used standalone here, same treatment as MCARI."],
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
  // ⚠️ (2026-08-05) اتحوّلت من true-color composite (3 قنوات RGB مع بعض) لـ
  // heatmap بقناة واحدة (Oa08 reflectance ~665nm، مؤشّر شائع للعكارة/الرواسب
  // العالقة) — الـ composite القديم كان بيفشل (400) على مسار TiTiler المباشر
  // لإن كل قناة NetCDF منفصلة محتاجة "variable=" خاصة بيها، ومسار الـ decode
  // بيدّي متغير واحد بس لكل طلب. شوفي usesDecodeHeatmapPath في
  // SatelliteDataPanel.tsx.
  OCEAN_COLOR: {
    label: "Ocean turbidity / reflectance (Oa08, ~665nm)",
    gradient: "linear-gradient(90deg,#022c43,#04628a,#1f9bb5,#7fd1c9,#fef0d9,#fdae61,#d73027)",
    min: "clear / low reflectance",
    mid: "moderate turbidity",
    max: "high turbidity / sediment",
    meaning: ["Single-band OLCI red reflectance (~665nm), a common visual proxy for suspended sediment and turbidity — not a true-color image anymore.", "High values near coasts/river mouths usually mean sediment plumes rather than algae; compare with CHLOROPHYLL for blooms specifically."],
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
};