// Flotte de véhicules low-poly pour le parc garé et la circulation.
//
// Depuis le 4 octobre 2026 : « Free Low Poly Vehicles Pack » de rgsdev
// (CC0, OpenGameArt), converti hors ligne par scripts/preparer-flotte.mjs
// en public/models/flotte-rgs/*.json. Il remplace le Kenney Car Kit, dont
// les caisses bombées et les couleurs franches faisaient « voiture jouet »
// même une fois remises aux cotes réelles : les modèles rgsdev ont des
// silhouettes de vraies voitures (capot, pare-brise incliné, berline
// effilée) pour 800 à 1 100 triangles hors roues.
//
// Chaque modèle arrive en deux lots, déjà séparés par la conversion :
//   - `peinture` : faces de carrosserie, rendues blanches et teintées par la
//     couleur d'instance (c'est ce qui donne un parc varié) ;
//   - `details` : vitres, feux, garnitures, qui lisent leur teinte dans
//     palette.png par leurs UV et ne prennent PAS la teinte de la caisse.
// Les roues ne sont pas dans les lots : parkedcars.js et traffic.js posent
// leurs propres cylindres instanciés aux centres fournis.
import * as THREE from 'three';
import { textureFichier } from './textures.js';

// Correspondance gabarit du jeu → modèle, avec les cotes hors tout visées en
// mètres (longueur, largeur, hauteur). La caisse est étirée axe par axe vers
// ces cotes de catalogue : la fourgonnette et le fourgon partagent le même
// modèle de van à deux échelles, le pack n'en ayant qu'un.
export const MODELES = {
  compacte: { fichier: 'hatchback', longueur: 4.05, largeur: 1.75, hauteur: 1.45 },
  berline: { fichier: 'sedan', longueur: 4.55, largeur: 1.8, hauteur: 1.45 },
  break: { fichier: 'suv', longueur: 4.65, largeur: 1.85, hauteur: 1.68 },
  fourgonnette: { fichier: 'van', longueur: 4.5, largeur: 1.85, hauteur: 1.85 },
  fourgon: { fichier: 'van', longueur: 5.6, largeur: 2.05, hauteur: 2.4 },
};

const BASE = '/models/flotte-rgs/';

// Charge les modèles en parallèle. Renvoie, par gabarit :
//   { peinture, details, demiL, demiW, hauteur, roues, rayonRoue }
// plus `palette`, la texture partagée des détails. Renvoie null si les
// fichiers manquent : les appelants retombent alors sur les silhouettes en
// boîte.
export async function chargerFlotte() {
  const flotte = {
    // Palette chargée depuis le fichier, sans retournement vertical : les UV
    // de la conversion ont leur origine en haut à gauche.
    palette: textureFichier(`${BASE}palette.png`, { flipY: false }),
  };
  flotte.palette.wrapS = flotte.palette.wrapT = THREE.ClampToEdgeWrapping;
  try {
    const sources = new Map();
    await Promise.all(Object.entries(MODELES).map(async ([type, spec]) => {
      if (!sources.has(spec.fichier)) {
        sources.set(spec.fichier, fetch(`${BASE}${spec.fichier}.json`).then((r) => {
          if (!r.ok) throw new Error(`${spec.fichier}: ${r.status}`);
          return r.json();
        }));
      }
      flotte[type] = construire(await sources.get(spec.fichier), spec);
    }));
  } catch (erreur) {
    console.warn('Flotte indisponible, silhouettes en boîte :', erreur);
    return null;
  }
  return flotte;
}

// Met un modèle converti aux cotes du gabarit, axe par axe. Les roues
// suivent la HAUTEUR pour leur rayon : elles remplissent ainsi les passages
// de roue de la caisse mise à l'échelle.
function construire(src, spec) {
  const geo = (lot) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(lot.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(lot.nrm, 3));
    if (lot.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(lot.uv, 2));
    return g;
  };
  const peinture = geo(src.peinture);
  const details = geo(src.details);
  // Étendue commune aux deux lots : c'est la caisse entière qui doit
  // atteindre les cotes, pas chaque lot séparément.
  peinture.computeBoundingBox();
  details.computeBoundingBox();
  const bb = peinture.boundingBox.clone().union(details.boundingBox);
  const kx = spec.largeur / (bb.max.x - bb.min.x);
  const ky = spec.hauteur / bb.max.y;
  const kz = spec.longueur / (bb.max.z - bb.min.z);
  for (const g of [peinture, details]) {
    g.scale(kx, ky, kz);
    g.computeBoundingSphere();
  }
  return {
    peinture,
    details,
    roues: src.roues.map((r) => ({ x: r.x * kx, y: r.y * ky, z: r.z * kz })),
    rayonRoue: src.roues[0].r * ky,
    demiL: spec.longueur / 2,
    demiW: spec.largeur / 2,
    hauteur: spec.hauteur,
  };
}
