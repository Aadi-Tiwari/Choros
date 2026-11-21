import { NextResponse } from "next/server"
import { readRun } from "@/lib/server/runs"
export const runtime = "nodejs"
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const state = await readRun((await context.params).id)
  return state ? NextResponse.json(state, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ error: "Run not found." }, { status: 404 })
}
