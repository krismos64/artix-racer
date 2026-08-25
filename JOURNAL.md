# Journal du chantier visuel

Journal de bord tenu par session de travail. Entrées antéchronologiques.

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
