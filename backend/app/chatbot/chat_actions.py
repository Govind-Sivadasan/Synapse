"""Detect and execute confirmed chatbot actions across Synapse entities."""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.migration import MigrationJob, MigrationStudyRecord
from app.models.node import Node
from app.models.routing import RoutingRule
from app.models.tag_morphing import TagMorphingRule
from app.routing.engine import invalidate_rules_cache
from app.schemas.migration import MigrationJobCreate, MigrationJobResponse
from app.schemas.node import NodeCreate, NodeEchoResponse, NodeResponse, NodeUpdate
from app.schemas.routing_rule import RoutingRuleCreate, RoutingRuleResponse, RoutingRuleUpdate, VALID_OPERATORS, VALID_TAGS
from app.schemas.tag_morphing import TagMorphingRuleCreate, TagMorphingRuleResponse, TagMorphingRuleUpdate
from app.services.allowed_aets import refresh_allowed_calling_aets
from app.services.audit_logger import AuditLogger
from app.services.migration_backpressure import wait_for_migration_queue_slot
from app.services.migration_job_counters import init_job_counters
from app.services.migration_preflight import ensure_no_other_active_migration_job, verify_migration_node_connectivity
from app.services.node_connectivity import probe_node_connectivity
from app.services.rule_evaluator import evaluate_condition
from app.services.rules_cache import invalidate_routing_rules_cache
from app.workers.dispatch import enqueue_fetch_and_enqueue_studies, enqueue_migrate_study

MODALITIES = frozenset({"CT", "MR", "MG", "US", "XR", "PT", "NM", "SR", "CR", "DX", "RF", "OT", "XA", "ES"})
MIGRATION_TYPES = frozenset({"historical", "batch", "incremental"})
ENTITY_TYPES = frozenset({"routing_rule", "migration_job", "node", "tag_morphing"})
JOB_CHANGE_RE = re.compile(
    r"\b(create|add|new|start|run|pause|resume|cancel|delete|remove|rename|update|edit|duplicate|copy|clone|retry)\b.*\b(migration|job)\b"
    r"|\b(duplicate|copy|clone)\b.+\b(job|migration)\b"
    r"|\bretry\b.+\b(failed|failures|studies)\b"
    r"|\bmigrate\b.+\bfrom\b.+\bto\b",
    re.IGNORECASE,
)
CONFIRMATION_REPLY_RE = re.compile(
    r"^(yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|proceed|go ahead|do it|please do|sounds good)\.?!?$",
    re.IGNORECASE,
)
CANCELLATION_REPLY_RE = re.compile(
    r"^(no|nope|cancel|nevermind|never mind|stop|don'?t)\.?!?$",
    re.IGNORECASE,
)
NODE_CHANGE_RE = re.compile(
    r"\b(create|add|new|update|edit|rename|delete|remove|disable|enable|test|echo)\b.*\bnode\b",
    re.IGNORECASE,
)
TAG_MORPH_CHANGE_RE = re.compile(
    r"\b(create|add|new|update|edit|rename|delete|remove|disable|enable)\b.*\b(tag\s+morph|morphing)\b",
    re.IGNORECASE,
)
RULE_CHANGE_RE = re.compile(
    r"\b(add|create|new|set\s*up|setup|disable|deactivate|enable|activate|delete|remove|turn\s+on|turn\s+off)\b.+\b(routing\s+)?rule\b"
    r"|\broute\b.+\bto\b"
    r"|\bsend\b.+\bto\b",
    re.IGNORECASE,
)

ENTITY_PLANNERS = {
    "migration_job": None,  # set after planner functions are defined
    "node": None,
    "tag_morphing": None,
    "routing_rule": None,
}


def _detail(label: str, value: Any) -> dict[str, str]:
    return {"label": label, "value": str(value)}


def _ip_address(request: Request | None) -> str | None:
    return request.client.host if request and request.client else None


def _primary_role(user_roles: Sequence[str]) -> str | None:
    if "admin" in user_roles:
        return "admin"
    if "operator" in user_roles:
        return "operator"
    return user_roles[0] if user_roles else None


def _require_chat_role(user_roles: Sequence[str], required: str) -> None:
    if required == "admin" and "admin" not in user_roles:
        raise HTTPException(status_code=403, detail="This chatbot action requires an administrator.")
    if required == "operator" and not any(role in {"admin", "operator"} for role in user_roles):
        raise HTTPException(status_code=403, detail="This chatbot action requires an operator or administrator.")


def _extract_modality(message: str) -> str | None:
    upper = message.upper()
    for mod in sorted(MODALITIES, key=len, reverse=True):
        if re.search(rf"\b{re.escape(mod)}\b", upper):
            return mod
    return None


def _extract_job_type(message: str) -> str:
    lower = message.lower()
    for job_type in MIGRATION_TYPES:
        if job_type in lower:
            return job_type
    return "historical"


def _clean_value(raw: str) -> str:
    return raw.strip().strip('"').strip("'").strip()


def _match_by_name(query: str, items: Sequence[Any], name_attr: str = "name") -> Any | None:
    q = query.lower()
    exact: list[Any] = []
    partial: list[Any] = []
    for item in items:
        name = getattr(item, name_attr, "")
        if not name:
            continue
        lower = name.lower()
        if lower in q:
            exact.append(item)
            continue
        score = 0
        for token in re.split(r"[\s\-\[\]\(\),>]+", lower):
            token = token.strip()
            if len(token) >= 3 and token in q:
                score += len(token)
        if score:
            partial.append((score, item))
    if len(exact) == 1:
        return exact[0]
    if exact:
        return max(exact, key=lambda item: len(getattr(item, name_attr, "")))
    if partial:
        partial.sort(key=lambda pair: pair[0], reverse=True)
        return partial[0][1]
    return None


def _resolve_node(message: str, nodes: Sequence[Node], *, node_type: str | None = None) -> Node | None:
    scoped = [node for node in nodes if node_type is None or node.node_type == node_type]
    return _match_by_name(message, scoped)


def _resolve_job(message: str, jobs: Sequence[MigrationJob]) -> MigrationJob | None:
    return _match_by_name(message, jobs)


def _resolve_rule(message: str, rules: Sequence[RoutingRule]) -> RoutingRule | None:
    named = _match_by_name(message, rules)
    if named:
        return named
    modality = _extract_modality(message)
    if modality:
        matches = [
            rule
            for rule in rules
            if rule.condition_tag == "Modality"
            and rule.condition_operator == "equals"
            and rule.condition_value.upper() == modality
        ]
        if len(matches) == 1:
            return matches[0]
    return rules[0] if len(rules) == 1 else None


def _resolve_morph_rule(message: str, rules: Sequence[TagMorphingRule]) -> TagMorphingRule | None:
    return _match_by_name(message, rules)


def _routing_dest_names(rule: RoutingRule, destinations: Sequence[Node]) -> list[str]:
    dest_by_id = {node.id: node.name for node in destinations}
    return [dest_by_id.get(dest_id, str(dest_id)) for dest_id in rule.destination_node_ids]


