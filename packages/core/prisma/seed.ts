import { prisma } from "../src/db/prisma";
import { withTenant } from "../src/db/withTenant";

async function tenantSeed(slug: string, name: string, clerkOrgId: string) {
  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, name, clerkOrgId },
  });
  await withTenant(tenant.id, async (tx) => {
    await tx.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        whatsappMain: "5516993294815",
        city: "Ribeirão Preto",
        headline: `${name}  agende no WhatsApp`,
        subheadline:
          "Cortes, barba e serviços com atendimento assistido por IA.",
        ctaText: "Agendar no WhatsApp",
      },
    });
    const services = await tx.service.count({ where: { tenantId: tenant.id } });
    if (services === 0) {
      await tx.service.createMany({
        data: [
          {
            tenantId: tenant.id,
            name: "Corte masculino",
            category: "HAIR",
            durationMinutes: 40,
            defaultPrice: 45,
          },
          {
            tenantId: tenant.id,
            name: "Barba",
            category: "BEARD",
            durationMinutes: 30,
            defaultPrice: 35,
          },
          {
            tenantId: tenant.id,
            name: "Corte + barba",
            category: "BEARD",
            durationMinutes: 70,
            defaultPrice: 75,
          },
        ],
      });
    }
    const professionals = await tx.professional.count({
      where: { tenantId: tenant.id },
    });
    if (professionals === 0) {
      const joao = await tx.professional.create({
        data: { tenantId: tenant.id, name: "João", color: "#2563EB" },
      });
      const catalog = await tx.service.findMany({
        where: { tenantId: tenant.id },
      });
      await tx.professionalService.createMany({
        data: catalog.map((service) => ({
          tenantId: tenant.id,
          professionalId: joao.id,
          serviceId: service.id,
        })),
      });
    }
  });
  console.log(`✓ tenant ${slug} (${tenant.id})`);
}

async function main() {
  const clerkOrgId = process.env.SEED_CLERK_ORG_ID;
  if (!clerkOrgId) {
    throw new Error(
      "SEED_CLERK_ORG_ID ausente: informe o ID org_... da organização do Clerk antes de rodar o seed."
    );
  }
  await tenantSeed(
    process.env.SEED_TENANT_SLUG ??
      process.env.PRIMARY_TENANT_SLUG ??
      "barbearia",
    process.env.SEED_TENANT_NAME ?? "Barbearia AI",
    clerkOrgId
  );
}

main().then(() => prisma.$disconnect());
