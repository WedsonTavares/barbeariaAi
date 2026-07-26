/**
 * Normaliza texto pra comparação tolerante (nome de brinquedo dito pela IA vs.
 * cadastrado no catálogo): remove acento, ignora maiúscula/minúscula e trata
 * hífen/underscore como espaço. Sem isso, "Pula-pula" (cadastro) não bate com
 * "pula pula" (como o cliente/IA escreveu) num `.includes()` cru — foi a causa
 * de a IA dizer "sem disponibilidade" para um brinquedo que na verdade estava livre.
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

/**
 * O nome dito (cliente/IA) identifica o brinquedo cadastrado? Além do que
 * `normalizeMatchTerm` já resolve (acento/maiúscula/hífen), tolera 1 letra
 * faltando ou trocada por palavra e funciona nos dois sentidos de conter.
 *
 * Sem isso, um typo como "pula ula" não batia com "Pula Pula 3m" — a IA dizia
 * "sem disponibilidade" para um brinquedo que, na verdade, nunca chegou a ser
 * consultado: a busca por nome não achava nada, então a lista vinha vazia.
 * Com 1 único item no catálogo hoje, esse falso negativo tira o único produto
 * do ar por causa de uma letra.
 */
export function matchesToyName(catalogName: string, said: string): boolean {
  const catalog = normalizeMatchTerm(catalogName);
  const term = normalizeMatchTerm(said);
  if (!term) return false;
  if (catalog.includes(term) || term.includes(catalog)) return true;

  const catalogWords = catalog.split(" ").filter(Boolean);
  const saidWords = term.split(" ").filter(Boolean);
  if (!saidWords.length) return false;
  return saidWords.every((sw) =>
    catalogWords.some((cw) => cw === sw || (sw.length >= 3 && cw.length >= 3 && levenshtein(cw, sw) <= 1))
  );
}
