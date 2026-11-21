# Audience helpers; see SOURCE.json for provenance.
from __future__ import annotations
from dataclasses import dataclass


class InvalidInput(ValueError):
    pass


def text(value: object, label: str, limit: int = 2000, empty: bool = False) -> str:
    if not isinstance(value, str) or len(value) > limit or (not empty and not value.strip()):
        raise InvalidInput(f"{label} must be {'a' if empty else 'a nonempty'} string of at most {limit} characters")
    try:
        value.encode("utf-8")
    except UnicodeError as error:
        raise InvalidInput(f"{label} contains invalid Unicode") from error
    return value


def strings(value: object, label: str, limit: int = 12) -> list[str]:
    if not isinstance(value, list) or len(value) > limit:
        raise InvalidInput(f"{label} must be a list with at most {limit} entries")
    return [text(item, label, 600) for item in value]


def fields(value: object, required: set[str], label: str, optional: set[str] | None = None) -> dict:
    if not isinstance(value, dict) or not required <= value.keys() or value.keys() - required - (optional or set()):
        raise InvalidInput(f"{label} requires {sorted(required)}; optional fields: {sorted(optional or set())}")
    return value


def state(value: object) -> dict:
    value = fields(value, {"focus", "mood", "goal", "beliefs"}, "state")
    return {
        "focus": text(value["focus"], "focus", 400, empty=True),
        "mood": text(value["mood"], "mood", 200, empty=True),
        "goal": text(value["goal"], "goal", 400, empty=True),
        "beliefs": strings(value["beliefs"], "beliefs", 5),
    }


@dataclass(frozen=True)
class Person:
    id: str
    profile: dict
    initial_state: dict

    @classmethod
    def parse(cls, value: object) -> Person:
        value = fields(value, {"id", "name", "background", "tendencies", "priorities", "constraints", "state"}, "person")
        person_id = text(value["id"], "person id", 80)
        profile = {
            "name": text(value["name"], "name", 120),
            "background": text(value["background"], "background"),
            "tendencies": strings(value["tendencies"], "tendencies"),
            "priorities": strings(value["priorities"], "priorities"),
            "constraints": strings(value["constraints"], "constraints"),
        }
        return cls(person_id, profile, state(value["state"]))
