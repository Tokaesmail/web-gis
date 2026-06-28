// app/api/elevation/route.ts  (أو pages/api/elevation.ts حسب الـ router عندك)
// ─── Proxy لـ Open-Elevation API عشان نتجنب CORS ──────────────────────────────

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch("https://api.open-elevation.com/api/v1/lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Open-Elevation returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Proxy error" },
      { status: 500 }
    );
  }
}