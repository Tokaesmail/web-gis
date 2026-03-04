"use client";

import { useActionState, useState } from "react";
import { changePasswordAction } from "../action/auth";

export default function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const EyeBtn = ({ show, toggle }: { show: boolean; toggle: () => void }) => (
    <button type="button" onClick={toggle} className="text-slate-500 hover:text-slate-300 cursor-pointer transition-colors">
      {show
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      }
    </button>
  );

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && (
        <div className="flex items-center gap-3 bg-red-500/8 border border-red-500/20 rounded-xl px-4 py-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p className="text-sm text-red-400">{state.error}</p>
        </div>
      )}

      {state?.success && (
        <div className="flex items-center gap-3 bg-emerald-400/8 border border-emerald-400/20 rounded-xl px-4 py-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <p className="text-sm text-emerald-400">Password changed successfully</p>
        </div>
      )}

      {[
        { label: "Current Password", name: "currentPassword", show: showCurrent, toggle: () => setShowCurrent(p => !p) },
        { label: "New Password", name: "newPassword", show: showNew, toggle: () => setShowNew(p => !p) },
      ].map((f) => (
        <div key={f.name} className="space-y-1.5">
          <label className="block text-[0.72rem] text-slate-400 tracking-wide uppercase">{f.label}</label>
          <div className="flex items-center gap-2 bg-white/3 border border-white/8 rounded-xl px-3.5 py-3 focus-within:border-cyan-400/40 focus-within:shadow-[0_0_0_3px_rgba(0,212,255,0.06)] transition-all">
            <input name={f.name} type={f.show ? "text" : "password"} placeholder="••••••••" required
              className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none" />
            <EyeBtn show={f.show} toggle={f.toggle} />
          </div>
        </div>
      ))}

      <button type="submit" disabled={pending}
        className="w-full flex items-center justify-center gap-2 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 text-[#040d1a] font-semibold text-sm rounded-xl py-3 transition-all cursor-pointer shadow-[0_4px_20px_rgba(0,212,255,0.25)]">
        {pending && <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
        {pending ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}