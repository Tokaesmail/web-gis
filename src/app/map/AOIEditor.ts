"use client";

// ─── AOIEditor.ts ──────────────────────────────────────────────────────────────
// Custom vertex editor for drawn AOIs (polygons & rectangles), built directly on
// top of Leaflet — no leaflet-draw dependency, matching the hand-rolled drawing
// style already used in LeafletMap.tsx / useMapCanvas.ts.
//
// Capabilities:
//   • Move vertices  — drag any vertex handle to reshape the polygon
//   • Resize shapes  — for rectangles, dragging a corner resizes the whole shape;
//                      for polygons, each vertex moves independently (which is
//                      the natural "resize" for an arbitrary polygon)
//   • Live validation — self-intersection + max-size checked on every drag via
//                      aoiValidation.ts, with visual feedback (red ring when invalid)
//
// Usage (from LeafletMap.tsx):
//   const editor = new AOIEditor(map, L, {
//     onChange: (points, isValid, areaHa) => { ... },
//     onSave:   (points, isValid, areaHa) => { ... },
//   });
//   editor.startEditing(existingPolygonLayer, "polygon" | "rectangle");
//   editor.stopEditing(true | false);

import { hasSelfIntersection, areaHaFromLatLngRing, MAX_AOI_SIZE_HA, formatArea } from "./aoiValidation";

export type AOIShapeKind = "polygon" | "rectangle";

export interface AOIEditorCallbacks {
  /** Fired continuously while dragging a vertex (for live UI feedback) */
  onChange?: (latlngs: [number, number][], isValid: boolean, areaHa: number) => void;
  /** Fired once editing ends and the shape is committed */
  onSave?: (latlngs: [number, number][], isValid: boolean, areaHa: number) => void;
  /** Fired if editing is cancelled (Escape / cancel button) */
  onCancel?: () => void;
  /** "ar" | "en" — controls the status pill / unit formatting language */
  locale?: "ar" | "en";
}

const HANDLE_RADIUS = 8;
const HANDLE_COLOR_VALID = "#00d4ff";
const HANDLE_COLOR_INVALID = "#ef4444";
const EDGE_COLOR_VALID = "#00c8ff";
const EDGE_COLOR_INVALID = "#ef4444";

export class AOIEditor {
  private map: any;
  private L: any;
  private callbacks: AOIEditorCallbacks;
  private locale: "ar" | "en";

  private active = false;
  private kind: AOIShapeKind = "polygon";
  private points: [number, number][] = []; // [lat, lng][]
  private handles: any[] = [];
  private outlineLayer: any = null;
  private originalLayer: any = null; // the layer being replaced while editing
  private isValid = true;
  private currentAreaHa = 0;
  private saveBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;
  private controlsEl: HTMLDivElement | null = null;

  // Active drag bookkeeping — kept on the instance (not per-handle closures only)
  // so mouse/touch move+up handlers can be reliably removed on cleanup too.
  private draggingIndex: number | null = null;
  private boundMouseMove = (e: any) => this.handleDragMove(e);
  private boundMouseUp = () => this.handleDragEnd();
  private boundTouchMove = (e: TouchEvent) => this.handleTouchMove(e);
  private boundTouchEnd = () => this.handleDragEnd();

  constructor(map: any, L: any, callbacks: AOIEditorCallbacks = {}) {
    this.map = map;
    this.L = L;
    this.callbacks = callbacks;
    this.locale = callbacks.locale ?? "en";
  }

  get isActive() {
    return this.active;
  }

  /** Begin editing an existing layer (polygon or rectangle). Hides the original layer. */
  startEditing(layer: any, kind: AOIShapeKind) {
    if (this.active) this.stopEditing(false);

    const L = this.L;
    const map = this.map;

    this.kind = kind;
    this.originalLayer = layer;
    this.active = true;

    // Extract [lat,lng] vertex list from the layer (polygon or rectangle both
    // expose getLatLngs(); rectangle returns a single ring nested one level,
    // polygon returns [ring] too — but defensively flatten either case).
    const raw = layer.getLatLngs();
    let ring = raw;
    while (Array.isArray(ring) && Array.isArray(ring[0]) && ring[0].length && typeof ring[0][0] !== "number" && (ring[0][0] as any)?.lat === undefined) {
      ring = ring[0];
    }
    // ring should now be an array of LatLng-like objects, possibly still nested once
    if (Array.isArray(ring[0])) ring = ring[0];

    this.points = (ring as any[]).map((p: any) => [p.lat, p.lng] as [number, number]);

    // Drop the closing duplicate point if Leaflet included one (it usually doesn't,
    // but defend against it so handles don't get a redundant overlapping vertex).
    if (this.points.length > 1) {
      const first = this.points[0];
      const last = this.points[this.points.length - 1];
      if (first[0] === last[0] && first[1] === last[1]) this.points.pop();
    }

    // Hide the original static layer while editing (we draw a live outline instead)
    if (map.hasLayer(layer)) map.removeLayer(layer);

    this.outlineLayer = L.polygon(this.points, {
      color: EDGE_COLOR_VALID,
      weight: 2,
      fillColor: EDGE_COLOR_VALID,
      fillOpacity: 0.06,
      dashArray: "5 4",
      interactive: false, // clicks/drags must hit the vertex handles, not the fill
    }).addTo(map);

    this.points.forEach((pt, i) => this.addHandle(pt, i));
    this.runValidation();
    this.mountControls();
  }

