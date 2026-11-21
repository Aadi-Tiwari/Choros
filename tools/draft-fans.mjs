import { writeFile, mkdir } from "node:fs/promises";
import { draftFans } from "../lib/fans.mjs";
import { USAGE, usageCost } from "../lib/llm.mjs";
const target = process.argv[2] || "seatdrop";
if (!/^[a-z0-9-]+$/.test(target)) throw new Error("Invalid target");
const result = await draftFans(Number(process.argv[3] || 100));
await mkdir(`targets/${target}`, { recursive: true });
await writeFile(`targets/${target}/fans.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ target, users: result.users.length, groups: result.segments.length, provider: result.provider, usage: USAGE, costUSD: usageCost() }));
