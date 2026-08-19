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

// Filtrage anisotrope appliqué à toutes les textures de ce module.
//
// La valeur était figée à 4 ou 8 selon les textures, alors que le GPU du M4 en
// accepte 16. Le réglage se voit surtout sur les surfaces vues en fuyante, la
// chaussée en premier : sa texture se répète 34 fois, et sans anisotropie elle
// bave dès la vingtaine de mètres.
//
// Le renderer n'est pas accessible ici, et la capacité ne peut donc pas être
// lue directement. `poserAnisotropie` la reçoit une fois au démarrage, depuis
// main.js, et les textures construites ensuite s'y conforment. La valeur par
// défaut reste celle d'avant ce chantier : si l'appel n'a pas lieu, rien ne
// change.
let ANISOTROPIE = 8;

// Appelée une fois au démarrage, avec le minimum entre ce que le GPU accepte
// (`renderer.capabilities.getMaxAnisotropy()`) et le plafond du profil.
export function poserAnisotropie(valeur) {
  ANISOTROPIE = Math.max(1, Math.floor(valeur));
  return ANISOTROPIE;
}

export function anisotropie() {
  return ANISOTROPIE;
}

// Bruit de valeur lissé, base de tous les grains.
export function bruit(w, h, cellules, graine = 0) {
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

// Enrobé de chaussée.
//
// La version précédente posait un bruit blanc par pixel sur un aplat, plus
// deux bandes sombres à bords francs figurant les traces de roulement. Deux
// défauts se voyaient en conduite : le bruit blanc, sans structure à plus
// grande échelle, se lit comme du grain de capteur et non comme un
// revêtement ; et les bandes, alignées sur la texture, se répétaient tous les
// quatre mètres le long de la voie.
//
// Ici, quatre échelles de bruit superposées : la granulométrie fine du
// gravillon, une variation moyenne qui figure les reprises d'enrobé, une
// variation lente qui empêche le motif de se lire comme un carrelage, et un
// assombrissement des deux bandes de roulement, cette fois aux bords fondus.
//
// La texture reste centrée haut et de faible amplitude : elle est multipliée
// par la couleur du matériau, et un gris moyen finirait presque noir après le
// mappage de tons. C'est ce piège qui avait donné une chaussée huit fois trop
// sombre par le passé.
export function texturerEnrobe(taille = 512) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  // Gravillon, reprises d'enrobé, ondulation lente.
  const gravillon = bruit(taille, taille, 128, 7);
  const reprises = bruit(taille, taille, 14, 31);
  const lent = bruit(taille, taille, 4, 71);
  for (let y = 0; y < taille; y++) {
    // Bandes de roulement : deux zones un peu plus sombres, centrées sur les
    // passages de roues. Le profil est en cosinus et non en créneau, donc sans
    // arête visible au raccord de deux répétitions de la texture.
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const u = x / taille;
      // Deux creux, à un quart et trois quarts de la largeur du motif.
      const creux = (centre) => {
        const dd = Math.abs(u - centre);
        return dd > 0.11 ? 0 : Math.cos((dd / 0.11) * Math.PI * 0.5) ** 2;
      };
      const roulement = Math.max(creux(0.26), creux(0.74));

      // Base légèrement chaude : un enrobé vieilli tire vers le gris-beige, un
      // gris strictement neutre le fait paraître bleuté sous un ciel bleu.
      let v = 196
        + (gravillon(x, y) - 0.5) * 26
        + (reprises(x, y) - 0.5) * 17
        + (lent(x, y) - 0.5) * 12
        - roulement * 15;
      v = Math.max(0, Math.min(255, v));
      // Neutre à peine chaude : deux unités d'écart suffisent, au-delà
      // l'enrobé vire au brun.
      d[i] = Math.min(255, v + 3);
      d[i + 1] = v;
      d[i + 2] = Math.max(0, v - 3);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropie();
  return tex;
}

// Rugosité de chaussée. Un enrobé n'a pas une rugosité uniforme : les bandes
// de roulement sont polies par le trafic, les bords de voie restent grenus.
// Cette carte, branchée sur `roughnessMap`, donne à la lumière rasante de quoi
// varier le long d'une même rue, ce qu'une valeur scalaire ne peut pas faire.
//
// Elle est en niveaux de gris et lue en espace LINÉAIRE : une carte de
// rugosité porte une grandeur, pas une couleur, et la lire en sRGB fausserait
// son amplitude.
export function texturerRugositeEnrobe(taille = 256) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  const grain = bruit(taille, taille, 64, 19);
  const large = bruit(taille, taille, 9, 83);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const u = x / taille;
      const creux = (centre) => {
        const dd = Math.abs(u - centre);
        return dd > 0.11 ? 0 : Math.cos((dd / 0.11) * Math.PI * 0.5) ** 2;
      };
      // Poli dans les traces de roue, grenu ailleurs.
      const poli = Math.max(creux(0.26), creux(0.74));
      const v = 236 - poli * 40 + (grain(x, y) - 0.5) * 22 + (large(x, y) - 0.5) * 18;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = anisotropie();
  return tex;
}

