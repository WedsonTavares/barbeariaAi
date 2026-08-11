"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { requireRole, services, schemas, ZodError } from "@barbearia-ai/core";
import { requireTenant } from "@/lib/tenant";
import { tenantHost } from "@/lib/tenant-resolution";
import { getQrCode, getConnectionState, logoutInstance, ensureInstance } from "@/lib/evolution";

const BASE = "/admin/configuracoes";

/** Tenant + a instância DELE (nunca uma global — isolamento entre empresas). */
async function tenantContext() {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  const instance = await services.tenantService.evolutionInstance(tenant.id, tenant.slug);
  return { tenant, instance };
}

/** Instância do Evolution DESTE tenant. */
async function tenantInstance() {
  return (await tenantContext()).instance;
}

/**
 * Quantos pedidos de pareamento uma empresa pode fazer, e com que espaçamento.
 *
 * Cada QR (ou código) é um pedido de vinculação ao WhatsApp, e o excesso faz o
 * WhatsApp bloquear a conexão por HORAS. A tela já só gera no clique, mas isso
 * é regra de navegador: quem clicar rápido, ou tiver o JavaScript quebrado,
 * ainda dispararia um pedido por clique. A trava de verdade é aqui.
 *
 * Os números são conservadores de propósito. A regra da Meta não é pública; o
 * que se sabe do incidente de 07/08/2026 é que 30 pedidos em 21 minutos geraram
 * um bloqueio de 5 horas. Como não dá para saber se a janela é de minutos, de
 * horas ou do dia, o limite fica bem abaixo de qualquer leitura razoável dela.
 */
const INTERVALO_MINIMO_MS = 20_000;
const MAXIMO_POR_JANELA = 3;
const JANELA_MS = 15 * 60_000;

/** Histórico por instância. Some quando a função hiberna — e tudo bem: o
 *  objetivo é conter a rajada de cliques, não auditar. */
const pedidos = new Map<string, number[]>();

function podePedirQr(instance: string, agora = Date.now()): { ok: true } | { ok: false; aguardeSegundos: number } {
  const recentes = (pedidos.get(instance) ?? []).filter((t) => agora - t < JANELA_MS);
  const ultimo = recentes.at(-1);
  if (ultimo && agora - ultimo < INTERVALO_MINIMO_MS) {
    return { ok: false, aguardeSegundos: Math.ceil((INTERVALO_MINIMO_MS - (agora - ultimo)) / 1000) };
  }
  if (recentes.length >= MAXIMO_POR_JANELA) {
    return { ok: false, aguardeSegundos: Math.ceil((JANELA_MS - (agora - recentes[0]!)) / 1000) };
  }
  pedidos.set(instance, [...recentes, agora]);
  return { ok: true };
}

export type ResultadoQr =
  | { ok: true; base64?: string; pairingCode?: string; state: string }
  | { ok: false; aguardeSegundos: number };

/**
 * Gera UM pedido de conexão. Com `phone`, devolve código de pareamento em vez
 * de QR — o caminho para quem está no próprio celular.
 */
export async function fetchQrAction(phone?: string): Promise<ResultadoQr> {
  const { tenant, instance } = await tenantContext();

  const permitido = podePedirQr(instance);
  if (!permitido.ok) return permitido;

  // Tenant novo: cria a instância dele antes de pedir o QR — JÁ COM O WEBHOOK.
  // Sem o webhook a instância nasce muda: conecta, a tela diz "conectado" e
  // nenhuma mensagem chega. O host e o segredo são os DESTE tenant, e é isso
  // que impede a mensagem de uma loja de cair no inbox de outra.
  await ensureInstance(instance, {
    url: `https://${tenantHost(tenant.slug)}/api/whatsapp/inbound`,
    headers: { "x-barbearia-ai-secret": await services.tenantService.ensureAgentSecret(tenant.id) },
  });
  const r = await getQrCode(instance, phone);
  return { ok: true, ...r };
}

export async function fetchStatusAction() {
  return getConnectionState(await tenantInstance());
}

export async function disconnectAction() {
  return logoutInstance(await tenantInstance());
}

export async function disconnectGoogleCalendarAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);
  const id = schemas.idInput.parse(formData.get("id"));
  await services.calendarService.disconnect(tenant.id, id);
  revalidatePath(BASE);
}

