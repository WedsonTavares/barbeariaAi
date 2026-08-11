import Link from "next/link";
import { Building2, MessageCircle, CreditCard, AlertTriangle, Plus } from "lucide-react";

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

  const desconectadas = lojas.filter((l) => l.ativa && l.whatsapp && l.whatsapp !== "open");
  const vencidas = lojas.filter((l) => l.ativa && statusAssinatura(l.paidUntil).estado === "vencida");

  return (
    <main className="mx-auto max-w-5xl p-6 sm:p-8">
      <header className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">Super Admin</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {lojas.length} {lojas.length === 1 ? "loja" : "lojas"} · gestão da plataforma
          </p>
        </div>
        <Link
          href="/super-admin/nova-loja"
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white"
        >
          <Plus className="size-4" /> Nova loja
        </Link>
      </header>

      {/* Alertas primeiro: é para isto que se abre esta tela. */}
      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Alerta
          icone={<MessageCircle className="size-4" />}
          titulo="WhatsApp desconectado"
          itens={desconectadas.map((l) => l.nome)}
          vazio={evolutionRespondeu ? "Todas conectadas" : "Evolution sem resposta — status desconhecido"}
          neutro={!evolutionRespondeu}
        />
        <Alerta
          icone={<CreditCard className="size-4" />}
          titulo="Assinatura vencida"
          itens={vencidas.map((l) => l.nome)}
          vazio="Nenhuma vencida"
        />
      </section>

      <div className="mt-6 space-y-3">
        {lojas.length === 0 ? (
          <p className="rounded-2xl border border-black/5 bg-white p-5 text-sm text-[var(--color-muted)] shadow-sm">
            Nenhuma loja cadastrada ainda.
          </p>
        ) : (
          lojas.map((loja) => <LojaCard key={loja.id} loja={loja} />)
        )}
      </div>
    </main>
  );
}

function Alerta({
  icone,
  titulo,
  itens,
  vazio,
  neutro = false,
}: {
  icone: React.ReactNode;
  titulo: string;
  itens: string[];
  vazio: string;
  neutro?: boolean;
}) {
  const alarme = itens.length > 0;
  return (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        alarme ? "border-red-200 bg-red-50" : "border-black/5 bg-white"
      }`}
    >
      <div
        className={`flex items-center gap-2 text-sm font-bold ${
          alarme ? "text-red-700" : "text-[var(--color-muted)]"
        }`}
      >
        {alarme ? <AlertTriangle className="size-4" /> : icone}
        {titulo}
        {alarme && <span className="ml-auto tabular-nums">{itens.length}</span>}
      </div>
      <p className={`mt-1 text-sm ${alarme ? "font-semibold text-red-800" : "text-[var(--color-muted)]"}`}>
        {alarme ? itens.join(" · ") : neutro ? vazio : `✓ ${vazio}`}
      </p>
    </div>
  );
}
