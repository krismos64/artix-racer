// Relevé des poteaux réels d'Artix (électricité, télécom) sur les
// panoramiques Panoramax.
//
// Aucune base publique ne cartographie les supports aériens de la commune.
// Or un poteau se voit très bien dans un panoramique : un bâtonnet vertical
// sombre, étroit et régulier, qui se détache du ciel au-dessus de l'horizon.
// Et comme les séquences photographient la même rue tous les cinq mètres, un
// même poteau est vu sous plusieurs gisements depuis des points connus : deux
// rayons suffisent à TRIANGULER sa position au sol.
//
// La détection reste volontairement stricte : mieux vaut manquer un poteau
// (le lotissement en garde d'autres) que planter un faux au milieu du champ.
// Les troncs d'arbres, seuls concurrents sérieux en janvier (arbres nus),
// sont écartés par leur silhouette : un tronc s'élargit en branches au
// sommet, un poteau reste un trait de largeur constante.
//
// Sortie : public/data/artix-poteaux.json. Licence : Panoramax IGN, LO 2.0.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const ORIGIN = { lat: 43.39743, lon: -0.57224 };
const R = 6378137;
const CACHE = '.panoramax-cache';

function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * (Math.PI / 180) * R * Math.cos(ORIGIN.lat * Math.PI / 180);
  const z = -(lat - ORIGIN.lat) * (Math.PI / 180) * R;
  return [x, z];
}

const inventaire = JSON.parse(readFileSync('data/panoramax-inventaire.json', 'utf8'));
const osm = JSON.parse(readFileSync('public/data/artix-osm.json', 'utf8'));

const photos = inventaire.photos
  .filter((p) => p.az !== null)
  .map((p) => { const [x, z] = project(p.lat, p.lon); return { id: p.id, x, z, az: p.az }; });

// Voies carrossables : les poteaux longent les rues, et l'échantillonnage des
// photos suit le réseau.
const KINDS = new Set(['primary', 'secondary', 'tertiary', 'residential',
  'unclassified', 'living_street', 'service']);
const routes = [];
const arbres = [];
for (const el of osm.elements ?? []) {
  const t = el.tags ?? {};
  if (el.type === 'way' && KINDS.has(t.highway) && el.geometry) {
    routes.push(el.geometry.map((g) => project(g.lat, g.lon)));
  }
  if (el.type === 'node' && t.natural === 'tree') {
    const [x, z] = project(el.lat, el.lon);
    arbres.push([x, z]);
  }
}
try {
  const poi = JSON.parse(readFileSync('public/data/artix-poi.json', 'utf8'));
  for (const el of poi.poi ?? []) {
    if (el.type === 'node' && el.tags?.natural === 'tree') {
      const [x, z] = project(el.lat, el.lon);
      arbres.push([x, z]);
    }
  }
} catch { /* facultatif */ }
console.log(`${photos.length} photos, ${routes.length} voies, ${arbres.length} arbres cartographiés.`);

// ---------------------------------------------------------------------------
// Échantillonnage : une photo tous les ~18 m le long du réseau.
// ---------------------------------------------------------------------------
const CEL = 18;
const cellulesPrises = new Set();
const echantillon = [];
// Grille des voies : une photo n'est retenue que si elle est sur une voie.
const grilleVoies = new Set();
for (const pts of routes) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    for (let d = 0; d <= len; d += 6) {
      const t = len ? d / len : 0;
      grilleVoies.add(`${Math.round((x1 + (x2 - x1) * t) / 8)},${Math.round((z1 + (z2 - z1) * t) / 8)}`);
    }
  }
}
for (const p of photos) {
  if (Math.hypot(p.x, p.z) > 1150) continue;
  if (!grilleVoies.has(`${Math.round(p.x / 8)},${Math.round(p.z / 8)}`)) continue;
  const k = `${Math.floor(p.x / CEL)},${Math.floor(p.z / CEL)}`;
  if (cellulesPrises.has(k)) continue;
  cellulesPrises.add(k);
  echantillon.push(p);
}
console.log(`${echantillon.length} photos échantillonnées le long du réseau.`);

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
      await new Promise((res) => setTimeout(res, 900 * 2 ** essai));
    }
  }
}

