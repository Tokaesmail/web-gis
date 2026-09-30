// ─── AOIRegistry.ts ────────────────────────────────────────────────────────────
// Keeps track of every drawn AOI (polygon / rectangle / circle) on the map.
// Exactly ONE AOI is "active" at a time; all the others are visually dimmed and
// made non-interactive (pointer-events: none) so clicks/drags go through them.
//
// Pure TS — no React. LeafletMap.tsx owns one instance (aoiRegistryRef) and
// pushes the serialisable list up to MapClient through onListChange.

export type AOIKind = "polygon" | "rectangle" | "circle";
export type AOITool = "polygon" | "rectangle" | "circle";

export interface LatLngPt { lat: number; lng: number }

export interface AOIEntry {
  id: string;
  name: string;
  /** what the user drew (used for the icon in the list) */
  kind: AOIKind;
  /** what lastToolRef should be set to when this AOI becomes active */
  tool: AOITool;
  layer: any; // Leaflet layer (polygon / rectangle / circle)
  feature: GeoJSON.Feature;
  areaHa: number;
  /** same shape LeafletMap keeps in lastCoordsRef for this tool */
  coords: LatLngPt[];
  /** stroke colour used while active */
  stroke: string;
}

/** Serialisable version of AOIEntry, safe to keep in React state. */
export interface AOIListItem {
  id: string;
  name: string;
  kind: AOIKind;
  areaHa: number;
  /** true while this AOI's shape is being edited */
  editing?: boolean;
}

/** Imperative API exposed from LeafletMap to MapClient / the list panel. */
export interface AOIControl {
  /** make this AOI the active one + fly to it */
  activate: (id: string) => void;
  /** only fly to it (doesn't change which one is active) */
  focus: (id: string) => void;
  /** delete it from the map + list */
  remove: (id: string) => void;
  /** show vertex handles on this AOI so its shape can be reshaped */
  startEdit: (id: string) => void;
  /** hide the handles (and re-capture if the shape changed) */
  stopEdit: () => void;
}

interface Options {
  onListChange: (items: AOIListItem[], activeId: string | null) => void;
  /** Fired when the active AOI changes NOT because of a fresh drawing.
   *  `null` means no AOIs are left. */
  onActivate: (entry: AOIEntry | null) => void;
  onRemove?: (entry: AOIEntry) => void;
  /** Fired whenever the edited AOI changes. `null` = editing ended
   *  (also fired internally when another AOI becomes active / it is deleted). */
  onEditingChange?: (id: string | null) => void;
}

const INACTIVE_STYLE = {
  color: "#64748b",
  weight: 1.5,
  opacity: 0.55,
  dashArray: "6 6",
  fillOpacity: 0,
};

export function newAoiId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch (_) {}
  return `aoi-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class AOIRegistry {
  private entries = new Map<string, AOIEntry>();
  private activeId: string | null = null;
  private editingId: string | null = null;
  private counters: Record<string, number> = {};
  private opts: Options;

  constructor(opts: Options) {
    this.opts = opts;
  }

  /** "Drawn Polygon" -> "Drawn Polygon 1", "Drawn Polygon 2", ... */
  nextName(base: string): string {
    this.counters[base] = (this.counters[base] ?? 0) + 1;
    return `${base} ${this.counters[base]}`;
  }

  get(id: string) { return this.entries.get(id); }
  getActiveId() { return this.activeId; }
  getEditingId() { return this.editingId; }

  /** Turn shape-editing on for one AOI (or off with null). */
  setEditing(id: string | null) {
    if (id && !this.entries.has(id)) return;
    if (this.editingId === id) return;
    this.editingId = id;
    this.emit();
    this.opts.onEditingChange?.(id);
  }

  /** Patch an entry after its geometry was edited (layer itself is untouched). */
  update(
    id: string,
    patch: Partial<Pick<AOIEntry, "kind" | "tool" | "feature" | "areaHa" | "coords">>
  ) {
    const e = this.entries.get(id);
    if (!e) return;
    Object.assign(e, patch);
    this.emit();
  }
  list(): AOIEntry[] { return Array.from(this.entries.values()); }

  /**
   * Register an AOI and make it the active one.
   * silent = true  → the caller (finishPolygon etc.) already ran its own
   *                  onAreaSelected / canvas redraw, so don't repeat it.
   */
  add(entry: AOIEntry, { silent = true }: { silent?: boolean } = {}) {
    // keep the numbering in sync with restored names ("Drawn Polygon 3")
    const m = entry.name.match(/^(.*) (\d+)$/);
    if (m) this.counters[m[1]] = Math.max(this.counters[m[1]] ?? 0, Number(m[2]));

    this.entries.set(entry.id, entry);
    this.setActive(entry.id, silent);
  }

  /** Make an existing AOI active (others get disabled). */
  activate(id: string) {
    if (!this.entries.has(id)) return;
    this.setActive(id, false);
  }

  /** Remove bookkeeping for a layer that was already taken off the map. */
  removeByLayer(layer: any) {
    for (const [id, e] of this.entries) {
      if (e.layer === layer) { this.remove(id); return; }
    }
  }

  remove(id: string) {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    if (this.editingId === id) { this.editingId = null; this.opts.onEditingChange?.(null); }
    this.opts.onRemove?.(entry);

    if (this.activeId === id) {
      const remaining = Array.from(this.entries.keys());
      const next = remaining.length ? remaining[remaining.length - 1] : null;
      if (next) {
        this.setActive(next, false);
      } else {
        this.activeId = null;
        this.emit();
        this.opts.onActivate(null);
      }
    } else {
      this.emit();
    }
  }

  /** Forget everything (layers themselves are removed by clearRef). */
  clear() {
    this.entries.clear();
    this.activeId = null;
    if (this.editingId) { this.editingId = null; this.opts.onEditingChange?.(null); }
    this.emit();
  }

  // ───────────────────────────────────────────────────────────────────────────
  private setActive(id: string, silent: boolean) {
    // editing only ever applies to the active AOI
    if (this.editingId && this.editingId !== id) {
      this.editingId = null;
      this.opts.onEditingChange?.(null);
    }
    this.activeId = id;
    this.applyStyles();
    this.emit();
    if (!silent) this.opts.onActivate(this.entries.get(id) ?? null);
  }

  private applyStyles() {
    this.entries.forEach((e) => {
      const active = e.id === this.activeId;
      try {
        e.layer.setStyle(
          active
            ? { color: e.stroke, weight: 3, opacity: 1, dashArray: "", fillOpacity: 0.08 }
            : INACTIVE_STYLE
        );
        // Disabled AOIs must not swallow clicks — the map (or the active AOI)
        // should receive them instead.
        const el: HTMLElement | SVGElement | undefined = e.layer.getElement?.();
        if (el) (el as HTMLElement).style.pointerEvents = active ? "" : "none";
        if (!active) e.layer.closePopup?.();
      } catch (_) {}
    });
  }

  private emit() {
    const items: AOIListItem[] = this.list().map(({ id, name, kind, areaHa }) => ({
      id, name, kind, areaHa, editing: id === this.editingId,
    }));
    this.opts.onListChange(items, this.activeId);
  }
}