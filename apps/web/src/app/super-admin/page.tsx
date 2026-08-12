import Link from "next/link";
import { Building2, MessageCircle, CreditCard, Plus, PowerOff } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { getAuthContext } from "@/lib/tenant";
import { fetchAllConnectionStates } from "@/lib/evolution";
import { LojaCard } from "./LojaCard";
import { statusAssinatura, type LojaView } from "./tipos";

export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const ctx = await getAuthContext();
  if (!ctx.isSuperAdmin) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="font-bold">Apenas super admin.</p>
      </main>
    );
  }

  const tenants = await services.tenantService.listAll();

  // Uma chamada só ao Evolution para TODAS as lojas (ver fetchAllConnectionStates).
  // Map vazio = Evolution fora do ar; a tela mostra "sem informação", que é
  // diferente de "desconectado".
  const [estados, instancias] = await Promise.all([
    fetchAllConnectionStates(),
    Promise.all(
      tenants.map(async (t) => [t.id, await services.tenantService.evolutionInstance(t.id, t.slug)] as const)
    ),
  ]);
  const instanciaPorTenant = new Map(instancias);
  const evolutionRespondeu = estados.size > 0;

  const lojas: LojaView[] = tenants.map((t) => {
    const instance = instanciaPorTenant.get(t.id) ?? t.slug;
    return {
      id: t.id,
      nome: t.name,
      slug: t.slug,
      clerkOrgId: t.clerkOrgId,
      ativa: t.active,
      criadaEm: t.createdAt.toISOString(),
      instance,
      whatsapp: evolutionRespondeu ? (estados.get(instance) ?? "close") : null,
      plan: t.plan,
      monthlyFee: t.monthlyFee ? Number(t.monthlyFee) : null,
      paidUntil: t.paidUntil ? t.paidUntil.toISOString() : null,
      lastPaymentAt: t.lastPaymentAt ? t.lastPaymentAt.toISOString() : null,
      links: Array.isArray(t.links) ? (t.links as { label: string; url: string }[]) : [],
      adminNotes: t.adminNotes,
      setupSteps: Array.isArray(t.setupSteps) ? (t.setupSteps as string[]) : [],
    };
  });

  const ativas = lojas.filter((l) => l.ativa);
  const suspensas = lojas.filter((l) => !l.ativa);
  const desconectadas = ativas.filter((l) => l.whatsapp && l.whatsapp !== "open");
  const conectadas = ativas.filter((l) => l.whatsapp === "open");
  const vencidas = ativas.filter((l) => statusAssinatura(l.paidUntil).estado === "vencida");

  // Quem precisa de atenção vem primeiro: WhatsApp caído, depois assinatura
  // vencida, depois o resto por nome. Com muitas lojas, rolar a lista atrás do
  // problema é o que mais custa tempo.
  const ordenadas = [...lojas].sort((a, b) => {
    const peso = (l: LojaView) =>
      (l.ativa && l.whatsapp && l.whatsapp !== "open" ? 0 : 10) +
      (l.ativa && statusAssinatura(l.paidUntil).estado === "vencida" ? 0 : 5) +
      (l.ativa ? 0 : 100);
    return peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR");
  });

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Lojas</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {lojas.length} {lojas.length === 1 ? "loja" : "lojas"} na plataforma
          </p>
        </div>
        <Link
          href="/super-admin/nova-loja"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white"
        >
          <Plus className="size-4" /> Nova loja
        </Link>
      </header>

      {/*
        Números e alertas no MESMO bloco, de propósito. Antes eram duas seções e
        a informação aparecia duas vezes: um card dizia "WhatsApp desconectado:
        Tavares" e o número aparecia de novo embaixo. Aqui cada número carrega o
        próprio estado — fica vermelho quando é problema.
      */}
      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          icone={<Building2 className="size-4" />}
          rotulo="Ativas"
          valor={ativas.length}
          detalhe={suspensas.length ? `${suspensas.length} suspensa${suspensas.length > 1 ? "s" : ""}` : "nenhuma suspensa"}
        />
        <Indicador
          icone={<MessageCircle className="size-4" />}
          rotulo="WhatsApp"
          valor={evolutionRespondeu ? conectadas.length : "—"}
          detalhe={
            !evolutionRespondeu
              ? "Evolution sem resposta"
              : desconectadas.length
                ? desconectadas.map((l) => l.nome).join(", ")
                : "todas conectadas"
          }
          alarme={evolutionRespondeu && desconectadas.length > 0}
          neutro={!evolutionRespondeu}
        />
        <Indicador
          icone={<CreditCard className="size-4" />}
          rotulo="Vencidas"
          valor={vencidas.length}
          detalhe={vencidas.length ? vencidas.map((l) => l.nome).join(", ") : "nenhuma vencida"}
          alarme={vencidas.length > 0}
        />
        <Indicador
          icone={<PowerOff className="size-4" />}
          rotulo="Suspensas"
          valor={suspensas.length}
          detalhe={suspensas.length ? suspensas.map((l) => l.nome).join(", ") : "nenhuma"}
        />
      </section>

      <div className="mt-6 space-y-3">
        {lojas.length === 0 ? (
          <div className="rounded-2xl border border-black/5 bg-white p-8 text-center shadow-sm">
            <p className="font-bold">Nenhuma loja ainda.</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              O assistente cria a organização no Clerk, convida o dono e cadastra a loja.
            </p>
            <Link
              href="/super-admin/nova-loja"
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white"
            >
              <Plus className="size-4" /> Criar a primeira
            </Link>
          </div>
        ) : (
          ordenadas.map((loja) => <LojaCard key={loja.id} loja={loja} />)
        )}
      </div>
    </main>
  );
}

function Indicador({
  icone,
  rotulo,
  valor,
  detalhe,
  alarme = false,
  neutro = false,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number | string;
  detalhe: string;
  alarme?: boolean;
  neutro?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        alarme ? "border-red-200 bg-red-50" : "border-black/5 bg-white"
      }`}
    >
      <div
        className={`flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide ${
          alarme ? "text-red-700" : "text-[var(--color-muted)]"
        }`}
      >
        {icone}
        {rotulo}
      </div>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${alarme ? "text-red-700" : ""}`}>{valor}</p>
      <p
        className={`mt-0.5 truncate text-xs ${
          alarme ? "font-semibold text-red-800" : neutro ? "text-amber-700" : "text-[var(--color-muted)]"
        }`}
        title={detalhe}
      >
        {detalhe}
      </p>
    </div>
  );
}
