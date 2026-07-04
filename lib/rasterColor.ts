// lib/rasterColor.ts
// ─────────────────────────────────────────────────────────────────────────────
// Color ramps مشتركة بين كل الـ raster endpoints (index visualizations زي
// NDVI/NDWI/NDMI). اتنقلت هنا من route.ts الأصلي عشان متتكررش.
// ─────────────────────────────────────────────────────────────────────────────

export type Stop = { pos: number; r: number; g: number; b: number };

function hex(h: string): [number, number, number] {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60; if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function vivid(h: string, satBoost = 1.4, contrastPush = 0.12): [number, number, number] {
  const [r, g, b] = hex(h);
  let [hh, s, l] = rgbToHsl(r, g, b);
  s = Math.min(1, s * satBoost);
  l = l + (l - 0.5) * contrastPush;
  l = Math.max(0.04, Math.min(0.96, l));
  return hslToRgb(hh, s, l);
}

export const RAMPS: Record<string, Stop[]> = {
  rdylgn: [
    "#8b0000","#e31a1c","#fd8d3c","#ffe600","#a6d96a","#31a354","#006837"
  ].map((c, i, a) => { const [r,g,b] = vivid(c, 1.5, 0.16); return { pos: i/(a.length-1), r, g, b }; }),

  rdbu: [
    "#67001f","#b2182b","#d6604d","#f4a582","#fddbc7","#d1e5f0","#4393c3","#2166ac","#053061"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdbu_r: [
    "#b35806","#e08214","#fdb863","#fee0b6","#f7f7f7","#d8daeb","#998ec3","#7b3294","#40004b"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  spectral: [
    "#9e0142","#d53e4f","#f46d43","#fdae61","#fee08b","#e6f598","#abdda4","#66c2a5","#3288bd","#5e4fa2"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  spectral_r: [
    "#d73027","#f46d43","#fdae61","#ffffbf","#d9ef8b","#a6d96a","#74add1","#4575b4","#313695"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  magma: [
    "#2c0735","#6a0dad","#c71585","#ff1493","#ff6347","#ffa500","#ffd700","#ffff66"
  ].map((c, i, a) => { const [r,g,b] = vivid(c, 1.5, 0.16); return { pos: i/(a.length-1), r, g, b }; }),

  greens: [
    "#ffffe5","#f7fcb9","#d9f0a3","#addd8e","#78c679","#41ab5d","#238443","#005a32"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdylbu_r: [
    "#f7fbff","#deebf7","#c6dbef","#9ecae1","#6baed6","#4292c6","#2171b5","#08519c","#08306b"
  ].map((c, i, a) => { const [r,g,b] = vivid(c); return { pos: i/(a.length-1), r, g, b }; }),

  inferno: [
    "#000004","#1b0c41","#4a0c6b","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcffa4"
  ].map((c, i, a) => { const [r,g,b] = vivid(c, 1.45, 0.14); return { pos: i/(a.length-1), r, g, b }; }),
};

export function applyColormap(stops: Stop[], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].pos) {
      const prev = stops[i - 1], next = stops[i];
      const f = (t - prev.pos) / (next.pos - prev.pos);
      return [
        Math.round(prev.r + f * (next.r - prev.r)),
        Math.round(prev.g + f * (next.g - prev.g)),
        Math.round(prev.b + f * (next.b - prev.b)),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last.r, last.g, last.b];
}

export function buildLUT(stops: Stop[]): Buffer {
  const lut = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = applyColormap(stops, i / 255);
    lut[i * 3]     = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}
