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

export const leadSource = z.enum([
  "INSTAGRAM", "FACEBOOK", "GOOGLE", "INDICATION", "WHATSAPP", "WEBSITE", "PAID_ADS", "PARTNER", "OTHER",
]);

export const leadStatus = z.enum(["NEW", "CONTACTED", "QUOTED", "WON", "LOST"]);

export const serviceCategory = z.enum([
  "HAIR", "BEARD", "NAILS", "BROWS", "AESTHETICS", "TATTOO", "MASSAGE", "OTHER",
]);
export const serviceStatus = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const professionalStatus = z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]);
export const locationMode = z.enum(["SALON", "CUSTOMER_ADDRESS", "ONLINE"]);
export const commissionType = z.enum(["NONE", "FIXED", "PERCENTAGE"]);
export const appointmentStatus = z.enum(["REQUESTED", "CONFIRMED", "ARRIVED", "IN_SERVICE", "COMPLETED", "NO_SHOW", "CANCELED"]);

export const serviceInput = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  category: serviceCategory.default("OTHER"),
  description: z.string().max(1000).optional(),
  durationMinutes: z.coerce.number().int().positive("Informe a duração"),
  bufferBeforeMinutes: z.coerce.number().int().nonnegative().default(0),
  bufferAfterMinutes: z.coerce.number().int().nonnegative().default(0),
  defaultPrice: z.coerce.number().nonnegative(),
  locationMode: locationMode.default("SALON"),
});
export type ServiceInput = z.infer<typeof serviceInput>;

export const professionalInput = z.object({
  name: z.string().trim().min(2, "Informe o nome"),
  phone: z.string().max(30).optional(),
  email: z.string().email().optional().or(z.literal("")),
  bio: z.string().max(1000).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#2563EB"),
  defaultCalendarId: z.string().max(300).optional(),
  defaultCommissionType: commissionType.default("NONE"),
  defaultCommissionValue: z.coerce.number().nonnegative().optional(),
});
export type ProfessionalInput = z.infer<typeof professionalInput>;

export const professionalServiceInput = z.object({
  professionalId: z.string().uuid(),
  serviceId: z.string().uuid(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  price: z.coerce.number().nonnegative().optional(),
  commissionType: commissionType.default("NONE"),
  commissionValue: z.coerce.number().nonnegative().optional(),
  active: z.coerce.boolean().default(true),
});
export type ProfessionalServiceInput = z.infer<typeof professionalServiceInput>;

export const weekday = z.enum([
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
]);

const hhmmTime = z.string().trim().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use o formato HH:mm");

/**
 * Expediente de UM dia de UM profissional. As pausas (almoço, intervalo) saem
 * da janela: um atendimento não pode atravessá-las.
 */
export const workingScheduleInput = z
  .object({
    professionalId: z.string().uuid(),
    dayOfWeek: weekday,
    startTime: hhmmTime,
    endTime: hhmmTime,
    breaks: z.array(z.object({ start: hhmmTime, end: hhmmTime })).max(4).optional(),
    /** Desmarcado = não trabalha nesse dia (o registro é removido). */
    active: z.coerce.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.endTime <= d.startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "O fim deve ser depois do início" });
    }
    for (const [i, pausa] of (d.breaks ?? []).entries()) {
      if (pausa.end <= pausa.start) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["breaks", i, "end"], message: "A pausa termina antes de começar" });
      } else if (pausa.start < d.startTime || pausa.end > d.endTime) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["breaks", i], message: "A pausa precisa estar dentro do expediente" });
      }
    }
  });
export type WorkingScheduleInput = z.infer<typeof workingScheduleInput>;

/** Folga, férias ou bloqueio pontual de um profissional. */
export const timeOffInput = z
  .object({
    professionalId: z.string().uuid(),
    startAt: spDateTime,
    endAt: spDateTime,
    reason: z.string().trim().max(200).optional(),
  })
  .refine((d) => d.endAt > d.startAt, { message: "O fim deve ser depois do início", path: ["endAt"] });
export type TimeOffInput = z.infer<typeof timeOffInput>;

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

