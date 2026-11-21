# Audience helpers; see SOURCE.json for provenance.
from .schema import InvalidInput


def integer(value, label, low, high):
    if type(value) is not int or not low <= value <= high:
        raise InvalidInput(f"{label} must be an integer from {low} to {high}")
    return value
