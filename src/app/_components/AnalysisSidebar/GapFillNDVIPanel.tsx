import React, { useState } from "react";
import { useLang } from "../translations";

export type GapFillMethod = "linear" | "spline" | "savgol" | "whittaker";

/** Config handed to the map when a gap-filled NDVI layer is previewed — mirrors RasterPreviewConfig / PalmHeatmapPreviewConfig. */
export interface GapFillPreviewConfig {
  featureId?: string;
  method: GapFillMethod;
  startDate: string;
  endDate: string;
  cloudThreshold: number;
}

interface GapFillResult {
  gapsFilled: number;
  scenesUsed: number;
  qualityScore: number; // 0-100
}

const METHODS: {
  key: GapFillMethod;
  labelEn: string;
  labelAr: string;
  descEn: string;
  descAr: string;
}[] = [
  {
    key: "linear",
    labelEn: "Linear Interpolation",
    labelAr: "استيفاء خطي",
    descEn: "Straight line between the nearest clear observations",
    descAr: "خط مستقيم بين أقرب رصدين واضحين",
  },
  {
    key: "spline",
    labelEn: "Cubic Spline",
    labelAr: "منحنى تكعيبي",
    descEn: "Smooth curve fit through the surrounding clear scenes",
    descAr: "منحنى ناعم يمر عبر المشاهد الواضحة المحيطة",
  },
  {
    key: "savgol",
    labelEn: "Savitzky-Golay",
    labelAr: "سافيتزكي-جولاي",
    descEn: "Smooths noise while keeping seasonal peaks intact",
    descAr: "يقلل التشويش مع الحفاظ على القمم الموسمية",
  },
  {
    key: "whittaker",
    labelEn: "Whittaker Smoother",
    labelAr: "معادِل ويتاكر",
    descEn: "Weighted fit tuned for series with heavy cloud cover",
    descAr: "معادلة مرجّحة مناسبة للسلاسل شديدة الغيوم",
  },
];

