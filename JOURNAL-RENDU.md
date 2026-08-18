# Journal de rendu - Artix Racer

Historique des chantiers de rendu : ce qui a été constaté à l'écran, ce qui a
été mesuré, et les fausses pistes écartées en chemin. Le CLAUDE.md ne garde que
les règles permanentes du projet, ce fichier garde le pourquoi.

Chaque section indique le symptôme visible, la cause réelle une fois mesurée
(souvent différente de celle supposée au départ), et le coût de frame constaté.

## Corrigé : le terrain recouvrait la chaussée

Le symptôme visible (chaussée verte) avait **deux causes distinctes**, dont une
seule était géométrique.

**Cause principale, l'éclairage.** La `HemisphereLight` de `main.js` portait un
`groundColor` vert olive (`0x5d6b45`) à intensité 1,15. Une lumière
hémisphérique teinte toute surface horizontale avec sa couleur basse : l'enrobé
gris ressortait vert sombre, au point de passer pour de l'herbe. Remplacé par un
gris légèrement chaud (`0x6e6f60`).

**Cause secondaire, la géométrie.** OSM ne pose un nœud qu'aux changements de
direction : 61 % des segments d'Artix dépassaient le pas du terrain (12,5 m), et
le plus long atteignait 1 216 m. Le ruban de route n'ayant de sommet qu'aux
nœuds, son altitude était interpolée en ligne droite pendant que le sol
continuait d'onduler, et le terrain traversait l'asphalte. Trois corrections :

- `densifier()` dans `world.js` insère un sommet tous les 6 m sur les rubans
  posés sur le relief (5 905 -> 29 151 sommets de route)
- le maillage du sol reprend la grille du terrain (`TERRAIN_RES`) au lieu de
  160 segments codés en dur, sinon il rebombe entre deux nœuds terrassés
- `echantillonner()` et `hauteurNaturelle()` dans `terrain.js` prolongent le
  bord de grille au lieu de retomber à 0 : les routes vont jusqu'à 3 000 m alors
  que le terrain s'arrête à 1 800 m

Dépassement du terrain sur la chaussée, mesuré sur les 902 routes carrossables :
**22,18 m -> 0,15 m** ; points recouverts **1 777 -> 7**, tous sous la garde de
35 cm donc invisibles. Sur le maillage réellement affiché : 2 points à 4,7 cm.

## Optimisation du budget de frame (16/08/2026)

**Le poste dominant n'était pas les ombres mais l'occlusion ambiante.** Le jeu
utilise un `EffectComposer` avec une passe `GTAOPass` (`main.js`), que j'avais
manquée : mes premières mesures instrumentaient `renderer.render`, alors que la
boucle appelle `composer.render()`. `renderer.render` ne pèse que 1,54 ms sur
21,4 ms de frame, soit 7 %.

Mesures isolées, médiane sur 200 frames, fenêtre 1600 x 900 :

| Poste | Coût |
| --- | --- |
| GTAO en pleine résolution | 3,7 ms (49,3 -> 60,2 fps en le coupant) |
| GTAO en demi-résolution | 2,3 ms |
| Rapier `world.step` en roulage | ~3 ms/frame (18,2 % du temps) |
| Type de filtrage et taille de la carte d'ombre | **aucun effet mesurable** |

`PCFSoft` contre `PCF`, 2048² contre 1024² : les quatre combinaisons donnent
20,0 à 20,5 ms. Ni le filtrage ni la résolution de la carte ne comptent ici.

**Appliqué : GTAO en demi-résolution** (`GTAO_ECHELLE = 0.5`). L'occlusion
ambiante est une donnée basse fréquence, la calculer sur deux fois moins de
pixels est indiscernable à l'écran (captures comparées à midi,
`shots/gtao-pleine.jpeg` et `shots/gtao-demi2.jpeg`). Piège rencontré :
`composer.addPass()` redimensionne la passe à la taille du composer multipliée
par le `pixelRatio`, écrasant les dimensions du constructeur. La demi-résolution
doit être imposée **après** `addPass`, et réimposée dans le handler `resize`.

**Appliqué aussi, sans gain de fps :**

- `sun.shadow.autoUpdate = false` avec recalcul déclenché par seuil (6 m de
  déplacement, ou rotation du soleil). La carte n'est plus recalculée que 8 fois
  sur 980 frames au lieu de 100 % : du travail inutile en moins, mais 0 fps
  gagné, le coût des ombres étant du remplissage et non de la construction
- `ground.castShadow = false` via `userData.noShadowCast`, respecté par les deux
  activations en masse de `main.js` (qui retenaient tout maillage de plus de
  5 000 sommets et attrapaient donc le relief de 165 888 triangles)

**Résultat** : 60,2 fps au chargement contre 49,3 avant, 50,8 fps médian en
roulage à 68 km/h. Le fps varie avec le cycle jour/nuit (soleil bas = ombres
plus étendues), les comparaisons doivent donc se faire à heure comparable.

**Piste restante non traitée** : Rapier consomme 18,2 % du temps en roulage,
avec **1 243 colliders statiques pour 4 corps rigides**. Optimisable, mais
toucher à la physique risque de modifier le comportement de conduite.

## Sources de données étendues (16/08/2026)

Trois scripts de récupération, tous sur des sources publiques sous Licence
Ouverte 2.0. Aucune donnée Google n'est utilisée : leurs conditions
d'utilisation interdisent d'en dériver des reproductions, y compris en usage
privé, et Street View ne fournirait de toute façon que des photographies là où
le LiDAR donne de la géométrie mesurée.

**`npm run fetch-lidar`** : forme réelle des toitures.
MNS et MNT LiDAR HD (IGN) en WMS sur `data.geopf.fr`, GeoTIFF 32 bits à
0,5 m/px. Leur différence donne la hauteur du sursol point par point. Le script
échantillonne dans l'emprise de chaque bâtiment et n'écrit qu'une description
compacte (~195 Ko pour 3 537 toitures) plutôt que la grille (576 Mo).

Trois pièges rencontrés, tous corrigés :

- **détection du deux-pans** : un test sur des tranches fixes à 25/50/75 % de
  la largeur classait en monopente la plupart des vrais deux-pans, le faîtage
  d'une maison n'étant jamais exactement centré. Corrigé en cherchant le
  sommet du profil là où il se trouve : 580 -> 1 449 deux-pans
- **végétation surplombante** : le MNS ne distingue pas un arbre du bâti. Une
  remise de 2 m sous un chêne ressortait avec 14 m de couverture et une flèche
  absurde. Écarté par comparaison à la médiane, plus un plafond géométrique lié
  à la largeur du bâtiment
- **conversion vers le rendu** : `world.js` attend `g` gouttière et `f` faîtage
  et calcule lui-même leur écart. Fournir l'écart déjà fait dans `f` en omettant
  `g` produisait un `NaN` silencieux qui cassait la géométrie de toiture

**`npm run fetch-facades`** : teintes de façade réelles.
Panoramax (IGN), panoramiques équirectangulaires 360° de janvier 2025, plaques
et visages floutés à la source. L'API plafonne à 1 000 résultats par requête :
le script tuile la commune en 8x8, ce qui remonte plus de 22 000 photos au lieu
de 1 000. Sur un équirectangulaire, la colonne d'un pixel donne directement son
azimut, ce qui évite tout calcul de projection. Le décodage passe par `sips`
(conversion en TIFF non compressé), pour éviter une dépendance de décodage JPEG.

Résultat : **1 265 façades relevées, dont 843 fiables** appliquées au rendu,
contre 625 auparavant. La bande d'échantillonnage vertical est le réglage
critique : le profil relevé sur les photos d'Artix montre une fenêtre utile
étroite, entre 0,44 et 0,51 de la hauteur d'image. Au-dessus on attrape le ciel
d'hiver, en dessous l'ombre bleutée de la chaussée. Une première version visant
0,38-0,48 produisait 57 % de teintes bleutées ; ramenée dans la bonne fenêtre
avec un rejet des dominantes bleues, il en reste 4 %.

**`npm run fetch-bdtopo`** : l'extraction conserve désormais tous les polygones
d'un MultiPolygon, et non plus le seul premier. Sans effet à Artix (aucun
bâtiment multi-corps dans les données), mais correct si la zone est étendue.

## Modèle de véhicule : pack Kenney essayé et écarté (16/08/2026)

