import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { systemDb } from "@/lib/db/system";
import { ACCESS_COOKIE, verifyAccessToken, type AccessClaims } from "./jwt";
import { canAccess, type Module, type Role } from "./rbac";

export const getClaims = cache(async () => {
  const jar = await cookies();
  return verifyAccessToken(jar.get(ACCESS_COOKIE)?.value);
});

export type TenantContext = {
  userId: string;
  userName: string;
  membershipId: string;
  role: Role;
  org: { id: string; slug: string; name: string; currency: string };
  location: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    taxRateBps: number;
    serviceChargeBps: number;
    taxInclusive: boolean;
  };
  /** every location this member may switch to */
  locations: { slug: string; name: string }[];
};

/**
 * Authoritative tenant + role resolution, re-checked against the database on
 * every request (the JWT may be up to 12h stale: deactivated staff, removed
 * location access). Middleware is only the fast first gate.
 */
export async function resolveTenant(
  claims: AccessClaims,
  orgSlug: string,
  locationSlug: string,
): Promise<TenantContext | null> {
  const membership = await systemDb.membership.findFirst({
    where: { userId: claims.sub, isActive: true, user: { isActive: true }, organization: { slug: orgSlug } },
    include: {
      organization: { include: { locations: { where: { isActive: true }, orderBy: { name: "asc" } } } },
      locations: { select: { locationId: true } },
    },
  });
  if (!membership) return null;

  const allowedIds = new Set(membership.locations.map((l) => l.locationId));
  const locations = membership.organization.locations.filter(
    (l) => membership.allLocations || membership.role === "OWNER" || allowedIds.has(l.id),
  );
  const location = locations.find((l) => l.slug === locationSlug);
  if (!location) return null;

  const { organization: org } = membership;
  return {
    userId: claims.sub,
    userName: claims.name,
    membershipId: membership.id,
    role: membership.role,
    org: { id: org.id, slug: org.slug, name: org.name, currency: org.currency },
    location: {
      id: location.id,
      slug: location.slug,
      name: location.name,
      timezone: location.timezone,
      taxRateBps: location.taxRateBps,
      serviceChargeBps: location.serviceChargeBps,
      taxInclusive: location.taxInclusive,
    },
    locations: locations.map((l) => ({ slug: l.slug, name: l.name })),
  };
}

export const requireTenant = cache(async (orgSlug: string, locationSlug: string) => {
  const claims = await getClaims();
  if (!claims) redirect("/login");
  const ctx = await resolveTenant(claims, orgSlug, locationSlug);
  if (!ctx) notFound();
  return ctx;
});

export async function requireModule(orgSlug: string, locationSlug: string, module: Module) {
  const ctx = await requireTenant(orgSlug, locationSlug);
  if (!canAccess(ctx.role, module)) redirect(`/${orgSlug}/${locationSlug}`);
  return ctx;
}
