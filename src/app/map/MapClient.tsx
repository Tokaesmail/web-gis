"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useLang } from "../_components/translations";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";
import AIAssistant from "../_components/AIAssistant/AIAssistant";

import { DrawTool, SatKey, IdxKey, CaptureResult, CaptureTarget } from "./mapTypes_proxy";
import MapNavbar from "./MapNavbar";
import MapToolbar from "./MapToolbar";
import MapSearch from "./MapSearch";
import MapLayerBar from "./MapLayerBar";
import LeafletMap from "./LeafletMap";
import CoordsPopup from "./CoordsPopup";
import AITriggerButton from "./AITriggerButton";
import Mapbox3DView from "./Mapbox3DView";
import LayerPanel, { MapLayer } from "./LayerPanel";
import ExportButton from "./ExportButton";
import ProjectStartDialog from "./projects/ProjectStartDialog";
import { updateProject } from "./projects/projectStorage";
import type { ProjectSnapshot, UserProject } from "./projects/projectTypes";

const UPLOADED_GEOJSON_STORAGE_KEY = "uploaded_geojson_v1";
const EXTRUSION_CFG_STORAGE_KEY    = "uploaded_geojson_extrusion_cfg_v1";
const LAYER_SETTINGS_STORAGE_PREFIX = "gis_layer_settings_v1";
const MAX_LOCAL_GEOJSON_STORAGE_CHARS = 2_000_000;

type RasterPreviewConfig = {
  name: string;
  indexKey: IdxKey;
  expression: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]];
  opacity: number;
  colorRamp: string;
  dataUrl: string;
};

type SatellitePreviewConfig = {
  source: "sentinel-2" | "landsat";
  satKey: SatKey;
  band: IdxKey;
  dateFrom: string;
  dateTo: string;
  cloudCover: number;
  opacity: number;
  scenePreview?: {
    name: string;
    band: IdxKey;
    expression: string | null;
    assets: string[];
    assetUrls: Record<string, string>;
    bounds: [[number, number], [number, number]];
    coords: { lat: number; lng: number };
    previewUrl?: string;
    overviewUrl?: string;
    geometry?: GeoJSON.Geometry | null;
  };
};

function persistUploadedGeoJSON(map: Record<string, any>, onSkipped?: () => void) {
  try {
    const payload = JSON.stringify(map);
    if (payload.length > MAX_LOCAL_GEOJSON_STORAGE_CHARS) {
      localStorage.removeItem(UPLOADED_GEOJSON_STORAGE_KEY);
      onSkipped?.();
      return false;
    }

    localStorage.setItem(UPLOADED_GEOJSON_STORAGE_KEY, payload);
    return true;
  } catch (error) {
    console.warn("Uploaded GeoJSON could not be saved locally:", error);
    try { localStorage.removeItem(UPLOADED_GEOJSON_STORAGE_KEY); } catch {}
    onSkipped?.();
    return false;
  }
}

