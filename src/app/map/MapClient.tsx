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

const UPLOADED_GEOJSON_STORAGE_KEY = "uploaded_geojson_v1";
const EXTRUSION_CFG_STORAGE_KEY    = "uploaded_geojson_extrusion_cfg_v1";

export default function MapPage() {
  const [aiOpen,           setAiOpen]           = useState(false);
  const [isFullscreen,     setIsFullscreen]      = useState(false);
  const [activeTool,       setActiveTool]        = useState<DrawTool>("pointer");
  const [selectedArea,     setSelectedArea]      = useState({ name: "Selected Area", ha: 0 });
  const [coords,           setCoords]            = useState<{ lat: number; lng: number } | null>(null);
  const [captureUrl,       setCaptureUrl]        = useState<string | null>(null);
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
    setLatestGeoJson(geojson);
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
      uploadedGeoJsonMap={uploadedGeoJsonMap}
      onGeoJSONUpload={handleGeoJSONUpload}
      onDeleteGeoJSON={handleDeleteGeoJSON}
      onOpen3D={handleOpen3D}
      onStartImageOverlay={handleStartImageOverlay}
      onExtrusionConfig={handleExtrusionConfig}
      onFlyTo={handleFlyTo}
      onClose={handleClose3D}
      activePanel={activePanel as any}
      onActivePanelChange={(id) => setActivePanel(id)}
    />
  ), [
    selectedFeature,
    uploadedGeoJsonMap,
    handleGeoJSONUpload,
    handleDeleteGeoJSON,
    handleOpen3D,
    handleStartImageOverlay,
    handleExtrusionConfig,
    handleFlyTo,
    handleClose3D,
    activePanel,
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

  // ── Capture toast timer ──────────────────────────────────────────────────
  useEffect(() => {
    if (captureUrl) {
      const timer = setTimeout(() => setCaptureUrl(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [captureUrl]);

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
            onCapture={setCaptureUrl}
            flyToRef={flyToRef}
            clearRef={clearRef}
            onSatChange={(h) => { changeSatRef.current = h; }}
            onIdxChange={(h) => { changeIdxRef.current = h; }}
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

            {/* ── Capture Preview Toast ── */}
            {captureUrl && (
              <div className={`absolute top-20 left-1/2 -translate-x-1/2 z-[2000] animate-fadeUp`}>
                <div className="bg-[#0a1628]/95 backdrop-blur-md border border-cyan-500/30 rounded-xl p-2 shadow-2xl flex items-center gap-3 min-w-[240px]">
                  <div className="w-16 h-16 rounded-lg overflow-hidden border border-white/10 bg-black shrink-0">
                    <img src={captureUrl} className="w-full h-full object-cover" alt="Capture" />
                  </div>
                  <div className="flex-1 pr-2">
                    <p className="text-[0.7rem] font-bold text-cyan-400 uppercase tracking-wider">Area Captured</p>
                    <p className="text-[0.62rem] text-slate-400 mt-0.5">Saved to local browser storage</p>
                    <button
                      onClick={() => {
                        setActivePanel("captures");
                        setCaptureUrl(null);
                      }}
                      className="mt-1.5 text-[0.6rem] font-bold text-white bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-500/30 px-2 py-1 rounded transition-all cursor-pointer"
                    >
                      View in Captures
                    </button>
                  </div>
                  <button onClick={() => setCaptureUrl(null)} className="p-1 text-slate-500 hover:text-white cursor-pointer">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>
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