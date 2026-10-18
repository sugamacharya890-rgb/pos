"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess, type Role } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils";
import { NAV } from "./nav";

/** Icon rail on tablets, labelled rail on desktop. Only shows what the role may open. */
export function Sidebar({ base, role }: { base: string; role: Role }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => canAccess(role, n.module));
  const groups = (["service", "admin"] as const)
    .map((g) => items.filter((i) => i.group === g))
    .filter((g) => g.length > 0);

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 border-r bg-card p-2 lg:w-56 lg:p-3">
      <div className="mb-3 grid h-12 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground lg:place-items-start lg:px-4 lg:leading-[3rem]">
        <span className="lg:hidden">R</span>
        <span className="hidden lg:inline">RMS</span>
      </div>
      {groups.map((group, gi) => (
        <div key={gi} className={cn("flex flex-col gap-1", gi > 0 && "mt-3 border-t pt-3")}>
          {group.map(({ module, label, icon: Icon }) => {
            const href = `${base}/${module}`;
            const active = pathname.startsWith(href);
            return (
              <Link
                key={module}
                href={href}
                aria-current={active ? "page" : undefined}
                title={label}
                className={cn(
                  "flex h-14 items-center justify-center gap-3 rounded-xl px-3 text-[15px] font-medium text-muted-foreground transition-colors lg:justify-start",
                  "hover:bg-muted hover:text-foreground",
                  active && "bg-accent text-foreground",
                )}
              >
                <Icon className="size-6 shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
