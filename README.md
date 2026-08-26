# Artix Racer

Jeu de voiture 3D jouable au clavier, dans la ville d'**Artix (64170)**,
Pyrénées-Atlantiques, modélisée à partir des données cartographiques réelles.

Tout tourne en local, hors ligne, sans compte ni clé d'API.

## Lancer le jeu

```bash
cd artix-racer && npm install && npm run dev
```

Puis ouvrir http://localhost:5180 dans **Chrome ou Safari** (pas dans un
navigateur intégré à un éditeur : l'animation y est bridée et le jeu paraît
saccadé alors qu'il tourne à 60 fps dans un vrai navigateur).

Pour une version optimisée :

```bash
npm run build && npm run preview
```

## Commandes

| Touche | Action |
| --- | --- |
| ↑ / Z | Accélérer |
| ↓ / S | Freiner ; maintenir à l'arrêt engage la marche arrière (limitée à 30 km/h) |
| ← / → | Diriger |
| Espace | Frein à main (drift) |
| C | Changer de caméra (poursuite, capot, cinématique, aérienne) |
| G | Boîte automatique ou manuelle |
| E / X | Monter / descendre un rapport (en manuel) |
| R | Réapparaître au point de départ |
| F | Remettre la voiture sur ses roues |
| T | Accélérer l'écoulement du temps (cycle jour/nuit) |
| L | Ambiance d'éclairage : Midi, Fin de journée, Nuit |
| B | Klaxon |
| M / N | Musique / son |
| O | Ombres portées (désactivées par défaut, coûteuses) |
| K | Rendu dessin animé : contours de silhouette et ombrage en paliers |
| V | Grade couleur arcade : contraste, saturation, vignettage, grain |
| A | Anticrénelage (SMAA, activé par défaut) |
| J | Profil graphique : Performance, Équilibré, Qualité |
| U | Ajustement automatique de la résolution |
| P | Pause |
| H | Aide à l'écran |

## D'où vient la ville

Deux sources publiques complémentaires, téléchargées une fois dans
`public/data/`.

