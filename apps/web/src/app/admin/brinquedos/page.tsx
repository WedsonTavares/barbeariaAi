import { requireTenant } from "@/lib/tenant";
import { services } from "@diny/core";
import { brl } from "@/lib/format";
import { TOY_CATEGORY, TOY_STATUS, label } from "@/lib/labels";
import { createToy, setToyStatus, uploadToyPhoto, removeToy } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = ["INFLAVEL", "PISCINA_BOLINHAS", "CAMA_ELASTICA", "ESCORREGADOR", "MESA_CADEIRA", "OUTRO"];
const STATUSES = ["AVAILABLE", "RENTED", "MAINTENANCE", "RETIRED"];

const ERROS: Record<string, string> = {
  validacao: "Confira os campos: dados inválidos ou incompletos.",
  foto: "Foto não enviada: use JPG/PNG/WebP até 4MB (e confirme o bucket \"toys\" no Supabase).",
};
const OKS: Record<string, string> = {
  1: "Brinquedo adicionado! Já está disponível para a IA.",
  foto: "Foto atualizada! Já aparece no site.",
  removido: "Brinquedo removido do catálogo.",
  aposentado: "Brinquedo aposentado (tinha reservas no histórico, então não foi apagado). Já saiu do site e da IA.",
};

const fmtDay = (d: Date | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }) : "—";
const fmtDayTime = (d: Date | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/** Situação real do brinquedo: cadastro + ocupação. É o que vira a cor da linha. */
function situacao(t: { status: string; busyNow: boolean; busyUntil: Date | null; upcoming: number }) {
  if (t.status === "RETIRED") return { txt: "Aposentado", chip: "bg-slate-200 text-slate-600", bar: "#94A3B8", ia: false };
  if (t.status === "MAINTENANCE") return { txt: "Em manutenção", chip: "bg-orange-100 text-orange-800", bar: "#F97316", ia: false };
  if (t.busyNow) return { txt: `Ocupado até ${fmtDayTime(t.busyUntil)}`, chip: "bg-red-100 text-red-700", bar: "#EF4444", ia: true };
  if (t.upcoming > 0) return { txt: `Livre · ${t.upcoming} agendada${t.upcoming > 1 ? "s" : ""}`, chip: "bg-amber-100 text-amber-800", bar: "#FBBF24", ia: true };
  return { txt: "Livre", chip: "bg-green-100 text-green-800", bar: "#16A34A", ia: true };
}

export default async function BrinquedosPage({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { tenant } = await requireTenant();
  const sp = await searchParams;
  const toys = await services.toyService.listWithAvailability(tenant.id);

  const noCatalogo = toys.filter((t) => t.status !== "RETIRED" && t.status !== "MAINTENANCE").length;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold">Brinquedos</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          {noCatalogo} no catálogo da IA. Ocupação é <b>por data</b>: um brinquedo reservado num dia continua livre nos outros.
        </p>

        {sp?.erro && ERROS[sp.erro] && <p role="alert" className="mt-3 rounded-lg bg-red-100 p-3 text-sm text-red-700">{ERROS[sp.erro]}</p>}
        {sp?.ok && OKS[sp.ok] && <p role="status" className="mt-3 rounded-lg bg-green-100 p-3 text-sm text-green-700">{OKS[sp.ok]}</p>}

        <div className="mt-4 space-y-2">
          {toys.map((t) => {
            const s = situacao(t);
            return (
              <article
                key={t.id}
                style={{ borderLeftColor: s.bar }}
                className={`rounded-2xl border border-black/5 border-l-4 bg-white p-3 ${t.status === "RETIRED" ? "opacity-60" : ""}`}
              >
                <div className="flex flex-wrap items-start gap-3">
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt={t.name} className="size-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-[var(--color-surface)] text-xl" aria-hidden>🎈</span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold">{t.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.chip}`}>{s.txt}</span>
                      {!s.ia && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">fora da IA</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {label(TOY_CATEGORY, t.category)} · {brl(t.defaultRentPrice)}
                    </div>
                    {t.nextBooking && (
                      <div className="mt-1 text-xs text-[var(--color-muted)]">
                        Próxima: <b>{t.nextBooking.customerName}</b> em {fmtDay(t.nextBooking.eventDate)}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1">
                    <form action={setToyStatus} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={t.id} />
                      <select name="status" defaultValue={t.status} aria-label={`Status de ${t.name}`} className="rounded-lg border border-black/10 px-2 py-1 text-xs">
                        {STATUSES.map((st) => <option key={st} value={st}>{label(TOY_STATUS, st)}</option>)}
                      </select>
                      <button className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-xs font-semibold hover:bg-black/10">OK</button>
                    </form>
                    <form action={removeToy}>
                      <input type="hidden" name="id" value={t.id} />
                      <button
                        aria-label={`Remover ${t.name}`}
                        className="rounded-full border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </form>
                  </div>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-[var(--color-muted)]">Trocar foto</summary>
                  <form action={uploadToyPhoto} className="mt-1 flex items-center gap-1">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required aria-label={`Foto de ${t.name}`} className="text-[11px]" />
                    <button className="rounded-full bg-[var(--color-surface)] px-2 py-1 text-[11px] font-semibold hover:bg-black/10">Subir</button>
                  </form>
                </details>
              </article>
            );
          })}
          {toys.length === 0 && (
            <p className="rounded-2xl border border-dashed border-black/10 p-8 text-center text-[var(--color-muted)]">
              Nenhum brinquedo ainda. Cadastre o primeiro ao lado — a IA já passa a oferecê-lo.
            </p>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--color-muted)]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-600" /> Livre</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Livre hoje, com festas marcadas</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Ocupado agora</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" /> Manutenção</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Aposentado</span>
        </div>
      </div>

      <form action={createToy} className="h-fit space-y-3 rounded-2xl border border-black/5 bg-white p-5">
        <h2 className="font-bold">Novo brinquedo</h2>
        <p className="text-xs text-[var(--color-muted)]">Assim que salvar, a IA já pode oferecer no WhatsApp.</p>
        <input name="name" placeholder="Nome" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <select name="category" className="w-full rounded-lg border border-black/10 px-3 py-2">
          {CATEGORIES.map((c) => <option key={c} value={c}>{label(TOY_CATEGORY, c)}</option>)}
        </select>
        <input name="purchasePrice" type="number" step="0.01" placeholder="Valor de compra" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <input name="defaultRentPrice" type="number" step="0.01" placeholder="Valor de aluguel" required className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <textarea name="description" placeholder="Descrição" className="w-full rounded-lg border border-black/10 px-3 py-2" />
        <button className="w-full rounded-full bg-[var(--color-primary)] px-4 py-2 font-semibold text-white">Adicionar</button>
      </form>
    </div>
  );
}
