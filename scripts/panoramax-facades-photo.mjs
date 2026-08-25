// Placage photographique des façades du centre-bourg.
//
// Pour chaque bâtiment proche du centre, on choisit l'arête de son emprise la
// mieux photographiée (distance, incidence, ligne de vue dégagée), puis on
// RECTIFIE la portion du panoramique équirectangulaire qui la couvre : chaque
// pixel de la texture de sortie correspond à un point 3D réel du mur
// (interpolation le long de l'arête, hauteur sur la façade), re-projeté dans
// le panoramique par son gisement et son site depuis la caméra. C'est une
// vraie correction de perspective, colonne par colonne : les fuyantes des
// photos deviennent des façades droites.
//
// Les textures sont rangées dans des atlas JPEG (public/textures/) et un
// manifeste (public/data/artix-facades-photo.json) dit au rendu quelle arête
// de quel bâtiment porte quelle case d'atlas.
//
// Licence des données : Panoramax IGN, Licence Ouverte 2.0.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const ORIGIN = { lat: 43.39743, lon: -0.57224 };
const R = 6378137;
const CACHE = '.panoramax-cache';
const RAYON_CENTRE = 320;      // zone traitée autour du centre-bourg
const MAX_FACADES = 128;
const CAM_H = 2.4;             // hauteur de la GoPro au-dessus de la chaussée
const CASE_W = 512, CASE_H = 256;
const ATLAS_GRILLE = 4;        // 4×8 cases de 512×256 dans un atlas 2048×2048
const ATLAS_LIGNES = 8;
const PAR_ATLAS = ATLAS_GRILLE * ATLAS_LIGNES;

function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * (Math.PI / 180) * R * Math.cos(ORIGIN.lat * Math.PI / 180);
  const z = -(lat - ORIGIN.lat) * (Math.PI / 180) * R;
  return [x, z];
}

const inventaire = JSON.parse(readFileSync('data/panoramax-inventaire.json', 'utf8'));
const bdtopo = JSON.parse(readFileSync('public/data/artix-bdtopo.json', 'utf8'));
// Hauteur de gouttière mesurée par LiDAR : c'est elle qui borne le MUR. La
// hauteur BD TOPO va au faîtage : rectifier jusqu'au faîtage remplissait le
// haut des textures de ciel et de toits voisins.
const gouttieres = new Map();
try {
  const lidar = JSON.parse(readFileSync('public/data/artix-toits-lidar.json', 'utf8'));
  for (const t of lidar.toits ?? []) if (t.g) gouttieres.set(t.i, t.g);
} catch { /* facultatif */ }

const photos = inventaire.photos
  .filter((p) => p.az !== null)
  .map((p) => { const [x, z] = project(p.lat, p.lon); return { id: p.id, x, z, az: p.az }; });

const batiments = bdtopo.batiments.map((b, i) => {
  const pts = b.pts.map(([lon, lat]) => project(lat, lon));
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  return { i, pts, cx, cz, h: b.h ?? 5, leger: b.leger === true };
});

