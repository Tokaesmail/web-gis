import React, { useEffect, useMemo, useState } from "react";
import { IdxKey, SatKey } from "../../map/mapTypes_proxy";
import { SATELLITE_LEGENDS, SATELLITE_PIPELINES, type SatelliteAnalysisType, type SatelliteViewerMode } from "./SatellitePipelines";
import { getFeatureBounds, getMidCoords } from "./geoFeatureUtils";
import { clipImageToPolygon, getPolygonRing } from "./geoClipUtils";
import { setSelectedScene, openRasterCalculatorPanel } from "./sharedSceneSelection";

export type SatellitePreviewConfig = {
  source: "sentinel-2" | "landsat";
  satKey: SatKey;
  band: IdxKey;
  dateFrom: string;
  dateTo: string;
  cloudCover: number;
  opacity: number;
  scenePreview?: {
    name: string;
    band: IdxKey;
    expression: string | null;
    assets: string[];
    assetUrls: Record<string, string>;
    bounds: [[number, number], [number, number]];
    coords: { lat: number; lng: number };
    previewUrl?: string;
    overviewUrl?: string;
    geometry?: GeoJSON.Geometry | null;
  };
};

type SatelliteDownloadFormat = "png" | "geojson" | "shapefile" | "geotiff";
export type RasterDownloadFormat = "geotiff" | "geojson" | "shapefile" | "pdf";

export type RasterPreviewConfig = {
  name: string;
  indexKey: IdxKey;
  expression: string;
  date: string;
  coords: { lat: number; lng: number };
  bounds: [[number, number], [number, number]];
  opacity: number;
  colorRamp: string;
  dataUrl: string;
};

export type BackendRasterResponse = {
  name?: string;
  imageUrl?: string;
  dataUrl?: string;
  bounds?: [[number, number], [number, number]];
  histogram?: number[];
  stats?: { min?: number; max?: number; mean?: number; std?: number };
};

type SatelliteScene = {
  id: string;
  cloud: number;
  score: number;
  date: string;
  collection: string;
  geometry?: GeoJSON.Geometry | null;
  bbox?: number[];
  thumbnail?: string;
  previewUrl?: string;
  itemUrl?: string;
  rawAssetUrl?: string;
  assets?: Record<string, string>;
};

type StacFeature = {
  id?: string;
  geometry?: GeoJSON.Geometry | null;
  bbox?: number[];
  properties?: {
    datetime?: string;
    "eo:cloud_cover"?: number;
    "landsat:cloud_cover_land"?: number;
  };
  assets?: Record<string, { href?: string; type?: string; title?: string } | undefined>;
  links?: Array<{ rel?: string; href?: string }>;
};

export const sanitizeFileName = (name: string) =>
  name.replace(/[^a-z0-9._-]+/gi, "_").replace(/^_+|_+$/g, "") || "satellite_scene";

const textBytes = (value: string) => new TextEncoder().encode(value);

function formatDateDMY(value: string) {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value || "DD/MM/YYYY";
  return `${day}/${month}/${year}`;
}

export function DatePickerField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      {/* <span className="text-[0.58rem] uppercase tracking-wider text-slate-500">{label}</span> */}
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

const concatBytes = (chunks: Uint8Array[]) => {
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
};

export const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (data: Uint8Array) => {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

function makeZip(files: Array<{ name: string; data: Uint8Array }>) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textBytes(file.name);
    const crc = crc32(file.data);
    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, file.data.length, true);
    localView.setUint32(22, file.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    localParts.push(local, file.data);

    const central = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);

    offset += local.length + file.data.length;
  });

  const centralDir = concatBytes(centralParts);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralDir.length, true);
  endView.setUint32(16, offset, true);

  const zipBytes = concatBytes([...localParts, centralDir, end]);
  const zipBuffer = zipBytes.buffer.slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength) as ArrayBuffer;
  return new Blob([zipBuffer], { type: "application/zip" });
}

function bboxGeometry(bbox: number[]): GeoJSON.Polygon {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return {
    type: "Polygon",
    coordinates: [[
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ]],
  };
}

function sceneFeature(scene: SatelliteScene): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: scene.geometry ?? bboxGeometry(scene.bbox ?? [0, 0, 0, 0]),
    properties: {
      id: scene.id,
      collection: scene.collection,
      date: scene.date,
      cloud: scene.cloud,
      score: scene.score,
      itemUrl: scene.itemUrl,
      previewUrl: scene.previewUrl,
      rawAssetUrl: scene.rawAssetUrl,
    },
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

function polygonRing(geometry?: GeoJSON.Geometry | null, bbox?: number[]) {
  const fallback = bboxGeometry(bbox ?? [0, 0, 0, 0]).coordinates[0];
  if (!geometry) return fallback;
  if (geometry.type === "Polygon") return geometry.coordinates[0] ?? fallback;
  if (geometry.type === "MultiPolygon") return geometry.coordinates[0]?.[0] ?? fallback;
  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return bboxGeometry([lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01]).coordinates[0];
  }
  return fallback;
}

function writeShpHeader(view: DataView, fileLengthWords: number, shapeType: number, bbox: number[]) {
  view.setInt32(0, 9994, false);
  view.setInt32(24, fileLengthWords, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, shapeType, true);
  bbox.forEach((value, index) => view.setFloat64(36 + index * 8, value, true));
}

