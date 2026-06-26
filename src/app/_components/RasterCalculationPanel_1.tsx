// "use client";

// import { useState, useRef, useCallback, useEffect } from "react";
// import { useLang } from "../_components/translations";

// // ─── Types ─────────────────────────────────────────────────────────────────────
// interface BandData {
//   name: string;
//   width: number;
//   height: number;
//   data: Float32Array | Uint8Array | Uint16Array | Int16Array;
//   min: number;
//   max: number;
//   noDataValue?: number;
// }

// interface ParsedTiff {
//   bands: BandData[];
//   width: number;
//   height: number;
//   fileName: string;
//   bbox?: [number, number, number, number]; // [west, south, east, north]
// }

// interface IndexResult {
//   key: string;
//   label: string;
//   canvas: HTMLCanvasElement;
//   stats: { min: number; max: number; mean: number; std: number };
//   colorScale: string;
// }

// interface SentinelConfig {
//   clientId: string;
//   clientSecret: string;
//   bbox: [number, number, number, number]; // [west, south, east, north]
//   dateFrom: string;
//   dateTo: string;
//   cloudCover: number;
// }

// // ─── Spectral index definitions ────────────────────────────────────────────────
// const INDEX_DEFS = [
//   {
//     key: "NDVI",
//     label: "Vegetation (NDVI)",
//     desc: "(NIR − Red) / (NIR + Red)",
//     bands: ["NIR (B8)", "Red (B4)"],
//     formula: (bands: number[][]): number[] => {
//       const [nir, red] = bands;
//       return nir.map((v, i) => {
//         const d = v + red[i];
//         return d === 0 ? 0 : (v - red[i]) / d;
//       });
//     },
//     colorMap: "RdYlGn",
//     range: [-1, 1],
//     goodRange: [0.4, 1],
//   },
//   {
//     key: "NDWI",
//     label: "Water (NDWI)",
//     desc: "(Green − NIR) / (Green + NIR)",
//     bands: ["Green (B3)", "NIR (B8)"],
//     formula: (bands: number[][]): number[] => {
//       const [green, nir] = bands;
//       return green.map((v, i) => {
//         const d = v + nir[i];
//         return d === 0 ? 0 : (v - nir[i]) / d;
//       });
//     },
//     colorMap: "BlueWhiteRed",
//     range: [-1, 1],
//     goodRange: [0, 1],
//   },
//   {
//     key: "NDMI",
//     label: "Moisture (NDMI)",
//     desc: "(NIR − SWIR) / (NIR + SWIR)",
//     bands: ["NIR (B8)", "SWIR (B11)"],
//     formula: (bands: number[][]): number[] => {
//       const [nir, swir] = bands;
//       return nir.map((v, i) => {
//         const d = v + swir[i];
//         return d === 0 ? 0 : (v - swir[i]) / d;
//       });
//     },
//     colorMap: "BrBG",
//     range: [-1, 1],
//     goodRange: [0, 1],
//   },
//   {
//     key: "EVI",
//     label: "Enhanced Veg. (EVI)",
//     desc: "2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)",
//     bands: ["NIR (B8)", "Red (B4)", "Blue (B2)"],
//     formula: (bands: number[][]): number[] => {
//       const [nir, red, blue] = bands;
//       return nir.map((v, i) => {
//         const d = v + 6 * red[i] - 7.5 * blue[i] + 1;
//         return d === 0 ? 0 : 2.5 * (v - red[i]) / d;
//       });
//     },
//     colorMap: "Greens",
//     range: [-1, 2],
//     goodRange: [0.3, 1],
//   },
//   {
//     key: "SAVI",
//     label: "Soil Adjusted (SAVI)",
//     desc: "1.5 × (NIR − Red) / (NIR + Red + 0.5)",
//     bands: ["NIR (B8)", "Red (B4)"],
//     formula: (bands: number[][]): number[] => {
//       const [nir, red] = bands;
//       return nir.map((v, i) => {
//         return 1.5 * (v - red[i]) / (v + red[i] + 0.5);
//       });
//     },
//     colorMap: "RdYlGn",
//     range: [-1, 1],
//     goodRange: [0.3, 1],
//   },
//   {
//     key: "BSI",
//     label: "Bare Soil (BSI)",
//     desc: "(SWIR + Red − NIR − Blue) / (SWIR + Red + NIR + Blue)",
//     bands: ["SWIR (B11)", "Red (B4)", "NIR (B8)", "Blue (B2)"],
//     formula: (bands: number[][]): number[] => {
//       const [swir, red, nir, blue] = bands;
//       return swir.map((v, i) => {
//         const num = v + red[i] - nir[i] - blue[i];
//         const den = v + red[i] + nir[i] + blue[i];
//         return den === 0 ? 0 : num / den;
//       });
//     },
//     colorMap: "Oranges",
//     range: [-1, 1],
//     goodRange: [-0.2, 0.2],
//   },
//   {
//     key: "CUSTOM",
//     label: "Custom Formula",
//     desc: "Write your own band math",
//     bands: [],
//     formula: null,
//     colorMap: "Viridis",
//     range: [-1, 1],
//     goodRange: [-1, 1],
//   },
// ] as const;

// // ─── Color scales ──────────────────────────────────────────────────────────────
// type ColorRamp = Array<[number, number, number]>;

