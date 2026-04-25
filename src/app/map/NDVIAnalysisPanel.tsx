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
  onLayerZoom: (id: string) => void;
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
  layer, isRTL, onToggle, onOpacity, onColor, onRemove, onZoom,
}: {
  layer: MapLayer;
  isRTL: boolean;
  onToggle: (v: boolean) => void;
  onOpacity: (v: number) => void;
  onColor: (v: string) => void;
  onRemove: () => void;
  onZoom: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

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
          <label style={{ cursor: "pointer", flexShrink: 0 }}>
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
        <span style={{ flex: 1, fontSize: 12, color: layer.visible ? "#cbd5e1" : "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isRTL ? layer.nameAr : layer.name}
        </span>

        {layer.featureCount !== undefined && (
          <span style={{ fontSize: 10, color: "#475569", flexShrink: 0 }}>{layer.featureCount}</span>
        )}

        {/* Action buttons */}
        <button onClick={onZoom} title="Zoom to" style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#00d4ff")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        </button>

        <button onClick={() => setExpanded((p) => !p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0, transition: "transform .2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>

        <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#475569", padding: 2, flexShrink: 0 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      {/* Expanded: opacity slider + source */}
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
          {layer.source && (
            <p style={{ margin: "6px 0 0", fontSize: 10, color: "#334155", lineHeight: 1.5 }}>
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
  layers, onLayerToggle, onLayerOpacity, onLayerColor, onLayerRemove, onLayerZoom,
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
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        {layers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#334155" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ margin: "0 auto 8px", display: "block", opacity: 0.5 }}>
              <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M3 15h18M9 3v18"/>
            </svg>
            <p style={{ fontSize: 12, margin: 0 }}>{isRTL ? "لا توجد طبقات بعد" : "No layers yet"}</p>
            <p style={{ fontSize: 10, margin: "4px 0 0", color: "#1e293b" }}>{isRTL ? "ارفع ملف GeoJSON للبدء" : "Upload a GeoJSON file to start"}</p>
          </div>
        ) : (
          layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              isRTL={isRTL}
              onToggle={(v) => onLayerToggle(layer.id, v)}
              onOpacity={(v) => onLayerOpacity(layer.id, v)}
              onColor={(v) => onLayerColor(layer.id, v)}
              onRemove={() => onLayerRemove(layer.id)}
              onZoom={() => onLayerZoom(layer.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}