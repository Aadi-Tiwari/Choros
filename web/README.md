# Choros website

Run `npm install`, `npm run build`, then `python scripts/start-local.py`. The launcher reads the Anthropic key from `../.env` or asks for it at a hidden prompt. The key stays in process memory. Open http://127.0.0.1:3020.

The chatbox uses Claude Sonnet 5.5 (with Claude Haiku 5.5 for click-by-click browser choices) to turn a description of a site and its audience into fictional personas, then starts the Choros browser engine in the parent folder (or the path in `CHOROS_ENGINE`).

Name a managed demo such as Notely, Ledgerly, Pantry Share or SeatDrop, or add a site address. Local apps get full testing; public websites run browse-only (page loads only, nothing submitted). Runs support up to ten live personas, 24 browser decisions each and a six-minute limit. The request and browser observations are sent to Anthropic. Test only disposable apps and fictional data.

The dashboard at /dashboard shows live sessions, screenshots, each persona's reactions, findings, the generated audience, activity and run history. Reactions are opinions from fictional personas tied to recorded steps; they are not confirmed bugs and not predictions of real people. A persona saying it reached its goal is not a verified completion.

Runtime evidence stays local in the ignored `.choros-runs` folder. Never include that folder or credentials in shared ZIPs.

Verification: `node scripts/verify-audience-population.mjs` checks the local audience generator without model calls. `node scripts/verify-flow.mjs` and `node scripts/verify-audience.mjs` run real Anthropic and browser tests and cost credits.

The one-click Notely demo is scripted: two real browser accounts save fictional notes, then access is checked from the other account and a signed-out session. It makes no model calls.
