import { UsersRound } from "lucide-react";

import { currentRole, services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { CustomersDirectory, type CustomerDirectoryItem } from "./CustomersDirectory";
import { NewCustomerDialog } from "./NewCustomerDialog";

export const dynamic = "force-dynamic";

const OKS: Record<string, string> = {
  1: "Cliente adicionado.",
  editado: "Cadastro atualizado.",
  removido: "Cadastro removido sem apagar conversas, leads ou agendamentos.",
  arquivado: "Arquivado. Saiu de Clientes, do inbox e do funil — nada foi apagado.",
  restaurado: "Restaurado e de volta ao painel.",
};

const ERRORS: Record<string, string> = {
  edicao: "Alteração não salva. Confira os campos do cliente.",
  nao_encontrado: "Este cadastro não existe mais ou não pertence a esta empresa.",
  cliente_com_agendamentos: "Cadastro não removido: há agendamentos ligados a ele e o histórico foi preservado.",
  cliente_com_historico:
    "Cadastro não removido: existe conversa, lead ou orçamento ligado a ele. Ele segue arquivado, fora do painel.",
  cliente_com_dados:
    "Cadastro não removido: o outro registro desse WhatsApp possui dados diferentes. Revise os cadastros antes de unificar.",
};

function activityLabel(date: Date) {
  const now = Date.now();
  const elapsed = Math.max(0, now - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days}d`;
  return date.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "short",
  });
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; editar?: string; arquivados?: string }>;
}) {
  const { tenant, ctx } = await requireTenant();
  const sp = await searchParams;
  const showArchived = sp.arquivados === "1";
  // A contagem da aba precisa do outro lado da lista, então busca os dois.
  const [directory, archivedDirectory] = await Promise.all([
    services.customerService.directory(tenant.id, { archived: showArchived }),
    services.customerService.directory(tenant.id, { archived: true }),
  ]);
  const role = currentRole(ctx);
  const canRemove = role === "OWNER" || role === "ADMIN";

  const items: CustomerDirectoryItem[] = directory.map((item) => ({
    key: item.key,
    kind: item.kind,
    customerId: item.customerId,
    conversationId: item.conversationId,
    leadId: item.leadId,
    name: item.name,
    phone: item.phone,
    email: item.email,
    neighborhood: item.neighborhood,
    address: item.address,
    imageConsent: item.imageConsent,
    appointmentCount: item.appointmentCount,
    duplicateCount: item.duplicateCount,
    source: item.source,
    stage: item.stage,
    leadStatus: item.leadStatus,
    lastActivityLabel: activityLabel(item.lastActivityAt),
    archived: item.archived,
  }));

  const validEditId = directory.some(
    (item) => item.kind === "CUSTOMER" && item.customerId === sp.editar,
  );
  const createError = sp.erro === "validacao" || sp.erro === "duplicado" ? sp.erro : undefined;
  const pageError =
    sp.erro && !(sp.erro === "edicao" && validEditId) ? ERRORS[sp.erro] : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[var(--color-primary)]">
            <UsersRound className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">Clientes</h1>
            <p className="text-sm text-[var(--color-muted)]">
              {showArchived
                ? "Arquivados: fora do painel, mas com todo o histórico preservado."
                : "Cadastros, leads e novos contatos do WhatsApp em um só lugar."}
            </p>
          </div>
        </div>
        {!showArchived && <NewCustomerDialog errorCode={createError} />}
      </header>

      {sp.ok && OKS[sp.ok] && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
        >
          {OKS[sp.ok]}
        </p>
      )}
      {pageError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {pageError}
        </p>
      )}

      <CustomersDirectory
        items={items}
        canRemove={canRemove}
        showArchived={showArchived}
        archivedCount={archivedDirectory.length}
        initialEditId={validEditId ? sp.editar : undefined}
        editHasError={sp.erro === "edicao"}
      />
    </div>
  );
}
