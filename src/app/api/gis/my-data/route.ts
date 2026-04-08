import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../authoptions";

export const runtime = "nodejs";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const token = (session?.user as any)?.accessToken as string | undefined;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      );
    }

    const res = await fetch(`${BASE_URL}/gis/my-data`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);

    return NextResponse.json(json ?? { success: false, message: "Invalid JSON from backend" }, {
      status: res.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, message: e?.message ?? "Internal server error" },
      { status: 500 },
    );
  }
}

