"use client";

import { useEffect, useRef, useState } from "react";

interface Mapbox3DViewProps {
  lat: number;
  lng: number;
  featureName?: string;
  onClose: () => void;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

export default function Mapbox3DView({ lat, lng, featureName, onClose }: Mapbox3DViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<any>(null);
  const [loading,       setLoading]      = useState(true);
  const [error,         setError]        = useState<string | null>(null);
  const [pitch,         setPitch]        = useState(60);
  const [bearing,       setBearing]      = useState(0);
  const [exaggeration,  setExaggeration] = useState(1.5);

  useEffect(() => {
    if (!MAPTILER_KEY) {
      setError("NEXT_PUBLIC_MAPTILER_KEY غير موجود في .env.local");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadMap = async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default;

        /* inject CSS manually — Next.js لا يدعم dynamic import للـ CSS */
        if (!document.getElementById("maplibre-css")) {
          const link = document.createElement("link");
          link.id   = "maplibre-css";
          link.rel  = "stylesheet";
          link.href = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css";
          document.head.appendChild(link);
        }

        if (cancelled || !mapContainerRef.current) return;

        /* any cast يحل مشكلة antialias TypeScript */
        const mapOptions: any = {
          container: mapContainerRef.current,
          style:     `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`,
          center:    [lng, lat],
          zoom:      13,
          pitch:     60,
          bearing:   0,
          antialias: true,
        };

        const map = new maplibregl.Map(mapOptions);
        mapRef.current = map;

        map.on("load", () => {
          if (cancelled) return;

          map.addSource("terrain-source", {
            type:     "raster-dem",
            url:      `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
            tileSize: 256,
          });
          map.setTerrain({ source: "terrain-source", exaggeration: 1.5 });

          /* ── Force English labels only (Arabic breaks WebGL fonts) ─── */
          const layers = map.getStyle()?.layers ?? [];
          for (const layer of layers) {
            if (layer.type === 'symbol') {
              try {
                map.setLayoutProperty(layer.id, 'text-field', ['get', 'name:en']);
                map.setLayoutProperty(layer.id, 'text-font', ['Noto Sans Regular', 'Arial Unicode MS Regular']);
              } catch (_) {}
            }
          }

          const el = document.createElement("div");
          el.style.cssText = `
            width:18px;height:18px;border-radius:50%;
            background:#00d4ff;border:3px solid #fff;
            box-shadow:0 0 12px #00d4ff88;
          `;
          new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);

          setLoading(false);
        });

        map.on("error", (e: any) => {
          console.error("MapLibre error:", e);
          setError("خطأ في تحميل الخريطة — تأكدي من صحة الـ API Key");
          setLoading(false);
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "فشل تحميل MapLibre GL JS");
          setLoading(false);
        }
      }
    };

    loadMap();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng]);

  useEffect(() => { mapRef.current?.setPitch(pitch); },    [pitch]);
  useEffect(() => { mapRef.current?.setBearing(bearing); }, [bearing]);
  useEffect(() => {
    try { mapRef.current?.setTerrain({ source: "terrain-source", exaggeration }); } catch (_) {}
  }, [exaggeration]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[2000] bg-[#040d1a] flex flex-col" style={{ animation: "fadeIn 0.2s ease" }}>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:scale(0.98) } to { opacity:1; transform:scale(1) } }`}</style>

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a1628]/95 backdrop-blur-md border-b border-white/10 z-10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 transition-all text-xs cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to Map
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-sm text-white font-medium">{featureName ?? "3D Terrain View"}</span>
            <span className="text-xs text-slate-500 font-mono">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-400/10 border border-cyan-400/20">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2.5">
            <path d="M3 17l4-8 4 4 4-6 4 10" />
          </svg>
          <span className="text-[0.65rem] text-cyan-400 font-medium">MapTiler Terrain 3D</span>
        </div>
      </div>

      {/* Map */}
      <div className="relative flex-1 overflow-hidden">
        <div ref={mapContainerRef} style={{ position:"absolute", top:0, left:0, right:0, bottom:0, width:"100%", height:"100%" }} />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#040d1a] z-10 gap-3">
            <svg className="animate-spin w-8 h-8 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <span className="text-sm text-slate-400">Loading 3D Terrain…</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#040d1a] z-10 gap-4 px-8 text-center">
            <div className="w-12 h-12 rounded-full bg-red-400/10 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" />
              </svg>
            </div>
            <p className="text-sm text-red-400">{error}</p>
            <div className="bg-[#0a1628] border border-white/10 rounded-xl p-4 text-left max-w-md">
              <p className="text-xs text-slate-400 mb-2">أضيفي في <code className="text-cyan-400">.env.local</code>:</p>
              <code className="text-xs text-emerald-400 block">NEXT_PUBLIC_MAPTILER_KEY=xxxxxxxxxxxx</code>
            </div>
          </div>
        )}

        {!loading && !error && (
          <div className="absolute bottom-6 left-4 z-10 flex flex-col gap-3 bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-xl p-4 w-52 shadow-lg">
            <p className="text-[0.65rem] text-slate-500 uppercase tracking-widest font-medium">View Controls</p>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[0.7rem] text-slate-400">Pitch</span>
                <span className="text-[0.7rem] text-cyan-400 font-mono">{pitch}°</span>
              </div>
              <input type="range" min={0} max={85} step={1} value={pitch}
                onChange={(e) => setPitch(Number(e.target.value))} className="w-full accent-cyan-400" />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[0.7rem] text-slate-400">Bearing</span>
                <span className="text-[0.7rem] text-cyan-400 font-mono">{bearing}°</span>
              </div>
              <input type="range" min={-180} max={180} step={1} value={bearing}
                onChange={(e) => setBearing(Number(e.target.value))} className="w-full accent-cyan-400" />
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-[0.7rem] text-slate-400">Terrain ×</span>
                <span className="text-[0.7rem] text-cyan-400 font-mono">{exaggeration.toFixed(1)}</span>
              </div>
              <input type="range" min={0.5} max={5} step={0.1} value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))} className="w-full accent-cyan-400" />
            </div>

            <button
              onClick={() => mapRef.current?.flyTo({ center: [lng, lat], zoom: 13, pitch: 60, bearing: 0, duration: 1500 })}
              className="mt-1 w-full py-1.5 rounded-lg bg-cyan-400/10 border border-cyan-400/20 hover:bg-cyan-400/20 text-cyan-400 text-xs transition-all cursor-pointer"
            >
              Re-center
            </button>
          </div>
        )}
      </div>
    </div>
  );
}