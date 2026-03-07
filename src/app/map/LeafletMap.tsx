"use client";

// ─── LeafletMap.tsx ───────────────────────────────────────────────────────────
// التعديلات:
// ① OSM تايلز بدل Esri (مفيهاش مشكلة zoom)
// ② Polygon بكليك واحد للإنهاء — زر "Close Shape" أو كليك على النقطة الأولى
// ③ Double-click zoom متوقف تماماً
// ④ الألوان للعرض بس — مش بتتبعت للباك

import { useEffect, useRef } from "react";
import { useMapCanvas }      from "./useMapCanvas";
import {
  DrawTool, SAT_LAYERS, INDEX_TILES,
  SatKey, IdxKey, LatLngPoint, CaptureMetadata,
} from "./mapTypes_proxy";

interface Props {
  activeTool:     DrawTool;
  onAreaSelected: (name: string, area: number) => void;
  onCoordsUpdate: (lat: number, lng: number) => void;
  flyToRef:       React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  clearRef:       React.MutableRefObject<(() => void) | null>;
  onSatChange:    (handler: (sat: SatKey) => void) => void;
  onIdxChange:    (handler: (idx: IdxKey) => void) => void;
  onCapture?:     (url: string) => void;
}

// ── ألوان كل أداة — للعرض فقط، مش بتتبعت للباك ──────────────────────────────
const TOOL_COLORS = {
  polygon:   { stroke: "#00c8ff", fill: "rgba(0,200,255,0.18)" },
  rectangle: { stroke: "#a78bfa", fill: "rgba(167,139,250,0.18)" },
  circle:    { stroke: "#34d399", fill: "rgba(52,211,153,0.18)" },
  measure:   { stroke: "#fbbf24", fill: "rgba(251,191,36,0.1)" },
  marker:    { stroke: "#f97316", fill: "rgba(249,115,22,0.85)" },
};

