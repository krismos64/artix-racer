// Forme réelle des toitures d'Artix, relevée au LiDAR HD de l'IGN.
//
// La BD TOPO donne la hauteur d'un bâtiment, pas la géométrie de sa couverture.
// Jusqu'ici le jeu déduisait le faîtage du grand axe de l'emprise au sol : une
// approximation qui aligne des toits identiques sur des bâtiments qui ne le
// sont pas.
//
// Le LiDAR HD mesure le sursol à 0,5 m. La différence entre le MNS (sommet des
// objets) et le MNT (terrain nu) donne la hauteur du bâti point par point : à
// cette finesse, un toit de 10 m de large est décrit par une vingtaine de
// mesures, assez pour retrouver sa pente, l'orientation de son faîtage et
// distinguer une croupe d'un pignon.
//
// On ne conserve pas la grille (576 Mo pour la zone de jeu) : on échantillonne
// dans l'emprise de chaque bâtiment et on n'en garde qu'une description
// compacte, quelques octets par bâtiment.
import { writeFileSync, readFileSync } from 'node:fs';

const WMS = 'https://data.geopf.fr/wms-r/wms';
const MNS = 'IGNF_LIDAR-HD_MNS_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G';
const MNT = 'IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.WGS84G';

// Emprise du bâti d'Artix, avec une marge.
const S = 43.3788, W = -0.6001, N = 43.4174, E = -0.5457;
// Tuiles de 2048 px : au-delà, le service tronque ou refuse la requête.
const TUILE_PX = 2048;
// 0,5 m/px, la résolution native du LiDAR HD. Demander plus fin n'apporterait
// rien : le service se contenterait de rééchantillonner.
const RES_M = 0.5;

const M_PAR_DEG_LAT = 111320;
const COS_LAT = Math.cos(((S + N) / 2) * Math.PI / 180);
const M_PAR_DEG_LON = M_PAR_DEG_LAT * COS_LAT;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Lecture GeoTIFF ------------------------------------------------------
// Le service renvoie un GeoTIFF non compressé en float32, une bande. Un
// décodeur complet serait superflu : on lit l'IFD pour retrouver les bandes de
// pixels, sans dépendance externe.
function lireGeoTIFF(buf) {
  const d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (d.getUint16(0, true) !== 0x4949) throw new Error('TIFF non little-endian');
  const ifd = d.getUint32(4, true);
  const n = d.getUint16(ifd, true);
  const tags = new Map();
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    tags.set(d.getUint16(e, true), {
      type: d.getUint16(e + 2, true),
      count: d.getUint32(e + 4, true),
      value: d.getUint32(e + 8, true),
    });
  }
  const largeur = tags.get(256).value;
  const hauteur = tags.get(257).value;
  if (tags.get(258).value !== 32) throw new Error('bits par pixel inattendu');

  const listeU32 = (tag) => {
    const t = tags.get(tag);
    if (t.count === 1) return [t.value];
    const out = [];
    for (let k = 0; k < t.count; k++) out.push(d.getUint32(t.value + 4 * k, true));
    return out;
  };
  const offsets = listeU32(273);
  const tailles = listeU32(279);

  const px = new Float32Array(largeur * hauteur);
  let p = 0;
  for (let b = 0; b < offsets.length; b++) {
    const fin = offsets[b] + tailles[b];
    for (let o = offsets[b]; o + 3 < fin && p < px.length; o += 4) {
      px[p++] = d.getFloat32(o, true);
    }
  }
  return { largeur, hauteur, px };
}

