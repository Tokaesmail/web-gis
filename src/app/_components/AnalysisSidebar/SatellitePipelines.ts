export type SatelliteViewerMode = "multispectral" | "analysis" | "download";
export type SatelliteAnalysisType =
  | "RGB"
  | "NDVI"
  | "NDWI"
  | "NDMI"
  | "NDBI"
  | "SAVI"
  | "EVI"
  | "BSI";

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
};