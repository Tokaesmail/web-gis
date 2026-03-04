import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, logoutAction, logoutAllAction } from "../action/auth";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const initials = (user.username ?? user.email ?? "?")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-[0.65rem] text-slate-600 tracking-[0.15em] uppercase">Your Account</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
        <h1 className="text-2xl font-semibold text-slate-100">Profile</h1>
        <p className="text-sm text-slate-500">Your GeoSense AI account details</p>
      </div>

      {/* Avatar + info */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-cyan-400/15 border border-cyan-400/20 flex items-center justify-center text-lg font-bold text-cyan-400">
            {initials}
          </div>
          <div>
            <p className="text-base font-medium text-slate-100">{user.username}</p>
            <p className="text-sm text-slate-500">{user.email}</p>
          </div>
          {/* Verified badge */}
          <div className={`ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.65rem] font-medium border ${user.is_verified ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400" : "bg-yellow-400/10 border-yellow-400/20 text-yellow-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${user.is_verified ? "bg-emerald-400" : "bg-yellow-400"}`} />
            {user.is_verified ? "Verified" : "Unverified"}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.06]">
          {[
            { label: "User ID", value: user.id?.slice(0, 8) + "..." },
            { label: "Status", value: user.is_active ? "Active" : "Inactive" },
            { label: "Member since", value: new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
            { label: "Role", value: user.role ?? "User" },
          ].map((d) => (
            <div key={d.label} className="bg-white/[0.02] rounded-xl p-3">
              <p className="text-[0.62rem] text-slate-600 uppercase tracking-wide">{d.label}</p>
              <p className="text-sm text-slate-300 mt-0.5 font-mono">{d.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="space-y-2">
        <p className="text-[0.65rem] text-slate-600 uppercase tracking-wider px-1">Account</p>
        {[
          { href: "/auth/change-password", label: "Change Password", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, color: "text-cyan-400" },
          { href: "/auth/sessions", label: "Active Sessions", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>, color: "text-violet-400" },
          { href: "/map", label: "Go to Map", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/></svg>, color: "text-emerald-400" },
        ].map((item) => (
          <Link key={item.href} href={item.href}
            className="flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] rounded-xl px-4 py-3 transition-all group">
            <span className={item.color}>{item.icon}</span>
            <span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">{item.label}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto text-slate-600 group-hover:text-slate-400 transition-colors"><polyline points="9 18 15 12 9 6"/></svg>
          </Link>
        ))}
      </div>

      {/* Logout buttons */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <form action={logoutAction}>
          <button type="submit"
            className="w-full flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl py-2.5 text-sm text-slate-400 hover:text-slate-200 transition-all cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Sign Out
          </button>
        </form>
        <form action={logoutAllAction}>
          <button type="submit"
            className="w-full flex items-center justify-center gap-2 bg-red-500/8 hover:bg-red-500/15 border border-red-500/15 hover:border-red-500/30 rounded-xl py-2.5 text-sm text-red-400 hover:text-red-300 transition-all cursor-pointer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            All Devices
          </button>
        </form>
      </div>
    </div>
  );
}