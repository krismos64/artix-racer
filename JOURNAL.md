# Journal du chantier visuel

Journal de bord tenu par session de travail. Entrées antéchronologiques.

## État au 2026-08-26 (fin de session)

Tout est commité, `npx tsc --noEmit` passe, le jeu tourne à 60 fps en profil
Équilibré. Rien n'est en cours ni cassé.

**Chantiers livrés** : ciel analytique + IBL + SSAO2, ambiances jour/soir/nuit
(touche L) avec éclairage nocturne complet, volets et murets en galets,
façades pierre, ripisylve, feuillage alpha, passants et touffes d'herbe,
lignes aériennes (357 poteaux triangulés, 210 portées), placage photo (254
façades + 109 HD), sols mesurés, musique en boucle, et le corridor commerçant
du centre-bourg modélisé à la main commerce par commerce.

**Outillage** : `npm run vue -- --poi "nom"` (voir un lieu en photo réelle) et
`npm run mesure -- --poi "nom"` (fiche mesurée prête à recopier) suppriment
les scripts d'analyse jetables. Skills : `fidelite-artix` pour corriger un
écart signalé, `modeliser-artix` pour construire un lieu.

**Reprise conseillée** : lancer `npm run dev`, rouler dans le centre-bourg,
signaler ce qui cloche par capture d'écran. La méthode qui marche est décrite
dans CLAUDE.md (« Méthode de fidélité ») : mesurer dans les données avant de
corriger, jamais deviner un cap ou une position.

**Pistes ouvertes** (aucune urgente) :
- Ajouter le salon « Atmosphear » à gauche de la Caisse d'Épargne (visible
  sur la photo, même immeuble).
- Pizzeria de la place du Général de Gaulle (POI 21.8, 65.5) : encore en
  devanture générique.
- Touffes d'herbe du premier plan un peu sombres sur pelouse claire.
- Placage photo : quelques cases restent à l'exposition perfectible.
- Vérifier en roulant : côté de la croix de la pharmacie, sens de l'arrondi
  de l'immeuble Vapozen, abri caddies du Leclerc.

## 2026-08-26 (suite 11) : carrefour CE/pharmacie, premier chantier des outils

Première utilisation réelle de `npm run vue` / `npm run mesure` (skill
`modeliser-artix`), sur le carrefour Caisse d'Épargne / pharmacie
Barrouilhet, captures de Christophe à l'appui.

- **La leçon de la session : le type de voie prime sur les photos.** La
  première pose a mis Atmosphear et la CE sur la façade EST du 1126, choisie
  parce que 42 prises Panoramax la voyaient de face. Or cette façade donne
  sur la DESSERTE DU PARKING (highway=service), où la GoPro roule aussi. La
  façade commerçante réelle est la façade SUD (arête 6, normale 0,39 rad),
  qui longe la rue de la Patte d'Oie (D32, tertiary) à 4 m : Christophe l'a
  signalé sur capture, la photo du carrefour le confirmait. `artix-mesure`
  choisit désormais d'abord une arête longée par une VRAIE voie (voieProche
  dans artix-geo), l'exposition photo ne fait que départager.
- **Salon ATMOSPH'AIR posé en dur** (le nom réel porte l'apostrophe, lisible
  sur la vue ouest) : façade OUEST du 1126 au coin sud, arête 5 mesurée
  A(74,1,-56,3)→B(77,6,-48,2), bandeau anthracite à lettres blanches,
  largeur 4,5 m à (76,6, -50,6), rotation -1,17 rad. Ajouté aux deux listes
  d'exclusion.
- **Vue ouest du carrefour (2e capture)** : la CE signale ses DEUX angles :
  écureuil en drapeau au coin ouest (78,7, -48,3) en plus de celui du coin
  est, et grand carré plaqué en haut de la façade ouest (76,98, -49,24).
