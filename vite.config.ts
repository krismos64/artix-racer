import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";

function sitesMetadata(): Plugin {
  return {
    name: "sites-metadata",
    apply: "build",
    async closeBundle() {
      const output = resolve("dist", ".openai");
      await rm(output, { recursive: true, force: true });
      await mkdir(output, { recursive: true });
      await cp(".openai/hosting.json", resolve(output, "hosting.json"));
    },
  };
}

export default defineConfig({
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat"],
  },
  build: {
    target: "esnext",
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "server" },
      inspectorPort: false,
      config: {
        main: "./worker/index.js",
        compatibility_date: "2026-05-22",
        assets: {
          not_found_handling: "single-page-application",
        },
      },
    }),
    sitesMetadata(),
  ],
});
