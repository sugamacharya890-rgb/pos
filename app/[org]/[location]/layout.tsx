import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { requireTenant } from "@/lib/auth/session";

export default async function LocationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ org: string; location: string }>;
}) {
  const { org, location } = await params;
  const ctx = await requireTenant(org, location);
  return <AppShell ctx={ctx}>{children}</AppShell>;
}
