"""Migration job config serialization for JSONB storage."""

from uuid import UUID

from app.schemas.migration import MigrationJobConfig, MigrationFilters


def test_job_config_model_dump_json_serializes_rule_uuids():
    rule_id = UUID("c8635493-57e8-4d5d-ae61-2f7c2419dd7e")
    config = MigrationJobConfig(
        filters=MigrationFilters(modality="CT"),
        tag_morphing_rule_ids=[rule_id],
    )

    dumped = config.model_dump(mode="json")

    assert dumped["tag_morphing_rule_ids"] == [str(rule_id)]
    assert isinstance(dumped["tag_morphing_rule_ids"][0], str)
