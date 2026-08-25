// Mesure des SOLS réels d'Artix sur les panoramiques Panoramax.
//
// Trois relevés, tous fondés sur la même géométrie que les scripts frères
// (gisement -> colonne, site -> ligne du panoramique équirectangulaire) :
//
// 1. CHAUSSÉE par type de voie : la caméra roule SUR la route, la bande basse
//    du panoramique devant le véhicule est donc l'enrobé lui-même. Médiane
//    par `highway=` OSM : une départementale rechargée récemment n'a pas la
//    teinte d'une rue de lotissement blanchie par vingt étés.
// 2. PARKINGS : teinte du revêtement au centre de chaque aire, et classe
//    déduite (enrobé, stabilisé clair, herbe) : plusieurs aires d'Artix ne
//    sont pas goudronnées, ce que le rendu uniformisait à tort.
// 3. PASSAGES PIÉTONS : part et luminance des pixels blancs au droit de
//    chaque nœud `highway=crossing` : l'usure réelle, passage par passage.
//
// Sortie : public/data/artix-sols.json. Licence : Panoramax IGN, LO 2.0.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import sharp from 'sharp';

const ORIGIN = { lat: 43.39743, lon: -0.57224 };
const R = 6378137;
const CACHE = '.panoramax-cache';
const CAM_H = 2.4;

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

// ---------------------------------------------------------------------------
// Extraction OSM minimale (le script est autonome, sans dépendre du jeu).
// ---------------------------------------------------------------------------
const KINDS = new Set(['primary', 'secondary', 'tertiary', 'residential',
  'unclassified', 'living_street', 'service', 'track']);
const routes = [];
const parkings = [];
const passages = [];
for (const el of osm.elements ?? []) {
  const t = el.tags ?? {};
  if (el.type === 'way' && KINDS.has(t.highway) && el.geometry) {
    routes.push({ kind: t.highway, pts: el.geometry.map((g) => project(g.lat, g.lon)) });
  }
  if (el.type === 'way' && t.amenity === 'parking' && el.geometry) {
    const pts = el.geometry.map((g) => project(g.lat, g.lon));
    let cx = 0, cz = 0;
    for (const [x, z] of pts) { cx += x; cz += z; }
    parkings.push({ cx: cx / pts.length, cz: cz / pts.length, surface: t.surface ?? null });
  }
}
// Les nœuds de signalisation (dont les passages piétons) vivent dans le
// fichier POI, pas dans la requête des surfaces.
try {
  const poi = JSON.parse(readFileSync('public/data/artix-poi.json', 'utf8'));
  for (const el of poi.poi ?? []) {
    if (el.type === 'node' && el.tags?.highway === 'crossing') {
      const [x, z] = project(el.lat, el.lon);
      passages.push({ x, z });
    }
  }
} catch { /* facultatif */ }
console.log(`${routes.length} voies, ${parkings.length} aires, ${passages.length} passages piétons.`);

// Grille des photos.
const CEL = 25;
const grille = new Map();
for (const p of photos) {
  const k = `${Math.floor(p.x / CEL)},${Math.floor(p.z / CEL)}`;
  (grille.get(k) ?? grille.set(k, []).get(k)).push(p);
}
function photosProches(x, z, rayon) {
  const res = [];
  const r = Math.ceil(rayon / CEL);
  const gx = Math.floor(x / CEL), gz = Math.floor(z / CEL);
  for (let i = -r; i <= r; i++) {
    for (let j = -r; j <= r; j++) {
      for (const p of grille.get(`${gx + i},${gz + j}`) ?? []) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d <= rayon) res.push({ ...p, d });
      }
    }
  }
  return res.sort((a, b) => a.d - b.d);
}

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

const panoCache = new Map();
async function panoRaw(id) {
  if (panoCache.has(id)) return panoCache.get(id);
  const chemin = await telecharger(id);
  const { data, info } = await sharp(chemin).raw().toBuffer({ resolveWithObject: true });
  const entree = { data, W: info.width, H: info.height };
  // Petit cache borné : un panoramique décodé pèse 6 Mo.
  if (panoCache.size > 12) panoCache.delete(panoCache.keys().next().value);
  panoCache.set(id, entree);
  return entree;
}

// Échantillonne une fenêtre angulaire du panoramique : gisement (deg) et site
// (deg, négatif vers le sol) au centre, demi-largeurs en degrés. Renvoie la
// liste des pixels RGB.
function fenetre(pano, az, gisement, site, demiG, demiS, pas = 3) {
  const { data, W, H } = pano;
  const pixels = [];
  for (let dg = -demiG; dg <= demiG; dg += 0.6) {
    const colonne = Math.round(((((gisement + dg - az + 540) % 360) / 360)) * W);
    const c = ((colonne % W) + W) % W;
    for (let ds = -demiS; ds <= demiS; ds += 0.6) {
      const ligne = Math.round((0.5 - (site + ds) / 180) * H);
      if (ligne < 0 || ligne >= H) continue;
      const o = (ligne * W + c) * 3;
      pixels.push([data[o], data[o + 1], data[o + 2]]);
    }
  }
  return pixels;
}

