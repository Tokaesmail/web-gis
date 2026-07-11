"use client";

// ─── LeafletMap.tsx ───────────────────────────────────────────────────────────
// التعديلات:
// ① OSM تايلز بدل Esri (مفيهاش مشكلة zoom)
// ② Polygon بكليك واحد للإنهاء — زر "Close Shape" أو كليك على النقطة الأولى
// ③ Double-click zoom متوقف تماماً
// ④ الألوان للعرض بس — مش بتتبعت للباك
// ⑤ AOI Editor: تعديل الرؤوس (move vertices) + Validation (self-intersection + max size)

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useMapCanvas }      from "./useMapCanvas";
import { useLang }           from "../_components/translations";
import * as turf from "@turf/turf";
import {
  DrawTool, SAT_LAYERS,
  SatKey, LatLngPoint, CaptureMetadata, CaptureResult, CaptureTarget,
} from "./mapTypes_proxy";
import { validateAOI, MAX_AOI_SIZE_HA } from "./aoiValidation";

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
  captureTarget:  CaptureTarget;
  onAreaSelected: (name: string, area: number, feature?: GeoJSON.Feature) => void;
  onCoordsUpdate: (lat: number, lng: number) => void;
  flyToRef:       React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  clearRef:       React.MutableRefObject<(() => void) | null>;
  onSatChange:    (handler: (sat: SatKey) => void) => void;
  onOpacityChangeRegister?: (handler: (o: number) => void) => void;
  /** register an image placement workflow (2 clicks to place image) */
  onImagePlacerRegister?: (handler: (file: File) => void) => void;
  onRasterOverlayRegister?: (handler: (config: {
    name: string;
    indexKey: string;
    expression: string;
    date: string;
    dataUrl: string;
    bounds: [[number, number], [number, number]];
    opacity: number;
    colorRamp: string;
    coords: { lat: number; lng: number };
  }) => void) => void;
  /** register a real, georeferenced Before/After swipe overlay directly on the map
   *  (Change Detection panel only). Call the registered handler with `null` to remove it. */
  onSwipeOverlayRegister?: (handler: (config: {
    beforeUrl: string;
    afterUrl: string;
    bounds: [[number, number], [number, number]];
    beforeLabel?: string;
    afterLabel?: string;
  } | null) => void) => void;
  onCapture?:     (capture: CaptureResult) => void;
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
  /** features محفوظة في البروجيكت — بترسمهم تاني لما نفتح البروجيكت */
  initialFeatures?: GeoJSON.Feature[];
}

// ── ألوان كل أداة — للعرض فقط، مش بتتبعت للباك ──────────────────────────────
const TOOL_COLORS = {
  polygon:   { stroke: "#00c8ff", fill: "transparent" },
  rectangle: { stroke: "#a78bfa", fill: "transparent" },
  circle:    { stroke: "#34d399", fill: "transparent" },
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

function makePolygonFeature(name: string, points: [number, number][], area: number): GeoJSON.Feature {
  const ring = points.map(([lat, lng]) => [lng, lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closedRing = first && last && (first[0] !== last[0] || first[1] !== last[1])
    ? [...ring, first]
    : ring;

  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [closedRing] },
    properties: { name, areaHa: area, _drawn: true },
  };
}

// دالة تحويل الدائرة لـ Polygon حقيقي
function circleToPolygonLatLng(centerLat: number, centerLng: number, radiusMeters: number, points = 64): [number, number][] {
  const EARTH_RADIUS = 6371008.8;
  const latRad = (centerLat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.cos(bearing)) / EARTH_RADIUS;
    const dLng = (radiusMeters * Math.sin(bearing)) / (EARTH_RADIUS * Math.cos(latRad));
    ring.push([
      centerLat + (dLat * 180) / Math.PI,   // lat
      centerLng + (dLng * 180) / Math.PI,   // lng
    ]);
  }
  return ring;
}