// Normales de surface d'eau.
//
// Une nappe parfaitement plane rend comme du verre : elle prend le ciel d'un
// bloc et se lit comme une découpe de papier bleu posée sur le pré. Ces
// normales lui donnent une ondulation à deux échelles, la houle lente et la
// ride serrée, ce qui suffit à faire accrocher la lumière sans réflexion
// temps réel ni géométrie animée.
//
// Encodage classique : la normale, dont les composantes sont dans [-1, 1], est
// rangée dans [0, 255] par (n + 1) / 2. La texture est donc lue en espace
// LINÉAIRE, une normale n'étant pas une couleur.
export function texturerNormalesEau(taille = 256) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  const houle = bruit(taille, taille, 6, 13);
  const rides = bruit(taille, taille, 22, 47);
  // Hauteur en un point, combinaison des deux échelles.
  const hauteur = (x, y) => houle(x, y) * 0.72 + rides(x, y) * 0.28;
  // Le gradient est pris par différences finies sur le champ de hauteur : la
  // pente en X et en Y donne directement les deux premières composantes de la
  // normale, la troisième restant dominante puisque la surface est presque
  // plane.
  const PAS = 1;
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const gx = (hauteur(x + PAS, y) - hauteur(x - PAS, y)) * 3.2;
      const gy = (hauteur(x, y + PAS) - hauteur(x, y - PAS)) * 3.2;
      // Normale non normalisée puis ramenée à la longueur unité.
      const nx = -gx, ny = -gy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      d[i] = Math.round(((nx / l) * 0.5 + 0.5) * 255);
      d[i + 1] = Math.round(((ny / l) * 0.5 + 0.5) * 255);
      d[i + 2] = Math.round(((nz / l) * 0.5 + 0.5) * 255);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = anisotropie();
  return tex;
}

// Usure de la peinture routière. Une bande blanche neuve n'existe que le jour
// où elle est tracée : ensuite elle s'écaille, se salit et laisse par endroits
// transparaître l'enrobé. Cette texture module la clarté du marquage pour
// qu'il ne se lise pas comme un trait vectoriel uniforme.
//
// Amplitude contenue : le marquage doit rester nettement lisible en conduite,
// c'est lui qui cadre la voie. Il s'agit de casser l'aplat, pas d'effacer la
// ligne.
export function texturerUsureMarquage(taille = 128) {
  const c = canvas(taille);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(taille, taille);
  const d = img.data;
  const ecaillage = bruit(taille, taille, 40, 29);
  const salissure = bruit(taille, taille, 8, 61);
  for (let y = 0; y < taille; y++) {
    for (let x = 0; x < taille; x++) {
      const i = (y * taille + x) * 4;
      const v = 242 + (ecaillage(x, y) - 0.5) * 34 + (salissure(x, y) - 0.5) * 22;
      d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, v));
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropie();
  return tex;
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
  tex.anisotropy = anisotropie();
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
  tex.anisotropy = anisotropie();
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
  tex.anisotropy = anisotropie();
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
  tex.anisotropy = anisotropie();
  return tex;
}

// Carte de relief dérivée d'une texture de couleur : les matériaux Three.js
// acceptent une bumpMap en niveaux de gris, ce qui suffit à faire accrocher la
// lumière rasante sur le grain sans coût de mémoire notable.
//
// Le clone est repassé en espace LINÉAIRE. Une bumpMap ne porte pas une
// couleur mais une hauteur : lue en sRGB, elle subit la conversion gamma et
// son amplitude est faussée, les valeurs sombres du grain étant écrasées et
// les claires étirées. Réutiliser telle quelle la texture de couleur, qui est
// en sRGB à juste titre, revient à cette erreur.
export function relief(tex) {
  const r = tex.clone();
  r.colorSpace = THREE.NoColorSpace;
  r.needsUpdate = true;
  return r;
}
