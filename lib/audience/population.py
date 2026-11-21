# Audience helpers; see SOURCE.json for provenance.
import random
from .life_schema import integer
from .schema import Person


def generate_population(count, seed=42, prefix="person"):
    integer(count, "population size", 1, 10000)
    integer(seed, "seed", 0, 2147483647)
    axes = (
        ("I tend to check details first.", "I tend to act quickly and adjust.", "I ask someone before deciding.", "I watch what happens before acting."),
        ("I enjoy unfamiliar situations.", "I prefer familiar routines.", "I explore when there is little to lose.", "I need a reason to change a routine."),
        ("I usually trust a new acquaintance initially.", "I let trust develop through experience.", "I seek corroboration for advice.", "I rely on people I know well."),
        ("I work best with quiet focus.", "I like lively surroundings.", "I prefer short periods of effort.", "I enjoy sustained difficult tasks."),
        ("I value independence.", "I value belonging.", "I value reliability.", "I value discovery."),
        ("I value fairness.", "I value efficiency.", "I value kindness.", "I value precision."),
        ("I have little spare time today.", "I have a flexible schedule today.", "I need to conserve energy today.", "I have energy for an optional task today."),
    )
    space = 1
    for axis in axes:
        space *= len(axis)
    randomizer = random.Random(seed)
    combinations = randomizer.sample(range(space), count)
    contexts = (
        ("I work changing shifts and organize my plans around them.", "I study part time while working.", "I have a regular work schedule.", "I work independently and my workload varies."),
        ("I help care for a relative.", "I share responsibilities with housemates.", "I live alone and manage household tasks myself.", "I coordinate a busy household with my partner."),
        ("A past rushed purchase left me disappointed.", "A previous unfamiliar opportunity turned out well.", "A project I cared about took longer than I expected.", "Someone I trusted helped me through a difficult transition."),
        ("I often ask a familiar person before looking online.", "I usually skim headlines and rarely read the full source.", "I compare sources when a decision matters to me.", "I follow detailed technical discussions when I have time."),
    )
    moods = ("Content", "Tired", "Worried about an unrelated obligation", "Restless", "Calm", "Interested", "Distracted")
    goals = ("Finish what matters to me without overcommitting.", "Learn whether this situation offers something useful.",
             "Maintain my routine and relationships.", "Explore an opportunity while keeping room to change my mind.")
    people = []
    for index, combination in enumerate(combinations):
        selected = []
        for axis in axes:
            selected.append(axis[combination % len(axis)])
            combination //= len(axis)
        personal = [randomizer.choice(options) for options in contexts]
        people.append(Person.parse({
            "id": f"{prefix}-{index + 1:05d}", "name": f"Individual {index + 1:05d}",
            "background": "Fictional starting biography, not measured history: " + " ".join(personal[:3]),
            "tendencies": selected[:4] + [personal[3]], "priorities": selected[4:6], "constraints": selected[6:] + personal[:2],
            "state": {"focus": "Assess the present situation alongside my existing obligations.", "mood": randomizer.choice(moods), "goal": randomizer.choice(goals), "beliefs": []},
        }))
    return people
