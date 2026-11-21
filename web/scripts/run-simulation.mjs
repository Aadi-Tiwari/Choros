import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { chromium, request as browserRequest } from "playwright";
import { expandAudience } from "./audience.mjs";
import { engineRoot } from "./engine.mjs";
import { demoUsers, notelyVisit, privacyChecks } from "./notely-demo.mjs";

const [id] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/.test(id || "")) process.exit(1);
const root = resolve(".choros-runs");
const dir = join(root, id);
const request = JSON.parse(await readFile(join(dir, "request.json"), "utf8"));
const engine = engineRoot();
const load = (file) => import(pathToFileURL(join(engine, "lib", file)).href);
const loadFeature = (file) => import(pathToFileURL(join(engine, "features", file)).href);
process.env.CHOROS_PROVIDER = "anthropic";
process.env.CHOROS_MODEL = process.env.CHOROS_MODEL || "claude-sonnet-5-5";
process.env.CHOROS_ACTION_MODEL = process.env.CHOROS_ACTION_MODEL || "claude-haiku-5-5";
const state = { id, provider: "anthropic", model: process.env.CHOROS_MODEL, actionModel: process.env.CHOROS_ACTION_MODEL, pid: process.pid, status: "planning", startedAt: Date.now(), request, plan: null, users: [], findings: [], log: [], history: [], audience: null, feedback: null, tickets: null, rush: null, metrics: { activeBrowsers: 0, peakBrowsers: 0, activeBuys: 0, peakBuys: 0, activeDecisions: 0, peakDecisions: 0 }, error: null };
let queue = Promise.resolve();
let getBudget = () => null;
function save() {
  state.budget = getBudget();
  const snapshot = JSON.stringify(state);
  queue = queue.then(async () => { await writeFile(join(dir, "state.tmp"), snapshot); await rename(join(dir, "state.tmp"), join(dir, "state.json")); });
  return queue;
}
function log(message) { state.log.push({ at: Date.now(), message }); void save(); }
let app, browser, rush, monitor;
const watchdog = setTimeout(() => { state.status = "failed"; state.error = "The run reached its six-minute limit. Partial evidence is available."; void (async () => { clearInterval(monitor); rush?.close(); if (browser) await browser.close().catch(() => {}); if (app) await app.stop().catch(() => {}); state.finishedAt = Date.now(); await save(); await unlink(join(root, "active.json")).catch(() => {}); process.exit(1); })(); }, 360000);

