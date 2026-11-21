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
        <h2 className="text-lg font-medium">Sources and verification</h2>
        <h3 className="mt-4 text-sm font-medium text-zinc-200">Where the data came from</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>Real complaints: public reviews of IRS2Go on the App Store (<a className="text-orange-100 underline underline-offset-4" href="https://apps.apple.com/us/app/irs2go/id414113282" target="_blank" rel="noreferrer">apps.apple.com/us/app/irs2go/id414113282</a>), downloaded from Apple&apos;s public customer review feed (itunes.apple.com/us/rss/customerreviews/id=414113282, 10 pages of 50, most recent first) on November 21, 2026.</li>
          <li>Website tested: <a className="text-orange-100 underline underline-offset-4" href="https://www.irs.gov/" target="_blank" rel="noreferrer">www.irs.gov</a>, visited live by the personas on November 21, 2026 in read-only mode.</li>
          <li>Theme labels for reviews, persona complaints and the baseline: Claude Sonnet 5.5, using one fixed list of 8 themes for all three.</li>
        </ul>
        <h3 className="mt-5 text-sm font-medium text-zinc-200">How the results were checked</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>Every persona complaint was read by hand. {results.persona_complaints_excluded_as_tool_artifacts} came from the testing tool (clicks that timed out, IRS.gov&apos;s bot protection) and were removed before scoring.</li>
          <li>Each persona complaint must name the step it is about. Steps that never happened are flagged; {pct(results.persona_points_grounded)} of complaints pointed to a real recorded step.</li>
          <li>Two separate runs with the same request, to see whether results repeat ({pct(results.stability_jaccard)} theme overlap).</li>
          <li>A baseline that guesses without browsing, so the personas have to beat something.</li>
          <li>The first run lost 5 of 10 personas when connections to the AI dropped. Retries were added and the second run finished with all 10. Both runs are included.</li>
        </ul>
        <h3 className="mt-5 text-sm font-medium text-zinc-200">Where to find the work</h3>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-400">
          <li>Code and data are in the project repository under <code className="text-zinc-300">study/</code>: <code className="text-zinc-300">fetch_reviews.py</code> (download), <code className="text-zinc-300">label.mjs</code> (theme labels), <code className="text-zinc-300">baseline_and_label.mjs</code> (baseline), <code className="text-zinc-300">analyze.py</code> (scores and chart), <code className="text-zinc-300">data/</code> (raw and labeled reviews, persona complaints) and <code className="text-zinc-300">out/results.json</code>.</li>
          <li>Persona runs: bb6143ad and 8a341f74. Their screenshots, steps and reactions are in the dashboard&apos;s run history.</li>
          <li>Total model cost for the study: about $0.41.</li>
        </ul>
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
