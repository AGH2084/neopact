import type { Room } from "../../lib/api";
import { exampleRoom } from "./guidance";

export function conversationRoom(): Room {
  const room = exampleRoom();
  room.product.images = [
    {
      id: "image-1",
      product_id: "product-1",
      status: "ready",
      mime: "image/svg+xml",
      width: 40,
      height: 40,
      sha256: "image-checksum",
      position: 0,
      caption: "Woven back detail",
      error: null,
      content_path: "/images/image-1/content",
      thumbnail_path: "/images/image-1/content?thumbnail=true",
    },
  ];
  room.activity = [
    {
      id: "message-1",
      role: "buyer",
      type: "message",
      run: 1,
      at: "2026-10-10T09:00:00Z",
      data: {
        message:
          "We need eight chairs before the opening. Can you deliver by 24 October?",
        purpose: "question",
        image_ids: [],
      },
    },
    {
      id: "message-2",
      role: "seller",
      type: "message",
      run: 1,
      at: "2026-10-10T09:01:00Z",
      data: {
        message:
          "We can deliver on 22 October. This image shows the woven back.",
        purpose: "answer",
        reply_to_action_id: "message-1",
        image_ids: ["image-1"],
      },
    },
    {
      id: "message-3",
      role: "buyer",
      type: "message",
      run: 1,
      at: "2026-10-10T09:02:00Z",
      data: {
        message:
          "Could you improve the total while keeping that delivery date?",
        purpose: "tradeoff",
        image_ids: [],
      },
    },
    {
      id: "message-4",
      role: "seller",
      type: "propose",
      run: 1,
      at: "2026-10-10T09:03:00Z",
      data: {
        offer_id: "offer-1",
        offer_version: 1,
        message:
          "I can offer €117.50 per chair with 20% deposit and delivery on 22 October.",
        purpose: "explanation",
        image_ids: [],
      },
    },
    {
      id: "message-5",
      role: "buyer",
      type: "accept",
      run: 1,
      at: "2026-10-10T09:04:00Z",
      data: { offer_id: "offer-1", image_ids: [] },
    },
  ];
  return room;
}
