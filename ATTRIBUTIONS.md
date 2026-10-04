# Attributions

Le code source d'Artix Racer est sous licence MIT (voir `LICENSE`). Les données,
modèles et images utilisés par le projet relèvent de licences distinctes,
listées ici.

## Données cartographiques

**OpenStreetMap** : `public/data/artix-osm.json`, `public/data/artix-poi.json`
Données © les contributeurs OpenStreetMap, sous licence ODbL 1.0.
https://www.openstreetmap.org/copyright

Ces fichiers sont des extraits de la base OSM obtenus via l'API Overpass, puis
filtrés sur la commune d'Artix (64170). Toute redistribution reste soumise à
l'ODbL, qui impose le partage à l'identique des bases dérivées.

**BD TOPO®** : `public/data/artix-bdtopo.json`
© IGN, sous Licence Ouverte 2.0 (Etalab).
https://geoservices.ign.fr/bdtopo

Fournit les hauteurs de bâtiments, les matériaux de toiture et les altitudes.

**RGE ALTI® / LiDAR HD** : altitudes du terrain
© IGN, sous Licence Ouverte 2.0 (Etalab).

## Photographies de référence

**Panoramax** : panoramiques du centre-bourg d'Artix, janvier 2025.
Sous Licence Ouverte 2.0.
https://panoramax.fr

Ces images ont servi au relevé des teintes de façade, des hauteurs et de la
signalisation. Elles ne sont pas redistribuées dans le dépôt : le dossier
`refs/` est exclu par `.gitignore`. Seules les valeurs de couleur et de
géométrie qui en sont issues figurent dans le code.

**Wikimedia Commons** : vues de la mairie, de la rue principale et du carrefour
au cèdre.
© Jean Michel Etchecolonea, sous licence CC BY-SA 3.0.
https://creativecommons.org/licenses/by-sa/3.0/

Utilisées de la même façon, pour le calage des teintes, sans redistribution.

## Modèle 3D du véhicule

**`public/models/ferrari.glb`** : Ferrari 458 Italia, par vicent091036.

Modèle repris de l'exemple `webgl_materials_car` de three.js
(`examples/models/gltf/ferrari.glb`), lui-même issu de Sketchfab. C'est le
véhicule du joueur depuis septembre 2026.

La licence n'a PAS pu être vérifiée : le dépôt three.js ne documente pas
celle de ce fichier, et la page Sketchfab d'origine
(modèle 57bf6cc56931426e87494f554df1dab6) est aujourd'hui désactivée. Le
modèle est utilisé ici dans un projet strictement personnel, jamais mis en
ligne. Toute publication du dépôt demanderait de tirer ce point au clair ou
de remplacer le fichier.

« Ferrari » et « 458 Italia » sont des marques déposées de Ferrari S.p.A. Ce
projet n'est ni affilié à Ferrari S.p.A. ni approuvé par elle.

L'ancien véhicule du joueur, `AudiR8.glb`, d'attribution inconnue, a été
retiré du dépôt.

## Musique

**`public/audio/music1.mp3`** : morceau fourni par l'auteur du projet, libre
de droits pour cet usage.

Les deux autres sons du jeu (moteur et sifflement de turbo) sont synthétisés
en temps réel par la Web Audio API : aucun n'est un enregistrement.

## Bibliothèques

- **Three.js**, licence MIT, © Three.js authors
- **Babylon.js**, licence Apache 2.0, © Babylon.js contributors
- **earcut**, licence ISC, © Mapbox
- **sharp** (scripts hors ligne), licence Apache 2.0, © Lovell Fuller et les contributeurs
- **Vite**, licence MIT, © Evan You et les contributeurs Vite

## Ressources visuelles CC0 (chantier de septembre 2026)

**Poly Haven** : `public/textures/ciel/jour.hdr` (kloofendal_48d_partly_cloudy_puresky),
`soir.hdr` (qwantani_sunset_puresky), `nuit.hdr` (kloppenheim_02_puresky).
Panoramas HDR sous licence CC0 1.0, réduits en 2k et plafonnés en luminance par
`scripts/ciel-soleil.mjs`. https://polyhaven.com/hdris

**ambientCG** : `public/textures/sols/*` (Asphalt012, Grass004, Concrete034,
PavingStones067, Ground037, Bark012). Photos de matière sous licence CC0 1.0,
converties en JPG 1K par `scripts/preparer-textures.mjs`. https://ambientcg.com

Également `public/textures/bati/*` (Plaster003, RoofingTiles006,
RoofingTiles003, CorrugatedSteel005, octobre 2026), passées en gris clair
par `scripts/preparer-bati.mjs` pour être teintées par bâtiment.

**Free Low Poly Vehicles Pack, par rgsdev** : `public/models/flotte-rgs/*.json`
(Hatchback, Sedan, SUV, Van), convertis depuis le FBX d'origine par
`scripts/preparer-flotte.mjs`. Licence CC0 1.0.
https://opengameart.org/content/free-low-poly-vehicles-pack
(Remplace le Kenney Car Kit, CC0, retiré le 4 octobre 2026.)

**Images générées par Codex (OpenAI)** pour ce projet, retouchées
(détourage, atlas, niveaux) : `public/textures/facades/*` (fenêtres, volets,
portes, génoise, feuillage, fond des plaques de rue, coulures),
`public/textures/fumee.png`, `public/textures/fond/pyrenees.png`,
`public/images/titre.jpg`. Pas de tiers à créditer ; usage personnel.
