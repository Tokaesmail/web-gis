"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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
  const [captureUrl, setCaptureUrl] = useState<string | null>(null); // ← URL الصورة المحفوظة

  const flyToRef = useRef<((lat: number, lng: number) => void) | null>(null);
  const clearRef = useRef<(() => void) | null>(null);
  const changeSatRef = useRef<((sat: SatKey) => void) | null>(null);
  const changeIdxRef = useRef<((idx: IdxKey) => void) | null>(null);

  const { isRTL } = useLang();

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
          onCoordsUpdate={(lat, lng) => setCoords({ lat, lng })}
          onCapture={handleCapture}
          flyToRef={flyToRef}
          clearRef={clearRef}
          onSatChange={useCallback((handler) => {
            changeSatRef.current = handler;
          }, [])}
          onIdxChange={useCallback((handler) => {
            changeIdxRef.current = handler;
          }, [])}
        />

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

        <AnalysisSidebar />

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
          <div className="absolute bottom-10 left-16 z-[900] pointer-events-auto animate-fadeUp">
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
    </div>
  );
}
