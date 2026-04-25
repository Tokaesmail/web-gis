"use client";

import { useState, useEffect } from "react";
import { SAT_LAYERS, INDEX_TILES, SatKey, IdxKey } from "./mapTypes_proxy";

export default function MapLayerBar({
  onSatChange,
  onIdxChange,
  onOpacityChange,
}: {
  onSatChange: (sat: SatKey) => void;
  onIdxChange: (idx: IdxKey) => void;
  onOpacityChange?: (o: number) => void;
}) {
  const [sat, setSat] = useState<SatKey>("Default");
  const [idx, setIdx] = useState<IdxKey>("RGB");
  const [satLoading, setSatLoading] = useState(false);
  const [idxLoading, setIdxLoading] = useState(false);
  const [opacity, setOpacity] = useState(80);

  const handleSat = (s: SatKey) => {
    if (s === sat) return;
    setSat(s);
    setSatLoading(true);
    onSatChange(s);
    setTimeout(() => setSatLoading(false), 1400);
  };

  const handleIdx = (i: IdxKey) => {
    if (i === idx) return;
    setIdx(i);
    setIdxLoading(true);
    onIdxChange(i);
    setTimeout(() => setIdxLoading(false), 1400);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-1000 flex items-center gap-2 pointer-events-auto">
      {/* Satellite selector */}
      <div className="flex items-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1 py-1 shadow-lg gap-0.5">
        {(Object.keys(SAT_LAYERS) as SatKey[]).map((s) => (
          <button
            key={s}
            onClick={() => handleSat(s)}
            className={`relative text-[0.67rem] px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 flex items-center gap-1.5
              ${sat === s ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>
            {sat === s && satLoading && (
              <svg
                className="animate-spin w-2.5 h-2.5 text-cyan-400 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {s}
          </button>
        ))}
      </div>

      {/* Index selector */}
      <div className="flex items-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1 py-1 shadow-lg gap-0.5">
        {(Object.keys(INDEX_TILES) as IdxKey[]).map((i) => (
          <button
            key={i}
            onClick={() => handleIdx(i)}
            title={INDEX_TILES[i].desc}
            className={`relative text-[0.67rem] px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 flex items-center gap-1.5
              ${
                idx === i
                  ? "bg-cyan-400/20 border border-cyan-400/30 font-medium"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            style={idx === i ? { color: INDEX_TILES[i].color } : {}}>
            {idx === i && idxLoading && (
              <svg
                className="animate-spin w-2.5 h-2.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {i}
          </button>
        ))}
      </div>

      {/* Opacity Slider */}
      <div className="flex items-center gap-3 bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-4 py-1.5 shadow-lg min-w-[140px]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-slate-500">
          <circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/>
        </svg>
        <input
          type="range"
          min="0" max="100"
          value={opacity}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            setOpacity(val);
            onOpacityChange?.(val / 100);
          }}
          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-400"
        />
        <span className="text-[0.6rem] text-slate-400 font-mono w-6">{opacity}%</span>
      </div>

      {/* Active indicator */}
      <div className="flex items-center gap-1.5 bg-[#0a1628]/95 backdrop-blur-md border border-white/8 rounded-full px-2.5 py-1.5 shadow-lg">
        <div
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{
            background: INDEX_TILES[idx].color,
            boxShadow: `0 0 6px ${INDEX_TILES[idx].color}`,
          }}
        />
        <span className="text-[0.62rem] text-slate-400 font-mono">
          {sat} · {idx}
        </span>
      </div>
    </div>
  );
}
