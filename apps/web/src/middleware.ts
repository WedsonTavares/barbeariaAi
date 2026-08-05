import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/admin(.*)", "/super-admin(.*)"]);

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
// Domínio raiz (sem subdomínio) redireciona para o tenant principal do ambiente.
const PRIMARY_TENANT_SLUG = process.env.PRIMARY_TENANT_SLUG ?? "barbearia-ai";

export default clerkMiddleware(async (auth, req) => {
  const hostname = (req.headers.get("host") ?? "").split(":")[0];
  if (hostname === ROOT || hostname === `www.${ROOT}`) {
    const url = new URL(req.url);
    url.hostname = `${PRIMARY_TENANT_SLUG}.${ROOT}`;
    return NextResponse.redirect(url);
  }
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)", "/"],
};
