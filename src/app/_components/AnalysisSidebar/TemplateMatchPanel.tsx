"use client";

import React, { useState, useCallback } from "react";
import { useSession } from "next-auth/react";

export interface MapCapture {
  blob: Blob;
  previewUrl: string;
  bounds: { north: number; south: number; east: number; west: number };
}

interface TemplateMatchPanelProps {
  onResult?: (geojson: any, fileName: string) => void;
  onRequestTemplateCapture?: () => void;
  pendingTemplateCapture?: MapCapture | null;
  onClearTemplateCapture?: () => void;
  onRequestMapCapture?: () => void;
  pendingMapCapture?: MapCapture | null;
  onClearMapCapture?: () => void;
}

type EnvironmentMode = "CITY" | "FARM";

const getImageSize = async (blob: Blob) => {
  // createImageBitmap بيفك تشفير الصورة بشكل أسرع وأخف من new Image() + object URL،
  // ومش محتاج revoke ولا انتظار حدث onload على الـ DOM
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
};

// ── حساب الأبعاد الحقيقية بالمتر لأي bounds جغرافية (تقريب مسطّح كافي للمساحات الصغيرة) ──
const METERS_PER_DEGREE_LAT = 111320;

const boundsSizeMeters = (bounds: MapCapture["bounds"]) => {
  const latMid = (bounds.north + bounds.south) / 2;
  const heightMeters = Math.abs(bounds.north - bounds.south) * METERS_PER_DEGREE_LAT;
  const widthMeters =
    Math.abs(bounds.east - bounds.west) *
    METERS_PER_DEGREE_LAT *
    Math.cos((latMid * Math.PI) / 180);
  return { widthMeters, heightMeters };
};

// أكبر بُعد مسموح به لصورة الـ search area (map) بالبكسل، عشان نحدد منه GSD (متر/بكسل) ثابت
const MAP_MAX_DIM_PX = 1280;

/**
 * بياخد Blob صورة ويعمله resize لأبعاد بكسل محددة (width × height) بدون أي letterbox
 * أو حواف سودا — الصورة بتتمطّط عشان تملأ الأبعاد المطلوبة بالظبط.
 */
const resizeBlobToDims = async (blob: Blob, width: number, height: number): Promise<Blob> => {
  // createImageBitmap أسرع في الفك من new Image()+object URL، ومفيش object URL
  // نسيبه معلق لو حصل خطأ في النص
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("resizeBlobToDims: canvas context unavailable");

    ctx.drawImage(bitmap, 0, 0, width, height);

    const out = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("resizeBlobToDims: toBlob failed"))),
        "image/png"
      )
    );
    return out;
  } finally {
    bitmap.close();
  }
};

