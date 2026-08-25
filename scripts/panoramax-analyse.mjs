// Analyse massive des panoramiques Panoramax : pour chaque bâtiment de la
// BD TOPO, relever sur les photos réelles la teinte du mur, la couleur des
// volets et un indice de parement (enduit lisse ou pierre/galets apparents).
//
// Chaque photo est un panoramique équirectangulaire 360° (SD : 2048×1024)
// dont `view:azimuth` donne le cap du centre de l'image. Le gisement
// caméra→bâtiment se convertit donc directement en colonne de pixels, et la
// hauteur du bâtiment (BD TOPO) en fenêtre verticale autour de l'horizon.
// On n'extrait que cette fenêtre : le reste du panoramique ne concerne pas ce
// bâtiment.
//
// Économie de téléchargement : l'inventaire compte 76 000 photos, mais un même
// point de rue décrit tous les bâtiments alentour. Quand une photo déjà
// retenue offre un point de vue presque aussi bon que la meilleure, elle est
// réutilisée : le cache (.panoramax-cache/) reste de l'ordre de quelques
// milliers d'images, et une interruption reprend où elle s'était arrêtée.
//
// Sortie : public/data/artix-panoramax.json, consommé par le rendu.
// Licence des données : Panoramax IGN, Licence Ouverte 2.0.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const ORIGIN = { lat: 43.39743, lon: -0.57224 };
const R = 6378137;
const CACHE = '.panoramax-cache';
const PARALLELE = 6;

// Même projection locale que le jeu (src/three-city/osm.js).
function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * (Math.PI / 180) * R * Math.cos(ORIGIN.lat * Math.PI / 180);
  const z = -(lat - ORIGIN.lat) * (Math.PI / 180) * R;
  return [x, z];
}

// ---------------------------------------------------------------------------
// Chargement des données
// ---------------------------------------------------------------------------
const inventaire = JSON.parse(readFileSync('data/panoramax-inventaire.json', 'utf8'));
const bdtopo = JSON.parse(readFileSync('public/data/artix-bdtopo.json', 'utf8'));

const photos = inventaire.photos
  .filter((p) => p.az !== null)
  .map((p) => {
    const [x, z] = project(p.lat, p.lon);
    return { id: p.id, x, z, az: p.az };
  });

const batiments = bdtopo.batiments.map((b, i) => {
  const pts = b.pts.map(([lon, lat]) => project(lat, lon));
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  return { i, pts, cx, cz, h: b.h ?? 5, leger: b.leger };
});

// Grille spatiale des photos : cellules de 25 m, on ne cherche jamais au-delà.
const CELLULE = 25;
const grille = new Map();
for (const p of photos) {
  const k = `${Math.floor(p.x / CELLULE)},${Math.floor(p.z / CELLULE)}`;
  let liste = grille.get(k);
  if (!liste) grille.set(k, liste = []);
  liste.push(p);
}
function photosProches(x, z, rayon) {
  const resultat = [];
  const r = Math.ceil(rayon / CELLULE);
  const gx = Math.floor(x / CELLULE), gz = Math.floor(z / CELLULE);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      const liste = grille.get(`${gx + i},${gz + j}`);
      if (!liste) continue;
      for (const p of liste) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d <= rayon) resultat.push({ ...p, d });
      }
    }
  }
  return resultat;
}

// Grille des bâtiments, pour tester l'occultation d'une ligne de vue : un
// pignon voisin entre la caméra et la cible fausserait complètement la teinte.
const grilleBati = new Map();
for (const b of batiments) {
  const k = `${Math.floor(b.cx / CELLULE)},${Math.floor(b.cz / CELLULE)}`;
  let liste = grilleBati.get(k);
  if (!liste) grilleBati.set(k, liste = []);
  liste.push(b);
}
function segmentsCroises(x1, z1, x2, z2, a, b) {
  const d1 = (b[0] - a[0]) * (z1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]);
  const d2 = (b[0] - a[0]) * (z2 - a[1]) - (b[1] - a[1]) * (x2 - a[0]);
  const d3 = (x2 - x1) * (a[1] - z1) - (z2 - z1) * (a[0] - x1);
  const d4 = (x2 - x1) * (b[1] - z1) - (z2 - z1) * (b[0] - x1);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