export const appointmentInput = z
  .object({
    customerId: z.string().uuid(),
    professionalId: z.string().uuid().optional(),
    resourceId: z.string().uuid().optional(),
    startAt: spDateTime,
    endAt: spDateTime,
    total: z.coerce.number().nonnegative(),
    serviceIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um serviço"),
    leadSource: leadSource.optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.endAt > d.startAt, {
    message: "O fim deve ser depois do início",
    path: ["endAt"],
  });
export type AppointmentInput = z.infer<typeof appointmentInput>;

/** Edição de agendamento: mesmos campos do create, sem trocar o cliente. */
export const appointmentUpdateInput = z
  .object({
    professionalId: z.string().uuid().optional(),
    resourceId: z.string().uuid().optional(),
    startAt: spDateTime,
    endAt: spDateTime,
    total: z.coerce.number().nonnegative(),
    serviceIds: z.array(z.string().uuid()).min(1, "Selecione ao menos um serviço"),
    notes: z.string().optional(),
  })
  .refine((d) => d.endAt > d.startAt, {
    message: "O fim deve ser depois do início",
    path: ["endAt"],
  });
export type AppointmentUpdateInput = z.infer<typeof appointmentUpdateInput>;

export const leadInput = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  source: leadSource.default("WEBSITE"),
  message: z.string().optional(),
  desiredDate: spDate.optional(),
  neighborhood: z.string().optional(),
  desiredService: z.string().optional(),
});
export type LeadInput = z.infer<typeof leadInput>;

export const expenseCategory = z.enum(["COMMISSION", "PRODUCTS", "RENT", "UTILITIES", "MARKETING", "SALARY", "OTHER"]);

export const paymentInput = z.object({
  appointmentId: z.string().uuid(),
  amount: z.coerce.number().positive("Informe um valor maior que zero"),
  method: z.string().max(40).optional(),
});
export type PaymentInput = z.infer<typeof paymentInput>;

export const expenseInput = z.object({
  appointmentId: z.string().uuid().optional(),
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

/**
 * Telefone das ferramentas novas: normaliza ANTES de medir. O n8n manda só
 * dígitos, mas um número formatado ("+55 (16) 99233-1680") passa dos 20
 * caracteres e seria rejeitado se o limite valesse sobre o texto cru.
 */
const agentPhone = z
  .string()
  .max(30)
  .transform(phoneDigits)
  .refine((value) => value.length >= 8 && value.length <= 20, "telefone inválido");

const agentTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:mm");
const optionalAgentTime = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  agentTime.optional()
);
const availabilitySlotMinutes = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return typeof value === "string" ? Number(value) : value;
  },
  z.literal(30).optional()
);

/**
 * Ferramenta "disponibilidade": aceita o dia inteiro ou o intervalo exato que o
 * cliente escolheu. Serviço/profissional entram por nome porque vêm da conversa.
 */
export const agentAvailabilityInput = z
  .object({
    date: agentDateText.transform(parseLocalDate),
    startTime: optionalAgentTime,
    endTime: optionalAgentTime,
    slotMinutes: availabilitySlotMinutes,
    serviceName: z.string().max(120).optional(),
    professionalName: z.string().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    const hasStart = Boolean(data.startTime);
    const hasEnd = Boolean(data.endTime);
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: hasStart ? ["endTime"] : ["startTime"],
        message: "informe início e fim juntos",
      });
    } else if (data.startTime && data.endTime && data.endTime <= data.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endTime"],
        message: "o fim deve ser depois do início",
      });
    }
    if (data.slotMinutes && (hasStart || hasEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["slotMinutes"],
        message: "não combine grade de slots com intervalo exato",
      });
    }
  });
export type AgentAvailabilityInput = z.infer<typeof agentAvailabilityInput>;

/** Ferramenta "criar lead": a IA manda os dados que colheu na conversa. */
export const agentLeadInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  name: z.string().min(2).max(120),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD").optional(),
  desiredService: z.string().max(120).optional(),
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

/** Contexto salvo que o n8n compacta antes de chamar o agente. */
export const agentContextInput = z.object({
  phone: agentPhone,
  limit: z.coerce.number().int().min(1).max(100).default(80),
});
export type AgentContextInput = z.infer<typeof agentContextInput>;

/**
 * Ferramenta "solicitar cancelamento": o cliente pede pra desmarcar pelo WhatsApp.
 *
 * A IA NÃO cancela por esta ferramenta — só registra o pedido e chama a equipe.
 * O cancelamento efetivo usa uma ferramenta separada com confirmação explícita.
 */