Le Kenney Car Kit (CC0, `~/Downloads/kenney_car-kit`) a été testé en jeu. Il est
techniquement idéal : 2 000 triangles contre 213 000, un seul matériau, roues
nommées séparément (`wheel-front-left`...), 60 fps au lieu de 50.

**Écarté pour raison visuelle.** Le style est cartoon assumé : hauteur sur
longueur de 0,44 à 0,60 selon les modèles, quand une berline réelle est à 0,36 ;
aplats de couleur unis, roues en disques plats, aucun vitrage. Comparé côte à
côte avec le CarConcept (`shots/comparaison-env.jpeg`), l'écart est net. Dans
une ville reconstituée au LiDAR et à la photographie de rue, le contraste est
trop fort.

`chargerVoiture` détecte désormais les deux conventions de nommage de roues :
déposer un GLB Kenney dans `public/models/` et changer `MODELE_VOITURE` suffit à
réessayer.

**Le vrai défaut de la voiture était ailleurs.** La carrosserie ressortait
presque noire parce que ses matériaux de peinture sont déclarés
`metallicFactor = 1` dans le glTF. En PBR, un métal pur n'a pas de couleur
diffuse : il ne restitue que ce qu'il réfléchit. La scène n'ayant aucune carte
d'environnement, la peinture n'avait rien à réfléchir. Corrigé en générant une
petite carte PMREM depuis un dégradé ciel/sol accordé à la scène (`main.js`,
après le dôme de ciel) : la carrosserie retrouve son rouge et ses reflets, sans
asset externe ni coût mesurable.

## Modélisation calée sur photographies de rue (16/08/2026)

Deux panoramiques Panoramax du centre-bourg fournis par Christophe
(`~/Desktop/centre-ville-artix.jpg` et `artix.jpg`) ont servi de référence.
Localisation confirmée par recoupement avec les POI OSM : Vapozen, Centre de
Beauté Fanny, Pharmacie de la République, arrêt de bus « Artix - Mairie » et
mini-rond-point sont tous identifiables sur les images.

**Méthode : raisonner en rapports, pas en valeurs absolues.** Les prises de vue
sont à contre-jour, si bien qu'un volet blanc n'y mesure que 142 de luminance au
lieu de 235. Mais le rapport entre deux surfaces d'une même photo reste vrai.
C'est ainsi que les teintes de chaussée et de trottoir ont été corrigées : le
rendu plaçait l'asphalte à 0,95 de la clarté d'un mur blanc quand la photo le
donne à 0,47, et le trottoir à 0,73 contre 0,32 réels.

Quatre ajouts, tous absents des données et relevés à la vue :

- **Revêtements différenciés** (`texturerPave` dans `textures.js`). Le champ
  `surface` d'OSM était transmis depuis le début par `osm.js` mais n'avait
  jamais été lu au rendu : pavés, béton et gravier ressortaient en enrobé. Le
  pavage du carrefour de la mairie, la plus grande surface pavée de la commune,
  n'est d'ailleurs pas cartographié dans OSM (les seuls `paving_stones` sont à
  380 m de là, sur des cheminements piétons) : son emprise est déclarée dans
  `PLACETTES_PAVEES`. Le découpage se fait segment par segment, une avenue
  traversant le carrefour sans y avoir son point milieu
- **Mobilier urbain** (`signage.js`) : bancs (collectés depuis OSM mais jamais
  rendus), corbeilles, et bornes anti-stationnement. Ces dernières n'existent
  pas dans OSM à Artix (`barrier=bollard` absent) alors qu'elles bordent l'îlot
  du carrefour sur les photos
- **Immeuble d'angle à pan arrondi** (`construireAngleArrondi` dans
  `landmarks.js`) : l'immeuble Vapozen / Centre de Beauté Fanny, avec socle
  commercial sombre, volets battants blancs, corniche débordante et toiture
  d'ardoise. L'extrusion d'une emprise cadastrale en donnait une boîte à arêtes
  vives. L'assise retient le point le PLUS BAS sous l'emprise : sur le terrain
  en pente d'Artix, se caler sur l'altitude du centre laissait le bâtiment
  flotter du côté descendant
- **Cyprès** (`world.js`) : silhouette conique sombre, instanciée, très
  différente des feuillus ronds plantés partout ailleurs

Rendu vérifié à l'écran, 48 à 54 fps.

## Aires de stationnement (16/08/2026)

Photo de référence : `~/Desktop/au comptoir.jpg`, carrefour Au Comptoir /
Leclerc, localisé par recoupement OSM (Au Comptoir, Maison de la Presse, Maison
Chaudron, CPC Invest tous identifiables).

**La requête Overpass ne demandait pas les parkings.** `tools/fetch-osm.mjs`
récupérait routes, bâtiments, nature et barrières, mais jamais
`amenity=parking` : les 127 aires de stationnement d'Artix, soit **10 hectares
d'enrobé**, n'existaient tout simplement pas dans le jeu. Le grand parking
bitumé visible sur la photo est un vide de données, pas un choix de rendu.

Ajouté : la requête, le parsing (`osm.js`, tableau `parkings`), le rendu de la
surface et le marquage des places (`world.js`). Les places sont réparties
perpendiculairement au grand axe de chaque aire, calculé par analyse en
composantes principales, à la largeur réglementaire de 2,5 m.

> **Correctif du 16/08/2026** : ce marquage ne produisait en réalité aucun
> trait, sur aucune des 127 aires. Le défaut n'a été vu qu'en comparant à une
> photo de rue. Voir « Le marquage des places de parking ne fonctionnait pas »
> plus bas.

**Piège de triangulation.** L'algorithme d'oreilles échoue sur 52 des 127 aires
(17 700 m² perdus, un sixième du total) : les emprises OSM comportent des
sommets colinéaires et des angles rentrants. Un repli en éventail depuis le
premier sommet couvre ces cas (triangulation moins propre, mais une surface
plane vue du sol ne demande pas mieux).

Teinte : un peu plus claire que la chaussée (`0x9a9a9f` contre `0x8e8e93`), un
parking étant moins circulé donc moins noirci.

## Immeuble « Au Comptoir » en repère individuel (16/08/2026)

Troisième bâtiment modélisé à la main, après la mairie et l'immeuble d'angle
Vapozen. `construireImmeubleRue` dans `landmarks.js`.

Méthode de relevé, reproductible pour les suivants :

- **emprise et cap depuis la BD TOPO** : bâtiment 1081, 354 m², 39,2 x 11,2 m,
  cap -74,7 degrés, obtenus par analyse en composantes principales du contour
- **hauteurs depuis la photo**, mises à l'échelle par une porte standard de
  2,05 m servant de mètre étalon : rez-de-chaussée commercial à 2,98 m, égout
  de toiture à 6,43 m, faîtage du pignon à 8,76 m. La BD TOPO ne donnait qu'une
  hauteur moyenne de 7,8 m, dont l'extrusion efface tout relief

Éléments que l'extrusion d'emprise perdait : l'avant-corps central en pignon
surmonté d'une lucarne cintrée, la pente réelle des deux pans de toiture, le
contraste entre le socle commercial sombre et l'étage enduit clair, les volets
roulants blancs.

**Piège du sens de rotation** : le cap issu de l'ACP est exprimé dans le repère
des données, alors que Three.js tourne en sens inverse autour de Y. Il faut
appliquer `-cap`, comme le fait déjà la mairie. Sans cela le bâtiment se pose
en travers de la rue.

Coût mesuré : nul (l'écart au masquage est dans le bruit). 44 à 48 fps sur
place.

## Éclairage nocturne (16/08/2026)

La ville était noire la nuit malgré des lampadaires qui s'allumaient. Trois
causes cumulées, toutes mesurées :

- **l'ambiance retombait à 0,3** avec la couleur du ciel nocturne (`0x0a1020`,
  quasi noir) recopiée dans `hemi.color`. Une lumière hémisphérique dont la
  couleur est noire ne renvoie rien : c'était le facteur dominant, bien avant
  les lampadaires
- **8 lumières dynamiques** dans le pool pour 911 foyers, dont 2 seulement
  allumées à un instant donné : dès qu'on roulait, la rue retombait dans le noir
- **portée de 26 m et `decay` 1,7** : la flaque de lumière s'arrêtait au pied du
  mât, alors qu'un éclairage public réel se recouvre d'un point à l'autre

