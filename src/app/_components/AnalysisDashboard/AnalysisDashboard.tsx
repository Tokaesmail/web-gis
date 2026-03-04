"use client";

import { useState } from "react";
import { useLang } from "../translations";

interface AnalysisDashboardProps {
  visible: boolean;
  onClose: () => void;
  areaName?: string;
  areaSizeHa?: number;
}

const INDICES = [
  { key: "NDVI", label: "Vegetation", value: 0.72, color: "#22c55e", unit: "" },
  { key: "NDWI", label: "Water Stress", value: 0.31, color: "#38bdf8", unit: "" },
  { key: "EVI", label: "Enhanced Veg.", value: 0.65, color: "#86efac", unit: "" },
  { key: "SAVI", label: "Soil Adjusted", value: 0.58, color: "#fbbf24", unit: "" },
];

const TIMELINE = [
  { date: "23 Dec", ndvi: 0.58 },
  { date: "02 Jan", ndvi: 0.61 },
  { date: "12 Jan", ndvi: 0.67 },
  { date: "22 Jan", ndvi: 0.70 },
  { date: "01 Feb", ndvi: 0.69 },
  { date: "11 Feb", ndvi: 0.72 },
  { date: "16 Feb", ndvi: 0.72 },
];

export default function AnalysisDashboard({
  visible,
  onClose,
  areaName = "Selected Area",
  areaSizeHa = 0,
}: AnalysisDashboardProps) {
  const [activeIndex, setActiveIndex] = useState("NDVI");
  const [collapsed, setCollapsed] = useState(false);
  const { isRTL } = useLang();

  const maxNdvi = Math.max(...TIMELINE.map((t) => t.ndvi));

  return (
    <div
      className={`
        absolute bottom-0 left-0 right-0 z-[1050]
        transition-transform duration-400 ease-in-out
        ${visible ? "translate-y-0" : "translate-y-full"}
      `}
      style={{ transitionTimingFunction: "cubic-bezier(0.32, 0, 0.24, 1)" }}
    >
      {/* Drag handle bar */}
      <div
        className="flex justify-center py-2 cursor-pointer bg-[#070f1e]/95 backdrop-blur-xl border-t border-white/[0.08] rounded-t-2xl"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="w-8 h-1 rounded-full bg-white/20" />
      </div>

      <div
        className={`
          bg-[#070f1e]/98 backdrop-blur-xl border-t border-white/[0.06]
          overflow-hidden transition-all duration-300
          ${collapsed ? "max-h-0" : "max-h-[340px]"}
        `}
      >
        <div className="px-4 pb-4 overflow-y-auto custom-scroll" style={{ maxHeight: 320 }}>

          {/* Header row */}
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
              <div>
                <p className="text-sm font-medium text-slate-200">{areaName}</p>
                <p className="text-[0.65rem] text-slate-500">{areaSizeHa > 0 ? `${areaSizeHa} ha · ` : ""}AI Analysis Ready</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Export button */}
              <button className="flex items-center gap-1.5 border border-white/10 hover:border-cyan-400/30 text-slate-400 hover:text-cyan-400 text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export
              </button>
              <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer p-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* ── Index selector cards ── */}
            <div className="md:col-span-1">
              <p className="text-[0.65rem] text-slate-500 uppercase tracking-wider mb-2">Spectral Indices</p>
              <div className="grid grid-cols-2 gap-1.5">
                {INDICES.map((idx) => (
                  <button
                    key={idx.key}
                    onClick={() => setActiveIndex(idx.key)}
                    className={`
                      p-2.5 rounded-lg border text-left cursor-pointer transition-all duration-150
                      ${activeIndex === idx.key
                        ? "border-cyan-400/40 bg-cyan-400/8"
                        : "border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.06]"
                      }
                    `}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[0.65rem] font-bold tracking-wider" style={{ color: idx.color }}>
                        {idx.key}
                      </span>
                      {activeIndex === idx.key && (
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: idx.color }} />
                      )}
                    </div>
                    <p className="text-base font-semibold text-slate-100">{idx.value}</p>
                    <p className="text-[0.6rem] text-slate-500">{idx.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Timeline chart ── */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.65rem] text-slate-500 uppercase tracking-wider">
                  {activeIndex} Timeline
                </p>
                <div className="flex gap-1">
                  {["1M", "3M", "6M", "1Y"].map((r) => (
                    <button key={r} className="text-[0.6rem] px-1.5 py-0.5 rounded text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all cursor-pointer">
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-1.5 h-20 mb-1">
                {TIMELINE.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                    <div className="relative w-full">
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                        <div className="bg-[#0a1628] border border-white/10 text-[0.65rem] text-slate-200 px-1.5 py-0.5 rounded whitespace-nowrap shadow-lg">
                          {d.ndvi}
                        </div>
                      </div>
                      <div
                        className="w-full rounded-sm transition-all duration-200 group-hover:brightness-125"
                        style={{
                          height: `${(d.ndvi / maxNdvi) * 72}px`,
                          background: d.date === "16 Feb" ? "#22d3ee" : "#22c55e99",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Date labels */}
              <div className="flex gap-1.5">
                {TIMELINE.map((d, i) => (
                  <div key={i} className="flex-1 text-center">
                    <span className={`text-[0.55rem] ${d.date === "16 Feb" ? "text-cyan-400" : "text-slate-600"}`}>
                      {d.date}
                    </span>
                  </div>
                ))}
              </div>

              {/* NDVI color legend */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[0.6rem] text-slate-600">Low</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "linear-gradient(to right,#8B0000,#FF4500,#FFD700,#ADFF2F,#006400)" }} />
                <span className="text-[0.6rem] text-slate-600">High</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 3px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
      `}</style>
    </div>
  );
}