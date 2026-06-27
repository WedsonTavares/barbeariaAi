// Tipos (enums) do Prisma re-exportados para os apps não importarem @prisma/client direto.
export type {
  ExpenseCategory,
  ReminderType,
  NotificationType,
} from "@prisma/client";
export { prisma } from "./db/prisma";
export { withTenant, platformDb, type Tx } from "./db/withTenant";
export * from "./tenant/resolve";
export * from "./auth/permissions";
export * from "./calculations";
export * as schemas from "./schemas";
export * as services from "./services";
