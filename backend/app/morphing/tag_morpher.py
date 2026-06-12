"""DICOM tag morphing on dataset deep copies and file sets."""

import shutil
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pydicom
from pydicom.dataset import Dataset

from app.models.tag_morphing import TagMorphingRule
from app.services.rule_evaluator import evaluate_condition


@dataclass
class TagChange:
    tag: str
    original_value: str
    new_value: str


@dataclass
class TagMorphingAuditRecord:
    changes: list[TagChange] = field(default_factory=list)
    rules_applied: list[str] = field(default_factory=list)


class TagMorpher:
    def applies(self, rule: TagMorphingRule, metadata: dict[str, str]) -> bool:
        if not rule.condition_tag or not rule.condition_operator:
            return True
        return evaluate_condition(
            metadata,
            rule.condition_tag,
            rule.condition_operator,
            rule.condition_value or "",
        )

    def apply_morphing(
        self,
        dataset: Dataset,
        morphing_rules: list[TagMorphingRule],
        metadata: dict[str, str],
        context: dict | None = None,
    ) -> tuple[Dataset, TagMorphingAuditRecord]:
        morphed = dataset.copy()
        audit = TagMorphingAuditRecord()

        for rule in morphing_rules:
            if not rule.is_active:
                continue
            if not self.applies(rule, metadata):
                continue

            tag = rule.target_tag
            original = str(getattr(morphed, tag, "")) if hasattr(morphed, tag) else ""
            setattr(morphed, tag, rule.new_value)
            audit.changes.append(TagChange(tag=tag, original_value=original, new_value=rule.new_value))
            audit.rules_applied.append(rule.name)

        return morphed, audit

    def apply_to_files(
        self,
        file_paths: list[Path],
        morphing_rules: list[TagMorphingRule],
        metadata: dict[str, str],
        output_dir: Path | None = None,
    ) -> tuple[list[Path], TagMorphingAuditRecord]:
        if output_dir is None:
            output_dir = file_paths[0].parent / f"morphed_{uuid.uuid4().hex[:8]}"
        output_dir.mkdir(parents=True, exist_ok=True)

        combined_audit = TagMorphingAuditRecord()
        morphed_paths: list[Path] = []

        for file_path in file_paths:
            dataset = pydicom.dcmread(file_path)
            morphed_ds, audit = self.apply_morphing(dataset, morphing_rules, metadata)
            combined_audit.changes.extend(audit.changes)
            combined_audit.rules_applied.extend(audit.rules_applied)

            out_path = output_dir / file_path.name
            morphed_ds.save_as(out_path, enforce_file_format=True)
            morphed_paths.append(out_path)

        # Deduplicate rule names
        combined_audit.rules_applied = list(dict.fromkeys(combined_audit.rules_applied))
        return morphed_paths, combined_audit

    @staticmethod
    def cleanup_dir(path: Path) -> None:
        if path.exists() and path.is_dir() and "morphed_" in path.name:
            shutil.rmtree(path, ignore_errors=True)
