import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

// ── Re-login to get a fresh access token ──────────────────────────────────────
async function reLoginForToken(token: any) {
  try {
    if (!token._email || !token._password) {
      console.log("[reLogin] no stored credentials");
      return { ...token, error: "RefreshTokenError" };
    }

    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: token._email, password: token._password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message ?? "Re-login failed");

    const newAccessToken = data?.data?.accessToken ?? data?.accessToken;
    if (!newAccessToken) throw new Error("No accessToken in response");

    const payload = JSON.parse(
      Buffer.from(newAccessToken.split(".")[1], "base64").toString()
    );

    console.log("[reLogin] token refreshed successfully");
    return {
      ...token,
      accessToken: newAccessToken,
      accessTokenExpires: payload.exp * 1000,
      error: undefined,
    };
  } catch (e) {
    console.error("[reLogin] failed:", e);
    return { ...token, error: "RefreshTokenError" };
  }
}

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
            _password: credentials.password, // stored encrypted in JWT for silent re-login
          } as any;
        } catch (e) {
          console.error("[authorize] error:", e);
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      // first sign-in — store token + credentials for silent re-login
      if (user) {
        token.id           = (user as any).id;
        token.accessToken  = (user as any).accessToken;
        token.username     = (user as any).username;
        token.email        = user.email;
        // store for silent re-login (encrypted in JWT, httpOnly)
        token._email       = (user as any).email;
        token._password    = (user as any)._password;

        try {
          const payload = JSON.parse(
            Buffer.from((token.accessToken as string).split(".")[1], "base64").toString()
          );
          token.accessTokenExpires = payload.exp * 1000;
        } catch {
          token.accessTokenExpires = Date.now() + 14 * 60 * 1000;
        }

        return token;
      }

      // token still valid
      if (Date.now() < (token.accessTokenExpires as number) - 60_000) {
        return token;
      }

      // expired — silent re-login
      console.log("[jwt] token expired, re-logging in...");
      return reLoginForToken(token);
    },

    async session({ session, token }) {
      if (token) {
        session.user = {
          ...session.user,
          id          : token.id as string,
          accessToken : token.accessToken as string,
          username    : token.username as string,
          email       : token.email as string,
        } as any;
        (session as any).error = token.error;
      }
      return session;
    },
  },
};