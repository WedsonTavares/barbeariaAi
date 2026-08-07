import { Building2, CalendarDays, MessageCircle } from "lucide-react";

import { requireTenant } from "@/lib/tenant";
import { services, parseBusinessHours } from "@barbearia-ai/core";
import { getConnectionState, evolutionConfigured } from "@/lib/evolution";
import { WhatsappConnect } from "./WhatsappConnect";
import { SettingsSection, Field, TextArea, ColorField } from "./SettingsSection";
import { disconnectGoogleCalendarAction } from "./actions";

export const dynamic = "force-dynamic";

const DIAS = [
  { v: 0, label: "Dom" },
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
];

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; msg?: string; calendar?: string }>;
}) {
  const sp = await searchParams;
  const { tenant } = await requireTenant();
  const [settings, instance, calendarConnections, professionals] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.tenantService.evolutionInstance(tenant.id, tenant.slug),
    services.calendarService.listGoogleConnections(tenant.id),
    services.professionalService.active(tenant.id),
  ]);
  const googleConfig = services.calendarService.googleConfigStatus();
  const googleReady = googleConfig.clientId && googleConfig.clientSecret && googleConfig.redirectUri && googleConfig.tokenKey;
  const configured = evolutionConfigured();
  const state = configured ? await getConnectionState(instance) : "unknown";
  // Mesma leitura que a API de disponibilidade usa — evita a tela mostrar um
  // valor e a agenda respeitar outro.
  const hours = parseBusinessHours(settings?.businessHours);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
      <header className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600">
          <Building2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold">Configurações</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Dados da sua empresa. O agente de IA e o site público leem daqui.
          </p>
        </div>
      </header>

      {sp.ok === "salvo" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Configurações salvas.
        </p>
      )}
      {sp.erro && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700">
          Não salvou{sp.erro ? ` — campo “${sp.erro}”` : ""}: {sp.msg || "confira os dados."}
        </p>
      )}
      {sp.calendar === "connected" && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700">
          Google Calendar conectado.
        </p>
      )}
      {sp.calendar && sp.calendar !== "connected" && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800">
          Google Calendar não conectado: verifique as variáveis de ambiente e tente novamente.
        </p>
      )}

      {/* ─────────── Empresa ─────────── */}
      <SettingsSection
        id="empresa"
        title="Empresa"
        description="Aparece no site, nas mensagens da IA e nos seus documentos."
      >
        <Field name="name" label="Nome da empresa" defaultValue={tenant.name} placeholder="Barbearia Central" />
        <Field name="email" label="E-mail" type="email" defaultValue={settings?.email} placeholder="contato@suaempresa.com.br" />
        <Field name="legalName" label="Razão social" defaultValue={settings?.legalName} placeholder="Nome jurídico completo" />
        <Field name="cnpj" label="CNPJ" defaultValue={settings?.cnpj} placeholder="00.000.000/0000-00" />
        <Field
          name="whatsappMain"
          label="WhatsApp principal"
          hint="Número que aparece no site para o cliente chamar."
          defaultValue={settings?.whatsappMain}
          placeholder="5516999999999"
        />
        <Field
          name="whatsappAlerts"
          label="WhatsApp de avisos"
          hint="Recebe alertas internos. Pode ser o seu número pessoal."
          defaultValue={settings?.whatsappAlerts}
          placeholder="5516999999999"
        />
        <Field
          name="logoUrl"
          label="Logo (URL)"
          hint="Aparece no topo, no destaque e no rodapé do site. Sem logo, entra um ícone genérico."
          defaultValue={settings?.logoUrl}
          placeholder="/logo.png"
        />
      </SettingsSection>

      {/* ─────────── Atendimento ─────────── */}
      <SettingsSection
        id="atendimento"
        title="Área de atendimento"
        description="A IA usa isto para responder onde a empresa atende."
      >
        <Field name="city" label="Cidade" defaultValue={settings?.city} placeholder="Ribeirão Preto" />
        <Field
          name="serviceRadiusKm"
          label="Raio de atendimento (km)"
          type="number"
          min="0"
          defaultValue={settings?.serviceRadiusKm}
          placeholder="20"
        />
        <Field
          name="baseAddress"
          label="Endereço base"
          hint="Endereço principal do atendimento. Não aparece no site se você não divulgar."
          wide
          defaultValue={settings?.baseAddress}
          placeholder="Rua Exemplo, 123 — Bairro"
        />

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">Expediente</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="businessHoursStart"
              type="time"
              defaultValue={hours.start}
              aria-label="Abre às"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
            <span className="text-sm text-[var(--color-muted)]">até</span>
            <input
              name="businessHoursEnd"
              type="time"
              defaultValue={hours.end}
              aria-label="Fecha às"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DIAS.map((d) => (
              <label
                key={d.v}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border border-black/10 px-2.5 py-1 text-xs font-semibold hover:bg-[var(--color-surface)]"
              >
                <input
                  type="checkbox"
                  name="days"
                  value={d.v}
                  defaultChecked={hours.days.includes(d.v)}
                  className="size-3.5 accent-[var(--color-primary)]"
                />
                {d.label}
              </label>
            ))}
          </div>
          <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
            Quando a equipe responde. Fora disso o painel marca o contato como fora do expediente.
          </span>
        </div>

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
            Janela de agenda
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="serviceWindowStart"
              type="time"
              defaultValue={hours.serviceStart}
              aria-label="Agenda a partir das"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
            <span className="text-sm text-[var(--color-muted)]">até</span>
            <input
              name="serviceWindowEnd"
              type="time"
              defaultValue={hours.serviceEnd}
              aria-label="Agenda até as"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
            A IA só oferece horários dentro dessa faixa. É diferente do expediente de resposta.
          </span>
        </div>
      </SettingsSection>

      {/* ─────────── Regras de agenda ─────────── */}
      <SettingsSection
        id="agenda"
        title="Regras de agenda"
        description="A IA respeita estes valores ao consultar horários e fechar agendamentos."
      >
        <Field
          name="defaultSlotMinutes"
          label="Intervalo padrão (min)"
          type="number"
          min="5"
          max="240"
          defaultValue={settings?.defaultSlotMinutes}
          placeholder="30"
        />
        <Field
          name="minAppointmentLeadMinutes"
          label="Antecedência mínima (min)"
          type="number"
          min="0"
          max="10080"
          defaultValue={settings?.minAppointmentLeadMinutes}
          placeholder="60"
        />
        <TextArea
          name="cancellationPolicy"
          label="Política de cancelamento"
          hint="Em linguagem simples: a IA repete isto para o cliente."
          defaultValue={settings?.cancellationPolicy}
          placeholder="Cancelamentos com até 24h de antecedência podem ser remarcados."
        />
      </SettingsSection>

      {/* ─────────── Site público ─────────── */}
      <SettingsSection
        id="site"
        title="Site público"
        description="Textos e cores da sua página de divulgação."
      >
        <Field name="headline" label="Título principal" wide defaultValue={settings?.headline} placeholder="Diversão sem dor de cabeça" />
        <Field name="subheadline" label="Subtítulo" wide defaultValue={settings?.subheadline} placeholder="Agende cabelo, barba e estética pelo WhatsApp." />
        <Field name="ctaText" label="Texto do botão" defaultValue={settings?.ctaText} placeholder="Agendar no WhatsApp" />
        <div className="hidden sm:block" />
        <ColorField name="colorPrimary" label="Cor principal" defaultValue={settings?.colorPrimary ?? "#2563EB"} />
        <ColorField name="colorSecondary" label="Cor secundária" defaultValue={settings?.colorSecondary ?? "#FBBF24"} />
        <ColorField name="colorAccent" label="Cor de destaque" defaultValue={settings?.colorAccent ?? "#7C3AED"} />
      </SettingsSection>

      {/* ─────────── Pós-atendimento ─────────── */}
      <SettingsSection
        id="pos-atendimento"
        title="Pós-atendimento"
        description="Ao mover uma conversa pra coluna 'Pós-atendimento' no Funil, esta mensagem é enviada automaticamente."
      >
        <TextArea
          name="postServiceMessage"
          label="Mensagem automática"
          hint="Pergunte a nota de 0 a 10. Se deixar em branco, usamos um texto padrão."
          defaultValue={settings?.postServiceMessage}
          placeholder="Oi! Como foi seu atendimento? De 0 a 10, qual nota você daria pra experiência?"
        />
        <Field
          name="reviewLink"
          label="Link de avaliação"
          wide
          hint="Google, Instagram... A IA só oferece este link pra quem der nota 8 ou mais."
          defaultValue={settings?.reviewLink}
          placeholder="https://g.page/r/..."
        />
      </SettingsSection>

      {/* ─────────── Redes ─────────── */}
      <SettingsSection
        id="redes"
        title="Redes e localização"
        description="Links exibidos no rodapé do site."
      >
        <Field name="instagram" label="Instagram" defaultValue={settings?.instagram} placeholder="https://instagram.com/suaempresa" />
        <Field name="facebook" label="Facebook" defaultValue={settings?.facebook} placeholder="https://facebook.com/suaempresa" />
        <Field name="googleMaps" label="Google Maps" wide defaultValue={settings?.googleMaps} placeholder="Link do seu perfil no Google Maps" />
      </SettingsSection>

      {/* ─────────── Google Calendar ─────────── */}
      <section id="google-calendar" className="scroll-mt-20 rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 font-extrabold">
            <CalendarDays className="size-4 text-[var(--color-primary)]" aria-hidden />
            Google Calendar
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Conecte a agenda do Google para sincronizar horários e preparar push notifications.
          </p>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 rounded-xl bg-[var(--color-surface)] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-bold">{googleReady ? "OAuth configurado" : "OAuth pendente"}</div>
              <p className="text-xs text-[var(--color-muted)]">
                {googleReady
                  ? "A conta pode ser conectada por aqui."
                  : "Defina GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI e CALENDAR_TOKEN_ENCRYPTION_KEY."}
              </p>
            </div>
            {/* Formulário GET: o profissional escolhido viaja como querystring
                pro /connect, que valida o id antes de assiná-lo no state. */}
            <form action="/admin/configuracoes/google-calendar/connect" method="get" className="flex shrink-0 gap-2">
              {professionals.length > 0 && (
                <select
                  name="professionalId"
                  defaultValue=""
                  aria-label="Agenda de qual profissional"
                  disabled={!googleReady}
                  className="rounded-full border border-black/10 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Agenda da casa</option>
                  {professionals.map((professional) => (
                    <option key={professional.id} value={professional.id}>{professional.name}</option>
                  ))}
                </select>
              )}
              <button
                disabled={!googleReady}
                className={`rounded-full px-4 py-2 text-sm font-bold ${
                  googleReady ? "bg-[var(--color-primary)] text-white" : "cursor-not-allowed bg-slate-200 text-slate-500"
                }`}
              >
                Conectar Google
              </button>
            </form>
          </div>

          {calendarConnections.length === 0 ? (
            <p className="rounded-xl border border-dashed border-black/10 p-3 text-sm text-[var(--color-muted)]">
              Nenhuma conta conectada.
            </p>
          ) : (
            <div className="space-y-2">
              {calendarConnections.map((connection) => (
                <div key={connection.id} className="flex flex-col gap-2 rounded-xl border border-black/5 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{connection.googleAccountEmail ?? "Conta Google"}</div>
                    <div className="text-xs text-[var(--color-muted)]">
                      {connection.professional?.name ?? "Agenda da casa"} · calendário{" "}
                      {connection.calendarId ?? "primary"} · {connection.status}
                    </div>
                  </div>
                  <form action={disconnectGoogleCalendarAction}>
                    <input type="hidden" name="id" value={connection.id} />
                    <button className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-surface)]">
                      Desconectar
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-[var(--color-muted)]">
            Para sincronização ao vivo em produção, configure também GOOGLE_CALENDAR_WEBHOOK_URL apontando para /api/calendar/google/webhook.
          </p>
        </div>
      </section>

      {/* ─────────── WhatsApp ─────────── */}
      <section id="whatsapp" className="scroll-mt-20 rounded-2xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 font-extrabold">
            <MessageCircle className="size-4 text-[#25D366]" aria-hidden />
            WhatsApp
          </h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Conecte o número do negócio para o agente de IA atender. Pode reconectar aqui sempre que precisar.
          </p>
        </div>
        <div className="p-4 sm:p-5">
          <WhatsappConnect initialState={state} />
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            Use o número dedicado ao atendimento — ao conectar, ele passa a ser gerenciado pela automação.
            Esta conexão é exclusiva da sua empresa: nenhuma outra enxerga nem desconecta este número.
          </p>
        </div>
      </section>

      <p className="px-1 pb-2 text-[11px] text-[var(--color-muted)]">
        Endereço público da sua empresa: <b>{tenant.slug}</b>
      </p>
    </div>
  );
}
