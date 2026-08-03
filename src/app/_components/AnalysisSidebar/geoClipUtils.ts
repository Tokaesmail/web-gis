// ─── geoClipUtils.ts ─────────────────────────────────────────────────────────
// Shared helper: clips a rectangular image (covering a known lat/lng bounding
// box) down to the exact outline of a drawn polygon. Pure client-side canvas
// masking — no pixel values are read or recomputed, only what's visible
// changes. Used by both PlanetaryRasterPanel (expression results) and
// SatelliteDataPanel (plain scene previews) so a selected AOI always shows
// as its real shape instead of a rectangle.

/** Converts a circle (center lat/lng in degrees + radius in meters) into a
 * closed ring of [lng,lat] points, using the same geodesic-offset approach
 * PlanetaryRasterPanel uses when it builds the geometry sent to the backend —
 * kept in sync so the client-side clip matches the server-side mask exactly. */
function circleToRing(lat: number, lng: number, radiusMeters: number, points = 64): [number, number][] {
  const EARTH_RADIUS = 6371008.8; // متوسط نصف قطر الأرض بالمتر
  const latRad = (lat * Math.PI) / 180;
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const bearing = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters * Math.cos(bearing)) / EARTH_RADIUS;
    const dLng = (radiusMeters * Math.sin(bearing)) / (EARTH_RADIUS * Math.cos(latRad));
    const ptLat = lat + (dLat * 180) / Math.PI;
    const ptLng = lng + (dLng * 180) / Math.PI;
    ring.push([ptLng, ptLat]);
  }
  return ring;
}

/** Removes consecutive duplicate/near-duplicate points from a ring. A
 * free-hand drawn polygon (many clicks close together) can end up with
 * repeated or degenerate points that make ctx.clip() draw a broken or empty
 * path — circles and rectangles never hit this since their rings are
 * generated programmatically and are always well-formed. */
function sanitizeRing(ring: [number, number][]): [number, number][] {
  const cleaned: [number, number][] = [];
  for (const pt of ring) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const [lng, lat] = pt;
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && Math.abs(prev[0] - lng) < 1e-9 && Math.abs(prev[1] - lat) < 1e-9) continue;
    cleaned.push([lng, lat]);
  }
  return cleaned;
}

/** Rough signed area (shoelace) of a ring, used only to pick the biggest
 * polygon out of a MultiPolygon — not a precise geodesic area. */
function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Returns the outer ring of a Polygon/MultiPolygon as [lng,lat] pairs, or
 * null if the feature isn't a polygon (e.g. a point or a plain map-view
 * fallback) — clipping only makes sense for an actual drawn shape. */
