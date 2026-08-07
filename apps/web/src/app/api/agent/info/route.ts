import { NextResponse } from "next/server";
import { authenticateAgent } from "@/lib/agent-auth";
import { services } from "@barbearia-ai/core";

/**
 * Ferramenta pro agente de IA (n8n): informações da empresa pra tirar dúvidas —
 * horário, endereço/cidade, política de cancelamento, contatos e catálogo.
 * Só leitura. Tenant pelo host. Protegido pelo segredo deste tenant.
 */
export async function POST(req: Request) {
  const auth = await authenticateAgent(req);
  if (!auth.ok) return auth.response;
  const tenant = auth.tenant;

  const [settings, catalog, professionals] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.serviceCatalogService.active(tenant.id),
    services.professionalService.active(tenant.id),
  ]);

  return NextResponse.json({
    empresa: tenant.name,
    cidade: settings?.city ?? null,
    enderecoBase: settings?.baseAddress ?? null,
    raioAtendimentoKm: settings?.serviceRadiusKm ?? null,
    politicaCancelamento: settings?.cancellationPolicy ?? null,
    horarios: settings?.businessHours ?? null,
    whatsapp: settings?.whatsappMain ?? null,
    instagram: settings?.instagram ?? null,
    agenda: {
      intervaloPadraoMinutos: settings?.defaultSlotMinutes ?? 30,
      antecedenciaMinimaMinutos: settings?.minAppointmentLeadMinutes ?? 60,
    },
    catalogo: catalog.map((service) => ({
      nome: service.name,
      categoria: service.category,
      duracaoMinutos: service.durationMinutes,
      preco: Number(service.defaultPrice),
      local: service.locationMode,
    })),
    profissionais: professionals.map((professional) => ({
      nome: professional.name,
      telefone: professional.phone,
    })),
  });
}
