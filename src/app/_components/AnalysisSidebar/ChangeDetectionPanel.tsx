import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getFeatureBounds, getMidCoords } from "./geoFeatureUtils";
import { clipImageToPolygon, getPolygonRing } from "./geoClipUtils";
import {
  SOURCE_META,
  SOURCE_INDICES,
  SOURCE_COLLECTIONS,
  SOURCE_ANALYSIS_COLLECTIONS,
  SENTINEL5P_PRODUCT_TYPE,
  SENTINEL5P_PRODUCT_TYPE_PROPERTY,
  buildTitilerBboxUrl,
  fetchPairDynamicRescale,
  type SatSource,
  type SatelliteAnalysisType,
} from "./SatellitePipelines";
import {
  decodeAndBuildHeatmapUrl,
  decodeSentinelDataset,
  UI_BAND_TO_SENTINEL_VARIABLE,
  SentinelDecodeError,
  type SentinelDecodeSource,
} from "./sentinelDecode";

// ─── Types ──────────────────────────────────────────────────────────────────
// PreviewKey = every entry that shows up in the "Index to compare" list.
// Two kinds:
//  - "index"     -> a real normalized-difference band index (a-b)/(a+b). These
//                   can run the full server-side change classification
//                   (Gain/No Change/Loss/Other/No Data) via /api/raster-proxy/analyze.
//  - "composite" -> a plain multi-band color composite (true color / false color).
//                   These are great for the visual Before/After swipe & side-by-side
//                   compare. Most have no single scalar to classify a pixel-level
//                   "change map" from, so Run Change Detection stays disabled for
//                   them and the UI explains why — except RGB/SWIR (2026-08-19),
//                   which route.ts classifies via a Rec.709 luminance reduction
//                   (see change_rgb/change_swir) — those two ARE classifiable
//                   despite being "composite" kind; see ChangeIndexKey below.
type PreviewKey =
  | "RGB" | "NDVI" | "NDWI" | "NDMI" | "NDBI" | "SAVI" | "EVI" | "BSI" | "SWIR"
  // ── Sentinel-2-only add-on indices (mirrors SOURCE_INDICES["sentinel-2"] /
  // SatelliteDataPanel.tsx getVisualization()+getIndexPreviewStyle()) — added
  // here as visual preview/swipe-compare options only. They are NOT added to
  // ChangeIndexKey below because route.ts's change_* branch (search
  // "change_ndvi") only implements server-side Gain/Loss classification for
  // the original 7 (NDVI/NDWI/NDMI/NDBI/SAVI/EVI/BSI) — adding the type here
  // without backend support would silently 400 on Run Change Detection.
  | "NDRE" | "GNDVI" | "MSAVI2" | "CCCI" | "NDDI" | "SI" | "CVI"
  | "VARI" | "RED_EDGE"
  | "MTVI" | "TVI" | "GRVI"
  | "RECI" | "SIPI" | "GCI" | "PSRI"
  | "NBRI"
  | "MSI" | "NDSI" | "OSI"
  | "RENDVI" | "REIP"
  | "NMDI_SOIL" | "NMDI_VEG" | "ARI" | "ARI2"
  | "CMR" | "FMR" | "IOI" | "NDCI" | "FAI"
  | "MNDWI" | "GEMI" | "MCARI" | "CRI1" | "CRI2"
  | "CI" | "EVI2" | "MTCI" | "NDVI705" | "NDTI" | "TCARI"
  // ── Cross-satellite add-ons (2026-08-18) — same "satellite picker" idea as
  // SatelliteDataPanel.tsx: pick a satellite (SOURCE_META), then only that
  // satellite's own indices show here (SOURCE_INDICES), same as the Satellite
  // Data tab. VV/VH (Sentinel-1 SAR) and ELEVATION (Copernicus DEM) are the
  // first non-optical sources wired end-to-end (route.ts already had
  // change_vv/change_vh; change_elevation added alongside this). The rest of
  // SOURCE_INDICES per source (RATIO/SAR_RGB/FLOOD/SLOPE/HILLSHADE/ASPECT/
  // CONTOURS, and all of Sentinel-5P/MODIS/ASTER/Sentinel-3) render fine in
  // Satellite Data (single-scene view) but aren't 2-date diffable here yet —
  // several of them (Sentinel-3/5P/MODIS-non-COG assets) go through a
  // different TiTiler-xarray pipeline entirely (see SatellitePipelines.ts
  // TITILER_STYLES), not the /api/raster-proxy/analyze bandCount/formula
  // pipeline this panel's diff (renderChange in route.ts) relies on — so they
  // need that backend work first, not just a frontend PREVIEW_DEFS entry.
  | "VV" | "VH" | "ELEVATION"
  // ── Batch 2 (2026-08-18) — the rest of every SOURCE_INDICES entry for the
  // 6 non-optical sources, same "preview/swipe-only, no server classification
  // yet" treatment as VV/VH/ELEVATION got when THEY were preview-only, before
  // route.ts grew change_vv/change_vh/change_elevation. These reuse the exact
  // same rendering endpoints SatelliteDataPanel.tsx already calls successfully
  // for the single-scene view (buildTitilerTileUrl/buildTitilerBboxUrl for
  // MODIS/ASTER, decodeAndBuildHeatmapUrl for Sentinel-5P/Sentinel-3, and the
  // app's own /api/raster-proxy/analyze — same query-param contract as
  // makeRasterProxyAnalyzeUrl in SatelliteDataPanel.tsx — for Sentinel-1
  // RATIO/SAR_RGB and Copernicus DEM SLOPE/HILLSHADE/ASPECT), so NONE of this
  // needed any change to route.ts itself. Classifying them (Run Change
  // Detection's 5-class Gain/Loss map) is a separate step that DOES need new
  // change_<index> branches added server-side — not done here, see
  // isClassifiable()/CHANGE_API_TYPE below, which correctly leaves all of
  // these out so they fall into the same "preview/swipe-only" messaging RGB/
  // SWIR already use. ⚠️ MODIS_NDVI/MODIS_EVI/MODIS_FIRE/MODIS_LST were made
  // classifiable on (2026-08-23), same as VV/VH/ELEVATION were, and — also
  // as of (2026-08-23) — so were the Sentinel-5P gases NO2/SO2/CO/OZONE (see
  // ChangeIndexKey union below): route.ts's change_no2/change_so2/change_co/
  // change_ozone branches already existed, they just weren't wired into this
  // file's ChangeIndexKey/CHANGE_API_TYPE yet. RATIO/SAR_RGB/SLOPE/HILLSHADE/
  // ASPECT are still preview/swipe-only for now.
  //
  // Renamed off their SOURCE_INDICES name only where it collides with an
  // existing Sentinel-2 key above (RGB, NDVI, EVI) — MODIS_NDVI/MODIS_EVI/
  // ASTER_RGB — everything else keeps the SOURCE_INDICES name as-is.
  | "RATIO" | "SAR_RGB"
  | "SLOPE" | "HILLSHADE" | "ASPECT"
  | "NO2" | "SO2" | "CO" | "OZONE"
  | "MODIS_NDVI" | "MODIS_EVI" | "MODIS_FIRE" | "MODIS_LST"
  | "ASTER_RGB" | "MINERALS" | "THERMAL"
  | "SST" | "S3_LST" | "CHLOROPHYLL" | "FRP";
// Subset that supports real server-side change classification.
// ⚠️ (2026-08-16) Added the 9 indices that used to be preview/swipe-only —
// route.ts now has matching change_<index> branches for all of these too.
type ChangeIndexKey =
  // ⚠️ (2026-08-19) RGB/SWIR added — route.ts's change_rgb/change_swir already
  // reduce the composite to Rec.709 luminance and classify that scalar like any
  // other index (see change_rgb/change_swir in ANALYSIS_CONFIG). They're kept
  // "composite" kind in PREVIEW_DEFS below (still true for the preview/swipe
  // UI) — isClassifiable() below is keyed off CHANGE_API_TYPE, not `kind`, so
  // that's independent of this.
  | "RGB" | "SWIR"
  | "NDVI" | "NDWI" | "NDMI" | "NDBI" | "SAVI" | "EVI" | "BSI"
  | "NBRI" | "GCI" | "VARI" | "RED_EDGE" | "MTVI" | "TVI" | "GRVI" | "MSI" | "NDSI"
  // (2026-08-16 batch 2) — the rest of the previously preview-only indices.
  | "NDRE" | "GNDVI" | "MSAVI2" | "CCCI" | "NDDI" | "SI" | "CVI" | "RECI" | "SIPI"
  | "PSRI" | "OSI" | "RENDVI" | "REIP" | "NMDI_SOIL" | "NMDI_VEG" | "ARI" | "ARI2"
  | "CMR" | "FMR" | "IOI" | "NDCI" | "FAI" | "MNDWI" | "GEMI" | "MCARI" | "CRI1" | "CRI2"
  | "CI" | "EVI2" | "MTCI" | "NDVI705" | "NDTI" | "TCARI"
  | "VV" | "VH" | "ELEVATION"
  // ⚠️ (2026-08-23) RATIO/SAR_RGB — the last two Sentinel-1 indices that were
  // preview/swipe-only. route.ts now has matching change_ratio/change_sar_rgb
  // branches (see runChangeDetection below and CHANGE_API_TYPE for the wiring;
  // route.ts's SAR_SPECKLE_FILTER_TYPES also covers both now).
  | "RATIO" | "SAR_RGB"
  // ⚠️ (2026-08-23) SLOPE/HILLSHADE/ASPECT — the last 3 Copernicus DEM
  // products, now classifiable via route.ts's new change_slope/
  // change_hillshade/change_aspect (dem_change kind — needs the 3×3
  // neighborhood gradient, not a per-pixel formula, see DemChangeConfig
  // comment there). Aspect's delta is circular (wrapped into -180°..180°
  // server-side) so its "gain"/"loss" means clockwise/counter-clockwise
  // rotation, not magnitude.
  | "SLOPE" | "HILLSHADE" | "ASPECT"
  // ⚠️ (2026-08-22) SST/S3_LST/CHLOROPHYLL/FRP — route.ts already had matching
  // change_sst/change_lst/change_frp_mwir/change_chl_nn branches (identity
  // formula, bandCount:2 — see ANALYSIS_CONFIG there), the frontend just never
  // wired them into ChangeIndexKey/CHANGE_API_TYPE. See runChangeDetection
  // below for the decode-pipeline branch these need (resolves two COG urls via
  // decodeSentinelDataset instead of reading raw STAC asset hrefs).
  | "SST" | "S3_LST" | "CHLOROPHYLL" | "FRP"
  // ⚠️ (2026-08-23) ASTER_RGB/MINERALS/THERMAL — route.ts now has matching
  // change_aster_rgb/change_minerals/change_thermal branches (see ASTER_CHANGE_BIDX
  // below for how their band hrefs+indices get resolved, since ASTER's bands
  // live packed inside multi-band VNIR/SWIR/TIR composite files instead of
  // one asset per band like Sentinel-2/Landsat).
  | "ASTER_RGB" | "MINERALS" | "THERMAL"
  // ⚠️ (2026-08-23) MODIS_NDVI/MODIS_EVI/MODIS_FIRE/MODIS_LST — route.ts now
  // has matching change_modis_ndvi/change_modis_evi/change_modis_fire/
  // change_modis_lst branches. Same "raw asset href per date" contract as
  // VV/VH/ELEVATION (see PREVIEW_DEFS below — `assets` gets populated to
  // match `proxyAssets` for the same reason), no bidx/decode step needed
  // since MODIS's COG assets are one-band-per-file.
  | "MODIS_NDVI" | "MODIS_EVI" | "MODIS_FIRE" | "MODIS_LST"
  // ⚠️ (2026-08-23) NO2/SO2/CO/OZONE — route.ts already had matching
  // change_no2/change_so2/change_co/change_ozone branches (identity formula,
  // bandCount:2, same "decode pipeline" comment block as change_elevation —
  // see ANALYSIS_CONFIG there); runChangeDetection's `isDecodePipeline`
  // branch already handles these generically (same as SST/S3_LST/
  // CHLOROPHYLL/FRP), so this is purely a frontend wiring gap, same as the
  // SST/S3_LST/CHLOROPHYLL/FRP one above.
  | "NO2" | "SO2" | "CO" | "OZONE";
type ChangeDirection = "increase" | "decrease" | "both";

export interface ChangeDetectionPreviewConfig {
  name: string;
  indexKey: PreviewKey;
  expression: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]];
  opacity: number;
  colorRamp: string;
  dataUrl: string;
}

/** Real, georeferenced on-map Before/After swipe config — Change Detection only */
export interface ChangeDetectionSwipeConfig {
  beforeUrl: string;
  afterUrl: string;
  bounds: [[number, number], [number, number]];
  beforeLabel?: string;
  afterLabel?: string;
}

interface StacFeature {
  id?: string;
  geometry?: GeoJSON.Geometry | null;
  bbox?: number[];
  properties?: {
    datetime?: string;
    "eo:cloud_cover"?: number;
    "landsat:cloud_cover_land"?: number;
  };
  assets?: Record<string, { href?: string; type?: string; title?: string } | undefined>;
}

interface SatelliteScene {
  id: string;
  date: string;
  cloud: number;
  collection: string;
  thumbnail?: string;
  assets: Record<string, string>;
  bbox?: number[];
}

interface PreviewDef {
  label: string;
  desc: string;
  kind: "index" | "composite";
  color: string;
  /** Band asset keys, in the exact order the formula/expression expects. 2 for most
   *  indices, 3 for EVI, 4 for BSI. 3 for composite kind (R,G,B). */
  assets: string[];
  // tighter rescale than the raw [-1,1] index range = much more vivid, less washed-out preview colors
  // (index kind only)
  rescale?: string;
  // colormap used for the single-band index preview (index kind only)
  colormap?: string;
  /** Builds the TiTiler band-math expression from `assets`, in order (index kind only).
   *  Defaults to the standard normalized difference (a-b)/(a+b) for 2-band indices. */
  expression?: (assets: string[]) => string;

  // ── Non-optical / non-COG pipeline routing (2026-08-18) ────────────────
  // Everything above (Sentinel-2/Landsat/VV/VH/ELEVATION) renders through the
  // default path in makePreviewUrl: hit Planetary Computer's own /item/bbox
  // endpoint directly with `assets`+`expression`+`rescale`+`colormap`. The 6
  // new non-optical sources each need a genuinely different request shape, so
  // `pipeline` picks which branch makePreviewUrl takes; `proxyType` carries
  // the exact string that branch needs (matches SatelliteDataPanel.tsx's
  // `type` param for "raster-proxy", or the SatelliteAnalysisType/decode
  // variable name for "titiler"/"decode" — same value, reused as-is so this
  // never drifts out of sync with the single-scene view).
  pipeline?: "raster-proxy" | "titiler" | "decode";
  /** Real backend/analysis key for the titiler/decode/raster-proxy pipelines above —
   *  e.g. "NDVI" for MODIS_NDVI, "RGB" for ASTER_RGB, "vv_vh_ratio" for RATIO. */
  proxyType?: string;
  /** raster-proxy pipeline only: which scene.assets key(s) to read the source
   *  band URL(s) from, e.g. ["vv","vh"] for RATIO/SAR_RGB, ["data"] for DEM. */
  proxyAssets?: string[];
  /** raster-proxy pipeline only: mirrors makeRasterProxyAnalyzeUrl's isComposite/isDem
   *  branches in SatelliteDataPanel.tsx — controls which query params get sent. */
  proxyKind?: "composite" | "dem" | "index";
  /** decode pipeline only: which SentinelDecodeSource this belongs to. */
  decodeSource?: SentinelDecodeSource;
}

