"""PACS node configuration API."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.keycloak import CurrentUser, require_roles
from app.database import get_db
from app.models.node import Node
from app.schemas.node import NodeCreate, NodeEchoResponse, NodeResponse, NodeUpdate
from app.services.allowed_aets import refresh_allowed_calling_aets
from app.services.audit_logger import AuditLogger
from app.services.node_connectivity import probe_node_connectivity

router = APIRouter(prefix="/nodes", tags=["Nodes"])


@router.get("", response_model=list[NodeResponse])
async def list_nodes(
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "operator")),
) -> list[Node]:
    result = await db.execute(select(Node).order_by(Node.name))
    return list(result.scalars().all())


@router.post("", response_model=NodeResponse, status_code=status.HTTP_201_CREATED)
async def create_node(
    payload: NodeCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> Node:
    node = Node(**payload.model_dump())
    db.add(node)
    await db.flush()
    await db.refresh(node)
    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="Node",
        entity_id=node.id,
        details={"action": "create", "name": node.name, "node_type": node.node_type},
        ip_address=request.client.host if request.client else None,
    )
    await refresh_allowed_calling_aets()
    return node


@router.get("/{node_id}", response_model=NodeResponse)
async def get_node(
    node_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> Node:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.put("/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: UUID,
    payload: NodeUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> Node:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(node, key, value)
    await db.flush()
    await db.refresh(node)
    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="Node",
        entity_id=node.id,
        details={"action": "update", "name": node.name},
        ip_address=request.client.host if request.client else None,
    )
    await refresh_allowed_calling_aets()
    return node


@router.post("/{node_id}/echo", response_model=NodeEchoResponse)
async def echo_node(
    node_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin")),
) -> NodeEchoResponse:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    result = await probe_node_connectivity(node)
    return NodeEchoResponse(**result)


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: CurrentUser = Depends(require_roles("admin")),
) -> None:
    node = await db.get(Node, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    await AuditLogger.log(
        db,
        "CONFIG_CHANGE",
        user_id=user.sub,
        user_role="admin",
        entity_type="Node",
        entity_id=node.id,
        details={"action": "delete", "name": node.name},
        ip_address=request.client.host if request.client else None,
    )
    await db.delete(node)
    await refresh_allowed_calling_aets()
