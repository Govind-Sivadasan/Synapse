"""End-to-end DIMSE connectivity test: C-ECHO and C-STORE against Synapse listener."""

import argparse
import sys
import time
from pathlib import Path

from pynetdicom import AE
from pynetdicom.sop_class import Verification
from pydicom import dcmread

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_test_dicom import create_test_instance


def test_c_echo(host: str, port: int, called_ae: str, calling_ae: str) -> bool:
    ae = AE(ae_title=calling_ae)
    ae.add_requested_context(Verification)
    assoc = ae.associate(host, port, ae_title=called_ae)
    if not assoc.is_established:
        print(f"C-ECHO FAILED: association not established ({calling_ae} -> {called_ae}@{host}:{port})")
        return False
    status = assoc.send_c_echo()
    assoc.release()
    success = status and status.Status == 0x0000
    print(f"C-ECHO {'OK' if success else 'FAILED'}: status={getattr(status, 'Status', None)}")
    return bool(success)


def test_c_store(host: str, port: int, called_ae: str, calling_ae: str, dicom_files: list[Path]) -> bool:
    ae = AE(ae_title=calling_ae)
    for path in dicom_files:
        ds = dcmread(path)
        ae.add_requested_context(ds.SOPClassUID)

    assoc = ae.associate(host, port, ae_title=called_ae)
    if not assoc.is_established:
        print(f"C-STORE FAILED: association not established")
        return False

    all_ok = True
    for path in dicom_files:
        ds = dcmread(path)
        status = assoc.send_c_store(ds)
        ok = status and status.Status == 0x0000
        print(f"C-STORE {path.name}: {'OK' if ok else 'FAILED'} (status={getattr(status, 'Status', None)})")
        all_ok = all_ok and ok

    assoc.release()
    return all_ok


def main():
    parser = argparse.ArgumentParser(description="Synapse DIMSE E2E test")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=11112)
    parser.add_argument("--called-ae", default="SYNAPSE")
    parser.add_argument("--calling-ae", default="STORESCU")
    parser.add_argument("--instances", type=int, default=2)
    parser.add_argument("--skip-store", action="store_true")
    args = parser.parse_args()

    print(f"Testing DIMSE at {args.host}:{args.port} (called={args.called_ae}, calling={args.calling_ae})")

    if not test_c_echo(args.host, args.port, args.called_ae, args.calling_ae):
        sys.exit(1)

    if args.skip_store:
        print("C-STORE skipped.")
        return

    tmp_dir = Path("./test_dicom_e2e")
    files = create_test_instance(tmp_dir, modality="CT", count=args.instances)

    if not test_c_store(args.host, args.port, args.called_ae, args.calling_ae, files):
        sys.exit(1)

    print("Waiting 3s for Celery to process study reception...")
    time.sleep(3)
    print("E2E DIMSE test completed successfully.")
    print("Verify: GET /api/v1/routing-transactions and /api/v1/dimse/status")


if __name__ == "__main__":
    main()
