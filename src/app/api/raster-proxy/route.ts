// app/api/raster-proxy/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Proxy: يجيب الـ GeoTIFF من الـ backend ويحوله PNG ملوّن بـ sharp
// بيطبق نفس الـ color ramps الموجودة في الـ UI (rdylgn, magma, إلخ)
// Usage: GET /api/raster-proxy?url=...&token=...&min=-0.2&max=0.9&colormap=rdylgn
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

// ── Color ramps — نفس الـ stops الموجودة في PlanetaryRasterPanel ─────────────
// كل ramp: مصفوفة من { pos: 0-1, r, g, b }
type Stop = { pos: number; r: number; g: number; b: number };

function hex(h: string): [number, number, number] {
  const v = parseInt(h.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const RAMPS: Record<string, Stop[]> = {
  rdylgn: [
    "#d73027","#f46d43","#fdae61","#fee08b","#d9ef8b","#a6d96a","#66bd63","#1a9850"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdbu: [
    "#67001f","#b2182b","#d6604d","#f4a582","#fddbc7","#d1e5f0","#4393c3","#2166ac","#053061"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdbu_r: [
    "#b35806","#e08214","#fdb863","#fee0b6","#f7f7f7","#d8daeb","#998ec3","#7b3294","#40004b"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  spectral: [
    "#9e0142","#d53e4f","#f46d43","#fdae61","#fee08b","#e6f598","#abdda4","#66c2a5","#3288bd","#5e4fa2"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  spectral_r: [
    "#d73027","#f46d43","#fdae61","#ffffbf","#d9ef8b","#a6d96a","#74add1","#4575b4","#313695"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  magma: [
    "#000004","#1b0c41","#4a0c4e","#781c6d","#a52c60","#cf4446","#ed6925","#fb9b06","#f7d13d","#fcfdbf"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  greens: [
    "#ffffe5","#f7fcb9","#d9f0a3","#addd8e","#78c679","#41ab5d","#238443","#005a32"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),

  rdylbu_r: [
    "#f7fbff","#deebf7","#c6dbef","#9ecae1","#6baed6","#4292c6","#2171b5","#08519c","#08306b"
  ].map((c, i, a) => { const [r,g,b] = hex(c); return { pos: i/(a.length-1), r, g, b }; }),
};

// interpolate بين أقرب stopين
function applyColormap(stops: Stop[], t: number): [number, number, number] {
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

// ابني LUT كاملة 256 قيمة → [R,G,B]
function buildLUT(stops: Stop[]): Buffer {
  const lut = Buffer.alloc(256 * 3);
  for (let i = 0; i < 256; i++) {
    const [r, g, b] = applyColormap(stops, i / 255);
    lut[i * 3]     = r;
    lut[i * 3 + 1] = g;
    lut[i * 3 + 2] = b;
  }
  return lut;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const tifUrl   = searchParams.get("url");
  const token    = searchParams.get("token");
  const rMin     = parseFloat(searchParams.get("min") ?? "-1");
  const rMax     = parseFloat(searchParams.get("max") ?? "1");
  const colormap = searchParams.get("colormap") ?? "rdylgn";

  if (!tifUrl) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // ── 1. جيب الـ TIF ────────────────────────────────────────────────────────
  const fetchHeaders: Record<string, string> = {};
  if (token) fetchHeaders["Authorization"] = `Bearer ${token}`;

  const upstream = await fetch(tifUrl, { headers: fetchHeaders });
  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream fetch failed: ${upstream.status}` },
      { status: 502 }
    );
  }

  const tifBuffer = Buffer.from(await upstream.arrayBuffer());

  // ── 2. Linear stretch: float [rMin→rMax] → uint8 [0→255] ─────────────────
  const range = rMax - rMin || 0.001;
  const a = 255 / range;
  const b = -rMin * a;

  const grayBuffer = await sharp(tifBuffer, { failOn: "none" })
    .linear(a, b)
    .toColorspace("b-w")
    .raw()           // pixel data كـ raw bytes (grayscale)
    .toBuffer({ resolveWithObject: true });

  const { data: grayData, info } = grayBuffer;
  const { width, height } = info;

  // ── 3. طبّق الـ colormap — كل pixel grayscale → RGB ──────────────────────
  const stops = RAMPS[colormap] ?? RAMPS["rdylgn"];
  const lut   = buildLUT(stops);

  const rgbData = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const v = grayData[i];                // 0-255
    rgbData[i * 3]     = lut[v * 3];
    rgbData[i * 3 + 1] = lut[v * 3 + 1];
    rgbData[i * 3 + 2] = lut[v * 3 + 2];
  }

  // ── 4. حوّله PNG ──────────────────────────────────────────────────────────
  const pngBuffer = await sharp(rgbData, {
    raw: { width, height, channels: 3 },
  })
    .png()
    .toBuffer();

  return new NextResponse(new Uint8Array(pngBuffer), {
    status: 200,
    headers: {
      "Content-Type":  "image/png",
      "Cache-Control": "public, max-age=300",
    },
  });
}