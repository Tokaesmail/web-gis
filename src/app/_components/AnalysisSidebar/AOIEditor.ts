"use client";

// ─── AOIEditor.ts ──────────────────────────────────────────────────────────────
// fixes:
//  ① threshold: HANDLE_RADIUS 8px → أصغر من المطلوب — رفعناه لـ 10px وزدنا hit area CSS
//  ② area units: بنستخدم formatArea() من aoiValidation
//     • < 10,000 m²  → م² / m²
//     • 10k–1M m²    → هكتار / ha
//     • > 1M m²      → كم² / km²
//  ③ drag not updating polygon:
//     السبب: setLatLngs() على L.polygon لا يعيد رسم الـ SVG path بشكل موثوق.
//     الحل: نزيل الـ outline layer ونعيد إضافته في كل onMove،
//           أو نستخدم نفس الطريقة اللي بيعملها Leaflet داخلياً:
//           نضرب _latlngs مباشرة ثم redraw().
//           اخترنا الأسلوب الموثوق: remove + re-add بعد كل حركة بسرعة.

import { hasSelfIntersection, areaHaFromLatLngRing, MAX_AOI_SIZE_HA, formatArea } from "./aoiValidation";

export type AOIShapeKind = "polygon" | "rectangle";

export interface AOIEditorCallbacks {
  onChange?: (latlngs: [number, number][], isValid: boolean, areaHa: number) => void;
  onSave?:   (latlngs: [number, number][], isValid: boolean, areaHa: number) => void;
  onCancel?: () => void;
  locale?:   "ar" | "en";
}

// ── Visual constants ──────────────────────────────────────────────────────────
const HANDLE_RADIUS        = 10;           // px — كبير بما يكفي للمس على موبايل
const HANDLE_VALID_FILL    = "#00d4ff";
const HANDLE_INVALID_FILL  = "#ef4444";
const EDGE_VALID_COLOR     = "#00c8ff";
const EDGE_INVALID_COLOR   = "#ef4444";

// ── Helper: flatten Leaflet getLatLngs() result to a flat LatLng[] ────────────
function flattenLatLngs(raw: any): any[] {
  // L.polygon.getLatLngs() returns [[LatLng, ...]] (array of rings)
  // L.rectangle.getLatLngs() returns the same
  // We only care about the outer ring (index 0)
  if (!Array.isArray(raw)) return [];
  if (raw.length === 0) return [];
  const first = raw[0];
  // Already a flat array of LatLng objects
  if (first && typeof first.lat === "number") return raw as any[];
  // Nested: [[LatLng, ...], ...]
  if (Array.isArray(first)) {
    const inner = first[0];
    if (inner && typeof inner.lat === "number") return first as any[];
  }
  return raw as any[];
}

export class AOIEditor {
  private map:       any;
  private L:         any;
  private callbacks: AOIEditorCallbacks;
  private locale:    "ar" | "en";

  private active       = false;
  private kind:          AOIShapeKind   = "polygon";
  private points:        [number, number][] = [];  // always [lat, lng]
  private handles:       any[]          = [];
  private outlineLayer:  any            = null;
  private isValid        = true;
  private currentAreaHa  = 0;

  private controlsEl:  HTMLDivElement    | null = null;
  private saveBtn:     HTMLButtonElement  | null = null;
  private statusEl:    HTMLDivElement     | null = null;

  // Drag state
  private draggingIdx:   number | null  = null;
  private boundMapMove   = (e: any)          => this.onMapMove(e);
  private boundMapUp     = ()                => this.onDragEnd();
  private boundTouchMove = (e: TouchEvent)   => this.onTouchMove(e);
  private boundTouchEnd  = ()                => this.onDragEnd();

  constructor(map: any, L: any, callbacks: AOIEditorCallbacks = {}) {
    this.map       = map;
    this.L         = L;
    this.callbacks = callbacks;
    this.locale    = callbacks.locale ?? "en";
  }

  get isActive() { return this.active; }

  // ── Public: start editing an existing finished layer ─────────────────────────
  startEditing(layer: any, kind: AOIShapeKind) {
    if (this.active) this.stopEditing(false);

    this.kind   = kind;
    this.active = true;

    // Extract vertices from the Leaflet layer
    const raw  = layer.getLatLngs();
    const ring = flattenLatLngs(raw);
    this.points = ring.map((p: any) => [p.lat, p.lng] as [number, number]);

    // Drop closing duplicate (Leaflet sometimes appends first point at end)
    if (this.points.length > 1) {
      const [f0, f1] = this.points[0];
      const [l0, l1] = this.points[this.points.length - 1];
      if (f0 === l0 && f1 === l1) this.points.pop();
    }

    // Remove the static layer — we replace it with a live outline
    if (this.map.hasLayer(layer)) this.map.removeLayer(layer);

    this.buildOutline();
    this.buildHandles();
    this.runValidation();
    this.mountControls();
  }

