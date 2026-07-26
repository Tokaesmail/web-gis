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
}: Props) {
  const { data: session } = useSession();
  const accessToken = (session?.user as any)?.accessToken as string | undefined;

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(daysAgo(30));
  const [dateTo, setDateTo] = useState(todayStr);
  const [expression, setExpression] = useState("");

  const [status, setStatus] = useState<"idle" | "capturing" | "loading" | "error" | "success">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [loadingSeconds, setLoadingSeconds] = useState(0);

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
      // geo_bounds: حدود اللقطة الكاملة اللي الصورة اتقصت منها — fallback لحدود
      // الشكل نفسه لو مفيش viewport bounds لأي سبب
      form.append("geo_bounds", JSON.stringify(boundsToArray(capture.viewportBounds ?? capture.bounds)));

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
      console.log("[Palm debug] geo_bounds:", boundsToArray(capture.viewportBounds ?? capture.bounds));
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
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <p className="mb-1.5 text-[0.62rem] uppercase tracking-wider text-slate-500">Formula / condition</p>
        <textarea
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          rows={3}
          placeholder="e.g. NDVI > 0.35 AND height > 3"
          className="w-full resize-none rounded-lg border border-white/[0.08] bg-[#020817]/80 px-3 py-2 font-mono text-xs leading-relaxed text-cyan-200 outline-none focus:border-cyan-400/40"
        />
        <p className="mt-1.5 text-[0.58rem] text-slate-500">
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

          <button
            type="button"
            onClick={() => { setStatus("idle"); setResult(null); }}
            className="text-[0.6rem] text-slate-400 hover:text-slate-200 underline"
          >
            Run another analysis
          </button>
        </div>
      )}
    </div>
  );
}