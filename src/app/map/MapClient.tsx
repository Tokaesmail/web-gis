"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "../_components/translations";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";
import AnalysisDashboard from "../_components/AnalysisDashboard/AnalysisDashboard";
import AIAssistant from "../_components/AIAssistant/AIAssistant";

import type { GeoJSON } from "geojson";
import { DrawTool, SatKey, IdxKey } from "./mapTypes_proxy";
import MapNavbar from "./MapNavbar";
import MapToolbar from "./MapToolbar";
import MapSearch from "./MapSearch";
import MapLayerBar from "./MapLayerBar";
import LeafletMap from "./LeafletMap";
import CoordsPopup from "./CoordsPopup";
import AITriggerButton from "./AITriggerButton";
import Mapbox3DView from "./Mapbox3DView";

export default function MapPage() {
  const [aiOpen, setAiOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<DrawTool>("pointer");
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [selectedArea, setSelectedArea] = useState({
    name: "Selected Area",
    ha: 0,
  });
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [captureUrl, setCaptureUrl] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<GeoJSON.Feature | null>(null);
  const [view3D, setView3D] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [geoJsonData, setGeoJsonData]   = useState<any>(null);
  const [geoJsonLoading, setGeoJsonLoading] = useState(false);
  const [geoJsonError, setGeoJsonError] = useState<string | null>(null);

  // ── Universities service-area polygons ────────────────────────────────────
  const [uniData, setUniData]       = useState<any>(null);
  const [uniLoading, setUniLoading] = useState(false);
  const [uniError, setUniError]     = useState<string | null>(null);
  const [uploadedGeoJson, setUploadedGeoJson] = useState<any>(null);

  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const clearRef = useRef<(() => void) | null>(null);
  const changeSatRef = useRef<((sat: SatKey) => void) | null>(null);
  const changeIdxRef = useRef<((idx: IdxKey) => void) | null>(null);

  const { isRTL } = useLang();

  // ── جلب الـ Contour Lines من الـ API ─────────────────────────────────────
  useEffect(() => {
    const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";
    // جيب الـ token من localStorage لو موجود
    const token = typeof window !== "undefined"
      ? localStorage.getItem("gis_token") ?? localStorage.getItem("token") ?? ""
      : "";

    setGeoJsonLoading(true);
    fetch(`${BASE_URL}/gis/contours`, {
      headers: {
        "Accept-Encoding": "gzip, deflate, br",
        ...(token ? { token } : {}),
      },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setGeoJsonData(data);
        setGeoJsonError(null);
        console.log("✅ Contours loaded:", data?.features?.length, "features");
      })
      .catch((err) => {
        console.error("❌ Contours fetch error:", err);
        setGeoJsonError(err.message);
      })
      .finally(() => setGeoJsonLoading(false));
  }, []);

  // ── جلب شيكات الجامعات (Service Area Polygons) ───────────────────────────
  useEffect(() => {
    setUniLoading(true);
    fetch("/api/universities")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setUniData(data);
        setUniError(null);
        console.log("✅ Universities loaded:", data?.features?.length, "features");
      })
      .catch((err) => {
        console.error("❌ Universities fetch error:", err);
        setUniError(err.message);
      })
      .finally(() => setUniLoading(false));
  }, []);

  const handleAreaSelected = useCallback((name: string, area: number) => {
    setSelectedArea({ name, ha: area });
    setDashboardVisible(true);
  }, []);

  // ← بتتنادى من LeafletMap لما الـ capture يتحفظ في IndexedDB
  const handleCapture = useCallback((url: string) => {
    setCaptureUrl(url);
  }, []);

  const handleClear = useCallback(() => {
    clearRef.current?.();
    setDashboardVisible(false);
    setCoords(null);
    setCaptureUrl(null);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveTool("pointer");
        clearRef.current?.();
        setCoords(null);
        setCaptureUrl(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const handleSatChange = useCallback((handler: (sat: SatKey) => void) => {
    changeSatRef.current = handler;
  }, []);

  const handleIdxChange = useCallback((handler: (idx: IdxKey) => void) => {
    changeIdxRef.current = handler;
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen)
      document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  return (
    <div
      className={`flex flex-col w-full h-screen bg-[#040d1a] overflow-hidden ${isRTL ? "font-arabic" : ""}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Noto+Sans+Arabic:wght@300;400;500&display=swap');
        body{font-family:'DM Sans',sans-serif;margin:0}
        .font-arabic{font-family:'Noto Sans Arabic',sans-serif!important}
      `}</style>

      {!isFullscreen && (
        <MapNavbar
          isFullscreen={isFullscreen}
          onFullscreenToggle={toggleFullscreen}
        />
      )}

      <div className="relative flex-1 overflow-hidden">
        <LeafletMap
          activeTool={activeTool}
          onAreaSelected={handleAreaSelected}
          onCoordsUpdate={(lat, lng) => {
            setCoords({ lat, lng });
          }}
          onCapture={handleCapture}
          flyToRef={flyToRef}
          clearRef={clearRef}
          onSatChange={handleSatChange}
          onIdxChange={handleIdxChange}
          geoJsonData={geoJsonData}
          extraGeoJsonData={
            uniData && uploadedGeoJson
              ? { type: "FeatureCollection", features: [...(uniData.features ?? []), ...(uploadedGeoJson.features ?? [])] }
              : uploadedGeoJson ?? uniData
          }
          geoJsonFitBounds={true}
          onFeatureClick={(feature) => {
            setSelectedFeature(feature);
            /* ── فتح الـ 3D View لو الـ Feature عنده إحداثيات ─────────── */
            if (feature.geometry.type === "Point") {
              const [lng, lat] = (feature.geometry as GeoJSON.Point).coordinates;
              const name =
                feature.properties?.name ??
                feature.properties?.NAME ??
                feature.properties?.title ??
                undefined;
              setView3D({ lat, lng, name });
            } else if (
              feature.geometry.type === "Polygon" ||
              feature.geometry.type === "MultiPolygon"
            ) {
              /* استخدم أول نقطة من الـ Polygon كمركز تقريبي */
              const coords =
                feature.geometry.type === "Polygon"
                  ? (feature.geometry as GeoJSON.Polygon).coordinates[0][0]
                  : (feature.geometry as GeoJSON.MultiPolygon).coordinates[0][0][0];
              const name =
                feature.properties?.name ??
                feature.properties?.NAME ??
                feature.properties?.title ??
                undefined;
              setView3D({ lat: coords[1], lng: coords[0], name });
            }
          }}
        />

        {/* ── GeoJSON loading / error indicator ─────────────────────────── */}
        {geoJsonLoading && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#0a1628]/95 backdrop-blur-md border border-cyan-400/30 rounded-xl px-3 py-2 shadow-lg pointer-events-none animate-fadeUp">
            <svg className="animate-spin w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-[0.7rem] text-cyan-400">Loading contours…</span>
          </div>
        )}
        {geoJsonError && !geoJsonLoading && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#0a1628]/95 backdrop-blur-md border border-red-400/30 rounded-xl px-3 py-2 shadow-lg animate-fadeUp">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span className="text-[0.7rem] text-red-400">Contours: {geoJsonError}</span>
            <button
              onClick={() => setGeoJsonError(null)}
              className="text-slate-600 hover:text-slate-400 ml-1 cursor-pointer">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {geoJsonData && !geoJsonLoading && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#0a1628]/95 backdrop-blur-md border border-emerald-400/30 rounded-xl px-3 py-2 shadow-lg pointer-events-none animate-fadeUp">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[0.7rem] text-emerald-400">
              {geoJsonData?.features?.length?.toLocaleString()} contour features loaded
            </span>
          </div>
        )}

        {/* ── Universities loading / error / success indicator ──────────── */}
        {uniLoading && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#0a1628]/95 backdrop-blur-md border border-violet-400/30 rounded-xl px-3 py-2 shadow-lg pointer-events-none animate-fadeUp">
            <svg className="animate-spin w-3.5 h-3.5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-[0.7rem] text-violet-400">جاري تحميل بيانات الجامعات…</span>
          </div>
        )}
        {uniError && !uniLoading && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#0a1628]/95 backdrop-blur-md border border-red-400/30 rounded-xl px-3 py-2 shadow-lg animate-fadeUp">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
            <span className="text-[0.7rem] text-red-400">Universities: {uniError}</span>
            <button onClick={() => setUniError(null)} className="text-slate-600 hover:text-slate-400 ml-1 cursor-pointer">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {uniData && !uniLoading && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 bg-[#0a1628]/95 backdrop-blur-md border border-violet-400/30 rounded-xl px-3 py-2 shadow-lg pointer-events-none animate-fadeUp">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[0.7rem] text-violet-400">
              {uniData?.features?.length} مناطق خدمة جامعات محملة
            </span>
          </div>
        )}

        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-4 right-4 z-[1100] w-9 h-9 flex items-center justify-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 rounded-lg shadow-lg transition-all cursor-pointer pointer-events-auto">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          </button>
        )}

        <MapSearch onFlyTo={(lat, lng) => flyToRef.current?.(lat, lng)} />

        <MapToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onClear={handleClear}
        />

        <AnalysisSidebar
          selectedFeature={selectedFeature}
          onGeoJSONUpload={setUploadedGeoJson}
          onFlyTo={(lat, lng) => flyToRef.current?.(lat, lng)}
        />

        {coords && (
          <CoordsPopup
            lat={coords.lat}
            lng={coords.lng}
            onClose={() => setCoords(null)}
          />
        )}

        <MapLayerBar
          onSatChange={(sat) => changeSatRef.current?.(sat)}
          onIdxChange={(idx) => changeIdxRef.current?.(idx)}
        />

        {/* ── Preview صورة المنطقة المحددة ─────────────────────────────── */}
        {captureUrl && (
          <div className="absolute top-10 left-10 z-[900] pointer-events-auto animate-fadeUp">
            <div className="bg-[#0a1628]/98 backdrop-blur-xl border border-cyan-400/20 rounded-xl p-3 shadow-[0_8px_32px_rgba(0,212,255,0.1)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[0.68rem] text-cyan-400 font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Captured Area
                </span>
                <button
                  onClick={() => setCaptureUrl(null)}
                  className="text-slate-600 hover:text-slate-400 transition-colors ml-3">
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <img
                src={captureUrl}
                alt="captured polygon area"
                className="max-w-[180px] max-h-[130px] rounded-lg object-cover border border-white/5"
              />
            </div>
          </div>
        )}

        <AITriggerButton onClick={() => setAiOpen((o) => !o)} active={aiOpen} />

        <AnalysisDashboard
          visible={dashboardVisible}
          onClose={() => setDashboardVisible(false)}
          areaName={selectedArea.name}
          areaSizeHa={selectedArea.ha}
        />

        <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>

      {/* ── 3D Terrain Full Screen View ─────────────────────────────────── */}
      {view3D && (
        <Mapbox3DView
          lat={view3D.lat}
          lng={view3D.lng}
          featureName={view3D.name}
          onClose={() => setView3D(null)}
        />
      )}
    </div>
  );
}