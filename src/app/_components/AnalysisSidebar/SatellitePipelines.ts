export type SatelliteViewerMode = "multispectral" | "analysis" | "download";
export type SatelliteAnalysisType = "RGB" | "NDVI" | "NDWI" | "NDMI" | "SWIR";

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
    key: "analysis",
    label: "Analysis Module",
    pipeline: "Scene metadata -> indices -> AOI summary",
    desc: "Optional scene interpretation.",
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
    gradient: "linear-gradient(90deg,#7f1d1d,#f59e0b,#fef08a,#84cc16,#166534)",
    min: "-1",
    mid: "0",
    max: "+1",
  },
  NDWI: {
    label: "NDWI water signal",
    gradient: "linear-gradient(90deg,#78350f,#f8fafc,#38bdf8,#075985)",
    min: "dry",
    mid: "mixed",
    max: "water",
  },
  NDMI: {
    label: "NDMI moisture",
    gradient: "linear-gradient(90deg,#7f1d1d,#f59e0b,#38bdf8,#1d4ed8)",
    min: "stress",
    mid: "normal",
    max: "wet",
  },
  SWIR: {
    label: "False color SWIR composite",
    gradient: "linear-gradient(90deg,#1e293b,#7c2d12,#ea580c,#facc15)",
    min: "cool",
    mid: "soil",
    max: "dry",
  },
};