export function getPolygonRing(feature?: GeoJSON.Feature | null): [number, number][] | null {
  const g = feature?.geometry as any;
  if (!g) return null;

  if (g.type === "Polygon" && Array.isArray(g.coordinates?.[0])) {
    const ring = sanitizeRing(g.coordinates[0] as [number, number][]);
    if (ring.length < 3) {
      console.warn("[geoClipUtils] Polygon geometry had too few usable points after cleanup — falling back to unclipped image.", g);
      return null;
    }
    return ring;
  }

  // ⚠️ A free-hand drawn polygon with a lot of clicked points can end up
  // self-intersecting (a stray click crossing an earlier edge). Some AOI
  // validation/normalization steps upstream split that into a MultiPolygon
  // of several sub-rings. Previously only coordinates[0][0] (the *first*
  // sub-polygon) was ever used, which could be a sliver rather than the
  // shape the user actually drew/expected — visually this looked exactly
  // like "clip isn't happening" for hand-drawn polygons while circles and
  // rectangles (always simple, single-ring Polygons) worked fine. Now we
  // pick the sub-ring with the largest area, i.e. the main shape.
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates)) {
    const candidateRings: [number, number][][] = (g.coordinates as any[])
      .map((poly) => (Array.isArray(poly?.[0]) ? sanitizeRing(poly[0]) : null))
      .filter((ring): ring is [number, number][] => !!ring && ring.length >= 3);

    if (!candidateRings.length) {
      console.warn("[geoClipUtils] MultiPolygon geometry had no usable rings — falling back to unclipped image.", g);
      return null;
    }

    return candidateRings.reduce((best, ring) => (ringArea(ring) > ringArea(best) ? ring : best));
  }

  // Circle: usually stored as a Point + a radius (meters) — either inside
  // `properties` (common with leaflet-draw / geoman) or next to the
  // coordinates themselves. Without this, circles never got a ring and
  // clipImageToPolygon() silently left them as an unclipped rectangle.
  const radius: number | undefined =
    (feature as any)?.properties?.radius ??
    (feature as any)?.properties?.circleRadius ??
    (g as any)?.radius;

  if (g.type === "Point" && Array.isArray(g.coordinates) && typeof radius === "number" && radius > 0) {
    const [lng, lat] = g.coordinates as [number, number];
    return circleToRing(lat, lng, radius);
  }

  // Anything else (plain Point with no radius, LineString from the "measure"
  // tool, missing geometry, etc.) genuinely has no shape to clip to — return
  // null on purpose, but log it so "why didn't my shape clip?" is
  // debuggable instead of a silent no-op.
  console.warn(`[geoClipUtils] getPolygonRing(): no ring could be derived for geometry type "${g.type}" — image will show unclipped.`, g);
  return null;
}

/** أعلى حجم (عرض×طول) مسموح بيه قبل ما نحاول نعمل canvas clip. الصور الجاية
 * من route.ts (الباك اند بتاعنا) بتبقى محدودة بـ 1024px أقصى حد على أي ضلع،
 * فـ 2000×2000 هنا سقف أمان واسع بما يكفي مع مفيش أي هامش تانى فعلي. لو أي
 * مسار fallback (scene.itemUrl / rawAssetUrl الخام) رجّع صورة أكبر من كده،
 * canvas.toDataURL() السينكرونس هيجمّد التاب فعليًا لحد ما يخلص الـ PNG
 * encode — فبنرفض نعمل clip على الصورة دي أصلًا ونرجّع الأصل زي ما هو
 * بدل ما نخاطر بالتجميد. */
const MAX_CLIP_DIMENSION = 2000;

/** Clips a rectangular image (covering `bounds`) to the exact polygon shape.
 * Everything outside the polygon becomes transparent. */
export async function clipImageToPolygon(
  imageSrc: string,
  bounds: [[number, number], [number, number]], // [[south, west],[north, east]]
  ring: [number, number][] // [lng, lat] pairs
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not load image for clipping"));
    el.src = imageSrc;
  });

  const naturalWidth = img.naturalWidth || img.width;
  const naturalHeight = img.naturalHeight || img.height;

  // ⚠️ حماية ضد التجميد: بدل ما نرفض نعمل clip خالص لو الصورة أكبر من
  // المتوقع (زي fallback على asset خام بدل الصورة المقصوصة من الباك — ده
  // اللي كان بيحصل مع Sentinel-1/Cop-DEM/Sentinel-5P)، بنصغّر الصورة لأقصى
  // حجم آمن الأول ونعمل الـ clip على النسخة المصغّرة. lngToX/latToY تحت
  // بيحسبوا كنسبة من bounds مش من بكسلات الصورة الأصلية، فالتصغير مش بيأثر
  // على دقة القص — بس بيضمن إن canvas.toDataURL() السينكرونس ميجمّدش التاب.
  const scale = Math.min(1, MAX_CLIP_DIMENSION / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const [[south, west], [north, east]] = bounds;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return imageSrc;

  const lngToX = (lng: number) => ((lng - west) / (east - west)) * canvas.width;
  const latToY = (lat: number) => ((north - lat) / (north - south)) * canvas.height;

  ctx.save();
  ctx.beginPath();
  ring.forEach(([lng, lat], i) => {
    const x = lngToX(lng);
    const y = latToY(lat);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  ctx.restore();

  return canvas.toDataURL("image/png");
}