"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import {
  api,
  human,
  money,
  type EffectiveRules,
  type Me,
  type Room,
} from "@/lib/api";
import { NegotiationConversation } from "./negotiation-conversation";
import { NegotiationGuidance } from "./negotiation-guidance";
import { Badge, Empty, Gallery, Modal, TermsGrid } from "./ui";

/**
 * One negotiation room: the shared conversation, the exact offer, private limits,
 * the two-party approval, and private "Negotiate more" guidance.
 * Mounted per workspace and room, so results arriving after a switch are ignored.
 */
export function RoomDetail({
  me,
  room,
  syncFailed,
  onClose,
  onRoom,
  onChanged,
  onNotice,
}: {
  me: Me;
  room: Room;
  syncFailed: boolean;
  onClose: () => void;
  onRoom: (room: Room) => void;
  onChanged: () => Promise<void>;
  onNotice: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [guidanceBusy, setGuidanceBusy] = useState(false),
    [error, setError] = useState(""),
    [reviewed, setReviewed] = useState(false),
    [guardrails, setGuardrails] = useState<EffectiveRules | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    api
      .rules(me.workspace.role === "seller" ? room.product_id : undefined)
      .then((r) => alive.current && setGuardrails(r.effective))
      .catch(() => {});
    return () => {
      alive.current = false;
    };
  }, [me.workspace.role, room.product_id]);
  // Any new version of the room needs a fresh review before approval.
  useEffect(() => setReviewed(false), [room.version]);

  async function refresh() {
    const updated = await api.room(room.id);
    if (alive.current) onRoom(updated);
  }
  async function decide(reject = false) {
    if (!room.current_offer) return;
    setBusy(true);
    setError("");
    try {
      const result = await (reject ? api.reject : api.approve)(
        room.id,
        room.current_offer.id,
        room.version,
      );
      if (!alive.current) return;
      onNotice(
        reject
          ? "Offer rejected. Both agents can see your decision."
          : result.state === "ordered"
            ? "Both businesses approved. Your demo order is confirmed."
            : "Your approval is recorded. Waiting for the other business.",
      );
      await refresh();
      await onChanged();
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const offer = room.current_offer;
  const previous = room.offers.length > 1 ? room.offers.at(-2)! : null;
  return (
    <Modal title={room.request.title} onClose={onClose}>
      <div className="detail-meta">
        <span>
          {room.supplier} · {room.product.name}
        </span>
        <Badge value={room.state} />
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {syncFailed && (
        <div role="alert" className="alert">
          Workspace sync paused. These are the last retrieved terms; refresh
          before making a decision.
        </div>
      )}
      <NegotiationConversation room={room} />
      {offer ? (
        <>
          <div className="offer-heading">
            <strong>Offer v{offer.version}</strong>
            <span>Proposed by {offer.sender}</span>
            <button
              className="text-button"
              onClick={() =>
                void refresh().catch((e) => setError((e as Error).message))
              }
            >
              <RefreshCw size={14} />
              Refresh terms
            </button>
          </div>
          <TermsGrid offer={offer} />
          {previous && (
            <div className="change-note">
              <strong>Since the previous offer</strong>
              <span>
                Total: {money(previous.terms.total)} →{" "}
                {money(offer.terms.total)}
              </span>
              <span>
                Deposit: {previous.terms.deposit_percent}% →{" "}
                {offer.terms.deposit_percent}%
              </span>
              <span>
                Delivery: {previous.terms.delivery_date} →{" "}
                {offer.terms.delivery_date}
              </span>
            </div>
          )}
          <details>
            <summary>Product images and specifications</summary>
            <Gallery product={offer.product} />
            <p>
              {offer.product.attributes.material} ·{" "}
              {offer.product.attributes.color} ·{" "}
              {offer.product.attributes.stackable
                ? "Stackable"
                : "Not stackable"}
            </p>
          </details>
          {guardrails && (
            <details>
              <summary>Your private negotiation limits</summary>
              <dl className="details">
                {Object.entries(guardrails).map(([k, v]) => (
                  <div key={k}>
                    <dt>{human(k)}</dt>
                    <dd>
                      {["min_unit_price", "max_total"].includes(k)
                        ? money(v)
                        : v}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {room.invalid_reasons.length > 0 && room.state !== "ordered" && (
            <div className="alert">{room.invalid_reasons.join(". ")}</div>
          )}
          <div className="approval-status">
            {[room.request.workspace_id, room.seller_id].map((id, i) => {
              const approved = offer.approvals.some(
                (a) => a.workspace_id === id,
              );
              return (
                <div
                  key={id || i}
                  className={`approval-party ${approved ? "approved" : "pending"}`}
                >
                  {approved ? <CheckCheck size={19} /> : <Clock3 size={19} />}
                  <span>
                    {i === 0 ? "Buyer" : "Seller"}:{" "}
                    {approved
                      ? "approved"
                      : room.state === "awaiting_approval"
                        ? "awaiting approval"
                        : "agent agreement pending"}
                  </span>
                </div>
              );
            })}
          </div>
          {room.state === "awaiting_approval" && me.can_approve && (
            <div className="approval-box">
              <h3>Review before you authorize</h3>
              <p className="approval-request-note">
                Both agents agreed. Each business must now review and approve
                this offer.
              </p>
              <p>
                This is offer v{offer.version}, expiring{" "}
                {new Date(offer.expires_at).toLocaleString()}. Both businesses
                must approve these exact terms.
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I have reviewed this offer and its product evidence.
              </label>
              <div className="approval-actions">
                <button
                  className="button secondary"
                  disabled={busy || guidanceBusy || !reviewed}
                  onClick={() => void decide(true)}
                >
                  Reject offer
                </button>
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    guidanceBusy ||
                    !reviewed ||
                    !room.valid ||
                    offer.approvals.some(
                      (a) => a.workspace_id === me.workspace.id,
                    )
                  }
                  onClick={() => void decide()}
                >
                  <ShieldCheck size={17} />
                  {busy ? "Recording…" : "Approve exact offer"}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Empty
          title="Waiting for the first offer"
          detail={`The ${room.next_role} agent can claim the next turn.`}
        />
      )}
      <NegotiationGuidance
        room={room}
        role={me.workspace.role}
        disabled={busy}
        onBusy={(value) => alive.current && setGuidanceBusy(value)}
        onStale={() => (alive.current ? refresh() : Promise.resolve())}
        onSubmitted={(updated) => {
          if (!alive.current) return;
          onRoom(updated);
          void onChanged().catch(
            (cause) => alive.current && setError((cause as Error).message),
          );
        }}
      />
      {room.reason && <p className="quiet-note">{room.reason}</p>}
    </Modal>
  );
}
