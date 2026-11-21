// Checks the browse-only rules for public websites without any model calls.
// Part 1 uses a local server (allowPrivate) so the server can count what actually reached it.
// Part 2 repeats the key checks against a real public site (example.com).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright";
import { checkPublicUrl, installBrowseOnly, isPrivateHost, sameSite } from "../lib/browse-only.mjs";

for (const host of ["localhost", "127.0.0.1", "10.0.0.139", "192.168.1.5", "172.20.0.1", "169.254.1.1", "[::1]", "printer.local"]) assert.ok(isPrivateHost(host), `${host} should be private`);
for (const host of ["example.com", "8.8.8.8", "172.32.0.1"]) assert.ok(!isPrivateHost(host), `${host} should be public`);
assert.ok(sameSite("https://docs.example.com/a", "https://www.example.com/"));
assert.ok(!sameSite("https://example.org/", "https://example.com/"));
assert.ok(!sameSite("https://notexample.com/", "https://example.com/"));
for (const raw of ["http://localhost:3000", "http://192.168.1.1/", "http://10.0.0.139/", "ftp://example.com/", "https://user:pw@example.com/"]) await assert.rejects(checkPublicUrl(raw), `${raw} should be rejected`);
console.log("PASS address rules: private, local and credentialed addresses rejected; subdomains count as the same site");

const received = [];
const server = createServer((req, res) => {
  received.push(`${req.method} ${req.url}`);
  if (req.url === "/pixel.svg") { res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'); }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(`<h1>Shop</h1><img id="pixel" src="http://localhost:${server.address().port}/pixel.svg"><form method="post" action="/signup"><input name="email"><button>Sign up</button></form>`);
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const record = {};
  await installBrowseOnly(context, base, record, { allowPrivate: true });
  const page = await context.newPage();
  await page.goto(base);
  assert.equal(await page.locator("h1").innerText(), "Shop");
  assert.ok(await page.locator("#pixel").evaluate((img) => img.complete && img.naturalWidth > 0), "an image from another host should still load");
  await page.fill("input[name=email]", "test@example.com");
  await page.click("button").catch(() => {});
  await page.waitForTimeout(500);
  const fetched = await page.evaluate(async () => { try { await fetch("/api/order", { method: "POST", body: "{}" }); return "sent"; } catch { return "blocked"; } });
  assert.equal(fetched, "blocked");
  await assert.rejects(page.goto(`http://localhost:${server.address().port}/elsewhere`), "leaving the site should be blocked");
  assert.ok(!received.some((r) => !r.startsWith("GET")), `only GET requests may reach the server, got: ${received.join(", ")}`);
  assert.ok(!received.includes("GET /elsewhere"), "the blocked navigation must not reach the server");
  assert.ok(record.blocked.some((b) => b.method === "POST" && b.url.includes("/signup")), "the form submission should be recorded as blocked");
  assert.ok(record.blocked.some((b) => b.reason === "outside the site being tested"));
  console.log(`PASS local control: page and cross-host image loaded; form POST, fetch POST and off-site navigation blocked; server saw only: ${[...new Set(received)].join(", ")}`);

  const live = await browser.newContext();
  const liveRecord = {};
  await installBrowseOnly(live, await checkPublicUrl("https://example.com/"), liveRecord);
  const livePage = await live.newPage();
  await livePage.goto("https://example.com/");
  assert.match(await livePage.title(), /Example Domain/);
  assert.equal(await livePage.evaluate(async () => { try { await fetch("/", { method: "POST", body: "x" }); return "sent"; } catch { return "blocked"; } }), "blocked");
  await assert.rejects(livePage.goto("https://www.iana.org/"));
  await assert.rejects(livePage.goto("http://127.0.0.1:9/"));
  console.log("PASS public site: example.com loaded; POST, off-site navigation and a local address were blocked");
} finally {
  await browser.close();
  server.close();
}
