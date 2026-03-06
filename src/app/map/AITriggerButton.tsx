"use client";

export default function AITriggerButton({
  onClick,
  active,
}: {
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title="AI Assistant"
      className={`absolute bottom-5 right-60px z-1000 w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer transition-all shadow-lg pointer-events-auto
        ${active
          ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_20px_rgba(0,212,255,0.5)]"
          : "bg-[#0a1628]/95 backdrop-blur-md border border-white/10 text-slate-400 hover:text-cyan-400 hover:border-cyan-400/30"}`}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <path d="M5 3v4M19 17v4M3 5h4M17 19h4" />
      </svg>
    </button>
  );
}
