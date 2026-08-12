import { Briefcase } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";
import { Carteira } from "./Carteira";
import type { LeadView } from "./tipos";

export const dynamic = "force-dynamic";

export default async function CarteiraPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  const leads = await services.prospectService.listAll();

  // Achatado e serializável: Decimal e Date não atravessam a fronteira
  // servidor → cliente. Os agregados são calculados no cliente de propósito —
  // com algumas centenas de linhas é instantâneo, e os filtros recalculam os
  // gráficos sem ida ao servidor.
  const view: LeadView[] = leads.map((l) => {
    const ultima = l.interacoes[0];
    return {
      id: l.id,
      nome: l.nome,
      nicho: l.nicho,
      telefone: l.telefone,
      site: l.site,
      maps: l.maps,
      endereco: l.endereco,
      nota: l.nota ? Number(l.nota) : null,
      avaliacoes: l.avaliacoes,
      score: l.score,
      motivos: l.motivos,
      stage: l.stage,
      contatadoEm: l.contatadoEm?.toISOString() ?? null,
      observacao: l.observacao,
      proximaAcao: l.proximaAcao,
      proximaAcaoEm: l.proximaAcaoEm?.toISOString() ?? null,
      motivoPerda: l.motivoPerda,
      decisorNome: l.decisorNome,
      decisorCargo: l.decisorCargo,
      decisorTelefone: l.decisorTelefone,
      ultimaInteracao: ultima
        ? {
            resumo: ultima.resumo,
            canal: ultima.canal,
            resultado: ultima.resultado,
            criadoEm: ultima.criadoEm.toISOString(),
          }
        : null,
    };
  });

  return (
    <main className="mx-auto max-w-6xl p-6 sm:p-8">
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Briefcase className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold">Carteira</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Onde você decide quem abordar e acompanha o que já foi feito.
          </p>
        </div>
      </header>

      <Carteira leads={view} />
    </main>
  );
}
