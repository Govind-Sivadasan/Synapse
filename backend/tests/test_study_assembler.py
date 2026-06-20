"""Unit tests for per-association DICOM study assembly."""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from app.dimse.study_assembler import StudyAssembler


def _make_dataset(study_uid: str, sop_uid: str, modality: str = "CT") -> Dataset:
    sop_class = "1.2.840.10008.5.1.4.1.1.2"
    ds = Dataset()
    ds.file_meta = FileMetaDataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta.MediaStorageSOPClassUID = sop_class
    ds.file_meta.MediaStorageSOPInstanceUID = sop_uid
    ds.SOPClassUID = sop_class
    ds.SOPInstanceUID = sop_uid
    ds.StudyInstanceUID = study_uid
    ds.SeriesInstanceUID = generate_uid()
    ds.Modality = modality
    ds.PatientID = "TEST001"
    ds.StudyDate = "20260101"
    ds.InstitutionName = "Test Hospital"
    return ds


def _fake_assoc():
    return MagicMock()


def test_register_instances_groups_by_study_uid():
    with tempfile.TemporaryDirectory() as tmp:
        assembler = StudyAssembler(Path(tmp))
        assoc = _fake_assoc()
        study_uid = generate_uid()

        assembler.register_instance(_make_dataset(study_uid, generate_uid()), assoc)
        assembler.register_instance(_make_dataset(study_uid, generate_uid()), assoc)

        studies = assembler.on_association_released(assoc)
        assert len(studies) == 1
        assert studies[0].study_uid == study_uid
        assert len(studies[0].instance_paths) == 2
        assert studies[0].metadata["Modality"] == "CT"
        assert studies[0].metadata["PatientID"] == "TEST001"


def test_register_instances_aggregates_modalities():
    with tempfile.TemporaryDirectory() as tmp:
        assembler = StudyAssembler(Path(tmp))
        assoc = _fake_assoc()
        study_uid = generate_uid()

        assembler.register_instance(_make_dataset(study_uid, generate_uid(), modality="CT"), assoc)
        assembler.register_instance(_make_dataset(study_uid, generate_uid(), modality="SR"), assoc)

        studies = assembler.on_association_released(assoc)
        assert len(studies) == 1
        assert studies[0].metadata["Modality"] == "CT,SR"


def test_finalize_study_collects_all_instances_on_disk():
    with tempfile.TemporaryDirectory() as tmp:
        assembler = StudyAssembler(Path(tmp))
        study_uid = generate_uid()
        assoc_a = _fake_assoc()
        assoc_b = _fake_assoc()

        assembler.register_instance(_make_dataset(study_uid, generate_uid(), modality="CT"), assoc_a)
        assembler.on_association_released(assoc_a)
        assembler.register_instance(_make_dataset(study_uid, generate_uid(), modality="SR"), assoc_b)

        finalized = assembler.finalize_study(study_uid)
        assert len(finalized.instance_paths) == 2
        assert finalized.metadata["Modality"] == "CT,SR"


def test_concurrent_associations_are_isolated():
    with tempfile.TemporaryDirectory() as tmp:
        assembler = StudyAssembler(Path(tmp))
        assoc_a = _fake_assoc()
        assoc_b = _fake_assoc()
        study_a = generate_uid()
        study_b = generate_uid()

        assembler.register_instance(_make_dataset(study_a, generate_uid()), assoc_a)
        assembler.register_instance(_make_dataset(study_b, generate_uid()), assoc_b)

        studies_a = assembler.on_association_released(assoc_a)
        studies_b = assembler.on_association_released(assoc_b)

        assert len(studies_a) == 1
        assert studies_a[0].study_uid == study_a
        assert len(studies_b) == 1
        assert studies_b[0].study_uid == study_b


def test_discard_association_clears_buffer():
    with tempfile.TemporaryDirectory() as tmp:
        assembler = StudyAssembler(Path(tmp))
        assoc = _fake_assoc()
        study_uid = generate_uid()

        assembler.register_instance(_make_dataset(study_uid, generate_uid()), assoc)
        assembler.discard_association(assoc)

        studies = assembler.on_association_released(assoc)
        assert studies == []
