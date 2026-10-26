"""Explicit process configuration; credentials never enter tool arguments."""

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit


class ConfigurationError(ValueError):
    pass


def check_api_url(api_url, trusted_http_hosts=()):
    """Accept only an HTTPS /api/v1 root, or plain HTTP to loopback or an explicitly trusted internal host."""
    parsed = urlsplit(api_url)
    plain_http_ok = parsed.hostname in {"localhost", "127.0.0.1", "::1", *trusted_http_hosts}
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or (parsed.scheme != "https" and not plain_http_ok)
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path.rstrip("/") != "/api/v1"
    ):
        raise ConfigurationError(
            "NEOPACT_MCP_API_URL must be an HTTPS /api/v1 URL. HTTP is allowed only on loopback "
            "or a host listed in NEOPACT_MCP_TRUSTED_HTTP_HOSTS."
        )


def valid_agent_token(token):
    return token.startswith("am_") and 40 <= len(token) <= 200 and not any(c.isspace() for c in token)


@dataclass(frozen=True)
class Configuration:
    """Stdio mode: one process serves one workspace with one credential from its environment."""

    api_url: str
    workspace_id: str
    token: str = field(repr=False)

    def __post_init__(self):
        check_api_url(self.api_url)
        if (
            not self.workspace_id
            or len(self.workspace_id) > 100
            or any(c.isspace() for c in self.workspace_id)
        ):
            raise ConfigurationError("Set NEOPACT_MCP_WORKSPACE to one workspace ID.")
        if not valid_agent_token(self.token):
            raise ConfigurationError("Set NEOPACT_MCP_TOKEN to a restricted workspace agent credential.")

    @classmethod
    def from_environment(cls):
        return cls(
            api_url=os.environ.get("NEOPACT_MCP_API_URL", ""),
            workspace_id=os.environ.get("NEOPACT_MCP_WORKSPACE", ""),
            token=os.environ.get("NEOPACT_MCP_TOKEN", ""),
        )


@dataclass(frozen=True)
class HttpConfiguration:
    """HTTP mode: one shared server; every caller authenticates with its own agent credential.

    The server holds no credential. The backend's workspace binding keeps companies isolated.
    """

    api_url: str
    trusted_http_hosts: tuple[str, ...] = ()
    allowed_hosts: tuple[str, ...] = ()
    workspace_id = None
    token = None

    def __post_init__(self):
        check_api_url(self.api_url, self.trusted_http_hosts)

    @classmethod
    def from_environment(cls):
        def listed(name):
            return tuple(x.strip() for x in os.environ.get(name, "").split(",") if x.strip())

        return cls(
            api_url=os.environ.get("NEOPACT_MCP_API_URL", ""),
            trusted_http_hosts=listed("NEOPACT_MCP_TRUSTED_HTTP_HOSTS"),
            allowed_hosts=listed("NEOPACT_MCP_ALLOWED_HOSTS"),
        )
