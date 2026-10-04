# Artix Racer

Jeu de voiture 3D jouable au clavier, dans la ville d'**Artix (64170)**,
Pyrénées-Atlantiques, modélisée à partir des données cartographiques réelles.

Tout tourne en local, hors ligne, sans compte ni clé d'API.

## Lancer le jeu

```bash
npm install && npm run dev
```

Puis ouvrir http://localhost:5173 dans **Chrome ou Safari** (pas dans un
navigateur intégré à un éditeur : l'animation y est bridée et le jeu paraît
saccadé alors qu'il tourne à 60 fps dans un vrai navigateur).

Pour une version optimisée :

```bash
npm run build && npm run preview
```

## Commandes

| Touche | Action |
| --- | --- |
| ↑ / Z / W | Accélérer |
| ↓ / S | Freiner, puis marche arrière |
| ← / → ou Q / D | Diriger |
| Espace | Frein à main (drift) |
| Maj | Nitro |
| C | Changer de caméra (poursuite, conducteur, aérienne) |
| R | Réapparaître au point de départ |
| T | Relancer le chrono |
| L | Ambiance d'éclairage : Midi, Fin de journée, Nuit |
| 1 / 2 / 3 | Profil graphique : Performance, Équilibré, Qualité |
| M | Couper ou relancer la musique |
| P ou Échap | Pause |
| Entrée | Démarrer en balade libre (l'écran titre propose aussi le Tour d'Artix chronométré) |

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
npm run fetch-panoramax     # teinte, volets et grain des 2 869 façades
npm run fetch-facades-photo # 254 façades rectifiées en atlas
npm run fetch-centre        # 109 façades HD du corridor du bourg
npm run fetch-sols          # enrobés, parkings, usure des passages
npm run fetch-poteaux       # 357 poteaux triangulés
```

Les fonds OSM, BD TOPO et LiDAR (`artix-osm.json`, `artix-bdtopo.json`,
`artix-toits-lidar.json`) sont livrés avec le dépôt et n'ont pas de script de
rafraîchissement : ils ont été constitués une fois par requêtes Overpass et
WFS/WMS IGN.

### Signalisation et équipements

Les panneaux sont plantés à l'emplacement réel des nœuds OSM, décalés sur
l'accotement : les stops sont cartographiés sur l'axe de la chaussée, les
poser tels quels les dresserait au milieu de la voie.

**Ils sont posés à droite de la chaussée**, dans le sens qu'ils régissent :
c'est une règle d'implantation, pas une préférence. Le côté vient du tag OSM
`direction` (`forward`/`backward`), que portent 77 des 86 panneaux de priorité
d'Artix. Le code retenait auparavant le bord le mieux dégagé, ce qui en
plantait la moitié à gauche, là où aucun conducteur ne les cherche. Si le côté
droit tombe sur une chaussée transversale, le panneau recule le long de sa
propre voie plutôt que de changer de bord.

Leur orientation vient du même tag : la face du panneau remonte le sens de
circulation, donc regarde le conducteur qui arrive. Sans cette information,
« tourner le panneau vers la chaussée » laisse deux solutions sur une voie à
double sens et en retient une au hasard.

Chaque panneau est un **volume** de 3 cm d'épaisseur, pas une plaque plate :
la face texturée est sur l'avant, de la tôle grise sur les cinq autres faces.
Le back-face culling ne pouvait pas servir ici, le pont Three vers Babylon le
désactivant partout pour protéger les nappes cadastrales inversées, et la
scène étant de surcroît en repère main droite où Babylon inverse sa convention
d'enroulement : un STOP en deux plans dos à dos se lisait EN MIROIR depuis la
voie opposée. Un objet épais n'a pas de face traversante.

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

### Rendu et identité visuelle (chantiers d'août et septembre 2026)

- **Ciel photographique HDR** : trois panoramas Poly Haven (jour, soir, nuit)
  servent à la fois de fond et d'éclairage d'ambiance. Les nuages visibles
  sont exactement ceux qui se reflètent sur la carrosserie, et la lumière
  directionnelle est posée sous le soleil du panorama, dont la position est
  mesurée par `scripts/ciel-soleil.mjs`. Le script plafonne aussi le disque
  solaire : sans cela il entre dans l'éclairage d'ambiance et éclaire tout
  sans ombre.
- **Sols photographiques** (ambientCG, CC0) avec cartes de normales : enrobé,
  herbe, béton de trottoir, pavés, grave, écorce. C'est le relief de la
  normale qui accroche la lumière rasante, ce qu'un grain de canvas ne
  pouvait pas rendre, et ce qui distingue enfin le trottoir de la chaussée.
- **Chaîne des Pyrénées** : panorama peint par Codex
  (`public/textures/fond/pyrenees.png`), posé sur des arcs qui suivent la
  caméra, sous le plan lointain et hors brouillard. Le relief est
  volontairement grossi : à sa cote réelle (62,6 km, 2,26° de haut) le pic
  du Midi d'Ossau serait invisible.
- **Occlusion ambiante et flou de mouvement** en profil Qualité : ils exigent
  une pré-passe qui redessine la ville, d'où leur réservation au profil le
  plus lourd.
- **Étalonnage image** : grain animé, aberration chromatique de bord de champ,
  courbes couleur (ombres bleutées, hautes lumières chaudes).
- **Volets** sur les habitations, ouverts de part et d'autre de chaque baie :
  couleur relevée sur les panoramiques Panoramax quand elle est détectée,
  sinon palette des teintes réellement vues à Artix (bordeaux, vert, bleu-gris,
  bois). Depuis octobre 2026, la texture des volets et des fenêtres vient
  d'images Codex, avec des variantes (persiennes, menuiseries PVC sans volets).
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
  La texture de feuilles est une image Codex depuis octobre 2026.
- **Trois ambiances d'éclairage** sur la touche L : midi, fin de journée aux
  ombres longues, nuit. Chaque bascule re-rend la sonde d'environnement et
  ajuste ciel, brouillard, exposition et noirceur des ombres.
- **Nuit complète et ÉCLAIRÉE** : phares, optiques et feux émissifs, lanternes
  allumées, halos de lumière sodium au sol sous les 911 lampadaires
  (permanents, sans attendre le passage du joueur), fenêtres des habitations
  éclairées. Douze sources réelles de 260 cd portant à 62 m suivent le
  joueur : la chaussée et les façades sont lisibles, une rue éclairée au
  sodium n'étant jamais noire entre deux lampadaires.
- **Ville habitée** : 110 passants marchent sur les cheminements piétons
  réels, s'arrêtent pour discuter, traversent aux passages ; touffes d'herbe
  3D sur les bas-côtés. Silhouettes aux proportions d'adultes de 1,60 à
  1,86 m (buste à épaules, cou, chevelure, chaussures), en six maillages
  instanciés qui coûtent 0,4 fps pour 110 personnes. Depuis octobre
  2026 : visage peint, manches courtes ou longues, mains.
- **Haies de clôture** (`src/three-city/haies.js`) : quatre espèces relevées
  sur Street View, laurier-palme, cyprès de Leyland, troène doré et charmille
  sur tronc. Volumes à flancs dressés et crête dentelée, avec un grain de
  surface et une nuance par facette : l'ancien rendu, une boîte verte à trois
  faces plates, se lisait comme un muret peint. OSM n'en cartographie que 23,
  toutes en périphérie ; les 13 km du bourg sont déduits des rues
  résidentielles, avec une trouée sur deux pour les entrées de garage.
- **Lignes aériennes** : 357 poteaux triangulés depuis les panoramiques
  (+ 77 interpolés), reliés par 210 portées de caténaires paraboliques, et
  des branchements qui descendent du réseau vers les façades voisines.
- **Circulation légère** : une douzaine de véhicules parcourent les voies du
  bourg, roulent à droite, respectent les sens uniques et freinent derrière
  le joueur.
- **Parc automobile modelé** : citadine, berline, SUV et van low-poly
  (pack rgsdev, CC0) aux cotes réelles, pour le stationnement et la
  circulation, en carrosserie vernie teintée par instance et en détails
  (vitres, feux, garnitures) à palette ; roues à jante argentée ; palette pondérée du parc français, ombre de
  contact sous chaque véhicule. Les scooters gardent leur silhouette
  procédurale.
- **Trottoirs à bordures** dans le centre-bourg : plateau surélevé de 12 cm,
  chant de bordure clair, interrompus aux carrefours et devant les parkings.
- **Passages piétons à la française** : bandes parallèles à l'axe de la
  circulation, usure mesurée passage par passage sur les panoramiques.
- **Marquage complet** : lignes de rive continues des deux côtés de toutes les
  voies du bourg (dessertes et chemins exclus, comme en réalité), axe médian
  discontinu sur les bidirectionnelles assez larges. Largeur de trait et
  retrait du bord proportionnels à la largeur de la voie.
- **Couronnement des toits** : chant de rive sous chaque égout, antennes
  râteau sur un tiers des cheminées, toutes tournées vers le même émetteur.
- **Surfaces végétales nuancées** : plaques d'herbe jaunie et taches de
  terre, en tuile de 34 m, qui cassent les aplats verts uniformes.

### Motion design arcade et bâti ordinaire (chantier d'octobre 2026)

La fidélité stricte a été assouplie pour le bâti que personne n'a modélisé à
la main : Codex (OpenAI) a généré les textures de fenêtres, volets, portes,
génoise, feuillage, fumée, le panorama des Pyrénées et l'écran titre, avec la
règle de n'ajouter aucun appel de dessin (atlas, instances, fusion).

- **Motion design** (`src/arcade.ts`) : champ de vision qui s'ouvre avec la
  vitesse et la nitro, secousse et flash aux chocs, combo de
  dérapage à paliers, compte à rebours avant le Tour d'Artix, bannières
  animées en CSS et hiérarchisées (l'arrivée prime sur un checkpoint).
  Caméra poursuite qui regarde vers la sortie du virage (selon la rotation
  réelle de la voiture), arrêt sur image de 70 à 100 ms aux chocs francs,
  nom de rue qui entre en glissant après confirmation, anneau de checkpoint
  qui jaillit, nitro en pic puis palier.
- **Moments clés** : l'écran titre s'avance et s'efface pendant que la
  caméra plonge de 22 m sur la voiture ; **départ parfait** (accélérer dans
  les 0,3 s avant le GO ou 0,2 s après : 47 km/h d'entrée et 1 000 points,
  annulé si la pédale était enfoncée pendant le décompte) ; **frôlement**
  d'un véhicule de la circulation à moins de 5 m et plus de 50 km/h, payé
  une fois dépassé, avec un accent qui entre par le bon côté ; **arrivée au
  ralenti** (30 % pendant 0,8 s) et temps final mis en avant. Aucun maillage ajouté : caméra, pipeline existant et couche
  DOM.
- **Fumée de pneus et poussière hors-piste** (`src/fumee.ts`) : un seul
  système de particules, un appel de dessin quand il émet.
- **Écran titre** illustré (`public/images/titre.jpg`).
- **Trois couvertures** lues dans les matériaux MAJIC : tuile, ardoise et bac
  acier, en textures ambientCG. Crépi des murs en ambientCG lui aussi.
- **Génoise** sous l'égout et **soubassement** au pied des façades.
- **Portes sur la façade côté rue**, portes de garage, et **vitrines en
  profondeur** (parallaxe dans la carte de relief) sur les rez-de-chaussée
  commerçants, écartées autour des services publics.
- **Plaques de rue émaillées** aux carrefours, aux vrais noms OSM, écrites par
  `scripts/preparer-plaques.mjs` sur un fond Codex sans texte (un générateur
  d'images déforme les lettres).
- **Ombres de contact au pied des murs** (mélange multiplicatif) et
  **coulures** sous les appuis de fenêtre.
- **Parc automobile rgsdev** (voir « Le véhicule »).

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

### Les groupes scolaires

Les cinq établissements d'Artix sont modélisés en dur depuis le 04/09/2026,
relevés sur Street View (imagerie mai 2026 pour Jean Moulin, avril 2016 pour
Jean Sarrailh, dont le bâti n'a pas changé) :

- **Collège Jean Moulin** : le seul en R+1, bardage gris anthracite et larges
  encadrements de baies bleu vif à l'étage, cage d'escalier en avant-corps,
  garde-corps de terrasse
- **École élémentaire Jean Moulin** : barre de plain-pied à tuile rouge-brun,
  poteaux blancs, stores toile beige baissés, bandeau de rive vert
- **École maternelle Jean Moulin** : bandeau bleu sous gouttière, et sa cour
  avec portique rouge et cabane bleue
- **École maternelle Jean Sarrailh** : pignon sur rue, panneaux colorés
  vert-rose-bleu, auvent d'entrée et drapeau
- **École élémentaire Jean Sarrailh** : longue barre blanche à bandeau continu
  de menuiseries turquoise, sa signature depuis la rue Fourticot

Ce sont des bâtiments d'après-guerre à ossature poteaux-poutres : c'est le
RYTHME de leur façade (un poteau tous les 3,4 m, un bandeau continu de baies)
qui les identifie, pas leur volume.

Le groupe Jean Moulin a demandé un traitement particulier. La BD TOPO lui
donne **une seule emprise de 5 856 m² et 47 sommets** : extrudée telle quelle,
elle produisait un bloc plein de 8,1 m qui avalait les bâtiments modélisés.
L'orthophoto montre en réalité un peigne d'ailes étroites autour de deux
cours, reconstruit aile par aile depuis les arêtes mesurées.

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

Ombres en cascades (CSM) du soleil, jusqu'à 330 m de la caméra, stabilisées
pour ne pas scintiller en roulant. La Ferrari projette et reçoit les ombres ;
les véhicules de la flotte et les murs ajoutent une ombre de contact peinte,
qui assoit les volumes là où la carte d'ombre manque de finesse.

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
On ne conserve pas la grille (576 Mo pour la zone de jeu) : l'échantillonnage
se fait dans l'emprise de chaque bâtiment et n'en garde qu'une description
compacte, 195 Ko pour la commune entière (`artix-toits-lidar.json`).

**3 537 toitures sur 3 542 sont ainsi mesurées** (99,9 %), contre 80 % avec le
relevé précédent : 519 couvertures plates, 1 561 à pente unique et 1 457 à deux
pans, avec l'orientation du faîtage et l'écart gouttière-faîtage de chacune.

Deux corrections ont été nécessaires. Le faîtage d'une maison n'étant jamais
exactement centré sur l'emprise, chercher le sommet du profil à une position
fixe classait la plupart des vrais deux-pans en pente unique. Et le MNS ne
distingue pas un arbre d'un bâtiment : une remise de 2 m sous un chêne
ressortait avec 14 m de couverture, jusqu'à ce qu'un plafond lié à la largeur
du bâtiment écarte ces intrusions.

### Panoramax d'abord, Street View en appoint

Le projet s'appuie d'abord sur les sources ouvertes : Street View fournit
des photographies, pas de la géométrie : reconstruire des volumes demanderait
de la photogrammétrie sur des prises de vue qui ne sont pas faites pour ça. Le
LiDAR HD donne directement la forme mesurée des toitures, ce qu'aucune banque
de photographies ne fournira jamais. Depuis août 2026, Street View et Google
Maps servent toutefois d'appoint visuel (usage strictement personnel, le jeu
n'est jamais publié) pour les bâtiments trop récents pour la campagne
Panoramax, comme la zone commerciale est ; la géométrie continue de venir
des données IGN et OSM.

**Panoramax**, le service de photographies de rue de l'IGN, couvre Artix avec
plus de 22 000 panoramiques 360° de janvier 2025, sous Licence Ouverte 2.0,
plaques d'immatriculation et visages déjà floutés. `npm run fetch-panoramax` y
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
| [Babylon.js](https://babylonjs.com) | Rendu 3D (PBR, ciel HDR, IBL, ombres CSM, SSAO2, pipeline post-process) |
| [Three.js](https://threejs.org) | Génération de la ville (géométries et matériaux, convertis vers Babylon au chargement) |
| Web Audio API | Moteur et turbo synthétisés, musique lue depuis un fichier |
| Overpass API, Géoplateforme IGN | Extraction des données OpenStreetMap, BD TOPO, LiDAR HD et orthophotos |

### Conduite

Modèle arcade volontaire (`src/car.ts`), sans moteur physique : une vitesse
scalaire, un cap, et le relief lu dans l'index spatial (`world.ts`).

- vitesse de pointe de 187 km/h, 238 km/h sous nitro ; la jauge de nitro se
  vide en six secondes et se recharge en roulant
- hors chaussée, l'accélération tombe à 40 % et la vitesse plafonne à
  65 km/h, ce qui se sent immédiatement au volant
- le frein à main en virage déclenche un dérapage qui resserre le virage de
  72 % et alimente le combo de dérapage
- l'angle de braquage se réduit avec la vitesse, pour garder la voiture
  tenable à haute allure

L'ancien modèle à quatre roues indépendantes (suspension, boîte six rapports,
cercle de friction) appartenait au moteur Three.js retiré le 19 septembre
2026, avec le moteur physique Rapier.

### Son

- **Moteur** : oscillateur en dent de scie passé dans un filtre passe-bas,
  dont la fréquence suit la vitesse (de 58 à 243 Hz)
- **Turbo** : sifflement sinusoïdal à 920 Hz, audible sous nitro
- **Musique** : `public/audio/music1.mp3` lue en boucle, coupée et relancée
  par la touche `M`

Le son démarre au premier appui de touche ou clic : les navigateurs bloquent
l'audio tant que la page n'a pas reçu d'interaction.

### Rendu

- ville construite en maillages fusionnés par matériau, pour tenir le budget de
  triangles avec 3 542 bâtiments
- **hauteurs mesurées par l'IGN** pour 3 456 bâtiments sur 3 542, et forme de
  toiture relevée au LiDAR pour 3 537 d'entre eux. À défaut, le gabarit est
  estimé depuis l'emprise au sol, ce qui distingue abris de jardin, pavillons, maisons
  R+1 et hangars agricoles au lieu d'aligner des blocs identiques
- **toitures à deux pans** avec faîtage orienté selon le grand axe du bâtiment
  (calculé par analyse en composantes principales de l'emprise) et débord de
  toit marqué, comme sur les maisons béarnaises. Couverture lue dans les
  matériaux MAJIC : tuile, ardoise ou bac acier, chacune en texture ambientCG
- les équipements identifiés d'Artix (Église Saint-Pierre, mairie, gendarmerie,
  Intermarché, Super U, McDonald's, groupe scolaire) reçoivent une hauteur et
  des matériaux conformes à leur usage
- le terrain affleure la chaussée : un sol plus bas créerait une marche
  verticale au bord de la route, plus haute que le rayon des roues, et la
  voiture ne pourrait plus remonter après une sortie de route
- **relief réel** interpolé depuis les 2 900 altitudes de sol mesurées par
  l'IGN : Artix présente 38 m de dénivelé sur la zone de jeu, et la route
  monte et descend pour de vrai. Routes, bâtiments, haies, arbres et
  lampadaires sont posés sur ce terrain, et la voiture en suit l'altitude
- **environ 22 600 fenêtres** (14 200 à volets, 8 400 en PVC) générées à
  partir du nombre d'étages réel de chaque bâtiment : c'est ce qui distingue le plus nettement une façade d'un bloc
  coloré
- ciel photographique HDR servant aussi d'éclairage d'ambiance
- **110 passants** marchant sur les 11,6 km de cheminements piétons réellement
  cartographiés (153 trottoirs, sentiers et places). Ils s'arrêtent par deux
  pour discuter, gesticulent en parlant, se tournent vers leur interlocuteur,
  puis reprennent leur route. À l'approche de la voiture ils interrompent la
  conversation et font un pas de côté. Chacun a sa taille, son allure, ses
  vêtements et sa cadence de marche : un groupe uniforme se repère
  immédiatement comme artificiel
- trois ambiances sur la touche `L` (midi, fin de journée, nuit) ; la nuit
  allume phares, lampadaires et fenêtres
- fumée de pneus au dérapage, poussière hors chaussée
- sols, enduits et couvertures en photos de matière CC0 (ambientCG) avec
  cartes de normales ; menuiseries, portes, génoise et feuillage en images
  Codex ; le marquage et quelques grains restent générés en canvas
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

Trois profils sous les touches `1`, `2` et `3` : **Performance**, **Équilibré** (par défaut)
et **Qualité** (`src/config.ts`). Chacun règle d'un bloc l'échelle de rendu,
les distances de brouillard, les ombres (activation, taille de carte, filtrage,
nombre de cascades), l'occlusion ambiante et le flou de mouvement. Ces deux
derniers ne sont actifs qu'en Qualité : ils exigent une pré-passe qui redessine
toute la ville.

Le changement de profil ne reconstruit pas la ville.

S'y ajoute un ajustement automatique de la résolution, toujours actif : le
rendu perd en finesse quand la cadence reste durablement sous 60 images par
seconde, et la retrouve lentement quand la marge revient. Deux seuils
distincts évitent que la netteté ne batte en permanence, et un plancher garde
l'image lisible.

Le coût dominant est le nombre d'appels de dessin, pas la résolution. Mesuré
le 4 septembre 2026 en conduite (1440 × 683, image complète 8,81 ms) : la
géométrie prend 84 % du temps, le remplissage de pixels 12 %, les ombres et le
post-process le reste. Les petits maillages statiques sont donc fusionnés par
matériau et par cellule de 300 m (`ThreeCityConverter.fusionner`).

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

Douze foyers sont calculés en lumière réelle, réaffectés en continu aux
lampadaires les plus proches du véhicule parmi les 911 de la commune (20
cartographiés dans OSM, les autres déduits le long des voies) ; les autres ne
sont représentés que par leur lanterne émissive. Leur portée de 62 m
correspond à l'inter-distance d'une rue de bourg, de sorte que les flaques de
lumière se recouvrent au lieu de laisser la voie dans le noir entre deux mâts.

## Réglages

Les principales constantes sont regroupées et commentées :

- `src/car.ts` → conduite arcade : accélération, traînée, adhérence, dérapage,
  nitro, et le modèle du véhicule piloté. Le modèle physique détaillé (masse,
  empattement, rapports de boîte) appartenait au moteur Three.js retiré le
  19 septembre 2026 ; la conduite est aujourd'hui volontairement arcade
- `src/three-city/world.js` → `ROAD_Y`, `GARDE_SOL`, densité des arbres,
  `PLACETTES_PAVEES` (emprises pavées non cartographiées)
- `src/three-city/osm.js` → `ORIGIN`, `ROAD_WIDTH` (largeurs de voies)
- `src/three-city/landmarks.js` → les bâtiments modélisés un par un depuis les
  photographies
- `src/audio.ts` → `MUSIQUE`, niveaux des bus audio
- `src/config.ts` → les trois profils de qualité (brouillard, ombres, SSAO)
- `src/arcade.ts` → motion design : champ de vision, secousses, paliers du
  combo de dérapage
- `src/fumee.ts` → fumée de pneus et poussière hors-piste
- `src/three-city/flotte.js` → gabarits et cotes des véhicules du parc

Depuis la console du navigateur : `__profil()` découpe le temps de frame,
`__repartition()` classe les appels de dessin par matériau, `__comparer()`
mesure le GPU hors vsync, `__regarder(x, y, z)` oriente la caméra et `__car`
donne la voiture (utile pour se téléporter).

## Le véhicule

**Ferrari 458 Italia**, le modèle de l'exemple `webgl_materials_car` de
three.js (auteur vicent091036), en place depuis le 04/09/2026. Il remplace
l'Audi R8 : 1,60 Mo contre 4,21, aucune texture (tout est porté par dix-sept
matériaux de couleur), et surtout un **habitacle complet** avec volant, sièges,
planche de bord et console centrale, là où le modèle précédent n'était qu'une
carrosserie extérieure. Le modèle est à l'échelle réelle, empattement mesuré à
2,65 m, la cote officielle de la 458.

Le chargeur (`src/car.ts`) met le modèle à la longueur cible de 4,35 m, pose le
bas des pneus à la hauteur qu'attend la conduite, et lui fait faire un
demi-tour : le modèle regarde -Z (roues avant à z = -1,16, arrière à +1,50)
quand la scène attend l'inverse. Les roues sont retrouvées par leurs noms
`wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`.

Les matériaux sont repris nom par nom : vernis sur `Body_Color`, transparence
sur `Glass_Gray` (le modèle le livre opaque, ce qui bouchait l'habitacle),
métal poli sur les jantes, caoutchouc mat sur les pneus.

### La vue conducteur

L'habitacle a permis de rétablir une **caméra intérieure** (touche `C`,
deuxième position), retirée en août 2026 faute de poste de conduite à montrer.
Elle est posée à la place du volant, à gauche : le modèle place son
`steering_wheel` du côté gauche, ce que confirment les noms de roues
(`wheel_fl` en x négatif).

Trois choix la distinguent des caméras extérieures :

- **Elle ne s'interpole pas.** Les vues extérieures suivent le véhicule avec
  un lissage, ce qui les adoucit ; à l'intérieur, le même lissage faisait
  flotter l'habitacle à chaque accélération. La caméra est solidaire de la
  caisse, tangage et roulis visuels compris, via `getDirectionToRef`.
- **Le recul commande le cadrage**, pas la hauteur. Le volant occupe une part
  de l'image qui dépend de sa distance à l'œil : à 12 cm de recul il mangeait
  69 % de la hauteur, à 55 cm il tombe à 38 % et dégage la route.
- **Les sièges sont masqués**, comme dans tout jeu de course : on ne voit
  jamais son propre dossier au volant. Le cas est délicat parce que le mesh
  `interior_dark` porte à la fois la coque des sièges et la planche de bord
  dans une seule primitive : il est donc découpé à l'exécution, seule la
  moitié avant restant affichée.

Le plan proche passe à 0,08 m dans cette vue : à 0,35 m, celui des vues
extérieures tranchait le volant, situé à 49 cm de l'œil.

### Licence du modèle

Elle n'a **pas pu être vérifiée** : three.js ne documente pas celle de ce
fichier, et la page Sketchfab d'origine est aujourd'hui désactivée. Le modèle
est utilisé ici dans un projet strictement personnel, jamais mis en ligne.
Toute publication demanderait de tirer ce point au clair ou de remplacer le
fichier. Voir `ATTRIBUTIONS.md`.

L'ancien modèle **Audi R8**, d'attribution inconnue, a été retiré du dépôt.

Le parc garé et la circulation utilisent le **Free Low Poly Vehicles Pack**
de rgsdev (CC0), converti par `scripts/preparer-flotte.mjs`. Il a remplacé
le 4 octobre 2026 le Kenney Car Kit, dont le style « voiture jouet »
jurait avec une ville reconstituée au LiDAR.

Un maillage procédural de secours a existé dans `carmesh.js`, module de
l'ancien moteur Three.js retiré le 19 septembre 2026 : le jeu charge
aujourd'hui `ferrari.glb` sans repli.

## Limites connues

- les façades sont des aplats de couleur texturés en enduit : la teinte est
  relevée sur les photographies de rue, mais le placage de photos rectifiées
  a été retiré en septembre 2026. Les cases d'atlas cadraient trop souvent ce
  qui se trouvait devant le mur (haie, gravier, trottoir) et le résultat se
  lisait comme une capture d'écran collée sur le bâtiment. Le mécanisme reste
  dans le code derrière le drapeau `PLACAGE_PHOTO`
- les bâtiments en fond de parcelle gardent une teinte déduite de leur
  matériau BD TOPO : aucune photographie de rue ne les atteint
- les **feuillages** sont des lobes d'icosaèdre dentelés par une texture de
  feuilles : la silhouette des arbres reste celle d'un nuage de boules
- vus de très près, quelques détails trahissent leur nature de texture
  (coulures, mains des passants, branchements) : ils sont réglés pour la
  distance de conduite
- l'ombre des **véhicules de la flotte** vient d'un voile de contact et non
  de la carte d'ombre, dont le volume est resserré autour du joueur

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

Ressources visuelles ajoutées en septembre 2026, toutes sous CC0 1.0 :
panoramas de ciel HDR Poly Haven, photos de matière ambientCG (enrobé, herbe,
béton, pavés, grave, écorce), modèles de véhicules (Kenney Car Kit,
remplacé en octobre 2026 par le pack rgsdev). Textures de façade, panorama
des Pyrénées et écran titre générés par Codex (OpenAI) en octobre 2026.

La licence du modèle Ferrari 458 n'a pas pu être vérifiée (usage personnel). Le détail de chaque source figure dans
`ATTRIBUTIONS.md`.
