"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getFeatureBounds } from "./geoFeatureUtils";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";
// نفس الـ endpoint اللي بتستخدمه باقي البانلز (raster calc..) للحفظ الفعلي —
// كنا بنبعت لـ "/api/gis/analyses" (route محلي مش موصول بحاجة)، عشان كده
// الحفظ كان بيفشل / يقول Saved من غير ما يتحفظ فعليًا في الداتا بيز
const BACKEND_ANALYSES_SAVE_URL = "https://webgiss.duckdns.org/gis/analyses";

// شكل الريسبونس الحقيقي بقى مؤكد (من الباكند فعليًا):
//   { success, message, data: { result: { ..., image_base64: "data:image/png;base64,..." },
//                                 savePayload: { type, parameters, result } } }
// الصورة اسمها "image_base64" بالظبط، وجايه بالـ "data:image/png;base64," prefix
// جاهز من الباكند نفسه (مش base64 عاري). سايبين باقي الاحتمالات كـ fallback
// لو الشكل ده اتغيّر تاني في المستقبل.
function extractBase64Image(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload === "string" && payload.length > 100) return payload;
  const candidates = [
    payload.image_base64,
    payload.image,
    payload.result,
    payload.result_base64,
    payload.base64,
    payload.data?.result?.image_base64,
    payload.data?.image_base64,
    payload.data?.image,
    payload.data?.result,
    typeof payload.data === "string" ? payload.data : undefined,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 100) return candidate;
  }
  return null;
}

function toImageSrc(base64: string) {
  return base64.startsWith("data:image") ? base64 : `data:image/png;base64,${base64}`;
}

// ── الخريطة overlay بتعمل decode/render تاني لنفس الصورة فوق التايلز —
// لو الناتج صغير (زوم قليل / bbox صغير)، ده تقيل من غير فايدة حقيقية،
// فبنحطها بس لو عدد بكسلات الناتج (width × height) أكبر من كده.
// عدّليها براحتك حسب الأداء اللي شايفاه ────────────────────────────────────
const SR_MAP_OVERLAY_MIN_PIXELS = 2_000_000; // ≈ 1414×1414 أو أكبر

export type SuperResolutionPreviewConfig = {
  dataUrl: string;
  bounds: [[number, number], [number, number]]; // [[south, west], [north, east]]
  coords: { lat: number; lng: number };
};

