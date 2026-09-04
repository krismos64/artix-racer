# Journal du chantier visuel

Journal de bord tenu par session de travail. Entrées antéchronologiques.

## 2026-09-04 (suite 2) : profilage, question DLSS tranchée par la mesure

Christophe a demandé s'il serait envisageable d'intégrer DLSS de NVIDIA.
Réponse courte : non, blocage structurel. DLSS est une bibliothèque native
(`nvngx_dlss.dll`) qui s'intègre au pilote via Vulkan, DirectX 12 ou NGX, et
réclame les buffers internes du rendu en mémoire GPU. Un jeu WebGL vit dans
un bac à sable navigateur : aucune API web n'expose ces buffers, aucun
navigateur n'expose NGX, il n'existe pas de portage web. S'y ajoutent deux
verrous : le MacBook Air M4 n'a pas de GPU NVIDIA, et « DLSS 5 » n'existe pas
à ce jour (la dernière génération publique est DLSS 4, début 2025).

Plutôt que d'en rester à la théorie, la question sous-jacente a été mesurée :
où passent réellement les millisecondes ? Module `src/profil.ts` ajouté, avec
trois entrées console : `__profil()` (découpage CPU via SceneInstrumentation),
`__repartition()` (appels de dessin classés par matériau) et `__comparer()`
(coût réel par soustraction, hors vsync).

**Le compteur GPU de Babylon m'a d'abord fait conclure l'inverse de la
vérité.** `gpuFrameTimeCounter` annonçait 12,00 ms contre 4,59 ms de CPU, ce
qui se lit « le GPU sature, baisser la résolution paierait ». Contrôle : en
divisant les pixels par 4 (1440 × 683 vers 720 × 341) le compteur ne bougeait
pas, 11,86 puis 12,02 ms. Test décisif en cachant TOUS les maillages : encore
11,64 ms sur une scène vide. Le compteur mesure l'intervalle imposé par le
vsync, pas le travail de rendu. Consigné dans CLAUDE.md.

**Mesure valide, hors boucle d'affichage.** `__comparer()` arrête la boucle,
dessine 60 images en rafale et pose une barrière `readPixels` 1 × 1 (WebGL
étant asynchrone, sans elle on chronomètre l'empilement des commandes, pas
leur exécution). Chaque poste est obtenu par soustraction. En conduite,
1440 × 683, 303 maillages actifs, image complète à 8,81 ms :

| Poste | Coût | Part |
| --- | --- | --- |
| Géométrie (appels de dessin) | 7,36 ms | 84 % |
| Remplissage de pixels | 1,05 ms | 12 % |
| Ombres cascadées | 0,25 ms | 3 % |
| Post-process | 0,11 ms | 1 % |
| Plancher (scène vide) | 1,45 ms | 16 % |

La puce du CLAUDE.md sur le coût dominant est donc confirmée par la mesure,
et la conclusion sur DLSS tient sans même le blocage technique : un upscaler
attaque les 12 % de remplissage et laisse les 84 % de géométrie intacts.
Diviser les pixels par 4 ne rend qu'une milliseconde.

`__repartition()` montre par ailleurs qu'aucun matériau ne domine, le plus
gros n'ayant que 13 maillages : `ThreeCityConverter.fusionner` a déjà fait
son travail. Le gain restant se trouverait du côté du nombre d'objets soumis
(distance de chargement, regroupement des poteaux et de la végétation),
pas dans un traitement d'image.

Piège d'instrumentation à retenir : `__comparer()` doit relancer les boucles
de rendu d'origine récupérées dans `_activeRenderLoops`. Une première version
relançait une boucle nue `scene.render()`, ce qui laissait le décor s'afficher
mais figeait le véhicule et le HUD.

## 2026-09-04 (suite) : façades photo retirées, Pyrénées refaites, nuit éclairée

Suite de la refonte, en réponse à des défauts signalés en jeu par
Christophe. Le dépôt GitHub `krismos64/artix-racer` a par ailleurs été
repris : son `main` portait encore la version Three.js du 19 août, écrasé
sur décision explicite après vérification de ce qu'il contenait.

**Placage photo des façades supprimé.** Sur beaucoup de murs, la case
d'atlas rectifiée depuis les panoramiques ne cadrait pas la façade mais ce
qui se trouvait devant : haie, tas de gravier, bout de trottoir. Le résultat
se lisait comme une capture d'écran collée sur le bâtiment. Drapeau
`PLACAGE_PHOTO` à false dans world.js : les deux manifestes ne sont plus
fusionnés ni leurs six atlas chargés, les murs repassent par l'enduit
procédural dont la teinte reste relevée sur Panoramax. Effet de bord traité :
signage.js supprimait l'enseigne générique des commerces à façade
photographiée, ils seraient restés muets.

