"use client";

// ─── GeoJSONLayer.tsx ──────────────────────────────────────────────────────────
// Component لعرض GeoJSON data على الخريطة
// بيشتغل كـ side-effect hook — مش بيرندر حاجة بنفسه
// بس بيضيف الـ layer على الـ Leaflet map instance

import { useEffect, useRef } from "react";

export interface GeoJSONLayerProps {
  /** الـ map instance من Leaflet */
  mapInstance: any;
  /** الـ Leaflet library نفسها */
  L: any;
  /** الـ GeoJSON data */
  data: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** خيارات تنسيق الـ layer (اختياري) */
  style?: {
    color?: string;
    weight?: number;
    opacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    dashArray?: string;
  };
  /** هل نعمل fitBounds على الـ layer؟ */
  fitBounds?: boolean;
  /** اسم الـ layer للـ popups */
  layerName?: string;
  /** callback لما يتضاف الـ layer */
  onLayerAdded?: (layer: any, featureCount: number) => void;
}

// ── الألوان الافتراضية للـ GeoJSON ──────────────────────────────────────────
const DEFAULT_STYLE = {
  color:       "#22d3ee",   // cyan-400
  weight:      1.5,
  opacity:     0.85,
  fillColor:   "#22d3ee",
  fillOpacity: 0.08,
  dashArray:   undefined as string | undefined,
};

// ── ألوان حسب الـ Contour value (اختياري) ──────────────────────────────────
function getContourColor(value: number): string {
  // تدرج لوني من أزرق → سيان → أخضر → أصفر حسب الارتفاع
  if (value < 50)   return "#38bdf8"; // sky
  if (value < 100)  return "#22d3ee"; // cyan
  if (value < 200)  return "#34d399"; // emerald
  if (value < 500)  return "#a3e635"; // lime
  if (value < 1000) return "#fbbf24"; // amber
  return "#f87171";                   // red
}

export default function GeoJSONLayer({
  mapInstance,
  L,
  data,
  style,
  fitBounds = true,
  layerName = "GeoJSON Layer",
  onLayerAdded,
}: GeoJSONLayerProps) {
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!mapInstance || !L || !data) return;

    // امسح الـ layer القديمة لو موجودة
    if (layerRef.current) {
      mapInstance.removeLayer(layerRef.current);
      layerRef.current = null;
    }

    let featureCount = 0;

    // أنشئ الـ GeoJSON layer
    const geoLayer = L.geoJSON(data, {
      // ── تنسيق الـ features ────────────────────────────────────────────────
      style: (feature: any) => {
        const contour = feature?.properties?.Contour;
        const baseColor = contour
          ? getContourColor(contour)
          : (style?.color ?? DEFAULT_STYLE.color);

        return {
          color:       style?.color       ?? baseColor,
          weight:      style?.weight      ?? DEFAULT_STYLE.weight,
          opacity:     style?.opacity     ?? DEFAULT_STYLE.opacity,
          fillColor:   style?.fillColor   ?? baseColor,
          fillOpacity: style?.fillOpacity ?? DEFAULT_STYLE.fillOpacity,
          dashArray:   style?.dashArray   ?? DEFAULT_STYLE.dashArray,
        };
      },

      // ── Point features → CircleMarker ─────────────────────────────────────
      pointToLayer: (_feature: any, latlng: any) => {
        return L.circleMarker(latlng, {
          radius:      5,
          color:       style?.color ?? DEFAULT_STYLE.color,
          fillColor:   style?.fillColor ?? DEFAULT_STYLE.fillColor,
          fillOpacity: 0.8,
          weight:      2,
        });
      },

      // ── Popup لكل feature ─────────────────────────────────────────────────
      onEachFeature: (feature: any, layer: any) => {
        featureCount++;

        if (!feature.properties) return;

        const props = feature.properties;
        const rows  = Object.entries(props)
          .filter(([k]) => !["OBJECTID"].includes(k))
          .map(([k, v]) => `
            <tr>
              <td style="color:#64748b;padding:2px 8px 2px 0;font-size:.7rem">${k}</td>
              <td style="color:#e2e8f0;font-size:.7rem;font-family:monospace">${v !== null && v !== undefined ? String(v) : "—"}</td>
            </tr>`)
          .join("");

        if (rows) {
          layer.bindTooltip(
            `<div style="font-size:.68rem;color:#94a3b8">
              ${props.Contour ? `<span style="color:#22d3ee;font-weight:600">Contour: ${props.Contour}m</span>` : layerName}
            </div>`,
            { sticky: true, className: "ndvi-tooltip" }
          );

          layer.bindPopup(
            `<div style="min-width:180px">
              <div style="color:#22d3ee;font-weight:600;font-size:.8rem;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.08)">
                📍 ${layerName}
              </div>
              <table style="width:100%;border-collapse:collapse">${rows}</table>
            </div>`,
            { maxWidth: 280 }
          );
        }
      },
    });

    geoLayer.addTo(mapInstance);
    layerRef.current = geoLayer;

    // FitBounds على الـ layer
    if (fitBounds) {
      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        }
      } catch (e) {
        console.warn("GeoJSON fitBounds failed:", e);
      }
    }

    onLayerAdded?.(geoLayer, featureCount);
    console.log(`✅ GeoJSON loaded: ${featureCount} features`);

    // Cleanup
    return () => {
      if (layerRef.current) {
        mapInstance.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [mapInstance, L, data]);

  // مش بيرندر حاجة — كل الشغل على الـ map instance
  return null;
}
