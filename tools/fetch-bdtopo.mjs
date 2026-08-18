// Récupère les bâtiments d'Artix depuis la BD TOPO de l'IGN (Géoplateforme).
//
// OpenStreetMap ne donne à Artix que des emprises au sol issues du cadastre :
// aucune hauteur, aucun matériau. La BD TOPO, elle, fournit pour chaque
// bâtiment sa hauteur mesurée par photogrammétrie, l'altitude du sol et du
// toit, le nombre d'étages et les matériaux de murs et de toiture.
import { writeFileSync } from 'node:fs';

const S = 43.3804, W = -0.5991, N = 43.4168, E = -0.5463;
const ENDPOINT = 'https://data.geopf.fr/wfs/ows';
const PAGE = 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Le service limite le nombre d'objets par requête : on découpe la commune en
// tuiles, et chaque tuile est paginée.
async function fetchTuile(s, w, n, e) {
  const out = [];
  for (let start = 0; start < 20000; start += PAGE) {
    const url = `${ENDPOINT}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature`
      + `&TYPENAMES=BDTOPO_V3:batiment`
      + `&COUNT=${PAGE}&STARTINDEX=${start}`
      + `&SRSNAME=urn:ogc:def:crs:EPSG::4326`
      + `&BBOX=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`
      + `&OUTPUTFORMAT=application/json`;

    let json = null;
    for (let essai = 1; essai <= 3 && !json; essai++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ArtixRacer/1.0' } });
        if (!res.ok) { process.stderr.write(`  HTTP ${res.status}\n`); await sleep(2500); continue; }
        json = await res.json();
      } catch (err) {
        process.stderr.write(`  échec: ${err.message}\n`);
        await sleep(2500);
      }
    }
    if (!json?.features?.length) break;
    out.push(...json.features);
    if (json.features.length < PAGE) break;
    await sleep(350);
  }
  return out;
}

const DIV = 4; // grille de 4x4 tuiles sur la commune
const tous = new Map(); // dédoublonnage par identifiant stable

for (let i = 0; i < DIV; i++) {
  for (let j = 0; j < DIV; j++) {
    const s = S + ((N - S) * i) / DIV;
    const n = S + ((N - S) * (i + 1)) / DIV;
    const w = W + ((E - W) * j) / DIV;
    const e = W + ((E - W) * (j + 1)) / DIV;
    process.stderr.write(`Tuile ${i * DIV + j + 1}/${DIV * DIV}...`);
    const f = await fetchTuile(s, w, n, e);
    for (const feat of f) tous.set(feat.properties.cleabs, feat);
    process.stderr.write(` ${f.length} bâtiments (total ${tous.size})\n`);
    await sleep(250);
  }
}

// Aire d'un anneau en meÌ€tres carreÌs (formule du lacet, projetée localement).
const COS_LAT = Math.cos((43.4 * Math.PI) / 180);
function aireAnneau(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2) * 111320 * 111320 * COS_LAT;
}

// On ne conserve que les champs utiles au rendu, pour alléger le fichier.
const batiments = [];
for (const f of tous.values()) {
  const p = f.properties;
  const g = f.geometry;
  if (!g || g.type !== 'MultiPolygon') continue;

  // Un bâtiment BD TOPO est un MultiPolygon : une ferme avec sa grange, une
  // maison avec son garage accolé forment plusieurs polygones sous un seul
  // identifiant. Ne lire que `coordinates[0][0]` amputait ces bâtiments de
  // tous leurs corps secondaires. On retient donc l'anneau extérieur de chaque
  // polygone, et on garde le plus étendu comme emprise principale : c'est lui
  // qui porte la hauteur et les matériaux de l'enregistrement.
  const anneaux = [];
  for (const poly of g.coordinates ?? []) {
    const ring = poly?.[0];
    if (!ring || ring.length < 4) continue;
    anneaux.push(ring.map((c) => [+c[0].toFixed(7), +c[1].toFixed(7)]));
  }
  if (!anneaux.length) continue;
  anneaux.sort((a, b) => aireAnneau(b) - aireAnneau(a));
  const [principal, ...secondaires] = anneaux;

  batiments.push({
    // [lon, lat] arrondis au décimètre : précision largement suffisante.
    pts: principal,
    // Corps secondaires du même bâtiment, absents jusqu'ici. Champ omis quand
    // il n'y en a pas, pour ne pas alourdir le fichier de 3 000 tableaux vides.
    ...(secondaires.length ? { corps: secondaires } : {}),
    h: p.hauteur ?? null,
    etages: p.nombre_d_etages ?? null,
    logements: p.nombre_de_logements ?? null,
    murs: p.materiaux_des_murs ?? null,
    toit: p.materiaux_de_la_toiture ?? null,
    nature: p.nature ?? null,
    usage: p.usage_1 ?? null,
    leger: p.construction_legere === true,
    // Altitudes : permettent de restituer le relief réel du terrain.
    zSol: p.altitude_minimale_sol ?? null,
    zToitMin: p.altitude_minimale_toit ?? null,
    zToitMax: p.altitude_maximale_toit ?? null,
  });
}

writeFileSync(
  new URL('../public/data/artix-bdtopo.json', import.meta.url),
  JSON.stringify({ batiments }),
);

// Statistiques de contrôle.
const stats = { avecHauteur: 0, avecEtages: 0, avecMurs: 0, avecToit: 0, avecCorpsSecondaires: 0, corpsTotal: 0 };
const natures = {};
for (const b of batiments) {
  if (b.h) stats.avecHauteur++;
  if (b.etages) stats.avecEtages++;
  if (b.murs) stats.avecMurs++;
  if (b.toit) stats.avecToit++;
  if (b.corps) { stats.avecCorpsSecondaires++; stats.corpsTotal += b.corps.length; }
  natures[b.nature ?? '?'] = (natures[b.nature ?? '?'] ?? 0) + 1;
}
console.log('TOTAL', batiments.length, stats);
console.log('natures', natures);
