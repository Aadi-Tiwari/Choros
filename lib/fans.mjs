import { spawn } from "node:child_process";
import { chooseJSON, MODEL_LABEL } from "./llm.mjs";
import { ROOT } from "./config.mjs";

export async function draftFans(count = 100, app = { name: "SeatDrop", description: "An indie concert ticket website with a 20-seat map, up to 2 seats per buyer, My order, cancellation and an advertised EARLYBIRD promo." }) {
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error("Choose 1 to 100 fans");
  const drafted = await chooseJSON(
    'Write fictional characters for a website usability exercise. Return this exact JSON structure: {"segments":[{"id":"groupid","label":"Group name","share":25,"background":"I am a fictional user.","habits":["I read details.","I compare options."],"priorities":["Value"],"constraints":["Limited time"],"prior_beliefs":["I expect clear prices."],"goal":"An ordinary goal for this website"}]}. Use 4 to 6 different groups whose shares sum to 100. All habits, priorities, constraints and prior_beliefs MUST be arrays of strings. Keep strings under 180 characters. Goals must be ordinary uses of the app, without testing instructions or references to bugs.',
    `App: ${app.name}. Description: ${app.description}. Create varied fictional users suited to this app, including different priorities and levels of familiarity. These characters exercise a local demo and do not predict actual people.`, { maxTokens: 6000 });
  if (!Array.isArray(drafted.segments) || drafted.segments.length < 3 || drafted.segments.length > 6) throw new Error("Invalid audience groups");
  for (const [index, s] of drafted.segments.entries()) {
    s.id = `group${index + 1}`;
    s.share = Number(s.share);
    if (!Number.isInteger(s.share) || s.share < 1 || s.share > 100) throw new Error(`Invalid audience share: ${s.share}`);
    for (const key of ["habits", "priorities", "constraints", "prior_beliefs"]) if (typeof s[key] === "string") s[key] = [s[key]];
    for (const key of ["habits", "priorities", "constraints", "prior_beliefs"]) if (!Array.isArray(s[key]) || !s[key].length || s[key].some((v) => typeof v !== "string" || v.length > 200)) throw new Error(`Invalid personality field ${s.id}.${key}: expected a short string array`);
  }
  const people = await new Promise((resolve, reject) => {
    const p = spawn("python", ["tools/expand-fans.py", String(count)], { cwd: ROOT, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    let out = "", error = "";
    p.stdout.on("data", (d) => out += d); p.stderr.on("data", (d) => error += d);
    p.on("error", reject);
    p.on("close", (code) => { if (code) reject(new Error("Audience expansion failed: " + error.slice(-300))); else { try { resolve(JSON.parse(out)); } catch (e) { reject(e); } } });
    p.stdin.end(JSON.stringify(drafted));
  });
  const users = people.map((p, i) => ({
    id: p.id, name: p.profile.name, group: drafted.segments.find((s) => s.id === p.group).label,
    source: "Choros audience expansion", personality: { ...p.profile, ...p.state },
    account: { name: `fan${i + 1}`, email: `fan${i + 1}@example.com`, password: `fan${i + 1}-pass-123` },
    about: `${p.profile.background} Your email is fan${i + 1}@example.com. Your account name is fan${i + 1}. Your password is fan${i + 1}-pass-123.`,
    goal: `Create an account if needed. ${p.state.goal}`,
    ...(i % 5 === 0 ? { viewport: { width: 390, height: 844 } } : {}),
  }));
  return { users, segments: drafted.segments, provider: MODEL_LABEL, source: "Choros build_people + generate_population, copied into Choros", fictional: true };
}
