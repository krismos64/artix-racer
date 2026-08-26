// Briques communes aux outils d'inspection d'Artix : projection, chargement
// des sources, index spatiaux, visibilité, téléchargement Panoramax.
//
// Extrait de panoramax-centre.mjs pour que panoramax-vue.mjs et
// artix-mesure.mjs partagent EXACTEMENT la même géométrie que le placage
// photo : une mesure faite ici est directement reportable dans landmarks.js.
//
// Licence des données : Panoramax IGN et BD TOPO, Licence Ouverte 2.0.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export const ORIGIN = { lat: 43.39743, lon: -0.57224 };
const R = 6378137;
export const CACHE_HD = '.panoramax-cache-hd';
export const CACHE_SD = '.panoramax-cache';
// Hauteur de la GoPro au-dessus de la chaussée sur les prises Panoramax.
export const CAM_H = 2.4;

// Repère du jeu : main droite, Z croît vers le SUD (hérité de Three.js).
export function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * (Math.PI / 180) * R * Math.cos(ORIGIN.lat * Math.PI / 180);
  const z = -(lat - ORIGIN.lat) * (Math.PI / 180) * R;
  return [x, z];
}

// Inverse : pour construire une BBOX WMS autour d'un point du jeu.
export function unproject(x, z) {
  const lon = ORIGIN.lon + x / (R * Math.cos(ORIGIN.lat * Math.PI / 180)) * (180 / Math.PI);
  const lat = ORIGIN.lat - z / R * (180 / Math.PI);
  return [lat, lon];
}

const CELLULE = 25;
function indexer(objets, cle) {
  const grille = new Map();
  for (const o of objets) {
    const [x, z] = cle(o);
    const k = `${Math.floor(x / CELLULE)},${Math.floor(z / CELLULE)}`;
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(o);
  }
  return grille;
}
function autour(grille, x, z, rayon, cle) {
  const res = [];
  const r = Math.ceil(rayon / CELLULE);
  const gx = Math.floor(x / CELLULE), gz = Math.floor(z / CELLULE);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      for (const o of grille.get(`${gx + i},${gz + j}`) ?? []) {
        const [ox, oz] = cle(o);
        const d = Math.hypot(ox - x, oz - z);
        if (d <= rayon) res.push({ ...o, d });
      }
    }
  }
  return res.sort((a, b) => a.d - b.d);
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

let _monde = null;

// Charge inventaire photo, BD TOPO, gouttières LiDAR et POI une seule fois.
export function chargerMonde() {
  if (_monde) return _monde;

  const inventaire = JSON.parse(readFileSync('data/panoramax-inventaire.json', 'utf8'));
  const photos = inventaire.photos
    .filter((p) => p.az !== null)
    .map((p) => {
      const [x, z] = project(p.lat, p.lon);
      return { id: p.id, x, z, az: p.az, date: p.date, seq: p.seq };
    });

  const bdtopo = JSON.parse(readFileSync('public/data/artix-bdtopo.json', 'utf8'));
  const batiments = bdtopo.batiments.map((b, i) => {
    const pts = b.pts.map(([lon, lat]) => project(lat, lon));
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    cx /= pts.length; cz /= pts.length;
    return { i, pts, cx, cz, h: b.h ?? 5, leger: b.leger === true, mat: b.mat, usage: b.usage };
  });

  // La hauteur BD TOPO va au FAÎTAGE ; le mur s'arrête à la gouttière LiDAR.
  const gouttieres = new Map();
  try {
    const lidar = JSON.parse(readFileSync('public/data/artix-toits-lidar.json', 'utf8'));
    for (const t of lidar.toits ?? []) if (t.g) gouttieres.set(t.i, t.g);
  } catch { /* facultatif */ }

  // Piège connu : les POI sont sous la clé `poi`, jamais `elements`.
  let poi = [];
  try {
    const src = JSON.parse(readFileSync('public/data/artix-poi.json', 'utf8'));
    poi = (src.poi ?? []).map((p) => {
      const lat = p.lat ?? p.center?.lat;
      const lon = p.lon ?? p.center?.lon;
      if (lat == null || lon == null) return null;
      const [x, z] = project(lat, lon);
      return { x, z, lat, lon, tags: p.tags ?? {}, nom: p.tags?.name ?? null, type: p.type };
    }).filter(Boolean);
  } catch { /* facultatif */ }

  _monde = {
    photos, batiments, gouttieres, poi,
    grillePhotos: indexer(photos, (p) => [p.x, p.z]),
    grilleBati: indexer(batiments, (b) => [b.cx, b.cz]),
    grillePoi: indexer(poi, (p) => [p.x, p.z]),
  };
  return _monde;
}

