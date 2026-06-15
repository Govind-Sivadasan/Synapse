"""Persist and load chatbot messages per Keycloak user."""

import uuid

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat_message import ChatMessage


async def list_user_messages(
    session: AsyncSession,
    user_id: str,
    *,
    limit: int = 200,
    before_id: uuid.UUID | None = None,
) -> list[ChatMessage]:
    query = select(ChatMessage).where(ChatMessage.user_id == user_id)
    if before_id:
        anchor = await session.get(ChatMessage, before_id)
        if anchor and anchor.user_id == user_id:
            query = query.where(ChatMessage.created_at < anchor.created_at)

    result = await session.execute(
        query.order_by(ChatMessage.created_at.desc()).limit(min(limit, 500))
    )
    rows = list(result.scalars().all())
    rows.reverse()
    return rows


async def append_message(
    session: AsyncSession,
    *,
    user_id: str,
    role: str,
    content: str,
    phi_redacted: bool | None = None,
    used_fallback: bool | None = None,
) -> ChatMessage:
    message = ChatMessage(
        id=uuid.uuid4(),
        user_id=user_id,
        role=role,
        content=content,
        phi_redacted=phi_redacted,
        used_fallback=used_fallback,
    )
    session.add(message)
    await session.flush()
    return message


async def clear_user_messages(session: AsyncSession, user_id: str) -> int:
    result = await session.execute(delete(ChatMessage).where(ChatMessage.user_id == user_id))
    return result.rowcount or 0


async def count_user_messages(session: AsyncSession, user_id: str) -> int:
    return await session.scalar(
        select(func.count()).select_from(ChatMessage).where(ChatMessage.user_id == user_id)
    ) or 0