async function port() {
  const server = createServer();
  await new Promise((ok, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", ok); });
  const selected = server.address().port;
  await new Promise(ok => server.close(ok));
  return selected;
}
function isLocalUrl(raw) {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(raw).hostname); } catch { return false; }
}
function localUrl(raw) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("Use a local test app URL, such as http://localhost:3000. Hosted targets are not enabled in this local build.");
  return url.href;
}
function publicUser(record) {
  return { id: record.id, name: record.name, group: record.group, personality: record.personality || null, source: record.personality ? "Choros" : null, goal: record.goal, status: record.status, goalStatus: record.goalStatus || null, current: record.current || "Opening app", steps: record.steps.length, lastShot: record.lastShot || null, reflection: record.reflection || null, errors: record.pageErrors.length + record.network.filter(r => r.status >= 500).length };
}
try {
  await save();
  if (!process.env.ANTHROPIC_API_KEY && request.mode !== "replay" && !request.demo) throw new Error("Anthropic is not configured on this server. Start it with the local credential launcher.");
  const { chooseJSON, budgetUsage } = await load("llm.mjs");
  getBudget = budgetUsage;
  const { loadTarget } = await load("config.mjs");
  // Public websites run browse-only. Check the address before any model call is spent on planning.
  let publicSite = Boolean(request.url) && !isLocalUrl(request.url);
  let publicUrl = "";
  if (publicSite) {
    if (request.mode === "privacy") throw new Error("Privacy checks need test accounts, so they only run on local apps. Choose Hear reactions or Explore journeys for a public website.");
    const { checkPublicUrl } = await load("browse-only.mjs");
    publicUrl = await checkPublicUrl(request.url);
  }
  const supported = ["notely", "notely-healthy", "ledgerly", "promptbuilt", "seatdrop", "seatdrop-planted"];
  if (request.mode === "replay") {
    if (!/^[0-9a-f-]{36}$/.test(request.replayOf || "")) throw new Error("Run an exploration first, then choose Replay a journey.");
    const source = JSON.parse(await readFile(join(root, request.replayOf, "recording.json"), "utf8"));
    if (!source.targetId || !supported.includes(source.targetId)) throw new Error("Replay currently requires a managed demo target. Choose Explore journeys for a local app URL.");
    const target = await loadTarget(source.targetId);
    target.offline = true;
    const { replayJourneys } = await load("replay.mjs");
    state.status = "running";
    state.plan = { title: "Replay recorded journeys", target: target.name, targetId: source.targetId, url: "", summary: "Repeating the previous browser actions without model calls.", users: source.records.map(r => ({ name: r.name, goal: r.goal })) };
    log("Replaying the last run on a fresh copy. No model calls.");
    const replay = await replayJourneys({ target, appDir: target.appDir, port: await port(), records: source.records, headed: false });
    browser = replay.browser;
    app = replay.app;
    state.audience = source.audience || null;
    state.metrics.peakBrowsers = replay.users.length;
    state.users = replay.users.map(u => publicUser({ ...u.record, group: u.source.group, personality: u.source.personality, status: "finished", goalStatus: replay.blocked.some(b => b.user === u.record.name) ? "blocked" : "replayed", current: replay.blocked.some(b => b.user === u.record.name) ? "Replay could not reach one or more actions" : "Recorded actions replayed" }));
    state.replay = { blocked: replay.blocked, actions: replay.users.reduce((sum, u) => sum + u.record.steps.length, 0) };
    const { findIssues } = await load("checks.mjs");
    state.findings = await findIssues(replay.users, { target });
    if (target.ticketRush) {
      const { ticketSnapshot, ticketFindings } = await load("ticket-checks.mjs");
      state.tickets = await ticketSnapshot(app.dataFile);
      state.findings.push(...await ticketFindings(app.dataFile, replay.users.map(u => u.record)));
    }
    await writeFile(join(dir, "recording.json"), JSON.stringify({ targetId: source.targetId, audience: source.audience || null, records: replay.users.map(u => ({ ...u.record, group: u.source.group, personality: u.source.personality })) }));
    state.status = "completed";
    log("Replay completed. Inspect the replay evidence below.");
  } else {
    let plan;
    if (request.demo === "notely-privacy") {
      plan = { title:"Notely private-note demo", summary:"Two real browser sessions create separate accounts and private notes. Scripted actions keep this preset fast; access checks use live responses.", targetId:"notely", clarification:"", users:demoUsers, execution:"scripted" };
      log("Starting the fast scripted Notely demo. No model calls are needed for this registered journey.");
    } else {
    log("Understanding your request with Claude.");
    const fields = { title: { type: "string" }, summary: { type: "string" }, targetId: { type: "string", enum: request.url ? ["external"] : [...supported, "external", "unknown"] }, clarification: { type: "string" }, siteUrl: { type: "string" }, users: { type: "array", items: { type: "object", properties: { name: { type: "string" }, about: { type: "string" }, goal: { type: "string" }, mobile: { type: "boolean" }, segment: { type: "string" }, habits: { type: "array", items: { type: "string" } }, priorities: { type: "array", items: { type: "string" } }, constraints: { type: "array", items: { type: "string" } }, beliefs: { type: "array", items: { type: "string" } } }, required: ["name", "about", "goal", "mobile", "segment", "habits", "priorities", "constraints", "beliefs"], additionalProperties: false } } };
    plan = await chooseJSON(
      `Plan web-app testing from the user's request. Return a concise title and summary, a targetId, and 1 to 10 realistic fictional users (use 2 to 4 unless the user asks for more) with concrete browser goals. Use only the user's app and task, never invent capabilities or substitute a different app. Supported demos: notely (notes with planted bugs), notely-healthy (healthy notes), ledgerly (expenses), promptbuilt (Pantry Share), seatdrop and seatdrop-planted (ticket app). The user URL field is authoritative: when nonempty, choose external and do not ask for the app name or URL again. You do not need to inspect the page to plan the concrete user goal. When the URL field is empty and the user names a real, well-known public website or online service, choose external and put its official homepage address in siteUrl (for example https://www.irs.gov/ for the IRS website). Only do this for a site you are certain exists; never guess an address for an unfamiliar, private or local app. Otherwise leave siteUrl empty. If no site or supported demo is identifiable, choose unknown and ask in clarification which website to test. If requested users exceed ten, ask for up to ten live explorers; do not silently reduce the request. Otherwise clarification is empty. When publicSite is true, or when you return a siteUrl, the site is a live public website in browse-only mode: goals may only involve reading, navigating, comparing and searching, never signing up, logging in, buying, posting, contacting anyone or submitting forms. Reactions mode is audience research: make each user an ordinary visitor the site is meant for, with a goal that person would really have, phrased in their own terms, and make the users differ in background and patience so their reactions differ. Privacy mode needs at least two distinct users with private content and account separation. Each user must include a segment label, and short arrays of habits, priorities, constraints and beliefs. These become Choros personality profiles, not predictions of real people. Keep each goal under 400 characters. In audience mode, generate exactly the requested liveUsers profiles; audienceSize is the separate fictional population, not the browser count. SeatDrop accounts are signed in by the runner before the sale: their goals should start with choosing a seat, not account creation. Do not invent app URLs, passwords, source paths or commands. Never plan sending messages, emails, invitations, comments, purchases, actual payments, deletion, or publishing. Use only synthetic test content. For ticket demos only, free fictional ticket reservations are allowed. Goal completion must be observed, not assumed. Copy the user's quoted titles and field values exactly; never add sentence punctuation inside quoted content.`,
      JSON.stringify({ goal: request.goal, mode: request.mode, url: request.url || "", publicSite, audienceSize: request.audienceSize, liveUsers: request.liveUsers }),
      { maxTokens: 4096, schema: { type: "object", properties: fields, required: Object.keys(fields), additionalProperties: false } }
    );
    }
    if (!plan || typeof plan.title !== "string" || !Array.isArray(plan.users)) throw new Error("The test plan was incomplete. Please try again.");
    if (plan.clarification || plan.targetId === "unknown") throw new Error(plan.clarification || "Name the website to test, for example \"the IRS website\", or a demo such as Notely.");
    // The planner named the site from the description: verify it is a real public address, then browse only.
    if (!request.url && plan.targetId === "external") {
      if (!plan.siteUrl) throw new Error("Name the website to test, for example \"the IRS website\".");
      if (request.mode === "privacy") throw new Error("Privacy checks need test accounts, so they only run on local apps. Choose Hear reactions or Explore journeys for a public website.");
      const { checkPublicUrl } = await load("browse-only.mjs");
      publicUrl = await checkPublicUrl(plan.siteUrl);
      publicSite = true;
      log(`Choros identified the site as ${publicUrl} from your description.`);
    }
    if (!plan.users.length || plan.users.length > 10 || plan.users.some(u => typeof u.name !== "string" || typeof u.about !== "string" || typeof u.goal !== "string")) throw new Error("A run needs one to ten valid test users.");
    if (request.mode === "privacy" && plan.users.length < 2) throw new Error("Privacy checks require at least two independent test users. Please try again.");
    if (request.mode === "audience" && plan.users.length !== request.liveUsers) throw new Error("The plan did not match the requested live explorer count. Please try again.");
    log("Expanding personality profiles with the local Choros audience engine.");
    const { audience, personas } = await expandAudience({ engine, users: plan.users, count: request.mode === "audience" ? request.audienceSize : plan.users.length, runId: id });
    state.audience = audience;
    await writeFile(join(dir, "audience.json"), JSON.stringify(audience));
    log(`Choros generated ${audience.generated} fictional people; ${audience.live} representative users will explore live.`);
    let target, baseUrl;
    if (publicSite) {
      baseUrl = publicUrl;
      target = { id: "public-site", name: new URL(baseUrl).host, browseOnly: true, publicPaths: ["^/"], editable: [] };
      log(`${target.name} is a live public website, so this run is browse-only: page loads only, no sign-ups, log-ins, purchases or form submissions.`);
    } else if (request.url) {
      baseUrl = localUrl(request.url);
      target = { id: "chat-local", name: new URL(baseUrl).host, offline: true, publicPaths: ["^/"], editable: [] };
      plan.targetId = "external";
    } else {
      if (!supported.includes(plan.targetId)) throw new Error("Add your local app URL to run this test.");
      target = await loadTarget(plan.targetId);
      target.offline = true;
      const { startTarget } = await load("target.mjs");
      const opensAt = Date.now() + 12000;
      const isolatedTarget = target.ticketRush ? { ...target, extraEnv: { ...target.extraEnv, SALE_OPENS_AT: new Date(opensAt).toISOString() } } : target;
      app = await startTarget(isolatedTarget, target.appDir, await port());
      if (target.ticketRush) {
        const { ticketRush } = await load("ticket-rush.mjs");
        const { ticketSnapshot } = await load("ticket-checks.mjs");
        rush = ticketRush({ total: personas.length, opensAt, onUpdate(value) { state.rush = value; void save(); } });
        let sampling = false;
        monitor = setInterval(async () => {
          if (sampling) return;
          sampling = true;
          try { state.tickets = await ticketSnapshot(app.dataFile); void save(); } catch { /* The isolated ledger is not available before startup. */ }
          finally { sampling = false; }
        }, 1000);
        log("SeatDrop accounts will sign in before the coordinated sale opens. Only fictional ticket orders are used.");
      }
      baseUrl = app.url;
    }
    plan.target = target.name;
    plan.url = baseUrl;
    state.plan = plan;
    state.users = personas.map(u => ({ id: u.id, name: u.name, goal: u.goal, group: u.group, personality: u.personality, source: "Choros", status: "waiting", current: "Waiting to start", steps: 0, errors: 0, lastShot: null }));
    state.status = "running";
    log(`Starting ${personas.length} isolated browser users on ${target.name}.`);
    browser = await chromium.launch({ headless: true });
    const { runUser } = await load("agent.mjs");
    const { findIssues } = await load("checks.mjs");
    const { checkOutcomes } = await load("outcomes.mjs");
    const demoVisit = request.demo ? notelyVisit({ runDir:dir, target, checkOutcomes }) : undefined;
    const metrics = {
      decisionStart() { state.metrics.activeDecisions++; state.metrics.peakDecisions = Math.max(state.metrics.peakDecisions, state.metrics.activeDecisions); },
      decisionEnd() { state.metrics.activeDecisions = Math.max(0, state.metrics.activeDecisions - 1); },
      buyStart() { state.metrics.activeBuys++; state.metrics.peakBuys = Math.max(state.metrics.peakBuys, state.metrics.activeBuys); },
      buyEnd() { state.metrics.activeBuys = Math.max(0, state.metrics.activeBuys - 1); },
    };
    const users = await Promise.all(personas.map(async persona => {
      state.metrics.activeBrowsers++;
      state.metrics.peakBrowsers = Math.max(state.metrics.peakBrowsers, state.metrics.activeBrowsers);
      try {
        return await runUser({ browser, baseUrl, persona, target, runDir: dir, remember: false, reflect: !request.demo, maxSteps: request.demo ? 0 : target.maxSteps || 24, beforeVisit: demoVisit || rush?.beforeVisit, metrics,
          onUpdate(record) { const index = state.users.findIndex(u => u.id === record.id); state.users[index] = publicUser(record); state.history.push({ at: Date.now(), actions: state.users.reduce((sum, u) => sum + u.steps, 0), active: state.users.filter(u => ["running", "ready"].includes(u.status)).length, errors: state.users.reduce((sum, u) => sum + u.errors, 0) }); void save(); }
        });
      } finally { state.metrics.activeBrowsers--; }
    }));
    if (!request.demo) {
      const { summarizeFeedback } = await loadFeature("reflection.mjs");
      state.feedback = summarizeFeedback(users.map(u => u.record.reflection));
      state.users = state.users.map(u => ({ ...u, reflection: users.find(r => r.record.id === u.id)?.record.reflection || null }));
      log(`${state.feedback.users} personas shared their reactions.`);
    }
    state.status = "checking";
    log("Checking browser evidence and repeated failures.");
    state.findings = await findIssues(users, { target, probe: request.mode === "privacy" || plan.targetId !== "external" });
    if (request.demo) state.demoChecks = await privacyChecks(users, browserRequest);
    const records = users.map(u => u.record);
    if (target.ticketRush) {
      const { ticketSnapshot, ticketFindings } = await load("ticket-checks.mjs");
      state.tickets = await ticketSnapshot(app.dataFile);
      state.findings.push(...await ticketFindings(app.dataFile, records));
      state.rush = { ...state.rush, phase: "finished" };
    }
    await writeFile(join(dir, "recording.json"), JSON.stringify({ targetId: plan.targetId, audience, records }));
    state.status = users.every(u => u.record.status === "failed") ? "failed" : "completed";
    if (state.status === "failed") state.error = "Every explorer stopped before completing the visit. Inspect each user's last action.";
    log(`Run finished with ${records.reduce((sum, r) => sum + r.steps.length, 0)} recorded actions and ${state.findings.length} findings.`);
  }
} catch (error) {
  state.status = "failed";
  state.error = String(error.message || "The run failed.").replaceAll(process.env.ANTHROPIC_API_KEY || "__no_key__", "[redacted]").slice(0, 700);
  log(state.error);
} finally {
  clearTimeout(watchdog);
  clearInterval(monitor);
  rush?.close();
  if (browser) await browser.close().catch(() => {});
  if (app) await app.stop().catch(() => {});
  state.finishedAt = Date.now();
  await save();
  const lock = JSON.parse(await readFile(join(root, "active.json"), "utf8").catch(() => "null"));
  if (lock?.id === id) await unlink(join(root, "active.json")).catch(() => {});
}
