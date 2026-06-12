"""Authentication header builder for DICOMweb endpoints."""

from dataclasses import dataclass


@dataclass
class AuthHandler:
    auth_type: str = "none"
    credentials: dict | None = None

    def get_headers(self) -> dict[str, str]:
        if not self.credentials:
            return {}

        creds = self.credentials
        if self.auth_type == "bearer":
            token = creds.get("token", "")
            return {"Authorization": f"Bearer {token}"}
        if self.auth_type == "basic":
            import base64

            user = creds.get("username", "")
            password = creds.get("password", "")
            encoded = base64.b64encode(f"{user}:{password}".encode()).decode()
            return {"Authorization": f"Basic {encoded}"}
        if self.auth_type == "apikey":
            header_name = creds.get("header_name", "X-API-Key")
            return {header_name: creds.get("api_key", "")}
        return {}

    @classmethod
    def from_node(cls, node) -> "AuthHandler":
        return cls(auth_type=node.auth_type or "none", credentials=node.auth_config)
