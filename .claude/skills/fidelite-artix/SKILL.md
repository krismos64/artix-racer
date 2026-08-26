---
name: fidelite-artix
description: Corriger un écart de fidélité visuelle d'Artix signalé depuis le jeu (bâtiment mal placé, débord sur la chaussée, enseigne en double, sol ou parking faux). Utiliser dès que Christophe signale que quelque chose cloche, capture d'écran à l'appui. Pour construire un lieu qui n'existe pas encore, voir modeliser-artix.
---

# Fidélité visuelle d'Artix

Méthode éprouvée sur des dizaines d'allers-retours. La règle d'or : **mesurer
dans les données avant de corriger**, jamais deviner une position ou un cap.

Deux outils évitent d'écrire un script d'analyse jetable :
`node scripts/panoramax-vue.mjs --poi "nom"` (voir le lieu réel en photo) et
`node scripts/artix-mesure.mjs --poi "nom"` (fiche mesurée : boîte orientée,
arêtes, normales, façade sur rue). Pour CONSTRUIRE un lieu plutôt que corriger
un écart, voir le skill `modeliser-artix`.

## 1. Diagnostiquer

Si Christophe fournit une capture d'écran, la lire avec Read (les fichiers du
Bureau sont accessibles). Identifier le bâtiment ou l'objet fautif, puis
mesurer dans les données plutôt que d'ajuster à l'œil.

Repère du jeu : `ORIGIN = { lat: 43.39743, lon: -0.57224 }` (src/three-city/
osm.js), projection Mercator locale, Z croît vers le sud.

```python
# Projection à recopier dans tout script d'analyse
OR = (43.39743, -0.57224); R = 6378137
def proj(lat, lon):
    return ((lon-OR[1])*math.pi/180*R*math.cos(OR[0]*math.pi/180),
            -(lat-OR[0])*math.pi/180*R)
```

## 2. Choisir la bonne source

| Besoin | Source | Comment |
| --- | --- | --- |
| Implanter au sol (parking, allée, place) | **Orthophoto IGN** | WMS `data.geopf.fr`, via **curl** (le SSL de python3 est cassé ici) |
| Aspect d'une façade, enseigne, couleur | **Panoramax HD** | `.panoramax-cache-hd/`, extraction par gisement (voir scripts/panoramax-centre.mjs) |
| Emprise, hauteur, matériau | `public/data/artix-bdtopo.json` | index = position dans le tableau |
| Position d'un commerce | `public/data/artix-poi.json`, clé `poi` | pas `elements` |

Requête orthophoto type :

```bash
BBOX="lat1,lon1,lat2,lon2"   # sud-ouest, nord-est
curl -s "https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap\
&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&FORMAT=image/jpeg\
&CRS=EPSG:4326&BBOX=${BBOX}&WIDTH=1900&HEIGHT=1900" -o ortho.jpg
```

## 3. Mesurer

- **Position d'un bâtiment** : centre de la **boîte orientée** (PCA du
  contour puis milieu des extrema), JAMAIS le centroïde : une emprise en L
  décale le centroïde de plusieurs mètres et le bâtiment déborde sur la route.
- **Orientation d'une façade** : prendre l'arête pertinente du contour,
  calculer sa normale, l'orienter vers l'extérieur (produit scalaire avec le
  vecteur vers le centroïde négatif), puis `Math.atan2(nx, nz)`.
- **Position d'un commerce sur son bâtiment** : projeter le POI sur l'arête.

## 4. Corriger

Modèles à la main : `src/three-city/landmarks.js`.
- Un bâtiment BD TOPO remplacé doit être ajouté à `BATIMENTS_MODELISES`
  (bdtopo.js) ; son emprise reste opposable via `data.emprisesModelisees`.
- Un commerce modélisé doit être ajouté à `dejaModelises` (landmarks.js) ET à
  la liste d'exclusion de `signage.js`, sinon enseignes en double.
- `construireDevantureCommerce({ nom, sous, fond, encre, largeur })` pose une
  devanture paramétrée sur une position et une rotation mesurées.
- `retracterHorsChaussee` rétracte automatiquement un modèle qui mord une voie.

Parkings : `src/three-city/parking.js`, tableaux de bandes en dur ; les bandes
se rognent d'elles-mêmes près d'une chaussée.

## 5. Vérifier

`npx tsc --noEmit` et `node --check` sur les fichiers JS touchés (les deux
sont aussi câblés en hooks). Puis proposer à Christophe de recharger et de
signaler ce qui reste : ne pas ouvrir d'onglet Chrome dans sa session sans
raison, il joue souvent dans la sienne.

Enfin, consigner la correction et le piège rencontré dans `JOURNAL.md`.
