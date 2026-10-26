"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  ImageIcon,
  MessageCircle,
} from "lucide-react";
import { human, imageUrl, money, type Room } from "@/lib/api";

const actionLabels: Record<string, string> = {
  message: "Message",
  propose: "Offer proposed",
  counter: "Counteroffer",
  revise: "Offer revised",
  accept: "Offer agreed — human approvals needed",
  decline: "Negotiation declined",
  request_clarification: "Question",
  answer_clarification: "Answer",
  request_human_review: "Human input requested",
  human_requested_negotiation: "Negotiation reopened by a human",
};

export function NegotiationConversation({ room }: { room: Room }) {
  const transcript = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [newMessages, setNewMessages] = useState(false);
  const activity = [...room.activity].sort((left, right) =>
    left.at.localeCompare(right.at),
  );
  const lastMessage = activity.at(-1)?.id;
  useEffect(() => {
    if (followLatest.current && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    } else {
      setNewMessages(true);
    }
  }, [lastMessage, activity.length]);

  return (
    <section
      className="conversation"
      aria-label="Shared negotiation conversation"
    >
      <div className="conversation-heading">
        <div>
          <h3>
            <MessageCircle size={18} /> Conversation
          </h3>
          <p>Messages and offers shared by the buyer and seller agents.</p>
        </div>
        <span className="conversation-audience">Both businesses</span>
      </div>
      {activity.length ? (
        <div
          ref={transcript}
          className="conversation-transcript"
          tabIndex={0}
          role="region"
          aria-label="Conversation messages"
          onScroll={() => {
            const element = transcript.current;
            if (!element) return;
            followLatest.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              48;
            if (followLatest.current) setNewMessages(false);
          }}
        >
          {activity.map((item) => {
            const actor =
              item.type === "human_requested_negotiation"
                ? `${human(item.role)} workspace`
                : `${human(item.role)} agent`;
            const offer = item.data.offer_id
              ? room.offers.find(
                  (candidate) => candidate.id === item.data.offer_id,
                )
              : null;
            const reply = item.data.reply_to_action_id
              ? activity.find(
                  (candidate) => candidate.id === item.data.reply_to_action_id,
                )
              : null;
            const imageIds = item.data.image_ids || [];
            const images = imageIds.flatMap((id) => {
              const image = [
                room.product,
                ...room.offers.map((candidate) => candidate.product),
              ]
                .flatMap((product) => product.images)
                .find(
                  (candidate) =>
                    candidate.id === id && candidate.status === "ready",
                );
              return image ? [image] : [];
            });
            return (
              <article
                className={`conversation-entry conversation-${item.role}`}
                key={item.id}
                id={`message-${item.id}`}
              >
                <div className="conversation-entry-heading">
                  <strong>{actor}</strong>
                  <time dateTime={item.at}>
                    {new Date(item.at).toLocaleString()}
                  </time>
                </div>
                <span className="conversation-event-label">
                  {item.type === "message" && item.data.purpose
                    ? human(item.data.purpose)
                    : actionLabels[item.type] || human(item.type)}
                </span>
                {reply && (
                  <blockquote>
                    <strong>Reply to {reply.role} agent</strong>
                    <p>
                      {reply.data.message ||
                        actionLabels[reply.type] ||
                        human(reply.type)}
                    </p>
                  </blockquote>
                )}
                {item.data.message && (
                  <p className="conversation-text">{item.data.message}</p>
                )}
                {offer && (
                  <div
                    className="conversation-offer"
                    aria-label={`Offer version ${offer.version}`}
                  >
                    <div>
                      <ArrowLeftRight size={15} />
                      <strong>Offer v{offer.version}</strong>
                      <strong>{money(offer.terms.total)}</strong>
                    </div>
                    <dl>
                      <div>
                        <dt>Quantity × unit price</dt>
                        <dd>
                          {offer.terms.quantity} ×{" "}
                          {money(offer.terms.unit_price)}
                        </dd>
                      </div>
                      <div>
                        <dt>Delivery charge</dt>
                        <dd>{money(offer.terms.delivery_charge)}</dd>
                      </div>
                      <div>
                        <dt>Deposit</dt>
                        <dd>{offer.terms.deposit_percent}%</dd>
                      </div>
                      <div>
                        <dt>Delivery by</dt>
                        <dd>{offer.terms.delivery_date}</dd>
                      </div>
                    </dl>
                    <small>
                      {offer.id === room.current_offer?.id
                        ? "Current offer"
                        : "Earlier offer"}{" "}
                      · Valid until{" "}
                      {new Date(offer.expires_at).toLocaleString()}
                    </small>
                  </div>
                )}
                {imageIds.length > 0 && (
                  <div
                    className="conversation-evidence"
                    aria-label="Referenced product images"
                  >
                    {images.map((image) => (
                      <a
                        key={image.id}
                        href={imageUrl(image)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={imageUrl(image, true)}
                          alt={image.caption || room.product.name}
                        />
                        <span>
                          <ImageIcon size={12} />
                          {image.caption || "Product image"}
                        </span>
                      </a>
                    ))}
                    {images.length < imageIds.length && (
                      <small>
                        Some referenced images are no longer available.
                      </small>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="conversation-empty">
          Your agents’ messages and offers will appear here when they begin.
        </p>
      )}
      {newMessages && (
        <button
          className="text-button conversation-latest"
          onClick={() => {
            if (transcript.current)
              transcript.current.scrollTop = transcript.current.scrollHeight;
            followLatest.current = true;
            setNewMessages(false);
          }}
        >
          <ArrowDown size={15} /> New activity · Jump to latest
        </button>
      )}
      <p className="conversation-footnote">
        An agent agreement prepares an offer for review. Both humans must
        approve the recorded terms.
      </p>
    </section>
  );
}
