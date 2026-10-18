/** Typed contract between the socket server and every client. */
export type Channel = "floor" | "kds" | "pos" | "dashboard";

export type TicketDTO = {
  id: string;
  orderId: string;
  orderNumber: number;
  tableLabel: string | null;
  station: "KITCHEN" | "BAR";
  status: "NEW" | "IN_PREPARATION" | "READY" | "SERVED";
  firedAt: string;
  items: { id: string; name: string; quantity: number; notes: string | null; modifiers: string[]; seatNumber: number | null }[];
};

export type ServerToClient = {
  "ticket.created": (t: TicketDTO) => void;
  "ticket.updated": (t: Pick<TicketDTO, "id" | "status">) => void;
  "table.updated": (t: { id: string; status: string; posX?: number; posY?: number }) => void;
  "order.updated": (o: { id: string; status: string; total: number; version: number }) => void;
  "payment.captured": (p: { orderId: string; amount: number; method: string }) => void;
};

export type ClientToServer = {
  join: (
    req: { org: string; location: string; channel: Channel },
    ack: (res: { ok: true } | { ok: false; error: string }) => void,
  ) => void;
};

/** Room = org id + location slug + channel. Org *id* (not slug) so a renamed slug can't collide. */
export const room = (orgId: string, locationSlug: string, channel: Channel) =>
  `org:${orgId}:loc:${locationSlug}:${channel}`;
