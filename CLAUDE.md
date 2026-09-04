# Artix Racer Hybride Babylon.js

Jeu de course 3D dans Artix (64170), reconstruite depuis les données publiques
(OSM, BD TOPO, LiDAR HD, Panoramax, orthophotos IGN). Usage personnel, jamais
mis en ligne : pas de tests automatisés, pas d'exigence de sécurité web.
Objectif unique : le meilleur rendu visuel possible, vite.

## Commandes

- `npm run dev` : serveur Vite (http://localhost:5173)
- `npm run build` : `tsc --noEmit` puis build Vite (le type-check EST la CI)
- Pipelines de données (voir « Sources » plus bas) :
  `fetch-panoramax`, `fetch-facades-photo`, `fetch-centre`, `fetch-sols`,
  `fetch-poteaux`
- Outils d'inspection (aucun script jetable à écrire) :
  - `npm run vue -- --poi "Maison Chaudron"` : cadrages plats des
    panoramiques qui voient le lieu de face, lisibles avec Read.
  - `npm run mesure -- --poi "Maison Chaudron"` : fiche mesurée (boîte
    orientée, gouttière LiDAR, arêtes et normales, façade sur rue,
    position et rotation d'une devanture). `--ortho` ajoute la commande
    curl d'orthophoto cadrée.

## Architecture : hybride en deux couches

1. **`src/three-city/*.js`** (Three.js, hérité) : génère TOUT le visuel de la
   ville. `world.js` (bâti, routes, sols), `landmarks.js` (bâtiments
   modélisés à la main), `signage.js` (signalisation, enseignes, poteaux),
   `parking.js`, `parkedcars.js` (parc garé : 5 silhouettes + scooters),
   `traffic.js` (circulation légère), `pedestrians.js`, `touffes.js`,
   `textures.js` (textures canvas procédurales).
2. **`src/three-city-bridge.ts`** : convertit meshes/matériaux Three → Babylon
   PBR. Contient aussi `LiveInstancedBridge` (contenu animé) et le calcul du
   contenu vivant.
3. **`src/world.ts` + `src/materials.ts`** (Babylon natif) : `ArtixWorld` est
   en mode **queryOnly** (altitudes, collisions, noms de rue). Il ne rend
   presque rien : ne pas y chercher le visuel.
4. **`src/main.ts`** : scène, ciel, lumières, ombres CSM, ambiances, pipeline
   post-process, boucle de jeu, HUD.

## Pièges connus (coûteux à redécouvrir)

- Repère **main droite** (`scene.useRightHandedSystem = true`), hérité de
  Three.js. Z croît vers le sud. Ne jamais convertir les géométries.
- Géoréférencement : `ORIGIN = { lat: 43.39743, lon: -0.57224 }` dans
  `src/three-city/osm.js`, projection Mercator locale, `project(lat, lon)`.
- **Poser un modèle sur une emprise BD TOPO** : toujours utiliser le centre de
  la BOÎTE ORIENTÉE, jamais le centroïde (une emprise en L décale le
  centroïde de plusieurs mètres, le bâtiment déborde sur la route).
- Une **normale de façade** se mesure sur l'emprise (arête + sens vers
  l'extérieur du centroïde) ; ne jamais deviner un cap.
- `BATIMENTS_MODELISES` (bdtopo.js) retire des emprises du bâti ordinaire ;
  elles restent exportées dans `data.emprisesModelisees` pour que le
  stationnement les évite (sinon : voitures dans les vitrines).
- Tone mapping ACES : une texture en gris moyen finit très sombre. Textures
  centrées haut, faible amplitude.
- `ROAD_Y = 0.25`, `GARDE_SOL = 0.35` (world.js) : altitudes de référence.
- Matériaux Babylon : `freeze()` après configuration ; `unfreeze()` avant
  d'animer une propriété (émission des vitrages la nuit).
- SkyMaterial : au-delà de turbidité 3, le ciel vire au vert moutarde sous
  ACES.
- Les nœuds de signalisation sont dans `artix-poi.json` sous la clé `poi`
  (pas `elements`).
- Le SSL de python3 est cassé sur cette machine : utiliser `curl` pour les
  téléchargements WMS.
- Conventions de rotation : `rotation.y = atan2(nx, nz)` oriente +Z local ;
  pour étendre une boîte le long de (ux, uz) par son axe X, c'est
  `atan2(-uz, ux)` (un préau posé avec la première a enjambé l'avenue).
- La grille spatiale (`spatial.js`) exige une instance par véhicule et par
  mesh : un maillage réparti par silhouette n'y entre pas.
- `ecarterDeChaussee` (osm.js) : tout objet ponctuel posé près d'une voie
  (lampadaire, poteau) doit y passer, les positions OSM et les
  triangulations tombent parfois sur la chaussée.
- Le pont Three→Babylon convertit `instanceColor` mais IGNORE les
  `vertexColors` de géométrie : un mesh qui s'appuie dessus ressort blanc.
  Matériaux séparés par teinte dans les landmarks.
- Sur une emprise quasi carrée, `boiteOrientee` (PCA) ne donne pas un cap
  fiable (la Poste, îlot 23 × 23, était tournée de 90°) : caler sur une
  arête mesurée.
- Les caps EXIF de certaines séquences Panoramax PLATES (46fce73b…) sont
  faux de plusieurs dizaines de degrés : ne jamais s'y fier pour cadrer ;
  lire la photo HD entière. Les séquences 360 (69c7a475…) sont fiables.
- `triangulate` (world.js) passe par l'earcut de Three avec repli maison :
  l'algorithme d'oreilles seul trouait les polygones concaves (parking du
  Leclerc couvert à 20 %, place du Général de Gaulle à 25 %).
- Les bâtiments récents (Super U, retail park est, McDo) manquent parfois de
  la BD TOPO : chercher l'emprise dans OSM (`building`), et l'ortho IGN du
  secteur peut être ANTÉRIEURE aux travaux. Aucune source ne suffit seule.
- Les POI OSM d'Artix ne sont pas tous à jour : bibliothèque déplacée,
  Leader Price fermé, « Intermarché » = ancien nom du Leclerc. Vérifier
  l'actualité sur l'imagerie la plus récente avant de poser une enseigne.
- Un élément de FOND (backdrop) doit échapper au brouillard
  (`applyFog = false`) ET tenir sous `camera.maxZ` : les Pyrénées ont vécu
  des mois dans la scène sans jamais être visibles, clippées par le plan
  lointain et noyées par le fog. Même piège pour le ciel : une BOÎTE de
  2 900 m a ses coins à 2 500 m, au-delà du plan lointain ; le ciel est une
  SPHÈRE.
- Ciel HDR : le disque solaire doit être PLAFONNÉ dans le fichier
  (`scripts/ciel-soleil.mjs`, plafond 12), sinon il entre dans l'IBL et
  éclaire tout sans ombre. Babylon projette la colonne u du panorama sur
  l'angle (u - 0,75) × 2π de +X vers +Z (mesuré en jeu, pas (u - 0,5)).
  `__regarder(x, y, z)` dans la console force la caméra vers une direction.
- Le coût dominant est le NOMBRE D'APPELS DE DESSIN de la passe principale
  (14 µs de JS par maillage PBR, cascades d'ombre comprises), pas la
  résolution : `ThreeCityConverter.fusionner` regroupe les petits maillages
  statiques par matériau et cellule de 300 m. Tout maillage retrouvé par son
  nom après conversion doit être dans `PROTEGES_FUSION`. SSAO et flou de
  mouvement exigent une pré-passe qui redessine la ville : profil Qualité
  seulement.
- Les textures de fichier passent par `textureFichier`/`matiere`
  (textures.js) : le pont ne lit que `image.src`, jamais les pixels ; ne pas
  leur appliquer `carteRelief` (canvas vide). Cartes de normales OpenGL :
  `invertNormalMapY = true` en repère main droite.

## Sources de données (`public/data/`)

| Fichier | Contenu | Produit par |
| --- | --- | --- |
| `artix-osm.json` | routes, zones, barrières, parkings | Overpass |
| `artix-bdtopo.json` | 3 542 bâtiments (hauteur, matériaux MAJIC) | WFS IGN |
| `artix-toits-lidar.json` | forme mesurée de 3 537 toitures | LiDAR HD |
| `artix-poi.json` | commerces, équipements, signalisation, arbres | Overpass |
| `artix-panoramax.json` | 2 869 façades : teinte, volets, grain | `fetch-panoramax` |
| `artix-facades-photo.json` + `textures/facades-atlas-*` | 254 façades rectifiées | `fetch-facades-photo` |
| `artix-facades-centre.json` + `textures/facades-centre-*` | 109 façades HD du corridor | `fetch-centre` |
| `artix-sols.json` | enrobé par type de voie, parkings, usure des passages, relevés locaux | `fetch-sols` |
| `artix-poteaux.json` | 357 poteaux triangulés | `fetch-poteaux` |
| `textures/ciel/*.hdr` | 3 panoramas Poly Haven plafonnés (jour, soir, nuit) | `scripts/ciel-soleil.mjs` |
| `textures/sols/*.jpg` | matières ambientCG (enrobé, herbe, béton, pavés, grave, écorce) | `scripts/preparer-textures.mjs` |
| `models/flotte/*.glb` | 5 voitures Kenney Car Kit + palette | copie du kit |

Caches locaux (gitignorés) : `.panoramax-cache/` (1 Go, photos SD),
`.panoramax-cache-hd/` (246 Mo, photos HD), `data/panoramax-inventaire.json`
(76 365 photos inventoriées).

## Méthode de fidélité (éprouvée)

1. **Implanter au sol** (parkings, allées, places) : **orthophoto IGN**
   (`data.geopf.fr` WMS, Licence Ouverte) via curl. Les vues de rue ne
   suffisent pas.
2. **Modéliser une façade** : `npm run mesure` donne la façade sur rue et sa
   normale, `npm run vue` donne la photo. La façade la plus PROCHE du POI
   n'est pas la bonne : les POI de commerce sont posés approximativement,
   souvent dans le bâtiment. La bonne façade est celle que les prises
   Panoramax voient de face.
3. Un commerce modélisé à la main doit être ajouté à `dejaModelises`
   (landmarks.js) ET à la liste d'exclusion de `signage.js`, sinon enseignes
   en double.

## Références visuelles réelles

Artix, Béarn, bassin de Lacq : enduits blancs/crème, tuile rouge-brun
majoritaire, volets bois peints, murets en galets du gave, cités ouvrières
post-1957, saligues (saules, peupliers) le long du gave, platanes taillés en
tête de chat, plaques de rue bilingues français/occitan.
Sources : Panoramax IGN (LO 2.0), orthophotos IGN, Wikimedia Commons
(attribution dans ATTRIBUTIONS.md). Street View / Google Maps sont admis en
appoint (décision d'août 2026, usage strictement personnel) : utiles pour
les bâtiments trop récents pour Panoramax ; les données IGN restent la
référence pour toute géométrie (positions, emprises, hauteurs).

Mode opératoire Street View (imagerie d'Artix : mai 2026, plus fraîche que
Panoramax janv. 2025) : piloter Chrome par le MCP chrome-devtools
(l'extension Claude n'est pas branchée). Ouvrir
`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=LAT,LON`,
lire l'URL résolue (`location.href`) pour la position réelle du panorama,
calculer le cap boussole vers la cible (`atan2(dx, -dz)` en degrés), puis
naviguer vers `@LAT,LON,3a,FOVy,CAPh,88t/...` et capturer. La conversion
jeu→WGS84 : lat = 43.39743 - z/111320 ; lon = -0.57224 + x/80887.

## Conventions

- Tout en français : code commenté, commits, docs. Commentaires : expliquer le
  POURQUOI, chiffres à l'appui.
- Jamais de tiret cadratin dans la prose. Jamais de `Co-Authored-By: Claude`.
- Perf cible : 60 fps sur MacBook Air M4 en profil Équilibré.
- Vérification : `npx tsc --noEmit` (TS) et `node --check` (JS three-city).
- Hook projet : type-check automatique après édition d'un `.ts`.

## Suivi

`JOURNAL.md` : journal de bord par session, à tenir à jour. Il contient les
décisions, les pièges rencontrés et les pistes restantes.
