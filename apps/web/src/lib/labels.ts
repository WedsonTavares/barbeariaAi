/** Labels em pt-BR para os enums do banco (UI nunca mostra o enum cru). */

export const BOOKING_STATUS: Record<string, string> = {
  LEAD: "Lead",
  QUOTE_SENT: "Orçamento enviado",
  WAITING_DEPOSIT: "Aguardando sinal",
  CONFIRMED: "Confirmada",
  IN_DELIVERY: "Em entrega",
  MOUNTED: "Montado",
  PICKED_UP: "Retirado",
  FINISHED: "Finalizada",
  CANCELED: "Cancelada",
};

export const PAYMENT_STATUS: Record<string, string> = {
  PENDING: "Pagamento pendente",
  DEPOSIT_PAID: "Sinal pago",
  PAID: "Pago",
  OVERDUE: "Atrasado",
  REFUNDED: "Reembolsado",
};

export const TOY_CATEGORY: Record<string, string> = {
  CAMA_ELASTICA: "Cama elástica",
  PISCINA_BOLINHAS: "Piscina de bolinhas",
  INFLAVEL: "Inflável",
  ESCORREGADOR: "Escorregador",
  MESA_CADEIRA: "Mesa e cadeira",
  OUTRO: "Outro",
};

export const TOY_STATUS: Record<string, string> = {
  AVAILABLE: "Disponível",
  RENTED: "Alugado",
  MAINTENANCE: "Manutenção",
  RETIRED: "Aposentado",
};

export const EXPENSE_CATEGORY: Record<string, string> = {
  FUEL: "Combustível",
  HELPER: "Ajudante",
  MAINTENANCE: "Manutenção",
  CLEANING: "Limpeza",
  OTHER: "Outro",
};

export const label = (map: Record<string, string>, key: string) => map[key] ?? key;
