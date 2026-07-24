import { Queue, Worker } from "bullmq";
import { connection } from "./redis";
import { processDueReminders } from "./reminder-worker";
import { processDueAgentConversations } from "./agent-worker";

const SCHEDULER = "scheduler";

// Fila + 2 "ticks" repetíveis. A comunicação web->worker é pelo banco (não Redis exposto).
const queue = new Queue(SCHEDULER, { connection });
await queue.add(
  "tick",
  {},
  {
    repeat: { every: 60_000 },
    jobId: "reminder-tick",
    // Sem isso o Redis acumula um job concluído por minuto, para sempre.
    removeOnComplete: true,
    removeOnFail: 500,
  }
);
await queue.add(
  "agent-tick",
  {},
  {
    // Mais frequente que o de lembretes: é o que dá a sensação de "conversa" —
    // resolução do debounce fica entre DEBOUNCE_SECONDS e DEBOUNCE_SECONDS+10s.
    repeat: { every: 10_000 },
    jobId: "agent-tick",
    removeOnComplete: true,
    removeOnFail: 500,
  }
);

const worker = new Worker(
  SCHEDULER,
  async (job) => {
    if (job.name === "tick") await processDueReminders();
    if (job.name === "agent-tick") await processDueAgentConversations();
  },
  { connection }
);

worker.on("ready", () => console.log("⚙️  worker pronto — lembretes a cada 60s, agente de IA a cada 10s"));
worker.on("failed", (job, err) => console.error("[worker] falhou", job?.id, err));

const shutdown = async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
