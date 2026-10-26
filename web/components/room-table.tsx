"use client";
import { ArrowUpRight } from "lucide-react";
import { money, type Room } from "@/lib/api";
import { Badge, Empty } from "./ui";

export function RoomTable({
  rows,
  emphasize = false,
  onOpen,
}: {
  rows: Room[];
  emphasize?: boolean;
  onOpen: (room: Room) => void;
}) {
  if (!rows.length)
    return (
      <Empty
        title="Nothing here yet"
        detail="Your agents’ negotiations will appear here as they work through the marketplace."
      />
    );
  return (
    <div
      className="table-wrap"
      role="region"
      aria-label="Negotiation offers"
      tabIndex={0}
    >
      <table className="room-table">
        <thead>
          <tr>
            <th scope="col">Request / supplier</th>
            <th scope="col">Status</th>
            <th scope="col" className="numeric">
              Current total
            </th>
            <th scope="col" className="numeric">
              Deposit
            </th>
            <th scope="col">Delivery</th>
            <th scope="col" className="row-action" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="record-cell">
                <strong>{r.request.title}</strong>
                <span>{r.supplier}</span>
                {r.current_offer && (
                  <span className="mobile-offer-summary" aria-hidden="true">
                    <b>{money(r.current_offer.terms.total)}</b>
                    <span>
                      {r.current_offer.terms.deposit_percent}% deposit ·
                      Delivery {r.current_offer.terms.delivery_date}
                    </span>
                  </span>
                )}
              </td>
              <td>
                <Badge value={r.state} />
              </td>
              <td className="numeric">
                {r.current_offer ? money(r.current_offer.terms.total) : "—"}
              </td>
              <td className="numeric">
                {r.current_offer
                  ? `${r.current_offer.terms.deposit_percent}%`
                  : "—"}
              </td>
              <td>{r.current_offer?.terms.delivery_date || "—"}</td>
              <td className="row-action">
                <button
                  className={emphasize ? "button primary" : "text-button"}
                  onClick={() => onOpen(r)}
                >
                  Review <ArrowUpRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
