import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Every size ≥ 48px tall — touch-first. */
const buttonVariants = cva(
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[transform,background-color,box-shadow] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-sm hover:brightness-110",
        secondary: "bg-muted text-foreground hover:bg-accent",
        outline: "border bg-card hover:bg-muted",
        ghost: "hover:bg-muted",
        danger: "bg-occupied text-white hover:brightness-110",
      },
      size: {
        md: "h-12 min-w-12 px-4 text-base",
        lg: "h-14 min-w-14 px-6 text-lg",
        xl: "h-16 px-8 text-xl",
        icon: "size-12",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
