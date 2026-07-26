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