export default function LeafletMap({
  activeTool, captureTarget, onAreaSelected, onCoordsUpdate,
  flyToRef, clearRef, onSatChange, onOpacityChangeRegister, onCapture,
  geoJsonData, extraGeoJsonData, latestGeoJson, geoJsonStyle, geoJsonFitBounds = true, onFeatureClick,
  onImagePlacerRegister,
  onRasterOverlayRegister,
  onSwipeOverlayRegister,
  extrusionGeoJson,
  extrusionConfig,
  initialFeatures,
}: Props) {
  const { t, isRTL } = useLang();

  const IMAGE_OVERLAYS_STORAGE_KEY = "leaflet_image_overlays_v1";

  const projectStateRef = useRef<any>({
  aoi_polygons: [],
  analyses: [],
});
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const restoredRef = useRef(false);
  const activeToolRef  = useRef<DrawTool>(activeTool);
  const drawLayersRef  = useRef<any[]>([]);
  const draftLayersRef = useRef<any[]>([]);
  const tempLayerRef   = useRef<any>(null);
  const drawPointsRef  = useRef<[number, number][]>([]);
  const baseTileRef    = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  // ── Zoom guard: يرجع زوم واحد أوتوماتيك لو التايلز مش متوفرة في المكان ده ──
  const tileErrorAtCurrentZoomRef = useRef(false);
  const zoomRevertTimeoutRef      = useRef<any>(null);
  const lastStableZoomRef         = useRef<number>(11);
  const canvasRef      = useRef<HTMLCanvasElement | null>(null);
  const extrudeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastCoordsRef  = useRef<LatLngPoint[]>([]);
  const lastToolRef    = useRef<DrawTool>("pointer");
  const closeBtnRef    = useRef<HTMLButtonElement | null>(null);
  // نحتاج refs للـ map و L عشان نستخدمهم في finishPolygon من الـ button
  const mapObjRef      = useRef<any>(null);
  const LRef           = useRef<any>(null);
  const geoJsonLayerRef     = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null);
  const extraGeoJsonLayerRef = useRef<any>(null);
  const initialFeaturesLayerRef = useRef<any[]>([]);
  const rafRef              = useRef<number | null>(null);
  const lastMoveRef         = useRef<any>(null);
  // ── throttle للـ virtual feature clicks (pointer tool) عشان منبعتش طلبات NDVI/Weather كتير على الفاضي ──
  const lastVirtualClickRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const imagePaneReadyRef = useRef(false);
  const imageOverlaysRef = useRef<{ id: string; name: string; src: string; bounds: [[number, number], [number, number]]; layer: any }[]>([]);
  const rasterOverlayRef = useRef<Map<string, any>>(new Map());
  const swipeOverlayRef = useRef<{ cleanup: () => void } | null>(null);
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

  // ⚠️ لو المستخدم بادئ يرسم شكل ولسه مخلصوش (نقطة أو أكتر) وبدّل الأداة من التولبار
  // (يبدأ يرسم دايرة أو مربع تاني وهو لسه في نص بولوجن) — كنا بنسيب الرسمة الناقصة
  // معلقة على الماب (نقط/temp layers) وبعدين الشكل الجديد يترسم فوقها. دلوقتي أي
  // تغيير للأداة يمسح الرسم الناقص الحالي أولاً.
  useEffect(() => {
    if (activeToolRef.current !== activeTool) {
      if (drawPointsRef.current.length > 0) cancelCurrentDrawing();
    }
    activeToolRef.current = activeTool;
  }, [activeTool]);

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

  const cancelCurrentDrawing = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    draftLayersRef.current.forEach((layer) => {
      try { map.removeLayer(layer); } catch (_) {}
    });
    drawLayersRef.current = drawLayersRef.current.filter((layer) => !draftLayersRef.current.includes(layer));
    draftLayersRef.current = [];

    if (tempLayerRef.current) {
      try { map.removeLayer(tempLayerRef.current); } catch (_) {}
      tempLayerRef.current = null;
    }
    drawPointsRef.current = [];
    if (closeBtnRef.current) closeBtnRef.current.style.display = "none";
  };

  /** يمسح شكل واحد بس من على الماب (مش كل الرسومات زي زرار Delete All) */
  const deleteSingleShape = (layer: any) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try { map.closePopup(); } catch (_) {}
    try { map.removeLayer(layer); } catch (_) {}
    drawLayersRef.current = drawLayersRef.current.filter((l) => l !== layer);
    draftLayersRef.current = draftLayersRef.current.filter((l) => l !== layer);
    initialFeaturesLayerRef.current = initialFeaturesLayerRef.current.filter((l) => l !== layer);
  };

  /** صف الأزرار اللي بتتحط جوه popup أي شكل مرسوم — Delete بس (Edit AOI اتشالت لأنها كانت مش شغالة). */
  const buildShapePopupActions = (layer: any, kind: "polygon" | "rectangle" | "circle" | "marker" | "measure") => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;margin-top:6px;";

    const delBtn = document.createElement("button");
    delBtn.textContent = isRTL ? "🗑️ حذف" : "🗑️ Delete";
    delBtn.style.cssText = "background:#ef444422;border:1px solid #ef444455;color:#f87171;padding:4px 10px;border-radius:8px;font-size:11px;cursor:pointer";
    delBtn.onclick = () => deleteSingleShape(layer);
    row.appendChild(delBtn);

    return row;
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

