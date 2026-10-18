import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, membershipFor, verifyAccessToken } from "@/lib/auth/jwt";
import { canAccess, isModule, ROLE_HOME } from "@/lib/auth/rbac";

/**
 * Fast first gate (edge, no DB). URL shape: /{org}/{location}/{module}/...
 * The server layout re-verifies against the DB — this just stops a waiter's
 * tablet from ever rendering /pos or another owner's /{org}.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);

  if (!claims) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const [orgSlug, locationSlug, mod] = pathname.split("/").filter(Boolean);
  if (!orgSlug) return NextResponse.next();

  const m = membershipFor(claims, orgSlug, locationSlug);
  // 404 rather than 403: don't reveal that another franchise exists.
  if (!m) return NextResponse.rewrite(new URL("/404", req.url));

  if (locationSlug && !mod) {
    return NextResponse.redirect(new URL(`/${orgSlug}/${locationSlug}/${ROLE_HOME[m.r]}`, req.url));
  }
  if (mod && !(isModule(mod) && canAccess(m.r, mod))) {
    return NextResponse.redirect(new URL(`/${orgSlug}/${locationSlug}/${ROLE_HOME[m.r]}`, req.url));
  }
  return NextResponse.next();
}

export const config = {
  // API routes authorise themselves (lib/auth/api.ts) and must return JSON, not redirects.
  matcher: ["/((?!login|api|_next|rt|favicon.ico|404).*)"],
};