// ---------------------------------------------------------------------------
// Détection des bâtonnets verticaux sombres contre le ciel.
// ---------------------------------------------------------------------------
// Bandes angulaires, en degrés de site au-dessus de l'horizon : le fût est
// cherché entre +7 et +20°, le test de silhouette (élargissement = arbre)
// entre +21 et +28°.
const FUT_BAS = 7, FUT_HAUT = 20, CIME_BAS = 21, CIME_HAUT = 28;

function detecterBatonnets(data, W, H) {
  const ligne = (site) => Math.round(H / 2 - (site / 180) * H);
  const lum = (c, l) => {
    const o = (l * W + c) * 3;
    return data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
  };
  // Luminance de ciel par secteur de 64 colonnes, prise haut dans l'image.
  const secteurs = Math.ceil(W / 64);
  const ciel = new Float32Array(secteurs);
  for (let sct = 0; sct < secteurs; sct++) {
    const vals = [];
    for (let c = sct * 64; c < Math.min(W, (sct + 1) * 64); c += 6) {
      for (let site = 30; site <= 44; site += 4) vals.push(lum(c, ligne(site)));
    }
    vals.sort((a, b) => a - b);
    ciel[sct] = vals[Math.floor(vals.length / 2)] ?? 200;
  }

  // Part de pixels sombres par colonne dans la bande du fût.
  const l0 = ligne(FUT_HAUT), l1 = ligne(FUT_BAS);
  const sombreFut = new Float32Array(W);
  const sombreCime = new Float32Array(W);
  const c0 = ligne(CIME_HAUT), c1 = ligne(CIME_BAS);
  for (let c = 0; c < W; c += 1) {
    const seuil = ciel[Math.floor(c / 64)] * 0.62;
    if (ciel[Math.floor(c / 64)] < 90) { sombreFut[c] = 0; continue; }  // ciel bouché par du bâti
    let n = 0, sombres = 0;
    for (let l = l0; l <= l1; l += 2) { n++; if (lum(c, l) < seuil) sombres++; }
    sombreFut[c] = n ? sombres / n : 0;
    n = 0; sombres = 0;
    for (let l = c0; l <= c1; l += 2) { n++; if (lum(c, l) < seuil) sombres++; }
    sombreCime[c] = n ? sombres / n : 0;
  }

  // Groupement des colonnes en bâtonnets.
  const batonnets = [];
  let debut = -1;
  const degParColonne = 360 / W;
  for (let c = 0; c <= W; c++) {
    const actif = c < W && sombreFut[c] > 0.82;
    if (actif && debut < 0) debut = c;
    if (!actif && debut >= 0) {
      const largeur = (c - debut) * degParColonne;
      // Un poteau à 3-15 m fait 0,1 à 0,5° de large ; on tolère jusqu'à 2,2°
      // (poteau très proche). Plus large : mur, tronc épais, véhicule.
      if (largeur >= 0.15 && largeur <= 2.2) {
        const centre = (debut + c - 1) / 2;
        // Silhouette : au-dessus du fût, un poteau reste étroit. On mesure la
        // part sombre sur une fenêtre trois fois plus large que le bâtonnet :
        // un arbre y étale ses branches, un poteau n'y met presque rien.
        const demiFenetre = Math.max(4, Math.round((c - debut) * 1.5));
        let sombreLarge = 0, nLarge = 0;
        for (let cc = Math.max(0, Math.round(centre) - demiFenetre);
          cc <= Math.min(W - 1, Math.round(centre) + demiFenetre); cc++) {
          sombreLarge += sombreCime[cc]; nLarge++;
        }
        if (nLarge && sombreLarge / nLarge < 0.38) {
          batonnets.push({ colonne: centre, largeur });
        }
      }
      debut = -1;
    }
  }
  return batonnets;
}

