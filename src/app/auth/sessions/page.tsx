import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, getSessions, revokeSessionAction } from "../action/auth";

export default async function SessionsPage() {
  const [user, sessions] = await Promise.all([getCurrentUser(), getSessions()]);
  if (!user) redirect("/auth/login");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-[0.65rem] text-slate-600 tracking-[0.15em] uppercase">Security</span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/auth/profile"
            className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] rounded-lg transition-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Active Sessions</h1>
            <p className="text-sm text-slate-500">{sessions.length} active session{sessions.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      {/* Sessions list */}
      {sessions.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-slate-600 mx-auto">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <p className="text-slate-600 text-sm">No active sessions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session: any, i: number) => {
            const isCurrentDevice = i === 0; // first is usually current
            const createdAt = session.created_at
              ? new Date(session.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Unknown";

            return (
              <div key={session._id ?? session.id ?? i}
                className={`flex items-start gap-4 bg-white/[0.03] border rounded-xl p-4 ${isCurrentDevice ? "border-cyan-400/20" : "border-white/[0.07]"}`}>
                {/* Device icon */}
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${isCurrentDevice ? "bg-cyan-400/10 text-cyan-400" : "bg-white/[0.04] text-slate-500"}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-200 truncate">
                      {session.userAgent?.split(" ")[0] ?? `Session ${i + 1}`}
                    </p>
                    {isCurrentDevice && (
                      <span className="flex items-center gap-1 bg-cyan-400/10 border border-cyan-400/20 text-cyan-400 px-2 py-0.5 rounded-full text-[0.6rem]">
                        <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse"/>
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {session.ip && (
                      <span className="text-[0.65rem] text-slate-600 font-mono">{session.ip}</span>
                    )}
                    <span className="text-[0.65rem] text-slate-600">{createdAt}</span>
                  </div>
                </div>

                {/* Revoke button */}
                {!isCurrentDevice && (
                  <form action={async (data) => { await revokeSessionAction(data); }}>
                    <input type="hidden" name="sessionId" value={session._id ?? session.id} />
                    <button type="submit" className="text-[0.68rem] text-red-400 hover:text-red-300 bg-red-500/8 hover:bg-red-500/15 border border-red-500/15 hover:border-red-500/25 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap">
                        Revoke
                    </button>
                    </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <p className="text-center text-[0.7rem] text-slate-600 leading-relaxed">
        If you see a session you don&apos;t recognize,{" "}
        <Link href="/auth/change-password" className="text-cyan-400 hover:text-cyan-300">
          change your password
        </Link>{" "}
        immediately.
      </p>
    </div>
  );
}