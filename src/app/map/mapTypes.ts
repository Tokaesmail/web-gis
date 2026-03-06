// ─── mapTypes.ts ──────────────────────────────────────────────────────────────
// كل الـ Types والـ Constants المشتركة في الـ map folder

export type DrawTool = "pointer" | "polygon" | "rectangle" | "circle" | "measure" | "marker";

// ─── LatLng ───────────────────────────────────────────────────────────────────
export interface LatLngPoint {
  lat: number;
  lng: number;
}

// ─── Capture ──────────────────────────────────────────────────────────────────
export interface CaptureMetadata {
  areaName:   string;
  areaSizeHa: number;
  zoom:       number;
  capturedAt: string;   // ISO string
}

// ─── Satellite Layers ─────────────────────────────────────────────────────────
export const SAT_LAYERS = {
  "Default": {
    url:         "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    type:        "xyz" as const,
    layers:      "",
    attribution: "Tiles © Esri",
    maxZoom:     20,
  },
  "Sentinel-2": {
    url:         "https://tiles.maps.eox.at/wms",
    type:        "wms" as const,
    layers:      "s2cloudless-2021_3857",
    attribution: "Sentinel-2 cloudless 2021 © EOX",
    maxZoom:     18,
  },
  "Street Map": {
    url:         "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    type:        "xyz" as const,
    layers:      "",
    attribution: "© OpenStreetMap contributors",
    maxZoom:     19,
  },
  "Terrain": {
    url:         "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
    type:        "xyz" as const,
    layers:      "",
    attribution: "Shaded Relief © Esri",
    maxZoom:     13,
  },
};

// ─── Index Tiles ──────────────────────────────────────────────────────────────
export const INDEX_TILES: Record<string, { url: string; color: string; desc: string; maxZoom: number; opacity: number }> = {
  "RGB": {
    url: "", color: "#e2e8f0", desc: "True Color — ألوان طبيعية", maxZoom: 20, opacity: 1,
  },
  "NDVI": {
    url:     "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    color:   "#22c55e", desc: "NatGeo Vegetation Map", maxZoom: 16, opacity: 0.8,
  },
  "NDWI": {
    url:     "https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}",
    color:   "#38bdf8", desc: "Ocean / Water Layer", maxZoom: 13, opacity: 0.85,
  },
  "NDSI": {
    url:     "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    color:   "#e0f2fe", desc: "Topo / Snow Terrain", maxZoom: 20, opacity: 0.75,
  },
  "SWIR": {
    url:     "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    color:   "#fb923c", desc: "Satellite Imagery Overlay", maxZoom: 20, opacity: 0.9,
  },
};

export type SatKey = keyof typeof SAT_LAYERS;
export type IdxKey = keyof typeof INDEX_TILES;