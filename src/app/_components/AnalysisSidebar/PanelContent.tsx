import React, { useRef, useState } from "react";
import { useLang } from "../translations";
import TemplateMatchPanel, { type MapCapture } from "./TemplateMatchPanel";
import LayerPanel, { MapLayer } from "../../map/LayerPanel";
import ExportButton from "../../map/ExportButton";
import { CapturesPanel } from "./CapturesPanel";
import { NDVILivePanel, OverviewLivePanel, WeatherLivePanel } from "./LivePanels";
import PlanetaryRasterPanel from "./PlanetaryRasterPanel";
import { SatelliteDataPanel, type RasterPreviewConfig, type SatellitePreviewConfig } from "./SatelliteDataPanel";
import { ChangeDetectionPanel, type ChangeDetectionPreviewConfig, type ChangeDetectionSwipeConfig } from "./ChangeDetectionPanel";
import { getMidCoords } from "./geoFeatureUtils";
import { PanelId } from "./panels";
import { CropsPanel } from "./CropsPanel";
import VolumeCalculationPanel from "./VolumeCalculationPanel";
import ElevationContourPanel from "./ElevationContourPanel";
import SavedAnalysesPanel from "./SavedAnalysesPanel";

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
  onChangeDetectionPreview,
  onChangeDetectionSwipe,
  onOpenElevationFloat,
}: {
  id: PanelId;
  onOpenElevationFloat?: () => void;
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
  onChangeDetectionPreview?: (config: ChangeDetectionPreviewConfig) => void;
  /** Real, georeferenced Before/After swipe on the actual map (Change Detection only). Pass null to hide it. */
  onChangeDetectionSwipe?: (config: ChangeDetectionSwipeConfig | null) => void;
}) {
  const [ndviExportData, setNdviExportData] = useState<any>(null);
  const ndviPanelRef = useRef<HTMLDivElement>(null);
  const overviewPanelRef = useRef<HTMLDivElement>(null);
  const weatherPanelRef = useRef<HTMLDivElement>(null);
  const cropsPanelRef = useRef<HTMLDivElement>(null);
  const { t, isRTL } = useLang();

  if (id === "satellite") {
    return <SatelliteDataPanel selectedFeature={selectedFeature} onPreview={onSatellitePreview} />;
  }

  if (id === "raster") {
    return <PlanetaryRasterPanel selectedFeature={selectedFeature} onPreview={onRasterPreview} />;
  }

  if (id === "change-detection") {
    return (
      <ChangeDetectionPanel
        selectedFeature={selectedFeature}
        onPreview={onChangeDetectionPreview}
        onSwipeCompare={onChangeDetectionSwipe}
      />
    );
  }

  if (id === "ndvi") {
    const coords = getMidCoords(selectedFeature);

    const exportBundle = {
        coords: coords ? { lat: coords[0], lng: coords[1] } : undefined,
        ndviData: ndviExportData,
        title: "NDVI Vegetation Index Analysis"
    };

    return (
        <div className="flex flex-col gap-4 min-h-full">
            <div ref={ndviPanelRef} data-export-panel="ndvi">
              <NDVILivePanel feature={selectedFeature} onExport={setNdviExportData} />
            </div>
            {selectedFeature && (
              <div className="sticky bottom-0 z-20 pt-3 pb-1 bg-gradient-to-t from-[#070f1e] via-[#070f1e]/95 to-transparent">
                <ExportButton data={exportBundle} panelRef={ndviPanelRef} reportType="ndvi" block />
              </div>
            )}
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
      <div className="flex flex-col gap-4 min-h-full">
        <div ref={overviewPanelRef} data-export-panel="overview">
          <OverviewLivePanel feature={selectedFeature} />
        </div>

        {selectedFeature && (
          <div className="sticky bottom-0 z-20 pt-3 pb-1 bg-gradient-to-t from-[#070f1e] via-[#070f1e]/95 to-transparent">
            <ExportButton data={exportData} panelRef={overviewPanelRef} reportType="overview" block />
          </div>
        )}
      </div>
    );
  }

  if (id === "weather") {
    const coords = getMidCoords(selectedFeature);
    const p = selectedFeature?.properties ?? {};
    const areaHa = typeof p.areaHa === "number" ? p.areaHa : typeof p.area === "number" ? p.area : undefined;

    const exportData = {
      title: "Weather Report",
      coords: coords ? { lat: coords[0], lng: coords[1] } : undefined,
      selectedArea: areaHa != null ? { name: String(p.name ?? p.label ?? "Selected Area"), ha: areaHa } : undefined,
      timestamp: new Date().toISOString(),
    };

    return (
      <div className="flex flex-col gap-4 min-h-full">
        <div ref={weatherPanelRef} data-export-panel="weather">
          <WeatherLivePanel feature={selectedFeature} />
        </div>
        {selectedFeature && (
          <div className="sticky bottom-0 z-20 pt-3 pb-1 bg-gradient-to-t from-[#070f1e] via-[#070f1e]/95 to-transparent">
            <ExportButton data={exportData} panelRef={weatherPanelRef} reportType="weather" block />
          </div>
        )}
      </div>
    );
  }

  if (id === "elevation") {
    return (
      <ElevationContourPanel
        selectedFeature={selectedFeature}
        onContoursGenerated={(geojson, fileName) => onGeoJSONUpload?.(geojson, fileName)}
      />
    );
  }

 if (id === "crops") {
  const coords = getMidCoords(selectedFeature);
  const exportData = {
    title: "Crop Health Report",
    coords: coords ? { lat: coords[0], lng: coords[1] } : undefined,
  };

  return (
    <div className="flex flex-col gap-4 min-h-full">
      <div ref={cropsPanelRef} data-export-panel="crops">
        <CropsPanel selectedFeature={selectedFeature} />
      </div>
      {selectedFeature && (
        <div className="sticky bottom-0 z-20 pt-3 pb-1 bg-gradient-to-t from-[#070f1e] via-[#070f1e]/95 to-transparent">
          <ExportButton data={exportData} panelRef={cropsPanelRef} reportType="crops" block />
        </div>
      )}
    </div>
  );
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
  if (id === "saved-analyses") {
  return <SavedAnalysesPanel />;
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

  if (id === "volume") {
    return <VolumeCalculationPanel selectedFeature={selectedFeature} />;
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