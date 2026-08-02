import { withTenant } from "../db/withTenant";

/**
 * Galeria de eventos do site público.
 *
 * A tabela guarda só a URL — o arquivo vive no Supabase Storage (bucket
 * `eventos`), igual ao que a foto de brinquedo já faz. Quem sobe o binário é a
 * action do painel; aqui só entra o endereço final.
 */
export const eventPhotoService = {
  /** Na ordem que o site exibe: `sortOrder` primeiro, mais recente como desempate. */
  list: (tenantId: string) =>
    withTenant(tenantId, (tx) =>
      tx.eventPhoto.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] })
    ),

  /**
   * Entra no fim da galeria. Calcular o `sortOrder` aqui (e não no app) mantém
   * a regra num lugar só — o painel manda a foto, não a posição.
   */
  create: (tenantId: string, imageUrl: string, caption?: string) =>
    withTenant(tenantId, async (tx) => {
      const ultima = await tx.eventPhoto.findFirst({
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      return tx.eventPhoto.create({
        data: {
          tenantId,
          imageUrl,
          caption: caption?.trim() || null,
          sortOrder: (ultima?.sortOrder ?? -1) + 1,
        },
      });
    }),

  updateCaption: (tenantId: string, id: string, caption: string) =>
    withTenant(tenantId, (tx) =>
      tx.eventPhoto.updateMany({ where: { id }, data: { caption: caption.trim() || null } })
    ),

  /**
   * Sobe ou desce uma posição, trocando com a foto vizinha.
   *
   * A troca acontece dentro da transação do `withTenant` de propósito: se
   * escrevesse uma de cada vez, uma falha no meio deixaria duas fotos com o
   * mesmo `sortOrder` e a ordem do site viraria aleatória.
   */
  move: (tenantId: string, id: string, direcao: "up" | "down") =>
    withTenant(tenantId, async (tx) => {
      const atual = await tx.eventPhoto.findFirst({ where: { id } });
      if (!atual) return null;

      const vizinha = await tx.eventPhoto.findFirst({
        where:
          direcao === "up"
            ? { sortOrder: { lt: atual.sortOrder } }
            : { sortOrder: { gt: atual.sortOrder } },
        orderBy: { sortOrder: direcao === "up" ? "desc" : "asc" },
      });
      if (!vizinha) return null; // já está na ponta

      await tx.eventPhoto.update({ where: { id: atual.id }, data: { sortOrder: vizinha.sortOrder } });
      await tx.eventPhoto.update({ where: { id: vizinha.id }, data: { sortOrder: atual.sortOrder } });
      return { movida: atual.id, trocadaCom: vizinha.id };
    }),

  /**
   * Remove o registro e devolve a URL, pra quem chamou apagar o arquivo do
   * Storage. O service não fala com o Storage — isso é da camada do app.
   */
  remove: (tenantId: string, id: string) =>
    withTenant(tenantId, async (tx) => {
      const foto = await tx.eventPhoto.findFirst({ where: { id }, select: { imageUrl: true } });
      if (!foto) return null;
      await tx.eventPhoto.deleteMany({ where: { id } });
      return foto.imageUrl;
    }),
};
