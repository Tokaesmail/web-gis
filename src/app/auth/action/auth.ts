"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RegisterValues, schema } from "@/src/app/Schema/schema";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

// async function setTokenCookie(token: string) {
//   const cookieStore = await cookies();
//   cookieStore.set("accessToken", token, {
//     httpOnly: true,
//     secure: process.env.NODE_ENV === "production",
//     sameSite: "lax",
//     maxAge: 60 * 60 * 24 * 7, // 7 days
//     path: "/",
//   });
// }

// ─── Login  POST /auth/register ──────────────────────────────────────────────────

export async function registerAction(values: RegisterValues) {
  const validated = schema.safeParse(values);
  if (!validated.success) return { error: "Invalid data" };

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/auth/register`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );

    const data = await res.json();
    if (!res.ok) return { error: data.message || "Registration failed" };

    return { success: true };
  } catch (error) {
    return { error: "Server communication error" };
  }
}

// ─── Login  POST /auth/login ──────────────────────────────────────────────────
export async function loginAction(_: unknown, formData: FormData) {
  const body = {
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    return { error: data.message ?? "Invalid credentials" };
  }

  redirect("/map");
}

// ─── Logout  POST /auth/logout ────────────────────────────────────────────────
export async function logoutAction() {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    // headers: { Authorization: `Bearer ${}` },
  }).catch(() => {});

  redirect("/auth/login");
}

// ─── Logout All  POST /auth/logout-all ───────────────────────────────────────
export async function logoutAllAction() {
  await fetch(`${BASE_URL}/auth/logout-all`, {
    method: "POST",
    // headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});

  redirect("/auth/login");
}

// ─── Refresh Token  POST /auth/refresh ───────────────────────────────────────
export async function refreshTokenAction() {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    // headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) return { error: data.message ?? "Refresh failed" };

  return { success: true };
}

// ─── Change Password  PUT /auth/change-password ───────────────────────────────
export async function changePasswordAction(_: unknown, formData: FormData) {
  const body = {
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  };

  const res = await fetch(`${BASE_URL}/auth/change-password`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      // Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) return { error: data.message ?? "Failed to change password" };

  return { success: true };
}

// ─── Get Current User  GET /auth/me ───────────────────────────────────────────
export async function getCurrentUser() {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    // headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data.data?.user ?? data.user ?? null;
}

// ─── Get Sessions  GET /auth/sessions ─────────────────────────────────────────
export async function getSessions() {
  const res = await fetch(`${BASE_URL}/auth/sessions`, {
    // headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return [];

  const data = await res.json();
  return data.data?.sessions ?? data.sessions ?? [];
}

// ─── Revoke Session  DELETE /auth/sessions/:id ────────────────────────────────
export async function revokeSessionAction(formData: FormData): Promise<any> {
  const sessionId = formData.get("sessionId");

  if (!sessionId) {
    return { error: "Session ID is required" };
  }

  const res = await fetch(`${BASE_URL}/auth/sessions/${sessionId}`, {
    method: "DELETE",
    // headers: { Authorization: `Bearer ${token}` },
  });

  const data = await res.json();

  if (!res.ok) return { error: data.message ?? "Failed to revoke session" };

  return { success: true };
}