// const COLOR_SCALES: Record<string, (t: number) => [number, number, number]> = {
//   RdYlGn: (t: number) => {
//     const stops: ColorRamp = [
//       [215, 25, 28], [253, 174, 97], [255, 255, 191],
//       [166, 217, 106], [26, 150, 65],
//     ];
//     return interpolateRamp(stops, t);
//   },
//   BlueWhiteRed: (t: number) => {
//     const stops: ColorRamp = [
//       [5, 48, 97], [33, 102, 172], [255, 255, 255],
//       [214, 96, 77], [178, 24, 43],
//     ];
//     return interpolateRamp(stops, t);
//   },
//   BrBG: (t: number) => {
//     const stops: ColorRamp = [
//       [84, 48, 5], [191, 129, 45], [245, 245, 245],
//       [53, 151, 143], [1, 102, 94],
//     ];
//     return interpolateRamp(stops, t);
//   },
//   Greens: (t: number) => {
//     const stops: ColorRamp = [
//       [247, 252, 245], [161, 217, 155], [65, 171, 93],
//       [0, 109, 44],
//     ];
//     return interpolateRamp(stops, t);
//   },
//   Oranges: (t: number) => {
//     const stops: ColorRamp = [
//       [255, 245, 235], [253, 190, 133], [230, 85, 13],
//       [127, 39, 4],
//     ];
//     return interpolateRamp(stops, t);
//   },
//   Viridis: (t: number) => {
//     const stops: ColorRamp = [
//       [68, 1, 84], [59, 82, 139], [33, 145, 140],
//       [94, 201, 98], [253, 231, 37],
//     ];
//     return interpolateRamp(stops, t);
//   },
// };

// function interpolateRamp(stops: ColorRamp, t: number): [number, number, number] {
//   const clamped = Math.max(0, Math.min(1, t));
//   const step = 1 / (stops.length - 1);
//   const i = Math.min(Math.floor(clamped / step), stops.length - 2);
//   const local = (clamped - i * step) / step;
//   const a = stops[i];
//   const b = stops[i + 1];
//   return [
//     Math.round(a[0] + (b[0] - a[0]) * local),
//     Math.round(a[1] + (b[1] - a[1]) * local),
//     Math.round(a[2] + (b[2] - a[2]) * local),
//   ];
// }

// // ─── Render index to canvas ────────────────────────────────────────────────────
// function renderIndexToCanvas(
//   values: number[],
//   width: number,
//   height: number,
//   colorScale: string,
//   range: readonly [number, number]
// ): HTMLCanvasElement {
//   const canvas = document.createElement("canvas");
//   canvas.width = width;
//   canvas.height = height;
//   const ctx = canvas.getContext("2d")!;
//   const imageData = ctx.createImageData(width, height);
//   const [lo, hi] = range;

//   for (let i = 0; i < values.length; i++) {
//     const v = values[i];
//     if (!isFinite(v)) {
//       imageData.data[i * 4 + 3] = 0;
//       continue;
//     }
//     const t = (v - lo) / (hi - lo);
//     const fn = COLOR_SCALES[colorScale] ?? COLOR_SCALES.Viridis;
//     const [r, g, b] = fn(t);
//     imageData.data[i * 4 + 0] = r;
//     imageData.data[i * 4 + 1] = g;
//     imageData.data[i * 4 + 2] = b;
//     imageData.data[i * 4 + 3] = 200;
//   }
//   ctx.putImageData(imageData, 0, 0);
//   return canvas;
// }

// // ─── Statistics ────────────────────────────────────────────────────────────────
// function computeStats(values: number[], noDataThreshold = -9999) {
//   const valid = values.filter((v) => isFinite(v) && v > noDataThreshold);
//   if (!valid.length) return { min: 0, max: 0, mean: 0, std: 0 };
//   const min = Math.min(...valid);
//   const max = Math.max(...valid);
//   const mean = valid.reduce((s, v) => s + v, 0) / valid.length;
//   const variance = valid.reduce((s, v) => s + (v - mean) ** 2, 0) / valid.length;
//   return { min, max, mean, std: Math.sqrt(variance) };
// }

// // ─── Sentinel Hub Evalscript builder ──────────────────────────────────────────
// const SENTINEL_EVALSCRIPTS: Record<string, string> = {
//   NDVI: `//VERSION=3
// function setup() {
//   return { input: ["B04","B08","dataMask"], output: { bands: 4 } };
// }
// function evaluatePixel(sample) {
//   let ndvi = (sample.B08 - sample.B04) / (sample.B08 + sample.B04);
//   let [r,g,b] = colorBlend(ndvi,
//     [-1,-0.2,0,0.1,0.2,0.3,0.4,0.5,0.6,0.8,1.0],
//     [[0.5,0,0],[0.7,0,0],[0.9,0.1,0],[1,0.9,0],[0.8,1,0.2],[0.5,0.9,0],[0.2,0.8,0],[0,0.6,0],[0,0.5,0],[0,0.3,0],[0,0.2,0]]
//   );
//   return [r, g, b, sample.dataMask];
// }`,
//   NDWI: `//VERSION=3
// function setup() {
//   return { input: ["B03","B08","dataMask"], output: { bands: 4 } };
// }
// function evaluatePixel(sample) {
//   let ndwi = (sample.B03 - sample.B08) / (sample.B03 + sample.B08);
//   let [r,g,b] = colorBlend(ndwi,
//     [-1,-0.5,0,0.2,0.5,1],
//     [[0.5,0.2,0.1],[0.9,0.6,0.3],[1,1,1],[0.5,0.8,1],[0,0.5,0.9],[0,0.1,0.7]]
//   );
//   return [r, g, b, sample.dataMask];
// }`,
//   EVI: `//VERSION=3
// function setup() {
//   return { input: ["B02","B04","B08","dataMask"], output: { bands: 4 } };
// }
// function evaluatePixel(sample) {
//   let evi = 2.5*(sample.B08-sample.B04)/(sample.B08+6*sample.B04-7.5*sample.B02+1);
//   let [r,g,b] = colorBlend(evi,
//     [-0.5,0,0.2,0.4,0.6,1.0],
//     [[0.6,0.2,0.1],[0.9,0.8,0.4],[0.7,0.9,0.4],[0.3,0.8,0.2],[0,0.6,0.1],[0,0.3,0]]
//   );
//   return [r, g, b, sample.dataMask];
// }`,
//   RGB: `//VERSION=3
// function setup() {
//   return { input: ["B04","B03","B02","dataMask"], output: { bands: 4 } };
// }
// function evaluatePixel(sample) {
//   return [3.5*sample.B04, 3.5*sample.B03, 3.5*sample.B02, sample.dataMask];
// }`,
// };

