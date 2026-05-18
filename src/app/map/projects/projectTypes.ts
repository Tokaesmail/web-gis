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

export type ProjectSnapshot = {
  aoiGeometry: GeoJSON.Geometry | null;
  selectedLayers: MapLayer[];
  uploadedGeoJsonMap: Record<string, GeoJSON.FeatureCollection>;
  selectedDatasets: string[];
  timeRange: ProjectTimeRange;
  analysisSettings: ProjectAnalysisSettings;
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
