import React from "react";

export type PanelId =
  | "elevation" 
  | "satellite"
  | "raster"
  | "change-detection"
  | "ndvi"
  | "weather"
  | "overview"
  | "analysis"
  | "layers"
  | "crops"
  | "template-match"
  | "volume"
  | "super-resolution"
  | "saved-analyses"
  | "live-dashboard"
  | "insight";
  // | "saved-analyses";

/** Sub-tabs shown inside the merged "Live Dashboard" panel (Crop Insight / Charts / Overview / Weather). */
export type LiveDashboardTab = "overview" | "ndvi" | "weather" | "crops";

/**
 * Sub-tabs shown inside the "Insight" panel — same idea as RasterTabKey for "raster"
 * (hover the sidebar icon → flyout → pick a sub-feature). "interpolation" (temporal
 * per-pixel interpolation of a Sentinel-2 index to a target date) is the first one;
 * add new union members here as more Insight features ship (e.g. "anomaly-detect",
 * "yield-forecast") and branch on them in PanelContent.tsx the same way rasterTab is.
 *
 * ⚠️ (2026-09-20) كان هنا "gap-fill-ndvi" — اتشالت واتبدلت بـ "interpolation".
 * لو الـ AnalysisSidebar بيبعت القيمة القديمة من flyout، لازم تتغير هناك كمان.
 */
export type InsightTab = "interpolation";

interface PanelItem {
  id: PanelId;
  labelEn: string;
  labelAr: string;
  icon: React.ReactNode;
  badge?: string;
}

export const panels: PanelItem[] = [
  {
    id: "template-match",
    labelEn: "Template Match",
    labelAr: "Template Match",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="2" width="8" height="8" rx="1" />
        <path d="m21 21-4.35-4.35" />
        <circle cx="15" cy="15" r="5" />
      </svg>
    ),
    badge: "AI",
  },
  {
    id: "satellite",
    labelEn: "Satellite Data",
    labelAr: "Satellite Data",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M5.5 14.5 3 17l4 4 2.5-2.5" />
        <path d="m14.5 5.5 2.7-2.7 4 4-2.7 2.7" />
        <rect x="8" y="6" width="8" height="12" rx="1.5" transform="rotate(45 12 12)" />
        <path d="M3 3h6v6H3zM15 15h6v6h-6z" />
      </svg>
    ),
    badge: "SAT",
  },
   {
    id: "raster",
    labelEn: "Raster Calculator",
    labelAr: "Raster Calculator",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M8 7h8" />
        <path d="M8 11h2M12 11h2M16 11h.01" />
        <path d="M8 15h2M12 15h2M16 15h.01" />
        <path d="M8 18h8" />
      </svg>
    ),
    badge: "CALC",
  },

  {
    id: "change-detection",
    labelEn: "Change Detection",
    labelAr: "كشف التغيير",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="2" y="4" width="8" height="8" rx="1" />
        <rect x="14" y="12" width="8" height="8" rx="1" />
        <path d="M10 8h4M16 12V8a2 2 0 0 0-2-2h-4" />
        <path d="m13 5 3 3-3 3" />
      </svg>
    ),
    badge: "NEW",
  },
  {
    id: "super-resolution",
    labelEn: "Super Resolution",
    labelAr: "تحسين الدقة",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3h6v6H3zM15 15h6v6h-6z" />
        <path d="M9 9l6-6M9 15l6 6" />
      </svg>
    ),
    badge: "SR",
  },

  {
    id: "insight",
    labelEn: "Insight",
    labelAr: "الرؤى",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 16l4-6 4 4 3-5" />
        <path d="M14 9l3 5 4-6" strokeDasharray="2.2 2.2" />
        <circle cx="21" cy="8" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    ),
    badge: "NEW",
  },
  {
    id: "live-dashboard",
    labelEn: "Live Dashboard",
    labelAr: "لوحة البيانات المباشرة",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
    badge: "LIVE",
  },

  {
    id: "layers",
    labelEn: "Layers",
    labelAr: "Layers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.27a1 1 0 0 0 0 1.83l8.57 4.09a2 2 0 0 0 1.66 0l8.57-4.09a1 1 0 0 0 0-1.83Z" />
        <path d="m22 17.64-8.57 4.09a2 2 0 0 1-1.66 0L2 17.64" />
        <path d="m22 12.64-8.57 4.09a2 2 0 0 1-1.66 0L2 12.64" />
      </svg>
    ),
  },
  // {
  //   id: "analysis",
  //   labelEn: "Analysis",
  //   labelAr: "Analyses",
  //   icon: (
  //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
  //       <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  //       <path d="M11 8v6M8 11h6"/>
  //     </svg>
  //   ),
  //   badge: "7",
  // },
  {
    id: "elevation",
    labelEn: "Elevation",
    labelAr: "الارتفاع",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 17l4-8 4 4 4-6 4 10" />
        <path d="M3 20h18" />
      </svg>
    ),
    badge: "DEM",
  },
  {
    id: "volume",
    labelEn: "Volume Calc",
    labelAr: "حساب الحجم",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3h18v18H3z"/>
        <path d="m3 9 9-6 9 6"/>
        <path d="M9 21V9l3-2 3 2v12"/>
      </svg>
    ),
    badge: "VOL",
  },
  {
  id: "saved-analyses",
  labelEn: "Saved",
  labelAr: "المحفوظات",
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  ),
},
];