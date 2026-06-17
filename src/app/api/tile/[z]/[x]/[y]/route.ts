import { NextRequest, NextResponse } from "next/server";

const TILE_SOURCES: Record<string, string | string[]> = {
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  osm:       "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  labels:    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  sentinel:  "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",
  terrain:   "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
  topo:      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
  legacy:    [
    process.env.LEGACY_TILE_URL_TEMPLATE || process.env.NEXT_PUBLIC_LEGACY_TILE_URL_TEMPLATE || "/legacy-tiles/{z}/{x}/{y}.png",
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  ],
};

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
    
    const templates = TILE_SOURCES[source] || TILE_SOURCES.satellite;
    const templateList = Array.isArray(templates) ? templates : [templates];

    let res: Response | null = null;
    for (const template of templateList) {
      const url = template
        .replace("{z}", z)
        .replace("{x}", x)
        .replace("{y}", y);

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
