# Journal de rendu - Artix Racer

Historique des chantiers de rendu : ce qui a été constaté à l'écran, ce qui a
été mesuré, et les fausses pistes écartées en chemin. Le CLAUDE.md ne garde que
les règles permanentes du projet, ce fichier garde le pourquoi.

Chaque section indique le symptôme visible, la cause réelle une fois mesurée
(souvent différente de celle supposée au départ), et le coût de frame constaté.

## Le compteur de fps du HUD disait vrai, mes sondes non (18/08/2026)

Chantier de performance mené sur huit commits. Sa première conclusion a été
fausse, et la corriger a demandé de refaire toutes les mesures.

Mesuré au départ : 19 à 20 ms par frame, 45 à 51 fps à l'arrêt au
centre-bourg, alors que le HUD affichait 60. J'en ai conclu que le compteur
du HUD était optimiste et j'ai écrit cette conclusion dans un commit.

C'était l'inverse. Le chronomètre GPU par requête
(`EXT_disjoint_timer_query_webgl2`) et les enveloppes posées sur
`renderer.render` et `composer.render` coûtaient à eux seuls les 3 ms
d'écart. Sur une page vierge de toute instrumentation, la médiane retombe à
16,6 ms et le HUD dit vrai.

**Toute mesure de temps doit se faire sur une page sans sonde.** Le nombre
de triangles et le nombre d'appels de dessin se relèvent dans une session
distincte de celle qui mesure le temps, jamais dans la même.

Deuxième correction du même chantier : une comparaison en roulage donnait
les à-coups en recul de 19,4 % à 8,8 %, soit moitié moins. Elle est fausse.
Le passage « après » avait été conduit à 51 km/h contre 72,6 pour la
référence, donc à charge moindre. **Une comparaison de roulage n'a de sens
qu'à vitesse comparable.**

Les tests de roulage automatisés étaient eux-mêmes faux : maintenir
l'accélérateur sans braquer envoie la voiture dans une voiture garée au
bout de quelques secondes. Les chiffres qui en sortaient mesuraient une
accélération courte suivie d'un choc, pas du roulage. Christophe a signalé
le défaut ; les mesures de roulage retenues ici ont toutes été conduites à
la main.

### Gain réel, mesuré en roulage conduit à la main

Profil Équilibré, 2400x1024, ombres et SMAA actifs, midi, ajustement
automatique coupé, échantillons relevés au-dessus de 5 km/h.

| | Référence | Après | Écart |
| --- | --- | --- | --- |
| vitesse moyenne | 72,6 km/h | 75,3 km/h | +2,7 |
| médiane | 18,0 ms (55,6 fps) | 16,9 ms (59,2 fps) | **+3,6 fps** |
| p95 | 25,2 ms | 25,0 ms | -0,2 |
| p99 | 28,8 ms | 28,8 ms | 0 |
| à-coups > 20 ms | 19,4 % | 17,4 % | -2,0 points |

Le gain porte sur la médiane, qui repasse sous 16,7 ms : le jeu tient
60 fps en roulage là où il était à 55,6. **Le p95 et le p99 sont
inchangés.** Les à-coups ne viennent donc ni de la végétation ni des
allocations de la boucle, et leur cause reste à trouver.

### Ce que le découpage spatial a donné

Un `InstancedMesh` n'est écarté par le frustum culling qu'en bloc, sa
sphère englobante couvrant toutes ses instances. Celle des 3 500 arbres
couvre la commune entière : ils étaient donc dessinés en totalité où que se
trouve la voiture. Mesuré avant : 5,01 millions de triangles soumis par
frame, identiques au centre-bourg et à 3,4 km de là.

`count` ne dessine que les N premières instances. En partitionnant le
tampon pour amener devant celles qui sont à portée, il suffit d'ajuster
`count` : aucune géométrie recréée, aucun objet Three.js de plus,
l'instanciation est conservée.

Résultat au centre-bourg : 114 arbres dessinés sur 3 500, soit 1 183 000
triangles de végétation ramenés à 38 532, une réduction de 96,7 %.

Coût de la partition : 0,1 ms médian, 0,2 au pire, pour 3 500 instances
parcourues. Elle ne se déclenche que lorsque le véhicule a franchi un quart
de cellule, soit 15 fois sur 80 s de conduite. Négligeable.

**Aucun gain de fps à l'arrêt**, le jeu y étant déjà calé sur le vsync.
Le gain se voit en roulage, dans la médiane.

### Allocations : un gain invisible au compteur

La boucle allouait 99 Ko par frame en roulage, avec 8 passages du
ramasse-miettes en 5 s. Les temporaires de `car.js` (quatre roues, soixante
pas par seconde), du bloc caméra et de `pedestrians.js` (140 passants, sept
maillages animés) sont désormais des champs réutilisés.

**Aucun gain de framerate mesurable à l'arrêt** : médiane de 19,2 à 20,2 ms
avant, 19,9 à 20,3 après, plages entièrement recouvrantes. La scène est
limitée par le GPU, pas par le temps CPU. Le bénéfice porte sur la
régularité, et il faut le chercher en roulage.

Comportement de conduite vérifié inchangé par une empreinte déterministe :
monde plat isolé, 900 pas, séquence accélération / virage / frein à main /
freinage. Trajectoire identique au chiffre près, position, vitesse, régime,
rapport et braquage compris, jusqu'à l'odomètre final de 118,313 m. C'est
ce test qui permet de toucher à `car.js` sans rien casser.

## Chantier visuel : routes, trottoirs, façades, herbe, ciel, eau (19/08/2026)

Demande d'améliorer la qualité visuelle générale en gardant 60 fps. Neuf postes
traités, tous constatés à l'écran avant d'être déclarés faits.

