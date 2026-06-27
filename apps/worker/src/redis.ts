import IORedis from "ioredis";

// BullMQ exige maxRetriesPerRequest: null.
export const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});