const CELLULE = 25;
const grille = new Map();
for (const p of photos) {
  const k = `${Math.floor(p.x / CELLULE)},${Math.floor(p.z / CELLULE)}`;
  (grille.get(k) ?? grille.set(k, []).get(k)).push(p);
}
const grilleBati = new Map();
for (const b of batiments) {
  const k = `${Math.floor(b.cx / CELLULE)},${Math.floor(b.cz / CELLULE)}`;
  (grilleBati.get(k) ?? grilleBati.set(k, []).get(k)).push(b);
}
function photosProches(x, z, rayon) {
  const res = [];
  const r = Math.ceil(rayon / CELLULE);
  const gx = Math.floor(x / CELLULE), gz = Math.floor(z / CELLULE);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      for (const p of grille.get(`${gx + i},${gz + j}`) ?? []) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d <= rayon) res.push({ ...p, d });
      }
    }
  }
  return res;
}
function croises(x1, z1, x2, z2, a, b) {
  const d1 = (b[0] - a[0]) * (z1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]);
  const d2 = (b[0] - a[0]) * (z2 - a[1]) - (b[1] - a[1]) * (x2 - a[0]);
  const d3 = (x2 - x1) * (a[1] - z1) - (z2 - z1) * (a[0] - x1);
  const d4 = (x2 - x1) * (b[1] - z1) - (z2 - z1) * (b[0] - x1);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function vueDegagee(px, pz, mx, mz, saufI) {
  const pas = Math.max(1, Math.floor(Math.hypot(mx - px, mz - pz) / CELLULE));
  const vus = new Set();
  for (let s = 0; s <= pas; s++) {
    const t = s / pas;
    const gx = Math.floor((px + (mx - px) * t) / CELLULE);
    const gz = Math.floor((pz + (mz - pz) * t) / CELLULE);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const autre of grilleBati.get(`${gx + i},${gz + j}`) ?? []) {
          if (autre.i === saufI || vus.has(autre.i)) continue;
          vus.add(autre.i);
          for (let k = 0; k < autre.pts.length - 1; k++) {
            if (croises(px, pz, mx, mz, autre.pts[k], autre.pts[k + 1])) return false;
          }
        }
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sélection : pour chaque bâtiment du centre, la meilleure paire arête/photo.
// ---------------------------------------------------------------------------
const candidats = [];
for (const b of batiments) {
  if (b.leger || b.h < 2.6) continue;
  const dCentre = Math.hypot(b.cx, b.cz);
  if (dCentre > RAYON_CENTRE) continue;
  let meilleur = null;
  const n = b.pts.length - 1;
  for (let k = 0; k < n; k++) {
    const [ax, az] = b.pts[k], [bx, bz] = b.pts[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 4 || len > 40) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    // Normale extérieure de l'arête (celle qui s'éloigne du centroïde).
    let nx = (bz - az) / len, nz = -(bx - ax) / len;
    if (nx * (b.cx - mx) + nz * (b.cz - mz) > 0) { nx = -nx; nz = -nz; }
    for (const p of photosProches(mx, mz, 26)) {
      // La caméra doit être DEVANT la façade, sous incidence < 60°.
      const vx = p.x - mx, vz = p.z - mz;
      const dist = Math.hypot(vx, vz);
      if (dist < 4 || dist > 26) continue;
      const cosI = (vx * nx + vz * nz) / dist;
      if (cosI < 0.5) continue;
      // La façade entière doit tenir sans distorsion extrême : l'angle sous
      // lequel on la voit ne doit pas approcher 180°.
      const ang1 = Math.atan2(ax - p.x, -(az - p.z));
      const ang2 = Math.atan2(bx - p.x, -(bz - p.z));
      let ecart = Math.abs(ang1 - ang2);
      if (ecart > Math.PI) ecart = 2 * Math.PI - ecart;
      if (ecart > 2.4) continue;
      const score = Math.abs(dist - 9) + (1 - cosI) * 12 + (len < 6 ? 3 : 0);
      if (meilleur && score >= meilleur.score) continue;
      if (!vueDegagee(p.x, p.z, mx, mz, b.i)) continue;
      meilleur = { score, k, photo: p, len, dist, cosI };
    }
  }
  if (meilleur) candidats.push({ b, ...meilleur, dCentre });
}
// Les mieux notés d'abord, puis les plus centraux : le budget d'atlas va aux
// façades qu'on longe le plus souvent.
candidats.sort((a, c) => (a.dCentre + a.score * 14) - (c.dCentre + c.score * 14));
candidats.length = Math.min(candidats.length, MAX_FACADES);
console.log(`${candidats.length} façades retenues pour le placage photo.`);

// ---------------------------------------------------------------------------
// Téléchargement et rectification
// ---------------------------------------------------------------------------
mkdirSync(CACHE, { recursive: true });
mkdirSync('public/textures', { recursive: true });
async function telecharger(id) {
  const chemin = `${CACHE}/${id}.jpg`;
  if (existsSync(chemin)) return chemin;
  const url = `https://panoramax.ign.fr/api/pictures/${id}/sd.jpg`;
  for (let essai = 0; essai < 4; essai++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      writeFileSync(chemin, Buffer.from(await r.arrayBuffer()));
      return chemin;
    } catch (e) {
      if (essai === 3) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** essai));
    }
  }
}

