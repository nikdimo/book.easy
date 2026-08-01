import "server-only";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Opt-in slow-query logging. Set `PRISMA_SLOW_QUERY_MS` to a millisecond threshold
 * (e.g. `PRISMA_SLOW_QUERY_MS=200`) to have any query slower than that logged with its
 * duration. Off unless the variable is set: query-event logging has its own overhead
 * and would be noise in normal operation, but without something like it a future
 * slowdown is guesswork again.
 */
function slowQueryThresholdMs(): number | null {
  const raw = Number.parseInt(process.env.PRISMA_SLOW_QUERY_MS ?? "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function createPrismaClient(): PrismaClient {
  const threshold = slowQueryThresholdMs();
  if (threshold === null) return new PrismaClient();

  const client = new PrismaClient({
    log: [{ emit: "event", level: "query" }],
  });

  // `as never` because the event-name overload is only present on a client whose
  // generic log config declares it, which this conditional construction hides.
  (client as unknown as {
    $on: (event: "query", cb: (e: { duration: number; query: string }) => void) => void;
  }).$on("query", (event) => {
    if (event.duration >= threshold) {
      console.warn(`[prisma] slow query ${event.duration}ms: ${event.query}`);
    }
  });

  return client;
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
