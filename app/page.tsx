import { redirect } from "next/navigation";
import { getClaims } from "@/lib/auth/session";

export default async function Home() {
  const claims = await getClaims();
  redirect(claims?.m[0] ? `/${claims.m[0].s}` : "/login");
}
