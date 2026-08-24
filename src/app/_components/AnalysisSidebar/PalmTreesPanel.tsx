"use client";

// ─── PalmTreesPanel.tsx ─────────────────────────────────────────────────────
// Palm Trees Analysis — a new tab living alongside Raster Calc (not a
// replacement for it).
//
// Same philosophy as PlanetaryRasterPanel.tsx: no computation happens on the
// frontend. The user picks a date range and types a formula/condition to run
// on palm trees. This panel just packages: date range + bounding box + the
// real geometry of whatever shape was drawn (Rectangle / Polygon / Circle /
// Marker... any drawing tool) + the formula text, and sends it to a backend
// endpoint.
//
// Wired to POST https://webgiss.duckdns.org/gis/palm-detection with the same
// Bearer-token auth as raster-calc / time-series / super-resolution / analyses
// (via next-auth's useSession). The backend requires an actual captured image
// of the drawn shape ("image file is required") — not just bbox/geometry.
//
// ✅ Follows the exact same capture pattern as TemplateMatchPanel.tsx: this
// panel does NOT touch mapInstance/L/useMapCanvas directly. It asks the
// parent to do the capture (onRequestCapture), and the parent hands back a
// MapCapture ({ blob, previewUrl, bounds }) once ready via `pendingCapture` —
// same as pendingTemplateCapture/pendingMapCapture there. The parent should
// capture bounds from the currently drawn shape (selectedFeature) the same
// way it already does for Template Match's rectangle capture.
//
// If the request fails (network, 4xx/5xx, or a { success: false } payload) it
// surfaces a clear error instead of hanging on "loading" forever.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";

// ─── Backend endpoint ───────────────────────────────────────────────────────
// نفس الـ base اللي بتستخدمه raster-calc / time-series / super-resolution /
// analyses — دلوقتي بيتبعت معاه Bearer token زيهم بالظبط (شوفي useSession تحت).
const PALM_BACKEND_URL = "https://webgiss.duckdns.org/gis/palm-detection";

// ─── Heatmap ────────────────────────────────────────────────────────────────
// Palm Detection مش بيرجع GeoTIFF زي NDVI/NDWI في raster-calc — بيرجع بس
// نقط (geojson_url). عشان الهيت ماب تبقى "زي راستر كلك بالظبط" (نفس
// الألوان، نفس منطق الـ rescale)، الـ proxy الجديد ده
// (app/api/palm-heatmap/route.ts) بيحوّل النقط دي لشبكة كثافة ويلوّنها
// بنفس RAMPS/buildLUT اللي renderIndex بتاع raster-calc بيستخدمهم بالظبط.
const PALM_HEATMAP_PROXY_URL = "/api/palm-heatmap";

// ─── Excel export ───────────────────────────────────────────────────────────
// نفس فكرة PALM_HEATMAP_PROXY_URL بالظبط: csv_url اللي راجع من /gis/palm-detection
// خام بلا تنسيق، فالـ proxy ده (app/api/palm-excel/route.ts) بيجيبه من السيرفر
// (مفيش CORS) ويحوله لملف .xlsx منسّق (هيدر ملوّن، فلتر تلقائي، تلوين شرطي
// لعمود Risk Level) بدل ما يفتح CSV خام في تاب جديدة.
const PALM_EXCEL_PROXY_URL = "/api/palm-excel";

// نفس الـ 10 color ramps بالحرف الواحد من PlanetaryRasterPanel.tsx — نسخة
// self-contained هنا (زي باقي هذا الملف) عشان الشكل يطابق تمامًا.
const COLOR_RAMPS: { key: string; label: string; gradient: string }[] = [
  { key: "rdylgn",    label: "Vegetation", gradient: "linear-gradient(90deg,#a50026 0%,#d73027 10%,#f46d43 20%,#fdae61 30%,#fee08b 40%,#ffffbf 50%,#d9ef8b 60%,#a6d96a 70%,#66bd63 80%,#1a9850 90%,#006837 100%)" },
  { key: "rdbu",      label: "Water",      gradient: "linear-gradient(90deg,#d9ef8b 0%,#a6d96a 17%,#66c2a5 33%,#3288bd 50%,#2166ac 67%,#08306b 83%,#062254 100%)" },
  { key: "rdbu_r",    label: "Moisture",   gradient: "linear-gradient(90deg,#f3f1f4 0%,#f0cac1 13%,#eeb780 25%,#ebb25b 38%,#e8c32d 50%,#e7e600 63%,#9fd601 75%,#2ab900 88%,#02a402 100%)" },
  { key: "spectral",  label: "Spectral",   gradient: "linear-gradient(90deg,#440154 0%,#482878 11%,#3e4989 22%,#31688e 33%,#26828e 44%,#1f9e89 56%,#35b779 67%,#6ece58 78%,#b5de2b 89%,#fde725 100%)" },
  { key: "spectral_r",label: "Spectral R", gradient: "linear-gradient(90deg,#08306b 0%,#2166ac 14%,#4393c3 28%,#92c5de 43%,#f4a582 57%,#d6604d 71%,#b2182b 86%,#67001f 100%)" },
  { key: "magma",     label: "Thermal",    gradient: "linear-gradient(90deg,#f6f6fd 0%,#a0abed 11%,#358dc5 22%,#278da6 33%,#78b49c 44%,#e3dc85 56%,#f4b46b 67%,#da5b52 78%,#a21643 89%,#61031f 100%)" },
  { key: "greens",    label: "Greens",     gradient: "linear-gradient(90deg,#f7fcf5 0%,#e5f5e0 13%,#c7e9c0 25%,#a1d99b 38%,#74c476 50%,#41ab5d 63%,#238b45 75%,#006d2c 88%,#00441b 100%)" },
  { key: "rdylbu_r",  label: "Heat",       gradient: "linear-gradient(90deg,#4b0082 0%,#6a00a8 13%,#0000ff 25%,#00bfff 38%,#00ffea 50%,#00ff40 63%,#ffff00 75%,#ff8000 88%,#ff0000 100%)" },
  { key: "inferno",   label: "Inferno",    gradient: "linear-gradient(90deg,#000004 0%,#1b0c41 11%,#4a0c6b 22%,#781c6d 33%,#a52c60 44%,#cf4446 56%,#ed6925 67%,#fb9b06 78%,#f7d13d 89%,#fcffa4 100%)" },
];

function colormapPreviewGradient(name: string): string {
  return COLOR_RAMPS.find((r) => r.key === name)?.gradient ?? COLOR_RAMPS[COLOR_RAMPS.length - 1].gradient;
}

// ─── Value Heatmap — الأعمدة الرقمية اللي ممكن اليوزر يختار يرسم منها هيت
// ماب "قيمة" بدل هيت ماب "كثافة" ─────────────────────────────────────────────
// نفس NUMERIC_COLUMNS بالحرف الواحد من app/api/palm-excel/route.ts (ما عدا
// Palm ID، ده مُعرّف مش قيمة نرسمها). لو الباك إند ضاف عمود رقمي جديد يوم ما،
// يتضاف هنا بس عشان يظهر في الـ dropdown.
type HeatmapMode = "density" | "value";

// ─── Render style — الشكل اللي البيانات بتتعرض بيه على الخريطة: "heatmap"
// (سطح راستر متصل، الشغل الأصلي) أو "points" (كل نخلة نقطة منفصلة ملوّنة —
// الإضافة الجديدة). الاتنين شغالين جنب بعض، ومفيش حاجة قديمة اتشالت —
// دمجناهم مع HeatmapMode في دروب داون واحد فيه الأربع اختيارات كلها ───────
type RenderStyle = "points" | "heatmap";
export type DisplayMode = "density-heatmap" | "density-points" | "value-heatmap" | "value-points";

const DISPLAY_MODE_OPTIONS: { key: DisplayMode; label: string }[] = [
  { key: "density-heatmap", label: "Density · Heatmap" },
  { key: "density-points", label: "Density · Points" },
  { key: "value-heatmap", label: "Value · Heatmap" },
  { key: "value-points", label: "Value · Points" },
];

function splitDisplayMode(m: DisplayMode): { mode: HeatmapMode; style: RenderStyle } {
  const dash = m.indexOf("-");
  return { mode: m.slice(0, dash) as HeatmapMode, style: m.slice(dash + 1) as RenderStyle };
}

const VALUE_FIELDS: { key: string; label: string }[] = [
  { key: "NDVI Value", label: "NDVI Value" },
  { key: "NDMI Value", label: "NDMI Value" },
  { key: "Stress Score", label: "Stress Score" },
  { key: "Crown Diameter (m)", label: "Crown Diameter (m)" },
  { key: "Crown Area (m2)", label: "Crown Area (m2)" },
];

