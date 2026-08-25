// Inventaire complet des photos Panoramax couvrant Artix.
//
// L'API STAC de l'IGN (panoramax.ign.fr) ne renvoie pas de compte total et sa
// pagination par liens est lente à parcourir pour 22 000 photos. On découpe
// donc la zone en cellules et on requête chaque cellule avec la limite
// maximale : si une cellule revient pleine, elle est subdivisée en quatre,
// récursivement. Aucune photo n'échappe à ce balayage.
//
// Sortie : data/panoramax-inventaire.json, une ligne compacte par photo
// (id, lon, lat, azimut, date). Les images elles-mêmes ne sont téléchargées
// que plus tard, et seulement celles utiles (panoramax-analyse.mjs).
//
// Licence des données : Panoramax IGN, Licence Ouverte 2.0 (etalab).

import { writeFileSync, mkdirSync } from 'node:fs';

const API = 'https://panoramax.ign.fr/api/search';
// Emprise large autour de la commune : le jeu couvre environ 4 km autour du
// centre-bourg (43.39743, -0.57224).
const BBOX = [-0.615, 43.375, -0.54, 43.42];
const LIMIT = 500;

const photos = new Map();
let requetes = 0;

async function fetchJson(url, essais = 4) {
  for (let i = 0; i < essais; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      if (i === essais - 1) throw e;
      // Recul exponentiel : l'API publique n'aime pas être matraquée.
      await new Promise((res) => setTimeout(res, 800 * 2 ** i));
    }
  }
}

async function balayer(bbox, profondeur = 0) {
  const url = `${API}?bbox=${bbox.join(',')}&limit=${LIMIT}`;
  const data = await fetchJson(url);
  requetes++;
  const n = data.features?.length ?? 0;
  if (n >= LIMIT && profondeur < 10) {
    // Cellule pleine : elle contient sans doute plus de photos que la limite.
    const [x1, y1, x2, y2] = bbox;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    for (const sous of [
      [x1, y1, mx, my], [mx, y1, x2, my],
      [x1, my, mx, y2], [mx, my, x2, y2],
    ]) {
      await balayer(sous, profondeur + 1);
    }
    return;
  }
  for (const f of data.features ?? []) {
    const [lon, lat] = f.geometry.coordinates;
    photos.set(f.id, {
      id: f.id,
      lon, lat,
      az: f.properties['view:azimuth'] ?? null,
      seq: f.properties.collection?.id ?? f.collection ?? null,
      date: (f.properties.datetime ?? '').slice(0, 10),
    });
  }
  if (requetes % 10 === 0) {
    process.stdout.write(`\r${photos.size} photos, ${requetes} requêtes…`);
  }
}

console.log(`Balayage de la zone d'Artix (${BBOX.join(', ')})`);
await balayer(BBOX);
mkdirSync('data', { recursive: true });
const liste = [...photos.values()];
writeFileSync('data/panoramax-inventaire.json', JSON.stringify({
  source: 'Panoramax IGN, Licence Ouverte 2.0',
  bbox: BBOX,
  date: new Date().toISOString().slice(0, 10),
  photos: liste,
}));
console.log(`\n${liste.length} photos inventoriées en ${requetes} requêtes.`);
console.log('Écrit : data/panoramax-inventaire.json');
