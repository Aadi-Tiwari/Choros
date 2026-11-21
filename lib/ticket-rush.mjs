export function ticketRush({ total, opensAt, onUpdate, timeoutMs = 120000 }) {
  let arrived = 0, ready = 0, release;
  const barrier = new Promise((r) => { release = r; });
  const timeout = setTimeout(() => release(), timeoutMs);
  const beforeVisit = async ({ page, persona, record, update }) => {
    let failure;
    const act = async (action, selector, text) => {
      const loc = page.locator(selector);
      const name = await loc.evaluate((el) => el.labels?.[0]?.textContent.trim() || el.getAttribute('aria-label') || el.textContent.trim());
      const step = { n: record.steps.length + 1, at: Date.now(), action, target: { selector, name, kind: action === "type" ? "field" : "button" }, network: [] };
      const start = record.network.length;
      if (text !== undefined) { step.text = text; if (selector === "#password") step.secretField = true; await loc.fill(text); }
      else await loc.click();
      await page.waitForTimeout(100);
      step.network = record.network.slice(start).map(({ method, path, status }) => ({ method, path, status }));
      record.steps.push(step);
    };
    try {
      await page.goto(record.baseUrl);
      await act("click", "#account");
      await act("click", "#toggle-auth");
      await act("type", "#name", persona.account.name);
      await act("type", "#email", persona.account.email);
      await act("type", "#password", persona.account.password);
      await act("click", "#auth-submit");
      await page.locator("#auth").waitFor({ state: "hidden", timeout: 15000 });
      record.steps.at(-1).network = record.network.filter((n) => n.method === "POST" && n.path === "/api/signup").map(({method,path,status}) => ({method,path,status}));
      record.readyAt = Date.now();
      update({ current: "Signed in; waiting for the sale", status: "ready" });
      ready++;
    } catch (e) { failure = e; }
    arrived++;
    onUpdate?.({ ready, attempted: arrived, total, opensAt, phase: arrived === total ? "countdown" : "signing_in" });
    if (arrived === total) release();
    await barrier;
    if (failure) throw failure;
    const wait = Math.max(0, opensAt - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    record.releasedAt = Date.now();
    update({ current: "Sale open; choosing live", status: "running" });
  };
  return { beforeVisit, close: () => { clearTimeout(timeout); release(); } };
}
