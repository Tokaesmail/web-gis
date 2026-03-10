"use server";

import { signIn, signOut, auth } from "@/src/auth";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { RegisterValues, schema } from "@/src/app/Schema/schema";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// ─── Helper ────────────────────────────────────────
async function getAccessToken(): Promise<string | null> {
  const session = await auth();
  return session?.user?.accessToken ?? null;
}

// ─── Register  POST /auth/register ───────────────────────────────────────────
export async function registerAction(values: RegisterValues) {
  const validated = schema.safeParse(values);
  if (!validated.success) return { error: "Invalid data" };

  try {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    const data = await res.json();
    if (!res.ok) return { error: data.message || "Registration failed" };

    return { success: true };
  } catch {
    return { error: "Server communication error" };
  }
}

// ─── Login ─────────────────────────────────────────────────────
export async function loginAction(_: unknown, formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/map",
    });
  } catch (error: any) {
    if (isRedirectError(error)) throw error; // ← مهم جداً
    if (error?.type === "CredentialsSignin") {
      return { error: "Invalid email or password" };
    }
    return { error: "Something went wrong" };
  }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logoutAction() {
  const token = await getAccessToken();
  if (token) {
    fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  await signOut({ redirectTo: "/auth/login" });
}

// ─── Logout All ───────────────────────────────────────────────────────────────
export async function logoutAllAction() {
  const token = await getAccessToken();
  if (token) {
    fetch(`${BASE_URL}/auth/logout-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  await signOut({ redirectTo: "/auth/login" });
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changePasswordAction(_: unknown, formData: FormData) {
  const token = await getAccessToken();

  const body = {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  };

  const res = await fetch(`${BASE_URL}/auth/change-password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) return { error: data.message ?? "Failed to change password" };

  return { success: true };
}

// ─── Get Current User من الـ Session ─────────────────────────────────────────
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

// ─── Get Sessions ─────────────────────────────────────────────────────────────
export async function getSessions() {
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/auth/sessions`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.data?.sessions ?? data.sessions ?? [];
}

// ─── Revoke Session ───────────────────────────────────────────────────────────
export async function revokeSessionAction(formData: FormData) {
  const sessionId = formData.get("sessionId");
  if (!sessionId) return { error: "Session ID is required" };

  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/auth/sessions/${sessionId}`, {
    method: "DELETE",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await res.json();
  if (!res.ok) return { error: data.message ?? "Failed to revoke session" };

  return { success: true };
}

// ─── Refresh Token ────────────────────────────────────────────────────────────
export async function refreshTokenAction() {
  const token = await getAccessToken();

  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const data = await res.json();
  if (!res.ok) return { error: data.message ?? "Refresh failed" };

  return { success: true };
}