async def load_action_resources(db: AsyncSession) -> dict[str, list[Any]]:
    rules = list((await db.execute(select(RoutingRule).order_by(RoutingRule.priority, RoutingRule.name))).scalars().all())
    nodes = list((await db.execute(select(Node).order_by(Node.name))).scalars().all())
    jobs = list((await db.execute(select(MigrationJob).order_by(MigrationJob.created_at.desc()).limit(100))).scalars().all())
    morph_rules = list((await db.execute(select(TagMorphingRule).order_by(TagMorphingRule.name))).scalars().all())
    return {
        "routing_rules": rules,
        "nodes": nodes,
        "migration_jobs": jobs,
        "tag_morphing_rules": morph_rules,
    }


def action_context_snapshot(resources: dict[str, list[Any]]) -> dict[str, Any]:
    nodes: list[Node] = resources["nodes"]
    rules: list[RoutingRule] = resources["routing_rules"]
    jobs: list[MigrationJob] = resources["migration_jobs"]
    morphs: list[TagMorphingRule] = resources["tag_morphing_rules"]
    destinations = [node for node in nodes if node.node_type == "destination"]
    return {
        "routing_rules": [
            {
                "name": rule.name,
                "condition_tag": rule.condition_tag,
                "condition_operator": rule.condition_operator,
                "condition_value": rule.condition_value,
                "destinations": _routing_dest_names(rule, destinations),
                "priority": rule.priority,
                "is_active": rule.is_active,
            }
            for rule in rules[:15]
        ],
        "nodes": [
            {
                "name": node.name,
                "node_type": node.node_type,
                "protocol": node.protocol,
                "host": node.host,
                "port": node.port,
                "ae_title": node.ae_title,
                "is_active": node.is_active,
            }
            for node in nodes[:20]
        ],
        "migration_jobs": [
            {
                "name": job.name,
                "status": job.status,
                "job_type": job.job_type,
                "created_by": job.created_by,
            }
            for job in jobs[:15]
        ],
        "tag_morphing_rules": [
            {
                "name": rule.name,
                "condition_tag": rule.condition_tag,
                "condition_operator": rule.condition_operator,
                "condition_value": rule.condition_value,
                "target_tag": rule.target_tag,
                "new_value": rule.new_value,
                "is_active": rule.is_active,
            }
            for rule in morphs[:15]
        ],
    }


def _message_content(message: Any) -> str:
    content = getattr(message, "content", None)
    if content is None and isinstance(message, dict):
        content = message.get("content")
    return str(content or "").strip()


def build_conversation_action_text(recent_messages: Sequence[Any]) -> str:
    return " ".join(_message_content(msg) for msg in recent_messages if _message_content(msg))


def build_user_action_text(recent_messages: Sequence[Any]) -> str:
    return " ".join(
        _message_content(msg) for msg in recent_messages if _message_role(msg) == "user" and _message_content(msg)
    )


def is_chat_action_request(message: str) -> bool:
    text = message.strip()
    return bool(
        RULE_CHANGE_RE.search(text)
        or JOB_CHANGE_RE.search(text)
        or NODE_CHANGE_RE.search(text)
        or TAG_MORPH_CHANGE_RE.search(text)
    )


def is_action_continuation(message: str, prior_messages: Sequence[Any]) -> bool:
    """True when the user is confirming or supplying follow-up details for an action."""
    text = message.strip()
    if not text or not prior_messages:
        return False
    if CONFIRMATION_REPLY_RE.match(text) or CANCELLATION_REPLY_RE.match(text):
        return True
    prior = build_conversation_action_text(prior_messages)
    if not prior or not is_chat_action_request(prior):
        return False
    if is_chat_action_request(text):
        return False
    return len(text.split()) <= 20


def is_chat_action_request_with_context(message: str, prior_messages: Sequence[Any]) -> bool:
    return is_chat_action_request(message) or is_action_continuation(message, prior_messages)


def _message_role(message: Any) -> str:
    role = getattr(message, "role", None)
    if role is None and isinstance(message, dict):
        role = message.get("role")
    return str(role or "")


def _primary_entity_for_message(message: str) -> str | None:
    text = message.strip()
    if NODE_CHANGE_RE.search(text):
        return "node"
    if JOB_CHANGE_RE.search(text):
        return "migration_job"
    if TAG_MORPH_CHANGE_RE.search(text):
        return "tag_morphing"
    if RULE_CHANGE_RE.search(text):
        return "routing_rule"
    return None


def _resolve_active_entity(message: str, prior_messages: Sequence[Any]) -> str | None:
    current = _primary_entity_for_message(message)
    if current:
        return current
    for msg in reversed(prior_messages):
        if _message_role(msg) != "user":
            continue
        entity = _primary_entity_for_message(_message_content(msg))
        if entity:
            return entity
    return None


def _plan_entity_action(entity: str, message: str, resources: dict[str, list[Any]]) -> dict[str, Any] | None:
    planner = ENTITY_PLANNERS.get(entity)
    if not planner:
        return None
    return planner(message, resources)


def _plan_routing_rule_action(message: str, resources: dict[str, list[Any]]) -> dict[str, Any] | None:
    rules: list[RoutingRule] = resources["routing_rules"]
    destinations: list[Node] = [node for node in resources["nodes"] if node.node_type == "destination" and node.is_active]
    text = message.strip()
    if not RULE_CHANGE_RE.search(text):
        return None

    if re.search(r"\b(delete|remove)\b", text, re.IGNORECASE):
        rule = _resolve_rule(text, rules)
        if not rule:
            return None
        return {
            "entity_type": "routing_rule",
            "action_type": "delete",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Delete routing rule “{rule.name}”",
            "confirm_label": "Delete rule",
            "role_required": "admin",
            "payload": {},
            "details": [
                _detail("Rule", rule.name),
                _detail("Condition", f"{rule.condition_tag} {rule.condition_operator} {rule.condition_value}"),
                _detail("Destinations", ", ".join(_routing_dest_names(rule, destinations)) or "None"),
            ],
            "proposal_text": f"I can delete the routing rule “{rule.name}”. Review the details below and confirm to apply this change.",
        }

    if re.search(r"\b(disable|deactivate|turn\s+off)\b", text, re.IGNORECASE):
        rule = _resolve_rule(text, rules)
        if not rule:
            return None
        return {
            "entity_type": "routing_rule",
            "action_type": "toggle",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Disable routing rule “{rule.name}”",
            "confirm_label": "Disable rule",
            "role_required": "admin",
            "payload": {"is_active": False},
            "details": [_detail("Rule", rule.name), _detail("New state", "Disabled")],
            "proposal_text": f"I can disable the routing rule “{rule.name}”. Studies will no longer match it until it is re-enabled.",
        }

    if re.search(r"\b(enable|activate|turn\s+on)\b", text, re.IGNORECASE):
        rule = _resolve_rule(text, rules)
        if not rule:
            return None
        return {
            "entity_type": "routing_rule",
            "action_type": "toggle",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Enable routing rule “{rule.name}”",
            "confirm_label": "Enable rule",
            "role_required": "admin",
            "payload": {"is_active": True},
            "details": [_detail("Rule", rule.name), _detail("New state", "Enabled")],
            "proposal_text": f"I can enable the routing rule “{rule.name}”. Review the details below and confirm.",
        }

    if not re.search(r"\b(add|create|new|route|send|update|edit)\b", text, re.IGNORECASE):
        return None
    modality = _extract_modality(text)
    destination = _resolve_node(text, destinations, node_type="destination")
    if not modality or not destination:
        return None
    existing = next(
        (
            rule
            for rule in rules
            if rule.condition_tag == "Modality"
            and rule.condition_operator == "equals"
            and rule.condition_value.upper() == modality
            and destination.id in rule.destination_node_ids
        ),
        None,
    )
    if existing:
        return {
            "entity_type": "routing_rule",
            "action_type": "update",
            "target_id": str(existing.id),
            "target_name": existing.name,
            "summary": f"Ensure routing rule “{existing.name}” is active",
            "confirm_label": "Apply change",
            "role_required": "admin",
            "payload": {"is_active": True},
            "details": [_detail("Rule", existing.name), _detail("New state", "Enabled")],
            "proposal_text": f"A matching rule already exists for {modality} to {destination.name}. I can ensure it stays active.",
        }
    name = f"Route {modality} to {destination.name}"
    return {
        "entity_type": "routing_rule",
        "action_type": "create",
        "target_name": name,
        "summary": f"Create routing rule “{name}”",
        "confirm_label": "Create rule",
        "role_required": "admin",
        "payload": {
            "name": name,
            "condition_tag": "Modality",
            "condition_operator": "equals",
            "condition_value": modality,
            "destination_node_ids": [str(destination.id)],
            "tag_morphing_rule_ids": None,
            "priority": 100,
            "is_active": True,
        },
        "details": [
            _detail("Rule", name),
            _detail("Condition", f"Modality equals {modality}"),
            _detail("Destination", destination.name),
            _detail("Priority", 100),
        ],
        "proposal_text": f"I can create a routing rule to send {modality} studies to {destination.name}. Review the details below and confirm.",
    }


