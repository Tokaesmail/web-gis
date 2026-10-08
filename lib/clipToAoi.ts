// ─── lib/clipToAoi.ts ──────────────────────────────────────────────────────────
// Clips LineString contour features to the exact AOI polygon (not just its bbox).
// Dependency-free: splits every contour segment where it crosses the AOI boundary
// and keeps only the pieces whose midpoint lies inside the polygon (holes respected).
//
// Used by both elevation contours and temperature isotherms so the lines
// end exactly on the AOI edge instead of spilling out into the padded bbox.

type Pos = [number, number];
type Ring = Pos[];
type PolygonRings = Ring[]; // [outer, ...holes]

function extractPolygons(input: any): PolygonRings[] {
  const geom = input?.type === "Feature" ? input.geometry : input;
  if (!geom) return [];
  if (geom.type === "Polygon") return [geom.coordinates as PolygonRings];
  if (geom.type === "MultiPolygon") return geom.coordinates as PolygonRings[];
  if (geom.type === "GeometryCollection") {
    return (geom.geometries ?? []).flatMap((g: any) => extractPolygons(g));
  }
  return [];
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInPolygons(x: number, y: number, polys: PolygonRings[]): boolean {
  for (const rings of polys) {
    if (!pointInRing(x, y, rings[0])) continue;
    let inHole = false;
    for (let h = 1; h < rings.length; h++) {
      if (pointInRing(x, y, rings[h])) { inHole = true; break; }
    }
    if (!inHole) return true;
  }
  return false;
}

// t along segment a→b where it crosses edge c→d (null if no proper crossing)
function segmentT(a: Pos, b: Pos, c: Pos, d: Pos): number | null {
  const rx = b[0] - a[0], ry = b[1] - a[1];
  const sx = d[0] - c[0], sy = d[1] - c[1];
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-18) return null; // parallel
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t <= 1e-12 || t >= 1 - 1e-12 || u < 0 || u > 1) return null;
  return t;
}

function clipLine(coords: Pos[], polys: PolygonRings[]): Pos[][] {
  const out: Pos[][] = [];
  let current: Pos[] = [];
  const flush = () => {
    if (current.length >= 2) out.push(current);
    current = [];
  };

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];

    const minX = Math.min(a[0], b[0]), maxX = Math.max(a[0], b[0]);
    const minY = Math.min(a[1], b[1]), maxY = Math.max(a[1], b[1]);

    const ts: number[] = [0, 1];
    for (const rings of polys) {
      for (const ring of rings) {
        for (let k = 0; k < ring.length - 1; k++) {
          const c = ring[k], d = ring[k + 1];
          if (Math.max(c[0], d[0]) < minX || Math.min(c[0], d[0]) > maxX) continue;
          if (Math.max(c[1], d[1]) < minY || Math.min(c[1], d[1]) > maxY) continue;
          const t = segmentT(a, b, c, d);
          if (t !== null) ts.push(t);
        }
      }
    }
    ts.sort((p, q) => p - q);

    for (let s = 0; s < ts.length - 1; s++) {
      const t0 = ts[s], t1 = ts[s + 1];
      if (t1 - t0 < 1e-12) continue;
      const tm = (t0 + t1) / 2;
      const mx = a[0] + (b[0] - a[0]) * tm;
      const my = a[1] + (b[1] - a[1]) * tm;
      if (pointInPolygons(mx, my, polys)) {
        const p0: Pos = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const p1: Pos = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        if (!current.length) current.push(p0);
        current.push(p1);
      } else {
        flush();
      }
    }
  }
  flush();
  return out;
}

/**
 * Clips every LineString/MultiLineString in `fc` to the AOI polygon.
 * If the AOI isn't a polygon (or is missing), returns `fc` unchanged.
 * Properties are preserved on every resulting piece.
 */
export function clipContoursToAoi(
  fc: GeoJSON.FeatureCollection,
  aoi?: GeoJSON.Feature | GeoJSON.Geometry | null
): GeoJSON.FeatureCollection {
  const polys = extractPolygons(aoi).filter((p) => p?.[0]?.length >= 4);
  if (!polys.length) return fc;

  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    const g = f.geometry as any;
    const lines: Pos[][] =
      g?.type === "LineString" ? [g.coordinates] :
      g?.type === "MultiLineString" ? g.coordinates : [];
    for (const line of lines) {
      for (const piece of clipLine(line, polys)) {
        features.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: piece },
          properties: { ...(f.properties ?? {}) },
        });
      }
    }
  }
  return { type: "FeatureCollection", features };
}

/**
 * Debug helper: compact summary of any GeoJSON (feature count, geometry types,
 * vertex count, bbox, a few sample coords/props). Safe to JSON.stringify.
 */
export function describeContours(input: any) {
  const feats: any[] =
    input?.type === "FeatureCollection" ? input.features ?? [] :
    input?.type === "Feature" ? [input] : input?.type ? [{ geometry: input, properties: {} }] : [];
  const types: Record<string, number> = {};
  let vertices = 0, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (v: any) => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number" && typeof v[1] === "number") {
      vertices++;
      if (v[0] < minX) minX = v[0];
      if (v[0] > maxX) maxX = v[0];
      if (v[1] < minY) minY = v[1];
      if (v[1] > maxY) maxY = v[1];
      return;
    }
    v.forEach(walk);
  };
  for (const f of feats) {
    const t = f?.geometry?.type ?? "null";
    types[t] = (types[t] ?? 0) + 1;
    walk(f?.geometry?.coordinates);
  }
  return {
    features: feats.length,
    types,
    vertices,
    bbox: vertices ? [minX, minY, maxX, maxY].map((n) => +n.toFixed(6)) : null,
    sampleProps: feats[0]?.properties ?? null,
    sampleCoords: feats[0]?.geometry?.coordinates
      ? JSON.stringify(feats[0].geometry.coordinates).slice(0, 220)
      : null,
  };
}