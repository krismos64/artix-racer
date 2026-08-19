# CLAUDE.md - Artix Racer

Jeu de voiture 3D dans la ville réelle d'Artix (64170), construit à partir de
données cartographiques OSM et IGN BD TOPO.

## Nature du projet

Projet **personnel**, sans production ni utilisateur autre que Christophe. Il
n'y a rien à sécuriser, aucune donnée personnelle, aucune surface d'attaque.

Conséquences directes sur la façon de travailler ici :

- ne pas proposer d'audit sécurité, de validation d'input, de gestion de
  secrets, de RGPD, d'authentification ni de CI
- ne pas proposer de tests unitaires ni de suite E2E : la vérification se fait
  à l'écran, pas dans un runner
- ne pas suggérer TypeScript, Next.js, Prisma ni Docker. Ce projet est en
  JavaScript ES modules + Vite, et le reste ainsi
- le projet est **suivi en Git**, avec un dépôt distant sur GitHub
  (`krismos64/artix-racer`). Le travail se commite sur `main`, sans branche
  intermédiaire. Ne pas commiter de sa propre initiative : Christophe le
  demande quand il le veut

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
| `src/car.js` | Physique du véhicule (`SPEC` : masse, suspensions, boîte, adhérence, propulsion arrière) |
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
| `src/touffes.js` | Touffes d'herbe instanciées autour du véhicule |
| `src/minimap.js` | Dessin de la minicarte du HUD |

## Contraintes de rendu

Le budget de frame est la contrainte dominante : 3 500 bâtiments, 415 arbres,
140 passants, le tout à 60 fps.

- la ville est construite en **maillages fusionnés par matériau**. Ajouter des
  objets un par un ruine les performances : passer par la fusion ou
  l'instanciation (`InstancedMesh`)
- les **ombres portées sont désactivées par défaut** depuis le 19/08/2026
  (touche `O` pour les activer). Mesurées au chronomètre GPU le 18/08/2026 :
  0,6 ms sur 10 à 12 ms de frame au centre-bourg, le volume d'ombre restant
  resserré autour du véhicule. Le choix de les couper n'est donc pas un gain
  de fluidité mais de visibilité en conduite : la tache portée par les
  bâtiments sur la chaussée gênait plus qu'elle n'ancrait la scène au sol
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

**Quatre vues** sous la touche `C` : poursuite, capot, cinématique, aérienne.
La vue intérieure a été retirée le 19/08/2026, l'Audi n'ayant pas d'habitacle.

**Le véhicule ne projette pas d'ombre** depuis le 19/08/2026 : sa tache au sol
décrochait en roulage, la carte d'ombre n'étant pas recalculée à chaque image.
Il en reçoit toujours. Le drapeau se pose sur chaque maillage (`carmodel.js`,
`carmesh.js`, `main.js`), `castShadow` n'étant pas hérité dans Three.js.

**Minicarte redessinée à chaque image** depuis le 19/08/2026, contre deux fois
par seconde auparavant : elle était accrochée au `streetTimer`. Rotation
`PI + cap`, couronne cardinale et cap chiffré. Grille de 240 m dans
`minimap.js`, 353 voies parcourues par dessin ramenées à 150.

**Stationnement en épi à 45°**, non plus en bataille : traits, centres de place
et caps de véhicule dérivent d'un même vecteur directeur. Là où une emprise de
parking borde la voie, le stationnement de rue s'efface (`parkedcars.js`).

**Profils graphiques** (`quality.js`) : Performance, Équilibré, Qualité sous
la touche `J`, Équilibré par défaut. Ils règlent ensemble pixel ratio, échelle
du GTAO, ombres, brouillard, lampadaires calculés, passants et anticrénelage.
Résolution dynamique sous la touche `U`. Le profil Équilibré reprend les
valeurs qui étaient en dur auparavant : le comportement par défaut est
inchangé.

Les profils agissent réellement sur les pixels depuis le 19/08/2026 :
`EffectComposer` gardait le ratio capté à sa construction. Tout changement de
résolution passe par `redimComposer` (`main.js`). Mesuré : 1,00 / 2,26 / 4,02
millions de pixels, 60 fps partout à l'arrêt.