def _parse_migration_filters(message: str) -> dict[str, Any] | None:
    modality = _extract_modality(message)
    if not modality:
        return None
    return {"modality": modality}


def _plan_migration_job_action(message: str, resources: dict[str, list[Any]]) -> dict[str, Any] | None:
    jobs: list[MigrationJob] = resources["migration_jobs"]
    nodes: list[Node] = resources["nodes"]
    text = message.strip()
    if not JOB_CHANGE_RE.search(text):
        return None

    if re.search(r"\b(start|run|initiate)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        return {
            "entity_type": "migration_job",
            "action_type": "start",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Start migration job “{job.name}”",
            "confirm_label": "Start job",
            "role_required": "operator",
            "payload": {},
            "details": [_detail("Job", job.name), _detail("Current status", job.status)],
            "proposal_text": f"I can start the migration job “{job.name}”. Confirm below to begin discovery and migration.",
        }
    if re.search(r"\b(pause)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        return {
            "entity_type": "migration_job",
            "action_type": "pause",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Pause migration job “{job.name}”",
            "confirm_label": "Pause job",
            "role_required": "operator",
            "payload": {},
            "details": [_detail("Job", job.name), _detail("Current status", job.status)],
            "proposal_text": f"I can pause the migration job “{job.name}”. Confirm below to apply.",
        }
    if re.search(r"\b(resume)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        return {
            "entity_type": "migration_job",
            "action_type": "resume",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Resume migration job “{job.name}”",
            "confirm_label": "Resume job",
            "role_required": "operator",
            "payload": {},
            "details": [_detail("Job", job.name), _detail("Current status", job.status)],
            "proposal_text": f"I can resume the migration job “{job.name}”. Confirm below to continue processing.",
        }
    if re.search(r"\b(cancel)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        return {
            "entity_type": "migration_job",
            "action_type": "cancel",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Cancel migration job “{job.name}”",
            "confirm_label": "Cancel job",
            "role_required": "operator",
            "payload": {},
            "details": [_detail("Job", job.name), _detail("Current status", job.status)],
            "proposal_text": f"I can cancel the migration job “{job.name}”. Confirm below to stop further processing.",
        }
    if re.search(r"\b(retry|re-?try)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        limit_match = re.search(r"\blimit\b\s+(\d+)", text, re.IGNORECASE)
        batch_limit = (
            max(1, min(int(limit_match.group(1)), 500))
            if limit_match
            else settings.migration_bulk_retry_limit
        )
        return {
            "entity_type": "migration_job",
            "action_type": "retry_failed",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Retry failed studies on “{job.name}”",
            "confirm_label": "Retry failed",
            "role_required": "operator",
            "payload": {"limit": batch_limit},
            "details": [
                _detail("Job", job.name),
                _detail("Current status", job.status),
                _detail("Batch limit", batch_limit),
            ],
            "proposal_text": (
                f"I can queue up to {batch_limit} failed or skipped studies for retry on “{job.name}”. "
                "Review below and confirm."
            ),
        }
    if re.search(r"\b(delete|remove)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        return {
            "entity_type": "migration_job",
            "action_type": "delete",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Delete migration job “{job.name}”",
            "confirm_label": "Delete job",
            "role_required": "operator",
            "payload": {},
            "details": [_detail("Job", job.name), _detail("Current status", job.status)],
            "proposal_text": f"I can delete the migration job “{job.name}”. Confirm below to remove the job and its study records.",
        }
    rename = re.search(r"\brename\b.+?\bjob\b.+?\bto\b\s+(.+)$", text, re.IGNORECASE)
    if rename:
        job = _resolve_job(text, jobs)
        new_name = _clean_value(rename.group(1))
        if not job or not new_name:
            return None
        return {
            "entity_type": "migration_job",
            "action_type": "update",
            "target_id": str(job.id),
            "target_name": job.name,
            "summary": f"Rename migration job “{job.name}”",
            "confirm_label": "Rename job",
            "role_required": "operator",
            "payload": {"name": new_name},
            "details": [_detail("Current name", job.name), _detail("New name", new_name)],
            "proposal_text": f"I can rename the migration job “{job.name}” to “{new_name}”. Confirm below to apply.",
        }
    if re.search(r"\b(duplicate|copy|clone)\b", text, re.IGNORECASE):
        job = _resolve_job(text, jobs)
        if not job:
            return None
        name_match = re.search(r"\b(?:as|named?|called)\s+['\"]?(.+?)['\"]?\s*$", text, re.IGNORECASE)
        new_name = _clean_value(name_match.group(1)) if name_match else f"{job.name} (copy)"
        nodes_by_id = {node.id: node for node in nodes}
        source = nodes_by_id.get(job.source_node_id)
        destination = nodes_by_id.get(job.destination_node_id)
        job_config = job.job_config or {"filters": None, "tag_morphing_rule_ids": None, "qido_limit": 100}
        payload: dict[str, Any] = {
            "name": new_name,
            "source_node_id": str(job.source_node_id),
            "destination_node_id": str(job.destination_node_id),
            "job_type": job.job_type,
            "job_config": job_config,
        }
        details = [
            _detail("New job", new_name),
            _detail("Duplicated from", job.name),
            _detail("Source", source.name if source else str(job.source_node_id)),
            _detail("Destination", destination.name if destination else str(job.destination_node_id)),
            _detail("Type", job.job_type),
        ]
        return {
            "entity_type": "migration_job",
            "action_type": "create",
            "target_id": str(job.id),
            "target_name": new_name,
            "summary": f"Duplicate migration job “{job.name}”",
            "confirm_label": "Duplicate job",
            "role_required": "operator",
            "payload": payload,
            "details": details,
            "proposal_text": (
                f"I can duplicate “{job.name}” as “{new_name}” with the same source, destination, and filters. "
                "Review the details below and confirm."
            ),
        }

    if not re.search(r"\b(create|add|new|migrate)\b", text, re.IGNORECASE):
        return None
    source = _resolve_node(text, nodes, node_type="source")
    destination = _resolve_node(text, nodes, node_type="destination")
    if not source or not destination:
        return None
    job_type = _extract_job_type(text)
    filters = _parse_migration_filters(text)
    job_name = f"{source.name} → {destination.name}"
    payload: dict[str, Any] = {
        "name": job_name,
        "source_node_id": str(source.id),
        "destination_node_id": str(destination.id),
        "job_type": job_type,
        "job_config": {"filters": filters, "tag_morphing_rule_ids": None, "qido_limit": 100},
    }
    details = [
        _detail("Job", job_name),
        _detail("Source", source.name),
        _detail("Destination", destination.name),
        _detail("Type", job_type),
    ]
    if filters and filters.get("modality"):
        details.append(_detail("Filter", f"Modality = {filters['modality']}"))
    return {
        "entity_type": "migration_job",
        "action_type": "create",
        "target_name": job_name,
        "summary": f"Create migration job “{job_name}”",
        "confirm_label": "Create job",
        "role_required": "operator",
        "payload": payload,
        "details": details,
        "proposal_text": f"I can create a {job_type} migration job from {source.name} to {destination.name}. Review the details below and confirm.",
    }


def _parse_node_create(message: str) -> dict[str, Any] | None:
    text = message.strip()
    node_type = (
        "source"
        if re.search(r"\bsource\b", text, re.IGNORECASE)
        else "destination"
        if re.search(r"\bdestination\b", text, re.IGNORECASE)
        else None
    )
    name_match = re.search(r"\bnamed\s+['\"]?(.+?)['\"]?\s+at\s+", text, re.IGNORECASE)
    if not name_match:
        name_match = re.search(r"\bnamed\s+(.+?)(?:\s+(?:at|with|on)\s+)", text, re.IGNORECASE)
    if not name_match or not node_type:
        return None

    name = _clean_value(name_match.group(1))
    url_match = re.search(r"(https?://[^\s'\"]+)", text, re.IGNORECASE)
    port_match = re.search(r"\bport\b\s+(\d+)", text, re.IGNORECASE)
    ae_match = re.search(r"\bae(?:\s+title)?\b\s+([A-Za-z0-9_\-]+)", text, re.IGNORECASE)

    if url_match:
        dicomweb_url = _clean_value(url_match.group(1).rstrip(".,;"))
        host_part = dicomweb_url.split("://", 1)[-1].split("/")[0]
        host = host_part.split(":")[0]
        port = int(host_part.split(":")[1]) if ":" in host_part else (int(port_match.group(1)) if port_match else None)
        return {
            "name": name,
            "node_type": node_type,
            "protocol": "DICOMweb",
            "host": host,
            "port": port,
            "ae_title": _clean_value(ae_match.group(1)) if ae_match else None,
            "dicomweb_url": dicomweb_url,
            "auth_type": "none",
            "auth_config": None,
            "is_active": True,
        }

    protocol = (
        "DICOMweb"
        if re.search(r"\bdicomweb\b", text, re.IGNORECASE)
        else "DIMSE"
        if re.search(r"\bdimse\b", text, re.IGNORECASE)
        else None
    )
    host_match = re.search(r"\bat\s+([\d.]+|[\w.\-]+)(?::(\d+))?", text, re.IGNORECASE)
    if not protocol or not host_match:
        return None

    host = _clean_value(host_match.group(1))
    port = int(host_match.group(2)) if host_match.group(2) else (int(port_match.group(1)) if port_match else None)
    return {
        "name": name,
        "node_type": node_type,
        "protocol": protocol,
        "host": host,
        "port": port,
        "ae_title": _clean_value(ae_match.group(1)) if ae_match else None,
        "dicomweb_url": f"http://{host}/dicom-web" if protocol == "DICOMweb" else None,
        "auth_type": "none",
        "auth_config": None,
        "is_active": True,
    }


def _plan_node_action(message: str, resources: dict[str, list[Any]]) -> dict[str, Any] | None:
    nodes: list[Node] = resources["nodes"]
    text = message.strip()
    if not NODE_CHANGE_RE.search(text):
        return None

    if re.search(r"\b(test|echo)\b", text, re.IGNORECASE):
        node = _resolve_node(text, nodes)
        if not node:
            return None
        return {
            "entity_type": "node",
            "action_type": "echo",
            "target_id": str(node.id),
            "target_name": node.name,
            "summary": f"Test node connectivity for “{node.name}”",
            "confirm_label": "Run echo",
            "role_required": "admin",
            "payload": {},
            "details": [_detail("Node", node.name), _detail("Protocol", node.protocol)],
            "proposal_text": f"I can run a connectivity test for the node “{node.name}”. Confirm below to continue.",
        }
    if re.search(r"\b(delete|remove)\b", text, re.IGNORECASE):
        node = _resolve_node(text, nodes)
        if not node:
            return None
        return {
            "entity_type": "node",
            "action_type": "delete",
            "target_id": str(node.id),
            "target_name": node.name,
            "summary": f"Delete node “{node.name}”",
            "confirm_label": "Delete node",
            "role_required": "admin",
            "payload": {},
            "details": [_detail("Node", node.name), _detail("Type", node.node_type), _detail("Protocol", node.protocol)],
            "proposal_text": f"I can delete the node “{node.name}”. Confirm below to apply this change.",
        }
    rename = re.search(r"\brename\b.+?\bnode\b.+?\bto\b\s+(.+)$", text, re.IGNORECASE)
    if rename:
        node = _resolve_node(text, nodes)
        new_name = _clean_value(rename.group(1))
        if not node or not new_name:
            return None
        return {
            "entity_type": "node",
            "action_type": "update",
            "target_id": str(node.id),
            "target_name": node.name,
            "summary": f"Rename node “{node.name}”",
            "confirm_label": "Rename node",
            "role_required": "admin",
            "payload": {"name": new_name},
            "details": [_detail("Current name", node.name), _detail("New name", new_name)],
            "proposal_text": f"I can rename the node “{node.name}” to “{new_name}”. Confirm below to apply.",
        }
    if re.search(r"\b(disable|deactivate)\b", text, re.IGNORECASE):
        node = _resolve_node(text, nodes)
        if not node:
            return None
        return {
            "entity_type": "node",
            "action_type": "update",
            "target_id": str(node.id),
            "target_name": node.name,
            "summary": f"Disable node “{node.name}”",
            "confirm_label": "Disable node",
            "role_required": "admin",
            "payload": {"is_active": False},
            "details": [_detail("Node", node.name), _detail("New state", "Disabled")],
            "proposal_text": f"I can disable the node “{node.name}”. Confirm below to apply.",
        }
    if re.search(r"\b(enable|activate)\b", text, re.IGNORECASE):
        node = _resolve_node(text, nodes)
        if not node:
            return None
        return {
            "entity_type": "node",
            "action_type": "update",
            "target_id": str(node.id),
            "target_name": node.name,
            "summary": f"Enable node “{node.name}”",
            "confirm_label": "Enable node",
            "role_required": "admin",
            "payload": {"is_active": True},
            "details": [_detail("Node", node.name), _detail("New state", "Enabled")],
            "proposal_text": f"I can enable the node “{node.name}”. Confirm below to apply.",
        }
    if not re.search(r"\b(create|add|new)\b", text, re.IGNORECASE):
        return None
    payload = _parse_node_create(text)
    if not payload:
        return None
    return {
        "entity_type": "node",
        "action_type": "create",
        "target_name": payload["name"],
        "summary": f"Create node “{payload['name']}”",
        "confirm_label": "Create node",
        "role_required": "operator",
        "payload": payload,
        "details": [
            _detail("Node", payload["name"]),
            _detail("Type", payload["node_type"]),
            _detail("Protocol", payload["protocol"]),
            _detail("Host", payload["host"]),
            _detail("Port", payload["port"] or "None"),
            _detail("AE Title", payload["ae_title"] or "None"),
            _detail("DICOMweb URL", payload["dicomweb_url"] or "None"),
        ],
        "proposal_text": f"I can create the node “{payload['name']}”. Review the parsed connection details below and confirm.",
    }


def _parse_morph_create(message: str) -> dict[str, Any] | None:
    modality = _extract_modality(message)
    target_tag_match = re.search(r"\bset\b\s+([A-Za-z][A-Za-z0-9]+)\s+\bto\b\s+(.+)$", message, re.IGNORECASE)
    if not modality or not target_tag_match:
        return None
    target_tag = _clean_value(target_tag_match.group(1))
    new_value = _clean_value(target_tag_match.group(2))
    if target_tag not in VALID_TAGS or not new_value:
        return None
    return {
        "name": f"{modality} {target_tag} Update",
        "condition_tag": "Modality",
        "condition_operator": "equals",
        "condition_value": modality,
        "target_tag": target_tag,
        "new_value": new_value,
        "is_active": True,
    }


def _plan_tag_morph_action(message: str, resources: dict[str, list[Any]]) -> dict[str, Any] | None:
    rules: list[TagMorphingRule] = resources["tag_morphing_rules"]
    text = message.strip()
    if not TAG_MORPH_CHANGE_RE.search(text):
        return None

    if re.search(r"\b(delete|remove)\b", text, re.IGNORECASE):
        rule = _resolve_morph_rule(text, rules)
        if not rule:
            return None
        return {
            "entity_type": "tag_morphing",
            "action_type": "delete",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Delete tag morphing rule “{rule.name}”",
            "confirm_label": "Delete rule",
            "role_required": "admin",
            "payload": {},
            "details": [_detail("Rule", rule.name), _detail("Target tag", rule.target_tag)],
            "proposal_text": f"I can delete the tag morphing rule “{rule.name}”. Confirm below to apply.",
        }
    if re.search(r"\b(disable|deactivate)\b", text, re.IGNORECASE):
        rule = _resolve_morph_rule(text, rules)
        if not rule:
            return None
        return {
            "entity_type": "tag_morphing",
            "action_type": "update",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Disable tag morphing rule “{rule.name}”",
            "confirm_label": "Disable rule",
            "role_required": "admin",
            "payload": {"is_active": False},
            "details": [_detail("Rule", rule.name), _detail("New state", "Disabled")],
            "proposal_text": f"I can disable the tag morphing rule “{rule.name}”. Confirm below to apply.",
        }
    if re.search(r"\b(enable|activate)\b", text, re.IGNORECASE):
        rule = _resolve_morph_rule(text, rules)
        if not rule:
            return None
        return {
            "entity_type": "tag_morphing",
            "action_type": "update",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Enable tag morphing rule “{rule.name}”",
            "confirm_label": "Enable rule",
            "role_required": "admin",
            "payload": {"is_active": True},
            "details": [_detail("Rule", rule.name), _detail("New state", "Enabled")],
            "proposal_text": f"I can enable the tag morphing rule “{rule.name}”. Confirm below to apply.",
        }
    rename = re.search(r"\brename\b.+?\brule\b.+?\bto\b\s+(.+)$", text, re.IGNORECASE)
    if rename:
        rule = _resolve_morph_rule(text, rules)
        new_name = _clean_value(rename.group(1))
        if not rule or not new_name:
            return None
        return {
            "entity_type": "tag_morphing",
            "action_type": "update",
            "target_id": str(rule.id),
            "target_name": rule.name,
            "summary": f"Rename tag morphing rule “{rule.name}”",
            "confirm_label": "Rename rule",
            "role_required": "admin",
            "payload": {"name": new_name},
            "details": [_detail("Current name", rule.name), _detail("New name", new_name)],
            "proposal_text": f"I can rename the tag morphing rule “{rule.name}” to “{new_name}”. Confirm below to apply.",
        }
    if not re.search(r"\b(create|add|new)\b", text, re.IGNORECASE):
        return None
    payload = _parse_morph_create(text)
    if not payload:
        return None
    return {
        "entity_type": "tag_morphing",
        "action_type": "create",
        "target_name": payload["name"],
        "summary": f"Create tag morphing rule “{payload['name']}”",
        "confirm_label": "Create rule",
        "role_required": "admin",
        "payload": payload,
        "details": [
            _detail("Rule", payload["name"]),
            _detail("Condition", f"{payload['condition_tag']} {payload['condition_operator']} {payload['condition_value']}"),
            _detail("Target tag", payload["target_tag"]),
            _detail("New value", payload["new_value"]),
        ],
        "proposal_text": f"I can create a tag morphing rule for {payload['condition_value']} studies. Review the details below and confirm.",
    }


def detect_chat_action_intent(message: str, resources: dict[str, list[Any]]) -> dict[str, Any] | None:
    for planner in (_plan_migration_job_action, _plan_node_action, _plan_tag_morph_action, _plan_routing_rule_action):
        planned = planner(message, resources)
        if planned:
            return planned
    return None


ENTITY_PLANNERS.update(
    {
        "migration_job": _plan_migration_job_action,
        "node": _plan_node_action,
        "tag_morphing": _plan_tag_morph_action,
        "routing_rule": _plan_routing_rule_action,
    }
)


def detect_chat_action_intent_with_context(
    message: str,
    resources: dict[str, list[Any]],
    recent_messages: Sequence[Any] | None = None,
) -> dict[str, Any] | None:
    recent = list(recent_messages or [])
    prior = recent[:-1] if recent else []
    user_combined = build_user_action_text(recent) if recent else message.strip()
    full_combined = build_conversation_action_text(recent) if recent else message.strip()

    if CONFIRMATION_REPLY_RE.match(message.strip()) and len(recent) >= 2:
        active = _resolve_active_entity(message, prior)
        if active:
            planned = _plan_entity_action(active, full_combined, resources)
            if planned:
                return planned
        return None

    action = detect_chat_action_intent(message, resources)
    if action:
        return action

    active = _resolve_active_entity(message, prior)
    if active and recent:
        planned = _plan_entity_action(active, user_combined, resources)
        if planned:
            return planned
    return None


def action_followup_for_conversation(
    message: str,
    resources: dict[str, list[Any]],
    recent_messages: Sequence[Any] | None = None,
) -> str | None:
    """Ask for missing details when an action is in progress across multiple turns."""
    recent = list(recent_messages or [])
    prior = recent[:-1] if recent else []
    combined = build_user_action_text(recent) if recent else message.strip()
    if not combined:
        return None

    active = _resolve_active_entity(message, prior)
    if not active:
        return None

    if active == "migration_job":
        if re.search(r"\b(retry|re-?try)\b", combined, re.IGNORECASE):
            if not _resolve_job(combined, resources["migration_jobs"]):
                return (
                    "Which migration job should I retry failed studies for? "
                    "Example: Retry failed migration job MW PACS → Local PACS"
                )
        if re.search(r"\b(duplicate|copy|clone)\b", combined, re.IGNORECASE):
            if not _resolve_job(combined, resources["migration_jobs"]):
                return (
                    "Which migration job should I duplicate? Use the exact job name, for example: "
                    "Duplicate migration job [CR] - MW -> Local"
                )
        if re.search(r"\b(create|add|new|migrate)\b", combined, re.IGNORECASE):
            source = _resolve_node(combined, resources["nodes"], node_type="source")
            destination = _resolve_node(combined, resources["nodes"], node_type="destination")
            if not source and not destination:
                return "Which source and destination nodes should this migration job use?"
            if not source:
                return "Which source node should this migration job use?"
            if not destination:
                return "Which destination node should this migration job use?"

    if active == "node" and re.search(r"\b(create|add|new)\b", combined, re.IGNORECASE):
        if not re.search(r"\b(source|destination)\b", combined, re.IGNORECASE):
            return "Should this be a source node or a destination node?"
        if not _parse_node_create(combined):
            return "What should the node be named, and what is its URL or host? For example: Demo PACS at http://10.2.1.10/dicom-web"

    if active == "routing_rule" and re.search(r"\b(create|add|new|route|send)\b", combined, re.IGNORECASE):
        modality = _extract_modality(combined)
        destination = _resolve_node(combined, resources["nodes"], node_type="destination")
        if not modality:
            return "Which modality should this routing rule match? For example: CT, MR, or CR."
        if not destination:
            return "Which destination node should receive matching studies?"

    if active == "tag_morphing" and re.search(r"\b(create|add|new)\b", combined, re.IGNORECASE):
        if not _parse_morph_create(combined):
            return "Which modality, target tag, and new value should the rule use? For example: CT, InstitutionName, Demo Hospital"

    return None


def action_guidance_for_unmapped_request(message: str) -> str | None:
    """Return a specific hint when we detect intent but cannot build a confirmation card."""
    text = message.strip()
    if not text:
        return None

    if NODE_CHANGE_RE.search(text) and re.search(r"\b(create|add|new)\b", text, re.IGNORECASE):
        if not re.search(r"\b(source|destination)\b", text, re.IGNORECASE):
            return (
                "To create a node in chat, include whether it is a source or destination node, plus a name and URL or host. "
                "Example: Create a destination node named Demo PACS at http://10.2.1.10/dicom-web"
            )
        if not _parse_node_create(text):
            return (
                "I understood you want to create a node, but I still need a clear name and endpoint. "
                "Example: Create a destination node named Demo PACS at http://10.2.1.10/dicom-web"
            )

    if JOB_CHANGE_RE.search(text) and re.search(r"\b(duplicate|copy|clone)\b", text, re.IGNORECASE):
        return (
            "To duplicate a migration job in chat, name the job to copy. "
            "Example: Duplicate migration job [CR] - MW -> Local"
        )

    if JOB_CHANGE_RE.search(text) and re.search(r"\b(retry|re-?try)\b", text, re.IGNORECASE):
        return (
            "To retry failed studies in chat, name the migration job. "
            "Example: Retry failed migration job MW PACS → Local PACS"
        )

    if JOB_CHANGE_RE.search(text) and re.search(r"\b(create|add|new|migrate)\b", text, re.IGNORECASE):
        return (
            "To create a migration job in chat, name the source and destination nodes. "
            "Example: Create a historical migration job from MW PACS to Local PACS for CT"
        )

    if TAG_MORPH_CHANGE_RE.search(text) and re.search(r"\b(create|add|new)\b", text, re.IGNORECASE):
        return (
            "To create a tag morphing rule in chat, include the modality, target tag, and new value. "
            "Example: Create a tag morphing rule for CT to set InstitutionName to Demo Hospital"
        )

    if RULE_CHANGE_RE.search(text) and re.search(r"\b(create|add|new|route|send)\b", text, re.IGNORECASE):
        return (
            "To create a routing rule in chat, include the modality and destination node. "
            "Example: Create a rule to route CT studies to Orthanc Cloud"
        )

    return None


async def _load_job_nodes(db: AsyncSession, jobs: Sequence[MigrationJob]) -> dict[UUID, Node]:
    node_ids = {job.source_node_id for job in jobs} | {job.destination_node_id for job in jobs}
    if not node_ids:
        return {}
    result = await db.execute(select(Node).where(Node.id.in_(node_ids)))
    return {node.id: node for node in result.scalars()}


def _job_response(job: MigrationJob, nodes: dict[UUID, Node]) -> MigrationJobResponse:
    source = nodes.get(job.source_node_id)
    dest = nodes.get(job.destination_node_id)
    return MigrationJobResponse(
        id=job.id,
        name=job.name,
        source_node_id=job.source_node_id,
        destination_node_id=job.destination_node_id,
        source_node_name=source.name if source else None,
        destination_node_name=dest.name if dest else None,
        job_type=job.job_type,
        status=job.status,
        total_studies=job.total_studies,
        completed_studies=job.completed_studies,
        failed_studies=job.failed_studies,
        retry_count=job.retry_count,
        job_config=job.job_config,
        celery_task_id=job.celery_task_id,
        discovery_offset=job.discovery_offset,
        discovery_complete=job.discovery_complete,
        discovered_studies=job.discovered_studies,
        created_by=job.created_by,
        start_time=job.start_time,
        end_time=job.end_time,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _validate_morphing_rule(payload: TagMorphingRuleCreate | TagMorphingRuleUpdate, is_create: bool) -> None:
    data = payload.model_dump() if is_create else payload.model_dump(exclude_unset=True)
    if data.get("condition_tag") and data["condition_tag"] not in VALID_TAGS:
        raise HTTPException(status_code=400, detail=f"Invalid condition_tag. Allowed: {sorted(VALID_TAGS)}")
    if data.get("condition_operator") and data["condition_operator"] not in VALID_OPERATORS:
        raise HTTPException(status_code=400, detail=f"Invalid operator. Allowed: {sorted(VALID_OPERATORS)}")
    if data.get("target_tag") and data["target_tag"] not in VALID_TAGS:
        raise HTTPException(status_code=400, detail=f"Invalid target_tag. Allowed: {sorted(VALID_TAGS)}")


async def _execute_routing_rule_action(
    db: AsyncSession,
    *,
    action_type: str,
    target_id: UUID | None,
    payload: dict[str, Any],
    user_id: str,
    user_roles: Sequence[str],
    request: Request | None,
) -> tuple[str, str]:
    _require_chat_role(user_roles, "admin")
    role = _primary_role(user_roles)
    ip = _ip_address(request)
    destinations = [node for node in (await load_action_resources(db))["nodes"] if node.node_type == "destination"]

    if action_type == "create":
        create_payload = RoutingRuleCreate.model_validate(payload)
        rule = RoutingRule(**create_payload.model_dump())
        db.add(rule)
        await db.flush()
        await db.refresh(rule)
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="RoutingRule", entity_id=rule.id, details={"action": "create", "name": rule.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="RoutingRule", entity_id=rule.id, details={"action": "create", "name": rule.name, "via": "chatbot"}, ip_address=ip)
        await invalidate_routing_rules_cache()
        invalidate_rules_cache()
        return f"Routing rule “{rule.name}” was created.", rule.name

    if not target_id:
        raise HTTPException(status_code=400, detail="target_id is required")
    rule = await db.get(RoutingRule, target_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Routing rule not found")

    if action_type == "delete":
        name = rule.name
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="RoutingRule", entity_id=rule.id, details={"action": "delete", "name": name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="RoutingRule", entity_id=rule.id, details={"action": "delete", "name": name, "via": "chatbot"}, ip_address=ip)
        await db.delete(rule)
        await invalidate_routing_rules_cache()
        invalidate_rules_cache()
        return f"Routing rule “{name}” was deleted.", name

    update_payload = RoutingRuleUpdate.model_validate(payload)
    for key, value in update_payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)
    action_name = "toggle" if action_type == "toggle" else "update"
    await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="RoutingRule", entity_id=rule.id, details={"action": action_name, "name": rule.name, "via": "chatbot"}, ip_address=ip)
    await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="RoutingRule", entity_id=rule.id, details={"action": "update", "name": rule.name, "via": "chatbot"}, ip_address=ip)
    await invalidate_routing_rules_cache()
    invalidate_rules_cache()
    state = "enabled" if rule.is_active else "disabled"
    return (f"Routing rule “{rule.name}” is now {state}." if action_type == "toggle" else f"Routing rule “{rule.name}” was updated."), rule.name