function makeDbf(sceneId: string) {
  const fieldLength = 80;
  const headerLength = 65;
  const recordLength = 1 + fieldLength;
  const dbf = new Uint8Array(headerLength + recordLength + 1);
  const view = new DataView(dbf.buffer);
  const now = new Date();
  dbf[0] = 0x03;
  dbf[1] = now.getFullYear() - 1900;
  dbf[2] = now.getMonth() + 1;
  dbf[3] = now.getDate();
  view.setUint32(4, 1, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  dbf.set(textBytes("SCENE_ID"), 32);
  dbf[43] = 0x43;
  dbf[48] = fieldLength;
  dbf[64] = 0x0d;
  dbf[65] = 0x20;
  dbf.set(textBytes(sceneId.slice(0, fieldLength).padEnd(fieldLength, " ")), 66);
  dbf[dbf.length - 1] = 0x1a;
  return dbf;
}

function makeShapefileZip(scene: SatelliteScene) {
  const base = sanitizeFileName(scene.id);
  const ring = polygonRing(scene.geometry, scene.bbox);
  const closed = ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ? [...ring, ring[0]]
    : ring;
  const xs = closed.map((point) => point[0]);
  const ys = closed.map((point) => point[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const contentBytes = 44 + 4 + closed.length * 16;
  const shpLength = 100 + 8 + contentBytes;
  const shp = new Uint8Array(shpLength);
  const shpView = new DataView(shp.buffer);
  writeShpHeader(shpView, shpLength / 2, 5, bbox);
  shpView.setInt32(100, 1, false);
  shpView.setInt32(104, contentBytes / 2, false);
  shpView.setInt32(108, 5, true);
  bbox.forEach((value, index) => shpView.setFloat64(112 + index * 8, value, true));
  shpView.setInt32(144, 1, true);
  shpView.setInt32(148, closed.length, true);
  shpView.setInt32(152, 0, true);
  closed.forEach((point, index) => {
    shpView.setFloat64(156 + index * 16, point[0], true);
    shpView.setFloat64(164 + index * 16, point[1], true);
  });

  const shx = new Uint8Array(108);
  const shxView = new DataView(shx.buffer);
  writeShpHeader(shxView, 54, 5, bbox);
  shxView.setInt32(100, 50, false);
  shxView.setInt32(104, contentBytes / 2, false);

  return makeZip([
    { name: `${base}.shp`, data: shp },
    { name: `${base}.shx`, data: shx },
    { name: `${base}.dbf`, data: makeDbf(scene.id) },
    { name: `${base}.prj`, data: textBytes('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]') },
    { name: `${base}.cpg`, data: textBytes("UTF-8") },
  ]);
}

function rasterBoundsGeometry(bounds: [[number, number], [number, number]]): GeoJSON.Polygon {
  const [[south, west], [north, east]] = bounds;
  return bboxGeometry([west, south, east, north]);
}

export function makeRasterFeature(config: RasterPreviewConfig): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: rasterBoundsGeometry(config.bounds),
    properties: {
      name: config.name,
      index: config.indexKey,
      expression: config.expression,
      date: config.date,
      colorRamp: config.colorRamp,
      opacity: config.opacity,
      centerLat: config.coords.lat,
      centerLng: config.coords.lng,
    },
  };
}

function makeRasterDbf(config: RasterPreviewConfig) {
  const fieldLength = 80;
  const fields = ["NAME", "INDEX", "DATE"];
  const headerLength = 33 + fields.length * 32;
  const recordLength = 1 + fields.length * fieldLength;
  const dbf = new Uint8Array(headerLength + recordLength + 1);
  const view = new DataView(dbf.buffer);
  const now = new Date();
  dbf[0] = 0x03;
  dbf[1] = now.getFullYear() - 1900;
  dbf[2] = now.getMonth() + 1;
  dbf[3] = now.getDate();
  view.setUint32(4, 1, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  fields.forEach((field, index) => {
    const offset = 32 + index * 32;
    dbf.set(textBytes(field), offset);
    dbf[offset + 11] = 0x43;
    dbf[offset + 16] = fieldLength;
  });
  dbf[headerLength - 1] = 0x0d;
  dbf[headerLength] = 0x20;
  [config.name, config.indexKey, config.date].forEach((value, index) => {
    dbf.set(textBytes(String(value).slice(0, fieldLength).padEnd(fieldLength, " ")), headerLength + 1 + index * fieldLength);
  });
  dbf[dbf.length - 1] = 0x1a;
  return dbf;
}

export function makeRasterShapefileZip(config: RasterPreviewConfig) {
  const base = sanitizeFileName(config.name);
  const ring = rasterBoundsGeometry(config.bounds).coordinates[0];
  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  const bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const contentBytes = 44 + 4 + ring.length * 16;
  const shpLength = 100 + 8 + contentBytes;
  const shp = new Uint8Array(shpLength);
  const shpView = new DataView(shp.buffer);
  writeShpHeader(shpView, shpLength / 2, 5, bbox);
  shpView.setInt32(100, 1, false);
  shpView.setInt32(104, contentBytes / 2, false);
  shpView.setInt32(108, 5, true);
  bbox.forEach((value, index) => shpView.setFloat64(112 + index * 8, value, true));
  shpView.setInt32(144, 1, true);
  shpView.setInt32(148, ring.length, true);
  shpView.setInt32(152, 0, true);
  ring.forEach((point, index) => {
    shpView.setFloat64(156 + index * 16, point[0], true);
    shpView.setFloat64(164 + index * 16, point[1], true);
  });

  const shx = new Uint8Array(108);
  const shxView = new DataView(shx.buffer);
  writeShpHeader(shxView, 54, 5, bbox);
  shxView.setInt32(100, 50, false);
  shxView.setInt32(104, contentBytes / 2, false);

  return makeZip([
    { name: `${base}.shp`, data: shp },
    { name: `${base}.shx`, data: shx },
    { name: `${base}.dbf`, data: makeRasterDbf(config) },
    { name: `${base}.prj`, data: textBytes('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]') },
    { name: `${base}.cpg`, data: textBytes("UTF-8") },
  ]);
}

export async function dataUrlToImageData(dataUrl: string) {
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not read raster preview image."));
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 96;
  canvas.height = image.naturalHeight || 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

export function makeGeoTiffFromImage(imageData: ImageData, bounds: [[number, number], [number, number]]) {
  const { width, height, data } = imageData;
  const rgb = new Uint8Array(width * height * 3);
  for (let src = 0, dst = 0; src < data.length; src += 4, dst += 3) {
    rgb[dst] = data[src];
    rgb[dst + 1] = data[src + 1];
    rgb[dst + 2] = data[src + 2];
  }

  const [[south, west], [north, east]] = bounds;
  const pixelScale = [(east - west) / width, (north - south) / height, 0];
  const tiepoint = [0, 0, 0, west, north, 0];
  const geoKeys = [1, 1, 0, 3, 1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326];
  const software = "GeoSense AI\0";
  const entries = 17;
  const ifdOffset = 8;
  const ifdSize = 2 + entries * 12 + 4;
  let dataOffset = ifdOffset + ifdSize;
  const bitsOffset = dataOffset; dataOffset += 6;
  const scaleOffset = dataOffset; dataOffset += 24;
  const tiepointOffset = dataOffset; dataOffset += 48;
  const geoKeyOffset = dataOffset; dataOffset += geoKeys.length * 2;
  const softwareOffset = dataOffset; dataOffset += software.length;
  const pixelOffset = dataOffset;
  const out = new Uint8Array(pixelOffset + rgb.length);
  const view = new DataView(out.buffer);
  writeAscii(view, 0, "II");
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entries, true);

  let entry = ifdOffset + 2;
  const tag = (id: number, type: number, count: number, value: number) => {
    view.setUint16(entry, id, true);
    view.setUint16(entry + 2, type, true);
    view.setUint32(entry + 4, count, true);
    if ((type === 3 && count <= 2) || (type === 4 && count === 1)) {
      if (type === 3) view.setUint16(entry + 8, value, true);
      else view.setUint32(entry + 8, value, true);
    } else {
      view.setUint32(entry + 8, value, true);
    }
    entry += 12;
  };

  tag(256, 4, 1, width);
  tag(257, 4, 1, height);
  tag(258, 3, 3, bitsOffset);
  tag(259, 3, 1, 1);
  tag(262, 3, 1, 2);
  tag(273, 4, 1, pixelOffset);
  tag(277, 3, 1, 3);
  tag(278, 4, 1, height);
  tag(279, 4, 1, rgb.length);
  tag(284, 3, 1, 1);
  tag(305, 2, software.length, softwareOffset);
  tag(33550, 12, 3, scaleOffset);
  tag(33922, 12, 6, tiepointOffset);
  tag(34735, 3, geoKeys.length, geoKeyOffset);
  tag(339, 3, 1, 1);
  tag(338, 3, 1, 1);
  tag(274, 3, 1, 1);
  view.setUint32(entry, 0, true);

  [8, 8, 8].forEach((value, index) => view.setUint16(bitsOffset + index * 2, value, true));
  pixelScale.forEach((value, index) => view.setFloat64(scaleOffset + index * 8, value, true));
  tiepoint.forEach((value, index) => view.setFloat64(tiepointOffset + index * 8, value, true));
  geoKeys.forEach((value, index) => view.setUint16(geoKeyOffset + index * 2, value, true));
  writeAscii(view, softwareOffset, software);
  out.set(rgb, pixelOffset);
  return new Blob([out], { type: "image/tiff" });
}

export async function makeRasterPdf(config: RasterPreviewConfig) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(18);
  doc.text("Raster Calculation Report", 40, 44);
  doc.setFontSize(10);
  doc.text(`Name: ${config.name}`, 40, 72);
  doc.text(`Index: ${config.indexKey}`, 40, 90);
  doc.text(`Date: ${config.date}`, 40, 108);
  doc.text(`Expression: ${config.expression}`, 40, 126);
  doc.text(`Center: ${config.coords.lat.toFixed(6)}, ${config.coords.lng.toFixed(6)}`, 40, 144);
  if (config.dataUrl) doc.addImage(config.dataUrl, "PNG", 360, 70, 420, 260);
  const [[south, west], [north, east]] = config.bounds;
  doc.text(`Bounds: W ${west.toFixed(5)}, S ${south.toFixed(5)}, E ${east.toFixed(5)}, N ${north.toFixed(5)}`, 40, 170);
  doc.setDrawColor(34, 211, 238);
  doc.rect(40, 195, 260, 170);
  doc.text("Basic map footprint", 52, 216);
  doc.text("NW", 52, 244);
  doc.text("NE", 270, 244);
  doc.text("SW", 52, 346);
  doc.text("SE", 270, 346);
  doc.save(`${sanitizeFileName(config.name)}_report.pdf`);
}

async function getSignedPlanetaryComputerUrl(url: string) {
  try {
    const response = await fetch(`https://planetarycomputer.microsoft.com/api/sas/v1/sign?href=${encodeURIComponent(url)}`);
        console.log("Response Status:", response.status);
    if (!response.ok) return url;
    const data = await response.json();
    console.log("Returned Data:", data);
    return typeof data?.href === "string" ? data.href : url;
  } catch {
    return url;
  }
}

async function downloadExternalFile(url: string, fileName: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download ${response.status}`);
    const blob = await response.blob();
    triggerBlobDownload(blob, fileName);
  } catch {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

export function SatelliteDataPanel({
  selectedFeature,
  onPreview,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  onPreview?: (config: SatellitePreviewConfig) => void;
}) {
  const [source, setSource] = useState<"sentinel-2" | "landsat">("sentinel-2");
  const [dateFrom, setDateFrom] = useState("2026-04-10");
  const [dateTo, setDateTo] = useState("2026-05-10");
  const [cloudCover, setCloudCover] = useState(20);
  const [band, setBand] = useState<IdxKey>("RGB");
  const [viewerMode, setViewerMode] = useState<SatelliteViewerMode>("multispectral");
  const [falseColorEnabled, setFalseColorEnabled] = useState(false);
  const [opacity, setOpacity] = useState(86);
  const [isLoading, setIsLoading] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [sceneStatus, setSceneStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [apiScenes, setApiScenes] = useState<SatelliteScene[]>([]);
  const [sceneFormats, setSceneFormats] = useState<Record<string, SatelliteDownloadFormat>>({});
  const [downloadingSceneId, setDownloadingSceneId] = useState<string | null>(null);
  const [previewingSceneId, setPreviewingSceneId] = useState<string | null>(null);
  const [activePreviewSceneId, setActivePreviewSceneId] = useState<string | null>(null);
  const [scenePreviewUrls, setScenePreviewUrls] = useState<Record<string, string>>({});

const polygonRing = useMemo(
  () => getPolygonRing(selectedFeature),
  [selectedFeature]
);
const displayVertices = useMemo(() => {
  if (!polygonRing || polygonRing.length === 0) return [];
  const ring = polygonRing as unknown as [number, number][];
  if (ring.length > 1) {
    const [firstLng, firstLat] = ring[0];
    const [lastLng, lastLat] = ring[ring.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) return ring.slice(0, -1);
  }
  return ring;
}, [polygonRing]);
  const [clipToShape, setClipToShape] = useState(true);
  const [clippedThumbs, setClippedThumbs] = useState<Record<string, string>>({});  
  const coords = getMidCoords(selectedFeature);
  const bounds = getFeatureBounds(selectedFeature, coords ? { lat: coords[0], lng: coords[1] } : undefined);
  const [[south, west], [north, east]] = bounds;
  const satKey: SatKey =
    source === "sentinel-2"
      ? "Sentinel-2"
      : "Default";  
    const sourceMeta = {
    "sentinel-2": { title: "Sentinel-2", subtitle: "Primary source", resolution: "10m", cadence: "5 days", color: "#22d3ee" },
    landsat: { title: "Landsat", subtitle: "Secondary source", resolution: "30m", cadence: "16 days", color: "#f59e0b" },
  }[source];

  const bandOptions: { key: IdxKey; label: string; desc: string; color: string }[] = [
    { key: "RGB", label: "RGB", desc: "Default true color", color: "#e2e8f0" },
    { key: "NDVI", label: "NDVI", desc: "Vegetation vigor", color: "#22c55e" },
    { key: "NDWI", label: "NDWI", desc: "Water signal", color: "#38bdf8" },
    { key: "NDMI", label: "NDMI", desc: "Moisture stress", color: "#a78bfa" },
    { key: "SWIR", label: "SWIR", desc: "Dryness view", color: "#fb923c" },
  ];

  const fallbackScenes = useMemo<SatelliteScene[]>(() => {
  return [
    { id: "S2A-20260507", cloud: 8, score: 96, date: "2026-05-07" },
    { id: "S2B-20260430", cloud: 14, score: 88, date: "2026-04-30" },
    { id: "LC09-20260424", cloud: 18, score: 81, date: "2026-04-24" },
  ]
    .filter((scene) => scene.cloud <= cloudCover)
    .map((scene) => ({
      ...scene,
      collection: scene.id.startsWith("LC")
        ? "landsat-c2-l2"
        : "sentinel-2-l2a",
      geometry: bboxGeometry([west, south, east, north]),
      bbox: [west, south, east, north],
    }));
}, [cloudCover, west, south, east, north]);

const scenes = useMemo(
  () => (apiScenes.length ? apiScenes : fallbackScenes),
  [apiScenes, fallbackScenes]
);

  type AnalysisType = SatelliteAnalysisType;
  const activeAnalysis = (falseColorEnabled ? "SWIR" : band) as AnalysisType;

  const getVisualization = (analysis: AnalysisType, collection = source === "landsat" ? "landsat-c2-l2" : "sentinel-2-l2a") => {
    const isLandsat = collection.includes("landsat");

    if (isLandsat) {
      switch (analysis) {
        case "RGB":
          return {
            assets: ["red", "green", "blue"],
            expression: null,
          };

        case "NDVI":
          return {
            assets: ["nir08", "red"],
            expression: "(nir08-red)/(nir08+red)",
          };

        case "NDWI":
          return {
            assets: ["green", "nir08"],
            expression: "(green-nir08)/(green+nir08)",
          };

        case "NDMI":
          return {
            assets: ["nir08", "swir16"],
            expression: "(nir08-swir16)/(nir08+swir16)",
          };

        case "SWIR":
          return {
            assets: ["swir16", "nir08", "red"],
            expression: null,
          };

        default:
          return {
            assets: ["red", "green", "blue"],
            expression: null,
          };
      }
    }

    switch (analysis) {
      case "RGB":
        return {
          assets: ["B04", "B03", "B02"],
          expression: null,
        };

      case "NDVI":
        return {
          assets: ["B08", "B04"],
          expression: "(B08-B04)/(B08+B04)",
        };

      case "NDWI":
        return {
          assets: ["B03", "B08"],
          expression: "(B03-B08)/(B03+B08)",
        };

      case "NDMI":
        return {
          assets: ["B08", "B11"],
          expression: "(B08-B11)/(B08+B11)",
        };

      case "SWIR":
        return {
          assets: ["B11", "B08", "B04"],
          expression: null,
        };

      default:
        return {
          assets: ["B04", "B03", "B02"],
          expression: null,
        };
    }
  };

  // 1. هنحول الـ bounds لنص ثابت برة الـ useEffect عشان نستخدمه في الـ dependency array بأمان
const boundsString = bounds ? JSON.stringify(bounds) : "";

useEffect(() => {
  if (!clipToShape || !polygonRing) {
    setClippedThumbs({});
    return;
  }
  let cancelled = false;
  (async () => {
    const next: Record<string, string> = {};
    for (const scene of scenes) {
      const src = scene.thumbnail ?? scene.previewUrl;
      
      // نستخدم الـ bounds الأصلي هنا في الحسابات عادي
      const currentBounds = bounds; 
      if (!src || !currentBounds) continue;
      try {
        const clipped = await clipImageToPolygon(src, currentBounds, polygonRing);
        if (!cancelled) next[scene.id] = clipped;
      } catch {
        // إذا فشل الـ clip نتركها
      }
    }
    if (!cancelled) setClippedThumbs(next);
  })();
  return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [scenes, clipToShape, polygonRing, boundsString]); // الكود هنا معتمد على boundsString النصي وليس الـ Array! // أضفنا bounds للمصفوفة لضمان التحديث عند تغيير المكان

// useEffect(() => {
//   console.log("effect fired");
// }, [scenes]);

  const activeVisualization = getVisualization(activeAnalysis, source === "landsat" ? "landsat-c2-l2" : "sentinel-2-l2a");
  const legendConfig = SATELLITE_LEGENDS[activeAnalysis];

  const normalizeBandAssetKey = (key: string) => {
    const upper = key.toUpperCase();
    const match = upper.match(/^B0?(\d{1,2})$/);
    return match ? `B${match[1].padStart(2, "0")}` : upper;
  };

  const getAssetLookupKeys = (assetKey: string) => {
    const normalizedKey = normalizeBandAssetKey(assetKey);
    return Array.from(new Set([
      assetKey,
      normalizedKey,
      assetKey.toLowerCase(),
      assetKey.toUpperCase(),
      assetKey.replace(/^B0/, "B"),
      normalizedKey.replace(/^B0/, "B"),
    ]));
  };

  const getSceneAssetUrls = (scene: SatelliteScene, analysis: AnalysisType) => {
    const visualization = getVisualization(analysis, scene.collection);
    const sceneAssets = scene.assets ?? {};
    return visualization.assets.reduce<Record<string, string>>((acc, assetKey) => {
      const href = getAssetLookupKeys(assetKey).map((key) => sceneAssets[key]).find(Boolean);
      if (href) acc[assetKey] = href;
      return acc;
    }, {});
  };

  const sceneHasVisualizationAssets = (scene: SatelliteScene, analysis: AnalysisType) => {
    const sceneAssets = scene.assets ?? {};
    return getVisualization(analysis, scene.collection).assets.every((asset) => (
      getAssetLookupKeys(asset).some((key) => Boolean(sceneAssets[key]))
    ));
  };

  const getIndexPreviewStyle = (analysis: AnalysisType) => {
    switch (analysis) {
      case "NDVI":
        // -0.2 (صحراء/رمل) → 0.9 (نخل/غابة كثيفة)
        return { rescale: "-0.2,0.9", colormap: "rdylgn" };
      case "NDWI":
        // -0.3 (جاف) → 0.8 (مياه مفتوحة)
        return { rescale: "-0.3,0.8", colormap: "rdbu" };
      case "NDMI":
        // -0.6 (إجهاد مائي شديد) → 0.6 (رطوبة عالية)
        return { rescale: "-0.6,0.6", colormap: "rdbu_r" };
      case "SWIR":
        return { rescale: "0,3000", colormap: "" };
      default:
        return { rescale: "0,3000", colormap: "" };
    }
  };

  // Analysis type (Panel) → "type" param اللي الـ /api/raster-proxy/analyze route عايزه
  const RASTER_PROXY_TYPE: Record<AnalysisType, "rgb" | "swir" | "ndvi" | "ndwi" | "ndmi"> = {
    RGB: "rgb",
    SWIR: "swir",
    NDVI: "ndvi",
    NDWI: "ndwi",
    NDMI: "ndmi",
  };

  // بديل makePlanetaryComputerPreviewUrl — بيبني رابط الـ backend الجديد
  // /api/raster-proxy/analyze بدل ما يودّي على titiler بتاع Planetary Computer.
  // التوقيع (SAS signing) بقى بيحصل جوه الـ route نفسه (مع caching) بدل ما
  // الفرونت تعمل 2-3 requests منفصلة لـ Planetary Computer قبل ما تكلم
  // الباك بتاعنا أصلًا — ده كان بيضيف latency واضح قبل ما أي حاجة تتبعت.
  const makeRasterProxyAnalyzeUrl = (
    scene: SatelliteScene,
    analysis: AnalysisType
  ): string | undefined => {
    if (
      !scene.id ||
      !scene.collection ||
      !sceneHasVisualizationAssets(scene, analysis)
    ) {
      return scene.previewUrl ?? scene.thumbnail ?? scene.itemUrl;
    }

    const visualization = getVisualization(analysis, scene.collection);
    const assetUrlMap = getSceneAssetUrls(scene, analysis);

    // لازم نحافظ على ترتيب الـ bands زي ما route.ts متوقعه
    // (rgb/swir → 3 بواندات، ndvi/ndwi/ndmi → 2 بواندات بترتيب معين)
    const rawUrls = visualization.assets.map((assetKey) => assetUrlMap[assetKey]).filter(Boolean);
    if (rawUrls.length !== visualization.assets.length) {
      return scene.previewUrl ?? scene.thumbnail ?? scene.itemUrl;
    }

    // بنبعت الروابط الخام (Unsigned) زي ما هي — الـ route هو اللي هيوقّعها
    // ويعمل cache للتوقيع، فمفيش أي request منفصل هنا قبل الوصول للباك.
    const type = RASTER_PROXY_TYPE[analysis];
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("urls", rawUrls.join(","));
    // bbox إلزامي في الـ route — من غيره هيحاول يقرا الـ scene كاملة ويعلّق
    params.set("bbox", `${west},${south},${east},${north}`);

    if (visualization.expression) {
      // index (ndvi/ndwi/ndmi): نبعت الـ rescale المخصص للـ analysis
      // الـ colormap بنسيبه على default الـ route نفسه (rdylgn/rdbu/greens)
      const style = getIndexPreviewStyle(analysis);
      const [minVal, maxVal] = style.rescale.split(",");
      params.set("min", minVal);
      params.set("max", maxVal);
    } else {
      // composite (rgb/swir)
      params.set("gamma", analysis === "SWIR" ? "1.2" : "1.35");
      params.set("sharpen", "1");
    }

    return `/api/raster-proxy/analyze?${params.toString()}`;
  };

  const hasPreviewSource = (scene: SatelliteScene, analysis: AnalysisType) =>
    Boolean(scene.previewUrl ?? scene.thumbnail ?? scene.itemUrl) ||
    sceneHasVisualizationAssets(scene, analysis);

  

  const fetchScenes = async () => {
    setSceneStatus("loading");
    setSceneError(null);

    try {
      const collection = source === "sentinel-2" ? "sentinel-2-l2a" : "landsat-c2-l2";
      const response = await fetch("https://planetarycomputer.microsoft.com/api/stac/v1/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collections: [collection],
          bbox: [west, south, east, north],
          datetime: `${dateFrom}T00:00:00Z/${dateTo}T23:59:59Z`,
          limit: 12,
        }),
        
      });
      console.log("AFTER FETCH");
      console.log(response);

      if (!response.ok) throw new Error(`STAC API ${response.status}`);
      const payload = await response.json();
      console.log(payload,"AFTER PARSE");
      const features = Array.isArray(payload?.features) ? payload.features : [];
      const nextScenes = features
        .map((feature: StacFeature): SatelliteScene => {
          const props = feature?.properties ?? {};
          const cloud = Number(props["eo:cloud_cover"] ?? props["landsat:cloud_cover_land"] ?? 0);
          const date = String(props.datetime ?? "").slice(0, 10) || dateTo;
          const thumbnail =
            feature?.assets?.rendered_preview?.href ??
            feature?.assets?.thumbnail?.href ??
            feature?.assets?.overview?.href;
          const itemUrl =
            feature?.links?.find((link) => link.rel === "self")?.href ??
            feature?.links?.find((link) => link.rel === "alternate")?.href;
          const rawAssetUrl = Object.values(feature?.assets ?? {}).find((asset) => {
            const href = asset?.href?.toLowerCase() ?? "";
            const type = asset?.type?.toLowerCase() ?? "";
            const title = asset?.title?.toLowerCase() ?? "";
            return href.includes(".tif") || href.includes(".tiff") || type.includes("geotiff") || title.includes("geotiff");
          })?.href;
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
            cloud: Number.isFinite(cloud) ? Math.round(cloud) : 0,
            score: Math.max(1, Math.round(100 - (Number.isFinite(cloud) ? cloud : 0))),
            date,
            collection,
            geometry: feature.geometry ?? null,
            bbox: feature.bbox,
            thumbnail,
            previewUrl: thumbnail,
            itemUrl,
            rawAssetUrl,
            assets,
          };
        })
        .filter((scene: SatelliteScene) => scene.cloud <= cloudCover)
        .sort((a: SatelliteScene, b: SatelliteScene) => b.score - a.score)
        .slice(0, 6);

      setApiScenes(nextScenes);
      setSceneStatus("success");
      if (!nextScenes.length) setSceneError("No matching scenes from the external STAC API for this AOI/date/cloud filter.");
    } catch (error: unknown) {
      setApiScenes([]);
      setSceneStatus("error");
      setSceneError(error instanceof Error ? error.message : "External satellite API request failed.");
    }
  };

  const handlePreview = async () => {
    setIsLoading(true);
    setPreviewReady(false);
    await fetchScenes();
    window.setTimeout(() => {
      setPreviewReady(true);
      setIsLoading(false);
    },);
  };

  const handlePreviewScene = async (scene: SatelliteScene) => {
  const analysis = activeAnalysis;
  const rawPreviewUrl = makeRasterProxyAnalyzeUrl(scene, analysis);
  
  // تعديل أساسي: اجعلي الخريطة تركز وتتعامل مع الـ AOI bounds الخاص بكِ مباشرة لمنع الـ Zoom Out العنيف
  const sceneBounds = bounds; 
  
  const sceneCoords = boundsCenter(sceneBounds);
  const visualization = getVisualization(analysis, scene.collection);
  const overviewUrl = scene.previewUrl ?? scene.thumbnail ?? makeRasterProxyAnalyzeUrl(scene, "RGB");

  setPreviewingSceneId(scene.id);
  setSceneError(null);

  let previewUrl = rawPreviewUrl;
  if (clipToShape && polygonRing && rawPreviewUrl) {
    try {
      previewUrl = await clipImageToPolygon(rawPreviewUrl, sceneBounds, polygonRing);
    } catch {
      previewUrl = rawPreviewUrl; 
    }
  }

if (previewUrl && scenePreviewUrls[scene.id] !== previewUrl) {
  setScenePreviewUrls((prev) => ({ ...prev, [scene.id]: previewUrl }));
}
  setPreviewingSceneId(null);

  setActivePreviewSceneId(scene.id);
  onPreview?.({
    source,
    satKey,
    band: analysis,
    dateFrom,
    dateTo,
    cloudCover,
    opacity: opacity / 100,
    scenePreview: {
      name: `${scene.id}_overview`,
      band: analysis,
      expression: visualization.expression,
      assets: visualization.assets,
      assetUrls: getSceneAssetUrls(scene, analysis),
      bounds: sceneBounds, // سيعود بالـ AOI المحدد ولن يخرج خارج النطاق
      coords: sceneCoords,
      previewUrl,
      overviewUrl,
      geometry: bboxGeometry([
        sceneBounds[0][1],
        sceneBounds[0][0],
        sceneBounds[1][1],
        sceneBounds[1][0],
      ]),
    },
  });
  setPreviewReady(true);
};

  useEffect(() => {
    if (!activePreviewSceneId) return;
    const scene = scenes.find((item) => item.id === activePreviewSceneId);
    if (!scene) return;
    void handlePreviewScene(scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnalysis]);

// المتصفحات الحديثة (خصوصًا Chrome) بتمنع window.open على data: URLs مباشرة
// (بترجع تاب فاضي/about:blank كإجراء أمان) — ده اللي كان بيخلي "Open" مايعملش
// حاجة لما "Clip to drawn shape" يكون شغال، لإن clipImageToPolygon بترجع
// data URL. الحل: نحوّلها لـ Blob ونفتح object URL بدالها (مسموح بيه).
function openImageUrlSafely(url: string) {
  if (!url.startsWith("data:")) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  try {
    const [meta, base64] = url.split(",");
    const mimeMatch = meta.match(/data:([^;]+);base64/);
    const mime = mimeMatch?.[1] ?? "image/png";
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const objectUrl = URL.createObjectURL(blob);
    const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
    // لو المتصفح لسه عامل block (popup blocker)، سيبيها فترة أطول عشان مايتقفلش الـ objectUrl قبل ما يستخدمه
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), opened ? 60_000 : 5_000);
  } catch {
    // fallback أخير: لو فشل التحويل لأي سبب، جرّبي تفتحيه زي ما هو
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

  const handleOpenScene = async (scene: SatelliteScene) => {
  const analysis = activeAnalysis;
  // نفس مصدر الصورة اللي بيتعرض في "Preview on map" وبينزل في "Download PNG"،
  // مش الـ thumbnail الصغير بتاع STAC (ده كان بيبقى undefined غالبًا فالزرار ميعملش حاجة)
  const url =
    scenePreviewUrls[scene.id] ??
    makeRasterProxyAnalyzeUrl(scene, analysis) ??
    clippedThumbs[scene.id] ??
    scene.previewUrl ??
    scene.thumbnail ??
    scene.itemUrl;
  if (!url) return;
  openImageUrlSafely(url);
};

  const handleDownloadScene = async (scene: SatelliteScene) => {
    const format = sceneFormats[scene.id] ?? "png";
    const analysis = activeAnalysis;
    const baseName = sanitizeFileName(`${scene.id}_${analysis}`);
    setDownloadingSceneId(scene.id);

    try {
      if (format === "png") {
        const imageUrl = scenePreviewUrls[scene.id] ?? makeRasterProxyAnalyzeUrl(scene, analysis);
        if (!imageUrl) return;
        await downloadExternalFile(imageUrl, `${baseName}.png`);
        return;
      }

      if (format === "geojson") {
        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: [sceneFeature(scene)],
        };
        triggerBlobDownload(
          new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" }),
          `${baseName}.geojson`
        );
        return;
      }

      if (format === "shapefile") {
        triggerBlobDownload(makeShapefileZip(scene), `${baseName}.zip`);
        return;
      }

      if (format === "geotiff") {
        if (!scene.rawAssetUrl) return;
        const signedUrl = await getSignedPlanetaryComputerUrl(scene.rawAssetUrl);
        await downloadExternalFile(signedUrl, `${baseName}.tif`);
      }
    } finally {
      setDownloadingSceneId(null);
    }
  };

  const handleApplyLegacyViewer = () => {
    setFalseColorEnabled(false);
    onPreview?.({
      source,
      satKey: "Default",
      band: "RGB",
      dateFrom,
      dateTo,
      cloudCover,
      opacity: opacity / 100,
    });
    setPreviewReady(true);
  };

  const showSourceControls = viewerMode !== "analysis";
  const showMultispectralControls = viewerMode === "multispectral" || viewerMode === "analysis";
  const showSceneSearch = viewerMode === "multispectral" || viewerMode === "analysis" || viewerMode === "download";
  const showDownloadOnly = viewerMode === "download";
  const showSceneDownloads = viewerMode === "download";

 return (
  <div className="space-y-4">
    {/* Satellite Data Integration Header */}
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Satellite Data Integration</p>
          <p className="text-xs text-slate-300 mt-1">Separated legacy and multispectral data pipelines</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-semibold" style={{ color: sourceMeta.color }}>{sourceMeta.resolution}</p>
          <p className="text-[0.58rem] text-slate-500">{sourceMeta.cadence}</p>
        </div>
      </div>
    </div>

    {/* Pipelines Selection Buttons */}
    <div className="grid grid-cols-2 gap-2">
      {SATELLITE_PIPELINES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          onClick={() => setViewerMode(mode.key)}
          className={`rounded-lg border p-3 text-left transition-all cursor-pointer ${
            viewerMode === mode.key ? "border-cyan-400/35 bg-cyan-400/10" : "border-white/[0.06] bg-white/[0.025] hover:border-white/[0.14]"
          }`}
        >
          <span className="block text-[0.68rem] font-semibold text-slate-200">{mode.label}</span>
          <span className="mt-1 block text-[0.53rem] text-slate-500">{mode.desc}</span>
        </button>
      ))}
    </div>

    {/* Active Pipeline Status */}
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Active pipeline</p>
          <p className="mt-1 truncate font-mono text-[0.58rem] text-cyan-200">
            {SATELLITE_PIPELINES.find((mode) => mode.key === viewerMode)?.pipeline}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[0.55rem] font-semibold text-emerald-300">
          isolated
        </span>
      </div>
    </div>

    {/* Source Controls (Satellite Type, Dates, Cloud Threshold) */}
    {showSourceControls && (
      <>
        <div className="grid grid-cols-2 gap-2">
          {[
            { key: "sentinel-2" as const, title: "Sentinel-2", sub: "Primary", color: "#22d3ee" },
            { key: "landsat" as const, title: "Landsat", sub: "Secondary", color: "#f59e0b" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSource(item.key)}
              className={`rounded-lg border p-3 text-left transition-all cursor-pointer ${
                source === item.key ? "bg-white/[0.07] border-cyan-400/35" : "bg-white/[0.025] border-white/[0.06] hover:border-white/[0.14]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                <span className="text-xs font-semibold text-slate-200">{item.title}</span>
              </div>
              <p className="text-[0.58rem] text-slate-500 mt-1">{item.sub}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <DatePickerField label="From" value={dateFrom} max={dateTo} onChange={setDateFrom} />
          <DatePickerField label="To" value={dateTo} min={dateFrom} onChange={setDateTo} />
        </div>

        <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Cloud cover threshold</span>
            <span className="text-xs font-semibold text-cyan-300">{cloudCover}%</span>
          </div>
          <input type="range" min={0} max={80} value={cloudCover} onChange={(e) => setCloudCover(Number(e.target.value))} className="w-full accent-cyan-400" />
        </div>
      </>
    )}

    {/* Multispectral Controls (Band selector & Legend) */}
    {showMultispectralControls && (
      <div className="space-y-2">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Band selector</p>
        <div className="grid grid-cols-2 gap-2">
          {bandOptions.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setBand(item.key);
                setFalseColorEnabled(false);
              }}
              className={`rounded-lg border px-3 py-2 text-left transition-all cursor-pointer ${
                !falseColorEnabled && activeAnalysis === item.key ? "bg-cyan-400/10 border-cyan-400/35" : "bg-white/[0.025] border-white/[0.06] hover:border-white/[0.14]"
              }`}
            >
              <span className="text-xs font-bold" style={{ color: item.color }}>{item.label}</span>
              <span className="block text-[0.55rem] text-slate-500 mt-0.5 truncate">{item.desc}</span>
            </button>
          ))}
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {activeVisualization.assets.map((asset) => (
              <span key={asset} className="rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 font-mono text-[0.58rem] text-cyan-200">
                {asset}
              </span>
            ))}
            <span className="text-[0.58rem] text-slate-500">
              {activeVisualization.expression ?? "RGB composite"}
            </span>
          </div>
        </div>
      </div>
    )}

    {/* Analysis Mode Dashboard */}
    {viewerMode === "analysis" && (
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Analysis Module</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[0.62rem]">
          <div className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-2 text-slate-300">
            Index: <span className="font-semibold text-cyan-200">{activeAnalysis}</span>
          </div>
          <div className="rounded-md border border-white/[0.06] bg-white/[0.025] px-2 py-2 text-slate-300">
            Scenes: <span className="font-semibold text-emerald-200">{scenes.length}</span>
          </div>
        </div>
      </div>
    )}

    {/* AOI Filtering / BBOX Card */}
    <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">AOI filtering</p>
          <p className="text-[0.65rem] text-slate-400 mt-1">
            {coords ? `AOI center ${coords[0].toFixed(4)}, ${coords[1].toFixed(4)}` : "No AOI selected. Using current map preview."}
          </p>
          <p className="text-[0.55rem] text-slate-600 mt-1 font-mono">
            BBOX {west.toFixed(4)}, {south.toFixed(4)}, {east.toFixed(4)}, {north.toFixed(4)}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[0.55rem] font-semibold ${
          coords ? "bg-emerald-400/10 text-emerald-300 border border-emerald-400/20" : "bg-amber-400/10 text-amber-300 border border-amber-400/20"
        }`}>
          {coords ? "AOI" : "MAP"}
        </span>
      </div>

      {selectedFeature && displayVertices.length > 0 && (
        <div className="mt-2 border-t border-white/[0.06] pt-2">
          <div className="flex items-center justify-between">
            <p className="text-[0.55rem] text-slate-500 uppercase tracking-wider">
              Polygon vertices
            </p>
            <span className="text-[0.55rem] text-slate-600">
              {displayVertices.length} pts
            </span>
          </div>
          <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-white/[0.05] bg-[#020817]/50">
            {displayVertices.map((point, index) => {
              const [lng, lat] = point;
              return (
                <div
                  key={`${index}-${lng}-${lat}`}
                  className="flex items-center justify-between gap-2 px-2 py-1 text-[0.55rem] font-mono text-slate-400 border-b border-white/[0.03] last:border-b-0"
                >
                  <span className="text-slate-600">#{index + 1}</span>
                  <span>
                    {lat.toFixed(6)}, {lng.toFixed(6)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>

    {/* Opacity Control & Load Button */}
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Preview opacity</p>
        <span className="text-[0.65rem] text-slate-400">{opacity}%</span>
      </div>
      <input type="range" min={25} max={100} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} className="w-full accent-cyan-400" />
      
      <button
        type="button"
        onClick={handlePreview}
        disabled={sceneStatus === "loading"}
        className="mt-2 h-9 w-full rounded-lg border border-cyan-400/25 
                   bg-cyan-400/10 text-cyan-200 text-xs font-semibold
                   transition-all hover:bg-cyan-400/15 hover:border-cyan-400/40
                   disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {sceneStatus === "loading" ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin text-cyan-300" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Loading Scenes...
          </span>
        ) : (
          "Load Satellite Scenes"
        )}
      </button>
    </div>

    {/* Matching Scenes Section Header */}
    <div className="pt-2 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider">Matching scenes</p>
        <span className="text-[0.58rem] text-slate-500">
          {sceneStatus === "loading" ? "loading" : `${scenes.length} found`}
        </span>
      </div>
      
      {sceneStatus === "success" && apiScenes.length > 0 && (
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-2 text-[0.62rem] text-emerald-200">
          External STAC API connected. Results are filtered by AOI, date range, and cloud cover.
        </div>
      )}
      
      {sceneError && (
        <div className="rounded-lg border border-amber-400/18 bg-amber-400/[0.05] px-3 py-2 text-[0.62rem] text-amber-200">
          {sceneError} Showing local preview candidates instead.
        </div>
      )}
    </div>

    {/* CLIP TO DRAWN SHAPE TOGGLE (PERFECT DARK THEME DESIGN) */}
    <div className="rounded-xl border border-white/[0.04] bg-[#020817]/40 p-4 transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
  <span
    className={`text-[0.65rem] font-bold tracking-wider uppercase ${
      clipToShape ? "text-cyan-300" : "text-slate-400"
    }`}
  >
    CLIP TO DRAWN SHAPE
  </span>

  <span
    className={`rounded-full px-2 py-0.5 text-[0.55rem] font-bold ${
      clipToShape
        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
        : "bg-slate-700/30 text-slate-400 border border-slate-600/50"
    }`}
  >
    {clipToShape ? "ACTIVE" : "OFF"}
  </span>
</div>
          <span className="text-[0.58rem] leading-normal text-slate-500 max-w-[210px]">
  {clipToShape
    ? "Only pixels inside the drawn polygon will be displayed."
    : "Entire satellite scene will be displayed."}
</span>
        </div>

        {/* المنزلق التفاعلي التابع لثيم GeoSense AI */}
        <button
          type="button"
          onClick={() => setClipToShape(!clipToShape)}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border border-white/[0.06] transition-colors duration-200 ease-in-out focus:outline-none ${
            clipToShape ? "bg-cyan-500/80 shadow-[0_0_12px_rgba(34,211,238,0.25)]" : "bg-[#020817]/80"
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-[14px] w-[14px] transform rounded-full bg-slate-300 shadow-md transition duration-200 ease-in-out mt-[2px] ml-[2px] ${
              clipToShape ? "translate-x-4 bg-white" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>

    {/* Scenes Results List */}
    <div className="space-y-2">
      {scenes.length ? (
        scenes.map((scene) => (
          <div key={scene.id} className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
            <div className="flex items-center gap-3">
              {(clippedThumbs[scene.id] ?? scene.thumbnail) ? (
                <img src={clippedThumbs[scene.id] ?? scene.thumbnail} alt="" className="w-8 h-8 rounded-md border border-white/[0.08] object-cover bg-slate-900" />
              ) : (
                <div className="w-8 h-8 rounded-md border border-white/[0.08] bg-gradient-to-br from-slate-700 via-emerald-800 to-cyan-700" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[0.68rem] text-slate-200 truncate">{scene.id}</p>
                <p className="text-[0.55rem] text-slate-500">{formatDateDMY(scene.date)} | cloud {scene.cloud}% | {scene.collection}</p>
              </div>
              <span className="text-[0.62rem] text-emerald-300">{scene.score}</span>
            </div>
            
            <div className={`mt-2 grid gap-2 ${showSceneDownloads ? "grid-cols-[1fr_auto_auto]" : "grid-cols-1"}`}>
              {showSceneDownloads && (
                <>
                  <select
                    value={sceneFormats[scene.id] ?? "png"}
                    onChange={(e) => setSceneFormats((prev) => ({
                      ...prev,
                      [scene.id]: e.target.value as SatelliteDownloadFormat,
                    }))}
                    className="h-7 rounded-md border border-white/[0.08] bg-[#020817]/80 px-2 text-[0.62rem] text-slate-300 outline-none focus:border-cyan-400/40"
                    title="Download format"
                  >
                    <option value="png">PNG preview ({activeAnalysis})</option>
                    <option value="geojson">GeoJSON (vector)</option>
                    <option value="shapefile">Shapefile (.zip)</option>
                    <option value="geotiff" disabled={!scene.rawAssetUrl}>GeoTIFF (raster)</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleOpenScene(scene)}
                    disabled={!hasPreviewSource(scene, activeAnalysis)}
                    className="h-7 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-[0.62rem] font-medium text-slate-300 transition-colors hover:border-cyan-400/30 hover:bg-cyan-400/10 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    Open
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => handlePreviewScene(scene)}
                disabled={previewingSceneId === scene.id}
                className="h-7 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 text-[0.62rem] font-semibold text-cyan-200 transition-colors hover:border-cyan-400/40 hover:bg-cyan-400/15 disabled:cursor-wait disabled:opacity-55"
              >
                {previewingSceneId === scene.id ? "..." : "Preview on map"}
              </button>
            </div>

            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedScene({
                    id: scene.id,
                    collection: scene.collection,
                    date: scene.date,
                    cloud: scene.cloud,
                  });
                  openRasterCalculatorPanel();
                }}
                className="h-7 w-full rounded-md border border-emerald-400/25 bg-emerald-400/[0.08] px-2 text-[0.62rem] font-semibold text-emerald-200 transition-colors hover:border-emerald-400/45 hover:bg-emerald-400/15"
                title="Sends this exact scene to Raster Calculator, skipping its own date/cloud search"
              >
                Use this scene in Raster Calculator
              </button>
            </div>

            {activePreviewSceneId === scene.id && (
              <div className="mt-2 rounded-md border border-cyan-400/16 bg-cyan-400/[0.05] p-2 text-[0.58rem] text-cyan-100">
                {scenePreviewUrls[scene.id] && (
                  <img src={scenePreviewUrls[scene.id]} alt={`${scene.id} ${activeAnalysis} preview`} className="mb-2 aspect-video w-full rounded-md border border-white/[0.08] bg-slate-950 object-cover" />
                )}
                Image preview uses {getVisualization(activeAnalysis, scene.collection).assets.join(", ")}
                {getVisualization(activeAnalysis, scene.collection).expression ? ` | ${getVisualization(activeAnalysis, scene.collection).expression}` : " | RGB composite"}
              </div>
            )}

            {showSceneDownloads && (
              <div className="mt-2 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadScene(scene)}
                  disabled={
                    downloadingSceneId === scene.id ||
                    ((sceneFormats[scene.id] ?? "png") === "geotiff" && !scene.rawAssetUrl)
                  }
                  className="h-7 rounded-md border border-emerald-400/20 bg-emerald-400/10 text-[0.62rem] font-semibold text-emerald-200 transition-colors hover:border-emerald-400/40 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {downloadingSceneId === scene.id ? "Preparing download..." : `Download ${sceneFormats[scene.id] === "shapefile" ? "Shapefile" : sceneFormats[scene.id] === "geotiff" ? "GeoTIFF" : sceneFormats[scene.id] === "geojson" ? "GeoJSON" : `${activeAnalysis} PNG`}`}
                </button>
              </div>
            )}
          </div>
        ))
      ) : (
        <div className="rounded-lg border border-amber-400/18 bg-amber-400/[0.05] px-3 py-2 text-[0.65rem] text-amber-200">
          No scenes match the current cloud threshold.
        </div>
      )}
    </div>

    {/* Footer Notification */}
    {previewReady && (
      <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2 text-[0.65rem] text-emerald-200">
        Scenes ready. Choose a band, then preview or download the scene image.
      </div>
    )}
  </div>
);}