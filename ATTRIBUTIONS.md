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

**`public/models/AudiR8.glb`** : attribution inconnue.

Le fichier a été retraité par glTF-Transform et ne porte plus de métadonnées
d'auteur ni de licence. L'origine n'a pas pu être retrouvée à ce jour. Il est
inclus dans le dépôt en l'état, sans prétention sur ses droits.

« Audi » et « R8 » sont des marques déposées d'AUDI AG. Ce projet n'est ni
affilié à AUDI AG ni approuvé par elle.

Si vous êtes l'auteur de ce modèle, ou si vous en identifiez la source, ouvrez
une issue : l'attribution sera ajoutée, ou le fichier retiré sur demande.

## Bibliothèques

- **Three.js**, licence MIT, © Three.js authors
- **Rapier**, licence Apache 2.0, © Dimforge
- **Vite**, licence MIT, © Evan You et les contributeurs Vite
