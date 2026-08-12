/** Somente os dígitos, para persistência e chamadas ao WhatsApp. */
export function phoneDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

/**
 * Identidade brasileira de um telefone. O Evolution envia 55+DDD+número, mas
 * cadastros antigos podem conter apenas DDD+número; ambos precisam ser a mesma pessoa.
 */
export function customerPhoneKey(phone: string) {
  const digits = phoneDigits(phone);
  return /^55\d{10,11}$/.test(digits) ? digits.slice(2) : digits;
}

/** Formatos persistidos que podem representar a mesma pessoa sem normalização no SQL. */
export function customerPhoneVariants(phone: string) {
  const digits = phoneDigits(phone);
  const key = customerPhoneKey(digits);
  return [...new Set([digits, key, /^\d{10,11}$/.test(key) ? `55${key}` : ""])].filter(Boolean);
}

/**
 * Chave tolerante para casar um telefone de CADASTRO com um do WhatsApp.
 *
 * `customerPhoneKey` já resolve o 55, mas não o nono dígito: o mesmo celular
 * aparece como `16992078710` numa fonte e `1692078710` na outra, e comparar
 * direto não casaria. Aqui a chave é DDD + os 8 últimos dígitos, que é a parte
 * estável do número no Brasil.
 *
 * Devolve `null` para o que não é telefone brasileiro reconhecível — melhor não
 * casar do que casar errado. Quem usa isto deve tratar empate: dois cadastros
 * com a mesma chave significam "não sei qual", não "escolha um".
 */
export function brPhoneMatchKey(phone: string): string | null {
  const key = customerPhoneKey(phone);
  // Só o tamanho não basta: um número americano com DDI (+1 415 555 2671) também
  // tem 11 dígitos e viraria chave de um DDD brasileiro. Estes dois formatos são
  // o padrão nacional — DDD nunca começa nem termina em 0, celular de 11 dígitos
  // sempre tem 9 na frente, e assinante nunca começa em 0 ou 1.
  const celular = /^[1-9][1-9]9\d{8}$/; // DDD + 9 + 8 dígitos
  const fixoOuAntigo = /^[1-9][1-9][2-9]\d{7}$/; // DDD + 8 dígitos
  if (!celular.test(key) && !fixoOuAntigo.test(key)) return null;
  return key.slice(0, 2) + key.slice(-8);
}

/** Novos números brasileiros são gravados no mesmo formato recebido do WhatsApp. */
export function toWhatsAppPhone(phone: string) {
  const digits = phoneDigits(phone);
  const key = customerPhoneKey(digits);
  return /^\d{10,11}$/.test(key) ? `55${key}` : digits;
}
