// "use client";

// // ─── PlanetaryRasterPanel.tsx ───────────────────────────────────────────────
// // Raster Calculator مبني على Planetary Computer Data API (titiler).
// //
// // الفكرة: مفيش حسابات في الفرونت خالص. اليوزر بيكتب expression زي:
// //   (B08 - B04) / (B08 + B04)        ← NDVI
// //   (B03 - B08) / (B03 + B08)        ← NDWI
// // إحنا بنبعتها كـ query param اسمها `expression` لـ:
// //   /api/data/v1/item/preview.png?collection=...&item=...&expression=...&rescale=...&colormap_name=...
// // السيرفر (Planetary Computer) هو اللي بيجيب الباندات، يطبق المعادلة،
// // ويرجع صورة PNG جاهزة. إحنا بس بنعرضها كـ image overlay على الخريطة.

// import { useEffect, useMemo, useState } from "react";

// // ─── Sentinel-2 L2A band reference (so the user writes valid expressions) ──
// const SENTINEL2_BANDS: { id: string; label: string; gsd: string; desc: string }[] = [
//   { id: "B01", label: "Coastal aerosol", gsd: "60m", desc: "Coastal / aerosol" },
//   { id: "B02", label: "Blue",            gsd: "10m", desc: "Visible blue" },
//   { id: "B03", label: "Green",           gsd: "10m", desc: "Visible green" },
//   { id: "B04", label: "Red",             gsd: "10m", desc: "Visible red" },
//   { id: "B05", label: "Red Edge 1",      gsd: "20m", desc: "Vegetation red edge" },
//   { id: "B06", label: "Red Edge 2",      gsd: "20m", desc: "Vegetation red edge" },
//   { id: "B07", label: "Red Edge 3",      gsd: "20m", desc: "Vegetation red edge" },
//   { id: "B08", label: "NIR",             gsd: "10m", desc: "Near-infrared" },
//   { id: "B8A", label: "NIR Narrow",      gsd: "20m", desc: "Narrow near-infrared" },
//   { id: "B09", label: "Water Vapour",    gsd: "60m", desc: "Water vapour" },
//   { id: "B11", label: "SWIR 1",          gsd: "20m", desc: "Short-wave infrared" },
//   { id: "B12", label: "SWIR 2",          gsd: "20m", desc: "Short-wave infrared" },
// ];

// // ─── Quick-pick presets (still just plain expressions, nothing computed locally) ──
// const EXPRESSION_PRESETS: { key: string; label: string; expression: string; colormap: string; rescale: [number, number]; desc: string }[] = [
//   { key: "NDVI", label: "NDVI",  expression: "(B08-B04)/(B08+B04)",         colormap: "rdylgn", rescale: [-1, 1], desc: "Vegetation vigor" },
//   { key: "NDWI", label: "NDWI",  expression: "(B03-B08)/(B03+B08)",         colormap: "rdbu",   rescale: [-1, 1], desc: "Water content" },
//   { key: "NDMI", label: "NDMI",  expression: "(B8A-B11)/(B8A+B11)",         colormap: "bugn_r", rescale: [-1, 1], desc: "Moisture / drought stress" },
//   { key: "NDBI", label: "NDBI",  expression: "(B11-B08)/(B11+B08)",         colormap: "magma",  rescale: [-1, 1], desc: "Built-up / urban areas" },
//   { key: "SAVI", label: "SAVI",  expression: "1.5*(B08-B04)/(B08+B04+0.5)", colormap: "rdylgn", rescale: [-1, 1], desc: "Soil-adjusted vegetation" },
//   { key: "EVI",  label: "EVI",   expression: "2.5*(B08-B04)/(B08+6*B04-7.5*B02+1)", colormap: "greens", rescale: [-1, 2], desc: "Enhanced vegetation" },
// ];

// const COLORMAPS = ["rdylgn", "rdbu", "bugn_r", "magma", "greens", "viridis", "spectral", "rdylbu_r"];

// const PC_STAC_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/search";
// const PC_DATA_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item/preview.png";

// type SceneOption = {
//   id: string;
//   collection: string;
//   date: string;
//   cloud: number;
//   bbox: [number, number, number, number];
// };

