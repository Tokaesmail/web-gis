// middleware.ts  (في الـ root جنب package.json)
import NextAuth from "next-auth";
import { authConfig } from "@/src/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // حمي كل الصفحات ما عدا الـ static files والـ api
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
