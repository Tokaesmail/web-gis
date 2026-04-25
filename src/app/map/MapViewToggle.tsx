"use client";

/**
 * MapViewToggle.tsx
 * ─────────────────
 * Wrapper يجمع LeafletMap + Mapbox3DView مع:
 *  • زرار toggle بينهم (2D ↔ 3D) في الـ top-bar
 *  • AnalysisSidebar تظهر في الاتنين
 *
 * Usage:
 *   <MapViewToggle
 *     lat={30.1}
 *     lng={31.2}
 *     featureName="My Field"
 *     // باقي props بتاعة LeafletMap وAnalysisSidebar
 *   />
 */

import { useState, useRef } from "react";
import LeafletMap     from "./LeafletMap";
import Mapbox3DView   from "./Mapbox3DView";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";

// ── أي props مشتركة بين الاتنين ──────────────────────────────────────────────
import type { DrawTool, SatKey, IdxKey } from "./mapTypes_proxy";
import type { GeoJSON } from "geojson";

interface MapViewToggleProps {
  // ── LeafletMap props ──
  activeTool:     DrawTool;
  onAreaSelected: (name: string, area: number) => void;
  onCoordsUpdate: (lat: number, lng: number) => void;
  flyToRef:       React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  clearRef:       React.MutableRefObject<(() => void) | null>;
  onSatChange:    (handler: (sat: SatKey) => void) => void;
  onIdxChange:    (handler: (idx: IdxKey) => void) => void;
  onCapture?:     (url: string) => void;
  onFeatureClick?: (feature: GeoJSON.Feature) => void;
  geoJsonData?:   GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  extraGeoJsonData?: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  geoJsonStyle?:  { color?: string; weight?: number; opacity?: number; fillColor?: string; fillOpacity?: number; dashArray?: string };
  geoJsonFitBounds?: boolean;

  // ── 3D view props ──
  /** إحداثيات مركز الـ 3D view */
  lat: number;
  lng: number;
  featureName?: string;

  // ── AnalysisSidebar props ──
  selectedFeature?: GeoJSON.Feature | null;
  uploadedGeoJsonMap?: Record<string, any>;
  captures: any[];
  onGeoJSONUpload?: (geojson: GeoJSON.FeatureCollection, fileName: string) => void;
  onDeleteGeoJSON?: (fileName: string) => void;
  onOpen3D?: (fileName: string) => void;
  onStartImageOverlay?: (file: File) => void;
  onExtrusionConfig?: (cfg: { enabled: boolean; heightProperty?: string; defaultHeightM?: number }) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onClearCaptures: () => void;
  layers: any[];
  onLayerToggle: (id: string, visible: boolean) => void;
  onLayerOpacity: (id: string, opacity: number) => void;
  onLayerColor: (id: string, color: string) => void;
  onLayerRemove: (id: string) => void;
  onLayerZoom: (id: string) => void;
}

type ViewMode = "2d" | "3d";

export default function MapViewToggle(props: MapViewToggleProps) {
  const [mode, setMode] = useState<ViewMode>("2d");

  // ── Shared sidebar — يُعرض في الاتنين ─────────────────────────────────────
  const sidebar = (
    <AnalysisSidebar
      selectedFeature={props.selectedFeature}
      uploadedGeoJsonMap={props.uploadedGeoJsonMap}
      captures={props.captures}
      onGeoJSONUpload={props.onGeoJSONUpload}
      onDeleteGeoJSON={props.onDeleteGeoJSON}
      onOpen3D={props.onOpen3D}
      onStartImageOverlay={props.onStartImageOverlay}
      onExtrusionConfig={props.onExtrusionConfig}
      onFlyTo={props.onFlyTo}
      onClearCaptures={props.onClearCaptures}
      layers={props.layers}
      onLayerToggle={props.onLayerToggle}
      onLayerOpacity={props.onLayerOpacity}
      onLayerColor={props.onLayerColor}
      onLayerRemove={props.onLayerRemove}
      onLayerZoom={props.onLayerZoom}
    />
  );

  // ── Toggle Button ─────────────────────────────────────────────────────────
  const ToggleBtn = () => (
    <button
      onClick={() => setMode((m) => (m === "2d" ? "3d" : "2d"))}
      className="
        flex items-center gap-1.5 px-3 py-1.5 rounded-lg
        bg-[#0d1f3c] border border-white/10
        hover:border-cyan-400/40 text-slate-300 hover:text-cyan-400
        transition-all text-xs cursor-pointer select-none
      "
      title={mode === "2d" ? "Switch to 3D Terrain" : "Switch to 2D Map"}
    >
      {mode === "2d" ? (
        <>
          {/* 3D icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 17l4-8 4 4 4-6 4 10" />
            <path d="M3 3v18h18" />
          </svg>
          3D View
        </>
      ) : (
        <>
          {/* 2D / map icon */}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
            <line x1="9" y1="3" x2="9" y2="18" />
            <line x1="15" y1="6" x2="15" y2="21" />
          </svg>
          2D Map
        </>
      )}
    </button>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // 3D MODE
  // ─────────────────────────────────────────────────────────────────────────
  if (mode === "3d") {
    return (
      <div className="relative w-full h-full">
        <Mapbox3DView
          lat={props.lat}
          lng={props.lng}
          featureName={props.featureName}
          onClose={() => setMode("2d")}
          sidebarSlot={sidebar}
        />

        {/*
          Override the "Back to Map" button area with our toggle button.
          We inject it as an absolute overlay on top of the Mapbox3DView top-bar.
          Since Mapbox3DView already has its own "Back" button, we add our toggle
          right next to it via a portal-like absolute div.
        */}
        <div
          className="absolute top-2 left-[160px] z-[2100] flex items-center"
          style={{ pointerEvents: "all" }}
        >
          <ToggleBtn />
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2D MODE
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full">
      {/* Leaflet map fills the container */}
      <LeafletMap
        activeTool={props.activeTool}
        onAreaSelected={props.onAreaSelected}
        onCoordsUpdate={props.onCoordsUpdate}
        flyToRef={props.flyToRef}
        clearRef={props.clearRef}
        onSatChange={props.onSatChange}
        onIdxChange={props.onIdxChange}
        onCapture={props.onCapture}
        onFeatureClick={props.onFeatureClick}
        geoJsonData={props.geoJsonData}
        extraGeoJsonData={props.extraGeoJsonData}
        geoJsonStyle={props.geoJsonStyle}
        geoJsonFitBounds={props.geoJsonFitBounds}
      />

      {/* Sidebar — نفس اللي في الـ 3D view */}
      {sidebar}

      {/* Toggle button — فوق الـ map في top-left */}
      <div className="absolute top-3 left-3 z-[1100]" style={{ pointerEvents: "all" }}>
        <ToggleBtn />
      </div>
    </div>
  );
}
