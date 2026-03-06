"use client";

import { useState, useEffect } from "react";
import { SAT_LAYERS, INDEX_TILES, SatKey, IdxKey } from "./mapTypes";


export default function MapLayerBar({
  onSatChange,
  onIdxChange,
}: {
  onSatChange: (sat: SatKey) => void;
  onIdxChange: (idx: IdxKey) => void;
}) {
  const [sat,        setSat]        = useState<SatKey>("Default");
  const [idx,        setIdx]        = useState<IdxKey>("RGB");
  const [satLoading, setSatLoading] = useState(false);
  const [idxLoading, setIdxLoading] = useState(false);

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
              ${sat === s ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
          >
            {sat === s && satLoading && (
              <svg className="animate-spin w-2.5 h-2.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
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
              ${idx === i
                ? "bg-cyan-400/20 border border-cyan-400/30 font-medium"
                : "text-slate-500 hover:text-slate-300"}`}
            style={idx === i ? { color: INDEX_TILES[i].color } : {}}
          >
            {idx === i && idxLoading && (
              <svg className="animate-spin w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {i}
          </button>
        ))}
      </div>

      {/* Active indicator */}
      <div className="flex items-center gap-1.5 bg-[#0a1628]/95 backdrop-blur-md border border-white/8 rounded-full px-2.5 py-1.5 shadow-lg">
        <div
          className="w-2 h-2 rounded-full transition-all duration-300"
          style={{
            background:  INDEX_TILES[idx].color,
            boxShadow:   `0 0 6px ${INDEX_TILES[idx].color}`,
          }}
        />
        <span className="text-[0.62rem] text-slate-400 font-mono">
          {sat} · {idx}
        </span>
      </div>
    </div>
  );
}
