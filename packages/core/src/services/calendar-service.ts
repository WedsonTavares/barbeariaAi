import crypto from "node:crypto";

import { prisma } from "../db/prisma";
import { withTenant } from "../db/withTenant";

const GOOGLE_PROVIDER = "GOOGLE" as const;

function encryptionKey() {
  const secret = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
  if (!secret) throw new Error("CALENDAR_TOKEN_ENCRYPTION_KEY ausente");
  const raw = Buffer.from(secret, "base64");
  if (raw.length === 32) return raw;
  return crypto.createHash("sha256").update(secret).digest();
}

function encrypt(value: string | null | undefined) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

function decrypt(value: string | null | undefined) {
  if (!value) return null;
  const [ivRaw, tagRaw, encryptedRaw] = value.split(".");
  if (!ivRaw || !tagRaw || !encryptedRaw) return null;
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) return null;
  return (await res.json()) as { access_token?: string; expires_in?: number; scope?: string };
}

type StoredConnection = {
  id: string;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  expiresAt: Date | null;
  calendarId: string | null;
};

/** Campos mínimos para falar com o Google em nome de uma conexão. */
const CONNECTION_SELECT = {
  id: true,
  accessTokenEncrypted: true,
  refreshTokenEncrypted: true,
  expiresAt: true,
  calendarId: true,
} as const;

async function accessTokenFor(tenantId: string, connection: StoredConnection) {
  const current = decrypt(connection.accessTokenEncrypted);
  const freshEnough = connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000;
  if (current && freshEnough) return current;

  const refreshToken = decrypt(connection.refreshTokenEncrypted);
  if (!refreshToken) return current;
  const refreshed = await refreshAccessToken(refreshToken);
  if (!refreshed?.access_token) return current;

  await withTenant(tenantId, (tx) =>
    tx.calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenEncrypted: encrypt(refreshed.access_token),
        expiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
        scope: refreshed.scope ?? undefined,
      },
    })
  );
  return refreshed.access_token;
}

type GoogleEventResponse = {
  id?: string;
  htmlLink?: string;
};

type GoogleChangedEvent = {
  id?: string;
  status?: string;
  htmlLink?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  extendedProperties?: { private?: { appointmentId?: string; tenantId?: string } };
};

type GoogleEventsResponse = {
  items?: GoogleChangedEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type GoogleWatchResponse = {
  id?: string;
  resourceId?: string;
  expiration?: string;
};

function channelToken(tenantId: string, channelId: string) {
  return Buffer.from(JSON.stringify({ tenantId, channelId })).toString("base64url");
}

async function startGoogleWatch(accessToken: string, calendarId: string, tenantId: string) {
  const webhookUrl = process.env.GOOGLE_CALENDAR_WEBHOOK_URL;
  if (!webhookUrl) return null;

  const channelId = crypto.randomUUID();
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl,
        token: channelToken(tenantId, channelId),
      }),
    }
  );
  if (!res.ok) return null;

  const watch = (await res.json()) as GoogleWatchResponse;
  return {
    channelId: watch.id ?? channelId,
    resourceId: watch.resourceId ?? null,
    expiresAt: watch.expiration ? new Date(Number(watch.expiration)) : new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
  };
}

async function stopGoogleWatch(accessToken: string, channelId: string, resourceId: string | null) {
  if (!resourceId) return;
  await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}

async function googleEventChanges(accessToken: string, calendarId: string, syncToken: string | null) {
  const items: GoogleChangedEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;
  for (let page = 0; page < 50; page++) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("maxResults", "2500");
    url.searchParams.set("showDeleted", "true");
    url.searchParams.set("singleEvents", "true");
    if (syncToken) url.searchParams.set("syncToken", syncToken);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    if (res.status === 410) return { expired: true as const, failed: false as const, items: [], nextSyncToken: null };
    if (!res.ok) return { expired: false as const, failed: true as const, items: [], nextSyncToken: null };
    const data = (await res.json()) as GoogleEventsResponse;
    items.push(...(data.items ?? []));
    if (!data.nextPageToken) {
      nextSyncToken = data.nextSyncToken ?? null;
      break;
    }
    pageToken = data.nextPageToken;
  }
  return { expired: false as const, failed: false as const, items, nextSyncToken };
}

