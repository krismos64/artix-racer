export default {
  server: { port: 5180, open: false },
  // Rapier est distribué en WASM : il ne doit pas être pré-bundlé.
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  build: { target: 'esnext' },
};
