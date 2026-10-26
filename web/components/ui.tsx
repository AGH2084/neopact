"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Command, ImageOff, Search, X } from "lucide-react";
import { human, imageUrl, money, type Offer, type Product } from "@/lib/api";
import { Brand } from "./brand";

export function Badge({ value }: { value: string }) {
  return <span className={`badge badge-${value}`}>{human(value)}</span>;
}

export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <Command size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const d = ref.current;
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-heading">
        <Brand />
        <button
          className="icon-button"
          aria-label="Close details"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export function Gallery({ product }: { product: Product }) {
  const images = product.images.filter((i) => i.status === "ready");
  const [selected, setSelected] = useState(product.cover_id || images[0]?.id);
  const current = images.find((i) => i.id === selected) || images[0];
  return (
    <div className="gallery">
      <div className="gallery-main">
        {current ? (
          <img src={imageUrl(current)} alt={current.caption || product.name} />
        ) : (
          <ImageOff size={40} />
        )}
      </div>
      {images.length > 1 && (
        <div className="thumbnails">
          {images.map((i) => (
            <button
              key={i.id}
              className={i.id === current?.id ? "selected" : ""}
              aria-label={i.caption || "Product image"}
              onClick={() => setSelected(i.id)}
            >
              <img src={imageUrl(i, true)} alt={i.caption} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TermsGrid({ offer }: { offer: Offer }) {
  return (
    <div className="terms-grid">
      <div>
        <span>Total including delivery</span>
        <strong>{money(offer.terms.total)}</strong>
      </div>
      <div>
        <span>Deposit</span>
        <strong>{offer.terms.deposit_percent}%</strong>
      </div>
      <div>
        <span>Delivery by</span>
        <strong>{offer.terms.delivery_date}</strong>
      </div>
      <div>
        <span>Quantity × unit price</span>
        <strong>
          {offer.terms.quantity} × {money(offer.terms.unit_price)}
        </strong>
      </div>
    </div>
  );
}

/** Local search box used by the list views. */
export function SearchBar({
  value,
  onChange,
  placeholder,
  count,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  count: string;
}) {
  return (
    <div className="toolbar">
      <label className="search">
        <Search size={18} />
        <input
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <span className="muted">{count}</span>
    </div>
  );
}
