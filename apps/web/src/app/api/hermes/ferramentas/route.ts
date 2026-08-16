import { NextResponse } from "next/server";

import { customerPhoneKey, phoneDigits, services } from "@barbearia-ai/core";
import { conferir } from "@/lib/hermes-assinatura";
import { flags } from "@/lib/flags";

export const dynamic = "force-dynamic";

/**
 * As ferramentas que o Hermes pode ler. SOMENTE LEITURA.
 *
 * Esta rota é a única porta do Hermes para os dados, e ela não recebe consulta
 * — recebe o NOME de uma ferramenta desta lista. Quem monta a consulta é o
 * código daqui, com os services que já existem. Não há caminho para o Hermes
 * pedir algo que não esteja escrito abaixo.
 *
 * Nenhuma entrada aqui escreve. Se um dia existir ferramenta de escrita, ela
 * não entra neste arquivo: vira outra rota, com outra allowlist e outro
 * segredo, para que "ler" e "escrever" nunca compartilhem porta.
 *
 * Autenticação é HMAC servidor-a-servidor: o Clerk não participa porque o
 * chamador é uma máquina, não uma sessão de navegador.
 */

type Ferramenta = (args: Record<string, unknown>) => Promise<unknown>;

/** Limite pedido pelo modelo, contido: ele pode pedir 5000 sem querer. */
const limiteDe = (args: Record<string, unknown>, padrao: number, teto = 50) => {
  const n = Number(args.limite);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.trunc(n), teto) : padrao;
};

/** Celular BR: DDD + 9 + 8 dígitos. Fixo não recebe WhatsApp. */
const ehCelular = (telefone: string | null) =>
  telefone ? /^[1-9][1-9]9\d{8}$/.test(customerPhoneKey(phoneDigits(telefone))) : false;

const DIA = 86_400_000;
const diasAte = (d: Date | null) => {
  if (!d) return null;
  const dia = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  return Math.round((dia(d) - dia(new Date())) / DIA);
};
const ENCERRADOS = ["GANHO", "PERDIDO"];