// // Matches the RasterPreviewConfig type already used by onRasterPreview
// // (see AnalysisSidebar.tsx / MapClient.tsx) so this panel is a drop-in
// // alternative to the existing RasterCalculatorPanel — same callback shape.
// type RasterPreviewConfig = {
//   name: string;
//   indexKey: string;
//   expression: string;
//   date: string;
//   coords: { lat: number; lng: number };
//   bounds: [[number, number], [number, number]]; // [[south, west],[north, east]]
//   opacity: number;
//   colorRamp: string;
//   dataUrl: string;
// };

// type Props = {
//   selectedFeature?: GeoJSON.Feature | null;
//   /** called with the resulting PNG + geographic bounds so MapClient/LeafletMap can overlay it */
//   onPreview?: (config: RasterPreviewConfig) => void;
// };

// function getMidCoords(feature?: GeoJSON.Feature | null): [number, number] | null {
//   const g = feature?.geometry as any;
//   if (!g?.coordinates) return null;
//   try {
//     if (g.type === "Point") return [g.coordinates[1], g.coordinates[0]];
//     if (g.type === "Polygon") {
//       const ring = g.coordinates[0];
//       const mid = ring[Math.floor(ring.length / 2)];
//       return [mid[1], mid[0]];
//     }
//     if (g.type === "MultiPolygon") {
//       const ring = g.coordinates[0][0];
//       const mid = ring[Math.floor(ring.length / 2)];
//       return [mid[1], mid[0]];
//     }
//   } catch {}
//   return null;
// }

// function getFeatureBBox(feature?: GeoJSON.Feature | null, fallback?: { lat: number; lng: number }): [number, number, number, number] {
//   const coords: number[][] = [];
//   const walk = (v: any) => {
//     if (!Array.isArray(v)) return;
//     if (typeof v[0] === "number" && typeof v[1] === "number") { coords.push(v); return; }
//     v.forEach(walk);
//   };
//   walk((feature?.geometry as any)?.coordinates);

//   if (coords.length) {
//     const lngs = coords.map((c) => c[0]);
//     const lats = coords.map((c) => c[1]);
//     const west = Math.min(...lngs), east = Math.max(...lngs);
//     const south = Math.min(...lats), north = Math.max(...lats);
//     const pad = Math.max(0.0008, Math.max(east - west, north - south) * 0.12);
//     return [west - pad, south - pad, east + pad, north + pad];
//   }

//   const lat = fallback?.lat ?? 30.0444;
//   const lng = fallback?.lng ?? 31.2357;
//   return [lng - 0.03, lat - 0.03, lng + 0.03, lat + 0.03];
// }

// // quick syntax check: only known band tokens + numbers/operators allowed
// function validateExpression(expr: string): { ok: boolean; usedBands: string[]; unknownTokens: string[] } {
//   const tokens = expr.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [];
//   const known = new Set(SENTINEL2_BANDS.map((b) => b.id));
//   const usedBands = Array.from(new Set(tokens.filter((t) => known.has(t.toUpperCase())).map((t) => t.toUpperCase())));
//   const unknownTokens = Array.from(new Set(tokens.filter((t) => !known.has(t.toUpperCase()))));
//   const bracketsOk = (expr.match(/\(/g) ?? []).length === (expr.match(/\)/g) ?? []).length;
//   return { ok: usedBands.length > 0 && unknownTokens.length === 0 && bracketsOk, usedBands, unknownTokens };
// }

// export default function PlanetaryRasterPanel({ selectedFeature, onPreview }: Props) {
//   const coords = getMidCoords(selectedFeature);
//   const fallbackCoords = coords ? { lat: coords[0], lng: coords[1] } : undefined;