// // ─── Sentinel Hub API ─────────────────────────────────────────────────────────
// async function fetchSentinelToken(clientId: string, clientSecret: string): Promise<string> {
//   const res = await fetch("https://services.sentinel-hub.com/oauth/token", {
//     method: "POST",
//     headers: { "Content-Type": "application/x-www-form-urlencoded" },
//     body: new URLSearchParams({
//       grant_type: "client_credentials",
//       client_id: clientId,
//       client_secret: clientSecret,
//     }),
//   });
//   if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
//   const data = await res.json();
//   return data.access_token;
// }

// async function fetchSentinelProcess(
//   token: string,
//   bbox: [number, number, number, number],
//   dateFrom: string,
//   dateTo: string,
//   evalscript: string,
//   cloudCover: number
// ): Promise<Blob> {
//   const body = {
//     input: {
//       bounds: { bbox, properties: { crs: "http://www.opengis.net/def/crs/EPSG/0/4326" } },
//       data: [{
//         type: "sentinel-2-l2a",
//         dataFilter: {
//           timeRange: { from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
//           maxCloudCoverage: cloudCover,
//           mosaickingOrder: "leastCC",
//         },
//       }],
//     },
//     output: {
//       width: 512, height: 512,
//       responses: [{ identifier: "default", format: { type: "image/png" } }],
//     },
//     evalscript,
//   };

//   const res = await fetch("https://services.sentinel-hub.com/api/v1/process", {
//     method: "POST",
//     headers: {
//       Authorization: `Bearer ${token}`,
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify(body),
//   });
//   if (!res.ok) {
//     const err = await res.text();
//     throw new Error(`Process API failed: ${res.status} — ${err}`);
//   }
//   return res.blob();
// }

// // ─── GeoTIFF Band Parser ───────────────────────────────────────────────────────
// async function parseGeoTiff(file: File): Promise<ParsedTiff> {
//   const GeoTIFF = await import("geotiff");
//   const ab = await file.arrayBuffer();
//   const tiff = await (GeoTIFF as any).fromArrayBuffer(ab);
//   const image = await tiff.getImage();

//   const width = image.getWidth();
//   const height = image.getHeight();
//   const samplesPerPixel = image.getSamplesPerPixel?.() ?? 1;

//   const bbox = image.getBoundingBox?.() as [number, number, number, number] | undefined;

//   const MAX_DIM = 1024;
//   const scale = Math.min(1, MAX_DIM / Math.max(width, height));
//   const rW = Math.max(1, Math.round(width * scale));
//   const rH = Math.max(1, Math.round(height * scale));

//   const bands: BandData[] = [];

//   for (let b = 0; b < samplesPerPixel; b++) {
//     const raster = await image.readRasters({
//       samples: [b],
//       width: rW,
//       height: rH,
//       interleave: false,
//       resampleMethod: "bilinear",
//     });

//     const raw = (raster as any)[0] as Float32Array | Uint8Array | Uint16Array | Int16Array;
//     const arr = Array.from(raw);
//     const valid = arr.filter((v) => isFinite(v) && v !== -9999 && v > -32768);
//     const min = valid.length ? Math.min(...valid) : 0;
//     const max = valid.length ? Math.max(...valid) : 0;

//     bands.push({
//       name: `Band ${b + 1}`,
//       width: rW,
//       height: rH,
//       data: raw,
//       min,
//       max,
//     });
//   }

//   return { bands, width: rW, height: rH, fileName: file.name, bbox };
// }

// // ─── Normalize band to 0-1 ─────────────────────────────────────────────────────
// function normalizeBand(band: BandData): number[] {
//   const arr = Array.from(band.data);
//   const range = band.max - band.min || 1;
//   return arr.map((v) => (isFinite(v) && v > -9999 ? (v - band.min) / range : NaN));
// }

// // ─── Main Component ────────────────────────────────────────────────────────────
// interface Props {
//   selectedFeature?: GeoJSON.Feature | null;
//   onResultReady?: (result: { indexKey: string; canvas: HTMLCanvasElement; bbox?: [number, number, number, number] }) => void;
// }

// export default function RasterCalculationPanel({ selectedFeature, onResultReady }: Props) {
//   const { isRTL } = useLang();
//   const [mode, setMode] = useState<"geotiff" | "sentinel">("geotiff");

//   // GeoTIFF state
//   const [parsedTiff, setParsedTiff] = useState<ParsedTiff | null>(null);
//   const [tiffLoading, setTiffLoading] = useState(false);
//   const [tiffError, setTiffError] = useState<string | null>(null);
//   const [bandMapping, setBandMapping] = useState<Record<number, string>>({});
//   const [selectedIndex, setSelectedIndex] = useState<string>("NDVI");
//   const [calcResult, setCalcResult] = useState<IndexResult | null>(null);
//   const [calculating, setCalculating] = useState(false);

//   // Sentinel state
//   const [sentinelConfig, setSentinelConfig] = useState<SentinelConfig>({
//     clientId: "",
//     clientSecret: "",
//     bbox: [30.9, 29.9, 31.3, 30.2],
//     dateFrom: "2025-04-01",
//     dateTo: "2025-05-01",
//     cloudCover: 20,
//   });
//   const [sentinelIndex, setSentinelIndex] = useState("NDVI");
//   const [sentinelLoading, setSentinelLoading] = useState(false);
//   const [sentinelError, setSentinelError] = useState<string | null>(null);
//   const [sentinelResult, setSentinelResult] = useState<string | null>(null);

