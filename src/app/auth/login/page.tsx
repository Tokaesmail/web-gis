// src/app/auth/login/page.tsx
import Link from "next/link";
import { loginAction } from "../action/auth";
import AuthForm from "./_form";

interface Props {
  searchParams: Promise<{ registered?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-white/6" />
          <span className="text-[0.65rem] text-slate-600 tracking-[0.15em] uppercase">
            Secure Login
          </span>
          <div className="h-px flex-1 bg-white/6" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
          Welcome back
        </h1>
        <p className="text-sm text-slate-500">
          Sign in to access your GeoSense AI dashboard
        </p>
      </div>

      {/* Success banner بعد الريجيستر */}
      {params.registered && (
        <div className="flex items-center gap-3 bg-emerald-400/8 border border-emerald-400/20 rounded-xl px-4 py-3">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#34d399"
            strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <p className="text-sm text-emerald-400">
            Account created — sign in to continue
          </p>
        </div>
      )}

      {/* Error من الـ middleware */}
      {params.error && (
        <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f87171"
            strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-red-400">
            {params.error === "CredentialsSignin"
              ? "Invalid email or password"
              : "Something went wrong"}
          </p>
        </div>
      )}

      {/* Form */}
      <AuthForm action={loginAction} submitLabel="Sign In" />

      {/* Footer links */}
      <div className="space-y-3 text-center">
        <Link
          href="/auth/change-password"
          className="block text-[0.75rem] text-slate-500 hover:text-cyan-400 transition-colors">
          Forgot your password?
        </Link>
        <p className="text-sm text-slate-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/register"
            className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
