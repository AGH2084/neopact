"use client";
import { useState, type FormEvent } from "react";
import { Check, CheckCheck, X } from "lucide-react";
import {
  api,
  can,
  money,
  type Me,
  type Order,
  type Product,
  type PurchaseRequest,
  type Room,
} from "@/lib/api";
import { RoomTable } from "./room-table";
import { Badge, Gallery, Modal, TermsGrid } from "./ui";

export function ProductDetail({
  me,
  product,
  onClose,
  onUpdated,
}: {
  me: Me;
  product: Product;
  onClose: () => void;
  onUpdated: (product: Product) => void;
}) {
  const ownsStock =
    product.workspace_id === me.workspace.id && can(me, "products:write");
  return (
    <Modal title={product.name} onClose={onClose}>
      <Gallery product={product} />
      <div className="detail-meta">
        <span>{product.supplier}</span>
        <Badge value={product.published ? "published" : "draft"} />
      </div>
      <p className="description">{product.description}</p>
      <div className="terms-grid">
        <div>
          <span>Asking price per unit</span>
          <strong>{money(product.unit_price)}</strong>
        </div>
        <div>
          <span>Available stock</span>
          <strong>{product.stock}</strong>
        </div>
        <div>
          <span>Delivery charge</span>
          <strong>{money(product.delivery_charge)}</strong>
        </div>
        <div>
          <span>Lead time</span>
          <strong>{product.lead_days} days</strong>
        </div>
      </div>
      {ownsStock && <StockEditor product={product} onUpdated={onUpdated} />}
      <dl className="details">
        <div>
          <dt>Material</dt>
          <dd>{product.attributes.material}</dd>
        </div>
        <div>
          <dt>Stackable</dt>
          <dd>{product.attributes.stackable ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt>Delivery coverage</dt>
          <dd>{product.destinations.join(", ")}</dd>
        </div>
        <div>
          <dt>SKU / revision</dt>
          <dd>
            {product.sku} / v{product.version}
          </dd>
        </div>
      </dl>
    </Modal>
  );
}

function StockEditor({
  product,
  onUpdated,
}: {
  product: Product;
  onUpdated: (product: Product) => void;
}) {
  const [stock, setStock] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onUpdated(await api.setStock(product.id, Number(stock), product.version));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stock-editor" onSubmit={save}>
      <label>
        Update available stock
        <input
          type="number"
          min={0}
          step={1}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          required
        />
      </label>
      <button
        className="button secondary"
        disabled={busy || Number(stock) === product.stock}
      >
        {busy ? "Saving…" : "Save stock"}
      </button>
      <small>
        Changing stock invalidates open offers on this product; agents re-offer
        and both businesses approve again.
      </small>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}

export function RequestDetail({
  request,
  rooms,
  onClose,
  onOpenRoom,
}: {
  request: PurchaseRequest;
  rooms: Room[];
  onClose: () => void;
  onOpenRoom: (room: Room) => void;
}) {
  return (
    <Modal title={request.title} onClose={onClose}>
      <Badge value={request.state} />
      <p className="description">{request.description}</p>
      <div className="terms-grid">
        <div>
          <span>Private maximum total</span>
          <strong>{money(request.max_total || 0)}</strong>
        </div>
        <div>
          <span>Maximum deposit</span>
          <strong>{request.max_deposit_percent}%</strong>
        </div>
        <div>
          <span>Destination</span>
          <strong>{request.destination}</strong>
        </div>
        <div>
          <span>Delivery by</span>
          <strong>{request.latest_delivery}</strong>
        </div>
      </div>
      <h3>Supplier matching</h3>
      {request.matches?.map((m) => (
        <div key={m.product_id} className="match">
          <span className={m.eligible ? "success-text" : "muted"}>
            {m.eligible ? <Check size={18} /> : <X size={18} />}
          </span>
          <div>
            <strong>{m.supplier}</strong>
            <p>{m.reasons.join(" · ")}</p>
          </div>
        </div>
      ))}
      <h3>Compare offers</h3>
      <RoomTable
        rows={rooms.filter((r) => r.request_id === request.id)}
        onOpen={onOpenRoom}
      />
    </Modal>
  );
}

export function OrderDetail({
  order,
  onClose,
}: {
  order: Order;
  onClose: () => void;
}) {
  return (
    <Modal title={`Order #${order.id.slice(0, 8)}`} onClose={onClose}>
      <Badge value="confirmed_demo" />
      <p className="description">
        {order.buyer} → {order.seller}
      </p>
      <TermsGrid offer={order.offer} />
      <Gallery product={order.offer.product} />
      <h3>Recorded approvals</h3>
      {order.offer.approvals.map((a) => (
        <div className="match" key={a.workspace_id}>
          <CheckCheck className="success-text" />
          <div>
            <strong>
              {a.workspace_id === order.buyer_id ? "Buyer" : "Seller"} approval
            </strong>
            <p>{new Date(a.at).toLocaleString()}</p>
          </div>
        </div>
      ))}
      <p className="quiet-note">
        This internal demo order records the approved agreement. Payment and
        fulfilment are not executed.
      </p>
    </Modal>
  );
}
