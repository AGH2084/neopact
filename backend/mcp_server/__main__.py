"""Run the MCP server.

stdio (default): one local process, one workspace credential from the environment.
http: one shared streamable-HTTP endpoint; each caller sends its own agent bearer token.
"""

import argparse
import logging
import sys

from .client import Marketplace
from .config import Configuration, ConfigurationError, HttpConfiguration
from .http import middleware
from .server import create_server


def main():
    parser = argparse.ArgumentParser(description="Neopact workspace MCP server")
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    parser.add_argument("--host", default="127.0.0.1", help="HTTP bind address")
    parser.add_argument("--port", type=int, default=8200, help="HTTP port")
    args = parser.parse_args()
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
    try:
        config = (HttpConfiguration if args.transport == "http" else Configuration).from_environment()
    except ConfigurationError as exc:
        parser.error(str(exc))
    server = create_server(Marketplace(config))
    if args.transport == "stdio":
        server.run(transport="stdio", show_banner=False)
    else:
        server.run(
            transport="http",
            host=args.host,
            port=args.port,
            path="/mcp",
            show_banner=False,
            host_origin_protection=True,
            allowed_hosts=list(config.allowed_hosts) or None,
            middleware=middleware,
        )


if __name__ == "__main__":
    main()
