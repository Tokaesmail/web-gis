"use client";
import { useState, useCallback } from "react";
import { useLang } from "../_components/translations";

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface MapLayer {
  id: string;
  name: string;
  nameAr: string;
  type: "vector" | "raster" | "tile" | "ndvi";
  visible: boolean;
  opacity: number;
  color?: string;
  source?: string; // URL or description
  featureCount?: number;
  loaded?: boolean;
}

interface Props {
  layers: MapLayer[];
  onLayerToggle: (id: string, visible: boolean) => void;
  onLayerOpacity: (id: string, opacity: number) => void;
  onLayerColor: (id: string, color: string) => void;
  onLayerRemove: (id: string) => void;
  onLayerRename: (id: string, newName: string) => void;
  onLayerReorder?: (from: number, to: number) => void;
  onLayerZoom: (id: string) => void;
  onLayer3D?: (id: string) => void;
}

// ─── Layer type badge ──────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: MapLayer["type"] }) {
  const cfg = {
    vector: { label: "V", bg: "rgba(0,212,255,0.12)", color: "#00d4ff", title: "Vector" },
    raster: { label: "R", bg: "rgba(168,85,247,0.12)", color: "#a855f7", title: "Raster" },
    tile:   { label: "T", bg: "rgba(251,146,60,0.12)", color: "#fb923c", title: "Tile" },
    ndvi:   { label: "N", bg: "rgba(34,197,94,0.12)",  color: "#22c55e", title: "NDVI"   },
  }[type];
  return (
    <span
      title={cfg.title}
      style={{
        width: 20, height: 20, borderRadius: 5,
        background: cfg.bg, color: cfg.color,
        fontSize: 9, fontWeight: 700, letterSpacing: "0.04em",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ─── Single layer row ──────────────────────────────────────────────────────────
function LayerRow({
  layer, isRTL, onToggle, onOpacity, onColor, onRemove, onRename, onZoom, on3D, index, onMoveUp, onMoveDown
}: {
  layer: MapLayer;
  isRTL: boolean;
  onToggle: (v: boolean) => void;
  onOpacity: (v: number) => void;
  onColor: (v: string) => void;
  onRemove: () => void;
  onRename: (newName: string) => void;
  onZoom: () => void;
  on3D?: () => void;
  index: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(isRTL ? layer.nameAr : layer.name);

  const handleFinishRename = () => {
    if (editValue.trim() && editValue !== (isRTL ? layer.nameAr : layer.name)) {
      onRename(editValue.trim());
    }
    setIsEditing(false);
  };

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        overflow: "hidden",
        transition: "border-color .2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(0,212,255,0.2)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
        {/* Reorder controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
           <button onClick={(e) => { e.stopPropagation(); onMoveUp?.(); }} disabled={!onMoveUp} style={{ background: "none", border: "none", padding: 0, cursor: onMoveUp ? "pointer" : "default", color: onMoveUp ? "#475569" : "transparent" }}>
             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="18 15 12 9 6 15"/></svg>
           </button>
           <button onClick={(e) => { e.stopPropagation(); onMoveDown?.(); }} disabled={!onMoveDown} style={{ background: "none", border: "none", padding: 0, cursor: onMoveDown ? "pointer" : "default", color: onMoveDown ? "#475569" : "transparent" }}>
             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 12 15 18 9"/></svg>
           </button>
        </div>

        {/* Visibility toggle */}
        <button
          onClick={() => onToggle(!layer.visible)}
          style={{
            background: "none", border: "none", padding: 2,
            cursor: "pointer", color: layer.visible ? "#00d4ff" : "#334155",
            flexShrink: 0,
          }}
        >
          {layer.visible ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          )}
        </button>

        {/* Color swatch (vector only) */}
        {layer.type === "vector" && (
          <label style={{ cursor: "pointer", flexShrink: 0 }} title={isRTL ? "تغيير اللون" : "Change Color"}>
            <div style={{
              width: 12, height: 12, borderRadius: 3,
              background: layer.color ?? "#00d4ff",
              border: "1px solid rgba(255,255,255,0.2)",
            }} />
            <input
              type="color"
              value={layer.color ?? "#00d4ff"}
              onChange={(e) => onColor(e.target.value)}
              style={{ display: "none" }}
            />
          </label>
        )}

        <TypeBadge type={layer.type} />

        {/* Name */}
        {isEditing ? (
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={(e) => e.key === "Enter" && handleFinishRename()}
            style={{
              flex: 1, background: "rgba(0,0,0,0.2)", border: "1px solid rgba(0,212,255,0.3)",
              borderRadius: 4, padding: "2px 6px", fontSize: 12, color: "#fff", outline: "none"
            }}
          />
        ) : (
          <span
            onDoubleClick={() => {
              setEditValue(isRTL ? layer.nameAr : layer.name);
              setIsEditing(true);
            }}
            style={{ flex: 1, fontSize: 12, color: layer.visible ? "#cbd5e1" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "text" }}
          >
            {isRTL ? layer.nameAr : layer.name}
          </span>
        )}

        {layer.featureCount !== undefined && (
          <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>{layer.featureCount}</span>
        )}

        {/* Action buttons */}
        <button onClick={onZoom} title={isRTL ? "تركيز" : "Zoom to"} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00d4ff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>

        {layer.type === "vector" && on3D && (
          <button onClick={on3D} title="3D View" style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0 }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fbbf24")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </button>
        )}

        <button
          onClick={() => {
            setEditValue(isRTL ? layer.nameAr : layer.name);
            setIsEditing(true);
          }}
          title={isRTL ? "إعادة تسمية" : "Rename"}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00d4ff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>

        <button
          onClick={() => setExpanded((p) => !p)}
          title={isRTL ? "إعدادات" : "Settings"}
          style={{ background: "none", border: "none", cursor: "pointer", color: expanded ? "#00d4ff" : "#475569", padding: 2, flexShrink: 0, transition: "transform .3s ease" }}
          onMouseEnter={(e) => !expanded && (e.currentTarget.style.color = "#cbd5e1")}
          onMouseLeave={(e) => !expanded && (e.currentTarget.style.color = "#475569")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>

        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Expanded: opacity slider + source + Quick Theme */}
      {expanded && (
        <div style={{ padding: "0 10px 10px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, color: "#475569", width: 52, flexShrink: 0 }}>
              {isRTL ? "الشفافية" : "Opacity"}
            </span>
            <input
              type="range" min={0} max={100} value={Math.round(layer.opacity * 100)}
              onChange={(e) => onOpacity(Number(e.target.value) / 100)}
              style={{ flex: 1, accentColor: "#00d4ff", height: 3 }}
            />
            <span style={{ fontSize: 10, color: "#64748b", width: 28, textAlign: "right" }}>
              {Math.round(layer.opacity * 100)}%
            </span>
          </div>

          {layer.type === "vector" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
               <span style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", fontWeight: 700, width: 52 }}>Theme</span>
               <div style={{ display: "flex", gap: 4 }}>
                 {["#00c8ff", "#a78bfa", "#34d399", "#fbbf24", "#f87171"].map(c => (
                   <button
                     key={c}
                     onClick={() => onColor(c)}
                     style={{
                       width: 14, height: 14, borderRadius: "50%",
                       background: c, border: layer.color === c ? "2px solid #fff" : "1px solid rgba(255,255,255,0.2)",
                       cursor: "pointer", padding: 0
                     }}
                   />
                 ))}
               </div>
            </div>
          )}

          {layer.source && (
            <p style={{ margin: "8px 0 0", fontSize: 9, color: "#334155", lineHeight: 1.4, fontStyle: "italic" }}>
              {layer.source}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ────────────────────────────────────────────────────────────────
export default function LayerPanel({
  layers, onLayerToggle, onLayerOpacity, onLayerColor, onLayerRemove, onLayerRename, onLayerReorder, onLayerZoom, onLayer3D,
}: Props) {
  const { isRTL } = useLang();

  const vectorCount = layers.filter((l) => l.type === "vector").length;
  const rasterCount = layers.filter((l) => l.type === "raster" || l.type === "tile").length;
  const visibleCount = layers.filter((l) => l.visible).length;

  return (
    <div style={{
      display: "flex", flexDirection: "column", height: "100%",
      fontFamily: isRTL ? "'Noto Sans Arabic', sans-serif" : "'DM Sans', sans-serif",
    }}>
      {/* Stats bar */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, padding: "0 0 12px" }}>
        {[
          { label: isRTL ? "إجمالي" : "Total",   value: layers.length, color: "#00d4ff" },
          { label: isRTL ? "مرئية" : "Visible",  value: visibleCount,  color: "#22c55e" },
          { label: isRTL ? "متجه" : "Vector",    value: vectorCount,   color: "#a855f7" },
        ].map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 9, color: "#475569", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Layer type legend */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { label: "Vector", color: "#00d4ff" },
          { label: "Raster", color: "#a855f7" },
          { label: "Tile",   color: "#fb923c" },
          { label: "NDVI",   color: "#22c55e" },
        ].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: 2, background: l.color }} />
            <span style={{ fontSize: 9, color: "#475569" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* Layer list */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {layers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#334155" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ margin: "0 auto 8px", display: "block", opacity: 0.5 }}>
              <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/>
            </svg>
            <p style={{ fontSize: 12, margin: 0 }}>{isRTL ? "لا توجد طبقات بعد" : "No layers yet"}</p>
            <p style={{ fontSize: 10, margin: "4px 0 0", color: "#1e293b" }}>{isRTL ? "ارفع ملف GeoJSON للبدء" : "Upload a GeoJSON file to start"}</p>
          </div>
        ) : (
          <>
            {/* Vector Section */}
            {layers.some(l => l.type === "vector") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px", display: "flex", alignItems: "center", gap: 6 }}>
                   <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.05)" }} />
                   {isRTL ? "البيانات المتجهة" : "Vector Data"}
                   <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.05)" }} />
                </div>
                {layers.map((layer, idx) => layer.type === "vector" && (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    isRTL={isRTL}
                    index={idx}
                    onToggle={(v) => onLayerToggle(layer.id, v)}
                    onOpacity={(v) => onLayerOpacity(layer.id, v)}
                    onColor={(v) => onLayerColor(layer.id, v)}
                    onRemove={() => onLayerRemove(layer.id)}
                    onRename={(name) => onLayerRename(layer.id, name)}
                    onMoveUp={idx > 0 ? () => onLayerReorder?.(idx, idx - 1) : undefined}
                    onMoveDown={idx < layers.length - 1 ? () => onLayerReorder?.(idx, idx + 1) : undefined}
                    onZoom={() => onLayerZoom(layer.id)}
                    on3D={onLayer3D ? () => onLayer3D(layer.id) : undefined}
                  />
                ))}
              </div>
            )}

            {/* Raster/Tile Section */}
            {layers.some(l => l.type !== "vector") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                 <div style={{ fontSize: 10, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 4px", display: "flex", alignItems: "center", gap: 6 }}>
                   <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.05)" }} />
                   {isRTL ? "بيانات الشبكة" : "Raster & Imagery"}
                   <div style={{ height: 1, flex: 1, background: "rgba(255,255,255,0.05)" }} />
                </div>
                {layers.map((layer, idx) => layer.type !== "vector" && (
                  <LayerRow
                    key={layer.id}
                    layer={layer}
                    isRTL={isRTL}
                    index={idx}
                    onToggle={(v) => onLayerToggle(layer.id, v)}
                    onOpacity={(v) => onLayerOpacity(layer.id, v)}
                    onColor={(v) => onLayerColor(layer.id, v)}
                    onRemove={() => onLayerRemove(layer.id)}
                    onRename={(name) => onLayerRename(layer.id, name)}
                    onMoveUp={idx > 0 ? () => onLayerReorder?.(idx, idx - 1) : undefined}
                    onMoveDown={idx < layers.length - 1 ? () => onLayerReorder?.(idx, idx + 1) : undefined}
                    onZoom={() => onLayerZoom(layer.id)}
                    on3D={onLayer3D ? () => onLayer3D(layer.id) : undefined}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
