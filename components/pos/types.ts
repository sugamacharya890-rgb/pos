export type MenuModifier = { id: string; name: string; priceDelta: number };
export type MenuModifierGroup = { id: string; name: string; minSelect: number; maxSelect: number; modifiers: MenuModifier[] };
export type MenuItemDTO = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  shortcode: string | null;
  station: "KITCHEN" | "BAR";
  modifierGroups: MenuModifierGroup[];
};
export type CategoryDTO = { id: string; name: string; color: string | null };
export type ActiveOrderDTO = {
  id: string;
  number: number;
  tableLabel: string | null;
  guestCount: number;
  openedAt: string;
  subtotal: number;
  discountTotal: number;
  serviceCharge: number;
  taxTotal: number;
  total: number;
  items: { id: string; name: string; quantity: number; lineTotal: number; seatNumber: number | null; modifiers: string[] }[];
};
