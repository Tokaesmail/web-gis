"use client";

import { useState, useEffect, useRef } from "react";
import { useLang } from "../_components/translations";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";
import MapSearch from "../_components/MapSearch/MapSearch";
import MapToolbar from "../_components/MapToolbar/MapToolbar";
import AIAssistant from "../_components/AIAssistant/AIAssistant";


// ─── Satellite / Index selectors ─────────────────────────────────────────────
const SATELLITES = ["Sentinel-2", "Landsat-8", "Sentinel-1"];
const INDICES = ["NDVI", "NDWI", "EVI", "SAVI", "RGB"];

function MapLayerBar() {
  const [sat, setSat] = useState("Sentinel-2");
  const [idx, setIdx] = useState("NDVI");
  return (
    <div className="absolute bottom-[76px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-auto">
      <div className="flex items-center gap-0.5 bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1 py-1 shadow-lg">
        {SATELLITES.map((s) => (
          <button key={s} onClick={() => setSat(s)}
            className={`text-[0.67rem] tracking-wide px-3 py-1 rounded-full cursor-pointer transition-all duration-150 ${sat === s ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5 bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1 py-1 shadow-lg">
        {INDICES.map((i) => (
          <button key={i} onClick={() => setIdx(i)}
            className={`text-[0.67rem] tracking-wide px-3 py-1 rounded-full cursor-pointer transition-all duration-150 ${idx === i ? "bg-cyan-400/20 text-cyan-400 border border-cyan-400/30" : "text-slate-500 hover:text-slate-300"}`}>
            {i}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-0.5 bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1.5 py-1.5 shadow-lg">
        {[
          { title: "Layers", d: <><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></> },
          { title: "Export", d: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></> },
        ].map((btn) => (
          <button key={btn.title} title={btn.title} className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] rounded-full transition-all cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{btn.d}</svg>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline bar ─────────────────────────────────────────────────────────────
function TimelineBar() {
  const dates = ["23 Dec", "28 Dec", "02 Jan", "07 Jan", "12 Jan", "17 Jan", "22 Jan", "27 Jan", "01 Feb", "11 Feb", "16 Feb"];
  const [active, setActive] = useState("16 Feb");
  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 h-[68px] bg-[#040d1a]/96 backdrop-blur-xl border-t border-white/[0.07] flex items-center px-4 gap-2 pointer-events-auto">
      <button className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-300 cursor-pointer shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <div className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {dates.map((d) => (
          <button key={d} onClick={() => setActive(d)}
            className={`shrink-0 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all duration-150 border text-[0.64rem] ${active === d ? "bg-cyan-400/15 border-cyan-400/40 text-cyan-400" : "border-white/[0.06] text-slate-500 hover:text-slate-300 hover:bg-white/[0.05]"}`}>
            {d}
          </button>
        ))}
      </div>
      <button className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-300 cursor-pointer shrink-0">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  );
}

// ─── AI Trigger Button ────────────────────────────────────────────────────────
function AITriggerButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick}
      className={`absolute bottom-[84px] right-[60px] z-20 w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.5)] pointer-events-auto ${active ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_20px_rgba(0,212,255,0.5)]" : "bg-[#0a1628]/95 backdrop-blur-md border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-400/30"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        <path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>
      </svg>
    </button>
  );
}

// ─── Leaflet Map ──────────────────────────────────────────────────────────────
function LeafletMap({ onAreaSelected }: { onAreaSelected: (name: string) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current) return;

    // Dynamically import Leaflet (SSR safe)
    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      // Create map centered on Egypt (Nile Delta area like the screenshot)
      const map = L.map(mapRef.current!, {
        center: [30.5, 31.2],
        zoom: 11,
        zoomControl: false,
      });

      mapInstanceRef.current = map;

      // Satellite tile layer (ESRI)
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles © Esri", maxZoom: 20 }
      ).addTo(map);

      // Optional: streets overlay (labels)
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { attribution: "", maxZoom: 20, opacity: 0.6 }
      ).addTo(map);

      // Draw a sample NDVI polygon (like the screenshot field)
      const fieldCoords: [number, number][] = [
        [30.54, 31.18], [30.56, 31.22], [30.53, 31.26],
        [30.50, 31.24], [30.49, 31.20], [30.52, 31.17],
      ];

      const ndviPolygon = L.polygon(fieldCoords, {
        color: "#00d4ff",
        weight: 2,
        dashArray: "6 4",
        fillColor: "#22c55e",
        fillOpacity: 0.18,
      }).addTo(map);

      ndviPolygon.bindTooltip("Field 1 · 27.4 ha · NDVI 0.72", {
        permanent: false,
        className: "ndvi-tooltip",
        direction: "top",
      });

      ndviPolygon.on("click", () => {
        onAreaSelected("Field 1 · 27.4 ha");
      });

      // Sample marker
      const marker = L.circleMarker([30.525, 31.215], {
        radius: 8,
        color: "#00d4ff",
        fillColor: "#00d4ff",
        fillOpacity: 0.8,
        weight: 2,
      }).addTo(map);
      marker.bindPopup("<b>Field 1</b><br/>NDVI: 0.72 · Apple · 27.4 ha");

      // Fit to polygon
      map.fitBounds(ndviPolygon.getBounds(), { padding: [60, 60] });
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        .leaflet-container { background: #040d1a !important; }
        .ndvi-tooltip {
          background: #0a1628 !important;
          border: 1px solid rgba(0,212,255,0.3) !important;
          color: #e2e8f0 !important;
          font-size: 0.72rem !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
        }
        .ndvi-tooltip::before { border-top-color: rgba(0,212,255,0.3) !important; }
        .leaflet-popup-content-wrapper {
          background: #0a1628 !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          color: #e2e8f0 !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important;
          font-size: 0.8rem !important;
        }
        .leaflet-popup-tip { background: #0a1628 !important; }
        .leaflet-popup-close-button { color: #64748b !important; }
        .leaflet-control-attribution { background: rgba(4,13,26,0.8) !important; color: #475569 !important; font-size: 0.55rem !important; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" />
    </>
  );
}

// ─── Scale bar ────────────────────────────────────────────────────────────────
function ScaleBar() {
  return (
    <div className="absolute top-4 right-[68px] z-20 flex items-center gap-1.5 bg-[#0a1628]/85 backdrop-blur-sm border border-white/10 rounded-md px-2.5 py-1 pointer-events-none">
      <div className="w-8 h-0.5 bg-slate-400" />
      <span className="text-[0.6rem] text-slate-400">100 m</span>
    </div>
  );
}

// ─── Coordinates display ──────────────────────────────────────────────────────
function CoordsDisplay() {
  return (
    <div className="absolute bottom-[76px] left-[60px] z-20 bg-[#0a1628]/80 backdrop-blur-sm border border-white/[0.08] rounded-md px-2.5 py-1 text-[0.6rem] text-slate-500 pointer-events-none">
      30.5244°N · 31.2001°E
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function MapNavbar({ isFullscreen, onFullscreenToggle }: { isFullscreen: boolean; onFullscreenToggle: () => void }) {
  const { t, isRTL, toggleLang, lang } = useLang();
  return (
    <nav className="h-12 flex items-center justify-between px-4 bg-[#040d1a]/95 backdrop-blur-xl border-b border-white/[0.07] shrink-0 z-30 relative">
      {/* Left: Logo */}
      <a href="/" className="flex items-center gap-2 no-underline">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" style={{ animation: "blink 2s ease-in-out infinite" }} />
        <span className="text-cyan-400 font-semibold tracking-wide text-[0.85rem]">{t.projectName}</span>
      </a>

      {/* Center: breadcrumb */}
      <div className="flex items-center gap-1.5 text-[0.72rem] text-slate-500">
        <a href="/" className="hover:text-slate-300 transition-colors no-underline">{t.navMap}</a>
        <span>/</span>
        <span className="text-slate-300">Nile Delta · Field 1</span>
        <span className="ml-2 flex items-center gap-1 bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 px-2 py-0.5 rounded-full text-[0.6rem]">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5">
        {/* Lang */}
        <button onClick={toggleLang}
          className="border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 text-[0.7rem] px-2.5 py-1 rounded-md bg-transparent cursor-pointer transition-all">
          {lang === "en" ? "عربي" : "EN"}
        </button>

        {/* Share */}
        <button title="Share" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] rounded-md transition-all cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>

        {/* Download */}
        <button title="Export" className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] rounded-md transition-all cursor-pointer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>

        {/* Fullscreen toggle */}
        <button
          onClick={onFullscreenToggle}
          title={isFullscreen ? "Exit fullscreen" : "Full screen"}
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/[0.08] border border-transparent hover:border-cyan-400/20 rounded-md transition-all cursor-pointer"
        >
          {isFullscreen ? (
            /* compress icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
              <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
            </svg>
          ) : (
            /* expand icon */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7V3h4"/><path d="M17 3h4v4"/>
              <path d="M21 17v4h-4"/><path d="M7 21H3v-4"/>
            </svg>
          )}
        </button>
      </div>

      <style>{`@keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}`}</style>
    </nav>
  );
}

// ─── In-map Fullscreen Button (visible when navbar hidden) ────────────────────
function InMapFullscreenBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Exit fullscreen"
      className="absolute top-4 right-4 z-30 w-9 h-9 flex items-center justify-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 rounded-lg shadow-lg transition-all cursor-pointer pointer-events-auto"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/>
        <path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>
      </svg>
    </button>
  );
}

// ─── Main MapPage ─────────────────────────────────────────────────────────────
export default function MapPage() {
  const [aiOpen, setAiOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { isRTL } = useLang();

  // Real browser fullscreen API
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div className={`flex flex-col w-full h-screen bg-[#040d1a] overflow-hidden ${isRTL ? "font-arabic" : ""}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Noto+Sans+Arabic:wght@300;400;500&display=swap');
        body { font-family: 'DM Sans', sans-serif; margin: 0; }
        .font-arabic { font-family: 'Noto Sans Arabic', sans-serif !important; }
      `}</style>

      {/* ── NAVBAR (hidden when fullscreen) ── */}
      {!isFullscreen && (
        <MapNavbar isFullscreen={isFullscreen} onFullscreenToggle={toggleFullscreen} />
      )}

      {/* ── MAP AREA (fills remaining height) ── */}
      <div className="relative flex-1 overflow-hidden">

        {/* Leaflet fills this container */}
        <LeafletMap onAreaSelected={(name) => console.log("Selected:", name)} />

        {/* In-map exit fullscreen button */}
        {isFullscreen && <InMapFullscreenBtn onClick={toggleFullscreen} />}

        {/* ── SEARCH BAR ── */}
        <MapSearch />

        {/* ── LEFT TOOLBAR ── */}
        <MapToolbar />

        {/* ── RIGHT SIDEBAR ── */}
        <AnalysisSidebar />

        {/* ── SCALE BAR ── */}
        <ScaleBar />

        {/* ── COORDS ── */}
        <CoordsDisplay />

        {/* ── LAYER / INDEX BAR ── */}
        <MapLayerBar />

        {/* ── AI BUTTON ── */}
        <AITriggerButton onClick={() => setAiOpen((o) => !o)} active={aiOpen} />

        {/* ── TIMELINE ── */}
        <TimelineBar />

        {/* ── AI CHAT ── */}
        <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)} />
      </div>
    </div>
  );
}