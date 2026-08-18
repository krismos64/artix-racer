# Capture d'écran du jeu (procédure pour Claude)

Séquence validée pour obtenir une image du rendu réel, pas de l'écran de
démarrage.

1. Serveur : `npm run dev` en arrière-plan, attendre que
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:5180` renvoie 200.

2. Ouvrir la page : `mcp__chrome-devtools__new_page` sur http://localhost:5180

3. Passer en 16:9 : `resize_page` 1600 x 900. Sans ça la capture sort en
   portrait et le rendu est inexploitable.

4. Franchir l'écran de démarrage, il attend un clic :

```js
async () => {
  const b = [...document.querySelectorAll('button')].find(x => /volant/i.test(x.textContent));
  if (b) b.click();
  await new Promise(r => setTimeout(r, 4000));   // laisser la ville s'afficher
  return document.querySelector('canvas').width;
}
```

5. `take_screenshot` en jpeg qualité 85. Le png d'une scène 3D plein écran est
   inutilement lourd.

6. Vérifier `list_console_messages` : un shader qui ne compile pas donne un
   écran noir sans lever d'exception.

## Se placer à un endroit précis

Prendre les captures au hasard pendant que la voiture roule ne permet pas de
comparer un avant et un après. Pour un cadrage reproductible, exposer les
objets utiles sur `window` depuis `main.js` (voiture, scène, horloge du cycle
jour/nuit), puis les piloter via `evaluate_script` : téléporter la voiture au
point de vue voulu, figer l'heure, masquer le HUD.

Points de vue utiles : Place du Général de Gaulle (départ), la Mairie, l'Église
Saint-Pierre, un rond-point, un château d'eau.

## Comparer avant / après

Enregistrer dans `shots/` avec le paramètre `filePath` de `take_screenshot`,
sous un nom qui dit l'état : `shots/asphalte-avant.jpg`,
`shots/asphalte-apres.jpg`. Ce dossier est un espace de travail, pas un asset
du jeu.
