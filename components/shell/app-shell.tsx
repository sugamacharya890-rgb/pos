import type { ReactNode } from "react";
import type { TenantContext } from "@/lib/auth/session";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * ┌──────┬──────────────────────────────────┐
 * │      │ Topbar: org / location ▾ · live  │
 * │ Rail ├──────────────────────────────────┤
 * │      │ Module (full-height, own scroll) │
 * └──────┴──────────────────────────────────┘
 * KITCHEN / BAR get no rail: the KDS is the whole screen.
 */
export function AppShell({ ctx, children }: { ctx: TenantContext; children: ReactNode }) {
  const base = `/${ctx.org.slug}/${ctx.location.slug}`;
  const kdsOnly = ctx.role === "KITCHEN" || ctx.role === "BAR";
  return (
    <div className="flex h-dvh overflow-hidden">
      {!kdsOnly && <Sidebar base={base} role={ctx.role} />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          orgSlug={ctx.org.slug}
          orgName={ctx.org.name}
          locationSlug={ctx.location.slug}
          locations={ctx.locations}
          userName={ctx.userName}
          role={ctx.role}
        />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