const PREVIEW_DEFS: Record<PreviewKey, PreviewDef> = {
  RGB: {
    label: "RGB", desc: "True color (Red, Green, Blue)", kind: "composite",
    assets: ["B04", "B03", "B02"], color: "#e2e8f0",
  },
  NDVI: {
    label: "NDVI", desc: "Vegetation vigor (NIR, Red)", kind: "index",
    assets: ["B08", "B04"], color: "#22c55e", rescale: "-0.2,0.75", colormap: "rdylgn",
  },
  NDWI: {
    label: "NDWI", desc: "Water signal (Green, NIR)", kind: "index",
    assets: ["B03", "B08"], color: "#38bdf8", rescale: "-0.3,0.5", colormap: "rdbu_r",
  },
  NDMI: {
    label: "NDMI", desc: "Moisture stress (NIR, SWIR)", kind: "index",
    assets: ["B08", "B11"], color: "#a78bfa", rescale: "-0.3,0.5", colormap: "brbg",
  },
  NDBI: {
    label: "NDBI", desc: "Built-up / urban areas (SWIR, NIR)", kind: "index",
    assets: ["B11", "B08"], color: "#f59e0b", rescale: "-0.35,0.35", colormap: "oranges",
  },
  SAVI: {
    // Soil-Adjusted Vegetation Index — like NDVI but corrected for soil brightness (L=0.5).
    label: "SAVI", desc: "Soil-adjusted vegetation (NIR, Red)", kind: "index",
    assets: ["B08", "B04"], color: "#84cc16", rescale: "-0.2,0.9", colormap: "rdylgn",
    expression: ([nir, red]) => `((${nir}-${red})/(${nir}+${red}+0.5))*1.5`,
  },
  EVI: {
    // Enhanced Vegetation Index — needs Blue too, to correct for atmosphere/canopy background.
    label: "EVI", desc: "Enhanced vegetation (NIR, Red, Blue)", kind: "index",
    assets: ["B08", "B04", "B02"], color: "#16a34a", rescale: "-0.2,1", colormap: "rdylgn",
    expression: ([nir, red, blue]) => `2.5*(${nir}-${red})/(${nir}+6*${red}-7.5*${blue}+1)`,
  },
  BSI: {
    // Bare Soil Index — (SWIR+Red) vs (NIR+Blue), normalized.
    label: "BSI", desc: "Bare soil index (SWIR, Red, NIR, Blue)", kind: "index",
    assets: ["B11", "B04", "B08", "B02"], color: "#d97706", rescale: "-0.3,0.3", colormap: "oranges",
    expression: ([swir, red, nir, blue]) => `((${swir}+${red})-(${nir}+${blue}))/((${swir}+${red})+(${nir}+${blue}))`,
  },
  SWIR: {
    label: "SWIR", desc: "False color (SWIR, NIR, Red)", kind: "composite",
    assets: ["B11", "B08", "B04"], color: "#f97316",
  },

  // ── Sentinel-2-only add-on indices ──────────────────────────────────────
  // All assets/expressions/rescale/colormap below are copied 1:1 from
  // SatelliteDataPanel.tsx's Sentinel-2 getVisualization() switch and
  // getIndexPreviewStyle() so the before/after heatmap here reads exactly
  // like the single-scene Satellite Data heatmap for the same index.
  NDRE: {
    label: "NDRE", desc: "Red-edge chlorophyll (NIR, RedEdge1)", kind: "index",
    assets: ["B08", "B05"], color: "#4575b4", rescale: "0,0.4", colormap: "spectral_r",
  },
  GNDVI: {
    label: "GNDVI", desc: "Green-band vegetation (NIR, Green)", kind: "index",
    assets: ["B08", "B03"], color: "#238443", rescale: "-0.2,0.8", colormap: "gndvi_warm",
  },
  MSAVI2: {
    label: "MSAVI2", desc: "Self-adjusting soil vegetation (NIR, Red)", kind: "index",
    assets: ["B08", "B04"], color: "#31a354", rescale: "-0.2,0.9", colormap: "rdylgn",
    expression: ([nir, red]) => `(2*${nir}+1-sqrt((2*${nir}+1)*(2*${nir}+1)-8*(${nir}-${red})))/2`,
  },
  CCCI: {
    label: "CCCI", desc: "Canopy chlorophyll/nitrogen (NIR, RedEdge1, Red)", kind: "index",
    assets: ["B08", "B05", "B04"], color: "#4393c3", rescale: "0,1.2", colormap: "rdbu",
    expression: ([nir, re1, red]) => `((${nir}-${re1})/(${nir}+${re1}))/((${nir}-${red})/(${nir}+${red}))`,
  },
  NDDI: {
    label: "NDDI", desc: "Drought index (NDVI, NDWI combined)", kind: "index",
    assets: ["B08", "B04", "B03"], color: "#238443", rescale: "-1,1", colormap: "greens",
    expression: ([nir, red, green]) =>
      `(((${nir}-${red})/(${nir}+${red}))-((${green}-${nir})/(${green}+${nir})))/(((${nir}-${red})/(${nir}+${red}))+((${green}-${nir})/(${green}+${nir})))`,
  },
  SI: {
    label: "SI", desc: "Soil salinity (Red, NIR)", kind: "index",
    assets: ["B04", "B08"], color: "#dc2626", rescale: "-0.3,0.3", colormap: "salinity_clear",
  },
  CVI: {
    label: "CVI", desc: "Chlorophyll vegetation (NIR, Red, Green)", kind: "index",
    assets: ["B08", "B04", "B03"], color: "#22c55e", rescale: "0,15", colormap: "cvi_ocean",
    expression: ([nir, red, green]) => `(${nir}/10000)*((${red}/10000)/((${green}/10000)*(${green}/10000)))`,
  },
  VARI: {
    label: "VARI", desc: "Visible vegetation, no NIR (Green, Red, Blue)", kind: "index",
    assets: ["B03", "B04", "B02"], color: "#31a354", rescale: "-0.3,0.6", colormap: "rdylgn",
    expression: ([green, red, blue]) => `(${green}-${red})/(${green}+${red}-${blue})`,
  },
  RED_EDGE: {
    label: "RED_EDGE", desc: "S2REP red-edge position (Red, RedEdge1-3)", kind: "index",
    assets: ["B04", "B05", "B06", "B07"], color: "#4575b4", rescale: "700,740", colormap: "spectral_r",
    expression: ([red, re1, re2, re3]) => `705+35*(((${re3}+${red})/2-${re1})/(${re2}-${re1}))`,
  },
  MTVI: {
    label: "MTVI", desc: "MTVI2 triangular vegetation (NIR, Red, Green)", kind: "index",
    assets: ["B08", "B04", "B03"], color: "#31a354", rescale: "-1,1", colormap: "rdylgn",
    expression: ([nir, red, green]) =>
      `1.5*(1.2*((${nir}/10000)-(${green}/10000))-2.5*((${red}/10000)-(${green}/10000)))/sqrt((2*(${nir}/10000)+1)*(2*(${nir}/10000)+1)-(6*(${nir}/10000)-5*sqrt(${red}/10000))-0.5)`,
  },
  TVI: {
    label: "TVI", desc: "Triangular vegetation (NIR, Red, Green)", kind: "index",
    assets: ["B08", "B04", "B03"], color: "#5e4fa2", rescale: "0,50", colormap: "spectral",
    expression: ([nir, red, green]) =>
      `0.5*(120*((${nir}/10000)*100-(${green}/10000)*100)-200*((${red}/10000)*100-(${green}/10000)*100))`,
  },
  GRVI: {
    label: "GRVI", desc: "Green-red vegetation, no NIR (Green, Red)", kind: "index",
    assets: ["B03", "B04"], color: "#31a354", rescale: "-0.3,0.5", colormap: "rdylgn",
  },
  RECI: {
    label: "RECI", desc: "Red-edge chlorophyll ratio (NIR, RedEdge1)", kind: "index",
    assets: ["B08", "B05"], color: "#4575b4", rescale: "0,3", colormap: "spectral_r",
    expression: ([nir, re1]) => `(${nir}/${re1})-1`,
  },
  SIPI: {
    label: "SIPI", desc: "Carotenoid/chlorophyll ratio (NIR, Blue, Red)", kind: "index",
    assets: ["B08", "B02", "B04"], color: "#4393c3", rescale: "0,2", colormap: "rdbu_r",
    expression: ([nir, blue, red]) => `(${nir}-${blue})/(${nir}-${red})`,
  },
  GCI: {
    label: "GCI", desc: "Green chlorophyll ratio (NIR, Green)", kind: "index",
    assets: ["B08", "B03"], color: "#238443", rescale: "0,4", colormap: "greens",
    expression: ([nir, green]) => `(${nir}/${green})-1`,
  },
  PSRI: {
    label: "PSRI", desc: "Plant senescence (Red, Blue, RedEdge2)", kind: "index",
    assets: ["B04", "B02", "B06"], color: "#b2182b", rescale: "-0.2,0.2", colormap: "rdbu_r",
    expression: ([red, blue, re2]) => `(${red}-${blue})/${re2}`,
  },
  NBRI: {
    label: "NBRI", desc: "Burn severity (NIR, SWIR2)", kind: "index",
    assets: ["B08", "B12"], color: "#006837", rescale: "-0.5,0.7", colormap: "rdylgn",
  },
  MSI: {
    label: "MSI", desc: "Moisture stress ratio (SWIR1, NIR)", kind: "index",
    assets: ["B11", "B08"], color: "#b2182b", rescale: "0.2,2", colormap: "rdbu_r",
    expression: ([swir1, nir]) => `${swir1}/${nir}`,
  },
  NDSI: {
    label: "NDSI", desc: "Snow/ice index (Green, SWIR1)", kind: "index",
    assets: ["B03", "B11"], color: "#2166ac", rescale: "-0.2,0.6", colormap: "rdbu",
  },
  OSI: {
    label: "OSI", desc: "Oil spill heuristic (Red, Blue, Green)", kind: "index",
    assets: ["B04", "B02", "B03"], color: "#b2182b", rescale: "-0.3,0.3", colormap: "rdbu_r",
    expression: ([red, blue, green]) => `((${red}+${blue})-${green})/((${red}+${blue})+${green})`,
  },
  RENDVI: {
    label: "RENDVI", desc: "Red-edge NDVI (RedEdge2, RedEdge1)", kind: "index",
    assets: ["B06", "B05"], color: "#4575b4", rescale: "0,0.3", colormap: "spectral_r",
  },
  REIP: {
    label: "REIP", desc: "Red-edge inflection point (Red, RedEdge1-3)", kind: "index",
    assets: ["B04", "B05", "B06", "B07"], color: "#4575b4", rescale: "700,740", colormap: "spectral_r",
    expression: ([red, re1, re2, re3]) => `700+40*(((${red}+${re3})/2-${re1})/(${re2}-${re1}))`,
  },
  NMDI_SOIL: {
    label: "NMDI_SOIL", desc: "Soil moisture / drought (NIR, SWIR1, SWIR2)", kind: "index",
    assets: ["B08", "B11", "B12"], color: "#b2182b", rescale: "0.15,0.85", colormap: "rdbu_r",
    expression: ([nir, swir1, swir2]) => `(${nir}-(${swir1}-${swir2}))/(${nir}+(${swir1}-${swir2}))`,
  },
  NMDI_VEG: {
    // Exact same formula/bands as NMDI_SOIL — only the colormap direction differs
    // (rdbu vs rdbu_r) since the same value reads opposite on dense canopy.
    label: "NMDI_VEG", desc: "Vegetation water content (NIR, SWIR1, SWIR2)", kind: "index",
    assets: ["B08", "B11", "B12"], color: "#2166ac", rescale: "0.15,0.85", colormap: "rdbu",
    expression: ([nir, swir1, swir2]) => `(${nir}-(${swir1}-${swir2}))/(${nir}+(${swir1}-${swir2}))`,
  },
  ARI: {
    label: "ARI", desc: "Anthocyanin pigment (Green, RedEdge1)", kind: "index",
    assets: ["B03", "B05"], color: "#b2182b", rescale: "0,0.2", colormap: "rdbu_r",
    expression: ([green, re1]) => `(10000/${green})-(10000/${re1})`,
  },
  ARI2: {
    label: "ARI2", desc: "Anthocyanin, leaf-corrected (RedEdge3, Green, RedEdge1)", kind: "index",
    assets: ["B07", "B03", "B05"], color: "#b2182b", rescale: "0,8", colormap: "rdbu_r",
    expression: ([re3, green, re1]) => `(${re3}/${green})-(${re3}/${re1})`,
  },
  CMR: {
    label: "CMR", desc: "Clay Minerals Ratio, geology (SWIR1, SWIR2)", kind: "index",
    assets: ["B11", "B12"], color: "#fca50a", rescale: "0.8,2.5", colormap: "inferno",
    expression: ([swir1, swir2]) => `${swir1}/${swir2}`,
  },
  FMR: {
    label: "FMR", desc: "Ferrous Minerals Ratio, geology (SWIR1, NIR)", kind: "index",
    assets: ["B11", "B08"], color: "#ff8000", rescale: "0.2,2", colormap: "hot",
    expression: ([swir1, nir]) => `${swir1}/${nir}`,
  },
  IOI: {
    label: "IOI", desc: "Iron Oxide ratio, geology (Red, Blue)", kind: "index",
    assets: ["B04", "B02"], color: "#f97316", rescale: "0.8,2.5", colormap: "magma",
    expression: ([red, blue]) => `${red}/${blue}`,
  },
  NDCI: {
    label: "NDCI", desc: "Chlorophyll-a, turbid water (RedEdge1, Red)", kind: "index",
    assets: ["B05", "B04"], color: "#e4460a", rescale: "-0.2,0.4", colormap: "turbo",
  },
  FAI: {
    label: "FAI", desc: "Floating algae index (NIR, Red, SWIR1)", kind: "index",
    assets: ["B08", "B04", "B11"], color: "#238443", rescale: "-0.05,0.1", colormap: "greens",
    expression: ([nir, red, swir1]) => `${nir}-(${red}+(${swir1}-${red})*0.1772)`,
  },
  MNDWI: {
    label: "MNDWI", desc: "Water body extraction (Green, SWIR1)", kind: "index",
    assets: ["B03", "B11"], color: "#2166ac", rescale: "-0.6,0.6", colormap: "rdbu",
  },
  GEMI: {
    label: "GEMI", desc: "Atmosphere-resistant vegetation (NIR, Red)", kind: "index",
    assets: ["B08", "B04"], color: "#31a354", rescale: "-0.1,1", colormap: "rdylgn",
    expression: ([nir, red]) =>
      `(((2*(((${nir}/10000)*(${nir}/10000))-((${red}/10000)*(${red}/10000)))+1.5*(${nir}/10000)+0.5*(${red}/10000))/((${nir}/10000)+(${red}/10000)+0.5))*(1-0.25*((2*(((${nir}/10000)*(${nir}/10000))-((${red}/10000)*(${red}/10000)))+1.5*(${nir}/10000)+0.5*(${red}/10000))/((${nir}/10000)+(${red}/10000)+0.5))))-(((${red}/10000)-0.125)/(1-(${red}/10000)))`,
  },
  MCARI: {
    label: "MCARI", desc: "Chlorophyll absorption (RedEdge1, Red, Green)", kind: "index",
    assets: ["B05", "B04", "B03"], color: "#238443", rescale: "0,1.5", colormap: "rdylgn",
    expression: ([re1, red, green]) =>
      `(((${re1}/10000)-(${red}/10000))-0.2*((${re1}/10000)-(${green}/10000)))*((${re1}/10000)/(${red}/10000))`,
  },
  CRI1: {
    label: "CRI1", desc: "Carotenoid pigment (Blue, Green)", kind: "index",
    assets: ["B02", "B03"], color: "#b2182b", rescale: "0,15", colormap: "rdbu_r",
    expression: ([blue, green]) => `(1/(${blue}/10000))-(1/(${green}/10000))`,
  },
  CRI2: {
    label: "CRI2", desc: "Carotenoid pigment, canopy-corrected (Blue, RedEdge1)", kind: "index",
    assets: ["B02", "B05"], color: "#b2182b", rescale: "0,10", colormap: "rdbu_r",
    expression: ([blue, re1]) => `(1/(${blue}/10000))-(1/(${re1}/10000))`,
  },
  CI: {
    label: "CI", desc: "Cyanobacteria / algal bloom (Red, RedEdge1, RedEdge2)", kind: "index",
    assets: ["B04", "B05", "B06"], color: "#e4460a", rescale: "-0.02,0.05", colormap: "turbo",
    expression: ([red, re1, re2]) => `(${red}+(${re2}-${red})*0.5333)-${re1}`,
  },
  EVI2: {
    label: "EVI2", desc: "Two-band enhanced vegetation (NIR, Red)", kind: "index",
    assets: ["B08", "B04"], color: "#c71585", rescale: "0,1", colormap: "magma",
    expression: ([nir, red]) => `2.5*(${nir}-${red})/(${nir}+2.4*${red}+1)`,
  },
  MTCI: {
    label: "MTCI", desc: "MERIS-heritage chlorophyll (RedEdge2, RedEdge1, Red)", kind: "index",
    assets: ["B06", "B05", "B04"], color: "#4575b4", rescale: "0,5", colormap: "spectral_r",
    expression: ([re2, re1, red]) => `(${re2}-${re1})/(${re1}-${red})`,
  },
  NDVI705: {
    label: "NDVI705", desc: "Red-edge NDVI, Gitelson & Merzlyak (RedEdge2, RedEdge1)", kind: "index",
    assets: ["B06", "B05"], color: "#4575b4", rescale: "-1,1", colormap: "spectral_r",
  },
  NDTI: {
    label: "NDTI", desc: "Water turbidity (Red, Green)", kind: "index",
    assets: ["B04", "B03"], color: "#dc2626", rescale: "-0.2,0.4", colormap: "salinity_clear",
  },
  TCARI: {
    label: "TCARI", desc: "Transformed chlorophyll absorption (RedEdge1, Red, Green)", kind: "index",
    assets: ["B05", "B04", "B03"], color: "#238443", rescale: "0,2", colormap: "rdylgn",
    expression: ([re1, red, green]) =>
      `3*(((${re1}/10000)-(${red}/10000))-0.2*((${re1}/10000)-(${green}/10000))*((${re1}/10000)/(${red}/10000)))`,
  },

  // ── Sentinel-1 (SAR) — mirrors SatelliteDataPanel/SatellitePipelines.ts VV/VH.
  // Single-band amplitude assets, not a 2-band normalized difference, so both
  // `assets` and `expression` are overridden to pass the one band straight
  // through — the actual amplitude→dB conversion happens server-side
  // (ANALYSIS_CONFIG.vv/vh in route.ts), same as the single-scene view.
  VV: {
    label: "VV backscatter", desc: "Radar return, co-polarized (dB)", kind: "index",
    // ⚠️ `assets` stays populated (unlike RATIO/SAR_RGB below, which are never
    // classifiable) — runChangeDetection() resolves change_vv's band hrefs
    // straight from PREVIEW_DEFS[key].assets via getPreviewAssets(), a
    // completely separate path from makePreviewUrl/pipeline below. Emptying
    // this would silently break Run Change Detection for VV (0 hrefs, no
    // error thrown, empty urls= sent to the backend).
    assets: ["vv"], color: "#4393c3", rescale: "-25,0", colormap: "spectral",
    // ⚠️ (2026-08-19) pipeline MUST be set for the swipe/preview — the default
    // TiTiler-bbox branch in makePreviewUrl (used when no `pipeline` is set)
    // sends the raw asset straight to Planetary Computer's TiTiler as
    // `expression: vv` with no dB conversion. Sentinel-1 GRD pixels are
    // detected amplitude, not dB — without the 20·log10(v) conversion
    // route.ts's own vv/vh types already do server-side (see route.ts's
    // vv/vh ANALYSIS_CONFIG comment), nearly every pixel clips to one end of
    // the "-25,0" rescale and the swipe renders as one solid color instead of
    // an image. This missing `pipeline` field was the solid-purple swipe bug.
    pipeline: "raster-proxy", proxyType: "vv", proxyAssets: ["vv"], proxyKind: "index",
  },
  VH: {
    label: "VH backscatter", desc: "Radar return, cross-polarized (dB)", kind: "index",
    // Same reasoning as VV's `assets` comment above.
    assets: ["vh"], color: "#238b45", rescale: "-30,-5", colormap: "spectral",
    // Same fix/reasoning as VV's `pipeline` comment above.
    pipeline: "raster-proxy", proxyType: "vh", proxyAssets: ["vh"], proxyKind: "index",
  },

  // ── Copernicus DEM — mirrors SatellitePipelines.ts ELEVATION. Single elevation
  // band, raw metres. A before/after diff here reads as real terrain change
  // (excavation, land-fill, landslide, construction) rather than seasonal
  // reflectance change like the optical indices above.
  // ⚠️ (2026-08-19) `pipeline` MUST be "raster-proxy" here — same bug class as
  // the VV/VH "solid-purple swipe" fix above. Without it, this falls into the
  // default TiTiler-bbox branch in makePreviewUrl, which sends the raw
  // elevation asset straight to Planetary Computer's TiTiler with no
  // stretch/colormap handling — nearly every pixel clips to one end of the
  // "0,1500" rescale and the preview/swipe renders as one flat color instead
  // of an elevation heatmap. route.ts already supports type="elevation"
  // (kind: "dem") with the correct colormap handling — same contract SLOPE/
  // HILLSHADE/ASPECT below already use.
  ELEVATION: {
    label: "Elevation", desc: "Terrain height (Copernicus DEM, metres)", kind: "index",
    assets: ["data"], color: "#a6d96a", rescale: "0,1500", colormap: "rdylgn",
    expression: ([data]) => data,
    pipeline: "raster-proxy", proxyType: "elevation", proxyAssets: ["data"], proxyKind: "dem",
  },

  // ── Sentinel-1 (SAR) batch 2 — VV/VH ratio & RGB composite. Both need
  // vv+vh together, computed server-side by /api/raster-proxy/analyze (same
  // type="vv_vh_ratio"/"sar_rgb" contract SatelliteDataPanel.tsx already uses
  // for the single-scene view — see makeRasterProxyAnalyzeUrl there).
  RATIO: {
    label: "VV/VH ratio", desc: "20·log10(VV) − 20·log10(VH), dB", kind: "index",
    // ⚠️ (2026-08-23) `assets` now populated (was []) — same reasoning as
    // VV/VH/ELEVATION's `assets` comment above: runChangeDetection() resolves
    // change_ratio's band hrefs straight from PREVIEW_DEFS.RATIO.assets via
    // getPreviewAssets(), a separate path from proxyAssets below (which stays
    // as-is for the preview/swipe pipeline).
    assets: ["vv", "vh"], color: "#f472b6",
    pipeline: "raster-proxy", proxyType: "vv_vh_ratio", proxyAssets: ["vv", "vh"], proxyKind: "index",
    rescale: "-20,20", colormap: "spectral",
  },
  SAR_RGB: {
    label: "SAR RGB composite", desc: "R=VV, G=VH, B=VV/VH ratio (dB)", kind: "composite",
    // Same reasoning as RATIO's `assets` comment above — change_sar_rgb needs
    // both raw bands per date.
    assets: ["vv", "vh"], color: "#fb7185",
    pipeline: "raster-proxy", proxyType: "sar_rgb", proxyAssets: ["vv", "vh"], proxyKind: "composite",
    // ⚠️ (2026-08-23) `rescale` added even though the composite preview
    // pipeline ignores it (it does its own per-channel 2%-98% stretch) —
    // this exists purely so getChangeThresholdParams below has a range to
    // scale the 0.02-0.3 sensitivity slider against, same as RATIO. Derived
    // from VV/VH's own dB rescales (-25,0 / -30,-5) run through
    // change_sar_rgb's Rec.709 weights: roughly -28dB..-2dB.
    rescale: "-28,-2",
  },

  // ── Copernicus DEM batch 2 — real terrain derivatives, computed server-side
  // from the same elevation band ELEVATION uses (type="slope"/"hillshade"/
  // "aspect" — same contract as SatelliteDataPanel.tsx).
  SLOPE: {
    label: "Slope", desc: "Terrain steepness, degrees", kind: "index",
    // ⚠️ (2026-08-23) `assets` now populated (was []) — same reasoning as
    // RATIO's `assets` comment above: runChangeDetection() resolves
    // change_slope's band hrefs straight from PREVIEW_DEFS.SLOPE.assets via
    // getPreviewAssets(), a separate path from proxyAssets below (preview
    // pipeline, unchanged).
    assets: ["data"], color: "#f97316",
    pipeline: "raster-proxy", proxyType: "slope", proxyAssets: ["data"], proxyKind: "dem",
    rescale: "0,45", colormap: "inferno",
  },
  HILLSHADE: {
    label: "Hillshade", desc: "Shaded relief", kind: "index",
    // Same reasoning as SLOPE's `assets` comment above.
    assets: ["data"], color: "#cbd5e1",
    pipeline: "raster-proxy", proxyType: "hillshade", proxyAssets: ["data"], proxyKind: "dem",
    rescale: "0,255", colormap: "rdylbu_r",
  },
  ASPECT: {
    label: "Aspect", desc: "Slope direction, compass degrees", kind: "index",
    // Same reasoning as SLOPE's `assets` comment above.
    assets: ["data"], color: "#fb923c",
    pipeline: "raster-proxy", proxyType: "aspect", proxyAssets: ["data"], proxyKind: "dem",
    rescale: "0,360", colormap: "rdylbu_r",
  },

  // ── Sentinel-5P (Atmosphere) — decode → GeoTIFF → /api/raster-proxy/analyze,
  // same pipeline as SatelliteDataPanel.tsx (decodeAndBuildHeatmapUrl), real
  // p2/p98 stretch per scene instead of one fixed rescale for every gas.
  NO2: {
    label: "NO₂", desc: "Tropospheric NO₂ column", kind: "index",
    assets: [], color: "#a52c60",
    pipeline: "decode", proxyType: "NO2", decodeSource: "sentinel-5p",
    rescale: "0,0.0002", colormap: "inferno",
  },
  SO2: {
    label: "SO₂", desc: "Total-column SO₂", kind: "index",
    assets: [], color: "#f472b6",
    pipeline: "decode", proxyType: "SO2", decodeSource: "sentinel-5p",
    rescale: "0,0.0005", colormap: "rdylbu_r",
  },
  CO: {
    label: "CO", desc: "Total-column carbon monoxide", kind: "index",
    assets: [], color: "#84cc16",
    pipeline: "decode", proxyType: "CO", decodeSource: "sentinel-5p",
    rescale: "0,0.05", colormap: "greens",
  },
  OZONE: {
    label: "Ozone", desc: "Total-column O₃", kind: "index",
    assets: [], color: "#f7d13d",
    pipeline: "decode", proxyType: "OZONE", decodeSource: "sentinel-5p",
    rescale: "0,0.3", colormap: "rdbu",
  },

  // ── MODIS — migrated (2026-08-22) off direct TiTiler onto the same
  // /api/raster-proxy/analyze pipeline VV/VH/ELEVATION above use — real COG
  // overview-picking instead of a live round-trip to Microsoft's Planetary
  // Computer TiTiler. proxyAssets are the real STAC asset names (confirmed
  // via GET /api/stac/v1/collections/modis-13A1-061 etc.), proxyType matches
  // route.ts's new ANALYSIS_CONFIG.modis_* keys. Still renamed off "NDVI"/
  // "EVI" to avoid the Sentinel-2 key collision noted below.
  MODIS_NDVI: {
    label: "MODIS NDVI", desc: "Vegetation index, 16-day 500m composite", kind: "index",
    // ⚠️ (2026-08-23) `assets` now populated (matches proxyAssets) — same
    // reasoning as VV/VH/ELEVATION above: runChangeDetection() resolves
    // change_modis_ndvi's band hrefs straight from PREVIEW_DEFS[key].assets
    // via getPreviewAssets(), a completely separate path from makePreviewUrl/
    // pipeline below, which still uses proxyAssets as before.
    assets: ["500m_16_days_NDVI"], color: "#84cc16",
    pipeline: "raster-proxy", proxyType: "modis_ndvi", proxyAssets: ["500m_16_days_NDVI"], proxyKind: "index",
    rescale: "-2000,10000", colormap: "rdylgn",
  },
  MODIS_EVI: {
    label: "MODIS EVI", desc: "Enhanced vegetation index, 16-day 500m composite", kind: "index",
    // Same reasoning as MODIS_NDVI's `assets` comment above.
    assets: ["500m_16_days_EVI"], color: "#65a30d",
    pipeline: "raster-proxy", proxyType: "modis_evi", proxyAssets: ["500m_16_days_EVI"], proxyKind: "index",
    rescale: "-2000,10000", colormap: "magma",
  },
  MODIS_FIRE: {
    label: "MODIS Fire", desc: "Thermal anomalies / active fire confidence", kind: "index",
    // Same reasoning as MODIS_NDVI's `assets` comment above.
    assets: ["FireMask"], color: "#ea580c",
    pipeline: "raster-proxy", proxyType: "modis_fire", proxyAssets: ["FireMask"], proxyKind: "index",
    rescale: "0,9", colormap: "hot",
  },
  MODIS_LST: {
    label: "MODIS LST", desc: "Land surface temperature, daily 1km", kind: "index",
    // Same reasoning as MODIS_NDVI's `assets` comment above.
    assets: ["LST_Day_1km"], color: "#dc2626",
    pipeline: "raster-proxy", proxyType: "modis_lst", proxyAssets: ["LST_Day_1km"], proxyKind: "index",
    rescale: "285,325", colormap: "inferno",
  },

  // ── ASTER — same direct TiTiler pipeline as MODIS. RGB renamed to
  // ASTER_RGB (collides with the Sentinel-2/Landsat true-color composite key).
  ASTER_RGB: {
    label: "ASTER RGB", desc: "VNIR true color composite", kind: "composite",
    assets: [], color: "#fb7185", pipeline: "titiler", proxyType: "RGB",
  },
  MINERALS: {
    label: "ASTER Minerals", desc: "SWIR band-ratio mineral composite", kind: "composite",
    assets: [], color: "#f472b6", pipeline: "titiler", proxyType: "MINERALS",
    // ⚠️ (2026-08-23) Matches SatellitePipelines.ts TITILER_STYLES.MINERALS'
    // rescale ("0,4") — used ONLY by getChangeThresholdParams below to scale
    // the sensitivity slider into this index's real value range for Run
    // Change Detection. Has no effect on the preview/swipe image, which
    // still colors itself via dynamicRescale at render time.
    rescale: "0,4",
  },
  THERMAL: {
    label: "ASTER Thermal", desc: "TIR band, contrast-stretched", kind: "index",
    assets: [], color: "#ef4444", pipeline: "titiler", proxyType: "THERMAL",
    // ⚠️ (2026-08-23) TIR is raw uint16 DN (not calibrated brightness temp —
    // same caveat as SatellitePipelines.ts TITILER_STYLES.THERMAL). "0,4095"
    // is an approximate 12-bit-DN guess used only to scale the Run Change
    // Detection sensitivity slider into a sane range — NOT a measured range,
    // and it doesn't touch the preview's own dynamicRescale-based coloring.
    rescale: "0,4095",
  },

  // ── Sentinel-3 — SST/S3_LST/CHLOROPHYLL/FRP all go through the same
  // decode→GeoTIFF→raster-proxy pipeline as Sentinel-5P above (NOT direct
  // TiTiler — Planetary Computer's default tiler doesn't render these NetCDF
  // variables correctly, same reasoning documented in SatelliteDataPanel.tsx).
  // ⚠️ CHLOROPHYLL and FRP currently 400 on the decode backend itself for
  // reasons unrelated to this UI wiring (missing geo_coordinates asset for
  // OLCI chlorophyll, narrow-swath FRP tracks rarely intersecting a given
  // AOI) — see the comments above SENTINEL3_DECODE_VARIABLES in
  // sentinelDecode.ts. They're wired here the same as SST/S3_LST so they'll
  // work automatically once that backend fix lands, but expect them to error
  // until then.
  SST: {
    label: "Sea Surface Temp.", desc: "SLSTR sea surface temperature", kind: "index",
    assets: [], color: "#2dd4bf",
    pipeline: "decode", proxyType: "SST", decodeSource: "sentinel-3",
    rescale: "271,305", colormap: "turbo",
  },
  S3_LST: {
    label: "Land Surface Temp.", desc: "SLSTR land surface temperature", kind: "index",
    assets: [], color: "#f97316",
    pipeline: "decode", proxyType: "S3_LST", decodeSource: "sentinel-3",
    rescale: "250,330", colormap: "turbo",
  },
  CHLOROPHYLL: {
    label: "Chlorophyll", desc: "OLCI chlorophyll-a (neural-net)", kind: "index",
    assets: [], color: "#22c55e",
    pipeline: "decode", proxyType: "CHLOROPHYLL", decodeSource: "sentinel-3",
    rescale: "0,10", colormap: "turbo",
  },
  FRP: {
    label: "Fire Radiative Power", desc: "SLSTR fire radiative power", kind: "index",
    assets: [], color: "#dc2626",
    pipeline: "decode", proxyType: "FRP", decodeSource: "sentinel-3",
    rescale: "0,100", colormap: "hot",
  },
};

