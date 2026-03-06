"use client";

export default function CoordsPopup({
  lat,
  lng,
  onClose,
}: {
  lat: number;
  lng: number;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-1000 pointer-events-auto animate-fadeUp mb-7">
      <div className="flex items-center gap-3 bg-[#0a1628]/98 backdrop-blur-xl border border-cyan-400/30 rounded-xl px-4 py-2.5 shadow-[0_8px_32px_rgba(0,212,255,0.15)]">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" />
        <span className="text-[0.74rem] font-mono text-cyan-400">{lat.toFixed(6)}°N</span>
        <span className="text-slate-600">·</span>
        <span className="text-[0.74rem] font-mono text-cyan-400">{lng.toFixed(6)}°E</span>
        <button
          onClick={onClose}
          className="text-slate-600 hover:text-slate-400 cursor-pointer ml-1"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