useEffect(() => {
    if (!onRasterOverlayRegister) return;
    onRasterOverlayRegister((config) => {
      const map = mapInstanceRef.current;
      const L = LRef.current;
      if (!map || !L || !config.dataUrl) return;

      // كل analysis ليه key فريد — name + date عشان نعرض نفس الـ analysis مع update
      const overlayKey = `${config.indexKey}_${config.date}`;

      // لو نفس الـ key موجود قبل كده امسحه (update مش duplicate)
      const existing = rasterOverlayRef.current.get(overlayKey);
      if (existing) {
        try { map.removeLayer(existing); } catch (_) {}
        rasterOverlayRef.current.delete(overlayKey);
      }

      const bounds = L.latLngBounds(config.bounds[0], config.bounds[1]);
      const layer = L.imageOverlay(config.dataUrl, bounds, {
        opacity: config.opacity,
        pane: "imagePane",
        // الصورة الأصلية low-res (كلاسات مصنّفة، مش صورة عادية)، فلو المتصفح
        // كبّرها بـ smooth/bilinear scaling الافتراضي، البقع/النقط الحمرا
        // والخضرا الصغيرة بتتمسح وتتحول لبقعة ضبابية (زي اللي كان بيبان أخضر
        // "شايل" فوق الخريطة). pixelated بيخلي كل بكسل مصنّف يبان بحدوده
        // واضحة زي في صورة السايد بار بالظبط.
        className: "change-detection-raster-overlay",
      }).addTo(map);
      rasterOverlayRef.current.set(overlayKey, layer);

      // map.flyToBounds(bounds, { padding: [42, 42], maxZoom: 14, duration: 0.8 });
      const sceneMarker = L.circleMarker([config.coords.lat, config.coords.lng], {
        radius: 7,
        color: "#22d3ee",
        fillColor: "#22d3ee",
        fillOpacity: 0.75,
        weight: 2,
      }).addTo(map).bindPopup(`<b>${config.name}</b><br/>${config.coords.lat.toFixed(5)}, ${config.coords.lng.toFixed(5)}`);

      // سجّليه عشان زرار Clear يقدر يمسحه لو احتاج
      drawLayersRef.current.push(sceneMarker);

      // ولو المستخدم قفل الـ popup بزرار X، امسحي النقطة خالص مش بس اقفلي الـ popup
      sceneMarker.on("popupclose", () => {
        map.removeLayer(sceneMarker);
        drawLayersRef.current = drawLayersRef.current.filter((l) => l !== sceneMarker);
      });
    });
  }, [onRasterOverlayRegister, mapReady]);

  // ── Change Detection: real, georeferenced Before/After swipe directly on the map ──
  // Two stacked L.imageOverlay layers (before + after) covering the exact same AOI
  // bounds. The "after" layer's own DOM element is clipped with a CSS clip-path
  // expressed as a percentage of *its own* box — since that box always exactly
  // spans `bounds` regardless of zoom/pan, a plain 0..1 fraction is enough and
  // never needs recalculating on zoom. Only the divider handle's on-screen pixel
  // position needs to be recomputed on pan/zoom (via latLngToContainerPoint).
  useEffect(() => {
    if (!onSwipeOverlayRegister) return;
    onSwipeOverlayRegister((config) => {
      const map = mapInstanceRef.current;
      const L = LRef.current;

      // Always clear whatever swipe overlay exists first (update or teardown).
      if (swipeOverlayRef.current) {
        swipeOverlayRef.current.cleanup();
        swipeOverlayRef.current = null;
      }
      if (!config || !map || !L) return;

      const bounds = L.latLngBounds(config.bounds[0], config.bounds[1]);
      const beforeLayer = L.imageOverlay(config.beforeUrl, bounds, { pane: "imagePane", opacity: 1 }).addTo(map);
      const afterLayer  = L.imageOverlay(config.afterUrl,  bounds, { pane: "imagePane", opacity: 1 }).addTo(map);

      // UI: divider line + drag handle + before/after labels, as a plain DOM
      // overlay sitting above the imagePane (350) but positioned/sized manually
      // since it isn't a leaflet layer itself (needs free pixel-space dragging).
      const ui = L.DomUtil.create("div", "swipe-compare-ui", map.getContainer()) as HTMLDivElement;
      ui.style.cssText = "position:absolute; inset:0; z-index:610; pointer-events:none; overflow:hidden;";

      const line = document.createElement("div");
      line.style.cssText = "position:absolute; width:2px; background:#22d3ee; box-shadow:0 0 10px rgba(34,211,238,.8); pointer-events:none;";
      ui.appendChild(line);

      const handle = document.createElement("div");
      handle.style.cssText = "position:absolute; width:34px; height:34px; margin-left:-17px; margin-top:-17px; border-radius:9999px; background:#020817ee; border:2px solid #22d3ee; color:#22d3ee; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:700; cursor:ew-resize; pointer-events:all; box-shadow:0 4px 16px rgba(0,0,0,.55);";
      handle.textContent = "↔";
      ui.appendChild(handle);

      // CRITICAL: without this, dragging the handle also bubbles up as a
      // click/mousedown to the Leaflet map container underneath. Leaflet then
      // fires its own "click" handler (onFeatureClick with a virtual point
      // feature), which overwrites selectedFeature -> AOI bounds change ->
      // the swipe config gets recomputed with the wrong (or null) bounds and
      // vanishes. disableClickPropagation stops click/dblclick/mousedown/
      // touchstart/contextmenu from ever reaching the map for this element.
      L.DomEvent.disableClickPropagation(handle);
      L.DomEvent.disableClickPropagation(ui);

      const beforeLabel = document.createElement("div");
      beforeLabel.textContent = config.beforeLabel ?? "Before";
      beforeLabel.style.cssText = "position:absolute; background:rgba(0,0,0,.7); color:#7dd3fc; font-size:11px; font-weight:700; letter-spacing:.03em; padding:4px 10px; border-radius:6px; pointer-events:none; white-space:nowrap;";
      ui.appendChild(beforeLabel);

      const afterLabel = document.createElement("div");
      afterLabel.textContent = config.afterLabel ?? "After";
      afterLabel.style.cssText = "position:absolute; background:rgba(0,0,0,.7); color:#fdba74; font-size:11px; font-weight:700; letter-spacing:.03em; padding:4px 10px; border-radius:6px; pointer-events:none; white-space:nowrap;";
      ui.appendChild(afterLabel);

      let position = 0.5; // fraction 0..1 across the AOI width — before on the left, after on the right

      const applyClip = () => {
        const afterEl = (afterLayer as any).getElement?.() as HTMLElement | undefined;
        if (afterEl) afterEl.style.clipPath = `inset(0 0 0 ${position * 100}%)`;
      };

      const reposition = () => {
        const nw = map.latLngToContainerPoint(bounds.getNorthWest());
        const se = map.latLngToContainerPoint(bounds.getSouthEast());
        const left = Math.min(nw.x, se.x), right = Math.max(nw.x, se.x);
        const top = Math.min(nw.y, se.y), bottom = Math.max(nw.y, se.y);
        const x = left + (right - left) * position;
        line.style.left = `${x}px`;
        line.style.top = `${top}px`;
        line.style.height = `${Math.max(0, bottom - top)}px`;
        handle.style.left = `${x}px`;
        handle.style.top = `${(top + bottom) / 2}px`;
        beforeLabel.style.left = `${left + 10}px`;
        beforeLabel.style.top = `${top + 10}px`;
        afterLabel.style.left = `${Math.max(left + 10, right - 10 - afterLabel.offsetWidth)}px`;
        afterLabel.style.top = `${top + 10}px`;
      };

      afterLayer.on("load", () => { applyClip(); reposition(); });
      beforeLayer.on("load", reposition);
      applyClip();
      reposition();

      const onMapMove = () => reposition();
      map.on("move", onMapMove);
      map.on("zoom", onMapMove);

      let dragging = false;
      const onPointerDown = (e: PointerEvent) => {
        dragging = true;
        handle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
        // avoid the map itself panning/zooming while the handle is dragged
        map.dragging.disable();
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!dragging) return;
        const nw = map.latLngToContainerPoint(bounds.getNorthWest());
        const se = map.latLngToContainerPoint(bounds.getSouthEast());
        const left = Math.min(nw.x, se.x), right = Math.max(nw.x, se.x);
        const rect = map.getContainer().getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const frac = (clientX - left) / Math.max(1, right - left);
        position = Math.max(0, Math.min(1, frac));
        applyClip();
        reposition();
      };
      const onPointerUp = () => {
        dragging = false;
        map.dragging.enable();
      };

      handle.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);

      swipeOverlayRef.current = {
        cleanup: () => {
          map.off("move", onMapMove);
          map.off("zoom", onMapMove);
          handle.removeEventListener("pointerdown", onPointerDown);
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
          try { map.dragging.enable(); } catch {}
          try { map.removeLayer(beforeLayer); } catch {}
          try { map.removeLayer(afterLayer); } catch {}
          try { ui.remove(); } catch {}
        },
      };
    });
  }, [onSwipeOverlayRegister, mapReady]);

  // Escape cancels only the in-progress interaction.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();

      if (placingImageRef.current) {
        stopImagePlacement();
        return;
      }

      if (drawPointsRef.current.length > 0) {
        cancelCurrentDrawing();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
  }, [geoJsonData, mapReady, geoJsonFitBounds, geoJsonStyle, onFeatureClick]);

  // ── Extra GeoJSON layer (شيكات الجامعات) ─────────────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L   = LRef.current;
    if (!map || !L) return;

    // امسح القديمة
    if (extraGeoJsonLayerRef.current) {
      map.removeLayer(extraGeoJsonLayerRef.current);
      extraGeoJsonLayerRef.current = null;
    }
    if (!extraGeoJsonData) return;

    const layer = L.geoJSON(extraGeoJsonData, {
      style: (feature: any) => {
        const p   = feature?.properties ?? {};
        const layerOpacity = typeof p._opacity === "number" ? Math.max(0, Math.min(1, p._opacity)) : 1;

        // ── University service areas ───────────────────────────────────────────
        if (p._layerType === "university" || p.FromBreak !== undefined) {
          const uc  = p._fillColor
            ? { fill: p._fillColor, stroke: p._strokeColor ?? p._fillColor }
            : getUniversityColor(p.FromBreak ?? 0, p.ToBreak ?? 15);
          return { color: uc.stroke, weight: 1.8, opacity: 0.9 * layerOpacity, fillColor: uc.fill, fillOpacity: 0.22 * layerOpacity };
        }

        // ── GeoJSON مرفوع من اليوزر — لون افتراضي سيان ────────────────────────
        const customColor = p._color ?? p.color ?? p.stroke ?? "#00c8ff";
        const customFill  = p._fillColor ?? p.fillColor ?? p.fill ?? "#00c8ff";
        return {
          color:       customColor,
          weight:      2,
          opacity:     0.9 * layerOpacity,
          fillColor:   customFill,
          fillOpacity: 0.2 * layerOpacity,
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

    // Keep the map view stable while layer controls re-render this data.

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

  // ── Restore drawn features from project snapshot ─────────────────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    const L   = LRef.current;
    if (!map || !L || !initialFeatures?.length) return;

    // امسح أي layers قديمة من load سابق
    initialFeaturesLayerRef.current.forEach((layer) => {
      try { map.removeLayer(layer); } catch (_) {}
    });
    initialFeaturesLayerRef.current = [];

    const c = TOOL_COLORS.polygon;
    const bounds: any[] = [];

    initialFeatures.forEach((feature) => {
      try {
        const geom = feature.geometry;
        const props = feature.properties ?? {};
        const name  = String(props.name ?? "Restored Shape");
        const area  = Number(props.areaHa ?? 0);

        // ── Polygon / Rectangle ───────────────────────────────────────────────
        if (geom.type === "Polygon") {
          // GeoJSON coords: [[[lng, lat], ...]]  → Leaflet: [[lat, lng], ...]
          const ring = geom.coordinates[0].map(([lng, lat]: number[]) => [lat, lng]);
          const poly = L.polygon(ring, {
            color: c.stroke, weight: 2,
            fillColor: c.fill, fillOpacity: 0,
          }).addTo(map);

          poly.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `🔵 ${name}${area ? ` · ≈ ${area} ha` : ""}`;
            div.appendChild(buildShapePopupActions(poly, "polygon"));
            return div;
          });

          drawLayersRef.current.push(poly);
          initialFeaturesLayerRef.current.push(poly);

          try { bounds.push(poly.getBounds()); } catch (_) {}
        }

        // ── Circle (bounds approximation) ─────────────────────────────────────
        if (geom.type === "Point") {
          const [lng, lat] = geom.coordinates as number[];
          const marker = L.circleMarker([lat, lng], {
            radius: 8,
            color: TOOL_COLORS.marker.stroke,
            fillColor: TOOL_COLORS.marker.fill,
            fillOpacity: 0.85,
            weight: 2,
          }).addTo(map);
          marker.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📍 ${name}`;
            div.appendChild(buildShapePopupActions(marker, "marker"));
            return div;
          });
          drawLayersRef.current.push(marker);
          initialFeaturesLayerRef.current.push(marker);
        }

        // ── LineString (measure) ──────────────────────────────────────────────
        if (geom.type === "LineString") {
          const latlngs = geom.coordinates.map(([lng, lat]: number[]) => [lat, lng]);
          const line = L.polyline(latlngs, {
            color: TOOL_COLORS.measure.stroke, weight: 2.5,
          }).addTo(map);
          line.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📏 ${name}`;
            div.appendChild(buildShapePopupActions(line, "measure"));
            return div;
          });
          drawLayersRef.current.push(line);
          initialFeaturesLayerRef.current.push(line);
          try { bounds.push(line.getBounds()); } catch (_) {}
        }
      } catch (err) {
        console.warn("Failed to restore feature:", err);
      }
    });

    // Fly to الـ bounds بتاعت كل الـ features المرسومة
    if (bounds.length) {
      try {
        const combined = bounds.reduce((acc, b) => acc.extend(b), L.latLngBounds(bounds[0]));
        if (combined.isValid()) {
          map.flyToBounds(combined, { padding: [60, 60], maxZoom: 15, duration: 1.2 });
        }
      } catch (_) {}
    }
  }, [initialFeatures, mapReady]);

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

  const validatePolygonBeforeSave = (pts: [number, number][]) => {
  if (pts.length < 3) return { ok: false, msg: "Not enough points" };

  const feature = makePolygonFeature(
    "temp",
    pts,
    0
  );

  const result = validateAOI(feature);

  if (!result.valid) {
    return { ok: false, msg: result.errors?.[0] || "Invalid polygon" };
  }

  return { ok: true, msg: "" };
};

  const handleCapture = async (
    canvas: HTMLCanvasElement, map: any, L: any,
    coordinates: LatLngPoint[], metadata: CaptureMetadata
  ) => {
    // ── AOI validation: no self-intersection + within max size ────────────────
    // Only meaningful for polygon-like shapes with >= 3 points; markers/measure
    // lines (areaSizeHa === 0, < 3 points) skip this check.
    if (coordinates.length >= 3) {
      const feature = makePolygonFeature(
        metadata.areaName,
        coordinates.map((p) => [p.lat, p.lng]),
        metadata.areaSizeHa
      );
      const validation = validateAOI(feature);
      if (!validation.valid) {
        toast.error(validation.errors[0] ?? (isRTL ? "شكل المنطقة غير صالح" : "Invalid AOI geometry"));
        return;
      }
      if (validation.warnings.length) {
        toast.warning(validation.warnings[0]);
      }
    }

    try {
      const captureResult = await capture(canvas, map, L, coordinates, metadata, captureTarget);
      const { smallBlob, largeBlob, viewportCoordinates, selectedBounds, viewportBounds } = captureResult;
      onCapture?.(captureResult);
      // ⚠️ largeBlob بيتحسب دايمًا محليًا عشان الـ preview في الواجهة (MapClient
      // بيخزن largeUrl حتى مع captureTarget === "small")، بس ده مش معناه إنه
      // لازم يترفع للباك. الباك دلوقتي dummy مش بيعمل حاجة بالصورة، فرفع صورتين
      // (small + large) على كل capture واحد كان بيضاعف حجم الأپلود من غير أي
      // فايدة فعلية. بنرفع بس الصورة اللي فعلاً مطلوبة حسب captureTarget.
      const res = await sendToBackend(
        smallBlob,
        captureTarget === "large" ? largeBlob : undefined,
        coordinates,
        metadata,
        { viewportCoordinates, selectedBounds, viewportBounds },
        captureTarget
      );
      if (res.ok) console.log("✅ Backend:", await res.json());
    } catch (err) {
      console.error("❌ Capture error:", err);
    }
  };

  // ── Start editing an existing finished AOI layer (move vertices / resize) ──
  const finishPolygon = async (map: any, L: any) => {
    const pts = drawPointsRef.current;

const check = validatePolygonBeforeSave(pts);
if (!check.ok) {
  toast.error(check.msg);
  return;
}
    if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
    if (closeBtnRef.current)  closeBtnRef.current.style.display = "none";

    const c    = TOOL_COLORS.polygon;
    const poly = L.polygon(pts, { color: c.stroke, weight: 2, fillColor: c.fill, fillOpacity: 0 }).addTo(map);
    drawLayersRef.current.push(poly);
    const coords = [...pts, pts[0]].map(([lat, lng]) => [lng, lat]);

const polygon = turf.polygon([coords]);

const area = parseFloat(
  (turf.area(polygon) / 10000).toFixed(1)
);
    poly.bindPopup(() => {
      const div = document.createElement("div");
      const label = document.createElement("div");
      label.innerHTML = `🔵 ${t.polygon} · ≈ ${area} ${t.ha}`;
      div.appendChild(label);
      div.appendChild(buildShapePopupActions(poly, "polygon"));
      return div;
    }).openPopup();

    const feature = makePolygonFeature("Drawn Polygon", pts, area);
    onAreaSelected("Drawn Polygon", area, feature);
    onFeatureClick?.(feature);

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
    draftLayersRef.current = [];
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
    line.bindPopup(() => {
      const div = document.createElement("div");
      div.innerHTML = `📏 ${(dist / 1000).toFixed(3)} ${t.km}`;
      div.appendChild(buildShapePopupActions(line, "measure"));
      return div;
    }).openPopup();

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
    draftLayersRef.current = [];
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

      // ── استرجاع آخر مكان/زوم كان فاتحهم اليوزر بدل ما نرجع للسعودية كل مرة ──
      const LAST_VIEW_STORAGE_KEY = "geosense_last_map_view";
      const DEFAULT_VIEW = { lat: 21.54, lng: 39.19, zoom: 11 };
      let initialView = DEFAULT_VIEW;
      try {
        const rawView = localStorage.getItem(LAST_VIEW_STORAGE_KEY);
        if (rawView) {
          const parsed = JSON.parse(rawView);
          if (
            Number.isFinite(parsed?.lat) &&
            Number.isFinite(parsed?.lng) &&
            Number.isFinite(parsed?.zoom)
          ) {
            initialView = parsed;
          }
        }
      } catch (_) {}

      const map = L.map(mapRef.current!, {
        center: [initialView.lat, initialView.lng], zoom: initialView.zoom, zoomControl: false,
        minZoom: 2, maxZoom: 22, worldCopyJump: false,
        maxBounds: [[-90, -180], [90, 180]], maxBoundsViscosity: 1.0,
        doubleClickZoom: false,   // ← وقف dblclick zoom
      });
      mapInstanceRef.current = map;
      mapObjRef.current      = map;

      // بعد أي تحريك/زوم بنحفظ آخر مكان عشان لو عمل ريفريش يرجعله تاني
      map.on("moveend zoomend", () => {
        try {
          const c = map.getCenter();
          localStorage.setItem(
            LAST_VIEW_STORAGE_KEY,
            JSON.stringify({ lat: c.lat, lng: c.lng, zoom: map.getZoom() })
          );
        } catch (_) {}
      });

      // ── Zoom guard: لو التايلز فشلت تحمّل (404 / no data) عند زوم معين،
      // رجّع زوم واحد لورا أوتوماتيك بدل ما تفضل الصورة "not available" ──
      lastStableZoomRef.current = map.getZoom();

      const attachTileErrorGuard = (layer: any) => {
        layer.on("tileerror", () => {
          tileErrorAtCurrentZoomRef.current = true;
        });
        layer.on("tileload", () => {
          // على الأقل تايل واحد نجح في التحميل عند الزوم ده
        });
      };

      map.on("zoomstart", () => {
        tileErrorAtCurrentZoomRef.current = false;
        if (zoomRevertTimeoutRef.current) clearTimeout(zoomRevertTimeoutRef.current);
      });

      map.on("zoomend", () => {
        if (zoomRevertTimeoutRef.current) clearTimeout(zoomRevertTimeoutRef.current);
        // استنى شوية عشان التايلز تاخد فرصتها تحاول تحمل
        zoomRevertTimeoutRef.current = setTimeout(() => {
          const cz = map.getZoom();
          if (tileErrorAtCurrentZoomRef.current) {
            // فيه تايلز فشلت — ارجع لآخر زوم كان شغال بيه
            const target = Math.min(lastStableZoomRef.current, cz - 1);
            if (target >= map.getMinZoom() && target < cz) {
              map.setZoom(target);
              toast.error(
                isRTL
                  ? "وصلت لأقصى دقة متاحة في المكان ده"
                  : "Max available resolution reached for this area"
              );
            }
          } else {
            lastStableZoomRef.current = cz;
          }
        }, 450);
      });
// ── Scale Bar ─────────────────────────────────────────────────
L.control.scale({
  position: "bottomleft",
  metric: true,
  imperial: false,
  maxWidth: 150,
  updateWhenIdle: false,
}).addTo(map);

      map.createPane("satellitePane"); map.getPane("satellitePane")!.style.zIndex = "201";
      map.createPane("labelsPane");
      Object.assign(map.getPane("labelsPane")!.style, { zIndex: "203", pointerEvents: "none" });
      map.createPane("imagePane");
      Object.assign(map.getPane("imagePane")!.style, { zIndex: "350" });
      imagePaneReadyRef.current = true;

      // ── 🆕 RESTORE AOI AFTER REFRESH ─────────────────────────
if (!restoredRef.current) {
  const saved = JSON.parse(localStorage.getItem("aoi_polygons") || "[]");

  saved.forEach((item: any) => {
    const c = TOOL_COLORS.polygon;

    const poly = L.polygon(item.coords, {
      color: c.stroke,
      weight: 2,
      fillColor: c.fill,
      fillOpacity: 0,
    }).addTo(map);

    drawLayersRef.current.push(poly);

    poly.bindPopup(() => {
      const div = document.createElement("div");
      div.innerHTML = `🔵 ${isRTL ? "منطقة محفوظة" : "Saved AOI"}`;
      div.appendChild(buildShapePopupActions(poly, "polygon"));
      return div;
    });
  });

  restoredRef.current = true;
}

      // ① Esri WorldImagery — مباشر بدون proxy (Esri بيبعت CORS headers أصلًا،
      // فمفيش داعي إننا نمرر كل تايل عبر السيرفر بتاعنا ونستهلك Fast Origin Transfer)
      baseTileRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles © Esri",
        maxZoom: 22,
        maxNativeZoom: 23,
        pane: "satellitePane", crossOrigin: "anonymous",
      }).addTo(map);
      attachTileErrorGuard(baseTileRef.current);

      labelsLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
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
          // نغيّر width/height بس لو فعلاً اتغيّر الحجم — إعادة تخصيص الـ pixel
          // buffer وهو بنفس القيمة بتعمل clear + realloc كامل من غير داعي
          if (this._canvas.width !== size.x || this._canvas.height !== size.y) {
            this._canvas.width = size.x; this._canvas.height = size.y;
          }
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
          if (this._canvas.width !== size.x || this._canvas.height !== size.y) {
            this._canvas.width = size.x; this._canvas.height = size.y;
          }
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
      const coordPanel = document.createElement("div");

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
        if (baseTileRef.current) map.removeLayer(baseTileRef.current);
        if (!def?.url) return;
        baseTileRef.current = L.tileLayer(def.url, {
          attribution:   def.attribution,
          maxZoom:       def.maxZoom,
          maxNativeZoom: def.maxNativeZoom,
          tileSize:      256,
          pane:          "satellitePane",
          crossOrigin:   "anonymous",
        }).addTo(map);
        attachTileErrorGuard(baseTileRef.current);
        // إعادة ضبط حالة الزوم عند تبديل المصدر (كل مصدر له تغطية مختلفة)
        tileErrorAtCurrentZoomRef.current = false;
        lastStableZoomRef.current = map.getZoom();
      });

      onOpacityChangeRegister?.((o: number) => {
        if (labelsLayerRef.current) labelsLayerRef.current.setOpacity(o * 0.8 + 0.1);
      });

      // ── Scale-bar zoom cap (يوقف لما شريط المقياس يوصل ~30 م) ──────────────
      // بعد الحد ده الـ API بيرجع بيانات غلط/متكررة، فبنوقف الزوم عند أقرب
      // مستوى بيخلي شريط المقياس (اللي maxWidth بتاعه 150px هنا) يقرا ~30 متر
      // ونطلع تنبيه، بدل ما نسيب اليوزر يكمّل زوم ويجيبله نتيجة غلط من الـ API.
      // ملحوظة: ده مختلف عن "30 متر لكل بيكسل" اللي كانت بتوقف الزوم بدري
      // جدًا (حوالي zoom 12 = شريط مقياس بيقرا كيلومترات) — المطلوب أعمق بكتير.
      const TARGET_SCALE_LABEL_M = 30; // القراءة المطلوبة على شريط المقياس بالمتر
      const SCALE_BAR_MAX_WIDTH_PX = 150; // لازم يطابق maxWidth بتاع L.control.scale فوق
      const resolutionCapNotifiedRef = { current: false };

      const computeMaxZoomForResolution = (lat: number, targetScaleLabelM: number) => {
        const targetMpp = targetScaleLabelM / SCALE_BAR_MAX_WIDTH_PX;
        const raw =
          Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / targetMpp);
        return Math.min(map.options.maxZoom ?? 22, Math.max(map.getMinZoom(), Math.round(raw)));
      };

      const notifyResolutionCap = () => {
        if (resolutionCapNotifiedRef.current) return;
        resolutionCapNotifiedRef.current = true;
        toast.error(
          isRTL
            ? `وصلت لأقصى زوم (دقة ${TARGET_SCALE_LABEL_M} متر) في المكان ده`
            : `Reached max zoom (${TARGET_SCALE_LABEL_M} m resolution) for this area`
        );
      };

      const applyResolutionCap = () => {
        const lat = map.getCenter().lat;
        const capZoom = computeMaxZoomForResolution(lat, TARGET_SCALE_LABEL_M);
        map.setMaxZoom(capZoom);
        resolutionCapNotifiedRef.current = false; // إعادة تعيين لما اليوزر يتحرك لمكان/دقة جديدة
      };

      applyResolutionCap();
      map.on("moveend", applyResolutionCap);
      map.on("zoomend", () => {
        if (map.getZoom() >= map.getMaxZoom()) notifyResolutionCap();
      });

      document.getElementById("map-zoom-in")?.addEventListener("click",  () => {
        if (map.getZoom() >= map.getMaxZoom()) { notifyResolutionCap(); return; }
        map.zoomIn();
      });
      document.getElementById("map-zoom-out")?.addEventListener("click", () => map.zoomOut());

      flyToRef.current = (lat, lng) => {
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) return;

  map.flyTo([safeLat, safeLng], 13, { duration: 1.6 });
  setTimeout(() => {
    const searchMarker = L.circleMarker([safeLat, safeLng], {
      radius: 9, color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.7, weight: 2,
    })
      .addTo(map)
      .bindPopup(`<b>📍 Location</b><br/>${safeLat.toFixed(5)}°N, ${safeLng.toFixed(5)}°E`)
      .openPopup();
    // ✅ سجّليه هنا عشان زرار الـ Clear/Delete يقدر يمسحه زي أي شكل تاني
    drawLayersRef.current.push(searchMarker);
  }, 1700);
};

      clearRef.current = () => {
        drawLayersRef.current.forEach((l) => map.removeLayer(l));
        drawLayersRef.current = []; draftLayersRef.current = []; drawPointsRef.current = [];
        lastCoordsRef.current = []; lastToolRef.current = "pointer";
        if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
        if (canvasRef.current) clearCanvas(canvasRef.current);
        if (closeBtnRef.current) closeBtnRef.current.style.display = "none";

        // clear image overlays
        imageOverlaysRef.current.forEach((ov) => {
          try { map.removeLayer(ov.layer); } catch (_) {}
        });
        imageOverlaysRef.current = [];
        // امسح كل الـ raster analysis overlays
        rasterOverlayRef.current.forEach((layer) => {
          try { map.removeLayer(layer); } catch (_) {}
        });
        rasterOverlayRef.current.clear();
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
        // ── Threshold: نتجاهل الكليكات اللي قريبة جداً (مكان) أو سريعة جداً (وقت) من آخر كليك ──
        // ده بيمنع طلبات NDVI/Weather المتكررة لو المستخدم بس بيتصفح الخريطة بكليكات متقاربة
        if (tool === "pointer") {
          const MIN_DISTANCE_M = 15;   // أقل مسافة (متر) عشان نعتبره كليك جديد فعلاً
          const MIN_INTERVAL_MS = 250; // أقل فاصل زمني بين كليكين متتاليين
          const now = Date.now();
          const last = lastVirtualClickRef.current;
          const isTooClose =
            !!last &&
            now - last.time < MIN_INTERVAL_MS &&
            map.distance([lat, lng], [last.lat, last.lng]) < MIN_DISTANCE_M;

          if (!isTooClose) {
            lastVirtualClickRef.current = { lat, lng, time: now };
            onFeatureClick?.({
              type: "Feature",
              geometry: { type: "Point", coordinates: [lng, lat] },
              properties: { _virtual: true }
            });
          }
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
          mk.bindPopup(() => {
            const div = document.createElement("div");
            div.innerHTML = `📍 ${lat.toFixed(6)}°N<br/>${lng.toFixed(6)}°E`;
            div.appendChild(buildShapePopupActions(mk, "marker"));
            return div;
          }).openPopup();
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
            toast(isRTL ? "اضغط Esc لإلغاء الرسم الحالي" : "Press Esc to cancel the current drawing", {
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
          const marker = L.circleMarker([lat, lng], {
              radius: pts.length === 1 ? 6 : 4,
              color: c.stroke,
              fillColor: pts.length === 1 ? c.stroke : "#fff",
              fillOpacity: 1, weight: 2,
            }).addTo(map);
          drawLayersRef.current.push(marker);
          draftLayersRef.current.push(marker);
          if (pts.length >= 3 && closeBtnRef.current) closeBtnRef.current.style.display = "block";
          return;
        }

        // ── Measure ──────────────────────────────────────────────────────────
        if (tool === "measure") {
          const pts = drawPointsRef.current;
          if (pts.length === 0) {
            toast(isRTL ? "اضغط Esc لإلغاء القياس الحالي" : "Press Esc to cancel the current measurement", {
              icon: "📏",
              duration: 5000,
            });
          }
          pts.push([lat, lng]);
          const marker = L.circleMarker([lat, lng], { radius: 4, color: TOOL_COLORS.measure.stroke, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map);
          drawLayersRef.current.push(marker);
          draftLayersRef.current.push(marker);
          if (pts.length >= 2 && closeBtnRef.current) closeBtnRef.current.style.display = "block";
          return;
        }

        // ── Rectangle ────────────────────────────────────────────────────────
        if (tool === "rectangle") {
          const c = TOOL_COLORS.rectangle;
          if (!drawPointsRef.current.length) {
            toast(isRTL ? "اضغط Esc لإلغاء الرسم الحالي" : "Press Esc to cancel the current drawing", {
              icon: "⌨️",
              duration: 5000,
            });
            drawPointsRef.current.push([lat, lng]);
            const marker = L.circleMarker([lat, lng], { radius: 4, color: c.stroke, fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map);
            drawLayersRef.current.push(marker);
            draftLayersRef.current.push(marker);
          } else {
            const p1   = drawPointsRef.current[0];
            const rect = L.rectangle([p1, [lat, lng]], { color: c.stroke, weight: 2, fillColor: c.fill, fillOpacity: 0 }).addTo(map);
const rectCoords = [
  [p1[1], p1[0]],
  [lng, p1[0]],
  [lng, lat],
  [p1[1], lat],
  [p1[1], p1[0]],
];

const polygon = turf.polygon([rectCoords]);

const area = parseFloat(
  (turf.area(polygon) / 10000).toFixed(1)
);
console.log("Area ha:", area);
console.log("Area m²:", turf.area(polygon));



            // ── Popup with "Edit" + "Delete" buttons ─────────────────────────
            rect.bindPopup(() => {
              const div = document.createElement("div");
              const label = document.createElement("div");
              label.innerHTML = `📐 ${t.rectangle} · ≈ ${area} ${t.ha}`;
              div.appendChild(label);
              div.appendChild(buildShapePopupActions(rect, "rectangle"));
              return div;
            }).openPopup();

            drawLayersRef.current.push(rect);
            const coordinates: LatLngPoint[] = [{ lat: p1[0], lng: p1[1] }, { lat, lng: p1[1] }, { lat, lng }, { lat: p1[0], lng }];
            const feature = makePolygonFeature("Drawn Rectangle", coordinates.map((point) => [point.lat, point.lng]), area);
            onAreaSelected("Drawn Rectangle", area, feature);
            onFeatureClick?.(feature);
            if (canvasRef.current) {
              const px1 = map.latLngToContainerPoint(L.latLng(p1[0], p1[1]));
              const px2 = map.latLngToContainerPoint(L.latLng(lat, lng));
              drawRect(canvasRef.current, px1, px2);
              lastCoordsRef.current = [{ lat: p1[0], lng: p1[1] }, { lat, lng }];
              lastToolRef.current   = "rectangle";
              const metadata: CaptureMetadata = { areaName: "Drawn Rectangle", areaSizeHa: area, zoom: map.getZoom(), capturedAt: new Date().toISOString() };
              await handleCapture(canvasRef.current, map, L, coordinates, metadata);
            }
            draftLayersRef.current = [];
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
          return;
        }

        // ── Circle ───────────────────────────────────────────────────────────
        if (tool === "circle") {
          const c = TOOL_COLORS.circle;
          if (!drawPointsRef.current.length) {
            toast(isRTL ? "اضغط Esc لإلغاء الرسم الحالي" : "Press Esc to cancel the current drawing", {
              icon: "⌨️",
              duration: 5000,
            });
            drawPointsRef.current.push([lat, lng]);
          } else {
            const center = drawPointsRef.current[0];
            const radius = map.distance(center, [lat, lng]);
            const circ   = L.circle(center, { radius, color: c.stroke, weight: 2, fillColor: c.fill, fillOpacity: 0 }).addTo(map);
            const area   = parseFloat((Math.PI * Math.pow(radius / 1000, 2) * 100).toFixed(1));
            circ.bindPopup(() => {
              const div = document.createElement("div");
              const label = document.createElement("div");
              label.innerHTML = `🟢 ${t.circle} · R: ${radius.toFixed(0)} m · ≈ ${area} ${t.ha}`;
              div.appendChild(label);
              div.appendChild(buildShapePopupActions(circ, "circle"));
              return div;
            }).openPopup();
            drawLayersRef.current.push(circ);
            
            // التعديل الجديد باستخدام الدالة الحقيقية بدل المربع
            const circleRing = circleToPolygonLatLng(center[0], center[1], radius, 64);
            const feature = makePolygonFeature("Drawn Circle", circleRing, area);
            
            onAreaSelected("Drawn Circle", area, feature);
            onFeatureClick?.(feature);
            
            if (canvasRef.current) {
              const cPx = map.latLngToContainerPoint(L.latLng(center[0], center[1]));
              const ePx = map.latLngToContainerPoint(L.latLng(lat, lng));
              const rPx = Math.sqrt((ePx.x - cPx.x) ** 2 + (ePx.y - cPx.y) ** 2);
              drawCircle(canvasRef.current, cPx, rPx);
              const centerCoord: LatLngPoint = { lat: center[0], lng: center[1] };
              lastCoordsRef.current = [centerCoord, { lat, lng }];
              lastToolRef.current   = "circle";
              const metadata: CaptureMetadata = { areaName: "Drawn Circle", areaSizeHa: area, zoom: map.getZoom(), capturedAt: new Date().toISOString() };
            const captureResult = await captureCircle(canvasRef.current, map, L, centerCoord, radius, metadata, captureTarget);
              const { smallBlob, largeBlob, selectedCoordinates, viewportCoordinates, selectedBounds, viewportBounds } = captureResult;
              onCapture?.(captureResult);
              // نفس التعديل: مبنرفعش largeBlob للباك إلا لو captureTarget فعلاً "large"
              const res = await sendToBackend(
                smallBlob,
                captureTarget === "large" ? largeBlob : undefined,
                selectedCoordinates,
                metadata,
                { viewportCoordinates, selectedBounds, viewportBounds },
                captureTarget
              );
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
            tempLayerRef.current = L.rectangle([pts[0], cur], { color: cp.rectangle.stroke, weight: 1.5, dashArray: "4 4", fillColor: cp.rectangle.fill, fillOpacity: 0 }).addTo(map);
          if (tool === "circle") {
            const r = map.distance(pts[0], cur);
            tempLayerRef.current = L.circle(pts[0], { radius: r, color: cp.circle.stroke, weight: 1.5, dashArray: "4 4", fillColor: cp.circle.fill, fillOpacity: 0 }).addTo(map);
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
      if (swipeOverlayRef.current) {
        swipeOverlayRef.current.cleanup();
        swipeOverlayRef.current = null;
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
.leaflet-control-scale-line{background:rgba(4,13,26,.85)!important;border:1px solid rgba(0,200,255,.4)!important;border-top:2px solid rgba(0,200,255,.8)!important;color:#e2e8f0!important;font-size:10px!important;font-weight:600!important;letter-spacing:.05em!important;padding:2px 6px!important;border-radius:0 0 4px 4px!important;backdrop-filter:blur(4px)!important;box-shadow:0 2px 8px rgba(0,0,0,.5)!important;white-space:nowrap!important}
.leaflet-control-scale{margin-bottom:8px!important;margin-left:12px!important}
        .leaflet-container{background:#040d1a!important}
        .leaflet-container::before{content:'';position:absolute;inset:0;background-image:radial-gradient(1px 1px at 10% 20%,rgba(255,255,255,.6) 0%,transparent 100%),radial-gradient(1px 1px at 30% 60%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 50% 10%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 70% 80%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 85% 35%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 20% 85%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 60% 45%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 90% 65%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 40% 30%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 75% 15%,rgba(255,255,255,.6) 0%,transparent 100%);pointer-events:none;z-index:-1}
        .ndvi-tooltip{background:#0a1628!important;border:1px solid rgba(0,212,255,.3)!important;color:#e2e8f0!important;font-size:.72rem!important;border-radius:6px!important}
        .ndvi-tooltip::before{border-top-color:rgba(0,212,255,.3)!important}
        .leaflet-popup-content-wrapper{background:#0a1628!important;border:1px solid rgba(255,255,255,.1)!important;color:#e2e8f0!important;border-radius:10px!important;box-shadow:0 8px 32px rgba(0,0,0,.6)!important;font-size:.82rem!important}
        .leaflet-popup-tip{background:#0a1628!important}
        .leaflet-popup-close-button{color:#64748b!important}
        .leaflet-control-attribution{background:rgba(4,13,26,.8)!important;color:#475569!important;font-size:.55rem!important}
        .aoi-vertex-handle{cursor:grab!important}
        .change-detection-raster-overlay{image-rendering:pixelated;image-rendering:crisp-edges;image-rendering:-moz-crisp-edges}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .animate-fadeUp{animation:fadeUp .25s ease both}
      `}</style>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }} />
    </>
  );
}