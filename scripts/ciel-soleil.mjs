// Outil de préparation des ciels HDRI (Poly Haven, CC0).
//
//   node scripts/ciel-soleil.mjs entree.hdr [exposition] [sortie.hdr] [plafond]
//
// 1. Lit un fichier Radiance .hdr (RGBE, scanlines RLE) et repère la
//    direction la plus lumineuse : le soleil (ou la lune). Le résultat est
//    imprimé en JSON : `azimutImageDeg` est l'angle du soleil dans le
//    panorama (0 = colonne de gauche, croissant vers la droite),
//    `elevationDeg` sa hauteur. main.ts s'en sert pour orienter le
//    panorama et la lumière directionnelle d'un même mouvement.
// 2. Écrit un aperçu JPG tone-mappé (largeur 1 024) à côté de l'entrée,
//    lisible pour choisir un ciel.
// 3. Si `sortie.hdr` est donné, réécrit le panorama avec sa luminance
//    PLAFONNÉE à `plafond` (12 par défaut). Sans plafond, le disque solaire
//    (71 000 fois la luminance du ciel) entre dans l'éclairage d'ambiance
//    précalculé et éclaire tout SANS ombre, en doublant la lumière
//    directionnelle qui, elle, en porte. Plafonné, le soleil du panorama ne
//    pèse plus rien dans l'ambiance ; il reste éblouissant à l'écran, le
//    tone mapping saturant bien avant 12.
import fs from 'node:fs';
import sharp from 'sharp';

const [entree, expoArg, sortie, plafondArg] = process.argv.slice(2);
if (!entree) {
  console.error('usage : node scripts/ciel-soleil.mjs entree.hdr [exposition] [sortie.hdr] [plafond]');
  process.exit(1);
}
const exposition = Number(expoArg ?? 1);
const plafond = Number(plafondArg ?? 12);

// ---- Lecture RGBE ---------------------------------------------------------
const buf = fs.readFileSync(entree);
let p = 0;
const ligne = () => {
  let s = '';
  while (buf[p] !== 10) s += String.fromCharCode(buf[p++]);
  p++;
  return s;
};
let l;
do { l = ligne(); } while (l !== '');
const dims = ligne().match(/-Y (\d+) \+X (\d+)/);
const H = Number(dims[1]), W = Number(dims[2]);
const data = new Float32Array(W * H * 3);
const scan = new Uint8Array(W * 4);
for (let y = 0; y < H; y++) {
  if (buf[p] === 2 && buf[p + 1] === 2 && ((buf[p + 2] << 8) | buf[p + 3]) === W) {
    p += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let n = buf[p++];
        if (n > 128) {
          n -= 128;
          const v = buf[p++];
          for (let i = 0; i < n; i++) scan[(x++) * 4 + c] = v;
        } else {
          for (let i = 0; i < n; i++) scan[(x++) * 4 + c] = buf[p++];
        }
      }
    }
  } else {
    for (let x = 0; x < W * 4; x++) scan[x] = buf[p++];
  }
  for (let x = 0; x < W; x++) {
    const e = scan[x * 4 + 3];
    const f = e ? Math.pow(2, e - 136) : 0;
    const i = (y * W + x) * 3;
    data[i] = scan[x * 4] * f;
    data[i + 1] = scan[x * 4 + 1] * f;
    data[i + 2] = scan[x * 4 + 2] * f;
  }
}

// ---- Soleil : centroïde des pixels au-dessus de la moitié du maximum ------
let max = 0;
for (let i = 0; i < W * H; i++) max = Math.max(max, data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]);
let sx = 0, sy = 0, sw = 0, moyenne = 0;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    const L = data[i] + data[i + 1] + data[i + 2];
    moyenne += L;
    if (L > max * 0.5) { sx += x * L; sy += y * L; sw += L; }
  }
}
const u = sx / sw / W, v = sy / sw / H;
console.log(JSON.stringify({
  fichier: entree, largeur: W, hauteur: H,
  luminanceMax: max / 3, luminanceMoyenne: moyenne / 3 / (W * H),
  soleilU: u, soleilV: v,
  azimutImageDeg: u * 360, elevationDeg: 90 - v * 180,
}));

// ---- Aperçu tone-mappé (Reinhard, gamma 2,2) ------------------------------
const apercu = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H * 3; i++) {
  const c = data[i] * exposition;
  apercu[i] = Math.round(Math.pow(c / (1 + c), 1 / 2.2) * 255);
}
await sharp(apercu, { raw: { width: W, height: H, channels: 3 } })
  .resize(1024).jpeg({ quality: 80 }).toFile(entree.replace(/\.hdr$/, '_apercu.jpg'));

// ---- Réécriture plafonnée, scanlines RLE ----------------------------------
if (sortie) {
  const morceaux = [Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H} +X ${W}\n`, 'ascii')];
  const canaux = [new Uint8Array(W), new Uint8Array(W), new Uint8Array(W), new Uint8Array(W)];
  const encoderCanal = (arr) => {
    const out = [];
    let x = 0;
    while (x < W) {
      let run = 1;
      while (x + run < W && arr[x + run] === arr[x] && run < 127) run++;
      if (run >= 4) {
        out.push(128 + run, arr[x]);
        x += run;
        continue;
      }
      // Séquence littérale : jusqu'à 128 octets, interrompue dès qu'une
      // plage répétée d'au moins 4 octets commence.
      const debut = x;
      let n = 0;
      while (x < W && n < 128) {
        let r = 1;
        while (x + r < W && arr[x + r] === arr[x] && r < 4) r++;
        if (r >= 4 && n > 0) break;
        x++;
        n++;
      }
      out.push(n);
      for (let i = debut; i < debut + n; i++) out.push(arr[i]);
    }
    return Buffer.from(out);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = Math.min(plafond, data[i]);
      const g = Math.min(plafond, data[i + 1]);
      const b = Math.min(plafond, data[i + 2]);
      const m = Math.max(r, g, b);
      if (m < 1e-32) {
        canaux[0][x] = canaux[1][x] = canaux[2][x] = canaux[3][x] = 0;
        continue;
      }
      const e = Math.floor(Math.log2(m)) + 1;
      const echelle = 256 / Math.pow(2, e);
      canaux[0][x] = Math.min(255, Math.floor(r * echelle));
      canaux[1][x] = Math.min(255, Math.floor(g * echelle));
      canaux[2][x] = Math.min(255, Math.floor(b * echelle));
      canaux[3][x] = e + 128;
    }
    morceaux.push(Buffer.from([2, 2, W >> 8, W & 255]));
    for (let c = 0; c < 4; c++) morceaux.push(encoderCanal(canaux[c]));
  }
  fs.writeFileSync(sortie, Buffer.concat(morceaux));
  console.log(`écrit ${sortie} (plafond ${plafond})`);
}
