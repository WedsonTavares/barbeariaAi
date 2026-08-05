import { NextResponse } from "next/server";

import { services } from "@barbearia-ai/core";

type ChannelToken = {
  tenantId?: string;
  channelId?: string;
};

function parseChannelToken(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as ChannelToken;
  } catch {
    return null;
  }
}

/**
 * Endpoint que receberá push notifications do Google Calendar.
 * A notificação não traz o evento; ela serve para disparar sync incremental
 * usando o syncToken salvo na assinatura.
 */
export async function POST(req: Request) {
  const channelId = req.headers.get("x-goog-channel-id");
  const resourceId = req.headers.get("x-goog-resource-id");
  const resourceState = req.headers.get("x-goog-resource-state");
  const channelToken = parseChannelToken(req.headers.get("x-goog-channel-token"));
  if (!channelId || !channelToken?.tenantId) return new NextResponse(null, { status: 400 });
  if (channelToken.channelId && channelToken.channelId !== channelId) return new NextResponse(null, { status: 400 });

  const result = await services.calendarService.processGooglePush(channelToken.tenantId, channelId, resourceId);
  if (!result.synced) {
    console.warn("[google-calendar] push ignored", { channelId, resourceState, reason: result.reason });
  }
  return new NextResponse(null, { status: 204 });
}