export default function LeafletMap({
  activeTool, onAreaSelected, onCoordsUpdate,
  flyToRef, clearRef, onSatChange, onIdxChange, onCapture,
}: Props) {

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
  const lastCoordsRef  = useRef<LatLngPoint[]>([]);
  const lastToolRef    = useRef<DrawTool>("pointer");
  const closeBtnRef    = useRef<HTMLButtonElement | null>(null);
  // نحتاج refs للـ map و L عشان نستخدمهم في finishPolygon من الـ button
  const mapObjRef      = useRef<any>(null);
  const LRef           = useRef<any>(null);

  const {
    drawPolygon, drawRect, drawCircle, drawMeasure, drawMarker,
    clearCanvas, capture, captureCircle, sendToBackend,
  } = useMapCanvas();

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

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
      const { id, url, blob } = await capture(canvas, map, L, coordinates, metadata);
      console.log("✅ IndexedDB id:", id);
      onCapture?.(url);
      // بنبعت coordinates و metadata للباك — مفيش ألوان
      const res = await sendToBackend(blob, coordinates, metadata);
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
    poly.bindPopup(`🔵 Polygon · ≈ ${area} ha`).openPopup();
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
    line.bindPopup(`📏 ${(dist / 1000).toFixed(3)} km`).openPopup();

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
        center: [20, 10], zoom: 3, zoomControl: false,
        minZoom: 2, maxZoom: 20, worldCopyJump: false,
        maxBounds: [[-90, -180], [90, 180]], maxBoundsViscosity: 1.0,
        doubleClickZoom: false,   // ← وقف dblclick zoom
      });
      mapInstanceRef.current = map;
      mapObjRef.current      = map;

      map.createPane("satellitePane"); map.getPane("satellitePane")!.style.zIndex = "200";
      map.createPane("indexPane");     map.getPane("indexPane")!.style.zIndex     = "250";
      map.createPane("labelsPane");
      Object.assign(map.getPane("labelsPane")!.style, { zIndex: "450", pointerEvents: "none" });

      // ① Esri WorldImagery — maxNativeZoom:19 عشان لو زاد الزوم يعمل stretch بدل "not available"
      baseTileRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles © Esri",
        maxZoom: 22,          // اليوزر يقدر يزوم لـ 22
        maxNativeZoom: 19,    // التايل بتيتجيب لحد 19 بس، وبعدها بتتـstretch تلقائياً
        pane: "satellitePane", crossOrigin: true,
      }).addTo(map);

      labelsLayerRef.current = L.tileLayer(
        "/api/tile/{z}/{x}/{y}?source=labels",
        { attribution: "", maxZoom: 20, opacity: 0.7, pane: "labelsPane", crossOrigin: true }
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

      // ── Sat / Index ───────────────────────────────────────────────────────
      onSatChange((satKey: SatKey) => {
        const def = SAT_LAYERS[satKey];
        if (baseTileRef.current)  map.removeLayer(baseTileRef.current);
        if (indexTileRef.current) { map.removeLayer(indexTileRef.current); indexTileRef.current = null; }

        if (satKey === "Default") {
          baseTileRef.current = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            attribution: "Tiles © Esri",
            maxZoom: 22, maxNativeZoom: 19,
            pane: "satellitePane", crossOrigin: true,
          }).addTo(map);
          return;
        }
        baseTileRef.current = (def.type === "wms"
          ? (L.tileLayer as any).wms(def.url, { layers: def.layers, format: "image/jpeg", transparent: false, version: "1.1.1", attribution: def.attribution, maxZoom: def.maxZoom, pane: "satellitePane", crossOrigin: true })
          : L.tileLayer(def.url, { attribution: def.attribution, maxZoom: def.maxZoom, tileSize: 256, pane: "satellitePane", crossOrigin: true })
        ).addTo(map);
      });

      onIdxChange((idxKey: IdxKey) => {
        if (indexTileRef.current) { map.removeLayer(indexTileRef.current); indexTileRef.current = null; }
        if (idxKey === "RGB") return;
        const tile = INDEX_TILES[idxKey];
        if (!tile.url) return;
        indexTileRef.current = L.tileLayer(tile.url, {
          attribution: `${idxKey}`, maxZoom: tile.maxZoom, tileSize: 256, opacity: tile.opacity, pane: "indexPane", crossOrigin: true,
        }).addTo(map);
      });

      document.getElementById("map-zoom-in")?.addEventListener("click",  () => map.zoomIn());
      document.getElementById("map-zoom-out")?.addEventListener("click", () => map.zoomOut());

      flyToRef.current = (lat, lng) => {
        map.flyTo([lat, lng], 13, { duration: 1.6 });
        setTimeout(() => L.circleMarker([lat, lng], { radius: 9, color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.7, weight: 2 })
          .addTo(map).bindPopup(`<b>📍 Location</b><br/>${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`).openPopup(), 1700);
      };

      clearRef.current = () => {
        drawLayersRef.current.forEach((l) => map.removeLayer(l));
        drawLayersRef.current = []; drawPointsRef.current = [];
        lastCoordsRef.current = []; lastToolRef.current = "pointer";
        if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
        if (canvasRef.current) clearCanvas(canvasRef.current);
        if (closeBtnRef.current) closeBtnRef.current.style.display = "none";
      };

      // ── Click ─────────────────────────────────────────────────────────────
      map.on("click", async (e: any) => {
        const tool = activeToolRef.current;
        const { lat, lng } = e.latlng;
        onCoordsUpdate(lat, lng);
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
            rect.bindPopup(`📐 Rectangle · ≈ ${area} ha`).openPopup();
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
            circ.bindPopup(`🟢 Circle · R: ${radius.toFixed(0)} m · ≈ ${area} ha`).openPopup();
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
              const { id, url, blob } = await captureCircle(canvasRef.current, map, L, centerCoord, radius, metadata);
              console.log("✅ IndexedDB id:", id);
              onCapture?.(url);
              const res = await sendToBackend(blob, [centerCoord, { lat, lng }], metadata);
              if (res.ok) console.log("✅ Backend:", await res.json());
            }
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
        }
      });

      // ── dblclick: يقفل البولجون / measure بدون zoom ───────────────────────
      map.on("dblclick", (e: any) => {
        const tool = activeToolRef.current;
        if (tool === "polygon" && drawPointsRef.current.length >= 3) finishPolygon(map, L);
        else if (tool === "measure" && drawPointsRef.current.length >= 2) finishMeasure(map, L);
        // doubleClickZoom: false → مش بيزوم في أي حالة
      });

      // ── Mousemove ─────────────────────────────────────────────────────────
      map.on("mousemove", (e: any) => {
        const tool = activeToolRef.current, pts = drawPointsRef.current;
        if (tool === "pointer" || !pts.length) return;
        if (tempLayerRef.current) map.removeLayer(tempLayerRef.current);
        const cur: [number, number] = [e.latlng.lat, e.latlng.lng];
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

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
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
        .leaflet-container{background:radial-gradient(ellipse at center,#0a1628 0%,#040d1a 60%,#000 100%)!important}
        .leaflet-container::before{content:'';position:absolute;inset:0;background-image:radial-gradient(1px 1px at 10% 20%,rgba(255,255,255,.6) 0%,transparent 100%),radial-gradient(1px 1px at 30% 60%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 50% 10%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 70% 80%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 85% 35%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 20% 85%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 60% 45%,rgba(255,255,255,.3) 0%,transparent 100%),radial-gradient(1px 1px at 90% 65%,rgba(255,255,255,.5) 0%,transparent 100%),radial-gradient(1px 1px at 40% 30%,rgba(255,255,255,.4) 0%,transparent 100%),radial-gradient(1px 1px at 75% 15%,rgba(255,255,255,.6) 0%,transparent 100%);pointer-events:none;z-index:0}
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