async def _execute_migration_job_action(
    db: AsyncSession,
    *,
    action_type: str,
    target_id: UUID | None,
    payload: dict[str, Any],
    user_id: str,
    username: str | None,
    user_roles: Sequence[str],
    request: Request | None,
) -> tuple[str, str]:
    _require_chat_role(user_roles, "operator")
    role = ",".join(user_roles)
    ip = _ip_address(request)

    if action_type == "create":
        create_payload = MigrationJobCreate.model_validate(payload)
        source = await db.get(Node, create_payload.source_node_id)
        dest = await db.get(Node, create_payload.destination_node_id)
        if not source or not source.is_active:
            raise HTTPException(status_code=400, detail="Source node not found or inactive")
        if not dest or not dest.is_active:
            raise HTTPException(status_code=400, detail="Destination node not found or inactive")
        if not source.dicomweb_url or not dest.dicomweb_url:
            raise HTTPException(status_code=400, detail="Migration jobs require DICOMweb source and destination nodes")
        job = MigrationJob(
            name=create_payload.name,
            source_node_id=create_payload.source_node_id,
            destination_node_id=create_payload.destination_node_id,
            job_type=create_payload.job_type,
            status="not_started",
            job_config=create_payload.job_config.model_dump(mode="json") if create_payload.job_config else {},
            created_by=username or "chatbot",
        )
        db.add(job)
        await db.flush()
        await db.refresh(job)
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "create", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "create", "name": job.name, "job_type": job.job_type, "via": "chatbot"}, ip_address=ip)
        return f"Migration job “{job.name}” was created.", job.name

    if not target_id:
        raise HTTPException(status_code=400, detail="target_id is required")
    job = await db.get(MigrationJob, target_id)
    if not job:
        raise HTTPException(status_code=404, detail="Migration job not found")

    if action_type == "delete":
        if job.status in ("in_progress", "discovering", "paused"):
            raise HTTPException(status_code=400, detail="Cannot delete a running migration job. Cancel it first.")
        study_count = await db.scalar(select(func.count()).select_from(MigrationStudyRecord).where(MigrationStudyRecord.job_id == target_id))
        await db.execute(delete(MigrationStudyRecord).where(MigrationStudyRecord.job_id == target_id))
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "delete", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "delete", "name": job.name, "study_records_removed": study_count or 0, "via": "chatbot"}, ip_address=ip)
        name = job.name
        await db.delete(job)
        return f"Migration job “{name}” was deleted.", name

    if action_type == "update":
        if job.status in ("in_progress", "discovering", "paused"):
            raise HTTPException(status_code=400, detail="Cannot edit a migration job while it is running.")
        for key, value in payload.items():
            if key in {"name", "job_type", "source_node_id", "destination_node_id", "job_config"}:
                setattr(job, key, value)
        await db.flush()
        await db.refresh(job)
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "update", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "update", "name": job.name, "via": "chatbot"}, ip_address=ip)
        return f"Migration job “{job.name}” was updated.", job.name

    if action_type == "start":
        restartable = job.status in ("not_started", "failed", "partial", "cancelled") or (job.status == "completed" and (job.total_studies or 0) == 0)
        if not restartable:
            raise HTTPException(status_code=400, detail=f"Cannot start job in status '{job.status}'")
        await ensure_no_other_active_migration_job(db, job.id)
        source = await db.get(Node, job.source_node_id)
        destination = await db.get(Node, job.destination_node_id)
        if not source or not destination:
            raise HTTPException(status_code=400, detail="Source or destination node not found")
        echo_results = await verify_migration_node_connectivity(source, destination)
        task_id = enqueue_fetch_and_enqueue_studies(str(job.id))
        job.celery_task_id = task_id
        job.status = "discovering" if settings.migration_streaming_discovery else "in_progress"
        job.end_time = None
        init_job_counters(job.id, completed=job.completed_studies or 0, failed=job.failed_studies or 0)
        await db.flush()
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "start", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "JOB_STATUS_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "start", "celery_task_id": task_id, "preflight_echo": echo_results if settings.migration_preflight_echo else None}, ip_address=ip)
        return f"Migration job “{job.name}” was started.", job.name

    if action_type == "pause":
        if job.status not in ("in_progress", "discovering"):
            raise HTTPException(status_code=400, detail=f"Cannot pause job in status '{job.status}'")
        job.status = "paused"
        await db.flush()
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "pause", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "JOB_STATUS_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "pause"}, ip_address=ip)
        return f"Migration job “{job.name}” was paused.", job.name

    if action_type == "resume":
        if job.status != "paused":
            raise HTTPException(status_code=400, detail=f"Cannot resume job in status '{job.status}'")
        await ensure_no_other_active_migration_job(db, job.id)
        task_id = enqueue_fetch_and_enqueue_studies(str(job.id))
        job.celery_task_id = task_id
        job.status = "discovering" if not job.discovery_complete else "in_progress"
        job.end_time = None
        await db.flush()
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "resume", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "JOB_STATUS_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "resume", "celery_task_id": task_id}, ip_address=ip)
        return f"Migration job “{job.name}” was resumed.", job.name

    if action_type == "cancel":
        if job.status in ("completed", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Cannot cancel job in status '{job.status}'")
        job.status = "cancelled"
        if job.end_time is None:
            job.end_time = datetime.now(timezone.utc)
        await db.flush()
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "cancel", "name": job.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "JOB_STATUS_CHANGE", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "cancel"}, ip_address=ip)
        return f"Migration job “{job.name}” was cancelled.", job.name

    if action_type == "retry_failed":
        batch_limit = max(1, min(int(payload.get("limit", settings.migration_bulk_retry_limit)), 500))
        result = await db.execute(
            select(MigrationStudyRecord)
            .where(MigrationStudyRecord.job_id == job.id)
            .where(MigrationStudyRecord.status.in_(("failed", "skipped")))
            .order_by(MigrationStudyRecord.created_at.asc())
            .limit(batch_limit)
        )
        records = list(result.scalars().all())
        if not records:
            return f"No failed studies were available to retry for “{job.name}”.", job.name
        study_uids: list[str] = []
        for record in records:
            record.status = "pending"
            record.failure_reason = None
            record.completed_at = None
            study_uids.append(record.study_uid)
        job.retry_count += len(records)
        if job.status in ("failed", "partial", "completed", "cancelled", "paused"):
            job.status = "in_progress"
            job.end_time = None
        await db.flush()
        for study_uid in study_uids:
            wait_for_migration_queue_slot()
            enqueue_migrate_study(str(job.id), study_uid)
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "retry_failed", "count": len(records), "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "RETRY_ATTEMPT", user_id=user_id, user_role=role, entity_type="MigrationJob", entity_id=job.id, details={"action": "retry_failed_bulk", "count": len(records), "study_uids": study_uids[:50]})
        return f"Queued {len(records)} failed studies for retry on “{job.name}”.", job.name

    raise HTTPException(status_code=400, detail=f"Unsupported migration job action '{action_type}'")


