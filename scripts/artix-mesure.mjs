// MESURER un lieu d'Artix dans les données, pour poser un modèle en dur sans
// jamais deviner une position ni un cap.
//
// Sort une fiche prête à recopier dans landmarks.js : centre de boîte
// orientée (jamais le centroïde), hauteur de gouttière LiDAR, arêtes avec
// leur normale extérieure mesurée, POI voisins, et la projection d'un POI sur
// l'arête qui le regarde (position exacte d'une devanture).
//
// Usage :
//   node scripts/artix-mesure.mjs --poi "Maison Chaudron"
//   node scripts/artix-mesure.mjs --xz 26,12 --rayon 40
//   node scripts/artix-mesure.mjs --bat 1073
//   node scripts/artix-mesure.mjs --poi "Leclerc" --json
//
// Options :
//   --xz X,Z | --latlon LAT,LON | --poi "nom" | --bat N   cible
//   --rayon 30   rayon d'inspection autour de la cible (défaut 30)
//   --nb 3       nombre de bâtiments détaillés (défaut 3)
//   --json       sortie JSON brute au lieu de la fiche lisible
//   --ortho      imprime en plus la commande curl d'orthophoto IGN cadrée
//
// Licence des données : BD TOPO / LiDAR HD / Overpass, Licence Ouverte 2.0.
import {
  args, project, unproject, chargerMonde, batimentsProches, poiProches,
  chercherPoi, boiteOrientee, aretes, photosProches, voieProche,
} from './artix-geo.mjs';

const a = args();
const RAYON = Number(a.rayon ?? 30);
const NB = Number(a.nb ?? 3);
const m = chargerMonde();

// ---------------------------------------------------------------------------
// Cible
// ---------------------------------------------------------------------------
let cible = null;
let titre = '';
let poiCible = null;

