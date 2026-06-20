// ─── lib/temperatureGrid.ts ─────────────────────────────────────────────────
// Builds a regular lat/lng sampling grid of *current temperature* over a
// bounding box, ready for the same marching-squares contour interpolation
// already used for elevation (lib/marchingSquares.ts).
//
// Data source: Open-Meteo /v1/forecast (current=temperature_2m), same API
// already used everywhere else in this app (LivePanels.tsx, CropsPanel.tsx,
// ElevationContourPanel.tsx itself). Open-Meteo doesn't support multi-point
// batching the way /v1/elevation does, so points are fetched with a small
// concurrency pool to stay reasonably fast without hammering the API.

export interface TemperatureGrid {
  /** rows[y][x] = temperature in °C (NaN if lookup failed for that cell) */
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
  source: "open-meteo";
  /** ISO timestamp of the sample (from the first successful cell) */
  sampledAt: string | null;
}

interface LatLng {
  lat: number;
  lng: number;
}

async function fetchPointTemperature(point: LatLng): Promise<{ value: number; time: string | null }> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${point.lat.toFixed(5)}&longitude=${point.lng.toFixed(5)}` +
      `&current=temperature_2m&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) return { value: NaN, time: null };
    const data = await res.json();
    const value = data?.current?.temperature_2m;
    const time = data?.current?.time ?? null;
    return { value: typeof value === "number" ? value : NaN, time };
  } catch {
    return { value: NaN, time: null };
  }
}

// Run point lookups with limited concurrency so a 12x12+ grid doesn't fire
// hundreds of simultaneous requests at Open-Meteo.
async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
  return results;
}

/**
 * Builds a regular lat/lng sampling grid over a bounding box and fetches
 * current temperature for every cell, ready for contour interpolation.
 *
 * @param resolution number of sample points along the longer side (recommend 4-14;
 *   this is much more expensive per-cell than elevation since Open-Meteo
 *   doesn't batch points, so keep this lower than the elevation grid resolution)
 * @param concurrency how many simultaneous point lookups to run (default 6)
 */
export async function buildTemperatureGrid(
  bounds: { north: number; south: number; east: number; west: number },
  resolution = 8,
  concurrency = 6
): Promise<TemperatureGrid> {
  const latSpan = Math.max(bounds.north - bounds.south, 1e-6);
  const lngSpan = Math.max(bounds.east - bounds.west, 1e-6);

  const aspect = lngSpan / latSpan;
  let cols = aspect >= 1 ? resolution : Math.max(3, Math.round(resolution * aspect));
  let rowsCount = aspect >= 1 ? Math.max(3, Math.round(resolution / aspect)) : resolution;
  cols = Math.min(16, Math.max(3, cols));
  rowsCount = Math.min(16, Math.max(3, rowsCount));

  const lngs = Array.from({ length: cols }, (_, x) => bounds.west + (lngSpan * x) / (cols - 1));
  const lats = Array.from({ length: rowsCount }, (_, y) => bounds.north - (latSpan * y) / (rowsCount - 1));

  const points: LatLng[] = [];
  for (let y = 0; y < rowsCount; y++) {
    for (let x = 0; x < cols; x++) {
      points.push({ lat: lats[y], lng: lngs[x] });
    }
  }

  const fetched = await withConcurrency(points, concurrency, fetchPointTemperature);

  const rows: number[][] = [];
  let min = Infinity;
  let max = -Infinity;
  let sampledAt: string | null = null;

  for (let y = 0; y < rowsCount; y++) {
    const row: number[] = [];
    for (let x = 0; x < cols; x++) {
      const cell = fetched[y * cols + x];
      const v = cell?.value ?? NaN;
      row.push(v);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
        if (!sampledAt && cell?.time) sampledAt = cell.time;
      }
    }
    rows.push(row);
  }

  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  return { rows, lngs, lats, cols, rowsCount, bounds, min, max, source: "open-meteo", sampledAt };
}