//   // Custom formula
//   const [customFormula, setCustomFormula] = useState("(B1 - B2) / (B1 + B2)");

//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const previewCanvasRef = useRef<HTMLCanvasElement>(null);

//   // ── Auto-fill bbox from selected feature ──────────────────────────────────
//   useEffect(() => {
//     if (!selectedFeature?.geometry) return;
//     const g = selectedFeature.geometry as any;
//     const coords: number[][] = [];
//     const walk = (c: any) => {
//       if (typeof c[0] === "number") { coords.push(c); }
//       else c.forEach(walk);
//     };
//     if (g.coordinates) walk(g.coordinates);
//     if (!coords.length) return;
//     const lngs = coords.map((c) => c[0]);
//     const lats = coords.map((c) => c[1]);
//     const west = Math.min(...lngs);
//     const east = Math.max(...lngs);
//     const south = Math.min(...lats);
//     const north = Math.max(...lats);
//     const pad = 0.005;
//     setSentinelConfig((prev) => ({
//       ...prev,
//       bbox: [west - pad, south - pad, east + pad, north + pad],
//     }));
//   }, [selectedFeature]);

//   // ── GeoTIFF upload ─────────────────────────────────────────────────────────
//   const handleTiffUpload = useCallback(async (file: File) => {
//     setTiffLoading(true);
//     setTiffError(null);
//     setParsedTiff(null);
//     setCalcResult(null);
//     setBandMapping({});
//     try {
//       const parsed = await parseGeoTiff(file);
//       setParsedTiff(parsed);
//       // Default band mapping: guess Sentinel-2 order
//       const defaultMap: Record<number, string> = {};
//       const defaultNames = ["Blue (B2)", "Green (B3)", "Red (B4)", "NIR (B8)", "SWIR (B11)", "SWIR2 (B12)"];
//       parsed.bands.forEach((_, i) => {
//         defaultMap[i] = defaultNames[i] ?? `Band ${i + 1}`;
//       });
//       setBandMapping(defaultMap);
//     } catch (e: any) {
//       setTiffError(e?.message ?? "Failed to parse GeoTIFF");
//     }
//     setTiffLoading(false);
//   }, []);

//   // ── Run calculation ────────────────────────────────────────────────────────
//   const runCalculation = useCallback(async () => {
//     if (!parsedTiff) return;
//     setCalculating(true);

//     await new Promise((r) => setTimeout(r, 0)); // yield to render

//     try {
//       const indexDef = INDEX_DEFS.find((d) => d.key === selectedIndex);
//       if (!indexDef || indexDef.key === "CUSTOM" || !indexDef.formula) {
//         // Custom formula
//         const bandArrays = parsedTiff.bands.map((b) => normalizeBand(b));
//         const result = evalCustomFormula(customFormula, bandArrays);
//         const stats = computeStats(result);
//         const canvas = renderIndexToCanvas(result, parsedTiff.width, parsedTiff.height, "Viridis", [stats.min, stats.max]);
//         setCalcResult({ key: "CUSTOM", label: "Custom", canvas, stats, colorScale: "Viridis" });
//         onResultReady?.({ indexKey: "CUSTOM", canvas, bbox: parsedTiff.bbox });
//         setCalculating(false);
//         return;
//       }

//       // Map bands by role
//       const roleMap: Record<string, number[]> = {};
//       Object.entries(bandMapping).forEach(([idxStr, roleName]) => {
//         const idx = parseInt(idxStr);
//         if (!roleMap[roleName]) roleMap[roleName] = [];
//         roleMap[roleName].push(idx);
//       });

//       const normalizedBands = parsedTiff.bands.map((b) => normalizeBand(b));

//       const bandInputs = indexDef.bands.map((bandRole) => {
//         const bandIndices = roleMap[bandRole];
//         if (!bandIndices?.length) {
//           return new Array(parsedTiff.width * parsedTiff.height).fill(0);
//         }
//         return normalizedBands[bandIndices[0]];
//       });

//       const result = (indexDef.formula as (bands: number[][]) => number[])(bandInputs);
//       const stats = computeStats(result);
//       const canvas = renderIndexToCanvas(
//         result, parsedTiff.width, parsedTiff.height,
//         indexDef.colorMap, indexDef.range
//       );
//       setCalcResult({ key: indexDef.key, label: indexDef.label, canvas, stats, colorScale: indexDef.colorMap });
//       onResultReady?.({ indexKey: indexDef.key, canvas, bbox: parsedTiff.bbox });
//     } catch (e: any) {
//       setTiffError(e?.message ?? "Calculation failed");
//     }
//     setCalculating(false);
//   }, [parsedTiff, selectedIndex, bandMapping, customFormula, onResultReady]);

//   // ── Update preview canvas when result changes ─────────────────────────────
//   useEffect(() => {
//     if (!calcResult || !previewCanvasRef.current) return;
//     const target = previewCanvasRef.current;
//     const scale = Math.min(1, 280 / calcResult.canvas.width, 180 / calcResult.canvas.height);
//     target.width = Math.round(calcResult.canvas.width * scale);
//     target.height = Math.round(calcResult.canvas.height * scale);
//     const ctx = target.getContext("2d")!;
//     ctx.drawImage(calcResult.canvas, 0, 0, target.width, target.height);
//   }, [calcResult]);

