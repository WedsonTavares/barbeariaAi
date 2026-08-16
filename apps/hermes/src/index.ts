import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

import { conferir } from "./assinatura.js";
import { PERFIS, type IdPerfil } from "./perfis.js";
import { responder } from "./agente.js";

/**
 * Hermes — camada de inteligência lateral.
 *
 * Serviço próprio, fora da aplicação e fora do n8n. Só sabe fazer uma coisa:
 * receber pergunta assinada, ler pelas ferramentas permitidas e responder texto.
 *
 * O que ele NÃO tem, de propósito: credencial do Supabase, do Clerk, do
 * Evolution, do n8n; socket do Docker; acesso ao filesystem da aplicação. Se
 * este processo for comprometido, o alcance do atacante é a lista de
 * ferramentas somente-leitura — e nada além.
 *
 * Escuta em 127.0.0.1 por padrão: quem publica para fora é o proxy da VPS, e
 * só o endpoint de pergunta. Nunca a interface administrativa.
 */

const PORTA = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";

/** Segredo entre Next → Hermes. Sem ele o serviço nem sobe: falhar cedo. */
const SEGREDO_ENTRADA = obrigatorio("HERMES_SECRET");
/** Segredo entre Hermes → ferramentas do app. Pode ser o mesmo, melhor que não. */
const SEGREDO_FERRAMENTAS = process.env.HERMES_TOOLS_SECRET?.trim() || SEGREDO_ENTRADA;
const API_BASE = obrigatorio("HERMES_API_BASE");
/** Chave do OpenRouter. Fica só aqui — o Next nunca a vê. */
const CHAVE_MODELO = obrigatorio("OPENROUTER_API_KEY");

function obrigatorio(nome: string): string {
  const v = process.env[nome]?.trim();
  if (!v) {
    console.error(`[hermes] ${nome} não está definido. O serviço não sobe sem ele.`);
    process.exit(1);
  }
  return v;
}

/** Teto simples por janela. Protege o modelo e a conta, não a segurança. */
const JANELA_MS = 60_000;
const TETO = Number(process.env.HERMES_RATE_LIMIT ?? 20);
const batidas: number[] = [];
function passouDoTeto(): boolean {
  const agora = Date.now();
  while (batidas.length && batidas[0]! < agora - JANELA_MS) batidas.shift();
  if (batidas.length >= TETO) return true;
  batidas.push(agora);
  return false;
}

function json(res: import("node:http").ServerResponse, status: number, corpo: unknown) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(texto);
}

const servidor = createServer(async (req, res) => {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();

  if (req.method === "GET" && req.url === "/saude") {
    return json(res, 200, { ok: true, perfis: Object.keys(PERFIS) });
  }

  if (req.method !== "POST" || req.url !== "/perguntar") {
    return json(res, 404, { erro: "rota não encontrada" });
  }

  let corpo = "";
  try {
    for await (const pedaco of req) {
      corpo += pedaco;
      // Pergunta é texto curto. Corpo grande aqui é abuso, não uso.
      if (corpo.length > 32_000) {
        return json(res, 413, { erro: "corpo grande demais" });
      }
    }
  } catch {
    return json(res, 400, { erro: "falha ao ler o corpo" });
  }

  const veredito = conferir(
    SEGREDO_ENTRADA,
    (req.headers["x-hermes-timestamp"] as string) ?? null,
    (req.headers["x-hermes-assinatura"] as string) ?? null,
    corpo
  );
  if (!veredito.ok) {
    // O motivo vai só para o log; a resposta é genérica de propósito.
    console.warn(`[hermes] ${requestId} recusado: ${veredito.motivo}`);
    return json(res, 401, { erro: "não autorizado" });
  }

  if (passouDoTeto()) return json(res, 429, { erro: "muitas perguntas seguidas" });

  let pergunta = "";
  let perfilId: IdPerfil = "comercial";
  try {
    const p = JSON.parse(corpo) as { pergunta?: string; perfil?: IdPerfil };
    pergunta = String(p.pergunta ?? "").trim();
    if (p.perfil && p.perfil in PERFIS) perfilId = p.perfil;
  } catch {
    return json(res, 400, { erro: "json inválido" });
  }

  if (!pergunta) return json(res, 400, { erro: "pergunta vazia" });
  if (pergunta.length > 4000) return json(res, 400, { erro: "pergunta longa demais" });

  const perfil = PERFIS[perfilId];
  if (!perfil.implementado) {
    return json(res, 501, { erro: `O perfil "${perfil.nome}" ainda não foi implementado.` });
  }

  const inicio = Date.now();
  try {
    const r = await responder(pergunta, perfil, {
      apiBase: API_BASE,
      segredoFerramentas: SEGREDO_FERRAMENTAS,
      chaveModelo: CHAVE_MODELO,
      requestId,
    });
    console.info(
      `[hermes] ${requestId} perfil=${perfil.id} ${Date.now() - inicio}ms ferramentas=[${r.ferramentasUsadas.join(",")}]`
    );
    return json(res, 200, r);
  } catch (e) {
    console.error(`[hermes] ${requestId} falhou`, e);
    return json(res, 502, { erro: "não foi possível concluir a análise", requestId });
  }
});

servidor.listen(PORTA, HOST, () => {
  console.info(`[hermes] ouvindo em ${HOST}:${PORTA} · ferramentas via ${API_BASE}`);
});
