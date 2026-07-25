import { z } from "zod";
import { parseLocalDate, parseLocalDateTime } from "../time";

/** Aceita Date pronto ou string sem offset (inputs do navegador), ancorando em SP. */
const spDateTime = z.preprocess(
  (v) => (typeof v === "string" && v ? parseLocalDateTime(v) : v),
  z.date()
);
const spDate = z.preprocess(
  (v) => (typeof v === "string" && v ? parseLocalDate(v) : v),
  z.date()
);

export const toyCategory = z.enum([
  "CAMA_ELASTICA", "PISCINA_BOLINHAS", "INFLAVEL", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO",
]);

export const leadSource = z.enum([
  "INSTAGRAM", "FACEBOOK", "GOOGLE", "INDICATION", "WHATSAPP", "WEBSITE", "PAID_ADS", "PARTNER", "OTHER",
]);

export const toyInput = z.object({
  name: z.string().min(2, "Informe o nome"),
  category: toyCategory,
  description: z.string().optional(),
  purchasePrice: z.coerce.number().nonnegative(),
  defaultRentPrice: z.coerce.number().nonnegative(),
});
export type ToyInput = z.infer<typeof toyInput>;

export const customerInput = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  imageConsent: z.coerce.boolean().optional(),
});
export type CustomerInput = z.infer<typeof customerInput>;

export const bookingInput = z
  .object({
    customerId: z.string().uuid(),
    eventDate: spDate,
    setupTime: spDateTime,
    pickupTime: spDateTime,
    address: z.string().optional(),
    neighborhood: z.string().optional(),
    total: z.coerce.number().nonnegative(),
    depositAmount: z.coerce.number().nonnegative().default(0),
    toyIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um brinquedo"),
    leadSource: leadSource.optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.pickupTime > d.setupTime, {
    message: "A retirada deve ser depois da montagem",
    path: ["pickupTime"],
  });
export type BookingInput = z.infer<typeof bookingInput>;

/** Edição de reserva: mesmos campos do create, sem trocar o cliente. */
export const bookingUpdateInput = z
  .object({
    eventDate: spDate,
    setupTime: spDateTime,
    pickupTime: spDateTime,
    address: z.string().optional(),
    neighborhood: z.string().optional(),
    total: z.coerce.number().nonnegative(),
    depositAmount: z.coerce.number().nonnegative().default(0),
    toyIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um brinquedo"),
    notes: z.string().optional(),
  })
  .refine((d) => d.pickupTime > d.setupTime, {
    message: "A retirada deve ser depois da montagem",
    path: ["pickupTime"],
  });
export type BookingUpdateInput = z.infer<typeof bookingUpdateInput>;

export const leadInput = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  source: leadSource.default("WEBSITE"),
  message: z.string().optional(),
  desiredDate: spDate.optional(),
  neighborhood: z.string().optional(),
  childrenCount: z.coerce.number().int().optional(),
  ageRange: z.string().optional(),
  desiredToy: z.string().optional(),
});
export type LeadInput = z.infer<typeof leadInput>;

export const expenseCategory = z.enum(["FUEL", "HELPER", "MAINTENANCE", "CLEANING", "OTHER"]);
export const toyStatus = z.enum(["AVAILABLE", "RENTED", "MAINTENANCE", "RETIRED"]);

export const paymentInput = z.object({
  bookingId: z.string().uuid(),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  method: z.string().max(40).optional(),
});
export type PaymentInput = z.infer<typeof paymentInput>;

export const expenseInput = z.object({
  bookingId: z.string().uuid().optional(),
  category: expenseCategory,
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  description: z.string().max(300).optional(),
  date: spDate.optional(),
});
export type ExpenseInput = z.infer<typeof expenseInput>;

/** Para ids vindos de formulários (hidden inputs). */
export const idInput = z.string().uuid();

// ===== Ferramentas HTTP do agente de IA (o agente vive no n8n; estes endpoints
// são as "ferramentas" que ele chama — cada um resolve tenant pelo host + valida). =====

const agentDateText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day!));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  }, "data inexistente");

const agentTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:mm");

/**
 * Ferramenta "disponibilidade": aceita o dia inteiro (compatibilidade) ou,
 * preferencialmente, o intervalo exato que o cliente escolheu.
 */
export const agentAvailabilityInput = z
  .object({
    date: agentDateText.transform(parseLocalDate),
    setupTime: agentTime.optional(),
    pickupTime: agentTime.optional(),
    toyName: z.string().max(120).optional(),
    category: toyCategory.optional(),
  })
  .superRefine((data, ctx) => {
    const hasSetup = Boolean(data.setupTime);
    const hasPickup = Boolean(data.pickupTime);
    if (hasSetup !== hasPickup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasSetup ? ["pickupTime"] : ["setupTime"],
        message: "informe montagem e retirada juntas",
      });
    } else if (data.setupTime && data.pickupTime && data.pickupTime <= data.setupTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pickupTime"],
        message: "a retirada deve ser depois da montagem",
      });
    }
  });
export type AgentAvailabilityInput = z.infer<typeof agentAvailabilityInput>;

/** Ferramenta "criar lead": a IA manda os dados que colheu na conversa. */
export const agentLeadInput = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().min(2).max(120),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").optional(),
  desiredToy: z.string().max(120).optional(),
  neighborhood: z.string().max(120).optional(),
  summary: z.string().max(500).optional(),
});
export type AgentLeadInput = z.infer<typeof agentLeadInput>;

/** Ferramenta "suporte humano": a IA escala pra equipe (cliente pediu, ou caso difícil). */
export const agentSupportInput = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().max(120).optional(),
  reason: z.string().max(300).optional(),
});
export type AgentSupportInput = z.infer<typeof agentSupportInput>;

/**
 * Ferramenta "agendar": a IA fecha a reserva de verdade no nosso banco.
 * A checagem de conflito do banco (autoridade) rejeita reserva dupla mesmo que a IA
 * tenha errado a disponibilidade. Brinquedos vêm por NOME (o que a IA obteve da
 * ferramenta disponibilidade); resolvidos p/ id no service. Horas em HH:mm no fuso de SP.
 */
export const agentBookingInput = z.object({
  phone: z.string().min(8).max(20),
  name: z.string().min(2).max(120),
  date: agentDateText,
  setupTime: agentTime,
  pickupTime: agentTime,
  toys: z.array(z.string().min(1).max(120)).min(1, "informe ao menos um brinquedo"),
  neighborhood: z.string().max(120).optional(),
  address: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});
export type AgentBookingInput = z.infer<typeof agentBookingInput>;

/** Ferramenta "meus agendamentos": a IA consulta as festas já marcadas desse telefone. */
export const agentLookupInput = z.object({
  phone: z.string().min(8).max(20),
});
export type AgentLookupInput = z.infer<typeof agentLookupInput>;