async def _execute_node_action(
    db: AsyncSession,
    *,
    action_type: str,
    target_id: UUID | None,
    payload: dict[str, Any],
    user_id: str,
    user_roles: Sequence[str],
    request: Request | None,
) -> tuple[str, str]:
    required = "operator" if action_type == "create" else "admin"
    _require_chat_role(user_roles, required)
    role = _primary_role(user_roles)
    ip = _ip_address(request)

    if action_type == "create":
        create_payload = NodeCreate.model_validate(payload)
        node = Node(**create_payload.model_dump())
        db.add(node)
        await db.flush()
        await db.refresh(node)
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="Node", entity_id=node.id, details={"action": "create", "name": node.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="Node", entity_id=node.id, details={"action": "create", "name": node.name, "node_type": node.node_type, "via": "chatbot"}, ip_address=ip)
        await refresh_allowed_calling_aets()
        return f"Node “{node.name}” was created.", node.name

    if not target_id:
        raise HTTPException(status_code=400, detail="target_id is required")
    node = await db.get(Node, target_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if action_type == "delete":
        name = node.name
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="Node", entity_id=node.id, details={"action": "delete", "name": name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="Node", entity_id=node.id, details={"action": "delete", "name": name, "via": "chatbot"}, ip_address=ip)
        await db.delete(node)
        await refresh_allowed_calling_aets()
        return f"Node “{name}” was deleted.", name

    if action_type == "echo":
        result = await probe_node_connectivity(node)
        return f"Connectivity test for “{node.name}”: {result['message']}", node.name

    update_payload = NodeUpdate.model_validate(payload)
    for key, value in update_payload.model_dump(exclude_unset=True).items():
        setattr(node, key, value)
    await db.flush()
    await db.refresh(node)
    await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="Node", entity_id=node.id, details={"action": "update", "name": node.name, "via": "chatbot"}, ip_address=ip)
    await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="Node", entity_id=node.id, details={"action": "update", "name": node.name, "via": "chatbot"}, ip_address=ip)
    await refresh_allowed_calling_aets()
    return f"Node “{node.name}” was updated.", node.name


