// Teintes de façade relevées sur les photographies de rue Panoramax (IGN).
//
// La BD TOPO ne renseigne le matériau des murs que pour 1 629 des 3 542
// bâtiments d'Artix, et un matériau ne donne qu'une famille de teintes : deux
// maisons au crépi identique n'ont pas la même couleur. Les photographies de
// rue montrent la façade réelle.
//
// Les photos Panoramax sont des panoramiques équirectangulaires 360° : la
// colonne d'un pixel donne directement son azimut, ce qui évite tout calcul de
// projection. On vise la bande horizontale du premier étage, au-dessus des
// véhicules stationnés et sous la ligne de toit.
//
// Le décodage passe par `sips` (macOS) : l'image est réduite puis convertie en
// TIFF non compressé, format dont la lecture des pixels tient en vingt lignes,
// plutôt que d'ajouter une dépendance de décodage JPEG.
import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = 'https://api.panoramax.xyz/api';
const S = 43.3788, W = -0.6001, N = 43.4174, E = -0.5457;
const DIV = 8;              // l'API plafonne à 1 000 résultats par requête
const DIST_MAX = 40;        // au-delà, la façade est trop lointaine
const LARGEUR = 720;        // largeur de travail du panoramique réduit
const SECTEUR = 18;         // largeur angulaire échantillonnée, en degrés

const M_LAT = 111320;
const COS = Math.cos(((S + N) / 2) * Math.PI / 180);
const M_LON = M_LAT * COS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Lecture d'un TIFF RGB non compressé ---------------------------------
function lireTIFF(chemin) {
  const buf = readFileSync(chemin);
  const be = buf[0] === 0x4d;
  const u16 = (o) => (be ? buf.readUInt16BE(o) : buf.readUInt16LE(o));
  const u32 = (o) => (be ? buf.readUInt32BE(o) : buf.readUInt32LE(o));
  const ifd = u32(4);
  const n = u16(ifd);
  const tags = new Map();
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    const val = (type === 3 && count === 1) ? u16(e + 8) : u32(e + 8);
    tags.set(tag, { type, count, val });
  }
  const w = tags.get(256).val, h = tags.get(257).val;
  const spp = tags.get(277)?.val ?? 3;
  if ((tags.get(259)?.val ?? 1) !== 1) throw new Error('TIFF compressé');
  const t273 = tags.get(273);
  const offs = t273.count === 1 ? [t273.val]
    : Array.from({ length: t273.count }, (_, k) => u32(t273.val + 4 * k));
  return { w, h, spp, data: buf, offset: offs[0] };
}

// Couleur moyenne d'une fenêtre rectangulaire de l'image.
function couleurZone(img, x0, x1, y0, y1) {
  let r = 0, g = 0, b = 0, n = 0;
  const { w, spp, data, offset } = img;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const xx = ((x % w) + w) % w;
      const p = offset + (y * w + xx) * spp;
      r += data[p]; g += data[p + 1]; b += data[p + 2]; n++;
    }
  }
  if (!n) return null;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// --- Collecte des prises de vue ------------------------------------------
process.stderr.write(`Recherche des photos (${DIV}x${DIV} tuiles)...\n`);
const photos = new Map();
for (let i = 0; i < DIV; i++) {
  for (let j = 0; j < DIV; j++) {
    const s = S + ((N - S) * i) / DIV, n = S + ((N - S) * (i + 1)) / DIV;
    const w = W + ((E - W) * j) / DIV, e = W + ((E - W) * (j + 1)) / DIV;
    try {
      const r = await fetch(`${API}/search?bbox=${w},${s},${e},${n}&limit=1000`,
        { headers: { Accept: 'application/json' } });
      if (!r.ok) continue;
      const jj = await r.json();
      for (const f of jj.features ?? []) {
        const c = f.geometry?.coordinates;
        if (!c) continue;
        const fov = f.properties?.['pers:interior_orientation']?.field_of_view ?? 0;
        // Seuls les vrais panoramiques permettent de déduire l'azimut de la
        // colonne du pixel. Les photos à champ étroit sont écartées.
        if (fov < 300) continue;
        const url = f.assets?.sd?.href ?? f.assets?.hd?.href;
        if (!url) continue;
        photos.set(f.id, { lon: c[0], lat: c[1], url });
      }
    } catch { /* tuile ignorée */ }
    await sleep(120);
  }
  process.stderr.write(`  ligne ${i + 1}/${DIV} : ${photos.size} photos\n`);
}
const liste = [...photos.values()];
process.stderr.write(`${liste.length} panoramiques exploitables\n`);