**Fond des Pyrénées entièrement refait.** L'ancien ruban unique portait un
Ossau de 150 m de haut pour 85 m de large sur une grille d'un point tous les
56 m : la dent tombait entre deux sommets et sortait en grand triangle de
travers. Cotes mesurées depuis Artix : 62,6 km, azimut 169,9°, hauteur
apparente 2 467 m courbure déduite, soit 2,26°. Il était trois fois trop
grand et au mauvais azimut. Remplacé par trois plans de crêtes peints
(2 048 × 256), du plus lointain au plus proche, chacun avec son dégradé de
brume et son étagement de teinte, la couleur suivant l'ambiance courante.
Silhouette de l'Ossau à deux dents séparées par la Fourche, échantillonnée
au pixel, avec neige des hauts sommets. **Exagération assumée de 2,5 en
hauteur** (choix de Christophe) : à sa taille exacte le pic se réduit à une
dent que la brume efface.

- **Piège coûteux** : le voile gris qui barrait le ciel a survécu à quatre
  corrections du dessin de la texture parce que la cause était en aval.
  `transparencyMode` restait à `null` sur le matériau : Babylon le traitait
  comme OPAQUE et n'a jamais lu le canal alpha, pourtant correct (mesuré :
  alpha 0 en haut du canvas, 180 au milieu). Il peignait donc le quad
  entier. Corrigé par `hasAlpha`, `useAlphaFromAlbedoTexture`,
  `transparencyMode = ALPHABLEND` et `disableDepthWrite`.
- Autres pièges : le remplissage des colonnes partait du bas de la bande et
  remontait, d'où un bloc plein sur les colonnes basses ; le pied des plans
  était à +26 m, au-dessus de l'horizon, et les montagnes flottaient ;
  `infiniteDistance` recentre les plans sur la caméra et écrase les trois
  couches à la même profondeur.

**Éclairage public nocturne.** La ville était noire entre les flaques : 70 cd
sur 30 m de portée, huit sources. Passé à douze sources, 260 cd, 62 m de
portée, avec la fenêtre d'allumage élargie en conséquence (une source de
62 m s'éteignait avant que son halo ne sorte du champ). Halos au sol de 7,5
à 11,5 m de rayon. Ambiance nocturne relevée : ambiante de 0,05 à 0,22 avec
un sol qui renvoie une teinte chaude, exposition de 0,80 à 1,05. Plafond à
connaître : les matériaux convertis acceptent 10 lumières simultanées.

**Lignes de rive des deux côtés.** Le marquage existait mais son seuil était
à 7,60 m : seules autoroutes, nationales et secondaires en avaient. Les
tertiaires (7,50 m) passaient juste à côté et aucune rue du bourg n'était
marquée. Seuil abaissé à 5,60 m, dessertes et chemins exclus, retrait du
bord proportionnel à la largeur (plafonné à 42 cm) et trait de 11 cm sous
7 m de large. L'axe médian garde son seuil de 6,20 m : une rue de 6 m a donc
ses deux rives sans ligne axiale, ce qui est le marquage réel d'un bourg.

**Reste ouvert** : piétons toujours en capsules ; feuillages en lobes
d'icosaèdre, éclaircis mais pas remodelés ; parallaxe du fond de montagnes à
confirmer sur un long trajet vers le sud (`infiniteDistance` retiré).

## 2026-09-04 : refonte visuelle (ciel HDR, sols photo, flotte, post-process)

Constat de départ, capture à l'appui : lumière plate (ambiante hémisphérique
à 0,72, ombres claires), ciel analytique gris-beige sans nuage, sols en
aplats (herbe vert uni, enrobé et trottoir du même gris), voitures en
boîtes, arbres en boules, image rendue en sous-résolution (1,18). Tout cela
en un seul chantier, dans l'ordre du gain visuel.

- **Ciel HDRI + IBL** (main.ts) : trois panoramas Poly Haven CC0
  (`public/textures/ciel/jour|soir|nuit.hdr`, 2k) servent de fond (sphère
  de 2 900 m) ET d'éclairage d'ambiance (HDRCubeTexture préfiltrée). Le
  ciel analytique, la sonde d'environnement et les nuages sculptés sont
  retirés. `scripts/ciel-soleil.mjs` repère le soleil de chaque panorama et
  réécrit le fichier avec la luminance PLAFONNÉE à 12 : sans plafond, le
  disque solaire (71 000) entre dans l'IBL et éclaire tout sans ombre, en
  doublant la lumière directionnelle. Chaque ambiance donne un azimut
  boussole ; `rotationCiel` tourne le panorama pour y amener son soleil et
  la DirectionalLight suit.
