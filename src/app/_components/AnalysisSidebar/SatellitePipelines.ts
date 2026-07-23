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
  | "OZONE";

// ─── Satellite Sources ────────────────────────────────────────────────────────
// كل مصدر قمر صناعي له الـ indices الخاصة بيه بس (SOURCE_INDICES) — ده اللي
// بيخلي الـ band dropdown في SatelliteDataPanel يعرض RGB/NDVI... لسنتينل-2 وLandsat
// بس، ويعرض VV/VH/Flood/Change لسنتينل-1 وهكذا، بدل ما يعرض كل حاجة مع الكل.
export type SatSource = "sentinel-2" | "landsat" | "sentinel-1" | "cop-dem" | "sentinel-5p";

export const SOURCE_INDICES: Record<SatSource, SatelliteAnalysisType[]> = {
  "sentinel-2": ["RGB", "NDVI", "NDWI", "NDMI", "NDBI", "SAVI", "EVI", "BSI"],
  "landsat":    ["RGB", "NDVI", "NDWI", "NDMI", "NDBI", "SAVI", "EVI", "BSI"],
  "sentinel-1": ["VV", "VH", "RATIO", "SAR_RGB", "FLOOD", "CHANGE"],
  "cop-dem":    ["ELEVATION", "SLOPE", "HILLSHADE", "ASPECT", "CONTOURS"],
  "sentinel-5p": ["NO2", "SO2", "CO", "OZONE"],
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
};

export const SOURCE_META: Record<SatSource, {
  title: string; subtitle: string; resolution: string; cadence: string; color: string;
}> = {
  "sentinel-2": { title: "Sentinel-2", subtitle: "Primary source", resolution: "10m", cadence: "5 days", color: "#22d3ee" },
  "landsat":    { title: "Landsat", subtitle: "Secondary source", resolution: "30m", cadence: "16 days", color: "#f59e0b" },
  "sentinel-1": { title: "Sentinel-1", subtitle: "Radar (SAR)", resolution: "10m", cadence: "6 days", color: "#a78bfa" },
  "cop-dem":    { title: "Copernicus DEM", subtitle: "Elevation model", resolution: "30m", cadence: "static", color: "#94a3b8" },
  "sentinel-5p": { title: "Sentinel-5P", subtitle: "Atmosphere", resolution: "~7km", cadence: "daily", color: "#f472b6" },
};

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
};