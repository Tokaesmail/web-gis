"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getFeatureBounds } from "./geoFeatureUtils";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

// The backend response shape for /gis/super-resolution isn't documented anywhere
// we have access to (no example response in the Postman collection), so we
// defensively look for the base64 string under a few likely keys instead of
// assuming one. If the real key turns out to be something else, add it here.
function extractBase64Image(payload: any): string | null {
  if (!payload) return null;
  const candidates = [
    payload.image,
    payload.result,
    payload.result_base64,
    payload.base64,
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

export function SuperResolutionPanel({
  selectedFeature,
}: {
  selectedFeature?: GeoJSON.Feature | null;
}) {
  const { data: session } = useSession();
  const token = (session?.user as any)?.accessToken as string | undefined;

  const bounds = getFeatureBounds(selectedFeature);
  const [[south, west], [north, east]] = bounds;

  const [bbox, setBbox] = useState<[number, number, number, number]>([west, south, east, north]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Exactly what the backend returned from /gis/super-resolution — kept untouched
  // so that clicking "Save" forwards it as-is to /gis/analyses.
  const [savePayload, setSavePayload] = useState<any>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBbox([west, south, east, north]);
    setSavePayload(null);
    setImageSrc(null);
    setSaved(false);
  }, [west, south, east, north]);

  const runSuperResolution = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/gis/super-resolution`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bbox }),
});
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.message ?? `Super resolution failed (${res.status})`);
      }

      setSavePayload(payload);

      // Decoding happens entirely in the browser, just to preview the image —
      // nothing gets re-uploaded anywhere as a result of this step.
      const base64 = extractBase64Image(payload);
      setImageSrc(base64 ? toImageSrc(base64) : null);
    } catch (err: any) {
      setError(err?.message ?? "Super resolution request failed");
      setSavePayload(null);
      setImageSrc(null);
    } finally {
      setLoading(false);
    }
  }, [bbox, token]);

  const handleSaveAnalysis = useCallback(async () => {
    if (!savePayload) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/gis/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // savePayload goes out exactly as the backend returned it — no edits.
        body: JSON.stringify(savePayload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? "Failed to save analysis");
      setSaved(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed to save analysis");
    } finally {
      setSaving(false);
    }
  }, [savePayload]);

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
          <p className="text-[0.6rem] uppercase tracking-wider text-slate-500">Result Preview</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt="Super resolution result" className="w-full rounded-lg border border-white/[0.06]" />
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
