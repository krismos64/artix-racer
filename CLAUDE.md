# Artix Racer Hybride Babylon.js

Jeu de course 3D dans Artix (64170), reconstruite depuis les données publiques
(OSM, BD TOPO, LiDAR HD, Panoramax). Usage personnel, jamais mis en ligne :
pas de tests automatisés, pas d'exigence de sécurité web. Objectif unique :
le meilleur rendu visuel possible, vite.

## Commandes

- `npm run dev` : serveur Vite (http://localhost:5173)
- `npm run build` : `tsc --noEmit` puis build Vite (le type-check EST la CI)
- `node scripts/fetch-panoramax.mjs` : pipeline photos Panoramax (voir scripts/)

## Architecture : hybride en deux couches

1. **`src/three-city/*.js`** (Three.js, hérité) : génère TOUTE la ville fidèle
   (bâtiments BD TOPO + toits LiDAR, routes OSM, signalisation, haies, arbres,
   lampadaires, textures canvas multi-échelles dans `textures.js`).
2. **`src/three-city-bridge.ts`** : convertit meshes/matériaux Three → Babylon PBR.
3. **`src/world.ts` + `src/materials.ts`** (Babylon natif) : chunks de terrain
   et végétation par densité. Bibliothèque de matériaux distincte de
   `three-city/textures.js` : toute amélioration de matériau doit viser les deux.
4. **`src/main.ts`** : scène, ciel, lumières, ombres CSM, pipeline post-process,
   boucle de jeu, HUD.

## Pièges connus

- Repère **main droite** (`scene.useRightHandedSystem = true`), hérité de
  Three.js. Z croît vers le sud. Ne jamais convertir les géométries.
- Géoréférencement : `ORIGIN = { lat: 43.39743, lon: -0.57224 }` dans
  `src/three-city/osm.js`, projection Mercator locale, `project(lat, lon)`.
- Tone mapping ACES : une texture en gris moyen finit très sombre. Garder les
  textures centrées haut, faible amplitude (voir commentaires de `textures.js`).
- `ROAD_Y = 0.25` et `GARDE_SOL = 0.35` (world.js) : références d'altitude
  partagées rendu/collision/spawn.
- Matériaux Babylon : `freeze()` après configuration ; penser à `unfreeze()`
  ou configurer avant si on anime une propriété.
- Les textures canvas sont multipliées par la couleur du matériau.

## Données (`public/data/`)

- `artix-osm.json` : routes, zones, barrières, arbres, nœuds (Overpass)
- `artix-bdtopo.json` : 3 542 bâtiments (hauteur, matériaux MAJIC)
- `artix-toits-lidar.json` : forme mesurée de 3 537 toitures
- `artix-facades.json` : teintes relevées sur Panoramax (`i` index bâtiment,
  `c` couleur int, `q` confiance 0..1)
- `artix-poi.json` : commerces, équipements, arbres OSM

## Références visuelles réelles (à respecter)

Artix, Béarn, bassin de Lacq : enduits blancs/crème, tuile rouge-brun
majoritaire (1 302 tuile / 74 ardoise), volets bois peints (bordeaux, vert,
bleu-gris), murets en galets du gave, cités ouvrières post-1957 (rangées de
maisons jumelles), saligues (saules, aulnes, peupliers) le long du gave et du
lac, platanes d'alignement, plaques de rue bilingues français/occitan.
Sources photo licites : Panoramax IGN (Licence Ouverte 2.0, 22 000 panos de
janvier 2025), Wikimedia Commons (attribution dans ATTRIBUTIONS.md), orthophotos
IGN. Street View / Google Earth : interdits (CGU).

## Chantier visuel en cours

Suivi détaillé dans `JOURNAL.md` (à tenir à jour à chaque session). Ordre :
1. SkyMaterial + IBL par ReflectionProbe (cohérence lumière)
2. Identité Artix : volets, murets galets, plaques bilingues
3. Detail maps + bump sur sols et façades MAJIC
4. Arbres unifiés thin instances + ripisylve
5. SSAO2 profil Qualité
6. Pipeline Panoramax étendu (parement + volets par façade)

## Conventions

- Tout en français : code commenté, commits, docs. Style des commentaires
  existants : expliquer le POURQUOI, chiffres à l'appui.
- Jamais de tiret cadratin/demi-cadratin dans la prose.
- Jamais de `Co-Authored-By: Claude` dans les commits.
- Perf cible : 60 fps sur MacBook Air M4 en profil Équilibré. Tout effet
  coûteux passe par les profils `QUALITY` de `src/config.ts`.
- Vérification : `npx tsc --noEmit` après chaque série d'éditions TS.
