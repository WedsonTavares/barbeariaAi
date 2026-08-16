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

/**
 * Descarta os campos vazios de um update.
 *
 * Existe porque uma reimportação incompleta não pode destruir dado bom: sem
 * isto, um CSV sem a coluna de telefone zera os telefones já coletados, e
 * `avaliacoes: 0` sobrescreve as 783 avaliações de uma barbearia movimentada.
 * Zero e string vazia aqui significam "a busca não trouxe", não "mudou para
 * zero" — nenhum estabelecimento real perde todas as avaliações de uma vez.
 */
function somenteComValor<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => {
      if (v === null || v === undefined || v === "") return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === "number") return v > 0;
      return true;
    })
  ) as Partial<T>;
}

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

  /**
   * Quais destes `placeId` já estão na carteira.
   *
   * Serve ao preview de uma fonte externa: antes de importar, a tela precisa
   * dizer o que é novo e o que já foi trabalhado. Só lê os ids, sem carregar a
   * linha inteira — a resposta é usada para marcar uma etiqueta, não para
   * mostrar dado.
   */
  existentes: async (placeIds: string[]): Promise<Set<string>> => {
    if (!placeIds.length) return new Set();
    const achados = await prisma.prospectLead.findMany({
      where: { placeId: { in: placeIds } },
      select: { placeId: true },
    });
    return new Set(achados.map((a) => a.placeId));
  },

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
        //
        // E o update só leva o que veio PREENCHIDO: uma varredura interrompida
        // antes da fase de telefone traz o lead sem número, e mandar esse vazio
        // apagaria o telefone que já estava lá. Reimportar atualiza; nunca
        // destrói. Na criação vai tudo, inclusive os vazios.
        update: somenteComValor(publico),
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
        select: {
          contatadoEm: true,
          stage: true,
          proximaAcao: true,
          proximaAcaoEm: true,
        },
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
          proximaAcao: encerrou
            ? null
            : input.proximaAcao === undefined
              ? atual.proximaAcao
              : (input.proximaAcao?.trim() || null),
          proximaAcaoEm: encerrou
            ? null
            : input.proximaAcaoEm === undefined
              ? atual.proximaAcaoEm
              : input.proximaAcaoEm,
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
   * Cada mensagem recebida vira uma linha no histórico para o super admin poder
   * ler a resposta sem sair da carteira. Ela não muda a etapa sozinha: uma
   * saudação automática não é uma resposta comercial, e quem classifica isso é a
   * pessoa que está conduzindo a prospecção.
   */
  registrarRespostaDeWhatsapp: async (
    telefone: string,
    texto: string
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

    const trecho = texto.trim().replace(/\s+/g, " ").slice(0, 2_000);
    if (!trecho) return null;

    await prospectService.registrarInteracao({
      leadId: lead.id,
      canal: "WHATSAPP",
      // Resultado e etapa ficam em branco de propósito: sabemos que uma mensagem
      // chegou, mas só a leitura humana distingue pessoa de resposta automática.
      resumo: `Resposta recebida no WhatsApp: ${trecho}`,
    });

    return { leadId: lead.id, nome: lead.nome, stage: lead.stage };
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
