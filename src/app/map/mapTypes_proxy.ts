// ─── mapTypes.ts ──────────────────────────────────────────────────────────────

export type DrawTool = "pointer" | "polygon" | "rectangle" | "circle" | "measure" | "marker";

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

// ─── Satellite Layers ─────────────────────────────────────────────────────────
// URL بتاخد ?source= عشان الـ proxy يعرف يجيب إيه
// لازم نستخدم الـ proxy لجميع الطبقات عشان الـ CORS وقت الـ Capture
export const SAT_LAYERS = {
  "Default": {
    url:            "/api/tile/{z}/{x}/{y}?source=satellite",
    type:           "xyz" as const,
    layers:         "",
    attribution:    "Tiles © Esri",
    maxZoom:        22,
    maxNativeZoom:  18,
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

// ─── Labels Layer (عبر الـ proxy كمان) ───────────────────────────────────────
export const LABELS_TILE_URL = "/api/tile/{z}/{x}/{y}?source=labels";

// ─── Index Tiles ──────────────────────────────────────────────────────────────
export const INDEX_TILES: Record<string, { url: string; color: string; desc: string; maxZoom: number; maxNativeZoom: number; opacity: number }> = {
  "RGB":  { url: "",    color: "#e2e8f0", desc: "True Color",           maxZoom: 18, maxNativeZoom: 16, opacity: 1    },
  "NDVI": { 
    url: "/api/tile/{z}/{x}/{y}?source=satellite",
    color: "#22c55e", 
    desc: "Vegetation", 
    maxZoom: 22,
    maxNativeZoom: 18,
    opacity: 0.8 
  },
  "NDWI": { 
    url: "/api/tile/{z}/{x}/{y}?source=labels", 
    color: "#38bdf8", 
    desc: "Water", 
    maxZoom: 22,
    maxNativeZoom: 19,
    opacity: 0.85 
  },
  "NDSI": { url: "/api/tile/{z}/{x}/{y}?source=topo",        color: "#e0f2fe", desc: "Terrain",   maxZoom: 22, maxNativeZoom: 19, opacity: 0.75 },
  "SWIR": { url: "/api/tile/{z}/{x}/{y}?source=satellite",         color: "#fb923c", desc: "Satellite", maxZoom: 22, maxNativeZoom: 19, opacity: 0.9  },
};

export type SatKey = keyof typeof SAT_LAYERS;
export type IdxKey = keyof typeof INDEX_TILES;