// Récupère les points d'intérêt et la signalisation d'Artix depuis OSM.
//
// La requête principale ne demande que des `way` (surfaces). Or feux
// tricolores, stops, passages piétons, ronds-points et la plupart des
// commerces sont cartographiés comme des `node` : sans cette seconde passe,
// toute la signalisation manque.
import { writeFileSync } from 'node:fs';

const S = 43.3804, W = -0.5991, N = 43.4168, E = -0.5463;
const BBOX = `${S},${W},${N},${E}`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LOTS = {
  // Signalisation routière, en nœuds sur le réseau.
  signalisation: `
    node["highway"~"traffic_signals|stop|give_way|crossing|mini_roundabout|speed_camera|turning_circle"](${BBOX});
    node["traffic_calming"](${BBOX});
    node["barrier"~"gate|bollard|lift_gate"](${BBOX});
  `,
  // Équipements publics et commerces, en nœuds comme en surfaces.
  equipements: `
    node["amenity"](${BBOX});
    way["amenity"](${BBOX});
    node["shop"](${BBOX});
    way["shop"](${BBOX});
    node["leisure"](${BBOX});
    node["office"](${BBOX});
    node["tourism"](${BBOX});
    node["healthcare"](${BBOX});
    node["craft"](${BBOX});
  `,
  // Panneaux de limitation de vitesse et noms de lieux-dits.
  divers: `
    node["traffic_sign"](${BBOX});
    node["place"~"village|hamlet|suburb|locality|town"](${BBOX});
    node["natural"="tree"](${BBOX});
    node["highway"="street_lamp"](${BBOX});
  `,
};

async function lot(nom, corps) {
  const query = `[out:json][timeout:120];(${corps});out body geom;`;
  for (let essai = 1; essai <= 3; essai++) {
    for (const url of ENDPOINTS) {
      try {
        process.stderr.write(`[${nom}] essai ${essai} -> ${new URL(url).host}`);
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'ArtixRacer/1.0 (jeu local hors ligne)',
          },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) { process.stderr.write(` HTTP ${res.status}\n`); await sleep(2500); continue; }
        const json = await res.json();
        process.stderr.write(` OK ${json.elements.length}\n`);
        return json.elements;
      } catch (err) {
        process.stderr.write(` échec: ${err.message}\n`);
        await sleep(2500);
      }
    }
  }
  throw new Error(`Lot "${nom}" impossible à récupérer`);
}

const elements = [];
for (const [nom, corps] of Object.entries(LOTS)) {
  elements.push(...await lot(nom, corps));
  await sleep(1200);
}

// Dédoublonnage : un même objet peut apparaître dans deux lots.
const vus = new Set();
const propres = [];
for (const el of elements) {
  const cle = `${el.type}/${el.id}`;
  if (vus.has(cle)) continue;
  vus.add(cle);

  // Position : le nœud lui-même, ou le centroïde de la surface.
  let lat = el.lat, lon = el.lon;
  if (lat == null && el.geometry?.length) {
    lat = el.geometry.reduce((s, g) => s + g.lat, 0) / el.geometry.length;
    lon = el.geometry.reduce((s, g) => s + g.lon, 0) / el.geometry.length;
  }
  if (lat == null) continue;

  const t = el.tags ?? {};
  propres.push({
    lat: +lat.toFixed(7),
    lon: +lon.toFixed(7),
    type: el.type,
    tags: t,
  });
}

writeFileSync(
  new URL('../public/data/artix-poi.json', import.meta.url),
  JSON.stringify({ poi: propres }),
);

const stats = {};
for (const p of propres) {
  const k = p.tags.highway ? `highway=${p.tags.highway}`
    : p.tags.amenity ? `amenity=${p.tags.amenity}`
    : p.tags.shop ? `shop=${p.tags.shop}`
    : p.tags.leisure ? `leisure=${p.tags.leisure}`
    : p.tags.traffic_calming ? 'ralentisseur'
    : p.tags.natural === 'tree' ? 'arbre'
    : p.tags.place ? `place=${p.tags.place}`
    : 'autre';
  stats[k] = (stats[k] ?? 0) + 1;
}
console.log('TOTAL', propres.length);
Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 30)
  .forEach(([k, v]) => console.log(String(v).padStart(4), k));
