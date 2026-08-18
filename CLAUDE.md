# CLAUDE.md - Artix Racer

Jeu de voiture 3D dans la ville réelle d'Artix (64170), construit à partir de
données cartographiques OSM et IGN BD TOPO.

## Nature du projet

Projet **personnel, 100 % local**. Pas de production, pas de dépôt Git, pas
d'utilisateur autre que Christophe. Il n'y a rien à sécuriser, aucune donnée
personnelle, aucune surface d'attaque.

Conséquences directes sur la façon de travailler ici :

- ne pas proposer d'audit sécurité, de validation d'input, de gestion de
  secrets, de RGPD, d'authentification ni de CI
- ne pas proposer de tests unitaires ni de suite E2E : la vérification se fait
  à l'écran, pas dans un runner
- ne pas suggérer TypeScript, Next.js, Prisma ni Docker. Ce projet est en
  JavaScript ES modules + Vite, et le reste ainsi
- pas de commit, pas de `git init` (non demandé)

**Le seul critère de qualité est le rendu visuel du jeu.** Fidélité de la ville
d'Artix, qualité des décors, des véhicules, des passants, de la signalisation,
et fluidité à 60 fps sur MacBook Air M4.

## Stack

- **Three.js** 0.170 : rendu 3D, aucun framework par-dessus
- **Rapier** 0.14 (WASM) : physique du véhicule
- **Vite** 6 : serveur de dev sur le port **5180**
- Web Audio API : tous les bruits sont synthétisés. La musique est un fichier
  lu en boucle (`public/audio/music1.m4a`, AAC 104 kb/s, 4,4 Mo), branché sur
  le même bus que la boucle générative qu'il remplace ; celle-ci reste en
  secours si le fichier manque. `MUSIQUE` dans `audio.js` pointe le fichier,
  `null` y revient
- JavaScript ES modules, pas de build step autre que Vite

## Lancer et vérifier

```bash
npm run dev      # http://localhost:5180
npm run build && npm run preview
```

Les données cartographiques sont déjà téléchargées dans `public/data/`. Les
re-télécharger seulement sur demande explicite (`npm run fetch-osm`,
`fetch-bdtopo`, `fetch-poi`) : les requêtes Overpass sont lentes et le résultat
peut varier.

### Vérification visuelle obligatoire

Toute modification du rendu doit être **constatée à l'écran**, jamais supposée.
Utiliser `chrome-devtools` : `navigate_page` vers http://localhost:5180,
attendre la fin du chargement de la ville, puis `take_screenshot`. Comparer
avant/après quand la modification touche l'apparence.

Vérifier aussi la console (`list_console_messages`) : une erreur WebGL ou un
shader qui ne compile pas se traduit par un écran noir, pas par un crash.

`evaluate_script` permet de forcer un état pour la capture : téléporter la
voiture à un point de vue précis, figer l'heure du cycle jour/nuit, désactiver
le HUD. Préférer ça à des screenshots pris au hasard pendant que la voiture
roule.

## Carte du code

