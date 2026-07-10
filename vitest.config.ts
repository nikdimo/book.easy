import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // These are integration tests that hit the real local Postgres (via docker compose,
    // see docker-compose.yml) — there's no mocked DB layer in this codebase, and adding
    // one just for tests would diverge from what actually runs in production. Run
    // `npm run db:docker` first if the container isn't already up.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // See vitest-server-only-shim.ts for why this is needed.
      "server-only": path.resolve(__dirname, "./vitest-server-only-shim.ts"),
    },
  },
});
