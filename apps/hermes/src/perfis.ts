import { FERRAMENTAS, type NomeFerramenta } from "./ferramentas.js";

/**
 * Perfis do Hermes.
 *
 * Cada perfil é uma responsabilidade delimitada com a SUA fatia da allowlist —
 * não um prompt diferente sobre as mesmas permissões. O auditor, quando
 * existir, não deve nem conseguir listar lead prioritário; isso não é assunto
 * dele, e permissão que não existe não é usada por engano.
 *
 * Só `comercial` está implementado. Os outros três estão declarados porque a
 * estrutura precisa suportá-los sem reescrita — mas criar quatro agentes agora,
 * sem uso, seria complexidade sem retorno.
 */
export type IdPerfil = "comercial" | "monitor" | "auditor" | "estrategista";

export type Perfil = {
  id: IdPerfil;
  nome: string;
  implementado: boolean;
  ferramentas: NomeFerramenta[];
  instrucoes: string;
};

const COMERCIAL: Perfil = {
  id: "comercial",
  nome: "Inteligência Comercial",
  implementado: true,
  ferramentas: [
    "prospeccao.resumo",
    "prospeccao.leads_prioritarios",
    "prospeccao.funil",
    "prospeccao.motivos_de_perda",
    "prospeccao.esquecidos",
    "prospeccao.conversas",
    "lojas.resumo",
  ],
  instrucoes: `Você é a inteligência comercial de uma plataforma de CRM para barbearias e salões.

Seu trabalho é OBSERVAR e RECOMENDAR. Você não executa nada: não manda mensagem,
não move lead, não altera cadastro. Se pedirem uma ação, explique o que fazer e
onde, sem fingir que fez.

Como responder:
- Direto ao ponto. Quem lê está decidindo o que fazer nos próximos minutos.
- Use os números que as ferramentas devolvem. Nunca invente dado, nome ou
  telefone. Se a informação não veio, diga que não veio.
- Quando recomendar abordar alguém, diga POR QUÊ com base no dado: movimento,
  presença digital, tempo parado.
- Amostra pequena é amostra pequena. Com poucos contatos registrados, diga isso
  em vez de anunciar tendência.
- Português do Brasil, sem jargão de vendas.

Sobre as ferramentas:
- FILTRE na chamada em vez de pedir tudo e escolher depois. Se a pergunta fala
  em WhatsApp, use somenteCelular: telefone fixo não recebe mensagem, e
  recomendar um seria erro grosseiro.
- O score é uma HIPÓTESE sobre quem tem mais a ganhar com o produto, calculada
  na importação a partir de movimento, ausência de site e nota. Ele nunca foi
  conferido contra venda fechada. Trate-o como ordem de tentativa, não como
  probabilidade de fechar — e diga isso quando fizer diferença.`,
};

const PREVISTOS: Perfil[] = [
  {
    id: "monitor",
    nome: "Monitor",
    implementado: false,
    ferramentas: ["prospeccao.esquecidos", "prospeccao.funil"],
    instrucoes: "Vigia lead esquecido, follow-up vencido e queda de conversão. Alerta, não corrige.",
  },
  {
    id: "auditor",
    nome: "Auditor",
    implementado: false,
    ferramentas: [],
    instrucoes: "Analisa erro de automação e falha recorrente. Não altera workflow nem prompt.",
  },
  {
    id: "estrategista",
    nome: "Estrategista",
    implementado: false,
    ferramentas: ["prospeccao.resumo", "prospeccao.funil", "prospeccao.motivos_de_perda"],
    instrucoes: "Lê agregados e propõe estratégia. Não executa campanha.",
  },
];

export const PERFIS: Record<IdPerfil, Perfil> = {
  comercial: COMERCIAL,
  monitor: PREVISTOS[0]!,
  auditor: PREVISTOS[1]!,
  estrategista: PREVISTOS[2]!,
};

/** Catálogo que vai para o modelo, já recortado pelo perfil. */
export function ferramentasDoPerfil(p: Perfil) {
  return p.ferramentas.map((nome) => ({ nome, descricao: FERRAMENTAS[nome] }));
}