//   // ── Sentinel fetch ─────────────────────────────────────────────────────────
//   const runSentinelFetch = useCallback(async () => {
//     const { clientId, clientSecret, bbox, dateFrom, dateTo, cloudCover } = sentinelConfig;
//     if (!clientId || !clientSecret) {
//       setSentinelError("Client ID and Secret are required");
//       return;
//     }
//     setSentinelLoading(true);
//     setSentinelError(null);
//     setSentinelResult(null);
//     try {
//       const token = await fetchSentinelToken(clientId, clientSecret);
//       const evalscript = SENTINEL_EVALSCRIPTS[sentinelIndex] ?? SENTINEL_EVALSCRIPTS.NDVI;
//       const blob = await fetchSentinelProcess(token, bbox, dateFrom, dateTo, evalscript, cloudCover);
//       const url = URL.createObjectURL(blob);
//       setSentinelResult(url);

//       // Also render to an in-memory canvas for onResultReady
//       const img = new Image();
//       img.onload = () => {
//         const c = document.createElement("canvas");
//         c.width = img.width; c.height = img.height;
//         c.getContext("2d")!.drawImage(img, 0, 0);
//         onResultReady?.({ indexKey: sentinelIndex, canvas: c, bbox });
//       };
//       img.src = url;
//     } catch (e: any) {
//       setSentinelError(e?.message ?? "Sentinel Hub fetch failed");
//     }
//     setSentinelLoading(false);
//   }, [sentinelConfig, sentinelIndex, onResultReady]);

//   // ── Download result ────────────────────────────────────────────────────────
//   const downloadResult = useCallback(() => {
//     if (calcResult) {
//       const a = document.createElement("a");
//       a.href = calcResult.canvas.toDataURL("image/png");
//       a.download = `${calcResult.key}_result.png`;
//       a.click();
//     } else if (sentinelResult) {
//       const a = document.createElement("a");
//       a.href = sentinelResult;
//       a.download = `${sentinelIndex}_sentinel.png`;
//       a.click();
//     }
//   }, [calcResult, sentinelResult, sentinelIndex]);

//   const indexDef = INDEX_DEFS.find((d) => d.key === selectedIndex);

//   return (
//     <div
//       className="space-y-4"
//       dir={isRTL ? "rtl" : "ltr"}
//       style={{ fontFamily: isRTL ? "'Noto Sans Arabic', sans-serif" : "'DM Sans', sans-serif" }}
//     >
//       {/* ── Mode Toggle ── */}
//       <div className="flex items-center bg-white/[0.03] border border-white/[0.07] rounded-xl p-1 gap-1">
//         {(["geotiff", "sentinel"] as const).map((m) => (
//           <button
//             key={m}
//             onClick={() => setMode(m)}
//             className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
//               mode === m
//                 ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_12px_rgba(0,212,255,0.3)]"
//                 : "text-slate-500 hover:text-slate-300"
//             }`}
//           >
//             {m === "geotiff" ? (
//               <>
//                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                   <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
//                   <polyline points="14 2 14 8 20 8"/>
//                 </svg>
//                 GeoTIFF Upload
//               </>
//             ) : (
//               <>
//                 <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                   <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
//                   <path d="M12 6v6l4 2"/>
//                 </svg>
//                 Sentinel Hub API
//               </>
//             )}
//           </button>
//         ))}
//       </div>

//       {/* ═══════════════════════════════════════════════════════════════════ */}
//       {/* GeoTIFF Mode */}
//       {/* ═══════════════════════════════════════════════════════════════════ */}
//       {mode === "geotiff" && (
//         <div className="space-y-3">

//           {/* Upload zone */}
//           {!parsedTiff && (
//             <div
//               onClick={() => fileInputRef.current?.click()}
//               onDragOver={(e) => e.preventDefault()}
//               onDrop={(e) => {
//                 e.preventDefault();
//                 const file = e.dataTransfer.files?.[0];
//                 if (file) handleTiffUpload(file);
//               }}
//               className="flex flex-col items-center gap-3 border-2 border-dashed border-white/[0.12] hover:border-cyan-400/40 bg-white/[0.02] hover:bg-cyan-400/[0.04] rounded-xl py-8 cursor-pointer transition-all"
//             >
//               {tiffLoading ? (
//                 <svg className="animate-spin w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                   <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
//                 </svg>
//               ) : (
//                 <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.5">
//                   <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
//                   <polyline points="14 2 14 8 20 8"/>
//                   <line x1="12" y1="18" x2="12" y2="12"/>
//                   <line x1="9" y1="15" x2="12" y2="12"/>
//                   <line x1="15" y1="15" x2="12" y2="12"/>
//                 </svg>
//               )}
//               <div className="text-center">
//                 <p className="text-sm font-medium text-slate-300">
//                   {tiffLoading ? "Parsing GeoTIFF…" : "Drop GeoTIFF here"}
//                 </p>
//                 <p className="text-[0.65rem] text-slate-500 mt-0.5">.tif · .tiff · Multi-band Sentinel-2</p>
//               </div>
//               <input
//                 ref={fileInputRef}
//                 type="file"
//                 accept=".tif,.tiff,image/tiff"
//                 className="hidden"
//                 onChange={(e) => { const f = e.target.files?.[0]; if (f) handleTiffUpload(f); e.target.value = ""; }}
//               />
//             </div>
//           )}

//           {tiffError && (
//             <div className="flex items-start gap-2.5 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-3">
//               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5">
//                 <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
//               </svg>
//               <p className="text-[0.7rem] text-red-400 leading-relaxed">{tiffError}</p>
//             </div>
//           )}

