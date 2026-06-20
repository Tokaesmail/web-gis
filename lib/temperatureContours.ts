// ─── lib/temperatureContours.ts ─────────────────────────────────────────────
// Adapts the existing marching-squares contour extractor (lib/marchingSquares.ts)
// — which only cares about a generic { rows, lngs, lats, ... } numeric grid —
// to temperature data, producing isotherm lines instead of elevation contours.
//
// Kept as a separate adapter (rather than touching marchingSquares.ts) so the
// elevation contour pipeline is completely untouched.

import type { TemperatureGrid } from "./temperatureGrid";
import { gridToContours, type ContourOptions } from "./marchingSquares";
import type { ElevationGrid } from "./elevation";

// Color ramp for isotherms: cold (blue) → mild (green/yellow) → hot (red).
const TEMP_COLOR_STOPS: Array<[number, string]> = [
  [-10, "#1d4ed8"],
  [0, "#38bdf8"],
  [10, "#34d399"],
  [20, "#facc15"],
  [30, "#f97316"],
  [40, "#dc2626"],
];

function colorForTemperature(value: number): string {
  if (value <= TEMP_COLOR_STOPS[0][0]) return TEMP_COLOR_STOPS[0][1];
  for (let i = 0; i < TEMP_COLOR_STOPS.length - 1; i++) {
    const [v0, c0] = TEMP_COLOR_STOPS[i];
    const [v1, c1] = TEMP_COLOR_STOPS[i + 1];
    if (value <= v1) {
      // simple nearest-stop pick (no interpolation needed for a stroke color)
      return value - v0 <= v1 - value ? c0 : c1;
    }
  }
  return TEMP_COLOR_STOPS[TEMP_COLOR_STOPS.length - 1][1];
}

export interface TemperatureContourOptions {
  /** explicit isotherm levels in °C; if omitted, computed from interval */
  levels?: number[];
  /** spacing between auto-generated levels, in °C (default 2) */
  interval?: number;
}

/**
 * Generates a GeoJSON FeatureCollection of isotherm (constant-temperature)
 * lines from a temperature grid. Each feature carries:
 *   - properties.TempC = level (°C) — distinct from elevation's `Contour` key
 *     so the map's elevation-tuned coloring/tooltips are never confused by it
 *   - properties._color / properties.color — a ready-to-use heat color, since
 *     this layer is added as a generic "uploaded GeoJSON" layer and picked up
 *     by LeafletMap's per-feature `_color` styling path
 *   - properties._generated = "weather-contour" for identification
 */
export function gridToTemperatureContours(
  grid: TemperatureGrid,
  options: TemperatureContourOptions = {}
): GeoJSON.FeatureCollection {
  const interval = options.interval ?? 2;

  // Reuse the existing generic marching-squares implementation by handing it
  // a grid shaped like ElevationGrid (it only reads rows/lngs/lats/cols/rowsCount/min/max).
  const asElevationShapedGrid: ElevationGrid = {
    rows: grid.rows,
    lngs: grid.lngs,
    lats: grid.lats,
    cols: grid.cols,
    rowsCount: grid.rowsCount,
    bounds: grid.bounds,
    min: grid.min,
    max: grid.max,
    source: "open-meteo",
  };

  const contourOptions: ContourOptions = {
    levels: options.levels,
    interval,
  };

  const raw = gridToContours(asElevationShapedGrid, contourOptions);

  const features: GeoJSON.Feature[] = raw.features.map((f) => {
    const level = Number((f.properties as any)?.Contour ?? 0);
    const color = colorForTemperature(level);
    return {
      type: "Feature",
      geometry: f.geometry,
      properties: {
        TempC: level,
        _color: color,
        color,
        _generated: "weather-contour",
      },
    };
  });

  return { type: "FeatureCollection", features };
}
