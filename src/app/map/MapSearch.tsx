"use client";

import { useState, useEffect, useRef } from "react";

export default function MapSearch({
  onFlyTo,
}: {
  onFlyTo: (lat: number, lng: number) => void;
}) {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6`,
          { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        setResults(data.map((d: any) => ({
          name: d.display_name,
          lat:  parseFloat(d.lat),
          lng:  parseFloat(d.lon),
          type: d.type || d.class || "place",
        })));
        setOpen(data.length > 0);
      } catch {}
      setLoading(false);
    }, 400);
  }, [query]);

  const handleSelect = (r: { name: string; lat: number; lng: number }) => {
    setQuery(r.name.split(",")[0]);
    setOpen(false);
    onFlyTo(r.lat, r.lng);
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-1000 w-340px sm:w-460px pointer-events-auto">
      <div
        className={`flex items-center gap-2.5 bg-[#0a1628]/95 backdrop-blur-md border rounded-xl px-3.5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all
          ${focused ? "border-cyan-400/50 shadow-[0_0_0_3px_rgba(0,212,255,0.08)]" : "border-white/10"}`}
      >
        {loading ? (
          <svg className="animate-spin text-cyan-400 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : (
          <svg className="text-slate-500 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 200); }}
          placeholder="Search any location in the world..."
          className="flex-1 bg-transparent text-slate-100 text-sm placeholder:text-slate-500 outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            className="text-slate-500 hover:text-slate-300 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
        <div className="shrink-0 flex items-center gap-1 border border-white/10 rounded-md px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[0.65rem] text-slate-400">LIVE</span>
        </div>
      </div>

      {open && (
        <div className="mt-1.5 bg-[#0a1628]/98 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden max-h-280px overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              onMouseDown={() => handleSelect(r)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-cyan-400/8 transition-colors cursor-pointer
                ${i < results.length - 1 ? "border-b border-white/0.05" : ""}`}
            >
              <div className="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-200 truncate">{r.name.split(",")[0]}</p>
                <p className="text-[0.62rem] text-slate-500 truncate">{r.name.split(",").slice(1, 3).join(",")}</p>
              </div>
              <div className="text-[0.6rem] text-slate-600 shrink-0 text-right font-mono">
                <div>{r.lat.toFixed(4)}°N</div>
                <div>{r.lng.toFixed(4)}°E</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
