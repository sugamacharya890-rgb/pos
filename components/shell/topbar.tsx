"use client";

import { LogOut, Moon, Store, Sun, Wifi, WifiOff } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConnectionStatus } from "@/lib/realtime/client";
import type { Role } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils";

type Props = {
  orgSlug: string;
  orgName: string;
  locationSlug: string;
  locations: { slug: string; name: string }[];
  userName: string;
  role: Role;
};

export function Topbar({ orgSlug, orgName, locationSlug, locations, userName, role }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const online = useConnectionStatus();

  // Switching outlet keeps you on the same module.
  const switchLocation = (slug: string) =>
    router.push(pathname.replace(`/${orgSlug}/${locationSlug}`, `/${orgSlug}/${slug}`));

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/80 px-3 backdrop-blur lg:px-5">
      <div className="flex min-w-0 items-center gap-2">
        <Store className="size-5 shrink-0 text-muted-foreground" />
        <span className="hidden truncate font-semibold sm:inline">{orgName}</span>
        <span className="hidden text-muted-foreground sm:inline">/</span>
        {locations.length > 1 ? (
          <select
            aria-label="Location"
            value={locationSlug}
            onChange={(e) => switchLocation(e.target.value)}
            className="h-12 rounded-xl border bg-card px-3 font-medium"
          >
            {locations.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="truncate font-medium">{locations[0]?.name}</span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span
          className={cn(
            "hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium sm:flex",
            online ? "bg-free/15 text-free" : "bg-occupied/15 text-occupied",
          )}
          role="status"
        >
          {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          {online ? "Live" : "Offline"}
        </span>
        <Clock />
        <ThemeToggle />
        <div className="hidden text-right leading-tight md:block">
          <div className="text-sm font-medium">{userName}</div>
          <div className="text-xs text-muted-foreground">{role.toLowerCase()}</div>
        </div>
        <form action="/api/auth/logout" method="post">
          <Button variant="ghost" size="icon" aria-label="Sign out">
            <LogOut />
          </Button>
        </form>
      </div>
    </header>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="hidden whitespace-nowrap px-1 text-lg font-semibold tabular-nums md:block">
      {now?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(dark ? "light" : "dark")}>
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}
