import { NextResponse } from "next/server";

import { requireRole, services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

type UserInfoResponse = {
  email?: string;
};

type EventsListResponse = {
  nextPageToken?: string;
  nextSyncToken?: string;
};

function settingsUrl(code: string) {
  return `/admin/configuracoes?calendar=${code}#google-calendar`;
}

async function initialSyncToken(accessToken: string) {
  let pageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("singleEvents", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (!res.ok) return null;
    const data = (await res.json()) as EventsListResponse;
    if (!data.nextPageToken) return data.nextSyncToken ?? null;
    pageToken = data.nextPageToken;
  }
  return null;
}

export async function GET(req: Request) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  if (!code || !stateRaw) return NextResponse.redirect(new URL(settingsUrl("invalid"), url.origin));

  try {
    const state = JSON.parse(Buffer.from(stateRaw, "base64url").toString("utf8")) as { tenantId?: string };
    if (state.tenantId !== tenant.id) return NextResponse.redirect(new URL(settingsUrl("invalid"), url.origin));

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri || !process.env.CALENDAR_TOKEN_ENCRYPTION_KEY) {
      return NextResponse.redirect(new URL(settingsUrl("missing_env"), url.origin));
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || !tokens.access_token) return NextResponse.redirect(new URL(settingsUrl("failed"), url.origin));

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = userInfoRes.ok ? ((await userInfoRes.json()) as UserInfoResponse) : {};

    const syncToken = await initialSyncToken(tokens.access_token);
    const connection = await services.calendarService.saveGoogleTokens(tenant.id, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      googleAccountEmail: userInfo.email,
      calendarId: "primary",
    });

    await services.calendarService.startGoogleSubscription(tenant.id, {
      connectionId: connection.id,
      accessToken: tokens.access_token,
      calendarId: "primary",
      syncToken,
    });

    return NextResponse.redirect(new URL(settingsUrl("connected"), url.origin));
  } catch (error) {
    console.error("[google-calendar] callback failed", error);
    return NextResponse.redirect(new URL(settingsUrl("failed"), url.origin));
  }
}