export const agentCancelRequestInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  name: z.string().max(120).optional(),
  /** Data do atendimento que ele quer desmarcar, se disse qual (AAAA-MM-DD). */
  date: agentDateText.optional(),
  reason: z.string().max(300).optional(),
});
export type AgentCancelRequestInput = z.infer<typeof agentCancelRequestInput>;

/**
 * Ferramenta "avaliação pós-atendimento". Quem decide bom/ruim é QUAL FERRAMENTA a IA
 * chamou (positiva/negativa), não um número comparado no backend — pedir pra IA
 * preencher um `score` numérico via $fromAI se mostrou frágil (o modelo às vezes
 * deixa vazio, quebra o JSON do corpo). `score` fica opcional, só como anotação
 * pra relatório.
 */
export const agentPostServiceInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  score: z.number().int().min(0).max(10).optional(),
  comment: z.string().max(500).optional(),
});
export type AgentPostServiceInput = z.infer<typeof agentPostServiceInput>;

/**
 * Ferramenta "agendar": a IA fecha o agendamento de verdade no nosso banco.
 * Serviços e profissional vêm por nome; o service resolve para IDs e calcula
 * duração/preço a partir do catálogo.
 */
export const agentAppointmentInput = z.object({
  phone: z.string().min(8).max(20).transform(phoneDigits),
  name: z.string().min(2).max(120),
  date: agentDateText,
  startTime: agentTime,
  serviceNames: z.array(z.string().min(1).max(120)).min(1, "informe ao menos um serviço"),
  professionalName: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
});
export type AgentAppointmentInput = z.infer<typeof agentAppointmentInput>;

/**
 * Reagenda um atendimento identificado pela consulta "meus agendamentos".
 * O telefone impede que um appointmentId de outro cliente seja alterado.
 */
export const agentAppointmentRescheduleInput = z
  .object({
    appointmentId: z.string().uuid(),
    phone: agentPhone,
    date: agentDateText,
    startTime: agentTime,
    professionalName: z.string().max(120).optional(),
  })
export type AgentAppointmentRescheduleInput = z.infer<typeof agentAppointmentRescheduleInput>;

/**
 * Cancela um agendamento específico. `confirmed: true` é obrigatório para impedir
 * que uma chamada incompleta ou de consulta execute uma alteração destrutiva.
 */
export const agentAppointmentCancelInput = z.object({
  appointmentId: z.string().uuid(),
  phone: agentPhone,
  confirmed: z.literal(true),
});
export type AgentAppointmentCancelInput = z.infer<typeof agentAppointmentCancelInput>;

/** Ferramenta "meus agendamentos": a IA consulta atendimentos marcados desse telefone. */
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

/**
 * Expediente: mesmo formato que `overview-service` já lê (start/end/days).
 *
 * `serviceStart`/`serviceEnd` são a janela em que a agenda pode oferecer
 * horários. Opcionais: sem eles, o parser cai no expediente geral.
 */
export const businessHoursInput = z.object({
  start: hhmm,
  end: hhmm,
  days: z.array(z.number().int().min(0).max(6)).max(7),
  serviceStart: hhmm.optional(),
  serviceEnd: hhmm.optional(),
});
export type BusinessHoursInput = z.infer<typeof businessHoursInput>;

const FUNNEL_SYSTEM_COLUMNS = [
  "IA_ATENDENDO",
  "SUPORTE_HUMANO",
  "INTERESSADO",
  "AGENDADO",
  "POS_ATENDIMENTO",
] as const;

const funnelColumnInput = z.object({
  id: z.string().regex(/^(?:IA_ATENDENDO|SUPORTE_HUMANO|INTERESSADO|AGENDADO|POS_ATENDIMENTO|custom_[a-z0-9_-]{8,64})$/),
  kind: z.enum(["system", "custom"]),
  label: z.string().trim().min(1, "Dê um nome à coluna").max(40),
  visible: z.boolean(),
}).superRefine((column, ctx) => {
  const system = (FUNNEL_SYSTEM_COLUMNS as readonly string[]).includes(column.id);
  if ((system && column.kind !== "system") || (!system && column.kind !== "custom")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Tipo de coluna inválido" });
  }
});

