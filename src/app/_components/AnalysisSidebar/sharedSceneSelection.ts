// sharedSceneSelection.ts
// ─────────────────────────────────────────────────────────────────────────────
// Tiny cross-panel hand-off: lets SatelliteDataPanel push one specific STAC
// scene over to PlanetaryRasterPanel, without either panel needing to know
// about the other, and without touching whatever parent component renders
// them both. Both panels just `import` this module directly.
//
// Usage:
//   SatelliteDataPanel  → setSelectedScene({ id, collection, date, cloud })
//   PlanetaryRasterPanel → const picked = useSelectedScene()
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from "react";

export type SharedSelectedScene = {
  id: string;          // STAC item id — sent to the backend as scene_id
  collection: string;  // e.g. "sentinel-2-l2a" — must match what Raster Calc sends
  date: string;        // YYYY-MM-DD, display only
  cloud: number;       // % cloud cover, display only
};

let currentScene: SharedSelectedScene | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/** Called by SatelliteDataPanel when the user clicks "Use in Raster Calculator". */
export function setSelectedScene(scene: SharedSelectedScene | null) {
  currentScene = scene;
  emit();
}

export function getSelectedScene(): SharedSelectedScene | null {
  return currentScene;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Use in either panel to read + live-react to the current pick. */
export function useSelectedScene(): SharedSelectedScene | null {
  return useSyncExternalStore(subscribe, getSelectedScene, getSelectedScene);
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel navigation hand-off
// ─────────────────────────────────────────────────────────────────────────────
// Whatever component controls which sidebar panel is open (the icon rail)
// isn't shared with either of these two panels, so we can't call it
// directly. Instead we dispatch a plain window CustomEvent — the sidebar
// only needs ONE listener added to switch its active panel to Raster
// Calculator; it doesn't need to know anything about SatelliteDataPanel.
export const OPEN_RASTER_CALCULATOR_EVENT = "open-raster-calculator-panel";

/** Called by the "Use this scene in Raster Calculator" button. */
export function openRasterCalculatorPanel() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_RASTER_CALCULATOR_EVENT));
  }
}