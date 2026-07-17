"use client";
import { useState, useCallback, useRef, useLayoutEffect, useEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLang } from "../_components/translations";
import { exportPanelReport, type PanelReportType } from "../reports/panelExport";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface ExportData {
  title?: string;
  selectedArea?: { name: string; ha: number };
  coords?: { lat: number; lng: number };
  ndviData?: Record<string, { value: number; min: number; max: number; mean: number; trend: string }>;
  weatherData?: any;
  cropAnalysis?: {
    cropType: string; health: string; coverage: number;
    estimatedYield: string; recommendation: string;
  };
  layers?: { name: string; type: string; visible: boolean; featureCount?: number }[];
  geoJsonFeatures?: any[];
  timestamp?: string;
}

interface Props {
  data: ExportData;
  /** Ref to the live panel content to capture with html2canvas */
  panelRef?: RefObject<HTMLElement | null>;
  /** Report type for styling and filename */
  reportType?: PanelReportType;
  /** Icon-only button for tight toolbars */
  compact?: boolean;
  /** Full-width button for sidebar panels */
  block?: boolean;
}

const MENU_WIDTH = 210;
const MENU_HEIGHT = 118;

function buildStructuredRows(data: ExportData, isRTL: boolean): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (data.coords) {
    rows.push(
      { label: isRTL ? "خط العرض" : "Latitude", value: `${data.coords.lat.toFixed(5)}°` },
      { label: isRTL ? "خط الطول" : "Longitude", value: `${data.coords.lng.toFixed(5)}°` },
    );
  }
  if (data.selectedArea) {
    rows.push(
      { label: isRTL ? "المنطقة" : "Area Name", value: data.selectedArea.name },
      { label: isRTL ? "المساحة (هكتار)" : "Area (ha)", value: data.selectedArea.ha.toLocaleString() },
    );
  }
  if (data.ndviData) {
    Object.entries(data.ndviData).forEach(([k, v]) => {
      rows.push(
        { label: `${k} ${isRTL ? "القيمة" : "Value"}`, value: v.value.toFixed(3) },
        { label: `${k} Min`, value: v.min.toFixed(3) },
        { label: `${k} Max`, value: v.max.toFixed(3) },
        { label: `${k} Mean`, value: v.mean.toFixed(3) },
        { label: `${k} ${isRTL ? "الاتجاه" : "Trend"}`, value: v.trend },
      );
    });
  }
  if (data.cropAnalysis) {
    rows.push(
      { label: isRTL ? "نوع المحصول" : "Crop Type", value: data.cropAnalysis.cropType },
      { label: isRTL ? "الصحة" : "Health", value: data.cropAnalysis.health },
      { label: isRTL ? "التغطية %" : "Coverage %", value: `${data.cropAnalysis.coverage}%` },
      { label: isRTL ? "الإنتاجية المتوقعة" : "Est. Yield", value: data.cropAnalysis.estimatedYield },
      { label: isRTL ? "التوصية" : "Recommendation", value: data.cropAnalysis.recommendation },
    );
  }
  if (data.layers?.length) {
    data.layers.forEach((l) => {
      rows.push({
        label: `${isRTL ? "طبقة" : "Layer"}: ${l.name}`,
        value: `${l.type} · ${l.visible ? (isRTL ? "مرئية" : "Visible") : (isRTL ? "مخفية" : "Hidden")}${l.featureCount != null ? ` · ${l.featureCount} features` : ""}`,
      });
    });
  }
  if (data.geoJsonFeatures?.length) {
    const f = data.geoJsonFeatures[0];
    if (f?.properties) {
      Object.entries(f.properties).slice(0, 20).forEach(([k, v]) => {
        if (v != null && !String(k).startsWith("_")) {
          rows.push({ label: k, value: String(v) });
        }
      });
    }
    if (f?.geometry?.type) {
      rows.push({ label: isRTL ? "نوع الهندسة" : "Geometry Type", value: f.geometry.type });
    }
  }

  return rows;
}