// ─── Per-source asset key overrides ────────────────────────────────────────
// ⚠️ BUG FIX (2026-08-18): PREVIEW_DEFS.assets above is written in Sentinel-2
// band names ("B04","B08",...) — that's the only naming scheme it ever used.
// getSceneAssetUrl() only tries case variants of the SAME string (B08/b08/B8),
// it never tries a *different* band name, so for any non-Sentinel-2 source
// with the same index (Landsat has NDVI/NDWI/NDMI/NDBI/SAVI/EVI/BSI/GNDVI/
// MSAVI2/NDDI/SI/CVI/NBRI too — see SOURCE_INDICES["landsat"] in
// SatellitePipelines.ts) the lookup silently failed and produced the
// "Could not resolve the required band URLs" error seen when running Change
// Detection with Landsat scenes selected.
//
// Fix: mirror the exact per-source band names SatelliteDataPanel.tsx already
// uses in its Landsat getVisualization() switch (nir08/red/green/blue/
// swir16/swir22 — all lowercase, that's how they're published on Planetary
// Computer's landsat-c2-l2 STAC collection), keyed the SAME order as the
// matching Sentinel-2 `assets` array above so `def.expression(assets)` still
// builds the right formula (e.g. NDVI stays [nir, red] either way).
const LANDSAT_ASSET_OVERRIDES: Partial<Record<PreviewKey, string[]>> = {
  RGB: ["red", "green", "blue"],
  NDVI: ["nir08", "red"],
  NDWI: ["green", "nir08"],
  NDMI: ["nir08", "swir16"],
  NDBI: ["swir16", "nir08"],
  SAVI: ["nir08", "red"],
  EVI: ["nir08", "red", "blue"],
  BSI: ["swir16", "red", "nir08", "blue"],
  GNDVI: ["nir08", "green"],
  MSAVI2: ["nir08", "red"],
  NDDI: ["nir08", "red", "green"],
  SI: ["red", "nir08"],
  CVI: ["nir08", "red", "green"],
  NBRI: ["nir08", "swir22"],
};

/** Real band asset keys to request for this index on this satellite source —
 *  Landsat gets its own lowercase names above, every other source (Sentinel-2,
 *  and the single-band VV/VH/ELEVATION entries which are source-specific by
 *  construction) uses PREVIEW_DEFS[indexKey].assets as-is. */
function getPreviewAssets(indexKey: PreviewKey, source: SatSource): string[] {
  if (source === "landsat" && LANDSAT_ASSET_OVERRIDES[indexKey]) {
    return LANDSAT_ASSET_OVERRIDES[indexKey]!;
  }
  return PREVIEW_DEFS[indexKey].assets;
}

// Kept for any old prop plumbing that still expects the pure-index map.
const CHANGE_INDEX_DEFS: Record<ChangeIndexKey, PreviewDef> = {
  RGB: PREVIEW_DEFS.RGB,
  SWIR: PREVIEW_DEFS.SWIR,
  NDVI: PREVIEW_DEFS.NDVI,
  NDWI: PREVIEW_DEFS.NDWI,
  NDMI: PREVIEW_DEFS.NDMI,
  NDBI: PREVIEW_DEFS.NDBI,
  SAVI: PREVIEW_DEFS.SAVI,
  EVI: PREVIEW_DEFS.EVI,
  BSI: PREVIEW_DEFS.BSI,
  NBRI: PREVIEW_DEFS.NBRI,
  GCI: PREVIEW_DEFS.GCI,
  VARI: PREVIEW_DEFS.VARI,
  RED_EDGE: PREVIEW_DEFS.RED_EDGE,
  MTVI: PREVIEW_DEFS.MTVI,
  TVI: PREVIEW_DEFS.TVI,
  GRVI: PREVIEW_DEFS.GRVI,
  MSI: PREVIEW_DEFS.MSI,
  NDSI: PREVIEW_DEFS.NDSI,
  NDRE: PREVIEW_DEFS.NDRE,
  GNDVI: PREVIEW_DEFS.GNDVI,
  MSAVI2: PREVIEW_DEFS.MSAVI2,
  CCCI: PREVIEW_DEFS.CCCI,
  NDDI: PREVIEW_DEFS.NDDI,
  SI: PREVIEW_DEFS.SI,
  CVI: PREVIEW_DEFS.CVI,
  RECI: PREVIEW_DEFS.RECI,
  SIPI: PREVIEW_DEFS.SIPI,
  PSRI: PREVIEW_DEFS.PSRI,
  OSI: PREVIEW_DEFS.OSI,
  RENDVI: PREVIEW_DEFS.RENDVI,
  REIP: PREVIEW_DEFS.REIP,
  NMDI_SOIL: PREVIEW_DEFS.NMDI_SOIL,
  NMDI_VEG: PREVIEW_DEFS.NMDI_VEG,
  ARI: PREVIEW_DEFS.ARI,
  ARI2: PREVIEW_DEFS.ARI2,
  CMR: PREVIEW_DEFS.CMR,
  FMR: PREVIEW_DEFS.FMR,
  IOI: PREVIEW_DEFS.IOI,
  NDCI: PREVIEW_DEFS.NDCI,
  FAI: PREVIEW_DEFS.FAI,
  MNDWI: PREVIEW_DEFS.MNDWI,
  GEMI: PREVIEW_DEFS.GEMI,
  MCARI: PREVIEW_DEFS.MCARI,
  CRI1: PREVIEW_DEFS.CRI1,
  CRI2: PREVIEW_DEFS.CRI2,
  CI: PREVIEW_DEFS.CI,
  EVI2: PREVIEW_DEFS.EVI2,
  MTCI: PREVIEW_DEFS.MTCI,
  NDVI705: PREVIEW_DEFS.NDVI705,
  NDTI: PREVIEW_DEFS.NDTI,
  TCARI: PREVIEW_DEFS.TCARI,
  VV: PREVIEW_DEFS.VV,
  VH: PREVIEW_DEFS.VH,
  ELEVATION: PREVIEW_DEFS.ELEVATION,
  RATIO: PREVIEW_DEFS.RATIO,
  SAR_RGB: PREVIEW_DEFS.SAR_RGB,
  SLOPE: PREVIEW_DEFS.SLOPE,
  HILLSHADE: PREVIEW_DEFS.HILLSHADE,
  ASPECT: PREVIEW_DEFS.ASPECT,
  SST: PREVIEW_DEFS.SST,
  S3_LST: PREVIEW_DEFS.S3_LST,
  CHLOROPHYLL: PREVIEW_DEFS.CHLOROPHYLL,
  FRP: PREVIEW_DEFS.FRP,
  ASTER_RGB: PREVIEW_DEFS.ASTER_RGB,
  MINERALS: PREVIEW_DEFS.MINERALS,
  THERMAL: PREVIEW_DEFS.THERMAL,
  MODIS_NDVI: PREVIEW_DEFS.MODIS_NDVI,
  MODIS_EVI: PREVIEW_DEFS.MODIS_EVI,
  MODIS_FIRE: PREVIEW_DEFS.MODIS_FIRE,
  MODIS_LST: PREVIEW_DEFS.MODIS_LST,
  NO2: PREVIEW_DEFS.NO2,
  SO2: PREVIEW_DEFS.SO2,
  CO: PREVIEW_DEFS.CO,
  OZONE: PREVIEW_DEFS.OZONE,
};