**Chantier visuel du 19/08/2026** (détail au journal) : enrobé, herbe et
marquage refaits ; trottoirs **relevés à 14 cm** avec bordure chanfreinée ;
façades nuancées et salies en pied, vitrages en quatre teintes avec appuis ;
touffes d'herbe de premier plan (`touffes.js`, pool fixe dans 38 m, `alphaTest`,
coupé en profil Performance) ; ciel avec disque solaire et nuages dans le
shader ; eau **opaque** ; véhicules garés **ramenés de 1 400 à 880**.

Performances mesurées le 18/08/2026, profil Équilibré, 2400 x 1024, ombres et
occlusion ambiante activées : **16,9 ms en roulage (59,2 fps)**, 16,6 ms à
l'arrêt. Les trois profils tiennent 60 fps à l'arrêt, Qualité compris alors
qu'il rend quatre fois plus de pixels que Performance : à l'arrêt, la
résolution n'est pas le facteur limitant. Cette mesure date d'avant la
désactivation des ombres par défaut : la config par défaut d'aujourd'hui est
donc au moins aussi rapide, jamais plus lente.

Trois pièges de mesure sont détaillés au journal : mesurer sans sonde, comparer
à vitesse inégale, et oublier de relever `renderer.domElement.width`.

**Chantier texture et instanciation du 19/08/2026** (détail au journal).
Filtrage anisotrope porté de 4/8 à 16 sur toutes les textures générées
(`poserAnisotropie` dans `textures.js`), plafonné par profil graphique.
Enduit et tuile passés de 256 à 512. Vitrages : l'allumage nocturne des
fenêtres passe désormais par un attribut d'émission séparé (`emiCouleur`)
plutôt que par la couleur de sommet elle-même, qui faisait ressortir des
baies « allumées » en clair dès midi. Dormants de fenêtre assombris (1,37
fois la clarté de l'enduit moyen ramené à 1,07), qui perçaient les façades
en aplats blancs vus de la rue.

Le découpage spatial (`spatial.js`) accepte désormais un paramètre `ratios`
et couvre, en plus des arbres, les lampadaires et les véhicules garés (une
grille par famille). Un véhicule garé porte une instance de caisse pour
quatre de roue et deux de chaque feu : c'est ce que `ratios` encode. Le
point 1 du « Restant à traiter » qui listait ces 2 800 instances comme piste
non vérifiée est donc réglé.

Brouillard resserré par profil (aligné sur `distanceDetails` de chacun) :
le pop-in du mobilier lointain se fond dans la brume plutôt que d'apparaître
net à l'écran.

Nouveau grade couleur arcade (`arcade.js`, touche `V`) : contraste,
saturation, vignettage, grain, posé **après** `OutputPass`. Un premier essai
le plaçait avant, sur l'image linéaire non tone-mappée : la chaussée,
presque noire à ce stade, se faisait écraser en noir plein par la courbe de
contraste, conçue pour une image déjà en plage perceptuelle 0-1.

**Véhicule recalé sur l'Audi R8** plutôt que sur la compacte générique dont
`SPEC` gardait les valeurs depuis l'origine du projet : masse, empattement,
voie, couple moteur (courbe de V10 atmosphérique, régime max porté à 8 500)
et synthèse audio (5 impulsions par cycle moteur au lieu de 4, harmoniques
et résonance d'échappement revues en conséquence). Passé de traction avant à
**propulsion arrière**, comme l'Audi R8 réelle : la traction avant héritée
de la compacte saturait l'adhérence des deux seules roues motrices dès
50-70 km/h une fois le couple relevé, empêchant le régime moteur d'atteindre
le seuil de passage de vitesse et bloquant la boîte auto en 2e. Confirmé
résolu en conduite réelle par Christophe, non par mesure automatisée : les
tests au clavier simulé dans cette session ont produit des trajectoires
incohérentes (collisions, positions aberrantes), à ne pas prendre pour
argent comptant sur ce point précis.

### Restant à traiter

1. **Les à-coups signalés le 18/08/2026 (17,4 % des frames à plus de 20 ms,
   p99 à 28,8 ms) n'ont pas été remesurés depuis.** Les `InstancedMesh` de
   mobilier qu'on soupçonnait alors sont désormais découpés spatialement
   (lampadaires, véhicules garés, en plus des arbres), et plusieurs mesures
   de roulage prises le 19/08/2026 dans des scénarios variés (ligne droite,
   virages, centre-bourg dense) sont revenues à 0 % de frames au-dessus de
   20 ms, médiane 16,7 ms. Rien ne prouve que ces deux constats parlent du
   même état du jeu : à reconfirmer par Christophe en conduite avant de
   rouvrir ce point. Les fenêtres restent un maillage fusionné de 25 568
   baies, jamais des instances
2. **Rapier consomme 18,2 % du temps en roulage**, mesuré quand la commune
   portait 1 400 véhicules garés. Ils ne sont plus que 880 depuis le
   19/08/2026, donc autant de colliders statiques en moins : le poste mérite
   d'être remesuré avant d'y toucher. Optimisable, mais toucher à la physique
   risque de modifier le comportement de conduite
3. **Panoramax plafonne à 46,9 % des bâtiments** (1 661 sur 3 542) : les autres
   sont en fond de parcelle, hors de vue depuis la voirie. Aucun traitement ne
   changera cette limite
4. **Attribution du modèle Audi à retrouver.** Le fichier a été retraité par
   glTF-Transform et ne porte plus ni auteur ni licence ; le crédit de l'écran
   d'accueil dit « attribution à compléter » en attendant. Il est désormais
   compressé en Meshopt (1,65 Mo contre 7,54)
5. **Chaussée portée de 0,281 à 0,376** de la clarté d'une façade le
   19/08/2026, cible 0,47. La crainte de dépasser le trottoir était fondée :
   un premier essai l'y portait à 1,26 fois. Détail au journal
6. **Pertes silencieuses entre donnée et rendu** : 5 panneaux de priorité,
   45 équipements sur 102. Détail et causes dans le journal. La perte des
   arbres est **élucidée le 19/08/2026** : `RAYON_MAX = 2000` dans `poi.js`
   écarte les 87 sujets situés entre 2 002 et 2 586 m. Relever le rayon les
   ramène, au coût d'une périphérie plus dense
7. **Les 57 panonceaux d'équipements n'existent pas dans la rue** : choix de
   lisibilité, à trancher si la fidélité prime. Leur écart au commerce annoncé
   est borné à 14 m depuis le 19/08/2026, médiane 9,2 m
8. **Le chantier du 19/08/2026 (minicarte, sol d'herbe, ombres,
   stationnement en épi) n'a été constaté à l'écran par Claude qu'a
   posteriori**, `chrome-devtools` ne se connectant pas ce jour-là : validé
   sur le moment par le calcul et par les captures de Christophe. La passe
   visuelle différée a eu lieu plus tard dans la même semaine, une fois le
   navigateur de nouveau accessible, sans rouvrir de défaut supplémentaire
9. **Sonde `__game.mesureCarte()`**, posée le 19/08/2026, relevée depuis :
   0,06 ms pour un dessin de minicarte, 197 voies parcourues. Le poste est
   confirmé gratuit à l'échelle du budget de frame

### Bâtiments modélisés un par un

Six à ce jour, tous dans `landmarks.js` : la Mairie, l'immeuble d'angle
Vapozen / Centre de Beauté Fanny, l'immeuble « Au Comptoir », l'église
Saint-Pierre, la barre de logements « Pyrénées » et le Leclerc Express. La
méthode est rodée : emprise et cap depuis la BD TOPO ou le cadastre OSM par
analyse en composantes principales, hauteurs depuis la photographie.

**Les enseignes d'OSM peuvent être périmées** : la table `ENSEIGNES_ACTUELLES`
de `poi.js` les corrige sur constat de terrain, et `ENSEIGNES_FACADE`
(`landmarks.js`) pose un panneau sans remodéliser le bâtiment.

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