// ---------------------------------------------------------------------------
// Passe photo : collecte des rayons (position caméra + gisement du bâtonnet).
// ---------------------------------------------------------------------------
const rayons = [];
let faites = 0;
const PARALLELE = 5;
async function traiter(p) {
  try {
    const chemin = await telecharger(p.id);
    const { data, info } = await sharp(chemin).raw().toBuffer({ resolveWithObject: true });
    for (const b of detecterBatonnets(data, info.width, info.height)) {
      const gisement = ((b.colonne / info.width) * 360 - 180 + p.az + 360) % 360;
      rayons.push({ x: p.x, z: p.z, g: gisement * Math.PI / 180, largeur: b.largeur });
    }
  } catch { /* photo illisible */ }
  faites++;
  if (faites % 100 === 0) process.stdout.write(`\r${faites}/${echantillon.length} photos, ${rayons.length} rayons…`);
}
for (let i = 0; i < echantillon.length; i += PARALLELE) {
  await Promise.all(echantillon.slice(i, i + PARALLELE).map(traiter));
}
console.log(`\n${rayons.length} rayons collectés.`);

// ---------------------------------------------------------------------------
// Triangulation : intersections de rayons voisins, puis regroupement.
// ---------------------------------------------------------------------------
const grilleRayons = new Map();
rayons.forEach((r, i) => {
  const k = `${Math.floor(r.x / 20)},${Math.floor(r.z / 20)}`;
  (grilleRayons.get(k) ?? grilleRayons.set(k, []).get(k)).push(i);
});
const intersections = [];
for (let i = 0; i < rayons.length; i++) {
  const a = rayons[i];
  const gx = Math.floor(a.x / 20), gz = Math.floor(a.z / 20);
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      for (const j of grilleRayons.get(`${gx + ox},${gz + oz}`) ?? []) {
        if (j <= i) continue;
        const b = rayons[j];
        const dCam = Math.hypot(b.x - a.x, b.z - a.z);
        // Deux prises de vue distinctes de la même séquence : assez écartées
        // pour trianguler, assez proches pour viser le même objet.
        if (dCam < 3.5 || dCam > 26) continue;
        // Directions des rayons (gisement : 0 = nord = -z, est = +x).
        const ax = Math.sin(a.g), az2 = -Math.cos(a.g);
        const bx2 = Math.sin(b.g), bz2 = -Math.cos(b.g);
        const det = ax * bz2 - az2 * bx2;
        if (Math.abs(det) < 0.06) continue;   // rayons quasi parallèles
        const t = ((b.x - a.x) * bz2 - (b.z - a.z) * bx2) / det;
        const u = ((b.x - a.x) * az2 - (b.z - a.z) * ax) / det;
        if (t < 2 || t > 16 || u < 2 || u > 16) continue;
        intersections.push([a.x + ax * t, a.z + az2 * t]);
      }
    }
  }
}
console.log(`${intersections.length} intersections plausibles.`);

// Regroupement : un poteau confirmé est un amas d'au moins 3 intersections
// dans un rayon d'un mètre et demi.
const grilleInt = new Map();
for (const [x, z] of intersections) {
  const k = `${Math.round(x / 1.5)},${Math.round(z / 1.5)}`;
  const e = grilleInt.get(k) ?? { sx: 0, sz: 0, n: 0 };
  e.sx += x; e.sz += z; e.n++;
  grilleInt.set(k, e);
}
let candidats = [];
for (const e of grilleInt.values()) {
  if (e.n >= 3) candidats.push({ x: e.sx / e.n, z: e.sz / e.n, n: e.n });
}
// Fusion des amas voisins (le même poteau peut chevaucher deux cellules).
candidats.sort((a, b) => b.n - a.n);
const retenus = [];
for (const c of candidats) {
  if (retenus.some((r) => Math.hypot(r.x - c.x, r.z - c.z) < 3.5)) continue;
  // Un arbre cartographié au même endroit : c'est lui qu'on a vu.
  if (arbres.some(([ax, az]) => Math.hypot(ax - c.x, az - c.z) < 3)) continue;
  retenus.push(c);
}
console.log(`${retenus.length} poteaux confirmés.`);

writeFileSync('public/data/artix-poteaux.json', JSON.stringify({
  source: 'Panoramax IGN, Licence Ouverte 2.0 — poteaux triangulés depuis les panoramiques',
  date: new Date().toISOString().slice(0, 10),
  photosAnalysees: echantillon.length,
  poteaux: retenus.map((r) => ({
    x: Math.round(r.x * 10) / 10,
    z: Math.round(r.z * 10) / 10,
    n: r.n,
  })),
}));
console.log('Écrit : public/data/artix-poteaux.json');
