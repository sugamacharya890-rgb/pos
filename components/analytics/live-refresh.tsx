"use client";

import { useRouter } from "next/navigation";
import { useChannel } from "@/lib/realtime/client";

/** Re-render the server dashboard whenever a bill is paid at this outlet. */
export function LiveRefresh({ org, location }: { org: string; location: string }) {
  const router = useRouter();
  useChannel({ org, location, channel: "dashboard" }, { "payment.captured": () => router.refresh() });
  return null;
}
