import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GeoSense AI — Auth",
  description: "Authentication for GeoSense AI platform",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#030912] flex">
      {/* ── Left decorative panel ── */}
      <div className="hidden lg:flex lg:w-[42%] relative overflow-hidden flex-col justify-between p-12">
        {/* Grid background */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }}
        />
        {/* Radial glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(0,212,255,0.08) 0%, transparent 70%)" }} />
        {/* Corner lines */}
        <div className="absolute top-0 left-0 w-24 h-24 border-l border-t border-cyan-400/20" />
        <div className="absolute bottom-0 right-0 w-24 h-24 border-r border-b border-cyan-400/20" />

        {/* Top logo */}
        <div className="relative flex items-center gap-3 z-10">
          <div className="w-8 h-8 rounded-lg bg-cyan-400/10 border border-cyan-400/30 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
            </svg>
          </div>
          <span className="text-cyan-400 font-semibold tracking-wide text-sm">GeoSense AI</span>
        </div>

        {/* Center content */}
        <div className="relative z-10 space-y-6">
          {/* Fake satellite imagery card */}
          <div className="w-full aspect-video rounded-xl overflow-hidden border border-white/[0.08] relative bg-[#0a1628]">
            <div className="absolute inset-0"
              style={{
                background: "radial-gradient(ellipse at 30% 40%, rgba(34,197,94,0.15), transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(0,212,255,0.1), transparent 60%)"
              }} />
            {/* Fake field polygons */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 220" fill="none">
              <polygon points="80,60 160,40 190,100 120,130 70,110" fill="rgba(34,197,94,0.18)" stroke="#22c55e" strokeWidth="1" strokeDasharray="4 3"/>
              <polygon points="200,50 280,35 310,95 240,115 195,85" fill="rgba(0,212,255,0.12)" stroke="#22d3ee" strokeWidth="1" strokeDasharray="4 3"/>
              <polygon points="90,140 170,125 200,175 130,190 75,165" fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3"/>
              <polygon points="220,130 300,115 330,165 260,180 210,155" fill="rgba(167,139,250,0.1)" stroke="#a78bfa" strokeWidth="1" strokeDasharray="4 3"/>
              <circle cx="155" cy="85" r="4" fill="#22d3ee" fillOpacity="0.8"/>
              <circle cx="252" cy="72" r="4" fill="#22d3ee" fillOpacity="0.8"/>
            </svg>
            {/* NDVI badge */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-[#040d1a]/90 border border-white/10 rounded-md px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
              <span className="text-[0.6rem] text-slate-400">NDVI · 0.72</span>
            </div>
            {/* Coords */}
            <div className="absolute bottom-3 left-3 text-[0.58rem] font-mono text-slate-500">
              30.5244°N · 31.2001°E
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { v: "147k", l: "Fields Analyzed" },
              { v: "99.2%", l: "Accuracy" },
              { v: "24/7", l: "Live Monitoring" },
            ].map((s) => (
              <div key={s.l} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 text-center">
                <p className="text-base font-semibold text-cyan-400">{s.v}</p>
                <p className="text-[0.6rem] text-slate-500 mt-0.5">{s.l}</p>
              </div>
            ))}
          </div>

          <p className="text-slate-500 text-sm leading-relaxed">
            Satellite-powered agricultural intelligence. Monitor, analyze, and optimize your fields with AI precision.
          </p>
        </div>

        {/* Bottom */}
        <div className="relative z-10 text-[0.65rem] text-slate-600">
          © 2026 GeoSense AI · All rights reserved
        </div>
      </div>

      {/* ── Right: form area ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative">
        {/* Mobile logo */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
          <span className="text-cyan-400 font-semibold tracking-wide text-sm">GeoSense AI</span>
        </div>

        <div className="w-full max-w-[420px]">
          {children}
        </div>
      </div>
    </div>
  );
}