// Rectifie une façade : retourne un Buffer RGB CASE_W×CASE_H.
function rectifier(pano, W, H, photo, A, B, hMur) {
  const sortie = Buffer.alloc(CASE_W * CASE_H * 3);
  const azRad = photo.az * Math.PI / 180;
  for (let px = 0; px < CASE_W; px++) {
    const t = px / (CASE_W - 1);
    const wx = A[0] + (B[0] - A[0]) * t;
    const wz = A[1] + (B[1] - A[1]) * t;
    const dx = wx - photo.x, dz = wz - photo.z;
    const horiz = Math.hypot(dx, dz);
    // Gisement du point visé, relatif au cap du panoramique.
    let gis = Math.atan2(dx, -dz) - azRad;
    gis = ((gis + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const colonne = (gis / (Math.PI * 2) + 0.5) * W;
    for (let py = 0; py < CASE_H; py++) {
      // v=0 en haut de la case = sommet du mur.
      const y = hMur * (1 - py / (CASE_H - 1));
      const site = Math.atan2(y - CAM_H, horiz);
      const ligne = (0.5 - site / Math.PI) * H;
      // Échantillonnage bilinéaire, avec bouclage horizontal du panoramique.
      const c0 = Math.floor(colonne), l0 = Math.max(0, Math.min(H - 2, Math.floor(ligne)));
      const fc = colonne - c0, fl = ligne - l0;
      const cA = ((c0 % W) + W) % W, cB = (cA + 1) % W;
      const o = (px + py * CASE_W) * 3;
      for (let ch = 0; ch < 3; ch++) {
        const v00 = pano[(l0 * W + cA) * 3 + ch], v10 = pano[(l0 * W + cB) * 3 + ch];
        const v01 = pano[((l0 + 1) * W + cA) * 3 + ch], v11 = pano[((l0 + 1) * W + cB) * 3 + ch];
        sortie[o + ch] = (v00 * (1 - fc) + v10 * fc) * (1 - fl)
          + (v01 * (1 - fc) + v11 * fc) * fl;
      }
    }
  }
  // Fondu du pied de façade vers la teinte du haut du mur : les voitures
  // garées et poubelles photographiées devant le rez-de-chaussée se
  // projetteraient sinon sur le bas du mur.
  const yFondu = Math.min(CASE_H - 1, Math.round((1 - 1.15 / hMur) * CASE_H));
  const ref = [0, 0, 0];
  let nRef = 0;
  const yRef = Math.max(2, Math.round((1 - Math.min(hMur - 0.4, 2.2) / hMur) * CASE_H));
  for (let px = 0; px < CASE_W; px += 3) {
    const o = (px + yRef * CASE_W) * 3;
    ref[0] += sortie[o]; ref[1] += sortie[o + 1]; ref[2] += sortie[o + 2];
    nRef++;
  }
  for (let ch = 0; ch < 3; ch++) ref[ch] /= nRef;
  for (let py = yFondu; py < CASE_H; py++) {
    const f = Math.min(1, (py - yFondu) / (CASE_H - yFondu) * 1.6);
    for (let px = 0; px < CASE_W; px++) {
      const o = (px + py * CASE_W) * 3;
      for (let ch = 0; ch < 3; ch++) {
        sortie[o + ch] = sortie[o + ch] * (1 - f) + ref[ch] * f;
      }
    }
  }
  // Normalisation douce d'exposition : les prises de janvier alternent plein
  // soleil et ombre ; sans recalage, les façades voisines juraient.
  let lum = 0;
  for (let i = 0; i < sortie.length; i += 33) lum += sortie[i] * 0.299 + sortie[i + 1] * 0.587 + sortie[i + 2] * 0.114;
  lum /= Math.floor(sortie.length / 33);
  const gain = Math.max(0.8, Math.min(1.45, 148 / Math.max(20, lum)));
  if (Math.abs(gain - 1) > 0.03) {
    for (let i = 0; i < sortie.length; i++) sortie[i] = Math.min(255, sortie[i] * gain);
  }
  return sortie;
}

const nAtlas = Math.ceil(candidats.length / PAR_ATLAS);
const atlas = Array.from({ length: nAtlas }, () =>
  Buffer.alloc(CASE_W * ATLAS_GRILLE * CASE_H * ATLAS_LIGNES * 3, 40));
const manifeste = [];
let faits = 0, rates = 0;

for (let idx = 0; idx < candidats.length; idx++) {
  const { b, k, photo, len } = candidats[idx];
  try {
    const chemin = await telecharger(photo.id);
    const { data, info } = await sharp(chemin).raw().toBuffer({ resolveWithObject: true });
    const A = b.pts[k], B = b.pts[k + 1];
    const hMur = Math.max(2.6, Math.min(gouttieres.get(b.i) ?? b.h * 0.78, b.h));
    const casePx = rectifier(data, info.width, info.height, photo, A, B, hMur);
    // Contrôle qualité : si la moitié haute de la case est du ciel (clair,
    // bleuté, homogène), la façade réelle est en retrait de son emprise
    // cadastrale ou masquée : on écarte la case plutôt que de plaquer du ciel.
    let pixelsCiel = 0, testes = 0;
    for (let py = 2; py < CASE_H * 0.45; py += 4) {
      for (let px2 = 0; px2 < CASE_W; px2 += 8) {
        const o = (px2 + py * CASE_W) * 3;
        const r2 = casePx[o], g2 = casePx[o + 1], b2 = casePx[o + 2];
        if (b2 > 150 && b2 >= r2 - 8 && g2 > 120 && Math.abs(g2 - b2) < 60 && r2 + g2 + b2 > 380) pixelsCiel++;
        testes++;
      }
    }
    if (pixelsCiel / testes > 0.3) { rates++; continue; }
    // Même rejet pour la végétation : une haie ou un arbre devant la façade
    // plaquerait du feuillage sur le mur.
    let pixelsVegetation = 0;
    for (let py = 2; py < CASE_H * 0.8; py += 4) {
      for (let px2 = 0; px2 < CASE_W; px2 += 8) {
        const o = (px2 + py * CASE_W) * 3;
        const r2 = casePx[o], g2 = casePx[o + 1], b2 = casePx[o + 2];
        if (g2 > r2 + 12 && g2 > b2 + 8) pixelsVegetation++;
      }
    }
    if (pixelsVegetation / testes > 0.42) { rates++; continue; }
    const na = Math.floor(faits / PAR_ATLAS);
    const pos = faits % PAR_ATLAS;
    const gx = pos % ATLAS_GRILLE, gy = Math.floor(pos / ATLAS_GRILLE);
    const largeurAtlas = CASE_W * ATLAS_GRILLE;
    for (let py = 0; py < CASE_H; py++) {
      casePx.copy(atlas[na],
        ((gy * CASE_H + py) * largeurAtlas + gx * CASE_W) * 3,
        py * CASE_W * 3, (py + 1) * CASE_W * 3);
    }
    manifeste.push({
      i: b.i, k, a: na,
      // Fenêtre UV de la case dans l'atlas, avec une marge d'un demi-texel
      // contre les fuites de filtrage entre cases voisines.
      u0: (gx * CASE_W + 1) / largeurAtlas,
      v0: (gy * CASE_H + 1) / (CASE_H * ATLAS_LIGNES),
      u1: ((gx + 1) * CASE_W - 1) / largeurAtlas,
      v1: ((gy + 1) * CASE_H - 1) / (CASE_H * ATLAS_LIGNES),
    });
    faits++;
    if (faits % 20 === 0) process.stdout.write(`\r${faits}/${candidats.length} façades rectifiées…`);
  } catch {
    rates++;
  }
}

const atlasUtiles = Math.max(1, Math.ceil(faits / PAR_ATLAS));
for (let na = 0; na < atlasUtiles; na++) {
  await sharp(atlas[na], {
    raw: { width: CASE_W * ATLAS_GRILLE, height: CASE_H * ATLAS_LIGNES, channels: 3 },
  }).jpeg({ quality: 82 }).toFile(`public/textures/facades-atlas-${na}.jpg`);
}
writeFileSync('public/data/artix-facades-photo.json', JSON.stringify({
  source: 'Panoramax IGN, Licence Ouverte 2.0 — façades rectifiées depuis les panoramiques',
  index: 'i : position dans artix-bdtopo.json ; k : arête du contour ; a : numéro d’atlas',
  atlas: atlasUtiles,
  facades: manifeste,
}));
console.log(`\n${faits} façades plaquées dans ${nAtlas} atlas (${rates} échecs).`);
console.log('Écrit : public/textures/facades-atlas-*.jpg + public/data/artix-facades-photo.json');
