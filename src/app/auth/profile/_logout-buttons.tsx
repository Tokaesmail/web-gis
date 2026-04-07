"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

// ─── Single Device Logout ──────────────────────────────────────────────────────
export function LogoutButton() {
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    await signOut({ callbackUrl: "/auth/login" });
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-all cursor-pointer disabled:opacity-50"
    >
      {pending ? (
        <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      )}
      {pending ? "Signing out..." : "Sign Out"}
    </button>
  );
}

// ─── All Devices Logout ────────────────────────────────────────────────────────
export function LogoutAllButton({ logoutAllAction }: { logoutAllAction: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  const handleLogoutAll = async () => {
    setPending(true);
    try {
      // call the server action to revoke all tokens on the backend
      await logoutAllAction();
    } catch {
      // ignore redirect errors thrown by Next.js redirect()
    }
    // then clear the next-auth session cookie
    await signOut({ callbackUrl: "/auth/login" });
  };

  return (
    <button
      type="button"
      onClick={handleLogoutAll}
      disabled={pending}
      className="w-full flex items-center justify-center gap-2 bg-red-500/8 hover:bg-red-500/15 border border-red-500/15 hover:border-red-500/30 rounded-xl py-2.5 text-sm text-red-400 hover:text-red-300 transition-all cursor-pointer disabled:opacity-50"
    >
      {pending ? (
        <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      )}
      {pending ? "Signing out..." : "All Devices"}
    </button>
  );
}
