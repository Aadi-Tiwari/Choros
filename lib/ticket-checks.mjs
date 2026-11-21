import { readFile } from "node:fs/promises";

// The independent monitor only projects order fields. Credentials never leave the app's data file.
export async function ticketSnapshot(dataFile) {
  if (!dataFile) throw new Error("Ticket checks require an isolated data file");
  const db = JSON.parse(await readFile(dataFile, "utf8"));
  if (!Array.isArray(db.orders)) throw new Error("Ticket order data is unavailable");
  const active = db.orders.filter((o) => !o.cancelled);
  const owners = {};
  for (const o of active) for (const seat of o.seats || []) (owners[seat] ||= []).push({ order: o.id, owner: o.name });
  return { at: Date.now(), sold: active.reduce((n, o) => n + (o.seats?.length || 0), 0), capacity: 20,
    orders: active.length, promoUses: db.orders.filter((o) => o.promo === "EARLYBIRD").length,
    seats: Array.from({ length: 20 }, (_, i) => { const id = String.fromCharCode(65 + Math.floor(i / 5)) + (i % 5 + 1); return { id, owners: owners[id] || [] }; }),
    duplicates: Object.entries(owners).filter(([, list]) => list.length > 1).map(([seat, list]) => ({ seat, owners: list })) };
}

export async function ticketFindings(dataFile, records) {
  const first = await ticketSnapshot(dataFile);
  await new Promise((r) => setTimeout(r, 100));
  const second = await ticketSnapshot(dataFile);
  const rules = [
    ["oversell", "Seats sold never exceed 20", (s) => s.sold > s.capacity],
    ["double_seat", "Each seat has at most one owner", (s) => s.duplicates.length > 0],
    ["promo_reuse", "EARLYBIRD is redeemed at most once in total", (s) => s.promoUses > 1],
  ];
  return rules.filter(([, , fails]) => fails(first)).map(([id, name, fails]) => ({
    signature: `ticket_invariant:${id}`, kind: "ticket_invariant", severity: "critical", user: "Live crowd",
    title: name, expected: name, observed: JSON.stringify({ sold: first.sold, promoUses: first.promoUses, duplicates: first.duplicates }),
    status: fails(second) ? "confirmed" : "uncertain", confirmation: "Independent reads of the isolated order ledger; rejected purchases do not count as sales.",
    evidence: { request: "POST /api/buy", status: 201, rule: id, discovery: "independent order ledger", response: JSON.stringify(second) },
    steps: ["Create separate fan accounts", "Release the signed-in live AI users into the sale", "Check committed orders independently of the page"],
    crowd: true,
  }));
}
