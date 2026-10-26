"""A fixed-origin API client, never an arbitrary URL/HTTP tool."""

from hashlib import sha256
from time import monotonic

import httpx
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_http_headers

from .config import ConfigurationError, valid_agent_token

VERIFIED_SECONDS = 60


class Marketplace:
    """Calls the backend API on behalf of exactly one agent credential per request.

    Stdio mode uses the single credential from the process environment. HTTP mode forwards
    the calling client's own bearer token; nothing is stored beyond a short-lived record
    (by hash) that the token was verified as a restricted agent credential.
    """

    def __init__(self, config, transport: httpx.AsyncBaseTransport | None = None):
        self.config = config
        fixed = (
            {"Authorization": "Bearer " + config.token, "X-Workspace-ID": config.workspace_id}
            if config.token
            else {}
        )
        self.http = httpx.AsyncClient(
            base_url=config.api_url.rstrip("/") + "/",
            headers=fixed,
            timeout=httpx.Timeout(20, connect=5),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        )
        self.verified = {}

    async def close(self):
        await self.http.aclose()

    async def request(self, method, path, *, params=None, data=None, idempotency_key=None):
        headers = await self.caller()
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        return await self.send(method, path, params=params, data=data, headers=headers)

    async def caller(self):
        """Per-request credential headers. Empty in stdio mode, where the client holds them."""
        if self.config.token:
            return {}
        scheme, _, token = get_http_headers(include={"authorization"}).get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not valid_agent_token(token):
            raise ToolError("Send your restricted agent credential as 'Authorization: Bearer am_...'.")
        headers = {"Authorization": "Bearer " + token}
        key = sha256(token.encode()).hexdigest()
        if self.verified.get(key, 0) < monotonic():
            try:
                await self.validate_identity(headers)
            except ConfigurationError as exc:
                raise ToolError(str(exc)) from None
            if len(self.verified) > 1000:
                self.verified.clear()
            self.verified[key] = monotonic() + VERIFIED_SECONDS
        return headers

    async def send(self, method, path, *, params=None, data=None, headers=None):
        try:
            response = await self.http.request(method, path, params=params, json=data, headers=headers)
        except httpx.HTTPError:
            raise ToolError(
                "Marketplace unavailable. Check the backend and retry reads when it recovers."
            ) from None
        try:
            body = response.json()
        except ValueError:
            raise ToolError("Marketplace returned an invalid response.") from None
        if not isinstance(body, dict) or len(body) != 2 or body.get("status_code") != response.status_code:
            raise ToolError("Marketplace returned an invalid resource envelope.")
        label = next(key for key in body if key != "status_code")
        resource = body[label]
        if not isinstance(resource, dict):
            raise ToolError("Marketplace returned an invalid resource object.")
        if response.is_error and label == "error":
            # The backend deliberately sanitizes messages. Never include request headers or bodies.
            code = str(resource.get("code", "request_failed"))[:80]
            message = str(resource.get("message", "Marketplace request failed."))[:400]
            raise ToolError(f"{code}: {message}")
        if not response.is_success or label == "error":
            raise ToolError("Marketplace returned an unexpected status; redirects are not followed.")
        return resource

    async def validate_identity(self, headers=None):
        identity = await self.send("GET", "auth/me", headers=headers)
        if (
            identity.get("credential", {}).get("kind") != "agent"
            or (
                self.config.workspace_id
                and identity.get("workspace", {}).get("id") != self.config.workspace_id
            )
            or identity.get("workspace", {}).get("role") not in {"buyer", "seller"}
            or identity.get("can_approve") is not False
        ):
            raise ConfigurationError("MCP requires a restricted agent credential bound to one workspace.")
        return identity