const mediane = (liste, canal) => {
  const v = liste.map((p) => p[canal]).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)] ?? 0;
};

// ---------------------------------------------------------------------------
// 1. Chaussée par type de voie
// ---------------------------------------------------------------------------
console.log('Chaussées par type de voie…');
const parKind = new Map();
// Assignation photo -> voie : la voie dont un segment passe à moins de 6 m.
function kindSous(x, z) {
  let meilleur = null, dMin = 6;
  for (const r of routes) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      if (Math.abs(x1 - x) > 60 && Math.abs(z1 - z) > 60) continue;
      const dx = x2 - x1, dz = z2 - z1;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) continue;
      let t = ((x - x1) * dx + (z - z1) * dz) / l2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
      if (d < dMin) { dMin = d; meilleur = r.kind; }
    }
  }
  return meilleur;
}
// Échantillon dispersé : une photo sur 40, plafonné par kind.
const quota = new Map();
for (let i = 0; i < photos.length; i += 40) {
  const p = photos[i];
  const kind = kindSous(p.x, p.z);
  if (!kind) continue;
  if ((quota.get(kind) ?? 0) >= 60) continue;
  try {
    const pano = await panoRaw(p.id);
    // La chaussée devant le véhicule : bande basse centrée sur le cap.
    const pixels = fenetre(pano, p.az, p.az, -46, 14, 10)
      // Marquages et véhicules exclus : trop clair, trop saturé.
      .filter(([r, g, b]) => {
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        return lum > 25 && lum < 150 && sat < 34;
      });
    if (pixels.length < 120) continue;
    let e = parKind.get(kind);
    if (!e) parKind.set(kind, e = { r: [], g: [], b: [], n: 0 });
    e.r.push(mediane(pixels, 0)); e.g.push(mediane(pixels, 1)); e.b.push(mediane(pixels, 2));
    e.n++;
    quota.set(kind, (quota.get(kind) ?? 0) + 1);
  } catch { /* photo illisible : la suivante */ }
}
const sortieRoutes = {};
for (const [kind, e] of parKind) {
  sortieRoutes[kind] = {
    c: (mediane(e.r.map((v) => [v]), 0) << 16)
      | (mediane(e.g.map((v) => [v]), 0) << 8)
      | mediane(e.b.map((v) => [v]), 0),
    n: e.n,
  };
  console.log(`  ${kind}: #${sortieRoutes[kind].c.toString(16).padStart(6, '0')} (${e.n} photos)`);
}

// ---------------------------------------------------------------------------
// 2. Revêtement des aires de parking
// ---------------------------------------------------------------------------
console.log('Aires de parking…');
const sortieParkings = [];
for (const aire of parkings) {
  const candidates = photosProches(aire.cx, aire.cz, 30).filter((p) => p.d > 3);
  let releve = null;
  for (const p of candidates.slice(0, 3)) {
    try {
      const pano = await panoRaw(p.id);
      const gisement = Math.atan2(aire.cx - p.x, -(aire.cz - p.z)) * 180 / Math.PI;
      const site = -Math.atan2(CAM_H, p.d) * 180 / Math.PI;
      const pixels = fenetre(pano, p.az, gisement, site, 6, 4)
        .filter(([r, g, b]) => {
          const lum = r * 0.299 + g * 0.587 + b * 0.114;
          return lum > 18 && lum < 235;
        });
      if (pixels.length < 80) continue;
      releve = [mediane(pixels, 0), mediane(pixels, 1), mediane(pixels, 2)];
      break;
    } catch { /* suivante */ }
  }
  if (!releve) continue;
  const [r, g, b] = releve;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  // Classe : l'herbe domine en vert ; le stabilisé et le gravier sont clairs
  // et chauds ; le reste est de l'enrobé.
  let classe = 'enrobe';
  if (g > r + 10 && g > b + 14) classe = 'herbe';
  else if (lum > 120 && r >= b) classe = 'stabilise';
  sortieParkings.push({
    x: Math.round(aire.cx * 10) / 10,
    z: Math.round(aire.cz * 10) / 10,
    c: (r << 16) | (g << 8) | b,
    t: classe,
  });
}
console.log(`  ${sortieParkings.length} aires relevées (`
  + `${sortieParkings.filter((p) => p.t === 'stabilise').length} stabilisé, `
  + `${sortieParkings.filter((p) => p.t === 'herbe').length} herbe).`);

