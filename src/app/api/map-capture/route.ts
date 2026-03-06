// src/app/api/map-capture/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// الـ endpoint اللي بيستقبل الداتا من LeafletMap
// Method: POST
// Content-Type: multipart/form-data

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // ① استقبل الـ FormData
    const form = await req.formData();

    // ② استخرج الـ 3 حاجات اللي بعتناهم من LeafletMap
    const imageFile   = form.get("image")       as File   | null;
    const coordsRaw   = form.get("coordinates") as string | null;
    const metaRaw     = form.get("metadata")    as string | null;

    // تأكد إن الداتا وصلت
    if (!imageFile || !coordsRaw || !metaRaw) {
      return NextResponse.json(
        { error: "Missing required fields: image, coordinates, metadata" },
        { status: 400 }
      );
    }

    // ③ حوّل الـ JSON strings لـ objects
    const coordinates = JSON.parse(coordsRaw);
    // مثال: [{ lat: 29.1, lng: 30.5 }, { lat: 29.2, lng: 30.6 }, ...]

    const metadata = JSON.parse(metaRaw);
    // مثال: { areaName: "Drawn Polygon", areaSizeHa: 625.1, zoom: 8, capturedAt: "..." }

    // ④ لو محتاج تتعامل مع الصورة (اختياري)
    // const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    // ← تقدري تحفظيه على disk أو تبعتيه لـ storage

    // ─── هنا بيشتغل الـ Backend بتاعك ────────────────────────────────────
    //
    // مثلاً:
    // const analysis = await analyzeArea(coordinates);
    // const ndvi     = await fetchNDVI(coordinates);
    //
    // دلوقتي بنرجع dummy data عشان تتأكدي إن الـ connection شغال
    // ─────────────────────────────────────────────────────────────────────

    console.log("📍 Coordinates received:", coordinates.length, "points");
    console.log("📋 Metadata:", metadata);
    console.log("🖼️  Image size:", imageFile.size, "bytes");

    // ⑤ رد على الـ Frontend بالنتايج
    return NextResponse.json({
      success:     true,
      message:     "Received successfully",
      // ── الداتا اللي بترجعيها للـ Frontend ──
      areaName:    metadata.areaName,
      areaSizeHa:  metadata.areaSizeHa,
      pointsCount: coordinates.length,
      // ── لما الـ Backend يبقى جاهز هتبعتي النتايج الحقيقية هنا ──
      // ndvi:     0.72,
      // ndwi:     0.31,
      // analysis: "Vegetation detected..."
    });

  } catch (error) {
    console.error("❌ map-capture error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}