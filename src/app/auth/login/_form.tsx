"use client";

import { signIn } from "next-auth/react";
import { useActionState, useState } from "react";

interface AuthFormProps {
  action: (state: unknown, formData: FormData) => Promise<{ error?: string | null } | void>;
  submitLabel: string;
  showUsername?: boolean;
  extraFields?: React.ReactNode;
}

export default function AuthForm({
  action,
  submitLabel,
  showUsername = false,
  extraFields,
}: AuthFormProps) {
  const [state, , ] = useActionState(action, null);
  const [showPass, setShowPass] = useState(false);
  const [pending, setPending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  const EyeIcon = ({ show, toggle }: { show: boolean; toggle: () => void }) => (
    <button
      type="button"
      onClick={toggle}
      className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
    >
      {show ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setClientError(null);
    setPending(true);

    const formData = new FormData(e.currentTarget);

    try {
      // Step 1: validate via server action (hits the API)
      const result = await action(null, formData);

      if (result?.error) {
        setClientError(result.error);
        setPending(false);
        return;
      }

      // Step 2: create the next-auth session
      const res = await signIn("credentials", {
        email: formData.get("email") as string,
        password: formData.get("password") as string,
        redirect: false,
      });

      if (res?.error) {
        setClientError("Invalid email or password");
        setPending(false);
        return;
      }

      // Step 3: redirect
      window.location.href = "/map";
    } catch {
      setClientError("Something went wrong. Please try again.");
      setPending(false);
    }
  }

  const error = clientError ?? (state as any)?.error;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {showUsername && (
        <Field label="Username" name="username" type="text" placeholder="yourname" autoComplete="username" />
      )}

      <Field label="Email" name="email" type="email" placeholder="you@example.com" autoComplete="email" />

      {/* Password */}
      <div className="space-y-1.5">
        <label className="block text-[0.72rem] text-slate-400 tracking-wide uppercase">Password</label>
        <div className="flex items-center gap-2 bg-white/3 border border-white/8 rounded-xl px-3.5 py-3 focus-within:border-cyan-400/40 focus-within:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all">
          <input
            name="password"
            type={showPass ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            required
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
          />
          <EyeIcon show={showPass} toggle={() => setShowPass((p) => !p)} />
        </div>
      </div>

      {extraFields}

      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-[#040d1a] font-semibold text-sm rounded-xl py-3 transition-all cursor-pointer shadow-[0_4px_20px_rgba(0,212,255,0.25)] hover:shadow-[0_4px_28px_rgba(0,212,255,0.4)]"
      >
        {pending && (
          <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {pending ? "Please wait..." : submitLabel}
      </button>
    </form>
  );
}

// ── Reusable input field ───────────────────────────────────────────────────────
function Field({
  label,
  name,
  type,
  placeholder,
  autoComplete,
}: {
  label: string;
  name: string;
  type: string;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="block text-[0.72rem] text-slate-400 tracking-wide uppercase">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required
        className="w-full bg-white/3 border border-white/8 rounded-xl px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-cyan-400/40 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all"
      />
    </div>
  );
}