"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowLeftRight, LockKeyhole, Send } from "lucide-react";
import { api, ApiError, type Room } from "@/lib/api";
import { idempotencyKey } from "@/lib/idempotency";

const suggestions = {
  buyer: [
    "Try to lower the total while keeping the quantity and delivery date.",
    "Ask whether a lower deposit is possible within my limits.",
    "Explore a volume discount for the quantity already requested.",
  ],
  seller: [
    "Try for a higher price using the product's documented value.",
    "Seek a higher deposit within my limits.",
    "Make any price concession conditional on a better deposit.",
  ],
};

const statuses = {
  pending: "Sent · waiting for your agent",
  applied: "Handled by your agent",
  superseded: "Replaced by a newer instruction",
};

/** The parent keys this component by workspace and room so private drafts never cross accounts. */
export function NegotiationGuidance({
  room,
  role,
  disabled,
  onSubmitted,
  onStale,
  onBusy,
}: {
  room: Room;
  role: "buyer" | "seller";
  disabled: boolean;
  onSubmitted: (room: Room) => void;
  onStale: () => Promise<void>;
  onBusy: (busy: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const attempt = useRef<{
    instruction: string;
    expectedVersion: number;
    key: string;
  } | null>(null);
  const instruction = draft.trim();
  const guidance = room.human_guidance;

  function edit(value: string) {
    setDraft(value);
    setNotice("");
    setError("");
    if (value.trim() !== attempt.current?.instruction) attempt.current = null;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      inFlight.current ||
      disabled ||
      !room.can_request_guidance ||
      !instruction ||
      instruction.length > 2000
    )
      return;
    inFlight.current = true;
    setSending(true);
    onBusy(true);
    setError("");
    setNotice("");
    // Keep this exact key and payload after an ambiguous network failure, even
    // when polling discovers the server already accepted the instruction.
    const submission = (attempt.current ||= {
      instruction,
      expectedVersion: room.version,
      key: idempotencyKey(),
    });
    try {
      const updated = await api.requestGuidance(
        room.id,
        submission.instruction,
        submission.expectedVersion,
        submission.key,
      );
      attempt.current = null;
      setDraft("");
      setOpen(false);
      setNotice("Instruction sent privately.");
      onSubmitted(updated);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "stale_version") {
        attempt.current = null;
        try {
          await onStale();
          setError(
            "The negotiation changed. Your draft is saved here. Review the updated terms and send again.",
          );
        } catch {
          setError(
            "The negotiation changed, but its latest terms could not be loaded. Your draft is saved here. Refresh before sending again.",
          );
        }
      } else {
        if (cause instanceof ApiError && cause.status < 500)
          attempt.current = null;
        setError((cause as Error).message || "Could not send. Please retry.");
      }
    } finally {
      inFlight.current = false;
      setSending(false);
      onBusy(false);
    }
  }

  if (!room.can_request_guidance && !guidance.length) return null;
  return (
    <section className="guidance-box" aria-label="Private agent instructions">
      <div className="guidance-heading">
        <div>
          <h3>Your next move</h3>
          <span className="guidance-private">
            <LockKeyhole size={14} /> Only your workspace and your agent
          </span>
        </div>
        {room.can_request_guidance && !open && (
          <button
            className="button secondary"
            disabled={disabled}
            onClick={() => setOpen(true)}
          >
            <ArrowLeftRight size={17} /> Negotiate more
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {open && room.can_request_guidance && (
        <form onSubmit={submit} className="guidance-form">
          <label htmlFor="agent-instruction">Tell your agent what to try</label>
          <textarea
            id="agent-instruction"
            rows={4}
            value={draft}
            disabled={sending}
            aria-describedby="guidance-explanation guidance-count"
            placeholder={
              role === "buyer"
                ? "Try for a lower total without changing the delivery date…"
                : "Try for a higher price and explain the product's value…"
            }
            onChange={(event) => edit(event.target.value)}
          />
          <div className="guidance-suggestions" aria-label="Suggested tactics">
            {suggestions[role].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="text-button"
                disabled={sending}
                onClick={() => edit(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
          <p id="guidance-explanation">
            Sending reopens this negotiation and clears both approvals. Your
            existing price and negotiation limits still apply. Your agent must
            be connected to read this message. A new agreement will need both
            human approvals.
          </p>
          <small
            id="guidance-count"
            className={instruction.length > 2000 ? "error-text" : "muted"}
          >
            {instruction.length.toLocaleString()} / 2,000 characters
          </small>
          {error && (
            <div role="alert" className="alert">
              {error}
            </div>
          )}
          <div className="guidance-actions">
            <button
              type="button"
              className="button secondary"
              disabled={sending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={
                disabled || sending || !instruction || instruction.length > 2000
              }
            >
              <Send size={16} />
              {sending ? "Sending…" : "Send to my agent"}
            </button>
          </div>
        </form>
      )}
      {guidance.length > 0 && (
        <div className="guidance-history">
          <h4>Private instruction history</h4>
          {guidance.map((item) => (
            <article key={item.id}>
              <strong>{statuses[item.status]}</strong>
              <p>{item.instruction}</p>
              <small>
                {new Date(item.created_at).toLocaleString()}
                {item.applied_at &&
                  ` · Handled ${new Date(item.applied_at).toLocaleString()}`}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
