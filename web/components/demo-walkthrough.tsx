"use client"

import { Check, Fingerprint, Loader2, ShieldCheck } from "lucide-react"

const duration = 20000
const stages = [
  { title: "Meet two independent users", detail: "Ada and Ben each receive an isolated browser session and a private-note journey.", shot: "1", action: "Entering separate account details" },
  { title: "Create separate accounts", detail: "Each user signs up with their own credentials. Their sessions stay independent.", shot: "2", action: "Creating an independent account" },
  { title: "Save a private note", detail: "Both users write different notes, save them, and reopen their own content.", shot: "5", action: "Writing and saving a private note" },
  { title: "Check account separation", detail: "Recorded requests test owner access, cross-account access, and signed-out access.", shot: "demo", action: "Checking who can read each note" },
  { title: "Verify the evidence", detail: "The privacy failure was reproduced. Six access checks and the browser evidence are ready.", shot: "demo", action: "Organizing the confirmed results" },
]

export function DemoWalkthrough({ elapsed }: { elapsed: number }) {
  const stageIndex = Math.min(Math.floor(elapsed / 4000), stages.length - 1)
  const stage = stages[stageIndex]
  if (elapsed >= duration) return <section aria-label="Demo walkthrough complete" className="flex items-center gap-3 rounded-xl border border-orange-200/20 bg-orange-200/5 p-4 text-sm text-orange-100"><Check className="size-5 shrink-0" /><p>Walkthrough complete. Your results are ready. Choose View results whenever you are ready.</p></section>
  return <section aria-label="Recorded demo walkthrough" className="space-y-5 rounded-2xl border border-orange-200/15 bg-[#0b0b0a]/90 p-5">
    <div className="space-y-5">
      <p className="text-[10px] uppercase tracking-[.2em] text-orange-200/60">Recorded demo walkthrough</p>
      <section aria-label="Demo progress" className="space-y-5">
        <div className="flex items-center justify-between text-xs text-zinc-400"><span>Notely / Two users / Privacy</span><span data-testid="demo-countdown">Results in {Math.ceil((duration - elapsed) / 1000)}s</span></div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-orange-200 transition-[width] duration-100 motion-reduce:transition-none" style={{ width: `${elapsed / duration * 100}%` }} /></div>
        <div className="grid gap-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div aria-live="polite" aria-atomic="true"><p className="mb-2 text-[10px] uppercase tracking-[.25em] text-orange-200/60">Step {stageIndex + 1} of {stages.length}</p><h1 className="text-xl font-light tracking-tight sm:text-2xl">{stage.title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">{stage.detail}</p></div>
          <ShieldCheck className="hidden size-10 text-orange-200/60 sm:block" />
        </div>
      </section>
      <section aria-label="Recorded browser sessions" className="grid gap-5 md:grid-cols-2">
        {["Ada", "Ben"].map((name, index) => <article key={name} className="overflow-hidden rounded-2xl border border-white/10 bg-[#111211]/95 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full border border-orange-200/20 bg-orange-200/10 text-sm text-orange-100">{name[0]}</span><div><h2 className="text-sm font-medium">{name}</h2><p className="text-[10px] text-zinc-500">Isolated browser {index + 1}</p></div></div><span className="flex items-center gap-2 text-xs text-orange-100/70"><Loader2 className="size-3 animate-spin motion-reduce:animate-none" />{stageIndex < 3 ? "Journey" : "Verification"}</span></div>
          <div className="flex h-40 items-start justify-center overflow-hidden bg-[#eee] sm:h-52"><img key={stage.shot} src={`/demo-shots/user-${index + 1}-${stage.shot}.jpg`} alt={`${name}'s recorded browser: ${stage.action}`} className="h-full w-full object-contain object-top" /></div>
          <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3 text-xs text-zinc-400"><Fingerprint className="size-3.5 text-orange-200/60" />{stage.action}</div>
        </article>)}
      </section>
      <ol aria-label="Walkthrough steps" className="grid grid-cols-2 gap-2 sm:grid-cols-5">{["Two perspectives", "Separate accounts", "Private notes", "Access checks", "Verified evidence"].map((label, index) => <li key={label} aria-current={index === stageIndex ? "step" : undefined} className={`flex items-center gap-2 rounded-lg border px-3 py-3 text-[11px] ${index <= stageIndex ? "border-orange-200/20 bg-orange-200/5 text-orange-100" : "border-white/5 text-zinc-600"}`}><span className="flex size-4 shrink-0 items-center justify-center">{index < stageIndex ? <Check className="size-3.5" /> : index + 1}</span>{label}</li>)}</ol>
      <p className="text-center text-[11px] leading-relaxed text-zinc-500">Actual screenshots from a completed local browser test, presented as a 20-second walkthrough. Results become available after the walkthrough; open them when you choose.</p>
    </div>
  </section>
}