- **Station Leclerc : l'auvent est JAUNE VIF**, pas blanc à bandeau bleu :
  chant périphérique passé au jaune clair 0xf2df3a (tenu clair pour ACES),
  épaissi à 0,72 m. Pose inchangée (emprise BD TOPO 1075). Totem de prix
  refait : blanc, tête E.LECLERC bleue, lignes de prix rouges, « 24/24 ».
  Piège : posé dans le groupe station, le totem pivotait avec l'auvent
  (tranche vers la route) : extrait en objet autonome au bord de la D32
  (99, -48,5), faces dans l'axe de la voie.
- **Minimap Babylon : la carte tournait de 2×cap** au lieu d'annuler le cap
  (`sin(-heading)` dans src/minimap.ts) : flèche juste à cap nul, fausse
  partout ailleurs. MÊME bug que celui corrigé dans three-city/minimap.js le
  19/08 (« PI + cap, non -cap ») : la version TS avait été réécrite sans
  reprendre la leçon. Formule validée sur les quatre caps cardinaux.
- **Vue rapprochée du coin (3e capture)** : ATMOSPH'AIR est une devanture
  d'ANGLE : caisson anthracite sur les deux faces du coin sud-ouest
  (construireFaceAtmosphair, posée deux fois : face ouest 4,9 m avec vitrine
  panoramique et téléphone vertical « 05 59 02 05 44 », face sud 3,8 m avec
  porte). Lettres CE en gris anthracite (pas bleu). Enseigne CE = panneau
  drapeau VERTICAL rouge à sigle, à la limite salon/banque (82,05, -49,15) ;
  croix verte de la pharmacie juste à côté (83,81, -50,19) : signalétique
  déportée qui capte la D32.
- **Circulation légère et fin du stationnement d'accotement.** Nouveau
  module traffic.js : douze véhicules sur le graphe des voies carrossables
  (service et track exclus, rayon 1 200 m), conduite à droite (décalage
  largeur/4 borné 1,1..2,1 m), sens uniques respectés (arêtes
  directionnelles), vitesse par type de voie (25-45 km/h), freinage franc
  derrière le joueur ou un congénère dans le cône avant, cap lissé aux
  carrefours. Mêmes silhouettes et couleurs que les véhicules garés
  (exports de parkedcars), adoptées par le LiveInstancedBridge comme les
  passants. PAS d'obstacle physique (trafic léger qui freine : à revoir si
  besoin). Et la file de rue de trouverPlaces est DÉBRANCHÉE : les photos
  montrent des véhicules uniquement sur les emplacements dédiés ; ne
  restent que les aires OSM et les bandes marquées.
- **Voirie : deux corrections signalées en jeu.** (1) Garde-fou
  `ecarterDeChaussee` (osm.js, exporté) : tout point à moins de
  largeur/2 + marge de l'axe d'une voie carrossable est repoussé sur
  l'accotement, en deux passes pour les angles de carrefour. Appliqué aux
  lampadaires (OSM réels et complément, qui mordaient les voies croisées)
  et aux 357 poteaux triangulés (imprécision de triangulation) ; les câbles
  suivent, ils lisent les positions corrigées. (2) Passages piétons refaits
  À LA FRANÇAISE : bandes de 2,5 × 0,5 m PARALLÈLES à l'axe de la
  circulation, entraxe 1 m, réparties sur la largeur de chaussée :
  l'ancienne version dessinait cinq lignes en travers, une échelle plutôt
  qu'un passage. Peinture éclaircie (0xfaf8f2, plancher d'usure relevé) :
  un passage même usé reste blanc de loin.
