"use client";

// ─── LeafletMap.tsx ───────────────────────────────────────────────────────────
// التعديلات:
// ① OSM تايلز بدل Esri (مفيهاش مشكلة zoom)
// ② Polygon بكليك واحد للإنهاء — زر "Close Shape" أو كليك على النقطة الأولى
// ③ Double-click zoom متوقف تماماً
// ④ الألوان للعرض بس — مش بتتبعت للباك

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMapCanvas }      from "./useMapCanvas";
import { useLang }           from "../_components/translations";
import {
  DrawTool, SAT_LAYERS, INDEX_TILES,
  SatKey, IdxKey, LatLngPoint, CaptureMetadata,
} from "./mapTypes_proxy";

type ExtrusionConfig = {
  enabled: boolean;
  /** property name in feature.properties containing height in meters */
  heightProperty?: string;
  /** fallback height (meters) if property missing */
  defaultHeightM?: number;
  color?: string;
  opacity?: number;
};

interface GeoJSONStyle {
  color?:       string;
  weight?:      number;
  opacity?:     number;
  fillColor?:   string;
  fillOpacity?: number;
  dashArray?:   string;
}

interface Props {
  activeTool:     DrawTool;
  onAreaSelected: (name: string, area: number) => void;
  onCoordsUpdate: (lat: number, lng: number) => void;
  flyToRef:       React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  clearRef:       React.MutableRefObject<(() => void) | null>;
  onSatChange:    (handler: (sat: SatKey) => void) => void;
  onIdxChange:    (handler: (idx: IdxKey) => void) => void;
  onOpacityChangeRegister?: (handler: (o: number) => void) => void;
  /** register an image placement workflow (2 clicks to place image) */
  onImagePlacerRegister?: (handler: (file: File) => void) => void;
  onCapture?:     (url: string) => void;
  /** callback لما يضغط على GeoJSON feature */
  onFeatureClick?: (feature: GeoJSON.Feature) => void;
  /** GeoJSON data لعرضها على الخريطة */
  geoJsonData?:   GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** GeoJSON إضافي (مثلاً شيكات الجامعات) يُعرض فوق الـ layer الأول */
  extraGeoJsonData?: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** Newly added GeoJSON to fly to */
  latestGeoJson?: GeoJSON.FeatureCollection | GeoJSON.Feature | null;
  /** optionally render pseudo-3D extrusion for a GeoJSON FeatureCollection */
  extrusionGeoJson?: GeoJSON.FeatureCollection | null;
  extrusionConfig?: ExtrusionConfig;
  /** تنسيق مخصص للـ GeoJSON layer */
  geoJsonStyle?:  GeoJSONStyle;
  /** هل نزوم على الـ GeoJSON بعد التحميل؟ */
  geoJsonFitBounds?: boolean;
}

// ── ألوان كل أداة — للعرض فقط، مش بتتبعت للباك ──────────────────────────────
const TOOL_COLORS = {
  polygon:   { stroke: "#00c8ff", fill: "rgba(0,200,255,0.18)" },
  rectangle: { stroke: "#a78bfa", fill: "rgba(167,139,250,0.18)" },
  circle:    { stroke: "#34d399", fill: "rgba(52,211,153,0.18)" },
  measure:   { stroke: "#fbbf24", fill: "rgba(251,191,36,0.1)" },
  marker:    { stroke: "#f97316", fill: "rgba(249,115,22,0.85)" },
};

// ── ألوان contour ────────────────────────────────────────────────────────────
function getContourColor(value: number): string {
  if (value < 50)   return "#38bdf8";
  if (value < 100)  return "#22d3ee";
  if (value < 200)  return "#34d399";
  if (value < 500)  return "#a3e635";
  if (value < 1000) return "#fbbf24";
  return "#f87171";
}

// ── ألوان نطاقات الجامعات (service area breaks) ──────────────────────────────
// أخضر = 0-5 دق (الأقرب) | برتقالي = 5-10 | أحمر = 10-15 (الأبعد)
function getUniversityColor(from: number, to: number): { fill: string; stroke: string } {
  if (to <= 5)  return { fill: "#22c55e", stroke: "#16a34a" };
  if (to <= 10) return { fill: "#f59e0b", stroke: "#d97706" };
  return           { fill: "#ef4444", stroke: "#dc2626" };
}

