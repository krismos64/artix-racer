---
name: modeliser-artix
description: Modéliser en dur un lieu d'Artix d'après les photos Panoramax et l'orthophoto IGN (bâtiment, devanture, parking, sol, végétation, lieu symbolique). Utiliser quand Christophe demande d'ajouter ou de reconstruire fidèlement un endroit précis de la ville, pas seulement de corriger un écart déjà signalé.
---

# Modéliser un lieu d'Artix en dur

Reconstruire un endroit réel à partir des sources publiques, sans jamais
deviner une position, un cap ni une couleur. Le skill `fidelite-artix` traite
la CORRECTION d'un écart signalé ; celui-ci traite la CONSTRUCTION d'un lieu.

## Les deux outils, avant tout le reste

Ne plus écrire de script d'analyse jetable : tout passe par ces deux-là.

### Voir le lieu réel

```bash
node scripts/panoramax-vue.mjs --poi "Pharmacie Barrouilhet" --n 3
node scripts/panoramax-vue.mjs --xz 113,-74 --y 4 --fov 60
node scripts/panoramax-vue.mjs --bat 1078 --rayon 60
```

Sélectionne les panoramiques qui voient la cible **de face** (incidence
mesurée sur les arêtes du bâtiment), les télécharge en HD, et écrit un cadrage
plat lisible avec `Read`. Options utiles : `--y` (hauteur visée, défaut
mi-hauteur de gouttière), `--fov` (serrer sur une devanture : 50 à 60),
`--brut` (couper l'égalisation d'histogramme quand la teinte exacte compte),
`--sortie` (par défaut le scratchpad).

Chaque vue est annoncée avec l'arête vue, sa normale et l'incidence : ces
chiffres se recoupent avec la fiche de mesure.

### Mesurer avant de poser

```bash
node scripts/artix-mesure.mjs --poi "Maison Chaudron"
node scripts/artix-mesure.mjs --xz 21.8,65.5 --rayon 35 --nb 2
node scripts/artix-mesure.mjs --bat 1073 --ortho
node scripts/artix-mesure.mjs --poi "Leclerc" --json     # pour un script
```

Sort la fiche prête à recopier : centre de **boîte orientée** avec la dérive
du centroïde signalée, hauteur de gouttière LiDAR, toutes les arêtes avec leur
normale extérieure mesurée, la façade retenue (celle exposée à la rue, comptée
en prises Panoramax qui la voient de face), la position et la rotation Y d'une
devanture, et les POI voisins. `--ortho` imprime en plus la commande curl
d'orthophoto IGN cadrée sur le lieu.

Validation : sur la Maison Chaudron la fiche retrouve la façade et le cap
codés à la main (-1,820 rad mesuré contre -1,824 rad en dur, 0,2° d'écart).

## Ordre de travail

1. **Mesurer** (`artix-mesure`) : quel bâtiment BD TOPO, quelle façade, quelle
   hauteur de mur, quels voisins. Noter l'index du bâtiment.
2. **Regarder** (`panoramax-vue`) : lire 2 ou 3 vues. Décrire ce qu'on voit
   avant de coder (couleurs, matériaux, enseignes, volets, débords de toit).
   Une seule vue trompe : le soleil bas de janvier bouche les façades nord.
3. **Implanter au sol** si le lieu comporte un parking, une allée, une place :
   **orthophoto**, jamais les vues de rue. Une vue de rue ne donne aucune
   géométrie en plan.
4. **Coder** dans le fichier du domaine (tableau ci-dessous).
5. **Vérifier** : `npx tsc --noEmit`, `node --check` sur les JS touchés (les
   deux sont câblés en hooks), puis proposer à Christophe de recharger.
6. **Journaliser** dans `JOURNAL.md` : ce qui a été posé, ce qui a été mesuré,
   le piège rencontré.

## Où coder, par domaine

| Domaine | Fichier | Points d'attention |
| --- | --- | --- |
| Bâtiment modélisé | `src/three-city/landmarks.js` | ajouter l'emprise à `BATIMENTS_MODELISES` (bdtopo.js) |
| Devanture de commerce | `landmarks.js`, `construireDevantureCommerce` | ajouter le nom à `dejaModelises` |
| Enseigne | `signage.js` (générique) | un commerce modélisé doit être exclu ici, sinon enseigne en double |
| Parking, places | `parking.js`, `trouverBandes` | bandes en dur d'après ortho ; le rognage près des chaussées est automatique |
| Sol, enrobé, passages | `world.js` + `artix-sols.json` | teintes MESURÉES par type de voie, jamais choisies à l'œil |
| Végétation | `world.js` (alignements, ripisylve), `touffes.js` | platanes en tête de chat au bourg, saules et peupliers au gave |
| Signalisation, poteaux | `signage.js`, `artix-poteaux.json` | les nœuds sont sous la clé `poi`, jamais `elements` |

## Pièges qui coûtent cher

- **Boîte orientée, jamais centroïde.** Sur l'îlot 1078 la dérive atteint
  4,04 m : le bâtiment posé au centroïde déborde sur l'avenue. La fiche de
  mesure affiche la dérive et marque « NE PAS UTILISER » au-delà de 80 cm.
- **La façade la plus proche du POI n'est pas la bonne.** Les POI de commerce
  sont posés approximativement, souvent à l'intérieur du bâtiment. La façade
  correcte est celle qui donne sur la rue : `artix-mesure` la choisit en
  comptant les prises Panoramax qui la voient de face.
- **Gouttière LiDAR, pas hauteur BD TOPO.** La hauteur BD TOPO va au faîtage :
  s'en servir pour un mur remplit le haut de ciel et de toits voisins.
- **Un modèle qui mord une chaussée** se rétracte avec
  `retracterHorsChaussee` (landmarks.js) : le réflexe avant de bricoler la
  position à la main.
- **Tone mapping ACES** : une texture en gris moyen finit très sombre.
  Textures centrées haut, faible amplitude.
- **Le SSL de python3 est cassé sur cette machine** : les téléchargements WMS
  passent par `curl`.
- Repère main droite, **Z croît vers le sud**. Sur une orthophoto le nord est
  en haut : un objet plus au sud a un Z plus GRAND.

## Ancrage visuel régional

Artix, Béarn, bassin de Lacq : enduits blancs et crème, tuile rouge-brun
majoritaire, volets bois peints, murets en galets du gave, cités ouvrières
post-1957, saligues le long du gave, platanes taillés en tête de chat, plaques
de rue bilingues français/occitan. Devant un doute, la photo tranche : c'est
tout l'objet de `panoramax-vue`.

Sources licites : Panoramax IGN et orthophotos IGN (Licence Ouverte 2.0),
Wikimedia Commons avec attribution dans `ATTRIBUTIONS.md`. Street View et
Google Earth sont interdits.