- **Parc de véhicules garés refondu** : cinq silhouettes paramétriques au
  lieu du gabarit unique étiré (compacte 26 %, berline 20 %, break/SUV
  24 %, fourgonnette 15 %, fourgon 9 %) plus 6 % de scooters (corps caréné
  coloré, selle et guidon sombres, deux roues du mesh commun en échelle
  réduite, emplacements inutilisés masqués par matrice nulle). Plaques
  avant/arrière (3e groupe de matériau), rétroviseurs instanciés, palette
  pondérée du parc français (blanc et gris dominants, couleurs vives
  rares), utilitaires blancs aux trois quarts, variation de clarté ±5 % et
  d'échelle ±4 % par instance. Piège d'architecture : la grille spatiale
  exige une instance par véhicule et par mesh : les caisses réparties par
  silhouette en sortent (30 k triangles dessinés en permanence,
  négligeable) ; roues, feux, rétros et ombres y restent (ratios 4,2,2,2,1).
- **Plateau de basket et sens du stationnement** (10e capture) : le terrain
  face à l'avenue est tagué sport=TENNIS dans OSM alors que les photos
  montrent deux paniers de basket sur enrobé gris : correction de données
  dans osm.js (bornée au centroïde de ce pitch), teinte basketball passée à
  l'enrobé gris usé, deux paniers posés en dur aux petits côtés mesurés,
  tournés vers le centre. Et les bandes de stationnement AUTOMATIQUES
  (devant les collectifs) passent de la bataille 90° à l'ÉPI 45° relevé sur
  la photo : traits obliques, pas longitudinal x1,414, enrobé en
  parallélogramme, cap des voitures sur la bissectrice normale moins
  direction. Les bandes en dur (18e RI, Leclerc, collège) restent
  perpendiculaires, conformes à leurs propres photos.
- **Avenue Edmond Rostand complétée** (9e capture) : l'esplanade de
  pétanque passe de l'herbe aux GRAVILLONS : polygone en dur relevé sur
  l'orthophoto (le pitch sport=boules OSM dilaté de 4,5 m, le surplus était
  rendu en pelouse), versé dans la nappe de grave compactée existante qui
  recouvre la teinte plate du terrain. Deux étendoirs à linge en T avec fils
  côté est de l'esplanade. Sur la barre « Pyrénées » : enseignes verticales
  lettrées par cage d'escalier (OSSAU, ASPE, BARETOUS : les vallées lues sur
  la photo), en drapeau au-dessus de chaque porche. Le stationnement en épi
  de l'avenue existait déjà (c'est même la référence du générateur).
- **Rendu : deux chantiers anti-maquette.** (1) Variation des surfaces
  végétales (world.js) : les 12 kinds herbeux reçoivent des UV planaires
  monde (tuile 34 m) et une texture multiplicative de plaques (herbe jaunie
  chaude, taches sombres de terre), moyenne maintenue près du blanc pour ne
  pas déranger les teintes calées sous ACES ; posée en tore pour répéter
  sans couture. Les aplats verts uniformes étaient le principal marqueur
  « maquette » des captures. (2) Ombres de contact instanciées sous les
  voitures garées (parkedcars.js) : 5e InstancedMesh, dégradé radial couché
  (géométrie pré-tournée, la matrice ne porte que le cap), échelle au
  gabarit, 3 cm au-dessus de la chaussée, intégré au découpage spatial
  (ratio 1). Même recette que le blob du véhicule joueur.
- **Citystade posé en dur** (8e capture) : rectangle du pitch « multi » OSM
  mesuré (21,5 × 12,2 m, centre (9,4, -224,2), grand axe (0,153, -0,988)),
  entre la salle polyvalente et la Calandreta. Relevé photo : bardage bas
  vert amande pâle, palissade de barreaux galva à 3 m (texture alphaTest
  répétée : des centaines de cylindres seraient hors budget), lisses hautes,
  pare-ballons à trois poteaux bleu-gris (5,6 m) et filets semi-transparents
  aux deux bouts, paniers de basket tournés vers l'intérieur, sol d'enrobé
  sombre posé sur la pelouse OSM. Fresque murale naïve (canvas : ciel,
  collines, silhouettes dansantes colorées) sur le pignon est de la halle,
  face au citystade (arête 22, normale 81°).