//   const [expression, setExpression] = useState(EXPRESSION_PRESETS[0].expression);
//   const [activePreset, setActivePreset] = useState<string>("NDVI");
//   const [colormap, setColormap] = useState(EXPRESSION_PRESETS[0].colormap);
//   const [rescaleMin, setRescaleMin] = useState(EXPRESSION_PRESETS[0].rescale[0]);
//   const [rescaleMax, setRescaleMax] = useState(EXPRESSION_PRESETS[0].rescale[1]);
//   const [opacity, setOpacity] = useState(85);
//   const [cloudCover, setCloudCover] = useState(20);
//   const [dateFrom, setDateFrom] = useState("2026-04-01");
//   const [dateTo, setDateTo] = useState("2026-05-31");
//   const [showBandRef, setShowBandRef] = useState(true);

//   const [scenes, setScenes] = useState<SceneOption[]>([]);
//   const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
//   const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
//   const [sceneError, setSceneError] = useState<string | null>(null);

//   const [previewStatus, setPreviewStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
//   const [previewError, setPreviewError] = useState<string | null>(null);
//   const [previewImg, setPreviewImg] = useState<string | null>(null);

//   const bbox = useMemo(() => getFeatureBBox(selectedFeature, fallbackCoords), [selectedFeature, fallbackCoords?.lat, fallbackCoords?.lng]);
//   const validation = useMemo(() => validateExpression(expression), [expression]);
//   const selectedScene = scenes.find((s) => s.id === selectedSceneId) ?? null;

//   // search for matching scenes whenever AOI / dates / cloud filter change
//   useEffect(() => {
//     let cancelled = false;
//     const run = async () => {
//       setSceneStatus("loading");
//       setSceneError(null);
//       try {
//         const res = await fetch(PC_STAC_URL, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             collections: ["sentinel-2-l2a"],
//             bbox,
//             datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
//             query: { "eo:cloud_cover": { lt: cloudCover } },
//             limit: 8,
//           }),
//         });
//         if (!res.ok) throw new Error(`STAC search failed (${res.status})`);
//         const payload = await res.json();
//         const features = Array.isArray(payload?.features) ? payload.features : [];
//         const next: SceneOption[] = features
//           .map((f: any) => ({
//             id: String(f.id),
//             collection: "sentinel-2-l2a",
//             date: String(f.properties?.datetime ?? "").slice(0, 10),
//             cloud: Math.round(Number(f.properties?.["eo:cloud_cover"] ?? 0)),
//             bbox: f.bbox ?? bbox,
//           }))
//           .sort((a: SceneOption, b: SceneOption) => a.cloud - b.cloud);

//         if (cancelled) return;
//         setScenes(next);
//         setSelectedSceneId(next[0]?.id ?? null);
//         setSceneStatus("success");
//         if (!next.length) setSceneError("No Sentinel-2 scenes found for this AOI/date/cloud filter.");
//       } catch (err) {
//         if (cancelled) return;
//         setScenes([]);
//         setSelectedSceneId(null);
//         setSceneStatus("error");
//         setSceneError(err instanceof Error ? err.message : "Scene search failed.");
//       }
//     };
//     run();
//     return () => { cancelled = true; };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [bbox.join(","), dateFrom, dateTo, cloudCover]);

//   const applyPreset = (presetKey: string) => {
//     const preset = EXPRESSION_PRESETS.find((p) => p.key === presetKey);
//     if (!preset) return;
//     setActivePreset(presetKey);
//     setExpression(preset.expression);
//     setColormap(preset.colormap);
//     setRescaleMin(preset.rescale[0]);
//     setRescaleMax(preset.rescale[1]);
//   };

//   const insertBand = (bandId: string) => {
//     setActivePreset("");
//     setExpression((prev) => (prev ? `${prev}${bandId}` : bandId));
//   };

//   const runPreview = async () => {
//     if (!selectedScene || !validation.ok) return;
//     setPreviewStatus("loading");
//     setPreviewError(null);

//     try {
//       const params = new URLSearchParams({
//         collection: selectedScene.collection,
//         item: selectedScene.id,
//         expression,
//         asset_as_band: "true",
//         rescale: `${rescaleMin},${rescaleMax}`,
//         colormap_name: colormap,
//         format: "png",
//       });
//       const url = `${PC_DATA_URL}?${params.toString()}`;