export function SuperResolutionPanel({
  selectedFeature,
  onPreview,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  /** لما نتاكد من الـ SR result، بنبعته للماب نفسه كـ overlay فوق الـ tiles
   *  (زي الـ raster calculator بالظبط) بدل ما يفضل بس في الـ sidebar */
  onPreview?: (config: SuperResolutionPreviewConfig | null) => void;
}) {
  const { data: session } = useSession();
  const token = (session?.user as any)?.accessToken as string | undefined;

  const bounds = getFeatureBounds(selectedFeature);
  const [[south, west], [north, east]] = bounds;

  const [bbox, setBbox] = useState<[number, number, number, number]>([west, south, east, north]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // هنا بنخزّن الـ payload الجاهز للحفظ بنفس شكل { type, parameters, result }
  // اللي POST /gis/analyses مستنيه بالظبط — الباكند بيرجّعه جاهز في
  // data.savePayload، فبنستخدمه زي ما هو من غير ما نبنيه إحنا تاني.
  const [savePayload, setSavePayload] = useState<any>(null);
  // بيانات إضافية للعرض بس (مش للحفظ) — وقت المعالجة، أبعاد الصورة، السينز
  // المستخدمة في التركيب
  const [resultMeta, setResultMeta] = useState<{
    processingTimeS?: number;
    lrWidth?: number;
    lrHeight?: number;
    srWidth?: number;
    srHeight?: number;
    timestampsUsed?: string[];
  } | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [placedOnMap, setPlacedOnMap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // ── بنفرّق بين "البانل لسه فاتح لأول مرة" (زي لما ترجعي له من تاب تاني)
  // و"الـ AOI اتغيرت فعلاً وانتي لسه فاتحة البانل" — عشان مش عايزين نمسح
  // النتيجة من على الخريطة مجرد إن البانل اتعمله remount ──────────────────
  const isInitialMountRef = useRef(true);

  useEffect(() => {
    setBbox([west, south, east, north]);
    setSavePayload(null);
    setResultMeta(null);
    setImageSrc(null);
    setPlacedOnMap(false);
    setSaved(false);
    if (isInitialMountRef.current) {
      // أول فتحة للبانل — سيبي أي overlay قديم موجود على الماب زي ما هو
      isInitialMountRef.current = false;
    } else {
      // البانل مفتوح والـ AOI اتغيرت فعلاً (رسمة جديدة) — دلوقتي فعلاً
      // النتيجة القديمة بقت مش مرتبطة بمكانها، امسحيها من على الماب
      onPreview?.(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [west, south, east, north]);

  const runSuperResolution = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const requestBody = { bbox };
      const res = await fetch(`/api/gis/super-resolution`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(requestBody),
});

      // ── الباكند بيرجّع JSON فيه data.result (الناتج الفعلي بالصورة)
      // وجنبه data.savePayload (نسخة جاهزة { type, parameters, result }
      // مظبوطة بالظبط لـ POST /gis/analyses). بنقرا كـ text الأول احتياطًا
      // لو رجع شكل تاني مش JSON في يوم من الأيام ──────────────────────────
      const rawText = await res.text();
      let rawPayload: any = rawText;
      try {
        rawPayload = JSON.parse(rawText);
      } catch {
        // مش JSON — سيبيه زي ما هو (نص خام)
      }

      if (!res.ok) {
        throw new Error((rawPayload && rawPayload.message) ?? `Super resolution failed (${res.status})`);
      }
      if (rawPayload && rawPayload.success === false) {
        throw new Error(rawPayload.message ?? "Super resolution failed");
      }

      // الناتج الفعلي (فيه image_base64) جوه data.result
      const innerResult = rawPayload?.data?.result ?? rawPayload?.data ?? rawPayload;

      // لو الباكند مبعتش savePayload جاهزة (احتياطًا فقط)، نبنيها إحنا بنفس الشكل
      const readySavePayload =
        rawPayload?.data?.savePayload ?? {
          type: "super-resolution",
          parameters: requestBody,
          result: innerResult,
        };

      setSavePayload(readySavePayload);
      setResultMeta(
        innerResult && typeof innerResult === "object"
          ? {
              processingTimeS: innerResult.processing_time_s,
              lrWidth: innerResult.lr_width_px,
              lrHeight: innerResult.lr_height_px,
              srWidth: innerResult.sr_width_px,
              srHeight: innerResult.sr_height_px,
              timestampsUsed: innerResult.timestamps_used,
            }
          : null
      );

      // Decoding happens entirely in the browser, just to preview the image —
      // nothing gets re-uploaded anywhere as a result of this step.
      const base64 = extractBase64Image(innerResult) ?? extractBase64Image(rawPayload);
      const src = base64 ? toImageSrc(base64) : null;
      setImageSrc(src);

      // ── الـ sidebar preview فوق ده بيفضل زي ما هو دايمًا (default) —
      // بس overlay الخريطة (اللي بيعمل decode/render تاني للصورة نفسها فوق
      // التايلز) بنحطه بس لو الصورة فعلاً كبيرة بما يكفي إنها تستاهل — تحت
      // كده أي مقاس كبير هيبقى double-decode من غير داعي وهيتقل بلاش ────────
      const srPixels = (innerResult?.sr_width_px ?? 0) * (innerResult?.sr_height_px ?? 0);
      const worthMapOverlay = srPixels >= SR_MAP_OVERLAY_MIN_PIXELS;

      if (src && worthMapOverlay) {
        const [reqWest, reqSouth, reqEast, reqNorth] = bbox;
        onPreview?.({
          dataUrl: src,
          bounds: [[reqSouth, reqWest], [reqNorth, reqEast]],
          coords: { lat: (reqSouth + reqNorth) / 2, lng: (reqWest + reqEast) / 2 },
        });
        setPlacedOnMap(true);
      } else {
        onPreview?.(null);
        setPlacedOnMap(false);
      }
    } catch (err: any) {
      setError(err?.message ?? "Super resolution request failed");
      setSavePayload(null);
      setResultMeta(null);
      setImageSrc(null);
      setPlacedOnMap(false);
      onPreview?.(null);
    } finally {
      setLoading(false);
    }
  }, [bbox, token, onPreview]);

  const handleSaveAnalysis = useCallback(async () => {
    if (!savePayload) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(BACKEND_ANALYSES_SAVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // savePayload جايه جاهزة من الباكند بنفس شكل { type, parameters,
        // result } اللي /gis/analyses مستنيه — بتتبعت زي ما هي من غير تعديل
        body: JSON.stringify(savePayload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) throw new Error(data?.message ?? "Failed to save analysis");
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to save analysis");
    } finally {
      setSaving(false);
    }
  }, [savePayload, token]);

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3">
        <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Super Resolution</p>
        <p className="text-xs text-slate-300">Upscales the selected AOI using the backend model</p>
      </div>

      <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
        <p className="mb-2 text-[0.6rem] uppercase tracking-wider text-slate-500">Bounding Box (WGS84)</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(["West", "South", "East", "North"] as const).map((label, i) => (
            <label key={label} className="space-y-0.5 block">
              <span className="text-[0.58rem] text-slate-600">{label}</span>
              <input
                type="number"
                step="0.0001"
                value={bbox[i]}
                onChange={(e) => {
                  const next = [...bbox] as [number, number, number, number];
                  next[i] = parseFloat(e.target.value) || 0;
                  setBbox(next);
                }}
                className="w-full bg-[#020817]/70 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[0.65rem] text-slate-200 font-mono outline-none focus:border-cyan-400/40"
              />
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={runSuperResolution}
        disabled={loading}
        className="w-full h-10 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-wait text-[#03101d] text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
      >
        {loading ? "Running super resolution…" : "Run Super Resolution"}
      </button>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-[0.65rem] text-red-300">
          {error}
        </div>
      )}

      {imageSrc && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">Result Preview</p>
            {placedOnMap ? (
              <span className="text-[0.55rem] text-cyan-300/80">Also placed on the map ↗</span>
            ) : (
              <span className="text-[0.55rem] text-slate-600" title="Small results only show here to avoid double-rendering the image">
                Not shown on map (small result)
              </span>
            )}
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="Super resolution result" className="w-full rounded-lg border border-white/[0.06]" />

          {resultMeta && (
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {resultMeta.lrWidth && resultMeta.lrHeight && (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                  <p className="text-[0.5rem] uppercase tracking-wider text-slate-600">Input (LR)</p>
                  <p className="text-[0.62rem] text-slate-300">{resultMeta.lrWidth}×{resultMeta.lrHeight}px</p>
                </div>
              )}
              {resultMeta.srWidth && resultMeta.srHeight && (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                  <p className="text-[0.5rem] uppercase tracking-wider text-slate-600">Output (SR)</p>
                  <p className="text-[0.62rem] text-slate-300">{resultMeta.srWidth}×{resultMeta.srHeight}px</p>
                </div>
              )}
              {typeof resultMeta.processingTimeS === "number" && (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                  <p className="text-[0.5rem] uppercase tracking-wider text-slate-600">Processing</p>
                  <p className="text-[0.62rem] text-slate-300">{resultMeta.processingTimeS.toFixed(1)}s</p>
                </div>
              )}
              {resultMeta.timestampsUsed && resultMeta.timestampsUsed.length > 0 && (
                <div className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
                  <p className="text-[0.5rem] uppercase tracking-wider text-slate-600">Scenes used</p>
                  <p className="text-[0.62rem] text-slate-300">{resultMeta.timestampsUsed.length}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {savePayload && !imageSrc && (
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[0.62rem] text-amber-200">
          Got a response back but couldn't find an image field to preview under the keys we check.
          You can still save the analysis below — nothing is lost.
        </div>
      )}

      {savePayload && (
        <button
          type="button"
          onClick={handleSaveAnalysis}
          disabled={saving}
          className="w-full h-10 rounded-xl border border-emerald-400/25 bg-emerald-400/10 hover:bg-emerald-400/15 disabled:opacity-50 disabled:cursor-wait text-emerald-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save Analysis"}
        </button>
      )}
    </div>
  );
}