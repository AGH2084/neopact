"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Copy, MessageSquare } from "lucide-react";
import type { Workspace } from "@/lib/api";
import { connectionsApi, type AgentPrompt } from "@/lib/connections";

type Target = "inbox" | "room" | "request";
type Mode = "start" | "resume";

export function NegotiatorPrompt({ workspace }: { workspace: Workspace }) {
  return <PromptEditor key={workspace.id} workspace={workspace} />;
}

function PromptEditor({ workspace }: { workspace: Workspace }) {
  const [objective, setObjective] = useState("");
  const [target, setTarget] = useState<Target>("inbox");
  const [targetId, setTargetId] = useState("");
  const [mode, setMode] = useState<Mode>("start");
  const [generated, setGenerated] = useState<AgentPrompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [copied, setCopied] = useState(false);
  const generation = useRef(0);
  const alive = useRef(true);
  const preview = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    alive.current = true;
    void generate();
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);

  function invalidate() {
    generation.current++;
    setGenerated(null);
    setBusy(false);
    setError("");
    setCopyStatus("");
    setCopied(false);
  }

  async function generate(event?: FormEvent) {
    event?.preventDefault();
    const sequence = ++generation.current;
    setBusy(true);
    setGenerated(null);
    setError("");
    setCopyStatus("");
    setCopied(false);
    try {
      const result = await connectionsApi.prompt({
        objective: objective.trim(),
        mode,
        room_id: target === "room" ? targetId.trim() : null,
        request_id: target === "request" ? targetId.trim() : null,
      });
      if (!alive.current || sequence !== generation.current) return;
      if (
        result.workspace_id !== workspace.id ||
        result.role !== workspace.role ||
        result.mode !== mode ||
        !result.prompt.trim()
      ) {
        throw new Error(
          "The prompt did not match this workspace. Please retry.",
        );
      }
      setGenerated(result);
    } catch (cause) {
      if (alive.current && sequence === generation.current)
        setError(
          (cause as Error).message ||
            "Could not generate your prompt. Please retry.",
        );
    } finally {
      if (alive.current && sequence === generation.current) setBusy(false);
    }
  }

  function selectPrompt() {
    preview.current?.focus();
    preview.current?.select();
    setCopyStatus(
      "Prompt selected. Use your device’s copy command, then paste into your AI client.",
    );
  }

  async function copyPrompt() {
    if (!generated) return;
    const sequence = generation.current;
    setCopied(false);
    try {
      await navigator.clipboard.writeText(generated.prompt);
    } catch {
      if (!alive.current || sequence !== generation.current) return;
      preview.current?.focus();
      preview.current?.select();
      let copiedSelection = false;
      try {
        // HTTP LAN origins lack the async Clipboard API. The selection is
        // confined to this prompt; private MCP configuration is never copied.
        copiedSelection =
          Boolean(preview.current) && document.execCommand("copy");
      } catch {
        // Some browsers disable both clipboard mechanisms.
      }
      if (!copiedSelection) {
        setCopyStatus(
          "Clipboard access is unavailable on this browser or LAN address. The prompt is selected; use your device’s copy command.",
        );
        return;
      }
    }
    if (!alive.current || sequence !== generation.current) return;
    setCopied(true);
    setCopyStatus(
      "Prompt copied. Paste it into your connected AI client to begin. No agent has been started by this page.",
    );
  }

  return (
    <section
      className="connection-panel negotiator-panel"
      aria-labelledby="negotiator-heading"
    >
      <div className="connection-section-heading">
        <MessageSquare size={20} aria-hidden="true" />
        <h3 id="negotiator-heading">Set up your negotiator</h3>
        <span>
          {workspace.role === "buyer" ? "Buyer" : "Seller"} · {workspace.name}
        </span>
      </div>
      <p>
        Connect MCP once, then paste your prompt into Codex, Claude or another
        compatible AI client. Your agent starts eligible negotiations without
        asking for permission at every turn, checks for replies every 20 seconds
        while the client stays active, and reports a deal for human approval.
      </p>
      <div className="negotiator-layout">
        <form onSubmit={generate} aria-label="Negotiator prompt setup">
          <label htmlFor="negotiator-objective">
            What should your agent achieve?
            <textarea
              id="negotiator-objective"
              value={objective}
              onChange={(event) => {
                invalidate();
                setObjective(event.target.value);
              }}
              placeholder={
                workspace.role === "buyer"
                  ? "Find the best total cost for my requirements. Prioritize reliable delivery and a smaller deposit."
                  : "Win good orders at the highest feasible price above my private floor. Explore quantity, delivery and deposit tradeoffs."
              }
              maxLength={2000}
              rows={4}
              aria-describedby="negotiator-objective-help"
            />
          </label>
          <p id="negotiator-objective-help" className="connection-read-access">
            Optional. Leave blank to use the {workspace.role} strategy. Your
            objective goes to your chosen AI client; it cannot override saved
            limits or workspace permissions. No credentials or saved private
            limits are added to the prompt.
          </p>
          <div className="negotiator-selects">
            <label htmlFor="negotiator-mode">
              Agent task
              <select
                id="negotiator-mode"
                value={mode}
                onChange={(event) => {
                  invalidate();
                  setMode(event.target.value as Mode);
                }}
              >
                <option value="start">Start and listen</option>
                <option value="resume">Resume and listen</option>
              </select>
            </label>
            <label htmlFor="negotiator-target">
              Where to work
              <select
                id="negotiator-target"
                value={target}
                onChange={(event) => {
                  invalidate();
                  setTarget(event.target.value as Target);
                  setTargetId("");
                }}
              >
                <option value="inbox">Workspace inbox</option>
                <option value="room">Existing negotiation</option>
                {workspace.role === "buyer" && (
                  <option value="request">Existing purchase request</option>
                )}
              </select>
            </label>
          </div>
          {target !== "inbox" && (
            <label htmlFor="negotiator-target-id">
              {target === "room" ? "Negotiation ID" : "Purchase request ID"}
              <input
                id="negotiator-target-id"
                value={targetId}
                onChange={(event) => {
                  invalidate();
                  setTargetId(event.target.value);
                }}
                required
                maxLength={80}
                pattern={"[A-Za-z0-9][A-Za-z0-9_\\-]{0,79}"}
                title="Use an ID of up to 80 letters, numbers, underscores or hyphens, starting with a letter or number."
                spellCheck={false}
              />
            </label>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={busy || (target !== "inbox" && !targetId.trim())}
            aria-busy={busy}
          >
            {busy
              ? "Preparing prompt…"
              : mode === "resume"
                ? "Generate resume prompt"
                : "Generate negotiation prompt"}
          </button>
        </form>
        <aside
          className="negotiator-instructions"
          aria-label="How your negotiator works"
        >
          <h4>Your brief. Their work.</h4>
          <ol>
            <li>
              <strong>Give trading access</strong>
              <span>
                Use a connection with “Allow agent trading” enabled. Read access
                alone cannot negotiate.
              </span>
            </li>
            <li>
              <strong>Let your agent work</strong>
              <span>
                It checks the inbox, discusses needs, reads fresh context and
                improves terms within your limits. Both sides need an active
                agent.
              </span>
            </li>
            <li>
              <strong>Review a concrete deal</strong>
              <span>
                It reports the exact terms and the tradeoffs behind them. Both
                humans still approve the same final offer.
              </span>
            </li>
          </ol>
          <p>
            The AI client must remain active and may request tool access.
            Copying a prompt does not start an agent or create a background
            service. Use “Resume and listen” when returning to an interrupted
            session.
          </p>
        </aside>
      </div>
      {generated && (
        <div className="negotiator-preview">
          <label htmlFor="negotiator-preview">
            {generated.mode === "resume"
              ? "Resume prompt"
              : "Negotiation prompt"}
          </label>
          <textarea
            id="negotiator-preview"
            ref={preview}
            value={generated.prompt}
            readOnly
            rows={14}
            spellCheck={false}
          />
          <div className="negotiator-actions">
            <button
              type="button"
              className="button primary"
              onClick={() => void copyPrompt()}
            >
              {copied ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Copy size={16} aria-hidden="true" />
              )}
              {copied
                ? "Prompt copied"
                : generated.mode === "resume"
                  ? "Copy resume prompt"
                  : "Copy negotiation prompt"}
            </button>
            <button
              type="button"
              className="button quiet"
              onClick={selectPrompt}
            >
              Select prompt text
            </button>
          </div>
          <p className="connection-read-access" role="status">
            {copyStatus ||
              "Review the prompt, then copy it into your connected AI client. Editing the setup clears this preview."}
          </p>
        </div>
      )}
    </section>
  );
}
