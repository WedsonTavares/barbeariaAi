"use server";
import { revalidatePath } from "next/cache";

import { requireSuperAdmin, services, type ProspectStage } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";

const BASE = "/super-admin/carteira";

async function guarda() {
  requireSuperAdmin(await getAuthContext());
}

export type Resultado = { ok: true; aviso?: string } | { ok: false; erro: string };

/**
 * Lê o CSV exportado pela tela de Prospecção.
 *
 * O parse é feito AQUI, no servidor, e não no navegador: assim a regra de qual
 * coluna é qual vive num lugar só, junto do service que grava.
 *
 * ⚠️ O `place_id` é obrigatório — é ele que deduplica. Um CSV editado à mão que
 * perca essa coluna reimportaria tudo como novo e apagaria seu histórico de
 * abordagem. Por isso a importação recusa em vez de "dar um jeito".
 */
export async function importarCsvAction(csv: string): Promise<Resultado> {
  try {
    await guarda();

    const linhas = parseCsv(csv);
    if (!linhas.length) return { ok: false, erro: "O arquivo está vazio." };

    const cab = linhas[0]!.map((c) => c.trim().toLowerCase());
    const col = (nome: string) => cab.indexOf(nome);
    const iPlace = col("place_id");
    if (iPlace === -1) {
      return {
        ok: false,
        erro:
          "Falta a coluna place_id. Exporte o CSV de novo pela tela de Prospecção — é ela que identifica cada empresa e evita duplicar.",
      };
    }

    const num = (v: string | undefined) => {
      const n = Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const texto = (v: string | undefined) => (v ?? "").trim() || null;

    const iNome = col("nome");
    const iNicho = col("nicho");
    const iTel = col("telefone");
    const iAval = col("avaliacoes");
    const iNota = col("nota");
    const iSite = col("site");
    const iEnd = col("endereco");
    const iPor = col("por_que");
    const iMaps = col("maps");
    const iScore = col("score");

    const entradas = linhas
      .slice(1)
      .filter((l) => (l[iPlace] ?? "").trim())
      .map((l) => ({
        placeId: l[iPlace]!.trim(),
        nome: texto(l[iNome]) ?? "(sem nome)",
        nicho: texto(l[iNicho]) ?? "Outro",
        telefone: texto(l[iTel]),
        site: texto(l[iSite]),
        maps: texto(l[iMaps]),
        endereco: texto(l[iEnd]),
        nota: num(l[iNota]),
        avaliacoes: num(l[iAval]) ?? 0,
        score: num(l[iScore]) ?? 0,
        motivos: (l[iPor] ?? "").split("·").map((m) => m.trim()).filter(Boolean),
      }));

    if (!entradas.length) return { ok: false, erro: "Nenhuma linha válida encontrada." };

    const r = await services.prospectService.importar(entradas);
    revalidatePath(BASE);
    return {
      ok: true,
      aviso: `${r.total} lidos · ${r.novos} novos · ${r.atualizados} já existiam (dados atualizados, seu histórico preservado)`,
    };
  } catch (e) {
    console.error("[carteira] importação falhou", e);
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao importar" };
  }
}

export async function mudarEstagioAction(id: string, stage: ProspectStage): Promise<Resultado> {
  try {
    await guarda();
    await services.prospectService.setStage(id, stage);
    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    console.error("[carteira] mudar estágio falhou", e);
    return { ok: false, erro: e instanceof Error ? e.message : "Falha" };
  }
}

export async function salvarObservacaoAction(id: string, texto: string): Promise<Resultado> {
  try {
    await guarda();
    await services.prospectService.setObservacao(id, texto);
    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    console.error("[carteira] observação falhou", e);
    return { ok: false, erro: e instanceof Error ? e.message : "Falha" };
  }
}

/**
 * CSV mínimo, mas que respeita aspas — o campo `por_que` tem vírgulas dentro e
 * um split simples cortaria a linha no lugar errado, desalinhando as colunas.
 */
function parseCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;

  const conteudo = texto.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  for (let i = 0; i < conteudo.length; i++) {
    const c = conteudo[i]!;
    if (aspas) {
      if (c === '"') {
        if (conteudo[i + 1] === '"') { campo += '"'; i++; }
        else aspas = false;
      } else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n") { linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.some((c) => c.trim()));
}
