import { existsSync } from "node:fs";
import { resolve } from "node:path";
export function engineRoot() {
  return resolve(process.env.CHOROS_ENGINE || (existsSync(resolve("..", "lib", "config.mjs")) ? ".." : "../Choros"));
}