async function getMap(couche, s, w, n, e, largeur, hauteur) {
  const url = `${WMS}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
    + `&LAYERS=${couche}&STYLES=`
    + `&CRS=EPSG:4326&BBOX=${s},${w},${n},${e}`
    + `&WIDTH=${largeur}&HEIGHT=${hauteur}&FORMAT=image/geotiff`;
  for (let essai = 1; essai <= 4; essai++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'ArtixRacer/1.0' } });
      if (!res.ok) { await sleep(2000 * essai); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      // Une exception du service arrive en XML, pas en TIFF.
      if (buf.length < 1000 || buf[0] !== 0x49) { await sleep(2000 * essai); continue; }
      return lireGeoTIFF(buf);
    } catch (err) {
      process.stderr.write(`    échec (${err.message})\n`);
      await sleep(2000 * essai);
    }
  }
  return null;
}

// --- Découpage en tuiles --------------------------------------------------
const largeurM = (E - W) * M_PAR_DEG_LON;
const hauteurM = (N - S) * M_PAR_DEG_LAT;
const tuileM = TUILE_PX * RES_M;                    // 1024 m par tuile
const NX = Math.ceil(largeurM / tuileM);
const NY = Math.ceil(hauteurM / tuileM);

process.stderr.write(
  `Zone ${largeurM.toFixed(0)} x ${hauteurM.toFixed(0)} m, `
  + `${NX}x${NY} tuiles de ${tuileM} m à ${RES_M} m/px\n`);

// Grille de hauteur du sursol, en mémoire le temps de l'échantillonnage.
// Stockée en Int16 (centimètres) : 4x moins lourd qu'un Float32, et une
// précision au centimètre dépasse largement le besoin.
const GX = NX * TUILE_PX, GY = NY * TUILE_PX;
process.stderr.write(`Grille ${GX} x ${GY} (${(GX * GY * 2 / 1e6).toFixed(0)} Mo)\n`);
const sursol = new Int16Array(GX * GY).fill(-32768);

for (let j = 0; j < NY; j++) {
  for (let i = 0; i < NX; i++) {
    const w = W + (i * tuileM) / M_PAR_DEG_LON;
    const e = W + ((i + 1) * tuileM) / M_PAR_DEG_LON;
    // Le TIFF a son origine en haut : la tuile j=0 est la plus au NORD.
    const n = N - (j * tuileM) / M_PAR_DEG_LAT;
    const s = N - ((j + 1) * tuileM) / M_PAR_DEG_LAT;

    process.stderr.write(`Tuile ${j * NX + i + 1}/${NX * NY}...`);
    const mns = await getMap(MNS, s, w, n, e, TUILE_PX, TUILE_PX);
    await sleep(300);
    const mnt = await getMap(MNT, s, w, n, e, TUILE_PX, TUILE_PX);
    if (!mns || !mnt) { process.stderr.write(' indisponible\n'); await sleep(300); continue; }

    let bati = 0;
    for (let y = 0; y < TUILE_PX; y++) {
      for (let x = 0; x < TUILE_PX; x++) {
        const v = mns.px[y * TUILE_PX + x] - mnt.px[y * TUILE_PX + x];
        // Hors couverture, le service renvoie des valeurs aberrantes.
        if (!Number.isFinite(v) || v < -5 || v > 200) continue;
        const gx = i * TUILE_PX + x, gy = j * TUILE_PX + y;
        sursol[gy * GX + gx] = Math.round(Math.max(0, v) * 100);
        if (v > 2) bati++;
      }
    }
    process.stderr.write(` ${(100 * bati / (TUILE_PX * TUILE_PX)).toFixed(1)}% de sursol\n`);
    await sleep(300);
  }
}

// --- Échantillonnage par bâtiment ----------------------------------------
const { batiments } = JSON.parse(
  readFileSync(new URL('../public/data/artix-bdtopo.json', import.meta.url), 'utf8'));

// Coordonnées géographiques -> indices de la grille.
const versGrille = (lon, lat) => [
  ((lon - W) * M_PAR_DEG_LON) / RES_M,
  ((N - lat) * M_PAR_DEG_LAT) / RES_M,
];

function pointDansAnneau(x, y, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i], [xj, yj] = anneau[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const toits = [];
let sansMesure = 0;

for (let idx = 0; idx < batiments.length; idx++) {
  const b = batiments[idx];
  const anneau = b.pts.map(([lo, la]) => versGrille(lo, la));

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of anneau) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  // Retrait d'un demi-mètre vers l'intérieur : les pixels du bord mélangent le
  // toit et le sol voisin, et tirent la pente vers le bas.
  const RETRAIT = 1;
  const echantillons = [];
  for (let y = Math.max(0, Math.floor(minY) + RETRAIT); y <= Math.min(GY - 1, Math.ceil(maxY) - RETRAIT); y++) {
    for (let x = Math.max(0, Math.floor(minX) + RETRAIT); x <= Math.min(GX - 1, Math.ceil(maxX) - RETRAIT); x++) {
      const v = sursol[y * GX + x];
      if (v === -32768) continue;
      if (!pointDansAnneau(x + 0.5, y + 0.5, anneau)) continue;
      echantillons.push({ x, y, h: v / 100 });
    }
  }

  // Sous 6 mesures, aucune forme n'est déductible : le bâtiment gardera le
  // rendu par défaut, déduit de son emprise.
  if (echantillons.length < 6) { sansMesure++; continue; }

  const hs = echantillons.map((e) => e.h).sort((a, b) => a - b);
  const q = (p) => hs[Math.min(hs.length - 1, Math.floor(hs.length * p))];
  const hMed = q(0.5);
  let hFaite = q(0.95);   // sommet, robuste aux points aberrants
  const hGout = q(0.15);  // gouttière, à l'abri des pixels de sol résiduels

  // Un arbre qui surplombe le bâtiment est capté par le MNS comme s'il en
  // faisait partie : sur une remise de 2 m, un chêne voisin donnait 14 m de
  // couverture et dressait une flèche absurde au-dessus du toit. Le LiDAR ne
  // distingue pas le feuillage du bâti, mais la médiane, elle, reste sur la
  // toiture tant que l'arbre n'en couvre pas la moitié. Un faîtage qui dépasse
  // trop la médiane est donc une intrusion et non une pente.
  const MARGE_VEGETATION = 2.5;
  if (hFaite > hMed + MARGE_VEGETATION) {
    // On retombe sur un quantile plus bas, encore au-dessus de la médiane pour
    // ne pas raboter les vraies pentes.
    hFaite = Math.min(hFaite, Math.max(hMed + 0.6, q(0.75)));
  }

  // Orientation du faîtage : axe le long duquel la hauteur varie le MOINS.
  // Sur un toit à deux pans, la hauteur est constante le long du faîtage et
  // chute de part et d'autre. On teste 12 directions et on retient celle dont
  // la variance des hauteurs projetées est la plus faible.
  let cx = 0, cy = 0;
  for (const e of echantillons) { cx += e.x; cy += e.y; }
  cx /= echantillons.length; cy /= echantillons.length;

  let meilleurAngle = 0, meilleureVar = Infinity, pireVar = 0;
  for (let k = 0; k < 12; k++) {
    const a = (k * Math.PI) / 12;
    const ux = Math.cos(a), uy = Math.sin(a);
    // Corrélation entre la distance à l'axe et la hauteur : sur un vrai
    // deux-pans elle est forte perpendiculairement au faîtage.
    let sT = 0, sT2 = 0, sTH = 0, sH = 0, n = 0;
    for (const e of echantillons) {
      const t = (e.x - cx) * ux + (e.y - cy) * uy;
      sT += t; sT2 += t * t; sTH += t * e.h; sH += e.h; n++;
    }
    const varT = sT2 / n - (sT / n) ** 2;
    if (varT < 1e-6) continue;
    const pente = (sTH / n - (sT / n) * (sH / n)) / varT;
    const dispersion = Math.abs(pente);
    if (dispersion < meilleureVar) { meilleureVar = dispersion; meilleurAngle = a; }
    if (dispersion > pireVar) pireVar = dispersion;
  }

  // Le faîtage est perpendiculaire à la direction de plus forte pente.
  const azimut = (meilleurAngle * 180) / Math.PI;

  // Classement de la forme :
  //   0 plat  (dénivelé faible sur toute l'emprise)
  //   1 monopente (la hauteur varie linéairement dans une seule direction)
  //   2 deux pans (la hauteur culmine au centre et retombe des deux côtés)
  const denivele = hFaite - hGout;
  let forme;
  if (denivele < 0.8) forme = 0;
  else {
    // Profil en travers du faîtage : on projette les mesures sur l'axe
    // perpendiculaire, on les range en tranches, et on lit la silhouette
    // obtenue. Un deux-pans culmine quelque part au milieu et retombe des deux
    // côtés ; une monopente monte continûment d'un bord à l'autre.
    //
    // Chercher le sommet là où il se trouve, plutôt que de le supposer centré :
    // le faîtage d'une maison béarnaise est rarement au milieu exact de
    // l'emprise, et un test sur des tranches fixes classait en monopente la
    // plupart des vrais deux-pans.
    const ux = Math.cos(meilleurAngle + Math.PI / 2);
    const uy = Math.sin(meilleurAngle + Math.PI / 2);
    let tMin = Infinity, tMax = -Infinity;
    for (const e of echantillons) {
      const t = (e.x - cx) * ux + (e.y - cy) * uy;
      if (t < tMin) tMin = t; if (t > tMax) tMax = t;
    }
    const NT = 9;
    const largeurT = Math.max(1e-6, tMax - tMin);
    const tranches = Array.from({ length: NT }, () => []);
    for (const e of echantillons) {
      const t = (e.x - cx) * ux + (e.y - cy) * uy;
      const k = Math.min(NT - 1, Math.floor(((t - tMin) / largeurT) * NT));
      tranches[k].push(e.h);
    }
    // Hauteur représentative de chaque tranche : le 3e quartile écarte les
    // pixels de sol qui débordent sous l'avant-toit.
    const profil = tranches.map((v) => {
      if (v.length < 2) return null;
      v.sort((a, b) => a - b);
      return v[Math.floor(v.length * 0.75)];
    });
    const valides = profil.filter((v) => v != null);
    if (valides.length < 5) forme = 1;
    else {
      let iMax = -1, vMax = -Infinity;
      for (let k = 0; k < NT; k++) {
        if (profil[k] != null && profil[k] > vMax) { vMax = profil[k]; iMax = k; }
      }
      // Bords réellement mesurés, sans supposer que les extrémités existent.
      let iG = 0; while (iG < NT && profil[iG] == null) iG++;
      let iD = NT - 1; while (iD >= 0 && profil[iD] == null) iD--;
      const chuteG = vMax - profil[iG];
      const chuteD = vMax - profil[iD];
      const seuil = Math.max(0.4, denivele * 0.2);
      // Deux pans : le sommet domine les DEUX bords, et n'est pas lui-même
      // collé à un bord (sinon c'est une pente unique).
      const auMilieu = iMax > iG && iMax < iD;
      forme = (auMilieu && chuteG > seuil && chuteD > seuil) ? 2 : 1;
    }
  }

  // Plafond géométrique : une couverture ne dépasse pas en hauteur ce que sa
  // portée permet. Au-delà de la moitié de la largeur du bâtiment, la pente
  // serait plus raide que 45 degrés des deux côtés, ce qu'on ne trouve pas sur
  // l'habitat béarnais. Ce garde-fou rattrape les intrusions de végétation que
  // le test sur la médiane n'a pas écartées.
  let demiLargeur = 0;
  {
    const ux = Math.cos(meilleurAngle + Math.PI / 2);
    const uy = Math.sin(meilleurAngle + Math.PI / 2);
    let tMin = Infinity, tMax = -Infinity;
    for (const e of echantillons) {
      const t = (e.x - cx) * ux + (e.y - cy) * uy;
      if (t < tMin) tMin = t; if (t > tMax) tMax = t;
    }
    // Les indices de grille sont en pixels de 0,5 m.
    demiLargeur = ((tMax - tMin) / 2) * RES_M;
  }
  const plafond = Math.max(0.5, demiLargeur * 0.9);
  if (hFaite - hGout > plafond) hFaite = hGout + plafond;

  toits.push({
    i: idx,
    f: forme,
    // Hauteurs arrondies au décimètre.
    g: +hGout.toFixed(1),
    s: +hFaite.toFixed(1),
    m: +hMed.toFixed(1),
    // Azimut du faîtage en degrés, arrondi : 12 directions testées, inutile
    // de prétendre à mieux que le degré.
    a: Math.round(azimut),
    n: echantillons.length,
  });
}

writeFileSync(
  new URL('../public/data/artix-toits-lidar.json', import.meta.url),
  JSON.stringify({
    source: 'LiDAR HD IGN (MNS - MNT, 0,5 m), Licence Ouverte 2.0',
    index: 'position dans artix-bdtopo.json',
    champs: 'f forme (0 plat, 1 monopente, 2 deux pans), g gouttière, s faîtage, m médiane (m), a azimut du faîtage (deg), n mesures',
    toits,
  }),
);

const formes = { 0: 0, 1: 0, 2: 0 };
for (const t of toits) formes[t.f]++;
console.log('bâtiments        :', batiments.length);
console.log('toits mesurés    :', toits.length,
  `(${(100 * toits.length / batiments.length).toFixed(1)}%)`);
console.log('sans mesure      :', sansMesure);
console.log('formes           : plat', formes[0], '| monopente', formes[1], '| deux pans', formes[2]);
const den = toits.map((t) => t.s - t.g).sort((a, b) => a - b);
if (den.length) {
  console.log('dénivelé de toit : médiane', den[Math.floor(den.length / 2)].toFixed(1),
    'm | max', den[den.length - 1].toFixed(1), 'm');
}