const CELL = 0.0006;
const index = new Map();
for (const p of liste) {
  const k = `${Math.floor(p.lon / CELL)},${Math.floor(p.lat / CELL)}`;
  if (!index.has(k)) index.set(k, []);
  index.get(k).push(p);
}

// --- Association bâtiment -> meilleure prise de vue ----------------------
const { batiments } = JSON.parse(
  readFileSync(new URL('../public/data/artix-bdtopo.json', import.meta.url), 'utf8'));

const besoins = new Map();   // url -> [{idx, azimut, dist}]
let sansPhoto = 0;

for (let idx = 0; idx < batiments.length; idx++) {
  const b = batiments[idx];
  let clon = 0, clat = 0;
  for (const [lo, la] of b.pts) { clon += lo; clat += la; }
  clon /= b.pts.length; clat /= b.pts.length;

  const ci = Math.floor(clon / CELL), cj = Math.floor(clat / CELL);
  let meilleure = null, dMin = Infinity;
  for (let a = -1; a <= 1; a++) {
    for (let c = -1; c <= 1; c++) {
      for (const p of index.get(`${ci + a},${cj + c}`) ?? []) {
        const dx = (p.lon - clon) * M_LON, dy = (p.lat - clat) * M_LAT;
        const d = Math.hypot(dx, dy);
        // Sous 4 m, la caméra est collée au mur : le cadrage ne montre plus
        // la façade mais une portion floue et surexposée.
        if (d < dMin && d >= 4 && d <= DIST_MAX) { dMin = d; meilleure = p; }
      }
    }
  }
  if (!meilleure) { sansPhoto++; continue; }

  // Azimut depuis la caméra vers le bâtiment, en degrés depuis le nord.
  const az = ((Math.atan2((clon - meilleure.lon) * M_LON,
    (clat - meilleure.lat) * M_LAT) * 180) / Math.PI + 360) % 360;
  if (!besoins.has(meilleure.url)) besoins.set(meilleure.url, []);
  besoins.get(meilleure.url).push({ idx, az, d: dMin });
}

process.stderr.write(`${besoins.size} photos à télécharger pour `
  + `${[...besoins.values()].reduce((s, v) => s + v.length, 0)} bâtiments\n`);

// --- Échantillonnage ------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'artix-facades-'));
const jpg = join(tmp, 'p.jpg');
const tif = join(tmp, 'p.tiff');

const facades = [];
let n = 0, echecs = 0;

