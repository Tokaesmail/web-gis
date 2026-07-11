// app/api/gis/super-resolution/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from '../../../../authoptions'; // ← عدّل المسار حسب مكان الملف فعليًا عندك

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const session = await getServerSession(authOptions);
  const token = (session?.user as any)?.accessToken;

  if (!token) {
    return NextResponse.json({ message: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${BASE_URL}/gis/super-resolution`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  return NextResponse.json(data, { status: res.status });
}