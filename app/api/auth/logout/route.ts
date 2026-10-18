import { NextResponse } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth/jwt";

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.delete(ACCESS_COOKIE);
  return res;
}
