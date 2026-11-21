# Choros

Hear from your audience before you launch.

Describe your site and who it is for. Choros creates a cast of fictional personas that fit it: a first-time visitor, someone in a hurry, someone who is not comfortable with technology. Each one uses the site in its own real browser with its own account and goal. After the visit, each persona says in its own words what confused them, what frustrated them, what was missing and what they liked, and whether they would come back. Every point is tied to the recorded step it is about.

The reactions are opinions from fictional characters. They do not predict what real people will do, and they are kept separate from bugs. Choros also checks the recorded traffic for real failures (server errors, false success messages, private data reaching the wrong account), and those count only when they happen again on request.

## Builds on earlier work

Choros is built on top of **Legios**, my earlier AI-user testing tool. Legios focused on finding and verifying bugs and privacy leaks. Choros reuses its browser engine, evidence checks, replay and repair pipeline, and refocuses the product on audience reactions. Legios itself reused two older pieces, which Choros inherits:
- **An earlier audience engine** (`lib/audience`): `build_people`, `allocate`, `generate_population` and person validation. Source file hashes are in `lib/audience/SOURCE.json`.
- **Salus** (an earlier security tool): repair drafts call the Codex CLI the way Salus's remediation agent does (read-only sandbox, structured output).

New in Choros: the Reactions mode (the default), where the planner casts ordinary visitors with varied backgrounds and patience; feedback collected from every persona after each live visit; the Reactions view and the "would return" measure on the dashboard; each persona's feedback in their session details; and the new name and look.

## Run it

```powershell
npm install
cd web
npm install
npm run build
python scripts/start-local.py
```

Open http://127.0.0.1:3020. The launcher reads `ANTHROPIC_API_KEY` from the gitignored `.env` in this folder, or asks for it at a hidden prompt. The key stays in process memory and is never written or displayed. `CHOROS_BUDGET_USD` in `.env` sets a hard spending stop.

The request, rendered pages and fictional profiles are sent to Anthropic. Use fictional data only.

## Local apps and public websites

- **Local apps** (`localhost` or `127.0.0.1`): personas can sign up, save and edit, and privacy checks are available. Use a disposable copy with test data.
- **Public websites** (any other `http` or `https` address) run **browse-only**, enforced in the browser, not left to the model: only page loads (GET, HEAD, OPTIONS) leave the browser, so sign-ups, log-ins, purchases, posts and form submissions are blocked even if a persona tries them; personas cannot leave the site (subdomains count as the same site; images and scripts from other domains still load); addresses on a local or private network are refused, including names that resolve to one; password fields and websockets are off; and privacy mode is not available. Blocked requests are listed in the run evidence. `node tests/browse-only.mjs` checks these rules without model calls.

Only test public sites you are allowed to use this way.

## Modes

| Mode | What it does |
| --- | --- |
| Hear reactions (default) | 1 to 10 personas (2 to 4 unless you ask for more) use the site and give grounded feedback. |
| Explore journeys | The same personas, with goals focused on completing tasks. |
| Check privacy | At least two accounts; Choros checks whether one account's saved content reaches the other or a signed-out visitor. |
| Audience panel | Generates 1 to 100 fictional profiles and sends 1 to 10 representatives into the browser. The rest are profile only. |
| Replay a journey | Repeats a recorded run on a fresh copy without model calls. |

## How it works

1. **Plan.** Claude turns your description into 1 to 10 personas, each with a segment, habits, priorities, constraints and beliefs.
2. **Expand.** The local audience engine expands each persona into a full fictional profile (background, tendencies, mood, focus).
3. **Visit.** Each persona gets its own browser session and picks every action from the controls on screen. Invented addresses and repeated actions are rejected without side effects.
4. **Record.** Every action is saved with a screenshot, the network requests and responses, and page errors.
5. **React.** After the visit, each persona writes a short summary, up to four points (confusing, frustrating, missing, liked) that each cite a step, whether they reached their goal and whether they would return. Points that cite a step that did not happen are marked and left out of the summary.
6. **Check.** Server errors, false success messages and private-data exposure are checked from the recorded traffic. A finding is confirmed only when it happens again.

A persona saying it reached its goal is its own report, not a verified completion.

## Test apps

`targets/` holds small apps for trying Choros: Notely and Ledgerly (written with deliberate, disclosed bugs), a healthy copy of Notely (to measure false alarms), Pantry Share (built by an AI coding agent from one prompt, no planted bugs), and SeatDrop with a clearly labeled planted control.

## Engine dashboard and tools

`npm start` in this folder runs the older engine dashboard at http://127.0.0.1:4000 (repair, recheck and crowd replay). Exports and tools:

```powershell
node tools/export-tests.mjs runs\<run folder>   # one regression test per confirmed finding
node tools/report.mjs runs\<run folder>         # offline HTML report and patches
node tools/benchmark.mjs                        # repeated runs on Notely and its healthy copy
```

## Model provider

Choros uses Anthropic only. On the website, Claude Sonnet 5.5 plans the run and writes each persona's reactions, and Claude Haiku 5.5 (about a twentieth of Sonnet's price per token) makes the click-by-click browser choices. Set `CHOROS_ACTION_MODEL` to change the browser-choice model. `CHOROS_BUDGET_USD` is a hard stop that counts every model's spending. The browser and the app under test run on your machine; the request, rendered pages and fictional profiles go to Anthropic.
