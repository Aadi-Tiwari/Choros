import { spawn } from "node:child_process";
import { join } from "node:path";

const shortList = (value, fallback) => Array.isArray(value) && value.length ? value.slice(0, 4).map(item => String(item).slice(0, 180)) : [fallback];

export async function expandAudience({ engine, users, count, runId }) {
  if (!Array.isArray(users) || users.length < 1 || users.length > 10 || !Number.isInteger(count) || count < users.length || count > 100) throw new Error("Generate up to 100 audience members with one to ten live explorers.");
  const segments = users.map((user, index) => ({
    id: `group${index + 1}`, label: String(user.segment || user.name).slice(0, 60),
    share: Math.floor(100 / users.length) + (index < 100 % users.length ? 1 : 0),
    background: String(user.about).slice(0, 1000),
    habits: shortList(user.habits, "I read the page before acting."), priorities: shortList(user.priorities, "Complete my task."),
    constraints: shortList(user.constraints, "I have limited time."), prior_beliefs: shortList(user.beliefs, "I expect my work to be kept."),
    goal: String(user.goal).slice(0, 400),
  }));
  const people = await new Promise((ok, fail) => {
    const child = spawn("python", ["-X", "utf8", join(engine, "tools", "expand-fans.py"), String(count)], { cwd: engine, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let output = "";
    const timer = setTimeout(() => { child.kill(); fail(new Error("Choros audience expansion timed out.")); }, 15000);
    child.stdout.on("data", data => { output += data; });
    child.stderr.on("data", () => {});
    child.once("error", () => { clearTimeout(timer); fail(new Error("Could not start the Choros Python audience generator.")); });
    child.once("close", code => { clearTimeout(timer); if (code) fail(new Error("Choros rejected the audience profiles. Please refine the request.")); else { try { ok(JSON.parse(output)); } catch { fail(new Error("Choros returned an unreadable population.")); } } });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ segments }));
  });
  if (people.length !== count) throw new Error("Choros did not return the requested audience size.");
  const chosen = segments.map(segment => people.find(person => person.group === segment.id));
  if (chosen.some(person => !person)) throw new Error("Choros could not represent every live explorer group.");
  const personas = chosen.map((person, index) => {
    const original = users[index];
    const account = { name: `choros${runId.slice(0, 8)}u${index + 1}`, email: `choros${runId.slice(0, 8)}u${index + 1}@example.com`, password: `TestOnly${runId.slice(0, 8)}u${index + 1}!` };
    return { id: `user-${index + 1}`, name: String(original.name).slice(0, 40), group: segments[index].label,
      source: "Choros", audienceId: person.id, personality: { ...person.profile, ...person.state, audienceId: person.id }, account,
      goal: String(original.goal).slice(0, 2000),
      about: `${person.profile.background} Use only fictional data. Your test username is ${account.name}, email ${account.email}, and test password ${account.password}. Never send messages, emails, invites or comments, publish anything, delete user data, or make real purchases.`,
      ...(original.mobile ? { viewport: { width: 390, height: 844 } } : {}),
    };
  });
  const selected = new Map(personas.map(persona => [persona.audienceId, persona.id]));
  const audience = { source: "Choros build_people + generate_population", seed: 42, fictional: true, generated: people.length, live: personas.length, segments,
    members: people.map(person => ({ id: person.id, groupId: person.group, name: person.profile.name, group: segments.find(segment => segment.id === person.group).label, personality: { ...person.profile, ...person.state }, selected: selected.has(person.id), sessionId: selected.get(person.id) || null })) };
  return { audience, personas };
}