- **Pièges rencontrés** : (1) une BOÎTE de ciel de 2 900 m a ses coins à
  2 500 m, au-delà de `camera.maxZ` (1 600) : le ciel se découpait en un
  grand trapèze de couleur de fond ; une sphère règle le problème. (2) La
  colonne u d'un panorama tombe sur l'angle (u - 0,75) × 2π mesuré de +X
  vers +Z, et non (u - 0,5) × 2π : mesuré en jeu par balayage du ciel
  (lecture des pixels rendus, matrice identité puis rotation de 1 rad,
  fonction `__regarder` ajoutée en diagnostic). (3) `MotionBlurPostProcess`
  exige une caméra à la construction, sinon pas de scène ni de pré-passe.
- **Lumière rééquilibrée** : ambiante 0,25, soleil 2,0, `environmentIntensity`
  1,5, ombres PCF medium sur 2 048, darkness 0,3, exposition 1. Les
  matériaux convertis passent à `environmentIntensity = 1` (c'est la scène
  qui dose).
- **Sols photographiques** (world.js, textures.js, ambientCG CC0) : enrobé,
  herbe, béton de trottoir, pavés, grave, écorce, avec cartes de normales.
  `textureFichier`/`matiere` créent des textures Three dont seule l'URL
  compte : le pont ne lit que `image.src`. Le pont convertit maintenant
  `normalMap` (inversion Y en repère main droite, comme le chargeur glTF),
  `roughnessMap` (canal vert seul), `aoMap`, `lightMap` (multiplicative,
  UV0, propre répétition) et `clearcoat`. Les trottoirs, sans UV, reçoivent
  des UV planaires monde (`userData.uvPlanaires`). Les teintes de zones
  passent de verts pleins à des multiplicateurs proches du blanc.
- **Flotte Kenney** (flotte.js, CC0) : cinq modèles low-poly (hatchback,
  sedan, suv, van, delivery) chargés par GLTFLoader, fusionnés, mis à
  l'échelle, puis SÉPARÉS par triangle en peinture (blanche, teintée par
  instance, vernie) et détails (palette du kit), en lisant la couleur de
  `colormap.png` au centre d'UV de chaque triangle. Les roues du kit
  (4 000 indices par voiture) sont remplacées par les cylindres instanciés
  existants, posés aux moyeux. parkedcars.js et traffic.js prennent
  `flotte` en paramètre et gardent la boîte en repli.
- **Voiture joueur** : vernis (`clearCoat`) sur les deux matériaux rouges
  de l'Audi, ombre de contact sous le châssis.
- **Post-process** : grain animé, aberration chromatique légère, courbes
  couleur (ombres bleutées, hautes lumières chaudes), vignette 0,7, flou de
  mouvement caméra dosé par la vitesse. Profils : Équilibré en résolution
  native ; SSAO et flou (pré-passe) réservés au profil Qualité.
- **Performance, la vraie découverte** : après tout cela, 52 fps. Le
  profileur Chrome montre 11,7 ms de JS par image dans la passe principale :
  818 maillages actifs à 14 µs l'appel de dessin (rebind PBR complet,
  cascades comprises) contre 2 µs dans la passe d'ombre. La ville comptait
  2 300 maillages de moins de 100 triangles. `ThreeCityConverter.fusionner`
  fusionne les petits maillages statiques par matériau, ombre, attributs et
  cellule de 300 m (1 486 fusionnés) : passe principale à 3,3 ms, 60 fps
  en natif. Les maillages retrouvés par nom (vitrages, trottoirs, murs…)
  restent hors fusion.
- Bug corrigé au passage : `Circulation.update` plantait sur un cul-de-sac
  en sens unique (`arete` indéfinie) et tuait la boucle de rendu.
- Non fait : piétons (toujours des capsules) ; feuillages encore en lobes
  d'icosaèdre, éclaircis pour le nouvel éclairage.

## 2026-08-26 (suite 16) : les Pyrénées enfin visibles à l'horizon sud

Question de Christophe : peut-on voir la chaîne au loin ? Découverte : les
Pyrénées EXISTAIENT depuis le début (`createBackdrop`, ruban de crêtes
bleutées plein sud à 1 380 m, la bonne direction) mais n'étaient JAMAIS
visibles, pour deux raisons cumulées : le plan lointain de la caméra
(`fogEnd + 250` : 1 230 m en Équilibré, 940 en Performance) les clippait,
et le brouillard linéaire (fin à 980 m) les noyait de toute façon.
Corrigé : `camera.maxZ` plancher à 1 600 m, `applyFog = false` sur le fond
(montagnes et nuages sculptés). Bonus de fidélité : la silhouette à deux
pointes du PIC DU MIDI D'OSSAU ajoutée au sud-sud-est (azimut réel ~160°
depuis Artix), la dent qui signe l'horizon béarnais. L'effet rendu : la
chaîne bleutée flotte au-dessus de la brume de plaine, comme en vrai.

