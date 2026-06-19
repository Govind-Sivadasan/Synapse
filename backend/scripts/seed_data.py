"""Seed default PACS nodes, routing rules, and tag morphing for hackathon demo."""

import asyncio
import uuid

from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models.node import Node
from app.models.routing import RoutingRule
from app.models.tag_morphing import TagMorphingRule


async def seed() -> None:
    async with async_session_factory() as session:
        existing = await session.scalar(select(Node).limit(1))
        if existing:
            print("Seed data already exists, skipping.")
            return

        on_prem_id = uuid.uuid4()
        cloud_id = uuid.uuid4()
        mw_id = uuid.uuid4()
        local_pacs_id = uuid.uuid4()
        morph_rule_id = uuid.uuid4()
        route_rule_id = uuid.uuid4()

        on_prem = Node(
            id=on_prem_id,
            name="Orthanc On-Prem",
            node_type="source",
            protocol="DIMSE",
            host="orthanc-onprem",
            port=4242,
            ae_title="ORTHANC_ONPREM",
            dicomweb_url=settings.orthanc_onprem_dicomweb_url,
            auth_type="none",
            is_active=True,
        )
        cloud = Node(
            id=cloud_id,
            name="Orthanc Cloud",
            node_type="destination",
            protocol="DICOMweb",
            host="orthanc-cloud",
            port=None,
            ae_title=None,
            dicomweb_url=settings.orthanc_cloud_dicomweb_url,
            auth_type="none",
            is_active=True,
        )
        mw = Node(
            id=mw_id,
            name="MW PACS",
            node_type="source",
            protocol="DICOMweb",
            host="10.30.1.20",
            port=11112,
            ae_title='DCM4CHEE',
            dicomweb_url='http://10.30.1.20:8080/dcm4chee-arc/aets/DCM4CHEE/rs',
            auth_type="none",
            is_active=True,
        )
        local_pacs = Node(
            id=local_pacs_id,
            name="Local PACS",
            node_type="destination",
            protocol="DICOMweb",
            host="10.30.2.74",
            port=11112,
            ae_title='DCM4CHEE',
            dicomweb_url='http://10.30.2.74:8085/dcm4chee-arc/aets/DCM4CHEE/rs',
            auth_type="none",
            is_active=True,
        )
        morph_rule = TagMorphingRule(
            id=morph_rule_id,
            name="CT Institution Rename",
            condition_tag="Modality",
            condition_operator="equals",
            condition_value="CT",
            target_tag="InstitutionName",
            new_value="Cloud Demo Hospital",
            is_active=True,
        )
        route_rule = RoutingRule(
            id=route_rule_id,
            name="Route CT to Cloud PACS",
            condition_tag="Modality",
            condition_operator="equals",
            condition_value="CT",
            destination_node_ids=[cloud_id],
            tag_morphing_rule_ids=[morph_rule_id],
            priority=10,
            is_active=True,
        )

        session.add_all([on_prem, cloud, mw, local_pacs, morph_rule, route_rule])
        await session.commit()
        print(f"Seeded nodes: {on_prem.name}, {cloud.name}, {mw.name}, {local_pacs.name}")
        print(f"Seeded routing rule: {route_rule.name} (CT -> Cloud)")
        print(f"Seeded morphing rule: {morph_rule.name}")


if __name__ == "__main__":
    asyncio.run(seed())