// ---------------------------------------------------------------------------
// 3. Usure des passages piétons
// ---------------------------------------------------------------------------
console.log('Passages piétons…');
const sortiePassages = [];
for (const q of passages) {
  const candidates = photosProches(q.x, q.z, 14).filter((p) => p.d > 2.5);
  for (const p of candidates.slice(0, 2)) {
    try {
      const pano = await panoRaw(p.id);
      const gisement = Math.atan2(q.x - p.x, -(q.z - p.z)) * 180 / Math.PI;
      const site = -Math.atan2(CAM_H, p.d) * 180 / Math.PI;
      const pixels = fenetre(pano, p.az, gisement, site, 9, 5);
      if (pixels.length < 120) continue;
      const blancs = pixels.filter(([r, g, b]) => {
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        return lum > 132 && sat < 42;
      });
      const part = blancs.length / pixels.length;
      // Un passage neuf montre un tiers de blanc dans cette fenêtre (bandes
      // et intervalles alternent) ; un passage effacé n'en montre presque pas.
      const lumBlancs = blancs.length ? mediane(blancs, 0) * 0.299 + mediane(blancs, 1) * 0.587 + mediane(blancs, 2) * 0.114 : 0;
      const usure = Math.max(0.12, Math.min(1, (part / 0.3) * 0.6 + (lumBlancs / 235) * 0.4));
      sortiePassages.push({
        x: Math.round(q.x * 10) / 10,
        z: Math.round(q.z * 10) / 10,
        u: Math.round(usure * 100) / 100,
      });
      break;
    } catch { /* suivante */ }
  }
}
console.log(`  ${sortiePassages.length} passages mesurés.`);

// ---------------------------------------------------------------------------
// 4. Relevés locaux du corridor du centre-bourg
// ---------------------------------------------------------------------------
// Dans le corridor commerçant (Leclerc, Au Comptoir, écoles, mairie, église),
// la teinte de chaussée est relevée TOUS LES 12 M le long des voies plutôt
// que par type : les reprises d'enrobé, les zones pavées et les abords usés
// se lisent tronçon par tronçon.
console.log('Relevés locaux du corridor…');
const ANCRES = [[99, -36], [45, -21], [-52, -31], [-13, -126], [-52, -110],
  [-12, 50], [8, 107], [12, 170]];
const dansCorridor = (x, z) => ANCRES.some(([ax, az]) => Math.hypot(x - ax, z - az) < 95);
const sortieLocaux = [];
for (const r of routes) {
  for (let i = 0; i < r.pts.length - 1; i++) {
    const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
    const len = Math.hypot(x2 - x1, z2 - z1);
    for (let d = 6; d < len; d += 12) {
      const t = d / len;
      const qx = x1 + (x2 - x1) * t, qz = z1 + (z2 - z1) * t;
      if (!dansCorridor(qx, qz)) continue;
      const proches = photosProches(qx, qz, 9).filter((p) => p.d > 1.5);
      if (!proches.length) continue;
      try {
        const p = proches[0];
        const pano = await panoRaw(p.id);
        const gisement = Math.atan2(qx - p.x, -(qz - p.z)) * 180 / Math.PI;
        const site = -Math.atan2(CAM_H, Math.max(2, p.d)) * 180 / Math.PI;
        const pixels = fenetre(pano, p.az, gisement, site, 6, 4)
          .filter(([r2, g2, b2]) => {
            const lum = r2 * 0.299 + g2 * 0.587 + b2 * 0.114;
            const sat = Math.max(r2, g2, b2) - Math.min(r2, g2, b2);
            return lum > 25 && lum < 165 && sat < 38;
          });
        if (pixels.length < 60) continue;
        sortieLocaux.push({
          x: Math.round(qx * 10) / 10,
          z: Math.round(qz * 10) / 10,
          c: (mediane(pixels, 0) << 16) | (mediane(pixels, 1) << 8) | mediane(pixels, 2),
        });
      } catch { /* photo illisible */ }
    }
  }
}
console.log(`  ${sortieLocaux.length} relevés locaux.`);

mkdirSync('public/data', { recursive: true });
writeFileSync('public/data/artix-sols.json', JSON.stringify({
  source: 'Panoramax IGN, Licence Ouverte 2.0 — sols mesurés sur les panoramiques',
  date: new Date().toISOString().slice(0, 10),
  routes: sortieRoutes,
  parkings: sortieParkings,
  passages: sortiePassages,
  locaux: sortieLocaux,
}));
console.log('Écrit : public/data/artix-sols.json');
