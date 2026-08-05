import { Images } from "lucide-react";

import { services } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { GaleriaBoard, type PhotoCard } from "./GaleriaBoard";

export const dynamic = "force-dynamic";

const ERROS: Record<string, string> = {
  validacao: "Não foi possível concluir. Recarregue a página e tente de novo.",
  foto_arquivo: "Escolha uma imagem válida.",
  foto_tipo: "Formato não aceito. Use JPG, PNG ou WebP.",
  foto_tamanho: "A imagem deve ter no máximo 4 MB.",
  foto_config: "O envio de fotos não está configurado neste ambiente.",
  foto_storage: "O armazenamento não concluiu o envio. Tente novamente.",
};

const OKS: Record<string, string> = {
  foto: "Foto publicada na galeria do site.",
  legenda: "Legenda atualizada.",
  ordem: "Ordem atualizada.",
  removida: "Foto removida da galeria.",
};

export default async function GaleriaPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const fotos = await services.eventPhotoService.list(tenant.id);

  const cards: PhotoCard[] = fotos.map((foto) => ({
    id: foto.id,
    imageUrl: foto.imageUrl,
    caption: foto.caption ?? "",
  }));

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-5">
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-violet-50 text-violet-600">
          <Images className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Galeria de eventos</h1>
          <p className="text-sm text-[var(--color-muted)]">
            As fotos aparecem no site na ordem definida aqui. Os arquivos ficam no armazenamento, fora do banco.
          </p>
        </div>
      </header>

      {sp.ok && OKS[sp.ok] && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700"
        >
          {OKS[sp.ok]}
        </p>
      )}
      {sp.erro && ERROS[sp.erro] && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          {ERROS[sp.erro]}
        </p>
      )}

      <GaleriaBoard fotos={cards} />
    </div>
  );
}