//           {/* Parsed info + band mapping */}
//           {parsedTiff && (
//             <div className="space-y-3">
//               {/* File info */}
//               <div className="flex items-center gap-2.5 bg-emerald-400/[0.07] border border-emerald-400/20 rounded-xl px-3.5 py-2.5">
//                 <div className="w-7 h-7 rounded-lg bg-emerald-400/15 flex items-center justify-center shrink-0">
//                   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
//                 </div>
//                 <div className="flex-1 min-w-0">
//                   <p className="text-[0.72rem] font-medium text-emerald-300 truncate">{parsedTiff.fileName}</p>
//                   <p className="text-[0.6rem] text-slate-500">
//                     {parsedTiff.width}×{parsedTiff.height}px · {parsedTiff.bands.length} band{parsedTiff.bands.length !== 1 ? "s" : ""}
//                     {parsedTiff.bbox ? ` · ${parsedTiff.bbox.map((v) => v.toFixed(3)).join(", ")}` : ""}
//                   </p>
//                 </div>
//                 <button
//                   onClick={() => { setParsedTiff(null); setCalcResult(null); setBandMapping({}); setTiffError(null); }}
//                   className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1"
//                 >
//                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
//                 </button>
//               </div>

//               {/* Band info table */}
//               <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
//                 <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2.5">Band Statistics</p>
//                 <div className="space-y-1.5">
//                   {parsedTiff.bands.map((band, i) => (
//                     <div key={i} className="flex items-center gap-2">
//                       <span className="text-[0.62rem] text-cyan-400 font-mono w-14 shrink-0">{band.name}</span>
//                       <div className="flex-1 h-2 bg-white/[0.05] rounded-full overflow-hidden">
//                         <div
//                           className="h-full rounded-full bg-cyan-400/60"
//                           style={{ width: `${((band.max - band.min) / (band.max || 1)) * 100}%` }}
//                         />
//                       </div>
//                       <span className="text-[0.58rem] text-slate-500 font-mono w-24 text-right shrink-0">
//                         {band.min.toFixed(0)} – {band.max.toFixed(0)}
//                       </span>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {/* Band mapping */}
//               <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
//                 <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2.5">Band → Role Mapping</p>
//                 <div className="space-y-1.5">
//                   {parsedTiff.bands.map((band, i) => (
//                     <div key={i} className="flex items-center gap-2">
//                       <span className="text-[0.65rem] text-slate-400 w-14 shrink-0">{band.name}</span>
//                       <select
//                         value={bandMapping[i] ?? ""}
//                         onChange={(e) => setBandMapping((prev) => ({ ...prev, [i]: e.target.value }))}
//                         className="flex-1 bg-[#0a1628]/80 border border-white/[0.08] rounded-lg px-2 py-1 text-[0.65rem] text-slate-200 outline-none focus:border-cyan-400/40 cursor-pointer"
//                       >
//                         <option value="">— skip —</option>
//                         {["Blue (B2)", "Green (B3)", "Red (B4)", "NIR (B8)", "SWIR (B11)", "SWIR2 (B12)", "Coastal (B1)", "SWIR-Cirrus (B10)"].map((r) => (
//                           <option key={r} value={r}>{r}</option>
//                         ))}
//                       </select>
//                     </div>
//                   ))}
//                 </div>
//               </div>

//               {/* Index selector */}
//               <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
//                 <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2.5">Spectral Index</p>
//                 <div className="grid grid-cols-2 gap-1.5">
//                   {INDEX_DEFS.map((def) => (
//                     <button
//                       key={def.key}
//                       onClick={() => setSelectedIndex(def.key)}
//                       className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
//                         selectedIndex === def.key
//                           ? "border-cyan-400/40 bg-cyan-400/[0.08]"
//                           : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]"
//                       }`}
//                     >
//                       <p className={`text-[0.68rem] font-bold tracking-wide ${selectedIndex === def.key ? "text-cyan-400" : "text-slate-300"}`}>
//                         {def.key}
//                       </p>
//                       <p className="text-[0.58rem] text-slate-500 mt-0.5 leading-tight">{def.label.split(" (")[0]}</p>
//                     </button>
//                   ))}
//                 </div>

//                 {/* Index description */}
//                 {indexDef && (
//                   <div className="mt-2.5 bg-white/[0.02] border border-white/[0.05] rounded-lg px-2.5 py-2">
//                     <p className="text-[0.6rem] text-slate-400 font-mono">{indexDef.desc}</p>
//                     <p className="text-[0.58rem] text-slate-600 mt-0.5">
//                       Requires: {indexDef.bands.length ? indexDef.bands.join(", ") : "any bands"}
//                     </p>
//                   </div>
//                 )}

//                 {/* Custom formula input */}
//                 {selectedIndex === "CUSTOM" && (
//                   <div className="mt-2.5 space-y-1.5">
//                     <p className="text-[0.6rem] text-slate-500">Use B1, B2, B3... (normalized 0-1)</p>
//                     <input
//                       value={customFormula}
//                       onChange={(e) => setCustomFormula(e.target.value)}
//                       placeholder="e.g. (B1 - B2) / (B1 + B2)"
//                       className="w-full bg-[#0a1628]/80 border border-white/[0.08] rounded-lg px-2.5 py-2 text-[0.7rem] text-cyan-300 font-mono outline-none focus:border-cyan-400/40"
//                     />
//                   </div>
//                 )}
//               </div>

//               {/* Calculate button */}
//               <button
//                 onClick={runCalculation}
//                 disabled={calculating}
//                 className="w-full h-10 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-wait text-[#03101d] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
//               >
//                 {calculating ? (
//                   <>
//                     <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                       <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
//                     </svg>
//                     Calculating…
//                   </>
//                 ) : (
//                   <>
//                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                       <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
//                     </svg>
//                     Run {selectedIndex} Calculation
//                   </>
//                 )}
//               </button>
//             </div>
//           )}

