from __future__ import annotations

from typing import Any


EARLY_STEPS = {"genre", "cover", "title"}


def normalize_workflow_state(state: dict[str, Any] | None, current_step: str) -> dict[str, Any]:
    normalized = dict(state or {})
    normalized["schemaVersion"] = 1
    normalized["activeStepId"] = current_step
    return normalized


def merge_client_workflow_state(
    current_state: dict[str, Any] | None,
    incoming_state: dict[str, Any] | None,
    *,
    current_step: str,
) -> dict[str, Any]:
    current = current_state if isinstance(current_state, dict) else {}
    incoming = incoming_state if isinstance(incoming_state, dict) else {}
    merged = _deep_merge_dicts(current, incoming)

    if current_step not in EARLY_STEPS:
        _preserve_non_empty(current, incoming, merged, "layout", "items")
        _preserve_non_empty(current, incoming, merged, "layout", "canvas")
        _preserve_non_empty(current, incoming, merged, "style", "prompt")
        _preserve_non_empty(current, incoming, merged, "style", "resolvedElements")
        _preserve_non_empty(current, incoming, merged, "style", "resolvedStyles")
        _preserve_non_empty(current, incoming, merged, "generation", "jobId")
        _preserve_non_empty(current, incoming, merged, "generation", "status")
        _preserve_non_empty(current, incoming, merged, "generation", "creditSource")
        _merge_generation_slots(current, incoming, merged)
        _preserve_non_empty(current, incoming, merged, "generation", "selectedCandidateId")

    return normalize_workflow_state(merged, current_step)


def merge_server_workflow_patch(
    current_state: dict[str, Any] | None,
    state_patch: dict[str, Any],
    *,
    current_step: str,
) -> dict[str, Any]:
    current = current_state if isinstance(current_state, dict) else {}
    merged = _deep_merge_dicts(current, state_patch)
    return normalize_workflow_state(merged, current_step)


def _preserve_non_empty(
    current: dict[str, Any],
    incoming: dict[str, Any],
    merged: dict[str, Any],
    section: str,
    key: str,
) -> None:
    current_section = current.get(section)
    incoming_section = incoming.get(section)
    if not isinstance(current_section, dict):
        return
    current_value = current_section.get(key)
    if _is_empty(current_value):
        return
    incoming_value = incoming_section.get(key) if isinstance(incoming_section, dict) else None
    if not _is_empty(incoming_value):
        return
    merged_section = merged.setdefault(section, {})
    if isinstance(merged_section, dict):
        merged_section[key] = current_value


def _merge_generation_slots(current: dict[str, Any], incoming: dict[str, Any], merged: dict[str, Any]) -> None:
    current_slots = _section_list(current, "generation", "slots")
    incoming_slots = _section_list(incoming, "generation", "slots")
    if not current_slots:
        return
    if not incoming_slots:
        _ensure_section(merged, "generation")["slots"] = current_slots
        return

    current_by_index = {_slot_index(slot, index): slot for index, slot in enumerate(current_slots)}
    incoming_by_index = {_slot_index(slot, index): slot for index, slot in enumerate(incoming_slots)}
    merged_slots: list[dict[str, Any]] = []
    for slot_index in sorted(set(current_by_index) | set(incoming_by_index)):
        current_slot = current_by_index.get(slot_index, {})
        incoming_slot = incoming_by_index.get(slot_index, {})
        next_slot = dict(current_slot)
        for key, value in incoming_slot.items():
            if _is_empty(value) and not _is_empty(current_slot.get(key)):
                continue
            next_slot[key] = value
        merged_slots.append(next_slot)
    _ensure_section(merged, "generation")["slots"] = merged_slots


def _section_list(state: dict[str, Any], section: str, key: str) -> list[dict[str, Any]]:
    section_value = state.get(section)
    if not isinstance(section_value, dict) or not isinstance(section_value.get(key), list):
        return []
    return [item for item in section_value[key] if isinstance(item, dict)]


def _slot_index(slot: dict[str, Any], fallback: int) -> int:
    value = slot.get("slotIndex", slot.get("slot_index", fallback + 1))
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback + 1


def _ensure_section(state: dict[str, Any], section: str) -> dict[str, Any]:
    value = state.setdefault(section, {})
    if isinstance(value, dict):
        return value
    state[section] = {}
    return state[section]


def _is_empty(value: Any) -> bool:
    return value is None or value == "" or value == [] or value == {}


def _deep_merge_dicts(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    merged = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge_dicts(merged[key], value)
        else:
            merged[key] = value
    return merged
