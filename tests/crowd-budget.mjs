import assert from "node:assert/strict";
import { createServer } from "node:http";

let sent = 0, active = 0, peak = 0, counted = 0;
const server = createServer(async (req, res) => {
  for await (const chunk of req) { /* consume the SDK request */ }
  res.setHeader("content-type", "application/json");
  if (req.url === "/v1/messages/count_tokens") { counted++; return res.end(JSON.stringify({ input_tokens: 100 })); }
  sent++; active++; peak = Math.max(peak, active);
  await new Promise((r) => setTimeout(r, 100));
  active--;
  res.end(JSON.stringify({ id:"test", type:"message", role:"assistant", model:"claude-opus-5-5", stop_reason:"end_turn", content:[{type:"text",text:'{"action":"done"}'}], usage:{input_tokens:100,output_tokens:10} }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
process.env.CHOROS_PROVIDER = "anthropic";
process.env.CHOROS_BUDGET_USD = "0.05";
process.env.ANTHROPIC_API_KEY = "local-test-placeholder";
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${server.address().port}`;
try {
  const { chooseJSON, budgetUsage } = await import("../lib/llm.mjs");
  const results = await Promise.allSettled(Array.from({length:20}, () => chooseJSON("Return JSON", "Local test")));
  assert.equal(sent, 1, "Concurrent callers must reserve their maximum output before sending");
  assert.equal(counted, 0, "No separate token-count request is made before a call");
  assert.equal(peak, 1);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => /pending calls/.test(r.reason.message)));
  assert.ok(budgetUsage().estimatedUSD <= budgetUsage().limitUSD);
  assert.ok(Math.abs(budgetUsage().reservedUSD) < 1e-10);
  console.log("PASS concurrent spending reservations: one affordable call sent, nineteen blocked, no external API calls");
} finally { server.close(); }
