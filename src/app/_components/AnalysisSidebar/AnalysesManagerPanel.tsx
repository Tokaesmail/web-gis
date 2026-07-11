"use client";

// ─── AnalysesManagerPanel.tsx ──────────────────────────────────────────────
// تبويب "Saved" المستقل في السايد بار — كان قبل كده مودال جوه
// PlanetaryRasterPanel (SavedAnalysesModal)، دلوقتي منقول هنا كبانل عادي
// زي باقي التابات، مش محتاج فتح modal. بيعرض كل الـ analyses اللي اتحفظت
// يدويًا (بزرار "Save Analysis" من أي بانل: raster / super-resolution /
// time-series..) عن طريق GET /gis/analyses، ومعاه زرار مسح نهائي بيضرب
// DELETE /gis/analyses/:id. مفيش أي POST هنا خالص — الحفظ نفسه بيحصل من
// زرار "Save Analysis" جوه كل بانل على حدة.

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const BACKEND_ANALYSES_LIST_URL = "https://webgiss.duckdns.org/gis/analyses";
const BACKEND_ANALYSES_DELETE_URL = (id: string) =>
  `https://webgiss.duckdns.org/gis/analyses/${encodeURIComponent(id)}`;

type AnalysisItem = {
  id: string;
  type?: string;
  expression?: string;
  date?: string;
  collection?: string;
  createdAt?: string;
  url?: string;
  sceneId?: string;
  raw: any; // النسخة الكاملة زي ما جايه من الباكند، لأي حقل مش متوقعينه
};

// ── الباكند ممكن يرجّع الـ list بأشكال مختلفة — array مباشرة، أو
// { data: [...] }، أو { data: { analyses: [...] } }، أو { data: { items: [...] } }.
// بندوّر على أول array فعلي بالترتيب ده ────────────────────────────────────
function extractAnalysesList(rawPayload: any): any[] {
  const candidates = [
    rawPayload?.data?.analyses,
    rawPayload?.data?.items,
    rawPayload?.data?.results,
    Array.isArray(rawPayload?.data) ? rawPayload.data : null,
    Array.isArray(rawPayload) ? rawPayload : null,
  ];
  return candidates.find((c) => Array.isArray(c)) ?? [];
}

// ── بنطبّع كل عنصر لشكل ثابت نعرضه بيه، مهما الباكند سمّى الحقول إيه ──────
function normalizeAnalysis(item: any, idx: number): AnalysisItem {
  const params = item?.parameters ?? item?.result?.parameters ?? {};
  const resultData = item?.result?.data ?? item?.data ?? {};
  return {
    id: String(item?.id ?? item?._id ?? item?.analysis_id ?? idx),
    type: item?.type ?? item?.kind,
    expression: item?.expression ?? params?.expression,
    date: item?.date ?? params?.date ?? item?.date_range,
    collection: item?.collection ?? params?.collection,
    createdAt: item?.created_at ?? item?.createdAt ?? item?.timestamp,
    url: item?.url ?? resultData?.url,
    sceneId: item?.scene_id_used ?? resultData?.scene_id_used,
    raw: item,
  };
}

const TYPE_COLORS: Record<string, string> = {
  raster: "#22d3ee",
  "time-series": "#a78bfa",
  "super-resolution": "#f97316",
  "change-detection": "#34d399",
};

