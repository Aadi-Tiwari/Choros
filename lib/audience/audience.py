# Audience helpers; see SOURCE.json for provenance.
import random
from .population import generate_population
from .schema import Person, InvalidInput


def allocate(segments, count):
    """Split count across segments by share with the largest-remainder method; every segment gets at least one person when possible."""
    total = sum(segment["share"] for segment in segments)
    exact = [count * segment["share"] / total for segment in segments]
    sizes = [int(value) for value in exact]
    for index in sorted(range(len(segments)), key=lambda i: exact[i] - sizes[i], reverse=True)[:count - sum(sizes)]:
        sizes[index] += 1
    if count >= len(segments):
        for index, size in enumerate(sizes):
            if size == 0:
                donor = max(range(len(sizes)), key=lambda i: sizes[i])
                sizes[donor] -= 1
                sizes[index] = 1
    return sizes


def build_people(segments, count, seed=42):
    """Expand segments into individuals. Each person keeps the segment profile plus personal variation."""
    if not 1 <= count <= 10000:
        raise InvalidInput("Use 1 to 10000 audience members")
    variation = generate_population(count, seed)
    randomizer = random.Random(seed)
    people, membership, cursor = [], {}, 0
    for segment, size in zip(segments, allocate(segments, count)):
        for number in range(1, size + 1):
            base = variation[cursor].profile
            mood = variation[cursor].initial_state["mood"]
            cursor += 1
            person_id = f"{segment['id']}-{number:04d}"
            membership[person_id] = segment["id"]
            personal = randomizer.sample(base["tendencies"], 2)
            people.append(Person.parse({
                "id": person_id, "name": f"{segment['label']} {number}",
                "background": f"Fictional audience member ({segment['label']}). {segment['background']}",
                "tendencies": (segment["habits"] + personal)[:6], "priorities": (segment["priorities"] + base["priorities"][:1])[:4],
                "constraints": (segment["constraints"] + base["constraints"][:1])[:4],
                "state": {"focus": "Going about my day when I come across this.", "mood": mood, "goal": segment["goal"],
                          "beliefs": segment["prior_beliefs"][:3]},
            }))
    return people, membership
