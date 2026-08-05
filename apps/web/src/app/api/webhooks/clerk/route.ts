import { Webhook } from "svix";
import { headers } from "next/headers";
import { services } from "@barbearia-ai/core";

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) return new Response("missing secret", { status: 500 });

  const h = await headers();
  const payload = await req.text();
  const wh = new Webhook(secret);
  let evt: { type: string; data: { id: string; slug?: string; name: string } };
  try {
    evt = wh.verify(payload, {
      "svix-id": h.get("svix-id")!,
      "svix-timestamp": h.get("svix-timestamp")!,
      "svix-signature": h.get("svix-signature")!,
    }) as typeof evt;
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (evt.type === "organization.created" || evt.type === "organization.updated") {
    const { id, slug, name } = evt.data;
    await services.tenantService.createFromClerkOrg(id, slug || slugify(name), name);
  }
  if (evt.type === "organization.deleted") {
    // Soft delete: desativa o tenant (site e admin somem), dados ficam para auditoria.
    await services.tenantService.deactivateByClerkOrg(evt.data.id);
  }
  return new Response("ok");
}
