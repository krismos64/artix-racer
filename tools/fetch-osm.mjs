// Récupère les données OpenStreetMap réelles d'Artix (64170) via l'API Overpass.
// Découpe la requête en lots pour éviter les timeouts serveur, avec reprise sur erreur.
import { writeFileSync } from 'node:fs';

const S = 43.3804, W = -0.5991, N = 43.4168, E = -0.5463;
const BBOX = `${S},${W},${N},${E}`;

const BATCHES = {
  roads: `way["highway"](${BBOX});`,
  buildings: `way["building"](${BBOX});`,
  nature: `way["natural"="water"](${BBOX});way["waterway"](${BBOX});way["landuse"~"forest|grass|meadow|farmland|residential|industrial|cemetery|vineyard|orchard"](${BBOX});way["leisure"~"park|pitch|garden|sports_centre"](${BBOX});way["railway"="rail"](${BBOX});`,
  // Haies, murets et clôtures : très présents dans un bourg béarnais, ils
  // structurent le paysage bien plus que les bâtiments seuls.
  barriers: `way["barrier"~"hedge|fence|wall"](${BBOX});way["natural"="tree_row"](${BBOX});`,
  // Aires de stationnement. Elles n'étaient pas demandées jusqu'ici, si bien
  // que le jeu ne connaissait que les places qu'il déduisait lui-même le long
  // des voies : les grands parkings de surface du bourg, très visibles depuis
  // la route, n'existaient tout simplement pas.
  parkings: `way["amenity"="parking"](${BBOX});way["amenity"="fuel"](${BBOX});`,
};

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(name, body) {
  const query = `[out:json][timeout:120];(${body});out body geom;`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        process.stderr.write(`[${name}] essai ${attempt} -> ${new URL(url).host}\n`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ArtixRacer/1.0 (jeu local hors ligne)' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) { process.stderr.write(`  HTTP ${res.status}\n`); await sleep(3000); continue; }
        const json = await res.json();
        process.stderr.write(`  OK: ${json.elements.length} éléments\n`);
        return json.elements;
      } catch (e) { process.stderr.write(`  échec: ${e.message}\n`); await sleep(3000); }
    }
    await sleep(5000);
  }
  throw new Error(`Lot "${name}" impossible à récupérer`);
}

const elements = [];
for (const [name, body] of Object.entries(BATCHES)) {
  elements.push(...await run(name, body));
  await sleep(1500);
}

writeFileSync(new URL('../public/data/artix-osm.json', import.meta.url), JSON.stringify({ elements }));
const counts = {};
for (const el of elements) {
  const t = el.tags?.highway ? 'routes' : el.tags?.building ? 'bâtiments'
    : el.tags?.amenity === 'parking' || el.tags?.amenity === 'fuel' ? 'parkings'
    : el.tags?.landuse || el.tags?.leisure ? 'terrains'
    : el.tags?.waterway || el.tags?.natural ? 'eau' : el.tags?.railway ? 'rail' : 'autre';
  counts[t] = (counts[t] || 0) + 1;
}
console.log('TOTAL', elements.length, counts);
