export default {
  fetch(request, env) {
    // En dev local, le plugin Vite exécute ce worker sans lier ASSETS pour
    // certaines requêtes hors module (ex. /favicon.ico) : répondre 404
    // proprement plutôt que de faire tomber le serveur en 500.
    if (!env?.ASSETS) return new Response(null, { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
