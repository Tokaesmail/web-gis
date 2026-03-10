import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  callbacks: {
    // ── حماية الراوتس ────────────────────────────────────────────────────────
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/auth");
      const isMapPage = nextUrl.pathname.startsWith("/map");

      if (isMapPage && !isLoggedIn) return false; // redirect to login
      if (isAuthPage && isLoggedIn)
        return Response.redirect(new URL("/map", nextUrl)); // redirect to map
      return true;
    },

    // ── بيانات الـ JWT ────────────────────────────────────────────────────────
    async jwt({ token, user }) {
      if (user) {
        // أول مرة بعد اللوجن - احفظ البيانات في التوكن
        token.id = user.id as string;
        token.username = user.username as string;
        token.email = user.email as string;
        token.role = user.role as string;
        token.is_verified = user.is_verified as boolean;
        token.is_active = user.is_active as boolean;
        token.created_at = user.created_at as string;
        token.accessToken = user.accessToken as string;
      }
      return token;
    },

    // ── بيانات الـ Session ────────────────────────────────────────────────────
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.email = token.email as string;
        session.user.role = token.role as string;
        session.user.is_verified = token.is_verified as boolean;
        session.user.is_active = token.is_active as boolean;
        session.user.created_at = token.created_at as string;
        session.user.accessToken = token.accessToken as string;
      }
      return session;
    },
  },

  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        try {
          const res = await fetch(`${BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!res.ok) return null;

          const data = await res.json();

          // اعدّل حسب شكل الـ response من الباك
          const user = data.data?.user ?? data.user ?? data;
          const accessToken =
            data.data?.accessToken ?? data.accessToken ?? data.token ?? null;

          if (!user) return null;

          return {
            id: user.id ?? user._id,
            username: user.username,
            email: user.email,
            role: user.role,
            is_verified: user.is_verified,
            is_active: user.is_active,
            created_at: user.created_at,
            accessToken, // ← التوكن محفوظ في الـ JWT مشفّر
          };
        } catch {
          return null;
        }
      },
    }),
  ],
} satisfies NextAuthConfig;
