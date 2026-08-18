// Exploitation des données BD TOPO de l'IGN pour les bâtiments d'Artix.
//
// OpenStreetMap ne fournit à Artix que des emprises cadastrales : ni hauteur,
// ni matériau. La BD TOPO apporte pour chaque bâtiment sa hauteur mesurée par
// photogrammétrie, l'altitude du sol et du toit, le nombre d'étages et les
// matériaux de murs et de couverture issus des fichiers fonciers MAJIC.
import { project } from './osm.js';

// --- Nomenclature MAJIC des matériaux de gros murs (variable dmatgm) -------
// Le premier chiffre porte le matériau dominant, le second un matériau
// secondaire. On ne retient que le dominant.
function materiauMur(code) {
  if (!code) return null;
  const c = String(code).padStart(2, '0');
  const dominant = c[0] === '0' ? c[1] : c[0];
  switch (dominant) {
    case '1': return 'pierre';
    case '2': return 'meuliere';
    case '3': return 'beton';
    case '4': return 'brique';
    case '5': return 'agglomere';
    case '6': return 'bois';
    default: return null;
  }
}

// --- Nomenclature MAJIC des matériaux de couverture (variable dmatto) ------
function materiauToit(code) {
  if (!code) return null;
  const c = String(code).padStart(2, '0');
  const dominant = c[0] === '0' ? c[1] : c[0];
  switch (dominant) {
    case '1': return 'tuile';
    case '2': return 'ardoise';
    case '3': return 'zinc';
    case '4': return 'beton';
    default: return null;
  }
}

// Couleurs de façade par matériau réel. Chaque matériau propose plusieurs
// nuances : deux maisons voisines en agglomérés enduits ne sont jamais
// exactement de la même teinte.
// Teintes calées sur les photographies du bourg (Wikimedia Commons, CC BY-SA,
// Jean Michel Etchecolonea) : les façades d'Artix sont nettement plus claires
// que la palette beige du bâti béarnais traditionnel. Le blanc cassé et le
// crème dominent, y compris sur les maisons anciennes.
export const TEINTES_MUR = {
  pierre:    [0xd8d2c4, 0xe0dacd, 0xcec7b8, 0xd4cdbe],  // pierre enduite, ton clair
  meuliere:  [0xc4b6a0, 0xcfc2ad, 0xb9ab95],
  beton:     [0xd2d2ce, 0xdcdcd8, 0xc8c8c4],
  brique:    [0xb0705a, 0xbd7c64, 0xa46752, 0xb67560],
  // Enduit clair : la teinte la plus répandue dans le bourg, du blanc au crème.
  agglomere: [0xeceae2, 0xf2f0ea, 0xe3e0d6, 0xf6f4ef, 0xe8e4da],
  bois:      [0x9a7c58, 0xa68862, 0x8d7050],
  // Défaut : blanc cassé, dominante réelle des rues d'Artix.
  defaut:    [0xeeece5, 0xf4f2ec, 0xe6e3d9, 0xeae7de, 0xf0eee7],
};

// Couleurs de couverture par matériau réel.
// Les photographies du bourg montrent une tuile plus terne et plus brune que
// la tuile canal vive du Sud, et beaucoup d'ardoise grise en centre-ville.
export const TEINTES_TOIT = {
  tuile:   [0x9a5940, 0xa66348, 0x8c5039, 0xb06d52, 0x94573e, 0x7f4a36],
  ardoise: [0x555b62, 0x60666d, 0x4b5158, 0x6a7078],
  zinc:    [0x8d9298, 0x979ca2, 0x83888e],
  beton:   [0x8a8a86, 0x94948f, 0x807f7c],
  defaut:  [0x9a5940, 0xa66348, 0x8c5039],
};

// Aire d'un polygone en coordonnées projetées.
function aire(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(a / 2);
}

// Bruit déterministe : la ville doit être identique à chaque lancement.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

const RAYON_MAX = 1800;   // au-delà, les bâtiments ne sont jamais vus de près

// `toitures` : relevé LiDAR HD indexé sur la position dans `raw.batiments`.
// Chaque entrée donne la forme mesurée de la couverture (plate, deux pans ou
// croupe), l'écart gouttière-faîtage et l'orientation du faîtage.
// Bâtiments modélisés à la main dans `landmarks.js`, à écarter de l'extrusion
// automatique : leur silhouette réelle (bandeaux, marquises, monopente) ne se
// déduit pas d'une emprise et d'une hauteur moyenne. Indices BD TOPO.
export const BATIMENTS_MODELISES = new Set([
  2150,   // barre de logements « Pyrénées », avenue Edmond Rostand
  1128,   // Leclerc Express du centre-bourg, dans les murs de l'ancien Intermarché
]);

