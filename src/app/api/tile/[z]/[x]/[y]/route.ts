import { NextRequest, NextResponse } from "next/server";

// ⚠️ نفس الشرح القديم — الباقي هنا محتاج proxy فعلاً (CORS/hotlink).
const TILE_SOURCES: Record<string, string | string[]> = {
  sentinel: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg",

  google_sat: [
    "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
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
    const { z, x, y } = await params;

    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source") || "sentinel";

    const templates = TILE_SOURCES[source];
    if (!templates) return new NextResponse("Unknown source", { status: 400 });

    const templateList = Array.isArray(templates)
      ? [...templates].sort(() => Math.random() - 0.5)
      : [templates];

    let res: Response | null = null;
    for (const template of templateList) {
      const url = template.replace("{z}", z).replace("{x}", x).replace("{y}", y);
      const absoluteUrl = url.startsWith("/")
        ? new URL(url, req.nextUrl.origin).toString()
        : url;

      
      res = await fetch(absoluteUrl, {
        headers: { "User-Agent": "Mozilla/5.0 GeoSense-App/1.0" },
      });

      if (res.ok) break;
    }

    if (!res?.ok) return new NextResponse("Not Found", { status: 404 });

    const contentType = res.headers.get("content-type") || "image/png";
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    return new NextResponse("Internal Error", { status: 500 });
  }
}