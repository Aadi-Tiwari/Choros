import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";

const site = "http://127.0.0.1:3020";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  let id = process.argv[2];
  if (!id) {
  await page.goto(site + "/?new=1");
  await page.getByRole("combobox", { name: "Testing mode" }).click();
  await page.getByRole("option", { name: "Choros audience", exact: true }).click();
  await page.getByRole("textbox", { name: "Describe your app and testing goal" }).fill("Test SeatDrop with a fictional audience. The live explorer should use the already signed-in account, choose exactly one available seat, click Buy tickets on this disposable local demo, confirm that My order shows that seat, and stop. Do not use a promo or cancel any order.");
  await page.getByRole("spinbutton", { name: "Audience size", exact: true }).fill("101");
  await page.getByRole("spinbutton", { name: "Live explorers", exact: true }).fill("1");
  await page.getByRole("button", { name: "Start simulation", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Choose 1 to 100" }).waitFor();
  await page.locator("input[type=file]").setInputFiles({ name: "audience-brief.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ goal: "Test SeatDrop with a fictional audience. The live explorer should use the already signed-in account, choose exactly one available seat, click Buy tickets on this disposable local demo, confirm that My order shows that seat, and stop. Do not use a promo or cancel any order.", url: "", mode: "audience", audienceSize: 12, liveUsers: 1 })) });
  await page.waitForFunction(() => document.querySelector('[aria-label="Audience size"]')?.value === "12" && document.querySelector('[aria-label="Live explorers"]')?.value === "1");
  assert.equal(await page.getByRole("spinbutton", { name: "Audience size", exact: true }).inputValue(), "12");
  assert.equal(await page.getByRole("spinbutton", { name: "Live explorers", exact: true }).inputValue(), "1");
  await page.getByRole("button", { name: "Start simulation", exact: true }).click();
  await page.waitForURL(/\/dashboard\?run=/);
  id = new URL(page.url()).searchParams.get("run");
  console.log("PASS: Choros controls validate counts, import population settings, and start a real audience run. Run ID:", id);
  } else {
    await page.goto(`${site}/dashboard?run=${id}`);
  }
  let run;
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    run = await (await page.request.get(`${site}/api/simulations/${id}`)).json();
    if (["completed", "failed"].includes(run.status)) break;
    await new Promise(ok => setTimeout(ok, 1000));
  }
  assert.equal(run.status, "completed", run.error || "Ticket run did not finish.");
  assert.equal(run.audience.generated, 12);
  assert.equal(run.audience.live, 1);
  assert.equal(run.audience.members.filter(person => person.selected).length, run.users.length);
  assert(run.users.every(user => user.source === "Choros" && user.personality.tendencies.length > 0 && user.personality.priorities.length > 0));
  assert.equal(run.tickets.sold, 1, "The browser did not commit the requested fictional ticket order.");
  assert.equal(run.tickets.orders, 1);
  assert.equal(run.tickets.capacity, run.tickets.seats.length);
  assert.equal(run.rush.ready, run.users.length);
  assert.equal(run.rush.phase, "finished");
  assert.equal(run.metrics.peakBrowsers, run.users.length);
  assert.equal(run.tickets.duplicates.length, 0);
  console.log("PASS: Choros traits drive the live browser, account barrier and sale finish, and the independent ledger confirms the requested ticket order.");
  await page.getByText("Independent ticket ledger", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Audience", exact: true }).click();
  await page.getByRole("textbox", { name: "Search audience" }).waitFor();
  const member = run.audience.members[0];
  await page.getByRole("button", { name: `Inspect profile ${member.id}`, exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("dialog").getByText(member.personality.mood, { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "Search audience" }).fill("no_matching_fictional_person");
  await page.getByText("No matching audience members.").waitFor();
  await page.getByRole("textbox", { name: "Search audience" }).fill("");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export evidence", exact: true }).click();
  const stream = await (await download).createReadStream();
  let json = ""; for await (const chunk of stream) json += chunk;
  const exported = JSON.parse(json);
  assert.equal(exported.audience.members.length, run.audience.generated);
  assert.equal(exported.tickets.sold, run.tickets.sold);
  assert(!/gsk_[A-Za-z0-9]+/.test(json));
  await page.screenshot({ path: "audience-audience-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: "audience-audience-mobile.png", fullPage: true });
  await page.getByRole("tab", { name: "Overview", exact: true }).click();
  await page.getByText("Independent ticket ledger", { exact: true }).waitFor();
  await page.screenshot({ path: "audience-ticket-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "audience-ticket-desktop.png", fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(".choros-runs/audience-audit.json", JSON.stringify({ id, audience: run.audience.generated, live: run.users.length, sold: run.tickets.sold, orders: run.tickets.orders, profileUi: true, export: true, mobile: true, browserErrors: errors }, null, 2));
  console.log("PASS: audience profiles, profile search, evidence export, ticket dashboard, mobile layout, and no browser errors.");
} finally { await browser.close(); }
