"use server";
import { revalidatePath } from "next/cache";

import {
  requireSuperAdmin,
  services,
  type ProspectCanal,
  type ProspectMotivoPerda,
  type ProspectStage,
} from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";

const BASE = "/super-admin/carteira";

async function guarda() {
  requireSuperAdmin(await getAuthContext());
}

export type Resultado = { ok: true; aviso?: string } | { ok: false; erro: string };

function falha(e: unknown, contexto: string): { ok: false; erro: string } {
  console.error(`[carteira] ${contexto}`, e);
  return { ok: false, erro: e instanceof Error ? e.message : "Falha inesperada" };
}

/**
 * Data vinda de <input type="date"> (yyyy-mm-dd).
 *
 * Meio-dia UTC de propósito: `new Date("2026-08-14")` é meia-noite UTC, que em
 * São Paulo cai no dia 13 e mostraria o follow-up um dia antes na tela.
 */
function dataDoInput(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00.000Z`) : null;
}

/**
 * Lê o CSV exportado pela tela de Prospecção.
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

    const num = (v?: string) => {
      const n = Number(String(v ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    };
    const texto = (v?: string) => (v ?? "").trim() || null;

    const idx = {
      nome: col("nome"), nicho: col("nicho"), tel: col("telefone"),
      aval: col("avaliacoes"), nota: col("nota"), site: col("site"),
      end: col("endereco"), por: col("por_que"), maps: col("maps"), score: col("score"),
    };

    const entradas = linhas
      .slice(1)
      .filter((l) => (l[iPlace] ?? "").trim())
      .map((l) => ({
        placeId: l[iPlace]!.trim(),
        nome: texto(l[idx.nome]) ?? "(sem nome)",
        nicho: texto(l[idx.nicho]) ?? "Outro",
        telefone: texto(l[idx.tel]),
        site: texto(l[idx.site]),
        maps: texto(l[idx.maps]),
        endereco: texto(l[idx.end]),
        nota: num(l[idx.nota]),
        avaliacoes: num(l[idx.aval]) ?? 0,
        score: num(l[idx.score]) ?? 0,
        motivos: (l[idx.por] ?? "").split("·").map((m) => m.trim()).filter(Boolean),
      }));

    if (!entradas.length) return { ok: false, erro: "Nenhuma linha válida encontrada." };

    const r = await services.prospectService.importar(entradas);
    revalidatePath(BASE);
    return {
      ok: true,
      aviso: `${r.total} lidos · ${r.novos} novos · ${r.atualizados} já existiam (dados atualizados, seu histórico preservado)`,
    };
  } catch (e) {
    return falha(e, "importação falhou");
  }
}

/** Histórico completo de um lead — carregado só ao abrir o painel dele. */
export async function historicoAction(leadId: string) {
  await guarda();
  const itens = await services.prospectService.historico(leadId);
  return itens.map((i) => ({
    id: i.id,
    canal: i.canal,
    resumo: i.resumo,
    paraStage: i.paraStage,
    criadoEm: i.criadoEm.toISOString(),
  }));
}

/**
 * Registra o contato: o que aconteceu, para onde o lead foi, e o próximo passo.
 * É a ação principal da tela — mover e registrar acontecem juntos.
 */
export async function registrarContatoAction(leadId: string, form: FormData): Promise<Resultado> {
  try {
    await guarda();

    const resumo = String(form.get("resumo") ?? "").trim();
    if (!resumo) return { ok: false, erro: "Escreva o que aconteceu no contato." };

    const paraStage = (String(form.get("paraStage") ?? "") || null) as ProspectStage | null;
    const motivo = (String(form.get("motivoPerda") ?? "") || null) as ProspectMotivoPerda | null;
    if (paraStage === "PERDIDO" && !motivo) {
      return { ok: false, erro: "Escolha o motivo da perda — é o que alimenta o gráfico de perdas." };
    }

    await services.prospectService.registrarInteracao({
      leadId,
      canal: (String(form.get("canal") ?? "LIGACAO") as ProspectCanal) || "LIGACAO",
      resumo,
      paraStage,
      motivoPerda: motivo,
      proximaAcao: String(form.get("proximaAcao") ?? "") || null,
      proximaAcaoEm: dataDoInput(form.get("proximaAcaoEm")),
    });

    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    return falha(e, "registrar contato falhou");
  }
}

/** Move no quadro sem abrir o painel. O service registra a interação sozinho. */
export async function moverStageAction(leadId: string, stage: ProspectStage): Promise<Resultado> {
  try {
    await guarda();
    if (stage === "PERDIDO") {
      return {
        ok: false,
        erro: "Para marcar como perdido, abra o lead e informe o motivo.",
      };
    }
    await services.prospectService.moverStage(leadId, stage);
    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    return falha(e, "mover falhou");
  }
}

/** Reagenda o follow-up sem registrar contato novo. */
export async function reagendarAction(leadId: string, form: FormData): Promise<Resultado> {
  try {
    await guarda();
    await services.prospectService.setProximaAcao(
      leadId,
      String(form.get("proximaAcao") ?? "") || null,
      dataDoInput(form.get("proximaAcaoEm"))
    );
    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    return falha(e, "reagendar falhou");
  }
}

export async function salvarObservacaoAction(leadId: string, texto: string): Promise<Resultado> {
  try {
    await guarda();
    await services.prospectService.setObservacao(leadId, texto);
    revalidatePath(BASE);
    return { ok: true };
  } catch (e) {
    return falha(e, "observação falhou");
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
