// src/app/auth/register/page.tsx
import Link from "next/link";
import RegisterForm from "./_form";

export default function RegisterPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-white/6" />
          <span className="text-[0.65rem] text-slate-600 tracking-[0.15em] uppercase">
            Create Account
          </span>
          <div className="h-px flex-1 bg-white/6" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-100 tracking-tight">
          Join GeoSense AI
        </h1>
        <p className="text-sm text-slate-500">
          Start monitoring your fields with satellite precision
        </p>
      </div>

      <RegisterForm />

      <p className="text-center text-[0.72rem] text-slate-600">
        By creating an account you agree to our{" "}
        <Link href="#" className="text-cyan-400 hover:text-cyan-300">
          Terms of Service
        </Link>
      </p>
    </div>
  );
}