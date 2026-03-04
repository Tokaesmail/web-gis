"use client";

import { useLang } from "./translations";

interface LanguageSwitcherProps {
  variant?: "pill" | "minimal" | "flag";
  className?: string;
}

export default function LanguageSwitcher({
  variant = "pill",
  className = "",
}: LanguageSwitcherProps) {
  const { lang, setLang } = useLang();

  if (variant === "pill") {
    return (
      <div className={`flex items-center gap-0.5 bg-white/5 border border-white/10 rounded-full p-0.5 ${className}`}>
        {(["en", "ar"] as const).map((loc) => (
          <button
            key={loc}
            onClick={() => setLang(loc)}
            className={`text-[0.7rem] tracking-wider px-3 py-1 rounded-full cursor-pointer transition-all duration-200 font-medium ${
              lang === loc
                ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_12px_rgba(0,212,255,0.4)]"
                : "text-slate-400 hover:text-slate-200 bg-transparent"
            }`}
          >
            {loc === "en" ? "EN" : "عربي"}
          </button>
        ))}
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <button
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        className={`border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 text-xs tracking-wider px-3 py-1.5 rounded-md bg-transparent cursor-pointer transition-all duration-200 ${className}`}
      >
        {lang === "en" ? "عربي" : "EN"}
      </button>
    );
  }

  // Flag variant
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {[
        { loc: "en" as const, flag: "🇬🇧", label: "EN" },
        { loc: "ar" as const, flag: "🇸🇦", label: "عربي" },
      ].map(({ loc, flag, label }) => (
        <button
          key={loc}
          onClick={() => setLang(loc)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md cursor-pointer transition-all duration-200 ${
            lang === loc
              ? "bg-cyan-400/15 text-cyan-400 border border-cyan-400/30"
              : "text-slate-500 hover:text-slate-300 border border-transparent"
          }`}
        >
          <span>{flag}</span>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}