export function parseBDTopo(raw, toitures = null, facades = null) {
  const batiments = [];
  let altSomme = 0, altN = 0;

  const parIndex = new Map();
  // Deux formats de relevé LiDAR coexistent. L'ancien (`artix-toitures.json`)
  // classait la couverture en trois catégories avec un cap de faîtage. Le
  // nouveau (`artix-toits-lidar.json`) mesure en plus la hauteur de gouttière
  // et de faîtage sur la grille MNS moins MNT, ce qui donne la hauteur de
  // couverture sans passer par les altitudes BD TOPO, lesquelles mélangent la
  // déclivité du sol.
  //
  // On normalise vers la forme attendue par le rendu : `t` la forme, `c` le cap
  // du faîtage en radians, `f` la hauteur de couverture en mètres.
  for (const t of toitures?.toitures ?? []) parIndex.set(t.i, t);
  for (const t of toitures?.toits ?? []) {
    // L'azimut est mesuré sur la grille LiDAR, dont l'axe des Y descend vers
    // le sud. Le repère du jeu a la même orientation (`project` pose
    // z = -(lat - origine), donc Z croît vers le sud) : l'angle se transpose
    // directement, une négation ferait pivoter chaque faîtage d'un quart de
    // tour.
    // `g` gouttière et `f` faîtage, dans les mêmes rôles que l'ancien relevé :
    // le rendu calcule lui-même leur écart. Fournir un écart déjà fait dans `f`
    // en omettant `g` produisait un `NaN` silencieux qui cassait la géométrie
    // de toiture.
    parIndex.set(t.i, {
      i: t.i,
      t: t.f,
      c: (t.a * Math.PI) / 180,
      g: t.g,
      f: t.s,
    });
  }

  // Teintes de façade relevées sur les photographies. En dessous de 0,35 de
  // confiance, la mesure repose sur une vue unique et rasante : la palette par
  // matériau reste plus sûre.
  const teintes = new Map();
  for (const f of facades?.facades ?? []) {
    if ((f.q ?? 0) >= 0.35) teintes.set(f.i, f.c);
  }

  raw.batiments.forEach((b, i) => {
    if (!b.pts || b.pts.length < 4) return;

    // Les coordonnées BD TOPO sont en [lon, lat] : on les projette dans le
    // repère métrique local du jeu.
    const pts = b.pts.map(([lon, lat]) => project(lat, lon));
    // Le premier et le dernier point sont confondus sur un anneau fermé.
    const contour = pts.slice(0, -1);
    if (contour.length < 3) return;

    const [x0, z0] = contour[0];
    if (Math.hypot(x0, z0) > RAYON_MAX) return;

    const surface = aire(contour);
    if (surface < 9) return;

    // Écarté : ce bâtiment est construit à la main dans `landmarks.js`.
    if (BATIMENTS_MODELISES.has(i)) return;

    // Hauteur : mesurée quand elle existe, sinon déduite des étages, sinon
    // estimée depuis l'emprise au sol.
    let hauteur = b.h;
    if (!hauteur && b.etages) hauteur = b.etages * 2.9 + 1.2;
    if (!hauteur) {
      hauteur = surface < 25 ? 2.6 : surface < 60 ? 3.4
        : surface < 120 ? 5.8 : surface < 250 ? 7.0
        : surface < 600 ? 8.2 : 9.4;
    }
    // Les hauteurs BD TOPO vont jusqu'au faîtage : on retranche la toiture
    // pour obtenir l'égout, à partir duquel les pans sont reconstruits.
    const pente = b.zToitMax && b.zToitMin
      ? Math.max(0, b.zToitMax - b.zToitMin) : null;

    const murs = materiauMur(b.murs);
    const toit = materiauToit(b.toit);

    if (b.zSol != null) { altSomme += b.zSol; altN++; }

    batiments.push({
      pts: contour,
      surface,
      hauteur,
      penteToit: pente,
      etages: b.etages ?? null,
      murs, toit,
      nature: b.nature ?? null,
      usage: b.usage ?? null,
      leger: b.leger === true,
      zSol: b.zSol ?? null,
      graine: i,
      toiture: parIndex.get(i) ?? null,
      teinteMur: teintes.get(i) ?? null,
    });
  });

  // Altitude moyenne du bourg : sert de référence pour poser le terrain.
  const altRef = altN ? altSomme / altN : 0;
  return { batiments, altRef };
}

// Choisit la teinte de façade d'un bâtiment d'après son matériau réel.
export function couleurMur(b) {
  // Teinte relevée sur les photographies de rue quand elle existe : c'est la
  // couleur réelle de l'enduit, là où le matériau MAJIC ne donne que la
  // matière. Les mesures peu fiables (une seule vue, incidence rasante) sont
  // écartées au chargement.
  if (b.teinteMur != null) return b.teinteMur;
  const palette = TEINTES_MUR[b.murs] ?? TEINTES_MUR.defaut;
  return palette[Math.floor(hash(b.graine) * palette.length)];
}

// Choisit la teinte de couverture d'après le matériau réel.
export function couleurToit(b) {
  // Les bâtiments industriels et agricoles sans matériau renseigné sont
  // couverts en bac acier, pas en tuile.
  let cle = b.toit;
  if (!cle) {
    cle = b.nature === 'Industriel, agricole ou commercial' || b.surface > 700
      ? 'zinc' : 'defaut';
  }
  const palette = TEINTES_TOIT[cle] ?? TEINTES_TOIT.defaut;
  return palette[Math.floor(hash(b.graine + 77) * palette.length)];
}