//       const res = await fetch(url);
//       if (!res.ok) {
//         const text = await res.text().catch(() => "");
//         throw new Error(`Planetary Computer render failed (${res.status}). ${text.slice(0, 160)}`);
//       }
//       const blob = await res.blob();
//       const dataUrl: string = await new Promise((resolve, reject) => {
//         const reader = new FileReader();
//         reader.onload = () => resolve(String(reader.result));
//         reader.onerror = () => reject(new Error("Could not read image data"));
//         reader.readAsDataURL(blob);
//       });

//       setPreviewImg(dataUrl);
//       setPreviewStatus("success");

//       const [west, south, east, north] = selectedScene.bbox ?? bbox;
//       onPreview?.({
//         name: `${activePreset || "Expression"} · ${selectedScene.id}`,
//         indexKey: activePreset || "CUSTOM",
//         expression,
//         date: selectedScene.date,
//         dataUrl,
//         bounds: [[south, west], [north, east]],
//         opacity: opacity / 100,
//         colorRamp: colormap,
//         coords: fallbackCoords ?? { lat: (south + north) / 2, lng: (west + east) / 2 },
//       });
//     } catch (err) {
//       setPreviewStatus("error");
//       setPreviewError(err instanceof Error ? err.message : "Render request failed.");
//     }
//   };

//   return (
//     <div className="space-y-4">
//       {/* Header */}
//       <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3">
//         <div className="flex items-start justify-between gap-3">
//           <div>
//             <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Raster Calculator · Planetary Computer</p>
//             <p className="mt-1 text-xs leading-relaxed text-slate-300">
//               Write a band expression — the server fetches the bands, computes it, and returns a ready PNG.
//             </p>
//           </div>
//           <span className="shrink-0 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[0.56rem] font-bold text-cyan-300">
//             SERVER-SIDE
//           </span>
//         </div>
//       </div>

//       {/* AOI info */}
//       <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
//         <div className="flex items-center justify-between gap-3">
//           <div className="min-w-0">
//             <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Area of interest</p>
//             <p className="mt-1 text-[0.65rem] text-slate-400">
//               {coords ? `Center ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}` : "No shape selected — using current map view"}
//             </p>
//             <p className="mt-1 font-mono text-[0.55rem] text-slate-600">
//               BBOX {bbox.map((v) => v.toFixed(4)).join(", ")}
//             </p>
//           </div>
//           <span className={`shrink-0 rounded-full px-2 py-1 text-[0.55rem] font-semibold ${
//             coords ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300" : "border border-amber-400/20 bg-amber-400/10 text-amber-300"
//           }`}>
//             {coords ? "AOI" : "MAP"}
//           </span>
//         </div>
//       </div>

//       {/* Date + cloud filter */}
//       <div className="grid grid-cols-2 gap-2">
//         <label className="space-y-1">
//           <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">From</span>
//           <input type="date" value={dateFrom} max={dateTo} onChange={(e) => setDateFrom(e.target.value)}
//             className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
//         </label>
//         <label className="space-y-1">
//           <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">To</span>
//           <input type="date" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)}
//             className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
//         </label>
//       </div>

//       <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
//         <div className="flex items-center justify-between">
//           <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Max cloud cover</span>
//           <span className="text-xs font-semibold text-cyan-300">{cloudCover}%</span>
//         </div>
//         <input type="range" min={0} max={80} value={cloudCover} onChange={(e) => setCloudCover(Number(e.target.value))} className="w-full accent-cyan-400" />
//       </div>

//       {/* Scene picker */}
//       <div className="space-y-2">
//         <div className="flex items-center justify-between">
//           <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Scene</p>
//           <span className="text-[0.58rem] text-slate-500">
//             {sceneStatus === "loading" ? "searching…" : `${scenes.length} found`}
//           </span>
//         </div>
//         {sceneError && (
//           <div className="rounded-lg border border-amber-400/18 bg-amber-400/[0.05] px-3 py-2 text-[0.62rem] text-amber-200">
//             {sceneError}
//           </div>
//         )}
//         {scenes.length > 0 && (
//           <select
//             value={selectedSceneId ?? ""}
//             onChange={(e) => setSelectedSceneId(e.target.value)}
//             className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/80 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
//           >
//             {scenes.map((s) => (
//               <option key={s.id} value={s.id}>
//                 {s.date} · cloud {s.cloud}% · {s.id}
//               </option>
//             ))}
//           </select>
//         )}
//       </div>

