import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  build: {
    license: { fileName: "THIRD-PARTY-LICENSES" },
    rolldownOptions: {
      input: {
        "service-worker": resolve(__dirname, "src/service-worker/index.ts"),
        "side-panel": resolve(__dirname, "side-panel.html"),
        "report-page": resolve(__dirname, "report.html"),
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
    modulePreload: false,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    tsconfigPaths: true,
  },
});
