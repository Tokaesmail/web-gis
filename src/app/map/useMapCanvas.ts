"use client";

// ─── useMapCanvas.ts ───────────────────────────────────────────────────────────
// نفس الـ hook بس دلوقتي الـ capture بيرسم التايلز الحقيقية
// لأن التايلز بتيجي من /api/tile (proxy) مش من Esri مباشرة → مفيش CORS

import { useCallback } from "react";
import { useMapDB }    from "./useMapDB";
import { LatLngPoint, CaptureMetadata } from "./mapTypes_proxy";

export function useMapCanvas() {
  const { saveCapture, blobToUrl } = useMapDB();

  // ── Draw functions ────────────────────────────────────────────────────────

  const drawPolygon = useCallback((canvas: HTMLCanvasElement, px: { x: number; y: number }[]) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || px.length < 3) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(px[0].x, px[0].y);
    px.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.clip();
    ctx.fillStyle = "rgba(0,200,255,0.2)"; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(px[0].x, px[0].y);
    px.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath(); ctx.strokeStyle = "#00c8ff"; ctx.lineWidth = 2; ctx.stroke();
  }, []);

  const drawRect = useCallback((canvas: HTMLCanvasElement, p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const x = Math.min(p1.x, p2.x), y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x), h = Math.abs(p2.y - p1.y);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.fillStyle = "rgba(167,139,250,0.2)"; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.rect(x, y, w, h);
    ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 2; ctx.stroke();
  }, []);

  const drawCircle = useCallback((canvas: HTMLCanvasElement, center: { x: number; y: number }, radiusPx: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.beginPath(); ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "rgba(52,211,153,0.2)"; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.strokeStyle = "#34d399"; ctx.lineWidth = 2; ctx.stroke();
  }, []);

  const drawMeasure = useCallback((canvas: HTMLCanvasElement, px: { x: number; y: number }[]) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || px.length < 2) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath(); ctx.moveTo(px[0].x, px[0].y);
    px.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 3]); ctx.stroke(); ctx.setLineDash([]);
    px.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fillStyle = "#fbbf24"; ctx.fill(); });
  }, []);

  const drawMarker = useCallback((canvas: HTMLCanvasElement, p: { x: number; y: number }) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(249,115,22,0.85)"; ctx.strokeStyle = "#f97316"; ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
  }, []);

  const clearCanvas = useCallback((canvas: HTMLCanvasElement) => {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ── Capture مع التايلز الحقيقية ───────────────────────────────────────────
  // دلوقتي التايلز بتيجي من /api/tile (proxy) → مفيش CORS → toBlob شغال ✅
  const capture = useCallback(async (
    overlayCanvas: HTMLCanvasElement,
    mapInstance:   any,
    L:             any,
    coordinates:   LatLngPoint[],
    metadata:      CaptureMetadata
  ): Promise<{ id: number; url: string; blob: Blob }> => {

    const size     = mapInstance.getSize();
    const combined = document.createElement("canvas");
    combined.width = size.x; combined.height = size.y;
    const ctx = combined.getContext("2d")!;

    // ① ارسم التايلز (دلوقتي من proxy → مفيش CORS)
    const tileEls = Array.from(
      mapInstance.getContainer().querySelectorAll(".leaflet-tile") as NodeListOf<HTMLImageElement>
    );
    await Promise.all(tileEls.map((tile) =>
      new Promise<void>((res) => {
        const m = tile.style.transform.match(/translate3d\((.+?)px,\s*(.+?)px/);
        if (m && tile.complete && tile.naturalWidth > 0) {
          try {
            ctx.drawImage(tile as CanvasImageSource, parseFloat(m[1]), parseFloat(m[2]));
          } catch (e) {
            // لو في tile فضل مش crossOrigin نتجاهله
            console.warn("Tile draw skipped:", e);
          }
        }
        res();
      })
    ));

    // ② ارسم الـ overlay (البولجون/الشكل) فوق التايلز
    ctx.drawImage(overlayCanvas, 0, 0);

    // ③ Crop على شكل الـ bounding box للإحداثيات
    const px   = coordinates.map((p) => mapInstance.latLngToContainerPoint(L.latLng(p.lat, p.lng)));
    const xs   = px.map((p: any) => p.x);
    const ys   = px.map((p: any) => p.y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const w    = Math.max(1, Math.min(size.x, Math.ceil(Math.max(...xs))) - minX);
    const h    = Math.max(1, Math.min(size.y, Math.ceil(Math.max(...ys))) - minY);

    const cropped = document.createElement("canvas");
    cropped.width = w; cropped.height = h;
    const cCtx = cropped.getContext("2d")!;

    // Clip على شكل البولجون بالظبط
    cCtx.beginPath();
    px.forEach(({ x, y }: any, i: number) =>
      i === 0 ? cCtx.moveTo(x - minX, y - minY) : cCtx.lineTo(x - minX, y - minY)
    );
    cCtx.closePath();
    cCtx.clip();
    cCtx.drawImage(combined, -minX, -minY);   // ← الماب كامل جوا الشكل

    const blob: Blob = await new Promise((res, rej) =>
      cropped.toBlob((b) => b ? res(b) : rej(new Error("toBlob failed")), "image/png")
    );

    const id  = await saveCapture(blob, coordinates, metadata);
    const url = blobToUrl(blob);
    return { id, url, blob };
  }, [saveCapture, blobToUrl]);

  // ── captureCircle ─────────────────────────────────────────────────────────
  const captureCircle = useCallback(async (
    overlayCanvas: HTMLCanvasElement,
    mapInstance:   any,
    L:             any,
    center:        LatLngPoint,
    radiusMeters:  number,
    metadata:      CaptureMetadata
  ) => {
    const points: LatLngPoint[] = Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      return {
        lat: center.lat + (radiusMeters / 111320) * Math.sin(angle),
        lng: center.lng + (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.cos(angle),
      };
    });
    return capture(overlayCanvas, mapInstance, L, points, metadata);
  }, [capture]);

  // ── Send to Backend ───────────────────────────────────────────────────────
  const sendToBackend = useCallback(async (
    blob:        Blob,
    coordinates: LatLngPoint[],
    metadata:    CaptureMetadata,
    endpoint     = "/api/map-capture"
  ): Promise<Response> => {
    const form = new FormData();
    form.append("image",       blob,                      "capture.png");
    form.append("coordinates", JSON.stringify(coordinates));
    form.append("metadata",    JSON.stringify(metadata));
    return fetch(endpoint, { method: "POST", body: form });
  }, []);

  return {
    drawPolygon, drawRect, drawCircle, drawMeasure, drawMarker,
    clearCanvas, capture, captureCircle, sendToBackend,
  };
}