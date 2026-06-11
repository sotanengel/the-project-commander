import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["apps/server", "apps/web", "packages/shared"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["apps/server/src/**/*.ts", "apps/web/src/**/*.ts", "packages/shared/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/index.ts",
        "apps/web/src/main.tsx",
        "apps/web/src/App.tsx",
        "apps/web/dist/**",
        "**/*Page.tsx",
        "**/*Chart.tsx",
        "**/*Card.tsx",
        "**/*Editor.tsx",
        "**/prompts.ts",
        "apps/server/src/index.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 65,
        branches: 60,
      },
    },
  },
});
