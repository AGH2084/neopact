"use client";
import { Activity, ArrowRight, ArrowUpRight, Package } from "lucide-react";
import {
  human,
  imageUrl,
  money,
  type AuditEvent,
  type Me,
  type Order,
  type Product,
  type Room,
} from "@/lib/api";
import { RoomTable } from "../room-table";
import type { View } from "./types";

export function OverviewView({
  me,
  rooms,
  orders,
  products,
  events,
  navigate,
  onOpenRoom,
  onOpenProduct,
}: {
  me: Me;
  rooms: Room[];
  orders: Order[];
  products: Product[];
  events: AuditEvent[];
  navigate: (view: View) => void;
  onOpenRoom: (room: Room) => void;
  onOpenProduct: (product: Product) => void;
}) {
  const pending = rooms.filter((r) => r.state === "awaiting_approval");
  const active = rooms.filter((r) =>
    ["negotiating", "needs_revision"].includes(r.state),
  );
  const myReviews = pending.filter(
    (room) =>
      room.current_offer &&
      !room.current_offer.approvals.some(
        (approval) => approval.workspace_id === me.workspace.id,
      ),
  );
  const total = orders.reduce((n, o) => n + o.offer.terms.total, 0);
  return (
    <>
      <div className="stats">
        <button
          type="button"
          className="stat"
          onClick={() => navigate("negotiations")}
        >
          <span>
            Active negotiations
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
          <strong>{active.length}</strong>
          <small>Conversations in progress</small>
        </button>
        <button
          type="button"
          className="stat accent"
          onClick={() => navigate("approvals")}
        >
          <span>
            Needs your review
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
          <strong>{myReviews.length}</strong>
          <small>
            {pending.length - myReviews.length} already approved by your
            business
          </small>
        </button>
        <button
          type="button"
          className="stat"
          onClick={() => navigate("orders")}
        >
          <span>
            Demo orders
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
          <strong>{orders.length}</strong>
          <small>Approved by both businesses</small>
        </button>
        <button
          type="button"
          className="stat"
          onClick={() => navigate("orders")}
        >
          <span>
            {me.workspace.role === "seller"
              ? "Agreed sales value"
              : "Agreed purchase value"}
            <ArrowUpRight size={16} aria-hidden="true" />
          </span>
          <strong className="money-stat">{money(total)}</strong>
          <small>Internal demo order totals</small>
        </button>
      </div>
      <p className="snapshot-scope">
        Current snapshot · up to 100 recent negotiations and 100 orders. Demo
        totals do not represent payments.
      </p>
      <div className="section-heading">
        <div>
          <h2>Offers awaiting approval</h2>
          <p>Review the exact terms before you decide.</p>
        </div>
        <button className="text-button" onClick={() => navigate("approvals")}>
          All approvals <ArrowRight size={16} />
        </button>
      </div>
      <section
        className="panel decision-panel"
        aria-label="Offers awaiting approval"
      >
        <RoomTable rows={pending.slice(0, 4)} emphasize onOpen={onOpenRoom} />
      </section>
      <div className="overview-bottom">
        <section>
          <div className="section-heading">
            <h2>Catalogue preview</h2>
            <button
              className="text-button"
              onClick={() => navigate("products")}
            >
              Explore <ArrowRight size={16} />
            </button>
          </div>
          <div className="mini-products">
            {products.slice(0, 3).map((p) => {
              const image =
                p.images.find((i) => i.id === p.cover_id) || p.images[0];
              return (
                <button
                  key={p.id}
                  className="mini-product"
                  onClick={() => onOpenProduct(p)}
                >
                  <div>
                    {image ? (
                      <img src={imageUrl(image, true)} alt={p.name} />
                    ) : (
                      <Package />
                    )}
                  </div>
                  <strong>{p.name}</strong>
                  <span>{p.supplier}</span>
                  <b>
                    {money(p.unit_price)} <small>asking / unit</small>
                  </b>
                </button>
              );
            })}
          </div>
        </section>
        <section>
          <div className="section-heading">
            <h2>Latest activity</h2>
            <button
              className="text-button"
              aria-label="View all activity"
              onClick={() => navigate("activity")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          <div className="panel activity-list">
            {events.slice(0, 5).map((e) => (
              <div className="event" key={e.id}>
                <span className="event-dot">
                  <Activity size={15} />
                </span>
                <div>
                  <strong>{human(e.type)}</strong>
                  <small>{new Date(e.at).toLocaleString()}</small>
                </div>
              </div>
            ))}
            {events.length === 0 && (
              <p className="muted">Recorded agent actions will appear here.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