- **Entrée du collège Jean Moulin** (6e et 7e captures) : premier jet RATÉ,
  un préau isolé posé le long du trottoir : la boîte de 40 m s'étendait le
  long de X LOCAL avec rotation.y = atan2(ux,uz), qui oriente +Z local :
  l'auvent enjambait l'avenue comme un pont. Convention à retenir : pour
  X local → (ux,uz), rotation.y = atan2(-uz, ux). Et la réalité est un
  AUVENT ADOSSÉ au front nord du long bâtiment 1952 (arêtes 4 et 6
  mesurées, deux segments de 30 et 44 m en console, poteaux côté rue), pan
  d'entrée bleu-gris à la jonction des fronts. Contre-allée de places en
  épi relevée sur photo : bande en dur dans parking.js avec un nouveau
  drapeau `vide: true` (marquage tracé, AUCUN véhicule : c'est la dépose),
  plus cinq cercles d'exclusion parkedcars le long de l'avenue. La salle
  est au NORD de l'avenue, le collège au SUD.
- **Salle polyvalente / salle des sports modélisée** (5e capture) : complexe
  1675 (96 × 39 m, façade sud normale -9°). `construireComplexeSportif`
  plaque les signatures sur le bâti générique : demi-lune vitrée à meneaux
  bruns et son arc de rive, aileron vert amande en pointe « SALLE DES
  SPORTS » (10,2 m), banderole « 1946 - 2026 80 ANS DE BASKET », losanges
  sombres du soubassement, marquise courbe blanche + bandeau « Salle
  Polyvalente » au décroché d'entrée mesuré (-47,5, -225,4), bande de
  brise-soleil à lames et 5 casquettes de sheds inclinées côté est. Piège :
  les deux sas vitrés en saillie sont les bâtiments 2008/2009 auxquels le
  LiDAR prêtait 8-9 m (les sheds voisins) : retirés du bâti ordinaire et
  reconstruits en sas de 2,9 m.
- **« Tendances du Moment » localisé et posé** (4e capture) : c'est le grand
  commerce fermé DERRIÈRE la station Leclerc, pas sur l'îlot 1126. Deux corps
  BD TOPO en retrait l'un de l'autre : 1067 à l'est (gouttière 6 m, façade
  sud 13,7 m, normale 175°) porte le lettrage cursif et le porche ENTRÉE à
  fronton ; 1074 à l'ouest (3,8 m, façade sud 15,3 m, normale 172°) porte
  rayures et vitrines. `construireFacadeTendances` : bandeau blanc à groupes
  de rayures multicolores (7 teintes, largeurs pseudo-aléatoires), rideaux
  blancs baissés, portes vitrées sombres. L'ortho a tranché la géométrie
  (bandeau NON continu, deux plans décalés de 3 m que la perspective de la
  photo masquait).
- **Caisse d'Épargne déplacée sur la façade sud** : largeur 8, (87,5, -52,4),
  lettres bleu foncé (ancien style CE). Écureuil rouge en drapeau au coin
  est (91,6, -53,5), perpendiculaire à la façade rue.