if (a.xz) {
  const [x, z] = String(a.xz).split(',').map(Number);
  cible = { x, z };
  titre = `point (${x}, ${z})`;
} else if (a.latlon) {
  const [lat, lon] = String(a.latlon).split(',').map(Number);
  const [x, z] = project(lat, lon);
  cible = { x, z };
  titre = `point ${lat}, ${lon}`;
} else if (a.poi) {
  const trouves = chercherPoi(String(a.poi));
  if (trouves.length === 0) {
    console.error(`Aucun POI ne correspond à « ${a.poi} ».`);
    const tous = m.poi.filter((p) => p.nom).map((p) => p.nom).sort();
    console.error(`POI nommés disponibles (${tous.length}) : ${tous.slice(0, 40).join(', ')}…`);
    process.exit(1);
  }
  if (trouves.length > 1) {
    console.log(`${trouves.length} POI correspondent, le premier est retenu :`);
    for (const p of trouves) console.log(`  ${p.nom} (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`);
  }
  poiCible = trouves[0];
  cible = { x: poiCible.x, z: poiCible.z };
  titre = poiCible.nom;
} else if (a.bat !== undefined) {
  const b = m.batiments[Number(a.bat)];
  if (!b) { console.error(`Bâtiment ${a.bat} inconnu.`); process.exit(1); }
  const bo = boiteOrientee(b.pts);
  cible = { x: bo.cx, z: bo.cz };
  titre = `bâtiment ${a.bat}`;
} else {
  console.error('Indiquer la cible : --xz X,Z | --latlon LAT,LON | --poi "nom" | --bat N');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mesures
// ---------------------------------------------------------------------------
const bats = batimentsProches(cible.x, cible.z, RAYON).slice(0, NB).map((b) => {
  const bo = boiteOrientee(b.pts);
  const ar = aretes(b);
  // Arête sur laquelle poser une devanture. La proximité au POI ne suffit
  // PAS : les POI de commerce sont posés approximativement, souvent dans le
  // bâtiment, et l'arête la plus proche est fréquemment un pignon aveugle.
  // Deux critères se combinent :
  // 1. le TYPE de la voie qui longe l'arête : une VRAIE voie (tertiary,
  //    residential…) bat une desserte « service ». Les prises Panoramax
  //    seules ne suffisent pas : la GoPro roule aussi dans les dessertes de
  //    parking, et ce piège a fait poser la Caisse d'Épargne côté parking
  //    (immeuble 1126) alors que sa façade commerçante longe la D32.
  // 2. l'exposition photo (prises qui voient l'arête de face), qui départage
  //    les arêtes longées par la même voie.
  const NOTE = [];
  for (const e of ar) {
    if (e.len < 3) continue;   // ressauts et redans, pas des façades
    const vx = cible.x - e.mx, vz = cible.z - e.mz;
    const d = Math.hypot(vx, vz) || 1e-6;
    const cos = (vx * e.nx + vz * e.nz) / d;
    // Prises de vue qui regardent cette arête par l'extérieur, sous moins de
    // 60° d'incidence et à moins de 30 m.
    let vues = 0;
    for (const p of photosProches(e.mx, e.mz, 30)) {
      const px = p.x - e.mx, pz = p.z - e.mz;
      const dp = Math.hypot(px, pz);
      if (dp < 2) continue;
      if ((px * e.nx + pz * e.nz) / dp > 0.5) vues++;
    }
    // Voie au droit de la façade : cherchée 5 m devant elle, côté extérieur.
    const voie = voieProche(e.mx + e.nx * 5, e.mz + e.nz * 5, 14);
    NOTE.push({ ...e, d, cos, vues, voie, exposee: vues >= 3, surRue: voie?.vraie === true });
  }
  // Priorité aux façades longées par une vraie voie, puis aux exposées en
  // photo, puis à défaut la plus proche du POI.
  const pool = (NOTE.some((e) => e.surRue) ? NOTE.filter((e) => e.surRue)
    : NOTE.some((e) => e.exposee) ? NOTE.filter((e) => e.exposee) : NOTE);
  let facade = null;
  for (const e of pool) {
    const note = e.d - e.vues * 0.35 + (e.voie ? e.voie.d * 0.3 : 4);
    if (!facade || note < facade.note) facade = { ...e, note };
  }
  // Position du POI projetée sur cette façade : abscisse le long de l'arête.
  let projection = null;
  if (facade) {
    const ux = (facade.b[0] - facade.a[0]) / facade.len;
    const uz = (facade.b[1] - facade.a[1]) / facade.len;
    let t = (cible.x - facade.a[0]) * ux + (cible.z - facade.a[1]) * uz;
    t = Math.max(0, Math.min(facade.len, t));
    projection = {
      x: facade.a[0] + ux * t,
      z: facade.a[1] + uz * t,
      abscisse: t,
      // Reculé de 10 cm devant le mur : une devanture posée pile sur le plan
      // du mur z-fighte avec lui.
      xDevanture: facade.a[0] + ux * t + facade.nx * 0.1,
      zDevanture: facade.a[1] + uz * t + facade.nz * 0.1,
    };
  }
  return {
    i: b.i,
    d: b.d,
    hauteurFaitage: b.h,
    gouttiere: m.gouttieres.get(b.i) ?? null,
    materiau: b.mat ?? null,
    usage: b.usage ?? null,
    leger: b.leger,
    boite: bo,
    aretes: ar,
    facade,
    projection,
  };
});

// poiProches renvoie des COPIES : comparer par coordonnées, pas par identité,
// sinon le POI cible se retrouve dans ses propres voisins à 0,0 m.
const voisins = poiProches(cible.x, cible.z, RAYON)
  .filter((p) => p.nom && !(poiCible && p.x === poiCible.x && p.z === poiCible.z))
  .slice(0, 8);

const nPhotos = photosProches(cible.x, cible.z, 40).length;
const [lat, lon] = unproject(cible.x, cible.z);

if (a.json) {
  console.log(JSON.stringify({ titre, cible, lat, lon, bats, voisins, nPhotos }, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Fiche lisible
// ---------------------------------------------------------------------------
const r1 = (v) => (v == null ? '—' : v.toFixed(1));
const r2 = (v) => (v == null ? '—' : v.toFixed(2));

console.log(`\n=== ${titre} ===`);
console.log(`Jeu (x, z) : ${r2(cible.x)}, ${r2(cible.z)}   WGS84 : ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
if (poiCible) {
  const tags = Object.entries(poiCible.tags)
    .filter(([k]) => !k.startsWith('addr:') || k === 'addr:housenumber')
    .map(([k, v]) => `${k}=${v}`);
  console.log(`Tags OSM : ${tags.join(', ')}`);
}
console.log(`${nPhotos} prises Panoramax dans 40 m `
  + `(les voir : node scripts/panoramax-vue.mjs --xz ${r1(cible.x)},${r1(cible.z)})`);

for (const b of bats) {
  console.log(`\n--- Bâtiment BD TOPO ${b.i} (à ${r1(b.d)} m) ---`);
  // La gouttière ne peut pas dépasser le faîtage : quand ça arrive, l'une des
  // deux sources se trompe sur ce bâtiment (LiDAR pris sur un arbre, ou
  // hauteur BD TOPO absente). Retomber sur la photo pour trancher.
  const incoherent = b.gouttiere != null && b.gouttiere > b.hauteurFaitage + 0.2;
  console.log(`  Faîtage ${r1(b.hauteurFaitage)} m, gouttière LiDAR ${r1(b.gouttiere)} m`
    + `${b.leger ? ', LÉGER (hangar/abri)' : ''}`
    + `${incoherent ? '  ⚠ gouttière > faîtage : sources en désaccord, vérifier en photo' : ''}`);
  if (b.materiau || b.usage) {
    console.log(`  Matériau ${b.materiau ?? '—'}, usage ${b.usage ?? '—'}`);
  }
  const bo = b.boite;
  console.log(`  Boîte orientée : centre (${r2(bo.cx)}, ${r2(bo.cz)}), `
    + `${r1(bo.longueur)} × ${r1(bo.largeur)} m, `
    + `cap grand axe ${r2(bo.capGrandAxe)} rad (${(bo.capGrandAxe * 180 / Math.PI).toFixed(0)}°)`);
  // Le rappel qui a le plus servi : sur une emprise en L, le centroïde ment.
  console.log(`  Centroïde (${r2(bo.centroideX)}, ${r2(bo.centroideZ)}) : `
    + `dérive ${r2(bo.derive)} m ${bo.derive > 0.8 ? '⚠ NE PAS UTILISER' : '(faible)'}`);
  console.log(`  Arêtes (normale extérieure mesurée) :`);
  for (const e of b.aretes) {
    const marque = b.facade && e.k === b.facade.k ? ' ← FAÇADE RETENUE' : '';
    console.log(`    ${String(e.k).padStart(2)}  ${r1(e.len).padStart(5)} m  `
      + `milieu (${r2(e.mx)}, ${r2(e.mz)})  `
      + `normale ${r2(e.cap)} rad (${e.capDeg.toFixed(0)}°)${marque}`);
  }
  if (b.projection) {
    const p = b.projection;
    const voieTxt = b.facade.voie
      ? `${b.facade.voie.nom ?? b.facade.voie.kind} (${b.facade.voie.kind}) à ${r1(b.facade.voie.d)} m`
      : 'aucune voie à moins de 14 m';
    console.log(`  Devanture à poser sur l'arête ${b.facade.k} `
      + `(abscisse ${r1(p.abscisse)} / ${r1(b.facade.len)} m, `
      + `${b.facade.vues} prises de face, voie : ${voieTxt}) :`);
    console.log(`      position : new BABYLON.Vector3(${r2(p.xDevanture)}, 0, ${r2(p.zDevanture)})`);
    console.log(`      rotation Y : ${r2(b.facade.cap)}   // Math.atan2(nx, nz)`);
    console.log(`      largeur disponible : ${r1(b.facade.len)} m, `
      + `hauteur mur : ${r1(b.gouttiere ?? b.hauteurFaitage)} m`);
  }
}

if (voisins.length) {
  console.log(`\n--- POI voisins (${RAYON} m) ---`);
  for (const p of voisins) {
    console.log(`  ${r1(p.d).padStart(5)} m  ${p.nom}  (${r1(p.x)}, ${r1(p.z)})`
      + `  ${p.tags.shop ?? p.tags.amenity ?? p.tags.craft ?? ''}`);
  }
}

if (a.ortho) {
  // Emprise carrée d'environ 2 × RAYON autour de la cible.
  const [latSud, lonOuest] = unproject(cible.x - RAYON, cible.z + RAYON);
  const [latNord, lonEst] = unproject(cible.x + RAYON, cible.z - RAYON);
  console.log(`\n--- Orthophoto IGN (implantation au sol) ---`);
  console.log(`curl -s "https://data.geopf.fr/wms-r?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap`
    + `&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326`
    + `&BBOX=${latSud.toFixed(6)},${lonOuest.toFixed(6)},${latNord.toFixed(6)},${lonEst.toFixed(6)}`
    + `&WIDTH=1600&HEIGHT=1600" -o ortho-${titre.replace(/[^\w]+/g, '-').toLowerCase()}.jpg`);
  console.log(`  Échelle : ${(2 * RAYON / 1600 * 100).toFixed(1)} cm/px. `
    + `Nord en haut, est à droite ; dans le jeu Z croît vers le SUD (bas).`);
}
console.log('');
