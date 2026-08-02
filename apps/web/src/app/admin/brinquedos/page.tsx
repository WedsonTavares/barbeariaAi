import { PackageCheck } from "lucide-react";

import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { TOY_CATEGORY, label } from "@/lib/labels";
import { NewToyDialog } from "./NewToyDialog";
import { ToysCatalog, type ToyCardData } from "./ToysCatalog";

export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  foto: "Não foi possível enviar a foto. Tente novamente.",
  foto_arquivo: "Escolha uma imagem válida para o brinquedo.",
  foto_tipo: "Formato não aceito. Use JPG, PNG ou WebP.",
  foto_tamanho: "A imagem deve ter no máximo 4 MB.",
  foto_config: "O envio de fotos não está configurado neste ambiente.",
  foto_storage: "O armazenamento não concluiu o envio. Tente novamente.",
};

const OKS: Record<string, string> = {
  1: "Brinquedo adicionado e disponível para a IA.",
  editado: "Brinquedo atualizado no catálogo, no site e na IA.",
  foto: "Foto atualizada e disponível no site.",
  removido: "Brinquedo removido do catálogo.",
  aposentado: "O brinquedo tinha histórico: saiu do catálogo, mas as reservas foram preservadas.",
};

const fmtDay = (date: Date | null) =>
  date
    ? new Date(date).toLocaleDateString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "short",
      })
    : "—";

const fmtDayTime = (date: Date | null) =>
  date
    ? new Date(date).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Situação real do brinquedo: cadastro + ocupação. É o que vira a cor do card. */
function situation(toy: { status: string; busyNow: boolean; busyUntil: Date | null; upcoming: number }) {
  if (toy.status === "RETIRED") {
    return {
      text: "Aposentado",
      chipClass: "bg-slate-100 text-slate-600",
      bar: "#94A3B8",
      inAiCatalog: false,
    };
  }
  if (toy.status === "MAINTENANCE") {
    return {
      text: "Em manutenção",
      chipClass: "bg-orange-100 text-orange-800",
      bar: "#F97316",
      inAiCatalog: false,
    };
  }
  if (toy.busyNow) {
    return {
      text: `Ocupado até ${fmtDayTime(toy.busyUntil)}`,
      chipClass: "bg-red-100 text-red-700",
      bar: "#EF4444",
      inAiCatalog: true,
    };
  }
  if (toy.upcoming > 0) {
    return {
      text: `Livre · ${toy.upcoming} agendada${toy.upcoming > 1 ? "s" : ""}`,
      chipClass: "bg-amber-100 text-amber-800",
      bar: "#FBBF24",
      inAiCatalog: true,
    };
  }
  return {
    text: "Livre",
    chipClass: "bg-green-100 text-green-800",
    bar: "#16A34A",
    inAiCatalog: true,
  };
}

export default async function BrinquedosPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string; foto?: string; editar?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const toys = await services.toyService.listWithAvailability(tenant.id);

  const cardToys: ToyCardData[] = toys.map((toy) => ({
    id: toy.id,
    name: toy.name,
    category: toy.category,
    categoryLabel: label(TOY_CATEGORY, toy.category),
    status: toy.status,
    description: toy.description,
    priceLabel: brl(toy.defaultRentPrice),
    purchasePrice: Number(toy.purchasePrice),
    defaultRentPrice: Number(toy.defaultRentPrice),
    imageUrl: toy.imageUrl,
    busyNow: toy.busyNow,
    upcoming: toy.upcoming,
    nextBooking: toy.nextBooking
      ? {
          customerName: toy.nextBooking.customerName,
          eventDateLabel: fmtDay(toy.nextBooking.eventDate),
        }
      : null,
    situation: situation(toy),
  }));

  const photoError = sp.erro?.startsWith("foto") ? sp.erro : undefined;
  const unboundPhotoError = photoError && (!sp.foto || !cardToys.some((toy) => toy.id === sp.foto));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600">
            <PackageCheck className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold">Brinquedos</h1>
            <p className="text-sm text-[var(--color-muted)]">
              Ocupação por data: uma reserva não bloqueia os outros dias.
            </p>
          </div>
        </div>
        {/* `erro=validacao` também volta da edição — nesse caso vem com `editar`
            e quem reabre é o diálogo de edição, não o de cadastro. */}
        <NewToyDialog initialOpen={sp.erro === "validacao" && !sp.editar} />
      </header>

      {sp.ok && OKS[sp.ok] && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
        >
          {OKS[sp.ok]}
        </p>
      )}
      {unboundPhotoError && ERROS[photoError] && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {ERROS[photoError]}
        </p>
      )}

      <ToysCatalog
        toys={cardToys}
        photoErrorCode={photoError}
        photoErrorToyId={sp.foto}
        editErrorToyId={sp.editar}
      />

      <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-2xl border border-black/5 bg-white px-4 py-3 text-[11px] text-[var(--color-muted)] shadow-sm">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-green-600" /> Livre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-amber-400" /> Com festas marcadas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-red-500" /> Ocupado agora
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-orange-500" /> Manutenção
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-400" /> Fora do catálogo
        </span>
      </div>
    </div>
  );
}
