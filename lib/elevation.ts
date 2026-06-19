// ─── lib/elevation.ts ──────────────────────────────────────────────────────────
// Elevation lookups for contour generation.
//
// Primary:  Open-Meteo  /v1/elevation   (Copernicus DEM GLO-90, no published rate cap)
// Fallback: Open-Elevation /api/v1/lookup (SRTM-based, free up to 1000 req/month)
//
// Both accept batched point queries, so we always fetch a full sample grid in one
// or two HTTP calls instead of one call per point.

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
  source: "open-meteo" | "open-elevation" | "mixed";
}

// ── Open-Meteo batch lookup ──────────────────────────────────────────────────
// GET https://api.open-meteo.com/v1/elevation?latitude=1,2,3&longitude=4,5,6
async function fetchOpenMeteoElevations(points: LatLng[]): Promise<number[] | null> {
  try {
    const lat = points.map((p) => p.lat.toFixed(6)).join(",");
    const lng = points.map((p) => p.lng.toFixed(6)).join(",");
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lng}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.elevation)) return null;
    return data.elevation.map((v: unknown) => (typeof v === "number" ? v : NaN));
  } catch {
    return null;
  }
}

// ── Open-Elevation batch lookup (POST, no query-length limit) ───────────────
async function fetchOpenElevationElevations(points: LatLng[]): Promise<number[] | null> {
  try {
    const res = await fetch("https://api.open-elevation.com/api/v1/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.results)) return null;
    return data.results.map((r: any) => (typeof r?.elevation === "number" ? r.elevation : NaN));
  } catch {
    return null;
  }
}

// Open-Meteo's GET URL can get long with big grids — chunk requests safely.
const CHUNK_SIZE = 90;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Looks up elevations for a flat list of points.
 * Tries Open-Meteo first (chunked), falls back to Open-Elevation per failed chunk.
 */
export async function lookupElevations(
  points: LatLng[]
): Promise<{ values: number[]; source: ElevationGrid["source"] }> {
  const chunks = chunk(points, CHUNK_SIZE);
  const values: number[] = new Array(points.length).fill(NaN);
  let usedMeteo = false;
  let usedFallback = false;

  for (let c = 0; c < chunks.length; c++) {
    const offset = c * CHUNK_SIZE;
    const batch = chunks[c];

    let result = await fetchOpenMeteoElevations(batch);
    if (result) {
      usedMeteo = true;
    } else {
      result = await fetchOpenElevationElevations(batch);
      if (result) usedFallback = true;
    }

    if (result) {
      for (let i = 0; i < result.length; i++) values[offset + i] = result[i];
    }
  }

  const source: ElevationGrid["source"] =
    usedMeteo && usedFallback ? "mixed" : usedFallback ? "open-elevation" : "open-meteo";

  return { values, source };
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
  const aspect = lngSpan / latSpan;
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

  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  return { rows, lngs, lats, cols, rowsCount, bounds, min, max, source };
}
