import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

// ── Helper: extract bearer token from JWT ─────────────────────────────────────
async function extractToken(req: NextRequest): Promise<string | null> {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return (jwt as any)?.accessToken as string | undefined ?? null;
}

// ── GET /api/gis/my-data — fetch all saved files for this user ────────────────
export async function GET(req: NextRequest) {
  try {
    const token = await extractToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    const res = await fetch(`${BASE_URL}/gis/my-data`, {
      method:  "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache:   "no-store",
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: data?.message ?? "Failed to fetch saved data" },
        { status: res.status }
      );
    }

    return NextResponse.json(data, { status: 200 });

  } catch (err: any) {
    console.error("[GET /api/gis/my-data] Error:", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}

// ── POST /api/gis/my-data — upload & save a GeoJSON file ─────────────────────
// Accepts multipart/form-data with a "file" field (same shape the frontend sends)
export async function POST(req: NextRequest) {
  try {
    const token = await extractToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 }
      );
    }

    // Forward the multipart body as-is to the backend
    const formData = await req.formData();

    const res = await fetch(`${BASE_URL}/gis/upload-geojson`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}` },
      // Do NOT set Content-Type — fetch sets the correct multipart boundary automatically
      body:    formData,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: data?.message ?? "Upload failed" },
        { status: res.status }
      );
    }

    return NextResponse.json(
      { success: true, message: "File saved successfully", data },
      { status: 200 }
    );

  } catch (err: any) {
    console.error("[POST /api/gis/my-data] Error:", err);
    return NextResponse.json(
      { success: false, message: err?.message ?? "Internal server error" },
      { status: 500 }
    );
  }
}