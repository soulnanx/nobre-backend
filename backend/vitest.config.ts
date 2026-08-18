import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    globalSetup: "./tests/global-setup.ts",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      DATABASE_URL: "postgres://loja:loja@localhost:5433/loja_test",
      PORT: "3999",
      POOL_SIZE: "5",
      SESSION_TTL: "86400",
      RATE_LIMIT_REGISTER: "5",
      RATE_LIMIT_LOGIN: "10",
      CORS_ORIGINS: "http://localhost:3000",
    },
  },
});