async def _execute_tag_morph_action(
    db: AsyncSession,
    *,
    action_type: str,
    target_id: UUID | None,
    payload: dict[str, Any],
    user_id: str,
    user_roles: Sequence[str],
    request: Request | None,
) -> tuple[str, str]:
    _require_chat_role(user_roles, "admin")
    role = _primary_role(user_roles)
    ip = _ip_address(request)

    if action_type == "create":
        create_payload = TagMorphingRuleCreate.model_validate(payload)
        _validate_morphing_rule(create_payload, is_create=True)
        rule = TagMorphingRule(**create_payload.model_dump())
        db.add(rule)
        await db.flush()
        await db.refresh(rule)
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="TagMorphingRule", entity_id=rule.id, details={"action": "create", "name": rule.name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="TagMorphingRule", entity_id=rule.id, details={"action": "create", "name": rule.name, "via": "chatbot"}, ip_address=ip)
        return f"Tag morphing rule “{rule.name}” was created.", rule.name

    if not target_id:
        raise HTTPException(status_code=400, detail="target_id is required")
    rule = await db.get(TagMorphingRule, target_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Tag morphing rule not found")

    if action_type == "delete":
        name = rule.name
        await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="TagMorphingRule", entity_id=rule.id, details={"action": "delete", "name": name, "via": "chatbot"}, ip_address=ip)
        await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="TagMorphingRule", entity_id=rule.id, details={"action": "delete", "name": name, "via": "chatbot"}, ip_address=ip)
        await db.delete(rule)
        return f"Tag morphing rule “{name}” was deleted.", name

    update_payload = TagMorphingRuleUpdate.model_validate(payload)
    _validate_morphing_rule(update_payload, is_create=False)
    for key, value in update_payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, value)
    await db.flush()
    await db.refresh(rule)
    await AuditLogger.log(db, "CHATBOT_ACTION", user_id=user_id, user_role=role, entity_type="TagMorphingRule", entity_id=rule.id, details={"action": "update", "name": rule.name, "via": "chatbot"}, ip_address=ip)
    await AuditLogger.log(db, "CONFIG_CHANGE", user_id=user_id, user_role=role, entity_type="TagMorphingRule", entity_id=rule.id, details={"action": "update", "name": rule.name, "via": "chatbot"}, ip_address=ip)
    return f"Tag morphing rule “{rule.name}” was updated.", rule.name


async def execute_chat_action(
    db: AsyncSession,
    *,
    entity_type: str,
    action_type: str,
    target_id: UUID | None,
    payload: dict[str, Any],
    user_id: str,
    username: str | None,
    user_roles: Sequence[str],
    request: Request | None,
) -> tuple[str, str]:
    if entity_type not in ENTITY_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported entity type '{entity_type}'")
    if entity_type == "routing_rule":
        return await _execute_routing_rule_action(
            db,
            action_type=action_type,
            target_id=target_id,
            payload=payload,
            user_id=user_id,
            user_roles=user_roles,
            request=request,
        )
    if entity_type == "migration_job":
        return await _execute_migration_job_action(
            db,
            action_type=action_type,
            target_id=target_id,
            payload=payload,
            user_id=user_id,
            username=username,
            user_roles=user_roles,
            request=request,
        )
    if entity_type == "node":
        return await _execute_node_action(
            db,
            action_type=action_type,
            target_id=target_id,
            payload=payload,
            user_id=user_id,
            user_roles=user_roles,
            request=request,
        )
    return await _execute_tag_morph_action(
        db,
        action_type=action_type,
        target_id=target_id,
        payload=payload,
        user_id=user_id,
        user_roles=user_roles,
        request=request,
    )