Corrections : plancher d'ambiance à 0,85 avec une couleur qui bascule vers un
bleu nuit (`0x4a5a7e`) au lieu de suivre le ciel, sol qui vire à l'orangé des
lanternes (`0x6b5335`) pour reproduire le rebond chaud d'une chaussée éclairée ;
pool porté à 20, portée à 45 m, `decay` à 1,25 et puissance à 55.

Mesuré : les 20 lampes coûtent **2,4 fps** (50,8 contre 53,2 en les coupant).
Nuit à 50 fps, jour inchangé à 50-54 fps avec son ambiance diurne d'origine.

`window.__game.setHeure(h)` a été ajouté pour sauter à une heure du cycle :
tester l'éclairage nocturne demandait sinon d'attendre que le temps tourne.

## Troncs d'arbres et nettoyage des textures (16/08/2026)

**Le défaut n'était pas le surdimensionnement mais l'inverse.** Le tronc était
un cylindre de rayon fixe (0,26 / 0,34 m) mis à l'échelle uniquement en hauteur
par l'instanciation. Tous les fûts avaient donc le même diamètre quelle que
soit la taille de l'arbre, ce qui donnait sur les grands sujets un élancement
mesuré de **37 pour 1** (hauteur sur diamètre) quand un platane réel tient entre
12 et 18. Ce sont des perches, pas des troncs trop épais.

Quatre corrections dans `world.js` et `textures.js` :

- **rayon proportionnel à la hauteur** : la géométrie est désormais unitaire
  (rayon 1) et l'instanciation fournit rayon ET hauteur. Élancement ramené à
  **10,7 - 15,3** mesuré en jeu, diamètres de 0,57 à 1,09 m pour des arbres de
  8,7 à 11,8 m. Une variation par arbre évite l'alignement de fûts identiques
- **pied évasé** : les sommets du quart inférieur sont écartés en contrefort.
  Un tronc adulte n'attaque jamais le sol en cylindre net
- **8 côtés au lieu de 6**, l'arête hexagonale se lisant franchement au premier
  plan. Coût nul, voir plus bas
- **texture d'écorce** (`texturerEcorce` dans `textures.js`) et **couleur par
  instance** sur les troncs, qui n'en avaient aucune quand les feuillages en
  avaient déjà une : gris-vert du platane contre brun sombre des feuillus

Trois pièges rencontrés :

- **sens de l'étirement du bruit** : pour allonger un motif dans l'axe du
  tronc, c'est la coordonnée X (le tour de tronc) qu'il faut resserrer.
  Écraser Y produit l'inverse, des bandes en travers du fût, aspect de tuyau de
  fonte. Même logique sur `repeat` : `(3, 1)` et non `(2, 3)`, répéter en
  hauteur recoupe les cannelures en tronçons
- **base de la texture** : centrée à 150/255, elle divisait par deux la couleur
  d'instance qu'elle multiplie. Remontée à 210, elle module sans assombrir
- **clarté relevée à la mesure, pas à l'œil** : le défaut ne se voyait qu'à la
  nuit tombée, les troncs ressortant plus clairs que les façades. Mesuré sur
  capture, le platane était à **0,67 de la clarté d'un enduit blanc** quand une
  écorce (réflectance 0,15 contre 0,75) doit tomber vers 0,25. Ramené à 0,28
  pour un tronc hors flaque de lumière

**Coût nul** : les 3 500 troncs à 48 triangles pièce pèsent 0,7 fps au total,
et les masquer entièrement ne change rien de mesurable (56,8 contre 56,5 fps).

**Piège de mesure** : un relevé de fps pris juste après un rechargement donnait
30 fps de façon stable sur trois passes consécutives, contre 57 quelques
secondes plus tard sans qu'aucun code ait changé. La charge de fin de
chargement se prolonge bien au-delà de la première frame : toujours laisser la
scène se poser avant de mesurer.

**Nettoyé au passage** (ancien point 1 du restant) : `texturerAsphalte` et
`texturerHerbe` de `textures.js` étaient du code mort, jamais importées.
`world.js` utilise ses fonctions locales `asphaltTexture` / `grassTexture`, qui
portent des réglages calés sur le rendu (gris volontairement clair contre le
tone mapping, traces de roulement). Les deux exports morts sont supprimés.

Favicon SVG ajouté (`public/favicon.svg`), le 404 a disparu. Console propre.

## Église Saint-Pierre (16/08/2026)

Quatrième repère modélisé à la main, à partir d'une photographie de trois
quarts fournie par Christophe (`Artix_eglise_001.JPG`). C'est le premier
bâtiment pour lequel les trois sources de données se recoupent.

**Relevé, par recoupement de quatre sources :**

- **cadastre OSM** (way 63687376, 93 sommets) : 400 m², longueur 28,6 m,
  cap ACP 30,7 degrés. Le contour est assez détaillé pour livrer
  **6 contreforts par flanc**, entraxe 4,48 m, saillie 0,65 m, largeur 0,80 m,
  ainsi qu'un chevet polygonal de 3,9 m de profondeur. La nef nue mesure
  15,42 m, contre 16,7 m pour la boîte englobante qui inclut les contreforts
- **BD TOPO** : nature « Eglise », 400 m² (identique à OSM), hauteur moyenne
  9,9 m, altitude sol 110,9 m
- **LiDAR HD** : toit à deux pans, gouttière 6,4 m, azimut de faîtage 30 degrés
  (cohérent avec le cap ACP). Le faîtage LiDAR de 11,8 m a été **écarté** :
  le clocher partage l'emprise et contamine la mesure
- **photographie** pour tout ce que les données ignorent : clocher-porche,
  flèche, baies campanaires, médaillon, portail

**Le calage vertical a été le point dur.** Trois tentatives :

1. calage sur la largeur de façade lue sur la photo : donnait une croix à 39 m
   et une nef à 15,7 m de faîtage, absurde pour un bourg. La « façade » mesurée
   était en réalité le clocher plus une portion de rampant de toiture
2. calage direct sur la gouttière LiDAR (6,4 m) : donnait un clocher de 3,86 m
   de côté, trop étroit pour porter deux baies géminées. En cause, le sol au
   pied de la façade n'est pas au plan de la voiture qui sert d'étalon,
   l'église étant sur une plateforme surélevée
3. **retenu** : poser la hauteur BD TOPO (9,9 m) comme mi-hauteur de nef. Donne
   un clocher de 5,06 m de côté, une nef à 8,38 m d'égout et 11,42 m de
   faîtage, une pointe de flèche à 26,3 m et une croix à 28,4 m

La voiture garée au premier plan (Renault Laguna II, 4,58 x 1,44 m) a servi de
contrôle de méthode, pas d'étalon : ses deux échelles concordent (1,44 contre
1,37 cm/px selon qu'on lit la longueur ou la hauteur), ce qui valide la lecture
sans permettre de l'appliquer à un plan plus lointain.

**Quatre pièges de construction, tous constatés à l'écran :**

- **origine du repère local** : le clocher avait été placé en x = 0 alors que
  l'origine est au centre de l'emprise. La nef ne s'étendait que sur une
  moitié, et il ne restait que 4 contreforts sur 12. Corrigé par des bornes
  explicites (`X_CLOCHER`, `X_NEF_OUEST`, `X_NEF_EST`)
- **sens de parcours des triangles** : le pan sud de la toiture tournait dans
  le sens horaire vu de l'extérieur, donc sa normale pointait vers l'intérieur
  et le versant était invisible (`FrontSide` par défaut). Le pignon du chevet,
  triangle isolé sans sens de parcours évident, est passé en `DoubleSide`
- **`ConeGeometry` à 4 segments rend un dôme, pas une pyramide** : les normales
  lissées arrondissent les arêtes. `flatShading` sur le matériau d'ardoise est
  ce qui distingue une flèche d'un clocher à bulbe
- **croupe du chevet trop large** : avec `rChevet + debord`, le cône dépassait
  la demi-largeur de la nef et perçait ses deux pans, laissant un grand
  triangle en saillie

**La nef n'est pas couverte en ardoise.** Mesurée sur la photo, sa toiture
ressort à **1,12 fois la clarté du mur au soleil** et 5 fois celle de la flèche :
c'est une couverture claire, fibrociment ou tôle, et l'ardoise est réservée au
clocher. Les couvrir toutes deux en ardoise écrasait le contraste qui fait lire
le clocher comme un volume distinct.

