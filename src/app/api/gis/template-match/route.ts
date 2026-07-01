import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

async function extractToken(req: NextRequest): Promise<string | null> {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const sessionToken = (jwt?.accessToken as string | undefined) ?? null;
  if (sessionToken) return sessionToken;

  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
}

async function readBackendPayload(res: Response) {
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = await extractToken(req);
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated" },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const res = await fetch(`${BASE_URL}/gis/template-match`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
      cache: "no-store",
    });

    const data = await readBackendPayload(res);

    if (!res.ok) {
      const message =
        data?.message ??
        data?.detail ??
        `Template match backend failed (${res.status})`;

      console.error("[POST /api/gis/template-match] Backend error:", {
        status: res.status,
        data,
      });

      return NextResponse.json(
        {
          success: false,
          message,
          backendStatus: res.status,
          backendData: data,
        },
        { status: res.status },
      );
    }

    return NextResponse.json(data ?? { success: true }, { status: 200 });
  } catch (err: unknown) {
    console.error("[POST /api/gis/template-match] Error:", err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}
