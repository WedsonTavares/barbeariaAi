import type { ProspectStage } from "@prisma/client";

import { prisma } from "../db/prisma";

/**
 * Carteira de prospecção da plataforma.
 *
 * Tudo aqui escreve só em `ProspectLead`, que é tabela de PLATAFORMA — não tem
 * tenantId e não passa por `withTenant`. São as empresas que NÓS queremos
 * vender, não clientes de nenhuma loja. Quem protege é o `requireSuperAdmin` no
 * app; nenhum dono de loja alcança estas rotas.
 */

export type ProspectEntrada = {
  placeId: string;
  nome: string;
  nicho: string;
  telefone?: string | null;
  site?: string | null;
  maps?: string | null;
  endereco?: string | null;
  nota?: number | null;
  avaliacoes?: number;
  score?: number;
  motivos?: string[];
};

export type ResultadoImportacao = {
  novos: number;
  atualizados: number;
  total: number;
};

export const prospectService = {
  listAll: () =>
    prisma.prospectLead.findMany({
      orderBy: [{ stage: "asc" }, { score: "desc" }, { nome: "asc" }],
    }),

  /**
   * Importa a planilha do buscador.
   *
   * Deduplica por `placeId`: reimportar a mesma região ATUALIZA os dados
   * públicos (nota, avaliações, site — que mudam com o tempo) e preserva o que
   * é seu (estágio, data do contato, observação). Sem isso, refazer uma busca
   * apagaria seu histórico de abordagem, que é o dado mais caro aqui.
   */
  importar: async (entradas: ProspectEntrada[]): Promise<ResultadoImportacao> => {
    const existentes = new Set(
      (
        await prisma.prospectLead.findMany({
          where: { placeId: { in: entradas.map((e) => e.placeId) } },
          select: { placeId: true },
        })
      ).map((p) => p.placeId)
    );

    let novos = 0;
    let atualizados = 0;

    for (const e of entradas) {
      const publico = {
        nome: e.nome,
        nicho: e.nicho,
        telefone: e.telefone ?? null,
        site: e.site ?? null,
        maps: e.maps ?? null,
        endereco: e.endereco ?? null,
        nota: e.nota ?? null,
        avaliacoes: e.avaliacoes ?? 0,
        score: e.score ?? 0,
        motivos: e.motivos ?? [],
      };
      await prisma.prospectLead.upsert({
        where: { placeId: e.placeId },
        // `stage`, `contatadoEm` e `observacao` ficam FORA do update de propósito.
        update: publico,
        create: { placeId: e.placeId, ...publico },
      });
      if (existentes.has(e.placeId)) atualizados++;
      else novos++;
    }

    return { novos, atualizados, total: entradas.length };
  },

  /**
   * Move o lead de estágio. `contatadoEm` é carimbado na PRIMEIRA vez que sai de
   * NOVO — é a data que responde "há quanto tempo não falo com ele".
   */
  setStage: async (id: string, stage: ProspectStage) => {
    const atual = await prisma.prospectLead.findUnique({
      where: { id },
      select: { contatadoEm: true },
    });
    return prisma.prospectLead.update({
      where: { id },
      data: {
        stage,
        contatadoEm:
          atual?.contatadoEm ?? (stage === "NOVO" ? null : new Date()),
      },
    });
  },

  setObservacao: (id: string, observacao: string) =>
    prisma.prospectLead.update({
      where: { id },
      data: { observacao: observacao.trim() || null },
    }),
};