// Maps the panel's index selector to the server-side change-detection analysis
// type exposed by /api/raster-proxy/analyze — the actual classification (5
// clear classes, computed from real band math, not colorized-PNG guessing)
// happens server-side in that route. Normalized-difference indices support
// this directly; RGB/SWIR are composites reduced to Rec.709 luminance
// server-side (change_rgb/change_swir) and classified on that scalar instead.
const CHANGE_API_TYPE: Record<ChangeIndexKey, string> = {
  RGB: "change_rgb",
  SWIR: "change_swir",
  NDVI: "change_ndvi",
  NDWI: "change_ndwi",
  NDMI: "change_ndmi",
  NDBI: "change_ndbi",
  SAVI: "change_savi",
  EVI: "change_evi",
  BSI: "change_bsi",
  NBRI: "change_nbri",
  GCI: "change_gci",
  VARI: "change_vari",
  RED_EDGE: "change_red_edge",
  MTVI: "change_mtvi",
  TVI: "change_tvi",
  GRVI: "change_grvi",
  MSI: "change_msi",
  NDSI: "change_ndsi",
  NDRE: "change_ndre",
  GNDVI: "change_gndvi",
  MSAVI2: "change_msavi2",
  CCCI: "change_ccci",
  NDDI: "change_nddi",
  SI: "change_si",
  CVI: "change_cvi",
  RECI: "change_reci",
  SIPI: "change_sipi",
  PSRI: "change_psri",
  OSI: "change_osi",
  RENDVI: "change_rendvi",
  REIP: "change_reip",
  NMDI_SOIL: "change_nmdi_soil",
  NMDI_VEG: "change_nmdi_veg",
  ARI: "change_ari",
  ARI2: "change_ari2",
  CMR: "change_cmr",
  FMR: "change_fmr",
  IOI: "change_ioi",
  NDCI: "change_ndci",
  FAI: "change_fai",
  MNDWI: "change_mndwi",
  GEMI: "change_gemi",
  MCARI: "change_mcari",
  CRI1: "change_cri1",
  CRI2: "change_cri2",
  CI: "change_ci",
  EVI2: "change_evi2",
  MTCI: "change_mtci",
  NDVI705: "change_ndvi705",
  NDTI: "change_ndti",
  TCARI: "change_tcari",
  // Non-optical sources (2026-08-18) — VV/VH already existed server-side;
  // change_elevation is new, added alongside this in route.ts.
  VV: "change_vv",
  VH: "change_vh",
  ELEVATION: "change_elevation",
  // ⚠️ (2026-08-23) RATIO/SAR_RGB — the last two Sentinel-1 indices, now
  // classifiable too. RATIO reuses vv_vh_ratio's dB-difference formula as-is;
  // SAR_RGB (a 3-channel composite, R=VV/G=VH/B=ratio, all in dB) gets the
  // same "reduce to one scalar" treatment change_rgb/change_swir use for
  // optical composites, just with Rec.709 weights applied to the dB channels
  // instead of ÷10000 reflectance — see change_ratio/change_sar_rgb in
  // route.ts's ANALYSIS_CONFIG.
  RATIO: "change_ratio",
  SAR_RGB: "change_sar_rgb",
  // ⚠️ (2026-08-23) SLOPE/HILLSHADE/ASPECT — route.ts's dem_change branches.
  SLOPE: "change_slope",
  HILLSHADE: "change_hillshade",
  ASPECT: "change_aspect",
  // ⚠️ (2026-08-22) Sentinel-3 decode-pipeline indices — note the type name
  // here is NOT proxyType.toLowerCase() like most others (that would give
  // "change_s3_lst"/"change_chlorophyll"/"change_frp", which don't exist).
  // route.ts names these after the actual decode `variable` string instead
  // (see UI_BAND_TO_SENTINEL_VARIABLE in sentinelDecode.ts: S3_LST→"LST",
  // CHLOROPHYLL→"CHL_NN", FRP→"FRP_MWIR") — same mismatch already documented
  // for the single-scene "lst"/"chl_nn"/"frp_mwir" type names in route.ts.
  SST: "change_sst",
  S3_LST: "change_lst",
  CHLOROPHYLL: "change_chl_nn",
  FRP: "change_frp_mwir",
  // ⚠️ (2026-08-23) ASTER — see ASTER_CHANGE_BIDX below for how runChangeDetection
  // resolves these three (repeated href + bidx list, not a plain asset-per-band).
  ASTER_RGB: "change_aster_rgb",
  MINERALS: "change_minerals",
  THERMAL: "change_thermal",
  // ⚠️ (2026-08-23) MODIS — route.ts's change_modis_* branches read the raw
  // COG hrefs the same way change_vv/change_elevation do (see PREVIEW_DEFS
  // MODIS_* `assets` comment above), no ASTER_CHANGE_BIDX-style entry needed.
  MODIS_NDVI: "change_modis_ndvi",
  MODIS_EVI: "change_modis_evi",
  MODIS_FIRE: "change_modis_fire",
  MODIS_LST: "change_modis_lst",
  // ⚠️ (2026-08-23) Sentinel-5P gases — route.ts names these change_no2/
  // change_so2/change_co/change_ozone (proxyType.toLowerCase() matches here,
  // unlike the Sentinel-3 group above). "OZONE" intentionally maps to
  // "change_ozone", not "change_o3" — route.ts has both as an alias pair
  // (change_o3 === change_ozone exactly) but PREVIEW_DEFS.OZONE's own
  // proxyType is "OZONE", so staying consistent with that here.
  NO2: "change_no2",
  SO2: "change_so2",
  CO: "change_co",
  OZONE: "change_ozone",
};

// ⚠️ (2026-08-23) ASTER doesn't have one STAC asset per band like Sentinel-2/
// Landsat — its bands live packed inside 3 multi-band composite files (see
// SatellitePipelines.ts's ASTER comment): VNIR (3 bands: Band1,Band2,Band3N),
// SWIR (6 bands), TIR (5 bands). To classify these, runChangeDetection below
// resolves ONE href per composite (via getSceneAssetUrl, same as any other
// raw-href source) and repeats it once per band index listed here, paired
// with a matching `&bidx=` (1-based) query param route.ts's readBand() uses
// to pick that band out of the file — instead of getPreviewAssets(), which
// only makes sense for "one asset key = one band" sources.
const ASTER_CHANGE_BIDX: Partial<Record<ChangeIndexKey, { assetKey: string; bidx: number[] }>> = {
  ASTER_RGB: { assetKey: "VNIR", bidx: [1, 2, 3] },
  // Matches TITILER_STYLES.MINERALS' expression (SWIR_b1/b3, SWIR_b5/b3, SWIR_b1/b5).
  MINERALS: { assetKey: "SWIR", bidx: [1, 3, 5] },
  THERMAL: { assetKey: "TIR", bidx: [1] },
};

// ⚠️ NOT "PREVIEW_DEFS[key].kind === 'index'" — RGB/SWIR/SAR_RGB are all
// "composite" kind yet ARE classifiable (route.ts reduces each to a single
// scalar first: luminance for RGB/SWIR, Rec.709-weighted dB for SAR_RGB — see
// change_rgb/change_swir/change_sar_rgb in ANALYSIS_CONFIG). Similarly,
// SLOPE/HILLSHADE/ASPECT aren't classified via a per-pixel `formula` at all —
// route.ts's dem_change kind recomputes their 3×3-neighborhood gradient for
// both dates instead (see DemChangeConfig there). As of 2026-08-23 (with
// SLOPE/HILLSHADE/ASPECT added) EVERY PreviewKey has a matching change_<index>
// branch in route.ts — see CHANGE_API_TYPE below, which is kept as the actual
// source of truth (so a newly-added preview-only entry doesn't silently look
// classifiable here before its change_ branch actually exists server-side).
function isClassifiable(key: PreviewKey): key is ChangeIndexKey {
  return Object.prototype.hasOwnProperty.call(CHANGE_API_TYPE, key);
}

// Indices whose natural value range is close enough to the original 7's
// (roughly -1..1, actual ranges 0.6-1.2) that the server's flat 0.08/0.25
// threshold/classThreshold defaults already work fine — so we leave them
// alone (unscaled `threshold`, no `classThreshold` override) to not change
// behavior anyone's already relying on.
// ⚠️ (2026-08-23) ASTER_RGB added — change_aster_rgb's luminance formula
// divides by 255 (ASTER VNIR's 8-bit DN scale), landing in the same ~0-1
// range as change_rgb/change_swir's /10000 reduction, so the flat 0.08/0.25
// server defaults are meaningful here too, same reasoning as RGB/SWIR.
const NARROW_RANGE_CHANGE_KEYS = new Set<ChangeIndexKey>(["NBRI", "VARI", "MTVI", "GRVI", "NDSI", "RGB", "SWIR", "ASTER_RGB"]);

// The other 4 (MSI, GCI, TVI, RED_EDGE) are ratios/wavelengths with ranges
// nothing like -1..1 (0.2-2, 0-4, 0-50, 700-740nm) — sending the raw 0.02-0.3
// slider value as an absolute threshold there is either noise-level (TVI,
// RED_EDGE) or trivially-always-true (MSI, GCI), so the sensitivity slider
// would do effectively nothing. Instead we scale it by the index's own
// rescale range (same range route.ts uses for the preview colormap, in
// PREVIEW_DEFS[key].rescale) and pick a classThreshold about 45% of the way
// up that range — same role 0.25 plays for the original -1..1 indices.
function getChangeThresholdParams(key: ChangeIndexKey, sliderThreshold: number): { threshold: number; classThreshold?: number } {
  if (NARROW_RANGE_CHANGE_KEYS.has(key)) return { threshold: sliderThreshold };
  const rescale = CHANGE_INDEX_DEFS[key]?.rescale;
  if (!rescale) return { threshold: sliderThreshold };
  const [min, max] = rescale.split(",").map(Number);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return { threshold: sliderThreshold };
  const range = max - min;
  return {
    threshold: sliderThreshold * range,
    classThreshold: min + range * 0.45,
  };
}

interface ChangeLegendItem { key: string; label: string; color: string }
interface ChangeStats {
  noDataPct: number;
  noChangePct: number;
  gainPct: number;
  lossPct: number;
  otherPct: number;
}

// Fallback legend (labels/colors) in case the API response is missing the
// X-Change-Legend header for some reason — mirrors route.ts exactly.
function defaultChangeLegend(indexKey: ChangeIndexKey): ChangeLegendItem[] {
  const GAIN_LOSS_LABELS: Record<ChangeIndexKey, [string, string]> = {
    // Matches route.ts change_rgb/change_swir gainLabel/lossLabel exactly.
    RGB: ["Brightness Gain", "Brightness Loss"],
    SWIR: ["SWIR Signal Gain", "SWIR Signal Loss"],
    NDVI: ["Vegetation Gain", "Vegetation Loss"],
    NDWI: ["Water Gain", "Water Loss"],
    NDMI: ["Moisture Gain", "Moisture Loss"],
    NDBI: ["Built-up Gain", "Built-up Loss"],
    SAVI: ["Vegetation Gain", "Vegetation Loss"],
    EVI: ["Vegetation Gain", "Vegetation Loss"],
    BSI: ["Bare Soil Gain", "Bare Soil Loss"],
    NBRI: ["Vegetation Gain (Burn Recovery)", "Vegetation Loss (New Burn Scar)"],
    GCI: ["Chlorophyll Increase", "Chlorophyll Decrease"],
    VARI: ["Vegetation Gain", "Vegetation Loss"],
    RED_EDGE: ["Red-Edge Position Increase (More Vigor)", "Red-Edge Position Decrease (Less Vigor)"],
    MTVI: ["Vegetation Gain", "Vegetation Loss"],
    TVI: ["Vegetation Gain", "Vegetation Loss"],
    GRVI: ["Vegetation Gain", "Vegetation Loss"],
    // ⚠️ MSI is inverted vs. NDVI-style indices — higher = more water-stressed,
    // so a positive delta ("gain") means stress is INCREASING, not improving.
    MSI: ["Moisture Stress Increase", "Moisture Stress Decrease"],
    NDSI: ["Snow/Ice Gain", "Snow/Ice Loss"],
    NDRE: ["Chlorophyll Gain", "Chlorophyll Loss"],
    GNDVI: ["Vegetation Gain", "Vegetation Loss"],
    MSAVI2: ["Vegetation Gain", "Vegetation Loss"],
    CCCI: ["Chlorophyll/Nitrogen Gain", "Chlorophyll/Nitrogen Loss"],
    NDDI: ["Drought Stress Increase", "Drought Stress Decrease"],
    SI: ["Salinity Increase", "Salinity Decrease"],
    CVI: ["Chlorophyll Increase", "Chlorophyll Decrease"],
    RECI: ["Chlorophyll Increase", "Chlorophyll Decrease"],
    SIPI: ["Pigment Stress Increase", "Pigment Stress Decrease"],
    // ⚠️ PSRI is inverted like MSI — negative = healthy, positive = senescing.
    PSRI: ["Senescence/Stress Increase", "Senescence/Stress Decrease"],
    OSI: ["Oil Sheen Signal Increase", "Oil Sheen Signal Decrease"],
    RENDVI: ["Chlorophyll Gain", "Chlorophyll Loss"],
    REIP: ["Red-Edge Position Increase (More Vigor)", "Red-Edge Position Decrease (Less Vigor)"],
    // Rising NMDI reads as drier soil on bare/sparse ground — not "gain".
    NMDI_SOIL: ["NMDI Increase (Drier Soil)", "NMDI Decrease (Wetter Soil)"],
    NMDI_VEG: ["Canopy Moisture Increase", "Canopy Moisture Decrease"],
    ARI: ["Anthocyanin Increase", "Anthocyanin Decrease"],
    ARI2: ["Anthocyanin Increase (Leaf-Corrected)", "Anthocyanin Decrease (Leaf-Corrected)"],
    CMR: ["Clay Mineral Signal Increase", "Clay Mineral Signal Decrease"],
    FMR: ["Ferrous Mineral Signal Increase", "Ferrous Mineral Signal Decrease"],
    IOI: ["Iron Oxide Signal Increase", "Iron Oxide Signal Decrease"],
    NDCI: ["Chlorophyll-a Increase", "Chlorophyll-a Decrease"],
    FAI: ["Floating Algae Signal Increase", "Floating Algae Signal Decrease"],
    MNDWI: ["Water Extent Gain", "Water Extent Loss"],
    GEMI: ["Vegetation Gain", "Vegetation Loss"],
    MCARI: ["Chlorophyll Absorption Increase", "Chlorophyll Absorption Decrease"],
    CRI1: ["Carotenoid Signal Increase", "Carotenoid Signal Decrease"],
    CRI2: ["Carotenoid Signal Increase (Canopy-Corrected)", "Carotenoid Signal Decrease (Canopy-Corrected)"],
    CI: ["Cyanobacteria Bloom Signal Increase", "Cyanobacteria Bloom Signal Decrease"],
    EVI2: ["Vegetation Gain", "Vegetation Loss"],
    MTCI: ["Chlorophyll Increase", "Chlorophyll Decrease"],
    NDVI705: ["Chlorophyll Gain", "Chlorophyll Loss"],
    NDTI: ["Turbidity Increase", "Turbidity Decrease"],
    TCARI: ["Chlorophyll Absorption Increase", "Chlorophyll Absorption Decrease"],
    VV: ["Backscatter Gain", "Backscatter Loss"],
    VH: ["Backscatter Gain", "Backscatter Loss"],
    ELEVATION: ["Elevation Gain", "Elevation Loss"],
    // ⚠️ (2026-08-23) Matches route.ts change_ratio/change_sar_rgb gainLabel/
    // lossLabel exactly.
    RATIO: ["Ratio Increase", "Ratio Decrease"],
    SAR_RGB: ["SAR Brightness Gain", "SAR Brightness Loss"],
    // ⚠️ (2026-08-23) Matches route.ts change_slope/change_hillshade/
    // change_aspect gainLabel/lossLabel exactly.
    SLOPE: ["Slope Increase (Steeper)", "Slope Decrease (Flatter)"],
    HILLSHADE: ["Illumination Increase", "Illumination Decrease"],
    ASPECT: ["Aspect Rotated Clockwise", "Aspect Rotated Counter-Clockwise"],
    // ⚠️ (2026-08-22) matches route.ts change_sst/change_lst/change_frp_mwir/
    // change_chl_nn gainLabel/lossLabel exactly.
    SST: ["SST Warming", "SST Cooling"],
    S3_LST: ["LST Warming", "LST Cooling"],
    CHLOROPHYLL: ["Chlorophyll Increase", "Chlorophyll Decrease"],
    FRP: ["Fire Radiative Power Increase", "Fire Radiative Power Decrease"],
    // ⚠️ (2026-08-23) Matches route.ts change_aster_rgb/change_minerals/
    // change_thermal gainLabel/lossLabel exactly.
    ASTER_RGB: ["Brightness Gain", "Brightness Loss"],
    MINERALS: ["Mineral Signal Increase", "Mineral Signal Decrease"],
    THERMAL: ["Thermal Signal Increase", "Thermal Signal Decrease"],
    // ⚠️ (2026-08-23) Matches route.ts change_modis_ndvi/change_modis_evi/
    // change_modis_fire/change_modis_lst gainLabel/lossLabel exactly.
    MODIS_NDVI: ["Vegetation Gain", "Vegetation Loss"],
    MODIS_EVI: ["Vegetation Gain", "Vegetation Loss"],
    MODIS_FIRE: ["Fire Activity Increase", "Fire Activity Decrease"],
    MODIS_LST: ["Temperature Increase", "Temperature Decrease"],
    // ⚠️ (2026-08-23) Matches route.ts change_no2/change_so2/change_co/
    // change_ozone gainLabel/lossLabel exactly.
    NO2: ["NO2 Increase", "NO2 Decrease"],
    SO2: ["SO2 Increase", "SO2 Decrease"],
    CO: ["CO Increase", "CO Decrease"],
    OZONE: ["Ozone Increase", "Ozone Decrease"],
  };
  const [gainLabel, lossLabel] = GAIN_LOSS_LABELS[indexKey];
  return [
    { key: "gain", label: gainLabel, color: "#00c853" },
    { key: "noChange", label: "No Change", color: "#228b22" },
    { key: "loss", label: lossLabel, color: "#e53935" },
    { key: "other", label: "Other Change", color: "#eab308" },
    { key: "noData", label: "No Data", color: "#9ca3af" },
  ];
}

