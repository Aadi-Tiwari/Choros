import { NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { runsRoot, validId } from "@/lib/server/runs"
export const runtime = "nodejs"
export async function GET(_request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params
  if (!validId(id) || !/^user-\d+-(?:\d+|demo)\.jpg$/.test(file)) return new NextResponse(null, { status: 404 })
  if (process.env.VERCEL) return NextResponse.redirect(new URL(`/demo-shots/${file}`, _request.url))
  try { return new NextResponse(await readFile(join(runsRoot, id, "shots", file)), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" } }) }
  catch { return new NextResponse(null, { status: 404 }) }
}