export default function LeafletMap({
  activeTool, onAreaSelected, onCoordsUpdate,
  flyToRef, clearRef, onSatChange, onIdxChange, onOpacityChangeRegister, onCapture,
  geoJsonData, extraGeoJsonData, latestGeoJson, geoJsonStyle, geoJsonFitBounds = true, onFeatureClick,
  onImagePlacerRegister,
  extrusionGeoJson,
  extrusionConfig,
}: Props) {
  const { t, isRTL } = useLang();

  const IMAGE_OVERLAYS_STORAGE_KEY = "leaflet_image_overlays_v1";

  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const activeToolRef  = useRef<DrawTool>(activeTool);
  const drawLayersRef  = useRef<any[]>([]);
  const tempLayerRef   = useRef<any>(null);
  const drawPointsRef  = useRef<[number, number][]>([]);
  const baseTileRef    = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const indexTileRef   = useRef<any>(null);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const extrudeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCoordsRef  = useRef<LatLngPoint[]>([]);
  const lastToolRef    = useRef<DrawTool>("pointer");
  const closeBtnRef    = useRef<HTMLButtonElement | null>(null);
  // نحتاج refs للـ map و L عشان نستخدمهم في finishPolygon من الـ button
  const mapObjRef      = useRef<any>(null);
  const LRef           = useRef<any>(null);
  const geoJsonLayerRef     = useRef<any>(null);
  const extraGeoJsonLayerRef = useRef<any>(null);
  const rafRef              = useRef<number | null>(null);
  const lastMoveRef         = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const imagePaneReadyRef = useRef(false);
  const imageOverlaysRef = useRef<{ id: string; name: string; src: string; bounds: [[number, number], [number, number]]; layer: any }[]>([]);
  const placingImageRef = useRef<{
    file: File;
    src: string; // data URL (persistent across refresh)
    ready: boolean;
    clicks: { lat: number; lng: number }[];
    hintEl?: HTMLDivElement | null;
  } | null>(null);
  const overlaysUiRef = useRef<HTMLDivElement | null>(null);

  const {
    drawPolygon, drawRect, drawCircle, drawMeasure, drawMarker,
    clearCanvas, capture, captureCircle, sendToBackend,
  } = useMapCanvas();

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  const clearImagePlacementHint = () => {
    const st = placingImageRef.current;
    if (st?.hintEl) {
      st.hintEl.remove();
      st.hintEl = null;
    }
  };

  const stopImagePlacement = () => {
    const st = placingImageRef.current;
    if (!st) return;
    clearImagePlacementHint();
    placingImageRef.current = null;
  };

  const persistImageOverlays = () => {
    try {
      const payload = imageOverlaysRef.current.map((o) => ({
        id: o.id,
        name: o.name,
        src: o.src,
        bounds: o.bounds,
      }));
      localStorage.setItem(IMAGE_OVERLAYS_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
  };

  const restoreImageOverlays = () => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    try {
      const raw = localStorage.getItem(IMAGE_OVERLAYS_STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;

      for (const it of arr) {
        if (!it?.src || !it?.bounds) continue;
        const b = it.bounds as [[number, number], [number, number]];
        const bounds = L.latLngBounds([b[0][0], b[0][1]], [b[1][0], b[1][1]]);
        const layer = L.imageOverlay(it.src, bounds, { opacity: 0.85, pane: "imagePane" }).addTo(map);
        imageOverlaysRef.current.push({
          id: String(it.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`),
          name: String(it.name ?? "overlay"),
          src: it.src,
          bounds: b,
          layer,
        });
      }
      refreshOverlaysUi();
    } catch (_) {}
  };

  const refreshOverlaysUi = () => {
    const root = overlaysUiRef.current;
    if (!root) return;
    const list = imageOverlaysRef.current;

    root.innerHTML = "";
    if (!list.length) {
      root.style.display = "none";
      return;
    }

    root.style.display = "block";
    const title = document.createElement("div");
    title.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
    title.innerHTML = `<span style="color:#94a3b8;font-size:11px;letter-spacing:.12em;text-transform:uppercase">Image overlays</span>`;

    const clearBtn = document.createElement("button");
    clearBtn.textContent = "Clear";
    clearBtn.style.cssText = "background:transparent;border:1px solid rgba(255,255,255,0.12);color:#e2e8f0;font-size:11px;padding:4px 8px;border-radius:10px;cursor:pointer";
    clearBtn.onclick = () => {
      const map = mapInstanceRef.current;
      if (!map) return;
      imageOverlaysRef.current.forEach((ov) => {
        try { map.removeLayer(ov.layer); } catch (_) {}
      });
      imageOverlaysRef.current = [];
      try { localStorage.removeItem(IMAGE_OVERLAYS_STORAGE_KEY); } catch (_) {}
      refreshOverlaysUi();
    };
    title.appendChild(clearBtn);
    root.appendChild(title);

    for (const ov of list) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);padding:8px 10px;border-radius:12px;margin-bottom:6px;";
      const name = document.createElement("div");
      name.textContent = ov.name;
      name.style.cssText = "flex:1;min-width:0;color:#e2e8f0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
      const del = document.createElement("button");
      del.textContent = "Delete";
      del.style.cssText = "background:rgba(248,113,113,0.12);border:1px solid rgba(248,113,113,0.22);color:#f87171;font-size:11px;padding:5px 8px;border-radius:10px;cursor:pointer";
      del.onclick = () => {
        const map = mapInstanceRef.current;
        if (!map) return;
        try { map.removeLayer(ov.layer); } catch (_) {}
        imageOverlaysRef.current = imageOverlaysRef.current.filter((x) => x.id !== ov.id);
        persistImageOverlays();
        refreshOverlaysUi();
      };
      row.appendChild(name);
      row.appendChild(del);
      root.appendChild(row);
    }
  };

  const startImagePlacement = (file: File) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // cancel any ongoing placement
    stopImagePlacement();

    const hint = document.createElement("div");
    hint.style.cssText = `
      position:absolute;top:14px;left:50%;transform:translateX(-50%);
      z-index:1200;pointer-events:none;
      background:rgba(10,22,40,0.92);backdrop-filter:blur(10px);
      border:1px solid rgba(0,212,255,0.25);color:#e2e8f0;
      padding:8px 12px;border-radius:999px;
      font-family:DM Sans, sans-serif;font-size:12px;
      box-shadow:0 10px 28px rgba(0,0,0,0.45);
    `;
    hint.textContent = `Preparing image…`;
    mapRef.current?.appendChild(hint);

    // set placement state immediately so clicks are captured (but blocked until ready)
    placingImageRef.current = { file, src: "", ready: false, clicks: [], hintEl: hint };

    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result || "");
      if (!src.startsWith("data:")) return;
      const st = placingImageRef.current;
      if (!st) return;
      st.src = src;
      st.ready = true;
      if (st.hintEl) st.hintEl.textContent = `Place image: click TOP-LEFT corner ثم click BOTTOM-RIGHT (Esc لإلغاء)`;
    };
    reader.readAsDataURL(file);
  };

  // Register image placer handler for external UI (upload modal)
  useEffect(() => {
    if (!onImagePlacerRegister) return;
    onImagePlacerRegister((file: File) => startImagePlacement(file));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onImagePlacerRegister, mapReady]);

  // Escape handler: cancels image placement or finishes drawings
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (placingImageRef.current) {
          stopImagePlacement();
        } else if (drawPointsRef.current.length > 0) {
          const map = mapInstanceRef.current;
          const L = LRef.current;
          if (!map || !L) return;

          const tool = activeToolRef.current;
          if (tool === "polygon") {
            if (drawPointsRef.current.length >= 3) {
              finishPolygon(map, L);
            } else {
              toast.error(isRTL ? "يرجى رسم 3 نقاط على الأقل" : "Please draw at least 3 points");
            }
          } else if (tool === "measure") {
            if (drawPointsRef.current.length >= 2) {
              finishMeasure(map, L);
            } else {
              toast.error(isRTL ? "يرجى رسم نقطتين على الأقل" : "Please draw at least 2 points");
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isRTL]);

  const drawExtrusions = () => {
    const map = mapInstanceRef.current;
    const L = LRef.current;
    const canvas = extrudeCanvasRef.current;
    const fc = extrusionGeoJson;
    const cfg = extrusionConfig;
    if (!map || !L || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!cfg?.enabled || !fc?.features?.length) return;

    const heightProp = cfg.heightProperty ?? "height";
    const fallbackH = cfg.defaultHeightM ?? 30;
    const color = cfg.color ?? "#22d3ee";
    const opacity = cfg.opacity ?? 0.55;

    // approximate meters-per-pixel at current latitude for extrusion scaling
    const center = map.getCenter();
    const lat = center?.lat ?? 0;
    const zoom = map.getZoom();
    const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);

    const toPx = (latlng: any) => map.latLngToContainerPoint(latlng);
    const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

    const walkRings = (coords: any): any[] => {
      // returns array of rings (each ring is array of [lng,lat])
      if (!coords) return [];
      // Polygon: [ring[]]
      if (Array.isArray(coords) && Array.isArray(coords[0]) && typeof coords[0][0] === "number") return [coords];
      // MultiPolygon: [[ring[]], ...]
      if (Array.isArray(coords) && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) return coords.flatMap((poly: any) => poly);
      return [];
    };

    for (const f of fc.features) {
      const g: any = f.geometry as any;
      if (!g) continue;
      if (g.type !== "Polygon" && g.type !== "MultiPolygon") continue;

      const rawH = (f.properties as any)?.[heightProp];
      const hM = Number.isFinite(Number(rawH)) ? Number(rawH) : fallbackH;
      const hPx = clamp(hM / Math.max(mpp, 0.0001), 6, 90); // keep it readable
      const dx = 0.7 * hPx;
      const dy = 1.0 * hPx;

      const rings = walkRings(g.coordinates);
      for (const ring of rings) {
        // ring: array of [lng,lat]
        const pts = ring.map((c: any) => toPx(L.latLng(c[1], c[0])));
        if (pts.length < 3) continue;

        // top polygon
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = color;
        ctx.strokeStyle = "rgba(255,255,255,0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pts[0].x - dx, pts[0].y - dy);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x - dx, pts[i].y - dy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // side walls (simple quads per edge)
        ctx.globalAlpha = Math.max(0.18, opacity - 0.18);
        ctx.fillStyle = "rgba(0,0,0,0.22)";
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.lineTo(b.x - dx, b.y - dy);
          ctx.lineTo(a.x - dx, a.y - dy);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  // ── GeoJSON layer useEffect ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L   = LRef.current;
    if (!map || !L || !geoJsonData) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }

    const layer = L.geoJSON(geoJsonData, {
      style: (feature: any) => {
        const p = feature?.properties ?? {};

        // ── University service-area polygons ─────────────────────────────────
        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc = p._fillColor
            ? { fill: p._fillColor, stroke: p._strokeColor ?? p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          return {
            color:       geoJsonStyle?.color       ?? uc.stroke,
            weight:      geoJsonStyle?.weight      ?? 1.5,
            opacity:     geoJsonStyle?.opacity     ?? 0.9,
            fillColor:   geoJsonStyle?.fillColor   ?? uc.fill,
            fillOpacity: geoJsonStyle?.fillOpacity ?? 0.25,
            dashArray:   geoJsonStyle?.dashArray,
          };
        }

        // ── Contour lines (الافتراضي) ─────────────────────────────────────────
        const c = getContourColor(p.Contour ?? 0);
        return {
          color:       geoJsonStyle?.color       ?? c,
          weight:      geoJsonStyle?.weight      ?? 1.5,
          opacity:     geoJsonStyle?.opacity     ?? 0.85,
          fillColor:   geoJsonStyle?.fillColor   ?? c,
          fillOpacity: geoJsonStyle?.fillOpacity ?? 0.08,
          dashArray:   geoJsonStyle?.dashArray,
        };
      },
      pointToLayer: (_: any, latlng: any) =>
        L.circleMarker(latlng, {
          radius: 4, color: "#22d3ee",
          fillColor: "#22d3ee", fillOpacity: 0.8, weight: 2,
        }),
      onEachFeature: (feature: any, lyr: any) => {
        if (!feature.properties) return;
        const p = feature.properties;

        // ── University tooltip ────────────────────────────────────────────────
        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc = p._fillColor
            ? { fill: p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          const rangeLabel =
            p.ToBreak <= 5  ? "0 – 5 دقائق  (الأقرب)" :
            p.ToBreak <= 10 ? "5 – 10 دقائق" :
                              "10 – 15 دقيقة (الأبعد)";
          lyr.bindTooltip(
            `<div style="font-size:.75rem;line-height:1.5;direction:rtl">
              <span style="color:${uc.fill};font-weight:700">${p.Name?.split(" : ")[0] ?? ""}</span><br/>
              <span style="color:#cbd5e1">${rangeLabel}</span>
            </div>`,
            { sticky: true, className: "ndvi-tooltip" }
          );
          lyr.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
            if (geoJsonLayerRef.current) geoJsonLayerRef.current.resetStyle();
            lyr.setStyle({ weight: 3, opacity: 1, fillOpacity: 0.45 });
          });
          return;
        }

        // ── Contour tooltip ───────────────────────────────────────────────────
        const contour = p.Contour;
        lyr.bindTooltip(
          `<span style="color:#22d3ee;font-weight:600;font-size:.72rem">Contour: ${contour}m</span>`,
          { sticky: true, className: "ndvi-tooltip" }
        );
        lyr.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
          if (geoJsonLayerRef.current) geoJsonLayerRef.current.resetStyle();
          lyr.setStyle({ weight: 3, opacity: 1, color: "#22d3ee", fillOpacity: 0.25 });
        });
      },
    });

    layer.addTo(map);
    geoJsonLayerRef.current = layer;

    // ── Fly to GeoJSON bounds after load ─────────────────────────────────────
    if (geoJsonFitBounds) {
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 16, duration: 1.2 });
        }
      } catch (_) {}
    }

    console.log("✅ GeoJSON layer added");

    return () => {
      if (geoJsonLayerRef.current) {
        map.removeLayer(geoJsonLayerRef.current);
        geoJsonLayerRef.current = null;
      }
    };
  }, [geoJsonData, mapReady]);

  // ── Extra GeoJSON layer (شيكات الجامعات) ─────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L   = LRef.current;
    if (!map || !L) return;

    const isFirstLoad = !extraGeoJsonLayerRef.current;

    // امسح القديمة
    if (extraGeoJsonLayerRef.current) {
      map.removeLayer(extraGeoJsonLayerRef.current);
      extraGeoJsonLayerRef.current = null;
    }
    if (!extraGeoJsonData) return;

    const layer = L.geoJSON(extraGeoJsonData, {
      style: (feature: any) => {
        const p   = feature?.properties ?? {};

        // ── University service areas ───────────────────────────────────────────
        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc  = p._fillColor
            ? { fill: p._fillColor, stroke: p._strokeColor ?? p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          return { color: uc.stroke, weight: 1.8, opacity: 0.9, fillColor: uc.fill, fillOpacity: 0.22 };
        }

        // ── GeoJSON مرفوع من اليوزر — لون افتراضي سيان ────────────────────────
        const customColor = p._color ?? p.color ?? p.stroke ?? "#00c8ff";
        const customFill  = p._fillColor ?? p.fillColor ?? p.fill ?? "#00c8ff";
        return {
          color:       customColor,
          weight:      2,
          opacity:     0.9,
          fillColor:   customFill,
          fillOpacity: 0.2,
        };
      },
      onEachFeature: (feature: any, lyr: any) => {
        const p = feature?.properties ?? {};

        // ── إذا كانت داتا جامعات — tooltip مخصص ──────────────────────────────
        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc = p._fillColor
            ? { fill: p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          const uniName   = (p.Name ?? "").split(" : ")[0];
          const rangeLabel =
            p.ToBreak <= 5  ? "0 – 5 دقائق  🟢" :
            p.ToBreak <= 10 ? "5 – 10 دقائق 🟡" :
                              "10 – 15 دقيقة 🔴";
          lyr.bindTooltip(
            `<div style="font-size:.75rem;line-height:1.6;direction:rtl;padding:2px 4px">
              <strong style="color:${uc.fill}">${uniName}</strong><br/>
              <span style="color:#cbd5e1">${rangeLabel}</span>
            </div>`,
            { sticky: true, className: "ndvi-tooltip" }
          );
          lyr.on("click", (e: any) => {
            L.DomEvent.stopPropagation(e);
            if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
            if (extraGeoJsonLayerRef.current) extraGeoJsonLayerRef.current.resetStyle();
            lyr.setStyle({ weight: 3, fillOpacity: 0.45 });
          });
          return;
        }

        // ── داتا مرفوعة (GeoJSON عادي) — اعرض كل الـ properties ───────────────
        const propKeys = Object.keys(p).filter(k => !k.startsWith("_"));
        if (propKeys.length > 0) {
          // Tooltip: أول 3 fields بس
          const preview = propKeys.slice(0, 3)
            .map(k => `<span style="color:#94a3b8">${k}:</span> <span style="color:#e2e8f0">${p[k]}</span>`)
            .join("<br/>");
          lyr.bindTooltip(
            `<div style="font-size:.72rem;line-height:1.6;padding:2px 4px">${preview}</div>`,
            { sticky: true, className: "ndvi-tooltip" }
          );
          // Popup: كل الـ properties عند الكليك
          const allProps = propKeys
            .map(k => `<tr><td style="color:#64748b;padding:2px 6px 2px 0;font-size:.68rem">${k}</td><td style="color:#e2e8f0;font-size:.68rem">${p[k] ?? "—"}</td></tr>`)
            .join("");
          lyr.bindPopup(
            `<div style="min-width:180px"><table style="border-collapse:collapse;width:100%">${allProps}</table></div>`,
            { maxWidth: 280 }
          );
        }
        lyr.on("click", (e: any) => {
          L.DomEvent.stopPropagation(e);
          if (onFeatureClick) onFeatureClick(feature as GeoJSON.Feature);
          if (extraGeoJsonLayerRef.current) extraGeoJsonLayerRef.current.resetStyle();
          lyr.setStyle({ weight: 3, fillOpacity: 0.45 });
        });
      },
    });

    layer.addTo(map);
    extraGeoJsonLayerRef.current = layer;

    // ── Fly to uploaded GeoJSON bounds ONLY on first load (for restored data) ──
    if (isFirstLoad) {
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 16, duration: 1.2 });
        }
      } catch (_) {}
    }

    console.log("✅ University polygons layer added");

    return () => {
      if (extraGeoJsonLayerRef.current) {
        map.removeLayer(extraGeoJsonLayerRef.current);
        extraGeoJsonLayerRef.current = null;
      }
    };
  }, [extraGeoJsonData, mapReady]);

  // ── 🆕 Fly to latestGeoJson when it's uploaded ──────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L   = LRef.current;
    if (!map || !L || !latestGeoJson) return;

    try {
      const tempLayer = L.geoJSON(latestGeoJson);
      const bounds = tempLayer.getBounds();
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 16, duration: 1.2 });
      }
    } catch (err) {
      console.error("Fly to latestGeoJson failed:", err);
    }
  }, [latestGeoJson]);

  // ── Extrusion canvas redraw on map moves ──────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const redraw = () => {
      const canvas = extrudeCanvasRef.current;
      if (!canvas) return;
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      drawExtrusions();
    };
    redraw();
    map.on("moveend zoomend viewreset resize", redraw);
    return () => {
      map.off("moveend zoomend viewreset resize", redraw);
    };
  }, [mapReady, extrusionGeoJson, extrusionConfig?.enabled, extrusionConfig?.heightProperty, extrusionConfig?.defaultHeightM, extrusionConfig?.color, extrusionConfig?.opacity]);

  const redrawCurrent = (canvas: HTMLCanvasElement, map: any, L: any) => {
    const coords = lastCoordsRef.current;
    const tool   = lastToolRef.current;
    if (!coords.length) return;
    const px = coords.map((p) => map.latLngToContainerPoint(L.latLng(p.lat, p.lng)));
    if (tool === "polygon")  drawPolygon(canvas, px);
    if (tool === "measure")  drawMeasure(canvas, px);
    if (tool === "rectangle" && px.length === 2) drawRect(canvas, px[0], px[1]);
    if (tool === "circle"    && px.length === 2) {
      const rPx = Math.sqrt((px[1].x - px[0].x) ** 2 + (px[1].y - px[0].y) ** 2);
      drawCircle(canvas, px[0], rPx);
    }
    if (tool === "marker") { clearCanvas(canvas); px.forEach((p) => drawMarker(canvas, p)); }
  };

  const handleCapture = async (
    canvas: HTMLCanvasElement, map: any, L: any,
    coordinates: LatLngPoint[], metadata: CaptureMetadata
  ) => {
    try {
      const { smallUrl, smallBlob, largeBlob } = await capture(canvas, map, L, coordinates, metadata);
      onCapture?.(smallUrl);
      // بنبعت coordinates و metadata للباك — مفيش ألوان
      const res = await sendToBackend(smallBlob, largeBlob, coordinates, metadata);
      if (res.ok) console.log("✅ Backend:", await res.json());
    } catch (err) {
      console.error("❌ Capture error:", err);
    }
  };

  const finishPolygon = async (map: any, L: any) => {
    const pts = drawPointsRef.current;
    if (pts.length < 3) return;
    if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
    if (closeBtnRef.current)  closeBtnRef.current.style.display = "none";

    const c    = TOOL_COLORS.polygon;
    const poly = L.polygon(pts, { color: c.stroke, weight: 2, fillColor: c.stroke, fillOpacity: 0.18 }).addTo(map);
    drawLayersRef.current.push(poly);
    const area = parseFloat((Math.abs(pts.reduce((acc: number, p: [number, number], i: number) => {
      const j = (i + 1) % pts.length;
      return acc + p[1] * pts[j][0] - pts[j][1] * p[0];
    }, 0)) / 2 * 12345).toFixed(1));
    poly.bindPopup(`🔵 ${t.polygon} · ≈ ${area} ${t.ha}`).openPopup();
    onAreaSelected("Drawn Polygon", area);

    const coordinates: LatLngPoint[] = pts.map(([lat, lng]: [number, number]) => ({ lat, lng }));
    lastCoordsRef.current = coordinates;
    lastToolRef.current   = "polygon";

    if (canvasRef.current) {
      drawPolygon(canvasRef.current, coordinates.map((p) =>
        map.latLngToContainerPoint(L.latLng(p.lat, p.lng))
      ));
      const metadata: CaptureMetadata = {
        areaName: "Drawn Polygon", areaSizeHa: area,
        zoom: map.getZoom(), capturedAt: new Date().toISOString(),
      };
      await handleCapture(canvasRef.current, map, L, coordinates, metadata);
    }
    drawPointsRef.current = [];
  };

  const finishMeasure = async (map: any, L: any) => {
    const pts = drawPointsRef.current;
    if (pts.length < 2) return;
    if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
    if (closeBtnRef.current)  closeBtnRef.current.style.display = "none";

    const line = L.polyline(pts, { color: TOOL_COLORS.measure.stroke, weight: 2.5 }).addTo(map);
    drawLayersRef.current.push(line);
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += map.distance(pts[i - 1], pts[i]);
    line.bindPopup(`📏 ${(dist / 1000).toFixed(3)} ${t.km}`).openPopup();

    const coordinates: LatLngPoint[] = pts.map(([lat, lng]: [number, number]) => ({ lat, lng }));
    lastCoordsRef.current = coordinates;
    lastToolRef.current   = "measure";

    if (canvasRef.current) {
      drawMeasure(canvasRef.current, coordinates.map((p) =>
        map.latLngToContainerPoint(L.latLng(p.lat, p.lng))
      ));
      const metadata: CaptureMetadata = {
        areaName: "Measure Line", areaSizeHa: 0,
        zoom: map.getZoom(), capturedAt: new Date().toISOString(),
      };
      await handleCapture(canvasRef.current, map, L, coordinates, metadata);
    }
    drawPointsRef.current = [];
  };

  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;
      LRef.current = L;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [21.54, 39.19], zoom: 11, zoomControl: false,
        minZoom: 2, maxZoom: 18, worldCopyJump: false,
        maxBounds: [[-90, -180], [90, 180]], maxBoundsViscosity: 1.0,
        doubleClickZoom: false,   // ← وقف dblclick zoom
      });
      mapInstanceRef.current = map;
      mapObjRef.current      = map;
      setMapReady(true);

      map.createPane("satellitePane"); map.getPane("satellitePane")!.style.zIndex = "201";
      map.createPane("indexPane");     map.getPane("indexPane")!.style.zIndex     = "202";
      map.createPane("labelsPane");
      Object.assign(map.getPane("labelsPane")!.style, { zIndex: "203", pointerEvents: "none" });
      map.createPane("imagePane");
      Object.assign(map.getPane("imagePane")!.style, { zIndex: "350" });
      imagePaneReadyRef.current = true;

      // ① Esri WorldImagery عبر الـ proxy
      baseTileRef.current = L.tileLayer(
        "/api/tile/{z}/{x}/{y}?source=satellite", {
        attribution: "Tiles © Esri",
        maxZoom: 22,
        maxNativeZoom: 18,
        pane: "satellitePane", crossOrigin: "anonymous",
      }).addTo(map);

      labelsLayerRef.current = L.tileLayer(
        "/api/tile/{z}/{x}/{y}?source=labels",
        { attribution: "", maxZoom: 22, maxNativeZoom: 19, opacity: 0.7, pane: "labelsPane", crossOrigin: "anonymous" }
      ).addTo(map);

      // ── Canvas Layer ──────────────────────────────────────────────────────
      const CanvasLayer = (L.Layer as any).extend({
        onAdd(this: any, lmap: any) {
          const canvas = document.createElement("canvas");
          Object.assign(canvas.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none", zIndex: "400" });
          lmap.getPane("overlayPane")!.appendChild(canvas);
          this._canvas = canvas; canvasRef.current = canvas;
          lmap.on("moveend zoomend viewreset resize", this._update, this);
          this._update();
        },
        onRemove(this: any, lmap: any) {
          this._canvas?.remove(); canvasRef.current = null;
          lmap.off("moveend zoomend viewreset resize", this._update, this);
        },
        _update(this: any) {
          const lmap = this._map, size = lmap.getSize();
          L.DomUtil.setPosition(this._canvas, lmap.containerPointToLayerPoint([0, 0]));
          this._canvas.width = size.x; this._canvas.height = size.y;
          redrawCurrent(this._canvas, lmap, L);
        },
      });
      new CanvasLayer().addTo(map);

      // ── Extrusion Canvas (separate from capture canvas) ───────────────────
      const ExtrudeCanvasLayer = (L.Layer as any).extend({
        onAdd(this: any, lmap: any) {
          const canvas = document.createElement("canvas");
          Object.assign(canvas.style, { position: "absolute", top: "0", left: "0", pointerEvents: "none", zIndex: "345" });
          lmap.getPane("overlayPane")!.appendChild(canvas);
          this._canvas = canvas; extrudeCanvasRef.current = canvas;
          lmap.on("moveend zoomend viewreset resize", this._update, this);
          this._update();
        },
        onRemove(this: any, lmap: any) {
          this._canvas?.remove(); extrudeCanvasRef.current = null;
          lmap.off("moveend zoomend viewreset resize", this._update, this);
        },
        _update(this: any) {
          const lmap = this._map, size = lmap.getSize();
          L.DomUtil.setPosition(this._canvas, lmap.containerPointToLayerPoint([0, 0]));
          this._canvas.width = size.x; this._canvas.height = size.y;
          // draw extrusions after resizing
          drawExtrusions();
        },
      });
      new ExtrudeCanvasLayer().addTo(map);

      // ── Close Shape button ────────────────────────────────────────────────
      const closeBtn = document.createElement("button");
      closeBtnRef.current = closeBtn;
      Object.assign(closeBtn.style, {
        display: "none", position: "absolute", bottom: "80px", left: "50%",
        transform: "translateX(-50%)", zIndex: "1000",
        background: "#0a1628cc", border: "1px solid rgba(0,200,255,0.5)",
        color: "#00c8ff", padding: "7px 20px", borderRadius: "20px",
        fontSize: "12px", cursor: "pointer", pointerEvents: "auto",
        backdropFilter: "blur(10px)", boxShadow: "0 4px 20px rgba(0,212,255,0.25)",
        fontFamily: "DM Sans, sans-serif", letterSpacing: "0.3px",
      });
      closeBtn.textContent = "✓ Close Shape";
      closeBtn.addEventListener("mouseenter", () => closeBtn.style.background = "#0a1628");
      closeBtn.addEventListener("mouseleave", () => closeBtn.style.background = "#0a1628cc");
      closeBtn.addEventListener("click", () => {
        const tool = activeToolRef.current;
        if (tool === "polygon") finishPolygon(map, L);
        if (tool === "measure") finishMeasure(map, L);
      });
      mapRef.current!.appendChild(closeBtn);

      // ── Image overlays manager UI ─────────────────────────────────────────
      const overlaysUi = document.createElement("div");
      overlaysUiRef.current = overlaysUi;
      overlaysUi.style.cssText = `
        display:none; position:absolute; top:64px; left:14px; z-index:1200;
        width:240px; max-height:220px; overflow:auto;
        background:rgba(10,22,40,0.92); backdrop-filter:blur(12px);
        border:1px solid rgba(255,255,255,0.10); border-radius:16px;
        padding:10px; box-shadow:0 18px 56px rgba(0,0,0,0.55);
        pointer-events:auto;
        font-family:DM Sans, sans-serif;
      `;
      mapRef.current!.appendChild(overlaysUi);
      // restore persisted overlays once map is ready
      restoreImageOverlays();

      // ── Sat / Index ───────────────────────────────────────────────────────
      onSatChange((satKey: SatKey) => {
        const def = SAT_LAYERS[satKey];
        if (baseTileRef.current)  map.removeLayer(baseTileRef.current);
        if (indexTileRef.current) { map.removeLayer(indexTileRef.current); indexTileRef.current = null; }
        if (!def?.url) return;
        baseTileRef.current = L.tileLayer(def.url, {
          attribution:   def.attribution,
          maxZoom:       def.maxZoom,
          maxNativeZoom: def.maxNativeZoom,
          tileSize:      256,
          pane:          "satellitePane",
          crossOrigin:   "anonymous",
        }).addTo(map);
      });

      onIdxChange((idxKey: IdxKey) => {
        if (indexTileRef.current) { map.removeLayer(indexTileRef.current); indexTileRef.current = null; }
        if (idxKey === "RGB") return;
        const tile = INDEX_TILES[idxKey];
        if (!tile?.url) return;
        indexTileRef.current = L.tileLayer(tile.url, {
          attribution: `${idxKey}`,
          maxZoom: tile.maxZoom, maxNativeZoom: tile.maxNativeZoom,
          tileSize: 256, opacity: tile.opacity, pane: "indexPane", crossOrigin: "anonymous",
        }).addTo(map);
      });

      onOpacityChangeRegister?.((o: number) => {
        if (indexTileRef.current) indexTileRef.current.setOpacity(o);
        if (labelsLayerRef.current) labelsLayerRef.current.setOpacity(o * 0.8 + 0.1);
      });

      document.getElementById("map-zoom-in")?.addEventListener("click",  () => map.zoomIn());
      document.getElementById("map-zoom-out")?.addEventListener("click", () => map.zoomOut());

      flyToRef.current = (lat, lng) => {
        const safeLat = Number(lat);
        const safeLng = Number(lng);
        if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;

        map.flyTo([safeLat, safeLng], 13, { duration: 1.6 });
        setTimeout(() => L.circleMarker([safeLat, safeLng], { radius: 9, color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.7, weight: 2 })
          .addTo(map).bindPopup(`<b>📍 Location</b><br/>${safeLat.toFixed(5)}°N, ${safeLng.toFixed(5)}°E`).openPopup(), 1700);
      };

      clearRef.current = () => {
        drawLayersRef.current.forEach((l) => map.removeLayer(l));
        drawLayersRef.current = []; drawPointsRef.current = [];
        lastCoordsRef.current = []; lastToolRef.current = "pointer";
        if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
        if (canvasRef.current) clearCanvas(canvasRef.current);
        if (closeBtnRef.current) closeBtnRef.current.style.display = "none";

        // clear image overlays
        imageOverlaysRef.current.forEach((ov) => {
          try { map.removeLayer(ov.layer); } catch (_) {}
        });
        imageOverlaysRef.current = [];
        try { localStorage.removeItem(IMAGE_OVERLAYS_STORAGE_KEY); } catch (_) {}
        refreshOverlaysUi();
        stopImagePlacement();
      };

      // ── Click ─────────────────────────────────────────────────────────────
      map.on("click", async (e: any) => {
        const tool = activeToolRef.current;
        const { lat, lng } = e.latlng;
        // throttle setState to avoid React re-renders on every click
        requestAnimationFrame(() => onCoordsUpdate(lat, lng));

        // Trigger onFeatureClick with a virtual feature to update panels (Weather/NDVI) for any click
        if (tool === "pointer") {
          onFeatureClick?.({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lng, lat] },
            properties: { _virtual: true }
          });
        }

        // ── Image placement mode (always takes precedence) ───────────────────
        if (placingImageRef.current) {
          const st = placingImageRef.current;
          if (!st.ready) {
            // image still preparing
            if (st.hintEl) st.hintEl.textContent = `Preparing image… please wait`;
            return;
          }
          st.clicks.push({ lat, lng });
          if (st.clicks.length === 1) {
            clearImagePlacementHint();
            const hint = document.createElement("div");
            hint.style.cssText = `
              position:absolute;top:14px;left:50%;transform:translateX(-50%);
              z-index:1200;pointer-events:none;
              background:rgba(10,22,40,0.92);backdrop-filter:blur(10px);
              border:1px solid rgba(167,139,250,0.25);color:#e2e8f0;
              padding:8px 12px;border-radius:999px;
              font-family:DM Sans, sans-serif;font-size:12px;
              box-shadow:0 10px 28px rgba(0,0,0,0.45);
            `;
            hint.textContent = `Now click BOTTOM-RIGHT corner`;
            mapRef.current?.appendChild(hint);
            st.hintEl = hint;
            return;
          }
          if (st.clicks.length >= 2) {
            const a = st.clicks[0];
            const b = st.clicks[1];
            const north = Math.max(a.lat, b.lat);
            const south = Math.min(a.lat, b.lat);
            const east = Math.max(a.lng, b.lng);
            const west = Math.min(a.lng, b.lng);
            // ensure bounds not too tiny (otherwise image may appear invisible)
            const minDelta = 0.00015; // ~15-20m
            const n2 = north === south ? north + minDelta : north;
            const s2 = north === south ? south - minDelta : south;
            const e2 = east === west ? east + minDelta : east;
            const w2 = east === west ? west - minDelta : west;
            try {
              const bounds = L.latLngBounds([s2, w2], [n2, e2]);
              const ov = L.imageOverlay(st.src, bounds, { opacity: 0.85, pane: "imagePane" }).addTo(map);
              imageOverlaysRef.current.push({
                id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
                name: st.file.name,
                src: st.src,
                bounds: [[s2, w2], [n2, e2]],
                layer: ov,
              });
              persistImageOverlays();
              refreshOverlaysUi();
              map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 16, duration: 0.8 });
              clearImagePlacementHint();
              placingImageRef.current = null;
            } catch (err) {
              console.error("❌ imageOverlay failed:", err);
              stopImagePlacement();
            }
          }
          return;
        }

        if (tool === "pointer") return;

        // ── Marker ──────────────────────────────────────────────────────────
        if (tool === "marker") {
          const c  = TOOL_COLORS.marker;
          const mk = L.circleMarker([lat, lng], { radius: 7, color: c.stroke, fillColor: c.stroke, fillOpacity: 0.85, weight: 2 }).addTo(map);
          mk.bindPopup(`📍 ${lat.toFixed(6)}°N<br/>${lng.toFixed(6)}°E`).openPopup();
          drawLayersRef.current.push(mk);
          if (canvasRef.current) {
            const px = map.latLngToContainerPoint(L.latLng(lat, lng));
            drawMarker(canvasRef.current, px);
            lastCoordsRef.current = [...lastCoordsRef.current, { lat, lng }];
            lastToolRef.current   = "marker";
            const metadata: CaptureMetadata = { areaName: "Marker", areaSizeHa: 0, zoom: map.getZoom(), capturedAt: new Date().toISOString() };
            await handleCapture(canvasRef.current, map, L, [{ lat, lng }], metadata);
          }
          return;
        }

        // ── Polygon: كليك واحد للإضافة، كليك على الأولى أو زر Close للإنهاء ─
        if (tool === "polygon") {
          const pts = drawPointsRef.current;
          const c   = TOOL_COLORS.polygon;

          if (pts.length === 0) {
            toast(isRTL ? "اضغط Esc لإنهاء الرسم وعرض النتائج" : "Press Esc to finish drawing and see results", {
              icon: "⌨️",
              duration: 5000,
            });
          }

          // لو في 3 نقاط وكليك قريب من النقطة الأولى → أقفل
          if (pts.length >= 3) {
            const firstPx = map.latLngToContainerPoint(L.latLng(pts[0][0], pts[0][1]));
            const clickPx = map.latLngToContainerPoint(L.latLng(lat, lng));
            const dist    = Math.sqrt((clickPx.x - firstPx.x) ** 2 + (clickPx.y - firstPx.y) ** 2);
            if (dist < 15) { finishPolygon(map, L); return; }
          }
          pts.push([lat, lng]);
          drawLayersRef.current.push(
            L.circleMarker([lat, lng], {
              radius: pts.length === 1 ? 6 : 4,
              color: c.stroke,
              fillColor: pts.length === 1 ? c.stroke : "#fff",
              fillOpacity: 1, weight: 2,
            }).addTo(map)
          );
          if (pts.length >= 3 && closeBtnRef.current) closeBtnRef.current.style.display = "block";
          return;
        }

        // ── Measure ──────────────────────────────────────────────────────────
        if (tool === "measure") {
          const pts = drawPointsRef.current;
          if (pts.length === 0) {
            toast(isRTL ? "اضغط Esc لإنهاء القياس وعرض النتائج" : "Press Esc to finish measuring and see results", {
              icon: "📏",
              duration: 5000,
            });
          }
          pts.push([lat, lng]);
          drawLayersRef.current.push(
            L.circleMarker([lat, lng], { radius: 4, color: TOOL_COLORS.measure.stroke, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map)
          );
          if (pts.length >= 2 && closeBtnRef.current) closeBtnRef.current.style.display = "block";
          return;
        }

        // ── Rectangle ────────────────────────────────────────────────────────
        if (tool === "rectangle") {
          const c = TOOL_COLORS.rectangle;
          if (!drawPointsRef.current.length) {
            drawPointsRef.current.push([lat, lng]);
            drawLayersRef.current.push(L.circleMarker([lat, lng], { radius: 4, color: c.stroke, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map));
          } else {
            const p1   = drawPointsRef.current[0];
            const rect = L.rectangle([p1, [lat, lng]], { color: c.stroke, weight: 2, fillColor: c.stroke, fillOpacity: 0.18 }).addTo(map);
            const area = parseFloat((Math.abs(p1[0] - lat) * Math.abs(p1[1] - lng) * 12345).toFixed(1));
            rect.bindPopup(`📐 ${t.rectangle} · ≈ ${area} ${t.ha}`).openPopup();
            drawLayersRef.current.push(rect);
            onAreaSelected("Drawn Rectangle", area);
            if (canvasRef.current) {
              const px1 = map.latLngToContainerPoint(L.latLng(p1[0], p1[1]));
              const px2 = map.latLngToContainerPoint(L.latLng(lat, lng));
              drawRect(canvasRef.current, px1, px2);
              const coordinates: LatLngPoint[] = [{ lat: p1[0], lng: p1[1] }, { lat, lng: p1[1] }, { lat, lng }, { lat: p1[0], lng }];
              lastCoordsRef.current = [{ lat: p1[0], lng: p1[1] }, { lat, lng }];
              lastToolRef.current   = "rectangle";
              const metadata: CaptureMetadata = { areaName: "Drawn Rectangle", areaSizeHa: area, zoom: map.getZoom(), capturedAt: new Date().toISOString() };
              await handleCapture(canvasRef.current, map, L, coordinates, metadata);
            }
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
          return;
        }

        // ── Circle ───────────────────────────────────────────────────────────
        if (tool === "circle") {
          const c = TOOL_COLORS.circle;
          if (!drawPointsRef.current.length) {
            drawPointsRef.current.push([lat, lng]);
          } else {
            const center = drawPointsRef.current[0];
            const radius = map.distance(center, [lat, lng]);
            const circ   = L.circle(center, { radius, color: c.stroke, weight: 2, fillColor: c.stroke, fillOpacity: 0.18 }).addTo(map);
            const area   = parseFloat((Math.PI * Math.pow(radius / 1000, 2) * 100).toFixed(1));
            circ.bindPopup(`🟢 ${t.circle} · R: ${radius.toFixed(0)} m · ≈ ${area} ${t.ha}`).openPopup();
            drawLayersRef.current.push(circ);
            onAreaSelected("Drawn Circle", area);
            if (canvasRef.current) {
              const cPx = map.latLngToContainerPoint(L.latLng(center[0], center[1]));
              const ePx = map.latLngToContainerPoint(L.latLng(lat, lng));
              const rPx = Math.sqrt((ePx.x - cPx.x) ** 2 + (ePx.y - cPx.y) ** 2);
              drawCircle(canvasRef.current, cPx, rPx);
              const centerCoord: LatLngPoint = { lat: center[0], lng: center[1] };
              lastCoordsRef.current = [centerCoord, { lat, lng }];
              lastToolRef.current   = "circle";
              const metadata: CaptureMetadata = { areaName: "Drawn Circle", areaSizeHa: area, zoom: map.getZoom(), capturedAt: new Date().toISOString() };
            const { smallUrl, smallBlob, largeBlob } = await captureCircle(canvasRef.current, map, L, centerCoord, radius, metadata);
              onCapture?.(smallUrl);
              const res = await sendToBackend(smallBlob, largeBlob, [centerCoord, { lat, lng }], metadata);
              if (res.ok) console.log("✅ Backend:", await res.json());
            }
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
        }
      });

      // ── Mousemove (throttled via rAF) ────────────────────────────────────
      map.on("mousemove", (e: any) => {
        lastMoveRef.current = e;
        if (rafRef.current !== null) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const ev   = lastMoveRef.current;
          if (!ev) return;
          const tool = activeToolRef.current, pts = drawPointsRef.current;
          if (tool === "pointer" || !pts.length) return;
          if (tempLayerRef.current) map.removeLayer(tempLayerRef.current);
          const cur: [number, number] = [ev.latlng.lat, ev.latlng.lng];
          const cp = TOOL_COLORS;
          if (tool === "polygon" || tool === "measure")
            tempLayerRef.current = L.polyline([...pts, cur], { color: cp[tool].stroke, weight: 1.5, dashArray: "4 4", opacity: 0.7 }).addTo(map);
          if (tool === "rectangle")
            tempLayerRef.current = L.rectangle([pts[0], cur], { color: cp.rectangle.stroke, weight: 1.5, dashArray: "4 4", fillOpacity: 0.08 }).addTo(map);
          if (tool === "circle") {
            const r = map.distance(pts[0], cur);
            tempLayerRef.current = L.circle(pts[0], { radius: r, color: cp.circle.stroke, weight: 1.5, dashArray: "4 4", fillOpacity: 0.07 }).addTo(map);
          }
        });
      });
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (overlaysUiRef.current) {
        overlaysUiRef.current.remove();
        overlaysUiRef.current = null;
      }
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  useEffect(() => {
    const c = mapInstanceRef.current?.getContainer();
    if (c) c.style.cursor = activeTool === "pointer" ? "grab" : "crosshair";
    if (closeBtnRef.current && activeTool !== "polygon" && activeTool !== "measure") {
      closeBtnRef.current.style.display = "none";
    }
  }, [activeTool]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <style>{`
        .leaflet-container{background:#040d1a!important}
        .leaflet-container::before{content:'';position:absolute;inset:0;background-image:radial-gradient(1px 1px at 10% 20%,rgba(255,255,255,.6) 0%,transparent 100%),radial-gradient(1px 1px at 30% 60%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 50% 10%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 70% 80%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 85% 35%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 20% 85%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 60% 45%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 90% 65%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 40% 30%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 75% 15%,rgba(255,255,255,.6) 0%,transparent 100%);pointer-events:none;z-index:-1}
        .ndvi-tooltip{background:#0a1628!important;border:1px solid rgba(0,212,255,.3)!important;color:#e2e8f0!important;font-size:.72rem!important;border-radius:6px!important}
        .ndvi-tooltip::before{border-top-color:rgba(0,212,255,.3)!important}
        .leaflet-popup-content-wrapper{background:#0a1628!important;border:1px solid rgba(255,255,255,.1)!important;color:#e2e8f0!important;border-radius:10px!important;box-shadow:0 8px 32px rgba(0,0,0,.6)!important;font-size:.82rem!important}
        .leaflet-popup-tip{background:#0a1628!important}
        .leaflet-popup-close-button{color:#64748b!important}
        .leaflet-control-attribution{background:rgba(4,13,26,.8)!important;color:#475569!important;font-size:.55rem!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .animate-fadeUp{animation:fadeUp .25s ease both}
      `}</style>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
    </>
  );
}