export default function GapFillNDVIPanel({
  selectedFeature,
  onPreview,
}: {
  selectedFeature?: GeoJSON.Feature | null;
  /** Puts the reconstructed NDVI layer on the actual map — same pattern as onRasterPreview. Pass null to remove it. */
  onPreview?: (config: GapFillPreviewConfig | null) => void;
}) {
  const { isRTL } = useLang();

  const [method, setMethod] = useState<GapFillMethod>("whittaker");
  const [startDate, setStartDate] = useState("2025-01-01");
  const [endDate, setEndDate] = useState("2025-12-31");
  const [cloudThreshold, setCloudThreshold] = useState(30);
  const [showOnMap, setShowOnMap] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<GapFillResult | null>(null);

  const canRun = !!selectedFeature && !isRunning;

  const handleRun = () => {
    if (!selectedFeature) return;
    setIsRunning(true);
    setResult(null);

    const config: GapFillPreviewConfig = {
      featureId: (selectedFeature.properties as any)?.id,
      method,
      startDate,
      endDate,
      cloudThreshold,
    };

    // TODO: replace with the real gap-fill API call once the backend endpoint is wired up.
    window.setTimeout(() => {
      setResult({
        gapsFilled: Math.round(6 + cloudThreshold / 10),
        scenesUsed: Math.round(14 - cloudThreshold / 15),
        qualityScore: Math.max(60, 98 - Math.round(cloudThreshold / 3)),
      });
      setIsRunning(false);
      if (showOnMap) onPreview?.(config);
    }, 1400);
  };

  return (
    <div className="flex flex-col gap-4 min-h-full" dir={isRTL ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "#22d3ee18", border: "1px solid #22d3ee30" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8">
            <path d="M3 16l4-6 4 4 3-5" />
            <path d="M14 9l3 5 4-6" strokeDasharray="2.2 2.2" />
            <circle cx="21" cy="8" r="1.3" fill="#22d3ee" stroke="none" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] font-medium text-slate-200 truncate">
            {isRTL ? "تعبئة فجوات NDVI" : "Gap Fill NDVI"}
          </p>
          <p className="text-[0.62rem] text-slate-500 truncate">
            {isRTL ? "استكمال السلسلة الزمنية عبر الغيوم المفقودة" : "Reconstruct the time series through cloud gaps"}
          </p>
        </div>
        <span
          className="text-[0.55rem] font-medium px-1.5 py-0.5 rounded-full shrink-0"
          style={{ color: "#22d3ee", background: "#22d3ee15", border: "1px solid #22d3ee25" }}
        >
          AI
        </span>
      </div>

      {/* No-feature warning — same pattern used across the other analysis panels */}
      {!selectedFeature && (
        <div className="flex items-center gap-2 bg-amber-400/[0.07] border border-amber-400/20 rounded-xl px-3 py-2.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" className="shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p className="text-[0.65rem] text-amber-300">
            {isRTL ? "اختر عنصرًا على الخريطة أولاً لتشغيل التعبئة عليه" : "Click a feature on the map first to run gap fill on it"}
          </p>
        </div>
      )}

      {/* Method selector */}
      <div>
        <p className="text-[0.65rem] font-medium text-slate-400 mb-2">
          {isRTL ? "طريقة التعبئة" : "Fill Method"}
        </p>
        <div className="grid grid-cols-1 gap-1.5">
          {METHODS.map((m) => {
            const active = method === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`text-left rtl:text-right rounded-xl border px-3 py-2 transition-all duration-150
                  ${active
                    ? "bg-cyan-400/[0.08] border-cyan-400/30"
                    : "bg-white/[0.03] border-white/[0.06] hover:border-white/[0.15]"
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[0.72rem] font-medium truncate ${active ? "text-cyan-300" : "text-slate-300"}`}>
                    {isRTL ? m.labelAr : m.labelEn}
                  </span>
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2.4" className="shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <p className="text-[0.6rem] text-slate-500 mt-0.5">{isRTL ? m.descAr : m.descEn}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Date range */}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[0.62rem] text-slate-500">{isRTL ? "من" : "From"}</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[0.68rem] text-slate-200 outline-none focus:border-cyan-400/40"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.62rem] text-slate-500">{isRTL ? "إلى" : "To"}</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.08] rounded-lg px-2 py-1.5 text-[0.68rem] text-slate-200 outline-none focus:border-cyan-400/40"
          />
        </label>
      </div>

      {/* Cloud / gap threshold */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[0.65rem] font-medium text-slate-400">
            {isRTL ? "أقصى نسبة غيوم مقبولة" : "Max Acceptable Cloud Cover"}
          </span>
          <span className="text-[0.65rem] font-mono text-cyan-300">{cloudThreshold}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={80}
          step={5}
          value={cloudThreshold}
          onChange={(e) => setCloudThreshold(Number(e.target.value))}
          className="w-full accent-cyan-400"
        />
        <p className="text-[0.58rem] text-slate-600 mt-1">
          {isRTL
            ? "المشاهد الأعلى من هذه النسبة تُعتبر فجوة ويُعاد بناؤها"
            : "Scenes above this are treated as gaps and reconstructed"}
        </p>
      </div>

      {/* Show on map toggle */}
      <button
        onClick={() => setShowOnMap((v) => !v)}
        className="flex items-center justify-between bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2.5"
      >
        <span className="text-[0.68rem] text-slate-300">
          {isRTL ? "عرض على الخريطة بعد التشغيل" : "Show on map after running"}
        </span>
        <div className={`w-8 h-[18px] rounded-full relative transition-colors duration-150 ${showOnMap ? "bg-cyan-400/60" : "bg-white/10"}`}>
          <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all duration-150 ${showOnMap ? "left-4" : "left-0.5"}`} />
        </div>
      </button>

      {/* Run */}
      <button
        onClick={handleRun}
        disabled={!canRun}
        className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-[0.72rem] font-medium transition-all duration-150
          ${canRun
            ? "bg-cyan-400/15 text-cyan-300 border border-cyan-400/30 hover:bg-cyan-400/20"
            : "bg-white/[0.02] text-slate-600 border border-white/[0.04] cursor-not-allowed"
          }`}
      >
        {isRunning ? (
          <>
            <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 1 1-9-9" />
            </svg>
            {isRTL ? "جارٍ التعبئة..." : "Filling gaps..."}
          </>
        ) : (
          <>{isRTL ? "تشغيل تعبئة الفجوات" : "Run Gap Fill"}</>
        )}
      </button>

      {/* Result */}
      {result && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 space-y-2">
          <p className="text-[0.65rem] font-medium text-slate-400">{isRTL ? "نتيجة التعبئة" : "Fill Result"}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[0.85rem] font-medium text-cyan-300">{result.gapsFilled}</p>
              <p className="text-[0.58rem] text-slate-500">{isRTL ? "فجوات" : "Gaps"}</p>
            </div>
            <div>
              <p className="text-[0.85rem] font-medium text-slate-200">{result.scenesUsed}</p>
              <p className="text-[0.58rem] text-slate-500">{isRTL ? "مشاهد" : "Scenes"}</p>
            </div>
            <div>
              <p className="text-[0.85rem] font-medium text-emerald-300">{result.qualityScore}%</p>
              <p className="text-[0.58rem] text-slate-500">{isRTL ? "جودة" : "Quality"}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
