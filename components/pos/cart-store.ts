"use client";

import { create } from "zustand";
import type { MenuItemDTO, MenuModifier } from "./types";

export type CartLine = {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  modifiers: MenuModifier[];
  modifiersTotal: number;
  quantity: number;
  seatNumber?: number;
  notes?: string;
};

type CartState = {
  lines: CartLine[];
  seat: number | undefined;
  lastKey: string | null;
  add: (item: MenuItemDTO, modifiers?: MenuModifier[]) => void;
  inc: (key: string, by: number) => void;
  remove: (key: string) => void;
  setSeat: (s: number | undefined) => void;
  clear: () => void;
};

/** Same item + same modifiers + same seat stacks into one line (qty++). */
const lineKey = (id: string, mods: MenuModifier[], seat?: number) =>
  [id, seat ?? 0, ...mods.map((m) => m.id).sort()].join("|");

export const useCart = create<CartState>((set) => ({
  lines: [],
  seat: undefined,
  lastKey: null,
  add: (item, modifiers = []) =>
    set((s) => {
      const key = lineKey(item.id, modifiers, s.seat);
      const found = s.lines.find((l) => l.key === key);
      const lines = found
        ? s.lines.map((l) => (l.key === key ? { ...l, quantity: l.quantity + 1 } : l))
        : [
            ...s.lines,
            {
              key,
              menuItemId: item.id,
              name: item.name,
              unitPrice: item.price,
              modifiers,
              modifiersTotal: modifiers.reduce((a, m) => a + m.priceDelta, 0),
              quantity: 1,
              seatNumber: s.seat,
            },
          ];
      return { lines, lastKey: key };
    }),
  inc: (key, by) =>
    set((s) => ({
      lines: s.lines.flatMap((l) => (l.key !== key ? [l] : l.quantity + by <= 0 ? [] : [{ ...l, quantity: l.quantity + by }])),
    })),
  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
  setSeat: (seat) => set({ seat }),
  clear: () => set({ lines: [], lastKey: null, seat: undefined }),
}));
