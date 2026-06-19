"""Phase 0 load test harness: inject routing traffic and report baseline metrics."""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid
from pynetdicom import AE
from pynetdicom.sop_class import Verification


def create_study_files(output_dir: Path, modality: str, instances: int) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    study_uid = generate_uid()
    series_uid = generate_uid()
    paths: list[Path] = []

    for index in range(instances):
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
        ds.PatientID = f"LOADTEST-{int(time.time())}"
        ds.PatientName = "Load^Test"
        ds.StudyDate = "20260615"
        ds.InstitutionName = "Synapse Load Test"
        ds.AccessionNumber = f"LOAD-{index + 1:04d}"

        path = output_dir / f"study_{study_uid[-8:]}_{index + 1:03d}.dcm"
        ds.save_as(path, write_like_original=False)
        paths.append(path)

    return paths


def send_study(
    host: str,
    port: int,
    called_ae: str,
    calling_ae: str,
    files: list[Path],
) -> bool:
    ae = AE(ae_title=calling_ae)
    for path in files:
        from pydicom import dcmread

        ds = dcmread(path)
        ae.add_requested_context(ds.SOPClassUID)

    assoc = ae.associate(host, port, ae_title=called_ae)
    if not assoc.is_established:
        return False

    ok = True
    for path in files:
        from pydicom import dcmread

        ds = dcmread(path)
        status = assoc.send_c_store(ds)
        ok = ok and bool(status and status.Status == 0x0000)

    assoc.release()
    return ok


def fetch_baseline(api_url: str) -> dict:
    url = f"{api_url.rstrip('/')}/api/v1/performance/baseline"
    with urllib.request.urlopen(url, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_queues(api_url: str, timeout_seconds: int, poll_seconds: float = 2.0) -> dict:
    deadline = time.time() + timeout_seconds
    last: dict = {}
    while time.time() < deadline:
        last = fetch_baseline(api_url)
        queues = last.get("queues", {})
        depth = int(queues.get("routing_queue", 0)) + int(queues.get("migration_queue", 0))
        if depth == 0:
            return last
        print(f"  queue depth routing={queues.get('routing_queue', 0)} migration={queues.get('migration_queue', 0)}")
        time.sleep(poll_seconds)
    return last


def print_summary(label: str, baseline: dict, elapsed_seconds: float, studies_sent: int) -> None:
    print(f"\n=== {label} ===")
    print(f"Elapsed: {elapsed_seconds:.1f}s")
    if studies_sent and elapsed_seconds > 0:
        print(f"Send rate: {studies_sent / elapsed_seconds * 60:.1f} studies/min")

    queues = baseline.get("queues", {})
    if queues:
        print("Queues:", json.dumps(queues, indent=2))

    counters = baseline.get("counters", {})
    if counters:
        print("Counters:")
        for key in sorted(counters):
            print(f"  {key}: {counters[key]}")

    histograms = baseline.get("histograms", {})
    if histograms:
        print("Histograms (avg seconds):")
        for key in sorted(histograms):
            avg = histograms[key].get("avg_seconds", 0)
            count = histograms[key].get("count", 0)
            print(f"  {key}: count={count}, avg={avg}s")


def main() -> int:
    parser = argparse.ArgumentParser(description="Synapse Phase 0 load test / baseline reporter")
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=11112)
    parser.add_argument("--called-ae", default="SYNAPSE")
    parser.add_argument("--calling-ae", default="LOADTEST")
    parser.add_argument("--studies", type=int, default=0, help="Number of studies to C-STORE (0 = report only)")
    parser.add_argument("--instances", type=int, default=2, help="Instances per study")
    parser.add_argument("--modality", default="CT")
    parser.add_argument("--wait", type=int, default=120, help="Seconds to wait for queues to drain")
    parser.add_argument("--tmpdir", default="./load_test_dicom")
    args = parser.parse_args()

    if args.studies <= 0:
        baseline = fetch_baseline(args.api_url)
        print_summary("Current baseline", baseline, 0, 0)
        return 0

    tmp_dir = Path(args.tmpdir)
    print(f"Sending {args.studies} studies ({args.instances} instances each) to {args.host}:{args.port}")

    before = fetch_baseline(args.api_url)
    started = time.perf_counter()
    sent = 0

    for index in range(args.studies):
        files = create_study_files(tmp_dir / f"study_{index + 1}", args.modality, args.instances)
        if not send_study(args.host, args.port, args.called_ae, args.calling_ae, files):
            print(f"Study {index + 1}/{args.studies} FAILED to send")
            return 1
        sent += 1
        if (index + 1) % max(1, args.studies // 10) == 0:
            print(f"  sent {index + 1}/{args.studies}")

    send_elapsed = time.perf_counter() - started
    print(f"Send complete in {send_elapsed:.1f}s — waiting up to {args.wait}s for workers...")
    after = wait_for_queues(args.api_url, args.wait)
    total_elapsed = time.perf_counter() - started

    print_summary("Before", before, 0, 0)
    print_summary("After", after, total_elapsed, sent)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except urllib.error.URLError as exc:
        print(f"API error: {exc}", file=sys.stderr)
        raise SystemExit(1)
