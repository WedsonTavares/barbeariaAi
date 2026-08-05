/**
 * Normaliza texto pra comparação tolerante (nome dito pela IA vs. cadastrado no
 * catálogo): remove acento, ignora maiúscula/minúscula e trata
 * hífen/underscore como espaço. Sem isso, "Pula-pula" (cadastro) não bate com
 * "pula pula" (como o cliente/IA escreveu) num `.includes()` cru — foi a causa
 * de a IA dizer "sem disponibilidade" para um item que na verdade estava livre.
 */
export function normalizeMatchTerm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Limpa o nome que vem do WhatsApp (`pushName`) antes de guardar.
 *
 * Esse nome é escolhido pelo PRÓPRIO cliente, então chega de tudo: "." , só
 * emoji, enfeite em volta do nome ("💎✨Bella✨💎"). Guardar cru deixa o inbox
 * e o funil ilegíveis.
 *
 * Tira emoji e símbolos, mantém letras (com acento), números e a pontuação que
 * aparece em nome de gente. Se sobrar menos de 2 letras, devolve `null` — aí a
 * tela cai no telefone, que é mais útil do que um ponto.
 */
export function cleanContactName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const limpo = raw
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{So}\p{Sk}]/gu, " ")
    .replace(/[^\p{L}\p{M}\p{N} '’.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    // pontuação solta nas pontas ("• Ana •" vira "Ana")
    .replace(/^[.'’-]+|[.'’-]+$/g, "")
    .trim();

  const letras = (limpo.match(/\p{L}/gu) ?? []).length;
  if (letras < 2) return null;
  return limpo.slice(0, 80);
}

/** Distância de edição simples, só pra tolerar 1 letra trocada/faltando por palavra. */
function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i]![0] = i;
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1]
        ? dp[i - 1]![j - 1]!
        : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[a.length]![b.length]!;
}

function adjacentTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diff.push(i);
  }
  return diff.length === 2 && diff[1] === diff[0]! + 1 && a[diff[0]!] === b[diff[1]!] && a[diff[1]!] === b[diff[0]!];
}

/**
 * O nome dito (cliente/IA) identifica o item cadastrado? Além do que
 * `normalizeMatchTerm` já resolve (acento/maiúscula/hífen), tolera 1 letra
 * faltando ou trocada por palavra e funciona nos dois sentidos de conter.
 *
 * Sem isso, um typo como "crote" não batia com "Corte" — a IA dizia
 * "sem disponibilidade" para um serviço que, na verdade, nunca chegou a ser
 * consultado: a busca por nome não achava nada, então a lista vinha vazia.
 */
export function matchesCatalogName(catalogName: string, said: string): boolean {
  const catalog = normalizeMatchTerm(catalogName);
  const term = normalizeMatchTerm(said);
  if (!term) return false;
  if (catalog.includes(term) || term.includes(catalog)) return true;

  const catalogWords = catalog.split(" ").filter(Boolean);
  const saidWords = term.split(" ").filter(Boolean);
  if (!saidWords.length) return false;
  return saidWords.every((sw) =>
    catalogWords.some(
      (cw) =>
        cw === sw ||
        (sw.length >= 3 && cw.length >= 3 && (levenshtein(cw, sw) <= 1 || adjacentTransposition(cw, sw)))
    )
  );
}
