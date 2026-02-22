"use client";
import { useState, useEffect } from "react";
import Particles from "./Particles";
import GlobeSVG from "./GlobeSVG";
import { MapIcon, GithubIcon, UserIcon } from "./Icons";
import { translations, Lang, TranslationDict } from "./translations";
import Link from "next/link";

export default function Hero() {
  const [lang, setLang] = useState<Lang>("en");
  const [scrolled, setScrolled] = useState(false);

  const t = translations[lang] as TranslationDict;
  const isRTL = lang === "ar";

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Noto+Sans+Arabic:wght@300;400;500;600&display=swap');
        body { font-family: 'DM Sans', sans-serif; }
        .font-arabic { font-family: 'Noto Sans Arabic', sans-serif !important; }

        @keyframes slowRotate  { to { transform: rotate(360deg); } }
        @keyframes revRotate   { to { transform: rotate(-360deg); } }
        @keyframes pulseRing   { 0%{transform:scale(1);opacity:.4} 100%{transform:scale(2.4);opacity:0} }
        @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes fadeUp      { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes scrollDot   { 0%,100%{transform:translateY(0);opacity:1} 50%{transform:translateY(6px);opacity:.3} }

        .anim-blink      { animation: blink 2s ease-in-out infinite; }
        .anim-rev        { animation: revRotate 22s linear infinite; }
        .anim-scroll-dot { animation: scrollDot 1.6s ease-in-out infinite; }

        .fu-0 { animation: fadeUp .55s ease both; }
        .fu-1 { animation: fadeUp .55s .12s ease both; }
        .fu-2 { animation: fadeUp .55s .22s ease both; }
        .fu-3 { animation: fadeUp .55s .32s ease both; }
        .fu-4 { animation: fadeUp .55s .42s ease both; }
        .fu-5 { animation: fadeUp .65s .28s ease both; }
        .fu-scroll { animation: fadeUp .8s .9s ease both; }

        .geo-grid {
          background-image:
            linear-gradient(rgba(0,212,255,.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,.035) 1px, transparent 1px);
          background-size: 56px 56px;
          mask-image: radial-gradient(ellipse 75% 80% at 50% 50%, black, transparent);
          -webkit-mask-image: radial-gradient(ellipse 75% 80% at 50% 50%, black, transparent);
        }

        .grad-text {
          background: linear-gradient(130deg, #00d4ff 0%, #3b82f6 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          font-style: italic;
        }

        .btn-glow {
          background: linear-gradient(130deg, #00d4ff, #3b82f6);
          box-shadow: 0 0 28px rgba(0,212,255,.28);
          transition: transform .22s, box-shadow .22s;
        }
        .btn-glow:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 44px rgba(0,212,255,.48);
        }

        .blur-nav {
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
        }
      `}</style>

      <Particles />
      <div
        className={`min-h-screen bg-[#040d1a] text-slate-100 ${
          isRTL ? "font-arabic" : ""
        }`}
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* NAVBAR */}
        <nav
          className={`fixed inset-x-0 top-0 z-50 h-16 flex items-center justify-between
          px-6 lg:px-12 blur-nav border-b border-white/[0.07]
          ${scrolled ? "bg-[#040d1a]/90" : "bg-[#040d1a]/50"}`}
        >
          <Link href="#" className="flex items-center gap-2.5 no-underline">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee] anim-blink" />
            <span className="text-cyan-400 font-semibold tracking-wide text-[0.95rem]">
              {t.projectName}
            </span>
          </Link>

          <div className="flex items-center gap-1">
            <Link
              href="/map"
              className="hidden sm:block text-slate-400 hover:text-cyan-400 text-sm px-3 py-2 rounded-md no-underline"
            >
              {t.navMap}
            </Link>
            <Link
              href="#about"
              className="hidden sm:block text-slate-400 hover:text-cyan-400 text-sm px-3 py-2 rounded-md no-underline"
            >
              {t.navAbout}
            </Link>

            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="border border-white/10 hover:border-cyan-400/40 text-slate-400 hover:text-cyan-400 text-xs tracking-wider px-3 py-1.5 rounded-md bg-transparent mx-1.5"
            >
              {lang === "en" ? "عربي" : "EN"}
            </button>

            <Link
              href="/signin"
              className="flex items-center gap-1.5 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-400/10 hover:border-cyan-400 text-sm px-4 py-1.5 rounded-md no-underline"
            >
              <UserIcon />
              <span>{t.navLogin}</span>
            </Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden px-6 lg:px-12">
          <div className="absolute inset-0 geo-grid" />
          <div
            className="absolute -left-32 top-1/4 w-120 h-120 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%)",
            }}
          />
          <div
            className="absolute -right-24 bottom-16 w-90 h-90 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)",
            }}
          />

          <div className="relative z-10 max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center py-20">
            {/* TEXT */}
            <div className="flex flex-col">
              <div className="fu-0 self-start flex items-center gap-2 bg-cyan-400/[0.07] border border-cyan-400/20 text-cyan-400 text-[0.7rem] tracking-widest uppercase px-3 py-1.5 rounded-full mb-7">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee] anim-blink" />
                {t.heroBadge}
              </div>

              <h1
                className={`fu-1 font-semibold leading-[1.15] mb-5 text-[clamp(2rem,4.5vw,3.2rem)] ${
                  isRTL ? "font-arabic" : ""
                }`}
              >
                {t.heroTitle1}{" "}
                <span className="grad-text font-medium">{t.heroTitle2}</span>{" "}
                <span className="text-slate-100 font-light">{t.heroTitle3}</span>
              </h1>

              <p
                className={`fu-2 text-slate-400 leading-relaxed mb-3 ${
                  isRTL ? "text-base font-arabic" : "text-sm font-light"
                }`}
              >
                {t.heroSubtitle}
              </p>

              <p
                className={`fu-3 text-slate-500 leading-relaxed mb-10 ${
                  isRTL ? "text-sm font-arabic" : "text-xs font-light"
                }`}
              >
                {t.heroSub2}
              </p>

              <div className="fu-4 flex flex-wrap gap-3">
                <Link
                  href="../map"
                  className={`btn-glow text-[#040d1a] font-semibold text-sm px-6 py-3 rounded-lg flex items-center gap-2 no-underline ${
                    isRTL ? "font-arabic" : ""
                  }`}
                >
                  <MapIcon />
                  {t.heroBtnMap}
                </Link>

                <Link
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`bg-transparent text-slate-300 hover:text-cyan-400 hover:border-cyan-400/50 hover:bg-cyan-400/6 border border-white/10 text-sm px-6 py-3 rounded-lg flex items-center gap-2 no-underline transition-all duration-200 ${
                    isRTL ? "font-arabic" : "font-light"
                  }`}
                >
                  <GithubIcon /> 
                  {t.heroBtnGithub}
                </Link>
              </div>
            </div>

            {/* GLOBE */}
            <div className="fu-5 hidden lg:flex justify-center items-center">
              <div className="relative w-92.5 h-92.5">
                <div
                  className="absolute rounded-full border border-cyan-400/10 anim-rev"
                  style={{ inset: "-18px" }}
                />
                <div
                  className="absolute rounded-full border border-cyan-400/5"
                  style={{ inset: "-36px" }}
                />
                <GlobeSVG />
              </div>
            </div>
          </div>

          {/* SCROLL HINT */}
          <div className="fu-scroll absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <div className="w-5 h-8 rounded-[10px] border border-slate-600 flex justify-center pt-1.5">
              <div className="w-0.75 h-1.5 bg-slate-600 rounded-sm anim-scroll-dot" />
            </div>
            <span className="text-slate-600 text-[0.6rem] tracking-[0.18em] uppercase">
              {t.heroScrollHint}
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
