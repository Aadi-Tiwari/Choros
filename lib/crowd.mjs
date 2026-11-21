// Runs a group of AI users against a fresh copy of the app under test, then checks for findings.
import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { startTarget } from "./target.mjs";
import { runUser } from "./agent.mjs";
import { findIssues } from "./checks.mjs";
import { summarizeFeedback } from "../features/reflection.mjs";
import { ticketSnapshot, ticketFindings } from "./ticket-checks.mjs";
import { ticketRush } from "./ticket-rush.mjs";
import { budgetUsage } from "./llm.mjs";

export async function runCrowd({ target, appDir = target.appDir, port, personas = target.users, runDir, headed = true, onUpdate, log = () => {}, remember = true, reflect = true }) {
  if (!personas?.length) throw new Error("At least one user is required");
  await mkdir(runDir, { recursive: true });
  const opensAt = Date.now() + (personas.length > 10 ? 45000 : 12000);
  const runTarget = target.ticketRush ? { ...target, extraEnv: { ...target.extraEnv, SALE_OPENS_AT: new Date(opensAt).toISOString() } } : target;
  const app = await startTarget(runTarget, appDir, port);
  log(`Started a fresh copy of ${target.name} at ${app.url}`);
  const browser = await chromium.launch({ headless: !headed });
  const stats = { activeDecisions: 0, peakDecisions: 0, activeBrowsers: 0, peakBrowsers: 0, activeBuys: 0, peakOverlappingBuys: 0, buyRequests: 0, firstBuyAt: null, lastBuyAt: null };
  const metrics = { decisionStart() { stats.activeDecisions++; stats.peakDecisions = Math.max(stats.peakDecisions, stats.activeDecisions); }, decisionEnd() { stats.activeDecisions--; },
    buyStart() { stats.activeBuys++; stats.peakOverlappingBuys = Math.max(stats.peakOverlappingBuys, stats.activeBuys); }, buyEnd() { stats.activeBuys--; } };
  const rush = target.ticketRush ? ticketRush({ total: personas.length, opensAt, onUpdate: (rush) => onUpdate?.({ type: "rush", rush }) }) : null;
  const snapshots = [];
  let sampling = false;
  const sample = async () => {
    if (sampling || !target.ticketRush) return;
    sampling = true;
    try { const snapshot = await ticketSnapshot(app.dataFile); snapshots.push(snapshot); onUpdate?.({ type: "tickets", tickets: snapshot }); } catch { /* no orders file yet */ }
    finally { sampling = false; }
  };
  const monitor = setInterval(() => { sample(); onUpdate?.({ type: "metrics", metrics: { ...stats, budget: budgetUsage() } }); }, 1000);
  try {
    const users = await Promise.all(personas.map((persona, i) =>
      new Promise((r) => setTimeout(r, i * (rush ? 15 : 400))).then(async () => {
        stats.activeBrowsers++; stats.peakBrowsers = Math.max(stats.peakBrowsers, stats.activeBrowsers);
        try { return await runUser({ browser, baseUrl: app.url, persona, target, runDir, remember, reflect, metrics,
          beforeVisit: rush?.beforeVisit, maxSteps: target.maxSteps || 24,
          onUpdate: (rec) => onUpdate?.({ type: "user", user: summarize(rec) }) }); }
        finally { stats.activeBrowsers--; }
      })));
    log("All users finished. Checking what they recorded.");
    const findings = await findIssues(users, { target });
    stats.verifiedSessions = users.filter((u) => u.session?.ok && u.session?.checked).length;
    const records = users.map((u) => u.record);
    if (target.ticketRush) {
      stats.saleOpenedAt = opensAt;
      stats.signedInBeforeSale = records.filter((r) => r.readyAt && r.readyAt <= opensAt).length;
      const releases = records.map((r) => r.releasedAt).filter(Boolean);
      stats.releaseSpreadMs = releases.length ? Math.max(...releases) - Math.min(...releases) : null;
    }
    if (target.ticketRush) findings.push(...await ticketFindings(app.dataFile, records));
    const buys = records.flatMap((r) => r.network).filter((r) => r.method === "POST" && r.path === "/api/buy");
    stats.buyRequests = buys.length;
    stats.acceptedBuys = buys.filter((r) => r.status < 300).length;
    stats.rejectedBuys = buys.filter((r) => r.status >= 400 && r.status < 500).length;
    stats.failedUsers = records.filter((r) => r.status === "failed").length;
    stats.modelStoppedUsers = records.filter((r) => r.goalStatus === "model_stopped").length;
    stats.firstBuyAt = buys.length ? Math.min(...buys.map((r) => r.at)) : null;
    stats.lastBuyAt = buys.length ? Math.max(...buys.map((r) => r.at)) : null;
    stats.buySpreadMs = buys.length ? stats.lastBuyAt - stats.firstBuyAt : null;
    stats.peakBuyRequestsInOneSecond = Math.max(0, ...buys.map((r) => buys.filter((b) => b.at >= r.at && b.at < r.at + 1000).length));
    stats.budget = budgetUsage();
    await sample();
    await writeFile(join(runDir, "metrics.json"), JSON.stringify(stats, null, 2));
    if (target.ticketRush) await writeFile(join(runDir, "tickets.json"), JSON.stringify(snapshots, null, 2));
    // UX feedback from each AI user: opinions, kept apart from confirmed bugs.
    const feedback = summarizeFeedback(records.map((r) => r.reflection));
    feedback.byUser = records.filter((r) => r.reflection).map((r) => r.reflection);
    feedback.saidGoalMet = feedback.goalMet;
    feedback.modelStopped = records.filter((r) => r.goalStatus === "model_stopped").length;
    feedback.goalMet = null;
    feedback.users = records.length;
    feedback.stuck = records.filter((r) => r.goalStatus === "blocked").length;
    await writeFile(join(runDir, "recording.json"), JSON.stringify({ target: target.id, url: app.url, personas, records }, null, 2));
    await writeFile(join(runDir, "findings.json"), JSON.stringify(findings, null, 2));
    await writeFile(join(runDir, "feedback.json"), JSON.stringify(feedback, null, 2));
    return { records, findings, feedback, metrics: stats, tickets: snapshots.at(-1) || null };
  } finally {
    clearInterval(monitor); rush?.close();
    await browser.close().catch(() => {});
    await app.stop();
  }
}

export function summarize(rec) {
  return {
    id: rec.id, name: rec.name, group: rec.group, goal: rec.goal, status: rec.status, goalStatus: rec.goalStatus, current: rec.current, lastShot: rec.lastShot,
    viewport: rec.viewport, steps: rec.steps.length, requests: rec.network.length, rejected: rec.rejected || 0,
    errors: rec.network.filter((n) => n.status >= 500).length + rec.pageErrors.length,
    rememberedVisits: rec.rememberedVisits || 0, reflection: rec.reflection || null,
    memory: rec.memory.slice(-6),
  };
}
