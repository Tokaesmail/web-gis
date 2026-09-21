import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://webgiss.duckdns.org";

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: "next-auth.session-token", // لازم، لأنك غيرت اسم الكوكي
  });

  if (!token?.accessToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { path } = await params;
  const res = await fetch(`${BASE_URL}/gis/${path.join("/")}${req.nextUrl.search}`, {
    method: req.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
  });

  return new NextResponse(res.body, {
    status: res.status,
    headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
  });
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE };