// Textures de surface générées à la volée.
//
// Sans texture, une chaussée est un aplat gris et une façade un aplat beige :
// c'est ce qui fait qu'une scène « sent » la maquette, bien avant la qualité
// de l'éclairage. Un grain, même simple, donne à l'œil de quoi accrocher et
// révèle le relief sous la lumière rasante.
//
// Les textures sont dessinées sur canvas plutôt que chargées : quelques
// kilo-octets de code remplacent des mégaoctets d'images, et elles restent
// nettes à toute distance.
import * as THREE from 'three';

// Bruit de valeur lissé, base de tous les grains.
function bruit(w, h, cellules, graine = 0) {
  const g = new Float32Array((cellules + 1) * (cellules + 1));
  let s = graine * 9301 + 49297;
  for (let i = 0; i < g.length; i++) {
    s = (s * 9301 + 49297) % 233280;
    g[i] = s / 233280;
  }
  const val = (x, y) => {
    const fx = x * cellules / w, fy = y * cellules / h;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    // Interpolation en cosinus : évite les arêtes visibles du bilinéaire.
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const i00 = g[iy * (cellules + 1) + ix] ?? 0.5;
    const i10 = g[iy * (cellules + 1) + ix + 1] ?? 0.5;
    const i01 = g[(iy + 1) * (cellules + 1) + ix] ?? 0.5;
    const i11 = g[(iy + 1) * (cellules + 1) + ix + 1] ?? 0.5;
    return (i00 * (1 - sx) + i10 * sx) * (1 - sy) + (i01 * (1 - sx) + i11 * sx) * sy;
  };
  return val;
}

function canvas(taille) {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  return c;
}

// Enduit de façade : crépi taloché, avec de légères coulures verticales.
export function texturerEnduit(taille = 256) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  const crepi = bruit(taille, taille, 64, 13);
  const large = bruit(taille, taille, 5, 53);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const g = crepi(x, y);
      const l = large(x, y);
      // La texture est multipliée par la couleur du sommet : centrée sur le
      // blanc, elle module la teinte relevée sur les photos sans l'assombrir.
      // Amplitude faible, sinon le grain écrase les écarts entre bâtiments et
      // donne un aspect sale.
      const v = 246 + (g - 0.5) * 16 + (l - 0.5) * 9;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Couverture en tuile canal : le rythme des rangs, très lisible de loin, est
// ce qui identifie une toiture du Sud-Ouest.
export function texturerTuile(taille = 256) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  const grain = bruit(taille, taille, 48, 23);
  const veine = bruit(taille, taille, 6, 67);
  // Le rang de tuiles : une onde régulière, plus une variation par tuile.
  const PAS = taille / 8;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      // Profil de la tuile canal : creux et bourrelet
      const p = (x % PAS) / PAS;
      const onde = Math.sin(p * Math.PI) * 0.5 + 0.5;
      // Centrée sur le blanc comme l'enduit : la teinte de couverture vient
      // du matériau réel, la texture n'apporte que le rythme des rangs.
      const v = 232 + onde * 23 + (grain(x, y) - 0.5) * 14 + (veine(x, y) - 0.5) * 12;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Pavés de placette. Le centre-bourg d'Artix est pavé autour du carrefour de
// la mairie : une trame régulière de blocs rectangulaires posés en quinconce,
// avec des joints marqués et une teinte qui varie d'un pavé à l'autre.
//
// Relevé sur photographie de rue : à l'ombre, le pavé mesure 0,36 fois la
// clarté de l'enrobé voisin, avec une dominante légèrement plus chaude
// (R 0,369 contre 0,360 en chromaticité).
export function texturerPave(taille = 256) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  const grain = bruit(taille, taille, 64, 41);
  // Trame : 6 pavés en largeur, 12 rangs, décalés d'un demi-pavé un rang sur
  // deux, comme un appareil à bâtons rompus classique.
  const LARG = taille / 6;
  const HAUT = taille / 12;
  const JOINT = Math.max(1.5, taille / 110);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const rang = Math.floor(y / HAUT);
      // Un rang sur deux est décalé : sans ce quinconce, la trame se lit comme
      // un carrelage et non comme un pavage.
      const decal = (rang % 2) * LARG * 0.5;
      const xLocal = ((x + decal) % LARG);
      const yLocal = y % HAUT;
      // Identifiant du pavé, pour lui donner sa teinte propre.
      const col = Math.floor((x + decal) / LARG);
      const teinte = ((col * 7 + rang * 13) % 11) / 11;

      const surJoint = xLocal < JOINT || yLocal < JOINT;
      // Base claire : la texture est multipliée par la couleur du matériau,
      // comme l'asphalte et la tuile. Un gris moyen finirait noir.
      let v = surJoint ? 150 : 205 + teinte * 34;
      // Bombement du pavé : les bords s'assombrissent légèrement.
      if (!surJoint) {
        const bordX = Math.min(xLocal - JOINT, LARG - xLocal) / (LARG * 0.5);
        const bordY = Math.min(yLocal - JOINT, HAUT - yLocal) / (HAUT * 0.5);
        v -= (1 - Math.min(1, Math.min(bordX, bordY))) * 22;
      }
      v += (grain(x, y) - 0.5) * 20;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Écorce : cannelures verticales et plaques de desquamation.
//
// Rendue en niveaux de gris, la teinte étant portée par la couleur d'instance
// de chaque arbre (brun sombre des feuillus, gris-vert des platanes). Le grain
// est fortement étiré en hauteur : sur un tronc, les fissures suivent l'axe et
// un bruit isotrope donnerait une peau de crapaud.
export function texturerEcorce(taille = 256) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  // Trois échelles : cannelures serrées, plaques larges, grain fin.
  const cannelures = bruit(taille, taille, 26, 17);
  const plaques = bruit(taille, taille, 7, 53);
  const grain = bruit(taille, taille, 90, 91);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      // Étirement dans l'axe du tronc : c'est la coordonnée X (le tour de
      // tronc) qu'il faut resserrer pour que les motifs s'allongent en Y.
      // Écraser Y produisait l'inverse, des bandes en travers du fût.
      const cn = cannelures(x * 3.2, y * 0.32);
      const pl = plaques(x * 1.8, y * 0.55);
      const gr = grain(x * 2.4, y * 0.7);
      // Les cannelures sont creusées plutôt que lissées : on accentue les
      // valeurs basses pour obtenir des sillons nets et non un dégradé mou.
      const sillon = Math.pow(cn, 1.7);
      // Centrée haut et d'amplitude modérée : la texture module la couleur
      // d'instance sans l'assombrir ni l'éclaircir en moyenne. Une base à 150
      // aurait divisé par deux la teinte de chaque tronc.
      const v = 210 + (sillon - 0.5) * 78 + (pl - 0.5) * 38 + (gr - 0.5) * 22;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Carte de relief dérivée d'une texture de couleur : les matériaux Three.js
// acceptent une bumpMap en niveaux de gris, ce qui suffit à faire accrocher la
// lumière rasante sur le grain sans coût de mémoire notable.
export function relief(tex) {
  const r = tex.clone();
  r.needsUpdate = true;
  return r;
}
