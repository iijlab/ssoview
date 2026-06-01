import { coverageConfigDefaults, defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";
import { playwright } from "@vitest/browser-playwright";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      coverage: {
        provider: "istanbul", // or 'v8'
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
          },
        },
      ],
    },
  }),
);
