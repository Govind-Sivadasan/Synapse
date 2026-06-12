"""Keycloak JWT validation and role-based access control."""

from dataclasses import dataclass

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import settings

security = HTTPBearer(auto_error=False)

_jwks_cache: dict | None = None


@dataclass
class CurrentUser:
    sub: str
    username: str
    roles: list[str]
    token: str


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        url = f"{settings.keycloak_url}/realms/{settings.keycloak_realm}/protocol/openid-connect/certs"
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            _jwks_cache = response.json()
    return _jwks_cache


def _extract_roles(payload: dict) -> list[str]:
    realm_access = payload.get("realm_access", {})
    return realm_access.get("roles", [])


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    token = credentials.credentials
    try:
        # Development mode: decode without signature verification when Keycloak is unavailable
        if settings.app_env == "development" and settings.debug:
            payload = jwt.get_unverified_claims(token)
        else:
            jwks = await _get_jwks()
            payload = jwt.decode(
                token,
                jwks,
                algorithms=["RS256"],
                audience=settings.keycloak_client_id,
                options={"verify_aud": False},
            )
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    roles = _extract_roles(payload)
    return CurrentUser(
        sub=payload.get("sub", ""),
        username=payload.get("preferred_username", payload.get("sub", "")),
        roles=roles,
        token=token,
    )


def require_roles(*allowed_roles: str):
    async def _checker(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if not any(role in user.roles for role in allowed_roles):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _checker
