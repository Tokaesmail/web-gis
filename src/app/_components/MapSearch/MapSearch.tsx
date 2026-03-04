"use client";

import { useState, useRef, useEffect } from "react";
import { useLang } from "../translations";

interface SearchResult {
  id: string;
  name: string;
  type: string;
  coords: [number, number];
}

// Static mock results — replace with Mapbox Geocoding API
const MOCK_RESULTS: SearchResult[] = [
  { id: "1", name: "Cairo, Egypt", type: "City", coords: [31.2357, 30.0444] },
  { id: "2", name: "Alexandria, Egypt", type: "City", coords: [29.9187, 31.2001] },
  { id: "3", name: "Nile Delta Region", type: "Region", coords: [31.0, 31.0] },
  { id: "4", name: "Giza Governorate", type: "Governorate", coords: [31.1342, 29.9870] },
  { id: "5", name: "Fayoum Oasis", type: "Region", coords: [30.8418, 29.3084] },
];

interface MapSearchProps {
  onSelect?: (result: SearchResult) => void;
}

export default function MapSearch({ onSelect }: MapSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useLang();

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const filtered = MOCK_RESULTS.filter((r) =>
      r.name.toLowerCase().includes(query.toLowerCase())
    );
    setResults(filtered);
    setOpen(filtered.length > 0);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    setQuery(result.name);
    setOpen(false);
    onSelect?.(result);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-1000 w-[340px] sm:w-[420px]">      {/* Input */}
      <div
        className={`
          flex items-center gap-2.5 bg-[#0a1628]/95 backdrop-blur-md
          border rounded-xl px-3.5 py-2.5
          shadow-[0_8px_32px_rgba(0,0,0,0.5)]
          transition-all duration-200
          ${focused ? "border-cyan-400/50 shadow-[0_0_0_3px_rgba(0,212,255,0.08),0_8px_32px_rgba(0,0,0,0.5)]" : "border-white/10"}
        `}
      >
        <svg className="text-slate-500 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>

        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150); }}
          placeholder={t.mapSearch}
          className="flex-1 bg-transparent text-slate-100 text-sm placeholder:text-slate-500 outline-none"
        />

        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Satellite badge */}
        <div className="shrink-0 flex items-center gap-1 border border-white/10 rounded-md px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[0.65rem] text-slate-400 tracking-wide">LIVE</span>
        </div>
      </div>

      {/* Results dropdown */}
      {open && (
        <div className="mt-1.5 bg-[#0a1628]/98 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden">
          {results.map((r, i) => (
            <button
              key={r.id}
              onMouseDown={() => handleSelect(r)}
              className={`
                w-full flex items-center gap-3 px-3.5 py-2.5 text-left
                hover:bg-cyan-400/8 transition-colors cursor-pointer
                ${i < results.length - 1 ? "border-b border-white/[0.05]" : ""}
              `}
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-slate-200 truncate">{r.name}</p>
                <p className="text-[0.67rem] text-slate-500">{r.type}</p>
              </div>
              <div className="ml-auto text-[0.65rem] text-slate-600 shrink-0">
                {r.coords[1].toFixed(2)}°N {r.coords[0].toFixed(2)}°E
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}