for (const [url, cibles] of besoins) {
  n++;
  if (n % 25 === 0) {
    process.stderr.write(`  ${n}/${besoins.size} photos, ${facades.length} façades\n`);
  }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'ArtixRacer/1.0' } });
    if (!r.ok) { echecs++; continue; }
    writeFileSync(jpg, Buffer.from(await r.arrayBuffer()));
    execFileSync('sips', ['-Z', String(LARGEUR), jpg, '--out', jpg], { stdio: 'ignore' });
    execFileSync('sips', ['-s', 'format', 'tiff', '-s', 'formatOptions', 'none',
      jpg, '--out', tif], { stdio: 'ignore' });
    const img = lireTIFF(tif);

    // Correction d'exposition, mesurée LOCALEMENT.
    //
    // Les prises de vue datent de janvier, souvent à contre-jour : sur un même
    // panoramique, le parking au soleil ressort à 215 de luminance médiane
    // quand la façade opposée est à 57. Un facteur global calculé sur toute
    // l'image est donc structurellement faux : il ne corrige ni l'une ni
    // l'autre. La référence est prise dans un voisinage angulaire de la façade
    // visée, ce qui suit l'éclairement réel de cette portion de rue.
    const refLocale = (cx) => {
      const y0 = Math.round(img.h * 0.42), y1 = Math.round(img.h * 0.52);
      // Fenêtre de +/- 40 degrés autour de la direction visée.
      const demiFen = Math.round((40 / 360) * img.w);
      const vals = [];
      for (let y = y0; y < y1; y += 2) {
        for (let dx = -demiFen; dx <= demiFen; dx += 3) {
          const x = ((Math.round(cx + dx) % img.w) + img.w) % img.w;
          const p = img.offset + (y * img.w + x) * img.spp;
          const r = img.data[p], g = img.data[p + 1], b = img.data[p + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          // Le ciel et les nuages fausseraient la mesure : on écarte le bleu
          // dominant et tout ce qui frôle la saturation.
          if (b > r * 1.18 && l > 110) continue;
          if (l > 246 || l < 20) continue;
          vals.push(l);
        }
      }
      if (vals.length < 40) return null;
      vals.sort((a, b) => a - b);
      return vals[Math.floor(vals.length * 0.9)];
    };
    // Teinte visée pour les surfaces claires d'une rue d'Artix : crépi blanc
    // cassé au jour. Le gain est borné pour ne pas délaver une portion déjà
    // bien exposée ni amplifier le bruit d'une zone très sombre.
    const CIBLE_BLANC = 200;

    for (const c of cibles) {
      // Sur un équirectangulaire, la colonne est proportionnelle à l'azimut.
      const centre = (c.az / 360) * img.w;
      const demi = (SECTEUR / 360) * img.w / 2;
      // Bande verticale. Sur un équirectangulaire, la ligne médiane est
      // l'horizon. Le profil relevé sur les photos d'Artix montre une fenêtre
      // utile étroite : au-dessus de 0,44 on attrape le ciel d'hiver, en
      // dessous de 0,51 l'ombre bleutée de la chaussée. Entre les deux, la
      // façade. Viser plus haut ou plus bas ramenait une dominante bleue dans
      // 57 % des relevés.
      const y0 = Math.round(img.h * 0.44);
      const y1 = Math.round(img.h * 0.51);
      const col = couleurZone(img, Math.round(centre - demi), Math.round(centre + demi), y0, y1);
      if (!col) continue;
      // Gain propre à cette direction de visée, et non à la photo entière.
      const ref = refLocale(centre);
      const gain = ref ? Math.max(1, Math.min(2.6, CIBLE_BLANC / ref)) : 1;
      // Correction appliquée avant tout test : les seuils de rejet portent
      // ainsi sur la teinte corrigée, celle qui sera effectivement rendue.
      const [rr, gg, bb] = col.map((v) => Math.min(255, Math.round(v * gain)));

      // Rejets : une zone très sombre est une ombre ou un véhicule, une zone
      // très claire un ciel surexposé. Ni l'une ni l'autre n'est une façade.
      const lum = (rr * 0.299 + gg * 0.587 + bb * 0.114) / 255;
      if (lum < 0.12 || lum > 0.97) continue;
      // Une dominante verte franche signale de la végétation devant le mur.
      if (gg > rr * 1.12 && gg > bb * 1.12) continue;
      // Une dominante bleue est du ciel : aucun enduit, aucune pierre et aucune
      // tuile d'Artix n'est plus bleue que rouge. Les ardoises grises passent,
      // leur écart entre canaux restant faible.
      if (bb > rr * 1.14) continue;

      // Confiance : décroît avec la distance, chute si la teinte est extrême.
      const q = Math.max(0, Math.min(1,
        (1 - (c.d - 4) / (DIST_MAX - 4)) * (lum > 0.2 && lum < 0.9 ? 1 : 0.5)));

      facades.push({ i: c.idx, c: (rr << 16) | (gg << 8) | bb, q: +q.toFixed(2) });
    }
  } catch { echecs++; }
  await sleep(60);
}

rmSync(tmp, { recursive: true, force: true });

writeFileSync(
  new URL('../public/data/artix-facades.json', import.meta.url),
  JSON.stringify({
    source: 'Panoramax IGN, Licence Ouverte 2.0, teintes relevées sur les '
      + 'panoramiques 360° de janvier 2025',
    index: 'position dans artix-bdtopo.json',
    facades,
  }),
);

console.log('bâtiments        :', batiments.length);
console.log('sans photo       :', sansPhoto);
console.log('photos traitées  :', n, '| échecs :', echecs);
console.log('façades relevées :', facades.length,
  `(${(100 * facades.length / batiments.length).toFixed(1)}%)`);
const fiables = facades.filter((f) => f.q >= 0.35).length;
console.log('dont fiables (q >= 0,35) :', fiables,
  `(${(100 * fiables / batiments.length).toFixed(1)}%)`);
