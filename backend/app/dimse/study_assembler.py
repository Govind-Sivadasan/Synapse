"""Assembles DICOM instances into complete studies per association."""

from dataclasses import dataclass, field
from pathlib import Path

import pydicom


@dataclass
class AssembledStudy:
    study_uid: str
    instance_paths: list[Path] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)


class StudyAssembler:
    """Groups incoming instances by Study Instance UID within a single DICOM association."""

    METADATA_TAGS = [
        "Modality",
        "PatientID",
        "StudyDate",
        "AccessionNumber",
        "StudyDescription",
        "InstitutionName",
        "ReferringPhysicianName",
        "BodyPartExamined",
    ]

    def __init__(self, temp_path: Path) -> None:
        self.temp_path = temp_path
        self._assoc_studies: dict[int, dict[str, list[Path]]] = {}
        self._assoc_metadata: dict[int, dict[str, dict[str, str]]] = {}

    @staticmethod
    def _association_key(assoc) -> int:
        return id(assoc)

    def register_instance(self, dataset: pydicom.Dataset, assoc) -> int:
        study_uid = str(dataset.StudyInstanceUID)
        sop_uid = str(dataset.SOPInstanceUID)
        assoc_key = self._association_key(assoc)

        study_dir = self.temp_path / study_uid
        study_dir.mkdir(parents=True, exist_ok=True)
        file_path = study_dir / f"{sop_uid}.dcm"
        dataset.save_as(file_path, enforce_file_format=True)

        studies = self._assoc_studies.setdefault(assoc_key, {})
        metadata_map = self._assoc_metadata.setdefault(assoc_key, {})
        studies.setdefault(study_uid, []).append(file_path)
        if study_uid not in metadata_map:
            metadata_map[study_uid] = self._extract_metadata(dataset)
        return 0x0000

    def on_association_released(self, assoc) -> list[AssembledStudy]:
        assoc_key = self._association_key(assoc)
        study_map = self._assoc_studies.pop(assoc_key, {})
        metadata_map = self._assoc_metadata.pop(assoc_key, {})

        studies: list[AssembledStudy] = []
        for study_uid, paths in study_map.items():
            studies.append(
                AssembledStudy(
                    study_uid=study_uid,
                    instance_paths=paths.copy(),
                    metadata=metadata_map.get(study_uid, {}),
                )
            )
        return studies

    def discard_association(self, assoc) -> None:
        assoc_key = self._association_key(assoc)
        self._assoc_studies.pop(assoc_key, None)
        self._assoc_metadata.pop(assoc_key, None)

    def _extract_metadata(self, dataset: pydicom.Dataset) -> dict[str, str]:
        metadata: dict[str, str] = {}
        for tag_name in self.METADATA_TAGS:
            if hasattr(dataset, tag_name):
                value = getattr(dataset, tag_name)
                if value is not None:
                    metadata[tag_name] = str(value)
        return metadata
