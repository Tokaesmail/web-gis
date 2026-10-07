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

type Sample = { value: number; time: string | null };
const NAN_SAMPLE: Sample = { value: NaN, time: null };

const BATCH_SIZE = 50;     // Open-Meteo accepts comma-separated coordinates in ONE request
const BATCH_DELAY_MS = 250;
const MAX_RETRIES = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// One request for up to BATCH_SIZE points (Open-Meteo returns an array for multi-point
// requests, a single object for one point). The old code fired one request PER cell with
// no retry, so 429 rate-limits silently turned cells into NaN -> missing / wrong isotherms.
async function fetchBatchTemperature(points: LatLng[]): Promise<Sample[]> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${points.map((p) => p.lat.toFixed(5)).join(",")}` +
    `&longitude=${points.map((p) => p.lng.toFixed(5)).join(",")}` +
    `&current=temperature_2m&timezone=auto`;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        await sleep(1200 * 2 ** attempt);
        continue;
      }
      if (!res.ok) return points.map(() => NAN_SAMPLE);
      const data = await res.json();
      const list: any[] = Array.isArray(data) ? data : [data];
      if (list.length !== points.length) return points.map(() => NAN_SAMPLE);
      return list.map((d) => {
        const v = d?.current?.temperature_2m;
        return { value: typeof v === "number" ? v : NaN, time: d?.current?.time ?? null };
      });
    } catch {
      await sleep(800 * 2 ** attempt);
    }
  }
  return points.map(() => NAN_SAMPLE);
}

async function fetchAllTemperatures(points: LatLng[]): Promise<Sample[]> {
  const out: Sample[] = [];
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    out.push(...(await fetchBatchTemperature(points.slice(i, i + BATCH_SIZE))));
    if (i + BATCH_SIZE < points.length) await sleep(BATCH_DELAY_MS);
  }
  return out;
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
  _concurrency = 6 // kept for backwards compatibility (requests are now batched)
): Promise<TemperatureGrid> {
  const latSpan = Math.max(bounds.north - bounds.south, 1e-6);
  const lngSpan = Math.max(bounds.east - bounds.west, 1e-6);

  const midLat = (bounds.north + bounds.south) / 2;
  const aspect = (lngSpan * Math.cos((midLat * Math.PI) / 180)) / latSpan;
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

  const fetched = await fetchAllTemperatures(points);
  if (!fetched.some((c) => Number.isFinite(c.value))) {
    throw new Error("Open-Meteo returned no temperature data (rate-limited?). Try again in a moment.");
  }

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