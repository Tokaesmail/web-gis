// ─── aoiValidation.ts ──────────────────────────────────────────────────────────
// Validation rules for Areas of Interest (AOI):
//   • Max AOI size limit (configurable constant)
//   • Geometry validity (no self-intersection), via @turf/turf

import * as turf from "@turf/turf";

// ── Configurable max AOI size (hectares) ────────────────────────────────────
// Hardcoded constant per project decision — adjust this single value to change
// the limit app-wide. 1 ha = 10,000 m².
export const MAX_AOI_SIZE_HA = 5000;

export interface AOIValidationResult {
  valid: boolean;
  /** Human-readable reasons for failure (empty when valid) */
  errors: string[];
  /** Non-blocking notices (e.g. "close to the limit") */
  warnings: string[];
  /** Computed area in hectares, if geometry was valid enough to measure */
  areaHa?: number;
}

// ─── Human-readable area formatting ─────────────────────────────────────────
// Hectares alone aren't intuitive for everyone (small plots, non-GIS users).
// This picks the most natural unit based on magnitude:
//   < 10,000 m²  → show in m²       (e.g. "320 m²")
//   < 100 ha     → show in hectares (e.g. "12.4 ha")
//   >= 100 ha    → show in km²      (e.g. "3.2 km²")
// areaHa is still tracked internally for the MAX_AOI_SIZE_HA comparison.
export function formatArea(areaHa: number, locale: "ar" | "en" = "en"): string {
  const areaM2 = areaHa * 10_000;
  const areaKm2 = areaHa / 100;

  const fmt = (n: number, maxDigits: number) =>
    n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US", { maximumFractionDigits: maxDigits });

  if (areaM2 < 10_000) {
    const unit = locale === "ar" ? "م²" : "m²";
    return `${fmt(areaM2, 0)} ${unit}`;
  }
  if (areaHa < 100) {
    const unit = locale === "ar" ? "هكتار" : "ha";
    return `${fmt(areaHa, 2)} ${unit}`;
  }
  const unit = locale === "ar" ? "كم²" : "km²";
  return `${fmt(areaKm2, 2)} ${unit}`;
}

/**
 * Validates a drawn/edited AOI polygon (or rectangle/circle expressed as a
 * Polygon feature) against:
 *   1. Geometry validity — must be a closed ring with >= 3 distinct vertices
 *      and no self-intersections (turf.kinks()).
 *   2. Max size — area must not exceed MAX_AOI_SIZE_HA.
 *
 * Accepts a GeoJSON.Feature<Polygon> with [lng, lat] coordinate order
 * (standard GeoJSON), matching what makePolygonFeature() in LeafletMap.tsx
 * already produces.
 */
export function validateAOI(
  feature: GeoJSON.Feature | null | undefined,
  maxSizeHa: number = MAX_AOI_SIZE_HA,
  locale: "ar" | "en" = "en"
): AOIValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!feature || !feature.geometry) {
    return { valid: false, errors: [locale === "ar" ? "لا يوجد شكل هندسي للتحقق منه." : "No geometry to validate."], warnings };
  }

  const geom = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") {
    return { valid: false, errors: [locale === "ar" ? "يجب أن تكون المنطقة Polygon." : "AOI must be a Polygon or MultiPolygon."], warnings };
  }

  // ── Basic ring sanity (vertex count, closure) ──────────────────────────────
  const rings: number[][][] =
    geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map((p) => p[0]);

  for (const ring of rings) {
    if (!ring || ring.length < 4) {
      // a closed ring needs first === last, so minimum valid ring has 4 entries (3 unique pts)
      errors.push(locale === "ar" ? "المنطقة تحتاج 3 نقاط مختلفة على الأقل." : "AOI needs at least 3 distinct vertices.");
      break;
    }
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      errors.push(locale === "ar" ? "الشكل غير مغلق (أول نقطة وآخر نقطة لازم يتطابقوا)." : "AOI ring is not closed (first and last point must match).");
    }
  }

  // ── Self-intersection check via turf.kinks() ────────────────────────────────
  if (errors.length === 0) {
    try {
      const poly = geom.type === "Polygon" ? turf.polygon(geom.coordinates) : turf.multiPolygon(geom.coordinates);
      const kinks = turf.kinks(poly as any);
      if (kinks.features.length > 0) {
        errors.push(
          locale === "ar"
            ? `الشكل متقاطع مع نفسه في ${kinks.features.length} نقطة. حرّكي الرؤوس عشان الأضلاع متتقاطعش.`
            : `AOI geometry self-intersects at ${kinks.features.length} point${kinks.features.length > 1 ? "s" : ""}. Adjust vertices so edges don't cross.`
        );
      }
    } catch (e) {
      errors.push(locale === "ar" ? "الشكل غير صالح." : "AOI geometry is invalid (could not be parsed for self-intersection check).");
    }
  }

  // ── Area / max size check ───────────────────────────────────────────────────
  let areaHa: number | undefined;
  if (errors.length === 0) {
    try {
      const poly = geom.type === "Polygon" ? turf.polygon(geom.coordinates) : turf.multiPolygon(geom.coordinates);
      const areaM2 = turf.area(poly as any);
      areaHa = areaM2 / 10_000;

      if (areaHa > maxSizeHa) {
        errors.push(
          locale === "ar"
            ? `مساحة المنطقة ${formatArea(areaHa, locale)} وده أكبر من الحد الأقصى المسموح (${formatArea(maxSizeHa, locale)}).`
            : `AOI is ${formatArea(areaHa, locale)}, which exceeds the maximum of ${formatArea(maxSizeHa, locale)}.`
        );
      } else if (areaHa > maxSizeHa * 0.9) {
        warnings.push(
          locale === "ar"
            ? `المنطقة قريبة من الحد الأقصى (${formatArea(areaHa, locale)} من ${formatArea(maxSizeHa, locale)}).`
            : `AOI is close to the ${formatArea(maxSizeHa, locale)} limit (${formatArea(areaHa, locale)}).`
        );
      }
    } catch {
      errors.push(locale === "ar" ? "تعذر حساب مساحة المنطقة." : "Could not compute AOI area.");
    }
  }

  return { valid: errors.length === 0, errors, warnings, areaHa };
}

/**
 * Quick boolean self-intersection check, useful for live feedback while
 * dragging a vertex (cheaper call site than the full validateAOI()).
 */
export function hasSelfIntersection(ring: [number, number][]): boolean {
  if (ring.length < 3) return false;
  try {
    const closedRing =
      ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
        ? ring
        : [...ring, ring[0]];
    if (closedRing.length < 4) return false;
    const poly = turf.polygon([closedRing]);
    const kinks = turf.kinks(poly);
    return kinks.features.length > 0;
  } catch {
    return true; // treat unparsable geometry as invalid
  }
}

/** Compute area in hectares for a [lat,lng][] ring (Leaflet's coordinate order). */
export function areaHaFromLatLngRing(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  try {
    const lngLatRing = ring.map(([lat, lng]) => [lng, lat]);
    const closed =
      lngLatRing[0][0] === lngLatRing[lngLatRing.length - 1][0] &&
      lngLatRing[0][1] === lngLatRing[lngLatRing.length - 1][1]
        ? lngLatRing
        : [...lngLatRing, lngLatRing[0]];
    const poly = turf.polygon([closed]);
    return turf.area(poly) / 10_000;
  } catch {
    return 0;
  }
}