export default function MapPage() {
  const { t, isRTL } = useLang();
  const { data: session, status: sessionStatus } = useSession();
  const [aiOpen,           setAiOpen]           = useState(false);
  const [isFullscreen,     setIsFullscreen]      = useState(false);
  const [activeTool,       setActiveTool]        = useState<DrawTool>("pointer");
  const [captureTarget,    setCaptureTarget]     = useState<CaptureTarget>("small");
  const [selectedArea,     setSelectedArea]      = useState({ name: "Selected Area", ha: 0 });
  const [coords,           setCoords]            = useState<{ lat: number; lng: number } | null>(null);
  const [captureUrl,       setCaptureUrl]        = useState<string | null>(null);
  const [captures,         setCaptures]          = useState<any[]>([]);
  const [selectedFeature,  setSelectedFeature]   = useState<any>(null);
  const [view3D,           setView3D]            = useState<{ lat: number; lng: number; name?: string; geojson?: GeoJSON.FeatureCollection } | null>(null);
  const [activePanel,      setActivePanel]       = useState<string | null>("overview");
  const [projectStartOpen, setProjectStartOpen]  = useState(true);
  const [activeProject,    setActiveProject]     = useState<UserProject | null>(null);
  const [projectSaving,    setProjectSaving]     = useState(false);

  const [geoJsonData,     setGeoJsonData]     = useState<any>(null);
  const [geoJsonLoading,  setGeoJsonLoading]  = useState(false);
  const [geoJsonError,    setGeoJsonError]    = useState<string | null>(null);
  const [uniData,         setUniData]         = useState<any>(null);
  const [uniLoading,      setUniLoading]      = useState(false);
  const [uniError,        setUniError]        = useState<string | null>(null);
  const [uploadedGeoJsonMap, setUploadedGeoJsonMap] = useState<Record<string, any>>({});
  const [latestGeoJson,   setLatestGeoJson]   = useState<any>(null);
  const [extrusionCfg,    setExtrusionCfg]    = useState<any>(null);
  const [layerSettingsLoaded, setLayerSettingsLoaded] = useState(false);

  // ── Template match: pending captures ────────────────────────────────────
  const [pendingTemplateCapture, setPendingTemplateCapture] = useState<{
    blob: Blob; previewUrl: string;
    bounds: { north: number; south: number; east: number; west: number };
  } | null>(null);
  const [pendingMapCapture, setPendingMapCapture] = useState<{
    blob: Blob; previewUrl: string;
    bounds: { north: number; south: number; east: number; west: number };
  } | null>(null);

  // ── Layer panel state ────────────────────────────────────────────────────
  const [layers, setLayers] = useState<MapLayer[]>([
    { id: "contours",   name: "Contours",           nameAr: "خطوط الكنتور",     type: "vector", visible: true,  opacity: 1,    color: "#00d4ff", source: "Backend API · /gis/contours" },
    { id: "osm",        name: "OpenStreetMap Base",  nameAr: "خريطة OSM الأساسية", type: "tile",   visible: true,  opacity: 1 },
    { id: "satellite",  name: "Satellite Imagery",   nameAr: "صور الأقمار الصناعية", type: "raster", visible: false, opacity: 0.9,  source: "Esri World Imagery" },
    { id: "ndvi-tile",  name: "NDVI Live Layer",     nameAr: "طبقة NDVI الحية",  type: "ndvi",   visible: false, opacity: 0.85, source: "Sentinel-2 via open-meteo" },
    { id: "universities", name: "Universities",      nameAr: "الجامعات",         type: "vector", visible: true,  opacity: 1,    color: "#a855f7", source: "API · /api/universities" },
  ]);

  const flyToRef               = useRef<((lat: number, lng: number) => void) | null>(null);
  const clearRef               = useRef<(() => void) | null>(null);
  const changeSatRef           = useRef<((sat: SatKey) => void) | null>(null);
  const changeIdxRef           = useRef<((idx: IdxKey) => void) | null>(null);
  const changeOpacityRef       = useRef<((o: number) => void) | null>(null);
  const startImagePlacementRef = useRef<((file: File) => void) | null>(null);
  const rasterOverlayRef       = useRef<((config: RasterPreviewConfig) => void) | null>(null);
  const lastCoordsRef          = useRef<{ lat: number; lng: number }>({ lat: 30.0, lng: 31.0 });

  // ── double-click tracking ─────────────────────────────────────────────────
  const lastClickTimeRef = useRef<number>(0);
  const templateMatchCaptureRef = useRef<"template" | "map" | null>(null);

  const isRestored = useRef(false);
  const isLayerSettingsHydrating = useRef(false);
  const layerSettingsSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteLayerSettingsUnsupported = useRef(false);
  const storageWarningShownRef = useRef(false);

  const layerSettingsStorageKey = useMemo(() => {
    const user = session?.user as any;
    const accountKey = user?.id ?? user?.email ?? "guest";
    return `${LAYER_SETTINGS_STORAGE_PREFIX}:${accountKey}`;
  }, [session?.user]);

  const projectOwnerKey = useMemo(() => {
    const user = session?.user as any;
    return String(user?.id ?? user?.email ?? "guest");
  }, [session?.user]);

  // ── 1. localStorage restore ───────────────────────────────────────────────
  useEffect(() => {
    if (isRestored.current) return;
    try {
      const raw = localStorage.getItem(UPLOADED_GEOJSON_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.type === "FeatureCollection") {
          setUploadedGeoJsonMap({ "imported_legacy.json": parsed });
        } else {
          setUploadedGeoJsonMap(parsed || {});
        }
      }
      const rawCfg = localStorage.getItem(EXTRUSION_CFG_STORAGE_KEY);
      if (rawCfg) setExtrusionCfg(JSON.parse(rawCfg));
      isRestored.current = true;
    } catch (e) { console.error("Storage error", e); }
  }, []);

  // ── 2. Contours ───────────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://gis-back-chi.vercel.app";
    const token = (session?.user as any)?.accessToken as string | undefined;

    setGeoJsonLoading(true);
    fetch(`${BASE_URL}/gis/contours`, {
      headers: { "Accept-Encoding": "gzip, deflate, br", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => { if (!r.ok) throw new Error(`Contours API ${r.status}`); return r.json(); })
      .then((data) => {
        if (!isMounted) return;
        if (!data || !data.type || !Array.isArray(data.features)) throw new Error("Invalid GeoJSON from contours API");
        setGeoJsonData(data); setGeoJsonError(null);
      })
      .catch((err) => { if (isMounted) setGeoJsonError(err.message); })
      .finally(() => { if (isMounted) setGeoJsonLoading(false); });

    return () => { isMounted = false; };
  }, [session?.user]);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (sessionStatus !== "authenticated") {
      setLayerSettingsLoaded(true);
      return;
    }

    let cancelled = false;
    isLayerSettingsHydrating.current = true;

    try {
      const raw = localStorage.getItem(layerSettingsStorageKey);
      const savedLayers = raw ? JSON.parse(raw)?.layers : null;
      if (Array.isArray(savedLayers)) {
        setLayers((prev) => {
          const byId = new Map(savedLayers.map((layer: MapLayer) => [layer.id, layer]));
          const merged = prev.map((layer) => byId.has(layer.id) ? { ...layer, ...byId.get(layer.id) } : layer);
          const existing = new Set(merged.map((layer) => layer.id));
          const extra = savedLayers.filter((layer: MapLayer) => layer?.id && !existing.has(layer.id));
          return [...extra, ...merged];
        });
      }
    } catch {
      // Ignore malformed local fallback data.
    }

    fetch("/api/gis/layer-settings", { cache: "no-store" })
      .then((res) => {
        if (res.status === 404 || res.status === 405 || res.status === 501) {
          remoteLayerSettingsUnsupported.current = true;
        }
        return res.ok ? res.json() : null;
      })
      .then((payload) => {
        if (cancelled) return;
        const savedLayers = payload?.data?.layers ?? payload?.layers;
        if (Array.isArray(savedLayers)) {
          setLayers((prev) => {
            const byId = new Map(savedLayers.map((layer: MapLayer) => [layer.id, layer]));
            const merged = prev.map((layer) => byId.has(layer.id) ? { ...layer, ...byId.get(layer.id) } : layer);
            const existing = new Set(merged.map((layer) => layer.id));
            const extra = savedLayers.filter((layer: MapLayer) => layer?.id && !existing.has(layer.id));
            return [...extra, ...merged];
          });
        }
      })
      .catch(() => {
        // The app can still run if the account-settings endpoint is not available.
      })
      .finally(() => {
        if (!cancelled) {
          isLayerSettingsHydrating.current = false;
          setLayerSettingsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
      isLayerSettingsHydrating.current = false;
    };
  }, [layerSettingsStorageKey, sessionStatus]);

  useEffect(() => {
    if (!layerSettingsLoaded || isLayerSettingsHydrating.current) return;
    if (sessionStatus !== "authenticated") return;

    if (layerSettingsSaveTimer.current) clearTimeout(layerSettingsSaveTimer.current);
    layerSettingsSaveTimer.current = setTimeout(async () => {
      try {
        localStorage.setItem(layerSettingsStorageKey, JSON.stringify({ layers, updatedAt: new Date().toISOString() }));
      } catch {
        // Local fallback is best-effort only.
      }

      if (remoteLayerSettingsUnsupported.current) return;

      try {
        const res = await fetch("/api/gis/layer-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ layers }),
        });
        if (res.status === 404 || res.status === 405 || res.status === 501) {
          remoteLayerSettingsUnsupported.current = true;
        }
      } catch {
        // Keep the UI calm: changes are already stored in the per-account fallback.
      }
    }, 650);

    return () => {
      if (layerSettingsSaveTimer.current) clearTimeout(layerSettingsSaveTimer.current);
    };
  }, [layerSettingsStorageKey, layers, layerSettingsLoaded, sessionStatus]);

  // ── 3. Universities ───────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    setUniLoading(true);
    fetch("/api/universities")
      .then((r) => r.json())
      .then((data) => { if (isMounted) { setUniData(data); setUniError(null); } })
      .catch((err) => { if (isMounted) setUniError(err.message); })
      .finally(() => { if (isMounted) setUniLoading(false); });

    return () => { isMounted = false; };
  }, []);

  // ── 4. Combined GeoJSON (Respecting Layer Order) ──────────────────────────
  const combinedGeoJson = useMemo(() => {
    const features: any[] = [];
    
    // Iterate through layers to maintain order (bottom to top in array = bottom to top on map)
    // Actually, usually the first in the list is the "top" one in UI, 
    // but in Leaflet/Canvas, the last one drawn is on top.
    // We'll reverse the layers array for rendering if we want the top of the sidebar to be on top of the map.
    const orderedLayers = [...layers].reverse();

    orderedLayers.forEach(layer => {
      if (!layer.visible) return;

      if (layer.id === "universities" && uniData?.features) {
        features.push(...uniData.features.map((f: any) => ({
          ...f,
          properties: {
            ...f.properties,
            _opacity: layer.opacity,
          },
        })));
      } else if (layer.id.startsWith("uploaded_")) {
        const fileName = layer.id.replace("uploaded_", "");
        const gj = uploadedGeoJsonMap[fileName];
        if (gj?.features) {
          // Apply layer-level opacity and color if needed? 
          // For now, we just aggregate. LeafletMap handles the rest.
          features.push(...gj.features.map((f: any) => ({
            ...f,
            properties: { 
              ...f.properties, 
              _color: layer.color,
              _opacity: layer.opacity 
            }
          })));
        }
      }
    });

    return { type: "FeatureCollection", features } as any;
  }, [layers, uniData, uploadedGeoJsonMap]);

  const mergedUploadedGeoJson = useMemo(() => {
    const features = Object.values(uploadedGeoJsonMap).flatMap(
      (gj: any) => gj?.features ?? []
    );
    return { type: "FeatureCollection", features } as any;
  }, [uploadedGeoJsonMap]);

  const contourLayer = useMemo(() => layers.find((l) => l.id === "contours"), [layers]);
  const contourGeoJsonStyle = useMemo(() => {
    const opacity = contourLayer?.opacity ?? 1;
    return {
      color: contourLayer?.color ?? "#00d4ff",
      opacity: 0.85 * opacity,
      fillOpacity: 0.08 * opacity,
    };
  }, [contourLayer?.color, contourLayer?.opacity]);

  // ── Stable callbacks ──────────────────────────────────────────────────────
  const handleGeoJSONUpload = useCallback((geojson: any, fileName: string = "uploaded.json", isUpdate: boolean = false) => {
    setUploadedGeoJsonMap((prev) => {
      // Check if this file name already exists AND if it has the same geometry roughly
      // (to avoid duplicating during the onDisplay -> onUpload cycle)
      const existing = prev[fileName];
      if (existing) {
        const oldFeat = existing.features?.[0]?.geometry?.coordinates;
        const newFeat = geojson.features?.[0]?.geometry?.coordinates;
        // Simple heuristic: if first feature's first coordinate is the same, assume it's the same file
        if (JSON.stringify(oldFeat) === JSON.stringify(newFeat)) {
          return { ...prev, [fileName]: geojson };
        }
      }

      if (isUpdate && existing) {
        return { ...prev, [fileName]: geojson };
      }

      let uniqueName = fileName;
      let counter = 1;
      while (prev[uniqueName]) {
        const dotIndex = fileName.lastIndexOf('.');
        if (dotIndex !== -1) {
          const name = fileName.substring(0, dotIndex);
          const ext = fileName.substring(dotIndex);
          uniqueName = `${name} (${counter})${ext}`;
        } else {
          uniqueName = `${fileName} (${counter})`;
        }
        counter++;
      }
      return { ...prev, [uniqueName]: geojson };
    });
    if (!isUpdate) setLatestGeoJson(geojson);
  }, []);

  const handleDeleteGeoJSON = useCallback((fileName: string) => {
    setUploadedGeoJsonMap((prev) => {
      const next = { ...prev };
      delete next[fileName];
      persistUploadedGeoJSON(next);
      return next;
    });
  }, []);

  const handleOpen3D = useCallback((layerOrFileName?: string) => {
    const fileName = layerOrFileName?.startsWith("uploaded_")
      ? layerOrFileName.replace("uploaded_", "")
      : layerOrFileName;
    const layer = layers.find((item) => item.id === layerOrFileName);
    const geojson =
      layerOrFileName === "universities" ? uniData :
      layerOrFileName === "contours" ? geoJsonData :
      fileName ? uploadedGeoJsonMap[fileName] :
      null;

    if (!geojson?.features) {
      setView3D({ ...lastCoordsRef.current, name: layerOrFileName });
      return;
    }

    // Find the first feature with valid geometry
    const feat = geojson.features.find((f: any) => f.geometry);
    if (!feat) return;

    const getCenter = (g: any): [number, number] | null => {
      if (!g?.coordinates) return null;
      try {
        if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
        if (g.type === "LineString" || g.type === "MultiPoint") {
          const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
          return [mid[1], mid[0]];
        }
        if (g.type === "Polygon" || g.type === "MultiLineString") {
          const first = g.coordinates[0];
          const mid = first[Math.floor(first.length / 2)];
          return [mid[1], mid[0]];
        }
        if (g.type === "MultiPolygon") {
          const firstPoly = g.coordinates[0];
          const firstRing = firstPoly[0];
          const mid = firstRing[Math.floor(firstRing.length / 2)];
          return [mid[1], mid[0]];
        }
        // Fallback: try to find any numbers
        const findFirst = (c: any): [number, number] | null => {
          if (Array.isArray(c) && typeof c[0] === "number") return [c[1], c[0]];
          if (Array.isArray(c)) {
            for (const sub of c) {
              const res = findFirst(sub);
              if (res) return res;
            }
          }
          return null;
        };
        return findFirst(g.coordinates);
      } catch (e) { return null; }
    };

    const center = getCenter(feat.geometry);
    if (center) {
      setView3D({
        lat: center[0],
        lng: center[1],
        name: layer?.name ?? fileName,
        geojson,
      });
    }
  }, [geoJsonData, layers, uniData, uploadedGeoJsonMap]);

  // Sync uploadedGeoJsonMap to localStorage
  useEffect(() => {
    if (!isRestored.current) return;
    persistUploadedGeoJSON(uploadedGeoJsonMap, () => {
      if (storageWarningShownRef.current || Object.keys(uploadedGeoJsonMap).length === 0) return;
      storageWarningShownRef.current = true;
      toast.warning(
        isRTL
          ? "الملف كبير، هيظهر على الخريطة لكنه مش هيتحفظ محليًا بعد تحديث الصفحة."
          : "This GeoJSON is large, so it will display now but will not be stored after refresh."
      );
    });
  }, [uploadedGeoJsonMap, isRTL]);

  const handleExtrusionConfig = useCallback((cfg: any) => {
    setExtrusionCfg(cfg);
    localStorage.setItem(EXTRUSION_CFG_STORAGE_KEY, JSON.stringify(cfg));
  }, []);

  const handleStartImageOverlay = useCallback((file: File) => {
    startImagePlacementRef.current?.(file);
  }, []);

  const handleFlyTo = useCallback((lat: number, lng: number) => {
    flyToRef.current?.(lat, lng);
  }, []);

  const handleClose3D = useCallback(() => setView3D(null), []);

  const handleClear = useCallback(() => {
    clearRef.current?.();
    setCoords(null);
    setCaptureUrl(null);
    setCaptures((prev) => {
      prev.forEach(c => {
        try { URL.revokeObjectURL(c.url); } catch (e) {}
        try { URL.revokeObjectURL(c.largeUrl); } catch (e) {}
      });
      return [];
    });
    localStorage.removeItem(UPLOADED_GEOJSON_STORAGE_KEY);
    localStorage.removeItem(EXTRUSION_CFG_STORAGE_KEY);
    setUploadedGeoJsonMap({});
    setExtrusionCfg(null);
  }, []);

  const handleToggleView = useCallback(() => {
    setView3D((prev) => prev ? null : { ...lastCoordsRef.current });
  }, []);

  const handleCapture = useCallback((capture: CaptureResult) => {
    const captureMode = templateMatchCaptureRef.current;
    if (captureMode) {
      templateMatchCaptureRef.current = null;
      const blob = capture.smallBlob ?? capture.largeBlob;
      const previewUrl = capture.smallUrl ?? capture.largeUrl;
      if (!blob || !previewUrl) {
        setActiveTool("pointer");
        return;
      }

      const mapCap = {
        blob,
        previewUrl,
        bounds: capture.selectedBounds,
      };
      if (captureMode === "template") {
        setPendingTemplateCapture(mapCap);
      } else {
        setPendingMapCapture(mapCap);
      }
      setActiveTool("pointer");
      return;
    }

    const displayUrl = capture.smallUrl ?? capture.largeUrl;
    if (!displayUrl) return;
    setCaptureUrl(displayUrl);
    setCaptures((prev) => [
      {
        id: Date.now(),
        type: capture.captureTarget,
        url: displayUrl,
        smallUrl: capture.smallUrl,
        largeUrl: capture.largeUrl,
        selectedCoordinates: capture.selectedCoordinates,
        viewportCoordinates: capture.viewportCoordinates,
        selectedBounds: capture.selectedBounds,
        viewportBounds: capture.viewportBounds,
        metadata: capture.metadata,
        createdAt: capture.metadata.capturedAt,
      },
      ...prev,
    ]);
  }, []);

  const handleRequestTemplateCapture = useCallback(() => {
    templateMatchCaptureRef.current = "template";
    setActiveTool("rectangle");
  }, []);

  const handleRequestMapCapture = useCallback(() => {
    templateMatchCaptureRef.current = "map";
    setActiveTool("rectangle");
  }, []);

  const handleDeleteCapture = useCallback((id: number, url: string) => {
    setCaptures((prev) => {
      const cap = prev.find((c) => c.id === id);
      try { URL.revokeObjectURL(url); } catch (e) {}
      try { if (cap?.largeUrl) URL.revokeObjectURL(cap.largeUrl); } catch (e) {}
      return prev.filter((c) => c.id !== id);
    });
    setCaptureUrl((current) => (current === url ? null : current));
  }, []);

  // ── Layer panel handlers ──────────────────────────────────────────────────
  const handleLayerToggle  = useCallback((id: string, visible: boolean) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, visible } : l));
    // Wire to map tile changes where applicable
    if (id === "satellite" && visible) changeSatRef.current?.("Default");
    if (id === "ndvi-tile" && visible) changeIdxRef.current?.("NDVI" as any);
  }, []);

  const handleLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, opacity } : l));
    const layerType = layers.find((l) => l.id === id)?.type;
    if (layerType !== "vector") changeOpacityRef.current?.(opacity);
  }, [layers]);


  const handleLayerColor   = useCallback((id: string, color: string) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, color } : l));
  }, []);

  const handleLayerReorder = useCallback((fromIndex: number, toIndex: number) => {
    setLayers((prev) => {
      const result = [...prev];
      const [removed] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, removed);
      return result;
    });
  }, []);

  const handleLayerRename = useCallback((id: string, newName: string) => {
    if (id.startsWith("uploaded_")) {
      const oldName = id.replace("uploaded_", "");
      const safeName = newName.trim();
      if (!safeName || safeName === oldName) return;
      setUploadedGeoJsonMap((prev) => {
        if (!prev[oldName]) return prev;
        if (prev[safeName]) {
          toast.error(isRTL ? "اسم اللاير موجود بالفعل" : "A layer with this name already exists");
          return prev;
        }
        const next = { ...prev };
        const data = next[oldName];
        delete next[oldName];
        next[safeName] = data;
        return next;
      });
    } else {
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, name: newName, nameAr: newName } : l))
      );
    }
  }, [isRTL]);

  const handleLayerRemove  = useCallback((id: string) => {
    setLayers((prev) => prev.filter((l) => l.id !== id));
    if (id === "contours") setGeoJsonData(null);
    if (id.startsWith("uploaded_")) {
        const fileName = id.replace("uploaded_", "");
        handleDeleteGeoJSON(fileName);
    }
  }, [handleDeleteGeoJSON]);

  const handleLayerZoom    = useCallback((id: string) => {
    // Fly to appropriate location for the layer
    if (id === "universities") flyToRef.current?.(30.05, 31.23);
    if (id === "contours") flyToRef.current?.(30.05, 31.23);
    if (id.startsWith("uploaded_")) {
        const fileName = id.replace("uploaded_", "");
        const gj = uploadedGeoJsonMap[fileName];
        if (gj?.features?.[0]?.geometry) {
            const feat = gj.features[0];
            const getCenter = (g: any): [number, number] | null => {
              if (!g?.coordinates) return null;
              try {
                if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
                if (g.type === "LineString" || g.type === "MultiPoint") {
                  const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
                  return [mid[1], mid[0]];
                }
                if (g.type === "Polygon" || g.type === "MultiLineString") {
                  const first = g.coordinates[0];
                  const mid = first[Math.floor(first.length / 2)];
                  return [mid[1], mid[0]];
                }
                if (g.type === "MultiPolygon") {
                  const firstPoly = g.coordinates[0];
                  const firstRing = firstPoly[0];
                  const mid = firstRing[Math.floor(firstRing.length / 2)];
                  return [mid[1], mid[0]];
                }
                const findFirst = (c: any): [number, number] | null => {
                  if (Array.isArray(c) && typeof c[0] === "number") return [c[1], c[0]];
                  if (Array.isArray(c)) {
                    for (const sub of c) {
                      const res = findFirst(sub);
                      if (res) return res;
                    }
                  }
                  return null;
                };
                return findFirst(g.coordinates);
              } catch (e) {
                return null;
              }
            };
            const c = getCenter(feat.geometry);
            if (c && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
              flyToRef.current?.(c[0], c[1]);
            }
        }
    }
  }, [uploadedGeoJsonMap]);

  const handleSatellitePreview = useCallback((config: SatellitePreviewConfig) => {
    if (config.scenePreview) {
      const scene = config.scenePreview;
      const feature: GeoJSON.Feature = {
        type: "Feature",
        geometry: scene.geometry ?? {
          type: "Polygon",
          coordinates: [[
            [scene.bounds[0][1], scene.bounds[0][0]],
            [scene.bounds[1][1], scene.bounds[0][0]],
            [scene.bounds[1][1], scene.bounds[1][0]],
            [scene.bounds[0][1], scene.bounds[1][0]],
            [scene.bounds[0][1], scene.bounds[0][0]],
          ]],
        },
        properties: {
          name: scene.name,
          band: scene.band,
          expression: scene.expression,
          assets: scene.assets.join(", "),
        },
      };
      setLatestGeoJson({ type: "FeatureCollection", features: [feature] });
      if (scene.previewUrl) {
        rasterOverlayRef.current?.({
          name: scene.name,
          indexKey: scene.band,
          expression: scene.expression ?? scene.assets.join(","),
          date: `${config.dateFrom} to ${config.dateTo}`,
          coords: scene.coords,
          bounds: scene.bounds,
          opacity: Math.min(0.72, Math.max(0.35, config.opacity)),
          colorRamp: "Scene preview",
          dataUrl: scene.previewUrl,
        });
      } else {
        flyToRef.current?.(scene.coords.lat, scene.coords.lng);
      }
      return;
    }

    changeSatRef.current?.(config.satKey);
    changeIdxRef.current?.(config.band);
    changeOpacityRef.current?.(config.opacity);

    const layerName = config.source === "sentinel-2" ? "Sentinel-2 Preview" : "Landsat Preview";
    const sourceLabel = `${layerName} | ${config.band} | ${config.dateFrom} to ${config.dateTo} | cloud <= ${config.cloudCover}%`;

    setLayers((prev) => {
      const hasSatelliteLayer = prev.some((layer) => layer.id === "satellite");
      const next = hasSatelliteLayer
        ? prev.map((layer) =>
            layer.id === "satellite"
              ? { ...layer, name: layerName, nameAr: layerName, visible: true, opacity: config.opacity, source: sourceLabel }
              : layer
          )
        : [
            {
              id: "satellite",
              name: layerName,
              nameAr: layerName,
              type: "raster" as const,
              visible: true,
              opacity: config.opacity,
              source: sourceLabel,
            },
            ...prev,
          ];

      return next.map((layer) =>
        layer.id === "ndvi-tile"
          ? { ...layer, visible: config.band !== "RGB", opacity: config.opacity }
          : layer
      );
    });
  }, []);

  const handleRasterPreview = useCallback((config: RasterPreviewConfig) => {
    rasterOverlayRef.current?.(config);
    changeIdxRef.current?.(config.indexKey);
    changeOpacityRef.current?.(config.opacity);

    setLayers((prev) => {
      const resultLayer: MapLayer = {
        id: "raster-result",
        name: config.name,
        nameAr: config.name,
        type: "raster",
        visible: true,
        opacity: config.opacity,
        color: "#22d3ee",
        source: `${config.expression} | ${config.date} | ${config.colorRamp}`,
      };
      const withoutOld = prev.filter((layer) => layer.id !== "raster-result");
      return [resultLayer, ...withoutOld.map((layer) =>
        layer.id === "ndvi-tile"
          ? { ...layer, visible: true, opacity: config.opacity, source: `Raster calculator | ${config.name}` }
          : layer
      )];
    });
  }, []);

  // Sync uploaded GeoJSON as layers
  useEffect(() => {
    const uploadedIds = Object.keys(uploadedGeoJsonMap).map(name => `uploaded_${name}`);
    
    setLayers((prev) => {
      // 1. Remove layers that are no longer in uploadedGeoJsonMap
      const filtered = prev.filter(l => !l.id.startsWith("uploaded_") || uploadedIds.includes(l.id));
      
      // 2. Add new layers that are not yet in the layers state
      const existingIds = filtered.map(l => l.id);
      const newLayers: MapLayer[] = Object.entries(uploadedGeoJsonMap)
        .filter(([name]) => !existingIds.includes(`uploaded_${name}`))
        .map(([name, gj]) => ({
          id: `uploaded_${name}`,
          name, nameAr: name,
          type: "vector" as const,
          visible: true, opacity: 1, color: "#00d4ff",
          featureCount: gj?.features?.length,
          source: "Uploaded GeoJSON",
        }));
        
      return [...newLayers, ...filtered]; // Add new ones to top
    });
  }, [uploadedGeoJsonMap]);

  // Export data bundle
  const exportData = useMemo(() => ({
    coords: coords ?? undefined,
    selectedArea: selectedArea.ha > 0 ? selectedArea : undefined,
    layers: layers.map(({ id: _id, ...rest }) => rest),
    geoJsonFeatures: [
      ...(geoJsonData?.features ?? []),
      ...(combinedGeoJson?.features ?? []),
    ].slice(0, 200),
  }), [coords, selectedArea, layers, geoJsonData, combinedGeoJson]);

  const currentProjectSnapshot = useMemo<ProjectSnapshot>(() => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(today.getDate() - 30);

    return {
      aoiGeometry: selectedFeature?.geometry ? JSON.parse(JSON.stringify(selectedFeature.geometry)) : null,
      selectedLayers: layers.map((layer) => ({ ...layer })),
      uploadedGeoJsonMap: JSON.parse(JSON.stringify(uploadedGeoJsonMap)),
      selectedDatasets: layers
        .filter((layer) => layer.visible)
        .map((layer) => layer.source || layer.name),
      timeRange: {
        from: from.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
      },
      analysisSettings: {
        activePanel,
        captureTarget,
        selectedArea,
        coords,
      },
    };
  }, [activePanel, captureTarget, coords, layers, selectedArea, selectedFeature, uploadedGeoJsonMap]);

  const handleLoadProject = useCallback((project: UserProject) => {
    const snapshot = project.snapshot;
    if (!snapshot) {
      toast.error(isRTL ? "ملف المشروع غير صالح" : "Project data is not valid");
      return;
    }

    setUploadedGeoJsonMap(snapshot.uploadedGeoJsonMap ?? {});
    setLayers(Array.isArray(snapshot.selectedLayers) ? snapshot.selectedLayers : []);
    setSelectedFeature(
      snapshot.aoiGeometry
        ? ({
            type: "Feature",
            properties: { name: project.name },
            geometry: snapshot.aoiGeometry,
          } as GeoJSON.Feature)
        : null,
    );
    setSelectedArea(snapshot.analysisSettings?.selectedArea ?? { name: "Selected Area", ha: 0 });
    setCoords(snapshot.analysisSettings?.coords ?? null);
    setActivePanel((snapshot.analysisSettings?.activePanel as any) ?? "overview");
    setActiveProject(project);
    setProjectStartOpen(false);
    toast.success(isRTL ? "تم تحميل المشروع" : `Loaded ${project.name}`);
  }, [isRTL]);

  const handleCreateStartupProject = useCallback((project: UserProject) => {
    setActiveProject(project);
    setProjectStartOpen(false);
    setActivePanel("overview");
  }, []);

  const handleSaveActiveProject = useCallback(async () => {
    if (!activeProject || projectSaving) return;
    setProjectSaving(true);
    try {
      const result = await updateProject(
        projectOwnerKey,
        { ...activeProject, snapshot: currentProjectSnapshot },
        sessionStatus === "authenticated",
      );
      setActiveProject(result.data);
      toast.success(result.mode === "remote" ? "Project saved to backend" : "Project saved locally");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Project save failed");
    } finally {
      setProjectSaving(false);
    }
  }, [activeProject, currentProjectSnapshot, projectOwnerKey, projectSaving, sessionStatus]);

  // ── Shared sidebar ────────────────────────────────────────────────────────
  const sharedSidebar = useMemo(() => (
    <AnalysisSidebar
      selectedFeature={selectedFeature}
      uploadedGeoJsonMap={uploadedGeoJsonMap}
      captures={captures}
      onGeoJSONUpload={(gj, name, isUp) => handleGeoJSONUpload(gj, name, isUp)}
      onDeleteGeoJSON={handleDeleteGeoJSON}
      onOpen3D={handleOpen3D}
      onStartImageOverlay={handleStartImageOverlay}
      onExtrusionConfig={handleExtrusionConfig}
      onFlyTo={handleFlyTo}
      onClose={handleClose3D}
      activePanel={activePanel as any}
      onActivePanelChange={(id) => setActivePanel(id)}
      onClearCaptures={() => {
        setCaptures((prev) => {
          prev.forEach(c => {
            try { URL.revokeObjectURL(c.url); } catch (e) {}
            try { URL.revokeObjectURL(c.largeUrl); } catch (e) {}
          });
          return [];
        });
      }}
      onDeleteCapture={handleDeleteCapture}
      onRequestTemplateCapture={handleRequestTemplateCapture}
      pendingTemplateCapture={pendingTemplateCapture}
      onClearTemplateCapture={() => { if (pendingTemplateCapture?.previewUrl) URL.revokeObjectURL(pendingTemplateCapture.previewUrl); setPendingTemplateCapture(null); }}
      onRequestMapCapture={handleRequestMapCapture}
      pendingMapCapture={pendingMapCapture}
      onClearMapCapture={() => { if (pendingMapCapture?.previewUrl) URL.revokeObjectURL(pendingMapCapture.previewUrl); setPendingMapCapture(null); }}
      layers={layers}
      onLayerToggle={handleLayerToggle}
      onLayerOpacity={handleLayerOpacity}
      onLayerColor={handleLayerColor}
      onLayerRemove={handleLayerRemove}
      onLayerRename={handleLayerRename}
      onLayerReorder={handleLayerReorder}
      onLayerZoom={handleLayerZoom}
      onLayer3D={handleOpen3D}
      onSatellitePreview={handleSatellitePreview}
      onRasterPreview={handleRasterPreview}
    />
  ), [
    selectedFeature,
    uploadedGeoJsonMap,
    captures,
    handleGeoJSONUpload,
    handleDeleteGeoJSON,
    handleOpen3D,
    handleStartImageOverlay,
    handleExtrusionConfig,
    handleFlyTo,
    handleClose3D,
    handleDeleteCapture,
    handleRequestTemplateCapture,
    pendingTemplateCapture,
    handleRequestMapCapture,
    pendingMapCapture,
    activePanel,
    layers,
    handleLayerToggle,
    handleLayerOpacity,
    handleLayerColor,
    handleLayerRemove,
    handleLayerRename,
    handleLayerReorder,
    handleLayerZoom,
    handleSatellitePreview,
    handleRasterPreview,
  ]);

  const toggle2DButton = useMemo(() => (
    <button
      onClick={handleToggleView}
      className="px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 text-slate-300 text-xs cursor-pointer hover:text-cyan-400"
    >
      2D Map
    </button>
  ), [handleToggleView]);

  // ── ✅ Double-click on the map wrapper → open 3D ──────────────────────────
  // بنحط الـ dblclick على الـ div الـ wrapper مباشرة
  // مش محتاجين نعدل LeafletMap خالص
  const handleWrapperDoubleClick = useCallback(() => {
    setView3D({ ...lastCoordsRef.current });
  }, []);

  return (
    <div className={`flex flex-col w-full h-[100dvh] min-h-[100dvh] bg-[#040d1a] overflow-hidden ${isRTL ? "font-arabic" : ""}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600&family=Noto+Sans+Arabic:wght@400;600&display=swap');
        body { font-family: 'DM Sans', sans-serif; margin: 0; }
        .font-arabic { font-family: 'Noto Sans Arabic', sans-serif !important; }
      `}</style>

      {!isFullscreen && (
        <MapNavbar
          isFullscreen={isFullscreen}
          onFullscreenToggle={() =>
            !isFullscreen
              ? document.documentElement.requestFullscreen()
              : document.exitFullscreen()
          }
        />
      )}

      <div className="relative flex-1">

        {/* ── 2D Map wrapper — onDoubleClick هنا ── */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${
            view3D ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
          onDoubleClick={handleWrapperDoubleClick}
        >
          <LeafletMap
            activeTool={activeTool}
            captureTarget={captureTarget}
            onAreaSelected={(name, area, feature) => {
              setSelectedArea({ name, ha: area });
              if (feature) setSelectedFeature(feature);
            }}
            onCoordsUpdate={(lat, lng) => {
              lastCoordsRef.current = { lat, lng };
              setCoords({ lat, lng });
            }}
              onCapture={handleCapture}
            flyToRef={flyToRef}
            clearRef={clearRef}
            onSatChange={(h) => { changeSatRef.current = h; }}
            onIdxChange={(h) => { changeIdxRef.current = h; }}
              onOpacityChangeRegister={(h) => { changeOpacityRef.current = h; }}
            onImagePlacerRegister={(h) => { startImagePlacementRef.current = h; }}
            onRasterOverlayRegister={(h) => { rasterOverlayRef.current = h as any; }}
            geoJsonData={contourLayer?.visible ? geoJsonData : null}
            extraGeoJsonData={combinedGeoJson}
            latestGeoJson={latestGeoJson}
            geoJsonStyle={contourGeoJsonStyle}
            geoJsonFitBounds={false}
            extrusionConfig={extrusionCfg || { enabled: false }}
            onFeatureClick={setSelectedFeature}
          />
        </div>

        {/* ── 2D overlays ── */}
        {!view3D && (
          <>
            {/* ── Top-left controls bar ── */}
            <div className={`absolute top-3 z-[1100] flex max-w-[calc(100vw-72px)] items-center gap-2 overflow-x-auto app-scroll pb-1 pointer-events-auto ${isRTL ? "right-3" : "left-3"}`}>
              {/* 3D View */}
              <button
                onClick={handleToggleView}
                className="px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 text-slate-300 text-xs cursor-pointer hover:text-cyan-400 transition-all flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                3D
              </button>

              <button
                onClick={() => setProjectStartOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 text-slate-300 text-xs cursor-pointer hover:text-cyan-400 transition-all flex items-center gap-1.5"
                title={activeProject ? `Current project: ${activeProject.name}` : "Choose project"}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                </svg>
                {activeProject ? activeProject.name : "New Project"}
              </button>

              {activeProject && (
                <button
                  onClick={handleSaveActiveProject}
                  disabled={projectSaving}
                  className="px-3 py-1.5 rounded-lg bg-cyan-400 text-[#03101d] text-xs font-bold cursor-pointer hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-70 transition-all flex items-center gap-1.5"
                  title="Save current project state"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
                    <path d="M17 21v-8H7v8M7 3v5h8" />
                  </svg>
                  {projectSaving ? "Saving" : "Save"}
                </button>
              )}

              {/* Layers panel toggle (now opens sidebar) */}
              <button
                onClick={() => setActivePanel("layers")}
                className="hidden"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
                {isRTL ? "الطبقات" : "Layers"}
              </button>

              <div className="hidden">
                {(["small", "large"] as CaptureTarget[]).map((target) => (
                  <button
                    key={target}
                    type="button"
                    onClick={() => setCaptureTarget(target)}
                    className={`px-2.5 py-1 text-[0.65rem] font-bold uppercase transition-all ${
                      captureTarget === target
                        ? "rounded-md bg-cyan-400 text-[#040d1a]"
                        : "text-slate-400 hover:text-cyan-400"
                    }`}
                    title={target === "small" ? "Select cropped small image" : "Select full-screen large image"}
                    aria-pressed={captureTarget === target}
                  >
                    {target === "small" ? "Small" : "Large"}
                  </button>
                ))}
              </div>

              <span className="hidden">
                {isRTL ? "دبل كليك للـ 3D" : "Double-click → 3D"}
              </span>
            </div>

            <MapSearch onFlyTo={(lat, lng) => flyToRef.current?.(lat, lng)} />
            <MapToolbar
              activeTool={activeTool}
              onToolChange={setActiveTool}
              onClear={handleClear}
              isRTL={isRTL}
              globalExportData={{
                title: "GeoSense AI — Comprehensive Global Report",
                selectedArea: selectedArea.ha > 0 ? selectedArea : undefined,
                coords: coords ?? undefined,
                layers: layers.map(({ id: _id, ...rest }) => rest),
                geoJsonFeatures: [
                  ...(geoJsonData?.features ?? []),
                  ...(combinedGeoJson?.features ?? []),
                ].slice(0, 100),
                timestamp: new Date().toISOString()
              }}
            />
            <MapLayerBar
              onSatChange={(s) => changeSatRef.current?.(s)}
              onIdxChange={(i) => changeIdxRef.current?.(i)}
              onOpacityChange={(o) => changeOpacityRef.current?.(o)}
            />
            {coords && (
              <CoordsPopup lat={coords.lat} lng={coords.lng} onClose={() => setCoords(null)} />
            )}

            {/* ── Area / Feature Info Overlay ── */}
            {selectedArea.ha > 0 && (
              <div className={`absolute bottom-32 sm:bottom-24 z-[1000] max-w-[calc(100vw-96px)] px-3 sm:px-4 py-3 bg-[#0a1628]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-fadeUp flex items-center gap-3 sm:gap-4 pointer-events-auto
                ${isRTL ? "left-16 sm:left-20" : "right-16 sm:right-20"}`}>
                <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18" />
                  </svg>
                </div>
                <div>
                  <p className="text-[0.65rem] text-slate-500 uppercase tracking-widest font-bold mb-0.5">
                    {t.selectedArea}
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold text-slate-100 tracking-tight">{selectedArea.ha.toLocaleString()}</span>
                    <span className="text-[0.7rem] font-medium text-cyan-400/80 uppercase">
                      {t.hectares}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedArea({ name: "Selected Area", ha: 0 })}
                  className="ml-2 p-1.5 hover:bg-white/10 rounded-lg text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* ── Capture Sidebar Preview ── */}
            {captures.length > 0 && (
              <div className={`absolute top-[4.5rem] sm:top-20 z-[1000] w-[min(12rem,calc(100vw-5rem))] space-y-3 animate-fadeUp max-h-[46vh] sm:max-h-[70vh] overflow-y-auto custom-scroll pr-2 pointer-events-auto
                ${isRTL ? "left-14 sm:left-16" : "right-14 sm:right-16"}`}>
                <div className="flex items-center justify-between bg-[#0a1628]/80 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 sticky top-0 z-10">
                  <span className="text-[0.65rem] font-bold text-cyan-400 uppercase tracking-wider">Captures ({captures.length})</span>
                  <button onClick={() => {
                    setCaptures((prev) => {
                      prev.forEach(c => {
                        try { URL.revokeObjectURL(c.url); } catch (e) {}
                        try { URL.revokeObjectURL(c.largeUrl); } catch (e) {}
                      });
                      return [];
                    });
                  }} className="text-[0.6rem] text-slate-500 hover:text-red-400 cursor-pointer">Clear</button>
                </div>
                {captures.map((cap) => (
                  <div key={cap.id} className="group relative bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    <div className="aspect-video bg-black/40">
                      {cap?.url && (
                        <button
                          type="button"
                          onClick={() => window.open(cap.largeUrl ?? cap.smallUrl ?? cap.url, "_blank", "noopener,noreferrer")}
                          className="relative block w-full h-full cursor-zoom-in"
                          title="Open capture"
                          aria-label="Open capture"
                        >
                          <img src={cap.url} alt="Map capture" className="w-full h-full object-cover" />
                          <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[0.5rem] font-bold uppercase ${
                            cap.type === "large" ? "bg-fuchsia-400 text-[#040d1a]" : "bg-cyan-400 text-[#040d1a]"
                          }`}>
                            {cap.type === "large" ? "Large" : "Small"}
                          </span>
                        </button>
                      )}
                    </div>
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-[0.55rem] text-slate-500">{new Date(cap.createdAt).toLocaleTimeString()}</span>
                      <button 
                        type="button"
                        onClick={() => window.open(cap.largeUrl ?? cap.smallUrl ?? cap.url, "_blank", "noopener,noreferrer")}
                        className="text-[0.55rem] font-bold text-cyan-400 hover:underline cursor-pointer"
                      >
                        View
                      </button>
                    </div>
                    <button 
                      type="button"
                      onClick={() => handleDeleteCapture(cap.id, cap.url)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                      aria-label="Delete capture"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <AITriggerButton onClick={() => setAiOpen(!aiOpen)} active={aiOpen} />
            <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
            {sharedSidebar}
          </>
        )}

        {/* ── 3D View ── */}
        {view3D && (
          <Mapbox3DView
            lat={view3D.lat}
            lng={view3D.lng}
            featureName={view3D.name}
            onClose={handleClose3D}
            toggleButton={toggle2DButton}
            sidebarSlot={sharedSidebar}
            uploadedGeoJson={view3D.geojson ?? mergedUploadedGeoJson}
          />
        )}

        {projectStartOpen && !view3D && (
          <ProjectStartDialog
            ownerKey={projectOwnerKey}
            isAuthenticated={sessionStatus === "authenticated"}
            currentSnapshot={currentProjectSnapshot}
            onCreateProject={handleCreateStartupProject}
            onLoadProject={handleLoadProject}
            onSkip={() => setProjectStartOpen(false)}
          />
        )}

      </div>
    </div>
  );
}
