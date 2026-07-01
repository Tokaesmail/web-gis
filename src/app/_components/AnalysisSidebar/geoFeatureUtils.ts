export function getMidCoords(feature?: GeoJSON.Feature | null): [number, number] | null {
  const g = feature?.geometry as any;
  if (!g?.coordinates) return null;
  try {
    if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
    if (g.type === "LineString" || g.type === "MultiPoint") {
      const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
      return [mid[1], mid[0]];
    }
    if (g.type === "Polygon" || g.type === "MultiLineString") {
      const first = g.coordinates[0];
      const mid = first[Math.floor(first.length / 2)];
      return [mid[1], mid[0]];
    }
    if (g.type === "MultiPolygon") {
      const firstPoly = g.coordinates[0];
      const firstRing = firstPoly[0];
      const mid = firstRing[Math.floor(firstRing.length / 2)];
      return [mid[1], mid[0]];
    }
    // Deep fallback
    const findFirst = (c: any): [number, number] | null => {
      if (Array.isArray(c) && typeof c[0] === "number") return [c[1], c[0]];
      if (Array.isArray(c)) {
        for (const sub of c) {
          const res = findFirst(sub);
          if (res) return res;
        }
      }
      return null;
    };
    return findFirst(g.coordinates);
  } catch (e) { return null; }
}


type FeatureBoundsOptions = {
  /**
   * Extra visual padding around a feature's true bbox. Keep this at 0 for
   * analysis/API requests so returned rasters match the drawn AOI exactly.
   */
  paddingRatio?: number;
  minPadding?: number;
};

export function getFeatureBounds(
  feature?: GeoJSON.Feature | null,
  fallback?: { lat: number; lng: number },
  options: FeatureBoundsOptions = {}
) {
  const coords: number[][] = [];
  const walk = (value: any) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      coords.push(value);
      return;
    }
    value.forEach(walk);
  };
  walk((feature?.geometry as any)?.coordinates);

  if (coords.length) {
    const lngs = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    const paddingRatio = options.paddingRatio ?? 0;
    const minPadding = options.minPadding ?? 0;
    const rawPad = Math.max(north - south, east - west) * paddingRatio;
    const pad = paddingRatio > 0 ? Math.max(minPadding, rawPad) : 0;
    return [[south - pad, west - pad], [north + pad, east + pad]] as [[number, number], [number, number]];
  }

  const lat = fallback?.lat ?? 30.0444;
  const lng = fallback?.lng ?? 31.2357;
  return [[lat - 0.035, lng - 0.035], [lat + 0.035, lng + 0.035]] as [[number, number], [number, number]];
}

export function getFeatureBBoxDetails(feature?: GeoJSON.Feature | null, fallback?: { lat: number; lng: number }) {
  const bounds = getFeatureBounds(feature, fallback);
  const [[south, west], [north, east]] = bounds;
  const center = {
    lat: (south + north) / 2,
    lng: (west + east) / 2,
  };
  const corners = [
    { label: "NW", lat: north, lng: west },
    { label: "NE", lat: north, lng: east },
    { label: "SE", lat: south, lng: east },
    { label: "SW", lat: south, lng: west },
  ];
  return { bounds, center, corners };
}

export function getFeatureVertices(feature?: GeoJSON.Feature | null, fallback?: { lat: number; lng: number }) {
  const geometry = feature?.geometry as any;
  const coords = geometry?.coordinates;
  const points: Array<{ label: string; lat: number; lng: number }> = [];

  const addPoint = (lng: number, lat: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const last = points[points.length - 1];
    if (last && Math.abs(last.lat - lat) < 1e-10 && Math.abs(last.lng - lng) < 1e-10) return;
    points.push({ label: `P${points.length + 1}`, lat, lng });
  };

  if (geometry?.type === "Point" && Array.isArray(coords)) {
    addPoint(coords[0], coords[1]);
  } else if (geometry?.type === "Polygon" && Array.isArray(coords?.[0])) {
    const ring = coords[0] as number[][];
    ring.forEach((point, index) => {
      const isClosingPoint = index === ring.length - 1 && ring.length > 1 &&
        point[0] === ring[0][0] && point[1] === ring[0][1];
      if (!isClosingPoint) addPoint(point[0], point[1]);
    });
  } else if (geometry?.type === "LineString" && Array.isArray(coords)) {
    coords.forEach((point: number[]) => addPoint(point[0], point[1]));
  }

  if (!points.length && fallback) {
    points.push({ label: "P1", lat: fallback.lat, lng: fallback.lng });
  }

  return points;
}

