import assert from "node:assert/strict";
import { join } from "node:path";

export const demoUsers = [
  { name: "Ada", segment: "Private notebook owners", about: "A fictional user saving a private note.", goal: "Create an account, save a private note, and open it again.", mobile: false, habits: ["I reopen what I saved."], priorities: ["Privacy"], constraints: ["Limited time"], beliefs: ["Only I should read my note."] },
  { name: "Ben", segment: "Independent notebook owners", about: "Another fictional user with an independent account.", goal: "Create a separate account, save a different private note, and open it again.", mobile: true, habits: ["I check that my note is kept."], priorities: ["Privacy"], constraints: ["Small screen"], beliefs: ["Other accounts should not see my note."] },
];

export function notelyVisit({ runDir, target, checkOutcomes }) {
  return async ({ page, context, persona, record, update }) => {
    const title = `${persona.name} private notebook`;
    const body = `Fictional private entry for ${persona.name}, account ${persona.account.name}.`;
    await page.goto(record.baseUrl);
    async function act(action, selector, text, expectedPath) {
      const started = record.network.length;
      const locator = page.locator(selector);
      const name = await locator.evaluate(element => element.labels?.[0]?.textContent.trim() || element.textContent.trim());
      const step = { n: record.steps.length + 1, at: Date.now(), action, target: { selector, name, kind: action === "type" ? "field" : "button" }, network: [] };
      if (text !== undefined) { step.text = text; if (selector === "#password") step.secretField = true; await locator.fill(text); }
      else {
        const response = expectedPath ? page.waitForResponse(response => new URL(response.url()).pathname === expectedPath && response.request().method() === "POST") : null;
        await locator.click();
        if (response) { const received = await response; assert(received.ok(), `${name} returned HTTP ${received.status()}`); await received.finished(); }
      }
      step.network = record.network.slice(started).map(({method,path,status})=>({method,path,status}));
      step.outcomes = await checkOutcomes({ target, record, rows: record.network.slice(started), request: context.request, baseUrl: record.baseUrl, step: step.n });
      await page.screenshot({ path: join(runDir, `shots/${persona.id}-${step.n}.jpg`), type:"jpeg", quality:70 });
      record.steps.push(step);
      update({ current: action === "type" ? `Filling ${name}` : name });
    }
    await act("type", "#name", persona.account.name);
    await act("type", "#password", persona.account.password);
    await act("click", "#signup", undefined, "/api/signup");
    await page.locator("#title").waitFor();
    await act("type", "#title", title);
    await act("type", "#body", body);
    await act("click", "#create", undefined, "/api/notes");
    const link = page.getByRole("link", { name: title, exact: true });
    await link.waitFor();
    const href = await link.getAttribute("href");
    const path = href.replace("#/note/", "/api/notes/");
    const read = page.waitForResponse(response => new URL(response.url()).pathname === path && response.request().method() === "GET");
    const at = Date.now();
    await link.click();
    const response = await read;
    assert(response.ok(), "The owner could not reopen the saved note.");
    const note = await response.json();
    assert.equal(note.body, body, "Saved content did not survive an independent read.");
    record.demoNote = { path, title, body };
    const step = { n: record.steps.length + 1, at, action: "click", target: { kind: "link", name: title, href }, network: [{ method:"GET", path, status:response.status() }], shot: `shots/${persona.id}-demo.jpg` };
    await page.screenshot({ path: join(runDir, step.shot), type:"jpeg", quality:70 });
    record.steps.push(step);
    record.goalStatus = "scenario_completed";
    update({ lastShot:step.shot, current:"Private note saved and reopened; checking account separation" });
  };
}

export async function privacyChecks(users, request) {
  const results = [];
  const anonymous = await request.newContext();
  try {
    for (const owner of users) {
      const note = owner.record.demoNote;
      if (!note) { results.push({ owner:owner.record.name, viewer:"Owner", status:"blocked", detail:"The note could not be created and reopened." }); continue; }
      const viewers = [{ name:owner.record.name, context:owner.context.request, owner:true }, ...users.filter(user=>user!==owner).map(user=>({name:user.record.name,context:user.context.request,owner:false})), {name:"Signed-out visitor",context:anonymous,owner:false}];
      for (const viewer of viewers) {
        try {
          const response = await viewer.context.get(new URL(note.path, owner.record.baseUrl).href);
          const text = await response.text();
          const contains = text.includes(note.body);
          const status = viewer.owner ? response.ok() && contains ? "passed" : "failing" : [401,403,404].includes(response.status()) ? "passed" : contains ? "failing" : "blocked";
          results.push({ owner:owner.record.name, viewer:viewer.name, status, httpStatus:response.status(), detail:viewer.owner ? "The owner can reopen their saved content." : contains ? "Private content was returned to another session." : [401,403,404].includes(response.status()) ? "Access was denied." : "The response did not establish access control." });
        } catch { results.push({ owner:owner.record.name, viewer:viewer.name, status:"blocked", detail:"The access check could not complete." }); }
      }
    }
  } finally { await anonymous.dispose(); }
  return results;
}
