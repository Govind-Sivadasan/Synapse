"""Generate minimal DICOM test files for DIMSE E2E testing."""

import argparse
from pathlib import Path

from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid


def create_test_instance(
    output_dir: Path,
    modality: str = "CT",
    patient_id: str = "SYNAPSE_TEST",
    institution: str = "Synapse Test Hospital",
    count: int = 1,
) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    study_uid = generate_uid()
    series_uid = generate_uid()
    paths: list[Path] = []

    for i in range(count):
        ds = Dataset()
        ds.file_meta = FileMetaDataset()
        ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
        ds.file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
        ds.file_meta.MediaStorageSOPInstanceUID = generate_uid()

        ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
        ds.SOPInstanceUID = generate_uid()
        ds.StudyInstanceUID = study_uid
        ds.SeriesInstanceUID = series_uid
        ds.Modality = modality
        ds.PatientID = patient_id
        ds.PatientName = "Synapse^Test"
        ds.StudyDate = "20260612"
        ds.StudyDescription = f"Synapse E2E {modality} Test"
        ds.InstitutionName = institution
        ds.AccessionNumber = f"ACC-E2E-{i + 1:03d}"
        ds.BodyPartExamined = "CHEST"

        path = output_dir / f"test_{modality.lower()}_{i + 1:03d}.dcm"
        ds.save_as(path, write_like_original=False)
        paths.append(path)
        print(f"Created {path} (StudyUID={study_uid})")

    return paths


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate test DICOM files")
    parser.add_argument("--output", default="./test_dicom", help="Output directory")
    parser.add_argument("--modality", default="CT", help="DICOM Modality")
    parser.add_argument("--instances", type=int, default=3, help="Number of instances in study")
    args = parser.parse_args()
    create_test_instance(Path(args.output), modality=args.modality, count=args.instances)