export function photosProches(x, z, rayon) {
  const m = chargerMonde();
  return autour(m.grillePhotos, x, z, rayon, (p) => [p.x, p.z]);
}
export function batimentsProches(x, z, rayon) {
  const m = chargerMonde();
  return autour(m.grilleBati, x, z, rayon, (b) => [b.cx, b.cz]);
}
export function poiProches(x, z, rayon) {
  const m = chargerMonde();
  return autour(m.grillePoi, x, z, rayon, (p) => [p.x, p.z]);
}

// Recherche un POI par nom (insensible aux accents et à la casse).
export function chercherPoi(motif) {
  const m = chargerMonde();
  const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const cible = norm(motif);
  return m.poi.filter((p) => p.nom && norm(p.nom).includes(cible));
}

// Voies carrossables OSM (segments en coordonnées du jeu, avec leur type).
// Sert à distinguer une façade SUR RUE d'une façade sur desserte de parking :
// les prises Panoramax roulent aussi dans les dessertes, les compter comme
// « rue » a déjà fait poser une devanture côté parking (immeuble 1126).
let _voies = null;
export function chargerVoies() {
  if (_voies) return _voies;
  _voies = [];
  try {
    const osm = JSON.parse(readFileSync('public/data/artix-osm.json', 'utf8'));
    const vraies = new Set(['primary', 'secondary', 'tertiary', 'unclassified',
      'residential', 'living_street', 'pedestrian']);
    for (const e of osm.elements ?? []) {
      const hw = e.tags?.highway;
      if (!hw || !e.geometry || !(vraies.has(hw) || hw === 'service')) continue;
      const pts = e.geometry.map((g) => project(g.lat, g.lon));
      for (let i = 0; i < pts.length - 1; i++) {
        _voies.push({ a: pts[i], b: pts[i + 1], kind: hw, nom: e.tags?.name ?? null, vraie: vraies.has(hw) });
      }
    }
  } catch { /* facultatif */ }
  return _voies;
}

