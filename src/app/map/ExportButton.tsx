"use client";
import { useState, useCallback } from "react";
import { useLang } from "../_components/translations";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface ExportData {
  selectedArea?: { name: string; ha: number };
  coords?: { lat: number; lng: number };
  ndviData?: Record<string, { value: number; min: number; max: number; mean: number; trend: string }>;
  cropAnalysis?: {
    cropType: string; health: string; coverage: number;
    estimatedYield: string; recommendation: string;
  };
  layers?: { name: string; type: string; visible: boolean; featureCount?: number }[];
  geoJsonFeatures?: any[];
}

interface Props {
  data: ExportData;
  /** If true renders as an icon-only button (for tight toolbars) */
  compact?: boolean;
}

// ─── PDF export (using browser print with a custom HTML template) ───────────────
function exportPDF(data: ExportData, isRTL: boolean) {
  const dir = isRTL ? "rtl" : "ltr";
  const ff  = isRTL ? "'Noto Sans Arabic', sans-serif" : "'DM Sans', sans-serif";
  const now = new Date().toLocaleString(isRTL ? "ar-EG" : "en-US");

  const indicesRows = data.ndviData
    ? Object.entries(data.ndviData).map(([k, v]) => `
        <tr>
          <td style="padding:8px 12px;font-weight:600;color:#00d4ff">${k}</td>
          <td style="padding:8px 12px;text-align:center">${v.value.toFixed(3)}</td>
          <td style="padding:8px 12px;text-align:center">${v.min.toFixed(3)}</td>
          <td style="padding:8px 12px;text-align:center">${v.max.toFixed(3)}</td>
          <td style="padding:8px 12px;text-align:center">${v.mean.toFixed(3)}</td>
          <td style="padding:8px 12px;text-align:center;color:${v.trend==="up"?"#22c55e":v.trend==="down"?"#ef4444":"#94a3b8"}">${v.trend==="up"?"↑":v.trend==="down"?"↓":"→"}</td>
        </tr>`).join("") : "";

  const layerRows = data.layers
    ? data.layers.map((l) => `
        <tr>
          <td style="padding:8px 12px">${l.name}</td>
          <td style="padding:8px 12px;text-align:center;color:#a855f7">${l.type}</td>
          <td style="padding:8px 12px;text-align:center;color:${l.visible?"#22c55e":"#ef4444"}">${l.visible ? "✓" : "✗"}</td>
          <td style="padding:8px 12px;text-align:center">${l.featureCount ?? "—"}</td>
        </tr>`).join("") : "";

  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${isRTL?"ar":"en"}">
<head>
  <meta charset="UTF-8"/>
  <title>GeoSense AI — Export</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700&display=swap');
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:${ff};background:#fff;color:#1e293b;padding:32px;font-size:13px}
    .header{display:flex;align-items:center;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
    .logo{font-size:20px;font-weight:700;color:#0ea5e9}
    .meta{font-size:11px;color:#94a3b8}
    h2{font-size:14px;font-weight:700;color:#0f172a;margin:24px 0 10px;display:flex;align-items:center;gap:6px}
    h2::before{content:"";display:inline-block;width:4px;height:16px;background:linear-gradient(180deg,#00d4ff,#3b82f6);border-radius:2px}
    table{width:100%;border-collapse:collapse;margin-bottom:4px}
    thead tr{background:#f8fafc}
    th{padding:8px 12px;text-align:${dir==="rtl"?"right":"left"};font-size:11px;font-weight:700;color:#64748b;letter-spacing:.05em;text-transform:uppercase}
    tbody tr{border-bottom:1px solid #f1f5f9}
    tbody tr:last-child{border-bottom:none}
    .kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:4px}
    .kpi{padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc}
    .kpi-val{font-size:22px;font-weight:700;color:#0ea5e9}
    .kpi-label{font-size:10px;color:#94a3b8;margin-top:2px}
    .chip{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600}
    .chip-green{background:#f0fdf4;color:#16a34a}
    .chip-yellow{background:#fefce8;color:#ca8a04}
    .chip-red{background:#fef2f2;color:#dc2626}
    .rec{margin-top:12px;padding:12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;font-size:12px;color:#0369a1}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
    @media print{body{padding:16px}@page{margin:16mm}}
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">🌍 GeoSense AI</div>
    <div class="meta">${isRTL?"تاريخ التصدير":"Exported"}: ${now}</div>
  </div>

  ${data.coords || data.selectedArea ? `
  <h2>${isRTL?"بيانات المنطقة المحددة":"Selected Area Data"}</h2>
  <div class="kpi-grid">
    ${data.coords ? `
    <div class="kpi"><div class="kpi-val">${data.coords.lat.toFixed(4)}°</div><div class="kpi-label">${isRTL?"خط العرض":"Latitude"}</div></div>
    <div class="kpi"><div class="kpi-val">${data.coords.lng.toFixed(4)}°</div><div class="kpi-label">${isRTL?"خط الطول":"Longitude"}</div></div>
    ` : ""}
    ${data.selectedArea ? `
    <div class="kpi"><div class="kpi-val">${data.selectedArea.ha.toLocaleString()}</div><div class="kpi-label">${isRTL?"هكتار":"Hectares"}</div></div>
    ` : ""}
  </div>` : ""}

  ${indicesRows ? `
  <h2>${isRTL?"المؤشرات النباتية (Sentinel-2)":"Vegetation Indices (Sentinel-2)"}</h2>
  <table>
    <thead><tr>
      <th>${isRTL?"المؤشر":"Index"}</th><th>${isRTL?"القيمة":"Value"}</th>
      <th>Min</th><th>Max</th><th>Mean</th><th>${isRTL?"الاتجاه":"Trend"}</th>
    </tr></thead>
    <tbody>${indicesRows}</tbody>
  </table>` : ""}

  ${data.cropAnalysis ? `
  <h2>${isRTL?"تحليل المحاصيل":"Crop Analysis"}</h2>
  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${data.cropAnalysis.coverage}%</div><div class="kpi-label">${isRTL?"التغطية":"Coverage"}</div></div>
    <div class="kpi"><div class="kpi-val">${data.cropAnalysis.estimatedYield}</div><div class="kpi-label">${isRTL?"الإنتاجية المتوقعة":"Est. Yield"}</div></div>
    <div class="kpi">
      <div><span class="chip chip-${data.cropAnalysis.health==="excellent"||data.cropAnalysis.health==="good"?"green":data.cropAnalysis.health==="moderate"?"yellow":"red"}">${data.cropAnalysis.health}</span></div>
      <div class="kpi-label" style="margin-top:6px">${data.cropAnalysis.cropType}</div>
    </div>
  </div>
  <div class="rec">📋 ${data.cropAnalysis.recommendation}</div>` : ""}

  ${layerRows ? `
  <h2>${isRTL?"الطبقات":"Map Layers"}</h2>
  <table>
    <thead><tr>
      <th>${isRTL?"الاسم":"Name"}</th><th>${isRTL?"النوع":"Type"}</th>
      <th>${isRTL?"مرئية":"Visible"}</th><th>${isRTL?"المعالم":"Features"}</th>
    </tr></thead>
    <tbody>${layerRows}</tbody>
  </table>` : ""}

  <div class="footer">GeoSense AI · ${isRTL?"مدعوم بالذكاء الاصطناعي":"Powered by AI"} · ${now}</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Excel (CSV) export ─────────────────────────────────────────────────────────
function exportExcel(data: ExportData, isRTL: boolean) {
  const rows: string[][] = [];
  const sep = ",";

  // Header
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
  const bom = "\uFEFF"; // UTF-8 BOM for Excel Arabic support
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `geosense_export_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Main button ───────────────────────────────────────────────────────────────
export default function ExportButton({ data, compact = false }: Props) {
  const { isRTL } = useLang();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<"pdf" | "excel" | null>(null);
  const ff = isRTL ? "'Noto Sans Arabic', sans-serif" : "'DM Sans', sans-serif";

  const handlePDF = useCallback(async () => {
    setLoading("pdf");
    await new Promise((r) => setTimeout(r, 200));
    exportPDF(data, isRTL);
    setLoading(null);
    setOpen(false);
  }, [data, isRTL]);

  const handleExcel = useCallback(async () => {
    setLoading("excel");
    await new Promise((r) => setTimeout(r, 200));
    exportExcel(data, isRTL);
    setLoading(null);
    setOpen(false);
  }, [data, isRTL]);

  return (
    <div style={{ position: "relative", fontFamily: ff }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen((p) => !p)}
  title={isRTL ? "تصدير البيانات" : "Export data"}
  style={{
    display: "flex", 
    alignItems: "center", 
    gap: compact ? 0 : 6,
    padding: compact ? "7px" : "7px 12px",
    background: open ? "rgba(0,212,255,0.12)" : "rgb(13, 31, 60)", 
    border: `1px solid ${open ? "rgba(0,212,255,0.3)" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 9, 
    color: open ? "#00d4ff" : "#ffffff",
    cursor: "pointer", 
    transition: "all .18s", 
    fontFamily: ff,
    fontSize: 12, 
    fontWeight: 500,
    backdropFilter: "blur(8px)", 
  }}
  onMouseEnter={(e) => { 
    if (!open) { 
      e.currentTarget.style.background = "rgba(30, 41, 59, 0.9)"; // تفتيح بسيط عند التحويم
      e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; 
      e.currentTarget.style.color = "#cbd5e1"; 
    } 
  }}
  onMouseLeave={(e) => { 
    if (!open) { 
      e.currentTarget.style.background = "rgba(15, 23, 42, 0.8)";
      e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; 
      e.currentTarget.style.color = "#94a3b8"; 
    } 
  }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        {!compact && <span>{isRTL ? "تصدير" : "Export"}</span>}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "absolute", [isRTL ? "left" : "right"]: 0,
          top: "calc(100% + 6px)", zIndex: 9999, width: 190,
          background: "rgba(7,15,30,0.97)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, padding: 6,
          boxShadow: "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.05)",
          backdropFilter: "blur(20px)",
        }}>
          {/* PDF */}
          <button
            onClick={handlePDF}
            disabled={loading === "pdf"}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 12px", borderRadius: 8, background: "none", border: "none",
              color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontFamily: ff,
              transition: "background .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(239,68,68,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {loading === "pdf" ? (
                <div style={{ width: 12, height: 12, border: "2px solid #ef4444", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>
                </svg>
              )}
            </div>
            <div style={{ textAlign: isRTL ? "right" : "left" }}>
              <div style={{ fontWeight: 600 }}>PDF</div>
              <div style={{ fontSize: 10, color: "#475569" }}>{isRTL ? "تقرير مطبوع" : "Print report"}</div>
            </div>
          </button>

          <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "3px 0" }} />

          {/* Excel / CSV */}
          <button
            onClick={handleExcel}
            disabled={loading === "excel"}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 12px", borderRadius: 8, background: "none", border: "none",
              color: "#e2e8f0", cursor: "pointer", fontSize: 13, fontFamily: ff,
              transition: "background .15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(34,197,94,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            <div style={{ width: 28, height: 28, borderRadius: 7, background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {loading === "excel" ? (
                <div style={{ width: 12, height: 12, border: "2px solid #22c55e", borderTopColor: "transparent", borderRadius: "50%", animation: "spin .7s linear infinite" }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              )}
            </div>
            <div style={{ textAlign: isRTL ? "right" : "left" }}>
              <div style={{ fontWeight: 600 }}>Excel / CSV</div>
              <div style={{ fontSize: 10, color: "#475569" }}>{isRTL ? "جدول بيانات" : "Spreadsheet"}</div>
            </div>
          </button>
        </div>
      )}

      {/* Close on outside click */}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9998 }}
          onClick={() => setOpen(false)}
        />
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}