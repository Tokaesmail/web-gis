// ─── lib/demTools.ts ────────────────────────────────────────────────────────────
// Pure functions for the DEM visualization tools. Everything here works on the
// ElevationGrid that lib/elevation.ts already builds, so there is ONE source DEM
// and every tool is derived from it (the original grid is never modified).
//
//   Color ramp · Hillshade · Slope · Aspect · Contour · Multi-directional
//   hillshade · Curvature
//
// Slope / aspect use Horn's 3×3 method (same as GDAL / QGIS / ArcGIS).
// Curvature uses the Zevenbergen–Thorne 3×3 formula (same sign convention as
// ArcGIS: positive = convex ridge/crest, negative = concave valley).

import type { ElevationGrid } from "./elevation";

export type RGB = [number, number, number];
export type DemToolId =
  | "colorramp"
  | "hillshade"
  | "slope"
  | "aspect"
  | "contour"
  | "multihill"
  | "curvature";
export type RasterTool = Exclude<DemToolId, "contour">;
export type RampId = "hypsometric" | "terrain" | "viridis" | "heat" | "gray";

// ── color ramps ──────────────────────────────────────────────────────────────
export const RAMPS: Record<RampId, { label: string; stops: string[] }> = {
  hypsometric: { label: "Hypsometric", stops: ["#2f7d4f", "#8cc269", "#ead98a", "#c4955c", "#8b5e3c", "#f4f1ec"] },
  terrain: { label: "Terrain", stops: ["#3b6fb6", "#47a8a0", "#86c46e", "#e9dc7e", "#b98a5a", "#ffffff"] },
  viridis: { label: "Viridis", stops: ["#440154", "#3b528b", "#21918c", "#5ec962", "#fde725"] },
  heat: { label: "Heat", stops: ["#1e1b4b", "#7e22ce", "#e11d48", "#fb923c", "#fde68a"] },
  gray: { label: "Gray", stops: ["#18202b", "#6b7686", "#e8edf3"] },
};
export const RAMP_IDS = Object.keys(RAMPS) as RampId[];

export const SLOPE_HEX = ["#e8f5b8", "#b5dd7e", "#f6c85f", "#ef7b45", "#b3202f"];
export const CURV_HEX = ["#2563eb", "#8fb8f5", "#eef2f7", "#f7b980", "#dc2626"];

export const stopsCss = (hex: string[]) => `linear-gradient(to right, ${hex.join(", ")})`;
export const rampCss = (id: RampId, reverse = false) =>
  stopsCss(reverse ? [...RAMPS[id].stops].reverse() : RAMPS[id].stops);
export const SLOPE_CSS = stopsCss(SLOPE_HEX);
export const CURV_CSS = stopsCss(CURV_HEX);
export const ASPECT_CSS = `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
  .map((h) => `hsl(${h} 62% 55%)`)
  .join(", ")})`;

const hexToRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = ([r, g, b]: RGB) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function sampleStops(stops: RGB[], t: number): RGB {
  const tt = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const s = tt * (stops.length - 1);
  const i = Math.min(Math.floor(s), stops.length - 2);
  const f = s - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
export const rampStops = (id: RampId, reverse = false): RGB[] => {
  const s = RAMPS[id].stops.map(hexToRgb);
  return reverse ? s.reverse() : s;
};

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function niceInterval(range: number, targetLevels = 8) {
  const NICE = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  const raw = range / targetLevels;
  return NICE.find((n) => n >= raw) ?? NICE[NICE.length - 1];
}

function percentile(vals: number[], p: number) {
  const s = vals.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
}
const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compassOf = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

/** Ground size of one grid cell in meters (x = east-west, y = north-south). */
export function cellSizeMeters(grid: ElevationGrid) {
  const midLat = (grid.bounds.north + grid.bounds.south) / 2;
  const dLng = Math.abs(grid.lngs[1] - grid.lngs[0]);
  const dLat = Math.abs(grid.lats[0] - grid.lats[1]);
  return {
    dx: Math.max(dLng * 111320 * Math.cos((midLat * Math.PI) / 180), 1),
    dy: Math.max(dLat * 110574, 1),
  };
}

// ── derivatives (computed once per grid) ─────────────────────────────────────
export interface Derivs {
  /** dz/dEast (m per m) */
  dzE: number[][];
  /** dz/dNorth (m per m) */
  dzN: number[][];
  /** Esri-style total curvature (1/100 m) */
  curv: number[][];
}

export function computeDerivs(grid: ElevationGrid): Derivs {
  const rows = grid.rows;
  const H = rows.length;
  const W = rows[0].length;
  const { dx, dy } = cellSizeMeters(grid);
  const at = (y: number, x: number) => rows[clamp(y, 0, H - 1)][clamp(x, 0, W - 1)];
  const dzE: number[][] = [];
  const dzN: number[][] = [];
  const curv: number[][] = [];

  for (let y = 0; y < H; y++) {
    const rE: number[] = [];
    const rN: number[] = [];
    const rC: number[] = [];
    for (let x = 0; x < W; x++) {
      const a = at(y - 1, x - 1), b = at(y - 1, x), c = at(y - 1, x + 1);
      const d = at(y, x - 1), e = at(y, x), f = at(y, x + 1);
      const g = at(y + 1, x - 1), h = at(y + 1, x), i = at(y + 1, x + 1);
      rE.push(((c + 2 * f + i) - (a + 2 * d + g)) / (8 * dx));
      rN.push(((a + 2 * b + c) - (g + 2 * h + i)) / (8 * dy));
      const D = ((d + f) / 2 - e) / (dx * dx);
      const E = ((b + h) / 2 - e) / (dy * dy);
      rC.push(-2 * (D + E) * 100);
    }
    dzE.push(rE);
    dzN.push(rN);
    curv.push(rC);
  }
  return { dzE, dzN, curv };
}

/** Lambert hillshade 0..1. azimuth = compass degrees clockwise from north. */
function shade(d: Derivs, az: number, alt: number, z: number): number[][] {
  const azr = (az * Math.PI) / 180;
  const alr = (alt * Math.PI) / 180;
  const Lx = Math.sin(azr) * Math.cos(alr);
  const Ly = Math.cos(azr) * Math.cos(alr);
  const Lz = Math.sin(alr);
  return d.dzE.map((row, y) =>
    row.map((e0, x) => {
      const e = e0 * z;
      const n = d.dzN[y][x] * z;
      return Math.max(0, (-e * Lx - n * Ly + Lz) / Math.sqrt(1 + e * e + n * n));
    })
  );
}

// ── derived raster ───────────────────────────────────────────────────────────
export interface RasterOptions {
  ramp: RampId;
  reverse: boolean;
  azimuth: number;
  altitude: number;
  zFactor: number;
  slopeUnit: "deg" | "pct";
  blend: boolean;
}

export interface DerivedRaster {
  values: number[][];
  colors: (RGB | null)[][];
  min: number;
  max: number;
  legend: { css: string; ticks: { t: number; label: string }[] };
  stats: { l: string; v: string }[];
  format: (v: number) => string;
}

const GRAY = (v: number): RGB => [v * 255, v * 255, v * 255];
const finiteRange = (m: number[][]): [number, number] => {
  let lo = Infinity, hi = -Infinity;
  m.forEach((r) => r.forEach((v) => { if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }));
  return lo === Infinity ? [0, 0] : [lo, hi];
};

export function buildRaster(grid: ElevationGrid, d: Derivs, tool: RasterTool, o: RasterOptions): DerivedRaster {
  const flat = (m: number[][]) => m.flat().filter(Number.isFinite);

  if (tool === "colorramp") {
    const span = Math.max(grid.max - grid.min, 1e-6);
    const stops = rampStops(o.ramp, o.reverse);
    const sh = o.blend ? shade(d, 315, 45, o.zFactor) : null;
    const colors = grid.rows.map((row, y) =>
      row.map((v, x): RGB => {
        const c = sampleStops(stops, (v - grid.min) / span);
        if (!sh) return c;
        const f = 0.35 + 0.9 * sh[y][x]; // flat ground (0.707) ≈ ×1
        return [c[0] * f, c[1] * f, c[2] * f];
      })
    );
    return {
      values: grid.rows,
      colors,
      min: grid.min,
      max: grid.max,
      legend: {
        css: rampCss(o.ramp, o.reverse),
        ticks: [
          { t: 0, label: `${Math.round(grid.min)} m` },
          { t: 0.5, label: `${Math.round((grid.min + grid.max) / 2)} m` },
          { t: 1, label: `${Math.round(grid.max)} m` },
        ],
      },
      stats: [
        { l: "Lowest", v: `${grid.min.toFixed(0)} m` },
        { l: "Highest", v: `${grid.max.toFixed(0)} m` },
        { l: "Relief", v: `${(grid.max - grid.min).toFixed(0)} m` },
      ],
      format: (v) => `${v.toFixed(0)} m`,
    };
  }

  if (tool === "hillshade" || tool === "multihill") {
    const values =
      tool === "hillshade"
        ? shade(d, o.azimuth, o.altitude, o.zFactor)
        : [225, 270, 315, 360]
            .map((az) => shade(d, az, o.altitude, o.zFactor))
            .reduce((acc, m) => acc.map((row, y) => row.map((v, x) => v + m[y][x] / 4)), shade(d, 0, 90, 0).map((r) => r.map(() => 0)));
    return {
      values,
      colors: values.map((r) => r.map((v) => GRAY(v))),
      min: 0,
      max: 1,
      legend: {
        css: "linear-gradient(to right, #000, #fff)",
        ticks: [{ t: 0, label: "Shadow" }, { t: 1, label: "Lit" }],
      },
      stats:
        tool === "hillshade"
          ? [
              { l: "Light from", v: `${Math.round(o.azimuth)}° ${compassOf(o.azimuth)}` },
              { l: "Sun height", v: `${Math.round(o.altitude)}°` },
              { l: "Exaggeration", v: `×${o.zFactor}` },
            ]
          : [
              { l: "Light from", v: "4 sides" },
              { l: "Sun height", v: `${Math.round(o.altitude)}°` },
              { l: "Exaggeration", v: `×${o.zFactor}` },
            ],
      format: (v) => `${Math.round(v * 255)} / 255`,
    };
  }

  if (tool === "slope") {
    const deg = d.dzE.map((row, y) => row.map((e, x) => (Math.atan(Math.hypot(e, d.dzN[y][x])) * 180) / Math.PI));
    const values = o.slopeUnit === "deg" ? deg : d.dzE.map((row, y) => row.map((e, x) => Math.hypot(e, d.dzN[y][x]) * 100));
    const unit = o.slopeUnit === "deg" ? "°" : "%";
    const all = flat(values);
    const top = Math.max(percentile(all, 0.98), o.slopeUnit === "deg" ? 2 : 3);
    const stops = SLOPE_HEX.map(hexToRgb);
    const steep = flat(deg).filter((v) => v > 30).length / Math.max(all.length, 1);
    const [, hi] = finiteRange(values);
    return {
      values,
      colors: values.map((r) => r.map((v) => sampleStops(stops, v / top))),
      min: 0,
      max: hi,
      legend: {
        css: SLOPE_CSS,
        ticks: [
          { t: 0, label: `0${unit}` },
          { t: 0.5, label: `${(top / 2).toFixed(top < 10 ? 1 : 0)}${unit}` },
          { t: 1, label: `≥${top.toFixed(top < 10 ? 1 : 0)}${unit}` },
        ],
      },
      stats: [
        { l: "Average", v: `${mean(all).toFixed(1)}${unit}` },
        { l: "Steepest", v: `${hi.toFixed(1)}${unit}` },
        { l: "Over 30°", v: `${(steep * 100).toFixed(0)}%` },
      ],
      format: (v) => `${v.toFixed(1)}${unit}`,
    };
  }

  if (tool === "aspect") {
    const values = d.dzE.map((row, y) =>
      row.map((e, x) => {
        const n = d.dzN[y][x];
        if (Math.hypot(e, n) < 1e-7) return NaN; // flat: no direction
        return ((Math.atan2(-e, -n) * 180) / Math.PI + 360) % 360;
      })
    );
    const counts = new Array(8).fill(0);
    let flatCount = 0;
    values.forEach((r) => r.forEach((v) => (Number.isFinite(v) ? counts[Math.round(v / 45) % 8]++ : flatCount++)));
    const total = values.length * values[0].length;
    const top = counts.indexOf(Math.max(...counts));
    return {
      values,
      colors: values.map((r) => r.map((v): RGB => (Number.isFinite(v) ? hslToRgb(v, 0.62, 0.55) : [71, 85, 105]))),
      min: 0,
      max: 360,
      legend: {
        css: ASPECT_CSS,
        ticks: [
          { t: 0, label: "N" },
          { t: 0.25, label: "E" },
          { t: 0.5, label: "S" },
          { t: 0.75, label: "W" },
          { t: 1, label: "N" },
        ],
      },
      stats: [
        { l: "Most faces", v: Math.max(...counts) ? COMPASS[top] : "—" },
        { l: "Flat cells", v: `${((flatCount / total) * 100).toFixed(0)}%` },
        { l: "Cells", v: String(total) },
      ],
      format: (v) => (Number.isFinite(v) ? `${Math.round(v)}° ${compassOf(v)}` : "Flat"),
    };
  }

  // curvature
  const values = d.curv;
  const m = Math.max(percentile(flat(values).map(Math.abs), 0.98), 1e-9);
  const stops = CURV_HEX.map(hexToRgb);
  const all = flat(values);
  const eps = m * 0.05;
  const share = (fn: (v: number) => boolean) => `${((all.filter(fn).length / Math.max(all.length, 1)) * 100).toFixed(0)}%`;
  const [lo, hi] = finiteRange(values);
  return {
    values,
    colors: values.map((r) => r.map((v) => sampleStops(stops, 0.5 + 0.5 * clamp(v / m, -1, 1)))),
    min: lo,
    max: hi,
    legend: {
      css: CURV_CSS,
      ticks: [{ t: 0, label: "Valley" }, { t: 0.5, label: "Flat" }, { t: 1, label: "Ridge" }],
    },
    stats: [
      { l: "Ridge cells", v: share((v) => v > eps) },
      { l: "Valley cells", v: share((v) => v < -eps) },
      { l: "Flat cells", v: share((v) => Math.abs(v) <= eps) },
    ],
    format: (v) => `${v.toFixed(2)} ${v > 0 ? "(convex)" : v < 0 ? "(concave)" : ""}`.trim(),
  };
}

// ── contours colored by elevation ────────────────────────────────────────────
function firstCoord(geom: any): [number, number] | null {
  let c = geom?.coordinates;
  while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
  return Array.isArray(c) && typeof c[0] === "number" ? [c[0], c[1]] : null;
}

/** Bilinear elevation lookup at a lng/lat. */
export function sampleGrid(grid: ElevationGrid, lng: number, lat: number): number {
  const W = grid.cols, H = grid.rowsCount;
  const fx = clamp(((lng - grid.lngs[0]) / (grid.lngs[W - 1] - grid.lngs[0])) * (W - 1), 0, W - 1);
  const fy = clamp(((grid.lats[0] - lat) / (grid.lats[0] - grid.lats[H - 1])) * (H - 1), 0, H - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
  const tx = fx - x0, ty = fy - y0;
  const r = grid.rows;
  return (
    r[y0][x0] * (1 - tx) * (1 - ty) + r[y0][x1] * tx * (1 - ty) + r[y1][x0] * (1 - tx) * ty + r[y1][x1] * tx * ty
  );
}

const LEVEL_KEYS = ["elevation", "ELEV", "elev", "level", "value", "height", "ele", "z"];
function readLevel(f: GeoJSON.Feature, grid: ElevationGrid, interval: number): number {
  const p: any = f.properties ?? {};
  for (const k of LEVEL_KEYS) if (typeof p[k] === "number" && Number.isFinite(p[k])) return p[k];
  // Contour generator didn't tag the line: read the DEM under its first vertex.
  const c = firstCoord(f.geometry);
  return c ? Math.round(sampleGrid(grid, c[0], c[1]) / interval) * interval : grid.min;
}

export function colorizeContours(
  fc: GeoJSON.FeatureCollection,
  grid: ElevationGrid,
  o: { interval: number; ramp: RampId; reverse: boolean; index: boolean }
): GeoJSON.FeatureCollection {
  const stops = rampStops(o.ramp, o.reverse);
  const span = Math.max(grid.max - grid.min, 1e-6);
  return {
    ...fc,
    features: fc.features.map((f) => {
      const level = readLevel(f, grid, o.interval);
      const color = rgbToHex(sampleStops(stops, (level - grid.min) / span));
      const isIndex = o.index && Math.round(level / o.interval) % 5 === 0;
      return {
        ...f,
        properties: {
          ...(f.properties ?? {}),
          elevation: level,
          Contour: level, // LeafletMap shows "<Contour> m" in the line tooltip
          // LeafletMap draws this tag on its dedicated top SVG pane and "Clear analysis" removes it
          _generated: "elevation-contour",
          _color: color, // LeafletMap reads _color first
          _keepColor: true, // MapClient must NOT replace _color with the layer color
          color,
          stroke: color,
          "stroke-width": isIndex ? 2 : 1,
          "stroke-opacity": 1,
          index: isIndex,
        },
      };
    }),
  };
}

// ── raster → GeoJSON polygons (so a raster result can go to the map) ─────────
export function pointInFeature(lng: number, lat: number, feature?: GeoJSON.Feature | null): boolean {
  const g: any = feature?.geometry;
  if (!g) return true;
  const inRing = (ring: number[][]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const inPoly = (rings: number[][][]) => rings.reduce((acc, r) => acc !== inRing(r), false);
  if (g.type === "Polygon") return inPoly(g.coordinates);
  if (g.type === "MultiPolygon") return g.coordinates.some(inPoly);
  return true;
}

export function rasterToPolygons(
  grid: ElevationGrid,
  raster: DerivedRaster,
  aoi: GeoJSON.Feature | null | undefined,
  tool: string
): GeoJSON.FeatureCollection {
  const dLng = Math.abs(grid.lngs[1] - grid.lngs[0]);
  const dLat = Math.abs(grid.lats[0] - grid.lats[1]);

  const build = (useAoi: boolean) => {
    const features: GeoJSON.Feature[] = [];
    for (let y = 0; y < grid.rowsCount; y++) {
      for (let x = 0; x < grid.cols; x++) {
        const rgb = raster.colors[y][x];
        if (!rgb) continue;
        const lng = grid.lngs[x];
        const lat = grid.lats[y];
        if (useAoi && !pointInFeature(lng, lat, aoi)) continue;
        const hex = rgbToHex(rgb);
        const v = raster.values[y][x];
        const w = lng - dLng / 2, e = lng + dLng / 2, s = lat - dLat / 2, n = lat + dLat / 2;
        features.push({
          type: "Feature",
          properties: {
            tool,
            value: Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null,
            elevation: grid.rows[y][x],
            _color: hex,
            _fillColor: hex,
            _fillOpacity: 0.85,
            _weight: 0.5,
            _keepColor: true,
            color: hex,
            fill: hex,
            "fill-opacity": 0.8,
            stroke: hex,
            "stroke-width": 0.5,
            "stroke-opacity": 0.8,
          },
          geometry: { type: "Polygon", coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]] },
        });
      }
    }
    return features;
  };

  let features = build(true);
  if (!features.length) features = build(false); // AOI smaller than one cell → keep everything
  return { type: "FeatureCollection", features };
}