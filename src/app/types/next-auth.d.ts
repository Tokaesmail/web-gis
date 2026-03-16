// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      email: string;
      role: string;
      is_verified: boolean;
      is_active: boolean;
      created_at: string;
      accessToken: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    username?: string;
    role?: string;
    is_verified?: boolean;
    is_active?: boolean;
    created_at?: string;
    accessToken?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    username?: string;
    role?: string;
    is_verified?: boolean;
    is_active?: boolean;
    created_at?: string;
    accessToken?: string;
  }
}