## 2026-08-26 (suite 15) : McDo parfait, Leclerc Drive, station U colorée

- **McDonald's refondu sur Street View mars 2026** : soubassement en
  parement de pierre gris clair (les lattes brunes du premier jet étaient
  fausses), attique passé en PANNEAUX alternés corten / vert très foncé /
  blanc, M jaunes sur les panneaux blancs, « McDonald's » en lettres grises
  argentées sur le corten, meneaux noirs de la bande vitrée, photinias
  rouges et verts en pied de façade, jardinière rouge.
- **E.Leclerc Drive** (halle 589, rue Jean Monnet) : attique brun très
  foncé filant, casquette ORANGE de l'entrée, sas blanc, enseignes
  « E.Leclerc DRIVE » (carré bleu, DRIVE orange) sur les QUATRE façades de
  la boîte orientée (demandé), plus « Location E.Leclerc » au rond orange.
- **Station Super U refaite** : l'auvent blanc à chant rouge du premier jet
  ne correspondait pas : le vrai a un bandeau de LATTES BOIS assorti au
  magasin. Ajoutés : îlots de pompes blancs à flanc vert, local AdBlue à
  bande verte, totem de prix à tête U rouge.

## 2026-08-26 (suite 14) : deuxième tournée Street View

- **Crèche municipale + Bibliothèque Pour Tous EN DUR** (bât 2013 retiré) :
  pavillon à pans crème et rouge brique, frontons, toit de tuiles, enseigne,
  clôture crème. DÉCOUVERTE : le POI OSM de la bibliothèque (place du
  Général de Gaulle) est PÉRIMÉ, elle est avenue de la 2e DB dans ce
  pavillon : mystère de la « suite 13 » résolu.
- **Retail park est ABSENT de la BD TOPO comme le Super U** : halle Gamm
  vert + Mr.Bricolage (bardage anthracite à lattes bois, lettres rouges
  géantes, pastille verte, sas vitré) et magasin Action (chevron rouge,
  lettres bleu marine) construits sur leurs emprises OSM.
- **Leader Price : FERMÉ en 2026** (halle muette, parking désert, un food
  truck) : rendu fidèle à la friche : casquette verte délavée et rideau
  baissé, POI exclu pour éviter l'enseigne générique mensongère. Le POI
  « Intermarché » (ancien nom du Leclerc Express) est lui aussi exclu.
- Décors et devantures : banderole multicolore « Escola Calandreta »,
  auvent à poutres bois de la Maison de la santé (tableau de plaques),
  Pizz'Artix (petite enseigne blanche à lettres rouges sur la maison rose
  à bandeau vert d'eau), CERFRANCE (l'expert-comptable de l'immeuble du
  Crédit Agricole).

## 2026-08-26 (suite 13) : les lieux restants, relevés sur Street View

Première utilisation de Street View (via Chrome piloté, imagerie mai 2026,
bien plus fraîche que Panoramax janv. 2025) pour les lieux que Panoramax ne
couvrait pas de face. Modélisé en dur :
- **Gendarmerie** (bât 979 retiré du bâti) : pavillon blanc bas sous grand
  toit à croupes débordant, bande vitrée, bandeau « GENDARMERIE NATIONALE »,
  drapeau tricolore, clôture blanche.
- **Banque Pouyanne** : façade-décor bardage bois sombre, trame de vitrages,
  portiques rouge brique, casquette de monopente, deux mâts à fanions.
- **L'Artisienne** : façade-décor à fronton à REDANS étagés, caisson noir à
  épis dorés. Piège : la fiche retenait l'arête sud-est, la photo montre
  l'entrée côté avenue de Castille au nord-ouest.
- **Auberge du Parc** : décor plaqué sur le bâti (panneau peint au sapin sur
  le pignon ouest, galerie-balcon à colombages sur l'aile, piscine bâchée
  bleu délavé : l'auberge est À VENDRE et enherbée, état conservé).
- **C'zen** et **Pharmacie du Plateau** : devantures (bandeau noir à
  cursive blanche ; bandeau anthracite et mention MATÉRIEL MÉDICAL, ce qui
  clôt la question « MATERIEL MEDICAL » des pistes ouvertes).

Vu en passant : Pronto Pizza en mai 2026 confirme le modèle posé (pignon à
enseigne noire, panneau à pizza, clins). Abandonnés après vérification :
Poissonnerie Borde (plus de devanture visible en 2026, sans doute fermée),
Bibliothèque Pour Tous (local sans enseigne dans le bâtiment mairie),
école Jean Sarrailh (bâti auto correct, cour déjà équipée de ses terrains
marqués). `node --check` et `npx tsc --noEmit` passent.