- **Pharmacie** : bandeau du rez-de-chaussée passé de vert à ANTHRACITE
  « P H A R M A C I E » lettres blanches (le vert n'est que dans les croix).
  Seconde croix verte en potence au coin sud-est du 1126 (93,2, -54,9),
  au-dessus du totem parking : c'est elle qu'on voit du carrefour.
- **Garde-fou teintes Panoramax (bdtopo.js)** : 108 relevés de mur sur 2 719
  avaient une dominante bleue (ciel entré dans la fenêtre de mesure, ou
  façade à l'ombre trop froide) alors que q disait fiable : le bâtiment
  pharmacie était rendu bleu vif. Un mur b > r+12 et b > g+6 est rejeté et
  retombe sur la palette MAJIC ; volets et grain du relevé sont conservés.
- Outil amélioré en route : normalisation par percentiles (1..85) dans
  panoramax-vue (l'égalisation min-max ne sortait pas une façade à l'ombre
  sous un ciel blanc de janvier).
- Pièges d'outil notés (à corriger dans panoramax-vue) : `vueDegagee`
  n'écarte pas les prises masquées par un DÉCROCHEMENT du bâtiment cible
  lui-même ; certaines photos Panoramax ont un azimut faux de 10-20° et
  produisent un cadrage décalé : recouper deux prises avant de conclure.
- Structure de l'immeuble 1126 (angle de rues) : façade SUD arête 6
  A(77,6, -48,2)→B(92,7, -54,5) sur la Patte d'Oie : Atmosphear à l'ouest,
  CE à l'est, écureuil et croix verte au coin est ; façade EST arête 7 : mur
  sur parking, laissé nu. « Tendances du Moment » : d'abord cru sur
  cet îlot, localisé ensuite derrière la station (voir plus haut).
- Rappel de règle : une capture Street View fournie en référence sert de
  signalement d'écart, jamais de source de modélisation (interdite par
  CLAUDE.md) : chaque détail posé ici vient des panoramiques Panoramax.

Reste à vérifier en jeu : teinte du 1073 après garde-fou, recouvrement
éventuel Atmosphear/CE, hauteur de la croix déportée, et le bâtiment bas à
porte de garage entre CE et pharmacie (rendu sombre « en tunnel »).

## 2026-08-26 (suite 10) : outillage d'inspection, deux scripts et un skill

Le coût principal de chaque itération de fidélité était d'écrire un script
d'analyse jetable pour voir une façade ou mesurer une arête. Deux outils
réutilisables le suppriment.

- `scripts/artix-geo.mjs` : briques communes extraites de
  panoramax-centre.mjs (projection, index spatiaux, visibilité, boîte
  orientée, arêtes et normales, téléchargement Panoramax). Les outils
  partagent donc EXACTEMENT la géométrie du placage photo.
- `scripts/panoramax-vue.mjs` (`npm run vue`) : cadrage plat des
  panoramiques qui voient un lieu de face, lisible avec Read. Cible par
  `--poi`, `--xz`, `--latlon` ou `--bat`.
- `scripts/artix-mesure.mjs` (`npm run mesure`) : fiche mesurée prête à
  recopier (boîte orientée avec dérive du centroïde, gouttière LiDAR,
  arêtes et normales, façade sur rue, position et rotation de devanture,
  POI voisins, commande curl d'orthophoto avec `--ortho`).
- Skill `modeliser-artix` : construire un lieu (bâti, devanture, parking,
  sol, végétation) ; `fidelite-artix` est recentré sur la correction d'un
  écart signalé, avec renvoi croisé.

Appris en construisant :

- **La façade la plus proche du POI n'est pas la bonne.** Premier jet du
  script : arête la plus proche, il choisissait un pignon aveugle pour la
  Maison Chaudron. Le bon critère est l'exposition à la RUE, comptée en
  prises Panoramax qui voient l'arête de face (la GoPro roule sur la
  chaussée). Corrigé, le script retrouve la façade codée à la main :
  -1,820 rad mesuré contre -1,824 rad en dur, 0,2 % d'écart.
- **Viser à 45 % de la gouttière cadre les poubelles du trottoir.** Sur un
  commerce de 4,8 m ça tombe à 2,2 m. Plancher relevé à 3,2 m, hauteur d'un
  bandeau d'enseigne.
- **Le contre-jour de janvier bouche les façades.** Les prises Panoramax
  d'Artix datent de janvier 2025, soleil bas sur des rues est-ouest :
  l'égalisation d'histogramme (`sharp.normalise`) rend enseignes et volets
  lisibles là où la photo brute est lavée. `--brut` la coupe quand la teinte
  exacte compte.
- **614 bâtiments sur 3 326 (18,5 %) ont une gouttière LiDAR supérieure à
  leur faîtage BD TOPO.** Physiquement impossible : les deux sources se
  contredisent (LiDAR pris sur un arbre, ou hauteur BD TOPO manquante). La
  fiche de mesure le signale désormais au cas par cas ; devant ce cas,
  trancher sur la photo.
- `poiProches` renvoie des copies : comparer par coordonnées, pas par
  identité, sinon le POI cible apparaît dans ses propres voisins à 0,0 m.

## 2026-08-26 (suite 9) : Leclerc, Caisse d'Épargne, pharmacie, documentation

- Leclerc Express : parking entier en dur d'après l'ORTHOPHOTO (double-rangées
  dos à dos), abri caddies, et surtout correction d'un bug de fond : les
  emprises des bâtiments modélisés à la main étaient retirées de
  `data.buildings`, donc invisibles des tests d'évitement : les voitures se
  garaient dans la vitrine. Elles sont désormais exportées dans
  `data.emprisesModelisees` et respectées partout.
- Garde-fou : les bandes de parking se rognent d'une place tant qu'elles
  approchent une chaussée (les axes relevés sur ortho sont idéalisés).
- Caisse d'Épargne remise sur sa façade rue (la générique regardait la
  mauvaise face), pharmacie Barrouilhet et son voisin modélisés d'après
  photo (bandeau vertical à croix, croix lumineuse d'angle).
- Documentation remise à plat : CLAUDE.md réécrit (architecture réelle,
  pièges, méthode de fidélité, tableau des sources), README complété
  (cinq pipelines Panoramax, centre-bourg à la main, touche L), scripts npm
  pour chaque pipeline.

## 2026-08-26 (suite 8) : la rue commerçante en dur, commerce par commerce

- Devantures dédiées posées sur arêtes mesurées : Maison Chaudron (bandeau
  noir doré + épi drapeau), AU COMPTOIR/BRASSERIE + terrasse au droit du POI,
  maison de la presse (jaune), CAFÉ, CPC Invest (anthracite cuivré), MMA
  (blanc + 3 macarons). Bug de fond corrigé au passage : les devantures de
  l'immeuble 1081 étaient bâties côté cour.
- Méthode éprouvée : POI -> arête la plus proche pertinente (normale vers la
  rue) -> projection sur le grand axe -> position/normale en dur.
- La bande bataille de l'avenue couvre z 1..30 (ortho) ; pizzeria réelle
  place du Général de Gaulle (POI 21.8, 65.5), devanture générique pour
  l'instant.

## 2026-08-26 (suite 7) : le stationnement du centre, résolu par l'orthophoto

- Leçon de méthode : pour IMPLANTER au sol (parkings, rangées, allées),
  les panoramiques ne suffisent pas : l'ORTHOPHOTO IGN (WMS Géoplateforme,
  data.geopf.fr, Licence Ouverte) donne la vérité en plan au décimètre.
  curl (le SSL de python3 est cassé sur cette machine).