export default function TemplateMatchPanel({
  onResult,
  onRequestTemplateCapture,
  pendingTemplateCapture,
  onClearTemplateCapture,
  onRequestMapCapture,
  pendingMapCapture,
  onClearMapCapture,
}: TemplateMatchPanelProps) {
  const { data: session } = useSession();
  const [envMode, setEnvMode] = useState<EnvironmentMode>("CITY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const step = !pendingTemplateCapture ? 1 : !pendingMapCapture ? 2 : 3;
  const canSubmit = !!pendingTemplateCapture && !!pendingMapCapture;

  const handleSubmit = useCallback(async () => {
    if (loading || !canSubmit || !pendingTemplateCapture || !pendingMapCapture) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const token = (session?.user as any)?.accessToken as string | undefined;
      if (!token) throw new Error("Not authenticated. Please log in again.");

      // نتأكد إن الصور أصلاً اتحملت صح (sanity check)
      await Promise.all([
        getImageSize(pendingTemplateCapture.blob),
        getImageSize(pendingMapCapture.blob),
      ]);

      // ── تثبيت الـ scale (متر/بكسل) بين الصورتين بدل تثبيت مقاس بكسل واحد للاتنين ──
      // ده اللي بيمنع الـ backend من الفشل، لأن التمبلت لازم يفضل أصغر فعليًا من
      // صورة البحث في الأبعاد بالبكسل عشان خوارزمية template matching تشتغل.
      const templateMeters = boundsSizeMeters(pendingTemplateCapture.bounds);
      const mapMeters = boundsSizeMeters(pendingMapCapture.bounds);

      const gsd = Math.max(mapMeters.widthMeters, mapMeters.heightMeters) / MAP_MAX_DIM_PX;
      if (!isFinite(gsd) || gsd <= 0) {
        throw new Error("Could not compute a valid scale from the selected areas.");
      }

      const mapPxW = Math.max(2, Math.round(mapMeters.widthMeters / gsd));
      const mapPxH = Math.max(2, Math.round(mapMeters.heightMeters / gsd));
      const templatePxW = Math.max(1, Math.round(templateMeters.widthMeters / gsd));
      const templatePxH = Math.max(1, Math.round(templateMeters.heightMeters / gsd));

      if (templatePxW >= mapPxW || templatePxH >= mapPxH) {
        throw new Error("Template area must be smaller than the search area. Draw a tighter template or a larger search area.");
      }

      const [normalizedTemplateBlob, normalizedMapBlob] = await Promise.all([
        resizeBlobToDims(pendingTemplateCapture.blob, templatePxW, templatePxH),
        resizeBlobToDims(pendingMapCapture.blob, mapPxW, mapPxH),
      ]);

      const formData = new FormData();
      formData.append("template_image", normalizedTemplateBlob, "template.png");
      formData.append("map_image", normalizedMapBlob, "map.png");
      formData.append("environment_mode", envMode);
      formData.append("template_n", String(pendingTemplateCapture.bounds.north));
      formData.append("template_s", String(pendingTemplateCapture.bounds.south));
      formData.append("template_e", String(pendingTemplateCapture.bounds.east));
      formData.append("template_w", String(pendingTemplateCapture.bounds.west));
      formData.append("map_n", String(pendingMapCapture.bounds.north));
      formData.append("map_s", String(pendingMapCapture.bounds.south));
      formData.append("map_e", String(pendingMapCapture.bounds.east));
      formData.append("map_w", String(pendingMapCapture.bounds.west));

      const res = await fetch("/api/gis/template-match", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        const backendStatus = data?.backendStatus ? ` (backend ${data.backendStatus})` : "";
        throw new Error(data?.message ?? `Template match request failed (${res.status})${backendStatus}`);
      }

      const geojson = data?.data ?? data;
      setResult(geojson);

      if (onResult && geojson?.features) {
        const fileName = `template-match-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.geojson`;
        onResult(geojson, fileName);
      }
    } catch (err: any) {
      setError(err.message ?? "Template match failed");
    } finally {
      setLoading(false);
    }
  }, [loading, canSubmit, pendingTemplateCapture, pendingMapCapture, envMode, session, onResult]);

  /* ── shared capture card ── */
  const CaptureCard = ({
    label, capture, onRequest, onClear, stepNum, color,
  }: {
    label: string; capture: MapCapture | null | undefined;
    onRequest?: () => void; onClear?: () => void;
    stepNum: number; color: string;
  }) => (
    <div>
      <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-2">
        Step {stepNum} · {label}
      </p>
      {!capture ? (
        <button
          onClick={onRequest}
          className="w-full py-5 rounded-xl border-2 border-dashed border-white/10 hover:border-cyan-400/30 transition-all cursor-pointer flex flex-col items-center gap-2 group"
        >
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"
            style={{ background: `${color}18`, border: `1px solid ${color}30` }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
            </svg>
          </div>
          <span className="text-[0.7rem] text-slate-400 group-hover:text-slate-200 transition-colors">
            Draw a rectangle on the map
          </span>
          <span className="text-[0.58rem] text-slate-600">
            {stepNum === 1 ? "Select the building/template area" : "Select the area to search in"}
          </span>
        </button>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl overflow-hidden">
          {/* preview */}
          <div className="relative aspect-[2/1] bg-black/40">
            <img src={capture.previewUrl} alt={label} className="w-full h-full object-cover" />
            <button
              onClick={onClear}
              className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white/60 hover:text-red-400 transition-colors cursor-pointer"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
            <div
              className="absolute top-2 left-2 text-[0.55rem] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${color}25`, color, border: `1px solid ${color}40` }}
            >
              {label}
            </div>
          </div>
          {/* bounds */}
          <div className="p-2.5 grid grid-cols-2 gap-1 text-[0.58rem] text-slate-400">
            <span>N: {capture.bounds.north.toFixed(6)}</span>
            <span>S: {capture.bounds.south.toFixed(6)}</span>
            <span>E: {capture.bounds.east.toFixed(6)}</span>
            <span>W: {capture.bounds.west.toFixed(6)}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Template Matching</p>
        <p className="text-xs text-slate-300">Capture a template area, then capture the search area</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, label: "Template" },
          { n: 2, label: "Search Area" },
          { n: 3, label: "Run" },
        ].map((s, i) => (
          <React.Fragment key={s.n}>
            <div className="flex items-center gap-1.5">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.6rem] font-bold transition-all ${
                step >= s.n
                  ? "bg-cyan-400 text-[#040d1a]"
                  : "bg-white/[0.06] text-slate-600"
              }`}>
                {step > s.n ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                ) : s.n}
              </div>
              <span className={`text-[0.62rem] ${step >= s.n ? "text-slate-300" : "text-slate-600"}`}>
                {s.label}
              </span>
            </div>
            {i < 2 && <div className={`flex-1 h-px ${step > s.n ? "bg-cyan-400/40" : "bg-white/[0.08]"}`} />}
          </React.Fragment>
        ))}
      </div>

      {/* Environment Mode */}
      <div>
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-2">Environment Mode</p>
        <div className="flex gap-2">
          {(["CITY", "FARM"] as EnvironmentMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setEnvMode(mode)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                envMode === mode
                  ? "bg-cyan-400/10 border-cyan-400/30 text-cyan-400"
                  : "bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-slate-200 hover:border-white/15"
              }`}
            >
              <span className="text-base">{mode === "CITY" ? "🏙️" : "🌾"}</span>
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Step 1: Template Capture */}
      <CaptureCard
        label="Template"
        capture={pendingTemplateCapture}
        onRequest={onRequestTemplateCapture}
        onClear={onClearTemplateCapture}
        stepNum={1}
        color="#22d3ee"
      />

      {/* Step 2: Map Capture (only after template is done) */}
      {pendingTemplateCapture && (
        <CaptureCard
          label="Search Area"
          capture={pendingMapCapture}
          onRequest={onRequestMapCapture}
          onClear={onClearMapCapture}
          stepNum={2}
          color="#a78bfa"
        />
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
        className={`w-full py-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
          canSubmit && !loading
            ? "bg-cyan-400 text-[#040d1a] hover:bg-cyan-300 cursor-pointer shadow-[0_0_20px_rgba(0,212,255,0.25)]"
            : "bg-white/[0.06] text-slate-600 cursor-not-allowed"
        }`}
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
            Processing...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m21 21-4.35-4.35"/>
              <circle cx="11" cy="11" r="8"/>
            </svg>
            Run Template Match
          </>
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p className="text-[0.68rem] text-red-400">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-start gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" className="shrink-0 mt-0.5">
              <circle cx="12" cy="12" r="10"/><polyline points="8 12 11 15 16 9"/>
            </svg>
            <div>
              <p className="text-[0.68rem] text-emerald-400 font-medium">Template match complete!</p>
              <p className="text-[0.6rem] text-slate-400 mt-0.5">
                {result.features?.length ?? 0} features found
                {result.metadata?.processing_time_ms
                  ? ` · ${(result.metadata.processing_time_ms / 1000).toFixed(1)}s`
                  : ""}
              </p>
            </div>
          </div>

          {result.metadata && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <p className="text-[0.55rem] uppercase tracking-wider text-cyan-400/80 mb-2">Result Metadata</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { l: "Features", v: String(result.metadata.total_count ?? result.features?.length ?? 0) },
                  { l: "Mode", v: result.metadata.environment_mode ?? envMode },
                  { l: "Time", v: result.metadata.processing_time_ms ? `${result.metadata.processing_time_ms.toFixed(0)}ms` : "—" },
                  { l: "Template", v: result.metadata.template_size ? `${result.metadata.template_size.width}×${result.metadata.template_size.height}` : "—" },
                ].map((item) => (
                  <div key={item.l} className="bg-white/[0.03] border border-white/[0.05] rounded-lg p-2">
                    <p className="text-xs font-semibold text-slate-200">{item.v}</p>
                    <p className="text-[0.55rem] text-slate-500 mt-0.5">{item.l}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[0.58rem] text-slate-600 text-center">
            Results added as a layer on the map
          </p>
        </div>
      )}
    </div>
  );
}