## 2026-08-26 (suite 12) : pizzeria Pronto Pizza, la Poste remise dans l'axe

**Pizzeria « Pronto Pizza », place du Général de Gaulle : modélisée en dur.**
Bâtiment 1121 ajouté à `BATIMENTS_MODELISES`, pavillon de plain-pied posé sur
le milieu de sa façade rue (arête de 12,2 m, milieu (17,42, 68,95), normale
-1,93 rad vers l'avenue du 18e RI). Toit anthracite à deux pans, avant-corps
sud à pignon de clins blancs portant l'enseigne noire à script doré
(« Pronto Pizza », 05 59 53 91 31), grande baie sous store banne framboise
délavé, entrée nord sous auvent anthracite avec panneau mural à pizza dorée
(« COMMANDEZ AU »). « Pizzeria » ajoutée aux deux listes d'exclusion
(devantures et enseignes génériques).

- **Piège : les caps EXIF de la séquence GoPro 46fce73b sont faux de
  plusieurs dizaines de degrés.** Les cadrages de `panoramax-vue` extrayaient
  de mauvais secteurs (la fausse piste : un tabac du côté mairie pris pour la
  pizzeria) et les photos ne sont pas des 360 mais des plates 4096×2160. Le
  déblocage : filtrer l'inventaire par azimut aligné au cap caméra→cible,
  puis lire la photo HD ENTIÈRE (`.panoramax-cache-hd/`). Les prises utiles :
  90d6fc5d (à 16 m) et 55be8906.
- **Piège confirmé : le POI est posé DANS le bâtiment**, et le bâtiment
  d'à-côté (1121 visé par la première fiche) abritait en réalité Hair Libre
  et la Poste dans les vues mal cadrées : toujours recouper avec les enseignes
  lisibles sur les photos avant de coder.

**La Poste remise dans l'axe.** L'îlot 1077 est quasi carré (23,2 × 23,4 m) :
le PCA de `boiteOrientee` y est instable et son axe partait à l'est-ouest,
d'où un bâtiment tourné de 90° (balcon filant et enseigne face aux voisins).
La pose est maintenant calée sur l'arête mesurée de la façade avenue (16 m,
milieu (28,03, 34,08), normale (-0,967, -0,256), 74 prises de face), grand
axe `atan2(-uz, ux)`, entrée au coin nord côté carrefour comme en vrai.
**Piège générique à retenir : sur une emprise quasi carrée, `boiteOrientee`
ne fournit pas un cap fiable ; caler sur une arête mesurée.**