//           {/* Result */}
//           {calcResult && (
//             <div className="space-y-3">
//               <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
//                 <div className="flex items-center justify-between mb-3">
//                   <p className="text-[0.65rem] font-bold text-cyan-400 uppercase tracking-wider">{calcResult.label} Result</p>
//                   <button
//                     onClick={downloadResult}
//                     className="flex items-center gap-1.5 text-[0.62rem] text-slate-400 hover:text-cyan-400 border border-white/[0.08] hover:border-cyan-400/30 rounded-lg px-2 py-1 transition-all cursor-pointer"
//                   >
//                     <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                       <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
//                       <polyline points="7 10 12 15 17 10"/>
//                       <line x1="12" y1="15" x2="12" y2="3"/>
//                     </svg>
//                     PNG
//                   </button>
//                 </div>

//                 {/* Canvas preview */}
//                 <canvas
//                   ref={previewCanvasRef}
//                   className="w-full rounded-lg border border-white/[0.06]"
//                   style={{ imageRendering: "pixelated" }}
//                 />

//                 {/* Color legend */}
//                 <div className="flex items-center gap-2 mt-2.5">
//                   <span className="text-[0.58rem] text-slate-600">
//                     {(INDEX_DEFS.find(d => d.key === calcResult.key)?.range?.[0] ?? calcResult.stats.min).toFixed(2)}
//                   </span>
//                   <div
//                     className="flex-1 h-2 rounded-full"
//                     style={{
//                       background: (() => {
//                         const fn = COLOR_SCALES[calcResult.colorScale] ?? COLOR_SCALES.Viridis;
//                         const stops = Array.from({ length: 5 }, (_, i) => {
//                           const [r, g, b] = fn(i / 4);
//                           return `rgb(${r},${g},${b})`;
//                         });
//                         return `linear-gradient(to right, ${stops.join(",")})`;
//                       })(),
//                     }}
//                   />
//                   <span className="text-[0.58rem] text-slate-600">
//                     {(INDEX_DEFS.find(d => d.key === calcResult.key)?.range?.[1] ?? calcResult.stats.max).toFixed(2)}
//                   </span>
//                 </div>

//                 {/* Stats grid */}
//                 <div className="grid grid-cols-4 gap-1.5 mt-2.5">
//                   {[
//                     { label: "Min", value: calcResult.stats.min.toFixed(3) },
//                     { label: "Max", value: calcResult.stats.max.toFixed(3) },
//                     { label: "Mean", value: calcResult.stats.mean.toFixed(3) },
//                     { label: "StdDev", value: calcResult.stats.std.toFixed(3) },
//                   ].map((s) => (
//                     <div key={s.label} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 text-center">
//                       <p className="text-[0.65rem] font-semibold text-slate-200">{s.value}</p>
//                       <p className="text-[0.55rem] text-slate-500 mt-0.5">{s.label}</p>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       )}

//       {/* ═══════════════════════════════════════════════════════════════════ */}
//       {/* Sentinel Hub Mode */}
//       {/* ═══════════════════════════════════════════════════════════════════ */}
//       {mode === "sentinel" && (
//         <div className="space-y-3">

//           {/* API Keys */}
//           <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2.5">
//             <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider">Sentinel Hub Credentials</p>
//             <div className="space-y-2">
//               <label className="space-y-1 block">
//                 <span className="text-[0.6rem] text-slate-500">OAuth Client ID</span>
//                 <input
//                   type="text"
//                   value={sentinelConfig.clientId}
//                   onChange={(e) => setSentinelConfig((p) => ({ ...p, clientId: e.target.value }))}
//                   placeholder="your-client-id"
//                   className="w-full bg-[#020817]/70 border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-400/40"
//                 />
//               </label>
//               <label className="space-y-1 block">
//                 <span className="text-[0.6rem] text-slate-500">OAuth Client Secret</span>
//                 <input
//                   type="password"
//                   value={sentinelConfig.clientSecret}
//                   onChange={(e) => setSentinelConfig((p) => ({ ...p, clientSecret: e.target.value }))}
//                   placeholder="••••••••"
//                   className="w-full bg-[#020817]/70 border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-400/40"
//                 />
//               </label>
//               <a
//                 href="https://apps.sentinel-hub.com/dashboard/#/account/settings"
//                 target="_blank"
//                 rel="noopener noreferrer"
//                 className="inline-flex items-center gap-1 text-[0.6rem] text-cyan-400/80 hover:text-cyan-400 transition-colors"
//               >
//                 <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                   <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
//                   <polyline points="15 3 21 3 21 9"/>
//                   <line x1="10" y1="14" x2="21" y2="3"/>
//                 </svg>
//                 Get credentials from Sentinel Hub Dashboard
//               </a>
//             </div>
//           </div>

//           {/* BBox */}
//           <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2">
//             <div className="flex items-center justify-between">
//               <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider">Bounding Box (WGS84)</p>
//               {selectedFeature && (
//                 <span className="text-[0.58rem] text-cyan-400 bg-cyan-400/10 border border-cyan-400/20 rounded px-1.5 py-0.5">
//                   From selected feature
//                 </span>
//               )}
//             </div>
//             <div className="grid grid-cols-2 gap-1.5">
//               {(["West (min lng)", "South (min lat)", "East (max lng)", "North (max lat)"] as const).map((label, i) => (
//                 <label key={label} className="space-y-0.5 block">
//                   <span className="text-[0.58rem] text-slate-600">{label}</span>
//                   <input
//                     type="number"
//                     step="0.0001"
//                     value={sentinelConfig.bbox[i]}
//                     onChange={(e) => {
//                       const bbox = [...sentinelConfig.bbox] as [number, number, number, number];
//                       bbox[i] = parseFloat(e.target.value) || 0;
//                       setSentinelConfig((p) => ({ ...p, bbox }));
//                     }}
//                     className="w-full bg-[#020817]/70 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[0.65rem] text-slate-200 font-mono outline-none focus:border-cyan-400/40"
//                   />
//                 </label>
//               ))}
//             </div>
//           </div>

