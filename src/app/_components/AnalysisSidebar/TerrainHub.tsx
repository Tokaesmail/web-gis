"use client";

// ─── TerrainHub.tsx ─────────────────────────────────────────────────────────────
// One entry point for everything terrain / weather related, shaped like the
// "Insights → New Insight" flow:
//
//   Terrain                     ← hub: a vertical list of cards
//   ├─ Weather                  ← click a card …
//   ├─ Elevation contours
//   └─ DEM tools                ← … and it opens as its own screen, with a back link
//
// <TerrainHub>            the content. Fills whatever container you put it in, so it can be
//                         rendered inside AnalysisSidebar as well.
// <FloatingElevationPanel> same name/props MapClient already uses, but now a docked,
//                         full-height panel that hosts <TerrainHub>.

import React, { useEffect, useState } from "react";
import ElevationContourPanel, { type ContourMode } from "./ElevationContourPanel";

type View = "hub" | ContourMode;

const TITLES: Record<ContourMode, string> = {
  weather: "Weather",
  elevation: "Elevation contours",
  dem: "DEM tools",
};

// ── card thumbnails (small SVG illustrations, no external images) ─────────────
const Thumb = ({ children, bg }: { children: React.ReactNode; bg: string }) => (
  <svg viewBox="0 0 72 72" className="w-full h-full" aria-hidden="true">
    <defs>
      <linearGradient id={`tg-${bg}`} x1="0" y1="0" x2="1" y2="1">
        {bg === "weather" && (<><stop offset="0" stopColor="#1d4ed8" /><stop offset=".5" stopColor="#facc15" /><stop offset="1" stopColor="#dc2626" /></>)}
        {bg === "elevation" && (<><stop offset="0" stopColor="#14532d" /><stop offset=".6" stopColor="#4d7c0f" /><stop offset="1" stopColor="#a16207" /></>)}
        {bg === "dem" && (<><stop offset="0" stopColor="#2f7d4f" /><stop offset=".35" stopColor="#ead98a" /><stop offset=".7" stopColor="#8b5e3c" /><stop offset="1" stopColor="#f4f1ec" /></>)}
      </linearGradient>
      <radialGradient id="tg-shade" cx=".3" cy=".25" r=".9">
        <stop offset="0" stopColor="#fff" stopOpacity=".35" />
        <stop offset=".6" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity=".45" />
      </radialGradient>
    </defs>
    <rect width="72" height="72" fill={`url(#tg-${bg})`} />
    {children}
  </svg>
);

const THUMBS: Record<ContourMode, React.ReactNode> = {
  weather: (
    <Thumb bg="weather">
      <g fill="none" stroke="#fff" strokeOpacity=".75" strokeWidth="1.4" strokeLinecap="round">
        <path d="M-4 22 C 16 10, 34 34, 52 20 S 74 24, 80 18" />
        <path d="M-4 38 C 14 26, 36 50, 54 36 S 74 40, 80 34" />
        <path d="M-4 54 C 16 42, 34 66, 52 52 S 74 56, 80 50" />
      </g>
    </Thumb>
  ),
  elevation: (
    <Thumb bg="elevation">
      <g fill="none" stroke="#fef3c7" strokeOpacity=".8" strokeWidth="1.2">
        <ellipse cx="38" cy="38" rx="30" ry="22" transform="rotate(-18 38 38)" />
        <ellipse cx="38" cy="38" rx="21" ry="15" transform="rotate(-18 38 38)" />
        <ellipse cx="38" cy="38" rx="12" ry="8" transform="rotate(-18 38 38)" />
        <ellipse cx="38" cy="38" rx="4" ry="2.5" transform="rotate(-18 38 38)" />
      </g>
    </Thumb>
  ),
  dem: (
    <Thumb bg="dem">
      <rect width="72" height="72" fill="url(#tg-shade)" />
      <g fill="none" stroke="#040d1a" strokeOpacity=".25" strokeWidth="1">
        <path d="M0 48 L22 30 L40 44 L72 18" />
      </g>
    </Thumb>
  ),
};

const CARDS: { id: ContourMode; desc: string; chips: string[] }[] = [
  {
    id: "weather",
    desc: "Live temperature across your area, drawn as lines of equal temperature.",
    chips: ["Live", "Open-Meteo"],
  },
  {
    id: "elevation",
    desc: "Sample the terrain height for your area and draw contour lines at any interval.",
    chips: ["Copernicus 90 m", "Lines"],
  },
  {
    id: "dem",
    desc: "Color ramp, hillshade, slope, aspect, contours and curvature from one elevation raster.",
    chips: ["7 tools", "Raster"],
  },
];

