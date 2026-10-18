import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Card = ({ className, ...p }: ComponentProps<"div">) => (
  <div className={cn("rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]", className)} {...p} />
);