**Routes.** L'enrobé posait un bruit blanc par pixel sur un aplat, plus deux
bandes sombres à bords francs. Deux défauts : le bruit blanc se lit comme du
grain de capteur, et les bandes, alignées sur la texture, se répétaient tous les
quatre mètres. Remplacé par quatre échelles de bruit superposées (gravillon,
reprises d'enrobé, ondulation lente, roulement à bords fondus), plus une
`roughnessMap` : les traces de roue sont polies par le trafic, les bords de voie
restent grenus, ce qu'un scalaire ne peut pas rendre.

**Trottoirs.** Ils étaient de simples bandes plates au ras de la chaussée. Ils
sont désormais relevés de 14 cm (hauteur d'une bordure T2), avec caniveau en
contrebas de 3 cm et bordure chanfreinée en maillage distinct. C'est le
changement de matériau, plus que la hauteur, qui rend la ligne lisible de loin.

**Façades.** Variation de teinte par bâtiment tirée du centroïde, donc stable
d'un lancement à l'autre, et salissure de pied sur les 86 premiers centimètres.
La façade est coupée en deux bandes à cette hauteur : sans ce sommet
intermédiaire, le dégradé serait interpolé sur toute la hauteur du mur, donc
invisible sur un bâtiment haut.

**Fenêtres.** Quatre teintes de vitrage portées par la couleur de sommet, plus
des appuis de fenêtre et quelques baies éclairées la nuit, dont l'émission
reprend la carte de couleur. Restées **opaques** : plusieurs milliers de baies
transparentes entreraient dans le tri des faces transparentes pour un gain nul.

**Herbe.** La texture semait 9 000 carrés de 2 px au hasard ; à la répétition de
60, un carré mesurait dix centimètres au sol, donc invisible en conduite.
Refaite en quatre échelles dont les deux plus lentes portent la lecture, avec
une teinte qui jaunit avec la clarté : un simple gris éclairci se lit comme une
carte de gris, pas comme un pré.

**Touffes de premier plan** (`touffes.js`) : pool d'instances de taille fixe,
réparties sur une grille locale et replantées au franchissement d'une cellule de
2,4 m. Rien n'est créé ni détruit en cours de partie, et deux passages au même
endroit donnent la même herbe. Découpage par `alphaTest` à 0,45, jamais
`transparent` : le fragment est rejeté, la touffe reste opaque et se trie comme
le reste.

**Ciel.** Disque solaire, halo, brume d'horizon et voiles nuageux ajoutés dans
le fragment shader du dôme, donc gratuits en géométrie. La teinte du soleil
rougit sur les 25 premiers degrés d'élévation, et le disque s'éteint sous
l'horizon, sans quoi il resterait accroché au dôme toute la nuit.

**Eau.** Passée d'`opacity: 0.82` à opaque. La transparence la faisait passer
par le tri des faces transparentes : selon l'angle, la nappe se dessinait avant
ou après le terrain qu'elle borde, et le pont apparaissait au travers. Un
ruisseau du Béarn n'est de toute façon pas limpide. Le relief vient d'une carte
de normales dont l'offset dérive très lentement.

**Allocations.** `updateSky` construisait cinq `Color` par frame, soit trois
cents objets par seconde pour des valeurs constantes. Toutes hissées hors de la
boucle. Les trois derniers `car.position` de la boucle, qui allouent un
`Vector3` à chaque accès, sont remplacés par la position déjà lue.

**Mesure finale**, trois profils, à l'arrêt, résolution dynamique coupée :

| Profil | Pixels | Médiane | p95 |
| --- | --- | --- | --- |
| Performance | 1,00 M | 16,7 ms | 17,3 ms |
| Équilibré | 2,26 M | 16,6 ms | 18,2 ms |
| Qualité | 4,02 M | 16,7 ms | 17,5 ms |

60 fps partout, ce qui confirme la conclusion du chantier précédent : à
l'arrêt, la résolution n'est pas le facteur limitant.

## Les panonceaux d'équipement étaient plantés trop loin (19/08/2026)

Signalé en marge du chantier des enseignes : le panonceau du commerce flottait
au milieu de son propre parking, détaché du bâtiment qu'il annonce.

**Le placement n'était pas faux, il était incomplet.** `surAccotement` plante
le panneau au bord de la voie la plus proche, ce qui est juste pour un panneau
de police : son nœud OSM est déjà en bordure, l'écart mesuré n'est que
l'imprécision du relevé. Mais le nœud d'un ÉQUIPEMENT est au centre de son
bâtiment. Sur un commerce en fond de parcelle, la voie desservante est à vingt
mètres, et le panneau s'y plantait, correct du point de vue de la voirie mais
rattaché à rien visuellement.

Mesuré sur le cas signalé : **20,4 m** entre le commerce et sa voie.

**Correction** : l'écart panneau-commerce est borné à 14 m. Le panneau reste
sur l'accotement, son cap est inchangé, il est seulement ramené vers le lieu
qu'il annonce. 14 m parce que le plus gros bâtiment signalé de la commune fait
26 m de large, soit 13 m depuis son centre : en dessous, le panneau finirait
dans les murs.

**Résultat mesuré sur les 57 équipements** : écart médian de 9,2 m, et 3 cas
au-delà de 14 m, tous des équipements dont aucun panneau n'a été posé
(`!pos.trouve`) et dont la plaque la plus proche appartient à un autre
commerce. Le cas signalé passe de 20,4 à 14,0 m.

**Fausse piste écartée** : renoncer à poser le panneau au-delà d'une portée
plus courte. Un paramètre `porteeMax` avait été ajouté pour cela, puis retiré :
il aurait fait disparaître les panneaux au lieu de les recaler, alors que le
défaut n'est pas la présence du panneau mais sa distance.

## Leclerc Express et Loto Tyche : deux enseignes changées (19/08/2026)

Demande de mieux modéliser le supermarché. La photo fournie était une capture
Street View : **source écartée**, les conditions d'utilisation de Google
interdisant d'en dériver des reproductions, y compris en usage privé. Le
chantier a donc été mené sur les seules données déjà téléchargées, OSM et BD
TOPO, ce qui a suffi.

**Erreur commise en chemin, et c'est la leçon.** OSM porte deux supermarchés
au centre : un « Intermarché » (way 63685613) et un « Leader Price »
(way 63688776). Aucun Leclerc. J'ai supposé que le Leader Price était devenu le
Leclerc Express et modélisé le mauvais bâtiment. Christophe a corrigé : le
Leclerc a remplacé l'**Intermarché**, et l'ancien Leader Price abrite
aujourd'hui **Loto Tyche**.

C'est exactement le piège déjà consigné pour les sens interdits : *un objet
déduit reste faux s'il est mal placé*. Le tag de départ était réel, la
déduction ne l'était pas.

**Ce qui est posé, après correction :**

| Bâtiment | OSM | Réel | Traitement |
| --- | --- | --- | --- |
| way 63685613, index 1128 | Intermarché | Leclerc Express | repère modélisé |
| way 63688776, index 648 | Leader Price | Loto Tyche | enseigne en façade |

Le Leclerc Express (974 m², 42,9 x 26,5 m, cap 10,4 degrés, 5 m de haut) devient
le sixième repère de `landmarks.js` : acrotère, vitrine continue sous auvent,
enseigne sur bandeau et deux panonceaux encadrant l'entrée. Le Loto Tyche garde
son extrusion automatique et ne reçoit qu'un panneau plaqué en façade, ce qui
suffit à l'identifier depuis le parking.

**Table `ENSEIGNES_ACTUELLES` dans `poi.js`** : le HUD annonçait « Intermarché »
devant le Leclerc, le tag `name` d'OSM datant d'avant le changement. La
correspondance est tenue à la main, sur constat de terrain, et clairement
signalée comme telle.

**Sur le logo** : dessiné en canvas comme toutes les textures du projet, à
partir de la description de l'enseigne (sigle carré bleu au E blanc, nom en
bas-de-casse, mention EXPRESS sur pavé). Aucun fichier d'image n'est importé.

**Trois retouches faites à l'écran**, chacune constatée avant correction :
enseigne d'abord posée au-dessus de la ligne de toiture au lieu d'être plaquée
sur l'acrotère, second panonceau isolé trop à droite sur le bardage, et panneau
Loto Tyche dépassant du toit.

## Les toits troués venaient des fenêtres, pas des toits (19/08/2026)

Signalé par Christophe : « vus de loin, certains toits de bâtiments et maisons
sont transparents ou saccadés ». Des triangles gris-bleu perçaient la
couverture, et ils changeaient de place selon l'angle de caméra.

**Deux hypothèses écartées avant la bonne**, ce qui vaut d'être noté :

- **le débord de toiture.** Il pousse chaque arête de 40 cm vers l'extérieur,
  donc dans l'emprise du voisin sur le bâti continu du centre-bourg. Cause
  plausible, corrigée au passage (le débord est désormais borné par la distance
  au bâtiment voisin), mais le défaut persistait
- **la précision du depth buffer.** `near = 1`, `far = 3000`, sans tampon
  logarithmique : le suspect habituel. Le calcul l'innocente, la précision
  restant de **9,5 mm à 400 m et 38 mm à 800 m**, très loin de ce qu'il
  faudrait pour faire clignoter une toiture. Mesurer avant de corriger a évité
  un chantier inutile sur la caméra

**La vraie cause, trouvée par isolement.** En masquant les maillages un par un
en vue aérienne, les triangles parasites disparaissent avec les VITRAGES et
reviennent dès qu'on les réaffiche. Les baies du dernier niveau dépassaient
l'égout et ressortaient sous le débord de toiture.

Deux facteurs cumulés :

- **la marge sous égout ne couvrait que la hauteur de la baie** (20 cm), pas la
  saillie des éléments rapportés : le dormant sort de 7,5 cm du nu de façade et
  l'appui de fenêtre de 13 cm. Portée à 45 cm, de quoi laisser passer le débord
  de 40 cm plus l'épaisseur de la tablette
- **`renderOrder = 1` sur les vitrages**, contre 0 sur les toitures. Tous ces
  maillages sont opaques et écrivent la profondeur : le tampon suffit à les
  départager, et forcer un ordre faisait gagner la vitre contre le toit dès
  qu'elle le touchait. Supprimé

**Aucune fenêtre perdue** : 25 568 baies avant comme après, la marge élargie
n'ayant écarté que celles qui dépassaient déjà et n'auraient pas dû exister.

**Leçon de méthode** : le maillage fautif n'était pas celui qui portait le
symptôme. Masquer les maillages un par un a tranché en deux essais, là où deux
hypothèses raisonnées avaient échoué. Les maillages `murs`, `vitrages` et
`toitures` sont désormais nommés pour rendre ce diagnostic reproductible.

## Le composer ignorait le pixel ratio des profils (19/08/2026)

**Le défaut, jamais vu parce qu'invisible au compteur.** `EffectComposer`
capture le pixel ratio du renderer À SA CONSTRUCTION et le garde dans
`_pixelRatio`. Les profils graphiques appelaient bien `renderer.setPixelRatio`,
mais `composer.setSize` réutilise sa valeur figée : les cibles de rendu ne
bougeaient pas d'un pixel. Seule la copie finale à l'écran changeait d'échelle.

Mesuré après correction, taille des cibles du composer :

| Profil | Cible | Pixels | GTAO |
| --- | --- | --- | --- |
| Performance | 1470 x 683 | 1,00 M | 735 x 342 |
| Équilibré | 2205 x 1024 | 2,26 M | 1103 x 512 |
| Qualité | 2940 x 1366 | 4,02 M | 2205 x 1025 |

Un rapport de 4 en surface entre les extrêmes, là où les trois profils
rendaient auparavant le même nombre de pixels. Les trois tiennent 60 fps à
l'arrêt (médiane 16,6 à 16,7 ms, p95 sous 18,2), ce qui confirme la conclusion
du chantier précédent : **à l'arrêt, la résolution n'est pas le facteur
limitant**.

Corrigé par une fonction unique `redimComposer`, qui appelle `setSize` puis
`setPixelRatio` et réimpose ensuite l'échelle du GTAO, que `setSize` écrase.
`Qualite.appliquer()` la déclenche après avoir changé le pixel ratio.

**Retiré au passage : `scene.traverse(o => o.material.needsUpdate = true)`** à
chaque bascule de profil. `shadowMapEnabled` fait partie des paramètres de
programme de Three.js et entre dans la clé de cache : le bon programme est
sélectionné sans qu'on force quoi que ce soit. Forcer les matériaux de la ville
provoquait une recompilation complète, donc une saccade d'une seconde par
changement de profil.

## La chaussée a failli passer devant le trottoir (19/08/2026)

Le point 5 des restants annonçait le risque : « pousser plus loin la rendrait
plus claire que le trottoir ». Il était fondé.

Première tentative, enrobé porté à `0xd2d1cf` avec `roughnessMap` : le rapport
chaussée/façade monte de 0,281 à **0,454**, tout près de la cible de 0,47. Mais
la mesure sur la même capture donne une chaussée à **1,26 fois la clarté du
trottoir**, ce qui se voyait immédiatement à l'écran : la route paraissait plus
neuve que le cheminement qui la borde.

Corrigé en agissant des deux côtés plutôt que sur le seul enrobé : chaussée
ramenée à `0xc2c1bf`, dalle de trottoir éclaircie de `0x74736e` à `0x98968e`,
bordure de `0x9a988f` à `0xb4b2a8`. Rapport final **0,376**, hiérarchie
rétablie.

**Leçon** : deux surfaces voisines se calent l'une par rapport à l'autre, pas
chacune contre une référence lointaine. Mesurer le seul rapport à la façade
laissait passer une inversion que l'oeil voit tout de suite.

## Le plafond masquait l'éclaircissement du stationnement (19/08/2026)

Demande de réduire les véhicules garés à 55-65 % de l'effectif. Une passe
d'éclaircissement par files a été écrite : chaînage des véhicules qui se
suivent le long d'une rive, puis retrait par grappes plutôt qu'un sur deux, une
alternance régulière se lisant aussi mal qu'une file pleine.

**Elle n'a d'abord rien changé.** Le log annonçait toujours 1 400 véhicules,
parce que le plafond `maximum` valait 1 400 et tranchait APRÈS la passe : la
ville en trouvant 3 063 possibles, le résultat restait collé au plafond quoi
qu'on retire en amont. C'est lui, et non l'éclaircissement, qui fixait
l'effectif réel depuis toujours.

Deux corrections : plafond ramené à 880, et rattrapage du centre-bourg calculé
sur la position de la PLACE et non sur le premier point de la voie. Ce dernier
défaut réinjectait presque tout ce qui venait d'être retiré, une rue longue
partant du bourg voyant toutes ses places classées « centre » jusqu'au bout.

**1 400 -> 880 véhicules, soit 63 %.** L'éclaircissement lui-même ne retire que
11 % (3 063 -> 2 725) : les places sont déjà clairsemées à la source par les
densités de `trouverPlaces`, si bien que les longues files continues à casser
sont rares. Le gros du travail reste fait par le plafond.

## L'eau flottait en plein ciel (18/08/2026)

Symptôme constaté à l'écran depuis l'avenue de Castille : un ruban gris
suspendu au-dessus des prés, sans rapport avec le terrain traversé.

Cause : l'eau était construite à une altitude fixe de 0,05 alors que tout
le reste de la ville suit le relief interpolé. Sur une commune qui présente
38 m de dénivelé, elle se retrouvait donc suspendue ou enterrée selon
l'endroit.

Deux essais avant le bon calage. La poser 0,35 m sous le sol, pour figurer
un lit creusé, l'a enfouie : **le relief n'est terrassé que sous les
routes, jamais sous les cours d'eau**, et 94 % de la surface passait sous
le terrain donc devenait invisible. Elle affleure maintenant 6 cm au-dessus
du sol naturel, et le contrôle donne 0 % de surface enfouie.

Les plans d'eau retiennent la médiane des altitudes de leur contour et non
le minimum : un seul point de rive anormalement bas, fréquent sur un
contour interpolé, enfonçait toute la nappe.

Défaut annexe trouvé en chemin : **100 % des triangles d'eau avaient leur
normale tournée vers le sol.** Le `DoubleSide` le masquait, au prix d'une
face inutile et d'un éclairage pris à contresens. Les sommets sont
réordonnés et le sens de parcours des plans d'eau déterminé par l'aire
signée, celui d'un contour OSM étant arbitraire. Le `FrontSide` devient
alors légitime.

Matériau : `metalness` ramené de 0,6 à 0. L'eau est un diélectrique, sa
réflectivité vient de son indice de réfraction. À 0,6 elle rendait comme du
plomb liquide, prenant la teinte de l'environnement au lieu de la sienne.

## Le modèle pesait 80 % du chargement (18/08/2026)

Mesure du poids réellement transféré, serveur de preview, gzip actif :
9,36 Mo, dont 7,54 pour le seul `AudiR8.glb`.

Le JS et les JSON se compressent bien (2,80 -> 0,93 Mo pour le bundle,
3,46 -> 0,59 pour l'OSM). Le GLB ne gagnait rien : il ne contient **aucune
texture**, seulement 7,13 Mo de géométrie en FLOAT non compressée. Le code
splitting n'aurait donc rien changé au poids initial ; c'est le modèle qu'il
fallait traiter.

Compression `EXT_meshopt_compression` + `KHR_mesh_quantization` :
7,54 -> 1,65 Mo, 77 % de moins, total transféré ramené de 9,36 à 3,36 Mo.
Géométrie identique au triangle près, 207 329 triangles avant comme après.

Fausse piste écartée : `gltf-transform optimize` descend à 1,36 Mo mais ses
passes `join` et `simplify` fusionnent tout en **un seul nœud** et
supprimant les noms de roues. Le chargeur ne trouve plus `WheelFrontL` et
les roues cessent de tourner. Seule la passe de compression est appliquée.

Piège de la quantification : elle normalise les positions et reporte
l'échelle sur les nœuds. Lire la boîte de la géométrie brute donnait un
rayon de roue de 0,963 m au lieu de 0,314, et les roues auraient tourné
trois fois trop lentement. La mesure passe désormais par `setFromObject`,
qui applique toute la chaîne de transformations et reste juste quel que
soit l'encodage du fichier.

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

## Retrait de la caméra intérieure (19/08/2026)

Vue supprimée, pas réparée. La touche `C` fait défiler quatre positions au lieu
de cinq : poursuite, capot, cinématique, aérienne.

**La cause est dans le modèle, pas dans le code de caméra.** L'Audi R8 du
projet est une carrosserie extérieure seule : `carmodel.js` y trouve bien une
colonne de direction (`InteriorSteeringCylinder`), donc un volant animable,
mais ni siège, ni planche de bord, ni garnitures. Une caméra posée à hauteur
d'yeux dans ce volume ne cadre que l'envers de la tôle.

**Le repli déduit ne valait rien.** Le code plaçait le poste de conduite au ras
du pavillon d'après la boîte englobante, avancé à 0,14 fois la longueur cible,
décalé de 0,36 m côté conducteur. Le commentaire du fichier l'admettait déjà :
« le rendu vaut celui d'une caméra capot ». Garder deux entrées de menu pour un
même cadrage n'apporte rien, et celle-ci n'avait jamais été constatée à l'écran
depuis le passage à l'Audi.

**Ce qui a été retiré** : la branche `camMode === 2` de `main.js` avec ses cotes
d'yeux, la variable `siegeImporte` et son affectation, tout le calcul de `siege`
dans `carmodel.js` (les deux branches, avec et sans volant) et son export.

**Ce qui reste, et pourquoi** : le volant lui-même, qui tourne au braquage et se
voit en caméra capot ; `camSide`, encore utilisé par le décalage latéral de la
caméra cinématique ; `LONGUEUR_CIBLE`, qui sert à l'échelle du modèle.

**Renumérotation, le seul risque réel du chantier.** La suppression d'une entrée
au milieu de `CAMS` décale les indices suivants. Trois endroits lisent `camMode`
en dur en dehors de la chaîne de branches : l'anti-traversée, qui vaut pour la
poursuite et la cinématique et passe donc de `=== 3` à `=== 2` ; le lissage
embarqué, qui ne garde que le capot ; et l'affichage du HUD, qui passe par
`CAMS[camMode]` et suit tout seul. Un défilement complet des quatre vues est ce
qui vérifie ce genre de retrait, pas une capture d'une seule d'entre elles.

**Réintroduire cette vue suppose un modèle d'habitacle**, pas un meilleur calcul
de position.

## Minicarte : fluidité, portée et couronne cardinale (19/08/2026)

Symptôme rapporté : la minicarte avance par à-coups, alors que le jeu tourne à
60 fps autour d'elle.

**La cause n'est pas le coût du dessin, c'est sa cadence.** `drawMinimap()`
était appelé depuis le bloc du `streetTimer` de `main.js`, un compteur de 0,5 s
dont le rôle est de chercher le nom de la rue la plus proche. La carte héritait
de cette période : **2 images par seconde**. À 50 km/h le véhicule parcourt 7 m
entre deux dessins. Le reste du HUD étant fluide, l'écart sautait aux yeux.

Voilà pourquoi la piste du coût de dessin était la mauvaise : la carte ne
coûtait presque rien, elle était simplement dessinée trente fois trop rarement.

**Deux défauts trouvés dans le filtre de portée**, qui interdisaient de monter
la cadence sans y toucher :

```js
if (Math.abs(x0 - pos.x) > PORTEE && Math.abs(z0 - pos.z) > PORTEE) continue;
```

Le `&&` n'écarte une voie que si elle est lointaine **sur les deux axes à la
fois** : une route à 3 km au nord mais alignée en x passait le filtre. Et le
test portait sur `pts[0]` seul, donc une départementale dont le premier point
est proche était tracée sur toute sa longueur, très au-delà du disque.

**Correctifs, dans l'ordre où ils comptent :**

1. l'appel sort du `streetTimer` et passe dans le bloc HUD, à chaque image
2. les voies carrossables sont préparées une fois dans le constructeur
   (couleur et épaisseur figées) et indexées dans une grille de cellules de
   240 m, chaque voie étant inscrite dans **toutes** les cellules que sa boîte
   englobante touche, un `Set` réutilisé dédoublonnant au dessin
3. la portée passe de 420 m à 472 m, valeur déduite du rayon réel du disque
   (95 px à 0,22 px/m) plutôt que posée à la main. Elle augmente, mais le
   filtre écarte enfin ce qui est hors du cercle

**Mesuré sur la donnée réelle**, 902 voies carrossables et 129 positions
échantillonnées le long du réseau : **353 voies parcourues par dessin avant,
150,5 après, soit -57,4 %**. La grille compte 1 658 cellules.

Le coût absolu par image reste à relever à l'écran : `__game.mesureCarte()`
moyenne 300 dessins et rend le temps en ms, le nombre de voies retenues et la
part du budget de 16,7 ms. La sonde fait vingt passes à blanc avant de chrono-
métrer, sans quoi le premier appel fausse la moyenne.

**Cap lissé.** La carte tourne de `-cap`, et le lacet instantané de la caisse
sur ses suspensions la faisait vibrer. L'interpolation se fait sur l'écart
ramené dans [-PI, PI] : sans ce repliement, le passage de +179° à -179° fait
faire un tour complet à la carte. C'est le piège classique de tout lissage
d'angle.

**Couronne cardinale**, la demande d'indication de direction. Les quatre points
sont posés sur le pourtour et tournent avec la carte, le nord en rouge. Le cap
chiffré (`247° O`) s'affiche au sommet du disque.

**Le cap chiffré était faux à la première écriture**, signalé par Christophe qui
voyait une inversion. Deux conversions manquaient, et non une seule. D'abord
`osm.js` projette en **x = est, z = sud** : le vecteur avant du véhicule à cap
nul est +z, donc plein sud, alors que l'affichage annonçait « 000° N ». Ensuite
la rotation autour de Y de Three.js suit le sens trigonométrique quand un compas
compte dans le sens horaire. La formule juste est `180 - cap`.

**Corriger une seule des deux donne un résultat qui a l'air meilleur.** Le seul
décalage de 180° remet le nord et le sud d'aplomb, et échange l'est et l'ouest :
un essai sur l'axe nord-sud aurait validé une correction fausse. C'est la table
des seize directions comparée au `atan2` du vecteur avant qui l'a montré, pas
un coup d'œil au HUD.

**La couronne suivait la carte, donc elle était fausse avec elle.** Un premier
contrôle l'avait déclarée juste : il comparait sa position à la rotation
`rotate(-cap)` alors en place, c'est-à-dire à une référence elle-même fausse.
Vérifier un élément contre un autre élément du même dessin ne prouve rien ; il
faut le comparer à la position du point cardinal dans le monde.

**La carte tournait à l'envers et à contresens**, signalé par Christophe : « quand
je tourne à droite lui tourne à gauche ». Deux défauts superposés dans le même
`ctx.rotate(-cap)` :

- **un retournement de 180°** : `osm.js` projette en x = est, **z = sud**, donc
  le vecteur avant du véhicule à cap nul est +z, vers le **bas** du canvas. La
  carte montrait la route déjà parcourue au-dessus de la flèche
- **un sens inversé** : la rotation autour de Y de Three.js suit le sens
  trigonométrique, quand le canvas, dont l'axe y descend, tourne dans l'autre

La rotation juste est **`PI + cap`**. Les quatre candidats ont été départagés sur
table plutôt qu'à l'œil, avec deux critères : l'avant du véhicule doit tomber en
haut du disque, et sa main droite à droite.

| Rotation | Résultat |
| --- | --- |
| `-cap` (en place) | juste à 90° et 270° seulement |
| `PI - cap` | juste à 0° et 180° seulement |
| `PI + cap` | **juste aux quatre caps** |
| `+cap` | faux partout |

**C'est ce qui rendait le défaut difficile à nommer** : l'ancienne valeur tombait
juste sur deux caps sur quatre, donc la carte paraissait correcte selon la
direction suivie et fausse ailleurs.

**Le cap chiffré, lui, ne dépend pas de la rotation du canvas** : il décrit une
direction dans le monde. Sa formule `180 - cap` reste valable, revérifiée après
coup plutôt que supposée.

Contrôle final sur douze caps et quatre critères simultanés (avant en haut, main
droite à droite, couronne alignée sur le tracé, cap chiffré conforme au `atan2`
du vecteur avant) : concordance complète. La flèche centrale, elle,
pointe toujours vers le haut : c'est la conséquence de la rotation de la carte,
et cela reste juste. Chaque lettre reçoit une pastille sombre, sans quoi elle
devient illisible dès qu'une voie jaune passe dessous.

Reste à constater à l'écran : la fluidité en roulage, le chiffre de
`mesureCarte()`, et la lisibilité de la couronne en centre-bourg.

## La voiture flottait dans l'herbe (19/08/2026)

Symptôme rapporté par Christophe : hors chaussée, la voiture paraît surélevée,
et son ombre portée se voit au sol sous elle.

**Deux surfaces distinctes, une seule visible.** Le terrain porte deux champs
d'altitude, construits par `terrasser()` dans `terrain.js` :

- `naturel`, le relief IGN interpolé, sur lequel la chaussée est posée
- `h`, le même relief creusé sous les emprises de route, pour que l'herbe ne
  ressorte jamais au-dessus de l'asphalte entre deux nœuds de polyligne

`world.js` dessine le maillage d'herbe sur `h`, **abaissé de `GARDE_SOL`**
(0,35 m). Le heightfield de collision, lui, était bâti sur `naturel` seul. Hors
route les deux champs sont égaux, le terrassement ne creusant que sous la
voirie : la voiture roulait donc **31 cm au-dessus de l'herbe dessinée**
(0,35 de garde moins les 0,04 d'enfoncement du heightfield), sur une surface
invisible.

**L'ombre de contact aggravait le tout** : posée à `hauteurEn + 0,02` sans la
garde de sol, elle flottait 33 cm au-dessus du gazon, sous une voiture qui
flottait de 31. D'où l'ombre nettement détachée que montre le symptôme.

**La correction ne consiste pas à réduire `GARDE_SOL`.** Cette garde protège
l'asphalte du terrain qui remonte entre deux nœuds, et le chantier du 16/08 a
montré qu'elle sert encore (dépassement ramené à 0,15 m au pire, 4,7 cm sur le
maillage affiché, tous sous la garde donc invisibles). La faute est que physique
et rendu lisaient deux champs différents.

**Règle retenue**, portée par `terrain.solVisible(x, z, garde)` :

```
creuse = naturel - terrasse          // 0 dans l'herbe, GARDE_SOL sous la route
sol    = terrasse - garde + 2*creuse
```

Elle satisfait les deux extrémités et raccorde linéairement entre elles :

| Situation | `creuse` | Sol physique | Résultat |
| --- | --- | --- | --- |
| Hors chaussée | 0 | `terrasse - garde` | le sol d'herbe dessiné, écart nul |
| Cœur d'emprise | `garde` | `naturel` | la chaussée est portée |
| Frange de 4 m | intermédiaire | interpolé | raccord continu |

**Le seuil binaire était le piège à éviter.** `terrasser()` estompe son
creusement sur 4 m au bord de chaque emprise ; basculer d'un régime à l'autre
par un test aurait créé une marche verticale de 35 cm tout le long des routes,
plus haute que le rayon des roues. Avec l'interpolation, la frange monte à
**8,8 % de pente**, franchissable sans à-coup.

**Trois fausses formules avant la bonne**, toutes écartées sur table plutôt
qu'à l'écran : `max(herbe, min(nat, terrasse))` échouait sur les trois cas de
figure, `max(herbe, nat - garde + creuse)` ne tombait juste qu'aux extrémités
et manquait la frange. C'est le tableau à trois colonnes (hors route, sous
route, bord d'emprise) qui a départagé, chaque candidate étant confrontée au
résultat attendu dans chacune.

**Défaut voisin corrigé au passage** : `spawn.y` utilisait `hauteurEn`, donc le
terrain terrassé, alors que le point d'apparition est choisi sur une voie. La
voiture naissait 35 cm trop bas, suspensions écrasées dès la première frame.
`aller()` employait déjà `hauteurRoute` et portait le commentaire expliquant
pourquoi ; la ligne d'apparition ne l'avait pas suivi.

Reste à constater à l'écran : les roues au contact de l'herbe, l'ombre plaquée
sous la voiture, et l'absence de ressaut en franchissant le bord de chaussée.

## Suppression de l'ombre portée du véhicule (19/08/2026)

Demande de Christophe : sur la route et les trottoirs, l'ombre de la voiture
n'est ni réaliste ni fluide.

**Deux ombres coexistaient, et ce n'était pas celle qu'on croit.** Le
`blob` de `main.js`, dégradé radial plaqué au sol, ne s'affiche que lorsque les
ombres portées sont coupées (`blob.visible = !shadowsHigh`), en remplacement.
Les ombres étant actives par défaut, l'ombre visible était bien celle de la
carte d'ombre du soleil.

**Pourquoi elle décrochait**, ce qui explique le manque de fluidité constaté :
la carte d'ombre n'est pas recalculée à chaque image (voir le chantier du
budget de frame), et son volume est resserré autour du véhicule. Une ombre de
décor, immobile, supporte ce rafraîchissement paresseux ; l'ombre d'un objet
qui se déplace à 50 km/h, non.

**Relevé au passage : la chaussée ne reçoit pas les ombres.** `roadMesh` n'a
pas de `receiveShadow`, contrairement aux accotements (`accotements.js`) et au
sol d'herbe. Ce qu'on prend pour une ombre sur l'asphalte vient donc du terrain
qui passe dessous, ou du trottoir voisin. À garder en tête avant de chercher un
défaut d'ombre côté route.

**Le drapeau se pose sur chaque maillage, pas sur le conteneur** : `castShadow`
n'est pas hérité dans Three.js. Poser `carMesh.castShadow = false` sur le
conteneur du GLB ne suffit pas, `carmodel.js` le remettant à `true` sur chaque
maillage interne au chargement. Trois endroits traités :

- `main.js`, sur le conteneur
- `carmodel.js`, dans le `traverse` du modèle importé
- `carmesh.js`, caisse et pneus du modèle procédural de secours, pour que le
  comportement ne dépende pas du véhicule chargé

**`receiveShadow` reste actif** sur le véhicule : il doit continuer de
s'assombrir sous un porche ou au pied d'un immeuble, faute de quoi il paraîtrait
lumineux dans une rue à l'ombre.

**Les activations en masse ne le rattrapent pas** : les trois `traverse` qui
posent `castShadow` sur les maillages de plus de 5 000 sommets parcourent
`cityGroup`, quand la voiture est ajoutée à `scene` directement.

Le `blob` est conservé tel quel, toujours conditionné à `!shadowsHigh` : ombres
coupées, il reste le seul ancrage au sol du véhicule.

Reste à constater à l'écran : l'absence d'ombre de voiture en roulage, et le
fait que le véhicule s'assombrit toujours en passant à l'ombre d'un bâtiment.
Gain de frame attendu sur la passe d'ombre, non mesuré.

## Stationnement en épi de l'avenue du 18e RI (19/08/2026)

Christophe fournit un panoramique Panoramax de l'avenue face à l'église et la
capture du jeu au même endroit. La photo montre du stationnement **en épi des
deux côtés**, véhicules inclinés en diagonale sur le bord. Le jeu affichait une
**file continue de véhicules dans l'axe**, au bord de l'asphalte.

**Deux défauts distincts, corrigés l'un après l'autre.** Le premier tenait à
l'emplacement des véhicules, le second à leur orientation ; le second n'est
apparu qu'une fois le premier réglé, Christophe ayant dû redire que l'épi n'est
pas la bataille.

**Les places en épi existaient déjà, personne ne s'y garait.** Les cinq emprises
de parking OSM de la zone passent toutes le filtre de marquage et produisent
**90 places** :

| Emprise | Dimensions | Rangées | Places |
| --- | --- | --- | --- |
| way 1356201162 | 37 x 9 m | 1 | 14 |
| way 1201716511 | 22 x 5 m | 1 | 0 |
| way 1201716512 | 24 x 7 m | 1 | 0 |
| way 856988510 | 58 x 15 m | 1 | 21 |
| way 34146558 | 72 x 66 m | 2 | 55 |

**Deux dispositifs se superposaient.** `parkedcars.js` pose du stationnement de
rue le long de toute voie carrossable assez large, à `r.width / 2 + 0.87 - 0.35`
de l'axe, soit **4,4 m** pour une `tertiary` de 7,5 m. Les emprises de parking,
elles, sont centrées 13 à 33 m plus loin. Résultat : une file au bord de la
chaussée, et des places marquées vides à côté.

**Correctif** : les emprises de parking rejoignent la grille des zones interdites
au stationnement de rue, aux côtés des carrefours et des passages piétons. Le
mécanisme existait, il ne connaissait pas les parkings.

**Le piège était la grille elle-même.** `estInterdit` ne consulte que les
cellules voisines à plus ou moins une, soit 25 m. Inscrire chaque emprise dans
la seule cellule de son centre laissait les grandes aires invisibles depuis
leurs propres bords, là où la voie les longe :

| Emprise | Rayon + marge | Couvert par ±1 cellule ? |
| --- | --- | --- |
| way 1356201162 | 23,0 m | oui |
| way 856988510 | 34,0 m | **non** |
| way 34146558 | 52,8 m | **non** |

Chaque emprise est donc inscrite dans **toutes** les cellules que sa portée
recouvre, comme les voies de la minicarte plus tôt dans la journée. Deux fois
le même piège en un jour, sur deux modules sans rapport : une entrée rangée à
son seul centre n'est trouvable que depuis son centre.

**Mesuré sur les 127 emprises de la commune** : 228 emplacements de rue écartés
sur 3 334, soit **6,8 %**. Sur l'avenue du 18e RI, **20 emplacements tombent à
7**, laissant la place aux 90 places en épi.

### Second défaut : le module posait de la bataille, pas de l'épi

Une fois la chaussée dégagée, l'orientation restait fausse. Le module nommé
`placesEpi` prenait **la normale au bord** comme axe du véhicule, soit 90° :
c'est du stationnement en bataille. L'épi range les véhicules **en diagonale**,
classiquement à 45°, ce que montre le panoramique.

Le nom du module masquait l'erreur depuis l'origine : « places en épi » se lit
comme une description de ce qui est produit, alors que ce n'était qu'une
intention.

**Les cotes découlent de l'angle**, elles ne se posent pas à la main. Une place
de 2,5 x 5,0 m inclinée d'un angle `a` occupe `2,5 / sin(a)` le long du bord et
`5,0 sin(a) + 2,5 cos(a)` en profondeur :

| Angle | Pas le long du bord | Profondeur |
| --- | --- | --- |
| 90° (bataille, avant) | 2,50 m | 5,00 m |
| 60° | 2,89 m | 5,58 m |
| **45° (épi, retenu)** | **3,54 m** | **5,30 m** |
| 30° | 5,00 m | 4,67 m |

Cinq endroits à reprendre ensemble, le pas de balayage compris : le garder à
2,50 m aurait fait chevaucher les véhicules inclinés.

**Le sens d'inclinaison suit la rangée.** `sensEpi` fait pencher toutes les
places d'un même bord du même côté, et les deux rangées face à face en sens
inverse : caps de 135° et -45° sur un bord horizontal, soit 90° d'écart. C'est
le chevron caractéristique d'un parking en épi. Le demi-tour aléatoire de la
bataille disparaît : une place inclinée ne s'occupe que dans le sens de sa
manœuvre.

**Coût en places** : 90 en bataille, **51 en épi** sur les emprises de l'avenue,
angle mesuré à 45,0° sur les trois qui en portent. La perte de 43 % est le
compromis réel de l'épi, une place inclinée consommant 41 % de bord en plus.

### Troisième défaut : les traits n'ont pas suivi les véhicules

Christophe constate que les voitures se garent bien en épi, mais que le marquage
au sol est resté en travers. Deux erreurs dans la géométrie du trait, la même
cause derrière les deux : **je l'avais construit à partir de la boîte
englobante au lieu du vecteur directeur de la place.**

| Grandeur | Attendu | Obtenu | Cause |
| --- | --- | --- | --- |
| Longueur du trait | 5,00 m | **6,37 m** | il allait jusqu'à `PROF_EPI` (5,30), profondeur totale de la rangée, au lieu de `LONG_PLACE`, longueur d'un flanc |
| Angle au bord | 45° | **33,7°** | composantes non dosées par sinus et cosinus |
| Largeur du ruban | 12 cm | **10 cm** | épaisseur prise le long de `u`, donc oblique au trait, qui s'en trouvait cisaillé |

Le trait dépassait ainsi de 1,37 m au fond de la place, sous un angle qui
n'était celui d'aucun véhicule.

**Correctif : une seule source pour les trois.** Un vecteur directeur unitaire
`(sensEpi·cos, sens·sin)` porte désormais le trait, le centre de la place et le
cap du véhicule. L'épaisseur du ruban est prise sur sa normale. Faire dériver
véhicule et marquage de la même quantité est ce qui garantit qu'ils ne peuvent
plus diverger : c'est la correction de fond, les trois chiffres du tableau n'en
étant que les symptômes.

Vérifié sur les deux rangées : trait de **5,000 m à 45,0°**, alignement
trait/véhicule à **1,0000**, épaisseur perpendiculaire à 0 près. Sur les
emprises de l'avenue, **51 traits pour 51 places**, soit un par place.

Reste à constater à l'écran : les traits sous les véhicules et dans leur axe, le
chevron entre les deux rangées de la grande aire, et la chaussée dégagée.

## Filtrage anisotrope et résolution des textures (19/08/2026)

Les textures générées en canvas portaient une anisotropie figée à 4 ou 8 selon
la fonction, seize valeurs en dur réparties dans six fichiers. Le GPU du
MacBook Air M4 en accepte 16, relevé par
`renderer.capabilities.getMaxAnisotropy()`.

Le poste qui en souffrait le plus est l'enrobé : sa texture se répète 34 fois
sur la nappe de chaussée, exactement le cas où l'anisotropie compte, une
surface très répétée vue en fuyante. À 4, elle bavait dès la vingtaine de
mètres.

**Correctif** : `poserAnisotropie` dans `textures.js`, appelée une fois au
démarrage depuis `main.js`, avant la construction de la ville. Le module reste
sans dépendance au renderer, qui ne lui est pas accessible ; il reçoit la
valeur plutôt que d'aller la chercher. Un plafond par profil graphique
(`anisotropieMax` dans `quality.js`) : 4 en Performance, 16 sinon.

Vérifié à l'écran après rechargement : **72 textures sur 73 à 16**, dont
l'enrobé. La dernière est une texture de HUD qui ne passe pas par ce module.
Coût nul, 59,9 fps avant comme après : l'anisotropie pèse sur la bande
passante mémoire, pas sur la géométrie.

**Enduit et tuile portés de 256 à 512.** Une façade de 8 m de haut ne disposait
que de 32 pixels de texture par mètre. Ces deux textures sont uniques et
partagées par les 3 542 bâtiments : le quadruplement de surface ne pèse que sur
elles. Les deux générateurs tiennent le changement de taille sans retouche,
tout y dérivant du paramètre (`PAS = taille / 8` pour le rythme des rangs de
tuile).

## Les fenêtres perçaient les façades en aplats blancs (19/08/2026)

Symptôme constaté à l'écran : sur les façades vues de la rue, les baies ne se
lisaient pas comme des ouvertures mais comme des rectangles blancs pleins
posés sur le mur.

**Première hypothèse, fausse.** J'ai d'abord soupçonné les vitrages
eux-mêmes. Relevé des couleurs de sommet : les quatre teintes de vitre sont
comprises entre 0,157 et 0,212 de luminance, donc très sombres. Ce n'était pas
elles.

**Premier vrai défaut : 9,65 % des baies portaient un beige chaud en plein
jour.** La couleur de sommet servait à deux choses à la fois, la teinte de
vitre et le marqueur de pièce éclairée. Une baie déclarée allumée portait donc
`(1,0 ; 0,82 ; 0,52)` en permanence, y compris à midi, où elle ressortait plus
claire que l'enduit. Mesuré sur les 153 204 sommets du maillage : 14 778 en
teinte chaude, soit 9,65 % pour 8,33 % annoncés par le code, l'écart venant de
la distribution du hachage.

Correctif : un attribut de géométrie distinct, `emiCouleur`, noir sur une baie
éteinte et chaud sur une baie allumée, lu par le canal d'émission via
`onBeforeCompile`. La couleur de sommet redevient uniquement la teinte de
vitre, toujours sombre. Après correction : **zéro couleur de sommet claire**,
les 14 778 baies allumées préservées la nuit.

Le shader ne compilait pas au premier essai : `emissiveIntensity` n'est pas un
uniform du fragment shader de Three.js. `totalEmissiveRadiance` vaut déjà
`emissive * emissiveIntensity` au point d'injection ; `emissive` étant blanc,
il suffit de le teinter par `vEmiCouleur`. Écran noir, repéré dans la console,
corrigé dans la foulée.

**Second vrai défaut, celui qui se voyait le plus : le dormant.** Le cadre de
menuiserie, blanc cassé à `0xece9e2`, débordait de 11 cm autour d'une vitre
étroite. Mesuré sur les couleurs de sommet des murs : **1,37 fois la clarté de
l'enduit moyen**. C'est lui qui dominait la baie et la faisait lire comme un
aplat plein.

| Grandeur | Avant | Après |
| --- | --- | --- |
| Couleur du dormant | `0xece9e2` | `0xb4b6b8` |
| Luminance | 0,914 | 0,712 |
| Rapport à l'enduit (0,667) | **1,37** | **1,07** |

Le principe d'un dormant clair autour d'une vitre sombre était bon, et déjà
noté au journal ; c'est la valeur qui était trop haute. Vérifié à l'écran en
masquant le maillage des vitrages : les aplats blancs subsistaient sans eux,
ce qui a désigné le dormant sans ambiguïté.

## Découpage spatial étendu au mobilier et aux véhicules garés (19/08/2026)

`spatial.js` ne servait qu'aux arbres depuis le chantier de performances. Le
« Restant à traiter » listait les autres `InstancedMesh` comme piste non
vérifiée, sur la foi d'un chiffre de 2 800 instances.

**Relevé en jeu** : 29 maillages instanciés, **13 238 instances**, **447 996
triangles** soumis à chaque image quelle que soit la position du véhicule. Le
détail écarte deux candidats et en désigne deux autres.

| Famille | Instances | Triangles | Décision |
| --- | --- | --- | --- |
| Touffes d'herbe | 3 520 | 140 800 | **écartée** : pool fixe de 38 m, déjà suivi du véhicule, `frustumCulled = false` volontaire |
| Lampadaires (mât + lanterne) | 911 x 2 | ~38 000 | découpée |
| Véhicules garés (caisse, roues, feux) | 880 entités | ~42 000 | découpée |
| Cheminées, lucarnes, ventilations | 767 | 9 204 | laissée : réparties comme le bâti, gain faible |

Les touffes sont le poste le plus lourd du relevé, et c'est précisément celui
qu'il ne faut pas toucher : elles sont replantées autour du véhicule à chaque
franchissement de cellule et ne sont jamais lointaines par construction. Un
chiffre élevé ne désigne pas un gâchis.

**Le mécanisme ne suffisait pas tel quel.** `GrilleInstances` réordonne des
maillages qui partagent le même ordre d'instances, un pour un, comme le fût,
la charpente et le feuillage d'un arbre. Un véhicule garé porte une instance
de caisse, **quatre** de roue et **deux** de chaque feu. Réordonner sans en
tenir compte aurait détaché les roues de leur caisse.

Correctif : un paramètre `ratios` par maillage, valant 1 par défaut, donc
rétrocompatible avec les arbres et les lampadaires. `deplacerInstance` échange
des blocs de `ratio` instances consécutives au lieu d'une seule, et `count`
est borné à `fin * ratio`.

Vérifié en jeu, profil Équilibré : **3 500 arbres dont 114 dessinés**, **911
lampadaires dont 309**, **880 véhicules dont 522**, ratios `[1, 4, 2, 2]`
appliqués. Roulage de 290 m à 78 km/h, trois réordonnancements par grille,
aucun artefact : pas de véhicule sans roues, pas de mât décapité.

**Brouillard resserré** dans la foulée, par profil, aligné sur la distance
d'affichage des petits objets de chacun : le pop-in du mobilier lointain se
fond dans la brume au lieu d'apparaître net.

| Profil | Avant | Après | `distanceDetails` |
| --- | --- | --- | --- |
| Performance | 200 - 700 | 60 - 260 | 220 |
| Équilibré | 320 - 1250 | 100 - 460 | 400 |
| Qualité | 420 - 1600 | 160 - 720 | 650 |

## Grade arcade posé du mauvais côté du mappage de tons (19/08/2026)

Ajout d'une passe de grade couleur pour un rendu de jeu de course plutôt qu'une
reconstitution littérale : contraste en S, saturation renforcée, vignettage
doux, grain fin animé d'une image à l'autre. Un seul `ShaderPass`, sans
échantillonnage de voisins.

**Premier placement, faux : avant `OutputPass`.** Le raisonnement était que le
mappage de tons devait s'appliquer après le grade pour ne pas saturer les
couleurs poussées. C'est l'inverse. Avant `OutputPass`, l'image est encore en
espace linéaire, non tone-mappée : la chaussée et le feuillage, presque noirs
à ce stade, se faisaient écraser à zéro par
`(c - 0,5) x (1 + contraste) + 0,5`, une courbe conçue pour une image déjà
répartie dans la plage perceptuelle 0-1. Constaté à l'écran : premier plan et
arbres en noir plein, scène illisible.

Correctif : la passe se place **après** `OutputPass`, sur l'image telle qu'elle
s'affiche. Valeurs revues à la baisse dans la foulée, la première série ayant
été calée sur le mauvais espace.

| Réglage | Premier essai | Retenu |
| --- | --- | --- |
| Contraste | 0,18 | 0,08 |
| Saturation | 1,22 | 1,15 |
| Force du vignettage | 0,35 | 0,22 |
| Grain | 0,035 | 0,025 |

Vérifié de jour et de nuit : scène lisible dans les deux cas, herbe et ciel
plus francs, léger assombrissement des coins. **59,9 fps**, coût nul.

## L'Audi R8 roulait en traction avant (19/08/2026)

`SPEC` gardait depuis l'origine du projet les valeurs d'une compacte générique,
alors que le modèle affiché est une Audi R8 depuis le 18/08/2026. Christophe
demande une voiture plus rapide et plus agressive au démarrage, et un son de
moteur plus aigu : le décalage entre ce qui roule et ce qui s'affiche est la
cause commune des trois.

Masse portée de 1 320 à 1 620 kg, voie et empattement ajustés, centre de
gravité abaissé de 0,52 à 0,46 m, freinage relevé. Courbe de couple refaite
pour un V10 atmosphérique : **320 N·m vers 4 500 tr/min** contre 190 vers
4 000, plateau jusqu'à 6 800, **régime maximum porté de 7 200 à 8 500**.

Côté son, la table d'onde passe de **quatre à cinq explosions par cycle**, la
fréquence des harmoniques résiduels de `rpm/60 x 2` à `x 5`, et la résonance
d'échappement gagne en gain et en Q. La décroissance de l'enveloppe est
resserrée de 7,5 à 9,0 : à cinq impulsions par cycle, elles se chevauchaient
en un bourdonnement continu au lieu de rester détachées.

### Le vrai défaut n'était pas le couple

Christophe signale que la voiture ne passe pas la troisième et plafonne vers
127 km/h en seconde. Relevé en jeu : bloquée en `gear: 2`, régime stabilisé
vers 7 000 tr/min pour un seuil de passage à 7 800, vitesse qui stagne.

**Première hypothèse, fausse** : le seuil de passage serait trop haut pour la
nouvelle courbe. Le calcul dit le contraire, l'accélération théorique restant
franchement positive de 6 800 à 7 900 tr/min (4,95 à 3,86 m/s²).

**La cause est dans la transmission.** Relevé du glissement roue par roue à
55 km/h, accélérateur au plancher :

| Roue | `slip` |
| --- | --- |
| Avant gauche | **1,00** |
| Avant droite | **0,93** |
| Arrière gauche | 0,00 |
| Arrière droite | 0,00 |

Les deux roues motrices étaient les roues **avant**, héritées de la compacte.
Avec 175 N·m elles transmettaient sans saturer ; avec 320 N·m elles saturent
leur cercle d'adhérence dès 50 à 70 km/h. La force au sol est alors plafonnée
par `gripMax = load x mu` quel que soit le couple demandé : la vitesse cesse de
monter, donc le régime imposé par les roues aussi, et le seuil de passage n'est
jamais atteint. Le blocage de boîte était le symptôme, pas la cause.

Correctif : **propulsion arrière**, comme l'Audi R8 réelle, moteur
central-arrière. Les roues avant ne font plus que diriger. Le transfert de
charge en accélération joue désormais dans le bon sens, chargeant les roues
motrices au lieu de les délester : relevé à 400 ms, 3 147 N à l'avant contre
4 709 N à l'arrière.

Confirmé résolu en conduite par Christophe. **Les mesures automatisées de cette
session ne sont pas concluantes sur ce point** : les essais au clavier simulé
ont produit des trajectoires incohérentes, la voiture heurtant des véhicules
garés ou finissant contre un mur, et les chiffres de 0 à 100 relevés dans ces
conditions ne veulent rien dire. Les performances du véhicule restent donc à
mesurer proprement, manette en main, avant d'être republiées au README.
