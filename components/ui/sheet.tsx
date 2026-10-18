"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Side drawer (table quick actions) / centered modal (payment). */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  side = "right",
  children,
  className,
  restoreFocus = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  side?: "right" | "center";
  children: ReactNode;
  className?: string;
  /** false for rapid-entry flows: don't yank focus back to the trigger on close */
  restoreFocus?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-[arrive_200ms]" />
        <Dialog.Content
          onCloseAutoFocus={restoreFocus ? undefined : (e) => e.preventDefault()}
          className={cn(
            "fixed z-50 flex flex-col gap-4 bg-card p-6 shadow-2xl outline-none",
            side === "right"
              ? "inset-y-0 right-0 w-full max-w-md border-l data-[state=open]:animate-[arrive_260ms]"
              : "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold tracking-tight">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-muted-foreground">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="grid size-12 place-items-center rounded-xl hover:bg-muted" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
