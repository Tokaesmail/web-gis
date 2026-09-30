"use client";

// ─── AOIListPanel.tsx ──────────────────────────────────────────────────────────
// Floating list of every drawn AOI. Click a row → that AOI becomes the active
// one (map flies to it, all the others get disabled on the map).

import { useState } from "react";
import { formatArea, type AreaUnit } from "./aoiValidation";
import type { AOIListItem } from "./AOIRegistry";

const ICONS: Record<AOIListItem["kind"], string> = {
  polygon: "🔵",
  rectangle: "📐",
  circle: "🟢",
};

interface Props {
  items: AOIListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  isRTL?: boolean;
  areaUnit?: AreaUnit;
  /** extra tailwind classes, e.g. to move the panel */
  className?: string;
}

export default function AOIListPanel({
  items, activeId, onSelect, onDelete, isRTL = false, areaUnit, className = "",
}: Props) {
  const [open, setOpen] = useState(true);
  if (!items.length) return null;

  const locale = isRTL ? "ar" : "en";

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`absolute top-14 z-[1100] w-64 rounded-xl border border-white/10 bg-[#0a1628]/90 text-xs text-slate-200 shadow-xl backdrop-blur pointer-events-auto ${
        isRTL ? "right-3" : "left-3"
      } ${className}`}
    >
      {/* header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-[11px] uppercase tracking-widest text-slate-400 hover:text-cyan-400"
      >
        <span>
          {isRTL ? "المناطق المرسومة" : "Drawn AOIs"}{" "}
          <span className="ml-1 rounded-full bg-cyan-400/15 px-10.5 py-0.5 text-cyan-300">{items.length}</span>
        </span>
        <span>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <ul className="max-h-64 space-y-1 overflow-y-auto px-2 pb-2">
          {items.map((it, i) => {
            const active = it.id === activeId;
            return (
              <li key={it.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(it.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(it.id)}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-all ${
                    active
                      ? "border-cyan-400/60 bg-cyan-400/10"
                      : "border-white/5 bg-white/[0.02] opacity-70 hover:opacity-100 hover:border-white/20"
                  }`}
                >
                  <span className="w-4 text-center text-[10px] text-slate-500">{i + 1}</span>
                  <span>{ICONS[it.kind]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{it.name}</div>
                    <div className="text-[10px] text-slate-400">
                      {formatArea(it.areaHa, locale, areaUnit)}
                      {" · "}
                      <span className={active ? "text-cyan-300" : "text-slate-500"}>
                        {active ? (isRTL ? "نشطة" : "active") : isRTL ? "معطّلة" : "disabled"}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(it.id);
                    }}
                    title={isRTL ? "حذف" : "Delete"}
                    className="rounded-md px-1.5 py-1 text-red-400 hover:bg-red-500/15"
                  >
                    🗑️
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
