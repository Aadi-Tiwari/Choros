"""Download public App Store reviews of IRS2Go (app 414113282) from Apple's customer-review feed."""
import json, time, urllib.request
from pathlib import Path

APP_ID = 414113282
rows, seen = [], set()
for page in range(1, 11):
    url = f"https://itunes.apple.com/us/rss/customerreviews/page={page}/id={APP_ID}/sortby=mostrecent/json"
    try:
        feed = json.load(urllib.request.urlopen(url, timeout=20))["feed"]
    except Exception as error:
        print(f"page {page}: {error}"); break
    entries = [e for e in feed.get("entry", []) if "im:rating" in e]
    if not entries: break
    for e in entries:
        review_id = e["id"]["label"]
        if review_id in seen: continue
        seen.add(review_id)
        rows.append({"id": review_id, "rating": int(e["im:rating"]["label"]), "title": e["title"]["label"],
                     "text": e["content"]["label"], "version": e["im:version"]["label"], "updated": e["updated"]["label"]})
    time.sleep(0.3)
Path("data/irs2go_reviews.json").write_text(json.dumps(rows, indent=1), encoding="utf-8")
dates = sorted(r["updated"][:10] for r in rows)
print(f"{len(rows)} reviews, {dates[0] if dates else '-'} to {dates[-1] if dates else '-'}")
print("by stars:", {s: sum(r['rating'] == s for r in rows) for s in range(1, 6)})
