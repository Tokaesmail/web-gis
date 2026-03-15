import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://web-gis-eosin.vercel.app";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60,
  },

  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          console.log("[authorize] missing credentials");
          return null;
        }

        try {
          console.log("[authorize] calling:", `${BASE_URL}/auth/login`);

          const res = await fetch(`${BASE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          const payload = await res.json();

          console.log("[authorize] status:", res.status);
          console.log("[authorize] payload:", JSON.stringify(payload));

          // Handle both response shapes:
          // Shape 1: { success: true, data: { accessToken, user } }
          // Shape 2: { accessToken, user } (flat)
          let accessToken: string | undefined;
          let user: any;

          if (payload?.data?.accessToken) {
            // Shape 1
            accessToken = payload.data.accessToken;
            user = payload.data.user;
          } else if (payload?.accessToken) {
            // Shape 2 - flat
            accessToken = payload.accessToken;
            user = payload.user ?? payload;
          }

          if (!accessToken || !user) {
            console.log("[authorize] no token or user in response");
            return null;
          }

          return {
            id: user.id ?? user._id ?? "",
            email: user.email,
            name: user.username ?? user.name,
            accessToken,
            username: user.username ?? user.name,
            is_active: user.is_active ?? true,
            is_verified: user.is_verified ?? false,
            created_at: user.created_at ?? new Date().toISOString(),
          } as any;
        } catch (e) {
          console.error("[authorize] error:", e);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.accessToken = (user as any).accessToken;
        token.username = (user as any).username;
        token.email = user.email;
      }
      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id: token.id as string,
          accessToken: token.accessToken as string,
          username: token.username as string,
          email: token.email as string,
        } as any;
      }
      return session;
    },
  },
};