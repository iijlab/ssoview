import { coverageConfigDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";
import { playwright } from "@vitest/browser-playwright";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        exclude: [
          "src/side-panel/index.tsx",
          "tests/browser/lib/*",
          ...coverageConfigDefaults.exclude,
        ],
      },
      projects: [
        {
          test: {
            name: "node",
            include: ["src/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
          },
          extends: true,
        },
        {
          test: {
            name: "browser",
            include: ["tests/browser/**/*.{test,spec}.?(c|m)[jt]s?(x)"],
            browser: {
              provider: playwright(),
              enabled: true,
              headless: true,
              instances: [
                {
                  browser: "chromium",
                },
              ],
            },
            // https://testing-library.com/docs/react-testing-library/setup/#auto-cleanup-in-vitest
            setupFiles: ["tests/browser/lib/vitest-cleanup-after-each.ts"],
          },
          extends: true,
          optimizeDeps: {
            include: ["@emotion/react/jsx-dev-runtime", "@mui/icons-material", "@mui/material"],
            // Vitest 5 sets keepProcessEnv on the browser "client" environment, so Vite's optimizer
            // leaves `process.env.NODE_ENV` unreplaced and Rolldown (1.2.16) bundles both React CJS
            // builds, then wrongly inlines `jsxDEV` from the production one (`exports.jsxDEV = void 0`).
            // Define NODE_ENV for the optimizer only, so the production branch is dropped.
            rolldownOptions: {
              transform: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
            },
          },
        },
      ],
    },
  }),
);
