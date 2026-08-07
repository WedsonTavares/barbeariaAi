/** Labels em pt-BR para os enums do banco (UI nunca mostra o enum cru). */

export const APPOINTMENT_STATUS: Record<string, string> = {
  REQUESTED: "Solicitado",
  CONFIRMED: "Confirmado",
  ARRIVED: "Cliente chegou",
  IN_SERVICE: "Em atendimento",
  COMPLETED: "Concluído",
  NO_SHOW: "Não compareceu",
  CANCELED: "Cancelado",
};

export const PAYMENT_STATUS: Record<string, string> = {
  PENDING: "Pendente",
  PARTIAL: "Parcial",
  PAID: "Pago",
  OVERDUE: "Atrasado",
  REFUNDED: "Reembolsado",
};

export const SERVICE_CATEGORY: Record<string, string> = {
  HAIR: "Cabelo",
  BEARD: "Barba",
  NAILS: "Unhas",
  BROWS: "Sobrancelha",
  AESTHETICS: "Estética",
  TATTOO: "Tatuagem",
  MASSAGE: "Massagem",
  OUTRO: "Outro",
  OTHER: "Outro",
};

export const SERVICE_STATUS: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  ARCHIVED: "Arquivado",
};

export const EXPENSE_CATEGORY: Record<string, string> = {
  COMMISSION: "Comissão",
  PRODUCTS: "Produtos",
  RENT: "Aluguel",
  UTILITIES: "Contas",
  MARKETING: "Marketing",
  SALARY: "Salário",
  OTHER: "Outro",
};

/**
 * Motivos de recusa ao salvar um agendamento. Separados porque exigem ações
 * diferentes de quem está na tela: conflito é escolher outro horário, validação
 * é conferir os campos.
 */
export const ERRO_AGENDAMENTO: Record<string, string> = {
  conflito: "Esse horário já está ocupado. Escolha outro horário ou outro profissional.",
  estado: "Não é possível fazer essa mudança neste agendamento.",
  validacao: "Não salvou. Confira cliente, horário e serviços.",
};

export const label = (map: Record<string, string>, key: string) => map[key] ?? key;
