import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
    // These are integration tests that hit the real local Postgres (via docker compose,
    // see docker-compose.yml) — there's no mocked DB layer in this codebase, and adding
    // one just for tests would diverge from what actually runs in production. Run
    // `npm run db:docker` first if the container isn't already up.
    // A full 200-file run creates substantially more Postgres contention than an
    // individual integration file. Keep enough headroom for that real-DB workload;
    // focused runs still complete in seconds and failures remain bounded.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Test files share one real database. Running them in parallel lets a global
    // operation in one file (for example, completing every booking whose checkout has
    // passed) mutate another file's fixtures between its action and assertion. Keep
    // files serial until each worker has an isolated database/schema.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // See vitest-server-only-shim.ts for why this is needed.
      "server-only": path.resolve(__dirname, "./vitest-server-only-shim.ts"),
    },
  },
});
