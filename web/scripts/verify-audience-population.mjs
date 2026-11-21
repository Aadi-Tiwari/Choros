import { expandAudience } from "./audience.mjs";
import assert from "node:assert/strict";
import { engineRoot } from "./engine.mjs";

const users = [
  { name: "Alex", segment: "Caf\u00e9 readers", about: "A fictional person trying a notes app.", goal: "Save a fictional note.", habits: ["I check labels before clicking."], priorities: ["Clear feedback"], constraints: ["Limited time"], beliefs: ["My notes stay private."], mobile: false },
  { name: "Morgan", segment: "Returning readers", about: "A fictional person returning to a notes app.", goal: "Reopen a fictional note.", habits: ["I revisit what I saved."], priorities: ["Reliable storage"], constraints: ["Small screen"], beliefs: ["My changes should persist."], mobile: true },
];
const make = count => expandAudience({ engine: engineRoot(), users, count, runId: "12345678-audit" });
for (const count of [2, 25, 100]) {
  const { audience, personas } = await make(count);
  assert.equal(audience.generated, count);
  assert.equal(audience.members.length, count);
  assert.equal(personas.length, users.length);
  assert.equal(audience.members.filter(person => person.selected).length, users.length);
  assert.equal(new Set(audience.members.map(person => person.id)).size, count);
  assert(personas.every(person => person.personality.tendencies.length > 1 && person.personality.priorities.length > 0 && person.personality.mood));
  assert(personas.every(person => audience.members.some(member => member.sessionId === person.id && member.id === person.audienceId)));
  assert(audience.members.some(member => member.name.includes("Caf\u00e9")));
  assert(audience.members.every(member => audience.segments.some(segment => segment.id === member.groupId)));
  console.log(`PASS: ${count} real Choros profiles, ${personas.length} live representatives, valid membership and UTF-8 text.`);
}
assert.deepEqual((await make(25)).audience, (await make(25)).audience);
await assert.rejects(() => make(1));
console.log("PASS: seeded populations are reproducible; invalid audience sizes are rejected.");
