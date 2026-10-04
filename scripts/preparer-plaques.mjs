// Plaques de rue émaillées : atlas des noms de voies d'Artix.
//
//   node scripts/preparer-plaques.mjs <fond-de-plaque.png>
//
// Le fond (émail bleu, liseré blanc, rivets) est une image générée par
// Codex, SANS texte : un générateur d'images déforme les lettres, alors
// qu'une plaque ne vaut que si le nom est exact. Le nom est donc écrit ici,
// en SVG rendu par sharp, à partir des données OSM.
//
// L'ordre des cases est l'ordre alphabétique des noms de voies carrossables
// tels que les donne parseOSM : world.js recalcule exactement la même liste
// au lancement pour retrouver la case d'un nom.
import fs from 'node:fs';
import sharp from 'sharp';
import { parseOSM } from '../src/three-city/osm.js';

const FOND = process.argv[2];
const raw = JSON.parse(fs.readFileSync('public/data/artix-osm.json', 'utf8'));
const noms = [...new Set(parseOSM(raw).roads.filter((r) => r.drivable && r.name).map((r) => r.name))].sort();

const CW = 256, CH = 86, PAR_RANG = 8;
const W = CW * PAR_RANG, H = Math.ceil(noms.length / PAR_RANG) * CH;
const fond = await sharp(FOND).resize(CW, CH, { fit: 'fill' }).png().toBuffer();

const echapper = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Type de voie en petites capitales sur la première ligne, le reste en grand
// dessous : la mise en page des plaques françaises.
const TYPES = /^(Rue|Avenue|Chemin|Impasse|Place|Allée|Route|Boulevard|Cité|Lotissement|Quai|Passage|Rond-Point|Square|Voie)\s+(.*)$/i;
const calques = noms.map((nom, k) => {
  const m = nom.match(TYPES);
  const haut = m ? m[1].toUpperCase() : '';
  const bas = m ? m[2] : nom;
  // Corps ajusté à la largeur utile (220 px) : environ 0,56 em par signe en
  // graisse condensée.
  const corps = Math.max(11, Math.min(26, Math.floor(220 / (bas.length * 0.56))));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH}">
    <style>text{font-family:'Helvetica Neue','Arial Narrow',Arial,sans-serif;fill:#f4f2ea;text-anchor:middle;font-weight:700}</style>
    ${haut ? `<text x="${CW / 2}" y="${haut ? 30 : 0}" font-size="13" letter-spacing="2">${echapper(haut)}</text>` : ''}
    <text x="${CW / 2}" y="${haut ? 30 + 8 + corps * 0.9 : CH / 2 + corps * 0.35}" font-size="${corps}">${echapper(bas)}</text>
  </svg>`;
  return [
    { input: fond, left: (k % PAR_RANG) * CW, top: Math.floor(k / PAR_RANG) * CH },
    { input: Buffer.from(svg), left: (k % PAR_RANG) * CW, top: Math.floor(k / PAR_RANG) * CH },
  ];
}).flat();

await sharp({ create: { width: W, height: H, channels: 3, background: '#1a2a6c' } })
  .composite(calques).jpeg({ quality: 88 }).toFile('public/textures/facades/plaques.jpg');
console.log(noms.length, 'plaques, atlas', W, 'x', H);
