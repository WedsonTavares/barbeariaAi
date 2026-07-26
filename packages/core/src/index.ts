// Tipos (enums) do Prisma re-exportados para os apps não importarem @prisma/client direto.
export type {
  ExpenseCategory,
  ReminderType,
  NotificationType,
  ConversationStage,
} from "@prisma/client";
export { prisma } from "./db/prisma";
export { withTenant, platformDb, type Tx } from "./db/withTenant";
export * from "./tenant/resolve";
export * from "./auth/permissions";
export * from "./calculations";
export * from "./time";
export * from "./phone";
export * as schemas from "./schemas";
export * as services from "./services";
// Tipos que a UI precisa nomear (props de componentes da Visão Geral).
export type { OverviewDay, OverviewSummary, OverviewTrend } from "./services/overview-service";
// Apps tratam erro de validação sem depender do zod diretamente.
export { ZodError } from "zod";