- Vérité relevée : place du Général de Gaulle = esplanade piétonne pavée en
  damier ; le parking organisé = bande en bataille côté est de l'avenue
  (traits perpendiculaires, arbres intercalés). Codé en dur.
- Trois allers-retours avec Christophe sur ce point : capture d'écran de sa
  part -> diagnostic -> correction. Les captures qu'il dépose sur le Bureau
  sont lisibles directement (Read).

## 2026-08-26 (suite 6) : itérations fidélité avec Christophe

- Poste : annexes 1079/1083 retirées (elles masquaient le parvis), 18 x 11,5,
  caisson + grandes lettres LA POSTE sur les DEUX façades.
- Garde-fou générique : tout modèle posé à la main se rétracte par paliers si
  un coin mord une chaussée (appliqué aux angles arrondis et immeubles de
  rue) : plus jamais de débord signalé.
- Épi réel des commerces : bandes ancrées devant la Poste et la rangée Au
  Comptoir/Presse/pizzeria (parking.js), côté commerces.
- Méthode qui marche : Christophe signale depuis le jeu, je mesure dans les
  données (boîte orientée vs centroïde, caps), je corrige la cause.

## 2026-08-26 (suite 5) : corrections fidélité du carrefour

- Patte d'Oie : l'immeuble débordait sur la chaussée parce que la position en
  dur était le centroïde d'une emprise en L, pas le centre de sa boîte
  orientée : recentré (44.6, -8.0).
