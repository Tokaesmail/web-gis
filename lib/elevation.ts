// ─── lib/elevation.ts ──────────────────────────────────────────────────────────
// Elevation lookups for contour generation.
//
// All requests go through our own proxy (app/api/elevation/route.ts), which
//   • avoids browser CORS problems,
//   • retries on 429 / 5xx,
//   • talks to Open-Meteo (Copernicus DEM 90 m), OpenTopoData (SRTM 30 m) or
//     Open-Elevation (SRTM) — one source at a time.
//
// A whole grid is always built from ONE source. If that source fails part-way,
// the grid restarts on the next source, so DEMs are never mixed in one grid.
// If every source fails, buildElevationGrid THROWS (it used to silently return an
// all-NaN grid, which produced zero contours and no error message).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface ElevationGrid {
  /** rows[y][x] = elevation in meters (NaN if lookup failed for that cell) */
  rows: number[][];
  /** longitude for each column, west → east */
  lngs: number[];
  /** latitude for each row, north → south (row 0 = north edge) */
  lats: number[];
  cols: number;
  rowsCount: number;
  bounds: { north: number; south: number; east: number; west: number };
  min: number;
  max: number;
  source: "open-meteo" | "opentopodata" | "open-elevation" | "mixed";
}

type Provider = "open-meteo" | "opentopodata" | "open-elevation";
const PROVIDER_ORDER: Provider[] = ["open-meteo", "opentopodata", "open-elevation"];

const BATCH_SIZE = 100;   // the proxy accepts at most 100 points per request
const DELAY_MS = 1100;    // ~1 request/sec — public APIs rate-limit aggressively
const MAX_RETRIES = 2;    // client-side retries on 429 / 5xx (proxy retries too)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── one batch (≤100 points) from one provider, via the proxy ─────────────────
async function fetchBatch(points: LatLng[], provider: Provider): Promise<number[]> {
  let attempt = 0;

  while (true) {
    const res = await fetch("/api/elevation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        locations: points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      }),
    });

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const ra = Number(res.headers.get("retry-after"));
      await sleep(ra > 0 ? ra * 1000 : 1500 * 2 ** attempt);
      attempt++;
      continue;
    }

    if (!res.ok) {
      let detail = "";
      try { detail = (await res.json())?.error ?? ""; } catch { /* ignore */ }
      throw new Error(`Elevation API error ${res.status}${detail ? ` — ${detail}` : ""}`);
    }

    const data = await res.json();
    const results: any[] = data?.results ?? [];
    if (results.length !== points.length) throw new Error("Elevation API returned unexpected data");
    return results.map((r) => (typeof r?.elevation === "number" ? r.elevation : NaN));
  }
}

// ── whole point list from ONE provider ────────────────────────────────────────
async function lookupWithProvider(points: LatLng[], provider: Provider): Promise<number[]> {
  const values: number[] = new Array(points.length).fill(NaN);

  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const result = await fetchBatch(batch, provider);
    for (let k = 0; k < result.length; k++) values[i + k] = result[k];
    if (i + BATCH_SIZE < points.length) await sleep(DELAY_MS);
  }

  return values;
}

/**
 * Looks up elevations for a flat list of points using a single source.
 * Throws if no source can provide data.
 */
