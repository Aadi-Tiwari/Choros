// Labels each real complaint (1 to 3 stars) with one theme from themes.json using Claude Sonnet.
// These labels train and test the small classifier in classify.py.
import { readFile, writeFile } from "node:fs/promises";
import { chooseJSON, USAGE, usageCost } from "../lib/llm.mjs";

const themes = JSON.parse(await readFile("themes.json", "utf8"));
const reviews = JSON.parse(await readFile("data/irs2go_reviews.json", "utf8")).filter((r) => r.rating <= 3);
const keys = Object.keys(themes);
const schema = { type: "object", properties: { labels: { type: "array", items: { type: "object", properties: { id: { type: "string" }, theme: { type: "string", enum: keys } }, required: ["id", "theme"], additionalProperties: false } } }, required: ["labels"], additionalProperties: false };
const system = `Label each app review with the single theme that best describes its main complaint. Themes:\n${keys.map((k) => `- ${k}: ${themes[k]}`).join("\n")}\nUse "other" only when nothing else fits. Return one label per review id.`;

const batches = [];
for (let i = 0; i < reviews.length; i += 25) batches.push(reviews.slice(i, i + 25));
const labeled = new Map();
let next = 0;
async function worker() {
  while (next < batches.length) {
    const batch = batches[next++];
    const input = batch.map((r) => `id: ${r.id}\n${r.title}. ${r.text}`.slice(0, 1200)).join("\n\n");
    const answer = await chooseJSON(system, input, { schema, maxTokens: 4096, timeoutMs: 120_000 });
    for (const { id, theme } of answer.labels) if (batch.some((r) => r.id === id)) labeled.set(id, theme);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
const rows = reviews.filter((r) => labeled.has(r.id)).map((r) => ({ ...r, theme: labeled.get(r.id) }));
await writeFile("data/labeled_reviews.json", JSON.stringify(rows, null, 1));
const counts = Object.fromEntries(keys.map((k) => [k, rows.filter((r) => r.theme === k).length]));
console.log(`labeled ${rows.length} of ${reviews.length} complaints`, counts, `cost $${usageCost().toFixed(3)} in ${USAGE.calls} calls`);
