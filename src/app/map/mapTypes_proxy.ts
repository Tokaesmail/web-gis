// ─── mapTypes.ts ──────────────────────────────────────────────────────────────

export type DrawTool =
  | "pointer"
  | "polygon"
  | "rectangle"
  | "circle"
  | "measure"
  | "marker"
  | "coordinates";export type CaptureTarget = "small" | "large";

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface CaptureMetadata {
  areaName:   string;
  areaSizeHa: number;
  zoom:       number;
  capturedAt: string;
}

export interface CaptureBounds {
  north: number;
  south: number;
  east:  number;
  west:  number;
}

export interface CaptureResult {
  captureTarget: CaptureTarget;
  smallUrl?: string;
  largeUrl?: string;
  rawSelectedUrl?: string;
  smallBlob?: Blob;
  largeBlob?: Blob;
  rawSelectedBlob?: Blob;
  selectedCoordinates: LatLngPoint[];
  viewportCoordinates: LatLngPoint[];
  selectedBounds: CaptureBounds;
  viewportBounds: CaptureBounds;
  metadata: CaptureMetadata;
}

// ─── Satellite Layers ─────────────────────────────────────────────────────────
export const SAT_LAYERS = {
  "Default": {
    url:            "/api/tile/{z}/{x}/{y}?source=satellite",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "Tiles © Esri",
    maxZoom:        22,
    maxNativeZoom:  23,
  },
  "Google": {
    url:            "/api/tile/{z}/{x}/{y}?source=google_sat",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "Imagery © Google",
    maxZoom:        22,
    maxNativeZoom:  21,
  },
  "Sentinel-2": {
    url:            "/api/tile/{z}/{x}/{y}?source=sentinel",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "Sentinel-2 cloudless 2021 © EOX",
    maxZoom:        22,
    maxNativeZoom:  16,
  },
  "Street Map": {
    url:            "/api/tile/{z}/{x}/{y}?source=osm",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "© OpenStreetMap contributors",
    maxZoom:        22,
    maxNativeZoom:  19,
  },
  "Terrain": {
    url:            "/api/tile/{z}/{x}/{y}?source=terrain",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "Shaded Relief © Esri",
    maxZoom:        22,
    maxNativeZoom:  13,
  },
};

// ─── Labels Layer ─────────────────────────────────────────────────────────────
export const LABELS_TILE_URL = "/api/tile/{z}/{x}/{y}?source=labels";

export type SatKey = keyof typeof SAT_LAYERS;
export type IdxKey = string; // kept for type compatibility