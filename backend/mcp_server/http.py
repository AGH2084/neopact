"""HTTP-mode guard: refuse any request that does not carry an agent bearer token.

This only checks the token's shape so anonymous callers never reach an MCP session (not even
tool listing). The backend still authenticates the token, its scopes and workspace on every call.
"""

from starlette.middleware import Middleware
from starlette.responses import JSONResponse

from .config import valid_agent_token


class RequireAgentBearer:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            headers = dict(scope["headers"])
            scheme, _, token = headers.get(b"authorization", b"").decode("latin-1").partition(" ")
            if scheme.lower() != "bearer" or not valid_agent_token(token):
                response = JSONResponse(
                    {"error": "Send a restricted agent credential as 'Authorization: Bearer am_...'."},
                    status_code=401,
                    headers={"WWW-Authenticate": "Bearer"},
                )
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


middleware = [Middleware(RequireAgentBearer)]
