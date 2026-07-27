import { z } from "zod";
import { parseLocalDate, parseLocalDateTime } from "../time";
import { phoneDigits } from "../phone";

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
  name: z.string().trim().min(2),
  phone: z
    .string()
    .min(8)
    .refine(
      (value) => {
        const length = phoneDigits(value).length;
        return length >= 10 && length <= 15;
      },
      "Informe um WhatsApp válido",
    ),
  email: z.string().email().optional().or(z.literal("")),
  neighborhood: z.string().optional(),
  address: z.string().optional(),
  imageConsent: z.coerce.boolean().optional(),
});
export type CustomerInput = z.infer<typeof customerInput>;

/** O WhatsApp não é editado junto dos demais dados: ele liga cliente, conversa e agenda. */
export const customerUpdateInput = customerInput.omit({ phone: true });
export type CustomerUpdateInput = z.infer<typeof customerUpdateInput>;

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
  phone: z.string().min(8).max(20).transform(phoneDigits),
  name: z.string().min(2).max(120),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").optional(),
  desiredToy: z.string().max(120).optional(),
  neighborhood: z.string().max(120).optional(),
  summary: z.string().max(500).optional(),
});
export type AgentLeadInput = z.infer<typeof agentLeadInput>;

/** Ferramenta "suporte humano": a IA escala pra equipe (cliente pediu, ou caso difícil). */
export const agentSupportInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  name: z.string().max(120).optional(),
  reason: z.string().max(300).optional(),
});
export type AgentSupportInput = z.infer<typeof agentSupportInput>;

/**
 * Ferramenta "solicitar cancelamento": o cliente pede pra desmarcar pelo WhatsApp.
 *
 * A IA NÃO cancela — só registra o pedido e chama a equipe. Cancelar mexe em sinal
 * já pago e em política de devolução; é decisão de gente, não de modelo. Sem isto,
 * o pedido morria na conversa e a data continuava ocupada na agenda.
 */
export const agentCancelRequestInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  name: z.string().max(120).optional(),
  /** Data da festa que ele quer desmarcar, se disse qual (AAAA-MM-DD). */
  date: agentDateText.optional(),
  reason: z.string().max(300).optional(),
});
export type AgentCancelRequestInput = z.infer<typeof agentCancelRequestInput>;

/**
 * Ferramenta "avaliação pós-festa". Quem decide bom/ruim é QUAL FERRAMENTA a IA
 * chamou (positiva/negativa), não um número comparado no backend — pedir pra IA
 * preencher um `score` numérico via $fromAI se mostrou frágil (o modelo às vezes
 * deixa vazio, quebra o JSON do corpo). `score` fica opcional, só como anotação
 * pra relatório.
 */
export const agentPostEventInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  score: z.number().int().min(0).max(10).optional(),
  comment: z.string().max(500).optional(),
});
export type AgentPostEventInput = z.infer<typeof agentPostEventInput>;

/**
 * Ferramenta "agendar": a IA fecha a reserva de verdade no nosso banco.
 * A checagem de conflito do banco (autoridade) rejeita reserva dupla mesmo que a IA
 * tenha errado a disponibilidade. Brinquedos vêm por NOME (o que a IA obteve da
 * ferramenta disponibilidade); resolvidos p/ id no service. Horas em HH:mm no fuso de SP.
 */
export const agentBookingInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
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
  phone: z.string().min(8).max(20).transform(phoneDigits),
});
export type AgentLookupInput = z.infer<typeof agentLookupInput>;

/* ─────────────────────────── Configurações do tenant ─────────────────────────── */

/*
 * Três estados, e a diferença importa para o Prisma:
 *   - chave AUSENTE  → `undefined` → Prisma não toca no campo (outra seção salvou)
 *   - chave com ""   → `null`      → limpa o campo de verdade
 *   - chave com valor→ grava
 *
 * Sem isso, "" viraria `undefined` e o campo esvaziado pelo usuário voltaria com
 * o valor antigo — nunca daria para apagar um dado já preenchido.
 */

/** Texto opcional de coluna anulável: "" limpa (null). */
const optText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(max).nullish()
  );

/** Número opcional de coluna anulável: "" limpa (null); texto inválido é rejeitado. */
const optNumber = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.coerce.number().min(min).max(max).nullish()
  );

/**
 * Número de coluna NÃO anulável (tem default no banco): "" apenas ignora o campo,
 * mantendo o valor atual — gravar null quebraria a constraint.
 */
const optNumberKeep = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().min(min).max(max).optional()
  );

/** Cor hexadecimal (#RGB ou #RRGGBB) — vai direto pro CSS do site público. */
/** Cor: coluna NÃO anulável (tem default). "" mantém a cor atual em vez de quebrar. */
const hexColor = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use uma cor no formato #RRGGBB")
    .optional()
);

const hhmm = z.string().trim().regex(/^\d{1,2}:\d{2}$/, "Use o formato HH:mm");

/** Expediente: mesmo formato que `overview-service` já lê (start/end/days). */
export const businessHoursInput = z.object({
  start: hhmm,
  end: hhmm,
  days: z.array(z.number().int().min(0).max(6)).max(7),
});
export type BusinessHoursInput = z.infer<typeof businessHoursInput>;

/**
 * Configurações editáveis pelo painel.
 *
 * Existe para fechar um buraco real: `tenantService.updateSettings` aceitava
 * `Record<string, unknown>` e repassava direto ao Prisma — qualquer campo do
 * modelo (inclusive `evolutionInstance`, que amarra o WhatsApp do tenant)
 * poderia ser sobrescrito por um POST forjado. Aqui a lista é fechada:
 * o que não está descrito abaixo é descartado.
 */
export const tenantSettingsInput = z.object({
  legalName: optText(150),
  cnpj: optText(20),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().email("E-mail inválido").max(150).nullish()
  ),
  whatsappMain: optText(20),
  whatsappAlerts: optText(20),

  city: optText(100),
  baseAddress: optText(200),
  serviceRadiusKm: optNumber(0, 500),
  deliveryFee: optNumber(0, 100_000),

  // Estes dois têm default no banco (não anuláveis): "" mantém o valor atual.
  minRentalHours: optNumberKeep(1, 24),
  minRentalPrice: optNumberKeep(0, 100_000),
  depositPolicy: optText(500),
  businessHours: businessHoursInput.optional(),

  headline: optText(150),
  subheadline: optText(250),
  ctaText: optText(60),
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorAccent: hexColor,

  instagram: optText(200),
  facebook: optText(200),
  googleMaps: optText(300),

  postEventMessage: optText(500),
  reviewLink: optText(300),
});
export type TenantSettingsInput = z.infer<typeof tenantSettingsInput>;

/** Nome da empresa vive em `Tenant`, não em `TenantSettings` — por isso separado. */
export const tenantNameInput = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa").max(120),
});
export type TenantNameInput = z.infer<typeof tenantNameInput>;