export async function lookupElevations(
  points: LatLng[]
): Promise<{ values: number[]; source: ElevationGrid["source"] }> {
  let lastErr: Error | null = null;

  for (const provider of PROVIDER_ORDER) {
    try {
      const values = await lookupWithProvider(points, provider);
      if (values.some(Number.isFinite)) return { values, source: provider };
      lastErr = new Error(`${provider} returned no elevation data for this area`);
    } catch (e: any) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw new Error(
    `Elevation lookup failed on all sources${lastErr ? ` (last error: ${lastErr.message})` : ""}. ` +
      `Check that /api/elevation exists and try again in a moment.`
  );
}

/**
 * Builds a regular lat/lng sampling grid over a bounding box and fetches
 * elevation for every cell, ready for contour interpolation.
 *
 * @param resolution number of sample points along the longer side (8–40 recommended)
 */
export async function buildElevationGrid(
  bounds: { north: number; south: number; east: number; west: number },
  resolution = 20
): Promise<ElevationGrid> {
  const latSpan = Math.max(bounds.north - bounds.south, 1e-6);
  const lngSpan = Math.max(bounds.east - bounds.west, 1e-6);

  // Keep cells roughly square: scale rows/cols by aspect ratio, clamp to sane bounds.
  // 1 deg of longitude = cos(lat) * 1 deg of latitude on the ground, so correct the aspect
  // ratio or the cells come out ~13 % too wide at Egypt's latitudes (wrong interpolation spacing).
  const midLat = (bounds.north + bounds.south) / 2;
  const aspect = (lngSpan * Math.cos((midLat * Math.PI) / 180)) / latSpan;
  let cols = aspect >= 1 ? resolution : Math.max(4, Math.round(resolution * aspect));
  let rowsCount = aspect >= 1 ? Math.max(4, Math.round(resolution / aspect)) : resolution;
  cols = Math.min(40, Math.max(4, cols));
  rowsCount = Math.min(40, Math.max(4, rowsCount));

  const lngs = Array.from({ length: cols }, (_, x) => bounds.west + (lngSpan * x) / (cols - 1));
  const lats = Array.from({ length: rowsCount }, (_, y) => bounds.north - (latSpan * y) / (rowsCount - 1));

  const points: LatLng[] = [];
  for (let y = 0; y < rowsCount; y++) {
    for (let x = 0; x < cols; x++) {
      points.push({ lat: lats[y], lng: lngs[x] });
    }
  }

  const { values, source } = await lookupElevations(points);

  const rows: number[][] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < rowsCount; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      const v = values[y * cols + x];
      row.push(v);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    rows.push(row);
  }

  // lookupElevations guarantees at least one finite value, so min/max are real here
  return fillGridGaps({ rows, lngs, lats, cols, rowsCount, bounds, min, max, source });
}


/**
 * Replaces NaN cells (failed lookups, sea/no-data cells) with the average of their
 * valid neighbours, then recomputes min/max. Marching squares can't interpolate across
 * NaN: it drops those cells or emits NaN coordinates, which gives wrong lines, or lines
 * that never show up on the basemap. Works on any numeric grid. Mutates and returns it.
 */
export function fillGridGaps<T extends { rows: number[][]; min: number; max: number }>(grid: T): T {
  const rows = grid.rows;
  const H = rows.length;
  const W = H ? rows[0].length : 0;
  const finite: number[] = [];
  rows.forEach((r) => r.forEach((v) => { if (Number.isFinite(v)) finite.push(v); }));
  if (!finite.length) return grid;
  const mean = finite.reduce((a, b) => a + b, 0) / finite.length;
  const DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

  for (let pass = 0; pass < W + H; pass++) {
    let missing = 0;
    const patch: Array<[number, number, number]> = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (Number.isFinite(rows[y][x])) continue;
        let sum = 0, n = 0;
        for (const [dy, dx] of DIRS) {
          const v = rows[y + dy]?.[x + dx];
          if (Number.isFinite(v)) { sum += v; n++; }
        }
        if (n) patch.push([y, x, sum / n]); else missing++;
      }
    }
    patch.forEach(([y, x, v]) => { rows[y][x] = v; });
    if (!missing) break;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!Number.isFinite(rows[y][x])) rows[y][x] = mean;

  let min = Infinity, max = -Infinity;
  rows.forEach((r) => r.forEach((v) => { if (v < min) min = v; if (v > max) max = v; }));
  grid.min = min;
  grid.max = max;
  return grid;
}

/** Drops features with empty / non-finite coordinates so Leaflet never receives NaN. */
export function sanitizeContours(fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection {
  const ok = (c: any): boolean =>
    Array.isArray(c)
      ? typeof c[0] === "number" ? c.every(Number.isFinite) : c.length > 0 && c.every(ok)
      : false;
  return { ...fc, features: fc.features.filter((f) => f.geometry && ok((f.geometry as any).coordinates)) };
}