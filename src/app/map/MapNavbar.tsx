"use client";

import { useLang } from "../_components/translations";

export default function MapNavbar({
  isFullscreen,
  onFullscreenToggle,
}: {
  isFullscreen: boolean;
  onFullscreenToggle: () => void;
}) {
  const { t, toggleLang, lang } = useLang();

  return (
    <nav className="h-12 flex items-center justify-between px-4 bg-[#040d1a]/95 backdrop-blur-xl border-b border-white/[0.07] shrink-0 z-1100 relative">
      <a href="/" className="flex items-center gap-2 no-underline">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee] animate-pulse" />
        <span className="text-cyan-400 font-semibold tracking-wide text-[0.85rem]">
          {t.projectName}
        </span>
      </a>

      <div className="flex items-center gap-1.5 text-[0.72rem] text-slate-500">
        <span className="text-slate-400">{t.navMap}</span>
        <span>/</span>
        <span className="text-slate-300">World Explorer</span>
        <span className="ml-2 flex items-center gap-1 bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 px-2 py-0.5 rounded-full text-[0.6rem]">
          <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("trigger-onboarding-tour"))}
          title="Show Guide"
          className="px-3 py-1 flex items-center gap-1.5 text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/8 border border-white/5 hover:border-cyan-400/20 rounded-md transition-all cursor-pointer text-[0.65rem] font-medium"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {lang === "ar" ? "شرح الموقع" : "Site Guide"}
        </button>

        <button
          onClick={onFullscreenToggle}
          title="Fullscreen"
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-cyan-400 hover:bg-cyan-400/8 border border-transparent hover:border-cyan-400/20 rounded-md transition-all cursor-pointer"
        >
          {isFullscreen ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" />
              <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" />
              <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7V3h4" />
              <path d="M17 3h4v4" />
              <path d="M21 17v4h-4" />
              <path d="M7 21H3v-4" />
            </svg>
          )}
        </button>
      </div>
    </nav>
  );
}
