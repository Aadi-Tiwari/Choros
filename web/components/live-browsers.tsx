"use client"

import { Fingerprint, Loader2 } from "lucide-react"

type BrowserUser = { id: string; name: string; group?: string; status: string; current: string; steps: number; lastShot: string | null; reflection?: { summary: string } | null }

// One card per persona with its latest real screenshot, refreshed as the run's state is polled.
export function LiveBrowsers({ runId, users, live }: { runId: string; users: BrowserUser[]; live: boolean }) {
  if (!users.length) return null
  return <section aria-label={live ? "Live browser sessions" : "Recorded browser sessions"} className="space-y-4 rounded-2xl border border-orange-200/15 bg-[#0b0b0a]/90 p-5">
    <div className="flex items-center justify-between">
      <p className="text-[10px] uppercase tracking-[.2em] text-orange-200/60">{live ? "Live browsers" : "Recorded browsers"}</p>
      <span className="text-xs text-zinc-500">{users.length} isolated {users.length === 1 ? "browser" : "browsers"}</span>
    </div>
    <div className={`grid gap-4 ${users.length > 2 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2"}`}>
      {users.map((user, index) => {
        const running = live && ["running", "ready", "waiting"].includes(user.status)
        const file = user.lastShot?.split("/").pop()
        return <article key={user.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111211]/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-orange-200/20 bg-orange-200/10 text-sm text-orange-100">{user.name.slice(0, 1)}</span>
              <div className="min-w-0"><h2 className="truncate text-sm font-medium">{user.name}</h2><p className="truncate text-[10px] text-zinc-500">{user.group || `Isolated browser ${index + 1}`}</p></div>
            </div>
            <span className="flex shrink-0 items-center gap-2 text-xs text-orange-100/70">{running && <Loader2 className="size-3 animate-spin motion-reduce:animate-none" />}{user.steps} steps</span>
          </div>
          <div className="flex h-40 items-start justify-center overflow-hidden bg-[#eee] sm:h-52">
            {file ? <img key={file} src={`/api/simulations/${runId}/shots/${file}`} alt={`${user.name}'s browser: ${user.current}`} className="h-full w-full object-contain object-top" />
              : <p className="self-center text-xs text-zinc-500">{running ? "Opening the site..." : "No screenshot recorded"}</p>}
          </div>
          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-zinc-400"><Fingerprint className="size-3.5 shrink-0 text-orange-200/60" /><span className="line-clamp-2">{!running && user.reflection?.summary ? `“${user.reflection.summary}”` : user.current}</span></div>
        </article>
      })}
    </div>
  </section>
}