export const calendarService = {
  googleConfigStatus: () => ({
    clientId: Boolean(process.env.GOOGLE_CLIENT_ID),
    clientSecret: Boolean(process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: Boolean(process.env.GOOGLE_CALENDAR_REDIRECT_URI),
    tokenKey: Boolean(process.env.CALENDAR_TOKEN_ENCRYPTION_KEY),
    webhookUrl: Boolean(process.env.GOOGLE_CALENDAR_WEBHOOK_URL),
  }),

  listGoogleConnections: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.calendarConnection.findMany({
        where: { provider: GOOGLE_PROVIDER },
        include: { professional: true, subscriptions: { where: { active: true }, orderBy: { expiresAt: "desc" }, take: 1 } },
        orderBy: { updatedAt: "desc" },
      })
    ),

  disconnect: async (tenantId: string, id: string) => {
    const connection = await withTenant(tenantId, (tx) =>
      tx.calendarConnection.findFirst({
        where: { id },
        select: {
          ...CONNECTION_SELECT,
          subscriptions: { where: { active: true }, select: { channelId: true, resourceId: true } },
        },
      })
    );
    if (!connection) return null;

    // Avisa o Google ANTES de esquecer a conexão: sem o channels/stop ele segue
    // empurrando push notification pro nosso webhook até o canal expirar
    // sozinho (dias), com um token que já não conseguimos usar.
    try {
      const token = await accessTokenFor(tenantId, connection);
      if (token) {
        for (const subscription of connection.subscriptions) {
          await stopGoogleWatch(token, subscription.channelId, subscription.resourceId);
        }
      }
    } catch (error) {
      console.error("[google-calendar] não foi possível encerrar o canal no Google", error);
    }

    return withTenant(tenantId, async (tx) => {
      await tx.calendarSubscription.updateMany({ where: { connectionId: id }, data: { active: false } });
      return tx.calendarConnection.update({ where: { id }, data: { status: "REVOKED" } });
    });
  },

  saveGoogleTokens: (
    tenantId: string,
    data: {
      accessToken: string;
      refreshToken?: string | null;
      expiresIn?: number | null;
      scope?: string | null;
      googleAccountEmail?: string | null;
      calendarId?: string | null;
      /** Agenda de um profissional específico; `null` = agenda da casa. */
      professionalId?: string | null;
    }
  ) =>
    withTenant(tenantId, (tx) =>
      tx.calendarConnection.create({
        data: {
          tenantId,
          provider: GOOGLE_PROVIDER,
          professionalId: data.professionalId ?? null,
          googleAccountEmail: data.googleAccountEmail ?? null,
          calendarId: data.calendarId ?? "primary",
          accessTokenEncrypted: encrypt(data.accessToken),
          refreshTokenEncrypted: encrypt(data.refreshToken),
          scope: data.scope ?? null,
          status: "ACTIVE",
          expiresAt: data.expiresIn ? new Date(Date.now() + data.expiresIn * 1000) : null,
        },
      })
    ),

  recordSubscription: (
    tenantId: string,
    data: { connectionId: string; channelId: string; resourceId?: string | null; expiresAt: Date; syncToken?: string | null }
  ) =>
    withTenant(tenantId, (tx) =>
      tx.calendarSubscription.create({
        data: {
          tenantId,
          connectionId: data.connectionId,
          channelId: data.channelId,
          resourceId: data.resourceId ?? null,
          expiresAt: data.expiresAt,
          syncToken: data.syncToken ?? null,
        },
      })
    ),

  startGoogleSubscription: async (
    tenantId: string,
    data: { connectionId: string; accessToken: string; calendarId?: string | null; syncToken?: string | null }
  ) => {
    const watch = await startGoogleWatch(data.accessToken, data.calendarId || "primary", tenantId);
    if (!watch) return { subscribed: false as const, reason: "google_watch_failed" as const };
    const subscription = await calendarService.recordSubscription(tenantId, {
      connectionId: data.connectionId,
      channelId: watch.channelId,
      resourceId: watch.resourceId,
      expiresAt: watch.expiresAt,
      syncToken: data.syncToken,
    });
    return { subscribed: true as const, subscription };
  },

  renewExpiringGoogleSubscriptions: async (withinMs = 12 * 60 * 60 * 1000) => {
    if (!process.env.GOOGLE_CALENDAR_WEBHOOK_URL) {
      return { renewed: 0, failed: 0, skipped: "missing_webhook" as const };
    }

    const cutoff = new Date(Date.now() + withinMs);
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    let renewed = 0;
    let failed = 0;

    for (const { id: tenantId } of tenants) {
      const subscriptions = await withTenant(tenantId, (tx) =>
        tx.calendarSubscription.findMany({
          where: {
            active: true,
            expiresAt: { lte: cutoff },
            connection: { is: { provider: GOOGLE_PROVIDER, status: "ACTIVE" } },
          },
          include: {
            connection: {
              select: {
                id: true,
                accessTokenEncrypted: true,
                refreshTokenEncrypted: true,
                expiresAt: true,
                calendarId: true,
              },
            },
          },
          orderBy: { expiresAt: "asc" },
          take: 25,
        })
      );

      for (const subscription of subscriptions) {
        try {
          const token = await accessTokenFor(tenantId, subscription.connection);
          if (!token) {
            failed++;
            continue;
          }

          const watch = await startGoogleWatch(token, subscription.connection.calendarId || "primary", tenantId);
          if (!watch) {
            failed++;
            continue;
          }

          await withTenant(tenantId, async (tx) => {
            await tx.calendarSubscription.update({
              where: { id: subscription.id },
              data: { active: false },
            });
            await tx.calendarSubscription.create({
              data: {
                tenantId,
                connectionId: subscription.connection.id,
                channelId: watch.channelId,
                resourceId: watch.resourceId,
                expiresAt: watch.expiresAt,
                syncToken: subscription.syncToken,
              },
            });
          });

          await stopGoogleWatch(token, subscription.channelId, subscription.resourceId);
          renewed++;
        } catch {
          failed++;
        }
      }
    }

    return { renewed, failed, skipped: null };
  },

  syncAppointment: async (tenantId: string, appointmentId: string) => {
    const data = await withTenant(tenantId, async (tx) => {
      const appointment = await tx.appointment.findFirst({
        where: { id: appointmentId },
        include: {
          customer: true,
          professional: true,
          services: true,
        },
      });
      if (!appointment) return null;

      /**
       * Agenda do profissional que vai atender, quando ele tem uma conectada;
       * senão a agenda da casa. Antes era sempre a conexão mais recente do
       * tenant — com três barbeiros, tudo caía num calendário só.
       */
      const pick = (where: { professionalId?: string | null }) =>
        tx.calendarConnection.findFirst({
          where: { provider: GOOGLE_PROVIDER, status: "ACTIVE", ...where },
          orderBy: { updatedAt: "desc" },
          select: CONNECTION_SELECT,
        });
      const connection =
        (appointment.professionalId ? await pick({ professionalId: appointment.professionalId }) : null) ??
        (await pick({ professionalId: null })) ??
        // Instalação que conectou uma agenda só, antes de existir vínculo por
        // profissional: continua valendo em vez de virar "não configurado".
        (await pick({}));
      return connection ? { appointment, connection } : null;
    });
    if (!data) return { synced: false as const, reason: "not_configured" as const };

    const token = await accessTokenFor(tenantId, data.connection);
    if (!token) return { synced: false as const, reason: "no_token" as const };

    const calendarId = encodeURIComponent(data.connection.calendarId || "primary");
    const eventId = data.appointment.googleCalendarEventId;
    if (data.appointment.status === "CANCELED") {
      if (eventId) {
        await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, {
          method: "DELETE",
          headers: { authorization: `Bearer ${token}` },
        });
      }
      return { synced: true as const, action: "deleted" as const };
    }

    const summary = `${data.appointment.services.map((item) => item.serviceNameSnapshot).join(", ") || "Atendimento"} - ${data.appointment.customer.name}`;
    const body = {
      summary,
      description: [
        `Cliente: ${data.appointment.customer.name}`,
        `Telefone: ${data.appointment.customer.phone}`,
        data.appointment.professional?.name ? `Profissional: ${data.appointment.professional.name}` : null,
        data.appointment.notes,
      ].filter(Boolean).join("\n"),
      start: { dateTime: data.appointment.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: data.appointment.endAt.toISOString(), timeZone: "America/Sao_Paulo" },
      extendedProperties: { private: { appointmentId: data.appointment.id, tenantId } },
    };
    const url = eventId
      ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`
      : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`;
    const res = await fetch(url, {
      method: eventId ? "PATCH" : "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      await withTenant(tenantId, (tx) => tx.calendarConnection.update({ where: { id: data.connection.id }, data: { status: "ERROR" } }));
      return { synced: false as const, reason: "google_error" as const };
    }
    const event = (await res.json()) as GoogleEventResponse;
    if (event.id) {
      await withTenant(tenantId, (tx) =>
        tx.appointment.update({
          where: { id: appointmentId },
          data: {
            googleCalendarEventId: event.id,
            googleCalendarHtmlLink: event.htmlLink ?? null,
          },
        })
      );
    }
    return { synced: true as const, action: eventId ? "updated" as const : "created" as const };
  },

  processGooglePush: async (tenantId: string, channelId: string, resourceId?: string | null) => {
    const subscription = await withTenant(tenantId, (tx) =>
      tx.calendarSubscription.findFirst({
        where: { channelId, active: true, ...(resourceId ? { resourceId } : {}) },
        include: {
          connection: {
            select: {
              id: true,
              accessTokenEncrypted: true,
              refreshTokenEncrypted: true,
              expiresAt: true,
              calendarId: true,
            },
          },
        },
      })
    );
    if (!subscription) return { synced: false as const, reason: "subscription_not_found" as const };

    const token = await accessTokenFor(tenantId, subscription.connection);
    if (!token) return { synced: false as const, reason: "no_token" as const };

    const calendarId = subscription.connection.calendarId || "primary";
    const changes = await googleEventChanges(token, calendarId, subscription.syncToken);
    if (changes.failed) return { synced: false as const, reason: "google_error" as const };
    if (changes.expired) {
      await withTenant(tenantId, (tx) =>
        tx.calendarSubscription.update({
          where: { id: subscription.id },
          data: { syncToken: null },
        })
      );
      return { synced: false as const, reason: "sync_token_expired" as const };
    }

    let touched = 0;
    await withTenant(tenantId, async (tx) => {
      for (const event of changes.items) {
        const appointmentId = event.extendedProperties?.private?.appointmentId;
        if (!appointmentId) continue;
        if (event.extendedProperties?.private?.tenantId && event.extendedProperties.private.tenantId !== tenantId) continue;

        const update =
          event.status === "cancelled"
            ? { status: "CANCELED" as const }
            : event.start?.dateTime && event.end?.dateTime
              ? {
                  startAt: new Date(event.start.dateTime),
                  endAt: new Date(event.end.dateTime),
                  googleCalendarEventId: event.id ?? undefined,
                  googleCalendarHtmlLink: event.htmlLink ?? undefined,
                }
              : null;
        if (!update) continue;
        await tx.appointment.updateMany({ where: { id: appointmentId, tenantId }, data: update });
        touched++;
      }
      if (changes.nextSyncToken) {
        await tx.calendarSubscription.update({
          where: { id: subscription.id },
          data: { syncToken: changes.nextSyncToken },
        });
      }
    });

    return { synced: true as const, touched };
  },
};
