// Claude is the only inference provider. Credentials stay in the environment or existing local configuration.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
try {
  for (const line of readFileSync(join(here, "..", ".env"), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env: Ollama only */ }

export const PROVIDER = "anthropic";
export const MODEL = process.env.CHOROS_MODEL || "claude-opus-5-5";
// Click-by-click browser decisions can use a cheaper model than planning and written feedback.
export const ACTION_MODEL = process.env.CHOROS_ACTION_MODEL || MODEL;
export const MODEL_LABEL = ACTION_MODEL === MODEL ? `${MODEL} (Anthropic)` : `${MODEL}, ${ACTION_MODEL} for browser actions (Anthropic)`;
// Haiku 5.5 price applies to prompts up to 100K tokens; Choros prompts stay far below that.
const PRICES = { "claude-opus-5-5": { input: 4, output: 20 }, "claude-sonnet-5-5": { input: 2, output: 10 }, "claude-haiku-5-5": { input: 0.1, output: 0.5 } };

// Pulls the first JSON object out of a reply, in case a hosted model wraps it in prose or a code fence.
function parseJSON(text) {
  const raw = String(text || "").trim();
  try { return JSON.parse(raw); } catch { /* fall through */ }
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error("The model did not return JSON");
}

// Prices per million tokens, verified against the official Claude pricing table.
export const USAGE = { calls: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 };
export const usageCost = () => USAGE.costUSD;

// Plain explanations for the API failures a user can act on. Never includes the key or the raw response.
function apiError(error) {
  const status = error?.status;
  if (status === 401) return new Error("Anthropic rejected the API key: it is invalid or has been revoked. Create a new key in the Anthropic Console, put it in Choros's .env as ANTHROPIC_API_KEY, then restart the website.");
  if (status === 403) return new Error("This Anthropic key is not allowed to use this model. Check the key's workspace permissions.");
  if (status === 429) return new Error("Anthropic's rate limit was reached. Wait a minute and try again, or run fewer personas.");
  if (status === 529 || status === 503) return new Error("Anthropic is overloaded right now. Try again in a few minutes.");
  return new Error(`Anthropic request failed${status ? ` (${status})` : " or timed out"}`);
}

let anthropicClient = null;
let clientPromise = null;
let reservedUSD = 0;
let uncertainUSD = 0;
export const budgetUsage = () => ({ ...USAGE, estimatedUSD: usageCost(), reservedUSD, uncertainUSD, limitUSD: Number(process.env.CHOROS_BUDGET_USD || 5) });
async function anthropic(model, system, user, signal, maxTokens, schema) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  // Hard spending stop for this process (CHOROS_BUDGET_USD, default $5): no more calls once it is reached.
  const budget = Number(process.env.CHOROS_BUDGET_USD || 5);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 100) throw new Error("CHOROS_BUDGET_USD must be between 0 and 100");
  const price = PRICES[model];
  if (!price) throw new Error(`A priced model is required for the spending cap (${model} has no price)`);
  if (usageCost() + reservedUSD + uncertainUSD >= budget) throw new Error(`Spending limit of $${budget} reached`);
  if (!anthropicClient) {
    clientPromise ||= import("@anthropic-ai/sdk").then(({ default: Anthropic }) => new Anthropic({ maxRetries: 2 }));
    anthropicClient = await clientPromise;
  }
  const params = {
    model,
    max_tokens: maxTokens,
    output_config: { effort: process.env.CHOROS_EFFORT || "low", ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    system: `${system}\nReply with a single JSON object and nothing else.`,
    messages: [{ role: "user", content: user }],
  };
  // Reserve the worst case before sending, without a separate token-count request (one fewer round trip
  // per call). One token per character is an upper bound: real text averages about four characters a token.
  // The actual cost is recorded from the response usage below.
  const inputUpperBound = params.system.length + user.length + JSON.stringify(params.output_config).length;
  const reservation = ((inputUpperBound + 256) * price.input + maxTokens * price.output) / 1e6;
  if (usageCost() + reservedUSD + uncertainUSD + reservation > budget) throw new Error(`Spending limit of $${budget} reached (including pending calls)`);
  reservedUSD += reservation;
  let response;
  try {
    response = await anthropicClient.messages.create(params, { signal });
  } catch (error) {
    // A transport failure can hide a billed response, so its reservation stays spent.
    if (!error.status || error.status >= 500) uncertainUSD += reservation;
    throw apiError(error);
  } finally { reservedUSD -= reservation; }
  USAGE.calls++;
  const inputTokens = response.usage?.input_tokens || 0, outputTokens = response.usage?.output_tokens || 0;
  USAGE.inputTokens += inputTokens;
  USAGE.outputTokens += outputTokens;
  USAGE.costUSD += (inputTokens * price.input + outputTokens * price.output) / 1e6;
  if (response.stop_reason === "max_tokens") throw new Error("Claude reached the response token limit. Try a shorter request.");
  if (response.stop_reason === "refusal") throw new Error("The model declined this step");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return parseJSON(text);
}

export async function chooseJSON(system, user, { timeoutMs = 60_000, maxTokens = 2048, schema, model = MODEL } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    if (process.env.CHOROS_PROVIDER && process.env.CHOROS_PROVIDER !== "anthropic") throw new Error("Choros uses Anthropic only. Set CHOROS_PROVIDER=anthropic.");
    return await anthropic(model, system, user, controller.signal, maxTokens, schema);
  } finally {
    clearTimeout(timer);
  }
}
