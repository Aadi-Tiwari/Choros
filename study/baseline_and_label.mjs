// 1) Baseline: Claude guesses taxpayer complaints about IRS.gov without browsing.
// 2) Labels every complaint point (persona runs + baseline) with the same theme prompt used for real reviews.
import { readFile, writeFile } from "node:fs/promises";
import { chooseJSON, usageCost } from "../lib/llm.mjs";

const runs = process.argv.slice(2);
const themes = JSON.parse(await readFile("themes.json", "utf8"));
const keys = Object.keys(themes);

const baseline = await chooseJSON(
  "You are estimating how ordinary US taxpayers would react to the IRS.gov website, without visiting it.",
  "Imagine 10 different taxpayers (varied age, tech comfort, English fluency and goals such as refund status, forms, payment plans, contacting a person, identity verification, credits). For each, give up to 4 short complaints or praises they would likely have after using IRS.gov.",
  { maxTokens: 4096, schema: { type: "object", properties: { users: { type: "array", items: { type: "object", properties: { name: { type: "string" }, points: { type: "array", items: { type: "object", properties: { kind: { type: "string", enum: ["confusing", "frustrating", "missing", "liked"] }, text: { type: "string" } }, required: ["kind", "text"], additionalProperties: false } } }, required: ["name", "points"], additionalProperties: false } } }, required: ["users"], additionalProperties: false } });

const points = [];
for (const u of baseline.users) for (const p of u.points) points.push({ source: "baseline", user: u.name, kind: p.kind, text: p.text, grounded: null });
for (const id of runs) {
  const state = JSON.parse(await readFile(`../web/.choros-runs/${id}/state.json`, "utf8"));
  for (const u of state.users) for (const p of u.reflection?.points || []) points.push({ source: id.slice(0, 8), user: u.name, kind: p.kind, text: p.text, grounded: p.grounded, step: p.step });
}
const complaints = points.filter((p) => p.kind !== "liked");
const schema = { type: "object", properties: { labels: { type: "array", items: { type: "object", properties: { i: { type: "integer" }, theme: { type: "string", enum: keys } }, required: ["i", "theme"], additionalProperties: false } } }, required: ["labels"], additionalProperties: false };
const answer = await chooseJSON(
  `Label each complaint with the single theme that best describes it. Themes:\n${keys.map((k) => `- ${k}: ${themes[k]}`).join("\n")}\nUse "other" only when nothing else fits.`,
  complaints.map((p, i) => `i: ${i}\n${p.text}`).join("\n\n"), { schema, maxTokens: 4096, timeoutMs: 120_000 });
for (const { i, theme } of answer.labels) if (complaints[i]) complaints[i].theme = theme;
await writeFile("data/persona_and_baseline_points.json", JSON.stringify(points, null, 1));
console.log(`points: ${points.length} (complaints ${complaints.length}); by source:`, Object.fromEntries([...new Set(points.map((p) => p.source))].map((s) => [s, points.filter((p) => p.source === s).length])), `cost $${usageCost().toFixed(3)}`);
