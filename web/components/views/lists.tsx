"use client";
import { useState } from "react";
import { Activity, ArrowUpRight, Package, ShieldCheck } from "lucide-react";
import {
  human,
  imageUrl,
  money,
  type AuditEvent,
  type Me,
  type Order,
  type Product,
  type PurchaseRequest,
  type Room,
} from "@/lib/api";
import { RoomTable } from "../room-table";
import { Badge, Empty, SearchBar } from "../ui";

const matches = (text: string, query: string) =>
  text.toLowerCase().includes(query.toLowerCase());

export function ProductsView({
  products,
  onOpen,
}: {
  products: Product[];
  onOpen: (product: Product) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = products.filter((p) =>
    matches(`${p.name} ${p.supplier} ${p.sku}`, search),
  );
  return (
    <>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search products, suppliers or SKU…"
        count={`${rows.length} products`}
      />
      <div className="product-grid">
        {rows.map((p) => {
          const image =
            p.images.find((i) => i.id === p.cover_id) ||
            p.images.find((i) => i.status === "ready");
          return (
            <button
              key={p.id}
              className="product-card"
              onClick={() => onOpen(p)}
            >
              <div className="product-image">
                {image ? (
                  <img src={imageUrl(image)} alt={p.name} />
                ) : (
                  <Package size={48} />
                )}
                <span className="stock-tag">{p.stock} available</span>
              </div>
              <div className="product-body">
                <div className="product-title">
                  <h3>{p.name}</h3>
                  <ArrowUpRight size={20} />
                </div>
                <p className="supplier-label">{p.supplier}</p>
                <p>
                  {p.attributes.material} · {p.attributes.color}
                </p>
                <div className="product-price">
                  <strong>
                    {money(p.unit_price)} <small>/ unit</small>
                  </strong>
                  <span>{p.lead_days}-day delivery</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {rows.length === 0 && (
        <Empty
          title="No products found"
          detail="Try a different search. Seller agents publish products over MCP."
        />
      )}
    </>
  );
}

export function RequestsView({
  requests,
  onOpen,
}: {
  requests: PurchaseRequest[];
  onOpen: (request: PurchaseRequest) => void;
}) {
  return (
    <section className="panel">
      {requests.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Purchase request</th>
                <th className="numeric">Quantity</th>
                <th>Destination</th>
                <th className="numeric">Private budget</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    <span>Delivery by {r.latest_delivery}</span>
                  </td>
                  <td className="numeric">{r.quantity}</td>
                  <td>{r.destination}</td>
                  <td className="numeric">{money(r.max_total || 0)}</td>
                  <td>
                    <Badge value={r.state} />
                  </td>
                  <td>
                    <button className="text-button" onClick={() => onOpen(r)}>
                      Inspect <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Your first request starts with your agent"
          detail="Your buyer agent creates and launches purchase requests over MCP. Requirements and supplier matches will appear here."
        />
      )}
    </section>
  );
}

export function NegotiationsView({
  rooms,
  approvalsOnly,
  onOpen,
}: {
  rooms: Room[];
  approvalsOnly: boolean;
  onOpen: (room: Room) => void;
}) {
  const [search, setSearch] = useState("");
  const rows = rooms
    .filter((r) => !approvalsOnly || r.state === "awaiting_approval")
    .filter((r) =>
      matches(`${r.supplier} ${r.request.title} ${r.state}`, search),
    );
  return (
    <>
      <SearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search requests or suppliers…"
        count={`${rows.length} ${approvalsOnly ? "approvals" : "negotiations"}`}
      />
      <section className="panel">
        <RoomTable rows={rows} onOpen={onOpen} />
      </section>
      <div className="quiet-note">
        <ShieldCheck size={18} /> Agent agreement prepares a deal. Two human
        approvals confirm it.
      </div>
    </>
  );
}

export function OrdersView({
  me,
  orders,
  onOpen,
}: {
  me: Me;
  orders: Order[];
  onOpen: (order: Order) => void;
}) {
  return (
    <section className="panel">
      {orders.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product / order</th>
                <th>Counterparty</th>
                <th className="numeric">Total</th>
                <th>Confirmed</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.offer.product.name}</strong>
                    <span>#{o.id.slice(0, 8)}</span>
                  </td>
                  <td>{me.workspace.role === "buyer" ? o.seller : o.buyer}</td>
                  <td className="numeric">{money(o.offer.terms.total)}</td>
                  <td>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td>
                    <button className="text-button" onClick={() => onOpen(o)}>
                      View order <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Agreements will become orders here"
          detail="An order is recorded once both businesses approve the same valid offer."
        />
      )}
    </section>
  );
}

export function ActivityView({ events }: { events: AuditEvent[] }) {
  return (
    <section className="panel activity-list" aria-label="Workspace audit trail">
      {events.map((e) => (
        <div className="event" key={e.id}>
          <span className="event-dot">
            <Activity size={16} />
          </span>
          <div>
            <strong>{human(e.type)}</strong>
            <small>
              Record {e.resource_id.slice(0, 8)} · Actor{" "}
              {e.actor_id.slice(0, 12)}
            </small>
            {Object.keys(e.data).length > 0 && (
              <span className="event-data">
                {Object.entries(e.data)
                  .map(
                    ([k, v]) =>
                      `${human(k)}: ${Array.isArray(v) ? v.join(", ") : String(v)}`,
                  )
                  .join(" · ")}
              </span>
            )}
          </div>
          <time>{new Date(e.at).toLocaleString()}</time>
        </div>
      ))}
      {events.length === 0 && (
        <Empty
          title="A clean slate"
          detail="Your workspace’s recorded actions will appear here."
        />
      )}
    </section>
  );
}
