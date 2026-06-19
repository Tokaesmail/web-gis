// ─── lib/marchingSquares.ts ─────────────────────────────────────────────────────
// Minimal marching-squares contour extractor.
//
// Input:  a regular grid of scalar values (elevation) + the lat/lng of each
//         row/column (as produced by buildElevationGrid in lib/elevation.ts)
// Output: GeoJSON FeatureCollection of LineString contours, one feature per
//         line segment, tagged with the contour level in properties.Contour
//         (same property name LeafletMap.tsx / GeoJSONLayer.tsx already expect).

import type { ElevationGrid } from "./elevation";

interface Pt {
  x: number; // lng
  y: number; // lat
}

// Linear interpolation of the zero-crossing between two grid corners.
function interp(level: number, v1: number, v2: number, p1: Pt, p2: Pt): Pt {
  if (!Number.isFinite(v1) || !Number.isFinite(v2) || v1 === v2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  const t = (level - v1) / (v2 - v1);
  const clamped = Math.max(0, Math.min(1, t));
  return {
    x: p1.x + (p2.x - p1.x) * clamped,
    y: p1.y + (p2.y - p1.y) * clamped,
  };
}

// Edge midpoint lookup table for the 16 marching-squares cases.
// Corners: TL, TR, BR, BL (clockwise from top-left).
// Edges:   top, right, bottom, left.
const EDGE_TABLE: Record<number, [number, number][]> = {
  1: [[3, 0]], // BL only
  2: [[0, 1]], // TL only
  3: [[3, 1]],
  4: [[1, 2]], // TR only
  5: [[3, 0], [1, 2]], // saddle
  6: [[0, 2]],
  7: [[3, 2]],
  8: [[2, 3]], // BR only
  9: [[0, 2]], // (complement of 6)
  10: [[0, 1], [2, 3]], // saddle
  11: [[1, 2]],
  12: [[1, 3]],
  13: [[0, 1]],
  14: [[0, 3]],
};

/**
 * Extracts contour line segments for a single level from the grid.
 * Returns an array of [ [lng,lat], [lng,lat] ] segment pairs.
 */
function extractLevelSegments(grid: ElevationGrid, level: number): [number, number][][] {
  const { rows, lngs, lats, cols, rowsCount } = grid;
  const segments: [number, number][][] = [];

  for (let y = 0; y < rowsCount - 1; y++) {
    for (let x = 0; x < cols - 1; x++) {
      const vTL = rows[y][x];
      const vTR = rows[y][x + 1];
      const vBR = rows[y + 1][x + 1];
      const vBL = rows[y + 1][x];

      if (![vTL, vTR, vBR, vBL].every(Number.isFinite)) continue;

      const corners: Pt[] = [
        { x: lngs[x], y: lats[y] },         // TL
        { x: lngs[x + 1], y: lats[y] },     // TR
        { x: lngs[x + 1], y: lats[y + 1] }, // BR
        { x: lngs[x], y: lats[y + 1] },     // BL
      ];
      const values = [vTL, vTR, vBR, vBL];

      let caseIndex = 0;
      if (vTL >= level) caseIndex |= 1;
      if (vTR >= level) caseIndex |= 2;
      if (vBR >= level) caseIndex |= 4;
      if (vBL >= level) caseIndex |= 8;

      // Reinterpret with TL,TR,BR,BL bit order matching the lookup table above
      // (table built for bits: TL=1,TR=2,BR=4,BL=8 already matches caseIndex).
      const edgePairs = EDGE_TABLE[caseIndex];
      if (!edgePairs) continue;

      const edgeMidpoint = (edgeIdx: number): Pt => {
        switch (edgeIdx) {
          case 0: return interp(level, values[0], values[1], corners[0], corners[1]); // top
          case 1: return interp(level, values[1], values[2], corners[1], corners[2]); // right
          case 2: return interp(level, values[3], values[2], corners[3], corners[2]); // bottom
          case 3: return interp(level, values[0], values[3], corners[0], corners[3]); // left
          default: return corners[0];
        }
      };

      for (const [a, b] of edgePairs) {
        const p1 = edgeMidpoint(a);
        const p2 = edgeMidpoint(b);
        segments.push([[p1.x, p1.y], [p2.x, p2.y]]);
      }
    }
  }

  return segments;
}

// Chains disconnected segments into longer LineStrings where endpoints match,
// so the resulting GeoJSON has fewer, smoother features instead of one per cell.
function chainSegments(segments: [number, number][][], tolerance = 1e-9): [number, number][][] {
  const used = new Array(segments.length).fill(false);
  const lines: [number, number][][] = [];

  const sameNode = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let line = [...segments[i]];

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used[j]) continue;
        const [s, e] = segments[j];
        if (sameNode(line[line.length - 1], s)) {
          line.push(e);
          used[j] = true;
          extended = true;
        } else if (sameNode(line[line.length - 1], e)) {
          line.push(s);
          used[j] = true;
          extended = true;
        } else if (sameNode(line[0], e)) {
          line.unshift(s);
          used[j] = true;
          extended = true;
        } else if (sameNode(line[0], s)) {
          line.unshift(e);
          used[j] = true;
          extended = true;
        }
      }
    }
    lines.push(line);
  }

  return lines;
}

export interface ContourOptions {
  /** explicit contour levels in meters; if omitted, computed from interval */
  levels?: number[];
  /** spacing between auto-generated levels, in meters (default 25) */
  interval?: number;
}

/**
 * Generates a GeoJSON FeatureCollection of contour lines from an elevation grid.
 * Each feature carries properties.Contour = level (matches the property name
 * already used by the contours layer elsewhere in the app).
 */
export function gridToContours(
  grid: ElevationGrid,
  options: ContourOptions = {}
): GeoJSON.FeatureCollection {
  const interval = options.interval ?? 25;
  const levels =
    options.levels ??
    (() => {
      const start = Math.ceil(grid.min / interval) * interval;
      const out: number[] = [];
      for (let lvl = start; lvl <= grid.max; lvl += interval) out.push(lvl);
      return out;
    })();

  const features: GeoJSON.Feature[] = [];

  for (const level of levels) {
    const segments = extractLevelSegments(grid, level);
    if (!segments.length) continue;
    const lines = chainSegments(segments);
    for (const line of lines) {
      if (line.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line },
        properties: { Contour: level, _generated: "elevation-contour" },
      });
    }
  }

  return { type: "FeatureCollection", features };
}
