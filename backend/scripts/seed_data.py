"""Seed default PACS nodes for the hackathon simulation environment."""

import asyncio
import uuid

from sqlalchemy import select

from app.config import settings
from app.database import async_session_factory
from app.models.node import Node


async def seed() -> None:
    async with async_session_factory() as session:
        existing = await session.scalar(select(Node).limit(1))
        if existing:
            print("Seed data already exists, skipping.")
            return

        on_prem = Node(
            id=uuid.uuid4(),
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
            id=uuid.uuid4(),
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
        session.add_all([on_prem, cloud])
        await session.commit()
        print(f"Seeded nodes: {on_prem.name} ({on_prem.id}), {cloud.name} ({cloud.id})")


if __name__ == "__main__":
    asyncio.run(seed())
