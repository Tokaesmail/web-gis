import type { MapLayer } from "../LayerPanel";

export type ProjectTimeRange = {
  from: string;
  to: string;
};

export type ProjectAnalysisSettings = {
  activePanel: string | null;
  captureTarget: string;
  selectedArea?: { name: string; ha: number };
  coords?: { lat: number; lng: number } | null;
};

/** كل analysis بيتعمل على الخريطة — raster calc، satellite preview، change detection */
export type SavedAnalysisConfig = {
  id: string;             // UUID فريد لكل analysis
  type: "raster" | "satellite" | "change-detection";
  name: string;
  indexKey: string;
  expression: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]];
  opacity: number;
  colorRamp: string;
  dataUrl: string;          // الـ PNG data URL المحفوظ
  savedAt: string;
};

export type ProjectSnapshot = {
  aoiGeometry: GeoJSON.Geometry | null;
  selectedLayers: MapLayer[];
  uploadedGeoJsonMap: Record<string, GeoJSON.FeatureCollection>;
  selectedDatasets: string[];
  timeRange: ProjectTimeRange;
  analysisSettings: ProjectAnalysisSettings;
  drawnFeatures?: GeoJSON.Feature[];
  savedAnalyses?: SavedAnalysisConfig[];  // ← الـ analyses المحفوظة
};

export type UserProject = {
  id: string;
  name: string;
  description: string;
  ownerKey: string;
  createdAt: string;
  updatedAt: string;
  snapshot: ProjectSnapshot;
};

export type ProjectDraft = {
  name: string;
  description: string;
  snapshot: ProjectSnapshot;
};

export type ProjectStorageMode = "remote" | "local";