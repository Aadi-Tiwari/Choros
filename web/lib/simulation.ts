export const NOTELY_DEMO_GOAL = "Test Notely with two users. Have each sign up and save a private note, then check that the other account cannot read it."
export const simulationKey = "choros-simulation"
export const modes = { reactions: "Hear reactions", explore: "Explore journeys", privacy: "Check privacy", audience: "Audience panel", replay: "Replay a journey" } as const
export type Simulation = { goal: string; url: string; mode: keyof typeof modes; audienceSize?: number; liveUsers?: number; demo?: "notely-privacy" }

export function validateSimulation(value: unknown): Simulation {
  if (!value || typeof value !== "object") throw new Error("Describe your app and add its URL to continue.")
  const item = value as Record<string, unknown>
  if (typeof item.goal !== "string" || !item.goal.trim()) throw new Error("Describe the journey you want to test.")
  if (item.goal.length > 100000) throw new Error("Keep your testing goal under 100 KB.")
  if (typeof item.mode !== "string" || !Object.hasOwn(modes, item.mode)) throw new Error("Choose a testing mode.")
  const audienceSize = Number(item.audienceSize ?? 20)
  const liveUsers = Number(item.liveUsers ?? 2)
  if (item.mode === "audience" && (!Number.isInteger(audienceSize) || audienceSize < 1 || audienceSize > 100 || !Number.isInteger(liveUsers) || liveUsers < 1 || liveUsers > 10 || liveUsers > audienceSize)) throw new Error("Choose 1 to 100 audience members and 1 to 10 live explorers, with at least one audience member per explorer.")
  if (item.demo && (item.demo !== "notely-privacy" || item.goal.trim() !== NOTELY_DEMO_GOAL || item.mode !== "privacy" || item.url)) throw new Error("Use the Notely demo button to run the registered private-note scenario.")
  const demo = item.demo === "notely-privacy" ? { demo: "notely-privacy" as const } : {}
  const audience = item.mode === "audience" ? { audienceSize, liveUsers } : {}
  if (!item.url) return { goal: item.goal.trim(), url: "", mode: item.mode as Simulation["mode"], ...audience, ...demo }
  let url: URL
  try { url = new URL(typeof item.url === "string" ? item.url.trim() : "") }
  catch { throw new Error("Add a complete app URL, such as https://example.com or http://localhost:3000.") }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP or HTTPS app URL without embedded credentials.")
  return { goal: item.goal.trim(), url: url.href, mode: item.mode as Simulation["mode"], ...audience, ...demo }
}