const FERRAMENTAS: Record<string, Ferramenta> = {
  "prospeccao.resumo": async () => {
    const leads = await services.prospectService.listAll();
    const porEtapa: Record<string, number> = {};
    for (const l of leads) porEtapa[l.stage] = (porEtapa[l.stage] ?? 0) + 1;
    const novos = porEtapa.NOVO ?? 0;
    const trabalhados = leads.length - novos;
    const ganhos = porEtapa.GANHO ?? 0;
    return {
      total: leads.length,
      porEtapa,
      nuncaAbordados: novos,
      trabalhados,
      conversaoPercentual: trabalhados ? Math.round((ganhos / trabalhados) * 100) : 0,
      atrasados: leads.filter(
        (l) => !ENCERRADOS.includes(l.stage) && (diasAte(l.proximaAcaoEm) ?? 1) < 0
      ).length,
      comTelefone: leads.filter((l) => l.telefone).length,
    };
  },

  "prospeccao.leads_prioritarios": async (args) => {
    const leads = await services.prospectService.listAll();
    return leads
      .filter((l) => l.stage === "NOVO" && l.telefone)
      .sort((a, b) => b.score - a.score)
      .slice(0, limiteDe(args, 10))
      .map((l) => ({
        nome: l.nome,
        nicho: l.nicho,
        score: l.score,
        avaliacoes: l.avaliacoes,
        nota: l.nota ? Number(l.nota) : null,
        temSite: Boolean(l.site),
        telefone: l.telefone,
        // Sem isto o modelo recomenda abordar por WhatsApp um número fixo, que
        // não recebe mensagem — aconteceu no primeiro teste. Um quarto dos
        // leads é fixo, então o dado muda a recomendação de verdade.
        ehCelular: ehCelular(l.telefone),
        canalPossivel: ehCelular(l.telefone) ? "WhatsApp ou ligação" : "só ligação",
        porQue: l.motivos,
      }));
  },

  "prospeccao.funil": async () => {
    const leads = await services.prospectService.listAll();
    const ordem = ["NOVO", "CONTATADO", "RESPONDEU", "DEMO", "PROPOSTA", "GANHO"];
    // Cumulativo: quem chegou em Demo passou por Contatado.
    const etapas = ordem.map((stage, i) => ({
      etapa: stage,
      quantidade: leads.filter(
        (l) => l.stage !== "PERDIDO" && ordem.indexOf(l.stage) >= i
      ).length,
    }));
    return {
      etapas: etapas.map((e, i) => ({
        ...e,
        taxaDaEtapaAnterior:
          i > 0 && etapas[i - 1]!.quantidade > 0
            ? Math.round((e.quantidade / etapas[i - 1]!.quantidade) * 100)
            : null,
      })),
      perdidos: leads.filter((l) => l.stage === "PERDIDO").length,
    };
  },

  "prospeccao.motivos_de_perda": async () => {
    const leads = await services.prospectService.listAll();
    const por: Record<string, number> = {};
    for (const l of leads) if (l.motivoPerda) por[l.motivoPerda] = (por[l.motivoPerda] ?? 0) + 1;
    return { total: Object.values(por).reduce((a, b) => a + b, 0), porMotivo: por };
  },

  "prospeccao.esquecidos": async (args) => {
    const leads = await services.prospectService.listAll();
    const ativos = leads.filter((l) => !ENCERRADOS.includes(l.stage));
    const semPlano = ativos.filter((l) => l.stage !== "NOVO" && !l.proximaAcaoEm);
    const vencidos = ativos.filter((l) => (diasAte(l.proximaAcaoEm) ?? 1) < 0);
    const enxuto = (l: (typeof leads)[number]) => ({
      nome: l.nome,
      etapa: l.stage,
      diasDesdeOContato: l.contatadoEm
        ? Math.round((Date.now() - l.contatadoEm.getTime()) / DIA)
        : null,
      proximaAcao: l.proximaAcao,
      diasAtraso: diasAte(l.proximaAcaoEm),
    });
    const teto = limiteDe(args, 15);
    return {
      semProximaAcao: { total: semPlano.length, exemplos: semPlano.slice(0, teto).map(enxuto) },
      followUpVencido: { total: vencidos.length, exemplos: vencidos.slice(0, teto).map(enxuto) },
    };
  },

  "lojas.resumo": async () => {
    const lojas = await services.tenantService.listAll();
    const agora = Date.now();
    // Só agregado: para priorizar o dia não é preciso saber QUAL loja é qual, e
    // não expor nome nem contato aqui mantém a superfície do Hermes mínima.
    //
    // Estado do WhatsApp fica de fora de propósito: mora em `TenantSettings`,
    // que é protegida por RLS de tenant e só se lê dentro de `withTenant`.
    // Abrir uma varredura por todas as lojas para preencher um número seria
    // furar o isolamento por conveniência.
    return {
      total: lojas.length,
      ativas: lojas.filter((t) => t.active).length,
      suspensas: lojas.filter((t) => !t.active).length,
      assinaturaVencida: lojas.filter((t) => t.paidUntil && t.paidUntil.getTime() < agora).length,
      semAssinaturaDefinida: lojas.filter((t) => !t.paidUntil).length,
    };
  },
};

export async function POST(req: Request) {
  // Desligado = a porta não existe. Nem o segredo é consultado.
  if (!flags.hermes) return NextResponse.json({ error: "not found" }, { status: 404 });

  const segredo = process.env.HERMES_TOOLS_SECRET?.trim() || process.env.HERMES_SECRET?.trim();
  if (!segredo) {
    console.error("[hermes/ferramentas] HERMES_TOOLS_SECRET ausente — recusando.");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const corpo = await req.text();
  const veredito = conferir(
    segredo,
    req.headers.get("x-hermes-timestamp"),
    req.headers.get("x-hermes-assinatura"),
    corpo
  );
  if (!veredito.ok) {
    console.warn(`[hermes/ferramentas] recusado: ${veredito.motivo}`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let tool = "";
  let args: Record<string, unknown> = {};
  try {
    const p = JSON.parse(corpo) as { tool?: string; args?: Record<string, unknown> };
    tool = String(p.tool ?? "");
    args = p.args ?? {};
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const executar = Object.prototype.hasOwnProperty.call(FERRAMENTAS, tool)
    ? FERRAMENTAS[tool]
    : undefined;
  if (!executar) {
    return NextResponse.json({ error: `ferramenta desconhecida: ${tool}` }, { status: 404 });
  }

  try {
    return NextResponse.json(await executar(args));
  } catch (e) {
    console.error(`[hermes/ferramentas] ${tool} falhou`, e);
    return NextResponse.json({ error: "falha ao ler" }, { status: 500 });
  }
}
