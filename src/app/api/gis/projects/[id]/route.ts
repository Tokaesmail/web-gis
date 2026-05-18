import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

async function extractToken(req: NextRequest): Promise<string | null> {
  const jwt = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  return (jwt?.accessToken as string | undefined) ?? null;
}

async function forwardProjectById(
  req: NextRequest,
  id: string,
  method: "GET" | "PUT" | "DELETE",
) {
  const token = await extractToken(req);
  if (!token) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  const body = method === "PUT" ? await req.json().catch(() => ({})) : undefined;
  const res = await fetch(`${BASE_URL}/gis/projects/${encodeURIComponent(id)}`, {
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
      { success: false, message: data?.message ?? "Project request failed" },
      { status: res.status },
    );
  }

  return NextResponse.json(data ?? { success: true }, { status: 200 });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await forwardProjectById(req, id, "GET");
  } catch (err: unknown) {
    console.error("[GET /api/gis/projects/:id] Error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await forwardProjectById(req, id, "PUT");
  } catch (err: unknown) {
    console.error("[PUT /api/gis/projects/:id] Error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return await forwardProjectById(req, id, "DELETE");
  } catch (err: unknown) {
    console.error("[DELETE /api/gis/projects/:id] Error:", err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  }
}