| Fichier | Rôle |
| --- | --- |
| `src/main.js` | Boucle de jeu, renderer, caméras, lumières, cycle jour/nuit, HUD |
| `src/world.js` | Construction de la ville : bâtiments, routes, végétation, fusion des maillages |
| `src/osm.js` | Parsing des données OpenStreetMap (`MAX_RADIUS` = rayon de ville chargé) |
| `src/bdtopo.js` | Parsing BD TOPO : hauteurs, matériaux, altitudes des bâtiments |
| `src/terrain.js` | Relief interpolé depuis les altitudes IGN, heightfield physique |
| `src/car.js` | Physique du véhicule (`SPEC` : masse, suspensions, boîte, adhérence) |
| `src/carmesh.js` | Carrosserie par sections transversales (table `SECTIONS`) |
| `src/carmodel.js` | Chargement du GLB de voiture |
| `src/textures.js` | Textures générées en canvas (asphalte, enduit, tuile, herbe) |
| `src/signage.js` | Panneaux, marquage au sol, signalisation |
| `src/pedestrians.js` | Passants et leurs comportements |
| `src/parkedcars.js`, `src/parking.js` | Véhicules stationnés |
| `src/landmarks.js` | Bâtiments remarquables modélisés à la main (mairie, châteaux d'eau) |
| `src/streetlights.js`, `src/accotements.js`, `src/poi.js` | Mobilier urbain, bas-côtés, points d'intérêt |
| `src/audio.js` | Synthèse moteur, bruits de roulement, musique générative |
| `src/quality.js` | Profils graphiques et résolution dynamique |
| `src/spatial.js` | Découpage spatial des maillages instanciés |
| `src/minimap.js` | Dessin de la minicarte du HUD |

## Contraintes de rendu

Le budget de frame est la contrainte dominante : 3 500 bâtiments, 415 arbres,
140 passants, le tout à 60 fps.

- la ville est construite en **maillages fusionnés par matériau**. Ajouter des
  objets un par un ruine les performances : passer par la fusion ou
  l'instanciation (`InstancedMesh`)
- les **ombres portées sont activées par défaut** (touche `O` pour les couper).
  Mesurées au chronomètre GPU le 18/08/2026 : 0,6 ms sur 10 à 12 ms de frame au
  centre-bourg, le volume d'ombre restant resserré autour du véhicule. Le
  « deux tiers du budget » qui figurait ici datait d'avant ce resserrement
- `setPixelRatio` est plafonné à 1.5
- l'anticrénelage passe par **SMAA** (touche `A`), pas par le MSAA. Le
  `antialias: true` du renderer est sans effet à travers le composer, qui rend
  dans ses propres cibles ; et le MSAA y coûte 16 fps dès 2x, la géométrie
  étant trop dense. SMAA retire un quart des bords crénelés pour 0 à 3 fps
- `ACESFilmicToneMapping`, `SRGBColorSpace`, exposition 1.05 le jour / 1.35 la nuit
- aucun asset externe téléchargé au runtime : tout est local ou généré

Avant d'ajouter une passe de post-processing, un shader custom ou de la
géométrie supplémentaire, mesurer d'abord le coût. Une amélioration visuelle
qui fait tomber à 30 fps est un échec.

Une passe d'écran qui a besoin de la profondeur ou des normales doit emprunter
les textures de la passe d'occlusion ambiante plutôt que de les recalculer :
c'est ce qui rend les contours (`contours.js`, touche `K`) gratuits à 0,2 fps.
Attention, ces textures sont en demi-résolution et leurs normales sont en
`HalfFloatType`, donc déjà dans [-1, 1].

La touche `K` active le rendu dessin animé : contours de silhouette et ombrage
en paliers, 2,6 fps au total. Le cel shading quantifie la **luminance** et remet
la teinte au rapport, jamais les trois canaux séparément, sans quoi les teintes
de façade relevées sur photographie virent vers les primaires. Le ciel et les
surfaces très sombres en sont exclus.

## Fidélité à Artix

La ville doit rester **la vraie ville**. Les teintes de façade, la palette de
végétation et la signalisation ont été calées sur des photographies du bourg.

- **ni feu tricolore ni panneau de sens interdit**, tranché le 18/08/2026 :
  aucun des deux n'est cartographié sur la commune, et Christophe le confirme.
  La circulation se règle par stops, cédez-le-passage et ronds-points. Les 12
  feux et 190 sens interdits posés jusque-là étaient déduits, pas lus. Ne pas
  les réintroduire (détail au journal)
- **un objet déduit reste faux s'il est mal placé** : c'est ce qui a perdu les
  sens interdits, dont le tag `oneway` de départ était pourtant réel
- façades **blanc cassé et crème**, pas beige ; ardoise grise très présente en
  centre-bourg ; tuiles brunes et ternes, pas la tuile canal vive du Sud
- ne pas inventer de bâtiment, de rue ou d'équipement absent des données

## Style rédactionnel

Le README est rédigé en français soigné, sans tiret cadratin, sans formules
d'annonce. Toute contribution au README ou aux commentaires de code suit le
même registre. Les commentaires de code sont en français.

## État courant

Véhicule : **Audi R8** (`public/models/AudiR8.glb`), le CarConcept ayant été
supprimé le 18/08/2026. Anticrénelage **SMAA** sous la touche `A`. Ni feu
tricolore ni panneau de sens interdit, les uns comme les autres inventés et
retirés le même jour.

**Profils graphiques** (`quality.js`) : Performance, Équilibré, Qualité sous
la touche `J`, Équilibré par défaut. Ils règlent ensemble pixel ratio, échelle
du GTAO, ombres, brouillard, lampadaires calculés, passants et anticrénelage.
Résolution dynamique sous la touche `U`. Le profil Équilibré reprend les
valeurs qui étaient en dur auparavant : le comportement par défaut est
inchangé.

Performances mesurées le 18/08/2026, profil Équilibré, 2400 x 1024, ombres et
occlusion ambiante activées : **16,9 ms en roulage (59,2 fps)**, 16,6 ms à
l'arrêt. Les trois profils tiennent 60 fps à l'arrêt, Qualité compris alors
qu'il rend quatre fois plus de pixels que Performance : à l'arrêt, la
résolution n'est pas le facteur limitant.

Trois pièges de mesure, tous rencontrés :

- **mesurer sur une page sans sonde.** Un chronomètre GPU par requête ou une
  enveloppe sur `composer.render` coûtent 3 ms et font conclure à 45 fps là où
  le jeu en tient 60. Le compteur du HUD dit vrai
- **comparer à vitesse égale.** Un roulage à 51 km/h contre 72,6 fait paraître
  un gain deux fois plus grand qu'il n'est
- relever `renderer.domElement.width` à chaque série : le `setPixelRatio` peut
  porter le rendu bien au-delà de la fenêtre sans que rien ne le signale

### Restant à traiter

1. **Les à-coups n'ont pas de cause identifiée.** 17,4 % des frames dépassent
   20 ms en roulage, et le p99 reste à 28,8 ms, inchangé par le découpage
   spatial comme par la suppression des allocations. C'est ce qui se sent le
   plus au volant, la médiane étant déjà bonne. Pistes non vérifiées : la
   reconstruction de la carte d'ombre, et les `InstancedMesh` non découpés
   (5 600 instances de fenêtres, 2 800 de mobilier)
2. **Rapier consomme 18,2 % du temps en roulage**, avec 1 243 colliders
   statiques pour 4 corps rigides. Optimisable, mais toucher à la physique
   risque de modifier le comportement de conduite
3. **Panoramax plafonne à 46,9 % des bâtiments** (1 661 sur 3 542) : les autres
   sont en fond de parcelle, hors de vue depuis la voirie. Aucun traitement ne
   changera cette limite
4. **Attribution du modèle Audi à retrouver.** Le fichier a été retraité par
   glTF-Transform et ne porte plus ni auteur ni licence ; le crédit de l'écran
   d'accueil dit « attribution à compléter » en attendant. Il est désormais
   compressé en Meshopt (1,65 Mo contre 7,54)
5. **Chaussée à 0,281 de la clarté d'une façade**, pour une cible
   photographique de 0,47. Pousser plus loin la rendrait plus claire que le
   trottoir : à trancher à l'oeil si le sujet revient
6. **Pertes silencieuses entre donnée et rendu** : 328 arbres plantés sur 415
   relevés, 5 panneaux de priorité, 45 équipements sur 102. Détail et causes
   dans le journal
7. **Les 57 panonceaux d'équipements n'existent pas dans la rue** : choix de
   lisibilité, à trancher si la fidélité prime
8. **Caméra intérieure dégradée** depuis le passage à l'Audi, qui n'a pas
   d'habitacle. Jamais vérifiée à l'écran

### Bâtiments modélisés un par un

Cinq à ce jour, tous dans `landmarks.js` : la Mairie, l'immeuble d'angle
Vapozen / Centre de Beauté Fanny, l'immeuble « Au Comptoir », l'église
Saint-Pierre et la barre de logements « Pyrénées » (avenue Edmond Rostand). La
méthode est rodée : emprise et cap depuis la BD TOPO ou le cadastre OSM par
analyse en composantes principales, hauteurs depuis la photographie.

Un repère qui porte des éléments répétés (baies d'immeuble, contreforts) doit
les **instancier** : la barre Pyrénées coûtait 4,5 fps avec ses 192 fenêtres
ajoutées une par une, contre 1,3 une fois instanciées, pour une géométrie
identique de 2 536 triangles.

Deux mécanismes d'exclusion de l'extrusion automatique selon la source :
`continue` dans `osm.js` (mairie, église), `BATIMENTS_MODELISES` dans
`bdtopo.js` (barre Pyrénées).

Le mètre étalon dépend de ce que montre la photo : une porte standard de 2,05 m
pour les immeubles de rue, la hauteur moyenne BD TOPO pour l'église. Un objet
de premier plan (véhicule garé) sert à contrôler la méthode, jamais à mettre à
l'échelle un bâtiment plus lointain.

Artix compte une seconde église (l'Assomption), laissée en bâtiment ordinaire
faute de photographie.

## Historique des chantiers

`JOURNAL-RENDU.md` garde le détail de chaque chantier de rendu : symptôme
constaté à l'écran, cause réelle une fois mesurée, coût de frame, et fausses
pistes écartées. Le consulter avant de retoucher un poste déjà traité (terrain,
budget de frame, sources de données, éclairage nocturne, véhicule, arbres) :
plusieurs causes évidentes s'y sont révélées fausses à la mesure.
