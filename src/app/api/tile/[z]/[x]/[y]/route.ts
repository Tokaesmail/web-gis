import { NextRequest, NextResponse } from "next/server";

const TILE_SOURCES: Record<string, string> = {
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  osm:       "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  labels:    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
};

// في Next.js 15 الـ params لازم تكون Promise
type Props = {
  params: Promise<{
    z: string;
    x: string;
    y: string;
  }>;
};

export async function GET(req: NextRequest, { params }: Props) {
  try {
    // استلام المتغيرات بعد عمل await
    const { z, x, y } = await params;

    // استلام المصدر من الـ Query String
    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") || "satellite";
    
    const template = TILE_SOURCES[source] || TILE_SOURCES.satellite;

    const url = template
      .replace("{z}", z)
      .replace("{x}", x)
      .replace("{y}", y);

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 GeoSense-App/1.0" },
      cache: "force-cache",
    });

    if (!res.ok) return new NextResponse("Not Found", { status: 404 });

    const contentType = res.headers.get("content-type") || "image/png";

    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*", // مهم جداً للـ Canvas
      },
    });
  } catch (error) {
    return new NextResponse("Internal Error", { status: 500 });
  }
}