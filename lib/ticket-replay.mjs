import { request } from "playwright";
import { startTarget } from "./target.mjs";
import { ticketSnapshot, ticketFindings } from "./ticket-checks.mjs";

// Shared-resource failures need the recorded writes to overlap. Sequential browser replay
// cannot establish that a race was repaired, so these findings use concurrent request replay.
export async function verifyTicketFinding({ target, appDir, port, records, finding }) {
  const app = await startTarget(target, appDir, port);
  const sessions = [];
  const checks = [];
  const attempts = [], accepted = [], errors = [];
  let active = 0, peak = 0;
  try {
    await Promise.all(records.map(async (record) => {
      const context = await request.newContext({ baseURL: app.url });
      sessions.push(context);
      for (const row of record.network.filter((r) => ["POST", "PUT", "PATCH", "DELETE"].includes(r.method))) {
        let data;
        try { data = JSON.parse(row.requestBody || "{}"); } catch { errors.push("Unparseable recorded request"); continue; }
        const buy = row.path === "/api/buy" && row.method === "POST";
        if (buy) { active++; peak = Math.max(peak, active); }
        let response;
        try { response = await context.fetch(row.path, { method: row.method, data, timeout: 15000 }); }
        catch { errors.push(`${row.method} ${row.path} did not complete`); }
        finally { if (buy) active--; }
        if (!response) continue;
        const status = response.status();
        if (status >= 500) errors.push(`${row.path} -> ${status}`);
        if (buy) {
          attempts.push({ user: record.id, status });
          if (status < 300) {
            const own = await context.get("/api/state").then((r) => r.json()).catch(() => null);
            const kept = own?.order && data.seats?.length === own.order.seats?.length && data.seats.every((s) => own.order.seats.includes(s));
            accepted.push({ user: record.id, kept: Boolean(kept), seats: data.seats });
          }
        }
      }
    }));
    const expected = records.reduce((n, r) => n + r.network.filter((row) => row.method === "POST" && row.path === "/api/buy").length, 0);
    checks.push({ name: "Every recorded purchase request was replayed", pass: attempts.length === expected && expected > 0, detail: `${attempts.length}/${expected} requests, peak ${peak} pending purchases` });
    checks.push({ name: "Normal purchases still create readable orders", pass: accepted.length > 0 && accepted.every((a) => a.kept), detail: `${accepted.filter((a) => a.kept).length}/${accepted.length} accepted purchases were readable with the requested seats` });
    checks.push({ name: "The replay has no server errors", pass: errors.length === 0, detail: errors.join("; ") || "No transport or server failures" });
    const snapshot = await ticketSnapshot(app.dataFile);
    const findings = await ticketFindings(app.dataFile, records);
    const same = findings.find((f) => f.signature === finding.signature);
    checks.push({ name: finding.expected, pass: !same, detail: JSON.stringify({ sold: snapshot.sold, duplicates: snapshot.duplicates, promoUses: snapshot.promoUses }) });
    const status = same ? "failing" : !expected || attempts.length !== expected ? "blocked" : checks.every((c) => c.pass) ? "fixed" : "failing";
    return { status, reproduced: Boolean(same), mode: "concurrent recorded HTTP requests, no model calls", contract: { status: status === "fixed" ? "passed" : status === "blocked" ? "blocked" : "failed", checks },
      blocked: [], otherFindings: findings.filter((f) => f.signature !== finding.signature).map((f) => f.title), replayedUsers: records.map((r) => r.name), steps: attempts.length,
      app: { url: app.url, pid: app.pid, dir: appDir } };
  } finally { await Promise.all(sessions.map((s) => s.dispose())); await app.stop(); }
}
