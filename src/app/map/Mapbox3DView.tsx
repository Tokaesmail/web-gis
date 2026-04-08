"use client";

import { useEffect, useRef, useState } from "react";

interface Mapbox3DViewProps {
  lat: number;
  lng: number;
  featureName?: string;
  onClose: () => void;
  toggleButton?: React.ReactNode;
  sidebarSlot?: React.ReactNode;
  uploadedGeoJson?: GeoJSON.FeatureCollection | null;
}

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY ?? "";

const GEOJSON_SOURCE_ID = "uploaded-geojson-3d";
const LAYER_FILL_ID     = "uploaded-geojson-fill-3d";
const LAYER_LINE_ID     = "uploaded-geojson-line-3d";
const LAYER_POINT_ID    = "uploaded-geojson-point-3d";

function addGeoJsonLayers(map: any, geojson: GeoJSON.FeatureCollection) {
  map.addSource(GEOJSON_SOURCE_ID, { type: "geojson", data: geojson });

  map.addLayer({
    id: LAYER_FILL_ID, type: "fill", source: GEOJSON_SOURCE_ID,
    filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "MultiPolygon"]],
    paint: { "fill-color": "#00d4ff", "fill-opacity": 0.25 },
  });

  map.addLayer({
    id: LAYER_LINE_ID, type: "line", source: GEOJSON_SOURCE_ID,
    filter: ["any",
      ["==", ["geometry-type"], "Polygon"],    ["==", ["geometry-type"], "MultiPolygon"],
      ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "MultiLineString"],
    ],
    paint: { "line-color": "#00d4ff", "line-width": 2.5, "line-opacity": 0.95 },
  });

  map.addLayer({
    id: LAYER_POINT_ID, type: "circle", source: GEOJSON_SOURCE_ID,
    filter: ["any", ["==", ["geometry-type"], "Point"], ["==", ["geometry-type"], "MultiPoint"]],
    paint: {
      "circle-radius": 6, "circle-color": "#00d4ff", "circle-opacity": 0.9,
      "circle-stroke-width": 2, "circle-stroke-color": "#ffffff",
    },
  });
}

function removeGeoJsonLayers(map: any) {
  [LAYER_FILL_ID, LAYER_LINE_ID, LAYER_POINT_ID].forEach((id) => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource(GEOJSON_SOURCE_ID)) map.removeSource(GEOJSON_SOURCE_ID);
}

export default function Mapbox3DView({
  lat, lng, featureName, onClose,
  toggleButton, sidebarSlot, uploadedGeoJson,
}: Mapbox3DViewProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef          = useRef<any>(null);
  const mapReadyRef     = useRef(false);

  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [pitch,        setPitch]        = useState(60);
  const [bearing,      setBearing]      = useState(0);
  const [exaggeration, setExaggeration] = useState(1.5);

  // ── Load map ──────────────────────────────────────────────────────────────
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

        if (!document.getElementById("maplibre-css")) {
          const link = document.createElement("link");
          link.id = "maplibre-css"; link.rel = "stylesheet";
          link.href = "https://unpkg.com/maplibre-gl/dist/maplibre-gl.css";
          document.head.appendChild(link);
        }

        if (cancelled || !mapContainerRef.current) return;

        // ✅ Fix TypeScript error: cast options as `any` to allow antialias
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

        // ✅ Zoom + compass — بيضيف +/- وبوصلة
        map.addControl(
          new maplibregl.NavigationControl({ visualizePitch: true } as any),
          "top-right"
        );

        map.on("load", () => {
          if (cancelled) return;

          map.addSource("terrain-source", {
            type: "raster-dem",
            url:  `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
            tileSize: 256,
          });
          map.setTerrain({ source: "terrain-source", exaggeration: 1.5 });

          const layers = map.getStyle()?.layers ?? [];
          for (const layer of layers) {
            if (layer.type === "symbol") {
              try {
                map.setLayoutProperty(layer.id, "text-field", ["get", "name:en"]);
                map.setLayoutProperty(layer.id, "text-font", ["Noto Sans Regular", "Arial Unicode MS Regular"]);
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

          mapReadyRef.current = true;
          if (uploadedGeoJson) {
            addGeoJsonLayers(map, uploadedGeoJson);
          }

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
      mapReadyRef.current = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── تحديث الـ GeoJSON لو اتغير ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    removeGeoJsonLayers(map);
    if (uploadedGeoJson) addGeoJsonLayers(map, uploadedGeoJson);
  }, [uploadedGeoJson]);

  useEffect(() => { mapRef.current?.setPitch(pitch); },     [pitch]);
  useEffect(() => { mapRef.current?.setBearing(bearing); }, [bearing]);
  useEffect(() => {
    try { mapRef.current?.setTerrain({ source: "terrain-source", exaggeration }); } catch (_) {}
  }, [exaggeration]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[2000] bg-[#040d1a] flex flex-col"
      style={{ animation: "fadeIn 0.2s ease" }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:scale(0.98) } to { opacity:1; transform:scale(1) } }
        .maplibregl-ctrl-top-right { top: 8px !important; right: 8px !important; }
      `}</style>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a1628]/95 backdrop-blur-md border-b border-white/10 z-10 flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1f3c] border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 transition-all text-xs cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Back to Map
          </button>

          {toggleButton}

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

      {/* ── Map area ── */}
      <div className="relative flex-1 overflow-hidden">

        {/* الخريطة نفسها — على الـ bottom، تحت كل حاجة */}
        <div
          ref={mapContainerRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        />

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
                <circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>
              </svg>
            </div>
            <p className="text-sm text-red-400">{error}</p>
            <div className="bg-[#0a1628] border border-white/10 rounded-xl p-4 text-left max-w-md">
              <p className="text-xs text-slate-400 mb-2">أضيفي في <code className="text-cyan-400">.env.local</code>:</p>
              <code className="text-xs text-emerald-400 block">NEXT_PUBLIC_MAPTILER_KEY=xxxxxxxxxxxx</code>
            </div>
          </div>
        )}

        {/* View Controls — pointer-events-auto على الـ panel بس مش على الـ map */}
        {!loading && !error && (
          <div
            className="absolute bottom-6 left-4 z-20 flex flex-col gap-3 bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-xl p-4 w-52 shadow-lg"
            style={{ pointerEvents: "all" }}
          >
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

        {/*
          ✅ FIX: الـ sidebarSlot — pointer-events-none على الـ container الكبير
          وكل element جوه السايدبار بيتحكم في الـ pointer-events بنفسه
          عشان الـ map تبقى قابلة للتحريك والـ zoom في أي حتة فاضية
        */}
        {sidebarSlot && (
          <div
            className="absolute inset-0 z-20"
            style={{ pointerEvents: "none" }}
          >
            {sidebarSlot}
          </div>
        )}
      </div>
    </div>
  );
}