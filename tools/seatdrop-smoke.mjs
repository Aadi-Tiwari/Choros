import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base = process.env.CHOROS_DASHBOARD || "http://127.0.0.1:4000";
await mkdir("runs/seatdrop-smoke", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => document.getElementById("audienceInfo").textContent.includes("100 fictional"));
  await page.screenshot({ path: "runs/seatdrop-smoke/dashboard-before.png", fullPage: true });
  if (errors.length) throw new Error(errors.join("; "));
  if (process.argv.includes("--run")) {
    await page.locator("#audienceCount").selectOption("10");
    await page.locator("#runHeadless").click();
    const deadline = Date.now() + 300000;
    while (true) {
      const current = await fetch(base + "/api/state").then((r) => r.json());
      if (!current.busy && ['done','failed'].includes(current.state?.phase)) break;
      if (Date.now() > deadline) throw new Error("Run did not finish within five minutes");
      await new Promise((r) => setTimeout(r, 1000));
    }
    const result = await page.request.get(base + "/api/state").then((r) => r.json());
    await writeFile("runs/seatdrop-smoke/result.json", JSON.stringify(result, null, 2));
    await page.screenshot({ path: "runs/seatdrop-smoke/dashboard-after.png", fullPage: true });
    console.log(JSON.stringify({ phase: result.state.phase, users: Object.values(result.state.users).map((u) => ({name:u.name,status:u.status,steps:u.steps,current:u.current})), tickets:result.state.tickets, metrics:result.state.metrics, findings:result.state.findings.map((f) => ({kind:f.kind,status:f.status,title:f.title})) }));
    if (result.state.phase !== "done" || errors.length) throw new Error("Live run or dashboard failed: " + errors.join("; "));
  }
  console.log("PASS dashboard loads without page errors");
} finally { await browser.close(); }
