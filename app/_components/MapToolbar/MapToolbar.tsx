"use client";

import { useState } from "react";
import { useLang } from "../translations";

type Tool = "pointer" | "polygon" | "rectangle" | "circle" | "measure" | "marker";

interface MapToolbarProps {
  onToolChange?: (tool: Tool) => void;
  onUndo?: () => void;
  onClear?: () => void;
}

const tools: { id: Tool; icon: React.ReactNode; labelKey: string }[] = [
  {
    id: "pointer",
    labelKey: "pointer",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 0l16 12-7 2-4 8L4 0z" />
      </svg>
    ),
  },
  {
    id: "polygon",
    labelKey: "polygon",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 22 18 2 18" />
      </svg>
    ),
  },
  {
    id: "rectangle",
    labelKey: "rectangle",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="5" width="18" height="14" rx="1" />
      </svg>
    ),
  },
  {
    id: "circle",
    labelKey: "circle",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    id: "measure",
    labelKey: "measure",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4" />
      </svg>
    ),
  },
  {
    id: "marker",
    labelKey: "marker",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
      </svg>
    ),
  },
];

export default function MapToolbar({ onToolChange, onUndo, onClear }: MapToolbarProps) {
  const [activeTool, setActiveTool] = useState<Tool>("pointer");
  const { isRTL } = useLang();

  const handleTool = (tool: Tool) => {
    setActiveTool(tool);
    onToolChange?.(tool);
  };

  return (
    <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10000 flex flex-col gap-1.5">      {/* Tool buttons */}
      <div className="flex flex-col gap-1 bg-[#0a1628]/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        {tools.map((tool) => (
          <div key={tool.id} className="relative group">
            <button
              onClick={() => handleTool(tool.id)}
              className={`
                w-9 h-9 rounded-lg flex items-center justify-center
                transition-all duration-150 cursor-pointer
                ${activeTool === tool.id
                  ? "bg-cyan-400 text-[#040d1a] shadow-[0_0_12px_rgba(0,212,255,0.5)]"
                  : "text-slate-400 hover:text-slate-100 hover:bg-white/8"
                }
              `}
            >
              {tool.icon}
            </button>
            {/* Tooltip */}
            <div className="absolute left-11 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              <div className="bg-[#0a1628] border border-white/10 text-slate-200 text-[0.7rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg">
                {tool.labelKey}
              </div>
            </div>
          </div>
        ))}

        {/* Divider */}
        <div className="h-px bg-white/10 my-0.5" />

        {/* Undo */}
        <div className="relative group">
          <button
            onClick={onUndo}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/8 transition-all duration-150 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6" />
              <path d="M3 13A9 9 0 1 0 5.4 5.4L3 7" />
            </svg>
          </button>
          <div className="absolute left-11 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
            <div className="bg-[#0a1628] border border-white/10 text-slate-200 text-[0.7rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg">
              Undo
            </div>
          </div>
        </div>

        {/* Clear */}
        <div className="relative group">
          <button
            onClick={onClear}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 cursor-pointer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
          </button>
          <div className="absolute left-11 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
            <div className="bg-[#0a1628] border border-white/10 text-slate-200 text-[0.7rem] tracking-wide px-2.5 py-1 rounded-md whitespace-nowrap shadow-lg">
              Clear
            </div>
          </div>
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex flex-col gap-0.5 bg-[#0a1628]/90 backdrop-blur-md border border-white/10 rounded-xl p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/8 transition-all cursor-pointer text-lg font-light">
          +
        </button>
        <div className="h-px bg-white/10" />
        <button className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-white/8 transition-all cursor-pointer text-lg font-light">
          −
        </button>
      </div>
    </div>
  );
}