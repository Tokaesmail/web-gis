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
  | "volume";

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
    id: "crops",
    labelEn: "Crop Insight",
    labelAr: "Crop Insight",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 21V10" />
        <path d="M12 10c-4.5 0-7-2.4-7-6 4.2 0 6.2 1.9 7 6Z" />
        <path d="M12 13c4.8 0 7-2.6 7-6-4.4 0-6.4 2-7 6Z" />
        <path d="M7 21h10" />
      </svg>
    ),
    badge: "CALC",
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
    id: "ndvi",
    labelEn: "Charts",
    labelAr: "Charts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" />
      </svg>
    ),
    badge: "NEW",
  },
  {
    id: "overview",
    labelEn: "Overview",
    labelAr: "Overview",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" /><rect width="7" height="7" x="14" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: "weather",
    labelEn: "Weather",
    labelAr: "Weather",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
      </svg>
    ),
  },
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
];