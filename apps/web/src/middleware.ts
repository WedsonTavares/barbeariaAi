import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/admin(.*)", "/super-admin(.*)"]);

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me";
// Domínio raiz (sem subdomínio) não pertence a nenhum tenant específico —
// decisão do usuário (2026-07-23): manda pro tenant principal (Dine Play).
const PRIMARY_TENANT_SLUG = "dineplay";

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
