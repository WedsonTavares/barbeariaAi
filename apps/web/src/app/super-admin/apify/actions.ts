"use server";
import { revalidatePath } from "next/cache";

import { requireSuperAdmin, services } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";
import { flags } from "@/lib/flags";
import { ApifyConfigError, ApifyError, buscarLocais, type BuscaApify } from "@/lib/apify";
import { paraLead, type Lead } from "@/lib/places";

/**
 * Prospecção pela Apify.
 *
 * Duas travas antes de qualquer chamada externa: a flag e o super admin. A flag
 * primeiro de propósito — com a extensão desligada, nem o custo de resolver a
 * sessão é pago, e a rota se comporta como se não existisse.
 */
async function guarda() {
  if (!flags.apify) throw new Error("A prospecção pela Apify está desligada neste ambiente.");
  requireSuperAdmin(await getAuthContext());
}

/** Lead do preview: o mesmo `Lead` da Prospecção + se já está na Carteira. */
export type Achado = Lead & { jaExiste: boolean };

export type ResultadoBusca =
  | { ok: true; leads: Achado[]; novos: number }
  | { ok: false; erro: string };

function falha(e: unknown, contexto: string): { ok: false; erro: string } {
  console.error(`[apify] ${contexto}`, e);
  if (e instanceof ApifyConfigError || e instanceof ApifyError) return { ok: false, erro: e.message };
  return { ok: false, erro: e instanceof Error ? e.message : "Falha inesperada" };
}

/**
 * Busca e devolve PREVIEW — nada é gravado aqui.
 *
 * A separação entre buscar e importar é o ponto central desta tela: você olha,
 * escolhe, e só então grava. Importar tudo automaticamente encheria a Carteira
 * de lead fora do perfil e estragaria os indicadores que você usa para decidir.
 */
export async function buscarAction(busca: BuscaApify): Promise<ResultadoBusca> {
  try {
    await guarda();

    if (!busca.termo?.trim()) return { ok: false, erro: "Diga o que procurar (ex.: barbearia)." };
    if (!busca.local?.trim()) return { ok: false, erro: "Diga onde procurar (ex.: Ribeirão Preto, SP)." };

    const brutos = await buscarLocais(busca);
    if (!brutos.length) return { ok: true, leads: [], novos: 0 };

    // Deduplicação contra a Carteira, por placeId — o mesmo identificador que
    // o importador usa. Só marca; não descarta, porque ver que a empresa já
    // está na carteira (e em que pé) também é informação útil.
    const existentes = await services.prospectService.existentes(brutos.map((b) => b.id));

    const leads: Achado[] = brutos
      .map((b) => ({ ...paraLead(b), jaExiste: existentes.has(b.id) }))
      .sort((a, b) => b.score - a.score);

    return { ok: true, leads, novos: leads.filter((l) => !l.jaExiste).length };
  } catch (e) {
    return falha(e, "busca falhou");
  }
}

export type ResultadoImportacao =
  | { ok: true; aviso: string }
  | { ok: false; erro: string };

/**
 * Importa os selecionados usando o MESMO service da Prospecção.
 *
 * Nada de INSERT direto: `prospectService.importar` já deduplica por placeId,
 * preserva estágio/histórico/anotação e não apaga campo que a busca não trouxe.
 * Repetir essa lógica aqui seria criar um segundo caminho de criação de lead
 * que ia divergir do primeiro na primeira correção.
 */
export async function importarAction(leads: Achado[]): Promise<ResultadoImportacao> {
  try {
    await guarda();
    if (!leads?.length) return { ok: false, erro: "Selecione ao menos uma empresa." };

    const r = await services.prospectService.importar(
      leads.map((l) => ({
        placeId: l.id,
        nome: l.nome,
        nicho: l.nicho,
        telefone: l.telefone,
        site: l.site,
        maps: l.maps,
        endereco: l.endereco,
        nota: l.nota,
        avaliacoes: l.avaliacoes,
        score: l.score,
        motivos: l.motivos,
      }))
    );

    revalidatePath("/super-admin/carteira");
    return {
      ok: true,
      aviso: `${r.novos} ${r.novos === 1 ? "nova empresa" : "novas empresas"} na Carteira · ${r.atualizados} já existiam (dados atualizados, histórico preservado)`,
    };
  } catch (e) {
    return falha(e, "importação falhou");
  }
}