**CPC Invest déplacé sur son vrai bâtiment.** Une fois la Poste dans l'axe,
la devanture CPC (posée en dur au bout nord de l'arête de la Poste) se
retrouvait plaquée SUR elle. La photo 5e2b9192 montre le front réel du sud
au nord : Poste (fenêtre barreaudée, DAB au bout nord) puis, jointive au
coin des deux îlots (30,08, 26,34), la façade anthracite CPC. Le POI CPC
(34,1, 21,5) se projette sur l'îlot 1078, celui de la Maison Chaudron :
devanture reposée à (31,41, 20,81), normale (-0,969, -0,246), sans toucher
la boulangerie plus au nord. La Poste reprend ses 16 m d'arête complète.
**Piège : deux commerces jointifs sur la photo peuvent être sur deux îlots
BD TOPO différents ; projeter chaque POI sur SON emprise avant de partager
une arête.**

**Place du Général de Gaulle minéralisée.** Le way `highway=pedestrian`
FERMÉ de la place (59 sommets entre la mairie et les écoles Jean Moulin)
n'était rendu que comme un ruban de 4 m : l'intérieur restait en herbe.
L'ortho IGN montre une esplanade entièrement minérale : damier DIAGONAL de
carrés d'enrobé bordés de bandes pavées claires (pas ~6,5 m), rosace pavée
vers (-1, -4), arc de platanes. Fait : `osm.js` exporte les ways pedestrian
fermés (> 400 m²) dans `data.esplanades` (le ruban reste en roads pour le
circuit des passants, caché sous la dalle) ; `texturerDamierPlace`
(textures.js) porte une maille du damier, pivotée à 45° par les UV ;
`world.js` triangule la dalle à ROAD_Y - 0,025 (sous les voies et sous les
parkings) et pose la rosace en CircleGeometry pavée.

- **Piège : l'algorithme d'oreilles maison ne couvrait que 1 340 m² des
  5 464 m² du polygone concave.** `THREE.ShapeUtils.triangulateShape`
  (earcut) couvre les 57/57 triangles : à préférer pour tout polygone
  concave complexe.

**Parking du Leclerc dépavé de son herbe, abri caddies remis à sa place.**
L'herbe sur le parking venait du même bug de triangulation que la place :
l'emprise OSM (way 34146558, 15 sommets, en L concave) ne se laissait
couvrir qu'à 482 m² sur 2 316 par l'algorithme d'oreilles, l'herbe
ressortait par les trous. `triangulate` est devenu un wrapper sur l'earcut
de Three (repli maison pour les contours dégénérés, winding renormalisé
cross > 0 pour les mailles à face simple) : le correctif profite d'un coup
aux 52 aires sur 127 que le commentaire des parkings recensait en échec,
plus zones, eau, terrains et dalles de toits. L'abri caddies était plaqué
contre la façade (38, -72,5) : l'orthophoto montre son toit blanc au MILIEU
du parking, à cheval entre deux rangées dos à dos : reposé à (43,4, -63,4),
grand axe parallèle aux rangées (rotation -0,19 rad). À surveiller à
l'écran : une voiture générée pourrait chevaucher l'abri (les bandes de
stationnement ignorent son emprise).

**Passe massive Panoramax : quatorze devantures relevées et posées.**
Méthode industrialisée : inventaire croisé POI × couverture photo (32 lieux
candidats à 10 prises ou plus), fiches `artix-mesure --json` en lot, puis
lecture de photos HD ENTIÈRES le long des fronts (une photo montre 4 à 6
devantures, bien plus efficace que les cadrages par POI, brouillés par les
caps EXIF). Posé, rue commerçante ouest (avenue de la République, séquence
fa492f76) : Stéphane Plaza, Camguilhem (BOUCHERIE, bandeau noir), HUMAN
Immobilier (bleu roi), Fleur de Peau, Vins & Délices (vert sauge, maison en
galets), Amandine Fleurs, Boulangerie Nola (angle anthracite à liserés
ocre), C. Dolci (angle moderne, bandeau anthracite, logo doré). Front est
et place : Pharmacie de la République (vert cursif), Média Immo, Centre de
Beauté Fanny (rouge brique), Vapozen (noir, CBD/Vape), Allianz, K'Méléon
(bandeau cintré, façade saumon).

- **Piège récurrent confirmé trois fois : les POI de commerce accrochent la
  mauvaise arête** (venelle, arrière-cour). Camguilhem et Human partagent le
  front k6 de l'îlot 445 (24,5 m, normale (0,46, -0,89)) ; Allianz et
  K'Méléon l'arête k5 de l'îlot 495 face à la place. Toujours recouper la
  normale de l'arête retenue avec ce que montre la photo.

**Reportés (données insuffisantes ou contradictoires)** : Les Tontons
(façade sur place jamais vue de face par une GoPro ; enseigne ovale orange
au coin de la rue du 45e RI), Guy Hoquet, D. Florès, Entendre, C'zen
(fermé ?), Bibliothèque Pour Tous, Poissonnerie Borde (logo rond bleu à
phare vu sur le flanc de l'immeuble Vapozen, POI incohérent), Hair Libre :
sa fiche pointe le bâtiment 1079, déjà RETIRÉ du bâti comme « annexe de la
Poste » : vérifier si 1079 est en réalité l'immeuble de Hair Libre supprimé
à tort. Hors bourg : Auberge du Parc, Crèche, Calandreta, Gendarmerie,
écoles Jean Sarrailh, L'Artisienne, Banque Pouyanne, Pharmacie du Plateau.

**Suite de la passe : le café du centre, Hair Libre en dur, trois devantures
de plus.** Le « café du centre » est le bistrot LES TONTONS, face à
l'esplanade : modélisé en dur d'après le panoramique 360 cc2500e5 (la
séquence 69c7a475 est en VRAIS équirectangulaires 5760×2880, précieux : pas
de problème de cap) : véranda-terrasse vitrée à piliers maçonnés, bandeau
vert « BISTROT LES TONTONS » à quilles, porche « BIENVENUE » à fronton,
jardinières à haies taillées. Posé sur l'arête mesurée du bâtiment 498
(normale (0,593, -0,803) vers l'esplanade), le corps 498 reste au bâti
ordinaire comme fond. HAIR LIBRE modélisé en dur sur l'emprise 1079 :
Christophe a confirmé que ce bâtiment (retiré à tort comme « annexe de la
Poste ») est l'immeuble du salon, dans l'espace libre entre la Poste et
Pronto Pizza : R+1 crème, pignon sur rue, bande de brique, bandeau
anthracite à montant rouge-brun, médaillons cuivrés, portail garage au sud.
Devantures ajoutées : Guy Hoquet (drapeau orange, rue au nord du carrefour
mairie), D. Florès et Entendre (poses mesurées, teintes sobres faute de
photo frontale).

**Reportés après vérification photo** : Auberge du Parc (159 prises mais
toutes sur le mur ARRIÈRE du chemin du Parc, l'entrée donne sur le parc :
faible priorité), Bibliothèque Pour Tous (aucune façade lisible),
Poissonnerie Borde, C'zen. Piège du jour : le POI « D&L Traiteur » vu en
photo n'est PAS D. Florès, deux commerces distincts à 20 m.

**Stade amélioré, piscine municipale mise en eau.** Demande de Christophe,
avec repli assumé faute de photos exploitables du complexe : pelouse de
stade rase et marquages, bassins en eau.
- **Touffes bannies des terrains de sport** : `herbePlantable` (bridge ET
  main legacy) refuse désormais les boîtes englobantes des 27 emprises
  `data.terrains` (+1 m de marge). La pelouse d'un stade est tondue rase.
- **Terrains de football** : bandes de tonte transversales (une bande sur
  deux à +0,012, teinte 0x558d43 : c'est ce qui fait lire « stade entretenu »)
  et BUTS réglementaires aux deux bouts du grand axe (7,32 m d'ouverture,
  2,44 m sous la barre, quads verticaux dans le buffer des marquages blancs).
  Le rectangle, la médiane et le rond central existaient déjà.
- **Piscine René Pitteu** : les bassins ne sont ni dans OSM ni en BD TOPO :
  implantation MESURÉE sur l'orthophoto IGN. Grand bassin 25 × 12,5 m à
  couloirs peints dans la texture (centre (397,6, 114,8), grand axe
  (0,48, 0,88)), pataugeoire 12 × 6 m au sud-est, plage dallée claire versée
  dans le buffer de grave. Eau bleu clair chloré : roughness 0,14, carte de
  normales douce (texturerNormalesEau), pas d'animation (eau calme).

**Zone commerciale est : Super U, McDonald's, Crédit Agricole.** Christophe
a fourni des captures Street View (bâtiments récents) : NON exploitées, la
règle du projet l'interdit (sources Licence Ouverte seulement). Les sources
licites ont suffi : Panoramax janv. 2025 montre le McDo et le CA terminés,
et le Super U en chantier (bardage bois doré des pignons déjà posé).
- **Super U : il manquait ENTIÈREMENT au jeu** : le bâtiment n'est pas dans
  la BD TOPO (trop récent), seul OSM l'a (halle en L ~106 × 119 m). Construit
  en dur sur le polygone OSM brut (murs par segments, flanc nord-est doré,
  toit terrasse, façade d'entrée vitrée sous auvent, bandeau charte U
  publique), plus la station-service à auvent blanc et chant rouge.
- **McDonald's** : bâtiment 1492 retiré du bâti et reconstruit : attique
  noir à lettres blanches et arches jaunes (deux faces), vitrage filant sur
  soubassement latté brun, toit à deux pans asymétriques noirs à rives
  blanches, tour de jeux rouge-orangé à toboggan, totem McDrive au
  rond-point.
- **Crédit Agricole** : devanture plaquée sur l'arête mesurée du bâtiment
  tertiaire 1479 (partagé avec un cabinet comptable), bandeau anthracite.
- Piège : le POI CA est posé sur un ÉDICULE de 4 × 1,4 m (bât 1477), pas sur
  l'agence ; et l'ortho IGN du secteur est ANTÉRIEURE aux travaux (zone en
  terrassement) : pour un quartier récent, croiser OSM (le plus frais),
  Panoramax et la BD TOPO, aucune source ne suffit seule.
- **Piège technique (capture de Christophe : Super U tout blanc)** : le pont
  Three→Babylon convertit `instanceColor` mais IGNORE les `vertexColors` de
  géométrie : tout mesh qui s'appuie dessus ressort blanc. Murs refaits en
  matériau simple bardage brun-doré (0x9a7648), casquette blanche filante,
  enseigne charte bicolore (« SUPER » bleu, carré U rouge, « Artix ») posée
  sur la façade d'entrée ET sur le flanc nord-est visible de la route.

**Changement de règle sur les sources (décision de Christophe)** : Street
View et Google Maps ne sont plus interdits : admis en APPOINT visuel (usage
strictement personnel, jeu jamais publié), surtout pour les bâtiments trop
récents pour la campagne Panoramax de janv. 2025. La géométrie (positions,
emprises, hauteurs) continue de venir des données IGN et OSM. CLAUDE.md,
README et skill modeliser-artix mis à jour en conséquence ; les pièges de
la session (vertexColors du pont, PCA sur emprise carrée, caps EXIF des
séquences plates, earcut) sont remontés dans les « Pièges connus » du
CLAUDE.md.

Vérifié : `node --check` sur les JS touchés, `npx tsc --noEmit`. Validation
visuelle : pizzeria et Super U validés/corrigés sur captures par Christophe ;
Poste, CPC, place, parking Leclerc, dix-sept devantures, Les Tontons,
Hair Libre, stade, piscine et zone commerciale est restent à revoir en jeu.

## État au 2026-08-26 (fin de session du soir)

Tout est commité, `npx tsc --noEmit` passe. Rien n'est en cours ni cassé.
La session du soir a livré l'outillage d'inspection, sept lieux modélisés
en dur, et six chantiers de rendu.

**Outillage** : `npm run vue -- --poi "nom"` (photos Panoramax cadrées d'un
lieu, lisibles avec Read) et `npm run mesure -- --poi "nom"` (fiche mesurée :
façade sur rue par type de voie, boîte orientée, gouttière). Skills :
`fidelite-artix` (corriger un écart signalé), `modeliser-artix` (construire
un lieu). Plus aucun script d'analyse jetable.

**Modélisé cette session** : carrefour CE/pharmacie complet (Atmosph'Air en
devanture d'angle, CE façade rue avec ses trois enseignes, bandeau
PHARMACIE anthracite, croix déportée), station Leclerc à auvent jaune et
totem au bord de la D32, « Tendances du Moment », salle polyvalente
(demi-lune, aileron, sheds), entrée du collège (auvent adossé, dépose sans
voitures), citystade et fresque, cité Edmond Rostand (pétanque en
gravillons, plateau de basket, enseignes des vallées, étendoirs).

**Rendu** : variation des pelouses (texture de plaques), ombres de contact
instanciées, parc garé refondu (5 silhouettes + scooters, palette pondérée),
stationnement uniquement sur emplacements dédiés, circulation légère
(12 véhicules, traffic.js), passages piétons à la française, aucun poteau
sur la chaussée (ecarterDeChaussee), chants de rive et antennes râteau,
trottoirs à bordures du centre-bourg. Minimap corrigée (rotation 2×cap).

**Reprise conseillée** : `npm run dev`, rouler dans le bourg, vérifier à
l'écran les chantiers du soir non validés visuellement : trottoirs
(recouvrements éventuels : terrasse Au Comptoir noyée de 12 cm), trafic
(fluidité, sens uniques), passages piétons, plaques CE/croix (hauteur vs mur
rendu), citystade, salle polyvalente (bombé de la marquise).

**Pistes ouvertes** (aucune urgente) :
- Plaques d'égout et avaloirs sur les chaussées du bourg ; vernis
  (clearcoat) des carrosseries côté bridge.
- Collision physique des trottoirs et du trafic (compromis actuels : la
  voiture les traverse).
- Sens d'inclinaison de l'épi 45° : dépend du sens OSM de la voie, forçage
  par bande à prévoir si un contresens se voit.
- Pizzeria de la place du Général de Gaulle (POI 21.8, 65.5) : encore en
  devanture générique. Pignon à œil-de-bœuf entre station et Tendances du
  Moment. « MATERIEL MEDICAL » vérifié ?
- Touffes d'herbe du premier plan un peu sombres ; placage photo :
  exposition de quelques cases.

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
- **Trottoirs à bordures du centre-bourg** (construireTrottoirs, world.js) :
  deux rubans latéraux surélevés de 12 cm le long des voies du bourg
  (rayon 380 m, largeur ≥ 5 m), plateau gris-beige nuancé par voie, chant
  de bordure clair côté chaussée et chant de fermeture côté accotement.
  Bissectrices par sommet comme `ribbon` (virages d'un seul tenant), quads
  sautés à moins de 7 m des carrefours (les bateaux et passages y font le
  raccord), dans les aires de parking OSM et le long de la bande en dur du
  18e RI. Limites assumées : pas de collision physique (la voiture traverse
  le plateau en y roulant, roues noyées de 12 cm) ; la terrasse d'Au
  Comptoir et les seuils posés à roadY sont recouverts de 12 cm : à
  surélever si ça se voit en jeu.
- **Couronnement des toits.** (1) Chants de rive : un bandeau vertical de
  13 cm sous l'égout de chaque couverture, sur le contour débordé (buffer
  dédié, hors de la texture tuile), planche claire ou zinc selon un tirage
  par bâtiment, sauté sur les côtés mitoyens (débord quasi nul : le bandeau
  serait coplanaire au mur voisin et scintillerait). Le toit cesse d'être
  une feuille sans épaisseur vue de profil. (2) Antennes râteau sur un
  tiers des souches de cheminée (mât + herse de 4 barreaux fusionnés,
  instanciés) : toutes pointent vers le même azimut sud-est (l'émetteur
  réel), au désalignement près : c'est le cap commun qui fait vrai sur une
  ligne de toits.
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
