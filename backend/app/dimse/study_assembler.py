"""Assembles DICOM instances into complete studies on association release."""

from dataclasses import dataclass, field
from pathlib import Path

import pydicom


@dataclass
class AssembledStudy:
    study_uid: str
    instance_paths: list[Path] = field(default_factory=list)
    metadata: dict[str, str] = field(default_factory=dict)


class StudyAssembler:
    """Groups incoming instances by Study Instance UID within an association."""

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
        self._study_map: dict[str, list[Path]] = {}
        self._metadata_map: dict[str, dict[str, str]] = {}

    def register_instance(self, dataset: pydicom.Dataset, assoc) -> int:
        study_uid = str(dataset.StudyInstanceUID)
        sop_uid = str(dataset.SOPInstanceUID)

        study_dir = self.temp_path / study_uid
        study_dir.mkdir(parents=True, exist_ok=True)
        file_path = study_dir / f"{sop_uid}.dcm"
        dataset.save_as(file_path, write_like_original=False)

        self._study_map.setdefault(study_uid, []).append(file_path)
        if study_uid not in self._metadata_map:
            self._metadata_map[study_uid] = self._extract_metadata(dataset)
        return 0x0000

    def on_association_released(self, calling_ae: str) -> list[AssembledStudy]:
        studies: list[AssembledStudy] = []
        for study_uid, paths in self._study_map.items():
            studies.append(
                AssembledStudy(
                    study_uid=study_uid,
                    instance_paths=paths.copy(),
                    metadata=self._metadata_map.get(study_uid, {}),
                )
            )
        self._study_map.clear()
        self._metadata_map.clear()
        return studies

    def _extract_metadata(self, dataset: pydicom.Dataset) -> dict[str, str]:
        metadata: dict[str, str] = {}
        for tag_name in self.METADATA_TAGS:
            if hasattr(dataset, tag_name):
                value = getattr(dataset, tag_name)
                if value is not None:
                    metadata[tag_name] = str(value)
        return metadata
