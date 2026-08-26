// VOIR un lieu d'Artix en photo réelle, sans écrire de script jetable.
//
// Sélectionne les meilleurs panoramiques Panoramax qui regardent un point
// donné (proches, vue dégagée, incidence correcte), les télécharge en HD si
// besoin, et écrit pour chacun un CADRAGE PLAT (projection rectilinéaire de
// la portion utile de l'équirectangulaire) directement lisible.
//
// Usage :
//   node scripts/panoramax-vue.mjs --xz 26,12
//   node scripts/panoramax-vue.mjs --poi "Pharmacie Barrouilhet" --n 3
//   node scripts/panoramax-vue.mjs --latlon 43.3974,-0.5722 --fov 70 --sortie /tmp/vues
//
// Options :
//   --xz X,Z          cible en coordonnées du jeu
//   --latlon LAT,LON  cible en WGS84
//   --poi "nom"       cible = POI dont le nom contient ce motif
//   --bat N           cible = centre de boîte orientée du bâtiment BD TOPO N
//   --n 3             nombre de vues (défaut 3)
//   --rayon 45        rayon de recherche des prises de vue en m (défaut 45)
//   --y 4.5           hauteur visée en m (défaut : mi-hauteur de la gouttière)
//   --fov 75          champ horizontal du cadrage en degrés (défaut 75)
//   --largeur 1400    largeur du cadrage en px (défaut 1400)
//   --brut            pas d'égalisation d'histogramme (teinte d'origine)
//   --sd              utiliser le cache SD (plus rapide, moins lisible)
//   --sortie DIR      dossier de sortie (défaut scratchpad ou .vues-panoramax)
//
// Licence : Panoramax IGN, Licence Ouverte 2.0. Usage personnel.
import { mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';
import {
  args, project, chargerMonde, photosProches, batimentsProches, poiProches,
  chercherPoi, vueDegagee, boiteOrientee, aretes, telecharger, CAM_H,
} from './artix-geo.mjs';

const a = args();
const N_VUES = Number(a.n ?? 3);
const RAYON = Number(a.rayon ?? 45);
const FOV = Number(a.fov ?? 75) * Math.PI / 180;
const LARGEUR = Number(a.largeur ?? 1400);
const HAUTEUR = Math.round(LARGEUR * 0.6);
const QUALITE = a.sd ? 'sd' : 'hd';
const SORTIE = a.sortie ?? (process.env.CLAUDE_SCRATCHPAD ?? '.vues-panoramax');

// ---------------------------------------------------------------------------
// Résolution de la cible
// ---------------------------------------------------------------------------
chargerMonde();
let cible = null;
let etiquette = 'lieu';

if (a.xz) {
  const [x, z] = String(a.xz).split(',').map(Number);
  cible = { x, z };
  etiquette = `xz_${Math.round(x)}_${Math.round(z)}`;
} else if (a.latlon) {
  const [lat, lon] = String(a.latlon).split(',').map(Number);
  const [x, z] = project(lat, lon);
  cible = { x, z };
  etiquette = `latlon_${lat}_${lon}`;
} else if (a.poi) {
  const trouves = chercherPoi(String(a.poi));
  if (trouves.length === 0) {
    console.error(`Aucun POI ne correspond à « ${a.poi} ».`);
    process.exit(1);
  }
  if (trouves.length > 1) {
    console.log(`${trouves.length} POI correspondent, le premier est retenu :`);
    for (const p of trouves) console.log(`  ${p.nom} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
  cible = { x: trouves[0].x, z: trouves[0].z };
  etiquette = trouves[0].nom.replace(/[^\w]+/g, '-').toLowerCase();
} else if (a.bat !== undefined) {
  const m = chargerMonde();
  const b = m.batiments[Number(a.bat)];
  if (!b) { console.error(`Bâtiment ${a.bat} inconnu.`); process.exit(1); }
  const bo = boiteOrientee(b.pts);
  cible = { x: bo.cx, z: bo.cz };
  etiquette = `bat-${a.bat}`;
} else {
  console.error('Indiquer la cible : --xz X,Z | --latlon LAT,LON | --poi "nom" | --bat N');
  process.exit(1);
}

// Hauteur visée : le milieu du mur mesuré à la gouttière LiDAR, jamais 45 %
// d'une gouttière basse (sur un commerce de 4,8 m ça cadre les poubelles du
// trottoir). Plancher à 3,2 m : la hauteur d'un bandeau d'enseigne.
const m = chargerMonde();
const batProche = batimentsProches(cible.x, cible.z, 25)[0];
const hCible = batProche
  ? (m.gouttieres.get(batProche.i) ?? Math.min(batProche.h, 9))
  : 6;
const yVise = Number(a.y ?? Math.max(3.2, hCible * 0.55));
const saufI = batProche?.i ?? -1;

// Arêtes du bâtiment cible : une prise de vue n'est bonne que si elle regarde
// l'une d'elles par l'EXTÉRIEUR. Sans ce test, la photo la plus proche peut
// être derrière le bâtiment et ne montrer qu'un mur aveugle.
const aretesCible = batProche ? aretes(batProche) : [];

console.log(`Cible : (${cible.x.toFixed(1)}, ${cible.z.toFixed(1)}) `
  + `hauteur visée ${yVise.toFixed(1)} m`
  + (batProche
    ? `, bâtiment ${batProche.i} à ${batProche.d.toFixed(1)} m `
      + `(gouttière ${hCible.toFixed(1)} m, ${aretesCible.length} arêtes)`
    : ''));

// ---------------------------------------------------------------------------
// Sélection des prises de vue
// ---------------------------------------------------------------------------
// Une bonne vue : ni collée ni lointaine (le piqué s'effondre au-delà de ~30 m
// sur un équirectangulaire), dégagée, de face sur une façade, et pas
// redondante avec une déjà retenue.
const candidats = [];
for (const p of photosProches(cible.x, cible.z, RAYON)) {
  if (p.d < 4) continue;
  // Meilleure incidence sur une arête de la cible : cos de l'angle entre la
  // normale extérieure et la direction arête → caméra. 1 = pile de face.
  let cosMax = 0;
  let areteVue = null;
  for (const ar of aretesCible) {
    const vx = p.x - ar.mx, vz = p.z - ar.mz;
    const d = Math.hypot(vx, vz);
    if (d < 2) continue;
    const cos = (vx * ar.nx + vz * ar.nz) / d;
    if (cos > cosMax) { cosMax = cos; areteVue = ar; }
  }
  // Sous 0,35 (≈ 70° d'incidence) la façade est vue en fuyante : inutile.
  if (aretesCible.length && cosMax < 0.35) continue;
  const score = Math.abs(p.d - 12)
    + (p.d > 30 ? (p.d - 30) * 0.8 : 0)
    + (1 - cosMax) * 14;
  candidats.push({ ...p, score, cosMax, areteVue });
}
candidats.sort((x, y) => x.score - y.score);

const retenues = [];
for (const p of candidats) {
  if (retenues.length >= N_VUES) break;
  // Écarter les prises quasi identiques : sur une séquence, deux clichés
  // consécutifs sont à 2 m l'un de l'autre et montrent la même chose.
  if (retenues.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 8)) continue;
  if (!vueDegagee(p.x, p.z, cible.x, cible.z, saufI)) continue;
  retenues.push(p);
}
// Repli : si le filtre d'incidence a tout écarté (cible en plein champ, sans
// bâtiment, ou façade jamais photographiée de face), reprendre sans lui.
if (retenues.length === 0 && aretesCible.length) {
  console.log('Aucune façade vue de face : repli sur la proximité seule.');
  for (const p of photosProches(cible.x, cible.z, RAYON)) {
    if (retenues.length >= N_VUES) break;
    if (p.d < 4) continue;
    if (retenues.some((r) => Math.hypot(r.x - p.x, r.z - p.z) < 8)) continue;
    if (!vueDegagee(p.x, p.z, cible.x, cible.z, saufI)) continue;
    retenues.push({ ...p, cosMax: 0, areteVue: null });
  }
}
if (retenues.length === 0) {
  console.error(`Aucune prise de vue dégagée dans ${RAYON} m. Élargir avec --rayon.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cadrage : équirectangulaire → projection rectilinéaire centrée sur la cible
// ---------------------------------------------------------------------------
function cadrer(pano, W, H, photo) {
  const sortie = Buffer.alloc(LARGEUR * HAUTEUR * 3);
  const dx = cible.x - photo.x, dz = cible.z - photo.z;
  const horiz = Math.hypot(dx, dz);
  // Gisement et site de la cible, relatifs au cap du panoramique.
  const azRad = photo.az * Math.PI / 180;
  const gisCentre = Math.atan2(dx, -dz) - azRad;
  const siteCentre = Math.atan2(yVise - CAM_H, horiz);
  // Plan image tangent à la sphère dans la direction visée.
  const f = (LARGEUR / 2) / Math.tan(FOV / 2);
  const cosS = Math.cos(siteCentre), sinS = Math.sin(siteCentre);
  for (let py = 0; py < HAUTEUR; py++) {
    const dyp = py - HAUTEUR / 2;
    for (let px = 0; px < LARGEUR; px++) {
      const dxp = px - LARGEUR / 2;
      // Rayon dans le repère caméra (x droite, y bas, z avant), puis
      // basculement du site pour retomber dans le repère du panoramique.
      const rx = dxp, ry = dyp, rz = f;
      const ry2 = ry * cosS - rz * sinS;
      const rz2 = ry * sinS + rz * cosS;
      const norme = Math.hypot(rx, ry2, rz2);
      const site = Math.asin(-ry2 / norme);
      const gis = gisCentre + Math.atan2(rx, rz2);
      const colonne = ((gis / (Math.PI * 2) + 0.5) * W);
      const ligne = (0.5 - site / Math.PI) * H;
      const c0 = Math.floor(colonne);
      const l0 = Math.max(0, Math.min(H - 2, Math.floor(ligne)));
      const fc = colonne - c0, fl = ligne - l0;
      const cA = ((c0 % W) + W) % W, cB = (cA + 1) % W;
      const o = (px + py * LARGEUR) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const v00 = pano[(l0 * W + cA) * 3 + ch], v10 = pano[(l0 * W + cB) * 3 + ch];
        const v01 = pano[((l0 + 1) * W + cA) * 3 + ch], v11 = pano[((l0 + 1) * W + cB) * 3 + ch];
        sortie[o + ch] = (v00 * (1 - fc) + v10 * fc) * (1 - fl)
          + (v01 * (1 - fc) + v11 * fc) * fl;
      }
    }
  }
  return sortie;
}

mkdirSync(SORTIE, { recursive: true });
const ecrits = [];
for (let i = 0; i < retenues.length; i++) {
  const p = retenues[i];
  const chemin = await telecharger(p.id, QUALITE);
  const img = sharp(chemin);
  const meta = await img.metadata();
  const { data } = await img.raw().toBuffer({ resolveWithObject: true });
  const buf = cadrer(data, meta.width, meta.height, p);
  const nom = `${SORTIE}/vue-${etiquette}-${i + 1}.jpg`;
  // Beaucoup de prises Panoramax sont en contre-jour (soleil bas de janvier
  // sur des rues orientées est-ouest) : la façade sort bouchée ou lavée.
  // `normalise` réétale l'histogramme, ce qui rend enseignes et volets
  // lisibles. --brut coupe le traitement quand la teinte exacte est en jeu.
  let pipe = sharp(buf, { raw: { width: LARGEUR, height: HAUTEUR, channels: 3 } });
  // Percentiles serrés : sur une façade à l'ombre sous un ciel blanc de
  // janvier, l'égalisation min-max ne change rien (le ciel occupe déjà le
  // blanc). Étaler le 1er..85e percentile sort la façade de l'ombre, au prix
  // d'un ciel écrêté qui ne porte aucune information utile.
  if (!a.brut) pipe = pipe.normalise({ lower: 1, upper: 85 });
  await pipe.jpeg({ quality: 92 }).toFile(nom);
  // Cap de la prise de vue vers la cible : utile pour recouper avec la
  // normale d'une arête mesurée par artix-mesure.mjs.
  const capVersCible = Math.atan2(cible.x - p.x, cible.z - p.z) * 180 / Math.PI;
  ecrits.push({ nom, d: p.d, id: p.id, date: p.date, cap: capVersCible });
  console.log(`${nom}`);
  console.log(`  à ${p.d.toFixed(1)} m, prise du (${p.x.toFixed(1)}, ${p.z.toFixed(1)}), `
    + `cap vers la cible ${capVersCible.toFixed(0)}°, ${p.date}, ${QUALITE.toUpperCase()}`);
  if (p.areteVue) {
    console.log(`  façade vue : arête ${p.areteVue.k} (${p.areteVue.len.toFixed(1)} m, `
      + `normale ${p.areteVue.capDeg.toFixed(0)}°), incidence `
      + `${(Math.acos(Math.min(1, p.cosMax)) * 180 / Math.PI).toFixed(0)}°`);
  }
  console.log(`  https://panoramax.ign.fr/#focus=pic&pic=${p.id}`);
}

console.log(`\n${ecrits.length} vue(s) écrite(s) dans ${SORTIE}. `
  + `Les lire avec Read pour observer le lieu réel.`);
if (!existsSync('.panoramax-cache-hd')) {
  console.log('Note : cache HD vide, les panoramiques ont été téléchargés.');
}
