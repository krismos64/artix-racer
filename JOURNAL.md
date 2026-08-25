# Journal du chantier visuel

Journal de bord tenu par session de travail. Entrées antéchronologiques.

## 2026-08-25 : lancement du chantier

- Analyse complète du projet (architecture hybride Three→Babylon documentée
  dans CLAUDE.md).
- `git init` + commit de référence `52f4b92` (état avant chantier).
- Plan en 6 chantiers (voir CLAUDE.md). Décision : pipeline Panoramax lancé
  en tâche de fond dès le départ (téléchargements longs), rendu codé pendant
  ce temps.
- À faire ensuite : voir la liste des chantiers, cocher ici au fil de l'eau.

### État des chantiers

- [x] 0. Infra : git, CLAUDE.md, JOURNAL.md, mémoire, hook tsc
- [x] 1. SkyMaterial + IBL ReflectionProbe (réglages calés à l'écran)
- [x] 2. Volets + murets galets + plaques bilingues + abribus vitrés
- [x] 3. Bump chaussée/sol, anisotropie 16, façades pierre par grain Panoramax
- [x] 4. Ripisylve saules/peupliers (les arbres three-city étaient déjà
      instanciés : pas besoin de thin instances Babylon)
- [x] 5. SSAO2 profil Qualité (attaché/détaché par applyQuality)
- [x] 6. Pipeline Panoramax : 76 365 photos inventoriées, 1 218 téléchargées,
      2 267 façades caractérisées (teinte, volets, grain)

### Appris en route

- `ArtixWorld` est en mode queryOnly : TOUT le visuel vient de three-city
  converti par le bridge. `materials.ts`/`world.ts` ne rendent rien.
- Le SkyMaterial vire au vert moutarde au-delà de 3 de turbidité sous ACES.
- Un disque d'horizon dans la scène recouvrait le ciel selon l'angle caméra :
  retiré, la sonde IBL se contente du ciel.
- Le 500 récurrent du serveur dev venait de /favicon.ico tombant dans le
  worker Cloudflare sans binding ASSETS : worker blindé.
- MAJIC classe en « pierre » des hangars bardés de tôle peinte : le routage
  vers la texture galets exige aussi une saturation de teinte faible.
- Vérifié dans Chrome : 60 fps en Équilibré après tous les chantiers.

### Reste à faire (pistes)

- Conduire jusqu'au gave/lac pour valider la ripisylve à l'écran, et jusqu'à
  une entrée de ville pour les panneaux ARTIX/Artics.
- Détails d'aménagement : enseignes, jardinières place du Général de Gaulle.
- Éventuel placage photographique partiel des façades du centre-bourg.