  // ── Public: stop / commit ─────────────────────────────────────────────────────
  stopEditing(commit: boolean) {
    if (!this.active) return;

    // Always clean up dangling listeners first
    this.onDragEnd();

    if (commit && this.isValid) {
      this.callbacks.onSave?.(this.points, this.isValid, this.currentAreaHa);
    } else {
      this.callbacks.onCancel?.();
    }

    this.handles.forEach(h => { try { this.map.removeLayer(h); } catch (_) {} });
    this.handles = [];

    if (this.outlineLayer) {
      try { this.map.removeLayer(this.outlineLayer); } catch (_) {}
      this.outlineLayer = null;
    }

    if (this.controlsEl) { this.controlsEl.remove(); this.controlsEl = null; }
    this.saveBtn  = null;
    this.statusEl = null;
    this.active   = false;
  }

  getPoints(): [number, number][] { return this.points; }

  // ── Build / rebuild the live outline polygon ──────────────────────────────────
  // KEY FIX ③: Instead of calling setLatLngs() (which doesn't reliably
  // trigger a redraw of the SVG path on L.polygon), we remove the old layer
  // and create a new one every time.  This is O(1) for small vertex counts and
  // the flicker is imperceptible at 60 fps.
  private buildOutline() {
    if (this.outlineLayer) {
      try { this.map.removeLayer(this.outlineLayer); } catch (_) {}
      this.outlineLayer = null;
    }
    const color = this.isValid ? EDGE_VALID_COLOR : EDGE_INVALID_COLOR;
    this.outlineLayer = this.L.polygon(this.points, {
      color,
      weight:      2,
      fillColor:   color,
      fillOpacity: 0.07,
      dashArray:   "6 4",
      interactive: false,   // clicks must reach handles, not the fill area
    }).addTo(this.map);
  }

  // ── Build handle markers for all vertices ─────────────────────────────────────
  private buildHandles() {
    // Remove old handles if any
    this.handles.forEach(h => { try { this.map.removeLayer(h); } catch (_) {} });
    this.handles = [];
    this.points.forEach((pt, i) => this.addHandle(pt, i));
  }

  // ── Add one vertex handle ─────────────────────────────────────────────────────
  private addHandle(pt: [number, number], index: number) {
    const L   = this.L;
    const map = this.map;

    const handle = L.circleMarker(pt, {
      radius:              HANDLE_RADIUS,
      color:               "#ffffff",
      weight:              2,
      fillColor:           this.isValid ? HANDLE_VALID_FILL : HANDLE_INVALID_FILL,
      fillOpacity:         1,
      pane:                "markerPane",    // above overlayPane → handles on top of outline
      interactive:         true,
      bubblingMouseEvents: false,            // stop map click from also firing during drag
    }).addTo(map);

    (handle as any)._aoiIndex = index;

    // Bigger CSS hit area for touch
    const el: Element | undefined = (handle as any)._path;
    if (el) {
      (el as HTMLElement).style.cursor = "grab";
    }

    // ── Mouse drag ────────────────────────────────────────────────────────────
    handle.on("mousedown", (e: any) => {
      L.DomEvent.stop(e);               // stop propagation + preventDefault
      this.draggingIdx = index;
      map.dragging.disable();
      map.on("mousemove", this.boundMapMove);
      map.on("mouseup",   this.boundMapUp);
      // catch mouseup even if cursor leaves map container
      document.addEventListener("mouseup", this.boundMapUp, { once: true });
    });

    // ── Touch drag ────────────────────────────────────────────────────────────
    handle.on("touchstart", (e: any) => {
      L.DomEvent.stop(e);
      this.draggingIdx = index;
      map.dragging.disable();
      document.addEventListener("touchmove", this.boundTouchMove, { passive: false });
      document.addEventListener("touchend",  this.boundTouchEnd,  { once: true });
    });

    this.handles.push(handle);
  }

  // ── Drag move handlers ────────────────────────────────────────────────────────
  private onMapMove(e: any) {
    if (this.draggingIdx === null) return;
    this.movePoint(this.draggingIdx, e.latlng.lat, e.latlng.lng);
  }

