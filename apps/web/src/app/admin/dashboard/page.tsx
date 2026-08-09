import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { services } from "@barbearia-ai/core";
import type { OverviewTrend } from "@barbearia-ai/core";
import { brl, fmtDateTime } from "@/lib/format";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MovimentoChart } from "./MovimentoChart";
import {
  ArrowRight,
  Bot,
  CalendarCheck,
  ChevronRight,
  Clock3,
  MessagesSquare,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Scissors,
} from "lucide-react";

export const dynamic = "force-dynamic";

const pct = (n: number | null, digits = 0) =>
  n === null
    ? "—"
    : `${n.toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;

function Delta({
  trend,
  periodDays,
}: {
  trend: OverviewTrend;
  periodDays: number;
}) {
  if (trend.changePct === null) {
    return (
      <span className="text-xs text-[var(--color-muted)]">
        {trend.previous === 0 && trend.current > 0
          ? "Novo neste período"
          : `Sem registros nos últimos ${periodDays} dias`}
      </span>
    );
  }
  const up = trend.changePct >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`flex items-center gap-1 text-xs font-semibold ${up ? "text-emerald-600" : "text-rose-600"}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? "+" : ""}
      {pct(trend.changePct, 1)}
      <span className="font-normal text-[var(--color-muted)]">
        vs. {periodDays}d anteriores
      </span>
    </span>
  );
}

