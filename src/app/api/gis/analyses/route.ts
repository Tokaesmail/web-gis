import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

async function extractToken(req: NextRequest): Promise<string | null> {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return (jwt?.accessToken as string | undefined) ?? null;
}

async function forwardAnalyses(req: NextRequest, method: "GET" | "POST") {
  const token = await extractToken(req);
  if (!token) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  // POST forwards the caller's body exactly as received — the analysis payload
  // is saved as-is, with no transformation on our side.
  const body = method === "POST" ? await req.json().catch(() => ({})) : undefined;

  const res = await fetch(`${BASE_URL}/gis/analyses`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return NextResponse.json(
      { success: false, message: data?.message ?? "Analyses request failed" },
      { status: res.status },
    );
  }

  return NextResponse.json(data ?? { success: true }, { status: 200 });
}

export async function GET(req: NextRequest) {
  try {
    return await forwardAnalyses(req, "GET");
  } catch (err: unknown) {
    console.error("[GET /api/gis/analyses] Error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    return await forwardAnalyses(req, "POST");
  } catch (err: unknown) {
    console.error("[POST /api/gis/analyses] Error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