function vueDegagee(px, pz, cible) {
  // Parcourt les cellules le long du trajet et teste chaque arête bâtie.
  const pas = Math.max(1, Math.floor(Math.hypot(cible.cx - px, cible.cz - pz) / CELLULE));
  const vus = new Set();
  for (let s = 0; s <= pas; s++) {
    const t = s / pas;
    const gx = Math.floor((px + (cible.cx - px) * t) / CELLULE);
    const gz = Math.floor((pz + (cible.cz - pz) * t) / CELLULE);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const liste = grilleBati.get(`${gx + i},${gz + j}`);
        if (!liste) continue;
        for (const autre of liste) {
          if (autre.i === cible.i || vus.has(autre.i)) continue;
          vus.add(autre.i);
          for (let k = 0; k < autre.pts.length - 1; k++) {
            if (segmentsCroises(px, pz, cible.cx, cible.cz, autre.pts[k], autre.pts[k + 1])) return false;
          }
        }
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Sélection des points de vue
// ---------------------------------------------------------------------------
// La cible visée est le point du contour le plus proche de la caméra : viser
// le centroïde d'un grand bâtiment ferait regarder au-dessus du toit.
function pointProche(b, px, pz) {
  let mx = b.cx, mz = b.cz, min = Infinity;
  for (let k = 0; k < b.pts.length - 1; k++) {
    const [ax, az] = b.pts[k], [bx, bz] = b.pts[k + 1];
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    let t = l2 < 1e-9 ? 0 : ((px - ax) * dx + (pz - az) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const x = ax + dx * t, z = az + dz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < min) { min = d; mx = x; mz = z; }
  }
  return [mx, mz, Math.sqrt(min)];
}

const retenues = new Map();       // id photo -> liste de {bati, cible}
const vuesParBati = new Map();    // i bâtiment -> nombre de vues retenues
let sansVue = 0;

console.log(`${batiments.length} bâtiments, ${photos.length} photos géoréférencées.`);
console.log('Sélection des points de vue…');

for (const b of batiments) {
  const candidates = photosProches(b.cx, b.cz, 60)
    .map((p) => {
      const [tx, tz, d] = pointProche(b, p.x, p.z);
      return { ...p, tx, tz, dFacade: d };
    })
    // Trop près (< 3,5 m), la façade déborde de la fenêtre ; trop loin, elle
    // se noie dans la rue. La distance idéale est autour de 8-14 m.
    // Jusqu'à 52 m : au-delà de 30 m la mesure perd en finesse mais reste
    // meilleure qu'une teinte de palette. La confiance en tient compte via le
    // poids de pixels, plus faible de loin.
    .filter((p) => p.dFacade >= 3.5 && p.dFacade <= 52)
    .sort((a, b2) => Math.abs(a.dFacade - 11) - Math.abs(b2.dFacade - 11));

  let prises = 0;
  const capsPris = [];
  for (const p of candidates) {
    if (prises >= 2) break;
    // Deux vues du même côté n'apportent rien : on exige 25° d'écart de
    // gisement entre les vues retenues pour un même bâtiment.
    const cap = Math.atan2(p.tx - p.x, -(p.tz - p.z)) * 180 / Math.PI;
    if (capsPris.some((c) => Math.abs(((cap - c + 540) % 360) - 180) < 25 === false && Math.abs(((cap - c + 540) % 360) - 180) > 155)) continue;
    if (!vueDegagee(p.x, p.z, b)) continue;
    // Réutilisation : une photo déjà retenue à moins de 4 m d'écart de la
    // meilleure candidate évite un téléchargement de plus.
    let elue = p;
    if (!retenues.has(p.id)) {
      const dejaProche = candidates.find((c) => retenues.has(c.id) && Math.abs(c.dFacade - p.dFacade) < 4);
      if (dejaProche) elue = dejaProche;
    }
    let liste = retenues.get(elue.id);
    if (!liste) retenues.set(elue.id, liste = []);
    liste.push({ b, photo: elue });
    capsPris.push(cap);
    prises++;
  }
  if (!prises) sansVue++;
}

console.log(`${retenues.size} photos à télécharger, ${batiments.length - sansVue} bâtiments couverts (${sansVue} sans vue).`);

// ---------------------------------------------------------------------------
// Téléchargement (cache disque, reprise gratuite)
// ---------------------------------------------------------------------------
mkdirSync(CACHE, { recursive: true });
async function telecharger(id) {
  const chemin = `${CACHE}/${id}.jpg`;
  if (existsSync(chemin)) return chemin;
  const url = `https://panoramax.ign.fr/api/pictures/${id}/sd.jpg`;
  for (let essai = 0; essai < 4; essai++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      writeFileSync(chemin, buf);
      return chemin;
    } catch (e) {
      if (essai === 3) throw e;
      await new Promise((res) => setTimeout(res, 1000 * 2 ** essai));
    }
  }
}

// ---------------------------------------------------------------------------
// Analyse d'une vue : teinte du mur, volets, parement
// ---------------------------------------------------------------------------
function rgbVersHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > .5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

async function analyserVue(chemin, photo, cible) {
  const cap = Math.atan2(cible.tx - photo.x, -(cible.tz - photo.z)) * 180 / Math.PI;
  const gisement = (cap + 360) % 360;
  const meta = await sharp(chemin).metadata();
  const W = meta.width, H = meta.height;
  // Colonne du gisement : le centre de l'image regarde vers `az`.
  const xCentre = ((((gisement - photo.az + 540) % 360) / 360)) * W;
  const demiLargeur = Math.min(W / 8, Math.max(W / 24,
    Math.atan((10) / cible.dFacade) / Math.PI * W / 2));
  // Fenêtre verticale : du pied (10° sous l'horizon) au sommet du mur.
  const angleHaut = Math.atan(Math.max(2.5, cible.b.h - 2) / cible.dFacade);
  const yHaut = Math.max(0, H / 2 - (angleHaut / Math.PI) * H);
  const yBas = Math.min(H - 1, H / 2 + (10 / 180) * H);
  const haut = Math.round(yHaut), hauteur = Math.max(24, Math.round(yBas - yHaut));

  // Le pano boucle horizontalement : extraction en un ou deux morceaux.
  const gauche = Math.round(xCentre - demiLargeur);
  const largeur = Math.round(demiLargeur * 2);
  const morceaux = [];
  if (gauche < 0) {
    morceaux.push({ left: (gauche + W) % W, width: -gauche });
    morceaux.push({ left: 0, width: largeur + gauche });
  } else if (gauche + largeur > W) {
    morceaux.push({ left: gauche, width: W - gauche });
    morceaux.push({ left: 0, width: gauche + largeur - W });
  } else {
    morceaux.push({ left: gauche, width: largeur });
  }

  const pixels = [];
  for (const m of morceaux) {
    if (m.width < 4) continue;
    const { data, info } = await sharp(chemin)
      .extract({ left: m.left, top: haut, width: m.width, height: hauteur })
      .resize({ width: Math.max(16, Math.round(m.width / 4)), kernel: 'lanczos2' })
      .raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += info.channels) {
      pixels.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (pixels.length < 200) return null;

  // Classement grossier des pixels : ciel, végétation, chaussée, volets, mur.
  const mur = [], volets = [];
  let variance = 0, nVar = 0;
  for (const [r, g, b] of pixels) {
    const [h, s, l] = rgbVersHsl(r, g, b);
    const estCiel = l > .62 && s < .3 && h > 175 && h < 255;
    const estVegetation = s > .18 && h > 65 && h < 165 && l < .6;
    const estChaussee = s < .12 && l < .42;
    if (estCiel || estVegetation) continue;
    const estVolet = s > .28 && l > .12 && l < .62 &&
      ((h >= 335 || h <= 25) || (h >= 75 && h <= 165) || (h >= 195 && h <= 250));
    if (estVolet) { volets.push([r, g, b]); continue; }
    if (!estChaussee) mur.push([r, g, b]);
  }
  if (mur.length < 100) return null;

  // Teinte du mur : médiane par canal, robuste aux ombres portées.
  const mediane = (liste, canal) => {
    const v = liste.map((p) => p[canal]).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };
  const murC = [mediane(mur, 0), mediane(mur, 1), mediane(mur, 2)];

  // Indice de parement : la pierre et le galet apparents ont une variance de
  // luminance locale bien plus forte qu'un enduit lisse.
  for (let i = 4; i < mur.length; i++) {
    const dl = (mur[i][0] + mur[i][1] + mur[i][2]) - (mur[i - 4][0] + mur[i - 4][1] + mur[i - 4][2]);
    variance += Math.abs(dl); nVar++;
  }
  const grain = nVar ? variance / nVar / 3 : 0;

  let voletsC = null;
  if (volets.length > pixels.length * .015 && volets.length > 40) {
    voletsC = [mediane(volets, 0), mediane(volets, 1), mediane(volets, 2)];
  }
  return { murC, voletsC, grain, poids: mur.length };
}

// ---------------------------------------------------------------------------
// Boucle principale
// ---------------------------------------------------------------------------
const parBatiment = new Map();
const entrees = [...retenues.entries()];
let faits = 0, echecs = 0;

async function traiterPhoto([id, cibles]) {
  let chemin;
  try {
    chemin = await telecharger(id);
  } catch {
    echecs++;
    return;
  }
  for (const { b, photo } of cibles) {
    try {
      const vue = await analyserVue(chemin, photo, { ...photo, b, tx: photo.tx, tz: photo.tz, dFacade: photo.dFacade });
      if (!vue) continue;
      let liste = parBatiment.get(b.i);
      if (!liste) parBatiment.set(b.i, liste = []);
      liste.push(vue);
    } catch {
      // Une vue illisible n'empêche pas les autres.
    }
  }
  faits++;
  if (faits % 100 === 0) {
    process.stdout.write(`\r${faits}/${entrees.length} photos analysées (${echecs} échecs)…`);
  }
}

for (let i = 0; i < entrees.length; i += PARALLELE) {
  await Promise.all(entrees.slice(i, i + PARALLELE).map(traiterPhoto));
}

// ---------------------------------------------------------------------------
// Consolidation par bâtiment
// ---------------------------------------------------------------------------
const resultat = [];
for (const [i, vues] of parBatiment) {
  vues.sort((a, b) => b.poids - a.poids);
  const ref = vues[0];
  // Confiance : accord entre les vues (quand il y en a deux) et poids de la
  // vue de référence.
  let q = Math.min(1, ref.poids / 2500);
  if (vues.length > 1) {
    const d = Math.hypot(
      ref.murC[0] - vues[1].murC[0],
      ref.murC[1] - vues[1].murC[1],
      ref.murC[2] - vues[1].murC[2],
    );
    q = Math.max(.1, Math.min(1, q * (1 - d / 380) + .15));
  }
  const entree = {
    i,
    mur: (ref.murC[0] << 16) | (ref.murC[1] << 8) | ref.murC[2],
    q: Math.round(q * 100) / 100,
    grain: Math.round(ref.grain * 10) / 10,
  };
  const voletsVus = vues.filter((v) => v.voletsC);
  if (voletsVus.length) {
    const v = voletsVus[0].voletsC;
    entree.volets = (v[0] << 16) | (v[1] << 8) | v[2];
  }
  resultat.push(entree);
}
resultat.sort((a, b) => a.i - b.i);

writeFileSync('public/data/artix-panoramax.json', JSON.stringify({
  source: 'Panoramax IGN, Licence Ouverte 2.0 — analyse des panoramiques SD par bâtiment BD TOPO',
  index: 'position dans artix-bdtopo.json',
  date: new Date().toISOString().slice(0, 10),
  photosAnalysees: faits,
  facades: resultat,
}));

const avecVolets = resultat.filter((r) => r.volets !== undefined).length;
console.log(`\n${resultat.length} bâtiments caractérisés (${avecVolets} avec volets détectés, ${echecs} photos en échec).`);
console.log('Écrit : public/data/artix-panoramax.json');
