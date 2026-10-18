"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MenuItemDTO, MenuModifier } from "./types";

export function ModifierSheet({
  item,
  currency,
  onClose,
  onConfirm,
}: {
  item: MenuItemDTO | null;
  currency: string;
  onClose: () => void;
  onConfirm: (mods: MenuModifier[]) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const toggle = (groupId: string, max: number, id: string) =>
    setPicked((p) => {
      const cur = p[groupId] ?? [];
      if (cur.includes(id)) return { ...p, [groupId]: cur.filter((x) => x !== id) };
      return { ...p, [groupId]: max === 1 ? [id] : cur.length < max ? [...cur, id] : cur };
    });

  const groups = item?.modifierGroups ?? [];
  const valid = groups.every((g) => (picked[g.id]?.length ?? 0) >= g.minSelect);
  const selected = groups.flatMap((g) => g.modifiers.filter((m) => picked[g.id]?.includes(m.id)));
  const total = (item?.price ?? 0) + selected.reduce((s, m) => s + m.priceDelta, 0);

  return (
    <Sheet
      open={!!item}
      onOpenChange={(o) => !o && (setPicked({}), onClose())}
      title={item?.name ?? ""}
      description={item ? formatMoney(item.price, currency) : undefined}
      restoreFocus={false}
    >
      <div className="flex flex-col gap-6 overflow-y-auto">
        {groups.map((g) => (
          <fieldset key={g.id}>
            <legend className="mb-2 flex w-full items-baseline justify-between font-semibold">
              {g.name}
              <span className="text-sm font-normal text-muted-foreground">
                {g.minSelect > 0 ? "Required" : "Optional"} · {g.maxSelect === 1 ? "pick one" : `up to ${g.maxSelect}`}
              </span>
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {g.modifiers.map((m) => {
                const on = picked[g.id]?.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(g.id, g.maxSelect, m.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex min-h-14 items-center justify-between gap-2 rounded-xl border px-4 text-left transition-colors",
                      on ? "border-primary bg-accent" : "hover:bg-muted",
                    )}
                  >
                    <span className="font-medium">{m.name}</span>
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      {m.priceDelta > 0 && `+${formatMoney(m.priceDelta, currency)}`}
                      {on && <Check className="size-4 text-primary" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      <Button
        size="lg"
        className="mt-auto"
        disabled={!valid}
        onClick={() => {
          onConfirm(selected);
          setPicked({});
        }}
      >
        Add · {formatMoney(total, currency)}
      </Button>
    </Sheet>
  );
}
