"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useLang } from "../_components/translations";
import AnalysisSidebar from "../_components/AnalysisSidebar/AnalysisSidebar";
import AnalysisDashboard from "../_components/AnalysisDashboard/AnalysisDashboard";
import AIAssistant from "../_components/AIAssistant/AIAssistant";

type DrawTool = "pointer" | "polygon" | "rectangle" | "circle" | "measure" | "marker";


// ─────────────────────────────────────────────────────────────────────────────
const SAT_LAYERS = {
  "Default": {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    type: "xyz" as const,
    layers: "",
    attribution: "Tiles © Esri",
  },
  "Sentinel-2": {
    url: "https://tiles.maps.eox.at/wms",
    type: "wms" as const,
    layers: "s2cloudless-2020",
    attribution: "Sentinel-2 cloudless 2020 © EOX",
  },
  "Landsat-8": {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    type: "xyz" as const,
    layers: "",
    attribution: "Landsat-8 © Esri",
  },
  "Sentinel-1": {
    url: "https://tiles.maps.eox.at/wms",
    type: "wms" as const,
    layers: "s1sar_mosaic",
    attribution: "Sentinel-1 SAR © EOX",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  SPECTRAL INDICES — real Sentinel Hub WMS tiles
//
//  كل index بيجيب tile حقيقية من Sentinel Hub بـ band math حقيقي:
//    RGB      → True Color (B04, B03, B02)
//    NDVI     → (NIR-Red)/(NIR+Red) — أخضر = نبات كتير، أحمر = جرداء
//    NDWI     → (Green-NIR)/(Green+NIR) — أزرق = مياه
//    NDSI     → (Green-SWIR)/(Green+SWIR) — أبيض = ثلج
//    SWIR     → Short Wave Infrared — كشف الحرائق والمعادن
//    MOISTURE → رطوبة التربة والنبات
//
//  الـ index layer بيتحط على indexPane (zIndex 250) فوق satellitePane (200)
//  لما يختار RGB بيتشال الـ index layer ويظهر الـ satellite العادي
// ─────────────────────────────────────────────────────────────────────────────
const SH_INSTANCE = "4f52df5b-3565-4935-b96a-d801bfd9306a";
const SH_WMS_URL  = `https://services.sentinel-hub.com/ogc/wms/${SH_INSTANCE}`;

const INDEX_TILES: Record<string, { layers: string; color: string; desc: string }> = {
  "RGB":      { layers: "TRUE_COLOR",     color: "#e2e8f0", desc: "True Color — ألوان طبيعية (B04/B03/B02)"                   },
  "NDVI":     { layers: "NDVI",           color: "#22c55e", desc: "Normalized Difference Vegetation Index — الغطاء النباتي"   },
  "NDWI":     { layers: "NDWI",           color: "#38bdf8", desc: "Normalized Difference Water Index — المياه"                },
  "NDSI":     { layers: "NDSI",           color: "#e0f2fe", desc: "Normalized Difference Snow Index — الثلج"                  },
  "SWIR":     { layers: "SWIR",           color: "#fb923c", desc: "Short Wave Infrared — حرائق ومعادن"                        },
  "MOISTURE": { layers: "MOISTURE-INDEX", color: "#818cf8", desc: "Moisture Index — رطوبة التربة والنبات"                     },
};

type SatKey = keyof typeof SAT_LAYERS;
type IdxKey = keyof typeof INDEX_TILES;

// ─── Layer Bar ────────────────────────────────────────────────────────────────
function MapLayerBar({ changeLayerRef, changeIndexRef }: {
  changeLayerRef: React.MutableRefObject<((sat: SatKey) => void) | null>;
  changeIndexRef: React.MutableRefObject<((idx: IdxKey) => void) | null>;
}) {
  const [sat, setSat] = useState<SatKey>("Default");
  const [idx, setIdx] = useState<IdxKey>("RGB");
  const [idxLoading, setIdxLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSat = (s: SatKey) => {
    if (s === sat) return;
    setSat(s);
    setLoading(true);
    changeLayerRef.current?.(s);
    console.log("🌍 changeLayerRef ready");
console.log("🛰️ changeIndexRef ready");
    setTimeout(() => setLoading(false), 1400);
  };

  const handleIdx = (i: IdxKey) => {
    if (i === idx) return;
    setIdx(i);
    setIdxLoading(true);
    changeIndexRef.current?.(i);
    console.log("🌍 changeLayerRef ready");
console.log("🛰️ changeIndexRef ready");
    setTimeout(() => setIdxLoading(false), 1400);
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 pointer-events-auto">

      {/* Satellite selector */}
      <div className="flex items-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1 py-1 shadow-lg gap-0.5">
        {(Object.keys(SAT_LAYERS) as SatKey[]).map((s) => (
          <button key={s} onClick={() => handleSat(s)}
            className={`relative text-[0.67rem] px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 flex items-center gap-1.5
              ${sat === s ? "bg-white/10 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}>
            {sat === s && loading && (
              <svg className="animate-spin w-2.5 h-2.5 text-cyan-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {s}
          </button>
        ))}
      </div>

      {/* Index selector */}
      <div className="flex items-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 rounded-full px-1 py-1 shadow-lg gap-0.5">
        {(Object.keys(INDEX_TILES) as IdxKey[]).map((i) => (
          <button key={i} onClick={() => handleIdx(i)}
            title={INDEX_TILES[i].desc}
            className={`relative text-[0.67rem] px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 flex items-center gap-1.5
              ${idx === i ? "bg-cyan-400/20 border border-cyan-400/30 font-medium" : "text-slate-500 hover:text-slate-300"}`}
            style={idx === i ? { color: INDEX_TILES[i].color } : {}}>
            {idx === i && idxLoading && (
              <svg className="animate-spin w-2.5 h-2.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
            )}
            {i}
          </button>
        ))}
      </div>

      {/* Active indicator */}
      <div className="flex items-center gap-1.5 bg-[#0a1628]/95 backdrop-blur-md border border-white/[0.08] rounded-full px-2.5 py-1.5 shadow-lg">
        <div className="w-2 h-2 rounded-full transition-all duration-300"
          style={{ background: INDEX_TILES[idx].color, boxShadow: `0 0 6px ${INDEX_TILES[idx].color}` }} />
        <span className="text-[0.62rem] text-slate-400 font-mono">{sat} · {idx}</span>
      </div>
    </div>
  );
}

// ─── AI Button ────────────────────────────────────────────────────────────────
function AITriggerButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} title="AI Assistant"
      className={`absolute bottom-5 right-[60px] z-[1000] w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-lg pointer-events-auto
        ${active ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_20px_rgba(0,212,255,0.5)]"
                 : "bg-[#0a1628]/95 backdrop-blur-md border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-400/30"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        <path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>
      </svg>
    </button>
  );
}

// ─── Drawing Toolbar ──────────────────────────────────────────────────────────
function MapToolbar({ activeTool, onToolChange, onClear }: {
  activeTool: DrawTool;
  onToolChange: (t: DrawTool) => void;
  onClear: () => void;
}) {
  const tools: { id: DrawTool; icon: React.ReactNode; label: string }[] = [
    { id: "pointer",   label: "Select",                   icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 0l16 12-7 2-4 8L4 0z"/></svg> },
    { id: "polygon",   label: "Polygon (dblclick finish)", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 22 18 2 18"/></svg> },
    { id: "rectangle", label: "Rectangle (2 clicks)",     icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="1"/></svg> },
    { id: "circle",    label: "Circle (2 clicks)",        icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg> },
    { id: "measure",   label: "Measure (dblclick finish)", icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4"/></svg> },
    { id: "marker",    label: "Add Marker",               icon: <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg> },
  ];
  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-1.5 pointer-events-auto">
      <div className="flex flex-col gap-1 bg-[#0a1628]/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-lg">
        {tools.map((tool) => (
          <div key={tool.id} className="relative group">
            <button onClick={() => onToolChange(tool.id)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer
                ${activeTool === tool.id ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_12px_rgba(0,212,255,0.5)]"
                                         : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.08]"}`}>
              {tool.icon}
            </button>
            <div className="absolute left-11 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
              <div className="bg-[#0a1628] border border-white/10 text-slate-200 text-[0.68rem] px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg">{tool.label}</div>
            </div>
          </div>
        ))}
        <div className="h-px bg-white/10 my-0.5"/>
        <div className="relative group">
          <button onClick={onClear} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
          </button>
          <div className="absolute left-11 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50">
            <div className="bg-[#0a1628] border border-white/10 text-slate-200 text-[0.68rem] px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg">Clear All</div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 bg-[#0a1628]/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-lg">
        <button id="map-zoom-in"  className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-all cursor-pointer text-lg font-light">+</button>
        <div className="h-px bg-white/10"/>
        <button id="map-zoom-out" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-all cursor-pointer text-lg font-light">−</button>
      </div>
    </div>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────
function MapSearch({ onFlyTo }: { onFlyTo: (lat: number, lng: number) => void }) {
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<{ name: string; lat: number; lng: number; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); setOpen(false); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=6`, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        setResults(data.map((d: any) => ({ name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon), type: d.type || d.class || "place" })));
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
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-[340px] sm:w-[460px] pointer-events-auto">
      <div className={`flex items-center gap-2.5 bg-[#0a1628]/95 backdrop-blur-md border rounded-xl px-3.5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)] transition-all ${focused ? "border-cyan-400/50 shadow-[0_0_0_3px_rgba(0,212,255,0.08)]" : "border-white/10"}`}>
        {loading
          ? <svg className="animate-spin text-cyan-400 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          : <svg className="text-slate-500 shrink-0" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>}
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 200); }}
          placeholder="Search any location in the world..."
          className="flex-1 bg-transparent text-slate-100 text-sm placeholder:text-slate-500 outline-none"/>
        {query && (
          <button onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }} className="text-slate-500 hover:text-slate-300 cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        )}
        <div className="shrink-0 flex items-center gap-1 border border-white/10 rounded-md px-2 py-0.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
          <span className="text-[0.65rem] text-slate-400">LIVE</span>
        </div>
      </div>
      {open && (
        <div className="mt-1.5 bg-[#0a1628]/98 backdrop-blur-md border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] overflow-hidden max-h-[280px] overflow-y-auto">
          {results.map((r, i) => (
            <button key={i} onMouseDown={() => handleSelect(r)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-cyan-400/8 transition-colors cursor-pointer ${i < results.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
              <div className="w-7 h-7 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400 shrink-0">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
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

// ─── Coordinates Popup ────────────────────────────────────────────────────────
function CoordsPopup({ lat, lng, onClose }: { lat: number; lng: number; onClose: () => void }) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto animate-fadeUp">
      <div className="flex items-center gap-3 bg-[#0a1628]/98 backdrop-blur-xl border border-cyan-400/30 rounded-xl px-4 py-2.5 shadow-[0_8px_32px_rgba(0,212,255,0.15)]">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]"/>
        <span className="text-[0.74rem] font-mono text-cyan-400">{lat.toFixed(6)}°N</span>
        <span className="text-slate-600">·</span>
        <span className="text-[0.74rem] font-mono text-cyan-400">{lng.toFixed(6)}°E</span>
        <button onClick={onClose} className="text-slate-600 hover:text-slate-400 cursor-pointer ml-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    </div>
  );
}

// ─── Leaflet Map ──────────────────────────────────────────────────────────────
function LeafletMap({ activeTool, onAreaSelected, onCoordsUpdate, flyToRef, clearRef, changeLayerRef, changeIndexRef }: {
  activeTool: DrawTool;
  onAreaSelected: (name: string, area: number) => void;
  onCoordsUpdate: (lat: number, lng: number) => void;
  flyToRef:       React.MutableRefObject<((lat: number, lng: number) => void) | null>;
  clearRef:       React.MutableRefObject<(() => void) | null>;
  changeLayerRef: React.MutableRefObject<((sat: SatKey) => void) | null>;
  changeIndexRef: React.MutableRefObject<((idx: IdxKey) => void) | null>;
}) {
  const mapRef         = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const activeToolRef  = useRef<DrawTool>(activeTool);
  const drawLayersRef  = useRef<any[]>([]);
  const tempLayerRef   = useRef<any>(null);
  const drawPointsRef  = useRef<[number, number][]>([]);
  const baseTileRef    = useRef<any>(null);
  const labelsLayerRef = useRef<any>(null);
  const indexTileRef   = useRef<any>(null); // real WMS index tile layer

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);

  useEffect(() => {
    if (typeof window === "undefined" || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, { center: [25, 17], zoom: 3, zoomControl: false });
      mapInstanceRef.current = map;
      console.log("✅ Map initialized");

      // ── Pane 1: satellitePane (zIndex 200) — الـ base satellite ─────────────
      map.createPane("satellitePane");
      map.getPane("satellitePane")!.style.zIndex = "200";

      // ── Pane 2: indexPane (zIndex 250) — real WMS index fوق الـ satellite ──
      // لما يختار NDVI مثلاً بيتحط tile حقيقي هنا فوق الـ base
      // لما يختار RGB بيتشال الـ index tile ويظهر الـ satellite العادي
      map.createPane("indexPane");
      map.getPane("indexPane")!.style.zIndex = "250";

      // ── Pane 3: labelsPane (zIndex 450) — أسماء الدول فوق كل حاجة ─────────
      // pointer-events: none = الـ clicks بتعدي تحت للـ map
      map.createPane("labelsPane");
      const labelsPaneEl               = map.getPane("labelsPane")!;
      labelsPaneEl.style.zIndex        = "450";
      labelsPaneEl.style.pointerEvents = "none";

      // ── Default tile: ESRI World Imagery (XYZ) على satellitePane ─────────
      baseTileRef.current = L.tileLayer(SAT_LAYERS["Default"].url, {
        attribution: SAT_LAYERS["Default"].attribution,
        maxZoom: 20,
        pane: "satellitePane",
      }).addTo(map);

      // ── Labels: أسماء الدول على labelsPane المنفصل ───────────────────────
      labelsLayerRef.current = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { attribution: "", maxZoom: 20, opacity: 0.8, pane: "labelsPane" }
      ).addTo(map);

      // ── changeLayerRef: تغيير مصدر الـ satellite ─────────────────────────
      changeLayerRef.current = (satKey: SatKey) => {
        const def = SAT_LAYERS[satKey];
        console.log("🌍 changeLayerRef ready");
console.log("🛰️ changeIndexRef ready");

        // شيل الـ base القديمة + الـ index tile لو موجودة
        if (baseTileRef.current)  map.removeLayer(baseTileRef.current);
        if (indexTileRef.current) { map.removeLayer(indexTileRef.current); indexTileRef.current = null; }

        if (def.type === "wms") {
          // WMS: نستخدم L.tileLayer.wms مع الـ layers parameter
          // (مش L.tileLayer العادي عشان ده بيحتاج {z}/{x}/{y} مش {bbox})
          baseTileRef.current = (L.tileLayer as any).wms(def.url, {
            layers:      def.layers,
            format:      "image/jpeg",
            transparent: false,
            version:     "1.1.1",
            attribution: def.attribution,
            maxZoom:     20,
            pane:        "satellitePane", // مهم: على نفس الـ pane عشان الـ filter يشتغل
          }).addTo(map);
        } else {
          // XYZ: سريع، tiles جاهزة
          baseTileRef.current = L.tileLayer(def.url, {
            attribution: def.attribution,
            maxZoom:     20,
            pane:        "satellitePane", // مهم: على نفس الـ pane
          }).addTo(map);
        }
      };

      // ── changeIndexRef: تغيير الـ spectral index (real WMS tile) ──────────
      // لما تختار NDVI مثلاً:
      //   1. بيشيل الـ index tile القديمة لو موجودة
      //   2. لو مش RGB: بيحط WMS tile حقيقي من Sentinel Hub على indexPane
      //   3. لو RGB: بيسيب الـ satellite base tile تظهر بدون أي overlay
      changeIndexRef.current = (idxKey: IdxKey) => {
        // شيل الـ index tile القديمة
        console.log("🌍 changeLayerRef ready");
console.log("🛰️ changeIndexRef ready");
        if (indexTileRef.current) {
          map.removeLayer(indexTileRef.current);
          indexTileRef.current = null;
        }

        // RGB = True Color = مش محتاج index layer، الـ base tile كافية
        if (idxKey === "RGB") return;

        // غير RGB: حط WMS tile حقيقي من Sentinel Hub
        indexTileRef.current = (L.tileLayer as any).wms(SH_WMS_URL, {
          layers:      INDEX_TILES[idxKey].layers,
          format:      "image/png",
          transparent: true,
          version:     "1.3.0",
          attribution: `Sentinel-2 ${idxKey} © Copernicus / Sentinel Hub`,
          maxZoom:     20,
          pane:        "indexPane",       // فوق الـ satellite، تحت الـ labels
          opacity:     1,
        }).addTo(map);
      };

      // Sample field polygon في دلتا النيل
      const fieldCoords: [number, number][] = [
        [30.54, 31.18], [30.56, 31.22], [30.53, 31.26],
        [30.50, 31.24], [30.49, 31.20], [30.52, 31.17],
      ];
      const ndviPolygon = L.polygon(fieldCoords, {
        color: "#00d4ff", weight: 2, dashArray: "6 4",
        fillColor: "#22c55e", fillOpacity: 0.22,
      }).addTo(map);
      ndviPolygon.bindTooltip("Field 1 · 27.4 ha · NDVI 0.72", { className: "ndvi-tooltip", direction: "top" });
      ndviPolygon.on("click", () => onAreaSelected("Field 1", 27.4));

      // Zoom buttons
      document.getElementById("map-zoom-in")?.addEventListener("click",  () => map.zoomIn());
      document.getElementById("map-zoom-out")?.addEventListener("click", () => map.zoomOut());

      // flyTo ref
      flyToRef.current = (lat: number, lng: number) => {
        map.flyTo([lat, lng], 13, { duration: 1.6 });
        setTimeout(() => {
          L.circleMarker([lat, lng], { radius: 9, color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.7, weight: 2 })
            .addTo(map)
            .bindPopup(`<b>📍 Location</b><br/>${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`)
            .openPopup();
        }, 1700);
      };

      // clearRef
      clearRef.current = () => {
        drawLayersRef.current.forEach((l) => map.removeLayer(l));
        drawLayersRef.current = [];
        drawPointsRef.current = [];
        if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
      };

      // ── Click ─────────────────────────────────────────────────────────────
      map.on("click", (e: any) => {
        const tool = activeToolRef.current;
        const { lat, lng } = e.latlng;
        onCoordsUpdate(lat, lng);
        if (tool === "pointer") return;

        if (tool === "marker") {
          const mk = L.circleMarker([lat, lng], { radius: 7, color: "#f97316", fillColor: "#f97316", fillOpacity: 0.85, weight: 2 }).addTo(map);
          mk.bindPopup(`📍 ${lat.toFixed(6)}°N<br/>${lng.toFixed(6)}°E`).openPopup();
          drawLayersRef.current.push(mk);
          return;
        }

        if (tool === "polygon" || tool === "measure") {
          drawPointsRef.current.push([lat, lng]);
          const dot = L.circleMarker([lat, lng], { radius: 4, color: "#00d4ff", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map);
          drawLayersRef.current.push(dot);
        }

        if (tool === "rectangle") {
          if (drawPointsRef.current.length === 0) {
            drawPointsRef.current.push([lat, lng]);
            const dot = L.circleMarker([lat, lng], { radius: 4, color: "#a78bfa", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map);
            drawLayersRef.current.push(dot);
          } else {
            const p1   = drawPointsRef.current[0];
            const rect = L.rectangle([p1, [lat, lng]], { color: "#a78bfa", weight: 2, fillColor: "#a78bfa", fillOpacity: 0.15 }).addTo(map);
            const area = parseFloat((Math.abs(p1[0] - lat) * Math.abs(p1[1] - lng) * 12345).toFixed(1));
            rect.bindPopup(`📐 Rectangle · ≈ ${area} ha`).openPopup();
            drawLayersRef.current.push(rect);
            onAreaSelected("Drawn Rectangle", area);
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
        }

        if (tool === "circle") {
          if (drawPointsRef.current.length === 0) {
            drawPointsRef.current.push([lat, lng]);
          } else {
            const center = drawPointsRef.current[0];
            const radius = map.distance(center, [lat, lng]);
            const circ   = L.circle(center, { radius, color: "#34d399", weight: 2, fillColor: "#34d399", fillOpacity: 0.15 }).addTo(map);
            const area   = parseFloat((Math.PI * Math.pow(radius / 1000, 2) * 100).toFixed(1));
            circ.bindPopup(`⭕ Circle · R: ${radius.toFixed(0)} m · ≈ ${area} ha`).openPopup();
            drawLayersRef.current.push(circ);
            onAreaSelected("Drawn Circle", area);
            drawPointsRef.current = [];
            if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }
          }
        }
      });

      // ── Double-click: finish polygon/measure ──────────────────────────────
      map.on("dblclick", (e: any) => {
        const tool = activeToolRef.current;
        if (tool !== "polygon" && tool !== "measure") return;
        e.originalEvent?.preventDefault();
        const pts = drawPointsRef.current;
        if (pts.length < 2) return;
        if (tempLayerRef.current) { map.removeLayer(tempLayerRef.current); tempLayerRef.current = null; }

        if (tool === "polygon") {
          const poly = L.polygon(pts, { color: "#00d4ff", weight: 2, fillColor: "#22c55e", fillOpacity: 0.2 }).addTo(map);
          drawLayersRef.current.push(poly);
          const area = parseFloat((Math.abs(pts.reduce((acc, p, i) => {
            const j = (i + 1) % pts.length;
            return acc + p[1] * pts[j][0] - pts[j][1] * p[0];
          }, 0)) / 2 * 12345).toFixed(1));
          poly.bindPopup(`🟢 Polygon · ≈ ${area} ha`).openPopup();
          onAreaSelected("Drawn Polygon", area);
        } else {
          const line = L.polyline(pts, { color: "#fbbf24", weight: 2.5 }).addTo(map);
          drawLayersRef.current.push(line);
          let dist = 0;
          for (let i = 1; i < pts.length; i++) dist += map.distance(pts[i - 1], pts[i]);
          line.bindPopup(`📏 ${(dist / 1000).toFixed(3)} km`).openPopup();
        }
        drawPointsRef.current = [];
      });

      // ── Mousemove: live preview ───────────────────────────────────────────
      map.on("mousemove", (e: any) => {
        const tool = activeToolRef.current;
        const pts  = drawPointsRef.current;
        if (tool === "pointer" || pts.length === 0) return;
        if (tempLayerRef.current) map.removeLayer(tempLayerRef.current);
        const cur: [number, number] = [e.latlng.lat, e.latlng.lng];
        if (tool === "polygon" || tool === "measure") {
          tempLayerRef.current = L.polyline([...pts, cur], { color: "#00d4ff", weight: 1.5, dashArray: "4 4", opacity: 0.7 }).addTo(map);
        }
        if (tool === "rectangle") {
          tempLayerRef.current = L.rectangle([pts[0], cur], { color: "#a78bfa", weight: 1.5, dashArray: "4 4", fillOpacity: 0.08 }).addTo(map);
        }
        if (tool === "circle") {
          const r = map.distance(pts[0], cur);
          tempLayerRef.current = L.circle(pts[0], { radius: r, color: "#34d399", weight: 1.5, dashArray: "4 4", fillOpacity: 0.07 }).addTo(map);
        }
      });
    });

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  // Cursor style
  useEffect(() => {
    const c = mapInstanceRef.current?.getContainer();
    if (c) c.style.cursor = activeTool === "pointer" ? "grab" : "crosshair";
  }, [activeTool]);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
      <style>{`
        .leaflet-container{background:#040d1a!important}
        .ndvi-tooltip{background:#0a1628!important;border:1px solid rgba(0,212,255,0.3)!important;color:#e2e8f0!important;font-size:.72rem!important;border-radius:6px!important}
        .ndvi-tooltip::before{border-top-color:rgba(0,212,255,0.3)!important}
        .leaflet-popup-content-wrapper{background:#0a1628!important;border:1px solid rgba(255,255,255,0.1)!important;color:#e2e8f0!important;border-radius:10px!important;box-shadow:0 8px 32px rgba(0,0,0,.6)!important;font-size:.82rem!important}
        .leaflet-popup-tip{background:#0a1628!important}
        .leaflet-popup-close-button{color:#64748b!important}
        .leaflet-control-attribution{background:rgba(4,13,26,.8)!important;color:#475569!important;font-size:.55rem!important}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .animate-fadeUp{animation:fadeUp .25s ease both}
      `}</style>
      <div ref={mapRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}/>
    </>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────
function MapNavbar({ isFullscreen, onFullscreenToggle }: { isFullscreen: boolean; onFullscreenToggle: () => void }) {
  const { t, toggleLang, lang } = useLang();
  return (
    <nav className="h-12 flex items-center justify-between px-4 bg-[#040d1a]/95 backdrop-blur-xl border-b border-white/[0.07] shrink-0 z-[1100] relative">
      <a href="/" className="flex items-center gap-2 no-underline">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse"/>
        <span className="text-cyan-400 font-semibold tracking-wide text-[0.85rem]">{t.projectName}</span>
      </a>
      <div className="flex items-center gap-1.5 text-[0.72rem] text-slate-500">
        <span className="text-slate-400">{t.navMap}</span>
        <span>/</span>
        <span className="text-slate-300">World Explorer</span>
        <span className="ml-2 flex items-center gap-1 bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 px-2 py-0.5 rounded-full text-[0.6rem]">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"/>LIVE
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={toggleLang} className="border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 text-[0.7rem] px-2.5 py-1 rounded-md bg-transparent cursor-pointer transition-all">
          {lang === "en" ? "عربي" : "EN"}
        </button>
        <button onClick={onFullscreenToggle} title="Fullscreen"
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/[0.08] border border-transparent hover:border-cyan-400/20 rounded-md transition-all cursor-pointer">
          {isFullscreen
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7V3h4"/><path d="M17 3h4v4"/><path d="M21 17v4h-4"/><path d="M7 21H3v-4"/></svg>}
        </button>
      </div>
    </nav>
  );
}

// ─── MapPage ──────────────────────────────────────────────────────────────────
export default function MapPage() {
  const [aiOpen,           setAiOpen]           = useState(false);
  const [isFullscreen,     setIsFullscreen]     = useState(false);
  const [activeTool,       setActiveTool]       = useState<DrawTool>("pointer");
  const [dashboardVisible, setDashboardVisible] = useState(false);
  const [selectedArea,     setSelectedArea]     = useState({ name: "Selected Area", ha: 0 });
  const [coords,           setCoords]           = useState<{ lat: number; lng: number } | null>(null);

  const flyToRef       = useRef<((lat: number, lng: number) => void) | null>(null);
  const clearRef       = useRef<(() => void) | null>(null);
  const changeLayerRef = useRef<((sat: SatKey) => void) | null>(null);
  const changeIndexRef = useRef<((idx: IdxKey) => void) | null>(null);
  const { isRTL } = useLang();

  const handleAreaSelected = useCallback((name: string, area: number) => {
    setSelectedArea({ name, ha: area });
    setDashboardVisible(true);
  }, []);

  const handleClear = useCallback(() => {
    clearRef.current?.();
    setDashboardVisible(false);
    setCoords(null);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setActiveTool("pointer"); clearRef.current?.(); setCoords(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  };

  return (
    <div className={`flex flex-col w-full h-screen bg-[#040d1a] overflow-hidden ${isRTL ? "font-arabic" : ""}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Noto+Sans+Arabic:wght@300;400;500&display=swap');
        body{font-family:'DM Sans',sans-serif;margin:0}
        .font-arabic{font-family:'Noto Sans Arabic',sans-serif!important}
      `}</style>

      {!isFullscreen && <MapNavbar isFullscreen={isFullscreen} onFullscreenToggle={toggleFullscreen}/>}

      <div className="relative flex-1 overflow-hidden">
        <LeafletMap
          activeTool={activeTool}
          onAreaSelected={handleAreaSelected}
          onCoordsUpdate={(lat, lng) => setCoords({ lat, lng })}
          flyToRef={flyToRef}
          clearRef={clearRef}
          changeLayerRef={changeLayerRef}
          changeIndexRef={changeIndexRef}
        />

        {isFullscreen && (
          <button onClick={toggleFullscreen} className="absolute top-4 right-4 z-[1100] w-9 h-9 flex items-center justify-center bg-[#0a1628]/95 backdrop-blur-md border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 rounded-lg shadow-lg transition-all cursor-pointer pointer-events-auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
          </button>
        )}

        <MapSearch onFlyTo={(lat, lng) => flyToRef.current?.(lat, lng)}/>
        <MapToolbar activeTool={activeTool} onToolChange={setActiveTool} onClear={handleClear}/>
        <AnalysisSidebar/>

        {coords && <CoordsPopup lat={coords.lat} lng={coords.lng} onClose={() => setCoords(null)}/>}

        <MapLayerBar changeLayerRef={changeLayerRef} changeIndexRef={changeIndexRef}/>
        <AITriggerButton onClick={() => setAiOpen((o) => !o)} active={aiOpen}/>

        <AnalysisDashboard
          visible={dashboardVisible}
          onClose={() => setDashboardVisible(false)}
          areaName={selectedArea.name}
          areaSizeHa={selectedArea.ha}
        />
        <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)}/>
      </div>
    </div>
  );
}