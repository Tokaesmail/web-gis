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
// ⚠️ Default / Street Map / Terrain بيتكلموا مباشرة مع المصدر (مش عن طريق /api/tile)
// لأن Esri و OpenStreetMap بيبعتوا CORS headers أصلًا، فمفيش داعي نستهلك من كوتة
// Vercel Fast Origin Transfer عشانهم. Google و Sentinel-2 فضلوا عن طريق الـ proxy
// لأنهم محتاجينه فعلًا (حظر hotlinking / CORS مش مضمون).
export const SAT_LAYERS = {
  "Default": {
    url:            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
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
    url:            "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "© OpenStreetMap contributors",
    maxZoom:        22,
    maxNativeZoom:  19,
  },
  "Terrain": {
    url:            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "Shaded Relief © Esri",
    maxZoom:        22,
    maxNativeZoom:  13,
  },
};

// ─── Labels Layer ─────────────────────────────────────────────────────────────
// مباشر برضه (نفس سبب Default) — الـ LeafletMap.tsx بقى بيستخدم الرابط ده مباشرة،
// بس سايباه هنا للتوافق لو أي مكان تاني بيعمل import ليه.
export const LABELS_TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";

export type SatKey = keyof typeof SAT_LAYERS;
export type IdxKey = string; // kept for type compatibility