//       {/* Band reference */}
//       <div className="rounded-lg border border-white/[0.07] bg-white/[0.025]">
//         <button
//           type="button"
//           onClick={() => setShowBandRef((p) => !p)}
//           className="flex w-full items-center justify-between px-3 py-2.5 text-left cursor-pointer"
//         >
//           <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Sentinel-2 band reference</span>
//           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
//             className={`text-slate-500 transition-transform ${showBandRef ? "rotate-180" : ""}`}>
//             <polyline points="6 9 12 15 18 9" />
//           </svg>
//         </button>
//         {showBandRef && (
//           <div className="grid grid-cols-2 gap-1.5 px-3 pb-3">
//             {SENTINEL2_BANDS.map((band) => (
//               <button
//                 key={band.id}
//                 type="button"
//                 onClick={() => insertBand(band.id)}
//                 title={`Insert ${band.id} into expression`}
//                 className="flex items-center justify-between gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5 text-left transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] cursor-pointer"
//               >
//                 <span>
//                   <span className="block font-mono text-[0.65rem] font-bold text-cyan-300">{band.id}</span>
//                   <span className="block text-[0.55rem] text-slate-500">{band.label}</span>
//                 </span>
//                 <span className="shrink-0 text-[0.5rem] text-slate-600">{band.gsd}</span>
//               </button>
//             ))}
//           </div>
//         )}
//       </div>

//       {/* Presets */}
//       <div className="space-y-2">
//         <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Index presets</p>
//         <div className="grid grid-cols-2 gap-1.5">
//           {EXPRESSION_PRESETS.map((preset) => (
//             <button
//               key={preset.key}
//               type="button"
//               onClick={() => applyPreset(preset.key)}
//               className={`rounded-lg border p-2.5 text-left transition-all cursor-pointer ${
//                 activePreset === preset.key ? "border-cyan-400/40 bg-cyan-400/[0.08]" : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]"
//               }`}
//             >
//               <p className={`text-[0.68rem] font-bold ${activePreset === preset.key ? "text-cyan-400" : "text-slate-300"}`}>{preset.label}</p>
//               <p className="mt-0.5 text-[0.55rem] text-slate-500 leading-tight">{preset.desc}</p>
//             </button>
//           ))}
//         </div>
//       </div>

//       {/* Expression input */}
//       <div className="space-y-1.5">
//         <div className="flex items-center justify-between">
//           <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Expression</span>
//           <span className={`text-[0.58rem] font-medium ${validation.ok ? "text-emerald-400" : "text-amber-400"}`}>
//             {validation.ok ? `${validation.usedBands.length} band${validation.usedBands.length === 1 ? "" : "s"} used` : "incomplete"}
//           </span>
//         </div>
//         <textarea
//           value={expression}
//           onChange={(e) => { setExpression(e.target.value); setActivePreset(""); }}
//           rows={3}
//           spellCheck={false}
//           placeholder="e.g. (B08-B04)/(B08+B04)"
//           className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#020817]/80 px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-400/40"
//         />
//         {validation.unknownTokens.length > 0 && (
//           <p className="text-[0.58rem] text-amber-300">
//             Unknown token{validation.unknownTokens.length > 1 ? "s" : ""}: {validation.unknownTokens.join(", ")} — use band IDs like B08, B04.
//           </p>
//         )}
//         <p className="text-[0.55rem] text-slate-600">
//           Sent as-is to Planetary Computer's <code className="text-slate-500">expression</code> parameter. Nothing is calculated locally.
//         </p>
//       </div>

