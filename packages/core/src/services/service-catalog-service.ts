import type { ServiceStatus } from "@prisma/client";

import { withTenant } from "../db/withTenant";
import type { ServiceInput } from "../schemas";

export const serviceCatalogService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.service.findMany({
        orderBy: { name: "asc" },
        include: {
          _count: { select: { professionals: true, appointments: true } },
        },
      })
    ),

  active: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.service.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
      })
    ),

  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.service.findFirst({ where: { id } })),

  create: (tenantId: string, data: ServiceInput) =>
    withTenant(tenantId, (tx) =>
      tx.service.create({
        data: {
          tenantId,
          name: data.name,
          category: data.category,
          description: data.description || null,
          durationMinutes: data.durationMinutes,
          bufferBeforeMinutes: data.bufferBeforeMinutes,
          bufferAfterMinutes: data.bufferAfterMinutes,
          defaultPrice: data.defaultPrice,
          locationMode: data.locationMode,
        },
      })
    ),

  update: (tenantId: string, id: string, data: ServiceInput) =>
    withTenant(tenantId, (tx) =>
      tx.service.update({
        where: { id },
        data: {
          name: data.name,
          category: data.category,
          description: data.description || null,
          durationMinutes: data.durationMinutes,
          bufferBeforeMinutes: data.bufferBeforeMinutes,
          bufferAfterMinutes: data.bufferAfterMinutes,
          defaultPrice: data.defaultPrice,
          locationMode: data.locationMode,
        },
      })
    ),

  setStatus: (tenantId: string, id: string, status: ServiceStatus) =>
    withTenant(tenantId, (tx) => tx.service.update({ where: { id }, data: { status } })),

  remove: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const used = await tx.appointmentService.count({ where: { serviceId: id } });
      if (used > 0) {
        await tx.service.update({ where: { id }, data: { status: "ARCHIVED" } });
        return { deleted: false as const, archived: true as const, appointments: used };
      }
      await tx.professionalService.deleteMany({ where: { serviceId: id } });
      await tx.service.delete({ where: { id } });
      return { deleted: true as const, archived: false as const, appointments: 0 };
    }),
};
