// src/app/auth/change-password/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "../action/auth";
import ChangePasswordForm from "./_form";

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-white/6" />
          <span className="text-[0.65rem] text-slate-600 tracking-[0.15em] uppercase">
            Security
          </span>
          <div className="h-px flex-1 bg-white/6" />
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/auth/profile"
            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/6 rounded-lg transition-all">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">
              Change Password
            </h1>
            <p className="text-sm text-slate-500">
              Update your account password
            </p>
          </div>
        </div>
      </div>

      {/* Security tips */}
      <div className="bg-white/2 border border-white/6 rounded-xl p-4 space-y-2">
        <p className="text-[0.68rem] text-slate-500 uppercase tracking-wider">
          Password Requirements
        </p>
        {[
          "At least 8 characters long",
          "Mix of uppercase and lowercase",
          "Include numbers and symbols",
        ].map((tip) => (
          <div key={tip} className="flex items-center gap-2">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="text-[0.72rem] text-slate-500">{tip}</span>
          </div>
        ))}
      </div>

      <ChangePasswordForm />

      <p className="text-center text-[0.72rem] text-slate-600">
        After changing your password, you&apos;ll remain signed in on this
        device.{" "}
        <Link
          href="/auth/sessions"
          className="text-cyan-400 hover:text-cyan-300">
          Manage other sessions
        </Link>
      </p>
    </div>
  );
}
