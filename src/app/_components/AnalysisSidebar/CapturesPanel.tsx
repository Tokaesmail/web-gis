import React from "react";

function formatCaptureBounds(bounds: any) {
  if (!bounds) return "No coordinates";
  return `N ${Number(bounds.north).toFixed(6)}, S ${Number(bounds.south).toFixed(6)}, E ${Number(bounds.east).toFixed(6)}, W ${Number(bounds.west).toFixed(6)}`;
}

export function CapturesPanel({
  items,
  onClear,
  onDelete,
}: {
  items: any[];
  onClear: () => void;
  onDelete?: (id: number, url: string) => void;
}) {
  const openCaptureImage = (url?: string) => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 mb-2 flex items-center justify-between">
        <div>
          <p className="text-[0.62rem] text-slate-500 uppercase tracking-wider mb-0.5">Active Captures</p>
          <p className="text-xs text-slate-300">Images kept in memory</p>
        </div>
        {items.length > 0 && (
          <button 
            onClick={onClear}
            className="text-[0.6rem] px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20"
          >
            Clear All
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-10 text-center opacity-40 text-[0.7rem]">No captures found. Draw a shape to capture.</div>
      ) : (
        <div className="space-y-4">
          {items.map((it) => {
            const smallUrl = it.url ?? it.smallUrl;
            const largeUrl = it.largeUrl ?? it.url;
            return (
              <div key={it.id} className="group bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 gap-px bg-white/[0.06]">
                  <div className="relative aspect-video bg-black/40">
                    {smallUrl && (
                      <button
                        type="button"
                        onClick={() => openCaptureImage(smallUrl)}
                        className="block w-full h-full cursor-zoom-in"
                        title="Open selected capture"
                        aria-label="Open selected capture"
                      >
                        <img src={smallUrl} alt="Selected capture" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openCaptureImage(smallUrl)}
                      className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[0.52rem] text-cyan-300 border border-white/10"
                    >
                      Selected
                    </button>
                  </div>
                  <div className="relative aspect-video bg-black/40">
                    {largeUrl && (
                      <button
                        type="button"
                        onClick={() => openCaptureImage(largeUrl)}
                        className="block w-full h-full cursor-zoom-in"
                        title="Open full map capture"
                        aria-label="Open full map capture"
                      >
                        <img src={largeUrl} alt="Full map capture" className="w-full h-full object-cover" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openCaptureImage(largeUrl)}
                      className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[0.52rem] text-cyan-300 border border-white/10"
                    >
                      Full Map
                    </button>
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.65rem] text-slate-200 font-medium truncate">{new Date(it.createdAt).toLocaleString()}</p>
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(it.id, smallUrl ?? largeUrl ?? "")}
                        className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete this capture"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M3 6h18" />
                          <path d="M8 6V4h8v2" />
                          <path d="M19 6l-1 14H6L5 6" />
                          <path d="M10 11v5M14 11v5" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <div>
                      <p className="text-[0.52rem] uppercase tracking-wider text-cyan-400/80">Selected coordinates</p>
                      <p className="text-[0.55rem] leading-snug text-slate-400 break-words">{formatCaptureBounds(it.selectedBounds)}</p>
                    </div>
                    <div>
                      <p className="text-[0.52rem] uppercase tracking-wider text-cyan-400/80">Full map coordinates</p>
                      <p className="text-[0.55rem] leading-snug text-slate-400 break-words">{formatCaptureBounds(it.viewportBounds)}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