// ─── Index presets — نفس فكرة "INDEX PRESET" اللي في Raster Calc، بس هنا كل
// preset مربوط بـ condition جاهزة تتحط في الـ Formula/condition box لوحدها
// أول ما اليوزر يدوس عليها (بدل ما يكتبها يدوي من الصفر). اليوزر لسه يقدر
// يعدّل النص بعد كده عادي — الـ textarea مش readonly ────────────────────────
// ⚠️ (2026-08-25) اتوسّعت لكل الـ Sentinel-2 indices الموجودة فعليًا في
// SatelliteDataPanel.tsx / SatellitePipelines.ts (SOURCE_INDICES["sentinel-2"])
// — مش بس السبعة الأصليين. المعادلات منقولة حرفيًا من ANALYSIS_CONFIG في
// route.ts (raster-proxy)، بس معبّر عنها كـ نص عادي بالباندات (B02..B12)
// بدل JS function، زي الشكل اللي الـ 7 القدامى كانوا مكتوبين بيه. أي index
// كان محتاج تطبيع reflectance (÷10000) في route.ts (زي CVI/GEMI/MCARI/TCARI/
// ARI/CRI1/CRI2) اتحط الـ ÷10000 صريح في النص هنا بنفس المنطق. الألوان (dot)
// مبنية على نفس defaultColormap بتاع كل index في route.ts (نفس المجموعة
// gradients لو كذا index شايل نفس اللون). RGB مش موجود هنا لإنه مش index
// (composite مش formula). CHANGE-only entries (زي VV/VH/SAR/DEM/atmospheric/
// MODIS/ASTER/Sentinel-3) مش Sentinel-2 أصلًا فمش هنا (شوفي SOURCE_INDICES).
const INDEX_PRESETS: { key: string; label: string; desc: string; dot: string; formula: string }[] = [
  { key: "ndvi", label: "NDVI", desc: "Vegetation vigor",          dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "(B08-B04)/(B08+B04)" },
  { key: "ndwi", label: "NDWI", desc: "Water content",             dot: "linear-gradient(135deg,#2166ac,#66c2a5)", formula: "(B03-B08)/(B03+B08)" },
  { key: "ndmi", label: "NDMI", desc: "Moisture / drought stress", dot: "linear-gradient(135deg,#e7e600,#02a402)", formula: "(B08-B11)/(B08+B11)" },
  { key: "ndbi", label: "NDBI", desc: "Built-up / urban areas",    dot: "linear-gradient(135deg,#2166ac,#b2182b)", formula: "(B11-B08)/(B11+B08)" },
  { key: "savi", label: "SAVI", desc: "Soil-adjusted vegetation",  dot: "linear-gradient(135deg,#fdae61,#1a9850)", formula: "((B08-B04)/(B08+B04+0.5))*1.5" },
  { key: "evi",  label: "EVI",  desc: "Enhanced vegetation",       dot: "linear-gradient(135deg,#a52c60,#238b45)", formula: "2.5*(B08-B04)/(B08+6*B04-7.5*B02+1)" },
  { key: "bsi",  label: "BSI",  desc: "Bare soil index",           dot: "linear-gradient(135deg,#2166ac,#d73027)", formula: "((B11+B04)-(B08+B02))/((B11+B04)+(B08+B02))" },

  // ── Agriculture add-ons ──────────────────────────────────────────────────
  { key: "ndre",   label: "NDRE",   desc: "Red-edge chlorophyll",             dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "(B08-B05)/(B08+B05)" },
  { key: "gndvi",  label: "GNDVI",  desc: "Green-based vegetation",           dot: "linear-gradient(135deg,#f97316,#15803d)", formula: "(B08-B03)/(B08+B03)" },
  { key: "msavi2", label: "MSAVI2", desc: "Soil-adjusted vegetation (self-tuning)", dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "(2*B08+1-sqrt((2*B08+1)*(2*B08+1)-8*(B08-B04)))/2" },
  { key: "ccci",   label: "CCCI",   desc: "Canopy chlorophyll / nitrogen",    dot: "linear-gradient(135deg,#2166ac,#66c2a5)", formula: "((B08-B05)/(B08+B05))/((B08-B04)/(B08+B04))" },
  { key: "nddi",   label: "NDDI",   desc: "Drought signal (NDVI vs NDWI)",    dot: "linear-gradient(135deg,#a1d99b,#006d2c)", formula: "(((B08-B04)/(B08+B04))-((B03-B08)/(B03+B08)))/(((B08-B04)/(B08+B04))+((B03-B08)/(B03+B08)))" },
  { key: "si",     label: "SI",     desc: "Salinity index",                  dot: "linear-gradient(135deg,#0f766e,#facc15)", formula: "(B04-B08)/(B04+B08)" },
  { key: "cvi",    label: "CVI",    desc: "Chlorophyll vegetation index",     dot: "linear-gradient(135deg,#0c4a6e,#059669)", formula: "(B08/10000)*((B04/10000)/((B03/10000)*(B03/10000)))" },

  // ── Visible-only + red-edge add-ons ──────────────────────────────────────
  { key: "vari",     label: "VARI",     desc: "Visible-only vegetation",         dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "(B03-B04)/(B03+B04-B02)" },
  { key: "red_edge", label: "RED EDGE", desc: "Red-edge inflection point (S2REP, nm)", dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "705+35*(((B07+B04)/2-B05)/(B06-B05))" },

  // ── Triangular/visible vegetation add-ons ────────────────────────────────
  { key: "mtvi", label: "MTVI2", desc: "Triangular vegetation (soil-corrected)", dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "(1.5*(1.2*(B08/10000-B03/10000)-2.5*(B04/10000-B03/10000)))/sqrt((2*(B08/10000)+1)*(2*(B08/10000)+1)-(6*(B08/10000)-5*sqrt(B04/10000))-0.5)" },
  { key: "tvi",  label: "TVI",   desc: "Triangular vegetation area",            dot: "linear-gradient(135deg,#3288bd,#d53e4f)", formula: "0.5*(120*(B08/100-B03/100)-200*(B04/100-B03/100))" },
  { key: "grvi", label: "GRVI",  desc: "Green-red vegetation",                  dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "(B03-B04)/(B03+B04)" },

  // ── Pigment/chlorophyll add-ons ──────────────────────────────────────────
  { key: "reci", label: "RECI", desc: "Red-edge chlorophyll ratio", dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "(B08/B05)-1" },
  { key: "sipi", label: "SIPI", desc: "Pigment / canopy stress",    dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(B08-B02)/(B08-B04)" },
  { key: "gci",  label: "GCI",  desc: "Green chlorophyll ratio",    dot: "linear-gradient(135deg,#a1d99b,#006d2c)", formula: "(B08/B03)-1" },
  { key: "psri", label: "PSRI", desc: "Senescence / plant stress",  dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(B04-B02)/B06" },

  // ── Burn severity add-on ─────────────────────────────────────────────────
  { key: "nbri", label: "NBRI", desc: "Burn severity", dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "(B08-B12)/(B08+B12)" },

  // ── Moisture/snow/oil add-ons ────────────────────────────────────────────
  { key: "msi",  label: "MSI",  desc: "Moisture stress ratio",     dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "B11/B08" },
  { key: "ndsi", label: "NDSI", desc: "Snow / ice index",          dot: "linear-gradient(135deg,#2166ac,#66c2a5)", formula: "(B03-B11)/(B03+B11)" },
  { key: "osi",  label: "OSI",  desc: "Oil spill (visible heuristic)", dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "((B04+B02)-B03)/((B04+B02)+B03)" },

  // ── Red-edge NDVI + red-edge inflection point add-ons ────────────────────
  { key: "rendvi", label: "RENDVI", desc: "Red-edge NDVI",                     dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "(B06-B05)/(B06+B05)" },
  { key: "reip",   label: "REIP",   desc: "Red-edge inflection, classic (nm)", dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "700+40*(((B04+B07)/2-B05)/(B06-B05))" },

  // ── Drought/pigment add-ons ───────────────────────────────────────────────
  { key: "nmdi_soil", label: "NMDI (Soil)", desc: "Soil moisture (drought)",     dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(B08-(B11-B12))/(B08+(B11-B12))" },
  { key: "nmdi_veg",  label: "NMDI (Veg)",  desc: "Vegetation water content",    dot: "linear-gradient(135deg,#2166ac,#66c2a5)", formula: "(B08-(B11-B12))/(B08+(B11-B12))" },
  { key: "ari",       label: "ARI",         desc: "Anthocyanin index",           dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(10000/B03)-(10000/B05)" },
  { key: "ari2",      label: "ARI2 (mARI)", desc: "Anthocyanin, leaf-corrected", dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(B07/B03)-(B07/B05)" },

  // ── Geology / mineral-mapping add-ons ────────────────────────────────────
  { key: "cmr", label: "CMR", desc: "Clay minerals ratio",   dot: "linear-gradient(135deg,#4a0c6b,#fcffa4)", formula: "B11/B12" },
  { key: "fmr", label: "FMR", desc: "Ferrous minerals ratio", dot: "linear-gradient(135deg,#7f0000,#fdcc8a)", formula: "B11/B08" },

  // ── Iron oxide + water-quality add-ons ───────────────────────────────────
  { key: "ioi",  label: "IOI",  desc: "Iron oxide ratio",             dot: "linear-gradient(135deg,#721f81,#fb8861)", formula: "B04/B02" },
  { key: "ndci", label: "NDCI", desc: "Chlorophyll-a, turbid water",  dot: "linear-gradient(135deg,#30123b,#a2fc3c)", formula: "(B05-B04)/(B05+B04)" },
  { key: "fai",  label: "FAI",  desc: "Floating algae index",         dot: "linear-gradient(135deg,#a1d99b,#006d2c)", formula: "B08-(B04+(B11-B04)*0.1772)" },

  // ── Water/vegetation add-ons ──────────────────────────────────────────────
  { key: "mndwi", label: "MNDWI", desc: "Modified water index",          dot: "linear-gradient(135deg,#2166ac,#66c2a5)", formula: "(B03-B11)/(B03+B11)" },
  { key: "gemi",  label: "GEMI",  desc: "Atmosphere-stable vegetation",  dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "((2*((B08/10000)*(B08/10000)-(B04/10000)*(B04/10000))+1.5*(B08/10000)+0.5*(B04/10000))/((B08/10000)+(B04/10000)+0.5))*(1-0.25*((2*((B08/10000)*(B08/10000)-(B04/10000)*(B04/10000))+1.5*(B08/10000)+0.5*(B04/10000))/((B08/10000)+(B04/10000)+0.5)))-((B04/10000-0.125)/(1-B04/10000))" },

  // ── Pigment/index add-ons ────────────────────────────────────────────────
  { key: "mcari", label: "MCARI", desc: "Chlorophyll absorption ratio", dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "((B05/10000-B04/10000)-0.2*(B05/10000-B03/10000))*((B05/10000)/(B04/10000))" },
  { key: "cri1",  label: "CRI1",  desc: "Carotenoid reflectance",       dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(10000/B02)-(10000/B03)" },
  { key: "cri2",  label: "CRI2",  desc: "Carotenoid, canopy-corrected", dot: "linear-gradient(135deg,#b2182b,#2166ac)", formula: "(10000/B02)-(10000/B05)" },

  // ── Harmful algal bloom add-on ───────────────────────────────────────────
  { key: "ci", label: "CI", desc: "Cyanobacteria (bloom) index, approximated", dot: "linear-gradient(135deg,#30123b,#a2fc3c)", formula: "(B04+(B06-B04)*0.5333)-B05" },

  // ── Vegetation/chlorophyll add-ons ───────────────────────────────────────
  { key: "evi2", label: "EVI2", desc: "Enhanced vegetation (2-band)",  dot: "linear-gradient(135deg,#721f81,#fb8861)", formula: "2.5*(B08-B04)/(B08+2.4*B04+1)" },
  { key: "mtci", label: "MTCI", desc: "MERIS-heritage chlorophyll",    dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "(B06-B05)/(B05-B04)" },

  // ── 2026-08-15 batch (part 2) ────────────────────────────────────────────
  { key: "ndvi705", label: "NDVI705", desc: "Red-edge NDVI (705nm)",              dot: "linear-gradient(135deg,#5e4fa2,#f46d43)", formula: "(B06-B05)/(B06+B05)" },
  { key: "ndti",    label: "NDTI",    desc: "Water turbidity",                    dot: "linear-gradient(135deg,#0f766e,#facc15)", formula: "(B04-B03)/(B04+B03)" },
  { key: "tcari",   label: "TCARI",   desc: "Chlorophyll absorption (transformed)", dot: "linear-gradient(135deg,#f46d43,#1a9850)", formula: "3*((B05/10000-B04/10000)-0.2*(B05/10000-B03/10000)*((B05/10000)/(B04/10000)))" },
];

// نفس شكل RasterPreviewConfig المستخدم في PlanetaryRasterPanel.tsx —
// عشان لو الـ parent (MapClient) عنده onPreview overlay logic جاهز، الهيت
// ماب بتاع النخل يشتغل عليه "زيها بالظبط" من غير أي تعديل هناك.
export type PalmHeatmapPreviewConfig = {
  name: string;
  indexKey: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]]; // [[south, west],[north, east]]
  opacity: number;
  colorRamp: string;
  dataUrl: string;
};

// ─── Points preview config — الإضافة الجديدة، شكلها مختلف عن الراستر عمدًا
// (مفيش dataUrl/bounds صورة، فيه بس مصفوفة نقط بلونها) عشان الـ parent يرسمها
// كـ Leaflet CircleMarkers بدل ImageOverlay. لو الـ parent لسه معملش wiring
// لـ onPreviewPoints (زي onPreview بالظبط)، الكومبوننت بيعرض fallback SVG
// بسيط جوا نفسه عشان يبان النقط اتولّدت فعلًا. ──────────────────────────────
export type PalmPointsPreviewConfig = {
  name: string;
  indexKey: string;
  date: string;
  points: { lat: number; lng: number; value: number; color: string }[];
  opacity: number;
};

function readHeatmapStatsFromHeaders(res: Response, fallbackMin: number, fallbackMax: number) {
  const statsHeader = res.headers.get("X-Raster-Stats");
  let parsed: { min?: number; max?: number; mean?: number; validPixels?: number } = {};
  if (statsHeader) {
    try { parsed = JSON.parse(statsHeader); } catch { parsed = {}; }
  }
  return {
    min: Number.isFinite(parsed.min) ? Number(parsed.min) : fallbackMin,
    max: Number.isFinite(parsed.max) ? Number(parsed.max) : fallbackMax,
    mean: Number.isFinite(parsed.mean) ? Number(parsed.mean) : (fallbackMin + fallbackMax) / 2,
    validPixels: Number.isFinite(parsed.validPixels) ? Number(parsed.validPixels) : 0,
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────
// نفس الـ MapCapture بتاع TemplateMatchPanel.tsx بالظبط
export interface MapCapture {
  blob: Blob;
  previewUrl: string;
  bounds: { north: number; south: number; east: number; west: number };
  /** the full captured image's georeferenced bounds — needed for geo_bounds below */
  viewportBounds?: { north: number; south: number; east: number; west: number };
}

type Props = {
  selectedFeature?: GeoJSON.Feature | null;
  /** called once the request succeeds (once the backend is live) */
  onResult?: (result: any) => void;
  /** ask the parent to capture an image of the currently drawn shape */
  onRequestCapture?: () => void;
  /** the captured image once the parent's capture pipeline finishes */
  pendingCapture?: MapCapture | null;
  /** clear the current capture (e.g. after a run, or to recapture) */
  onClearCapture?: () => void;
  /** called with the resulting density-heatmap PNG + bounds, so MapClient/LeafletMap
   *  can overlay it — same callback shape as PlanetaryRasterPanel's onPreview */
  onPreview?: (config: PalmHeatmapPreviewConfig) => void;
  /** called with the resulting colored points (one per palm), so MapClient/LeafletMap
   *  can render them as CircleMarkers — new, parallel to onPreview, for renderStyle="points" */
  onPreviewPoints?: (config: PalmPointsPreviewConfig) => void;
};

type PalmBBox = [number, number, number, number]; // [west, south, east, north]

type ShapeKind = "rectangle" | "polygon" | "circle" | "point" | "line" | "unknown";

// ─── Helpers (self-contained — no import from the raster calc file) ───────

function circleToPolygon(lat: number, lng: number, radiusMeters: number, points = 64): GeoJSON.Polygon {
  const EARTH_RADIUS = 6371008.8;
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
  return { type: "Polygon", coordinates: [ring] };
}

/** Detects which drawing tool produced this feature, so it can be sent along with the payload */
function detectShapeKind(feature?: GeoJSON.Feature | null): ShapeKind {
  const g = feature?.geometry as any;
  if (!g) return "unknown";
  const radius: number | undefined =
    (feature as any)?.properties?.radius ??
    (feature as any)?.properties?.circleRadius ??
    (g as any)?.radius;

  if (g.type === "Point" && typeof radius === "number" && radius > 0) return "circle";
  if (g.type === "Point") return "point";
  if (g.type === "LineString" || g.type === "MultiLineString") return "line";
  if (g.type === "Polygon") {
    // Rectangle = a Polygon with 4 sides (5 points if the ring is closed)
    const ring = g.coordinates?.[0];
    if (Array.isArray(ring) && (ring.length === 5 || ring.length === 4)) return "rectangle";
    return "polygon";
  }
  if (g.type === "MultiPolygon") return "polygon";
  return "unknown";
}

/** Converts any drawn shape (Polygon/MultiPolygon/Circle-as-Point+radius) into
 *  real GeoJSON to send to the backend — same idea as getRequestGeometry in
 *  the raster calc panel */
function getShapeGeometry(feature?: GeoJSON.Feature | null): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const g = feature?.geometry as any;
  if (!g) return null;

  if (g.type === "Polygon" || g.type === "MultiPolygon") {
    return g as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  }

  const radius: number | undefined =
    (feature as any)?.properties?.radius ??
    (feature as any)?.properties?.circleRadius ??
    (g as any)?.radius;

  if (g.type === "Point" && typeof radius === "number" && radius > 0) {
    const [lng, lat] = g.coordinates as [number, number];
    return circleToPolygon(lat, lng, radius);
  }

  return null;
}

/** bounding box from any feature (falls back to Cairo if nothing is drawn yet) */
function getShapeBBox(feature?: GeoJSON.Feature | null): PalmBBox {
  const coords: number[][] = [];
  const walk = (v: any) => {
    if (!Array.isArray(v)) return;
    if (typeof v[0] === "number" && typeof v[1] === "number") { coords.push(v); return; }
    v.forEach(walk);
  };
  walk((feature?.geometry as any)?.coordinates);

  // Circle: add the radius so the bbox actually wraps the circle, not just its center point
  const g = feature?.geometry as any;
  const radius: number | undefined =
    (feature as any)?.properties?.radius ??
    (feature as any)?.properties?.circleRadius ??
    (g as any)?.radius;
  if (g?.type === "Point" && typeof radius === "number" && radius > 0) {
    const [lng, lat] = g.coordinates as [number, number];
    const poly = circleToPolygon(lat, lng, radius);
    poly.coordinates[0].forEach(([x, y]) => coords.push([x, y]));
  }

  if (!coords.length) {
    // fallback: Cairo, small default extent
    const lat = 30.0444, lng = 31.2357, pad = 0.01;
    return [lng - pad, lat - pad, lng + pad, lat + pad];
  }

  const lngs = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

function formatBBox(bbox: PalmBBox) {
  const [w, s, e, n] = bbox;
  return `W ${w.toFixed(6)}, S ${s.toFixed(6)}, E ${e.toFixed(6)}, N ${n.toFixed(6)}`;
}

const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  polygon: "Polygon",
  circle: "Circle",
  point: "Point",
  line: "Line",
  unknown: "No shape selected",
};

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────
// ─── Sidebar icon item: drop this in AnalysisSidebar.tsx in place of the
//     plain icon button currently rendered for the "raster" panel item.
//     Hovering it reveals a flyout with two choices — Raster Calc (the
//     existing default panel) and Palms — exactly like the other icons'
//     tooltip, but clickable. Clicking either one switches the active
//     sub-tab AND opens the raster panel (it never closes it, same as the
//     OPEN_RASTER_CALCULATOR_EVENT behavior already in AnalysisSidebar).
// ─────────────────────────────────────────────────────────────────────────

export type RasterTabKey = "default" | "palms";

// Simple palm-tree icon (trunk + fronds), kept in the same 18x18 / stroke
// style as every other icon in panels.tsx so it sits naturally in the list.
export const PALM_ICON: ReactNode = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 21V11" />
    <path d="M12 11c1-3 3-4 6-4" />
    <path d="M12 11c-1-3-3-4-6-4" />
    <path d="M12 9c1.5-2.5 4-3.5 7-2.5" />
    <path d="M12 9c-1.5-2.5-4-3.5-7-2.5" />
    <path d="M9 21h6" />
  </svg>
);

export function RasterCalcSidebarItem({
  isActive,
  activeTab,
  onSelect,
  isRTL,
  rasterIcon,
  rasterLabelEn,
  rasterLabelAr,
  badge,
}: {
  /** true when the "raster" panel id is the currently open panel */
  isActive: boolean;
  /** which sub-tab is currently selected: "default" (Raster Calc) or "palms" */
  activeTab: RasterTabKey;
  /** called with the chosen sub-tab; the parent should also open the raster panel */
  onSelect: (tab: RasterTabKey) => void;
  isRTL: boolean;
  /** pass panels.find(p => p.id === "raster")!.icon here so the original icon is reused as-is */
  rasterIcon: ReactNode;
  rasterLabelEn: string;
  rasterLabelAr: string;
  badge?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openMenu = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setHovered(true);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setHovered(false), 150);
  };

  const options: { key: RasterTabKey; label: string; icon: ReactNode; desc: string }[] = [
    { key: "default", label: rasterLabelEn, icon: rasterIcon, desc: "NDVI / NDWI / NDMI ... indices" },
    { key: "palms", label: "Palms", icon: PALM_ICON, desc: "Palm tree detection & analysis" },
  ];

  const displayIcon = activeTab === "palms" ? PALM_ICON : rasterIcon;
  const displayLabel = activeTab === "palms" ? "Palms" : (isRTL ? rasterLabelAr : rasterLabelEn);

  return (
    <div className="relative group w-full flex justify-center" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        onClick={() => onSelect(activeTab)}
        title={displayLabel}
        aria-label={displayLabel}
        className={`
          relative w-9 h-9 rounded-lg flex items-center justify-center
          transition-all duration-150 cursor-pointer
          ${isActive
            ? "bg-cyan-400/15 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(0,212,255,0.3)]"
            : "text-slate-500 hover:text-slate-200 hover:bg-white/[0.07]"
          }
        `}
      >
        {displayIcon}
        {badge && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 bg-cyan-400 text-[#040d1a] text-[0.52rem] font-bold rounded-full flex items-center justify-center px-0.5">
            {badge}
          </span>
        )}
      </button>

      {/* Hover flyout — pick between Raster Calc and Palms. Replaces the
          plain tooltip other icons show, since this one needs to be
          clickable with two destinations instead of just a label. */}
      {hovered && (
        <div
          className={`absolute top-0 z-50 w-52 overflow-hidden rounded-lg border border-white/10 bg-[#0d1b2e] shadow-xl ${
            isRTL ? "left-11" : "right-11"
          }`}
        >
          {options.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => { onSelect(opt.key); setHovered(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                activeTab === opt.key ? "bg-cyan-400/[0.12] text-cyan-300" : "text-slate-300 hover:bg-white/[0.06]"
              }`}
            >
              <span className="shrink-0">{opt.icon}</span>
              <span className="flex flex-col">
                <span className="text-xs font-bold">{opt.label}</span>
                <span className="text-[0.58rem] text-slate-500">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// ─── Palms Panel ────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────

export default function PalmTreesPanel({
  selectedFeature,
  onResult,
  onRequestCapture,
  pendingCapture,
  onClearCapture,
  onPreview,
  onPreviewPoints,
}: Props) {
  const { data: session } = useSession();
  const accessToken = (session?.user as any)?.accessToken as string | undefined;

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(todayStr);
  const [expression, setExpression] = useState("");
  // preset المختار حاليًا في dropdown الـ Formula/condition (زي INDEX PRESET
  // بتاع Raster Calc) — null لحد ما اليوزر يدوس على واحد، أو لو عدّل النص
  // يدويًا بحيث بقى مش مطابق لأي preset (بيرجع "custom")
  const [indexPresetKey, setIndexPresetKey] = useState<string | null>(null);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<"idle" | "capturing" | "loading" | "error" | "success">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loadingSeconds, setLoadingSeconds] = useState(0);

  // ── Heatmap state — نفس فكرة Colormap/Rescale بتاعة raster-calc، بس هنا
  // مطبّقة على شبكة كثافة نقط النخل بدل قيم NDVI/NDWI ─────────────────────
  // heatmapMode: "density" (فين النخل مركّز) أو "value" (قيمة عمود بعينه —
  // مثلاً نتيجة معادلة NDVI اللي اليوزر دخلها في الـ Formula box — موزّعة
  // مكانيًا على النخل بدل عدّها بس)
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMode>("density");
  // renderStyle: الإضافة الجديدة — "heatmap" (زي ما كان دايمًا) أو "points"
  // (كل نخلة نقطة). مع heatmapMode بيكوّنوا الـ 4 اختيارات في الدروب داون
  const [renderStyle, setRenderStyle] = useState<RenderStyle>("heatmap");
  const [valueField, setValueField] = useState<string>(VALUE_FIELDS[0].key);
  const [colormap, setColormap] = useState("inferno");
  const [rescaleMin, setRescaleMin] = useState(0);
  const [rescaleMax, setRescaleMax] = useState(1);
  const [userEditedRescale, setUserEditedRescale] = useState(false);
  const [opacity, setOpacity] = useState(70); // %
  const [heatmapStatus, setHeatmapStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapStats, setHeatmapStats] = useState<{ min: number; max: number; mean: number; validPixels: number } | null>(null);
  const [heatmapDataUrl, setHeatmapDataUrl] = useState<string | null>(null);
  const [heatmapBounds, setHeatmapBounds] = useState<[[number, number], [number, number]] | null>(null);

  // ── Points state — نفس فكرة heatmapStatus/heatmapError/heatmapDataUrl بس
  // للإضافة الجديدة (renderStyle="points")، منفصلة عمدًا عشان أي حاجة قديمة
  // متبنيتش على شكلها متتأثرش ────────────────────────────────────────────
  const [pointsStatus, setPointsStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [pointsData, setPointsData] = useState<{ lat: number; lng: number; value: number; color: string }[] | null>(null);

  // ── حالة موحّدة لواجهة الـ UI (سبينر/رسالة خطأ) — بتتغير حسب renderStyle
  // المختار دلوقتي، من غير ما نضطر نكرر كل شرط مرتين تحت ─────────────────
  const activeStatus = renderStyle === "points" ? pointsStatus : heatmapStatus;
  const activeError = renderStyle === "points" ? pointsError : heatmapError;
  const displayMode: DisplayMode = `${heatmapMode}-${renderStyle}` as DisplayMode;

  const activeColorRamp = useMemo(
    () => COLOR_RAMPS.find((r) => r.key === colormap) ?? COLOR_RAMPS[COLOR_RAMPS.length - 1],
    [colormap]
  );

  // ── عداد ثواني بسيط وقت status === "loading"، عشان يبقى واضح إنها لسه
  // شغالة فعلاً ومش عالقة (ده كان اللي مفقود قبل كذا) ───────────────────────
  useEffect(() => {
    if (status !== "loading") { setLoadingSeconds(0); return; }
    const id = setInterval(() => setLoadingSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // ── مهلة قصوى للطلب — لو السيرفر ماردّش خلال المدة دي، نوقف الانتظار
  // ونظهر رسالة خطأ واضحة بدل ما نفضل منتظرين لحد ما الـ browser يعمل timeout
  // بنفسه (اللي بياخد وقت طويل جدًا وممفيش رسالة توضح إنها بايتة) ───────────
  const REQUEST_TIMEOUT_MS = 90_000;

  const shapeKind = useMemo(() => detectShapeKind(selectedFeature), [selectedFeature]);
  const bbox = useMemo(() => getShapeBBox(selectedFeature), [selectedFeature]);
  const geometry = useMemo(() => getShapeGeometry(selectedFeature), [selectedFeature]);

  const hasShape = shapeKind !== "unknown";
  const canRun = hasShape && expression.trim().length > 0 && status !== "loading" && status !== "capturing";

  // ── Heatmap generation — بتتنادى تلقائيًا أول ما نتيجة الكشف تنجح (لو فيه
  // geojson_url)، وبتتنادى تاني يدويًا لما اليوزر يغيّر الـ Colormap أو
  // الـ Rescale (زرار "Regenerate" تحت) بدل ما يعيد كشف النخل من الأول ────
  const generateHeatmap = async (
    geojsonUrl: string,
    csvUrl?: string | null,
    overrides?: { colormap?: string; mode?: HeatmapMode; valueField?: string }
  ) => {
    // ⚠️ بنستخدم الـ overrides (لو موجودة) بدل الـ state مباشرة، لأن setState
    // (setColormap/setHeatmapMode/setValueField) async — لو ندّينا على
    // generateHeatmap في نفس اللحظة اللي بندّي فيها setState، الـ closure هنا
    // لسه شايف القيمة القديمة، فكان بيتولّد هيت ماب بنفس الألوان/الوضع القديم
    // رغم إن الزرار اتغيّر شكله (ده اللي كان بيخلي زراير الألوان تبان "ديزاين
    // بس" — تتلوّن هي نفسها لكن الهيت ماب الفعلي على الخريطة ما يتغيّرش).
    const effColormap = overrides?.colormap ?? colormap;
    const effMode = overrides?.mode ?? heatmapMode;
    const effValueField = overrides?.valueField ?? valueField;

    setHeatmapStatus("loading");
    setHeatmapError(null);
    try {
      const [w, s, e, n] = bbox; // [west, south, east, north] — نفس شكل الشكل المرسوم بالظبط
      const params = new URLSearchParams({
        geojsonUrl,
        bbox: `${w},${s},${e},${n}`,
        colormap: effColormap,
        radius: "16",
      });

      if (effMode === "value") {
        params.set("mode", "value");
        params.set("valueField", effValueField);
        // csvUrl بيتبعت كـ fallback بس — لو القيمة موجودة أصلًا جوا properties
        // كل نقطة في الـ geojson، الراوت هيستخدمها مباشرة من غير ما يحتاج الـ CSV خالص
        const csv = csvUrl ?? result?.data?.csv_url;
        if (csv) params.set("csvUrl", csv);
      } else {
        params.set("mode", "density");
        params.set("alphaLow", "0");
        params.set("alphaHigh", "0.18");
      }

      if (userEditedRescale) {
        params.set("min", String(rescaleMin));
        params.set("max", String(rescaleMax));
      }

      const res = await fetch(`${PALM_HEATMAP_PROXY_URL}?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Heatmap generation failed (${res.status})`);
      }

      const realBboxHeader = res.headers.get("X-Real-Bbox");
      const realBbox = realBboxHeader
        ? (realBboxHeader.split(",").map(Number) as [number, number, number, number])
        : bbox;
      const [rw, rs, re, rn] = realBbox;
      const renderedBounds: [[number, number], [number, number]] = [[rs, rw], [rn, re]];

      const heatStats = readHeatmapStatsFromHeaders(res, rescaleMin, rescaleMax);
      if (!userEditedRescale) {
        setRescaleMin(heatStats.min);
        setRescaleMax(heatStats.max);
      }

      const pngBlob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read heatmap PNG"));
        reader.readAsDataURL(pngBlob);
      });

      setHeatmapStats(heatStats);
      setHeatmapDataUrl(dataUrl);
      setHeatmapBounds(renderedBounds);
      setHeatmapStatus("success");

      onPreview?.({
        name:
          effMode === "value"
            ? `Palm ${effValueField} · ${dateFrom}→${dateTo}`
            : `Palm density · ${dateFrom}→${dateTo}`,
        indexKey: effMode === "value" ? `PALM_VALUE_${effValueField}` : "PALM_DENSITY",
        date: dateFrom,
        dataUrl,
        bounds: renderedBounds,
        opacity: opacity / 100,
        colorRamp: effColormap,
        coords: { lat: (rs + rn) / 2, lng: (rw + re) / 2 },
      });
    } catch (err) {
      setHeatmapStatus("error");
      setHeatmapError(err instanceof Error ? err.message : "Heatmap generation failed.");
    }
  };

  // ── Points generation — نفس فكرة generateHeatmap بالظبط (نفس params:
  // colormap/rescale/mode/valueField)، بس بيطلب format=points من نفس
  // الـ proxy فيرجع GeoJSON نقط بدل PNG، فمفيش أي حاجة جديدة في route.ts
  // غير الإضافة اللي عملناها (format=points) — الراستر القديم زي ما هو ───
  const generatePoints = async (
    geojsonUrl: string,
    csvUrl?: string | null,
    overrides?: { colormap?: string; mode?: HeatmapMode; valueField?: string }
  ) => {
    const effColormap = overrides?.colormap ?? colormap;
    const effMode = overrides?.mode ?? heatmapMode;
    const effValueField = overrides?.valueField ?? valueField;

    setPointsStatus("loading");
    setPointsError(null);
    try {
      const [w, s, e, n] = bbox;
      const params = new URLSearchParams({
        geojsonUrl,
        bbox: `${w},${s},${e},${n}`,
        colormap: effColormap,
        radius: "16",
        format: "points",
      });

      if (effMode === "value") {
        params.set("mode", "value");
        params.set("valueField", effValueField);
        const csv = csvUrl ?? result?.data?.csv_url;
        if (csv) params.set("csvUrl", csv);
      } else {
        params.set("mode", "density");
      }

      if (userEditedRescale) {
        params.set("min", String(rescaleMin));
        params.set("max", String(rescaleMax));
      }

      const res = await fetch(`${PALM_HEATMAP_PROXY_URL}?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Points generation failed (${res.status})`);
      }

      const gj = await res.json();
      const pts: { lat: number; lng: number; value: number; color: string }[] = (gj?.features ?? []).map(
        (f: any) => ({
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          value: f.properties?.value,
          color: f.properties?.color ?? "#66bd63",
        })
      );

      setPointsData(pts);
      setPointsStatus("success");

      onPreviewPoints?.({
        name:
          effMode === "value"
            ? `Palm ${effValueField} (points) · ${dateFrom}→${dateTo}`
            : `Palm density (points) · ${dateFrom}→${dateTo}`,
        indexKey: effMode === "value" ? `PALM_VALUE_POINTS_${effValueField}` : "PALM_DENSITY_POINTS",
        date: dateFrom,
        points: pts,
        opacity: opacity / 100,
      });
    } catch (err) {
      setPointsStatus("error");
      setPointsError(err instanceof Error ? err.message : "Points generation failed.");
    }
  };

  // ── Dispatcher — بتختار تولّد Heatmap (راستر) ولا Points حسب renderStyle
  // الحالي (أو override صريح لو جاي من تغيير الدروب داون نفسه) ─────────────
  const generateForStyle = (
    geojsonUrl: string,
    csvUrl?: string | null,
    overrides?: { colormap?: string; mode?: HeatmapMode; valueField?: string; style?: RenderStyle }
  ) => {
    const style = overrides?.style ?? renderStyle;
    return style === "points" ? generatePoints(geojsonUrl, csvUrl, overrides) : generateHeatmap(geojsonUrl, csvUrl, overrides);
  };

  const submitToBackend = async (capture: MapCapture) => {
    setStatus("loading");
    setErrorMsg(null);
    setResult(null);

    try {
      const form = new FormData();
      // ⚠️ اسم الحقل "image" مبني على رسالة الباك "image file is required" —
      // لو الاسم الحقيقي مختلف (مثلاً "file" أو "map_image") غيّريه هنا بس.
      form.append("image", capture.blob, "palm_capture.png");

      // ── الأسماء والشكل بالظبط زي ما اتأكد من Postman: array [west, south,
      // east, north] — مش object زي ما كنا باعتينها الأول ────────────────────
      const boundsToArray = (b: { north: number; south: number; east: number; west: number }) => [
        b.west, b.south, b.east, b.north,
      ];

      // date_range: نفس صيغة "date" في raster-calc/time-series ("YYYY-MM-DD/YYYY-MM-DD")
      form.append("date_range", `${dateFrom}/${dateTo}`);
      // study_area_bounds: حدود الشكل المرسوم بس
      form.append("study_area_bounds", JSON.stringify(boundsToArray(capture.bounds)));
      // 🐛 FIX: geo_bounds كان بيتبعت بحدود الـ viewport الكامل (capture.viewportBounds)
      // رغم إن الصورة الفعلية اللي بتتبعت (rawSelectedBlob/smallBlob من useMapCanvas)
      // مقصوصة بالظبط على حدود الشكل المرسوم — نفس study_area_bounds بالظبط، مش
      // الـ viewport كله. ده كان بيخلي الباك إند يحسب موقع كل نخلة مكتشفة على أساس
      // إن كل بكسل بيمثل مساحة جغرافية أكبر بكتير من الحقيقة، فالنقط كانت بتتزحلق
      // برّه حدود البولجون بالظبط زي ما ظهر في الـ GeoJSON. geo_bounds لازم يساوي
      // حدود الصورة المرسلة فعليًا — يعني نفس study_area_bounds طول ما لسه بنبعت
      // الصورة المقصوصة (captureTarget === "small"، الافتراضي الوحيد المتاح حاليًا).
      form.append("geo_bounds", JSON.stringify(boundsToArray(capture.bounds)));

      // ── حقول إضافية بنبعتها كمان للسياق/الدقة — الباك إند غالبًا بيتجاهل
      // أي حقل مش عارفه، مفيش ضرر من إبقائها ────────────────────────────────
      form.append("dateFrom", dateFrom);
      form.append("dateTo", dateTo);
      form.append("bbox", JSON.stringify(bbox)); // [west, south, east, north]
      form.append("geometry", JSON.stringify(geometry)); // real Polygon/MultiPolygon matching the drawn shape
      form.append("shapeType", shapeKind); // "rectangle" | "polygon" | "circle" | "point" | "line"
      form.append("expression", expression.trim()); // the formula/condition to run on palm trees

      // 🔍 DEBUG — بنطبع كل حاجة بنبعتها بالظبط قبل الإرسال
      console.log("[Palm debug] ── Sending request ──");
      console.log("[Palm debug] URL:", PALM_BACKEND_URL);
      console.log("[Palm debug] image blob:", capture.blob.type, capture.blob.size, "bytes");
      console.log("[Palm debug] date_range:", `${dateFrom}/${dateTo}`);
      console.log("[Palm debug] study_area_bounds:", boundsToArray(capture.bounds));
      console.log("[Palm debug] geo_bounds:", boundsToArray(capture.bounds));
      console.log("[Palm debug] expression:", expression.trim());
      console.log("[Palm debug] accessToken present?:", !!accessToken);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      let res: Response;
      try {
        res = await fetch(PALM_BACKEND_URL, {
          method: "POST",
          headers: {
            // ⚠️ مفيش Content-Type هنا عمدًا — الـ browser بيحطها لوحده مع
            // الـ multipart boundary الصح لما تكون FormData.
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: form,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // 🔍 DEBUG — بنطبع كل حاجة راجعة من الباك إند زي ما هي، قبل أي معالجة
      console.log("[Palm debug] ── Response received ──");
      console.log("[Palm debug] HTTP status:", res.status, res.statusText);
      console.log("[Palm debug] headers:", Object.fromEntries(res.headers.entries()));
      const rawText = await res.clone().text().catch(() => "<failed to read body>");
      console.log("[Palm debug] raw body:", rawText);

      if (!res.ok) {
        throw new Error(`Backend returned ${res.status}. ${rawText.slice(0, 160)}`);
      }

      const data = await res.json().catch(() => null);
      console.log("[Palm debug] parsed data:", data);
      if (data && data.success === false) {
        throw new Error(data?.message ?? "Palm detection request failed.");
      }

      setResult(data);
      setStatus("success");
      onResult?.(data);
      // ✅ نمسح اللقطة بس لما ينجح الطلب — لو فشل، سيبنا الصورة زي ما هي عشان
      // "Run" تاني يعيد نفس المحاولة من غير ما يطلب رسم شكل جديد من الصفر
      onClearCapture?.();

      // ── الهيت ماب بتتولّد أوتوماتيك أول ما فيه geojson_url في الرد ────────
      const geojsonUrl: string | undefined = data?.data?.geojson_url;
      if (geojsonUrl) {
        setUserEditedRescale(false); // نتاج جديد → خليه يحسب المدى تلقائيًا الأول
        void generateForStyle(geojsonUrl, data?.data?.csv_url ?? null);
      }
    } catch (err) {
      setStatus("error");
      if (err instanceof DOMException && err.name === "AbortError") {
        setErrorMsg(
          `The server didn't respond within ${REQUEST_TIMEOUT_MS / 1000}s. It may be overloaded or asleep (webgiss.duckdns.org) — try again in a moment.`
        );
      } else {
        setErrorMsg(err instanceof Error ? err.message : "Failed to reach /gis/palm-detection.");
      }
    }
  };

  // ── لو المستخدم دوس "Run" وبعدين وصلت الصورة الملتقطة من الأب (بعد
  // onRequestCapture)، نكمل الطلب تلقائيًا من غير ما يحتاج يدوس تاني ────────
  useEffect(() => {
    if (status === "capturing" && pendingCapture?.blob) {
      void submitToBackend(pendingCapture);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCapture, status]);

  // ── يقفل dropdown الـ INDEX PRESET لو اليوزر دوس بره الصندوق ──────────────
  useEffect(() => {
    if (!presetMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [presetMenuOpen]);

  const runPalmAnalysis = () => {
    if (!canRun) return;
    if (pendingCapture?.blob) {
      // في صورة ملتقطة جاهزة أصلاً (مثلاً من محاولة سابقة) — نستخدمها على طول
      void submitToBackend(pendingCapture);
      return;
    }
    if (!onRequestCapture) {
      setStatus("error");
      setErrorMsg("Capture isn't wired up yet — the parent needs to pass onRequestCapture/pendingCapture.");
      return;
    }
    setStatus("capturing");
    setErrorMsg(null);
    onRequestCapture();
  };

  const cancelCapture = () => {
    setStatus("idle");
    onClearCapture?.();
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Palm Trees Analysis</p>
        <p className="text-xs text-slate-300">Detect and analyze palm trees inside the selected shape on the map</p>
      </div>

      {/* Date range */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <p className="mb-1.5 text-[0.62rem] uppercase tracking-wider text-slate-500">Date range</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[0.58rem] text-slate-500">From</p>
            <input
              type="date"
              lang="en-GB"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
            />
          </div>
          <div>
            <p className="mb-1 text-[0.58rem] text-slate-500">To</p>
            <input
              type="date"
              lang="en-GB"
              value={dateTo}
              min={dateFrom}
              max={todayStr}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
            />
          </div>
        </div>
      </div>

      {/* Detected shape + bbox — updates automatically with any drawing tool (Rectangle/Polygon/Circle/Point) */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Selected shape</p>
          <span
            className={`rounded px-1.5 py-0.5 text-[0.6rem] font-bold ${
              hasShape ? "bg-cyan-400/15 text-cyan-300" : "bg-white/[0.05] text-slate-500"
            }`}
          >
            {SHAPE_LABELS[shapeKind]}
          </span>
        </div>
        <p className="text-[0.6rem] leading-snug text-slate-400 break-words font-mono">
          {formatBBox(bbox)}
        </p>
      </div>

      {/* Expression box */}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2">
        {/* Index preset — زي INDEX PRESET بتاع Raster Calc بالظبط: دوس على
            preset فيتحط formula بتاعه في الـ textarea تحت على طول. لسه تقدري
            تعدّلي النص يدوي بعد كده — مفيش أي قفل عليه */}
        <div>
          <p className="mb-1.5 text-[0.62rem] uppercase tracking-wider text-slate-500">Index preset</p>
          <div className="relative" ref={presetMenuRef}>
            <button
              type="button"
              onClick={() => setPresetMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#020817]/70 px-3 py-2 text-left outline-none focus:border-cyan-400/40 hover:border-cyan-400/25"
            >
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full"
                style={{
                  background: indexPresetKey
                    ? INDEX_PRESETS.find((p) => p.key === indexPresetKey)?.dot
                    : "linear-gradient(135deg,#334155,#1e293b)",
                }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-bold text-slate-100">
                  {indexPresetKey ? INDEX_PRESETS.find((p) => p.key === indexPresetKey)?.label : "Choose an index…"}
                </span>
                <span className="block truncate text-[0.6rem] text-slate-500">
                  {indexPresetKey
                    ? INDEX_PRESETS.find((p) => p.key === indexPresetKey)?.desc
                    : "Tap a preset to fill the formula below"}
                </span>
              </span>
              <svg
                className={`h-3 w-3 shrink-0 text-slate-500 transition-transform ${presetMenuOpen ? "rotate-180" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              >
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {presetMenuOpen && (
              // ⚠️ (2026-08-25) الليستة كانت "overflow-hidden" وبتاخد ارتفاع القايمة
              // كلها — كان شغال لما كان فيه 7 presets بس، لكن بعد ما اتوسّعت
              // لـ 49 index هتطلع بره الشاشة. نفس فكرة max-h + overflow-y-auto
              // اللي مستخدمة في scenes list جوه SatelliteDataPanel.tsx.
              <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto custom-scroll rounded-lg border border-white/10 bg-[#0d1b2e] shadow-xl">
                {INDEX_PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setIndexPresetKey(p.key);
                      setExpression(p.formula);
                      setPresetMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors cursor-pointer ${
                      indexPresetKey === p.key ? "bg-cyan-400/[0.12] text-cyan-300" : "text-slate-300 hover:bg-white/[0.06]"
                    }`}
                  >
                    <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: p.dot }} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-bold">{p.label}</span>
                      <span className="block text-[0.58rem] text-slate-500">{p.desc}</span>
                    </span>
                    {indexPresetKey === p.key && (
                      <svg className="h-3.5 w-3.5 shrink-0 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Formula / condition</p>
        <textarea
          value={expression}
          onChange={(e) => {
            setExpression(e.target.value);
            // لو اليوزر عدّل النص يدوي بحيث بقى مختلف عن الـ preset المختار،
            // نشيل التحديد عشان الـ dropdown ميفضلش شكله "متزامن" غلط
            const active = indexPresetKey ? INDEX_PRESETS.find((p) => p.key === indexPresetKey) : null;
            if (active && e.target.value !== active.formula) setIndexPresetKey(null);
          }}
          rows={3}
          placeholder="e.g. NDVI > 0.35 AND height > 3"
          className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#020817]/80 px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-400/40"
        />
        <p className="text-[0.58rem] text-slate-500">
          This formula is sent as-is to the backend, which applies it to the palm imagery (same idea as Raster Calc).
        </p>
      </div>

      {/* Capturing state — makes it explicit that the map is waiting for a
          drawn shape, instead of silently disabling the button with no
          feedback (which looked like it was "stuck running forever") ────── */}
      {status === "capturing" && (
        <div className="flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.06] px-3 py-2.5 text-[0.65rem] text-cyan-200">
          <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
          </svg>
          <span className="flex-1">
            Draw a shape on the map (Rectangle / Polygon / Circle / Marker) to capture it — the request will run automatically once it's drawn.
          </span>
          <button type="button" onClick={cancelCapture} className="shrink-0 underline text-cyan-300 hover:text-cyan-100">
            Cancel
          </button>
        </div>
      )}

      {/* Run button */}
      <button
        type="button"
        onClick={runPalmAnalysis}
        disabled={!canRun}
        className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "loading"
          ? `Running… ${loadingSeconds}s`
          : status === "capturing"
          ? "Waiting for shape…"
          : status === "error" && pendingCapture?.blob
          ? "Retry with same shape"
          : "Run Palm Analysis"}
      </button>

      {status === "error" && pendingCapture?.blob && (
        <button
          type="button"
          onClick={() => { onClearCapture?.(); setStatus("idle"); }}
          className="w-full text-[0.6rem] text-slate-400 hover:text-slate-200 underline"
        >
          Or draw a different shape instead
        </button>
      )}

      {status === "loading" && loadingSeconds >= 12 && (
        <p className="text-[0.6rem] text-slate-500 text-center">
          Palm detection on satellite imagery can take a while — still working, will time out automatically after {REQUEST_TIMEOUT_MS / 1000}s if the server doesn't respond.
        </p>
      )}

      {status === "error" && errorMsg && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[0.65rem] text-red-300">
          {errorMsg}
        </div>
      )}

      {status === "success" && (
        <div className="space-y-2.5 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-300 shrink-0">
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <p className="text-[0.68rem] font-bold text-emerald-200">Palm detection completed</p>
          </div>

          {typeof result?.data?.total_palms === "number" && (
            <p className="text-[1.15rem] font-bold text-white leading-tight">
              {result.data.total_palms.toLocaleString()}
              <span className="ml-1.5 text-[0.62rem] font-medium text-emerald-300/80 align-middle">palm trees detected</span>
            </p>
          )}

          {(result?.data?.geojson_url || result?.data?.csv_url) && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {result?.data?.geojson_url && (
                <a
                  href={result.data.geojson_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.62rem] px-2.5 py-1.5 rounded-md bg-emerald-400/10 text-emerald-200 border border-emerald-400/25 hover:bg-emerald-400/20 transition-colors"
                >
                  Download GeoJSON
                </a>
              )}
              {result?.data?.csv_url && (
                <a
                  href={result.data.csv_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.62rem] px-2.5 py-1.5 rounded-md bg-emerald-400/10 text-emerald-200 border border-emerald-400/25 hover:bg-emerald-400/20 transition-colors"
                >
                  Download CSV
                </a>
              )}
            </div>
          )}

          {result?.data?.geojson_url && (
            <div className="space-y-2.5 rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
              <div className="flex items-center justify-between">
                <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">
                  {DISPLAY_MODE_OPTIONS.find((o) => o.key === displayMode)?.label ?? "Density Heatmap"}
                  {heatmapMode === "value" ? ` · ${valueField}` : ""}
                </p>
                {activeStatus === "loading" && (
                  <span className="flex items-center gap-1.5 text-[0.6rem] text-cyan-300">
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
                    </svg>
                    Rendering…
                  </span>
                )}
              </div>

              {/* الدروب داون الموحّد: Density/Value × Points/Heatmap — الأربع
                  اختيارات كلهم في مكان واحد. اختيارين قدامى (Density·Heatmap
                  وValue·Heatmap، زي ما كانوا بالظبط بالراستر القديم) واختيارين
                  جداد (Density·Points وValue·Points). التبديل بيولّد النتيجة
                  فورًا بالشكل المطلوب (راستر أو نقط) من غير ما يشيل أي حاجة
                  قديمة — الراستر لسه شغال زي ما هو تمامًا لو اخترتي heatmap. */}
              <div className="flex items-center gap-2">
                <span className="text-[0.58rem] uppercase tracking-wider text-slate-500 shrink-0">Display</span>
                <select
                  value={displayMode}
                  onChange={(e) => {
                    const next = e.target.value as DisplayMode;
                    if (next === displayMode) return;
                    const { mode: nextMode, style: nextStyle } = splitDisplayMode(next);
                    setHeatmapMode(nextMode);
                    setRenderStyle(nextStyle);
                    setUserEditedRescale(false);
                    const gj = result?.data?.geojson_url;
                    if (gj) {
                      void generateForStyle(gj, result?.data?.csv_url ?? null, {
                        mode: nextMode,
                        style: nextStyle,
                      });
                    }
                  }}
                  className="flex-1 rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2 py-1.5 text-[0.65rem] text-slate-200 outline-none focus:border-cyan-400/40"
                >
                  {DISPLAY_MODE_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* اختيار العمود — يظهر بس في وضع Value (Points أو Heatmap
                  مفيش فرق هنا). القايمة نفسها أعمدة CSV/Excel الرقمية بالحرف
                  الواحد (NDVI Value/NDMI Value/...) */}
              {heatmapMode === "value" && (
                <div className="flex items-center gap-2">
                  <span className="text-[0.58rem] uppercase tracking-wider text-slate-500 shrink-0">Column</span>
                  <select
                    value={valueField}
                    onChange={(e) => {
                      setValueField(e.target.value);
                      setUserEditedRescale(false);
                      const gj = result?.data?.geojson_url;
                      if (gj) void generateForStyle(gj, result?.data?.csv_url ?? null, { mode: "value", valueField: e.target.value });
                    }}
                    className="flex-1 rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2 py-1.5 text-[0.65rem] text-slate-200 outline-none focus:border-cyan-400/40"
                  >
                    {VALUE_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Colormap swatches — نفس الـ 8 ألوان بالظبط من raster-calc.
                  🐛 FIX: كانت بس بتعمل setColormap (تلوّن نفسها + شريط الـ
                  legend تحت) من غير ما تعيد توليد صورة الهيت ماب الفعلية على
                  الخريطة — فكانت عمليًا "زراير ديزاين" بلا أي تأثير حقيقي على
                  الهيت ماب المعروض. دلوقتي كل ضغطة بتولّد الهيت ماب فورًا
                  باللون الجديد (لو فيه نتيجة كشف جاهزة أصلًا). */}
              <div className="grid grid-cols-4 gap-1.5">
                {COLOR_RAMPS.map((ramp) => (
                  <button
                    key={ramp.key}
                    type="button"
                    onClick={() => {
                      if (colormap === ramp.key) return;
                      setColormap(ramp.key);
                      const gj = result?.data?.geojson_url;
                      if (gj) void generateForStyle(gj, result?.data?.csv_url ?? null, { colormap: ramp.key });
                    }}
                    disabled={activeStatus === "loading"}
                    title={ramp.label}
                    className={`group rounded-md border p-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      colormap === ramp.key ? "border-cyan-400/45 bg-cyan-400/[0.08]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16]"
                    }`}
                  >
                    <span className="block h-5 rounded" style={{ background: ramp.gradient }} />
                    <span className={`mt-1 block text-[0.55rem] ${colormap === ramp.key ? "text-cyan-300" : "text-slate-500 group-hover:text-slate-300"}`}>
                      {ramp.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Rescale min/max — نفس فكرة raster-calc: بيتحسبوا تلقائيًا
                  من أعلى كثافة فعلية، لحد ما اليوزر يعدّلهم بإيده */}
              <div className="flex items-center gap-2">
                <span className="text-[0.58rem] uppercase tracking-wider text-slate-500 shrink-0">Rescale</span>
                <input
                  type="number" step="0.05" value={rescaleMin}
                  onChange={(e) => { setUserEditedRescale(true); setRescaleMin(Number(e.target.value)); }}
                  className="w-16 rounded border border-white/10 bg-[#020817]/70 px-1.5 py-1 text-[0.65rem] text-slate-200 outline-none focus:border-cyan-400/40"
                />
                <span className="text-slate-600">→</span>
                <input
                  type="number" step="0.05" value={rescaleMax}
                  onChange={(e) => { setUserEditedRescale(true); setRescaleMax(Number(e.target.value)); }}
                  className="w-16 rounded border border-white/10 bg-[#020817]/70 px-1.5 py-1 text-[0.65rem] text-slate-200 outline-none focus:border-cyan-400/40"
                />
                <button
                  type="button"
                  onClick={() =>
                    result?.data?.geojson_url &&
                    void generateForStyle(result.data.geojson_url, result?.data?.csv_url ?? null)
                  }
                  disabled={activeStatus === "loading"}
                  className="ml-auto rounded-md bg-cyan-400/15 px-2.5 py-1 text-[0.6rem] font-semibold text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/25 disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>

              {/* Opacity slider */}
              <div className="flex items-center gap-2">
                <span className="text-[0.58rem] uppercase tracking-wider text-slate-500 shrink-0">Opacity</span>
                <input
                  type="range" min={0} max={100} value={opacity}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setOpacity(v);
                    if (renderStyle === "points") {
                      if (pointsData) {
                        onPreviewPoints?.({
                          name:
                            heatmapMode === "value"
                              ? `Palm ${valueField} (points) · ${dateFrom}→${dateTo}`
                              : `Palm density (points) · ${dateFrom}→${dateTo}`,
                          indexKey: heatmapMode === "value" ? `PALM_VALUE_POINTS_${valueField}` : "PALM_DENSITY_POINTS",
                          date: dateFrom,
                          points: pointsData,
                          opacity: v / 100,
                        });
                      }
                    } else if (heatmapDataUrl && heatmapBounds) {
                      const [[rs, rw], [rn, re]] = heatmapBounds;
                      onPreview?.({
                        name:
                          heatmapMode === "value"
                            ? `Palm ${valueField} · ${dateFrom}→${dateTo}`
                            : `Palm density · ${dateFrom}→${dateTo}`,
                        indexKey: heatmapMode === "value" ? `PALM_VALUE_${valueField}` : "PALM_DENSITY",
                        date: dateFrom,
                        dataUrl: heatmapDataUrl,
                        bounds: heatmapBounds,
                        opacity: v / 100,
                        colorRamp: colormap,
                        coords: { lat: (rs + rn) / 2, lng: (rw + re) / 2 },
                      });
                    }
                  }}
                  className="flex-1 accent-cyan-400"
                />
                <span className="w-8 text-right text-[0.6rem] text-slate-400">{opacity}%</span>
              </div>

              {/* Legend gradient bar — نفس شكل الـ legend بتاع raster-calc */}
              <div>
                <div className="flex items-center justify-between text-[0.55rem] text-slate-500 mb-1">
                  <span>{rescaleMin.toFixed(2)}{heatmapMode === "density" ? " (sparse)" : ""}</span>
                  <span>{heatmapMode === "density" ? "(dense) " : ""}{rescaleMax.toFixed(2)}</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: activeColorRamp.gradient }} />
              </div>

              {renderStyle === "heatmap" && heatmapStatus === "success" && heatmapStats && (
                <p className="text-[0.58rem] text-slate-500">
                  {heatmapMode === "value"
                    ? `${heatmapStats.validPixels.toLocaleString()} rendered cells · mean ${valueField} ${heatmapStats.mean.toFixed(3)}`
                    : `${heatmapStats.validPixels.toLocaleString()} rendered cells · mean density ${heatmapStats.mean.toFixed(3)}`}
                </p>
              )}

              {renderStyle === "points" && pointsStatus === "success" && pointsData && (
                <p className="text-[0.58rem] text-slate-500">
                  {(() => {
                    const values = pointsData.map((p) => p.value).filter((v) => Number.isFinite(v));
                    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
                    return heatmapMode === "value"
                      ? `${pointsData.length.toLocaleString()} palms plotted · mean ${valueField} ${mean.toFixed(3)}`
                      : `${pointsData.length.toLocaleString()} palms plotted · mean local density ${mean.toFixed(3)}`;
                  })()}
                </p>
              )}

              {activeStatus === "error" && activeError && (
                <div className="rounded-md border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 text-[0.6rem] text-red-300">
                  {activeError}
                </div>
              )}

              {renderStyle === "heatmap" && heatmapDataUrl && !onPreview && (
                // ⚠️ لو الأب لسه معملش wiring لـ onPreview (زي raster-calc's
                // MapClient integration)، نعرض الصورة هنا كـ fallback بسيط
                // عشان يبان فيه heatmap اتولّد فعلًا حتى قبل ما يتوصل بالخريطة
                <img src={heatmapDataUrl} alt="Palm density heatmap" className="w-full rounded-md border border-white/10" />
              )}

              {renderStyle === "points" && pointsData && !onPreviewPoints && (
                // ⚠️ نفس فكرة fallback الراستر بالظبط، بس هنا SVG بسيط بيرسم كل
                // نخلة كنقطة بلونها — لحد ما الأب يعمل wiring لـ onPreviewPoints
                // (يرسمهم كـ Leaflet CircleMarkers على الخريطة الحقيقية)
                <svg
                  viewBox="0 0 200 150"
                  className="w-full rounded-md border border-white/10 bg-[#020817]"
                >
                  {pointsData.map((p, i) => {
                    const [w, s, e, n] = bbox;
                    const x = e > w ? ((p.lng - w) / (e - w)) * 200 : 100;
                    const y = n > s ? ((n - p.lat) / (n - s)) * 150 : 75;
                    return <circle key={i} cx={x} cy={y} r={1.6} fill={p.color} opacity={opacity / 100} />;
                  })}
                </svg>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setStatus("idle");
              setResult(null);
              setHeatmapStatus("idle");
              setHeatmapDataUrl(null);
              setHeatmapBounds(null);
              setHeatmapStats(null);
              setHeatmapMode("density");
              setRenderStyle("heatmap");
              setPointsStatus("idle");
              setPointsError(null);
              setPointsData(null);
              setUserEditedRescale(false);
            }}
            className="text-[0.6rem] text-slate-400 hover:text-slate-200 underline"
          >
            Run another analysis
          </button>
        </div>
      )}
    </div>
  );
}