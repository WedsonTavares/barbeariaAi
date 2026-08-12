import type {
  ProspectCanal,
  ProspectMotivoPerda,
  ProspectResultado,
  ProspectStage,
} from "@prisma/client";

import { prisma } from "../db/prisma";
import { brPhoneMatchKey } from "../phone";

/**
 * Carteira de prospecção da plataforma.
 *
 * Tudo aqui escreve só em `ProspectLead` e `ProspectInteraction`, que são
 * tabelas de PLATAFORMA — sem tenantId e fora do `withTenant`. São as empresas
 * que NÓS queremos vender, não clientes de nenhuma loja. Quem protege é o
 * `requireSuperAdmin` no app; nenhum dono de loja alcança estas rotas.
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

export type ResultadoImportacao = { novos: number; atualizados: number; total: number };

/** Estágios que encerram o lead — não têm próxima ação nem entram em atrasados. */
const ENCERRADOS: ProspectStage[] = ["GANHO", "PERDIDO"];

export const prospectService = {
  /**
   * Lista com a ÚLTIMA interação de cada lead.
   *
   * O `take: 1` no include existe para a lista poder mostrar "o que aconteceu
   * por último" sem carregar o histórico inteiro de todo mundo — com algumas
   * centenas de leads isso seria milhares de linhas para exibir uma frase.
   */
  listAll: () =>
    prisma.prospectLead.findMany({
      orderBy: [{ stage: "asc" }, { score: "desc" }, { nome: "asc" }],
      include: { interacoes: { orderBy: { criadoEm: "desc" }, take: 1 } },
    }),

  /** Histórico completo — só quando o painel do lead é aberto. */
  historico: (leadId: string) =>
    prisma.prospectInteraction.findMany({
      where: { leadId },
      orderBy: { criadoEm: "desc" },
    }),

  /**
   * Importa a planilha do buscador.
   *
   * Deduplica por `placeId`: reimportar a mesma região ATUALIZA os dados
   * públicos (nota, avaliações, site — que mudam com o tempo) e preserva o que
   * é seu (estágio, histórico, próxima ação, observação). Sem isso, refazer uma
   * busca apagaria seu trabalho de abordagem, que é o dado mais caro aqui.
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
        // `stage`, `contatadoEm`, `observacao`, `proximaAcao*` e `motivoPerda`
        // ficam FORA do update de propósito — são seus, não do Google.
        update: publico,
        create: { placeId: e.placeId, ...publico },
      });
      if (existentes.has(e.placeId)) atualizados++;
      else novos++;
    }

    return { novos, atualizados, total: entradas.length };
  },

  /**
   * Registra um toque no lead: o que aconteceu, por onde, e para onde ele foi.
   *
   * Interação e mudança de estágio ficam na MESMA operação de propósito. Separar
   * permitiria mover um lead sem dizer o que aconteceu — e é justamente esse
   * histórico que responde "o que eu já falei com essa pessoa" antes de ligar
   * de novo. Roda em transação para não sobrar registro pela metade.
   */
  registrarInteracao: (input: {
    leadId: string;
    canal: ProspectCanal;
    resultado?: ProspectResultado | null;
    resumo: string;
    paraStage?: ProspectStage | null;
    motivoPerda?: ProspectMotivoPerda | null;
    proximaAcao?: string | null;
    proximaAcaoEm?: Date | null;
  }) =>
    prisma.$transaction(async (tx) => {
      const atual = await tx.prospectLead.findUniqueOrThrow({
        where: { id: input.leadId },
        select: { contatadoEm: true, stage: true },
      });

      const novoStage = input.paraStage ?? atual.stage;
      const encerrou = ENCERRADOS.includes(novoStage);

      await tx.prospectInteraction.create({
        data: {
          leadId: input.leadId,
          canal: input.canal,
          resultado: input.resultado ?? null,
          resumo: input.resumo.trim(),
          paraStage: input.paraStage ?? null,
        },
      });

      return tx.prospectLead.update({
        where: { id: input.leadId },
        data: {
          stage: novoStage,
          // Carimba na PRIMEIRA vez que sai de NOVO: é a data que responde
          // "há quanto tempo esse lead está sendo trabalhado".
          contatadoEm: atual.contatadoEm ?? new Date(),
          // Motivo só faz sentido em PERDIDO; sair de lá limpa o motivo antigo,
          // senão um lead recuperado ficaria marcado como perdido para sempre.
          motivoPerda: novoStage === "PERDIDO" ? (input.motivoPerda ?? "OUTRO") : null,
          // Lead encerrado não tem próxima ação — deixá-la viva faria ele
          // aparecer eternamente na lista de atrasados.
          proximaAcao: encerrou ? null : (input.proximaAcao?.trim() || null),
          proximaAcaoEm: encerrou ? null : (input.proximaAcaoEm ?? null),
        },
      });
    }),

  /** Só a tarefa, sem registrar contato — para reagendar um follow-up. */
  setProximaAcao: (id: string, acao: string | null, quando: Date | null) =>
    prisma.prospectLead.update({
      where: { id },
      data: { proximaAcao: acao?.trim() || null, proximaAcaoEm: quando },
    }),

  setObservacao: (id: string, observacao: string) =>
    prisma.prospectLead.update({
      where: { id },
      data: { observacao: observacao.trim() || null },
    }),

  /**
   * Quem decide na empresa. Campo à parte da observação de propósito: é
   * consultado toda vez antes de ligar, e caçar isso no meio de um texto corrido
   * é exatamente o atrito que faz a pessoa ligar de novo para a recepção.
   */
  setDecisor: (
    id: string,
    decisor: { nome: string; cargo: string; telefone: string }
  ) =>
    prisma.prospectLead.update({
      where: { id },
      data: {
        decisorNome: decisor.nome.trim() || null,
        decisorCargo: decisor.cargo.trim() || null,
        decisorTelefone: decisor.telefone.trim() || null,
      },
    }),

  /**
   * Um lead da carteira respondeu no WhatsApp — espelha isso na prospecção.
   *
   * Chamado pelo inbox do tenant da PLATAFORMA (o seu), nunca pelo de um
   * cliente: quem decide isso é o call site, e sem ele nada aqui roda.
   *
   * Três recusas deliberadas, todas devolvendo `null` sem escrever nada:
   *  - telefone que não é brasileiro reconhecível;
   *  - nenhum lead com aquele número;
   *  - MAIS DE UM lead com o mesmo número — aí não dá para saber qual respondeu,
   *    e registrar no errado é pior do que não registrar.
   *
   * A janela de silêncio existe porque o histórico do lead é resumo comercial,
   * não log de conversa: dez mensagens seguidas viram um registro só. Mas quando
   * a resposta MUDA a etapa, grava sempre — mover sem deixar rastro quebraria a
   * conversão por etapa.
   */
  registrarRespostaDeWhatsapp: async (
    telefone: string,
    texto: string,
    janelaHoras = 6
  ): Promise<{ leadId: string; nome: string; stage: ProspectStage } | null> => {
    const chave = brPhoneMatchKey(telefone);
    if (!chave) return null;

    // A chave não existe como coluna, então o casamento é em memória. São
    // centenas de linhas de duas colunas — buscar por LIKE no banco daria o
    // mesmo trabalho e erraria nos formatos com máscara.
    const candidatos = (
      await prisma.prospectLead.findMany({
        where: { telefone: { not: null } },
        select: { id: true, nome: true, telefone: true, stage: true },
      })
    ).filter((l) => brPhoneMatchKey(l.telefone!) === chave);

    if (candidatos.length !== 1) return null;
    const lead = candidatos[0]!;
    if (ENCERRADOS.includes(lead.stage)) return null;

    // Responder só faz o lead avançar até RESPONDEU. Quem já está em Demo ou
    // Proposta não regride por ter mandado uma mensagem.
    const avanca = lead.stage === "NOVO" || lead.stage === "CONTATADO";

    if (!avanca) {
      const ultima = await prisma.prospectInteraction.findFirst({
        where: { leadId: lead.id },
        orderBy: { criadoEm: "desc" },
        select: { criadoEm: true },
      });
      const recente =
        ultima && Date.now() - ultima.criadoEm.getTime() < janelaHoras * 3_600_000;
      if (recente) return null;
    }

    const trecho = texto.trim().replace(/\s+/g, " ").slice(0, 140);
    await prospectService.registrarInteracao({
      leadId: lead.id,
      canal: "WHATSAPP",
      // Resultado fica em branco de propósito: sabemos que respondeu, não com
      // quem falamos. Preencher um valor aqui falsearia o relatório de canal.
      resumo: `Respondeu no WhatsApp: ${trecho}`,
      paraStage: avanca ? "RESPONDEU" : null,
    });

    return { leadId: lead.id, nome: lead.nome, stage: avanca ? "RESPONDEU" : lead.stage };
  },

  /**
   * Movimento rápido no kanban, sem abrir o painel.
   *
   * Registra a interação assim mesmo, com resumo automático — um lead que muda
   * de etapa sem deixar rastro quebra o histórico e a conversão por etapa.
   */
  moverStage: (id: string, stage: ProspectStage) =>
    prospectService.registrarInteracao({
      leadId: id,
      canal: "OUTRO",
      resumo: `Movido para ${stage.charAt(0) + stage.slice(1).toLowerCase()} no quadro`,
      paraStage: stage,
    }),
};
