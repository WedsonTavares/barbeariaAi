import { requireTenant } from "@/lib/tenant";
import { SwaggerUI } from "./SwaggerUI";

export const metadata = { title: "API do agente" };
export const dynamic = "force-dynamic";

/**
 * Documentação viva das rotas que o agente de IA chama. Fica sob /admin de
 * propósito: o "Try it out" dispara requisição de verdade, contra o tenant
 * desta aba.
 *
 * SUPER-ADMIN apenas. É ferramenta de integração, não de negócio: quem toca
 * nela é quem liga o produto no Evolution e no n8n. Um profissional com papel
 * STAFF chegava aqui pela URL e encontrava um botão que cria e cancela
 * agendamento de cliente real em produção.
 */
export default async function ApiDocsPage() {
  const { ctx } = await requireTenant();
  if (!ctx.isSuperAdmin) {
    return (
      <div className="rounded-2xl border border-black/5 bg-white p-6">
        <h1 className="font-extrabold">Área restrita</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          A documentação da API é usada apenas por quem integra a plataforma.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold">API do agente</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          As ferramentas que a IA chama no WhatsApp. Para testar, clique em{" "}
          <strong>Authorize</strong> e cole o <strong>segredo do agente desta empresa</strong>{" "}
          (cada tenant tem o seu; o <code>AGENT_API_SECRET</code> global só vale para{" "}
          <code>/api/agent/tenant</code>). Depois use o <strong>Try it out</strong> de cada rota.
        </p>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Isto aqui é produção.</p>
        <p className="mt-1">
          As requisições valem de verdade e caem no tenant desta aba.{" "}
          <code>agendar</code> cria agendamento, <code>cancelar</code> cancela atendimento e{" "}
          <code>reagendar</code> muda horário de cliente real. Para explorar sem
          risco, prefira as rotas de leitura: <code>info</code>,{" "}
          <code>disponibilidade</code>, <code>meus-agendamentos</code>,{" "}
          <code>contexto</code> e <code>status</code>.
        </p>
      </div>

      <SwaggerUI />
    </div>
  );
}
