import { NextResponse } from "next/server";

import { requireRole, services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

const SCOPE = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export async function GET(req: Request) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.redirect(new URL("/admin/configuracoes?calendar=missing_env#google-calendar", req.url));
  }

  // A agenda pode ser de um profissional específico (cada barbeiro com o seu
  // Google) ou da casa inteira. Validamos o id aqui: o `state` volta do Google
  // como veio, então nada que não tenha sido conferido agora pode entrar nele.
  const requested = new URL(req.url).searchParams.get("professionalId");
  const professional = requested ? await services.professionalService.get(tenant.id, requested) : null;
  if (requested && !professional) {
    return NextResponse.redirect(new URL("/admin/configuracoes?calendar=invalid#google-calendar", req.url));
  }

  const state = Buffer.from(
    JSON.stringify({ tenantId: tenant.id, professionalId: professional?.id ?? null, at: Date.now() })
  ).toString("base64url");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url);
}
