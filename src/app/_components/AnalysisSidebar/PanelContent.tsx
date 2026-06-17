import React, { useState } from "react";
import { useLang } from "../translations";
import TemplateMatchPanel, { type MapCapture } from "./TemplateMatchPanel";
import LayerPanel, { MapLayer } from "../../map/LayerPanel";
import ExportButton from "../../map/ExportButton";
import { CapturesPanel } from "./CapturesPanel";
import { NDVILivePanel, OverviewLivePanel, WeatherLivePanel } from "./LivePanels";
import { RasterCalculatorPanel } from "./RasterCalculatorPanel";
import { SatelliteDataPanel, type RasterPreviewConfig, type SatellitePreviewConfig } from "./SatelliteDataPanel";
import { getMidCoords } from "./geoFeatureUtils";
import { PanelId } from "./panels";
import { CropsPanel } from "./CropsPanel";

export function PanelContent({
  id,
  selectedFeature,
  uploadedGeoJsonMap,
  captures,
  onGeoJSONUpload,
  onDeleteGeoJSON,
  onOpen3D,
  onFlyTo,
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
  id: PanelId;
  selectedFeature?: GeoJSON.Feature | null;
  uploadedGeoJsonMap?: Record<string, any>;
  captures: any[];
  onGeoJSONUpload?: (geojson: GeoJSON.FeatureCollection, fileName: string, isUpdate?: boolean) => void;
  onDeleteGeoJSON?: (fileName: string) => void;
  onOpen3D?: (fileName: string) => void;
  onFlyTo?: (lat: number, lng: number) => void;
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
  const [ndviExportData, setNdviExportData] = useState<any>(null);
  const { t, isRTL } = useLang();

  if (id === "satellite") {
    return <SatelliteDataPanel selectedFeature={selectedFeature} onPreview={onSatellitePreview} />;
  }

  if (id === "raster") {
    return <RasterCalculatorPanel selectedFeature={selectedFeature} onPreview={onRasterPreview} />;
  }

  if (id === "ndvi") {
    const coords = getMidCoords(selectedFeature);

    const exportBundle = {
        coords: coords ? { lat: coords[0], lng: coords[1] } : undefined,
        ndviData: ndviExportData,
        title: "NDVI Vegetation Index Analysis"
    };

    return (
        <div className="space-y-4">
            <NDVILivePanel feature={selectedFeature} onExport={setNdviExportData} />
            {selectedFeature && <ExportButton data={exportBundle} />}
        </div>
    );
  }

  if (id === "overview") {
    const p = selectedFeature?.properties ?? {};
    const coords = getMidCoords(selectedFeature);
    
    const exportData = {
      coords: coords ? { lat: coords[0], lng: coords[1] } : undefined,
      layers: layers.map(({ id: _id, ...rest }) => rest),
      geoJsonFeatures: selectedFeature ? [selectedFeature] : undefined,
    };

    return (
      <div className="space-y-4">
        <OverviewLivePanel feature={selectedFeature} />
        
        {selectedFeature && (
          <div className="flex gap-2">
            <ExportButton data={exportData} />
          </div>
        )}
      </div>
    );
  }

  if (id === "weather") {
    const coords = getMidCoords(selectedFeature);
    const exportData = {
      title: "Weather Report",
      coords: coords ? { lat: coords[0], lng: coords[1] } : undefined,
      timestamp: new Date().toISOString()
    };

    return (
      <div className="space-y-4">
        <WeatherLivePanel feature={selectedFeature} />
        {selectedFeature && <ExportButton data={exportData} />}
      </div>
    );
  }

 if (id === "crops") {
  return <CropsPanel selectedFeature={selectedFeature} />;
}

  if (id === "template-match") {
    return (
      <TemplateMatchPanel
        onResult={(geojson, fileName) => onGeoJSONUpload?.(geojson, fileName)}
        onRequestTemplateCapture={onRequestTemplateCapture}
        pendingTemplateCapture={pendingTemplateCapture}
        onClearTemplateCapture={onClearTemplateCapture}
        onRequestMapCapture={onRequestMapCapture}
        pendingMapCapture={pendingMapCapture}
        onClearMapCapture={onClearMapCapture}
      />
    );
  }

  if (id === "layers") {
    return (
      <LayerPanel
        layers={layers}
        onLayerToggle={onLayerToggle}
        onLayerOpacity={onLayerOpacity}
        onLayerColor={onLayerColor}
        onLayerRemove={onLayerRemove}
        onLayerRename={onLayerRename}
        onLayerReorder={onLayerReorder}
        onLayerZoom={onLayerZoom}
        onLayer3D={onLayer3D}
      />
    );
  }

  if (id === "analysis") {
    const analysisList = [
      { en: "Image Analysis",          ar: "Satellite Image Analysis",  icon: "IMG", color: "#22d3ee", tag: "Satellite"   },
      { en: "Spectral Classification", ar: "Spectral Classification",   icon: "CLS", color: "#a78bfa", tag: "AI"          },
      { en: "Change Detection",        ar: "Change Detection",          icon: "CHG", color: "#f97316", tag: "Temporal"    },
      { en: "Spatial Analysis",        ar: "Spatial Analysis",          icon: "GIS", color: "#34d399", tag: "GIS"         },
      { en: "OBIA",                    ar: "Object Based Analysis",     icon: "OBJ", color: "#fbbf24", tag: "Object"      },
      { en: "Atmospheric Correction",  ar: "Atmospheric Correction",    icon: "ATM", color: "#60a5fa", tag: "Pre-process" },
      { en: "Time Series Analysis",    ar: "Time Series Analysis",      icon: "TS",  color: "#f472b6", tag: "Series"      },
    ];

      const flyCoords = getMidCoords(selectedFeature);
    const handleAnalysisClick = () => { if (flyCoords) onFlyTo?.(flyCoords[0], flyCoords[1]); };

    return (
      <div className="space-y-2">
        {/* Header */}
        {/* <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 mb-3">
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Available Analyses</p>
          <p className="text-xs text-slate-300">Select an analysis type to run on the selected area</p>
        </div> */}

        {/* No feature warning */}
        {!selectedFeature && (
          <div className="flex items-center gap-2 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl px-3 py-2.5 mb-1">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" className="shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <p className="text-[0.65rem] text-amber-300">Click a feature on the map first to run an analysis on it</p>
          </div>
        )}

        {analysisList.map((a, i) => (
          <button
            key={i}
            onClick={handleAnalysisClick}
            disabled={!selectedFeature}
            className={`w-full group flex items-center gap-3 border rounded-xl p-3 text-left transition-all duration-150
              ${selectedFeature
                ? "bg-white/[0.03] hover:bg-white/[0.07] border-white/[0.06] hover:border-white/[0.15] cursor-pointer"
                : "bg-white/[0.01] border-white/[0.04] opacity-50 cursor-not-allowed"
              }`}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}
            >
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[0.78rem] font-medium text-slate-200 group-hover:text-white transition-colors truncate">{isRTL ? a.ar : a.en}</p>
              <p className="text-[0.62rem] text-slate-500 truncate">{a.en}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="text-[0.55rem] font-medium px-1.5 py-0.5 rounded-full"
                style={{ color: a.color, background: `${a.color}15`, border: `1px solid ${a.color}25` }}
              >
                {a.tag}
              </span>
              {selectedFeature ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className="text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-700">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              )}
            </div>
          </button>
        ))}

        {selectedFeature && flyCoords && (
          <p className="text-[0.6rem] text-slate-600 text-center pt-1">
            Click any analysis to fly to{" "}
            <span className="text-slate-500 font-mono">{flyCoords[0].toFixed(4)}{"\u00b0N"} {flyCoords[1].toFixed(4)}{"\u00b0E"}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2 opacity-40">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-slate-500">
        <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6M9 12h6M9 15h4" />
      </svg>
      <p className="text-[0.7rem] text-slate-600">No data available</p>
    </div>
  );
}

