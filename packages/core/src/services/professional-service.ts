import type { ProfessionalStatus } from "@prisma/client";

import { withTenant } from "../db/withTenant";
import type { ProfessionalInput, ProfessionalServiceInput } from "../schemas";

function blankToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const professionalService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.professional.findMany({
        orderBy: { name: "asc" },
        include: {
          services: {
            include: { service: true },
            orderBy: { createdAt: "asc" },
          },
          _count: { select: { appointments: true } },
        },
      })
    ),

  active: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.professional.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
      })
    ),

  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) =>
      tx.professional.findFirst({
        where: { id },
        include: { services: { include: { service: true } } },
      })
    ),

  create: (tenantId: string, data: ProfessionalInput) =>
    withTenant(tenantId, (tx) =>
      tx.professional.create({
        data: {
          tenantId,
          name: data.name,
          phone: blankToNull(data.phone),
          email: blankToNull(data.email),
          bio: blankToNull(data.bio),
          color: data.color,
          defaultCalendarId: blankToNull(data.defaultCalendarId),
          defaultCommissionType: data.defaultCommissionType,
          defaultCommissionValue: data.defaultCommissionValue ?? null,
        },
      })
    ),

  update: (tenantId: string, id: string, data: ProfessionalInput) =>
    withTenant(tenantId, (tx) =>
      tx.professional.update({
        where: { id },
        data: {
          name: data.name,
          phone: blankToNull(data.phone),
          email: blankToNull(data.email),
          bio: blankToNull(data.bio),
          color: data.color,
          defaultCalendarId: blankToNull(data.defaultCalendarId),
          defaultCommissionType: data.defaultCommissionType,
          defaultCommissionValue: data.defaultCommissionValue ?? null,
        },
      })
    ),

  setStatus: (tenantId: string, id: string, status: ProfessionalStatus) =>
    withTenant(tenantId, (tx) => tx.professional.update({ where: { id }, data: { status } })),

  assignService: (tenantId: string, input: ProfessionalServiceInput) =>
    withTenant(tenantId, (tx) =>
      tx.professionalService.upsert({
        where: {
          tenantId_professionalId_serviceId: {
            tenantId,
            professionalId: input.professionalId,
            serviceId: input.serviceId,
          },
        },
        update: {
          durationMinutes: input.durationMinutes ?? null,
          price: input.price ?? null,
          commissionType: input.commissionType,
          commissionValue: input.commissionValue ?? null,
          active: input.active,
        },
        create: {
          tenantId,
          professionalId: input.professionalId,
          serviceId: input.serviceId,
          durationMinutes: input.durationMinutes ?? null,
          price: input.price ?? null,
          commissionType: input.commissionType,
          commissionValue: input.commissionValue ?? null,
          active: input.active,
        },
      })
    ),

  removeService: (tenantId: string, professionalId: string, serviceId: string) =>
    withTenant(tenantId, (tx) =>
      tx.professionalService.deleteMany({
        where: { tenantId, professionalId, serviceId },
      })
    ),
};