const Chevron = ({ dir = "right", className = "" }: { dir?: "right" | "left"; className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
    <path d={dir === "right" ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
  </svg>
);

interface HubProps {
  selectedFeature?: GeoJSON.Feature | null;
  onContoursGenerated?: (geojson: GeoJSON.FeatureCollection, fileName: string) => void;
  onClose?: () => void;
  /** Rendered inside AnalysisSidebar: the sidebar already provides the header, close button
   *  and scrolling, so the hub only draws its own back row when a tool is open. */
  embedded?: boolean;
}

export function TerrainHub({ selectedFeature, onContoursGenerated, onClose, embedded = false }: HubProps) {
  const [view, setView] = useState<View>("hub");
  const [opened, setOpened] = useState(false); // mount the heavy panel only after the first visit

  const gt = selectedFeature?.geometry?.type;
  const hasArea = gt === "Polygon" || gt === "MultiPolygon";

  const go = (v: View) => {
    if (v !== "hub") setOpened(true);
    setView(v);
  };

  return (
    <div className={embedded ? "space-y-3" : "flex flex-col h-full min-h-0"}>
      {/* ── header: breadcrumb + close (in the sidebar: only the back row, and only inside a tool) ── */}
      {(!embedded || view !== "hub") && (
      <div className={embedded
        ? "flex items-center gap-2 -mt-1 pb-2.5 border-b border-white/[0.07]"
        : "shrink-0 flex items-center gap-2 px-4 h-12 border-b border-white/[0.07]"}>
        {view !== "hub" && (
          <button
            type="button" onClick={() => go("hub")} aria-label="Back to Terrain"
            className="-ml-1.5 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
          >
            <Chevron dir="left" />
          </button>
        )}
        <nav className="flex-1 min-w-0 flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
          <button
            type="button" onClick={() => go("hub")} disabled={view === "hub"}
            className={`transition-colors ${view === "hub" ? "font-semibold text-slate-100 cursor-default" : "text-slate-500 hover:text-slate-300 cursor-pointer"}`}
          >
            Terrain
          </button>
          {view !== "hub" && (
            <>
              <Chevron className="text-slate-600 shrink-0" />
              <span className="font-semibold text-slate-100 truncate">{TITLES[view]}</span>
            </>
          )}
        </nav>
        {onClose && !embedded && (
          <button
            type="button" onClick={onClose} aria-label="Close"
            className="w-7 h-7 -mr-1.5 flex items-center justify-center rounded-md text-slate-500 hover:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
          >
            <svg width="12" height="12" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        )}
      </div>
      )}

      {/* ── hub: vertical list of cards ── */}
      {view === "hub" && (
        <div className={embedded ? "space-y-2.5" : "flex-1 min-h-0 overflow-y-auto p-3 space-y-2.5"}>
          <div
            className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[0.65rem] leading-relaxed ${
              hasArea
                ? "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300"
                : "border-amber-500/20 bg-amber-500/[0.06] text-amber-300"
            }`}
          >
            <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${hasArea ? "bg-emerald-400" : "bg-amber-400"}`} />
            {hasArea
              ? "Area ready. Every tool below works on the shape you drew."
              : "Draw a polygon or rectangle on the map first. The tools need a real area."}
          </div>

          {CARDS.map((c) => (
            <button
              key={c.id} type="button" onClick={() => go(c.id)}
              className="group w-full flex items-stretch gap-3 text-left rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 hover:border-cyan-400/40 hover:bg-white/[0.04] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/70"
            >
              <div className="shrink-0 w-[76px] h-[76px] rounded-lg overflow-hidden border border-white/10">
                {THUMBS[c.id]}
              </div>
              <div className="min-w-0 flex-1 py-0.5">
                <p className="text-sm font-semibold text-slate-100">{TITLES[c.id]}</p>
                <p className="text-[0.68rem] text-slate-400 leading-snug mt-0.5">{c.desc}</p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {c.chips.map((t) => (
                    <span key={t} className="text-[0.55rem] px-1.5 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.07] text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <Chevron className="self-center shrink-0 text-slate-600 group-hover:text-cyan-300 transition-colors" />
            </button>
          ))}
        </div>
      )}

      {/* ── detail screens: the panel stays mounted so loaded grids survive going back ── */}
      {opened && (
        <div className={view === "hub" ? "hidden" : embedded ? "" : "flex-1 min-h-0 overflow-y-auto p-3"}>
          <ElevationContourPanel
            mode={view === "hub" ? "elevation" : view}
            selectedFeature={selectedFeature}
            onContoursGenerated={onContoursGenerated}
          />
        </div>
      )}
    </div>
  );
}

// ── docked full-height panel (drop-in replacement for the old floating one) ────
interface FloatingProps extends Omit<HubProps, "onClose"> {
  open: boolean;
  onClose: () => void;
  /** top offset is taken from y (so it clears your navbar). x is ignored: the panel is docked. */
  initialPosition?: { x: number; y: number };
  side?: "left" | "right";
}

export function FloatingElevationPanel({
  open, onClose, initialPosition = { x: 16, y: 64 }, side = "right", ...hubProps
}: FloatingProps) {
  // keep it mounted after the first open so state (loaded DEM, results) survives closing
  const [mounted, setMounted] = useState(false);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  if (!mounted) return null;

  return (
    <aside
      aria-label="Terrain tools"
      style={{
        position: "fixed",
        top: initialPosition.y,
        bottom: 16,
        ...(side === "right" ? { right: 16 } : { left: 16 }),
        width: 380,
        maxWidth: "calc(100vw - 32px)",
        zIndex: 1000,
        display: open ? "flex" : "none",
      }}
      className="flex-col rounded-2xl overflow-hidden border border-white/[0.08] bg-[#040d1a]/95 shadow-[0_8px_40px_rgba(0,0,0,0.6)]"
    >
      <TerrainHub {...hubProps} onClose={onClose} />
    </aside>
  );
}

export default TerrainHub;