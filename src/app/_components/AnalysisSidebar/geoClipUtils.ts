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

/** Returns the outer ring of a Polygon/MultiPolygon as [lng,lat] pairs, or
 * null if the feature isn't a polygon (e.g. a point or a plain map-view
 * fallback) — clipping only makes sense for an actual drawn shape. */
export function getPolygonRing(feature?: GeoJSON.Feature | null): [number, number][] | null {
  const g = feature?.geometry as any;
  if (!g) return null;
  if (g.type === "Polygon" && Array.isArray(g.coordinates?.[0])) {
    return g.coordinates[0] as [number, number][];
  }
  if (g.type === "MultiPolygon" && Array.isArray(g.coordinates?.[0]?.[0])) {
    return g.coordinates[0][0] as [number, number][];
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

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  // ⚠️ حماية أساسية ضد التجميد: لو الصورة أكبر من المتوقع (fallback على
  // asset خام بدل الصورة المقصوصة من الباك)، منعملش canvas عليها خالص.
  if (width > MAX_CLIP_DIMENSION || height > MAX_CLIP_DIMENSION) {
    return imageSrc;
  }

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