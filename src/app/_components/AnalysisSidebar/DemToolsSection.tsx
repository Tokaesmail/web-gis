"use client";

// ─── DemToolsSection.tsx ───────────────────────────────────────────────────────
// The "DEM Tools" tab of ElevationContourPanel.
//
// Flow: load the DEM once (the same ElevationGrid the Elevation tab uses) →
// pick a tool → tweak it → preview → "Add to Map".
// Every tool is derived from that one grid (see lib/demTools.ts); the source
// elevation data is never modified.

import React, { useEffect, useMemo, useRef, useState } from "react";
import { gridToContours } from "../../../../lib/marchingSquares";
import { sanitizeContours, type ElevationGrid } from "../../../../lib/elevation";
import {
  ASPECT_CSS,
  CURV_CSS,
  RAMPS,
  RAMP_IDS,
  SLOPE_CSS,
  buildRaster,
  cellSizeMeters,
  colorizeContours,
  computeDerivs,
  niceInterval,
  rampCss,
  rasterToPolygons,
  type DemToolId,
  type RampId,
  type RGB,
} from "../../../../lib/demTools";

// ── tool catalogue (order follows the course handout) ─────────────────────────
const TOOLS: { id: DemToolId; name: string; hint: string; blurb: string; swatch: string; wide?: boolean }[] = [
  {
    id: "colorramp",
    name: "Color ramp",
    hint: "Height as color",
    blurb: "Colors the DEM by height, low ground to high ground, so you see how elevation is distributed at a glance.",
    swatch: rampCss("hypsometric"),
  },
  {
    id: "hillshade",
    name: "Hillshade",
    hint: "Light and shadow",
    blurb: "Lights the terrain from one direction so ridges, valleys and geological edges stand out.",
    swatch: "linear-gradient(to right,#0a0f16,#f1f5f9)",
  },
  {
    id: "slope",
    name: "Slope",
    hint: "How steep",
    blurb: "How steep the ground is in every cell.",
    swatch: SLOPE_CSS,
  },
  {
    id: "aspect",
    name: "Aspect",
    hint: "Facing direction",
    blurb: "The compass direction each cell faces downhill. Gray cells are flat.",
    swatch: ASPECT_CSS,
  },
  {
    id: "contour",
    name: "Contour",
    hint: "Lines of equal height",
    blurb: "Lines of equal elevation. Each line is colored by its height, so you can read the terrain without a legend.",
    swatch:
      "repeating-linear-gradient(90deg, rgba(4,13,26,0.9) 0 2px, transparent 2px 6px), linear-gradient(to right,#2f7d4f,#ead98a,#8b5e3c)",
  },
  {
    id: "multihill",
    name: "Multi-directional",
    hint: "Light from 4 sides",
    blurb: "Averages light from four directions, so no slope disappears into a shadow.",
    swatch: "linear-gradient(to right,#161d27,#b4bcc7,#f1f5f9)",
  },
  {
    id: "curvature",
    name: "Curvature",
    hint: "Ridges and valleys",
    blurb: "Finds ridges and crests (convex) and valleys (concave) from a 3×3 window around each cell.",
    swatch: CURV_CSS,
    wide: true,
  },
];

// ── small UI pieces (match the existing panel's tokens) ───────────────────────
const CARD = "bg-white/[0.03] border border-white/[0.07] rounded-xl p-3";
const HEAD = "text-[0.62rem] text-slate-500 uppercase tracking-wider";
const FOCUS = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70";

function Slider({
  label, value, min, max, step = 1, unit = "", hint, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; hint?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] text-slate-400">{label}</span>
        <span className="text-[0.65rem] text-cyan-300 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
      />
      {hint && <p className="text-[0.55rem] text-slate-600">{hint}</p>}
    </div>
  );
}