**Piège de mesure rencontré une fois de plus** : un premier relevé du coût de
frame donnait -5,9 fps, c'est-à-dire que masquer l'église aurait ralenti la
scène. Une mesure alternée A/B/A/B donne **coût nul** (59,2 fps dans les deux
cas) pour 56 maillages et 1 267 triangles.

Artix compte une seconde église (l'Assomption, way 63769143), laissée en
bâtiment ordinaire faute de photographie.

## Barre de logements « Pyrénées », avenue Edmond Rostand (16/08/2026)

Cinquième repère modélisé à la main, et le premier immeuble collectif du jeu.
Photo de référence : vue Panoramax du 13 janvier 2025 fournie par Christophe,
conservée dans `refs/avenue-edmond-rostand.png`.

**Le bâtiment le mieux documenté du lot.** La BD TOPO livre ici des attributs
que les quatre précédents n'avaient pas :

- bâtiment 2150 : 555 m², 62,36 x 9,20 m, cap 22,2 degrés
- **3 étages et 24 logements déclarés**, ce qui fixe le découpage en niveaux
  sans avoir à le déduire de la photo
- LiDAR HD : **monopente** (forme 1), gouttière 10,1 m, faîtage 11,8 m

**Le LiDAR a corrigé une lecture erronée de la photo.** La vue en enfilade
suggérait une toiture à deux pans ; c'était la perspective. Le versant est
unique et descend vers la rue, ce que seule la donnée pouvait trancher, la
photo étant prise du trottoir et ne montrant que le débord.

**Orientation : la donnée tranche aussi.** Marquises, enseigne et point bas de
la monopente avaient été placés côté z positif du repère local. Mesuré, ce
flanc est à 37,4 m de l'axe de l'avenue contre 22,1 m pour l'autre : la rue est
côté z négatif. Corrigé par une constante `Z_RUE` plutôt qu'un signe recopié à
cinq endroits.

**Un comptage de baies sur photo peut être inexploitable.** La vue est si
rasante que l'entraxe apparent passe de 226 à 22 pixels d'un bout à l'autre du
cliché : la détection automatique des creux de luminance donnait cinq baies aux
espacements incohérents. La trame vient donc de la donnée, 24 logements sur
3 niveaux à deux baies chacun, soit 16 travées et 3,9 m d'entraxe.

**Le premier repère dont le coût de frame était réel.** Contrairement aux
quatre autres, mesurés à coût nul, celui-ci pesait **4,5 fps pour seulement
2 536 triangles**. Le poste dominant n'était pas la géométrie mais le nombre
d'appels de dessin : 16 travées sur 3 niveaux et deux façades font 96 baies,
soit 192 maillages ajoutés un par un, plus 12 pour les entrées.

Instanciation des baies puis des entrées : **214 maillages -> 15**, coût
**4,5 fps -> 1,3 fps**. C'est la règle du CLAUDE.md sur la fusion et
l'instanciation, qui vaut aussi pour un bâtiment isolé dès qu'il porte des
éléments répétés.

**Piège de mesure, encore.** Trois séries courtes sur le même code ont donné
2,1 puis 5,8 fps de coût. Il a fallu 6 alternances de 300 frames pour obtenir
une valeur stable à 1,3 fps : ce point de vue est proche d'un lotissement dense
où le fps dérive, et une alternance A/B trop courte y est sans valeur.

**Teintes**, mesurées par rapport de luminance : crème chaud (208, 192, 154)
nettement plus chaud que le blanc cassé du centre-bourg, soubassement ocre à
0,96 de la clarté du mur mais bien plus saturé (chromaticité rouge 0,417 contre
0,375). La toiture n'a pas pu être relevée : les deux essais retombaient sur du
ciel (chromaticité bleue 0,44 et 0,37 contre 0,278 pour le mur), la monopente
n'étant pas visible depuis la rue. Traitée en tuile brune selon le CLAUDE.md.

Éléments relevés à la vue, absents de toute donnée : bandeaux saillants entre
niveaux, soubassement ocre, marquises d'entrée en charpente métallique, et
l'enseigne verticale « PYRÉNÉES » sur potence qui donne son nom à la résidence.

Les bâtiments modélisés à la main issus de la BD TOPO sont désormais écartés de
l'extrusion automatique par `BATIMENTS_MODELISES` dans `bdtopo.js`, sur le
modèle du `continue` déjà utilisé dans `osm.js` pour la mairie et l'église.

## Porches d'entrée de la barre Pyrénées (16/08/2026)

Seconde vue Panoramax de l'avenue Edmond Rostand (8 janvier 2025, prise dans
l'autre sens), conservée dans `refs/avenue-edmond-rostand-2.png`. Elle montre
en gros plan un hall d'entrée que la première vue ne donnait que de loin.

**La marquise métallique était fausse.** Modélisée d'après la première photo
comme une dalle plate sur poteaux, l'entrée est en réalité un **porche maçonné**
en avant-corps : deux joues de mur enduit portant un appentis de tuiles à
gouttière débordante, avec une menuiserie blanche toute hauteur au fond (double
vantail encadré de panneaux vitrés fixes) et un seuil béton.

Proportions relevées sur le zoom du hall, la menuiserie servant de mètre étalon
(porte 2,05 m plus imposte, soit 2,4 m) :

- hauteur sous la sous-face de l'auvent : **2,53 m**
- répartition en largeur : une joue occupe 0,21 de la largeur du porche, la
  menuiserie 0,55, soit 0,86 m pour 2,30 m

**Une intuition prise à revers par la mesure.** Le premier rendu donnait des
joues qui paraissaient trop massives ; la photo montre l'inverse, elles étaient
deux fois trop étroites (0,42 m contre 0,86 m relevés). Retenu 0,7 m, la prise
de vue oblique écrasant la joue éloignée (85 pixels contre 110).

**Piège géométrique** : l'auvent flottait au-dessus des joues, laissant voir la
façade entre les deux. Une boîte centrée sur la saillie du porche ne touche pas
le mur ; il faut l'adosser à la façade et ne la faire déborder que vers l'avant,
son centre décalé de la moitié du débord.

**Ce qui n'a pas été modélisé, faute d'ancrage.** La photo montre aussi une
seconde barre au fond du parking, une haie de thuyas dense et un cèdre bleu.
Aucun n'a été placé : Panoramax n'affiche pas l'azimut de prise de vue sur la
capture, et plusieurs barres du quartier (2119, 2149, 1908, 1895) sont
candidates sans qu'on puisse trancher. La haie n'existe dans aucune donnée
(zéro `barrier` dans un rayon de 160 m), et la poser au jugé contreviendrait à
la règle de fidélité. Ces éléments attendent une vue dont l'orientation soit
déterminable.

Coût inchangé après ajout du porche détaillé : **16 maillages, 1,7 fps**,
l'instanciation étant préservée.

## Le marquage des places de parking ne fonctionnait pas (16/08/2026)

Signalé par Christophe sur une troisième vue Panoramax de l'avenue Edmond
Rostand (`refs/rostand-parking.png`, 8 janvier 2025) : les voitures y sont
garées **en épi le long de l'alignement de platanes**, nez vers l'immeuble, la
voie de circulation passant entre le parking et la barre.

**Le marquage ne produisait aucun trait, nulle part.** Pas seulement sur ce
parking : sur les **127 aires d'Artix**, l'algorithme calculait des traits et
les rejetait tous. Le journal présentait pourtant cette fonction comme acquise
depuis son ajout.

La cause est géométrique. Le code cherchait les places aux deux **bouts** du
grand axe, en traçant des traits de `[uMin, uMin + LONG_PLACE]` et
`[uMax - LONG_PLACE, uMax]` pour chaque valeur de v. Or `uMin` et `uMax` sont
les extrêmes de la boîte englobante ACP : sur une emprise oblique, ils ne sont
atteints **qu'en un seul coin**. Un trait posé à `u = uMin` sort donc de
l'emprise pour presque toutes les valeurs de v, et le test d'appartenance le
rejette. Sur le parking de l'avenue Edmond Rostand : douze traits calculés,
douze rejetés.

**Correction.** Les places bordent les deux **grands côtés** de l'aire, pas ses
extrémités : c'est ainsi qu'on gare en épi le long d'une voie. Pour chaque
abscisse u le long du grand axe, on cherche le bord réel en balayant v depuis
chaque côté jusqu'à entrer dans l'emprise, puis on trace le trait de séparation
depuis ce bord vers l'intérieur. Une boîte englobante ne suffit pas dès que
l'aire n'est pas un rectangle aligné, d'où le balayage par pas de 25 cm.

Résultat sur l'ensemble des parkings d'Artix :

| | Avant | Après |
| --- | --- | --- |
| Traits de marquage | **0** | 4 288 |
| Aires marquées | 0 | 114 sur 117 |

Les 3 aires restantes sont trop petites ou trop irrégulières pour porter une
rangée lisible.

**Coût mesuré : 1,5 fps** pour 8 576 triangles, sur 8 alternances de 300 frames
après une passe de chauffe. Une première mesure sur 4 alternances donnait un
coût de **-12,2 fps**, c'est-à-dire que masquer le marquage aurait ralenti la
scène : la série contenait deux valeurs à 20 fps au lieu de 39. Troisième
occurrence du même piège dans ce projet.

**Deux soupçons infondés, écartés par la mesure** avant d'être corrigés à tort :

- le sol semblait recouvrir le parking. Vérifié sur 91 points de l'emprise,
  l'écart médian entre sol naturel et surface terrassée est de **-0,31 m** et
  aucun point ne dépasse : le terrassement fonctionne
- l'emprise semblait mal placée, les marquages tombant sur de l'herbe. Elle est
  en réalité correcte, entre 7 et 18 m de la rue et 23 à 35 m de la barre ;
  c'est l'enrobé qui est peu contrasté sous cet éclairage

## Places fantômes et voitures en travers (16/08/2026)

Deux défauts signalés par Christophe sur une capture du jeu
(`refs/rostand-parking-2.png`), après le correctif de marquage précédent.

**Des places de stationnement là où il n'y en a pas.** Le correctif marquait
systématiquement les **deux** grands côtés de chaque aire. Or l'emprise OSM de
l'avenue Edmond Rostand (15,6 m de large) englobe le parking **et sa voie de
desserte** : son bord opposé passe à 5,2 m de la barre de logements, et des
places apparaissaient sur la bande enherbée au pied de l'immeuble.

Critère retenu : une rangée occupe la profondeur d'une place, et il faut encore
une voie de circulation pour la desservir. En dessous de deux rangées plus une
voie (16 m), l'aire n'en porte qu'une seule, adossée à son bord le plus long.

Répartition sur les 127 aires d'Artix : **61 assez larges pour deux rangées, 56
ramenées à une seule**, 10 écartées comme trop petites.

Deux critères ont été essayés et abandonnés avant celui-là :

- **distance au bâti** : la barre est un repère modélisé à la main, donc retirée
  de `data.buildings` par `BATIMENTS_MODELISES`. Aucun bâtiment n'est détecté
  près de ce bord
- **distance à la route** : les deux bords sont à 7,1 et 7,2 m de la voie
  carrossable la plus proche, la desserte du parking n'étant pas cartographiée
  comme route. Le critère ne discrimine pas

**Des voitures garées en travers des places.** Les véhicules de ce parking
venaient de `trouverPlaces` (stationnement le long des rues), qui les aligne
dans l'axe de la voie : ils se rangeaient donc perpendiculairement aux places
qu'on venait de marquer.

`parking.js` savait déjà produire des places en épi, mais à partir de bandes
déduites des **bâtiments**, pas des emprises OSM : deux systèmes distincts qui
s'ignoraient. Les aires OSM émettent désormais leurs propres places en épi
(`placesEpi`), transmises au même mécanisme `supplement` de `VoituresGarees`.
Le cap vient de la normale au bord de l'aire, et une place sur deux reste vide.

Ce mécanisme donne aussi la priorité aux places d'appoint sur le stationnement
de rue : les voitures qui s'alignaient le long de la barre ont disparu d'
elles-mêmes.

Vérifié à l'écran : voitures en épi côté platanes, bande enherbée nette au pied
de l'immeuble. **49 fps** médian sur place.

## Contours de silhouette, essai concluant (16/08/2026)

Christophe demandait s'il était possible et coûteux de styliser le rendu vers
le dessin animé. Essai comparatif fait sur les seuls contours, sans toucher aux
couleurs : c'est la partie de la stylisation qui **renforce** la fidélité au
lieu de l'altérer, puisqu'elle souligne la géométrie relevée au lieu de
quantifier l'éclairage.

**Coût mesuré : 0,2 fps.** C'était l'enjeu du choix d'architecture : la passe
emprunte les textures de profondeur et de normales que la passe d'occlusion
ambiante calcule déjà, et n'ajoute donc aucun rendu de géométrie. Une passe
autonome aurait redessiné toute la ville dans un tampon de normales.

Touche `K` pour basculer. `src/contours.js`, inséré entre GTAO et OutputPass :
avant le mappage de tons, sinon le trait ressort d'un noir plat qui tranche
avec la scène.

**Trois erreurs, toutes révélées par un écran entièrement noir :**

- **résolution d'échantillonnage** : l'uniform annonçait la taille écran
  (2400 x 1030) alors que les textures empruntées sont en demi-résolution
  (1200 x 515). Le pas était deux fois trop petit et le shader lisait quatre
  fois le même texel au lieu de comparer des voisins
- **écart brut au lieu de courbure** : sur une surface plane vue de biais (une
  chaussée en enfilade), la profondeur varie fortement d'un pixel à l'autre
  sans qu'il y ait d'arête. La dérivée seconde, elle, s'annule sur un plan quelle
  que soit son inclinaison et ne réagit qu'aux vraies ruptures
- **décodage des normales** : la cible de la GTAO est en `HalfFloatType`, donc
  déjà dans [-1, 1]. Le `* 2.0 - 1.0` d'usage (valable pour une cible en octets
  non signés) les projetait hors domaine. Symptôme caractéristique : le
  détecteur donnait 44 à 47 % de pixels noircis **quel que soit le seuil**, de
  0,05 à 1,5

