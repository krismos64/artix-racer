// Flotte de véhicules : conversion hors ligne du « Free Low Poly Vehicles
// Pack » de rgsdev (CC0, OpenGameArt), fourni en FBX seulement.
//
//   node scripts/preparer-flotte.mjs "<dossier Free Low Poly Vehicles Pack by Rgsdev>"
//
// Sortie : public/models/flotte-rgs/<modele>.json et palette.png, lus par
// src/three-city/flotte.js. Le jeu ne charge pas de FBX : ce format léger
// donne directement les deux lots dont il a besoin.
//   - `peinture` : faces de carrosserie (matériau « body <couleur> », hors
//     noir et blanc), rendues blanches et teintées par instance ;
//   - `details` : vitres, feux, garnitures, avec des UV pointant chacune au
//     centre d'une case de palette.png. parkedcars.js et traffic.js gardent
//     ainsi leur matériau à palette, inchangé.
// Les roues ne sont pas exportées (les cylindres instanciés de parkedcars
// les remplacent) : seuls leur centre et leur rayon le sont.
import fs from 'node:fs';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import sharp from 'sharp';

globalThis.self = globalThis;
const SOURCE = process.argv[2];
const OUT = 'public/models/flotte-rgs';
fs.mkdirSync(OUT, { recursive: true });

const MODELES = ['Hatchback', 'Sedan', 'SUV', 'Van'];

// Teintes des détails, réglées à la main : celles du pack sont stylisées
// (phares et jantes lavande). Clé : nom de matériau du FBX.
const TEINTES = {
  windows: [0x1d, 0x26, 0x33],
  headlights: [0xe2, 0xe6, 0xea],
  'rear lights': [0x96, 0x10, 0x12],
  'body black': [0x1c, 0x1d, 0x1f],
  'body white': [0xd8, 0xda, 0xdc],
  tires: [0x16, 0x16, 0x17],
  wheels: [0x9a, 0x9e, 0xa4],
};
const CASES = Object.keys(TEINTES);
const COTE = 4;            // cases de 4 x 4 cases
const PIX = 8;             // pixels par case
// Centre de la case k en UV (origine en haut à gauche, comme le kit Kenney :
// la palette est chargée sans retournement vertical).
const uvCase = (k) => [((k % COTE) + 0.5) / COTE, (Math.floor(k / COTE) + 0.5) / COTE];

// Palette PNG.
{
  const T = COTE * PIX;
  const buf = Buffer.alloc(T * T * 3, 0);
  CASES.forEach((nom, k) => {
    const [r, g, b] = TEINTES[nom];
    const cx = (k % COTE) * PIX, cy = Math.floor(k / COTE) * PIX;
    for (let y = cy; y < cy + PIX; y++) for (let x = cx; x < cx + PIX; x++) {
      const i = (y * T + x) * 3;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b;
    }
  });
  await sharp(buf, { raw: { width: T, height: T, channels: 3 } }).png().toFile(`${OUT}/palette.png`);
}

for (const nom of MODELES) {
  const fichier = fs.readFileSync(`${SOURCE}/${nom}/${nom}.fbx`);
  const objet = new FBXLoader().parse(fichier.buffer.slice(fichier.byteOffset, fichier.byteOffset + fichier.byteLength), '');
  objet.updateMatrixWorld(true);

  const roues = [];
  const lots = { peinture: { pos: [], nrm: [] }, details: { pos: [], nrm: [], uv: [] } };
  const phares = [];
  const p = new THREE.Vector3(), q = new THREE.Vector3();
  const normale = new THREE.Matrix3();
  objet.traverse((o) => {
    if (!o.isMesh) return;
    if (/_wheel_/i.test(o.name)) {
      const bb = new THREE.Box3().setFromObject(o);
      const c = bb.getCenter(new THREE.Vector3()), s = bb.getSize(new THREE.Vector3());
      roues.push({ c, r: s.y / 2 });
      return;
    }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pos = g.attributes.position, nrm = g.attributes.normal;
    normale.getNormalMatrix(o.matrixWorld);
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    // Groupes de matériaux : sans groupe, tout le maillage porte le premier.
    const groupes = g.groups.length ? g.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
    for (const gr of groupes) {
      const mat = mats[gr.materialIndex] ?? mats[0];
      const nomMat = (mat.name || '').toLowerCase();
      const peinture = nomMat.startsWith('body ') && nomMat !== 'body black' && nomMat !== 'body white';
      const lot = peinture ? lots.peinture : lots.details;
      const k = CASES.indexOf(nomMat);
      const uv = uvCase(k >= 0 ? k : CASES.indexOf('body black'));
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        q.fromBufferAttribute(nrm, i).applyMatrix3(normale).normalize();
        lot.pos.push(p.x, p.y, p.z);
        lot.nrm.push(q.x, q.y, q.z);
        if (lot.uv) lot.uv.push(uv[0], uv[1]);
        if (nomMat === 'headlights') phares.push(p.z);
      }
    }
  });

  // Avant vers +Z, comme le kit Kenney et le jeu : les phares disent où est
  // l'avant. Sinon demi-tour autour de Y (x et z changent de signe).
  const avantMoins = phares.length && phares.reduce((a, b) => a + b, 0) / phares.length < 0;
  const tourner = (arr) => { for (let i = 0; i < arr.length; i += 3) { arr[i] = -arr[i]; arr[i + 2] = -arr[i + 2]; } };
  if (avantMoins) {
    for (const lot of Object.values(lots)) { tourner(lot.pos); tourner(lot.nrm); }
    for (const r of roues) { r.c.x = -r.c.x; r.c.z = -r.c.z; }
  }

  // Sol au bas des roues, centrage en x et z sur la caisse.
  const bb = new THREE.Box3();
  for (const lot of Object.values(lots)) for (let i = 0; i < lot.pos.length; i += 3) bb.expandByPoint(p.set(lot.pos[i], lot.pos[i + 1], lot.pos[i + 2]));
  const sol = Math.min(...roues.map((r) => r.c.y - r.r));
  const dx = -(bb.min.x + bb.max.x) / 2, dz = -(bb.min.z + bb.max.z) / 2;
  const decaler = (arr) => { for (let i = 0; i < arr.length; i += 3) { arr[i] += dx; arr[i + 1] -= sol; arr[i + 2] += dz; } };
  for (const lot of Object.values(lots)) decaler(lot.pos);
  const arrondi = (arr, n = 4) => arr.map((v) => +v.toFixed(n));
  const sortie = {
    source: `rgsdev, Free Low Poly Vehicles Pack (CC0), ${nom}`,
    peinture: { pos: arrondi(lots.peinture.pos), nrm: arrondi(lots.peinture.nrm, 3) },
    details: { pos: arrondi(lots.details.pos), nrm: arrondi(lots.details.nrm, 3), uv: arrondi(lots.details.uv, 3) },
    roues: roues.map((r) => ({ x: +(r.c.x + dx).toFixed(3), y: +(r.c.y - sol).toFixed(3), z: +(r.c.z + dz).toFixed(3), r: +r.r.toFixed(3) })),
  };
  fs.writeFileSync(`${OUT}/${nom.toLowerCase()}.json`, JSON.stringify(sortie));
  console.log(nom, 'avant', avantMoins ? '-Z (retourné)' : '+Z', 'peinture', lots.peinture.pos.length / 9, 'tris', 'détails', lots.details.pos.length / 9, 'tris', 'roues', roues.length,
    'taille', (bb.max.x - bb.min.x).toFixed(0), (bb.max.y - sol).toFixed(0), (bb.max.z - bb.min.z).toFixed(0));
}
