"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLang } from "../_components/translations";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";
import AnalysisDashboard from "../_components/AnalysisDashboard/AnalysisDashboard";
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

const UPLOADED_GEOJSON_STORAGE_KEY = "uploaded_geojson_v1";
const EXTRUSION_CFG_STORAGE_KEY    = "uploaded_geojson_extrusion_cfg_v1";

export default function MapPage() {
  const [aiOpen,           setAiOpen]           = useState(false);
  const [isFullscreen,     setIsFullscreen]      = useState(false);
  const [activeTool,       setActiveTool]        = useState<DrawTool>("pointer");
  const [dashboardVisible, setDashboardVisible]  = useState(false);
  const [selectedArea,     setSelectedArea]      = useState({ name: "Selected Area", ha: 0 });
  const [coords,           setCoords]            = useState<{ lat: number; lng: number } | null>(null);
  const [captureUrl,       setCaptureUrl]        = useState<string | null>(null);
  const [selectedFeature,  setSelectedFeature]   = useState<any>(null);
  const [view3D,           setView3D]            = useState<{ lat: number; lng: number; name?: string } | null>(null);

  const [geoJsonData,     setGeoJsonData]     = useState<any>(null);
  const [geoJsonLoading,  setGeoJsonLoading]  = useState(false);
  const [geoJsonError,    setGeoJsonError]    = useState<string | null>(null);
  const [uniData,         setUniData]         = useState<any>(null);
  const [uniLoading,      setUniLoading]      = useState(false);
  const [uniError,        setUniError]        = useState<string | null>(null);
  const [uploadedGeoJsonMap, setUploadedGeoJsonMap] = useState<Record<string, any>>({});
  const [extrusionCfg,    setExtrusionCfg]    = useState<any>(null);

  const flyToRef               = useRef<((lat: number, lng: number) => void) | null>(null);
  const clearRef               = useRef<(() => void) | null>(null);
  const changeSatRef           = useRef<((sat: SatKey) => void) | null>(null);
  const changeIdxRef           = useRef<((idx: IdxKey) => void) | null>(null);
  const startImagePlacementRef = useRef<((file: File) => void) | null>(null);
  const lastCoordsRef          = useRef<{ lat: number; lng: number }>({ lat: 30.0, lng: 31.0 });

  // ── double-click tracking ─────────────────────────────────────────────────
  const lastClickTimeRef = useRef<number>(0);

  const { isRTL } = useLang();

  // ── 1. localStorage restore ───────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPLOADED_GEOJSON_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migration: if the stored data is a FeatureCollection, convert to Map format
        if (parsed && parsed.type === "FeatureCollection") {
          setUploadedGeoJsonMap({ "imported_legacy.json": parsed });
        } else {
          setUploadedGeoJsonMap(parsed || {});
        }
      }
      const rawCfg = localStorage.getItem(EXTRUSION_CFG_STORAGE_KEY);
      if (rawCfg) setExtrusionCfg(JSON.parse(rawCfg));
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

  // ── 4. Combined GeoJSON ───────────────────────────────────────────────────
  const mergedUploadedGeoJson = useMemo(() => {
    const features = Object.values(uploadedGeoJsonMap).flatMap(
      (gj: any) => gj?.features ?? []
    );
    return { type: "FeatureCollection", features } as any;
  }, [uploadedGeoJsonMap]);

  const combinedGeoJson = useMemo(() => {
    const features = [
      ...(uniData?.features ?? []),
      ...(mergedUploadedGeoJson?.features ?? []),
    ];
    return { type: "FeatureCollection", features } as any;
  }, [uniData, mergedUploadedGeoJson]);

  // ── Stable callbacks ──────────────────────────────────────────────────────
  const handleGeoJSONUpload = useCallback((geojson: any, fileName: string = "uploaded.json") => {
    setUploadedGeoJsonMap((prev) => ({ ...prev, [fileName]: geojson }));
  }, []);

  // Sync uploadedGeoJsonMap to localStorage
  useEffect(() => {
    if (Object.keys(uploadedGeoJsonMap).length === 0) return;
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
    setDashboardVisible(false);
    setCoords(null);
    setCaptureUrl(null);
    localStorage.removeItem(UPLOADED_GEOJSON_STORAGE_KEY);
    localStorage.removeItem(EXTRUSION_CFG_STORAGE_KEY);
    setUploadedGeoJsonMap({});
    setExtrusionCfg(null);
  }, []);

  const handleToggleView = useCallback(() => {
    setView3D((prev) => prev ? null : { ...lastCoordsRef.current });
  }, []);

  // ── Shared sidebar ────────────────────────────────────────────────────────
  const sharedSidebar = useMemo(() => (
    <AnalysisSidebar
      selectedFeature={selectedFeature}
      onGeoJSONUpload={handleGeoJSONUpload}
      onStartImageOverlay={handleStartImageOverlay}
      onExtrusionConfig={handleExtrusionConfig}
      onFlyTo={handleFlyTo}
      onClose={handleClose3D}
    />
  ), [
    selectedFeature,
    handleGeoJSONUpload,
    handleStartImageOverlay,
    handleExtrusionConfig,
    handleFlyTo,
    handleClose3D,
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
              setDashboardVisible(true);
            }}
            onCoordsUpdate={(lat, lng) => {
              lastCoordsRef.current = { lat, lng };
              setCoords({ lat, lng });
            }}
            onCapture={setCaptureUrl}
            flyToRef={flyToRef}
            clearRef={clearRef}
            onSatChange={(h) => { changeSatRef.current = h; }}
            onIdxChange={(h) => { changeIdxRef.current = h; }}
            onImagePlacerRegister={(h) => { startImagePlacementRef.current = h; }}
            geoJsonData={geoJsonData}
            extraGeoJsonData={combinedGeoJson}
            extrusionConfig={extrusionCfg || { enabled: false }}
            onFeatureClick={setSelectedFeature}
          />
        </div>

        {/* ── 2D overlays ── */}
        {!view3D && (
          <>
            {/* زرار 3D + hint */}
            <div className="absolute top-3 left-3 z-[1100] flex items-center gap-2">
              <button
                onClick={handleToggleView}
                className="px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 text-slate-300 text-xs cursor-pointer hover:text-cyan-400 transition-all"
              >
                3D View
              </button>
              <span className="px-2 py-1 rounded-md bg-[#0a1628]/80 border border-white/[0.06] text-slate-500 text-[0.65rem] select-none">
                أو Double-click على الخريطة
              </span>
            </div>

            <MapSearch onFlyTo={(lat, lng) => flyToRef.current?.(lat, lng)} />
            <MapToolbar activeTool={activeTool} onToolChange={setActiveTool} onClear={handleClear} />
            <MapLayerBar
              onSatChange={(s) => changeSatRef.current?.(s)}
              onIdxChange={(i) => changeIdxRef.current?.(i)}
            />
            {coords && (
              <CoordsPopup lat={coords.lat} lng={coords.lng} onClose={() => setCoords(null)} />
            )}
            <AITriggerButton onClick={() => setAiOpen(!aiOpen)} active={aiOpen} />
            <AnalysisDashboard
              visible={dashboardVisible}
              onClose={() => setDashboardVisible(false)}
              areaName={selectedArea.name}
              areaSizeHa={selectedArea.ha}
            />
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