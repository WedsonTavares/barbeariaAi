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
        headline: `${name} — diversão sem dor de cabeça`,
        subheadline: "Brinquedos entregues, montados e higienizados.",
        ctaText: "Reservar no WhatsApp",
      },
    });
    // Conta explicitamente por tenantId (não confia na RLS: o dono/owner pode ter BYPASSRLS).
    const count = await tx.toy.count({ where: { tenantId: tenant.id } });
    if (count === 0) {
      await tx.toy.createMany({
        data: [
          { tenantId: tenant.id, name: "Pula-pula Aranha", category: "INFLAVEL", purchasePrice: 3500, defaultRentPrice: 150 },
          { tenantId: tenant.id, name: "Piscina de Bolinhas", category: "PISCINA_BOLINHAS", purchasePrice: 1800, defaultRentPrice: 130 },
          { tenantId: tenant.id, name: "Cama Elástica Pro", category: "CAMA_ELASTICA", purchasePrice: 2600, defaultRentPrice: 180 },
        ],
      });
    }
  });
  console.log(`✓ tenant ${slug} (${tenant.id})`);
}

async function main() {
  await tenantSeed("dineplay", "Dine Play", "org_demo_dineplay");
  await tenantSeed("irma", "Festas da Irmã", "org_demo_irma");
}

main().then(() => prisma.$disconnect());
