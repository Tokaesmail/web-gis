'use client';
import React, { useEffect, useState } from 'react'
import { getMidCoords } from './geoFeatureUtils';

export function CropsPanel({ selectedFeature }: { selectedFeature?: GeoJSON.Feature | null }) {
  const coords = getMidCoords(selectedFeature);

  const [data, setData] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!coords) return;

    let cancelled = false;
    setLoading(true);

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords[0]}&longitude=${coords[1]}` +
      `&daily=et0_fao_evapotranspiration,shortwave_radiation_sum,precipitation_sum` +
      `&hourly=soil_moisture_0_to_1cm,soil_temperature_0cm` +
      `&timezone=auto&past_days=30&forecast_days=1`
    )
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        console.log("[CropsPanel] raw API response:", d);
        setData(d);
      })
      .finally(() => setLoading(false));

    return () => { cancelled = true; };
  }, [coords?.[0], coords?.[1]]);

  if (!coords) {
    return (
      <div className="p-3 text-xs text-slate-400">
        🌾 Select a field to analyze vegetation health
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="space-y-3 p-3">
        <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
        <div className="h-24 bg-white/5 rounded-xl animate-pulse" />
        <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
      </div>
    );
  }

  // ───────── DATA EXTRACTION ─────────
  const daily = data.daily ?? {};
  const hourly = data.hourly ?? {};

  const et = daily.et0_fao_evapotranspiration ?? [];
  const rad = daily.shortwave_radiation_sum ?? [];
  const rain = daily.precipitation_sum ?? [];

  const soil = (hourly.soil_moisture_0_to_1cm ?? []).slice(-24);

  // ───────── NDVI PROXY SERIES ─────────
  const ndviSeries = et.map((e: number, i: number) => {
    const r = rad[i] ?? 1;
    return r > 0 ? Math.min(0.95, Math.max(0.05, (e / r) * 3.5)) : null;
  }).filter(Boolean) as number[];

  const ndvi = ndviSeries.at(-1) ?? 0;

  const soilAvg = soil.length
    ? soil.reduce((a: number, b: number) => a + b, 0) / soil.length
    : 0;

  const rainSum = rain.slice(-7).reduce(
    (a: number, b: number) => a + (Number(b) || 0),
    0
  );

  // ───────── SCIENTIFIC SCORING ─────────
  const vegetationScore = ndvi * 100;
  const moistureScore = soilAvg * 100;
  const rainfallScore = Math.min(100, rainSum * 8);

  const stressIndex =
    (1 - ndvi) * 0.5 +
    (1 - soilAvg) * 0.3 +
    (rainSum < 5 ? 0.2 : 0);

  const status =
    stressIndex < 0.3
      ? "Optimal"
      : stressIndex < 0.6
      ? "Moderate"
      : "High Stress";

  console.log("[CropsPanel] processed data:", {
    coords,
    ndviSeries,
    ndvi,
    soilAvg,
    rainSum,
    vegetationScore,
    moistureScore,
    rainfallScore,
    stressIndex,
    status,
  });

  const color =
    status === "Optimal"
      ? "#22c55e"
      : status === "Moderate"
      ? "#f59e0b"
      : "#ef4444";

  // ───────── SIMPLE NDVI GRAPH ─────────
  const W = 240;
  const H = 60;

  const points = ndviSeries.slice(-20).map((v, i) => {
    const x = (i / Math.max(1, ndviSeries.length - 1)) * W;
    const y = H - v * H;
    return [x, y];
  });

  const path =
    points.map(([x, y], i) =>
      `${i === 0 ? "M" : "L"}${x},${y}`
    ).join(" ");

  return (
    <div className="space-y-4 p-3">

      {/* HEADER */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[0.6rem] text-slate-500 uppercase">Crop Intelligence Engine</p>
        <p className="text-sm font-bold text-white">
          Vegetation Monitoring
        </p>
        <p className="text-[0.6rem] text-slate-500">
          Lat {coords[0].toFixed(4)} • Lng {coords[1].toFixed(4)}
        </p>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "NDVI", v: vegetationScore.toFixed(1) + "%", c: "#22c55e" },
          { l: "Moisture", v: moistureScore.toFixed(1) + "%", c: "#38bdf8" },
          { l: "Rain", v: rainSum.toFixed(1) + "mm", c: "#06b6d4" }
        ].map((x, i) => (
          <div key={i} className="p-2 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm font-bold" style={{ color: x.c }}>
              {x.v}
            </p>
            <p className="text-[0.6rem] text-slate-500">{x.l}</p>
          </div>
        ))}
      </div>

      {/* STATUS */}
      <div
        className="p-3 rounded-xl border"
        style={{
          borderColor: color,
          background: `${color}15`
        }}
      >
        <p className="text-xs font-bold" style={{ color }}>
          {status} Vegetation Condition
        </p>
        <p className="text-[0.6rem] text-slate-400 mt-1">
          Stress index: {stressIndex.toFixed(2)}
        </p>
      </div>

      {/* NDVI CHART */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="text-[0.6rem] text-slate-500 mb-2">
          NDVI Time Series (proxy from ET/Radiation)
        </p>

        <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </linearGradient>
          </defs>

          <path d={`${path} L${W} ${H} L0 ${H} Z`} fill="url(#g)" />
          <path d={path} fill="none" stroke={color} strokeWidth="2" />
        </svg>
      </div>

      {/* SCIENCE INSIGHT */}
      <div className="text-[0.6rem] text-slate-400 leading-relaxed bg-white/5 border border-white/10 p-3 rounded-xl">
        Vegetation health is estimated using evapotranspiration efficiency,
        soil moisture saturation, and precipitation anomaly deviation.
      </div>

    </div>
  );
} 