function bboxGeometry(bbox: number[]): GeoJSON.Polygon {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return {
    type: "Polygon",
    coordinates: [[
      [minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat],
    ]],
  };
}

function stacBBoxToBounds(bbox?: number[], fallback?: [[number, number], [number, number]]) {
  if (Array.isArray(bbox) && bbox.length >= 4) {
    const [west, south, east, north] = bbox.map(Number);
    if ([west, south, east, north].every(Number.isFinite)) {
      return [[south, west], [north, east]] as [[number, number], [number, number]];
    }
  }
  return fallback ?? [[30.0094, 31.2007], [30.0794, 31.2707]] as [[number, number], [number, number]];
}

function boundsCenter(bounds: [[number, number], [number, number]]) {
  const [[south, west], [north, east]] = bounds;
  return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

function normalizeBandAssetKey(key: string) {
  const upper = key.toUpperCase();
  const match = upper.match(/^B0?(\d{1,2})$/);
  return match ? `B${match[1].padStart(2, "0")}` : upper;
}

function getAssetLookupKeys(assetKey: string) {
  const normalizedKey = normalizeBandAssetKey(assetKey);
  return Array.from(new Set([
    assetKey, normalizedKey, assetKey.toLowerCase(), assetKey.toUpperCase(),
    assetKey.replace(/^B0/, "B"), normalizedKey.replace(/^B0/, "B"),
  ]));
}

function getSceneAssetUrl(scene: SatelliteScene, assetKey: string) {
  return getAssetLookupKeys(assetKey).map((key) => scene.assets[key]).find(Boolean);
}

// ── Sentinel-1 SAR-derivative / DEM-derivative pipeline ─────────────────────
// Mirrors makeRasterProxyAnalyzeUrl in SatelliteDataPanel.tsx exactly (same
// query params, same branch logic) so /api/raster-proxy/analyze — which
// already serves this "type" for the single-scene view — renders identically
// here. No backend change needed: this just calls the same endpoint the same
// way SatelliteDataPanel.tsx already does successfully.
function makeRasterProxyPreviewUrl(
  scene: SatelliteScene,
  def: PreviewDef,
  bbox: [number, number, number, number],
): string | undefined {
  const [west, south, east, north] = bbox;
  const assetKeys = def.proxyAssets ?? [];
  const rawUrls = assetKeys.map((key) => getSceneAssetUrl(scene, key)).filter(Boolean) as string[];
  if (!scene.id || !scene.collection || rawUrls.length !== assetKeys.length) return scene.thumbnail;

  const params = new URLSearchParams();
  params.set("type", def.proxyType!);
  params.set("urls", rawUrls.join(","));
  params.set("bbox", `${west},${south},${east},${north}`);

  if (def.proxyKind === "composite") {
    params.set("sharpen", "1");
  } else if (def.proxyKind === "dem") {
    const [minVal, maxVal] = (def.rescale ?? "0,1").split(",");
    params.set("min", minVal);
    params.set("max", maxVal);
    if (def.colormap) params.set("colormap", def.colormap);
    if (def.proxyType === "aspect") params.set("transparent", "0");
  } else {
    const [minVal, maxVal] = (def.rescale ?? "-1,1").split(",");
    params.set("min", minVal);
    params.set("max", maxVal);
    if (def.colormap) params.set("colormap", def.colormap);
    if (def.proxyType === "vv_vh_ratio") params.set("transparent", "0");
  }
  return `/api/raster-proxy/analyze?${params.toString()}`;
}

async function makePreviewUrl(
  scene: SatelliteScene,
  indexKey: PreviewKey,
  bbox: [number, number, number, number], // [west, south, east, north] — the AOI, not the scene tile
  source: SatSource,
  sentinelDecodeToken?: string,
  // ⚠️ (2026-08-22) titilerSharedRescale: لو indexKey من نوع "titiler" وعنده
  // dynamicRescale (FIRE/LST/MINERALS/THERMAL)، ده الـ rescale المحسوب مرة
  // واحدة من fetchPairDynamicRescale على السينتين (قبل/بعد) مع بعض — بيتبعت
  // هنا عشان صورة الـ"قبل" وصورة الـ"بعد" يترسموا بنفس مقياس الألوان بالظبط
  // (شوفي fetchPairDynamicRescale في SatellitePipelines.ts للتفاصيل).
  titilerSharedRescale?: string | null,
  // ⚠️ (2026-08-22) progressive rendering — بس لمسار "decode" (Sentinel-3/
  // 5P): decodeAndBuildHeatmapUrl بقت بتقدر تنادّي onDecoded فورًا بمجرد ما
  // فك الـ NetCDF يخلص (default rescale)، قبل ما تستنى statistics. بنمرّر
  // الكولباك ده لحد هناك عشان الصورة تتعرض على الخريطة أسرع بدل الانتظار
  // الكامل، وبعدين لما makePreviewUrl نفسها ترجع بالنتيجة النهائية (تلوين
  // دقيق)، الـ caller يحدّث الصورة تاني. لباقي الـ pipelines (titiler/
  // raster-proxy) مفيش فرق — بترجع فورًا زي ما هي، مفيش حاجة تتحسن هنا.
  onProgress?: (previewUrl: string) => void,
// ⚠️ (2026-08-22) رجعنا object فيه `error` مش string بس — عشان لما الـ
// decode/titiler pipeline يفشل (Sentinel-3/Sentinel-5P)، بدل ما نرجع
// scene.thumbnail بصمت (اللي غالبًا undefined أصلًا لـ NetCDF items، فمفيش
// حاجة تتعرض على الخريطة خالص من غير أي تفسير)، نقدر نعرض سبب الفشل
// الحقيقي في الواجهة (401 توكن، 400 من الباك، "no valid pixels"...).
): Promise<{ url?: string; error?: string }> {
  const def = PREVIEW_DEFS[indexKey];
  if (!scene.id || !scene.collection) return { url: scene.thumbnail };

  // ── Non-optical pipelines (2026-08-18 batch 2) — dispatch before touching
  // `assets`/getPreviewAssets, which only make sense for the default
  // Sentinel-2/Landsat/VV/VH/ELEVATION path below.
  if (def.pipeline === "raster-proxy") {
    return { url: makeRasterProxyPreviewUrl(scene, def, bbox) };
  }
  if (def.pipeline === "titiler") {
    const bboxUrl = await buildTitilerBboxUrl(
      scene.collection, scene.id, def.proxyType as SatelliteAnalysisType, bbox,
      titilerSharedRescale ?? undefined,
    );
    if (bboxUrl) return { url: bboxUrl };
    return {
      url: scene.thumbnail,
      error: scene.thumbnail
        ? undefined
        : "TiTiler didn't return an image for this scene/AOI (no thumbnail fallback available either).",
    };
  }
  if (def.pipeline === "decode") {
    if (!sentinelDecodeToken) {
      return {
        url: scene.thumbnail,
        error: "Missing auth token — you're not signed in (or the session has no accessToken), so /gis/sentinel5p/decode can't authenticate this request.",
      };
    }
    const variable = UI_BAND_TO_SENTINEL_VARIABLE[def.proxyType!];
    if (!variable) {
      return { url: scene.thumbnail, error: `No UI_BAND_TO_SENTINEL_VARIABLE mapping for "${def.proxyType}".` };
    }
    try {
      const { tileUrl } = await decodeAndBuildHeatmapUrl({
        token: sentinelDecodeToken,
        source: def.decodeSource!,
        itemId: scene.id,
        variable,
        collection: scene.collection,
        bbox,
        onDecoded: onProgress ? ({ tileUrl: previewTileUrl }) => onProgress(previewTileUrl) : undefined,
      });
      return { url: tileUrl };
    } catch (err) {
      // SentinelDecodeError (no data / narrow-swath miss) or network error —
      // fall back to the scene thumbnail rather than breaking the swipe, but
      // now also surface *why* so it's not a silent blank map.
      // ⚠️ (2026-08-22) كانت هنا بتطبع err.message الخام حتى لو
      // isNoDataForArea=true (شوفي "Sentinel decode failed (400). {...}" —
      // نفس رسالة الـ backend الكاملة كJSON). دلوقتي بنعمل نفس الفحص
      // الموجود في SatelliteDataPanel.tsx (handlePreviewScene) عشان نعرض
      // رسالة ودّية بدل الـ JSON الخام لما السبب يكون معروف (narrow-swath/
      // no-data-for-area)، ونسيب باقي أنواع الأخطاء (شبكة/توكن/بg) زي ما هي.
      const message =
        err instanceof SentinelDecodeError && err.isNoDataForArea
          ? `No valid data for "${def.proxyType}" in this area/scene — the satellite's narrow data track likely didn't pass directly over this AOI. Try a different scene or location.`
          : err instanceof SentinelDecodeError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
      console.warn("[ChangeDetectionPanel] decode preview failed:", message);
      return { url: scene.thumbnail, error: message };
    }
  }

  const assets = getPreviewAssets(indexKey, source);

  const hrefs = assets.map((asset) => getSceneAssetUrl(scene, asset));
  if (hrefs.some((h) => !h)) {
    return { url: scene.thumbnail, error: scene.thumbnail ? undefined : "Missing one or more required bands/assets for this index on this scene." };
  }

  const [west, south, east, north] = bbox;
  // Keep the rendered image's pixel aspect ratio matched to the AOI's geographic
  // aspect ratio, so it doesn't stretch — and so downstream bbox-based clipping
  // (clipImageToPolygon) can assume the image covers exactly this bbox.
  const aoiW = east - west;
  const aoiH = north - south;
  const ratio = aoiW / (aoiH || 0.001);
  const BASE = 640;
  const imgW = ratio >= 1 ? BASE : Math.round(BASE * ratio);
  const imgH = ratio >= 1 ? Math.round(BASE / ratio) : BASE;

  // IMPORTANT: use the /bbox/ path endpoint, not /preview.png — /preview.png ignores
  // bbox entirely and always returns the full scene tile (~110x110km), which is why
  // the swipe used to render a huge stretched image and why AOI-shaped clipping was
  // misaligned (the image didn't actually cover the AOI bounds it was told to cover).
  const bboxPath = `${west},${south},${east},${north}`;
  const url = new URL(`https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/${bboxPath}/${imgW}x${imgH}.png`);
  url.searchParams.set("collection", scene.collection);
  url.searchParams.set("item", scene.id);
  assets.forEach((asset) => {
    url.searchParams.append("assets", asset);
    url.searchParams.append("asset_bidx", `${asset}|1`);
  });
  url.searchParams.set("asset_as_band", "true");

  if (def.kind === "composite") {
    // True/false color composite: render the raw bands directly as R,G,B — no
    // expression, no colormap. TiTiler maps them in the order they're listed
    // in `assets` (already [R, G, B] per PREVIEW_DEFS above).
    // A mild rescale (Sentinel-2 L2A surface reflectance is ~0–3000ish for
    // most scenes) keeps it from looking near-black/near-white.
    url.searchParams.set("rescale", "0,2500");
  } else {
    const expr = def.expression
      ? def.expression(assets)
      : `(${assets[0]}-${assets[1]})/(${assets[0]}+${assets[1]})`;
    url.searchParams.set("expression", expr);
    // tighter rescale per index = the colormap uses its full range where pixel values actually
    // cluster, instead of stretching across the theoretical [-1,1] and looking pale/washed out
    url.searchParams.set("rescale", def.rescale ?? "-0.3,0.5");
    url.searchParams.set("colormap_name", def.colormap ?? "rdylgn");
  }
  return { url: url.toString() };
}

function formatDateDMY(value: string) {
  const [year, month, day] = (value || "").split("-");
  if (!year || !month || !day) return value || "DD/MM/YYYY";
  return `${day}/${month}/${year}`;
}

function ImageSwipeCompare({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const draggingRef = useRef(false);

  const setPositionFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(2, Math.min(98, pct)));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      setPositionFromClientX(e.clientX);
    };
    const onUp = () => { draggingRef.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [setPositionFromClientX]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] rounded-md overflow-hidden border border-white/[0.07] bg-slate-950 cursor-ew-resize select-none touch-none"
        onPointerDown={(e) => {
          draggingRef.current = true;
          containerRef.current?.setPointerCapture(e.pointerId);
          setPositionFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          setPositionFromClientX(e.clientX);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeUrl} alt={beforeLabel} draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ filter: "saturate(1.35) contrast(1.12)" }}
        />
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={afterUrl} alt={afterLabel} draggable={false}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ filter: "saturate(1.35) contrast(1.12)" }}
          />
        </div>

        <div
          className="absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.7)] pointer-events-none"
          style={{ left: `${position}%` }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-cyan-400 bg-[#020817]/90 shadow-lg text-cyan-300 text-xs font-bold">
            ↔
          </div>
        </div>

        <span className="absolute top-2 left-2 z-10 text-[0.55rem] font-bold uppercase bg-black/65 text-sky-300 px-2 py-0.5 rounded pointer-events-none">
          {beforeLabel}
        </span>
        <span className="absolute top-2 right-2 z-10 text-[0.55rem] font-bold uppercase bg-black/65 text-orange-300 px-2 py-0.5 rounded pointer-events-none">
          {afterLabel}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="w-full accent-cyan-400"
        aria-label="Swipe between before and after images"
      />
      <p className="text-[0.52rem] text-slate-600 text-center">اسحبي على الصورة أو الـ slider لمقارنة Before ↔ After</p>
    </div>
  );
}

function ComparePanel({
  url,
  label,
  accent,
}: {
  url: string;
  label: string;
  accent?: string;
}) {
  return (
    <figure className="flex flex-col gap-2 min-w-0">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-white/[0.08] bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="absolute inset-0 h-full w-full object-cover" style={{ filter: "saturate(1.35) contrast(1.12)" }} />
      </div>
      <figcaption
        className="text-center text-xs font-medium text-slate-300"
        style={accent ? { color: accent } : undefined}
      >
        {label}
      </figcaption>
    </figure>
  );
}

