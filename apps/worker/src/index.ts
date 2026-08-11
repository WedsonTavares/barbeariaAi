import { Queue, Worker } from "bullmq";
import { connection } from "./redis";
import { processDueReminders } from "./reminder-worker";
import { expirePostService } from "./pos-atendimento-worker";
import { renewGoogleCalendarSubscriptions } from "./calendar-worker";

const SCHEDULER = "scheduler";
const CALENDAR_RENEW_INTERVAL_MS = 60 * 60 * 1000;
let lastCalendarRenewalAt = 0;

// Namespace das chaves no Redis. O worker do Diny Festas roda uma fila com ESTE mesmo
// nome ("scheduler") e o mesmo jobId ("reminder-tick"); sem prefixo próprio, apontar o
// REDIS_URL para o mesmo servidor faria os dois dividirem `bull:scheduler` e um
// processaria o tick do outro. O certo continua sendo Redis dedicado (ver .env.example),
// isto é a rede de segurança para quando a URL estiver errada.
const QUEUE_PREFIX = "barbearia";

// Fila + "tick" repetível (a cada 60s). A comunicação web->worker é pelo banco.
// (O agente de IA agora roda inteiramente no n8n — ver docs/N8N-AGENTE-IA.md — não é
// mais responsabilidade deste worker; evita as duas coisas processarem a mesma conversa.)
const queue = new Queue(SCHEDULER, { connection, prefix: QUEUE_PREFIX });
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

const worker = new Worker(
  SCHEDULER,
  async (job) => {
    if (job.name === "tick") {
      await processDueReminders();
      // Roda no mesmo tick: é uma varredura barata e a janela é de horas, não
      // de minutos — não justifica uma fila própria.
      await expirePostService();
      if (Date.now() - lastCalendarRenewalAt >= CALENDAR_RENEW_INTERVAL_MS) {
        lastCalendarRenewalAt = Date.now();
        await renewGoogleCalendarSubscriptions();
      }
    }
  },
  // O prefixo TEM de ser o mesmo da fila, senão o worker escuta um lugar e a fila
  // escreve em outro — o tick nunca seria consumido.
  { connection, prefix: QUEUE_PREFIX }
);

worker.on("ready", () => console.log("worker pronto - tick a cada 60s"));
worker.on("failed", (job, err) => console.error("[worker] falhou", job?.id, err));

const shutdown = async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
