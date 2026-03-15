"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../../../authoptions";
import { redirect } from "next/navigation";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://gis-back-chi.vercel.app";

// ─── Helper ────────────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return (session?.user as any)?.accessToken ?? null;
}

// ─── Get Current User ──────────────────────────────────────────────────────────
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

// ─── Login ─────────────────────────────────────────────────────────────────────
// ONLY validates inputs — the API call happens in authOptions.authorize()
export async function loginAction(_: unknown, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address" };
  }

  if (password.length < 6) {
    return { error: "Password is too short" };
  }

  return { error: null };
}

// ─── Logout ────────────────────────────────────────────────────────────────────
export async function logoutAction() {
  const token = await getAccessToken();
  if (token) {
    fetch(`${BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  redirect("/auth/login");
}

// ─── Logout All ────────────────────────────────────────────────────────────────
export async function logoutAllAction() {
  const token = await getAccessToken();
  if (token) {
    fetch(`${BASE_URL}/auth/logout-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }
  redirect("/auth/login");
}

// ─── Change Password ───────────────────────────────────────────────────────────
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

// ─── Get Sessions ──────────────────────────────────────────────────────────────
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

// ─── Revoke Session ────────────────────────────────────────────────────────────
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

// ─── Register ──────────────────────────────────────────────────────────────────
export async function registerAction(_: unknown, formData: FormData) {
  const body = {
    username: formData.get("username"),
    email: formData.get("email"),
    password: formData.get("password"),
  };

  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    return { error: data.message ?? "Registration failed" };
  }

  redirect("/auth/login?registered=1");
}

// ─── Refresh Token ─────────────────────────────────────────────────────────────
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