"use client";


import { useCallback } from "react";
import { useMapDB }    from "./useMapDB";
import { LatLngPoint, CaptureMetadata, CaptureResult, CaptureBounds, CaptureTarget } from "./mapTypes_proxy";

type ContainerPoint = { x: number; y: number };
type MapCaptureLike = {
  getSize: () => { x: number; y: number };
  latLngToContainerPoint: (latLng: unknown) => ContainerPoint;
};
type LeafletCaptureLike = {
  latLng: (lat: number, lng: number) => unknown;
};

export function useMapCanvas() {
  const blobToUrl = (blob: Blob) => URL.createObjectURL(blob);

  // ── Fixed output resolution — same on every device ────────────────────────
  // الهدف: كل device يبعت نفس الـ resolution للـ model بغض النظر عن الـ viewport
  const FIXED_W = 1280;
  const FIXED_H = 720;

  /** بياخد أي canvas ويعمله resize لـ FIXED_W×FIXED_H مع letterbox أسود */
  const resizeToFixed = (src: HTMLCanvasElement): HTMLCanvasElement => {
    const out = document.createElement("canvas");
    out.width  = FIXED_W;
    out.height = FIXED_H;
    const ctx  = out.getContext("2d")!;
    const srcRatio = src.width / src.height;
    const dstRatio = FIXED_W / FIXED_H;
    let drawW = FIXED_W, drawH = FIXED_H, offsetX = 0, offsetY = 0;
    if (srcRatio > dstRatio) {
      drawH   = FIXED_W / srcRatio;
      offsetY = (FIXED_H - drawH) / 2;
    } else {
      drawW   = FIXED_H * srcRatio;
      offsetX = (FIXED_W - drawW) / 2;
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, FIXED_W, FIXED_H);
    ctx.drawImage(src, offsetX, offsetY, drawW, drawH);
    return out;
  };

  // ── Draw functions ────────────────────────────────────────────────────────

  const drawPolygon = useCallback((canvas: HTMLCanvasElement, px: { x: number; y: number }[]) => {
    const ctx = canvas.getContext("2d");
    if (!ctx || px.length < 3) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
    ctx.beginPath(); ctx.rect(x, y, w, h);
    ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 2; ctx.stroke();
  }, []);

  const drawCircle = useCallback((canvas: HTMLCanvasElement, center: { x: number; y: number }, radiusPx: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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

  const getBoundsFromCoordinates = (coordinates: LatLngPoint[]): CaptureBounds => {
    const lats = coordinates.map((p) => p.lat);
    const lngs = coordinates.map((p) => p.lng);
    return {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east:  Math.max(...lngs),
      west:  Math.min(...lngs),
    };
  };

  const getViewportCoordinates = (mapInstance: any): LatLngPoint[] => {
    const bounds = mapInstance.getBounds();
    const north = bounds.getNorth();
    const south = bounds.getSouth();
    const east = bounds.getEast();
    const west = bounds.getWest();
    return [
      { lat: north, lng: west },
      { lat: north, lng: east },
      { lat: south, lng: east },
      { lat: south, lng: west },
    ];
  };

  const cropToCoordinates = (
    source: HTMLCanvasElement,
    mapInstance: MapCaptureLike,
    L: LeafletCaptureLike,
    coordinates: LatLngPoint[],
  ) => {
    const size = mapInstance.getSize();
    const px = coordinates.map((p) => mapInstance.latLngToContainerPoint(L.latLng(p.lat, p.lng)));
    const xs = px.map((p) => p.x);
    const ys = px.map((p) => p.y);
    const minX = Math.max(0, Math.floor(Math.min(...xs)));
    const minY = Math.max(0, Math.floor(Math.min(...ys)));
    const maxX = Math.min(size.x, Math.ceil(Math.max(...xs)));
    const maxY = Math.min(size.y, Math.ceil(Math.max(...ys)));
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);

    const cropped = document.createElement("canvas");
    cropped.width = w;
    cropped.height = h;
    const cCtx = cropped.getContext("2d")!;

    cCtx.beginPath();
    px.forEach(({ x, y }, i) =>
      i === 0 ? cCtx.moveTo(x - minX, y - minY) : cCtx.lineTo(x - minX, y - minY)
    );
    cCtx.closePath();
    cCtx.clip();
    cCtx.drawImage(source, minX, minY, w, h, 0, 0, w, h);
    return cropped;
  };

  // ── Capture مع التايلز الحقيقية ───────────────────────────────────────────
  // دلوقتي التايلز بتيجي من /api/tile (proxy) → مفيش CORS → toBlob شغال ✅
  const capture = useCallback(async (
    overlayCanvas: HTMLCanvasElement,
    mapInstance:   any,
    L:             any,
    coordinates:   LatLngPoint[],
    metadata:      CaptureMetadata,
    captureTarget: CaptureTarget = "small"
  ): Promise<CaptureResult> => {

    const size     = mapInstance.getSize();
    const base = document.createElement("canvas");
    base.width = size.x; base.height = size.y;
    const baseCtx = base.getContext("2d")!;

    // ① ارسم التايلز
    const mapRect = mapInstance.getContainer().getBoundingClientRect();
    const tileEls = Array.from(
      mapInstance.getContainer().querySelectorAll(".leaflet-tile") as NodeListOf<HTMLImageElement>
    );

    // Wait slightly to ensure all visible tiles are loaded if they are marked complete
    await Promise.all(tileEls.map((tile) =>
      new Promise<void>((res) => {
        if (tile.complete) {
          res();
        } else {
          tile.onload = () => res();
          tile.onerror = () => res();
          // Timeout as fallback
          setTimeout(res, 2000);
        }
      })
    ));

    tileEls.forEach((tile) => {
      if (tile.complete && tile.naturalWidth > 0) {
        const rect = tile.getBoundingClientRect();
        const x = rect.left - mapRect.left;
        const y = rect.top - mapRect.top;
        try {
          baseCtx.drawImage(tile as CanvasImageSource, x, y, rect.width, rect.height);
        } catch (e) {
          console.warn("Tile draw skipped:", e);
        }
      }
    });

    // ② ارسم الـ overlay
    const combined = document.createElement("canvas");
    combined.width = size.x; combined.height = size.y;
    const ctx = combined.getContext("2d")!;
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(overlayCanvas, 0, 0);

    const viewportCoordinates = getViewportCoordinates(mapInstance);

    if (captureTarget === "large") {
      // ── Resize الـ full viewport لـ FIXED_W×FIXED_H ──────────────────────
      const fixedLarge  = resizeToFixed(combined);
      const largeBlob: Blob = await new Promise((res, rej) =>
        fixedLarge.toBlob((b) => b ? res(b) : rej(new Error("Large toBlob failed")), "image/png")
      );

      return {
        captureTarget,
        largeUrl: blobToUrl(largeBlob),
        largeBlob,
        selectedCoordinates: coordinates,
        viewportCoordinates,
        selectedBounds: getBoundsFromCoordinates(coordinates),
        viewportBounds: getBoundsFromCoordinates(viewportCoordinates),
        metadata,
      };
    }

    // ③ Crop to selected shape
    const rawCropped = cropToCoordinates(base, mapInstance, L, coordinates);
    const rawSelectedBlob: Blob = await new Promise((res, rej) =>
      rawCropped.toBlob((b) => b ? res(b) : rej(new Error("Raw crop toBlob failed")), "image/png")
    );

    const cropped = cropToCoordinates(combined, mapInstance, L, coordinates);

    // ── Resize الـ cropped shape لـ FIXED_W×FIXED_H ───────────────────────
    const fixedSmall  = resizeToFixed(cropped);
    const smallBlob: Blob = await new Promise((res, rej) =>
      fixedSmall.toBlob((b) => b ? res(b) : rej(new Error("Small toBlob failed")), "image/png")
    );

    const smallUrl = blobToUrl(smallBlob);
    return {
      captureTarget,
      smallUrl,
      smallBlob,
      rawSelectedUrl: blobToUrl(rawSelectedBlob),
      rawSelectedBlob,
      selectedCoordinates: coordinates,
      viewportCoordinates,
      selectedBounds: getBoundsFromCoordinates(coordinates),
      viewportBounds: getBoundsFromCoordinates(viewportCoordinates),
      metadata,
    };
  }, []);

  // ── captureCircle ─────────────────────────────────────────────────────────
  const captureCircle = useCallback(async (
    overlayCanvas: HTMLCanvasElement,
    mapInstance:   any,
    L:             any,
    center:        LatLngPoint,
    radiusMeters:  number,
    metadata:      CaptureMetadata,
    captureTarget: CaptureTarget = "small"
  ): Promise<CaptureResult> => {
    const points: LatLngPoint[] = Array.from({ length: 32 }, (_, i) => {
      const angle = (i / 32) * Math.PI * 2;
      return {
        lat: center.lat + (radiusMeters / 111320) * Math.sin(angle),
        lng: center.lng + (radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.cos(angle),
      };
    });
    return capture(overlayCanvas, mapInstance, L, points, metadata, captureTarget);
  }, [capture]);

  // ── Send to Backend ───────────────────────────────────────────────────────
  const sendToBackend = useCallback(async (
    smallBlob:   Blob | null | undefined,
    largeBlob:   Blob | null | undefined,
    coordinates: LatLngPoint[],
    metadata:    CaptureMetadata,
    captureInfo?: Pick<CaptureResult, "viewportCoordinates" | "selectedBounds" | "viewportBounds">,
    captureTarget: CaptureTarget = "small",
    endpoint     = "/api/map-capture"
  ): Promise<Response> => {
    const form = new FormData();
    if (smallBlob) form.append("smallImage",  smallBlob,  "small_capture.png");
    if (largeBlob) form.append("largeImage",  largeBlob,  "large_capture.png");
    form.append("coordinates", JSON.stringify(coordinates));
    if (captureInfo?.viewportCoordinates) {
      form.append("viewportCoordinates", JSON.stringify(captureInfo.viewportCoordinates));
    }
    if (captureInfo?.selectedBounds) {
      form.append("selectedBounds", JSON.stringify(captureInfo.selectedBounds));
    }
    if (captureInfo?.viewportBounds) {
      form.append("viewportBounds", JSON.stringify(captureInfo.viewportBounds));
    }
    form.append("metadata",    JSON.stringify(metadata));
    form.append("captureTarget", captureTarget);
    return fetch(endpoint, { method: "POST", body: form });
  }, []);

  return {
    drawPolygon, drawRect, drawCircle, drawMeasure, drawMarker,
    clearCanvas, capture, captureCircle, sendToBackend,
  };
}
