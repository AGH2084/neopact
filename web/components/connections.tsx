"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Copy, KeyRound, Plug, X } from "lucide-react";
import type { Workspace } from "@/lib/api";
import { NegotiatorPrompt } from "./negotiator-prompt";
import {
  connectionSnippets,
  connectionsApi,
  type Credential,
  type IssuedCredential,
} from "@/lib/connections";

const MCP_PORT = 8200;

type SnippetKind = "token" | "claude" | "http" | "stdio";

export function Connections({ workspace }: { workspace: Workspace }) {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [origin, setOrigin] = useState({
    endpoint: `http://127.0.0.1:${MCP_PORT}/mcp`,
    apiUrl: "http://127.0.0.1:8100/api/v1",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("My agent");
  const [trading, setTrading] = useState(false);
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [copied, setCopied] = useState<SnippetKind | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const host = `${window.location.protocol}//${window.location.hostname}`;
    setOrigin({
      endpoint: `${host}:${MCP_PORT}/mcp`,
      apiUrl: `${host}:8100/api/v1`,
    });
    connectionsApi
      .list()
      .then((value) => {
        if (alive.current) setCredentials(value);
      })
      .catch((cause) => {
        if (alive.current) setError(cause.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
    };
  }, []);
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const scopes = [
      "catalogue:read",
      "images:read",
      "negotiations:read",
      "orders:read",
    ];
    if (trading)
      scopes.push(
        "negotiations:act",
        workspace.role === "buyer" ? "requests:write" : "products:write",
      );
    try {
      const result = await connectionsApi.create(name, scopes);
      if (!alive.current) return;
      setIssued(result);
      setCopied(null);
      setCredentials((current) => [
        ...current,
        {
          id: result.id,
          name: result.name,
          scopes: result.scopes,
          expires_at: result.expires_at,
          revoked: false,
        },
      ]);
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    setError("");
    try {
      await connectionsApi.revoke(id);
      if (!alive.current) return;
      setCredentials((current) =>
        current.map((value) =>
          value.id === id ? { ...value, revoked: true } : value,
        ),
      );
      if (issued?.id === id) setIssued(null);
      setConfirmRevoke(null);
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const snippets = issued
    ? connectionSnippets(
        origin.endpoint,
        origin.apiUrl,
        workspace.id,
        issued.token,
      )
    : null;
  async function copy(kind: SnippetKind) {
    if (!issued || !snippets) return;
    try {
      await navigator.clipboard.writeText(
        kind === "token" ? issued.token : snippets[kind],
      );
      setCopied(kind);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the private value below.",
      );
    }
  }
  function CopyButton({ kind, label }: { kind: SnippetKind; label: string }) {
    return (
      <button
        type="button"
        className="button primary"
        onClick={() => void copy(kind)}
      >
        {copied === kind ? <Check size={16} /> : <Copy size={16} />}
        {copied === kind ? "Copied" : label}
      </button>
    );
  }
  return (
    <div className="connections-page">
      <section className="connection-intro">
        <span className="connection-mark">
          <Plug size={28} />
        </span>
        <div>
          <h2>Give your agent a seat at the table.</h2>
          <p>
            Connect Claude, Codex, Cursor or any other MCP client to{" "}
            <strong>{workspace.name}</strong>. Every company uses the same
            endpoint; its credential decides which workspace the agent can see.
          </p>
        </div>
        <span className="connection-protocol">MCP · HTTP or stdio</span>
      </section>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      <div className="connection-grid">
        <section className="connection-panel">
          <div className="connection-section-heading">
            <KeyRound size={20} />
            <h3>1. Create agent access</h3>
          </div>
          <p>One workspace. Seven days. Revocable at any time.</p>
          <form onSubmit={create}>
            <label>
              Connection name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder="Procurement agent"
              />
            </label>
            <label className="connection-permission">
              <input
                type="checkbox"
                checked={trading}
                onChange={(event) => setTrading(event.target.checked)}
              />
              <span>
                <strong>Allow agent trading</strong>
                <small>
                  Propose and negotiate terms, and{" "}
                  {workspace.role === "buyer"
                    ? "create purchase requests"
                    : "manage products"}
                  . Human approval is always required for orders.
                </small>
              </span>
            </label>
            <p className="connection-read-access">
              Read access includes the catalogue, negotiations and orders.
              Trading is off by default.
            </p>
            <button
              type="submit"
              className="button primary"
              disabled={busy || loading || !name.trim()}
            >
              {busy ? "Working…" : "Create connection"}
              <ArrowUpRight size={16} />
            </button>
          </form>
        </section>
        <section className="connection-panel connection-setup">
          <h3>2. Connect your agent</h3>
          <ol>
            <li>
              <strong>Point your client at the shared endpoint</strong>
              <span>
                <code>{origin.endpoint}</code> with your token as a bearer
                header. No install needed.
              </span>
            </li>
            <li>
              <strong>Or run it locally over stdio</strong>
              <span>
                Start the MCP server from the backend checkout with your token
                in its environment.
              </span>
            </li>
            <li>
              <strong>Give it your negotiation prompt</strong>
              <span>
                Describe your objective below. Your agent negotiates; you
                approve the deal.
              </span>
            </li>
          </ol>
          <p className="connection-cloud">
            <strong>Keep the token out of chats</strong>
            <span>
              Paste it into your client’s configuration, never into an AI
              conversation.
            </span>
          </p>
        </section>
      </div>
      {issued && snippets && (
        <section
          className="connection-secret"
          aria-label="New connection configuration"
        >
          <div className="connection-section-heading">
            <h3>Finish connecting</h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Dismiss private configuration"
              onClick={() => setIssued(null)}
            >
              <X size={18} />
            </button>
          </div>
          <p>
            This private token is shown once. It expires{" "}
            {new Date(issued.expires_at).toLocaleDateString()}.
          </p>
          <label htmlFor="workspace-agent-token">Agent token</label>
          <textarea
            id="workspace-agent-token"
            readOnly
            aria-label="Private workspace token"
            value={issued.token}
            spellCheck={false}
            rows={2}
          />
          <CopyButton kind="token" label="Copy private token" />
          <h4>Claude Code</h4>
          <textarea
            readOnly
            aria-label="Claude Code command"
            value={snippets.claude}
            spellCheck={false}
            rows={3}
          />
          <CopyButton kind="claude" label="Copy command" />
          <details className="connection-manual">
            <summary>Other MCP clients (HTTP)</summary>
            <textarea
              readOnly
              aria-label="Private HTTP MCP configuration"
              value={snippets.http}
              spellCheck={false}
              rows={11}
            />
            <CopyButton kind="http" label="Copy configuration" />
          </details>
          <details className="connection-manual">
            <summary>Local stdio process</summary>
            <textarea
              readOnly
              aria-label="Private stdio MCP configuration"
              value={snippets.stdio}
              spellCheck={false}
              rows={13}
            />
            <CopyButton kind="stdio" label="Copy configuration" />
          </details>
        </section>
      )}
      <NegotiatorPrompt workspace={workspace} />
      <section className="connection-panel">
        <div className="connection-section-heading">
          <h3>Workspace connections</h3>
          <span>
            {
              credentials.filter(
                (value) =>
                  !value.revoked && Date.parse(value.expires_at) > Date.now(),
              ).length
            }{" "}
            valid credentials
          </span>
        </div>
        <p>
          Credential status shows access validity. It does not establish whether
          an agent is running.
        </p>
        <div className="connection-list">
          {credentials.map((credential) => {
            const inactive =
              credential.revoked ||
              Date.parse(credential.expires_at) <= Date.now();
            return (
              <div key={credential.id} className="connection-row">
                <div>
                  <strong>{credential.name}</strong>
                  <small>
                    {credential.scopes.includes("negotiations:act")
                      ? "Can negotiate"
                      : "Read access"}{" "}
                    ·{" "}
                    {credential.revoked
                      ? "Revoked"
                      : `Expires ${new Date(credential.expires_at).toLocaleDateString()}`}
                  </small>
                </div>
                {inactive ? (
                  <span className="connection-state">
                    {credential.revoked ? "Revoked" : "Expired"}
                  </span>
                ) : confirmRevoke === credential.id ? (
                  <div className="connection-revoke">
                    <button
                      type="button"
                      className="button danger"
                      disabled={busy}
                      onClick={() => void revoke(credential.id)}
                    >
                      Confirm revoke
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setConfirmRevoke(null)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => setConfirmRevoke(credential.id)}
                  >
                    Revoke access
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {!credentials.length && (
          <p className="connection-empty">
            {loading
              ? "Loading connections…"
              : "No agent credentials yet. Create your first connection above."}
          </p>
        )}
      </section>
    </div>
  );
}
