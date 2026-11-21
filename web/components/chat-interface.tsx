"use client"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Play, Link, Folder, ArrowUp, Zap, Loader2 } from "lucide-react"
import { PulsingBorder } from "@paper-design/shaders-react"
import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { NOTELY_DEMO_GOAL, simulationKey, validateSimulation } from "@/lib/simulation"

export function ChatInterface() {
  const [isFocused, setIsFocused] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState("reactions")
  const [audienceSize, setAudienceSize] = useState(20)
  const [liveUsers, setLiveUsers] = useState(2)
  const [notice, setNotice] = useState("")
  const [appUrl, setAppUrl] = useState("")
  const [showUrl, setShowUrl] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [demoState, setDemoState] = useState<"idle" | "preparing" | "ready">("idle")
  const preparedDemo = useRef<Promise<string> | null>(null)
  const router = useRouter()
  const urlInput = useRef<HTMLInputElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).has("new")) { sessionStorage.removeItem(simulationKey); window.history.replaceState(null, "", "/"); return }
      const saved = sessionStorage.getItem(simulationKey)
      if (!saved) return
      const draft = validateSimulation(JSON.parse(saved))
      setPrompt(draft.goal)
      setAppUrl(draft.url)
      setMode(draft.mode)
      setAudienceSize(draft.audienceSize ?? 20)
      setLiveUsers(draft.liveUsers ?? 2)
      setShowUrl(Boolean(draft.url))
    } catch { /* A new session starts with an empty composer. */ }
  }, [])

  function startNotelyDemo() {
    if (submitting || demoState === "preparing") return
    setPrompt(NOTELY_DEMO_GOAL); setMode("privacy"); setAppUrl(""); setShowUrl(false); setNotice(""); setDemoState("preparing")
    input.current?.focus()
    const prepare = async () => {
      const response = await fetch("/api/simulations", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ goal:NOTELY_DEMO_GOAL, url:"", mode:"privacy", demo:"notely-privacy" }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not prepare the demo.")
      const deadline = Date.now() + 60000
      while (Date.now() < deadline) {
        const response = await fetch(`/api/simulations/${result.id}`, { cache:"no-store" })
        if (!response.ok) throw new Error("Could not load the demo results.")
        const run = await response.json()
        if (run.status === "completed") return result.id as string
        if (run.status === "failed") throw new Error(run.error || "The demo did not finish.")
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      throw new Error("The demo took longer than expected. Please try again.")
    }
    const pending = prepare()
    preparedDemo.current = pending
    void pending.then(() => setDemoState("ready")).catch(error => { setDemoState("idle"); setNotice(error instanceof Error ? error.message : "Could not prepare the demo.") })
  }

  async function continueSimulation() {
    if (submitting || importing) return
    try {
      const draft = validateSimulation({ goal: prompt, url: appUrl || prompt.match(/https?:\/\/[^\s<>]+/)?.[0] || "", mode, audienceSize, liveUsers })
      sessionStorage.setItem(simulationKey, JSON.stringify(draft))
      setNotice("")
      setSubmitting(true)
      if (preparedDemo.current && prompt.trim() === NOTELY_DEMO_GOAL && mode === "privacy" && !appUrl.trim()) {
        const id = await preparedDemo.current
        sessionStorage.setItem("choros-last-run", id)
        router.push(`/dashboard?run=${id}&demo=1`)
        return
      }
      const response = await fetch("/api/simulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, replayOf: sessionStorage.getItem("choros-last-run") }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Could not start the simulation.")
      sessionStorage.setItem("choros-last-run", result.id)
      router.push(`/dashboard?run=${result.id}`)
    } catch (error) {
      setSubmitting(false)
      setNotice(error instanceof Error ? error.message : "Could not start the simulation. Please try again.")
      if (!appUrl.trim()) { setShowUrl(true); requestAnimationFrame(() => urlInput.current?.focus()) }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 py-20 overflow-x-clip">
      <div className="w-full max-w-4xl relative -translate-y-7 sm:-translate-y-11">
        <header className="relative z-10 mb-8 px-2 text-center">
          <h1 aria-label="CHOROS" className="choros-wordmark">
            {"CHOROS".split("").map((letter, index) => (
              <span aria-hidden="true" key={index} className="choros-letter" style={{ animationDelay: `${index * 80}ms` }}>
                <span className="choros-letter-fill">{letter}</span>
              </span>
            ))}
          </h1>
          <h2 className="choros-intro mt-4 text-2xl sm:text-4xl font-light tracking-tight text-white">Hear from your audience before launch.</h2>
          <p className="choros-intro mx-auto mt-4 max-w-lg text-sm sm:text-base leading-relaxed text-zinc-300">Describe your site and who it is for. Fictional personas use it in a real browser, then tell you what confused them, what was missing and whether they would come back.</p>
        </header>
        <p className="relative z-10 mb-3 px-2 text-sm text-orange-100/70">Who is your site for, and what should they try?</p>

        <div className="relative -top-2">
          <motion.div
            className="pointer-events-none absolute w-full h-full z-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: isFocused ? 1 : 0.65 }}
            transition={{
              duration: 0.8, 
            }}
          >
            <PulsingBorder
              style={{ height: "146.5%", minWidth: "143%" }}
              colorBack="hsla(0, 0%, 0%, 0)"
              roundness={0.18}
              thickness={0}
              softness={0}
              intensity={0.3}
              bloom={2}
              spots={2}
              spotSize={0.25}
              pulse={0}
              smoke={0.35}
              smokeSize={0.4}
              scale={0.7}
              rotation={0}
              offsetX={0}
              offsetY={0}
              speed={1}
              colors={[
                "hsl(29, 70%, 37%)",
                "hsl(32, 100%, 83%)",
                "hsl(4, 32%, 30%)",
                "hsl(25, 60%, 50%)",
                "hsl(0, 100%, 10%)",
              ]}
            />
          </motion.div>

          <motion.div
            className="relative bg-[#040404] rounded-2xl p-4 z-10"
            animate={{
              borderColor: isFocused ? "#BA9465" : "#3D3D3D",
            }}
            transition={{
              duration: 0.6,
              delay: 0.1,
            }}
            style={{
              borderWidth: "1px",
              borderStyle: "solid",
            }}
          >
            {/* Message Input */}
            <div className="relative mb-6">
              <Textarea
                ref={input}
                aria-label="Describe your site and its audience"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    continueSimulation()
                  }
                }}
                placeholder="Describe your site, who uses it and what they come to do..."
                className="min-h-[80px] resize-none bg-transparent border-none text-white text-base placeholder:text-zinc-500 focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none [&:focus]:ring-0 [&:focus]:outline-none [&:focus-visible]:ring-0 [&:focus-visible]:outline-none"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
              />
            </div>

            {showUrl && <div id="app-url-field" className="mb-4 px-2">
              <label htmlFor="app-url" className="mb-2 block text-xs text-orange-100/70">Site address</label>
              <input id="app-url" ref={urlInput} type="url" value={appUrl} onChange={(event) => setAppUrl(event.target.value)} placeholder="https://example.com or http://localhost:3000" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-200" />
              <p className="mt-2 text-[11px] text-zinc-500">Public websites run browse-only: personas read, follow links and search. Nothing is submitted, signed up for or bought.</p>
            </div>}
            {mode === "audience" && <div className="mb-4 grid grid-cols-2 gap-3 px-2">
              <label className="text-xs text-orange-100/70">Audience size<input aria-label="Audience size" type="number" min={1} max={100} value={audienceSize} onChange={event => setAudienceSize(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-200" /></label>
              <label className="text-xs text-orange-100/70">Live explorers<input aria-label="Live explorers" type="number" min={1} max={10} value={liveUsers} onChange={event => setLiveUsers(Number(event.target.value))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-orange-200" /></label>
              <p className="col-span-2 text-[11px] text-zinc-500">Choros generates a fictional audience. A representative from each group explores in a real browser.</p>
            </div>}
            {prompt.trim() === NOTELY_DEMO_GOAL && demoState !== "idle" && <p role="status" className="mb-3 px-2 text-xs text-orange-100/60">{demoState === "ready" ? "Demo results ready. Press Enter to open." : "Preparing your demo. Press Enter when ready."}</p>}
            {notice && <p role="alert" className="mb-4 px-2 text-sm text-orange-200">{notice}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Left side icons */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-100 hover:text-white p-0"
                  aria-label="Run one-click demo"
                  title="Paste the demo prompt, then press Enter"
                  disabled={submitting || importing}
                  onClick={startNotelyDemo}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-0"
                  aria-label="Add an app URL"
                  title="Add an app URL"
                  aria-expanded={showUrl}
                  aria-controls="app-url-field"
                  onClick={() => { setShowUrl(true); requestAnimationFrame(() => urlInput.current?.focus()) }}
                >
                  <Link className="h-4 w-4" />
                </Button>
                {/* Center model selector */}
                <div className="flex items-center">
                  <Select value={mode} onValueChange={setMode}>
                    <SelectTrigger aria-label="Testing mode" className="bg-zinc-900 border-[#3D3D3D] text-white hover:bg-zinc-700 text-xs rounded-full px-2 h-8 min-w-[150px]">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3 w-3" aria-hidden="true" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="bg-zinc-900 z-30 border-[#3D3D3D] rounded-xl">
                      <SelectItem value="reactions" className="text-white hover:bg-zinc-700 rounded-lg">Hear reactions</SelectItem>
                      <SelectItem value="explore" className="text-white hover:bg-zinc-700 rounded-lg">
                        Explore journeys
                      </SelectItem>
                      <SelectItem value="privacy" className="text-white hover:bg-zinc-700 rounded-lg">
                        Check privacy
                      </SelectItem>
                      <SelectItem value="audience" className="text-white hover:bg-zinc-700 rounded-lg">Audience panel</SelectItem>
                      <SelectItem value="replay" className="text-white hover:bg-zinc-700 rounded-lg">
                        Replay a journey
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Right side icons */}
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white p-0"
                  aria-label="Import a text brief"
                  title="Import a text brief"
                  onClick={() => fileInput.current?.click()}
                >
                  <Folder className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 rounded-full bg-orange-200 hover:bg-orange-300 text-orange-800 p-0"
                  aria-label={submitting ? "Starting simulation" : "Start simulation"}
                  title={submitting ? "Starting simulation..." : "Start simulation"}
                  disabled={!prompt.trim() || submitting || importing}
                  onClick={() => void continueSimulation()}
                >
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
        <input ref={fileInput} type="file" accept=".txt,.md,.json" className="hidden" aria-label="Import a text brief" onChange={async (event) => {
          const field = event.currentTarget
          const file = field.files?.[0]
          if (!file) return
          setNotice("")
          if (file.size > 100000) { setNotice("Choose a brief smaller than 100 KB."); field.value = ""; return }
          if (!/\.(txt|md|json)$/i.test(file.name)) { setNotice("Choose a TXT, Markdown, or JSON brief."); field.value = ""; return }
          setImporting(true)
          try {
            const text = await file.text()
            if (!text.trim()) throw new Error("That brief is empty. Choose another file.")
            if (file.name.toLowerCase().endsWith(".json")) {
              const draft = validateSimulation(JSON.parse(text))
              setPrompt(draft.goal); setAppUrl(draft.url); setMode(draft.mode); setAudienceSize(draft.audienceSize ?? 20); setLiveUsers(draft.liveUsers ?? 2); setShowUrl(Boolean(draft.url))
            } else setPrompt(text)
            input.current?.focus()
          } catch (error) { setNotice(error instanceof Error ? error.message : "Could not read that brief.") }
          finally { field.value = ""; setImporting(false) }
        }} />
      </div>
    </div>
  )
}
