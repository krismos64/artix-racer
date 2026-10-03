// Matières du bâti ordinaire (murs et toitures), depuis ambientCG (CC0).
//
//   node scripts/preparer-bati.mjs <dossier contenant Plaster003/ et RoofingTiles006/>
//
// Les cartes de couleur sont ramenées en NIVEAUX DE GRIS clairs : le jeu les
// multiplie par la couleur de chaque bâtiment (teinte Panoramax ou palette
// MAJIC pour les murs, couverture cadastrale pour les toits). Une texture
// colorée imposerait sa propre teinte à 3 500 bâtiments.
//
// Tuile canal (RoofingTiles006) : sa carte de couleur est presque unie
// (moyenne 78/255, écart 10), tout le relief des tuiles est dans l'occlusion
// ambiante et les normales. L'occlusion est donc multipliée dans la couleur,
// sinon les creux entre canaux disparaissent une fois teintés.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const A = process.argv[2];
const OUT = 'public/textures/bati';
mkdirSync(OUT, { recursive: true });

// Gris recentré sur une moyenne cible, contraste multiplié par `contraste`.
async function grisRecentre(entree, sortie, cible, contraste, taille) {
  const brut = await sharp(entree).greyscale().resize(taille, taille).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = brut;
  let somme = 0;
  for (const v of data) somme += v;
  const moyenne = somme / data.length;
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round(cible + (data[i] - moyenne) * contraste)));
  }
  await sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } })
    .jpeg({ quality: 85 }).toFile(sortie);
  console.log(sortie, 'moyenne', moyenne.toFixed(0), '->', cible);
}

const T = `${A}/RoofingTiles006/RoofingTiles006_1K-JPG`;
const P = `${A}/Plaster003/Plaster003_1K-JPG`;

// Tuile : couleur x occlusion, puis gris centré sur 200 avec contraste x 2,2
// (l'écart d'origine, 10/255, ne laissait lire aucun rang une fois teinté).
const tuileAo = await sharp(`${T}_Color.jpg`).greyscale()
  .composite([{ input: await sharp(`${T}_AmbientOcclusion.jpg`).greyscale().toBuffer(), blend: 'multiply' }])
  .toBuffer();
await grisRecentre(tuileAo, `${OUT}/tuile_couleur.jpg`, 200, 2.2, 1024);
await sharp(`${T}_NormalGL.jpg`).resize(1024, 1024).jpeg({ quality: 88 }).toFile(`${OUT}/tuile_normales.jpg`);

// Enduit : crépi blanc centré sur 242, contraste réduit (x 0,6) : le grain
// doit casser l'aplat sans tacher les façades claires. Centré sur 215 au
// premier essai, il grisait toutes les façades d'un cran (0,68 en linéaire
// contre près de 0,9 pour l'ancien crépi procédural).
await grisRecentre(`${P}_Color.jpg`, `${OUT}/enduit_couleur.jpg`, 242, 0.6, 1024);
await sharp(`${P}_NormalGL.jpg`).resize(1024, 1024).jpeg({ quality: 88 }).toFile(`${OUT}/enduit_normales.jpg`);