// ─── Excel (CSV) export ─────────────────────────────────────────────────────────
function exportExcel(data: ExportData, isRTL: boolean) {
  const rows: string[][] = [];
  const sep = ",";

  rows.push(["GeoSense AI — Data Export"]);
  rows.push([`${isRTL ? "تاريخ" : "Date"}`, new Date().toISOString()]);
  if (data.coords) {
    rows.push([]);
    rows.push([isRTL ? "الإحداثيات" : "Coordinates"]);
    rows.push([isRTL ? "خط العرض" : "Latitude", String(data.coords.lat)]);
    rows.push([isRTL ? "خط الطول" : "Longitude", String(data.coords.lng)]);
  }
  if (data.selectedArea) {
    rows.push([isRTL ? "المساحة" : "Area (ha)", String(data.selectedArea.ha)]);
  }

  if (data.ndviData) {
    rows.push([]);
    rows.push([isRTL ? "المؤشرات النباتية" : "Vegetation Indices"]);
    rows.push([isRTL ? "المؤشر" : "Index", isRTL ? "القيمة" : "Value", "Min", "Max", "Mean", isRTL ? "الاتجاه" : "Trend"]);
    Object.entries(data.ndviData).forEach(([k, v]) => {
      rows.push([k, v.value.toFixed(4), v.min.toFixed(4), v.max.toFixed(4), v.mean.toFixed(4), v.trend]);
    });
  }

  if (data.cropAnalysis) {
    rows.push([]);
    rows.push([isRTL ? "تحليل المحاصيل" : "Crop Analysis"]);
    rows.push([isRTL ? "نوع المحصول" : "Crop Type", data.cropAnalysis.cropType]);
    rows.push([isRTL ? "الصحة" : "Health", data.cropAnalysis.health]);
    rows.push([isRTL ? "التغطية %" : "Coverage %", String(data.cropAnalysis.coverage)]);
    rows.push([isRTL ? "الإنتاجية" : "Est. Yield", data.cropAnalysis.estimatedYield]);
    rows.push([isRTL ? "التوصية" : "Recommendation", data.cropAnalysis.recommendation]);
  }

  if (data.layers?.length) {
    rows.push([]);
    rows.push([isRTL ? "الطبقات" : "Map Layers"]);
    rows.push([isRTL ? "الاسم" : "Name", isRTL ? "النوع" : "Type", isRTL ? "مرئية" : "Visible", isRTL ? "المعالم" : "Features"]);
    data.layers.forEach((l) => {
      rows.push([l.name, l.type, l.visible ? "Yes" : "No", String(l.featureCount ?? "")]);
    });
  }

  if (data.geoJsonFeatures?.length) {
    rows.push([]);
    rows.push([isRTL ? "بيانات GeoJSON" : "GeoJSON Features"]);
    const allProps = new Set<string>();
    data.geoJsonFeatures.forEach((f) => Object.keys(f.properties ?? {}).forEach((k) => allProps.add(k)));
    const headers = ["geometry_type", ...Array.from(allProps)];
    rows.push(headers);
    data.geoJsonFeatures.slice(0, 200).forEach((f) => {
      rows.push([f.geometry?.type ?? "", ...Array.from(allProps).map((k) => String(f.properties?.[k] ?? ""))]);
    });
  }

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(sep)).join("\n");
  const bom = "\uFEFF";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `geosense_export_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportMenuPortal({
  open,
  onClose,
  menuPos,
  isRTL,
  ff,
  loading,
  onPDF,
  onExcel,
}: {
  open: boolean;
  onClose: () => void;
  menuPos: { top: number; left: number } | null;
  isRTL: boolean;
  ff: string;
  loading: "pdf" | "excel" | null;
  onPDF: () => void;
  onExcel: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !open || !menuPos) return null;

  return createPortal(
    <>
      <div
        style={{ position: "fixed", inset: 0, zIndex: 100000 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="menu"
        style={{
          position: "fixed",
          top: menuPos.top,
          left: menuPos.left,
          zIndex: 100001,
          width: MENU_WIDTH,
          background: "rgba(7,15,30,1)",
          border: "1px solid rgba(0,212,255,0.2)",
          borderRadius: 12,
          padding: 6,
          boxShadow: "0 16px 48px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,212,255,0.08)",
          fontFamily: ff,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          onClick={onPDF}
          disabled={loading === "pdf"}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "10px 12px", borderRadius: 8, background: "none", border: "none",
            color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontFamily: ff,
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {loading === "pdf" ? (
              <div style={{ width: 12, height: 12, border: "2px solid #ef4444", borderTopColor: "transparent", borderRadius: "50%", animation: "geosense-spin .7s linear infinite" }} />
            ) : (
              <span style={{ color: "#ef4444", fontSize: 10, fontWeight: 800 }}>PDF</span>
            )}
          </div>
          <div style={{ textAlign: isRTL ? "right" : "left" }}>
            <div style={{ fontWeight: 600 }}>{isRTL ? "تصدير PDF" : "Export PDF"}</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>{isRTL ? "html2canvas + تقرير احترافي" : "html2canvas professional report"}</div>
          </div>
        </button>

        <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "3px 0" }} />

        <button
          type="button"
          role="menuitem"
          onClick={onExcel}
          disabled={loading === "excel"}
          style={{
            display: "flex", alignItems: "center", gap: 10, width: "100%",
            padding: "10px 12px", borderRadius: 8, background: "none", border: "none",
            color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontFamily: ff,
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {loading === "excel" ? (
              <div style={{ width: 12, height: 12, border: "2px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", animation: "geosense-spin .7s linear infinite" }} />
            ) : (
              <span style={{ color: "#22c55e", fontSize: 10, fontWeight: 800 }}>XLS</span>
            )}
          </div>
          <div style={{ textAlign: isRTL ? "right" : "left" }}>
            <div style={{ fontWeight: 600 }}>{isRTL ? "تصدير Excel" : "Export Excel"}</div>
            <div style={{ fontSize: 10, color: "#64748b" }}>{isRTL ? "جدول بيانات CSV" : "Spreadsheet CSV"}</div>
          </div>
        </button>
      </div>
      <style>{`@keyframes geosense-spin{to{transform:rotate(360deg)}}`}</style>
    </>,
    document.body,
  );
}

// ─── Main button ───────────────────────────────────────────────────────────────
export default function ExportButton({
  data,
  panelRef,
  reportType = "general",
  compact = false,
  block = false,
}: Props) {
  const { isRTL } = useLang();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"pdf" | "excel" | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ff = isRTL ? "'Noto Sans Arabic', sans-serif" : "'DM Sans', sans-serif";

  const updateMenuPosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < MENU_HEIGHT + 16;
    const top = openUp ? rect.top - MENU_HEIGHT - 8 : rect.bottom + 8;
    let left = isRTL ? rect.left : rect.right - MENU_WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8));
    setMenuPos({ top, left });
  }, [isRTL]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handlePDF = useCallback(async () => {
    setLoading("pdf");
    setOpen(false);
    await new Promise((r) => setTimeout(r, 80));
    try {
      const panelEl = panelRef?.current;
      if (!panelEl) {
        alert(isRTL ? "لم يتم العثور على محتوى اللوحة للتصدير" : "Panel content not found for export");
        return;
      }

      await exportPanelReport({
        panelElement: panelEl,
        reportType,
        title: data.title ?? (isRTL ? "تقرير GeoSense AI" : "GeoSense AI Report"),
        locale: isRTL ? "ar" : "en",
        structuredRows: buildStructuredRows(data, isRTL),
        filename: `GeoSense_${reportType}_${Date.now()}.pdf`,
        captureMap: true,
      });
    } catch (err) {
      console.error("PDF export failed:", err);
      alert(isRTL ? "فشل تصدير PDF — حاول مرة أخرى" : "PDF export failed — please try again");
    } finally {
      setLoading(null);
    }
  }, [data, isRTL, panelRef, reportType]);

  const handleExcel = useCallback(async () => {
    setLoading("excel");
    await new Promise((r) => setTimeout(r, 200));
    exportExcel(data, isRTL);
    setLoading(null);
    setOpen(false);
  }, [data, isRTL]);

  const blockStyle = block
    ? {
        width: "100%",
        justifyContent: "center" as const,
        padding: "10px 16px",
        background: open ? "rgba(0,212,255,0.18)" : "rgba(0,212,255,0.12)",
        border: `1px solid ${open ? "rgba(0,212,255,0.45)" : "rgba(0,212,255,0.28)"}`,
        color: "#67e8f9",
        fontWeight: 600,
      }
    : {};

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !loading && setOpen((p) => !p)}
        disabled={loading !== null}
        title={isRTL ? "تصدير التقرير — PDF أو Excel" : "Export report — PDF or Excel"}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? 0 : 8,
          padding: compact ? "7px" : block ? "10px 16px" : "7px 12px",
          background: block ? blockStyle.background : open ? "rgba(0,212,255,0.12)" : "rgba(255,255,255,0.04)",
          border: block
            ? blockStyle.border
            : `1px solid ${open ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: block ? 10 : 9,
          color: block ? blockStyle.color : open ? "#00d4ff" : "#94a3b8",
          cursor: "pointer",
          transition: "all .18s",
          fontFamily: ff,
          fontSize: 12,
          fontWeight: block ? 600 : 500,
          width: block ? "100%" : undefined,
          justifyContent: block ? "center" : undefined,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {!compact && <span>{loading === "pdf" ? (isRTL ? "جاري التصدير..." : "Exporting...") : (isRTL ? "تصدير التقرير" : "Export")}</span>}
        {!compact && (
          <span style={{ fontSize: 10, opacity: 0.8, marginInlineStart: 2 }}>▾</span>
        )}
      </button>

      <ExportMenuPortal
        open={open}
        onClose={() => setOpen(false)}
        menuPos={menuPos}
        isRTL={isRTL}
        ff={ff}
        loading={loading}
        onPDF={handlePDF}
        onExcel={handleExcel}
      />
    </>
  );
}
