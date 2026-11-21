import { NextRequest, NextResponse } from "next/server"
import { validateSimulation } from "@/lib/simulation"
import { listRuns, startRun } from "@/lib/server/runs"
export const runtime = "nodejs"
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "Request origin refused." }, { status: 403 })
  if (Number(request.headers.get("content-length")) > 120000) return NextResponse.json({ error: "The brief is too large." }, { status: 413 })
  try {
    const body = await request.json()
    const setup = validateSimulation(body)
    const id = await startRun(setup, typeof body.replayOf === "string" ? body.replayOf : undefined)
    return NextResponse.json({ id }, { status: 202 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the simulation." }, { status: 400 }) }
}

export async function GET() {
  return NextResponse.json({ runs: await listRuns(), configured: Boolean(process.env.ANTHROPIC_API_KEY) }, { headers: { "Cache-Control": "no-store" } })
}