/**
 * Conecta uma agenda pela conta de serviço da plataforma.
 *
 * Aqui não há OAuth: a empresa já compartilhou a agenda dela com o nosso
 * e-mail no Google Agenda, e o que gravamos é QUAL agenda é a dela. Esse
 * `calendarId` é o isolamento inteiro desse provider, então ele nasce do
 * formulário de um OWNER/ADMIN autenticado NESTE tenant — nunca do agente de
 * IA e nunca de um payload externo.
 *
 * O `professionalId` é conferido contra este tenant antes de ser usado, pelo
 * mesmo motivo que o fluxo OAuth confere: nada que não tenha sido validado
 * agora entra na conexão.
 */
export async function connectServiceAccountCalendarAction(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const calendarId = String(formData.get("calendarId") ?? "").trim();
  if (!calendarId) redirect(`${BASE}?calendar=sem_agenda#google-calendar`);

  const pedido = String(formData.get("professionalId") ?? "").trim();
  const profissional = pedido ? await services.professionalService.get(tenant.id, pedido) : null;
  if (pedido && !profissional) redirect(`${BASE}?calendar=invalid#google-calendar`);

  const resultado = await services.calendarService.connectServiceAccount(tenant.id, {
    calendarId,
    professionalId: profissional?.id ?? null,
  });
  if (!resultado.ok) redirect(`${BASE}?calendar=${resultado.reason}#google-calendar`);

  const sincronizacao = await services.calendarService
    .syncGoogleConnection(tenant.id, resultado.connection.id)
    .catch(() => ({ synced: false as const }));
  if (!sincronizacao.synced) redirect(`${BASE}?calendar=sync_failed#google-calendar`);

  revalidatePath(BASE);
  revalidatePath("/admin/agenda");
  redirect(`${BASE}?calendar=connected#google-calendar`);
}

/** Dias da semana marcados no formulário (0 = domingo). */
function readDays(formData: FormData) {
  return formData
    .getAll("days")
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

/**
 * Salva um bloco do formulário. Cada seção envia só os seus campos e montamos o
 * objeto apenas com o que veio — assim salvar "Empresa" não apaga o que está
 * configurado em "Site".
 */
export async function saveSettings(formData: FormData) {
  const { tenant, ctx } = await requireTenant();
  requireRole(ctx, ["OWNER", "ADMIN"]);

  const secao = String(formData.get("secao") ?? "");
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "secao" || key === "name" || key === "days") continue;
    if (key.startsWith("businessHours") || key.startsWith("serviceWindow")) continue;
    if (typeof value === "string") raw[key] = value;
  }
  // O expediente chega como campos soltos (start/end + checkboxes) e vira JSON.
  // A janela de montagem viaja no mesmo JSON: `businessHours` é Json livre, e
  // guardar junto evita uma migration só pra dois horários.
  if (formData.has("businessHoursStart")) {
    const serviceStart = formData.get("serviceWindowStart");
    const serviceEnd = formData.get("serviceWindowEnd");
    raw.businessHours = {
      start: formData.get("businessHoursStart"),
      end: formData.get("businessHoursEnd"),
      days: readDays(formData),
      ...(typeof serviceStart === "string" && serviceStart ? { serviceStart } : {}),
      ...(typeof serviceEnd === "string" && serviceEnd ? { serviceEnd } : {}),
    };
  }

  let dest = `${BASE}?ok=salvo`;
  try {
    // Nome da empresa fica em Tenant, não em TenantSettings.
    const nome = formData.get("name");
    if (typeof nome === "string") {
      const { name } = schemas.tenantNameInput.parse({ name: nome });
      await services.tenantService.updateName(tenant.id, name);
    }

    const data = schemas.tenantSettingsInput.parse(raw);
    await services.tenantService.updateSettings(tenant.id, data);
  } catch (error) {
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const campo = issue?.path.join(".") ?? "";
      const msg = issue?.message ?? "";
      dest = `${BASE}?erro=${encodeURIComponent(campo)}&msg=${encodeURIComponent(msg)}`;
    } else {
      throw error;
    }
  }

  revalidatePath(BASE);
  revalidatePath("/"); // o site público lê nome, cores e textos daqui
  redirect(`${dest}${secao ? `#${secao}` : ""}`);
}
