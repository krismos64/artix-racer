// Flotte de véhicules low-poly (Kenney Car Kit, licence CC0) pour le parc
// garé et la circulation.
//
// Les silhouettes en boîte de parkedcars.js lisaient bien de loin, mais de
// près elles trahissaient la maquette : pas de galbe, pas de calandre, des
// vitres plaquées. Les modèles Kenney gardent un compte de triangles très bas
// (2 000 par voiture) tout en ayant des proportions et des détails lisibles.
//
// Chaque modèle est fusionné en UNE géométrie (caisse + roues), puis
// séparée en deux lots par triangle :
//   - `peinture` : les faces de la carrosserie, rendues blanches et teintées
//     par la couleur d'instance (c'est ce qui donne un parc varié) ;
//   - `details` : vitres, roues, phares, calandre, qui gardent la palette du
//     kit et ne doivent PAS prendre la teinte de la caisse.
// La séparation se fait en lisant, pour chaque triangle, la couleur de la
// palette Kenney (`colormap.png`) à son centre d'UV : la couleur qui couvre
// la plus grande surface est la carrosserie.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { textureFichier } from './textures.js';

// Correspondance gabarit du jeu → modèle Kenney, avec la longueur hors tout
// visée en mètres (le kit est à une échelle fantaisiste, 2,5 m de long).
export const MODELES = {
  compacte: { fichier: 'hatchback-sports', longueur: 4.05 },
  berline: { fichier: 'sedan', longueur: 4.55 },
  break: { fichier: 'suv', longueur: 4.65 },
  fourgonnette: { fichier: 'van', longueur: 4.5 },
  fourgon: { fichier: 'delivery', longueur: 5.6 },
};

const BASE = '/models/flotte/';

// Palette lue en pixels pour classer les triangles.
async function lirePalette(url) {
  const reponse = await fetch(url);
  const bitmap = await createImageBitmap(await reponse.blob());
  const c = document.createElement('canvas');
  c.width = bitmap.width;
  c.height = bitmap.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  return {
    largeur: c.width,
    hauteur: c.height,
    // Couleur quantifiée au pixel, en clé de regroupement.
    cle(u, v) {
      // UV glTF : origine en haut à gauche, pas de retournement.
      const x = Math.min(c.width - 1, Math.max(0, Math.floor(u * c.width)));
      const y = Math.min(c.height - 1, Math.max(0, Math.floor(v * c.height)));
      const i = (y * c.width + x) * 4;
      return `${data[i] >> 3},${data[i + 1] >> 3},${data[i + 2] >> 3}`;
    },
  };
}

function separer(geometrie, palette) {
  const g = geometrie.index ? geometrie.toNonIndexed() : geometrie;
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const uv = g.getAttribute('uv');
  const n = pos.count / 3;
  const cles = new Array(n);
  const aires = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < n; t++) {
    const u = (uv.getX(t * 3) + uv.getX(t * 3 + 1) + uv.getX(t * 3 + 2)) / 3;
    const v = (uv.getY(t * 3) + uv.getY(t * 3 + 1) + uv.getY(t * 3 + 2)) / 3;
    const k = palette.cle(u, v);
    cles[t] = k;
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const aire = b.sub(a).cross(c.sub(a)).length() / 2;
    aires.set(k, (aires.get(k) ?? 0) + aire);
  }
  let peinture = null, max = -1;
  for (const [k, aire] of aires) if (aire > max) { max = aire; peinture = k; }

  const lots = { peinture: { pos: [], nrm: [] }, details: { pos: [], nrm: [], uv: [] } };
  for (let t = 0; t < n; t++) {
    const lot = cles[t] === peinture ? lots.peinture : lots.details;
    for (let s = 0; s < 3; s++) {
      const i = t * 3 + s;
      lot.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      lot.nrm.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      if (lot.uv) lot.uv.push(uv.getX(i), uv.getY(i));
    }
  }
  const construire = (lot) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lot.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(lot.nrm, 3));
    if (lot.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(lot.uv, 2));
    geo.computeBoundingSphere();
    return geo;
  };
  return { peinture: construire(lots.peinture), details: construire(lots.details) };
}

// Charge les cinq modèles en parallèle. Renvoie, par gabarit :
//   { peinture, details, demiL, demiW, hauteur }
// plus `palette`, la texture partagée des détails. Renvoie null si le kit
// est absent : les appelants retombent alors sur les silhouettes en boîte.
export async function chargerFlotte() {
  const loader = new GLTFLoader();
  const palette = await lirePalette(`${BASE}Textures/colormap.png`);
  const flotte = {
    // Palette rendue par Babylon : chargée depuis le fichier, sans
    // retournement vertical (convention glTF, origine en haut).
    palette: textureFichier(`${BASE}Textures/colormap.png`, { flipY: false }),
  };
  flotte.palette.wrapS = flotte.palette.wrapT = THREE.ClampToEdgeWrapping;
  await Promise.all(Object.entries(MODELES).map(async ([type, spec]) => {
    const gltf = await loader.loadAsync(`${BASE}${spec.fichier}.glb`);
    const racine = gltf.scene;
    racine.updateMatrixWorld(true);
    const morceaux = [];
    // Les quatre roues du kit (500 sommets chacune, 4 000 indices par
    // voiture, plus que la caisse) sont remplacées par les cylindres à dix
    // faces déjà instanciés par parkedcars.js : seule leur position est
    // retenue ici. La roue de secours d'un 4x4 (`wheel-back`) reste dans
    // la caisse.
    const roues = [];
    const centre = new THREE.Vector3();
    racine.traverse((o) => {
      if (!o.isMesh) return;
      if (/^wheel-(front|back)-(left|right)$/.test(o.name)) {
        o.getWorldPosition(centre);
        roues.push(centre.clone());
        return;
      }
      const g = o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      // Les tangentes ne servent pas (pas de carte de normales) et gênent la
      // fusion, qui exige les mêmes attributs sur toutes les pièces.
      g.deleteAttribute('tangent');
      morceaux.push(g.index ? g.toNonIndexed() : g);
    });
    const fusion = mergeGeometries(morceaux, false);
    // Mise à l'échelle sur la longueur (l'axe Z du kit est l'axe long, avant
    // vers +Z, comme dans le jeu), puis sol à y = 0 et centrage en x, z.
    // Le sol de référence est le bas des roues (centre à 0,3 dans le kit,
    // rayon 0,3), la caisse seule flottant au-dessus.
    fusion.computeBoundingBox();
    let bb = fusion.boundingBox;
    const k = spec.longueur / (bb.max.z - bb.min.z);
    const dx = -(bb.min.x + bb.max.x) / 2, dz = -(bb.min.z + bb.max.z) / 2;
    fusion.scale(k, k, k);
    fusion.translate(dx * k, 0, dz * k);
    fusion.computeBoundingBox();
    bb = fusion.boundingBox;
    const lots = separer(fusion, palette);
    flotte[type] = {
      ...lots,
      roues: roues.map((r) => ({ x: (r.x + dx) * k, y: r.y * k, z: (r.z + dz) * k })),
      rayonRoue: 0.3 * k,
      demiL: (bb.max.z - bb.min.z) / 2,
      demiW: (bb.max.x - bb.min.x) / 2,
      hauteur: bb.max.y,
    };
  }));
  return flotte;
}