**Méthode de réglage.** Les seuils ont été fixés par balayage en mesurant la
part de pixels sombres du canvas, pas à l'œil : 26,9 % sans contours sur la vue
de l'église, contre 67,6 % à un seuil de profondeur de 0,0006. Retenu 0,015 en
profondeur et 0,15 en normales, soit environ un point de pourcentage ajouté.

**Piège de comparaison** : la première paire de captures avant/après était
inexploitable, le cycle jour/nuit ayant tourné pendant les mesures (l'une prise
à midi, l'autre au crépuscule depuis un autre point de vue). Les deux prises
doivent s'enchaîner sans délai, heure figée.

Reste à décider : ajouter ou non un ombrage en paliers. Il donnerait un effet
dessin animé plus franc mais écraserait les teintes de façade mesurées sur
Panoramax, ce que les contours seuls préservent intégralement.

## Les fenêtres du bâti ordinaire étaient invisibles (16/08/2026)

Christophe hésitait sur les contours, trouvant que « le rendu de la ville n'est
pas super », et se demandait s'il manquait des couleurs prononcées.

**Ce n'était pas une question de couleurs.** Les contours avaient bien marché
sur l'église, qui a de la géométrie à souligner, mais ne pouvaient rien sur le
bâti ordinaire, dont les façades étaient entièrement aveugles. Saturer les
teintes n'aurait rien réglé : une boîte orange vif reste une boîte.

**Trois causes cumulées, dont deux découvertes après des hypothèses fausses.**

Le diagnostic a demandé quatre passes, chacune infirmant la précédente :

1. j'ai d'abord cru que les fenêtres n'existaient pas. Elles existaient
   (`world.js`, ligne 922), tout comme le débord de toiture
2. puis que le filtre les rejetait. Il en rejetait 69 %, mais pas celles du
   lotissement testé
3. puis que le contraste était insuffisant, le vitrage sombre se confondant
   avec l'ombre du mur. Un test en forçant `depthTest = false` et une couleur
   rouge a montré qu'elles étaient **partout**, donc simplement masquées
4. la vraie cause : **la normale de façade pointait vers l'intérieur**

**Le défaut principal, l'orientation des normales.** Le sens de `nx = dz/len,
nz = -dx/len` dépend de l'ordre des sommets du contour, qui n'est pas garanti
d'un bâtiment à l'autre dans les données. Sur ceux tracés en sens horaire, le
décalage de 4 cm enfonçait fenêtres et dormants **dans** le mur, où ils étaient
masqués. Corrigé en testant le produit scalaire avec la direction du centroïde.

**Deux défauts secondaires, corrigés au passage :**

- **la couverture mangeait le mur** : 1 177 bâtiments sur 2 119 se retrouvaient
  au plancher de 2,2 m de mur, dont un hangar de 9,8 m à qui le relevé
  attribuait 11,5 m de toiture. Un pavillon de 4,7 m recevait 2,2 m de toiture,
  d'où les pyramides écrasantes du lotissement. Bornée à 40 % de la hauteur
  pour les bâtiments de moins de 400 m², les grands volumes agricoles gardant
  leur relevé
- **le nombre de niveaux ignorait la hauteur du mur** : la BD TOPO compte
  parfois les combles comme un étage, et empiler 3 niveaux sur 2,5 m de mur
  donnait des fenêtres tous les 83 cm, toutes rejetées ensuite

Seuil de mur abaissé de 2,8 m à 2,4 m, avec allège et hauteur de baie
proportionnelles au niveau : une maison de plain-pied béarnaise a 2,5 m sous
plafond, et l'exiger à 2,8 privait d'ouverture les deux tiers du bâti.

**Ajouté : le dormant.** Un encadrement blanc cassé autour de chaque vitre, en
maillage fusionné séparé. C'est lui qui rend la baie lisible de loin, bien plus
que la teinte du vitrage. Le `metalness` du vitrage est aussi passé de 0,35 à
0,08, même piège que la carrosserie de la voiture : en PBR, un métal sans carte
d'environnement forte ne restitue rien et ressort noir mat.

**Résultat** : de 566 à 1 718 bâtiments avec fenêtres, soit 81 % du bâti contre
27 %. Les 401 restants sont de très petites annexes, ce qui est correct.

**Coût : nul.** 102 272 triangles de vitres et dormants, fusionnés en deux
maillages, à **59,9 fps** contre 46-54 habituellement.

## Cel shading ajouté au rendu dessin animé (16/08/2026)

Ajouté dans la même passe que les contours (`contours.js`), sous la même touche
`K`, avec un indicateur au HUD.

**La contrainte de départ.** Une passe d'écran ne reçoit que l'image déjà
éclairée, pas le produit lumière-normale dont se sert un cel shading classique.
La quantification porte donc sur la **luminance**, la teinte d'origine étant
remise par-dessus au rapport :

    aplat = teinte * (luminanceQuantifiée / luminance)

Quantifier les trois canaux séparément aurait décalé les couleurs vers les
primaires et détruit les teintes de façade relevées sur photographie.

**Six paliers, pas trois.** La valeur classique du cel shading efface les écarts
de teinte mesurés : deux façades voisines s'y confondent. Six laissent lire
l'aplat tout en préservant la hiérarchie relevée. Le dosage est à 0,75, donc
l'aplat se mélange à la nuance continue plutôt que de la remplacer.

**Deux artefacts, corrigés après constat à l'écran :**

- **bande dans le ciel** : le dôme est un dégradé très progressif sur toute la
  hauteur de l'image, où le moindre palier trace une frontière nette qui suit
  sa courbure. Le ciel est désormais exclu de la quantification, par la même
  borne de profondeur qui empêchait les contours de cerner l'horizon
- **chaussée écrasée en noir** : quantifier une surface à 0,08 de luminance la
  ramenait au premier palier, lui faisant perdre marquage et nuances d'usure.
  Un `smoothstep(0.06, 0.16, lum)` préserve les valeurs sombres

**Coût mesuré : 2,6 fps** pour l'ensemble contours plus paliers, dont 0,2 pour
les contours seuls. Vérifié de jour et de nuit.

**Piège de mesure, à nouveau.** Une première série donnait des valeurs entre 47
et 36 fps sans raison apparente : le cycle avait tourné jusqu'à 19,6 h, et le
soleil bas étend les ombres. Toute comparaison de fps doit forcer l'heure à
chaque mesure, pas seulement au début de la série.

## Chaussée huit fois trop sombre (16/08/2026)

Signalé par Christophe : « les routes sont beaucoup trop sombres ». Mesuré sur
capture, l'enrobé ressortait à **0,06 de la clarté d'une façade blanche** quand
le calage photographique documenté vise **0,47**. Ce n'était pas une question
de goût mais un écart de facteur huit par rapport à la référence.

**Le calage n'avait jamais été vérifié à l'écran.** La teinte `0x8e8e93` avait
été choisie d'après un rapport relevé sur photographie, sans mesure du rendu
obtenu. C'est le même piège que les places de parking, documenté comme acquis
sans avoir jamais fonctionné.

**Deux causes cumulées, isolées par balayage :**

- **l'albédo**. En linéaire, la texture d'asphalte (`#c4c4ca`, soit 0,552)
  multipliée par la couleur du matériau (`#8e8e93`, soit 0,270) donne 0,149,
  quand une façade atteint 0,744. Rapport d'albédo : 0,20
- **l'éclairage**. Un balayage de la couleur de chaussée jusqu'au blanc pur
  plafonnait à **0,18** : la couleur seule ne pouvait pas atteindre la cible.
  Une surface horizontale ne voit presque pas le ciel, elle reçoit surtout la
  composante basse de la lumière hémisphérique, dont le `groundColor` était un
  gris-vert sombre (`0x6e6f60`)

**Corrections** : couleur de chaussée portée à `0xd0d0d6`, et rebond du sol à
`0x9a9a92`. La teinte du rebond reste neutre et à peine chaude, un rebond
verdâtre ayant autrefois teinté l'enrobé au point de le faire passer pour de
l'herbe.

**Résultat** : rapport de **0,063 à 0,281**, la chaussée passant de
RGB(14,13,10) à RGB(59,58,58). Reste en deçà de la cible de 0,47, mais le gris
obtenu se lit comme un enrobé et non plus comme un trou noir ; pousser plus
loin donnerait un asphalte plus clair que le trottoir.

Vérifié de jour au lotissement et au centre-bourg, et de nuit où la chaussée
redevient sombre comme elle le doit, la transition vers l'orangé des lanternes
étant préservée. **50,3 fps**, inchangé.

**Deux fausses pistes écartées en chemin**, chacune par la mesure :

- les ombres portées : couper `shadowMap` ne changeait pas la valeur d'un
  pixel
- un maillage qui recouvrirait la chaussée : l'inventaire des maillages sous le
  point visé montrait bien l'enrobé au-dessus

## Charpente des arbres et couronne en lobes (18/08/2026)

Dernier point ouvert de la végétation : la couronne était un icosaèdre nu posé
au-dessus du fût, sans rien qui relie les deux. Constaté à l'écran, le défaut
s'est révélé plus large que ce qu'annonçait le restant à traiter.

**Trois défauts sur la même capture**, avant toute modification :

- **le fût traversait la couronne** et ressortait au-dessus comme un mât de
  parasol. Le commentaire du code affirmait pourtant que le fût montait « sans
  la traverser » : avec un sommet à 0,86 de la hauteur et une couronne centrée
  à 1,02 puis aplatie à 0,55, le calcul donne un fût qui dépasse. Le
  commentaire décrivait l'intention, pas la géométrie obtenue
- aucune branche entre le fût et le houppier
- sur les sujets d'alignement, l'aplatissement à 0,55 réduisait la couronne à
  une galette hexagonale

**Couronne en trois lobes décalés.** Un lobe principal de rayon 0,82 et deux
lobes secondaires de 0,62 et 0,58, fusionnés en une géométrie unitaire unique
et subdivisés une fois. Chaque sommet est ensuite tiré le long de sa normale
par un bruit stable, ce qui creuse la surface sans ajouter de géométrie. La
couronne passe de 20 à 240 triangles. Une rotation propre à chaque arbre évite
que les lobes se présentent partout sous le même angle.

**Charpente instanciée.** Cinq branches en troncs de cône effilés, angles et
longueurs irréguliers, partant du sommet du fût. Géométrie unitaire séparée de
50 triangles, montée en `InstancedMesh` avec le matériau d'écorce, la couleur
d'instance étant recopiée depuis le tronc pour qu'aucune charpente ne détonne
avec son fût. Mesuré : les branches montent 2,5 m dans le feuillage sur un
arbre de 9 m, donc elles mordent réellement dans la couronne au lieu de
s'arrêter à sa surface.

**Fût raccourci** de 0,86 à 0,62 de la hauteur pour l'arbre d'alignement, de
0,85 à 0,55 pour l'arbre libre, et couronne abaissée de 1,02 à 0,84 et de 0,92
à 0,76. Le calcul du recouvrement, fait avant de retoucher les valeurs à l'oeil,
montrait un recouvrement négatif de 0,15 m sur le sujet d'alignement : le fût
s'arrêtait avant le feuillage.

**Coût : sous le seuil de mesure.** Trois alternances visible / masqué donnent
un écart qui change de signe d'une série à l'autre, entre -1,2 et +1,6 fps. À
la résolution testée, la scène est limitée par le remplissage de pixels, pas par
la géométrie. Cohérent avec le chantier des troncs, où masquer les 3 500 fûts
entiers ne changeait rien de mesurable.

**Vérifié** de jour, de nuit sous les lanternes, en rendu dessin animé et sur
des arbres lointains. Les contours de la touche `K` cernent la silhouette et la
fourche sans produire de fouillis de traits, l'écartement des branches restant
modeste. Aucun scintillement à distance.

**Deux pièges de mesure rencontrés :**

- **la taille du canvas.** Un fps de 30 au lieu des 50 documentés a d'abord
  semblé venir de la charpente. Le canvas faisait 2400 x 1035 : le
  redimensionnement de fenêtre par l'outil, combiné au `setPixelRatio` de 1,5,
  donnait 1,7 fois plus de pixels que le 1600 x 900 de référence. Toute mesure
  doit commencer par relever `renderer.domElement.width`, la taille de fenêtre
  demandée ne suffit pas. À noter : `setSize(1600, 900, false)` ne corrige rien,
  le pixelRatio s'appliquant par-dessus
- **la clarté des branches jugée à l'oeil.** De nuit, la charpente paraissait
  plus claire que son fût. Mesurée sur capture, elle ressort à 8,9 de luminance
  contre 14,6 à 19,8 pour le fût, donc plus sombre. L'impression venait d'une
  lanterne proche. Même piège que les photographies à contre-jour

**Note sur la lecture de pixels** : `getImageData` sur le canvas WebGL renvoie
du noir, le buffer n'étant pas préservé. Les clartés se mesurent sur le fichier
de capture, pas sur le canvas en direct.

## Audi R8 mise en place, CarConcept supprimé (18/08/2026)

Le restant à traiter décrivait des roues invisibles dont « les coordonnées sont
portées par la géométrie et non par la translation des noeuds ». Vérification
faite sur le fichier, **ce diagnostic était faux sur les deux points**.

**Ce que contient réellement le GLB.** Les quatre noeuds `WheelFrontL/R` et
`WheelRearL/R` existent, portent les bons enfants (7 maillages chacun : pneu,
jante, écrous, moyeu, logo, disque, étrier) et **une translation correcte** :
voie de 1,744 m, empattement de 2,606 m. Les géométries enfants sont centrées
sur l'origine. Une conversion antérieure avait donc déjà fait le travail.

**Le calage vertical est exact aussi**, recalculé hors du navigateur : échelle
0,9627, bas des pneus à -0,670 pile (la cible `ANCHOR_Y - wheelRadius`), garde
au sol de 12,5 cm, qui est la valeur d'une R8 réelle.

**Les roues ne manquaient pas, elles étaient hors de vue.** Masquer la seule
carrosserie les fait apparaître, complètes et bien placées. À l'aplomb d'une
roue, `Body_Plane` couvre de Y=0,131 à Y=1,198 quand la roue va de 0,002 à
0,656 : l'aile en recouvre 80 %, et les 13 cm qui dépassent sont masqués de
face par un bas de caisse plus large que la voie. En caméra cinématique ou de
trois quarts, les roues sont parfaitement visibles.

**Les proportions du modèle sont fidèles**, ce qui interdisait de « corriger »
la voie : débord de carrosserie de 0,147 m par côté contre 0,151 m sur la R8
réelle, et rapport diamètre de roue sur longueur de 0,1478 contre 0,1479. Tout
écartement des roues aurait dégradé un modèle juste.

**Fausse piste écartée en chemin** : le double face. Les matériaux sont forcés
en `FrontSide` par le chargeur, ce qui pouvait faire soupçonner des normales
inversées. Repasser les 36 matériaux de roue en `DoubleSide` ne change rien à
l'écran.

**Piège de mesure, une variante nouvelle.** Une boîte englobante prise en
coordonnées monde sur un véhicule **incliné** (pitch de suspension, cap non
aligné sur les axes) est gonflée par l'orientation : la carrosserie ressortait
à 2,464 m de large contre 2,038 m réels, soit 20 % de trop, ce qui a orienté le
diagnostic vers une fausse piste. Toute cote de véhicule doit être mesurée en
repère local, en transformant chaque boîte de géométrie par la matrice relative
au conteneur.

**Deux corrections tout de même apportées au chargeur :**

- **calage sur le bas des pneus** plutôt que sur le bas de la boîte globale. Le
  résultat est identique sur ce modèle, les pneus y étant déjà l'élément le
  plus bas, mais un bas de caisse ou un échappement modélisé bas ferait
  autrement plonger la voiture dans la chaussée
- **poste de conduite déduit du gabarit** quand le modèle n'a pas de volant.
  L'Audi est une carrosserie extérieure seule, sans habitacle : les cotes en
  dur héritées du CarConcept y plaçaient la caméra intérieure n'importe où

**CarConcept supprimé** (`public/models/CarConcept.glb`, 11,8 Mo), crédit de
l'écran d'accueil et commentaires de `carmodel.js` mis à jour. Le fichier
`voiture.glb`, plus ancien et référencé nulle part, est laissé en place.
`MODELE_VOITURE` dans `main.js` pointe désormais sur l'Audi.

**48,9 fps** mesuré une fois la scène posée, sur un canvas de 2205 x 1035, donc
au moins équivalent au relevé de référence. Console propre.

**Attribution à compléter** : le fichier a été retraité par glTF-Transform et
ne porte plus ni auteur ni licence. Le crédit affiché dit « attribution à
compléter » en attendant la source exacte.

## Les douze feux tricolores étaient inventés (18/08/2026)

Le log de chargement annonçait `"feux": 12` alors que CLAUDE.md affirmait
qu'Artix n'en compte aucun. La contradiction méritait d'être levée avant tout
autre chantier.

**Le code n'en lisait aucun.** `signage.js` ne consultait pas les données : il
parcourait les routes à la recherche de carrefours entre deux voies de plus de
7 m, en retenait six espacés d'au moins 120 m, et y posait un bloc par sens,
soit douze. Le commentaire assumait l'invention en s'appuyant sur des
photographies de rue.

**Les données sont formelles, sur trois vérifications convergentes :**

- **zéro occurrence** de `traffic_signals` dans les six fichiers de
  `public/data/`
- la requête de collecte (`tools/fetch-poi.mjs`) demandait pourtant bien ce tag,
  en première position de la liste. Ce n'était donc pas un oubli de collecte,
  et la preuve est dans le résultat : la même requête, le même lot, a ramené
  169 passages piétons, 66 stops, 20 cédez-le-passage, 16 ralentisseurs et
  5 mini-ronds-points. Tous les voisins du tag sont là, lui seul manque
- **interrogation d'Overpass en direct**, sur données à jour au 18/08/2026 et
  sur la même emprise : `elements` vide

**Christophe confirme de sa connaissance de la ville** qu'il n'y a aucun feu à
Artix. Les douze blocs sont supprimés.

Retiré avec eux : les matériaux et la géométrie de lentille, le cycle
d'animation (22 s, 12 vert / 3 orange / 7 rouge), la statistique du log et
l'appel par frame dans `main.js`. `animerFeux` subsiste en fonction vide, pour
garder un point d'accroche si une commune en comportant devait être chargée.

La circulation d'Artix se règle donc bien aux stops, cédez-le-passage et
ronds-points, comme le décrivait CLAUDE.md.

**Ce que cet épisode apprend** : un compteur au log ne prouve pas qu'une donnée
existe, il prouve qu'un tableau est rempli. Celui-ci l'était par déduction
géométrique, pas par lecture. Vérifier la source avant de croire le compteur.

## Sens interdits supprimés (18/08/2026)

Signalé par Christophe : « les sens interdits sont souvent faux ». Les 190
disques sont supprimés, ainsi que leur texture, devenue code mort.

**Ils étaient déduits, pas lus.** OSM ne cartographie aucun panneau de sens
interdit à Artix. Le code partait du tag `oneway=yes`, porté par 209 tronçons
réels, et posait un panneau à l'entrée de chacun : 7 m dans le tronçon, sur
celui des deux bords le plus dégagé, après avoir écarté les extrémités qui ne
débouchent sur rien.

**Pourquoi le placement échoue.** Une règle de circulation ne dit pas où se
trouve le panneau qui l'annonce. Deux écarts s'ajoutent :

- **le découpage OSM** ne correspond pas aux entrées réelles. Une même rue à
  sens unique y est fractionnée en plusieurs tronçons successifs, et chaque
  début de tronçon recevait un panneau, y compris en plein milieu de la rue là
  où aucune entrée n'existe
- **le côté et le recul** étaient choisis par heuristique (7 m, bord le plus
  dégagé), sans rapport avec l'implantation réelle

À la différence des feux tricolores, ce n'était pas une invention pure : la
donnée de départ était vraie. C'est la position déduite qui ne l'était pas.

**Retiré avec eux** : `textureSensInterdit`, la géométrie de disque, les
matériaux, et la statistique `sensInterdits` du log. Le tag `oneway` reste lu
par ailleurs, il sert au HUD et à l'orientation des panneaux de priorité.

Stops (62) et cédez-le-passage (19) sont intacts : eux sont lus depuis
`highway=stop` et `highway=give_way`.

## Inventaire des panneaux : ce qui est lu, ce qui est déduit (18/08/2026)

Fait à la demande de Christophe après l'épisode des feux, restreint aux
panneaux.

| Panneau | Rendu | Donnée OSM | Nature |
| --- | --- | --- | --- |
| Stops | 62 | 66 `highway=stop` | lu, 4 perdus faute d'accotement |
| Cédez-le-passage | 19 | 20 `highway=give_way` | lu, 1 perdu |
| Sens interdits | 190 | aucun panneau, 209 `oneway=yes` | déduit, **supprimé** |
| Panonceaux d'équipements | 57 | 102 commerces nommés | position lue, objet inventé |

**Deux pertes silencieuses**, qui n'apparaissent nulle part au log :

- **5 panneaux de priorité** écartés par `if (!pos.trouve) continue`, faute
  d'accotement trouvé dans la portée de recherche. Le filtre est légitime, la
  perte de 6 % ne l'est pas moins, mais rien ne la signale
- **45 équipements sur 102** filtrés par `cat && t.name` dans `poi.js` : seules
  les catégories présentes dans la table `CATEGORIES` sont retenues

**Les panonceaux d'équipements restent le point discutable.** Les commerces
sont réels et bien placés, mais ces plaques de 3,2 m plantées devant chaque
boutique n'existent pas dans la rue : un bourg de cette taille n'a pas 57
panneaux de localisation. Choix de lisibilité assumé par le commentaire du
code, laissé en l'état faute de décision contraire.

**La leçon, redite** : un compteur au log dit ce qui est posé, jamais ce qui a
été lu ni ce qui a été perdu en route.

## Anticrénelage : le renderer en demandait, le composer n'en faisait pas (18/08/2026)

Recherche demandée par Christophe sur les bibliothèques et passes qui
amélioreraient le rendu. Elle a mis au jour une incohérence déjà présente.

**Le défaut.** `WebGLRenderer` est construit avec `antialias: true`, mais ce
réglage ne vaut que pour le tampon d'écran par défaut. Dès qu'on rend à travers
`EffectComposer`, l'image passe par ses propres cibles, dont le MSAA vaut zéro.
Relevé en direct : `composer.renderTarget1.samples === 0`. La ville n'avait donc
aucun anticrénelage, et les arêtes de toiture crénelaient pour rien.

**Le MSAA est hors budget sur cette scène**, contrairement à ce qu'on aurait pu
poser sans mesurer :

| Réglage | fps | Écart |
| --- | --- | --- |
| `samples: 0` | 48,8 | référence |
| `samples: 2` | 33,0 | -15,8 |
| `samples: 4` | 29,6 | -19,2 |

Le 2x coûte presque autant que le 4x : la géométrie est trop dense (3 500
bâtiments), chaque échantillon multipliant le travail de rastérisation. Sans
cette mesure, `samples: 4` aurait été la recommandation évidente et fausse.

**SMAA retenu**, ajouté sous la touche `A` avec indicateur au HUD. Passe
d'image à coût constant, insérée après les contours et avant `OutputPass` :
elle doit lisser le trait de silhouette comme le reste, et le mappage de tons
reste en dernier.

**Gain mesuré sur capture**, la seule méthode fiable ici : comptage des
transitions de luminance franches (plus de 55 sur 255 en un pixel) dans la zone
des toitures. **1 125 bords crénelés avant, 846 après, soit -24,8 %**. La part
de bords durs tombe de 0,393 à 0,274. Aucun flou introduit, vérifié à l'écran.

**Coût réel : entre 0 et 3 fps, non isolable.** Deux séries d'alternance
donnent -6,3 et +3,1 fps selon l'ordre des passes. Un anticrénelage ne peut pas
accélérer le rendu : le signe qui s'inverse prouve que la dérive de charge de la
machine domine l'effet cherché. **Nouveau piège de mesure, à retenir : une
alternance ON/OFF ne suffit pas quand l'effet est du même ordre que le bruit ;
inverser l'ordre des séries est ce qui le révèle.**

**Bibliothèques tierces écartées.** `postprocessing` (pmndrs) fusionne
plusieurs effets en une passe unique, argument réel mais sans objet ici : le
pipeline n'a qu'un effet d'image, contours et cel shading étant déjà réunis
dans un seul `ShaderPass` qui emprunte profondeur et normales au GTAO.
Le portage casserait cette optimisation, et CLAUDE.md pose « Three.js, aucun
framework par-dessus ».

Autres passes officielles écartées, chacune pour une raison de fond :
`UnrealBloomPass` (aucune source vive dans un bourg de jour), `SSRPass` (pas de
surface réfléchissante, coût élevé), `TAARenderPass` et `SSAARenderPass` (elles
accumulent des frames, incompatible avec une caméra qui bouge en permanence).

## Pertes silencieuses entre la donnée et le rendu (18/08/2026)

Relevé en marge de l'inventaire des panneaux, à consigner avant de l'oublier.
Plusieurs postes perdent des éléments entre le fichier de données et l'écran,
sans qu'aucun log ne le signale. Le compteur affiché est toujours celui du
rendu, jamais celui de la source.

| Poste | Dans la donnée | Rendu | Perte | Cause |
| --- | --- | --- | --- | --- |
| Arbres cartographiés | 415 | 328 | 21 % | à chercher |
| Stops | 66 | 62 | 6 % | `!pos.trouve`, pas d'accotement |
| Cédez-le-passage | 20 | 19 | 5 % | idem |
| Équipements nommés | 102 | 57 | 44 % | `cat && t.name` dans `poi.js` |

**Les arbres sont le cas à creuser** : le README annonce 415, le chiffre de la
donnée, quand 328 seulement arrivent en jeu. Le plafond `MAX_TREES` de 3 500 ne
peut pas être en cause, il joue bien au-dessus. Piste à vérifier : le rayon de
chargement `MAX_RADIUS` d'`osm.js`, qui écarterait les sujets périphériques.

**Le filtre des équipements est un choix éditorial**, pas un défaut : seules
les catégories présentes dans la table `CATEGORIES` reçoivent un panonceau.
Reste que 44 % n'apparaissent nulle part.

**Les 5 panneaux de priorité perdus** le sont pour une raison légitime : le
nœud OSM n'a pas trouvé d'accotement dans sa portée de recherche. Mieux vaut un
panneau absent qu'un panneau planté au milieu de la voie.

Aucun de ces écarts n'est grave pris isolément. Ils méritent d'être connus
parce qu'ils faussent toute comparaison entre ce qu'annonce la documentation et
ce que montre l'écran.
