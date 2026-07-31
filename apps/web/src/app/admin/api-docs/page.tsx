import { SwaggerUI } from "./SwaggerUI";

export const metadata = { title: "API do agente" };

/**
 * Documentação viva das rotas que o agente de IA chama. Fica sob /admin de
 * propósito: o "Try it out" dispara requisição de verdade, contra o tenant
 * desta aba.
 */
export default function ApiDocsPage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold">API do agente</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          As ferramentas que a IA chama no WhatsApp. Para testar, clique em{" "}
          <strong>Authorize</strong>, cole o <code>AGENT_API_SECRET</code> e use o{" "}
          <strong>Try it out</strong> de cada rota.
        </p>
      </header>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Isto aqui é produção.</p>
        <p className="mt-1">
          As requisições valem de verdade e caem no tenant desta aba.{" "}
          <code>agendar</code> cria reserva, <code>cancelar</code> cancela festa e{" "}
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
