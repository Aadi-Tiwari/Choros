"""Compare persona and baseline complaint themes with real IRS2Go complaints; write metrics and a chart."""
import json, pickle
from collections import Counter
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

themes = list(json.loads(Path("themes.json").read_text(encoding="utf-8")))
real = json.loads(Path("data/labeled_reviews.json").read_text(encoding="utf-8"))
import re
all_points = [p for p in json.loads(Path("data/persona_and_baseline_points.json").read_text(encoding="utf-8")) if p["kind"] != "liked" and p.get("theme")]
# Persona complaints caused by the testing tool, not the site: clicks our browser gave up on ("timed out",
# "did nothing", "didn't respond") and the site's bot protection ("Access Denied"). Excluded and counted.
ARTIFACT = re.compile(r"timed out|did nothing|didn.t respond|didn.t work|access denied|nothing happened", re.I)
artifacts = [p for p in all_points if p["source"] != "baseline" and ARTIFACT.search(p["text"])]
points = [p for p in all_points if p not in artifacts]
clf = pickle.loads(Path("out/theme_classifier.pkl").read_bytes())

real_counts = Counter(r["theme"] for r in real)
real_share = {t: real_counts[t] / len(real) for t in themes}
# Themes that are a real pattern: at least 5% of real complaints, "other" excluded.
real_set = {t for t in themes if t != "other" and real_share[t] >= 0.05}

def summarize(group):
    found = {p["theme"] for p in group if p["theme"] != "other"}
    return {
        "complaints": len(group),
        "themes_found": sorted(found),
        "recall": round(len(found & real_set) / len(real_set), 3),
        "precision": round(sum(p["theme"] in real_set for p in group) / len(group), 3) if group else None,
        "share": {t: round(sum(p["theme"] == t for p in group) / len(group), 3) for t in themes} if group else {},
    }

sources = sorted({p["source"] for p in points if p["source"] != "baseline"})
personas = [p for p in points if p["source"] != "baseline"]
baseline = [p for p in points if p["source"] == "baseline"]
result = {
    "real": {"complaints": len(real), "share": {t: round(real_share[t], 3) for t in themes}, "real_themes": sorted(real_set)},
    "personas_all_runs": summarize(personas),
    "baseline_no_browsing": summarize(baseline),
    "per_run": {s: summarize([p for p in personas if p["source"] == s]) for s in sources},
    "persona_complaints_excluded_as_tool_artifacts": len(artifacts),
    "persona_points_grounded": round(sum(bool(p["grounded"]) for p in personas) / len(personas), 3) if personas else None,
}
if len(sources) == 2:
    a, b = (set(result["per_run"][s]["themes_found"]) for s in sources)
    result["stability_jaccard"] = round(len(a & b) / len(a | b), 3) if a | b else None
pred = clf.predict([p["text"] for p in points])
result["classifier_agreement_with_claude_labels"] = round(sum(x == p["theme"] for x, p in zip(pred, points)) / len(points), 3)
Path("out/results.json").write_text(json.dumps(result, indent=1), encoding="utf-8")

shown = [t for t in themes if t != "other"]
x = range(len(shown)); w = 0.27
fig, ax = plt.subplots(figsize=(10, 4.8))
for k, (label, share, color) in enumerate([("Real IRS2Go complaints", result["real"]["share"], "#c78c54"),
                                           ("Choros personas (browsed IRS.gov)", result["personas_all_runs"]["share"], "#f1c998"),
                                           ("Baseline (guessed, no browsing)", result["baseline_no_browsing"]["share"], "#6b6b6b")]):
    ax.bar([i + (k - 1) * w for i in x], [share.get(t, 0) * 100 for t in shown], w, label=label, color=color)
ax.set_xticks(list(x)); ax.set_xticklabels([t.replace("_", "\n") for t in shown], fontsize=8)
ax.set_ylabel("% of complaints"); ax.set_title("Which problems do people raise? Real reviews vs AI personas vs a no-browsing guess")
ax.legend(fontsize=8); fig.tight_layout(); fig.savefig("out/themes_chart.png", dpi=160)
print(json.dumps({k: v for k, v in result.items() if k not in ("per_run",)}, indent=1))
print("per run:", {s: (v["recall"], v["precision"], v["complaints"]) for s, v in result["per_run"].items()})