function distSegment(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

// Voie la plus proche d'un point : { d, kind, nom, vraie } ou null.
export function voieProche(x, z, rayon = 20) {
  let res = null;
  for (const v of chargerVoies()) {
    // Écrémage grossier avant la distance exacte.
    if (Math.min(Math.abs(v.a[0] - x), Math.abs(v.b[0] - x)) > rayon + 40) continue;
    const d = distSegment(x, z, v.a, v.b);
    if (d <= rayon && (!res || d < res.d)) res = { d, kind: v.kind, nom: v.nom, vraie: v.vraie };
  }
  return res;
}

// ---------------------------------------------------------------------------
// Géométrie
// ---------------------------------------------------------------------------

function croises(x1, z1, x2, z2, a, b) {
  const d1 = (b[0] - a[0]) * (z1 - a[1]) - (b[1] - a[1]) * (x1 - a[0]);
  const d2 = (b[0] - a[0]) * (z2 - a[1]) - (b[1] - a[1]) * (x2 - a[0]);
  const d3 = (x2 - x1) * (a[1] - z1) - (z2 - z1) * (a[0] - x1);
  const d4 = (x2 - x1) * (b[1] - z1) - (z2 - z1) * (b[0] - x1);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Vrai si aucun bâtiment (hors `saufI`) ne coupe le segment caméra → cible.
export function vueDegagee(px, pz, mx, mz, saufI) {
  const m = chargerMonde();
  const pas = Math.max(1, Math.floor(Math.hypot(mx - px, mz - pz) / CELLULE));
  const vus = new Set();
  for (let s = 0; s <= pas; s++) {
    const t = s / pas;
    const gx = Math.floor((px + (mx - px) * t) / CELLULE);
    const gz = Math.floor((pz + (mz - pz) * t) / CELLULE);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const autre of m.grilleBati.get(`${gx + i},${gz + j}`) ?? []) {
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

// Centre de la BOÎTE ORIENTÉE d'un contour (PCA puis milieu des extrema).
// JAMAIS le centroïde : sur une emprise en L il dérive de plusieurs mètres et
// le modèle posé déborde sur la route.
export function boiteOrientee(pts) {
  const uniq = pts.slice(0, -1);
  let cx = 0, cz = 0;
  for (const [x, z] of uniq) { cx += x; cz += z; }
  cx /= uniq.length; cz /= uniq.length;
  let sxx = 0, sxz = 0, szz = 0;
  for (const [x, z] of uniq) {
    const dx = x - cx, dz = z - cz;
    sxx += dx * dx; sxz += dx * dz; szz += dz * dz;
  }
  sxx /= uniq.length; sxz /= uniq.length; szz /= uniq.length;
  // Axe principal : vecteur propre dominant de la matrice de covariance 2×2.
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(theta), uz = Math.sin(theta);
  const vx = -uz, vz = ux;
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (const [x, z] of uniq) {
    const du = (x - cx) * ux + (z - cz) * uz;
    const dv = (x - cx) * vx + (z - cz) * vz;
    uMin = Math.min(uMin, du); uMax = Math.max(uMax, du);
    vMin = Math.min(vMin, dv); vMax = Math.max(vMax, dv);
  }
  const mu = (uMin + uMax) / 2, mv = (vMin + vMax) / 2;
  return {
    cx: cx + ux * mu + vx * mv,
    cz: cz + uz * mu + vz * mv,
    longueur: uMax - uMin,
    largeur: vMax - vMin,
    // Cap Babylon du grand axe, prêt à recopier dans landmarks.js.
    capGrandAxe: Math.atan2(ux, uz),
    centroideX: cx,
    centroideZ: cz,
    derive: Math.hypot(ux * mu + vx * mv, uz * mu + vz * mv),
  };
}

// Arêtes d'un contour avec leur normale EXTÉRIEURE mesurée (jamais devinée).
export function aretes(bat) {
  const res = [];
  for (let k = 0; k < bat.pts.length - 1; k++) {
    const [ax, az] = bat.pts[k], [bx, bz] = bat.pts[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.5) continue;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let nx = (bz - az) / len, nz = -(bx - ax) / len;
    // La normale doit s'ÉLOIGNER du centroïde.
    if (nx * (bat.cx - mx) + nz * (bat.cz - mz) > 0) { nx = -nx; nz = -nz; }
    res.push({
      k, a: [ax, az], b: [bx, bz], mx, mz, len, nx, nz,
      cap: Math.atan2(nx, nz),
      capDeg: Math.atan2(nx, nz) * 180 / Math.PI,
    });
  }
  return res;
}

// ---------------------------------------------------------------------------
// Panoramax
// ---------------------------------------------------------------------------

// Télécharge un panoramique (hd ou sd) dans son cache, retourne son chemin.
export async function telecharger(id, qualite = 'hd') {
  const cache = qualite === 'hd' ? CACHE_HD : CACHE_SD;
  mkdirSync(cache, { recursive: true });
  const chemin = `${cache}/${id}.jpg`;
  if (existsSync(chemin)) return chemin;
  const url = `https://panoramax.ign.fr/api/pictures/${id}/${qualite}.jpg`;
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

// Petit parseur d'arguments `--cle valeur` / `--drapeau`.
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const cle = a.slice(2);
      const suivant = argv[i + 1];
      if (suivant === undefined || suivant.startsWith('--')) out[cle] = true;
      else { out[cle] = suivant; i++; }
    } else out._.push(a);
  }
  return out;
}