  /** Begin editing a brand-new (in-progress) ring, e.g. right after finishPolygon(). */
  startEditingPoints(points: [number, number][], kind: AOIShapeKind) {
    if (this.active) this.stopEditing(false);
    const L = this.L;
    const map = this.map;

    this.kind = kind;
    this.originalLayer = null;
    this.active = true;
    this.points = points.map((p) => [...p] as [number, number]);

    this.outlineLayer = L.polygon(this.points, {
      color: EDGE_COLOR_VALID,
      weight: 2,
      fillColor: EDGE_COLOR_VALID,
      fillOpacity: 0.06,
      dashArray: "5 4",
      interactive: false,
    }).addTo(map);

    this.points.forEach((pt, i) => this.addHandle(pt, i));
    this.runValidation();
    this.mountControls();
  }

  private addHandle(pt: [number, number], index: number) {
    const L = this.L;
    const map = this.map;

    const handle = L.circleMarker(pt, {
      radius: HANDLE_RADIUS,
      color: "#fff",
      weight: 2,
      fillColor: this.isValid ? HANDLE_COLOR_VALID : HANDLE_COLOR_INVALID,
      fillOpacity: 1,
      pane: "markerPane", // markerPane sits above overlayPane, so handles render on top
      interactive: true,
      bubblingMouseEvents: false, // critical: stop the map's own click handler from also firing
    }).addTo(map);

    (handle as any)._aoiIndex = index;

    // Give the handle's DOM element a class for cursor styling + larger hit target on touch.
    const el: SVGElement | HTMLElement | undefined = (handle as any)._path;
    if (el) {
      el.classList.add("aoi-vertex-handle");
    }

    // ── Mouse drag ─────────────────────────────────────────────────────────────
    handle.on("mousedown", (e: any) => {
      L.DomEvent.stop(e); // stops propagation AND prevents default — this was missing
      this.draggingIndex = index;
      map.dragging.disable();
      map.on("mousemove", this.boundMouseMove);
      map.on("mouseup", this.boundMouseUp);
      // also listen on document in case the cursor leaves the map container mid-drag
      document.addEventListener("mouseup", this.boundMouseUp, { once: true });
    });

    // ── Touch drag (was previously a no-op: disabled dragging but never moved
    //    the point or re-enabled dragging) ──────────────────────────────────────
    handle.on("touchstart", (e: any) => {
      L.DomEvent.stop(e);
      this.draggingIndex = index;
      map.dragging.disable();
      document.addEventListener("touchmove", this.boundTouchMove, { passive: false });
      document.addEventListener("touchend", this.boundTouchEnd, { once: true });
    });

    this.handles.push(handle);
  }

  private handleDragMove(e: any) {
    if (this.draggingIndex === null) return;
    const { lat, lng } = e.latlng;
    this.applyPointMove(this.draggingIndex, lat, lng);
  }

