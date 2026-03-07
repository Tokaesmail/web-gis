"use client";

// ─── LeafletMap.tsx ───────────────────────────────────────────────────────────

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
  const lastToolRef    = useRef<DrawTool>("pointer");  // لإعادة الرسم بعد zoom/pan

  const {
    drawPolygon, drawRect, drawCircle, drawMeasure, drawMarker,
    clearCanvas, capture, captureCircle, sendToBackend,
  } = useMapCanvas();

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  // ── helper: أعد رسم الشكل الحالي بعد zoom/pan ────────────────────────────
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
    if (tool === "marker") {
      clearCanvas(canvas);
      px.forEach((p) => drawMarker(canvas, p));
    }
  };

  // ── helper: capture + backend لكل الأدوات ────────────────────────────────
  const handleCapture = async (
    canvas:      HTMLCanvasElement,
    map:         any,
    L:           any,
    coordinates: LatLngPoint[],
    metadata:    CaptureMetadata
  ) => {
    try {
      const isSinglePoint = coordinates.length === 1;
      const { id, url, blob } = isSinglePoint
        ? await capture(canvas, map, L, coordinates, metadata)   // marker
        : await capture(canvas, map, L, coordinates, metadata);

      console.log("✅ IndexedDB id:", id);
      onCapture?.(url);

      const res = await sendToBackend(blob, coordinates, metadata);
      if (res.ok) console.log("✅ Backend:", await res.json());
    } catch (err) {
      console.error("❌ Capture error:", err);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

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
      });
      mapInstanceRef.current = map;

      map.createPane("satellitePane"); map.getPane("satellitePane")!.style.zIndex = "200";
      map.createPane("indexPane");     map.getPane("indexPane")!.style.zIndex     = "250";
      map.createPane("labelsPane");
      Object.assign(map.getPane("labelsPane")!.style, { zIndex: "450", pointerEvents: "none" });

      baseTileRef.current = L.tileLayer(SAT_LAYERS["Default"].url, {
        attribution: SAT_LAYERS["Default"].attribution,
        maxZoom: SAT_LAYERS["Default"].maxZoom, pane: "satellitePane",
        crossOrigin: true,   // ← مهم عشان Canvas يقدر يرسم التايل بدون CORS
      }).addTo(map);

      labelsLayerRef.current = L.tileLayer(
        "/api/tile/{z}/{x}/{y}?source=labels",   // ← عبر الـ proxy
        { attribution: "", maxZoom: 20, opacity: 0.8, pane: "labelsPane", crossOrigin: true }
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

      // ── Sat / Index ───────────────────────────────────────────────────────
      onSatChange((satKey: SatKey) => {
        const def = SAT_LAYERS[satKey];
        if (baseTileRef.current)  map.removeLayer(baseTileRef.current);
        if (indexTileRef.current) { map.removeLayer(indexTileRef.current); indexTileRef.current = null; }
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
          attribution: `${idxKey} © Esri`, maxZoom: tile.maxZoom, tileSize: 256, opacity: tile.opacity, pane: "indexPane",crossOrigin: true,
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
      };

      // ── Click ─────────────────────────────────────────────────────────────
      map.on("click", async (e: any) => {
        const tool = activeToolRef.current;
        const { lat, lng } = e.latlng;
        onCoordsUpdate(lat, lng);
        if (tool === "pointer") return;

        // ── Marker ──────────────────────────────────────────────────────────
        if (tool === "marker") {
          const mk = L.circleMarker([lat, lng], { radius: 7, color: "#f97316", fillColor: "#f97316", fillOpacity: 0.85, weight: 2 }).addTo(map);
          mk.bindPopup(`📍 ${lat.toFixed(6)}°N<br/>${lng.toFixed(6)}°E`).openPopup();
          drawLayersRef.current.push(mk);

          // Canvas + Capture + absoluteackend
          if (canvasRef.current) {
            const px = map.latLngToContainerPoint(L.latLng(lat, lng));
            drawMarker(canvasRef.current, px);
            lastCoordsRef.current = [...lastCoordsRef.current, { lat, lng }];
            lastToolRef.current   = "marker";
            const metadata: CaptureMetadata = {
              areaName: "Marker", areaSizeHa: 0,
              zoom: map.getZoom(), capturedAt: new Date().toISOString(),
            };
            await handleCapture(canvasRef.current, map, L, [{ lat, lng }], metadata);
          }
          return;
        }

        // ── Polygon / Measure: نقاط متراكمة ──────────────────────────────────
        if (tool === "polygon" || tool === "measure") {
          drawPointsRef.current.push([lat, lng]);
          drawLayersRef.current.push(
            L.circleMarker([lat, lng], { radius: 4, color: "#00d4ff", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map)
          );
        }

        // ── Rectangle ────────────────────────────────────────────────────────
        if (tool === "rectangle") {
          if (!drawPointsRef.current.length) {
            drawPointsRef.current.push([lat, lng]);
            drawLayersRef.current.push(
              L.circleMarker([lat, lng], { radius: 4, color: "#a78absolutefa", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map)
            );
          } else {
            const p1   = drawPointsRef.current[0];
            const rect = L.rectangle([p1, [lat, lng]], { color: "#a78bottomfa", weight: 2, fillColor: "#a78top-10fa", fillOpacity: 0.15 }).addTo(map);
            const area = parseFloat((Math.abs(p1[0] - lat) * Math.abs(p1[1] - lng) * 12345).toFixed(1));
            rect.bindPopup(`📐 Rectangle · ≈ ${area} ha`).openPopup();
            drawLayersRef.current.push(rect);
            onAreaSelected("Drawn Rectangle", area);

            // Canvas + Capture + Backend
            if (canvasRef.current) {
              const px1 = map.latLngToContainerPoint(L.latLng(p1[0],  p1[1]));
              const px2 = map.latLngToContainerPoint(L.latLng(lat, lng));
              drawRect(canvasRef.current, px1, px2);

              const coordinates: LatLngPoint[] = [
                { lat: p1[0], lng: p1[1] }, { lat, lng: p1[1] },
                { lat, lng },               { lat: p1[0], lng },
              ];
              lastCoordsRef.current = [{ lat: p1[0], lng: p1[1] }, { lat, lng }];
              lastToolRef.current   = "rectangle";

              const metadata: CaptureMetadata = {
                areaName: "Drawn Rectangle", areaSizeHa: area,
                zoom: map.getZoom(), capturedAt: new Date().toISOString(),
              };
              await handleCapture(canvasRef.current, map, L, coordinates, metadata);
            }
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
        }

        // ── Circle ───────────────────────────────────────────────────────────
        if (tool === "circle") {
          if (!drawPointsRef.current.length) {
            drawPointsRef.current.push([lat, lng]);
          } else {
            const center = drawPointsRef.current[0];
            const radius = map.distance(center, [lat, lng]);
            const circ   = L.circle(center, { radius, color: "#34d399", weight: 2, fillColor: "#34d399", fillOpacity: 0.15 }).addTo(map);
            const area   = parseFloat((Math.PI * Math.pow(radius / 1000, 2) * 100).toFixed(1));
            circ.bindPopup(`⭕ Circle · R: ${radius.toFixed(0)} m · ≈ ${area} ha`).openPopup();
            drawLayersRef.current.push(circ);
            onAreaSelected("Drawn Circle", area);

            // Canvas + Capture + Backend
            if (canvasRef.current) {
              const cPx   = map.latLngToContainerPoint(L.latLng(center[0], center[1]));
              const ePx   = map.latLngToContainerPoint(L.latLng(lat, lng));
              const rPx   = Math.sqrt((ePx.x - cPx.x) ** 2 + (ePx.y - cPx.y) ** 2);
              drawCircle(canvasRef.current, cPx, rPx);

              const centerCoord: LatLngPoint = { lat: center[0], lng: center[1] };
              lastCoordsRef.current = [centerCoord, { lat, lng }];
              lastToolRef.current   = "circle";

              const metadata: CaptureMetadata = {
                areaName: "Drawn Circle", areaSizeHa: area,
                zoom: map.getZoom(), capturedAt: new Date().toISOString(),
              };
              const { id, url, blob } = await captureCircle(
                canvasRef.current, map, L, centerCoord, radius, metadata
              );
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

      // ── dblclick: إنهاء Polygon / Measure ────────────────────────────────
      map.on("dblclick", async (e: any) => {
        const tool = activeToolRef.current;
        if (tool !== "polygon" && tool !== "measure") return;
        e.originalEvent?.preventDefault();
        const pts = drawPointsRef.current;
        if (pts.length < 2) return;
        if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }

        if (tool === "polygon") {
          const poly = L.polygon(pts, { color: "#00d4ff", weight: 2, fillColor: "#22c55e", fillOpacity: 0.2 }).addTo(map);
          drawLayersRef.current.push(poly);
          const area = parseFloat((Math.abs(pts.reduce((acc: number, p: [number, number], i: number) => {
            const j = (i + 1) % pts.length;
            return acc + p[1] * pts[j][0] - pts[j][1] * p[0];
          }, 0)) / 2 * 12345).toFixed(1));
          poly.bindPopup(`🟢 Polygon · ≈ ${area} ha`).openPopup();
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

        } else {
          // measure
          const line = L.polyline(pts, { color: "#fbbf24", weight: 2.5 }).addTo(map);
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
        }
        drawPointsRef.current = [];
      });

      // ── Mousemove: preview ────────────────────────────────────────────────
      map.on("mousemove", (e: any) => {
        const tool = activeToolRef.current, pts = drawPointsRef.current;
        if (tool === "pointer" || !pts.length) return;
        if (tempLayerRef.current) map.removeLayer(tempLayerRef.current);
        const cur: [number, number] = [e.latlng.lat, e.latlng.lng];
        if (tool === "polygon" || tool === "measure")
          tempLayerRef.current = L.polyline([...pts, cur], { color: "#00d4ff", weight: 1.5, dashArray: "4 4", opacity: 0.7 }).addTo(map);
        if (tool === "rectangle")
          tempLayerRef.current = L.rectangle([pts[0], cur], { color: "#a78bfa", weight: 1.5, dashArray: "4 4", fillOpacity: 0.08 }).addTo(map);
        if (tool === "circle") {
          const r = map.distance(pts[0], cur);
          tempLayerRef.current = L.circle(pts[0], { radius: r, color: "#34d399", weight: 1.5, dashArray: "4 4", fillOpacity: 0.07 }).addTo(map);
        }
      });
    });

    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, []);

  useEffect(() => {
    const c = mapInstanceRef.current?.getContainer();
    if (c) c.style.cursor = activeTool === "pointer" ? "grab" : "crosshair";
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