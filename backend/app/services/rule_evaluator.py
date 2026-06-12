"""Shared routing/morphing condition evaluation logic."""

import re


def evaluate_condition(
    metadata: dict[str, str],
    condition_tag: str,
    condition_operator: str,
    condition_value: str,
) -> bool:
    actual = metadata.get(condition_tag, "")
    op = condition_operator.lower()

    if op == "equals":
        return actual == condition_value
    if op == "not_equals":
        return actual != condition_value
    if op == "contains":
        return condition_value.lower() in actual.lower()
    if op == "starts_with":
        return actual.lower().startswith(condition_value.lower())
    if op == "ends_with":
        return actual.lower().endswith(condition_value.lower())
    if op == "regex":
        try:
            return bool(re.search(condition_value, actual))
        except re.error:
            return False
    return False
