"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLang } from "../_components/translations";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";
import AIAssistant from "../_components/AIAssistant/AIAssistant";

import { DrawTool, SatKey, IdxKey } from "./mapTypes_proxy";
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

const UPLOADED_GEOJSON_STORAGE_KEY = "uploaded_geojson_v1";
const EXTRUSION_CFG_STORAGE_KEY    = "uploaded_geojson_extrusion_cfg_v1";

export default function MapPage() {
  const { t, isRTL } = useLang();
  const [aiOpen,           setAiOpen]           = useState(false);
  const [isFullscreen,     setIsFullscreen]      = useState(false);
  const [activeTool,       setActiveTool]        = useState<DrawTool>("pointer");
  const [selectedArea,     setSelectedArea]      = useState({ name: "Selected Area", ha: 0 });
  const [coords,           setCoords]            = useState<{ lat: number; lng: number } | null>(null);
  const [captureUrl,       setCaptureUrl]        = useState<string | null>(null);
  const [captures,         setCaptures]          = useState<any[]>([]);
  const [selectedFeature,  setSelectedFeature]   = useState<any>(null);
  const [view3D,           setView3D]            = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [activePanel,      setActivePanel]       = useState<string | null>("overview");

  const [geoJsonData,     setGeoJsonData]     = useState<any>(null);
  const [geoJsonLoading,  setGeoJsonLoading]  = useState(false);
  const [geoJsonError,    setGeoJsonError]    = useState<string | null>(null);
  const [uniData,         setUniData]         = useState<any>(null);
  const [uniLoading,      setUniLoading]      = useState(false);
  const [uniError,        setUniError]        = useState<string | null>(null);
  const [uploadedGeoJsonMap, setUploadedGeoJsonMap] = useState<Record<string, any>>({});
  const [latestGeoJson,   setLatestGeoJson]   = useState<any>(null);
  const [extrusionCfg,    setExtrusionCfg]    = useState<any>(null);

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
  const lastCoordsRef          = useRef<{ lat: number; lng: number }>({ lat: 30.0, lng: 31.0 });

  // ── double-click tracking ─────────────────────────────────────────────────
  const lastClickTimeRef = useRef<number>(0);

  const isRestored = useRef(false);

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
    const token = typeof window !== "undefined"
      ? (localStorage.getItem("gis_token") || localStorage.getItem("token") || "")
      : "";

    setGeoJsonLoading(true);
    fetch(`${BASE_URL}/gis/contours`, {
      headers: { "Accept-Encoding": "gzip, deflate, br", ...(token ? { token } : {}) },
    })
      .then((r) => r.json())
      .then((data) => { if (isMounted) { setGeoJsonData(data); setGeoJsonError(null); } })
      .catch((err) => { if (isMounted) setGeoJsonError(err.message); })
      .finally(() => { if (isMounted) setGeoJsonLoading(false); });

    return () => { isMounted = false; };
  }, []);

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
        features.push(...uniData.features);
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
      localStorage.setItem(UPLOADED_GEOJSON_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleOpen3D = useCallback((fileName: string) => {
    const geojson = uploadedGeoJsonMap[fileName];
    if (!geojson?.features) return;

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
      setView3D({ lat: center[0], lng: center[1], name: fileName });
    }
  }, [uploadedGeoJsonMap]);

  // Sync uploadedGeoJsonMap to localStorage
  useEffect(() => {
    if (!isRestored.current) return;
    localStorage.setItem(UPLOADED_GEOJSON_STORAGE_KEY, JSON.stringify(uploadedGeoJsonMap));
  }, [uploadedGeoJsonMap]);

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

  const handleCapture = useCallback((url: string) => {
    setCaptureUrl(url);
    setCaptures((prev) => [
      { id: Date.now(), url, createdAt: new Date().toISOString() },
      ...prev,
    ]);
  }, []);

  const handleDeleteCapture = useCallback((id: number, url: string) => {
    try { URL.revokeObjectURL(url); } catch (e) {}
    setCaptures((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // ── Layer panel handlers ──────────────────────────────────────────────────
  const handleLayerToggle  = useCallback((id: string, visible: boolean) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, visible } : l));
    // Wire to map tile changes where applicable
    if (id === "satellite" && visible) changeSatRef.current?.("esri_sat" as any);
    if (id === "ndvi-tile" && visible) changeIdxRef.current?.("NDVI" as any);
  }, []);

  const handleLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, opacity } : l));
    changeOpacityRef.current?.(opacity);
  }, []);


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
      setUploadedGeoJsonMap((prev) => {
        if (!prev[oldName]) return prev;
        const next = { ...prev };
        const data = next[oldName];
        delete next[oldName];
        next[newName] = data;
        return next;
      });
    } else {
      setLayers((prev) =>
        prev.map((l) => (l.id === id ? { ...l, name: newName, nameAr: newName } : l))
      );
    }
  }, []);

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
          });
          return [];
        });
      }}
      layers={layers}
      onLayerToggle={handleLayerToggle}
      onLayerOpacity={handleLayerOpacity}
      onLayerColor={handleLayerColor}
      onLayerRemove={handleLayerRemove}
      onLayerRename={handleLayerRename}
      onLayerReorder={handleLayerReorder}
      onLayerZoom={handleLayerZoom}
      onLayer3D={handleOpen3D}
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
    activePanel,
    layers,
    handleLayerToggle,
    handleLayerOpacity,
    handleLayerColor,
    handleLayerRemove,
    handleLayerZoom,
    handleOpen3D,
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
    <div className={`flex flex-col w-full h-screen bg-[#040d1a] overflow-hidden ${isRTL ? "font-arabic" : ""}`}>
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
            onAreaSelected={(name, area) => {
              setSelectedArea({ name, ha: area });
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
            geoJsonData={geoJsonData}
            extraGeoJsonData={combinedGeoJson}
            latestGeoJson={latestGeoJson}
            extrusionConfig={extrusionCfg || { enabled: false }}
            onFeatureClick={setSelectedFeature}
          />
        </div>

        {/* ── 2D overlays ── */}
        {!view3D && (
          <>
            {/* ── Top-left controls bar ── */}
            <div className="absolute top-3 left-3 z-[1100] flex items-center gap-2 flex-wrap">
              {/* 3D View */}
              <button
                onClick={handleToggleView}
                className="px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 text-slate-300 text-xs cursor-pointer hover:text-cyan-400 transition-all flex items-center gap-1.5"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                3D
              </button>

              {/* Layers panel toggle (now opens sidebar) */}
              <button
                onClick={() => setActivePanel("layers")}
                className={`px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-all flex items-center gap-1.5 ${activePanel === "layers" ? "bg-cyan-400/10 border-cyan-400/40 text-cyan-400" : "bg-[#0d1f3c] border-white/10 text-slate-300 hover:text-cyan-400"}`}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
                {isRTL ? "الطبقات" : "Layers"}
              </button>

              <span className="px-2 py-1 rounded-md bg-[#0a1628]/80 border border-white/[0.06] text-slate-500 text-[0.65rem] select-none hidden sm:block">
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
              <div className={`absolute bottom-24 z-[1000] px-4 py-3 bg-[#0a1628]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-fadeUp flex items-center gap-4 pointer-events-auto
                ${isRTL ? "left-20" : "right-20"}`}>
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
              <div className={`absolute top-20 z-[1000] w-48 space-y-3 animate-fadeUp max-h-[70vh] overflow-y-auto custom-scroll pr-2 pointer-events-auto
                ${isRTL ? "left-16" : "right-16"}`}>
                <div className="flex items-center justify-between bg-[#0a1628]/80 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 sticky top-0 z-10">
                  <span className="text-[0.65rem] font-bold text-cyan-400 uppercase tracking-wider">Captures ({captures.length})</span>
                  <button onClick={() => setCaptures([])} className="text-[0.6rem] text-slate-500 hover:text-red-400 cursor-pointer">Clear</button>
                </div>
                {captures.map((cap) => (
                  <div key={cap.id} className="group relative bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-xl">
                    <div className="aspect-video bg-black/40">
                      {cap?.url && (
  <img src={cap.url} className="w-full h-full object-cover" />
)}
                    </div>
                    <div className="p-2 flex items-center justify-between">
                      <span className="text-[0.55rem] text-slate-500">{new Date(cap.createdAt).toLocaleTimeString()}</span>
                      <button 
                        onClick={() => window.open(cap.url, '_blank')}
                        className="text-[0.55rem] font-bold text-cyan-400 hover:underline cursor-pointer"
                      >
                        View
                      </button>
                    </div>
                    <button 
                      onClick={() => handleDeleteCapture(cap.id, cap.url)}
                      className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white/60 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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
            uploadedGeoJson={mergedUploadedGeoJson}
          />
        )}

      </div>
    </div>
  );
}
