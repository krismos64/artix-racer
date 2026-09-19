import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // Cibler esnext : le jeu tourne dans un Chrome/Safari récent, pas besoin
    // de transpiler vers d'anciennes syntaxes (bundle plus petit et plus rapide).
    target: "esnext",
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
