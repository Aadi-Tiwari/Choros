import Link from "next/link"
import { PageBackground } from "@/components/page-background"
import results from "@/lib/study-results.json"

const labels: Record<string, string> = {
  refund_status: "Refund status",
  identity_verification: "Identity verification",
  errors_outages: "Errors and outages",
  navigation_findability: "Hard to find things",
  unclear_or_unhelpful_info: "Unclear or unhelpful info",
  contact_support: "Can't reach a person",
  slow_performance: "Slow",
  other: "Other",
}
const pct = (value: number | null | undefined) => `${Math.round((value ?? 0) * 100 + 1e-9)}%`
const panel = "rounded-2xl border border-white/10 bg-[#0b0b0a]/90 p-6 shadow-xl backdrop-blur-xl"

export const metadata = { title: "Choros | IRS.gov study" }

export default function StudyPage() {
  const real = results.real
  const personas = results.personas_all_runs
  const guess = results.baseline_no_browsing
  const realThemes = real.real_themes.length
  const themes = Object.keys(labels).filter(t => t !== "other" && t !== "slow_performance")
  return <div className="relative isolate min-h-screen text-zinc-100">
    <PageBackground />
    <main className="relative z-10 mx-auto max-w-5xl space-y-6 px-4 py-12 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="text-2xl font-semibold tracking-[.13em] text-orange-100">CHOROS<span className="ml-1 text-orange-300">.</span></Link>
        <Link href="/dashboard" className="rounded-full border border-orange-200/25 bg-orange-200/10 px-4 py-2 text-sm text-orange-100">Open the dashboard</Link>
      </div>

      <header className={panel}>
        <p className="mb-2 text-[10px] uppercase tracking-[.25em] text-orange-200/70">Study, November 21, 2026</p>
        <h1 className="text-3xl font-light tracking-tight sm:text-4xl">Do AI personas find the problems real users complain about?</h1>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-400">User testing with real people is slow and expensive, so small teams often launch without it. I compared what Choros personas reported after using IRS.gov with what real people complain about in reviews of IRS2Go, the official IRS app.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { value: `${Math.round(personas.recall * realThemes)} of ${realThemes}`, label: "real complaint themes the personas found", note: `No-browsing guess: ${Math.round(guess.recall * realThemes)} of ${realThemes}` },
          { value: pct(personas.precision), label: "of persona complaints matched a real theme", note: `No-browsing guess: ${pct(guess.precision)}` },
          { value: String(results.persona_complaints_excluded_as_tool_artifacts), label: "complaints removed as caused by the testing tool", note: "Click timeouts and the site's bot protection" },
        ].map(card => <div key={card.label} className={panel}><p className="text-4xl font-light text-orange-50">{card.value}</p><p className="mt-2 text-sm text-zinc-300">{card.label}</p><p className="mt-3 text-xs text-zinc-500">{card.note}</p></div>)}
      </section>

      <section className={panel}>
        <h2 className="text-lg font-medium">Data</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>500 public App Store reviews of IRS2Go (January 2021 to November 2026). I kept the {real.complaints} rated 1 to 3 stars.</li>
          <li>Each complaint was sorted into one of 8 fixed themes. The same themes were used for the personas and the baseline.</li>
          <li>Limits: people who write reviews are usually angrier than average users, and the reviews are about the app while the personas used the website.</li>
        </ul>
      </section>

      <section className={panel}>
        <h2 className="text-lg font-medium">Method</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>20 Choros personas (retirees, students, gig workers, recent immigrants and others) used IRS.gov in real browsers across 2 runs, read-only.</li>
          <li>Baseline: the same AI guessed what 10 taxpayers would complain about without visiting the site.</li>
          <li>Each persona complaint had to point to a recorded step. {pct(results.persona_points_grounded)} did.</li>
          <li>I read every persona complaint and removed {results.persona_complaints_excluded_as_tool_artifacts} caused by the tool itself before scoring.</li>
        </ul>
      </section>

      <section className={panel}>
        <h2 className="text-lg font-medium">Results by theme</h2>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500"><tr><th className="py-2 pr-4 font-normal">Theme</th><th className="py-2 pr-4 font-normal">Real reviews ({real.complaints})</th><th className="py-2 pr-4 font-normal">Choros personas ({personas.complaints})</th><th className="py-2 font-normal">No-browsing guess ({guess.complaints})</th></tr></thead>
            <tbody>{themes.map(t => <tr key={t} className="border-t border-white/5"><td className="py-2 pr-4 text-zinc-300">{labels[t]}</td><td className="py-2 pr-4 text-orange-100">{pct(real.share[t as keyof typeof real.share])}</td><td className="py-2 pr-4">{pct(personas.share[t as keyof typeof personas.share])}</td><td className="py-2">{pct(guess.share[t as keyof typeof guess.share])}</td></tr>)}</tbody>
          </table>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/study-themes-chart.png" alt="Share of complaints by theme for real reviews, Choros personas and the no-browsing guess" className="mt-6 w-full rounded-xl bg-white" />
      </section>

      <section className={panel}>
        <h2 className="text-lg font-medium">What it means</h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">In this test, browsing did not beat guessing. The personas found {Math.round(personas.recall * realThemes)} of {realThemes} real themes and the guess found {Math.round(guess.recall * realThemes)} of {realThemes}. The personas missed two real themes: refund status and reaching a person. They only browse, so they could not use the refund tracker or try to call or chat with the IRS, and refund status is one of the three biggest real complaints. The no-browsing guess missed errors and outages, the biggest real complaint. The personas also pointed more often to pages that were hard to find or unclear, which the reviews rarely mention.</p>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">The two runs shared {pct(results.stability_jaccard)} of their themes, so one run is not enough to trust a result.</p>
        <h3 className="mt-5 text-sm font-medium text-zinc-200">Next steps</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-400">
          <li>Compare against website feedback, so the data matches what the personas used.</li>
          <li>Let personas reach steps like the refund tracker on a safe test copy of a site.</li>
          <li>Test with a small group of real users to measure how close the personas get.</li>
        </ul>
      </section>
    </main>
  </div>
}
