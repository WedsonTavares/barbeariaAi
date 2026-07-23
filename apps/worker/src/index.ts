import { Queue, Worker } from "bullmq";
import { connection } from "./redis";
import { processDueReminders } from "./reminder-worker";

const SCHEDULER = "scheduler";

// Fila + "tick" repetível (a cada 60s). A comunicação web->worker é pelo banco.
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

const worker = new Worker(
  SCHEDULER,
  async (job) => {
    if (job.name === "tick") await processDueReminders();
  },
  { connection }
);

worker.on("ready", () => console.log("⚙️  worker pronto — tick a cada 60s"));
worker.on("failed", (job, err) => console.error("[worker] falhou", job?.id, err));

const shutdown = async () => {
  await worker.close();
  await queue.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
