"use client";

import React, { useState } from "react";
import { useLang } from "../translations";
import JSONUploadModal from "./DataManagerPanel";
import { type MapCapture } from "./TemplateMatchPanel";
import { MapLayer } from "../../map/LayerPanel";
import { PanelContent } from "./PanelContent";
import { panels, type PanelId } from "./panels";
import { type RasterPreviewConfig, type SatellitePreviewConfig } from "./SatelliteDataPanel";

export default function AnalysisSidebar(
  {
  selectedFeature,
  uploadedGeoJsonMap,
  captures,
  onGeoJSONUpload,
  onDeleteGeoJSON,
  onOpen3D,
  onStartImageOverlay,
  onExtrusionConfig,
  onFlyTo,
  onClose,
  activePanel: controlledActivePanel,
  onActivePanelChange,
  onClearCaptures,
  onDeleteCapture,
  onRequestTemplateCapture,
  pendingTemplateCapture,
  onClearTemplateCapture,
  onRequestMapCapture,
  pendingMapCapture,
  onClearMapCapture,
  layers,
  onLayerToggle,
  onLayerOpacity,
  onLayerColor,
  onLayerRemove,
  onLayerRename,
  onLayerReorder,
  onLayerZoom,
  onLayer3D,
  onSatellitePreview,
  onRasterPreview,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  uploadedGeoJsonMap?: Record<string, any>;
  captures: any[];
  onGeoJSONUpload?: (geojson: GeoJSON.FeatureCollection, fileName: string, isUpdate?: boolean) => void;
  onDeleteGeoJSON?: (fileName: string) => void;
  onOpen3D?: (fileName: string) => void;
  onStartImageOverlay?: (file: File) => void;
  onExtrusionConfig?: (cfg: { enabled: boolean; heightProperty?: string; defaultHeightM?: number }) => void;
  onFlyTo?: (lat: number, lng: number) => void;
  onClose?: () => void;
  activePanel?: PanelId | null;
  onActivePanelChange?: (id: PanelId | null) => void;
  onClearCaptures: () => void;
  onDeleteCapture?: (id: number, url: string) => void;
  onRequestTemplateCapture?: () => void;
  pendingTemplateCapture?: MapCapture | null;
  onClearTemplateCapture?: () => void;
  onRequestMapCapture?: () => void;
  pendingMapCapture?: MapCapture | null;
  onClearMapCapture?: () => void;
  layers: MapLayer[];
  onLayerToggle: (id: string, visible: boolean) => void;
  onLayerOpacity: (id: string, opacity: number) => void;
  onLayerColor: (id: string, color: string) => void;
  onLayerRemove: (id: string) => void;
  onLayerRename: (id: string, newName: string) => void;
  onLayerReorder?: (from: number, to: number) => void;
  onLayerZoom: (id: string) => void;
  onLayer3D?: (id: string) => void;
  onSatellitePreview?: (config: SatellitePreviewConfig) => void;
  onRasterPreview?: (config: RasterPreviewConfig) => void;
}) {
  const [internalActivePanel, setInternalActivePanel] = useState<PanelId | null>("overview");
  const [uploadOpen, setUploadOpen] = useState(false);
  const { isRTL } = useLang();

  // Determine which state to use
  const activePanel = controlledActivePanel !== undefined ? 
  controlledActivePanel : internalActivePanel;

  //! If both controlled and internal states are used, consider adding a warning in development mode to avoid confusion.

  const togglePanel = (id: PanelId) => {
    const next = activePanel === id ? null : id;
    if (onActivePanelChange) {
      onActivePanelChange(next);
    } else {
      setInternalActivePanel(next);
    }
  };
  //^ معرفة بيانات الـ Panel
  const activeItem = panels.find((p) => p.id === activePanel);

  return (
    <>
      {uploadOpen && (
        <JSONUploadModal
          onClose={() => setUploadOpen(false)}
          onDisplay={(geojson, fileName) => { onGeoJSONUpload?.(geojson, fileName); }}
          onUpload={(geojson, fileName) => { onGeoJSONUpload?.(geojson, fileName); }}
          onAddImageOverlay={(file) => { onStartImageOverlay?.(file); }}
          onExtrusionConfig={(cfg) => { onExtrusionConfig?.(cfg); }}
        />
      )}

      <div
        className={`absolute top-0 bottom-0 z-1000 flex ${isRTL ? "flex-row-reverse left-0" : "flex-row right-0"}`}
        style={{ pointerEvents: "all" }}
      >
        <div
          className="h-full overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            width: activePanel ? "min(340px, calc(100vw - 52px))" : 0,
            pointerEvents: activePanel ? "all" : "none",
            opacity: activePanel ? 1 : 0,
          }}
        >
          <div className="h-full w-[min(340px,calc(100vw-52px))] bg-[#070f1e]/97 backdrop-blur-xl border-l border-white/[0.08] flex flex-col overflow-hidden shadow-[-8px_0_32px_rgba(0,0,0,0.4)]">

            //* {/* Panel header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-white/[0.06] shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
                  {activeItem?.icon}
                </div>
                <span className="text-sm font-medium text-slate-200">
                  {isRTL ? activeItem?.labelAr : activeItem?.labelEn}
                </span>
              </div>
              <button
                onClick={() => togglePanel(activePanel as PanelId)}
                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] rounded-md transition-all cursor-pointer"
                style={{  pointerEvents: activePanel ? "all" : "none", }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scroll">
              {activePanel && (
                <PanelContent
                  id={activePanel}
                  selectedFeature={selectedFeature}
                  uploadedGeoJsonMap={uploadedGeoJsonMap}
                  captures={captures}
                  onGeoJSONUpload={onGeoJSONUpload}
                  onDeleteGeoJSON={onDeleteGeoJSON}
                  onOpen3D={onOpen3D}
                  onFlyTo={onFlyTo}
                  onClearCaptures={onClearCaptures}
                  onDeleteCapture={onDeleteCapture}
                  onRequestTemplateCapture={onRequestTemplateCapture}
                  pendingTemplateCapture={pendingTemplateCapture}
                  onClearTemplateCapture={onClearTemplateCapture}
                  onRequestMapCapture={onRequestMapCapture}
                  pendingMapCapture={pendingMapCapture}
                  onClearMapCapture={onClearMapCapture}
                  layers={layers}
                  onLayerToggle={onLayerToggle}
                  onLayerOpacity={onLayerOpacity}
                  onLayerColor={onLayerColor}
                  onLayerRemove={onLayerRemove}
                  onLayerRename={onLayerRename}
                  onLayerReorder={onLayerReorder}
                  onLayerZoom={onLayerZoom}
                  onLayer3D={onLayer3D}
                  onSatellitePreview={onSatellitePreview}
                  onRasterPreview={onRasterPreview}
                />
              )}
            </div>
          </div>
        </div>

        <div
          className="h-full flex flex-col items-center py-3 gap-1 bg-[#070f1e]/92 backdrop-blur-xl border-l border-white/[0.07] w-[52px] shrink-0"
          style={{ pointerEvents: "all" }}
        >
          {panels.map((item) => (
            <div key={item.id} className="relative group w-full flex justify-center">
              <button
                onClick={() => togglePanel(item.id)}
                title={isRTL ? item.labelAr : item.labelEn}
                aria-label={isRTL ? item.labelAr : item.labelEn}
                className={`
                  relative w-9 h-9 rounded-lg flex items-center justify-center
                  transition-all duration-150 cursor-pointer
                  ${activePanel === item.id
                    ? "bg-cyan-400/15 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(0,212,255,0.3)]"
                    : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]"
                  }
                `}
              >
                {item.icon}
                {item.badge && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-cyan-400 text-[#040d1a] text-[0.52rem] font-bold rounded-full flex items-center justify-center px-0.5">
                    {item.badge}
                  </span>
                )}
              </button>

              {/* Tooltip */}
              <div className={`
                absolute top-1/2 -translate-y-1/2 pointer-events-none
                opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
                ${isRTL ? "right-11" : "left-11"}
              `}>
                <div className="bg-[#0d1b2e] border border-white/10 text-slate-200 text-[0.68rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-xl">
                  {isRTL ? item.labelAr : item.labelEn}
                  {item.badge && (
                    <span className="ml-1.5 bg-cyan-400/20 text-cyan-400 text-[0.58rem] px-1 rounded">
                      {item.badge}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="w-6 h-px bg-white/[0.08] my-1" />

          <div className="relative group w-full flex justify-center">
            <button
              onClick={() => setUploadOpen((p) => !p)}
              title="Upload GeoJSON"
              aria-label="Upload GeoJSON"
              className={`
                relative w-9 h-9 rounded-lg flex items-center justify-center
                transition-all duration-150 cursor-pointer
                ${uploadOpen
                  ? "bg-cyan-400/15 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(0,212,255,0.3)]"
                  : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]"
                }
              `}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </button>

            {/* Tooltip */}
            <div className={`
              absolute top-1/2 -translate-y-1/2 pointer-events-none
              opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
              ${isRTL ? "right-11" : "left-11"}
            `}>
              <div className="bg-[#0d1b2e] border border-white/10 text-slate-200 text-[0.68rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-xl">
                Upload GeoJSON
              </div>
            </div>
          </div>
        </div>

        <style>{`
          .custom-scroll::-webkit-scrollbar { width: 3px; }
          .custom-scroll::-webkit-scrollbar-track { background: transparent; }
          .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
          .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        `}</style>
      </div>
    </>
  );
}

