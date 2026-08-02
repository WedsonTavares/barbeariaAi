import { Building2, MessageCircle } from "lucide-react";

import { requireTenant } from "@/lib/tenant";
import { services, parseBusinessHours } from "@diny/core";
import { getConnectionState, evolutionConfigured } from "@/lib/evolution";
import { WhatsappConnect } from "./WhatsappConnect";
import { SettingsSection, Field, TextArea, ColorField } from "./SettingsSection";

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
  searchParams: Promise<{ ok?: string; erro?: string; msg?: string }>;
}) {
  const sp = await searchParams;
  const { tenant } = await requireTenant();
  const [settings, instance] = await Promise.all([
    services.tenantService.getSettings(tenant.id),
    services.tenantService.evolutionInstance(tenant.id, tenant.slug),
  ]);
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

      {/* ─────────── Empresa ─────────── */}
      <SettingsSection
        id="empresa"
        title="Empresa"
        description="Aparece no site, nas mensagens da IA e nos seus documentos."
      >
        <Field name="name" label="Nome da empresa" defaultValue={tenant.name} placeholder="Diny Play" />
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
      </SettingsSection>

      {/* ─────────── Atendimento ─────────── */}
      <SettingsSection
        id="atendimento"
        title="Área de atendimento"
        description="A IA usa isto para dizer se você entrega no bairro do cliente e quanto custa."
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
          hint="De onde saem as entregas. Não aparece no site."
          wide
          defaultValue={settings?.baseAddress}
          placeholder="Rua Exemplo, 123 — Bairro"
        />
        <Field
          name="deliveryFee"
          label="Taxa de entrega (R$)"
          type="number"
          step="0.01"
          min="0"
          defaultValue={settings?.deliveryFee != null ? Number(settings.deliveryFee) : null}
          placeholder="0,00"
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
            Quando vocês atendem. Fora disso o painel marca o contato como fora do expediente.
          </span>
        </div>

        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-xs font-bold text-[var(--color-muted)]">
            Janela de montagem e retirada
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="setupWindowStart"
              type="time"
              defaultValue={hours.setupStart}
              aria-label="Monta a partir das"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
            <span className="text-sm text-[var(--color-muted)]">até</span>
            <input
              name="setupWindowEnd"
              type="time"
              defaultValue={hours.setupEnd}
              aria-label="Retira até as"
              className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <span className="mt-1 block text-[11px] text-[var(--color-muted)]">
            A IA só oferece horários dentro dessa faixa. É diferente do expediente: você pode
            atender 24h e só montar das 8h às 20h.
          </span>
        </div>
      </SettingsSection>

      {/* ─────────── Regras de locação ─────────── */}
      <SettingsSection
        id="locacao"
        title="Regras de locação"
        description="A IA respeita estes valores ao montar um orçamento ou fechar uma reserva."
      >
        <Field
          name="minRentalHours"
          label="Locação mínima (horas)"
          type="number"
          min="1"
          max="24"
          defaultValue={settings?.minRentalHours}
          placeholder="4"
        />
        <Field
          name="minRentalPrice"
          label="Valor mínimo (R$)"
          type="number"
          step="0.01"
          min="0"
          defaultValue={settings?.minRentalPrice != null ? Number(settings.minRentalPrice) : null}
          placeholder="150,00"
        />
        <TextArea
          name="depositPolicy"
          label="Política de sinal e cancelamento"
          hint="Em linguagem simples: a IA repete isto para o cliente."
          defaultValue={settings?.depositPolicy}
          placeholder="Sinal de 30% para confirmar a data. Cancelamento com até 48h devolve o sinal."
        />
      </SettingsSection>

      {/* ─────────── Site público ─────────── */}
      <SettingsSection
        id="site"
        title="Site público"
        description="Textos e cores da sua página de divulgação."
      >
        <Field name="headline" label="Título principal" wide defaultValue={settings?.headline} placeholder="Diversão sem dor de cabeça" />
        <Field name="subheadline" label="Subtítulo" wide defaultValue={settings?.subheadline} placeholder="Brinquedos entregues, montados e higienizados." />
        <Field name="ctaText" label="Texto do botão" defaultValue={settings?.ctaText} placeholder="Reservar no WhatsApp" />
        <div className="hidden sm:block" />
        <ColorField name="colorPrimary" label="Cor principal" defaultValue={settings?.colorPrimary ?? "#2563EB"} />
        <ColorField name="colorSecondary" label="Cor secundária" defaultValue={settings?.colorSecondary ?? "#FBBF24"} />
        <ColorField name="colorAccent" label="Cor de destaque" defaultValue={settings?.colorAccent ?? "#7C3AED"} />
      </SettingsSection>

      {/* ─────────── Pós-festa ─────────── */}
      <SettingsSection
        id="pos-festa"
        title="Pós-festa"
        description="Ao mover uma conversa pra coluna 'Pós-festa' no Funil, esta mensagem é enviada automaticamente."
      >
        <TextArea
          name="postEventMessage"
          label="Mensagem automática"
          hint="Pergunte a nota de 0 a 10. Se deixar em branco, usamos um texto padrão."
          defaultValue={settings?.postEventMessage}
          placeholder="Oi! Como foi a festa? De 0 a 10, qual nota você daria pra experiência?"
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
