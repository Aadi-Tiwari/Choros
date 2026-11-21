import getpass
import os
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
env = os.environ.copy()
engine = Path(env.get("CHOROS_ENGINE", root.parent if (root.parent / "lib/config.mjs").exists() else root.parent / "Choros"))
config = engine / ".env"
if config.exists():
    for line in config.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if match and match[1] in {"ANTHROPIC_API_KEY", "CHOROS_BUDGET_USD", "CHOROS_EFFORT"} and not env.get(match[1]):
            env[match[1]] = match[2].strip("\"'")
if not env.get("ANTHROPIC_API_KEY"):
    env["ANTHROPIC_API_KEY"] = getpass.getpass("Anthropic API key: ").strip()
if not env["ANTHROPIC_API_KEY"]:
    raise SystemExit("No Anthropic credential configured.")
env.pop("GROQ_API_KEY", None)
env.update(NEXT_TELEMETRY_DISABLED="1", CHOROS_PROVIDER="anthropic", CHOROS_MODEL="claude-sonnet-5-5", CHOROS_ACTION_MODEL=env.get("CHOROS_ACTION_MODEL", "claude-haiku-5-5"))
print("Using the configured Anthropic credential. No key is written or displayed.", flush=True)
child = subprocess.Popen(["node", str(root / "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3020"], cwd=root, env=env, creationflags=subprocess.CREATE_NO_WINDOW)
try:
    raise SystemExit(child.wait())
except KeyboardInterrupt:
    child.terminate()
    child.wait()
