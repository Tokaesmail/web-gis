"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { redirect, useRouter } from "next/navigation";
import Link from "next/link";
import { RegisterValues, schema } from "@/src/app/Schema/schema";
import { registerAction } from "../action/auth";
import { error } from "console";

// ─── Component ────────────────────────────────────────────────────────────────
export default function RegisterForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const password = watch("password", "");
  const strength = getPasswordStrength(password);

  const onSubmit = async (values: RegisterValues) => {
    setServerError(null);

    const result = await registerAction(values);

    if (result.error) {
      setServerError(result.error);
    } else {
      router.push("/auth/login?registered=1");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {serverError && <ErrorBanner message={serverError} />}

      {/* Username */}
      <Field
        label="Username"
        id="username"
        type="text"
        placeholder="yourname"
        autoComplete="username"
        error={errors.username?.message}
        {...register("username")}
      />

      {/* Email */}
      <Field
        label="Email"
        id="email"
        type="email"
        placeholder="you@example.com"
        autoComplete="email"
        error={errors.email?.message}
        {...register("email")}
      />

      {/* Password + strength meter */}
      <div className="space-y-2">
        <PasswordField
          label="Password"
          id="password"
          placeholder="••••••••"
          autoComplete="new-password"
          show={showPass}
          onToggle={() => setShowPass((p) => !p)}
          error={errors.password?.message}
          {...register("password")}
        />
        {password.length > 0 && (
          <div className="space-y-1.5 px-0.5">
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((level) => (
                <div
                  key={level}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    strength.score >= level
                      ? level <= 1
                        ? "bg-red-500"
                        : level === 2
                          ? "bg-orange-400"
                          : level === 3
                            ? "bg-yellow-400"
                            : "bg-emerald-400"
                      : "bg-white/6"
                  }`}
                />
              ))}
            </div>
            <p className={`text-[0.65rem] ${strength.color}`}>
              {strength.label}
            </p>
          </div>
        )}
      </div>

      <SubmitButton
        pending={isSubmitting}
        label="Create Account"
        pendingLabel="Creating account..."
      />
    </form>
  );
}

// ─── Password strength helper ─────────────────────────────────────────────────
function getPasswordStrength(password: string) {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = [
    "",
    "text-red-400",
    "text-orange-400",
    "text-yellow-400",
    "text-emerald-400",
  ];
  return {
    score,
    label: labels[score] || "Weak",
    color: colors[score] || "text-red-400",
  };
}

// ─── Shared field components ──────────────────────────────────────────────────
function ErrorBanner({ message }: { message: string }) {
  return (
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
      <p className="text-sm text-red-400">{message}</p>
    </div>
  );
}

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  error?: string;
}
const Field = ({ label, id, error, ...props }: FieldProps) => (
  <div className="space-y-1.5">
    <label
      htmlFor={id}
      className="block text-[0.72rem] text-slate-400 tracking-wide uppercase">
      {label}
    </label>
    <input
      id={id}
      {...props}
      className={`w-full bg-white/3 border rounded-xl px-3.5 py-3 text-sm text-slate-100 placeholder:text-slate-600 outline-none transition-all
        ${
          error
            ? "border-red-500/40 focus:border-red-500/60 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
            : "border-white/8 focus:border-cyan-400/40 focus:shadow-[0_0_0_3px_rgba(0,212,255,0.06)]"
        }`}
    />
    {error && <p className="text-[0.68rem] text-red-400 mt-1">{error}</p>}
  </div>
);

interface PasswordFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  id: string;
  show: boolean;
  onToggle: () => void;
  error?: string;
}
const PasswordField = ({
  label,
  id,
  show,
  onToggle,
  error,
  ...props
}: PasswordFieldProps) => (
  <div className="space-y-1.5">
    <label
      htmlFor={id}
      className="block text-[0.72rem] text-slate-400 tracking-wide uppercase">
      {label}
    </label>
    <div
      className={`flex items-center gap-2 bg-white/3 border rounded-xl px-3.5 py-3 transition-all
      ${
        error
          ? "border-red-500/40 focus-within:border-red-500/60 focus-within:shadow-[0_0_0_3px_rgba(239,68,68,0.08)]"
          : "border-white/8 focus-within:border-cyan-400/40 focus-within:shadow-[0_0_0_3px_rgba(0,212,255,0.06)]"
      }`}>
      <input
        id={id}
        type={show ? "text" : "password"}
        {...props}
        className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
      />
      <button
        type="button"
        onClick={onToggle}
        className="text-slate-500 hover:text-slate-300 transition-colors cursor-pointer shrink-0">
        {show ? (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
    {error && <p className="text-[0.68rem] text-red-400 mt-1">{error}</p>}
  </div>
);

function SubmitButton({
  pending,
  label,
  pendingLabel,
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
}) {
  return (
    <>
      <button
        type="submit"
        disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed text-[#040d1a] font-semibold text-sm rounded-xl py-3 transition-all cursor-pointer shadow-[0_4px_20px_rgba(0,212,255,0.25)] hover:shadow-[0_4px_28px_rgba(0,212,255,0.4)]">
        {pending && (
          <svg
            className="animate-spin"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        )}
        {pending ? pendingLabel : label}
      </button>

      {/* Footer */}
      <p className="text-sm text-slate-600 text-center">
        Already have an account?{" "}
        <Link
          href="/auth/login"
          className="text-cyan-400 hover:text-cyan-300 transition-colors font-medium">
          Sign in
        </Link>
      </p>
    </>
  );
}
