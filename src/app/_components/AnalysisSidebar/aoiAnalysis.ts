const EARTH_RADIUS_M = 6378137;
const toRad = (deg: number) => (deg * Math.PI) / 180;

type Position = [number, number];

function ringAreaM2(ring: Position[]): number {
  if (!Array.isArray(ring) || ring.length < 4) return 0;

  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[(i + 1) % ring.length];
    area += toRad(lng2 - lng1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }

  return Math.abs((area * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}

function polygonAreaM2(rings: Position[][]): number {
  if (!Array.isArray(rings) || !rings.length) return 0;
  const [outer, ...holes] = rings;
  const holesArea = holes.reduce((sum, ring) => sum + ringAreaM2(ring), 0);
  return Math.max(0, ringAreaM2(outer) - holesArea);
}

export function getFeatureAreaKm2(feature?: GeoJSON.Feature | null): number | null {
  if (!feature?.geometry) return null;

  const props = feature.properties ?? {};
  const areaHa = Number(props.areaHa ?? props.area_ha ?? props.AreaHa ?? props.area);
  if (Number.isFinite(areaHa) && areaHa > 0) return areaHa / 100;

  if (feature.geometry.type === "Polygon") {
    const area = polygonAreaM2(feature.geometry.coordinates as Position[][]);
    return area > 0 ? area / 1_000_000 : null;
  }

  if (feature.geometry.type === "MultiPolygon") {
    const area = (feature.geometry.coordinates as Position[][][]).reduce(
      (sum, polygon) => sum + polygonAreaM2(polygon),
      0,
    );
    return area > 0 ? area / 1_000_000 : null;
  }

  return null;
}

export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