export function AnalysesManagerPanel() {
  const { data: session } = useSession();
  const accessToken = (session?.user as any)?.accessToken as string | undefined;

  const [status, setStatus] = useState<"loading" | "error" | "success">("loading");
  const [error, setError] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([]);
  // ── id اللي دوسنا عليه "Delete" ليه أول مرة، وبننتظر تأكيد تاني قبل
  // ما نمسح فعليًا — عشان مفيش مسح بالغلط بضغطة واحدة (المسح نهائي) ──────
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadAnalyses = async () => {
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch(BACKEND_ANALYSES_LIST_URL, {
        method: "GET",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to load analyses (${res.status}). ${text.slice(0, 160)}`);
      }

      const rawPayload = await res.json();
      if (rawPayload?.success === false) {
        throw new Error(rawPayload?.message ?? "Failed to load analyses");
      }

      const list = extractAnalysesList(rawPayload).map(normalizeAnalysis);
      setAnalyses(list);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Failed to load analyses.");
    }
  };

  useEffect(() => {
    loadAnalyses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(BACKEND_ANALYSES_DELETE_URL(id), {
        method: "DELETE",
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Delete failed (${res.status}). ${text.slice(0, 160)}`);
      }

      // ── بعض الباكندز بترجع body فاضي مع 204 — بنحاول نقراه بس منكسرش
      // لو مفيش حاجة نقراها ──────────────────────────────────────────────
      const json = await res.json().catch(() => null);
      if (json && json.success === false) {
        throw new Error(json?.message ?? "Delete failed");
      }

      // ── مسح فعلي ونهائي من الداتا بيز اتأكد — بنشيله من الـ list محليًا
      // من غير ما نحتاج نعمل reload كامل ──────────────────────────────────
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      setConfirmingId(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete request failed.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-lg p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.62rem] uppercase tracking-wider text-slate-500">Saved Analyses</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-300">
              Everything saved manually via "Save Analysis" across all panels.
            </p>
          </div>
          <button
            type="button"
            onClick={loadAnalyses}
            disabled={status === "loading"}
            title="Refresh"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-cyan-400/15 hover:text-cyan-300 disabled:opacity-40"
            style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M4 4v5h5M20 20v-5h-5M4.5 9a8 8 0 0 1 14.13-3.36M19.5 15a8 8 0 0 1-14.13 3.36" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {status === "loading" && (
        <p className="py-8 text-center text-xs text-slate-500">Loading saved analyses…</p>
      )}

      {status === "error" && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[0.68rem] text-red-300">
          {error}
        </div>
      )}

      {status === "success" && analyses.length === 0 && (
        <p className="py-8 text-center text-xs text-slate-500">No saved analyses yet.</p>
      )}

      {status === "success" &&
        analyses.map((a) => {
          const typeColor = (a.type && TYPE_COLORS[a.type]) || "#22d3ee";
          return (
            <div
              key={a.id}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.type && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[0.55rem] font-bold"
                        style={{ color: typeColor, background: `${typeColor}18`, border: `1px solid ${typeColor}30` }}
                      >
                        {a.type}
                      </span>
                    )}
                    {a.collection && (
                      <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[0.55rem] text-slate-400">
                        {a.collection}
                      </span>
                    )}
                  </div>
                  {a.expression && (
                    <p className="break-all font-mono text-[0.62rem] text-slate-300">{a.expression}</p>
                  )}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.58rem] text-slate-500">
                    {a.date && <span>📅 {a.date}</span>}
                    {a.createdAt && <span>🕒 {new Date(a.createdAt).toLocaleString()}</span>}
                  </div>
                  <p className="font-mono text-[0.5rem] text-slate-600">ID: {a.id}</p>
                </div>

                {/* Delete — بيحتاج تأكيد تاني قبل الضرب الفعلي لـ DELETE،
                    لأن المسح نهائي من الداتا بيز ومش قابل للتراجع ──────── */}
                <div className="shrink-0">
                  {confirmingId === a.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id)}
                        disabled={deletingId === a.id}
                        className="rounded-md bg-red-500 px-2.5 py-1.5 text-[0.6rem] font-bold text-white transition-colors hover:bg-red-400 disabled:opacity-50"
                      >
                        {deletingId === a.id ? "Deleting…" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        disabled={deletingId === a.id}
                        className="rounded-md border border-white/[0.1] bg-white/[0.04] px-2.5 py-1.5 text-[0.6rem] font-semibold text-slate-300 hover:bg-white/[0.08]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(a.id)}
                      title="Permanently delete this analysis"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-red-400/70 transition-colors hover:bg-red-500/15 hover:text-red-300"
                      style={{ border: "1px solid rgba(248,113,113,0.25)" }}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

      {deleteError && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[0.65rem] text-red-300">
          {deleteError}
        </div>
      )}
    </div>
  );
}

export default AnalysesManagerPanel;
