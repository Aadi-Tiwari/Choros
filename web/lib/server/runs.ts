import "server-only"
import demoResults from "@/lib/demo-results.json"
import { mkdir, readFile, writeFile, open, unlink, readdir, rename } from "node:fs/promises"
import { resolve, join } from "node:path"
import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import type { Simulation } from "@/lib/simulation"

export const runsRoot = resolve(".choros-runs")
export const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id)
export async function readRun(id: string) {
  if (process.env.VERCEL) return id === demoResults.id ? demoResults : null
  if (!validId(id)) return null
  try {
    const file = join(runsRoot, id, "state.json")
    const run = JSON.parse(await readFile(file, "utf8"))
    if (["planning", "running", "checking"].includes(run.status)) {
      const lock = JSON.parse(await readFile(join(runsRoot, "active.json"), "utf8").catch(() => "null"))
      const pid = run.pid || (lock?.id === id ? lock.pid : null)
      if (pid) {
        try { process.kill(pid, 0) }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ESRCH") {
            run.status = "failed"
            run.error = "The browser worker stopped unexpectedly. Partial evidence is preserved; start a new simulation to try again."
            run.finishedAt = Date.now()
            run.users = (run.users || []).map((user: { status: string }) => ["waiting", "ready", "running"].includes(user.status) ? { ...user, status: "failed", current: "Browser worker disconnected" } : user)
            run.log = [...(run.log || []), { at: Date.now(), message: run.error }]
            const recovered = file + "." + randomUUID()
            await writeFile(recovered, JSON.stringify(run))
            await rename(recovered, file)
          }
        }
      }
    }
    return run
  } catch { return null }
}
export async function startRun(setup: Simulation, replayOf?: string) {
  if (process.env.VERCEL) {
    if (setup.demo || (setup.mode === "replay" && replayOf === demoResults.id)) return demoResults.id
    throw new Error("This hosted demo supports the Notely demo prompt. Click the play icon to paste it, then press Enter.")
  }
  if (!process.env.ANTHROPIC_API_KEY && setup.mode !== "replay" && !setup.demo) throw new Error("Anthropic is not configured. Start the server with the local credential launcher.")
  await mkdir(runsRoot, { recursive: true })
  const lockPath = join(runsRoot, "active.json")
  try {
    const active = JSON.parse(await readFile(lockPath, "utf8"))
    try { process.kill(active.pid, 0); throw new Error("Another simulation is running. Wait for it to finish.") }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error }
    await unlink(lockPath)
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error }
  const lock = await open(lockPath, "wx").catch(() => { throw new Error("Another simulation is starting. Please wait.") })
  const id = randomUUID()
  let child: ReturnType<typeof spawn> | undefined
  try {
    const dir = join(runsRoot, id)
    await mkdir(dir)
    const request = { ...setup, replayOf: replayOf || null }
    await writeFile(join(dir, "request.json"), JSON.stringify(request))
    await writeFile(join(dir, "state.json"), JSON.stringify({ id, status: "planning", request, startedAt: Date.now(), users: [], findings: [], log: [] }))
    child = spawn(process.execPath, [resolve("scripts/run-simulation.mjs"), id], { cwd: process.cwd(), env: { ...process.env, CHOROS_PROVIDER: "anthropic", CHOROS_MODEL: process.env.CHOROS_MODEL || "claude-sonnet-5-5", CHOROS_ACTION_MODEL: process.env.CHOROS_ACTION_MODEL || "claude-haiku-5-5" }, stdio: "ignore", windowsHide: true, detached: true })
    await new Promise<void>((ok, fail) => { child!.once("spawn", ok); child!.once("error", fail) })
    await lock.writeFile(JSON.stringify({ id, pid: child.pid }))
    child.unref()
    return id
  } catch (error) { child?.kill(); await unlink(lockPath).catch(() => {}); throw error }
  finally { await lock.close() }
}

export async function listRuns() {
  if (process.env.VERCEL) return [{ id: demoResults.id, status: demoResults.status, startedAt: demoResults.startedAt, finishedAt: demoResults.finishedAt, title: demoResults.plan.title, target: demoResults.plan.target, users: demoResults.users.length, actions: demoResults.users.reduce((sum, user) => sum + user.steps, 0), findings: demoResults.findings.length }]
  await mkdir(runsRoot, { recursive: true })
  const entries = await readdir(runsRoot)
  const runs = await Promise.all(entries.filter(validId).map(async id => {
    const run = await readRun(id)
    return run ? { id, status: run.status, startedAt: run.startedAt, finishedAt: run.finishedAt, title: run.plan?.title || "Interpreting request", target: run.plan?.target || "Pending", users: run.users?.length || 0, actions: (run.users || []).reduce((sum: number, user: { steps: number }) => sum + user.steps, 0), findings: run.findings?.filter((f: { status: string }) => f.status === "confirmed").length || 0 } : null
  }))
  return runs.filter(Boolean).sort((a, b) => b!.startedAt - a!.startedAt).slice(0, 50)
}
