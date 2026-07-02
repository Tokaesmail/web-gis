import { NextRequest, NextResponse } from "next/server";

const TILE_SOURCES: Record<string, string | string[]> = {
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  osm:       "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  labels:    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  sentinel:  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  terrain:   "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
  topo:      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  "idx-ndvi": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  "idx-ndwi": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  "idx-ndmi": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  "idx-ndsi": "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  "idx-swir": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

// ─── No-data placeholder detection (خفيف الوزن) ────────────────────────────
// بنشيك بس لو الـ Content-Length صغير بشكل مشبوه — من غير ما نقرا/نبفّر
// جسم أي تايل عادي وكبير. كده مفيش أي تأخير مضاف على التايلز السليمة.
const SUSPICIOUSLY_SMALL_BYTES = 8000;

type Props = {
  params: Promise<{
    z: string;
    x: string;
    y: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Props) {
  try {
    const { z, x, y } = await params;

    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") || "satellite";

    const templates = TILE_SOURCES[source] || TILE_SOURCES.satellite;
    const templateList = Array.isArray(templates) ? templates : [templates];

    let res: Response | null = null;
    let lastUrl = "";
    for (const template of templateList) {
      const url = template
        .replace("{z}", z)
        .replace("{x}", x)
        .replace("{y}", y);

      lastUrl = url;

      const absoluteUrl = url.startsWith("/")
        ? new URL(url, req.nextUrl.origin).toString()
        : url;

      res = await fetch(absoluteUrl, {
        headers: { "User-Agent": "Mozilla/5.0 GeoSense-App/1.0" },
        cache: "force-cache",
      });

      if (res.ok) break;
    }

    if (!res?.ok) return new NextResponse("Not Found", { status: 404 });

    const contentType = res.headers.get("content-type") || "image/png";
    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);

    // ── فحص خفيف بس للتايلز الصغيرة بشكل مشبوه (غالبًا placeholder) ──
    // التايلز العادية (أكبر من الحد ده) بتتمرر مباشرة كـ stream من غير
    // أي buffering إضافي — بالظبط زي السلوك الأصلي السريع.
    if (contentLength > 0 && contentLength < SUSPICIOUSLY_SMALL_BYTES) {
      return new NextResponse("No imagery at this zoom", { status: 404 });
    }

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new NextResponse("Internal Error", { status: 500 });
  }
}