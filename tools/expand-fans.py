import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'lib'))
from audience.audience import build_people

segments = json.load(sys.stdin)['segments']
people, membership = build_people(segments, int(sys.argv[1]), seed=42)
print(json.dumps([{'id': p.id, 'profile': p.profile, 'state': p.initial_state,
                  'group': membership[p.id]} for p in people]))
