import { jwtVerify, SignJWT } from "jose";
import type { Role } from "./rbac";

/** Edge-safe (used by middleware). Keep claims small — they ride every request. */
export type MembershipClaim = {
  /** organization id */
  o: string;
  /** organization slug */
  s: string;
  r: Role;
  /** location slugs the member may enter, or "*" for all */
  l: string[] | "*";
};

export type AccessClaims = { sub: string; name: string; m: MembershipClaim[] };

export const ACCESS_COOKIE = "rms_at";
export const ACCESS_TTL_SECONDS = 60 * 60 * 12; // one service day

const secret = () => {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) throw new Error("JWT_SECRET must be set (>= 32 chars)");
  return new TextEncoder().encode(s);
};

export async function signAccessToken(claims: AccessClaims) {
  return new SignJWT({ name: claims.name, m: claims.m })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyAccessToken(token: string | undefined): Promise<AccessClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { sub: payload.sub!, name: payload.name as string, m: payload.m as MembershipClaim[] };
  } catch {
    return null;
  }
}

/** Resolve the membership that grants access to /{orgSlug}/{locationSlug}. */
export function membershipFor(claims: AccessClaims, orgSlug: string, locationSlug?: string) {
  const m = claims.m.find((x) => x.s === orgSlug);
  if (!m) return null;
  if (locationSlug && m.l !== "*" && !m.l.includes(locationSlug)) return null;
  return m;
}