function ChangeCompareModal({
  open,
  onClose,
  beforeUrl,
  afterUrl,
  changeUrl,
  beforeDate,
  afterDate,
  indexKey,
}: {
  open: boolean;
  onClose: () => void;
  beforeUrl: string;
  afterUrl: string;
  changeUrl?: string | null;
  beforeDate?: string;
  afterDate?: string;
  indexKey: PreviewKey;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cols = changeUrl ? "grid-cols-3" : "grid-cols-2";

  return (
    <div
      className="fixed inset-0 z-[3600] flex items-center justify-center p-3 sm:p-6"
      style={{ pointerEvents: "all" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div className="relative z-10 flex w-full max-w-6xl max-h-[95dvh] flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-[#060d1b] shadow-[0_32px_96px_rgba(0,0,0,0.85)]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3.5 shrink-0">
          <div>
            <p className="text-sm font-semibold text-slate-100">Before / After Comparison</p>
            <p className="text-[0.65rem] text-slate-500 mt-0.5">
              {beforeDate && afterDate
                ? `${formatDateDMY(beforeDate)} → ${formatDateDMY(afterDate)} · ${indexKey}`
                : indexKey}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/[0.07] hover:text-slate-200"
            aria-label="Close comparison"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scroll">
          {/* ── Swipe comparison — full width, large ── */}
          <div className="p-4 border-b border-white/[0.06]">
            <p className="text-[0.6rem] uppercase tracking-wider text-cyan-300/70 mb-2.5">
              ↔ اسحب للمقارنة بين Before و After
            </p>
            <ImageSwipeCompare
              beforeUrl={beforeUrl}
              afterUrl={afterUrl}
              beforeLabel={beforeDate ? `Before · ${formatDateDMY(beforeDate)}` : "Before"}
              afterLabel={afterDate ? `After · ${formatDateDMY(afterDate)}` : "After"}
              className="max-h-[55vh]"
            />
          </div>

          {/* ── 3 images side by side, always horizontal ── */}
          <div className="p-4">
            <p className="text-[0.6rem] uppercase tracking-wider text-slate-500 mb-3">Side-by-side view</p>
            <div className={`grid ${cols} gap-3`}>
              <ComparePanel url={beforeUrl} label="Before change" accent="#38bdf8" />
              <ComparePanel url={afterUrl} label="After Change" accent="#fb923c" />
              {changeUrl && <ComparePanel url={changeUrl} label="Change label" accent="#a78bfa" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DatePickerField({
  label, value, min, max, onChange,
}: { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full cursor-pointer rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 font-mono text-xs text-slate-200 outline-none transition [color-scheme:dark] focus:border-cyan-400/40"
        aria-label={label}
        title={formatDateDMY(value)}
      />
    </label>
  );
}

function SceneSlot({
  title,
  color,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  cloudCover,
  onCloudCoverChange,
  scenes,
  status,
  error,
  selectedScene,
  onSelectScene,
  onSearch,
}: {
  title: string;
  color: string;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  cloudCover: number;
  onCloudCoverChange: (v: number) => void;
  scenes: SatelliteScene[];
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  selectedScene: SatelliteScene | null;
  onSelectScene: (scene: SatelliteScene) => void;
  onSearch: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <p className="text-[0.68rem] font-semibold text-slate-200">{title}</p>
        {selectedScene && (
          <span className="ml-auto text-[0.55rem] text-emerald-300 bg-emerald-400/10 border border-emerald-400/20 rounded-full px-2 py-0.5">
            {formatDateDMY(selectedScene.date)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <DatePickerField label="From" value={dateFrom} max={dateTo} onChange={onDateFromChange} />
        <DatePickerField label="To" value={dateTo} min={dateFrom} onChange={onDateToChange} />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Max cloud cover</span>
          <span className="text-[0.62rem] font-semibold text-cyan-300">{cloudCover}%</span>
        </div>
        <input type="range" min={0} max={80} value={cloudCover} onChange={(e) => onCloudCoverChange(Number(e.target.value))} className="w-full accent-cyan-400" />
      </div>

      <button
        type="button"
        onClick={onSearch}
        disabled={status === "loading"}
        className="h-8 w-full rounded-lg border border-cyan-400/25 bg-cyan-400/10 text-cyan-200 text-[0.65rem] font-semibold transition-all hover:bg-cyan-400/15 hover:border-cyan-400/40 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === "loading" ? "Searching scenes..." : "Search scenes"}
      </button>

      {error && (
        <div className="rounded-md border border-amber-400/18 bg-amber-400/[0.06] px-2.5 py-2 text-[0.6rem] text-amber-200">
          {error}
        </div>
      )}

      {scenes.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5">
            {!selectedScene ? (
              <p className="text-[0.55rem] text-amber-300/90">← Click a scene below to select it</p>
            ) : <span />}
            {/* ⚠️ (2026-08-25) بعد ما شلنا الـ.slice(0,8)، القايمة ممكن تبقى
                فيها عشرات الصور — هنا بنوريها العدد الفعلي عشان يبان إن
                البحث فعلاً رجع أكتر من شوية صور، مش بس تحس إن حاجة "قصّت". */}
            <span className="text-[0.55rem] text-slate-500">{scenes.length} scene{scenes.length === 1 ? "" : "s"}</span>
          </div>
          {/* ⚠️ (2026-08-25) الارتفاع زاد من max-h-40 لـ max-h-72 — بعد ما
              القايمة بقت ممكن تحمل عشرات الصور بدل 8 بس، 40 (10rem) كانت
              هتخلي أي تصفح فيها متعب جدًا (سطرين-تلاتة بس ظاهرين). */}
          <div className="max-h-72 overflow-y-auto custom-scroll pr-0.5 space-y-1.5">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => onSelectScene(scene)}
              className={`w-full flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors ${
                selectedScene?.id === scene.id
                  ? "border-cyan-400/40 bg-cyan-400/10"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14]"
              }`}
            >
              {scene.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={scene.thumbnail} alt="" loading="lazy" className="w-6 h-6 rounded border border-white/[0.08] object-cover bg-slate-900 shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded border border-white/[0.08] bg-gradient-to-br from-slate-700 via-emerald-800 to-cyan-700 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[0.62rem] text-slate-200 truncate">{scene.id}</p>
                <p className="text-[0.55rem] text-slate-500">{formatDateDMY(scene.date)} · cloud {scene.cloud}%</p>
              </div>
            </button>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChangeDetectionPanelProps {
  selectedFeature?: GeoJSON.Feature | null;
  onPreview?: (config: ChangeDetectionPreviewConfig) => void;
  /** Real, georeferenced Before/After swipe on the actual map. Pass null to hide it. */
  onSwipeCompare?: (config: ChangeDetectionSwipeConfig | null) => void;
  /** Same JWT SatelliteDataPanel.tsx passes as sentinelDecodeToken (session.user.accessToken) —
   *  required for Sentinel-5P (NO2/SO2/CO/OZONE) and Sentinel-3 (SST/S3_LST/CHLOROPHYLL/FRP)
   *  previews here, since both go through the same /gis/sentinel5p/decode JWT-protected
   *  endpoint. Without it, those two sources' previews silently fall back to scene.thumbnail.
   *  ⚠️ (2026-08-22) بقى اختياري تمامًا دلوقتي: لو مش متبعت (أو الأب مش
   *  عارف يبعته صح)، الكومبوننت بيجيبه لوحده من useSession() تحت — بالظبط
   *  زي SatelliteDataPanel.tsx. ده لإن الأب هنا كان مش بيبعته خالص، فالـ
   *  decode pipeline (Sentinel-3/5P) كان بيفشل بـ "Missing auth token" في
   *  كل الحالات — مش مشكلة نص/توكن منتهي، التوكن نفسه معمول مبعوتش. */
  sentinelDecodeToken?: string;
}

export function ChangeDetectionPanel({ selectedFeature, onPreview, onSwipeCompare, sentinelDecodeToken: sentinelDecodeTokenProp }: ChangeDetectionPanelProps) {
  // ⚠️ (2026-08-22) fallback مباشر لـ useSession() لو الأب مش بيبعت
  // sentinelDecodeToken كـ prop — نفس الطريقة بالظبط اللي SatelliteDataPanel.tsx
  // بيجيب بيها التوكن (session.user.accessToken). ده بيحل "Missing auth
  // token" اللي كانت بتظهر في القمرين الاتنين خالص، لإن السبب مش كان توكن
  // غلط، كان إن التوكن معمول مبعوتش كـ prop للكومبوننت ده من الأساس.
  const { data: session } = useSession();
  const sentinelDecodeToken = sentinelDecodeTokenProp ?? ((session?.user as any)?.accessToken as string | undefined);
  const coords = getMidCoords(selectedFeature);
  const bounds = getFeatureBounds(selectedFeature, coords ? { lat: coords[0], lng: coords[1] } : undefined);
  const [[south, west], [north, east]] = bounds;

  // Same satellite picker as SatelliteDataPanel.tsx (SOURCE_META/SOURCE_INDICES) —
  // switching source below filters "Index to compare" down to that satellite's
  // own indices (availableIndexKeys), same as the Satellite Data tab.
  const [source, setSource] = useState<SatSource>("sentinel-2");
  const [indexKey, setIndexKey] = useState<PreviewKey>("NDVI");
  const [indexPickerOpen, setIndexPickerOpen] = useState(false);
  const [threshold, setThreshold] = useState(0.08);
  const [direction, setDirection] = useState<ChangeDirection>("both");

  const [beforeFrom, setBeforeFrom] = useState("2025-11-01");
  const [beforeTo, setBeforeTo] = useState("2025-12-01");
  const [beforeScenes, setBeforeScenes] = useState<SatelliteScene[]>([]);
  const [beforeStatus, setBeforeStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [beforeError, setBeforeError] = useState<string | null>(null);
  const [beforeScene, setBeforeScene] = useState<SatelliteScene | null>(null);

  const [afterFrom, setAfterFrom] = useState("2026-05-01");
  const [afterTo, setAfterTo] = useState("2026-06-01");
  const [afterScenes, setAfterScenes] = useState<SatelliteScene[]>([]);
  const [afterStatus, setAfterStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [afterError, setAfterError] = useState<string | null>(null);
  const [afterScene, setAfterScene] = useState<SatelliteScene | null>(null);

  const [cloudCoverBefore, setCloudCoverBefore] = useState(25);
  const [cloudCoverAfter, setCloudCoverAfter] = useState(25);

  // شوفي الـ useEffect اللي بيحسبها تحت — بتتشارك بين صورة الـ"قبل" والـ"بعد"
  // عشان يترسموا بنفس مقياس الألوان (FIRE/LST/MINERALS/THERMAL بس).
  const [titilerSharedRescale, setTitilerSharedRescale] = useState<string | null>(null);
  const [beforePreviewUrl, setBeforePreviewUrl] = useState<string | null>(null);
  const [afterPreviewUrl, setAfterPreviewUrl] = useState<string | null>(null);
  // ⚠️ (2026-08-22) بتتحدّد لما الـ decode (Sentinel-3/5P) أو titiler
  // pipeline يفشل، عشان يبان سبب حقيقي بدل ما الخريطة تفضل فاضية بصمت من
  // غير أي تفسير — شوفي makePreviewUrl في نفس الملف.
  const [beforePreviewError, setBeforePreviewError] = useState<string | null>(null);
  const [afterPreviewError, setAfterPreviewError] = useState<string | null>(null);
  const [beforeClippedUrl, setBeforeClippedUrl] = useState<string | null>(null);
  const [afterClippedUrl, setAfterClippedUrl] = useState<string | null>(null);
  const [clipToShape, setClipToShape] = useState(true);
  const polygonRing = useMemo(() => getPolygonRing(selectedFeature), [selectedFeature]);
  const bboxTuple = useMemo(() => [west, south, east, north] as [number, number, number, number], [west, south, east, north]);

  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [changeResult, setChangeResult] = useState<{ stats: ChangeStats | null; legend: ChangeLegendItem[] } | null>(null);
  const [diffDataUrl, setDiffDataUrl] = useState<string | null>(null);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const previewDef = PREVIEW_DEFS[indexKey];
  const canClassify = isClassifiable(indexKey);
  // ⚠️ (2026-08-19) لازم SOURCE_ANALYSIS_COLLECTIONS[source][...] هنا، مش
  // SOURCE_COLLECTIONS[source] المباشر — لـ MODIS/ASTER/Sentinel-3 كل
  // variable (FIRE/LST/SST/...) عبارة عن STAC collection مختلف تمامًا (شوفي
  // التحذير فوق SOURCE_ANALYSIS_COLLECTIONS في SatellitePipelines.ts:
  // "fetchScenes() في الفرونت لازم يستخدم الخريطة دي بدل SOURCE_COLLECTIONS
  // المباشرة"). كنا بنستخدم الـ default الثابت بس، فمثلاً اختيار MODIS FIRE
  // كان بيدوّر على scenes في collection الـ NDVI/EVI (modis-13A1-061) —
  // الـ scene بترجع وتتختار عادي (بتبان زي ما هي شغالة)، لكن الـ item id
  // بتاعها مش موجود في collection الـ FIRE الحقيقي (modis-14A1-061)، فبناء
  // رابط الـ tile بيفشل بصمت ومفيش هيت ماب بيظهر. نفس الحكاية بالظبط وراء
  // "50 scene بس كلهم غيوم" في Sentinel-3 — كان بيدوّر دايمًا في collection
  // الـ SST (WST) مهما كان الـ variable المختار فعليًا.
  //
  // ⚠️ الـ lookup لازم يكون بـ `previewDef.proxyType`، مش `indexKey` نفسه —
  // MODIS_FIRE/MODIS_LST/ASTER_RGB (PreviewKey هنا) أسماء مُعاد تسميتها
  // عشان تتفادى تصادم مع مفاتيح تانية (شوفي كومنت PreviewKey فوق)، لكن
  // SOURCE_ANALYSIS_COLLECTIONS متبني على الأسماء الأصلية (SatelliteAnalysisType:
  // "FIRE"/"LST"/"RGB"...) اللي كل PreviewDef فعليًا حاططها في `proxyType`
  // بتاعه بالظبط لنفس السبب ده. استخدام indexKey مباشرة كان هيرجع undefined
  // لكل الـ MODIS/ASTER entries المُعاد تسميتها ويرجعنا لنفس الباگ تاني.
  const collection =
    SOURCE_ANALYSIS_COLLECTIONS[source]?.[(previewDef.proxyType ?? indexKey) as SatelliteAnalysisType] ??
    SOURCE_COLLECTIONS[source];

  // Which PreviewKey options actually apply to the selected satellite — the
  // intersection of "what this panel knows how to preview/diff" (PREVIEW_DEFS)
  // and "what this satellite actually has" (SOURCE_INDICES, same source of
  // truth as SatelliteDataPanel.tsx). RGB/SWIR are plain color composites
  // built from Sentinel-2/Landsat band names specifically, so they're only
  // offered for those two sources even though SOURCE_INDICES doesn't list
  // "SWIR" as its own analysis type.
  //
  // ⚠️ BUG FIX (2026-08-18): MODIS's SOURCE_INDICES also happens to be named
  // "NDVI"/"EVI" (SOURCE_INDICES.modis = ["NDVI","EVI","FIRE","LST"]) — same
  // *label* as the Sentinel-2/Landsat indices already in PREVIEW_DEFS, but a
  // totally different pipeline underneath (MODIS goes through STAC Search ->
  // TiTiler tiles directly, see TITILER_STYLES in SatellitePipelines.ts — no
  // B04/B08-style COG band assets at all, and no /api/raster-proxy/analyze
  // support). Before this fix, the plain `sourceKeys.has(key)` intersection
  // below matched on the NAME only, so picking MODIS silently offered NDVI/EVI
  // as if they were real options — Run Change Detection then tried to fetch
  // Sentinel-2 band assets ("B08","B04") from a MODIS scene, which doesn't
  // have them, producing "Could not resolve the required band URLs" instead
  // of the friendly "isn't wired up yet" message ASTER/Sentinel-5P/Sentinel-3
  // already show correctly (they don't share any key names with PREVIEW_DEFS,
  // so they never had this collision).
  //
  // Fix: only sources whose SOURCE_INDICES entries actually map onto real
  // PREVIEW_DEFS band assets (Sentinel-2, Landsat, Sentinel-1, Copernicus DEM)
  // are allowed to intersect at all. Every other source (MODIS, ASTER,
  // Sentinel-5P, Sentinel-3 — all TiTiler-xarray/direct-tile pipelines) always
  // gets an empty list here, regardless of any accidental name overlap, so
  // they consistently fall into the "isn't wired up yet" banner below instead
  // of a broken Run button.
  const DIFFABLE_SOURCES = useMemo(() => new Set<SatSource>(["sentinel-2", "landsat", "sentinel-1", "cop-dem"]), []);
  // ── Batch 2 (2026-08-18) — explicit per-source PreviewKey lists for the 6
  // non-optical sources, instead of the generic SOURCE_INDICES-name
  // intersection above (kept only for sentinel-2/landsat/sentinel-1/cop-dem,
  // where the intersection was already correct). Explicit lists sidestep the
  // exact MODIS NDVI/EVI name-collision bug documented above (2026-08-18) —
  // MODIS_NDVI/MODIS_EVI/ASTER_RGB are PREVIEW_DEFS keys, not the raw
  // SOURCE_INDICES names, so there's nothing to collide with.
  const NEW_SOURCE_PREVIEW_KEYS: Partial<Record<SatSource, PreviewKey[]>> = useMemo(() => ({
    "sentinel-1": ["VV", "VH", "RATIO", "SAR_RGB"],
    "cop-dem": ["ELEVATION", "SLOPE", "HILLSHADE", "ASPECT"],
    "sentinel-5p": ["NO2", "SO2", "CO", "OZONE"],
    "modis": ["MODIS_NDVI", "MODIS_EVI", "MODIS_FIRE", "MODIS_LST"],
    "aster": ["ASTER_RGB", "MINERALS", "THERMAL"],
    "sentinel-3": ["SST", "S3_LST", "CHLOROPHYLL", "FRP"],
  }), []);
  const availableIndexKeys = useMemo(() => {
    if (NEW_SOURCE_PREVIEW_KEYS[source]) return NEW_SOURCE_PREVIEW_KEYS[source]!;
    if (!DIFFABLE_SOURCES.has(source)) return [];
    const sourceKeys = new Set(SOURCE_INDICES[source] as string[]);
    return (Object.keys(PREVIEW_DEFS) as PreviewKey[]).filter((key) => {
      if (key === "RGB" || key === "SWIR") return source === "sentinel-2" || source === "landsat";
      return sourceKeys.has(key);
    });
  }, [source, DIFFABLE_SOURCES, NEW_SOURCE_PREVIEW_KEYS]);

  // If the satellite changes and the currently-picked index no longer applies
  // (e.g. switching from Sentinel-2 to Sentinel-1), fall back to the first
  // index that's actually available for the new satellite instead of silently
  // keeping an index that isn't even in the dropdown anymore.
  useEffect(() => {
    if (!availableIndexKeys.includes(indexKey) && availableIndexKeys.length) {
      setIndexKey(availableIndexKeys[0]);
      setChangeResult(null);
      setDiffDataUrl(null);
      setComputeError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIndexKeys]);

  // `collection` can change on indexKey alone now (MODIS/ASTER/Sentinel-3 —
  // each variable is a different STAC collection, see the comment on
  // `collection` above). Any already-picked scenes/results were resolved
  // against the *previous* collection, so their item ids don't exist in the
  // new one — clear them out instead of leaving a stale, silently-broken
  // selection sitting in the UI (this was the actual cause behind "MODIS
  // FIRE/LST show no heatmap even though a scene looks selected").
  useEffect(() => {
    setBeforeScenes([]);
    setAfterScenes([]);
    setBeforeScene(null);
    setAfterScene(null);
    setBeforeStatus("idle");
    setAfterStatus("idle");
    setBeforeError(null);
    setAfterError(null);
    setChangeResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection]);

  // ⚠️ (2026-08-21) ASTER L1T (aster-l1t — الـ collection الحقيقي الوحيد
  // بتاع ASTER الموجود على Planetary Computer) بتغطيته الزمنية 2000-2006
  // بس (الأرشيف اتوقف بعدها) — شوفي كومنت "aster-l1t اتأكد إنه موجود
  // فعليًا" فوق في SatellitePipelines.ts. الـ date pickers الافتراضية في
  // البانل دي (before 2025-11/2025-12، after 2026-05/2026-06) صح لكل
  // المصادر التانية لكن غلط 100% لـ ASTER — أي بحث بيها هيرجع صفر scenes
  // دايمًا مهما كانت الـ AOI صح، وده بالظبط اللي بيبان كـ "مفيش ولا صورة
  // موجودة للمكان ده". هنا بنحوّل الـ date range تلقائيًا لمدى جوه أرشيف
  // ASTER الفعلي أول ما اليوزر يختار aster (لو التاريخ الحالي برّه المدى
  // بالفعل)، وبنرجّعها لقيم افتراضية حديثة تاني لو رجعت من aster لمصدر
  // تاني بيدعم تواريخ حديثة عادية.
  const prevSourceRef = useRef<SatSource>(source);
  useEffect(() => {
    const prevSource = prevSourceRef.current;
    if (source === "aster" && prevSource !== "aster") {
      const outOfRange = (d: string) => {
        const year = Number(d.slice(0, 4));
        return !Number.isFinite(year) || year < 2000 || year > 2006;
      };
      // ⚠️ (2026-08-22) كانت الافتراضية القديمة 6 شهور بس لكل طرف (before:
      // 2003-01→2003-06, after: 2005-01→2005-06) — جوه أرشيف aster-l1t
      // الضعيف أصلًا (2000-2006 بس)، نافذة 6 شهور غالبًا ترجع صفر scenes أو
      // كلهم غيوم زي ما بان في الشكوى. وسّعنا كل نافذة لتغطي نص المدى
      // الفعلي (before = أول 3.5 سنة، after = آخر 3.5 سنة) عشان نزوّد فرصة
      // لقاء scenes صح، مع فضل الفصل الزمني بينهم (before قبل after) عشان
      // change detection يفضل له معنى.
      if (outOfRange(beforeFrom) || outOfRange(beforeTo)) {
        setBeforeFrom("2000-01-01");
        setBeforeTo("2003-06-30");
      }
      if (outOfRange(afterFrom) || outOfRange(afterTo)) {
        setAfterFrom("2003-07-01");
        setAfterTo("2006-12-31");
      }
    } else if (prevSource === "aster" && source !== "aster") {
      const inAsterRange = (d: string) => {
        const year = Number(d.slice(0, 4));
        return Number.isFinite(year) && year >= 2000 && year <= 2006;
      };
      if (inAsterRange(beforeFrom) || inAsterRange(beforeTo)) {
        setBeforeFrom("2025-11-01");
        setBeforeTo("2025-12-01");
      }
      if (inAsterRange(afterFrom) || inAsterRange(afterTo)) {
        setAfterFrom("2026-05-01");
        setAfterTo("2026-06-01");
      }
    }
    prevSourceRef.current = source;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const indexPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!indexPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      if (indexPickerRef.current && !indexPickerRef.current.contains(e.target as Node)) {
        setIndexPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setIndexPickerOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [indexPickerOpen]);

  const searchScenes = useCallback(async (
    dateFrom: string,
    dateTo: string,
    cloud: number,
    setScenes: (s: SatelliteScene[]) => void,
    setStatus: (s: "idle" | "loading" | "success" | "error") => void,
    setError: (e: string | null) => void,
  ): Promise<SatelliteScene[]> => {
    setStatus("loading");
    setError(null);
    try {
      // Copernicus DEM (cop-dem) مش سلسلة زمنية — SOURCE_META[source].cadence
      // بيبقى "static". الـ items بتاعته في STAC مالهمش datetime حقيقي (ثابت/null)،
      // فلو بعتنا فلتر datetime زي أي مصدر تاني هيرجع صفر نتائج دايمًا مهما غيّرنا
      // التاريخ — ده بالظبط سبب "No matching scenes" اللي كانت بتظهر مع DEM.
      // لمصادر static زي دي، منسيبش الـ datetime في الـ query خالص.
      const isStaticSource = SOURCE_META[source]?.cadence === "static";
      const searchBody: Record<string, unknown> = {
        collections: [collection],
        bbox: [west, south, east, north],
        limit: 50,
      };
      if (!isStaticSource) {
        searchBody.datetime = `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`;
      }
      // ⚠️ (2026-08-21) Sentinel-5P: sentinel-5p-l2-netcdf collection واحد
      // بيجمع كل الغازات — من غير الفلتر ده، اختيار SO2 مثلًا ممكن يرجّع
      // scenes فعليًا NO2/O3/... (بتحقق بس bbox/date)، وبعدين decode بـ
      // variable=SO2 على item من نوع تاني يفشل بصمت أو يرجع "لا توجد صور"
      // — شوفي SENTINEL5P_PRODUCT_TYPE في SatellitePipelines.ts للتفاصيل.
      if (source === "sentinel-5p") {
        const productType = SENTINEL5P_PRODUCT_TYPE[(previewDef.proxyType ?? indexKey) as SatelliteAnalysisType];
        if (productType) {
          searchBody.query = { [SENTINEL5P_PRODUCT_TYPE_PROPERTY]: { eq: productType } };
        }
      }

      // ⚠️ (2026-08-25) الـ STAC API بيرجع النتايج مقسّمة صفحات — كنا بنجيب
      // أول صفحة بس (limit:50) حتى لو الـ date range شهور/سنة كاملة. كل رد
      // بيرجع مع رابط "rel": "next" (فيه POST body/token) بيقول إن فيه صور
      // زيادة، والكود مكانش بيتبعه. من غير sortby صريح، الـ API بيرجّع
      // الأحدث الأول — فبحث سنة كاملة كان بيتصرف فعليًا كإنه بحث آخر
      // 2-3 أسابيع بس. هنا بنلف على الصفحات لحد ما تخلص أو نوصل لسقف أمان.
      let features: StacFeature[] = [];
      let totalMatched = 0;
      let nextReq: { url: string; body: Record<string, unknown> } | null = {
        url: "https://planetarycomputer.microsoft.com/api/stac/v1/search",
        body: searchBody,
      };
      const MAX_PAGES = 10;
      const MAX_FEATURES = 500;
      let page = 0;
      while (nextReq && page < MAX_PAGES && features.length < MAX_FEATURES) {
        const response: Response = await fetch(nextReq.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextReq.body),
        });
        if (!response.ok) throw new Error(`STAC API ${response.status}`);
        const payload: any = await response.json();
        const pageFeatures: StacFeature[] = Array.isArray(payload?.features) ? payload.features : [];
        features = features.concat(pageFeatures);
        if (page === 0) {
          totalMatched =
            typeof payload?.numberMatched === "number" ? payload.numberMatched : pageFeatures.length;
        }
        const nextLink: { href?: string; body?: unknown } | null | undefined = Array.isArray(payload?.links)
          ? payload.links.find((l: { rel?: string }) => l?.rel === "next")
          : null;
        nextReq =
          nextLink?.href && nextLink?.body
            ? { url: nextLink.href, body: nextLink.body as Record<string, unknown> }
            : null;
        page += 1;
        if (!pageFeatures.length) break;
      }

      const nextScenes: SatelliteScene[] = features
        .map((feature) => {
          const props = feature?.properties ?? {};
          const cloudVal = Number(props["eo:cloud_cover"] ?? props["landsat:cloud_cover_land"] ?? 0);
          const date = String(props.datetime ?? "").slice(0, 10) || dateTo;
          const thumbnail =
            (feature?.assets as any)?.rendered_preview?.href ??
            (feature?.assets as any)?.thumbnail?.href ??
            (feature?.assets as any)?.overview?.href;

          const assets = Object.entries(feature?.assets ?? {}).reduce<Record<string, string>>((acc, [key, asset]) => {
            if (!asset?.href) return acc;
            acc[key] = asset.href;
            acc[normalizeBandAssetKey(key)] = asset.href;
            acc[key.toLowerCase()] = asset.href;
            acc[key.toUpperCase()] = asset.href;
            return acc;
          }, {});

          return {
            id: String(feature?.id ?? "scene"),
            date,
            cloud: Number.isFinite(cloudVal) ? Math.round(cloudVal) : 0,
            collection,
            thumbnail,
            assets,
            bbox: feature.bbox,
          };
        })
        // ⚠️ (2026-08-21) Sentinel-3 SLSTR/OLCI items report eo:cloud_cover
        // as the fraction over the ENTIRE wide swath (~1400-1675km), not the
        // small AOI actually requested — a scene can be 60-90% cloudy on the
        // far side of the swath and still be perfectly clear over the AOI.
        // Gating on the 25% default here was rejecting nearly every real
        // scene ("Found 50 scene(s)... but all exceed the cloud-cover
        // limit"), which isn't a bug in the data, just a meaningless filter
        // for this source. `cloud` stays on the scene object for display —
        // it's just not used to reject scenes for sentinel-3.
        .filter((scene) => source === "sentinel-3" || scene.cloud <= cloud)
        // ⚠️ (2026-08-25) لو الـ AOI صغيرة وواقعة على حد بين tile-ين UTM
        // (زي 36RTV/35RQQ)، كل مرور فعلي للقمر بيرجّع scene منفصل لكل tile
        // بنفس التاريخ بالظبط — يعني نفس اليوم بيتعد مرتين في القايمة. هنا
        // بنسيب أحسن نسخة بس (أقل غيوم) لكل تاريخ، عشان القايمة تعكس عدد
        // المرورات الحقيقية مش عدد الـ tiles.
        .reduce<SatelliteScene[]>((deduped, scene) => {
          const existing = deduped.find((s) => s.date === scene.date);
          if (!existing) {
            deduped.push(scene);
          } else if (scene.cloud < existing.cloud) {
            Object.assign(existing, scene);
          }
          return deduped;
        }, [])
        .sort((a, b) => (a.date < b.date ? 1 : -1));
        // ⚠️ اتشالت الـ .slice(0, 8) القديمة — كانت بتقطع أي صور بعد أول 8
        // حتى لو الـ STAC رجع أكتر بكتير وعدّوا فلتر الغيوم. دلوقتي بيتعرض
        // كل اللي رجع فعلاً (لحد سقف الأمان MAX_FEATURES فوق).

      setScenes(nextScenes);
      setStatus("success");
      if (!nextScenes.length) {
        // فرّق بين "مفيش scenes خالص في الـ AOI ده" (مشكلة تانية تمامًا، زي bbox
        // غلط أو collection غلط) وبين "فيه scenes بس كلهم غيوم أكتر من اللي
        // انت حددته" — عشان المستخدم يعرف يظبط إيه بالظبط. لمصادر static
        // (زي cop-dem) بنشيل ذكر "date range" لأنه مش موجود في الطلب أصلاً.
        setError(
          features.length
            ? `Found ${totalMatched || features.length} scene(s) for this AOI, but all exceed the ${cloud}% cloud-cover limit — try raising it.`
            : isStaticSource
              ? "No elevation coverage found for this AOI — check the AOI bounds, or try a different satellite source."
              : "No matching scenes for this AOI/date filter — check the AOI bounds and date range, or try a different satellite source."
        );
      }
      return nextScenes;
    } catch (err) {
      setScenes([]);
      setStatus("error");
      setError(err instanceof Error ? err.message : "STAC search failed.");
      return [];
    }
  }, [collection, west, south, east, north, source, previewDef, indexKey]);

  const pickSceneAfterSearch = useCallback((
    results: SatelliteScene[],
    current: SatelliteScene | null,
    select: (scene: SatelliteScene) => void,
  ) => {
    if (!results.length) return;
    const stillValid = current && results.some((s) => s.id === current.id);
    if (!stillValid) select(results[0]);
  }, []);

  const handleSelectBefore = useCallback((scene: SatelliteScene) => {
    setBeforeScene(scene);
    setChangeResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
  }, []);
  const handleSelectAfter = useCallback((scene: SatelliteScene) => {
    setAfterScene(scene);
    setChangeResult(null);
    setDiffDataUrl(null);
    setComputeError(null);
  }, []);

  const handleSearchBefore = useCallback(async () => {
    const results = await searchScenes(
      beforeFrom, beforeTo, cloudCoverBefore,
      setBeforeScenes, setBeforeStatus, setBeforeError,
    );
    pickSceneAfterSearch(results, beforeScene, handleSelectBefore);
  }, [searchScenes, beforeFrom, beforeTo, cloudCoverBefore, beforeScene, pickSceneAfterSearch, handleSelectBefore]);

  const handleSearchAfter = useCallback(async () => {
    const results = await searchScenes(
      afterFrom, afterTo, cloudCoverAfter,
      setAfterScenes, setAfterStatus, setAfterError,
    );
    pickSceneAfterSearch(results, afterScene, handleSelectAfter);
  }, [searchScenes, afterFrom, afterTo, cloudCoverAfter, afterScene, pickSceneAfterSearch, handleSelectAfter]);

  // ⚠️ (2026-08-22) titilerSharedRescale: بيتحسب مرة واحدة من السينتين
  // (قبل/بعد) مع بعض — قبل ما نبني أي preview URL — عشان FIRE/LST/MINERALS/
  // THERMAL (اللي عندهم dynamicRescale) يترسموا بنفس مقياس الألوان في
  // الصورتين. من غيره كل صورة كانت بتحسب rescale مستقل عن نفسها بس، فنفس
  // القيمة الخام كانت بتترسم بلون مختلف كليًا بين قبل/بعد رغم إنه مفيش فرق
  // حقيقي كبير في البيانات — شوفي fetchPairDynamicRescale في
  // SatellitePipelines.ts للتفاصيل الكاملة.
  useEffect(() => {
    let cancelled = false;
    const def = PREVIEW_DEFS[indexKey];
    if (def.pipeline !== "titiler" || !beforeScene?.id || !afterScene?.id || !beforeScene.collection) {
      setTitilerSharedRescale(null);
      return;
    }
    fetchPairDynamicRescale(
      beforeScene.collection, beforeScene.id, afterScene.id, def.proxyType as SatelliteAnalysisType
    )
      .then((r) => { if (!cancelled) setTitilerSharedRescale(r); })
      .catch(() => { if (!cancelled) setTitilerSharedRescale(null); });
    return () => { cancelled = true; };
  }, [beforeScene, afterScene, indexKey]);

  // refresh preview URLs whenever scene, index, or AOI changes — cropped server-side
  // to the AOI bbox (see makePreviewUrl), not the whole scene tile.
  // ⚠️ makePreviewUrl became async (2026-08-18) — the titiler/decode pipelines
  // for MODIS/ASTER/Sentinel-5P/Sentinel-3 need to await a network call before
  // a URL exists, same reason buildTitilerTileUrl/buildTitilerBboxUrl are
  // async in SatellitePipelines.ts. `cancelled` guards against a slower older
  // request overwriting a newer one if the user changes index/scene quickly.
  useEffect(() => {
    let cancelled = false;
    if (!beforeScene) { setBeforePreviewUrl(null); setBeforePreviewError(null); return; }
    makePreviewUrl(
      beforeScene, indexKey, bboxTuple, source, sentinelDecodeToken, titilerSharedRescale,
      // progressive: default-rescale image يظهر فورًا بعد الـ decode، قبل
      // ما نستنى statistics — بيتستبدل بالنتيجة النهائية (تلوين دقيق) لما
      // الـ .then تحت يخلص
      (previewUrl) => { if (!cancelled) setBeforePreviewUrl(previewUrl); },
    )
      .then(({ url, error }) => {
        if (cancelled) return;
        setBeforePreviewUrl(url ?? null);
        setBeforePreviewError(error ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setBeforePreviewUrl(null);
        setBeforePreviewError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [beforeScene, indexKey, bboxTuple, source, sentinelDecodeToken, titilerSharedRescale]);
  useEffect(() => {
    let cancelled = false;
    if (!afterScene) { setAfterPreviewUrl(null); setAfterPreviewError(null); return; }
    makePreviewUrl(
      afterScene, indexKey, bboxTuple, source, sentinelDecodeToken, titilerSharedRescale,
      (previewUrl) => { if (!cancelled) setAfterPreviewUrl(previewUrl); },
    )
      .then(({ url, error }) => {
        if (cancelled) return;
        setAfterPreviewUrl(url ?? null);
        setAfterPreviewError(error ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAfterPreviewUrl(null);
        setAfterPreviewError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [afterScene, indexKey, bboxTuple, source, sentinelDecodeToken, titilerSharedRescale]);

  // Once the bbox-cropped previews are in, clip them down to the exact drawn shape
  // (polygon/rectangle/circle-as-polygon) instead of leaving them as a rectangle.
  // Safe now because the image genuinely covers `bounds` (see makePreviewUrl fix),
  // so the lng/lat -> pixel mapping in clipImageToPolygon lines up correctly.
  useEffect(() => {
    let cancelled = false;
    if (!clipToShape || !polygonRing || !beforePreviewUrl) {
      setBeforeClippedUrl(null);
      return;
    }
    clipImageToPolygon(beforePreviewUrl, bounds, polygonRing)
      .then((clipped) => { if (!cancelled) setBeforeClippedUrl(clipped); })
      .catch(() => { if (!cancelled) setBeforeClippedUrl(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beforePreviewUrl, clipToShape, polygonRing]);

  useEffect(() => {
    let cancelled = false;
    if (!clipToShape || !polygonRing || !afterPreviewUrl) {
      setAfterClippedUrl(null);
      return;
    }
    clipImageToPolygon(afterPreviewUrl, bounds, polygonRing)
      .then((clipped) => { if (!cancelled) setAfterClippedUrl(clipped); })
      .catch(() => { if (!cancelled) setAfterClippedUrl(null); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [afterPreviewUrl, clipToShape, polygonRing]);

  // Final URLs actually shown/pushed to the map — clipped-to-shape when available.
  const beforeDisplayUrl = beforeClippedUrl ?? beforePreviewUrl;
  const afterDisplayUrl = afterClippedUrl ?? afterPreviewUrl;

  // Push a real, georeferenced Before/After swipe onto the actual map as soon as both
  // scenes are selected — updates live as the user changes scenes/index, clears when not ready.
  // (This stays on the real map — only the sidebar preview card was removed.)
  useEffect(() => {
    if (!onSwipeCompare) return;
    if (beforeDisplayUrl && afterDisplayUrl && beforeScene && afterScene) {
      onSwipeCompare({
        beforeUrl: beforeDisplayUrl,
        afterUrl: afterDisplayUrl,
        bounds,
        beforeLabel: `Before · ${formatDateDMY(beforeScene.date)}`,
        afterLabel: `After · ${formatDateDMY(afterScene.date)}`,
      });
    } else {
      onSwipeCompare(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSwipeCompare, beforeDisplayUrl, afterDisplayUrl, beforeScene, afterScene, bounds]);

  // Make sure the swipe never lingers on the map after leaving Change Detection.
  useEffect(() => {
    return () => { onSwipeCompare?.(null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canRun = !!beforeScene && !!afterScene && canClassify && availableIndexKeys.length > 0;

  const runButtonLabel = useMemo(() => {
    if (!availableIndexKeys.length) return `Change Detection isn't available yet for ${SOURCE_META[source].title}`;
    if (!canClassify) return `${previewDef.label} is preview/swipe-only — pick a classifiable index to run classification`;
    if (computing) return "Computing change map...";
    if (!beforeScene && !afterScene) return "Search & select Before + After scenes";
    if (!beforeScene) return "Select a Before scene ↑";
    if (!afterScene) return "Select an After scene ↑";
    return "Run Change Detection";
  }, [computing, beforeScene, afterScene, canClassify, previewDef, availableIndexKeys, source]);

  // Runs the real change-detection computation server-side via
  // /api/raster-proxy/analyze (type=change_ndvi|change_ndwi|change_ndbi):
  // it reads the actual raw band pixels for Before + After and classifies
  // every pixel into 5 clear classes (Gain / No Change / Loss / Other / No
  // Data) — much more accurate than approximating index values back out of
  // already-colorized preview PNGs.
  const runChangeDetection = useCallback(async () => {
    if (!beforeScene || !afterScene) return;
    if (!isClassifiable(indexKey)) {
      // ⚠️ (2026-08-23) As of SLOPE/HILLSHADE/ASPECT, every single PreviewKey
      // now has a matching change_<index> branch in route.ts (isClassifiable
      // should never actually return false here anymore) — this message is
      // kept only as a defensive fallback in case a future preview-only entry
      // gets added to PREVIEW_DEFS before its route.ts change_ branch exists.
      setComputeError(`${previewDef.label} isn't wired up for server-side change classification yet — it's available as a Before/After visual preview and swipe compare only. Pick a different index, or check back once route.ts adds a matching change_<index> branch for this one.`);
      return;
    }
    setComputing(true);
    setComputeError(null);
    setChangeResult(null);
    setDiffDataUrl(null);

    try {
      const classifiableKey: ChangeIndexKey = indexKey as ChangeIndexKey;
      const isDecodePipeline = PREVIEW_DEFS[indexKey].pipeline === "decode";
      const asterBidxConfig = ASTER_CHANGE_BIDX[classifiableKey];

      let combinedUrls: string[];
      let combinedBidx: number[] | null = null;
      if (asterBidxConfig) {
        // ⚠️ (2026-08-23) ASTER_RGB/MINERALS/THERMAL — resolve ONE raw href
        // per date (the packed VNIR/SWIR/TIR composite file, via the same
        // getSceneAssetUrl any other raw-href source uses), then repeat it
        // once per band index this index needs. route.ts's readBand() picks
        // the right band out of the shared file using the matching &bidx=.
        const { assetKey, bidx } = asterBidxConfig;
        const beforeHref = getSceneAssetUrl(beforeScene, assetKey);
        const afterHref = getSceneAssetUrl(afterScene, assetKey);
        if (!beforeHref || !afterHref) {
          throw new Error(`Could not resolve the "${assetKey}" asset URL for the selected ASTER scenes.`);
        }
        combinedUrls = [...bidx.map(() => beforeHref), ...bidx.map(() => afterHref)];
        combinedBidx = [...bidx, ...bidx];
      } else if (isDecodePipeline) {
        // ⚠️ (2026-08-22) SST/S3_LST/CHLOROPHYLL/FRP: مفيش raw COG asset في
        // الـ STAC item (الملفات دي NetCDF، مش GeoTIFF) — لازم نفك كل سينة
        // (before + after) على حدة عن طريق /gis/sentinel5p/decode الأول
        // (نفس اللي makePreviewUrl بتستخدمه للـ preview)، وبعدين نبعت رابطي
        // الـ GeoTIFF الناتجين لـ route.ts (مش asset hrefs خام زي باقي
        // المصادر تحت). بننادي الاتنين مع بعض (Promise.all) عشان منستناش
        // كل واحد لوحده (2×2-3 دقايق لو تباعًا).
        if (!sentinelDecodeToken) {
          throw new Error("You need to be signed in to decode Sentinel data (missing JWT).");
        }
        const variable = UI_BAND_TO_SENTINEL_VARIABLE[indexKey];
        if (!variable) {
          throw new Error(`No Sentinel decode mapping configured for "${indexKey}" yet.`);
        }
        const decodeSource = PREVIEW_DEFS[indexKey].decodeSource as SentinelDecodeSource;
        const [beforeDecoded, afterDecoded] = await Promise.all([
          decodeSentinelDataset({
            token: sentinelDecodeToken, source: decodeSource, itemId: beforeScene.id,
            collection: beforeScene.collection, variable, bbox: [west, south, east, north],
          }),
          decodeSentinelDataset({
            token: sentinelDecodeToken, source: decodeSource, itemId: afterScene.id,
            collection: afterScene.collection, variable, bbox: [west, south, east, north],
          }),
        ]);
        combinedUrls = [beforeDecoded.url, afterDecoded.url];
      } else {
        const sourceAssets = getPreviewAssets(indexKey, source);
        const beforeHrefs = sourceAssets.map((key) => getSceneAssetUrl(beforeScene, key));
        const afterHrefs = sourceAssets.map((key) => getSceneAssetUrl(afterScene, key));

        if (beforeHrefs.some((h) => !h) || afterHrefs.some((h) => !h)) {
          throw new Error("Could not resolve the required band URLs for the selected scenes.");
        }
        combinedUrls = [...(beforeHrefs as string[]), ...(afterHrefs as string[])];
      }

      const { threshold: scaledThreshold, classThreshold } = getChangeThresholdParams(classifiableKey, threshold);
      const params = new URLSearchParams({
        type: CHANGE_API_TYPE[classifiableKey],
        // Order matters: backend splits this list in half — first half = Before
        // bands (in the same order as `previewDef.assets`), second half = After.
        urls: combinedUrls.join(","),
        bbox: `${west},${south},${east},${north}`,
        threshold: String(scaledThreshold),
      });
      // Only MSI/GCI/TVI/RED_EDGE get an explicit classThreshold — the
      // original 7 (+ NBRI/VARI/MTVI/GRVI/NDSI) rely on the server's own
      // 0.25 default, unchanged from before.
      if (classThreshold !== undefined) params.set("classThreshold", String(classThreshold));
      // ⚠️ (2026-08-23) Only ASTER_RGB/MINERALS/THERMAL ever send this —
      // route.ts ignores it entirely for every other type.
      if (combinedBidx) params.set("bidx", combinedBidx.join(","));

      const res = await fetch(`/api/raster-proxy/analyze?${params.toString()}`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error ?? `Change detection API failed (${res.status})`);
      }

      const legendHeader = res.headers.get("X-Change-Legend");
      const statsHeader = res.headers.get("X-Raster-Stats");
      const legend: ChangeLegendItem[] = legendHeader ? JSON.parse(legendHeader) : defaultChangeLegend(classifiableKey);
      const stats: ChangeStats | null = statsHeader ? JSON.parse(statsHeader) : null;

      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read the change map image"));
        reader.readAsDataURL(blob);
      });

      setChangeResult({ stats, legend });
      setDiffDataUrl(dataUrl);
      // (no longer auto-opening the Before/After compare modal here — running
      // Change Detection should just show the diff/legend below; the person
      // can still open the full Before/After/Change compare manually via the
      // "Compare" button next to the Change Map.)

      // NOTE: we intentionally do NOT push the classified diff onto the real
      // map anymore — only the Before/After swipe stays on the real map, and
      // the diff/classification result stays in the sidebar (Change Map card
      // above). This also removes the old bug where the diff overlay used
      // `afterScene.bbox` (the whole raw satellite scene tile — tens of km
      // wide) instead of your actual selected AOI, which is why it used to
      // cover a much bigger area than what you drew/selected.
    } catch (err) {
      // ⚠️ (2026-08-22) نفس فحص isNoDataForArea الموجود في makePreviewUrl —
      // لو الـ decode step (before أو after) رجّع "no valid pixels"/"no
      // active fires"/إلخ، نعرض رسالة ودّية بدل الـ JSON الخام بتاع الباك.
      const message =
        err instanceof SentinelDecodeError && err.isNoDataForArea
          ? `No valid "${indexKey}" data for one of the selected scenes in this area — the satellite's narrow data track likely didn't pass directly over this AOI. Try a different Before/After scene.`
          : err instanceof Error
            ? err.message
            : "Change detection computation failed.";
      setComputeError(message);
    } finally {
      setComputing(false);
    }
  }, [beforeScene, afterScene, indexKey, previewDef, threshold, west, south, east, north, source, sentinelDecodeToken]);

  const downloadDiff = useCallback(() => {
    if (!diffDataUrl) return;
    const a = document.createElement("a");
    a.href = diffDataUrl;
    a.download = `change_detection_${indexKey}_${Date.now()}.png`;
    a.click();
  }, [diffDataUrl, indexKey]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change Detection</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Compare two satellite scenes from different dates: true color, vegetation vigor, water signal,
              moisture stress, or SWIR false color.
            </p>
          </div>
          <span className="rounded-md border border-orange-400/20 bg-orange-400/10 px-2 py-1 text-[0.56rem] font-bold text-orange-300">
            STAC
          </span>
        </div>
      </div>

      {/* Satellite source selector — same SOURCE_META list as SatelliteDataPanel.tsx.
          Picking a satellite here filters "Index to compare" below to that
          satellite's own indices (availableIndexKeys). */}
      <div className="space-y-1.5">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Satellite source</p>
        <div className="relative" dir="ltr">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SatSource)}
            dir="ltr"
            className="h-10 w-full cursor-pointer appearance-none rounded-lg border border-white/[0.08] bg-[#020817]/70 pl-8 pr-8 text-xs font-semibold text-slate-200 outline-none transition focus:border-cyan-400/40"
          >
            {(Object.keys(SOURCE_META) as SatSource[]).map((key) => (
              <option key={key} value={key} className="bg-[#020817] text-slate-200">
                {SOURCE_META[key].title} — {SOURCE_META[key].subtitle}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 20 20"
            className="mx-auto my-auto pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none"
          >
            <path d="M5.5 7.5l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        {!availableIndexKeys.length && (
          <p className="text-[0.58rem] leading-relaxed text-amber-300/80">
            {SOURCE_META[source].title} isn&apos;t wired up for Change Detection yet — its scenes render fine in
            Satellite Data, but the two-date diff needs backend work first (see SatellitePipelines.ts TITILER_STYLES).
          </p>
        )}
        {source === "aster" && (
          <p className="text-[0.58rem] leading-relaxed text-amber-200">
            ASTER L1T archive on Planetary Computer only covers 2000–2006 — the date range below was switched
            automatically to fall inside that window. Search will always return no scenes outside 2000–2006.
          </p>
        )}
        {source === "cop-dem" && (
          <p className="text-[0.58rem] leading-relaxed text-amber-200">
            Copernicus DEM is a static elevation model (no capture-date time series) — Before and After will
            always return the same tile regardless of the dates picked below. Use Change Detection with DEM only
            to compare two different AOIs, not two dates.
          </p>
        )}
      </div>

      {/* Index selector — click to open a dropdown list of the available analyses */}
      <div ref={indexPickerRef} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 relative">
        <p className="text-[0.62rem] uppercase tracking-wider text-slate-500 mb-2.5">Index to compare</p>

        <button
          type="button"
          onClick={() => setIndexPickerOpen((p) => !p)}
          className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-all cursor-pointer ${
            indexPickerOpen ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.14]"
          }`}
          aria-haspopup="listbox"
          aria-expanded={indexPickerOpen}
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: previewDef.color, boxShadow: `0 0 6px ${previewDef.color}` }} />
            <span className="min-w-0">
              <span className="block text-[0.68rem] font-bold" style={{ color: previewDef.color }}>{previewDef.label}</span>
              <span className="block text-[0.52rem] text-slate-500 leading-tight truncate">{previewDef.desc}</span>
            </span>
          </span>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            className={`shrink-0 text-slate-400 transition-transform ${indexPickerOpen ? "rotate-180" : ""}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {indexPickerOpen && (
          <div
            role="listbox"
            // ⚠️ FIX (2026-08-18): this used to be `absolute` (floating on top of
            // AOI info / scene slots below it, hiding them until closed). Now it's
            // a normal in-flow block that grows the sidebar's height instead —
            // opening it pushes everything below down rather than covering it.
            // `max-h` + `overflow-y-auto` turns it into a scrollable "slide down"
            // list (same colors/rows as before) instead of a huge column when a
            // source has many indices (e.g. Sentinel-2's 40+).
            className="relative mt-2 max-h-64 overflow-y-auto rounded-lg border border-white/[0.1] bg-[#060d1b] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
          >
            {availableIndexKeys.map((key) => {
              const def = PREVIEW_DEFS[key];
              const active = indexKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setIndexKey(key);
                    setChangeResult(null);
                    setDiffDataUrl(null);
                    setComputeError(null);
                    setIndexPickerOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer border-b border-white/[0.05] last:border-b-0 ${
                    active ? "bg-cyan-400/[0.1]" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: def.color, boxShadow: `0 0 6px ${def.color}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[0.66rem] font-bold" style={{ color: def.color }}>{def.label}</span>
                    <span className="block text-[0.52rem] text-slate-500 leading-tight">{def.desc}</span>
                  </span>
                  {!isClassifiable(key) && (
                    <span className="shrink-0 text-[0.5rem] uppercase tracking-wider text-slate-500 border border-white/[0.08] rounded-full px-1.5 py-0.5">
                      {def.kind === "composite" ? "visual only" : "preview only"}
                    </span>
                  )}
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0 text-cyan-300">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* AOI info */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
        <p className="text-[0.58rem] uppercase tracking-wider text-slate-500">AOI</p>
        <p className="text-[0.62rem] text-slate-400 mt-1 font-mono">
          BBOX {west.toFixed(4)}, {south.toFixed(4)}, {east.toFixed(4)}, {north.toFixed(4)}
        </p>
      </div>

      {/* Two scene slots */}
      <SceneSlot
        title="Before (older date)"
        color="#38bdf8"
        dateFrom={beforeFrom}
        dateTo={beforeTo}
        onDateFromChange={setBeforeFrom}
        onDateToChange={setBeforeTo}
        cloudCover={cloudCoverBefore}
        onCloudCoverChange={setCloudCoverBefore}
        scenes={beforeScenes}
        status={beforeStatus}
        error={beforeError}
        selectedScene={beforeScene}
        onSelectScene={handleSelectBefore}
        onSearch={handleSearchBefore}
      />

      <SceneSlot
        title="After (newer date)"
        color="#fb923c"
        dateFrom={afterFrom}
        dateTo={afterTo}
        onDateFromChange={setAfterFrom}
        onDateToChange={setAfterTo}
        cloudCover={cloudCoverAfter}
        onCloudCoverChange={setCloudCoverAfter}
        scenes={afterScenes}
        status={afterStatus}
        error={afterError}
        selectedScene={afterScene}
        onSelectScene={handleSelectAfter}
        onSearch={handleSearchAfter}
      />

      {(beforePreviewError || afterPreviewError) && (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] p-3 space-y-1">
          <span className="text-[0.62rem] uppercase tracking-wider text-amber-300/80">Preview issue</span>
          {beforePreviewError && (
            <p className="text-[0.65rem] text-amber-100/80">Before: {beforePreviewError}</p>
          )}
          {afterPreviewError && (
            <p className="text-[0.65rem] text-amber-100/80">After: {afterPreviewError}</p>
          )}
        </div>
      )}

      {/* Clip-to-drawn-shape control only — the auto Before/After swipe preview
          card that used to sit here was removed; the clipping still matters for
          the "Compare" view in the Results section and for the on-map overlay,
          so we keep the toggle itself, just without the swipe preview around it. */}
      {(beforeDisplayUrl || afterDisplayUrl) && polygonRing && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 flex items-center justify-between">
          <span className="text-[0.6rem] text-slate-400">Clip to drawn shape</span>
          <button
            type="button"
            onClick={() => setClipToShape((p) => !p)}
            className={`relative w-9 h-5 rounded-full border transition-colors ${clipToShape ? "bg-cyan-400/20 border-cyan-400/30" : "bg-white/[0.03] border-white/[0.08]"}`}
            aria-pressed={clipToShape}
          >
            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${clipToShape ? "left-[18px] bg-cyan-400" : "left-0.5 bg-slate-600"}`} />
          </button>
        </div>
      )}

      <ChangeCompareModal
        open={compareModalOpen}
        onClose={() => setCompareModalOpen(false)}
        beforeUrl={beforeDisplayUrl ?? ""}
        afterUrl={afterDisplayUrl ?? ""}
        changeUrl={diffDataUrl}
        beforeDate={beforeScene?.date}
        afterDate={afterScene?.date}
        indexKey={indexKey}
      />

      {/* Sensitivity */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change sensitivity</span>
          <span className="text-[0.65rem] font-semibold text-cyan-300">{threshold.toFixed(2)}</span>
        </div>
        <input
          type="range" min={0.02} max={0.3} step={0.01} value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-cyan-400"
        />
        <p className="text-[0.55rem] text-slate-600">Lower = more sensitive to small pixel changes (more noise). Higher = only strong changes shown.</p>
      </div>

      {/* Run */}
      {!canClassify && (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2">
          <p className="text-[0.58rem] text-slate-400 leading-relaxed">
            <span className="font-semibold" style={{ color: previewDef.color }}>{previewDef.label}</span>{" "}
            {previewDef.kind === "composite"
              ? "has no server-side luminance/index reduction wired up yet"
              : "doesn't have server-side change classification wired up yet"}
            {" "}— it's great for the Before/After swipe and side-by-side compare above,
            but there's no scalar pixel value to classify into Gain/Loss. Pick a classifiable
            option (e.g. RGB, SWIR, or any Sentinel-2/Landsat index) to run the change classification.
          </p>
        </div>
      )}
      {canClassify && !canRun && (
        <div className="rounded-lg border border-amber-400/15 bg-amber-400/[0.05] px-3 py-2 space-y-1">
          <p className="text-[0.58rem] text-amber-200 font-medium">Required before running:</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[0.55rem] rounded-full px-2 py-0.5 border ${beforeScene ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] text-slate-500"}`}>
              {beforeScene ? `✓ Before · ${formatDateDMY(beforeScene.date)}` : "✗ Before scene"}
            </span>
            <span className={`text-[0.55rem] rounded-full px-2 py-0.5 border ${afterScene ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/[0.08] text-slate-500"}`}>
              {afterScene ? `✓ After · ${formatDateDMY(afterScene.date)}` : "✗ After scene"}
            </span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={runChangeDetection}
        disabled={!canRun || computing}
        className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {runButtonLabel}
      </button>

      {computeError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[0.62rem] text-red-300">
          {computeError}
        </div>
      )}

      {/* Results */}
      {changeResult && diffDataUrl && (
        <div className="rounded-lg border border-white/[0.07] bg-[#020817]/70 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Change Map</p>
            <div className="flex items-center gap-1.5">
              
              <button
              type="button"
              onClick={downloadDiff}
              className="flex items-center gap-1.5 text-[0.6rem] text-slate-400 hover:text-cyan-400 border border-white/[0.08] hover:border-cyan-400/30 rounded-lg px-2 py-1 transition-all cursor-pointer"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              PNG
            </button>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={diffDataUrl} alt="Change detection classification map" className="w-full rounded-md border border-white/[0.06]" style={{ imageRendering: "pixelated" }} />

          {/* Legend — clear, distinct colors matching the classification, computed server-side */}
          <div className="space-y-1.5">
            {changeResult.legend.map((item) => {
              const pct = changeResult.stats
                ? (changeResult.stats as any)[`${item.key}Pct`] as number | undefined
                : undefined;
              return (
                <div key={item.key} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: item.color, boxShadow: `0 0 6px ${item.color}88` }} />
                  <span className="text-[0.62rem] text-slate-300 flex-1">{item.label}</span>
                  {typeof pct === "number" && (
                    <span className="text-[0.62rem] font-semibold text-slate-400 font-mono">{pct.toFixed(1)}%</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[0.55rem] text-slate-600 text-center leading-relaxed">
        Scenes are sourced from Microsoft Planetary Computer (Sentinel-2 L2A) via STAC search. The change map is
        computed server-side from the real band pixel data for the selected index.
      </p>
    </div>
  );
}

export default ChangeDetectionPanel;