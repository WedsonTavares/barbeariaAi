import { NextResponse } from "next/server";
import { resolveTenant } from "@/lib/tenant";
import { services } from "@diny/core";

/**
 * Ferramenta pro agente de IA (n8n): informações da empresa pra tirar dúvidas —
 * horário, endereço/cidade, taxa de entrega, política de sinal, contatos, locação
 * mínima e catálogo resumido. Só leitura. Tenant pelo host. Protegido por AGENT_API_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.AGENT_API_SECRET;
  if (!secret || req.headers.get("x-diny-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const tenant = await resolveTenant();
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

  const [settings, toys] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.toyService.list(tenant.id),
  ]);

  return NextResponse.json({
    empresa: tenant.name,
    cidade: settings?.city ?? null,
    enderecoBase: settings?.baseAddress ?? null,
    raioAtendimentoKm: settings?.serviceRadiusKm ?? null,
    taxaEntrega: settings?.deliveryFee != null ? Number(settings.deliveryFee) : null,
    politicaSinal: settings?.depositPolicy ?? null,
    horarios: settings?.businessHours ?? null,
    whatsapp: settings?.whatsappMain ?? null,
    instagram: settings?.instagram ?? null,
    locacaoMinima: { horas: settings?.minRentalHours ?? 4, valor: Number(settings?.minRentalPrice ?? 150) },
    catalogo: toys
      .filter((t) => t.status !== "RETIRED")
      .map((t) => ({ nome: t.name, categoria: t.category, preco: Number(t.defaultRentPrice), status: t.status })),
  });
}