  private handleTouchMove(e: TouchEvent) {
    if (this.draggingIndex === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    const containerPoint = this.L.point(
      touch.clientX - this.map.getContainer().getBoundingClientRect().left,
      touch.clientY - this.map.getContainer().getBoundingClientRect().top
    );
    const latlng = this.map.containerPointToLatLng(containerPoint);
    this.applyPointMove(this.draggingIndex, latlng.lat, latlng.lng);
  }

  private applyPointMove(index: number, lat: number, lng: number) {
    this.points[index] = [lat, lng];
    const handle = this.handles[index];
    if (handle) handle.setLatLng([lat, lng]);
    this.refreshOutline();
    this.runValidation();
    this.callbacks.onChange?.(this.points, this.isValid, this.currentAreaHa);
  }

  private handleDragEnd() {
    this.draggingIndex = null;
    this.map.dragging.enable();
    this.map.off("mousemove", this.boundMouseMove);
    this.map.off("mouseup", this.boundMouseUp);
    document.removeEventListener("mouseup", this.boundMouseUp);
    document.removeEventListener("touchmove", this.boundTouchMove);
    document.removeEventListener("touchend", this.boundTouchEnd);
  }

  private refreshOutline() {
    if (!this.outlineLayer) return;
    this.outlineLayer.setLatLngs(this.points);
    // redraw() forces Leaflet to recompute the path immediately rather than
    // waiting for the next animation frame — without this, fast drags can
    // visually lag a frame behind the handle position.
    if (typeof this.outlineLayer.redraw === "function") this.outlineLayer.redraw();
  }

  private runValidation() {
    this.currentAreaHa = areaHaFromLatLngRing(this.points);
    const selfIntersects = hasSelfIntersection(this.points);
    const overSize = this.currentAreaHa > MAX_AOI_SIZE_HA;
    this.isValid = !selfIntersects && !overSize && this.points.length >= 3;

    const edgeColor = this.isValid ? EDGE_COLOR_VALID : EDGE_COLOR_INVALID;
    const handleColor = this.isValid ? HANDLE_COLOR_VALID : HANDLE_COLOR_INVALID;

    this.outlineLayer?.setStyle({ color: edgeColor, fillColor: edgeColor });
    this.handles.forEach((h) => h.setStyle({ fillColor: handleColor }));

    this.updateControlsState();
  }

  private mountControls() {
    const container = this.map.getContainer();
    const div = document.createElement("div");
    this.controlsEl = div;
    div.style.cssText = `
      position:absolute; bottom:86px; left:50%; transform:translateX(-50%);
      z-index:1100; display:flex; gap:8px; pointer-events:auto;
      font-family:DM Sans, sans-serif;
    `;

    const status = document.createElement("div");
    status.id = "aoi-editor-status";
    status.style.cssText = `
      display:flex; align-items:center; padding:6px 12px; border-radius:14px;
      background:#0a1628cc; backdrop-filter:blur(10px); color:#94a3b8;
      font-size:11px; border:1px solid rgba(255,255,255,0.1); white-space:nowrap;
    `;

    const save = document.createElement("button");
    save.textContent = this.locale === "ar" ? "✓ حفظ المنطقة" : "✓ Save AOI";
    save.style.cssText = `
      background:#00d4ff; border:none; color:#040d1a; font-weight:600;
      padding:7px 18px; border-radius:20px; font-size:12px; cursor:pointer;
      box-shadow:0 4px 16px rgba(0,212,255,0.3);
    `;
    save.onclick = () => this.stopEditing(true);
    this.saveBtn = save;

    const cancel = document.createElement("button");
    cancel.textContent = this.locale === "ar" ? "✕ إلغاء" : "✕ Cancel";
    cancel.style.cssText = `
      background:#0a1628cc; border:1px solid rgba(255,255,255,0.15); color:#94a3b8;
      padding:7px 16px; border-radius:20px; font-size:12px; cursor:pointer;
      backdrop-filter:blur(10px);
    `;
    cancel.onclick = () => this.stopEditing(false);
    this.cancelBtn = cancel;

    div.appendChild(status);
    div.appendChild(save);
    div.appendChild(cancel);
    container.appendChild(div);

    this.updateControlsState();
  }

  private updateControlsState() {
    if (!this.controlsEl) return;
    const status = this.controlsEl.querySelector<HTMLDivElement>("#aoi-editor-status");
    if (status) {
      const areaLabel = formatArea(this.currentAreaHa, this.locale);
      if (this.isValid) {
        status.style.color = "#94a3b8";
        status.textContent = areaLabel;
      } else {
        status.style.color = "#f87171";
        status.textContent =
          this.currentAreaHa > MAX_AOI_SIZE_HA
            ? (this.locale === "ar"
                ? `${areaLabel} — تعدّى الحد الأقصى (${formatArea(MAX_AOI_SIZE_HA, this.locale)})`
                : `${areaLabel} — exceeds ${formatArea(MAX_AOI_SIZE_HA, this.locale)} limit`)
            : (this.locale === "ar" ? "الأضلاع متقاطعة — حرّكي الرؤوس" : "Edges self-intersect — adjust vertices");
      }
    }
    if (this.saveBtn) {
      this.saveBtn.disabled = !this.isValid;
      this.saveBtn.style.opacity = this.isValid ? "1" : "0.45";
      this.saveBtn.style.cursor = this.isValid ? "pointer" : "not-allowed";
    }
  }

  /** Ends the editing session. If `commit` is true and valid, fires onSave; otherwise onCancel. */
  stopEditing(commit: boolean) {
    if (!this.active) return;
    const map = this.map;

    // make sure no drag listeners are left dangling
    this.handleDragEnd();

    if (commit && this.isValid) {
      this.callbacks.onSave?.(this.points, this.isValid, this.currentAreaHa);
    } else if (!commit) {
      this.callbacks.onCancel?.();
    }

    this.handles.forEach((h) => map.removeLayer(h));
    this.handles = [];
    if (this.outlineLayer) {
      map.removeLayer(this.outlineLayer);
      this.outlineLayer = null;
    }
    if (this.controlsEl) {
      this.controlsEl.remove();
      this.controlsEl = null;
    }
    this.saveBtn = null;
    this.cancelBtn = null;
    this.active = false;
    this.originalLayer = null;
  }

  /** Current vertex list, e.g. for external validation display. */
  getPoints(): [number, number][] {
    return this.points;
  }
}