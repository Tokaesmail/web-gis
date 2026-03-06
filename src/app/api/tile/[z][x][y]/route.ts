// src/app/api/tile/[z]/[x]/[y]/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Proxy بيجيب التايلز من Esri ويبعتهم للمتصفح
// بكده المتصفح بيطلب التايل من سيرفرك → مفيش CORS → تقدري ترسميه على Canvas

import { NextRequest, NextResponse } from "next/server";

// ── اختاري الـ tile source ────────────────────────────────────────────────────
const TILE_SOURCES: Record<string, string> = {
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  osm:       "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  labels:    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
};

export async function GET(
  req: NextRequest,
  { params }: { params: { z: string; x: string; y: string } }
) {
  const { z, x, y } = params;

  // ?source=satellite (default) أو ?source=osm
  const source = req.nextUrl.searchParams.get("source") ?? "satellite";
  const template = TILE_SOURCES[source] ?? TILE_SOURCES.satellite;

  // حوّل الـ template لـ URL حقيقي
  const url = template
    .replace("{z}", z)
    .replace("{x}", x)
    .replace("{y}", y);

  try {
    const res = await fetch(url, {
      headers: {
        // بعض السيرفرات بتحتاج User-Agent
        "User-Agent": "Mozilla/5.0 GeoSense-App/1.0",
      },
      // cache التايلز عشان متبعتش request لكل واحد
      next: { revalidate: 60 * 60 * 24 }, // 24 ساعة
    });

    if (!res.ok) {
      return new NextResponse("Tile not found", { status: 404 });
    }

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/png";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "public, max-age=86400", // cache في المتصفح 24h
        // ← السطر ده مهم جداً: بيسمح للـ Canvas يرسم التايل بدون CORS error
        "Access-Control-Allow-Origin": "*",
      },
    });

  } catch (err) {
    console.error("Tile proxy error:", err);
    return new NextResponse("Proxy error", { status: 500 });
  }
}