- Station : l'auvent réel EST un bâtiment BD TOPO (1075) qui coiffait ma
  marquise d'un toit (« petite maison ») : bâtiment remplacé, marquise aux
  cotes mesurées (12,1 x 5,2 m).
- La Poste modélisée à la main d'après les photos (balcon filant, grilles,
  caisson jaune, boîte aux lettres). À vérifier en jeu : le côté de
  l'enseigne (peut se retrouver côté cour selon le cap PCA, correction d'un
  signe le cas échéant).
- Leçon : pour poser un modèle sur une emprise BD TOPO, TOUJOURS utiliser le
  centre de la boîte orientée, jamais le centroïde.

## 2026-08-26 (suite 4) : aménagements du corridor à la main

- DÉCOUVERTE : landmarks.js modélisait déjà bien plus que la mairie : église
  Saint-Pierre, gare, Leclerc Express (construireSupermarche), immeubles
  d'angle, devantures de TOUS les commerces (construireDevanturesPOI). D'où
  l'impression de Christophe que le placage HD ne changeait rien : les
  bâtiments-clés du corridor n'étaient pas concernés.
- Ajouté ce qui manquait : station-service Leclerc (marquise, pompes, totem),
  terrasse d'Au Comptoir (store banne + tables), préaux des deux écoles.
- Doublon supprimé : le bandeau d'enseigne de signage.js répétait les
  devantures landmarks ; seul le drapeau perpendiculaire est conservé.

## 2026-08-26 (suite 3) : corridor commerçant en HD

- Placage HD multi-façades du corridor Leclerc -> église : 109 façades
  (64 bâtiments, 32 multi-faces) depuis les panoramiques 5760×2880, enseignes
  réelles lisibles. Cache HD séparé (.panoramax-cache-hd, 222 Mo).
- Sols : 152 relevés locaux tous les 12 m dans le corridor, appliqués par
  tronçon. Épi du centre à 78 % d'occupation (photos de journée).
- Piège : garder le fondu de pied bas (60 cm) sur les devantures, sinon les
  vitrines sont amputées.

## 2026-08-26 (suite 2) : feuillage alpha

- Couronnes d'arbres découpées par texture d'amas de feuilles (alphaTest) :
  silhouettes dentelées, houppiers poreux, fini les arêtes polygonales de
  près. Vérifié à l'écran, validé par Christophe.
