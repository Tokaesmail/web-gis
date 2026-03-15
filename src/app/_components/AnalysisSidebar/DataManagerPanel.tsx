"use client";

import React, { useState } from "react";
import { useSession } from "next-auth/react";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

// ─── Types ────────────────────────────────────────────────────────────────────
type ParsedFile =
  | { kind: "geojson"; fileName: string; geojson: GeoJSON.FeatureCollection; raw: any }
  | { kind: "generic"; fileName: string; raw: any };

export interface JSONUploadModalProps {
  onClose: () => void;
  onUpload: (geojson: GeoJSON.FeatureCollection) => void;
}

// ─── JSONUploadModal ──────────────────────────────────────────────────────────
export default function JSONUploadModal({ onClose, onUpload }: JSONUploadModalProps) {
  const { data: session } = useSession();
  const token = (session?.user as any)?.accessToken as string | undefined;

  const [dragOver,      setDragOver]      = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [parsed,        setParsed]        = useState<ParsedFile | null>(null);
  const [uploadStatus,  setUploadStatus]  = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [uploadMsg,     setUploadMsg]     = useState<string>("");

  const inputRef = React.useRef<HTMLInputElement>(null);

  // ── Auto-detect if raw JSON is / can be converted to GeoJSON ────────────────
  const tryGeoJSON = (raw: any): GeoJSON.FeatureCollection | null => {
    if (!raw || typeof raw !== "object") return null;
    const GEO_TYPES = ["Point","MultiPoint","LineString","MultiLineString","Polygon","MultiPolygon","GeometryCollection"];
    if (raw.type === "FeatureCollection" && Array.isArray(raw.features)) return raw;
    if (raw.type === "Feature" && raw.geometry) return { type: "FeatureCollection", features: [raw] };
    if (GEO_TYPES.includes(raw.type)) return { type: "FeatureCollection", features: [{ type: "Feature", geometry: raw, properties: {} }] };
    const arr = Array.isArray(raw) ? raw : (raw.features ?? raw.data ?? raw.items ?? raw.results ?? null);
    if (Array.isArray(arr) && arr.length > 0) {
      const first = arr[0];
      if (first?.type === "Feature") return { type: "FeatureCollection", features: arr };
      if (GEO_TYPES.includes(first?.type)) return { type: "FeatureCollection", features: arr.map((g: any) => ({ type: "Feature", geometry: g, properties: {} })) };
      const latKey = ["lat","latitude","y"].find(k => first?.[k] !== undefined);
      const lngKey = ["lng","lon","longitude","x"].find(k => first?.[k] !== undefined);
      if (latKey && lngKey) {
        return {
          type: "FeatureCollection",
          features: arr.map((o: any) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [parseFloat(o[lngKey]), parseFloat(o[latKey])] },
            properties: Object.fromEntries(Object.entries(o).filter(([k]) => k !== latKey && k !== lngKey)),
          })),
        };
      }
    }
    return null;
  };

  const parseFile = (file: File) => {
    setError(null); setParsed(null); setUploadStatus("idle"); setUploadMsg("");
    if (!file.name.match(/\.(json|geojson)$/i)) { setError("File must be .json or .geojson format"); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = JSON.parse(e.target?.result as string);
        const geojson = tryGeoJSON(raw);
        if (geojson && geojson.features.length > 0) setParsed({ kind: "geojson", fileName: file.name, geojson, raw });
        else setParsed({ kind: "generic", fileName: file.name, raw });
      } catch { setError("Could not read file — make sure it is valid JSON"); }
    };
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) parseFile(file); };
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) parseFile(file); e.target.value = ""; };

  // ── Upload to server ─────────────────────────────────────────────────────────
  async function handleUpload() {
    if (!parsed || parsed.kind !== "geojson") return;
    if (!token) { setUploadStatus("error"); setUploadMsg("You must be signed in to upload files."); return; }
    setUploadStatus("uploading"); setUploadMsg("");

    // Defer heavy JSON.stringify off the main thread so UI stays responsive
    const form = await new Promise<FormData>((resolve) => {
      setTimeout(() => {
        const blob = new Blob([JSON.stringify(parsed.raw)], { type: "application/json" });
        const file = new File([blob], parsed.fileName, { type: "application/json" });
        const fd = new FormData(); fd.append("file", file);
        resolve(fd);
      }, 0);
    });

    try {
      const res  = await fetch(`${BASE_URL}/gis/upload-geojson`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const data = await res.json();
      if (res.status === 401) { setUploadStatus("error"); setUploadMsg("Session expired — please sign in again."); return; }
      if (!res.ok || data.success === false) { setUploadStatus("error"); setUploadMsg(data.message ?? "Upload failed."); return; }
      setUploadStatus("success"); setUploadMsg("File uploaded successfully!");
      onUpload(parsed.geojson);
      setTimeout(() => onClose(), 1200);
    } catch { setUploadStatus("error"); setUploadMsg("Network error — please try again."); }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const geomCounts = (fc: GeoJSON.FeatureCollection) => { const c: Record<string, number> = {}; fc.features.forEach((f) => { const t = f.geometry?.type ?? "Unknown"; c[t] = (c[t] ?? 0) + 1; }); return c; };
  const bbox = (fc: GeoJSON.FeatureCollection): string => {
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    const walk = (coords: any) => { if (typeof coords[0] === "number") { minLng = Math.min(minLng, coords[0]); maxLng = Math.max(maxLng, coords[0]); minLat = Math.min(minLat, coords[1]); maxLat = Math.max(maxLat, coords[1]); } else coords.forEach(walk); };
    fc.features.forEach((f) => { if (f.geometry) walk((f.geometry as any).coordinates ?? []); });
    if (!isFinite(minLng)) return "—";
    return `${minLat.toFixed(4)}°N  ${minLng.toFixed(4)}°E  →  ${maxLat.toFixed(4)}°N  ${maxLng.toFixed(4)}°E`;
  };
  const countKeys = (raw: any): number => { const arr = Array.isArray(raw) ? raw : (raw.data ?? raw.items ?? raw.results ?? (typeof raw === "object" ? [raw] : [])); if (Array.isArray(arr) && arr[0]) return Object.keys(arr[0]).length; return typeof raw === "object" ? Object.keys(raw).length : 0; };
  const countRows = (raw: any): number => { if (Array.isArray(raw)) return raw.length; const arr = raw.data ?? raw.items ?? raw.results ?? raw.features; return Array.isArray(arr) ? arr.length : 1; };
  const topKeys  = (raw: any): string[] => { const arr = Array.isArray(raw) ? raw : (raw.data ?? raw.items ?? raw.results ?? (typeof raw === "object" ? [raw] : [])); const src = Array.isArray(arr) ? arr[0] : raw; return Object.keys(src ?? {}).slice(0, 8); };
  const geomIcon: Record<string, string> = { Point:"📍", MultiPoint:"📍", LineString:"〰️", MultiLineString:"〰️", Polygon:"⬡", MultiPolygon:"⬡", GeometryCollection:"🗂️" };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center"
      style={{ pointerEvents: "all" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      <div className="relative z-10 w-[480px] max-h-[88vh] flex flex-col bg-[#060d1b] border border-white/[0.1] rounded-2xl shadow-[0_32px_96px_rgba(0,0,0,0.8)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/[0.07] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-cyan-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">Upload JSON File</p>
              <p className="text-[0.62rem] text-slate-500">GeoJSON · Arrays · Objects · Any structure</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.07] rounded-lg transition-all cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scroll">

          {/* Drop zone */}
          {!parsed && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 py-14 px-6 select-none
                ${dragOver ? "border-cyan-400/70 bg-cyan-400/[0.07] scale-[1.01]" : "border-white/[0.1] bg-white/[0.02] hover:border-white/[0.22] hover:bg-white/[0.04]"}`}
            >
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-200 ${dragOver ? "bg-cyan-400/20 scale-110" : "bg-white/[0.05]"}`}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dragOver ? "#22d3ee" : "#475569"} strokeWidth="1.6" className={dragOver ? "animate-bounce" : ""}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium transition-colors ${dragOver ? "text-cyan-400" : "text-slate-300"}`}>
                  {dragOver ? "Drop the file here ✦" : "Drag a JSON file here"}
                </p>
                <p className="text-[0.68rem] text-slate-500 mt-1">or click to choose a file from your device</p>
                <p className="text-[0.6rem] text-slate-600 mt-2">GeoJSON · Arrays · Objects · lat/lng · Any structure</p>
              </div>
              <input ref={inputRef} type="file" accept=".json,.geojson,application/json" className="hidden" onChange={onFileChange} />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <div>
                <p className="text-[0.72rem] font-medium text-red-400">File Error</p>
                <p className="text-[0.65rem] text-red-400/80 mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="ml-auto text-red-400/60 hover:text-red-400 cursor-pointer">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}

          {/* Upload status messages */}
          {uploadStatus === "success" && (
            <div className="flex items-center gap-2 bg-emerald-400/8 border border-emerald-400/20 rounded-lg px-3 py-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <p className="text-[0.7rem] text-emerald-400">{uploadMsg}</p>
            </div>
          )}
          {uploadStatus === "error" && (
            <div className="flex items-center gap-2 bg-red-500/8 border border-red-500/20 rounded-lg px-3 py-2">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <p className="text-[0.7rem] text-red-400">{uploadMsg}</p>
            </div>
          )}

          {/* ── GeoJSON Preview ── */}
          {parsed?.kind === "geojson" && (() => {
            const counts  = geomCounts(parsed.geojson);
            const total   = parsed.geojson.features.length;
            const propKeys = Array.from(new Set(parsed.geojson.features.flatMap(f => Object.keys(f.properties ?? {})))).slice(0, 8);
            return (
              <div className="space-y-3">
                {/* File chip */}
                <div className="flex items-center gap-2.5 bg-emerald-400/[0.07] border border-emerald-400/20 rounded-xl px-3.5 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-400/15 flex items-center justify-center shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.72rem] font-medium text-emerald-300 truncate">{parsed.fileName}</p>
                    <p className="text-[0.6rem] text-slate-500">Detected as GeoJSON ✓</p>
                  </div>
                  <button onClick={() => { setParsed(null); setError(null); setUploadStatus("idle"); setUploadMsg(""); }} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: total, label: "Features", color: "text-cyan-400" },
                    { v: Object.keys(counts).length, label: "Geom Types", color: "text-violet-400" },
                    { v: propKeys.length, label: "Properties", color: "text-amber-400" },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center">
                      <p className={`text-xl font-semibold ${s.color}`}>{s.v}</p>
                      <p className="text-[0.6rem] text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Geometry breakdown */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3.5">
                  <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2.5">Geometry Breakdown</p>
                  <div className="space-y-1.5">
                    {Object.entries(counts).map(([type, count]) => (
                      <div key={type} className="flex items-center gap-2">
                        <span className="text-sm w-5 text-center">{geomIcon[type] ?? "◻️"}</span>
                        <span className="text-[0.68rem] text-slate-400 flex-1">{type}</span>
                        <div className="flex-1 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-cyan-400/60" style={{ width: `${(count / total) * 100}%` }} />
                        </div>
                        <span className="text-[0.6rem] text-slate-500 w-6 text-right">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bounding box */}
                <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3.5 py-3">
                  <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-1">Bounding Box</p>
                  <p className="text-[0.65rem] text-slate-300 font-mono leading-relaxed">{bbox(parsed.geojson)}</p>
                </div>

                {/* Property keys */}
                {propKeys.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3.5 py-3">
                    <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2">Available Properties</p>
                    <div className="flex flex-wrap gap-1.5">
                      {propKeys.map(k => (
                        <span key={k} className="text-[0.62rem] text-slate-400 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full font-mono">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sample JSON */}
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-[0.65rem] text-slate-500 hover:text-slate-300 transition-colors list-none select-none">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6"/></svg>
                    Preview first feature
                  </summary>
                  <pre className="mt-2 text-[0.58rem] text-slate-500 bg-black/30 border border-white/[0.06] rounded-lg p-3 overflow-x-auto leading-relaxed font-mono max-h-40">
                    {JSON.stringify(parsed.geojson.features[0], null, 2)}
                  </pre>
                </details>
              </div>
            );
          })()}

          {/* ── Generic JSON Preview ── */}
          {parsed?.kind === "generic" && (() => {
            const rows    = countRows(parsed.raw);
            const keys    = countKeys(parsed.raw);
            const kList   = topKeys(parsed.raw);
            const isArr   = Array.isArray(parsed.raw);
            const sampleObj = isArr ? parsed.raw[0] : (parsed.raw.data?.[0] ?? parsed.raw.items?.[0] ?? parsed.raw.results?.[0] ?? parsed.raw);
            return (
              <div className="space-y-3">
                {/* File chip */}
                <div className="flex items-center gap-2.5 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl px-3.5 py-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-400/15 flex items-center justify-center shrink-0">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[0.72rem] font-medium text-amber-300 truncate">{parsed.fileName}</p>
                    <p className="text-[0.6rem] text-slate-500">Generic JSON — no coordinates detected</p>
                  </div>
                  <button onClick={() => { setParsed(null); setError(null); }} className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer p-1">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: rows, label: isArr ? "Rows" : "Objects", color: "text-amber-400" },
                    { v: keys, label: "Fields", color: "text-violet-400" },
                    { v: typeof parsed.raw === "object" ? Object.keys(parsed.raw).length : 1, label: "Root Keys", color: "text-cyan-400" },
                  ].map(s => (
                    <div key={s.label} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center">
                      <p className={`text-xl font-semibold ${s.color}`}>{s.v}</p>
                      <p className="text-[0.6rem] text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Field list */}
                {kList.length > 0 && (
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl px-3.5 py-3">
                    <p className="text-[0.6rem] text-slate-500 uppercase tracking-wider mb-2">Available Fields</p>
                    <div className="flex flex-wrap gap-1.5">
                      {kList.map(k => (
                        <span key={k} className="text-[0.62rem] text-slate-400 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full font-mono">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* No map notice */}
                <div className="flex items-start gap-3 bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3">
                  <span className="text-base shrink-0">ℹ️</span>
                  <p className="text-[0.65rem] text-slate-400 leading-relaxed">
                    No geographic coordinates found — this file won't render on the map. It can still be used as reference data.
                  </p>
                </div>

                {/* Sample */}
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-[0.65rem] text-slate-500 hover:text-slate-300 transition-colors list-none select-none">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6"/></svg>
                    Preview sample data
                  </summary>
                  <pre className="mt-2 text-[0.58rem] text-slate-500 bg-black/30 border border-white/[0.06] rounded-lg p-3 overflow-x-auto leading-relaxed font-mono max-h-40">
                    {JSON.stringify(sampleObj, null, 2)}
                  </pre>
                </details>
              </div>
            );
          })()}

        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-white/[0.07] flex items-center gap-3">
          {parsed ? (
            <>
              <button
                onClick={() => { setParsed(null); setError(null); setUploadStatus("idle"); setUploadMsg(""); }}
                className="flex-1 py-2 text-xs text-slate-400 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl transition-all cursor-pointer"
              >
                Upload another file
              </button>
              {parsed.kind === "geojson" ? (
                <button
                  onClick={handleUpload}
                  disabled={uploadStatus === "uploading" || uploadStatus === "success"}
                  className="flex-1 py-2 text-xs font-semibold text-[#040d1a] bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  {uploadStatus === "uploading" ? (
                    <><svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>Uploading...</>
                  ) : uploadStatus === "success" ? (
                    <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Uploaded!</>
                  ) : (
                    <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>Upload & Add to Map</>
                  )}
                </button>
              ) : (
                <button disabled className="flex-1 py-2 text-xs text-slate-600 bg-white/[0.03] border border-white/[0.06] rounded-xl cursor-not-allowed">
                  No coordinates found
                </button>
              )}
            </>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="flex-1 py-2 text-xs text-slate-400 hover:text-slate-200 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-xl transition-all cursor-pointer"
            >
              Choose File
            </button>
          )}
        </div>
      </div>

      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 3px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
}