export const funnelConfigInput = z.object({
  version: z.literal(1),
  columns: z.array(funnelColumnInput).min(5).max(15),
}).superRefine((config, ctx) => {
  const ids = config.columns.map((column) => column.id);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Coluna repetida" });
  }
  for (const id of FUNNEL_SYSTEM_COLUMNS) {
    if (!ids.includes(id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Falta a coluna ${id}` });
    }
  }
  if (!config.columns.some((column) => column.visible)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Deixe ao menos uma coluna visível" });
  }
});
export type FunnelConfigInput = z.infer<typeof funnelConfigInput>;

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
  defaultSlotMinutes: optNumberKeep(5, 240),
  minAppointmentLeadMinutes: optNumberKeep(0, 10_080),
  cancellationPolicy: optText(500),
  businessHours: businessHoursInput.optional(),

  headline: optText(150),
  subheadline: optText(250),
  ctaText: optText(60),
  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorAccent: hexColor,

  logoUrl: optText(300),
  instagram: optText(200),
  facebook: optText(200),
  googleMaps: optText(300),

  postServiceMessage: optText(500),
  reviewLink: optText(300),
  funnelConfig: funnelConfigInput.optional(),
});
export type TenantSettingsInput = z.infer<typeof tenantSettingsInput>;

/** Nome da empresa vive em `Tenant`, não em `TenantSettings` — por isso separado. */
export const tenantNameInput = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa").max(120),
});
export type TenantNameInput = z.infer<typeof tenantNameInput>;

/* ────────────────────────── Super Admin (plataforma) ────────────────────────
 * Entradas que SÓ o super admin usa. Lista fechada de campos, como a do
 * `tenantSettingsInput`: assim uma tela nova não consegue, por descuido,
 * escrever em `slug`, `clerkOrgId` ou `active` passando um objeto inteiro.
 */

/** Um link avulso da loja (workflow do n8n, doc, painel…). */
export const tenantLinkInput = z.object({
  label: z.string().trim().min(1, "Dê um nome ao link").max(60),
  url: z.string().trim().url("Link inválido").max(500),
});
export type TenantLinkInput = z.infer<typeof tenantLinkInput>;

/** Assinatura: registro manual, sem cobrança automática. */
export const tenantBillingInput = z.object({
  plan: z.string().trim().max(60).nullish(),
  // `coerce` porque vem de <input type="number"> como string.
  monthlyFee: z.coerce.number().min(0).max(1_000_000).nullish(),
  // Data pura (yyyy-mm-dd) do <input type="date">. String vazia vira null.
  paidUntil: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .nullish()
    .or(z.literal("").transform(() => null)),
  adminNotes: z.string().trim().max(5_000).nullish(),
});
export type TenantBillingInput = z.infer<typeof tenantBillingInput>;

/** Lista completa de links da loja — substitui a anterior. */
export const tenantLinksInput = z.object({
  links: z.array(tenantLinkInput).max(30, "Máximo de 30 links"),
});
export type TenantLinksInput = z.infer<typeof tenantLinksInput>;

/**
 * Loja nova, criada pelo Super Admin.
 *
 * O `slug` vira SUBDOMÍNIO e, por padrão, também o nome da INSTÂNCIA do
 * WhatsApp — por isso o formato é restrito aqui e as colisões são checadas no
 * service (`createFromSuperAdmin`), que é quem consegue olhar as outras lojas.
 */
export const tenantCreateInput = z.object({
  name: z.string().trim().min(2, "Informe o nome da loja").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "O slug precisa de pelo menos 3 caracteres")
    .max(40, "O slug pode ter no máximo 40 caracteres")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use só letras minúsculas, números e hífen (ex.: barbearia-centro)"),
  clerkOrgId: z
    .string()
    .trim()
    .regex(/^org_[A-Za-z0-9]+$/, 'O Organization ID do Clerk começa com "org_"'),
});
export type TenantCreateInput = z.infer<typeof tenantCreateInput>;

/**
 * Loja nova com a organização do Clerk criada pelo sistema. É o caminho normal:
 * o super admin não precisa abrir o painel do Clerk nem copiar id nenhum.
 * O `clerkOrgId` não entra aqui porque é o Clerk que devolve.
 */
export const tenantCreateWithOwnerInput = tenantCreateInput.omit({ clerkOrgId: true }).extend({
  ownerEmail: z.string().trim().toLowerCase().email("E-mail do dono inválido"),
});
export type TenantCreateWithOwnerInput = z.infer<typeof tenantCreateWithOwnerInput>;
