from app.services.migration_job_names import batch_migration_job_names


def test_batch_migration_job_names_single_destination():
    assert batch_migration_job_names("On-prem CT", 1) == ["On-prem CT"]


def test_batch_migration_job_names_multiple_destinations():
    assert batch_migration_job_names("On-prem CT", 3) == [
        "On-prem CT #1",
        "On-prem CT #2",
        "On-prem CT #3",
    ]


def test_batch_migration_job_names_truncates_long_base():
    long_base = "x" * 250
    names = batch_migration_job_names(long_base, 2)
    assert names[0].endswith(" #1")
    assert len(names[0]) == 200
    assert names[1].endswith(" #2")