//           {/* Date range + cloud cover */}
//           <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2.5">
//             <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider">Query Parameters</p>
//             <div className="grid grid-cols-2 gap-2">
//               <label className="space-y-1 block">
//                 <span className="text-[0.6rem] text-slate-500">Date From</span>
//                 <input
//                   type="date"
//                   value={sentinelConfig.dateFrom}
//                   onChange={(e) => setSentinelConfig((p) => ({ ...p, dateFrom: e.target.value }))}
//                   className="w-full bg-[#020817]/70 border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
//                 />
//               </label>
//               <label className="space-y-1 block">
//                 <span className="text-[0.6rem] text-slate-500">Date To</span>
//                 <input
//                   type="date"
//                   value={sentinelConfig.dateTo}
//                   onChange={(e) => setSentinelConfig((p) => ({ ...p, dateTo: e.target.value }))}
//                   className="w-full bg-[#020817]/70 border border-white/[0.08] rounded-lg px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-cyan-400/40"
//                 />
//               </label>
//             </div>
//             <div className="space-y-1.5">
//               <div className="flex items-center justify-between">
//                 <span className="text-[0.6rem] text-slate-500">Max Cloud Cover</span>
//                 <span className="text-[0.65rem] text-cyan-300 font-mono">{sentinelConfig.cloudCover}%</span>
//               </div>
//               <input
//                 type="range"
//                 min={0} max={80}
//                 value={sentinelConfig.cloudCover}
//                 onChange={(e) => setSentinelConfig((p) => ({ ...p, cloudCover: parseInt(e.target.value) }))}
//                 className="w-full accent-cyan-400"
//               />
//             </div>
//           </div>

//           {/* Index selector */}
//           <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
//             <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2.5">Rendered Index</p>
//             <div className="grid grid-cols-2 gap-1.5">
//               {(["NDVI", "NDWI", "EVI", "RGB"] as const).map((key) => (
//                 <button
//                   key={key}
//                   onClick={() => setSentinelIndex(key)}
//                   className={`py-2 px-3 rounded-lg border text-left cursor-pointer transition-all ${
//                     sentinelIndex === key
//                       ? "border-cyan-400/40 bg-cyan-400/[0.08] text-cyan-400"
//                       : "border-white/[0.07] bg-white/[0.03] text-slate-400 hover:text-slate-300"
//                   }`}
//                 >
//                   <p className="text-[0.68rem] font-bold">{key}</p>
//                   <p className="text-[0.58rem] text-slate-500 mt-0.5">
//                     {key === "RGB" ? "True color" : `${key} index`}
//                   </p>
//                 </button>
//               ))}
//             </div>
//           </div>

//           {sentinelError && (
//             <div className="flex items-start gap-2.5 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-3">
//               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5">
//                 <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
//               </svg>
//               <p className="text-[0.7rem] text-red-400 leading-relaxed">{sentinelError}</p>
//             </div>
//           )}

//           {/* Fetch button */}
//           <button
//             onClick={runSentinelFetch}
//             disabled={sentinelLoading}
//             className="w-full h-10 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-wait text-[#03101d] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
//           >
//             {sentinelLoading ? (
//               <>
//                 <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                   <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
//                 </svg>
//                 Fetching from Sentinel Hub…
//               </>
//             ) : (
//               <>
//                 <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                   <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
//                   <path d="M8 12l4-4 4 4M12 8v8"/>
//                 </svg>
//                 Fetch {sentinelIndex} from Sentinel-2
//               </>
//             )}
//           </button>

//           {/* Sentinel result */}
//           {sentinelResult && (
//             <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-2">
//               <div className="flex items-center justify-between">
//                 <p className="text-[0.65rem] font-bold text-cyan-400 uppercase tracking-wider">
//                   {sentinelIndex} · Sentinel-2 Result
//                 </p>
//                 <button
//                   onClick={downloadResult}
//                   className="flex items-center gap-1.5 text-[0.62rem] text-slate-400 hover:text-cyan-400 border border-white/[0.08] hover:border-cyan-400/30 rounded-lg px-2 py-1 transition-all cursor-pointer"
//                 >
//                   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
//                     <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
//                     <polyline points="7 10 12 15 17 10"/>
//                     <line x1="12" y1="15" x2="12" y2="3"/>
//                   </svg>
//                   PNG
//                 </button>
//               </div>
//               <img
//                 src={sentinelResult}
//                 alt={`${sentinelIndex} result`}
//                 className="w-full rounded-lg border border-white/[0.06]"
//                 style={{ imageRendering: "pixelated" }}
//               />
//               <p className="text-[0.58rem] text-slate-600 text-center">
//                 {sentinelConfig.bbox.map((v) => v.toFixed(4)).join(", ")} · {sentinelConfig.dateFrom} → {sentinelConfig.dateTo}
//               </p>
//             </div>
//           )}
//         </div>
//       )}
//     </div>
//   );
// }

// // ─── Custom formula evaluator ──────────────────────────────────────────────────
// function evalCustomFormula(formula: string, bands: number[][]): number[] {
//   const n = bands[0]?.length ?? 0;
//   const result: number[] = new Array(n).fill(0);
//   const cleaned = formula.trim();

//   for (let i = 0; i < n; i++) {
//     const bandValues: Record<string, number> = {};
//     bands.forEach((band, idx) => {
//       bandValues[`B${idx + 1}`] = band[i] ?? 0;
//     });

//     try {
//       const expr = cleaned.replace(/B(\d+)/g, (_, num) => {
//         const val = bandValues[`B${num}`];
//         return val !== undefined ? String(val) : "0";
//       });
//       // eslint-disable-next-line no-new-func
//       result[i] = new Function(`return (${expr})`)() as number;
//       if (!isFinite(result[i])) result[i] = 0;
//     } catch {
//       result[i] = 0;
//     }
//   }
//   return result;
// }