function Tile({
  label,
  value,
  hint,
  icon: Icon,
  tint,
  children,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-black/5 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--color-muted)]">{label}</div>
          <div className="mt-0.5 text-2xl font-extrabold tabular-nums">
            {value}
          </div>
        </div>
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${tint}`}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-auto pt-2.5">
        {children}
        {hint && (
          <div className="mt-1 text-xs text-[var(--color-muted)]">{hint}</div>
        )}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  href,
  linkLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="h-full rounded-lg border border-black/5 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {subtitle}
            </p>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="flex shrink-0 items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            {linkLabel ?? "Ver"} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Linha "métrica: valor" do painel da IA. */
function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-black/5 py-1.5 first:border-t-0 first:pt-0">
      <span className="text-xs text-[var(--color-muted)]">
        {label}
        {hint && <span className="block text-[11px]">{hint}</span>}
      </span>
      <span className="shrink-0 font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** Item acionável: só aparece com contagem > 0 — lista vazia é boa notícia. */
function Acao({
  icon: Icon,
  label,
  count,
  href,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  href: string;
  tint: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 border-b border-black/5 py-2.5 last:border-b-0 hover:bg-[var(--color-surface)]"
    >
      <span
        className={`grid size-8 shrink-0 place-items-center rounded-lg ${tint}`}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-semibold">{label}</span>
      <span className="text-lg font-extrabold tabular-nums">{count}</span>
      <ChevronRight
        className="size-4 shrink-0 text-[var(--color-muted)]"
        aria-hidden
      />
    </Link>
  );
}

export default async function VisaoGeralPage() {
  const { tenant } = await requireTenant();
  const [o, s, m, funil, fora] = await Promise.all([
    services.overviewService.summary(tenant.id),
    services.financeService.dashboard(tenant.id),
    services.financeService.monthSummary(tenant.id),
    // A contagem do funil sai do MESMO board que a tela mostra. Antes vinha da
    // tabela Lead, que nenhuma tela exibe: o card dizia 0 enquanto o funil
    // tinha conversas, e o número nunca batia com o destino do link.
    services.conversationService.board(tenant.id),
    // Conta própria, contra a janela de montagem — ver o Tile "Fechados fora
    // do horário". Fica de fora do `summary` de propósito: é outra régua.
    services.overviewService.foraDaJanelaDeTrabalho(tenant.id),
  ]);

  const emNegociacao = funil.IA_ATENDENDO.length + funil.SUPORTE_HUMANO.length;
  const acoes = [
    {
      key: "conversas",
      icon: MessagesSquare,
      label: "Conversas esperando resposta",
      count: o.ai.waiting,
      href: "/admin/conversas",
      tint: "bg-rose-50 text-rose-600",
    },
    {
      key: "pagamentos",
      icon: CalendarCheck,
      label: "Agendamentos com pagamento pendente",
      count: s.pagamentosPendentes,
      href: "/admin/agenda",
      tint: "bg-amber-50 text-amber-600",
    },
    {
      key: "leads",
      icon: UserPlus,
      label: "Conversas em negociação no funil",
      count: emNegociacao,
      href: "/admin/funil",
      tint: "bg-sky-50 text-sky-600",
    },
    {
      key: "profissionais",
      icon: Scissors,
      label: "Cadastre profissionais para atender",
      count: s.profissionaisAtivos === 0 ? 1 : 0,
      href: "/admin/profissionais",
      tint: "bg-violet-50 text-violet-600",
    },
  ].filter((a) => a.count > 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <AutoRefresh seconds={60} />

      <header className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-xl font-extrabold">Visão Geral</h1>
        <p className="text-xs font-medium text-[var(--color-muted)]">Resumo dos últimos {o.periodDays} dias</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Agendamentos no mês"
          value={m.appointmentsNoMes}
          hint="Marcados no mês atual"
          icon={CalendarCheck}
          tint="bg-blue-50 text-blue-600"
        >
          <span className="text-xs font-semibold text-[var(--color-muted)]">
            {s.appointmentsHoje} para hoje
          </span>
        </Tile>
        <Tile
          label="Atendimentos hoje"
          value={s.appointmentsHoje}
          hint="Agenda operacional do dia"
          icon={Clock3}
          tint="bg-violet-50 text-violet-600"
        >
          <span className="text-xs font-semibold text-[var(--color-muted)]">
            {s.proximosAtendimentos.length} nas próximas 48h
          </span>
        </Tile>
        <Tile
          label="Novos contatos"
          value={o.contacts.current}
          hint={
            // O formulário de orçamento saiu do site: hoje a tabela Lead só
            // recebe o que a IA registra pela tool de lead.
            o.leads.current > 0
              ? `conversas novas no WhatsApp · ${o.leads.current} registrado${o.leads.current === 1 ? "" : "s"} como lead pela IA`
              : "conversas novas no WhatsApp"
          }
          icon={UserPlus}
          tint="bg-amber-50 text-amber-600"
        >
          <Delta trend={o.contacts} periodDays={o.periodDays} />
        </Tile>
        <Tile
          label="Fechados pela IA"
          value={o.ai.appointments.current}
          hint={`${pct(o.ai.sharePct)} dos agendamentos · ${brl(o.ai.revenue)}`}
          icon={Bot}
          tint="bg-emerald-50 text-emerald-600"
        >
          <Delta trend={o.ai.appointments} periodDays={o.periodDays} />
        </Tile>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          title="Movimento"
          subtitle="Novos contatos e agendamentos por dia (últimos 14 dias)"
        >
          <MovimentoChart days={o.daily} />
        </Card>

        <Card
          title="Efetividade da IA"
          subtitle={`Nos últimos ${o.periodDays} dias`}
          href="/admin/conversas"
          linkLabel="Conversas"
        >
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">
                Conversas que viraram agendamento
              </span>
              <span className="text-xl font-extrabold tabular-nums">
                {pct(o.ai.conversionPct, 1)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--color-surface)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${Math.min(100, o.ai.conversionPct ?? 0)}%` }}
                aria-hidden
              />
            </div>
            <p className="mt-1.5 text-xs text-[var(--color-muted)]">
              {o.ai.appointments.current} agendamento
              {o.ai.appointments.current === 1 ? "" : "s"} em {o.ai.attended}{" "}
              conversa
              {o.ai.attended === 1 ? "" : "s"} atendidas
            </p>
          </div>

          <div className="mt-3">
            <Stat
              label="Conversas atendidas pela IA"
              value={String(o.ai.attended)}
            />
            <Stat
              label="Resolvidas sem humano"
              value={pct(o.ai.autonomyPct)}
              hint={`${o.ai.escalated} passaram para a equipe`}
            />
            <Stat label="Receita fechada pela IA" value={brl(o.ai.revenue)} />
            <Stat
              label="Fechados fora do horário"
              value={`${fora.atual} · ${brl(fora.receita)}`}
              hint={`Fora de ${fora.janela.inicio}–${fora.janela.fim}`}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Card
          title="Próximas 48 horas"
          subtitle="Atendimentos confirmados"
          href="/admin/agenda"
          linkLabel="Agenda"
        >
          {s.proximosAtendimentos.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Nada nas próximas 48h.
            </p>
          ) : (
            <ul className="max-h-64 divide-y divide-black/5 overflow-y-auto">
              {s.proximosAtendimentos.map((appointment) => (
                <li key={appointment.id}>
                  <Link
                    href="/admin/agenda"
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-[var(--color-surface)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {appointment.customer.name}
                      </span>
                      <span className="block truncate text-xs text-[var(--color-muted)]">
                        {appointment.professional?.name ?? "Sem profissional"} ·{" "}
                        {appointment.services
                          .map((item) => item.serviceNameSnapshot)
                          .join(", ") || "Serviço"}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">
                        {fmtDateTime(appointment.startAt)}
                      </span>
                      <span className="block text-xs text-[var(--color-muted)]">
                        {brl(appointment.total)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Precisa de você"
          subtitle="O que está parado esperando uma ação"
        >
          {acoes.length === 0 ? (
            <p className="text-sm text-[var(--color-muted)]">
              Nada pendente. Tudo em dia.
            </p>
          ) : (
            <div>
              {acoes.map(({ key, ...a }) => (
                <Acao key={key} {...a} />
              ))}
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