function Segmented<T extends string>({
  value, options, onChange,
}: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center bg-white/[0.03] border border-white/[0.07] rounded-lg p-0.5 gap-0.5">
      {options.map((o) => (
        <button
          key={o.key} type="button" onClick={() => onChange(o.key)} aria-pressed={value === o.key}
          className={`flex-1 px-2 py-1 rounded-md text-[0.62rem] font-medium transition-colors cursor-pointer ${FOCUS} ${
            value === o.key ? "bg-cyan-400 text-[#040d1a]" : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  label, checked, hint, onChange,
}: { label: string; checked: boolean; hint?: string; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-[0.65rem] text-slate-300">{label}</p>
        {hint && <p className="text-[0.55rem] text-slate-600 mt-0.5">{hint}</p>}
      </div>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={`relative shrink-0 w-8 h-[18px] rounded-full transition-colors cursor-pointer ${FOCUS} ${
          checked ? "bg-cyan-400" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-[#040d1a] transition-transform ${
            checked ? "translate-x-[14px]" : ""
          } ${checked ? "" : "!bg-slate-400"}`}
        />
      </button>
    </div>
  );
}

function RampPicker({
  ramp, reverse, onRamp, onReverse,
}: { ramp: RampId; reverse: boolean; onRamp: (r: RampId) => void; onReverse: (v: boolean) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-3 gap-1.5">
        {RAMP_IDS.map((id) => (
          <button
            key={id} type="button" onClick={() => onRamp(id)} aria-pressed={ramp === id}
            className={`rounded-lg border p-1.5 text-left transition-colors cursor-pointer ${FOCUS} ${
              ramp === id ? "border-cyan-400/60 bg-cyan-400/[0.08]" : "border-white/[0.07] hover:border-white/20"
            }`}
          >
            <div className="h-2.5 rounded-sm" style={{ background: rampCss(id, reverse) }} />
            <p className={`mt-1 text-[0.58rem] truncate ${ramp === id ? "text-cyan-200" : "text-slate-500"}`}>
              {RAMPS[id].label}
            </p>
          </button>
        ))}
      </div>
      <Toggle label="Reverse colors" checked={reverse} onChange={onReverse} />
    </div>
  );
}

function Legend({ css, ticks }: { css: string; ticks: { t: number; label: string }[] }) {
  return (
    <div>
      <div className="h-2 rounded-full" style={{ background: css }} />
      <div className="relative h-3.5 mt-1">
        {ticks.map((k, i) => (
          <span
            key={i}
            className="absolute text-[0.58rem] text-slate-500 whitespace-nowrap"
            style={{
              left: `${k.t * 100}%`,
              transform: k.t <= 0 ? "none" : k.t >= 1 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {k.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RasterCanvas({ colors, smooth }: { colors: (RGB | null)[][]; smooth: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const H = colors.length;
    const W = colors[0]?.length ?? 0;
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const col = colors[y][x];
        const i = (y * W + x) * 4;
        if (col) {
          img.data[i] = col[0];
          img.data[i + 1] = col[1];
          img.data[i + 2] = col[2];
          img.data[i + 3] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [colors]);
  return (
    <canvas
      ref={ref}
      className="absolute inset-0 w-full h-full"
      style={{ imageRendering: smooth ? "auto" : "pixelated" }}
    />
  );
}

const Spinner = () => (
  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// ── قص خلايا الـ DEM على شكل الـ AOI بالظبط ────────────────────────────────────
// Sutherland–Hodgman: بنقص حلقة الـ AOI على مستطيل الخلية (الخلية محدّبة، فبيشتغل مع أي AOI).
function clipRingToRect(ring: number[][], w: number, e: number, s: number, n: number): number[][] | null {
  let pts =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice();
  const edges: { inside: (p: number[]) => boolean; cut: (a: number[], b: number[]) => number[] }[] = [
    { inside: (p) => p[0] >= w, cut: (a, b) => [w, a[1] + ((w - a[0]) / (b[0] - a[0])) * (b[1] - a[1])] },
    { inside: (p) => p[0] <= e, cut: (a, b) => [e, a[1] + ((e - a[0]) / (b[0] - a[0])) * (b[1] - a[1])] },
    { inside: (p) => p[1] >= s, cut: (a, b) => [a[0] + ((s - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), s] },
    { inside: (p) => p[1] <= n, cut: (a, b) => [a[0] + ((n - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), n] },
  ];
  for (const ed of edges) {
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i];
      const prev = pts[(i + pts.length - 1) % pts.length];
      if (ed.inside(cur)) {
        if (!ed.inside(prev)) out.push(ed.cut(prev, cur));
        out.push(cur);
      } else if (ed.inside(prev)) {
        out.push(ed.cut(prev, cur));
      }
    }
    pts = out;
    if (pts.length < 3) return null;
  }
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  if (Math.abs(area) < 1e-14) return null;
  return [...pts, pts[0]];
}

function clipCellsToAoi(fc: GeoJSON.FeatureCollection, aoi: any): GeoJSON.FeatureCollection {
  const polys: number[][][][] = aoi?.type === "Polygon" ? [aoi.coordinates] : aoi?.type === "MultiPolygon" ? aoi.coordinates : [];
  if (!polys.length) return fc;
  const features: GeoJSON.Feature[] = [];
  for (const f of fc.features) {
    const ring: number[][] | undefined = (f.geometry as any)?.coordinates?.[0];
    if (!ring?.length) continue;
    let w = Infinity, e = -Infinity, so = Infinity, n = -Infinity;
    for (const [x, y] of ring) {
      if (x < w) w = x; if (x > e) e = x;
      if (y < so) so = y; if (y > n) n = y;
    }
    const parts = polys.map((poly) => clipRingToRect(poly[0], w, e, so, n)).filter(Boolean) as number[][][];
    if (!parts.length) continue;
    features.push({
      ...f,
      geometry: parts.length === 1
        ? { type: "Polygon", coordinates: [parts[0]] }
        : { type: "MultiPolygon", coordinates: parts.map((r) => [r]) },
    });
  }
  return { ...fc, features };
}

// ── توحيد شكل الـ grid ───────────────────────────────────────────────────────
// الـ grid المشترك مع تبويب Elevation بيتبني corner-aligned (أول/آخر عينة على حدود الـ AOI)، لكن
// الـ preview والخلايا على الخريطة والـ hover كلهم بيتعاملوا مع كل عينة كخلية في منتصفها.
// ده كان بيخلّي الـ row/col والارتفاع يطلعوا مختلفين بين الـ preview والخريطة. فهنا بنحوّل أي grid
// corner-aligned لـ grid خلاياه متمركزة (نفس عدد الأعمدة/الصفوف) بـ bilinear، وكل حاجة في
// الكومبوننت (preview, derivatives, polygons, hover) بتستخدم نفس الـ grid.
function toCellCentered(g: ElevationGrid): ElevationGrid {
  const { cols, rowsCount: R, bounds } = g;
  if (cols < 2 || R < 2) return g;
  if (Math.abs(g.lngs[0] - bounds.west) > 1e-9) return g; // already cell-centered
  const lngSpan = bounds.east - bounds.west || 1e-9;
  const latSpan = bounds.north - bounds.south || 1e-9;
  const lngs = Array.from({ length: cols }, (_, x) => bounds.west + (lngSpan * (x + 0.5)) / cols);
  const lats = Array.from({ length: R }, (_, y) => bounds.north - (latSpan * (y + 0.5)) / R);
  let min = Infinity, max = -Infinity;
  const rows = lats.map((lat) =>
    lngs.map((lng) => {
      const fx = Math.min(cols - 1, Math.max(0, ((lng - bounds.west) / lngSpan) * (cols - 1)));
      const fy = Math.min(R - 1, Math.max(0, ((bounds.north - lat) / latSpan) * (R - 1)));
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(R - 1, y0 + 1);
      const tx = fx - x0, ty = fy - y0;
      const top = g.rows[y0][x0] * (1 - tx) + g.rows[y0][x1] * tx;
      const bot = g.rows[y1][x0] * (1 - tx) + g.rows[y1][x1] * tx;
      const v = top * (1 - ty) + bot * ty;
      if (v < min) min = v;
      if (v > max) max = v;
      return v;
    })
  );
  return { ...g, rows, lngs, lats, min, max };
}

// ── main section ──────────────────────────────────────────────────────────────
interface Props {
  grid: ElevationGrid | null;
  bounds: { north: number; south: number; east: number; west: number };
  selectedFeature?: GeoJSON.Feature | null;
  areaWarning: React.ReactNode;
  resolution: number;
  onResolutionChange: (n: number) => void;
  loading: boolean;
  error: string | null;
  onLoadDem: () => void;
  clip: (fc: GeoJSON.FeatureCollection, label?: string) => GeoJSON.FeatureCollection;
  onSendToMap: (fc: GeoJSON.FeatureCollection, prefix: string) => void;
  notice: { ok: boolean; text: string } | null;
}

export default function DemToolsSection({
  grid: rawGrid, bounds, selectedFeature, areaWarning, resolution, onResolutionChange,
  loading, error, onLoadDem, clip, onSendToMap, notice,
}: Props) {
  const grid = useMemo(() => (rawGrid ? toCellCentered(rawGrid) : null), [rawGrid]);
  const [tool, setTool] = useState<DemToolId>("colorramp");
  const [ramp, setRamp] = useState<RampId>("hypsometric");
  const [reverse, setReverse] = useState(false);
  const [blend, setBlend] = useState(true);
  const [azimuth, setAzimuth] = useState(315);
  const [altitude, setAltitude] = useState(45);
  const [zFactor, setZFactor] = useState(2);
  const [slopeUnit, setSlopeUnit] = useState<"deg" | "pct">("deg");
  const [interval, setIntervalM] = useState(25);
  const [indexLines, setIndexLines] = useState(true);
  const [smooth, setSmooth] = useState(true);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  // pick a readable contour interval whenever a new DEM arrives
  useEffect(() => {
    if (grid) setIntervalM(niceInterval(Math.max(grid.max - grid.min, 1)));
  }, [grid]);

  const derivs = useMemo(() => (grid ? computeDerivs(grid) : null), [grid]);

  // the raster that is painted: the tool's own result, or a quiet hillshade under the contour lines
  const raster = useMemo(() => {
    if (!grid || !derivs) return null;
    return buildRaster(grid, derivs, tool === "contour" ? "hillshade" : tool, {
      ramp, reverse, azimuth, altitude, zFactor, slopeUnit, blend,
    });
  }, [grid, derivs, tool, ramp, reverse, azimuth, altitude, zFactor, slopeUnit, blend]);

  const contours = useMemo(() => {
    if (!grid || tool !== "contour") return null;
    const lines = sanitizeContours(clip(gridToContours(grid, { interval }), "dem-contour"));
    return colorizeContours(lines, grid, { interval, ramp, reverse, index: indexLines });
  }, [grid, tool, interval, ramp, reverse, indexLines, clip]);

  const stale =
    !!grid &&
    (Math.abs(grid.bounds.north - bounds.north) > 1e-6 ||
      Math.abs(grid.bounds.south - bounds.south) > 1e-6 ||
      Math.abs(grid.bounds.east - bounds.east) > 1e-6 ||
      Math.abs(grid.bounds.west - bounds.west) > 1e-6);

  const meta = TOOLS.find((t) => t.id === tool)!;

  // ── preview geometry ──
  const preview = (() => {
    if (!grid) return null;
    const midLat = (grid.bounds.north + grid.bounds.south) / 2;
    const { cols, rowsCount: rws } = grid;
    // ✅ نسبة الأبعاد من شبكة الخلايا الفعلية (cols × rows × حجم الخلية) — دي نفس الشبكة
    //    اللي بتترسم منها المضلعات على الخريطة. قبل كده كانت من حدود الـ AOI ومقصوصة
    //    بين 0.55 و2.2، فالـ preview كان بيتمط ومش بيطابق الخريطة.
    const dLng = cols > 1 ? Math.abs(grid.lngs[1] - grid.lngs[0]) : (grid.bounds.east - grid.bounds.west) / Math.max(cols, 1);
    const dLat = rws > 1 ? Math.abs(grid.lats[0] - grid.lats[1]) : (grid.bounds.north - grid.bounds.south) / Math.max(rws, 1);
    const geo =
      (cols * dLng * Math.cos((midLat * Math.PI) / 180)) /
      Math.max(rws * dLat, 1e-9);
    const aspectRatio = Math.min(4, Math.max(0.3, geo));
    // contour vertices sit on cell centers → map them to the middle of each canvas pixel
    const px = (lng: number) =>
      ((((lng - grid.lngs[0]) / (grid.lngs[cols - 1] - grid.lngs[0])) * (cols - 1) + 0.5) / cols) * 100;
    const py = (lat: number) =>
      ((((grid.lats[0] - lat) / (grid.lats[0] - grid.lats[rws - 1])) * (rws - 1) + 0.5) / rws) * 100;
    return { aspectRatio, cols, rws, px, py };
  })();

  const lineSegments = (f: GeoJSON.Feature): number[][][] => {
    const g = f.geometry as any;
    if (g?.type === "LineString") return [g.coordinates];
    if (g?.type === "MultiLineString") return g.coordinates;
    return [];
  };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!preview) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(preview.cols - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * preview.cols)));
    const y = Math.min(preview.rws - 1, Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * preview.rws)));
    setHover({ x, y });
  };

  const readout =
    hover && grid && raster
      ? `${tool === "contour"
          ? `${grid.rows[hover.y][hover.x].toFixed(0)} m`
          : raster.format(raster.values[hover.y][hover.x])} · row ${hover.y + 1} · col ${hover.x + 1}`
      : null;

  const stats =
    tool === "contour"
      ? [
          { l: "Lines", v: String(contours?.features.length ?? 0) },
          { l: "Interval", v: `${interval} m` },
          {
            l: "Levels",
            v: String(new Set((contours?.features ?? []).map((f) => (f.properties as any)?.elevation)).size),
          },
        ]
      : raster?.stats ?? [];

  const canAdd = tool === "contour" ? !!contours?.features.length : !!raster;

  const handleAdd = () => {
    if (!grid) return;
    if (tool === "contour") {
      if (contours) onSendToMap(contours, "dem-contours");
    } else if (raster) {
      // ✅ الصورة على قد الـ AOI بالظبط: كل الخلايا (من غير فلترة بمركز الخلية) وبعدين كل خلية
      //    بتتقص على حدود الشكل المرسوم — مفيش حاجة بتعدّي الـ AOI ومفيش حواف مسنّنة.
      const aoiG: any = selectedFeature?.geometry;
      const isPoly = aoiG?.type === "Polygon" || aoiG?.type === "MultiPolygon";
      const cells = withCellValues(rasterToPolygons(grid, raster, isPoly ? null : selectedFeature, tool));
      onSendToMap(isPoly ? clipCellsToAoi(cells, aoiG) : cells, `dem-${tool}`);
    }
  };

  // ✅ كل خلية بتاخد القيمة بتاعتها كـ properties (Elevation / اسم الأداة) — LeafletMap بيعرض
  //    أول 3 properties في tooltip لما الماوس يعدّي على المضلع، فالقيمة بتظهر على الخريطة
  //    زي ما بتظهر في الـ preview.
  const withCellValues = (fc: GeoJSON.FeatureCollection): GeoJSON.FeatureCollection => {
    if (!grid || !raster) return fc;
    const { cols, rowsCount: rws, lngs, lats } = grid;
    const lngSpan = lngs[cols - 1] - lngs[0] || 1e-9;
    const latSpan = lats[0] - lats[rws - 1] || 1e-9;
    return {
      ...fc,
      features: fc.features.map((f) => {
        const g: any = f.geometry;
        const ring: number[][] | undefined =
          g?.type === "Polygon" ? g.coordinates?.[0] : g?.type === "MultiPolygon" ? g.coordinates?.[0]?.[0] : undefined;
        if (!ring || ring.length < 3) return f;
        const pts = ring.length > 3 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1) : ring;
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const x = Math.min(cols - 1, Math.max(0, Math.round(((cx - lngs[0]) / lngSpan) * (cols - 1))));
        const y = Math.min(rws - 1, Math.max(0, Math.round(((lats[0] - cy) / latSpan) * (rws - 1))));
        const elev = grid.rows[y]?.[x];
        const val = raster.values[y]?.[x];
        const added: Record<string, string> = {};
        if (Number.isFinite(elev)) added["Elevation"] = `${Math.round(elev)} m`;
        if (tool !== "colorramp" && Number.isFinite(val)) added[meta.name] = raster.format(val);
        added["Cell"] = `row ${y + 1} · col ${x + 1}`; // نفس الرقم بيظهر في الـ preview — للمقارنة
        // باقي الـ properties (tool/value/color/fill…) بتتخبى بـ "_" عشان الـ tooltip يعرض القيمة بس
        const hidden: Record<string, any> = {};
        for (const [k, v] of Object.entries(f.properties ?? {})) hidden[k.startsWith("_") ? k : `_${k}`] = v;
        return { ...f, properties: { ...added, ...hidden, _demCell: true } };
      }),
    };
  };

  const cell = grid ? cellSizeMeters(grid) : null;
  const sourceLabel = grid
    ? grid.source === "open-meteo" ? "Copernicus DEM 90 m"
      : grid.source === "opentopodata" ? "SRTM 30 m (fallback)"
      : grid.source === "open-elevation" ? "SRTM (fallback)"
      : "Mixed sources"
    : "";

  return (
    <>
      {/* ── DEM source ── */}
      <div className={`${CARD} space-y-3`}>
        <div className="flex items-center justify-between">
          <p className={HEAD}>DEM source</p>
          {grid && (
            <span
              className={`text-[0.55rem] px-1.5 py-0.5 rounded-full border ${
                grid.source === "open-meteo"
                  ? "bg-cyan-400/10 text-cyan-300 border-cyan-400/20"
                  : "bg-amber-400/10 text-amber-300 border-amber-400/20"
              }`}
            >
              {sourceLabel}
            </span>
          )}
        </div>

        {grid && cell ? (
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { l: "Lowest", v: `${grid.min.toFixed(0)} m` },
              { l: "Highest", v: `${grid.max.toFixed(0)} m` },
              { l: "Cell size", v: `≈ ${Math.round((cell.dx + cell.dy) / 2)} m` },
            ].map((s) => (
              <div key={s.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-cyan-300">{s.v}</p>
                <p className="text-[0.55rem] text-slate-500 mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[0.65rem] text-slate-400 leading-relaxed">
            Load the elevation raster for your area once. Every tool below is computed from it, so the
            original DEM is never changed.
          </p>
        )}

        <Slider
          label="Grid resolution" value={resolution} min={6} max={32}
          unit={`×${resolution}`}
          hint="Higher gives more detail but takes more requests."
          onChange={onResolutionChange}
        />

        {areaWarning}

        <button
          onClick={onLoadDem}
          disabled={loading}
          className={`w-full h-9 rounded-lg disabled:opacity-60 disabled:cursor-wait text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${FOCUS} ${
            grid
              ? "bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 font-semibold"
              : "bg-cyan-400 hover:bg-cyan-300 text-[#03101d]"
          }`}
        >
          {loading ? (
            <><Spinner />Fetching elevation…</>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 17l4-8 4 4 4-6 4 10" />
              </svg>
              {grid ? "Reload DEM" : "Load DEM for this area"}
            </>
          )}
        </button>

        {stale && !loading && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-[0.62rem] text-amber-300">
            The selected area changed since this DEM was loaded. Reload the DEM to match it.
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2 text-[0.62rem] text-red-300">
            {error}
          </div>
        )}
      </div>

      {grid && raster && preview && (
        <>
          {/* ── tool picker ── */}
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="DEM tools">
            {TOOLS.map((t) => {
              const on = t.id === tool;
              return (
                <button
                  key={t.id} type="button" onClick={() => { setTool(t.id); setHover(null); }} aria-pressed={on}
                  className={`${t.wide ? "col-span-2" : ""} text-left rounded-xl border p-2.5 transition-colors cursor-pointer ${FOCUS} ${
                    on
                      ? "border-cyan-400/60 bg-cyan-400/[0.08] shadow-[0_0_14px_rgba(0,212,255,0.12)]"
                      : "border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <p className={`text-[0.7rem] font-semibold ${on ? "text-cyan-100" : "text-slate-200"}`}>{t.name}</p>
                  <p className="text-[0.55rem] text-slate-500 mt-0.5 mb-2">{t.hint}</p>
                  <div className="h-1.5 rounded-full" style={{ background: t.swatch }} />
                </button>
              );
            })}
          </div>

          {/* ── settings ── */}
          <div className={`${CARD} space-y-3`}>
            <div>
              <p className="text-xs font-semibold text-slate-200">{meta.name}</p>
              <p className="text-[0.62rem] text-slate-500 leading-relaxed mt-0.5">{meta.blurb}</p>
            </div>

            {tool === "colorramp" && (
              <>
                <RampPicker ramp={ramp} reverse={reverse} onRamp={setRamp} onReverse={setReverse} />
                <Toggle
                  label="Blend hillshade" checked={blend} onChange={setBlend}
                  hint="Adds relief shading under the colors."
                />
                {blend && (
                  <Slider label="Vertical exaggeration" value={zFactor} min={1} max={10} unit="×" onChange={setZFactor} />
                )}
              </>
            )}

            {tool === "hillshade" && (
              <>
                <Slider label="Light direction" value={azimuth} min={0} max={360} step={5} unit="°" onChange={setAzimuth} />
                <Slider label="Sun height" value={altitude} min={5} max={85} step={5} unit="°" onChange={setAltitude} />
                <Slider
                  label="Vertical exaggeration" value={zFactor} min={1} max={10} unit="×"
                  hint="Raise it on flat areas to make the relief readable."
                  onChange={setZFactor}
                />
              </>
            )}

            {tool === "multihill" && (
              <>
                <Slider label="Sun height" value={altitude} min={5} max={85} step={5} unit="°" onChange={setAltitude} />
                <Slider
                  label="Vertical exaggeration" value={zFactor} min={1} max={10} unit="×"
                  hint="Light comes from 225°, 270°, 315° and 360°."
                  onChange={setZFactor}
                />
              </>
            )}

            {tool === "slope" && (
              <Segmented
                value={slopeUnit} onChange={setSlopeUnit}
                options={[{ key: "deg", label: "Degrees" }, { key: "pct", label: "Percent" }]}
              />
            )}

            {tool === "contour" && (
              <>
                <Slider label="Contour interval" value={interval} min={1} max={200} unit=" m" onChange={setIntervalM} />
                <RampPicker ramp={ramp} reverse={reverse} onRamp={setRamp} onReverse={setReverse} />
                <Toggle
                  label="Emphasize every 5th line" checked={indexLines} onChange={setIndexLines}
                  hint="Thicker index contours, like a topographic map."
                />
              </>
            )}

            {(tool === "aspect" || tool === "curvature") && (
              <p className="text-[0.6rem] text-slate-600">No settings. Computed from the DEM as it is.</p>
            )}
          </div>

          {/* ── preview ── */}
          <div className={`${CARD} space-y-3`}>
            <div className="flex items-center justify-between gap-2">
              <p className={HEAD}>Preview</p>
              <div className="w-32">
                <Segmented
                  value={smooth ? "smooth" : "cells"} onChange={(v) => setSmooth(v === "smooth")}
                  options={[{ key: "smooth", label: "Smooth" }, { key: "cells", label: "Cells" }]}
                />
              </div>
            </div>

            <div
              className="relative w-full overflow-hidden rounded-lg border border-white/[0.07] bg-[#020813]"
              style={{ aspectRatio: preview.aspectRatio }}
              onMouseMove={onMove}
              onMouseLeave={() => setHover(null)}
            >
              <RasterCanvas colors={raster.colors} smooth={smooth} />

              {contours && (
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 100 100" preserveAspectRatio="none"
                >
                  {contours.features.map((f, i) => {
                    const p: any = f.properties;
                    return lineSegments(f).map((seg, j) => (
                      <path
                        key={`${i}-${j}`}
                        d={seg
                          .map(([lng, lat], k) => `${k === 0 ? "M" : "L"}${preview.px(lng).toFixed(2)},${preview.py(lat).toFixed(2)}`)
                          .join(" ")}
                        fill="none" stroke={p.color}
                        strokeWidth={p.index ? 1.8 : 1}
                        strokeLinejoin="round" strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    ));
                  })}
                </svg>
              )}

              {hover && (
                <span
                  className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full border border-white bg-white/20 pointer-events-none"
                  style={{
                    left: `${((hover.x + 0.5) / preview.cols) * 100}%`,
                    top: `${((hover.y + 0.5) / preview.rws) * 100}%`,
                  }}
                />
              )}
              {readout && (
                <span className="absolute left-1.5 top-1.5 rounded bg-[#040d1a]/85 border border-white/10 px-1.5 py-0.5 text-[0.6rem] font-mono text-cyan-200 pointer-events-none">
                  {readout}
                </span>
              )}
            </div>

            {tool === "contour" ? (
              <Legend
                css={rampCss(ramp, reverse)}
                ticks={[
                  { t: 0, label: `${Math.round(grid.min)} m` },
                  { t: 0.5, label: `${Math.round((grid.min + grid.max) / 2)} m` },
                  { t: 1, label: `${Math.round(grid.max)} m` },
                ]}
              />
            ) : (
              <Legend css={raster.legend.css} ticks={raster.legend.ticks} />
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {stats.map((s) => (
                <div key={s.l} className="bg-white/[0.04] border border-white/[0.06] rounded-lg p-2 text-center">
                  <p className="text-xs font-bold text-cyan-300 truncate">{s.v}</p>
                  <p className="text-[0.55rem] text-slate-500 mt-0.5">{s.l}</p>
                </div>
              ))}
            </div>

            {tool === "contour" && !contours?.features.length && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-2 text-[0.62rem] text-amber-300">
                No lines at a {interval} m interval. Lower the interval or load a larger area.
              </div>
            )}

            <p className="text-[0.58rem] text-slate-600 text-center">
              Hover the preview to read the value under the cursor.
            </p>

            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className={`w-full h-9 rounded-lg bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-400/25 disabled:opacity-50 disabled:cursor-not-allowed text-emerald-300 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2 ${FOCUS}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add {meta.name} to Map
            </button>
            {tool !== "contour" && (
              <p className="text-[0.55rem] text-slate-600 text-center">
                Sent as colored cell polygons, one per grid cell inside your area.
              </p>
            )}

            {notice && (
              <div
                className={`rounded-lg border px-2.5 py-2 text-[0.62rem] ${
                  notice.ok
                    ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
                    : "border-red-500/20 bg-red-500/[0.06] text-red-300"
                }`}
              >
                {notice.text}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}