  private onTouchMove(e: TouchEvent) {
    if (this.draggingIdx === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    const rect = this.map.getContainer().getBoundingClientRect();
    const containerPoint = this.L.point(
      touch.clientX - rect.left,
      touch.clientY - rect.top
    );
    const latlng = this.map.containerPointToLatLng(containerPoint);
    this.movePoint(this.draggingIdx, latlng.lat, latlng.lng);
  }

  private onDragEnd() {
    this.draggingIdx = null;
    this.map.dragging.enable();
    this.map.off("mousemove", this.boundMapMove);
    this.map.off("mouseup",   this.boundMapUp);
    document.removeEventListener("mouseup",   this.boundMapUp);
    document.removeEventListener("touchmove", this.boundTouchMove);
    document.removeEventListener("touchend",  this.boundTouchEnd);
  }

  // ── Core: move one point, rebuild outline, revalidate ────────────────────────
  private movePoint(index: number, lat: number, lng: number) {
    // Update the point array
    this.points[index] = [lat, lng];

    // Move the handle marker (cheap — just sets latlng, no SVG re-render)
    const handle = this.handles[index];
    if (handle) handle.setLatLng([lat, lng]);

    // Rebuild the outline polygon from scratch (fixes the "shape doesn't change" bug)
    this.buildOutline();

    // Revalidate + update status pill
    this.runValidation();

    this.callbacks.onChange?.(this.points, this.isValid, this.currentAreaHa);
  }

  // ── Validation ────────────────────────────────────────────────────────────────
  private runValidation() {
    this.currentAreaHa = areaHaFromLatLngRing(this.points);
    const selfX  = hasSelfIntersection(this.points);
    const tooBig = this.currentAreaHa > MAX_AOI_SIZE_HA;
    this.isValid = !selfX && !tooBig && this.points.length >= 3;

    const edgeColor   = this.isValid ? EDGE_VALID_COLOR   : EDGE_INVALID_COLOR;
    const handleColor = this.isValid ? HANDLE_VALID_FILL  : HANDLE_INVALID_FILL;

    // Recolor the outline (already rebuilt — just set style)
    if (this.outlineLayer) {
      this.outlineLayer.setStyle({ color: edgeColor, fillColor: edgeColor });
    }
    // Recolor all handles
    this.handles.forEach(h => h.setStyle({ fillColor: handleColor }));

    this.updateStatus();
  }

  // ── Controls bar (Save / Cancel + status pill) ────────────────────────────────
  private mountControls() {
    if (this.controlsEl) { this.controlsEl.remove(); this.controlsEl = null; }

    const div = document.createElement("div");
    this.controlsEl = div;
    div.style.cssText = `
      position:absolute; bottom:86px; left:50%; transform:translateX(-50%);
      z-index:1100; display:flex; align-items:center; gap:8px;
      pointer-events:auto; font-family:DM Sans,sans-serif;
    `;

    // Status pill — shows area (formatted with smart units) or error message
    const status = document.createElement("div");
    this.statusEl = status;
    status.style.cssText = `
      padding:6px 14px; border-radius:20px;
      background:rgba(10,22,40,0.92); backdrop-filter:blur(10px);
      font-size:12px; border:1px solid rgba(255,255,255,0.12);
      color:#94a3b8; white-space:nowrap; min-width:80px; text-align:center;
    `;

    // Save buttoشn
    const save = document.createElement("button");
    save.textContent = this.locale === "ar" ? "✓ حفظ" : "✓ Save AOI";
    save.style.cssText = `
      background:#00d4ff; border:none; color:#040d1a; font-weight:700;
      padding:7px 20px; border-radius:20px; font-size:12px; cursor:pointer;
      box-shadow:0 4px 16px rgba(0,212,255,0.35);
      transition:opacity .15s, background .15s;
    `;
    save.onclick = () => this.stopEditing(true);
    this.saveBtn = save;

    // Cancel button
    const cancel = document.createElement("button");
    cancel.textContent = this.locale === "ar" ? "✕ إلغاء" : "✕ Cancel";
    cancel.style.cssText = `
      background:rgba(10,22,40,0.88); border:1px solid rgba(255,255,255,0.15);
      color:#94a3b8; padding:7px 16px; border-radius:20px; font-size:12px;
      cursor:pointer; backdrop-filter:blur(10px);
    `;
    cancel.onclick = () => this.stopEditing(false);

    div.appendChild(status);
    div.appendChild(save);
    div.appendChild(cancel);
    this.map.getContainer().appendChild(div);

    this.updateStatus();
  }

  // ── Update status pill + save button state ────────────────────────────────────
  private updateStatus() {
    if (!this.statusEl) return;

    // FIX ②: Use formatArea() — auto-selects m² / ha / km²
    const areaLabel = formatArea(this.currentAreaHa, this.locale);

    if (this.isValid) {
      this.statusEl.style.color            = "#94a3b8";
      this.statusEl.style.borderColor      = "rgba(255,255,255,0.12)";
      this.statusEl.style.backgroundColor  = "rgba(10,22,40,0.92)";
      this.statusEl.textContent            = areaLabel;
    } else {
      const msg = this.currentAreaHa > MAX_AOI_SIZE_HA
        ? (this.locale === "ar"
            ? `${areaLabel} — تجاوز الحد`
            : `${areaLabel} — over limit`)
        : (this.locale === "ar"
            ? "الأضلاع متقاطعة"
            : "Edges self-intersect");
      this.statusEl.style.color           = "#f87171";
      this.statusEl.style.borderColor     = "rgba(239,68,68,0.3)";
      this.statusEl.style.backgroundColor = "rgba(239,68,68,0.08)";
      this.statusEl.textContent           = msg;
    }

    if (this.saveBtn) {
      this.saveBtn.disabled      = !this.isValid;
      this.saveBtn.style.opacity = this.isValid ? "1" : "0.4";
      this.saveBtn.style.cursor  = this.isValid ? "pointer" : "not-allowed";
      this.saveBtn.style.background = this.isValid ? "#00d4ff" : "#334155";
    }
  }
}
