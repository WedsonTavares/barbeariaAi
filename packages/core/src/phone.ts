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

/** Novos números brasileiros são gravados no mesmo formato recebido do WhatsApp. */
export function toWhatsAppPhone(phone: string) {
  const digits = phoneDigits(phone);
  const key = customerPhoneKey(digits);
  return /^\d{10,11}$/.test(key) ? `55${key}` : digits;
}
