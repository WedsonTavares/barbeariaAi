import { withTenant } from "../db/withTenant";
import type { ToyInput } from "../schemas";
import type { ToyStatus } from "@prisma/client";

export const toyService = {
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) => tx.toy.findMany({ orderBy: { createdAt: "desc" } })),
  get: (tenantId: string, id: string) =>
    withTenant(tenantId, (tx) => tx.toy.findFirst({ where: { id } })),
  create: (tenantId: string, data: ToyInput) =>
    withTenant(tenantId, (tx) =>
      tx.toy.create({
        data: {
          tenantId,
          name: data.name,
          category: data.category,
          description: data.description,
          purchasePrice: data.purchasePrice,
          defaultRentPrice: data.defaultRentPrice,
        },
      })
    ),
  setStatus: (tenantId: string, id: string, status: ToyStatus) =>
    withTenant(tenantId, (tx) => tx.toy.update({ where: { id }, data: { status } })),
  /** Foto do brinquedo (URL pública do Supabase Storage). */
  setImage: (tenantId: string, id: string, imageUrl: string) =>
    withTenant(tenantId, (tx) => tx.toy.update({ where: { id }, data: { imageUrl } })),
};