- Noté au passage : les touffes d'herbe du premier plan ressortent très
  sombres (presque noires) sur pelouse claire : à rééquilibrer (teinte
  d'instance × texture de brins).

## 2026-08-26 (suite) : lignes aériennes continues et placage étendu

- Câbles enfin visibles : chaînage réparé (doublons enjambés) + supports
  manquants interpolés tous les 48 m sur les longues portées : 210 portées,
  médiane 36 m. Détection assouplie : 357 poteaux relevés + 77 interpolés.
- Placage photo : 254 façades (rayon 900 m) dans 2 atlas 4096², exposition
  homogénéisée (cible de luminance + balance des blancs à 50 %).

## 2026-08-26 : poteaux réels, câbles, enseignes drapeau

- Campagne Panoramax « verticale » : 217 poteaux (électricité/télécom)
  TRIANGULÉS depuis les panoramiques (bâtonnets sombres contre le ciel vus
  sous plusieurs gisements, silhouette anti-arbre, amas d'intersections).
  Le jeu les plante aux positions réelles ; caténaires paraboliques doubles
  entre poteaux successifs d'une même voie.
- Enseignes drapeau perpendiculaires (croix de pharmacie émissive, initiale
  pour les autres commerces) en plus des bandeaux.
- Stats relevé : médiane à 611 m du centre (lotissements aériens, centre
  enfoui), 3 à 99 observations par poteau.

## 2026-08-25 (tard) : la ville vivante

- Passants (110) et touffes d'herbe branchés : les modules Three dormants
  (pedestrians.js, touffes.js) gardent toute leur logique, leur rendu passe
  par LiveInstancedBridge (thin instances Babylon sur le MÊME Float32Array de
  matrices, zéro copie).
- Nuit équilibrée après trois itérations avec Christophe : phares en cône
  étroit quasi horizontal (l'énergie à 15-35 m), lampes du pool à intensité
  continue en distance (plus d'allumage visible), halos permanents dominants.
- Reste : câbles entre poteaux, enseignes perpendiculaires, placage photo
  étendu + exposition homogène.

## 2026-08-25 (nuit) : musique, ambiances, éclairage nocturne, sols mesurés

- Musique en boucle (music1.mp3, streaming, touche M).
- Touche L : trois ambiances (midi, fin de journée dorée, nuit) : ciel,
  brouillard, exposition, ombres et sonde IBL re-rendue à chaque bascule.
- Nuit complète : phares SpotLight + optiques/feux émissifs (avant = +Z local
  du châssis), lanternes émissives, pool de 6 lampes sodium recyclées sur les
  foyers proches, fenêtres allumées. Plafond de lumières simultanées à 10
  dans le bridge.
- panoramax-sols.mjs : enrobé mesuré par type de voie (residential PLUS
  sombre que secondary, la mesure bat l'intuition), 78 parkings classés
  (20 stabilisé, 1 herbe), usure réelle de 140 passages piétons.
- Rendu : vertex colors de chaussée par kind (écart relatif clampé ±14 %),
  dalles de grave sur les aires stabilisées, passages piétons du blanc neuf
  au gris effacé.
- Piège : les nœuds de signalisation sont dans artix-poi.json sous la clé
  `poi`, pas `elements`.
- À ajuster en jouant : intensité des phares (55) et des lampes (18), portée
  éventuellement.

## 2026-08-25 (soir) : détails de ville et placage photo

- **Placage photo du centre-bourg** : 80 façades rectifiées en vraie
  perspective depuis les panoramiques (Le Fournil, Hair Libre, La Poste,
  plaque Carrèra deu 49au R.I…), 3 atlas 2048², manifeste par arête de
  bâtiment. Hauteur bornée à la gouttière LiDAR ; rejet auto ciel/végétation ;
  fenêtres et volets procéduraux coupés sur les arêtes photographiées.
- **Enseignes** : bandeau nommé sur la façade de chaque commerce POI (ils
  n'avaient AUCUN panneau 3D), sauf si la façade porte déjà sa photo.
- **Jardinières** fleuries autour de la placette de la mairie ; **poteaux
  électriques** instanciés dans les lotissements (centre enfoui).
- **Stationnement corrigé** : les voitures se garent SUR la chaussée contre
  la rive (l'ancien calcul les posait sur le trottoir), à cheval sur les
  voies de 6 à 7,5 m, rien en dessous ; densités revues à la baisse.
- Analyse Panoramax élargie à 60 m : 2 869 bâtiments caractérisés, 413 volets.
- Pièges appris : le manifeste doit compter les atlas RÉELLEMENT écrits (un
  404 sur un atlas fantôme sinon) ; hook perso de Christophe : les
  suppressions de fichiers doivent passer par `rm`, pas par Python.
- Reste à faire : élargir le placage photo au-delà de 320 m et de 128 cases ;
  homogénéiser l'exposition des cases (certaines très claires) ; enseignes
  suspendues perpendiculaires ; câbles entre poteaux.

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
