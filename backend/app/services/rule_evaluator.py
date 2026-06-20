"""Shared routing/morphing condition evaluation logic."""

import re


def _modality_tokens(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def _evaluate_modality_condition(actual: str, op: str, condition_value: str) -> bool:
    modalities = _modality_tokens(actual)
    expected = condition_value.strip()
    if not expected:
        return False

    if op == "equals":
        if not modalities:
            return actual == expected
        return any(mod == expected for mod in modalities)
    if op == "not_equals":
        if not modalities:
            return actual != expected
        return all(mod != expected for mod in modalities)
    if op == "contains":
        needle = expected.lower()
        if not modalities:
            return needle in actual.lower()
        return any(needle in mod.lower() for mod in modalities) or needle in actual.lower()
    if op == "starts_with":
        prefix = expected.lower()
        if not modalities:
            return actual.lower().startswith(prefix)
        return any(mod.lower().startswith(prefix) for mod in modalities)
    if op == "ends_with":
        suffix = expected.lower()
        if not modalities:
            return actual.lower().endswith(suffix)
        return any(mod.lower().endswith(suffix) for mod in modalities)
    if op == "regex":
        try:
            if not modalities:
                return bool(re.search(expected, actual))
            return any(re.search(expected, mod) for mod in modalities)
        except re.error:
            return False
    return False


def evaluate_condition(
    metadata: dict[str, str],
    condition_tag: str,
    condition_operator: str,
    condition_value: str,
) -> bool:
    actual = metadata.get(condition_tag, "")
    op = condition_operator.lower()

    if condition_tag == "Modality":
        return _evaluate_modality_condition(actual, op, condition_value)

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
