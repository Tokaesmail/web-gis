"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

interface AnalysisRecord {
  id?: string;
  _id?: string;
  type?: string;
  analysisType?: string;
  kind?: string;
  name?: string;
  title?: string;
  createdAt?: string;
  created_at?: string;
  timestamp?: string;
  [key: string]: any;
}

const TYPE_ICON: Record<string, string> = {
  "template-match": "🧩",
  template_match: "🧩",
  templatematch: "🧩",

  "raster-calc": "🧮",
  raster_calc: "🧮",
  rastercalc: "🧮",
  raster: "🧮",

  "satellite-data": "🛰️",
  satellite_data: "🛰️",
  satellitedata: "🛰️",
  satellite: "🛰️",

  "change-detection": "🔄",
  change_detection: "🔄",
  changedetection: "🔄",

  elevation: "⛰️",
  "elevation-analysis": "⛰️",
  elevation_analysis: "⛰️",

  "volume-calc": "📦",
  volume_calc: "📦",
  volumecalc: "📦",
  volume: "📦",
};

function getTypeIcon(type: string): string {
  const key = type.toLowerCase().replace(/\s+/g, "");
  return TYPE_ICON[type] ?? TYPE_ICON[key] ?? "📊";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SavedAnalysesPanel() {
  const { data: session } = useSession();
  const token = (session?.user as any)?.accessToken as string | undefined;

  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    if (!token) {
      setError("Not authenticated. Please log in again.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE_URL}/gis/analyses`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? `Failed to load analyses (${res.status})`);
      const list = Array.isArray(data) ? data : data?.data ?? data?.analyses ?? [];
      setAnalyses(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load analyses");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  const handleDelete = useCallback(async (id: string) => {
    if (!id || !token) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${BASE_URL}/gis/analyses/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? `Delete failed (${res.status})`);
      setAnalyses((prev) => prev.filter((a) => (a.id ?? a._id) !== id));
      toast.success("Analysis deleted permanently");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete analysis");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }, [token]);

  return (
    <div className="space-y-3">
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 flex items-center justify-between">
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Saved Analyses</p>
          <p className="text-xs text-slate-300">
            {analyses.length} record{analyses.length !== 1 ? "s" : ""} stored on the server
          </p>
        </div>
        <button
          onClick={fetchAnalyses}
          disabled={loading}
          className="text-[0.62rem] px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400 hover:text-cyan-400 hover:border-cyan-400/30 transition-all cursor-pointer disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[0.68rem] text-red-400">{error}</p>
        </div>
      )}

      {loading && !analyses.length && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.04] animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !error && analyses.length === 0 && (
        <div className="py-10 text-center opacity-40 text-[0.7rem]">
          No saved analyses yet. Run a Template Match or Raster Calculation to see results here.
        </div>
      )}

      <div className="space-y-2">
        {analyses.map((a, idx) => {
          const id = String(a.id ?? a._id ?? "");
          const type = String(a.type ?? a.analysisType ?? a.kind ?? "analysis");
          const icon = getTypeIcon(type);
          const title = a.name ?? a.title ?? type.replace(/[-_]/g, " ");
          const created = a.createdAt ?? a.created_at ?? a.timestamp;
          const isConfirming = confirmId === id;
          const isDeleting = deletingId === id;

          return (
            <div key={id || idx} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cyan-400/10 border border-cyan-400/20 flex items-center justify-center text-base shrink-0">
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.75rem] font-medium text-slate-200 truncate capitalize">{title}</p>
                  <p className="text-[0.6rem] text-slate-500">
                    {formatDate(created)} · id {id ? id.slice(0, 8) : "—"}
                  </p>
                </div>

                {!isConfirming ? (
                  <button
                    onClick={() => setConfirmId(id)}
                    disabled={!id || isDeleting}
                    title="Delete permanently"
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" />
                    </svg>
                  </button>
                ) : (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => handleDelete(id)}
                      disabled={isDeleting}
                      className="text-[0.6rem] px-2 py-1.5 rounded-lg bg-red-500/15 text-red-300 border border-red-500/25 hover:bg-red-500/25 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {isDeleting ? "Deleting..." : "Confirm delete"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      disabled={isDeleting}
                      className="text-[0.6rem] px-2 py-1.5 rounded-lg bg-white/[0.05] text-slate-400 border border-white/[0.08] hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[0.58rem] text-slate-600 text-center pt-1">
        Deleting is permanent and removes the record from the database — this cannot be undone.
      </p>
    </div>
  );
}