//       {/* Colormap + rescale */}
//       <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-3">
//         <div>
//           <p className="mb-2 text-[0.62rem] uppercase tracking-wider text-slate-500">Colormap</p>
//           <div className="flex flex-wrap gap-1.5">
//             {COLORMAPS.map((cm) => (
//               <button
//                 key={cm}
//                 type="button"
//                 onClick={() => setColormap(cm)}
//                 className={`rounded-md border px-2 py-1 text-[0.6rem] font-mono transition-colors cursor-pointer ${
//                   colormap === cm ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-300" : "border-white/[0.07] bg-white/[0.02] text-slate-400 hover:border-white/[0.15]"
//                 }`}
//               >
//                 {cm}
//               </button>
//             ))}
//           </div>
//         </div>
//         <div className="grid grid-cols-2 gap-2">
//           <label className="space-y-1">
//             <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Rescale min</span>
//             <input type="number" step="0.1" value={rescaleMin} onChange={(e) => setRescaleMin(Number(e.target.value))}
//               className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
//           </label>
//           <label className="space-y-1">
//             <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">Rescale max</span>
//             <input type="number" step="0.1" value={rescaleMax} onChange={(e) => setRescaleMax(Number(e.target.value))}
//               className="w-full rounded-lg border border-white/[0.08] bg-[#020817]/70 px-2.5 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400/40" />
//           </label>
//         </div>
//       </div>

//       {/* Opacity */}
//       <div className="space-y-1.5">
//         <div className="flex items-center justify-between">
//           <span className="text-[0.62rem] uppercase tracking-wider text-slate-500">Overlay opacity</span>
//           <span className="text-[0.65rem] text-cyan-300">{opacity}%</span>
//         </div>
//         <input type="range" min={20} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-cyan-400" />
//       </div>

//       {/* Run */}
//       <button
//         type="button"
//         onClick={runPreview}
//         disabled={!selectedScene || !validation.ok || previewStatus === "loading"}
//         className="w-full rounded-lg bg-cyan-400 px-3 py-3 text-xs font-bold text-[#03101d] transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
//       >
//         {previewStatus === "loading" ? "Rendering on Planetary Computer…" : "Render & Preview on Map"}
//       </button>

//       {previewError && (
//         <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[0.65rem] text-red-300">
//           {previewError}
//         </div>
//       )}

//       {/* Result */}
//       {previewImg && previewStatus === "success" && (
//         <div className="space-y-2.5 rounded-lg border border-white/[0.07] bg-[#020817]/70 p-3">
//           <div className="flex items-center justify-between">
//             <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Result</p>
//             <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-[0.55rem] font-bold text-emerald-300">Rendered</span>
//           </div>
//           <img src={previewImg} alt="Raster expression preview" className="w-full rounded-md border border-white/[0.06] object-cover" />
//           <div className="flex items-center gap-2">
//             <span className="text-[0.55rem] text-slate-600">{rescaleMin}</span>
//             <div className="h-2 flex-1 rounded-full" style={{ background: colormapPreviewGradient(colormap) }} />
//             <span className="text-[0.55rem] text-slate-600">{rescaleMax}</span>
//           </div>
//           <p className="break-all font-mono text-[0.52rem] leading-relaxed text-slate-600">{expression}</p>
//         </div>
//       )}
//     </div>
//   );
// }

// // crude visual approximation just for the legend bar — actual colors come from the server-rendered PNG
// function colormapPreviewGradient(name: string): string {
//   const gradients: Record<string, string> = {
//     rdylgn:   "linear-gradient(90deg,#a50026,#fdae61,#ffffbf,#a6d96a,#006837)",
//     rdbu:     "linear-gradient(90deg,#67001f,#f4a582,#f7f7f7,#92c5de,#053061)",
//     bugn_r:   "linear-gradient(90deg,#00441b,#66c2a4,#edf8fb)",
//     magma:    "linear-gradient(90deg,#000004,#721f81,#fb8761,#fcfdbf)",
//     greens:   "linear-gradient(90deg,#00441b,#66c2a4,#f7fcf5)",
//     viridis:  "linear-gradient(90deg,#440154,#21918c,#fde725)",
//     spectral: "linear-gradient(90deg,#9e0142,#fdae61,#ffffbf,#abdda4,#5e4fa2)",
//     rdylbu_r: "linear-gradient(90deg,#313695,#fee090,#a50026)",
//   };
//   return gradients[name] ?? gradients.viridis;
// }