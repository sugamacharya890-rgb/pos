import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCESS_COOKIE, ACCESS_TTL_SECONDS, signAccessToken, type MembershipClaim } from "@/lib/auth/jwt";
import { ROLE_HOME } from "@/lib/auth/rbac";
import { systemDb } from "@/lib/db/system";

const DUMMY_HASH = "$2b$10$e6.6dlbF2o1pfWNByiAWR.BhiFc7KoU.fol.5VpQc7Aa8j06OJU9K";
const Body = z.object({ email: z.email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });

  const user = await systemDb.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: {
      memberships: {
        where: { isActive: true },
        include: {
          organization: { select: { slug: true, locations: { where: { isActive: true }, select: { slug: true } } } },
          locations: { select: { location: { select: { slug: true } } } },
        },
      },
    },
  });
  // Always run a compare so response time doesn't reveal which emails exist.
  const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive || user.memberships.length === 0) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const m: MembershipClaim[] = user.memberships.map((mb) => ({
    o: mb.organizationId,
    s: mb.organization.slug,
    r: mb.role,
    l: mb.role === "OWNER" || mb.allLocations ? "*" : mb.locations.map((x) => x.location.slug),
  }));

  // Land on the first location of the first membership, or the owner portfolio.
  const first = user.memberships[0];
  const locSlug =
    first.role === "OWNER" || first.allLocations
      ? first.organization.locations[0]?.slug
      : first.locations[0]?.location.slug;
  const redirectTo =
    first.role === "OWNER" || !locSlug
      ? `/${first.organization.slug}`
      : `/${first.organization.slug}/${locSlug}/${ROLE_HOME[first.role]}`;

  const token = await signAccessToken({ sub: user.id, name: user.name, m });
  const res = NextResponse.json({ redirectTo });
  res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
  return res;
}
