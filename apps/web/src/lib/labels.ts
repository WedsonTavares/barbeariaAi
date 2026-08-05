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

export const label = (map: Record<string, string>, key: string) => map[key] ?? key;