**OpenStreetMap** (via l'API Overpass) pour tout ce qui n'est pas bâti :

- 1 210 routes avec leur tracé, leur nom et leur largeur réelle
- le réseau hydrographique, les zones boisées et agricoles, les voies ferrées
- 149 haies, murets et clôtures qui structurent les limites de parcelles
- la **signalisation** et les **équipements**, cartographiés en nœuds OSM et
  donc absents de la requête des surfaces : 62 stops, 19 cédez-le-passage,
  142 passages piétons, 24 ralentisseurs, 13 arrêts de bus, et 57 commerces et
  équipements publics nommés
- **415 arbres cartographiés un par un**, plantés à leur position réelle. Les
  alignements générés le long des routes ne comblent plus que les axes non
  relevés, sans doubler les arbres existants
- les **deux châteaux d'eau** de la commune (15,1 m et 21,5 m), modélisés avec
  leur silhouette propre plutôt qu'en bloc extrudé
- la **Mairie d'Artix** (27,1 × 17,4 m), reconstituée d'après photographie :
  façade blanche, toit mansardé en ardoise à forte pente, rangée de lucarnes à
  fronton, devise républicaine en façade, perron et mât
- **27 terrains de sport** avec leur revêtement réel : gazon de football, terre
  battue des courts de tennis, résine des plateaux multisports, piste
  d'athlétisme, stabilisé du boulodrome, béton du skatepark. Ils incluent le
  Stade Docteur Albert Plantier et la Piscine Municipale René Pitteu
- les **attributs de voirie** : largeur calculée d'après le nombre de voies
  réel (55 routes à 2 voies, 28 à voie unique), **149 sens uniques** nettement
  plus étroits, **21 ronds-points** ramenés à une voie annulaire, et **17 ponts**
  dont le tablier se bombe au-dessus du terrain, bordé de garde-corps
- le **marquage au sol suit les règles réelles** : ligne axiale discontinue sur
  les seules voies bidirectionnelles assez larges, lignes de rive continues sur
  les axes principaux, aucun marquage dans les ronds-points ni sur les ponts

**BD TOPO de l'IGN** (via le WFS de la Géoplateforme) pour les bâtiments. C'est
la source décisive : les emprises OSM d'Artix viennent du cadastre et ne
portent aucune hauteur ni matériau, alors que la BD TOPO fournit pour chacun
des 3 542 bâtiments :

- sa **hauteur mesurée par photogrammétrie** (de 1 m à 41,6 m sur la commune)
- l'**altitude du sol et du toit**, dont se déduisent le relief et la pente
  de couverture
- le nombre d'étages (1 852 bâtiments) et de logements
- les **matériaux de murs et de toiture** issus des fichiers fonciers MAJIC

Ces matériaux dessinent le vrai visage d'Artix : 1 302 toitures en tuile contre
74 en ardoise, et pour les façades 483 en agglomérés enduits, 289 en meulière,
279 en pierre, 180 en brique. Chaque bâtiment prend la teinte de son matériau
réel.

Les noms de rue affichés à l'écran sont les vrais noms : Avenue du 18e Régiment
d'Infanterie, Place du Général de Gaulle, Rue de la Patte d'Oie, La Pyrénéenne.

Pour re-télécharger les données :

```bash
npm run fetch-osm && npm run fetch-bdtopo && npm run fetch-poi
npm run fetch-lidar && npm run fetch-facades
```

### Signalisation et équipements

Les panneaux sont plantés à l'emplacement réel des nœuds OSM, décalés sur
l'accotement : les stops sont cartographiés sur l'axe de la chaussée, les
poser tels quels les dresserait au milieu de la voie.

Leur orientation est calculée à partir du vecteur qui va du panneau vers l'axe
de la voie, et non par une rotation fixe appliquée au cap de la route. Le sens
de ce cap dépend de l'ordre de numérisation de la polyligne dans OSM, qui est
arbitraire : une rotation fixe plantait donc la moitié des panneaux dos à la
route, illisibles depuis la voiture.

**Artix ne compte aucun feu tricolore.** La circulation y est réglée par stops,
cédez-le-passage et ronds-points, ce que le jeu reproduit fidèlement plutôt que
d'inventer des feux qui n'existent pas.

Les panneaux de sens interdit ont été retirés pour la même raison. OSM n'en
cartographie aucun sur la commune : ceux que le jeu posait étaient déduits du
tag `oneway` des voies, et tombaient souvent à côté, le découpage d'une rue en
tronçons successifs ne correspondant pas à ses entrées réelles. Une règle de
circulation ne dit pas où se trouve le panneau qui l'annonce.

Chaque commerce et équipement public nommé porte un panneau de localisation
lisible en roulant, coloré par catégorie : bleu pour les services publics
(mairie, gendarmerie, poste), orange pour les écoles, vert pour la santé,
turquoise pour le sport, brun-orangé pour les commerces. Le HUD affiche le nom
du lieu dès qu'on passe à moins de 55 m, et la minicarte les repère par des
pastilles de la même couleur.

Les lieux ainsi signalés incluent la Mairie d'Artix, l'Église Saint-Pierre, le
Collège Jean Moulin, les écoles Jean Sarrailh et Jean Moulin, la Gendarmerie,
l'Intermarché, le Super U, les pharmacies, boulangeries et banques du bourg.

### Rendu et identité visuelle (chantier d'août 2026)

- **Ciel analytique** (modèle de Preetham, SkyMaterial officielle Babylon) lié
  à la lumière directionnelle : voile d'horizon, halo solaire et ombres
  racontent la même heure. Réglages calés à l'écran (turbidité 2,6).
- **IBL réelle** : l'éclairage d'ambiance PBR est rendu au démarrage depuis ce
  ciel par une sonde de réflexion, au lieu de trois gradients de 32 pixels.
- **SSAO2** en profil Qualité : l'occlusion ambiante assoit les bâtiments au
  sol et creuse les angles de rue.
- **Volets** sur les habitations, ouverts de part et d'autre de chaque baie :
  couleur relevée sur les panoramiques Panoramax quand elle est détectée,
  sinon palette des teintes réellement vues à Artix (bordeaux, vert, bleu-gris,
  bois). C'est le détail qui distingue une rue béarnaise d'une maquette.
- **Murets en galets roulés du gave**, texture et relief dédiés : l'appareil
  des murs anciens de la plaine, immédiatement reconnaissable.
- **Façades en pierre apparente** (meulière, pierre, fort grain mesuré sur
  photo) texturées en galets plutôt qu'en enduit lisse.
- **Ripisylve des saligues** : saules argentés à couronne basse et peupliers
  en fuseau le long du gave, de ses canaux et des plans d'eau.
- **Entrées d'agglomération bilingues** ARTIX / Artics : Artix est la première
  commune de France de plus de 3 000 habitants à avoir adopté la signalisation
  occitane (2000).
- **Abribus vitrés** avec banc et cadre d'affichage.
- Anisotropie 16 sur toutes les textures, relief du gravillon sur la chaussée,
  micro-relief du couvert herbeux.
- **Feuillage découpé par texture alpha** : les couronnes se dentellent en
  paquets de feuilles et deviennent poreuses, le ciel passant par les vides.
- **Trois ambiances d'éclairage** sur la touche L : midi, fin de journée aux
  ombres longues, nuit. Chaque bascule re-rend la sonde d'environnement et
  ajuste ciel, brouillard, exposition et noirceur des ombres.
- **Nuit complète** : phares à faisceau resserré portant à trente mètres,
  optiques et feux émissifs, lanternes allumées, halos de lumière sodium au
  sol sous les 357 lampadaires (permanents, sans attendre le passage du
  joueur), fenêtres des habitations éclairées.
- **Ville habitée** : 110 passants marchent sur les cheminements piétons
  réels, s'arrêtent pour discuter, traversent aux passages ; touffes d'herbe
  3D sur les bas-côtés.
- **Lignes aériennes** : 357 poteaux triangulés depuis les panoramiques
  (+ 77 interpolés), reliés par 210 portées de caténaires paraboliques.
- **Circulation légère** : une douzaine de véhicules parcourent les voies du
  bourg, roulent à droite, respectent les sens uniques et freinent derrière
  le joueur.
- **Parc automobile varié** : cinq silhouettes (compacte, berline, break,
  fourgonnette, fourgon) plus des scooters, plaques et rétroviseurs, palette
  pondérée du parc français ; ombre de contact sous chaque véhicule garé.
- **Trottoirs à bordures** dans le centre-bourg : plateau surélevé de 12 cm,
  chant de bordure clair, interrompus aux carrefours et devant les parkings.
- **Passages piétons à la française** : bandes parallèles à l'axe de la
  circulation, usure mesurée passage par passage sur les panoramiques.
- **Couronnement des toits** : chant de rive sous chaque égout, antennes
  râteau sur un tiers des cheminées, toutes tournées vers le même émetteur.
- **Surfaces végétales nuancées** : plaques d'herbe jaunie et taches de
  terre, en tuile de 34 m, qui cassent les aplats verts uniformes.

### Le centre-bourg modélisé à la main

Le corridor commerçant, du Leclerc Express à l'église, est reconstruit
bâtiment par bâtiment d'après les photographies et les orthophotos, avec ses
enseignes réelles :

- **Leclerc Express** et sa devanture, sa **station-service** (marquise à
  bandeau bleu, pompes, totem) posée sur l'emprise mesurée de son auvent, son
  **parking entier** relevé sur orthophoto (double-rangées dos à dos) et son
  abri caddies
- **La Poste** : R+1 crème à balcon filant, LA POSTE en grandes lettres sur
  les deux façades, caisson jaune, distributeur bleu encastré, drapeaux et
  boîte aux lettres
- **Au Comptoir · Brasserie** et sa terrasse (store banne, tables, chaises),
  **maison de la presse**, café, **Maison Chaudron** (bandeau noir aux lettres
  dorées, ARTISAN BOULANGER PÂTISSIER, épi de blé en drapeau)
- **CPC Invest**, **MMA** et ses trois macarons, **Caisse d'Épargne** (lettres
  anthracite, écureuil en drapeau), **pharmacie Barrouilhet** (bandeau
  vertical à croix vertes, croix lumineuse d'angle)
- **Mairie**, **église Saint-Pierre**, **gare**, immeubles d'angle du
  carrefour de la Patte d'Oie, jardinières de la place, préaux des écoles

Le stationnement suit les photos : file longitudinale devant les commerces,
bande en bataille côté est de l'avenue, place du Général de Gaulle laissée en
esplanade piétonne, et les bandes se rognent automatiquement quand elles
approchent une chaussée.

### La minicarte

Dessinée en canvas 2D plutôt qu'avec une seconde caméra : un tracé vectoriel des
seules voies carrossables coûte moins cher et reste net à cette taille.

Elle tourne avec le véhicule, la route devant lui vers le haut du disque. Une
couronne cardinale en marque le pourtour, le nord en rouge, et le cap suivi
s'affiche en degrés au sommet. La flèche centrale garde sa direction, puisque
c'est la carte qui pivote sous elle.

Les voies sont préparées une fois au chargement et rangées dans une grille de
cellules de 240 m : le dessin ne parcourt que le voisinage du véhicule, 150
voies au lieu de 353. C'est ce qui permet de la redessiner à chaque image, là où
elle était accrochée au compteur qui cherche le nom de la rue et n'était
rafraîchie que deux fois par seconde.

### Ombres

Le décor projette ses ombres, le véhicule non. La carte d'ombre du soleil n'est
pas recalculée à chaque image et son volume reste resserré autour de la voiture :
une ombre de bâtiment, immobile, s'en accommode, celle d'un véhicule lancé à
50 km/h décrochait. La carrosserie continue de recevoir les ombres du décor,
sans quoi elle resterait lumineuse au pied d'un immeuble.

### LiDAR HD : la forme réelle de chaque toiture

La BD TOPO donne la hauteur d'un bâtiment, pas la géométrie de sa couverture.
Le jeu déduisait donc le faîtage du grand axe de l'emprise au sol, ce qui
alignait des toits identiques sur des bâtiments qui ne le sont pas.

Le **LiDAR HD de l'IGN** mesure le sursol à 0,5 m. La différence entre le MNS
(sommet des objets) et le MNT (terrain nu) donne la hauteur du bâti point par
point : à cette finesse, un toit de 10 m de large est décrit par une vingtaine
de mesures, assez pour retrouver sa pente, l'orientation de son faîtage et
distinguer un deux-pans d'une couverture à pente unique.

Les deux modèles sont servis en WMS par la Géoplateforme, en GeoTIFF 32 bits.
On ne conserve pas la grille (576 Mo pour la zone de jeu) : `npm run fetch-lidar`
échantillonne dans l'emprise de chaque bâtiment et n'en garde qu'une
description compacte, 195 Ko pour la commune entière.

**3 537 toitures sur 3 542 sont ainsi mesurées** (99,9 %), contre 80 % avec le
relevé précédent : 519 couvertures plates, 1 561 à pente unique et 1 457 à deux
pans, avec l'orientation du faîtage et l'écart gouttière-faîtage de chacune.

Deux corrections ont été nécessaires. Le faîtage d'une maison n'étant jamais
exactement centré sur l'emprise, chercher le sommet du profil à une position
fixe classait la plupart des vrais deux-pans en pente unique. Et le MNS ne
distingue pas un arbre d'un bâtiment : une remise de 2 m sous un chêne
ressortait avec 14 m de couverture, jusqu'à ce qu'un plafond lié à la largeur
du bâtiment écarte ces intrusions.

### Pourquoi pas Google Street View ou Google Earth

Les images Street View et la géométrie 3D de Google Earth sont des œuvres
protégées, et leurs conditions d'utilisation interdisent d'en dériver des
reproductions, y compris pour un usage privé.

L'objection n'est d'ailleurs pas seulement juridique. Street View fournirait
des photographies, pas de la géométrie : reconstruire des volumes demanderait
de la photogrammétrie sur des prises de vue qui ne sont pas faites pour ça. Le
LiDAR HD donne directement la forme mesurée des toitures, ce qu'aucune banque
de photographies ne fournira jamais.

**Panoramax**, le service de photographies de rue de l'IGN, couvre Artix avec
plus de 22 000 panoramiques 360° de janvier 2025, sous Licence Ouverte 2.0,
plaques d'immatriculation et visages déjà floutés. `npm run fetch-facades` y
relève la teinte réelle des façades. La source libre est ici techniquement
supérieure, pas un pis-aller.

Depuis août 2026, l'exploitation de Panoramax va bien au-delà de la teinte.
`scripts/panoramax-inventaire.mjs` recense d'abord les **76 365 panoramiques**
de la zone (balayage par cellules de l'API STAC). Cinq pipelines s'appuient
ensuite sur la même géométrie : le gisement d'un point vers la caméra donne sa
colonne dans le panoramique équirectangulaire, son site donne sa ligne.

**1. Caractérisation des façades** (`npm run fetch-panoramax`) choisit pour
chaque bâtiment ses meilleurs points de vue (distance, écart de gisement,
occultations vérifiées contre le bâti voisin) et en tire, pour **2 869
bâtiments** : la teinte réelle du mur (médiane robuste, ombres et végétation
exclues), la **couleur des volets** quand ils sont détectés (413 bâtiments) et
un **indice de grain du parement** qui envoie les façades en pierre ou galets
apparents vers une texture d'appareil du gave.

**2. Placage photographique** (`fetch-facades-photo`, `fetch-centre`) RECTIFIE
la portion de panoramique couvrant une façade en vraie perspective : chaque
pixel de sortie est un point 3D du mur re-projeté dans la photo. La fenêtre
est bornée à la hauteur de gouttière LiDAR, les vues mangées par le ciel ou la
végétation sont écartées automatiquement, le pied de façade est fondu (sinon
les voitures garées se plaquent sur le mur) et l'exposition homogénéisée.
**254 façades** couvrent la zone urbanisée, et **109 façades HD** (panoramiques
5760×2880, plusieurs faces par bâtiment) le corridor commerçant : les
enseignes y sont lisibles en roulant.

**3. Mesure des sols** (`fetch-sols`) relève la teinte réelle de l'enrobé par
type de voie, classe **78 aires de parking** (20 en stabilisé clair, une
enherbée, le reste en enrobé) et mesure l'**usure de 140 passages piétons**,
du blanc neuf au gris presque effacé.

**4. Triangulation des poteaux** (`fetch-poteaux`) détecte les bâtonnets
verticaux sombres se découpant sur le ciel, écarte les arbres par leur
silhouette, et croise les gisements de plusieurs prises de vue : **357
supports** confirmés, à leur position réelle, portant 210 portées de câbles.

**5. Implantation au sol** : pour les parkings et les places, les vues de rue
ne suffisent pas. Les **orthophotos IGN** (WMS Géoplateforme, Licence Ouverte)
donnent la vérité en plan : c'est ainsi que le parking du Leclerc a été
reconstruit, et que la place du Général de Gaulle a été rendue aux piétons
après avoir été prise à tort pour un parking.

Le corridor commerçant, lui, est modélisé **à la main**, bâtiment par
bâtiment, d'après ces mêmes photographies : voir « Le centre-bourg modélisé à
la main » plus haut.

### Outils d'inspection

Deux commandes suppriment les scripts d'analyse jetables lors des séances de
fidélité : `npm run vue -- --poi "Maison Chaudron"` extrait des panoramiques
Panoramax un cadrage plat du lieu demandé (sélection des prises qui voient la
façade de face, correction du contre-jour), et `npm run mesure -- --poi ...`
sort la fiche mesurée prête à recopier : boîte orientée, gouttière LiDAR,
arêtes et normales, façade sur rue choisie d'après le type de voie qui la
longe.

## Comment c'est fait

| Composant | Rôle |
| --- | --- |
| [Babylon.js](https://babylonjs.com) | Rendu 3D (PBR, ciel analytique, IBL, SSAO2, pipeline post-process) |
| [Three.js](https://threejs.org) | Génération de la ville (géométries et matériaux, convertis vers Babylon au chargement) |
| [Rapier](https://rapier.rs) | Moteur physique (Rust compilé en WebAssembly) |
| Web Audio API | Sons et musique, synthétisés en temps réel |
| Overpass API | Extraction des données OpenStreetMap |

### Physique du véhicule

Modèle à quatre roues indépendantes, dans l'esprit des simulateurs :

- suspension ressort/amortisseur par roue, raideur calculée pour que la charge
  statique enfonce le ressort d'un tiers de sa course
- adhérence par cercle de friction : les efforts longitudinaux et latéraux se
  partagent une réserve d'adhérence proportionnelle à la charge sur la roue
- moteur avec courbe de couple de V10 atmosphérique (pic vers 4 500 tr/min,
  régime maximum 8 500), boîte 6 rapports, **propulsion arrière**, comme
  l'Audi R8 réelle affichée à l'écran
- appui aérodynamique et traînée fonction du carré de la vitesse
- le frein à main annule l'adhérence latérale arrière, ce qui permet le drift

Le véhicule et sa physique ont été recalés le 19/08/2026 sur l'Audi R8
affichée, jusque-là restée sur les valeurs d'une compacte générique
héritées de l'origine du projet (masse, couple, traction avant). Chiffres
de performance à remesurer sur une base propre avant de les republier ici.

L'adhérence chute hors chaussée (coefficient 0,72 sur l'herbe contre 1,15 sur
l'asphalte), ce qui se sent immédiatement au volant.

### Son

Tous les bruits sont synthétisés, aucun n'est un enregistrement. La musique,
elle, est un fichier lu en boucle (`public/audio/music1.m4a`). La boucle
générative décrite plus bas reste dans le code et reprend la main si le
fichier est absent ou illisible, plutôt que de laisser le jeu muet.

- **Moteur** : une table d'onde périodique contenant les **cinq explosions
  d'un cycle quatre temps** d'un V10 à 90°, comme le moteur de l'Audi R8
  réelle (quatre jusqu'au 19/08/2026, pour le moteur générique d'origine),
  avec attaque raide et décroissance exponentielle, et un léger déséquilibre
  entre cylindres. Un banc d'oscillateurs continus produit un bourdonnement
  de synthétiseur ; c'est la granularité des détonations qui donne le grain
  d'un vrai moteur. La table est convertie en série de Fourier (64
  harmoniques) pour alimenter deux voix désaccordées, auxquelles s'ajoutent
  bruit d'admission et sifflement de turbo
- **Crépitement à la décélération** : détonations irrégulières dans
  l'échappement quand on lève le pied à haut régime
- **Soupape de décharge** : chuintement bref au passage de rapport
- **Roulement** : bruit rose filtré, dont la fréquence dépend de la vitesse et
  du revêtement
- **Crissements** : bruit résonant proportionnel au glissement réel des pneus
- **Chocs** : composante métallique filtrée plus un grave de tôle, l'amplitude
  suivant la violence de l'impact
- **Musique de secours** : boucle électronique générative à 128 BPM sur une grille
  Am - F - C - G, avec basse, nappe, arpège et batterie

### Rendu

- ville construite en maillages fusionnés par matériau, pour tenir le budget de
  triangles avec 3 542 bâtiments
- **hauteurs mesurées par l'IGN** pour 3 456 bâtiments sur 3 542, et forme de
  toiture relevée au LiDAR pour 3 537 d'entre eux. À défaut, le gabarit est
  estimé depuis l'emprise au sol, ce qui distingue abris de jardin, pavillons, maisons
  R+1 et hangars agricoles au lieu d'aligner des blocs identiques
- **toitures à deux pans** avec faîtage orienté selon le grand axe du bâtiment
  (calculé par analyse en composantes principales de l'emprise) et débord de
  toit marqué, comme sur les maisons béarnaises. Couverture différenciée :
  tuile canal pour l'habitat, bac acier pour les hangars, ardoise pour l'église
- les équipements identifiés d'Artix (Église Saint-Pierre, mairie, gendarmerie,
  Intermarché, Super U, McDonald's, groupe scolaire) reçoivent une hauteur et
  des matériaux conformes à leur usage
- carrosserie modélisée par sections transversales successives, ce qui donne un
  vrai galbe de caisse plutôt qu'un profil extrudé plat
- le terrain affleure la chaussée : un sol plus bas créerait une marche
  verticale au bord de la route, plus haute que le rayon des roues, et la
  voiture ne pourrait plus remonter après une sortie de route
- **relief réel** interpolé depuis les 2 900 altitudes de sol mesurées par
  l'IGN : Artix présente 38 m de dénivelé sur la zone de jeu, et la route
  monte et descend pour de vrai. Routes, bâtiments, haies, arbres et
  lampadaires sont posés sur ce terrain, et la physique roule sur un
  heightfield qui l'épouse
- **16 800 fenêtres** générées à partir du nombre d'étages réel de chaque
  bâtiment : c'est ce qui distingue le plus nettement une façade d'un bloc
  coloré
- dôme de ciel en dégradé zénith/horizon plutôt qu'un fond uni
- **140 passants** marchant sur les 11,6 km de cheminements piétons réellement
  cartographiés (153 trottoirs, sentiers et places). Ils s'arrêtent par deux
  pour discuter, gesticulent en parlant, se tournent vers leur interlocuteur,
  puis reprennent leur route. À l'approche de la voiture ils interrompent la
  conversation et font un pas de côté. Chacun a sa taille, son allure, ses
  vêtements et sa cadence de marche : un groupe uniforme se repère
  immédiatement comme artificiel
- cycle jour/nuit complet avec allumage automatique des phares et des
  lampadaires à la tombée du jour
- traces de pneus laissées au sol lors des glissements
- textures d'asphalte et d'herbe générées en canvas, donc aucun asset externe
- les **maillages instanciés ne sont dessinés qu'à portée utile** : un
  `InstancedMesh` n'étant écarté qu'en bloc par le frustum culling, les
  3 500 arbres, les lampadaires et les véhicules garés étaient chacun
  dessinés en entier où que se trouve la voiture. Une grille par famille
  réordonne les instances par distance et n'en soumet que les proches, soit
  une centaine d'arbres au centre-bourg au lieu de 3 500, sans différence
  visible à l'écran
- **filtrage anisotrope** poussé à 16 (plafonné par profil graphique) sur
  toutes les textures générées, la chaussée en premier : sa texture se
  répète 34 fois, et sans lui l'enrobé bavait dès la vingtaine de mètres

### Profils graphiques

Trois profils sous la touche `J` : **Performance**, **Équilibré** (par défaut)
et **Qualité**. Chacun règle d'un bloc le pixel ratio, la résolution de
l'occlusion ambiante, les ombres et la taille de leur carte, les distances de
brouillard, le nombre de lampadaires réellement calculés, l'effectif des
passants et l'anticrénelage.

Le changement de profil ne reconstruit pas la ville. Les lampadaires sont
alloués une fois pour le plus gros profil et le courant en éteint une partie ;
les passants gardent leurs maillages instanciés et seul le nombre d'instances
dessinées change.

S'y ajoute un ajustement automatique de la résolution, que la touche `U`
désactive : le rendu perd en finesse quand le temps de frame reste durablement
au-dessus du budget, et la retrouve lentement quand la marge revient. Deux
seuils distincts et un délai minimal entre deux ajustements évitent que la
netteté ne batte en permanence, et un plancher garde l'image lisible.

Mesuré à l'arrêt au centre-bourg, à midi, ajustement automatique coupé :

| Profil | Résolution de rendu | Temps de frame |
| --- | --- | --- |
| Performance | 1600 x 683 | 16,7 ms |
| Équilibré | 2400 x 1024 | 16,6 ms |
| Qualité | 3200 x 1366 | 16,7 ms |

Les trois tiennent 60 fps à l'arrêt, y compris Qualité qui rend quatre fois
plus de pixels que Performance : à l'arrêt au centre-bourg, la résolution n'est
pas le facteur limitant. L'écart se creuse en roulage.

### Rendu dessin animé

La touche `K` bascule un rendu stylisé, en deux effets qui partagent la même
passe d'écran (`contours.js`).

Les **contours de silhouette** cernent d'un trait sombre les ruptures de
profondeur et d'orientation. Ils soulignent la géométrie relevée sans toucher
aux couleurs : contreforts de l'église, bandeaux d'immeuble, décrochements de
toiture deviennent lisibles. La détection porte sur la courbure de la
profondeur, et non sur son écart brut, sans quoi une chaussée vue en enfilade
déclencherait un contour à chaque pixel.

L'**ombrage en paliers** quantifie la luminance de l'image en six niveaux, puis
remet la teinte d'origine au rapport. Quantifier les trois canaux séparément
tirerait les couleurs vers les primaires et détruirait les teintes de façade
relevées sur photographie. Le ciel et les surfaces très sombres en sont exclus :
un dégradé de ciel s'y couperait en bandes, une chaussée y perdrait son
marquage.

L'ensemble coûte 2,6 images par seconde, dont 0,2 pour les seuls contours. La
passe emprunte les tampons de profondeur et de normales que l'occlusion
ambiante calcule déjà, et n'ajoute donc aucun rendu de géométrie.

### Grade arcade

La touche `V` bascule un grade couleur (`arcade.js`) : contraste en S,
saturation renforcée, vignettage doux aux bords, léger grain animé d'une
image à l'autre. La passe s'applique **après** `OutputPass`, sur l'image déjà
tone-mappée et en espace sRGB, jamais avant : sur l'image linéaire, la même
courbe de contraste écrasait la chaussée en noir plein. Coût nul mesuré, une
seule passe plein écran sans échantillonnage voisin.

### Stationnement et mobilier

Les **127 aires de stationnement** de la commune, soit dix hectares d'enrobé,
sont reprises d'OpenStreetMap avec leur marquage de places : elles n'étaient pas
demandées à Overpass jusqu'ici et manquaient donc entièrement.

Les places sont disposées **en épi, inclinées à 45°** sur le bord de l'aire,
comme le montrent les panoramiques de l'avenue du 18e Régiment d'Infanterie.
Deux rangées se faisant face penchent en sens inverse, dessinant le chevron
caractéristique d'un parking de bourg. Les cotes découlent de l'angle : une
place de 2,50 m sur 5,00 m inclinée à 45° occupe 3,54 m le long du bord pour
5,30 m de profondeur. Le marquage et les véhicules dérivent d'un même vecteur
directeur, ce qui les empêche de diverger.

Là où une aire borde la voie, le stationnement de rue s'efface : les véhicules
se rangent sur les places marquées plutôt que le long de la chaussée. Sans cette
règle, une file occupait le bord de l'asphalte pendant que les places restaient
vides à côté.

S'y ajoute le mobilier urbain que la circulation côtoie : bancs, corbeilles,
abribus, et les bornes anti-stationnement qui bordent l'îlot du carrefour de la
mairie. Ces dernières ne figurent dans aucune base : leur emprise est relevée
sur les photographies de rue.

### La nuit

Une ville éclairée n'est jamais noire. La lueur des lampadaires, des vitrines
et la réverbération du ciel sur la couche nuageuse donnent une clarté de fond
que reproduit l'ambiance nocturne, virant au bleu nuit avec un rebond de sol
orangé, la teinte que prend une chaussée sous éclairage public.

Vingt foyers sont calculés en lumière réelle, réaffectés en continu aux
lampadaires les plus proches du véhicule parmi les 911 de la commune ; les
autres ne sont représentés que par leur lanterne émissive. Leur portée de 45 m
correspond à l'inter-distance d'une rue de bourg, de sorte que les flaques de
lumière se recouvrent au lieu de laisser la voie dans le noir entre deux mâts.

## Réglages

Les principales constantes sont regroupées et commentées :

- `src/car.js` → `SPEC` : masse, empattement, suspensions, rapports de boîte,
  couple moteur, coefficients d'adhérence
- `src/world.js` → `ROAD_Y`, `WALL_COLORS`, `ROOF_COLORS`, densité des arbres
- `src/audio.js` → `bpm`, `progression` (accords), niveaux des bus audio
- `src/osm.js` → `MAX_RADIUS` (rayon de ville chargé), largeurs de voies
- `src/main.js` → `MODELE_VOITURE` (fichier du véhicule piloté), `GTAO_ECHELLE`
  (résolution de l'occlusion ambiante)
- `src/streetlights.js` → `POOL` (nombre de lampadaires calculés), `PORTEE`
- `src/landmarks.js` → `ANGLES_ARRONDIS`, `IMMEUBLES_RUE` : les bâtiments
  modélisés un par un depuis les photographies
- `src/world.js` → `PLACETTES_PAVEES` (emprises pavées non cartographiées)

En développement, `window.__game` expose la scène, le renderer et
`setHeure(h)`, qui saute à une heure du cycle jour/nuit sans attendre.

## Le véhicule

**Audi R8**, modèle glTF de 207 329 triangles, compressé en Meshopt : le
fichier pèse 1,65 Mo contre 7,54 auparavant, pour une géométrie identique au
triangle près. Il ne portait aucune texture, seulement de la géométrie brute en
virgule flottante, ce qui en faisait 80 % du poids réellement transféré. Le
décodeur est fourni par Three.js et reste local. Le fichier d'origine était un
fichier de studio : 807 274 triangles, un plan de sol et deux sources de lumière
modélisées, chaque roue éclatée en sept pièces. La conversion l'a ramené au
gabarit du jeu et regroupé ses roues sous les quatre noms attendus par le
chargeur, avec leur translation propre.

Le chargeur (`carmodel.js`) recale l'orientation, met le modèle à la longueur
cible de 4,25 m et pose le bas des pneus à la hauteur qu'attend la physique. Il
enveloppe chaque roue dans deux pivots imbriqués, l'un pour le braquage, l'autre
pour le roulement : l'orientation propre du noeud, héritée de la modélisation et
sans signification physique, reste ainsi portée un cran plus bas et n'entraîne
pas l'axe de rotation.

Le modèle n'a pas d'habitacle : c'est une carrosserie extérieure seule, sans
sièges ni planche de bord. La caméra intérieure a été retirée pour cette raison
le 19/08/2026 : une vue depuis le poste de conduite n'y montrait que de la
carrosserie. La caméra capot occupe cette place.

Vue pile de l'arrière, la voiture masque ses propres roues derrière son bouclier,
comme le fait la vraie : le débord de carrosserie mesure 0,147 m par côté contre
0,151 m sur une R8 de série. Elles se voient de trois quarts et en caméra
cinématique.

L'attribution du fichier reste à retrouver : il a été retraité par
glTF-Transform et ne porte plus ni auteur ni licence.

Le pack **Kenney Car Kit** (CC0) avait été essayé auparavant : vingt fois plus
léger, roues nommées séparément, dix images par seconde de mieux. Il a été
écarté pour son style, franchement cartoon : carrosseries trapues, aplats de
couleur, roues en disques plats, aucun vitrage. Dans une ville reconstituée au
LiDAR et à la photographie de rue, le contraste était trop fort. Le chargeur
reconnaît malgré tout sa convention de nommage : déposer un de ces fichiers
dans `public/models/` et changer `MODELE_VOITURE` suffit à l'essayer.

Un maillage procédural reste disponible dans `carmesh.js`, avec ses proportions
dans la table `SECTIONS` : il sert de secours si le chargement du glTF échoue.

## Limites connues

- les façades sont des aplats de couleur : la teinte est relevée sur les
  photographies de rue, mais aucune texture photographique n'y est plaquée
- les véhicules stationnés et les passants animent la ville, mais il n'y a pas
  de trafic au sens propre : aucun véhicule ne circule ni ne respecte la
  signalisation
- les bâtiments en fond de parcelle gardent une teinte déduite de leur matériau
  BD TOPO : aucune photographie de rue ne les atteint
- les ombres se coupent par la touche O, ou en passant au profil Performance.
  Leur coût vient de leur échantillonnage sur les triangles qui les reçoivent,
  pas de la construction de la carte d'ombre
- **des à-coups subsistent en roulage** : 17,4 % des frames dépassent 20 ms et
  le p99 reste à 28,8 ms, sans que le découpage de la végétation ni la
  suppression des allocations ne les aient réduits. La médiane, elle, tient
  60 fps. La cause de ces pointes n'est pas identifiée

## Calage sur photographies

Les teintes de façade et de toiture ainsi que la palette de feuillages ont été
calées sur des photographies du bourg publiées sur Wikimedia Commons sous
licence CC BY-SA 3.0 (auteur : Jean Michel Etchecolonea) : la mairie, la rue
principale et le carrefour au cèdre.

Ce que ces photos ont corrigé :

- les façades d'Artix sont **blanc cassé et crème**, bien plus claires que la
  palette beige du bâti béarnais que j'avais retenue au départ
- l'**ardoise grise** est très présente en centre-bourg, à côté de la tuile
- les tuiles sont plus **brunes et ternes** que la tuile canal vive du Sud
- de grands **conifères bleutés** (cèdres) ponctuent les carrefours, là où le
  rendu n'affichait qu'un vert foncé uniforme

Trois panoramiques Panoramax du centre-bourg ont ensuite servi de référence
pour la modélisation elle-même : le carrefour de la mairie, la place aux
commerces et le carrefour Au Comptoir. Chaque prise de vue est localisée par
recoupement avec les points d'intérêt OpenStreetMap, ce qui permet de rattacher
un détail vu sur l'image au bon bâtiment.

Ce qu'elles ont apporté, et qu'aucune base ne portait : le pavage du carrefour
de la mairie, les bornes anti-stationnement, les cyprès du bourg, l'avant-corps
en pignon de l'immeuble Au Comptoir, le pan arrondi de l'immeuble Vapozen.

**Les mesures se lisent en rapports, jamais en valeurs absolues.** Les prises de
vue datent de janvier et sont souvent à contre-jour : un volet blanc n'y mesure
que 142 de luminance au lieu de 235, et l'écart d'exposition atteint un facteur
quatre à l'intérieur d'une même image. Le rapport entre deux surfaces voisines,
lui, reste vrai. C'est ainsi qu'ont été corrigées les teintes de chaussée
(0,47 fois la clarté d'un mur blanc, contre 0,95 auparavant) et de trottoir
(0,32 contre 0,73).

Les images elles-mêmes ne sont pas redistribuées dans le projet : elles ont
servi de référence visuelle, et seules les valeurs de couleur et de géométrie
en sont issues.

---

## Licence et attributions

Le code source est sous licence MIT (voir `LICENSE`).

Données cartographiques © les contributeurs OpenStreetMap, sous licence ODbL.
BD TOPO® © IGN, sous Licence Ouverte 2.0. Photographies de référence
© Jean Michel Etchecolonea, CC BY-SA 3.0, via Wikimedia Commons, et Panoramax
sous Licence Ouverte 2.0.

Le modèle 3D du véhicule ne porte plus de métadonnées d'auteur : son
attribution reste à établir. Le détail de chaque source figure dans
`ATTRIBUTIONS.md`.
