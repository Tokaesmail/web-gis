// ─── geoClipUtils.ts ─────────────────────────────────────────────────────────
// Shared helper: clips a rectangular image (covering a known lat/lng bounding
// box) down to the exact outline of a drawn polygon. Pure client-side canvas
// masking — no pixel values are read or recomputed, only what's visible
// changes. Used by both PlanetaryRasterPanel (expression results) and
// SatelliteDataPanel (plain scene previews) so a selected AOI always shows
// as its real shape instead of a rectangle.

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
  return null;
}

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

  const [[south, west], [north, east]] = bounds;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
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
