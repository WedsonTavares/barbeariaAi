"use server";
import { requireRole, services } from "@diny/core";
import { requireTenant } from "@/lib/tenant";

/**
 * Contagem dos sinais do topo do painel, para o indicador ao vivo.
 *
 * Só leitura e barato de propósito: é chamado em intervalo fixo enquanto o
 * painel estiver aberto. Não marca nada como lido — quem lê é o atendente
 * abrindo a tela.
 */
export async function sinaisAction() {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN", "STAFF"]);
  return services.notificationService.sinais(tenant.id);
}
