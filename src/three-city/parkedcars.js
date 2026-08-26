// Véhicules en stationnement.
//
// Les photographies de rue d'Artix (Panoramax, Licence Ouverte) montrent des
// voitures garées partout : le long des trottoirs, devant les commerces, sur
// les places. C'est ce qui remplit visuellement une rue de bourg, et son
// absence se remarque immédiatement.
//
// Rendu par InstancedMesh : quelques centaines de véhicules ne coûtent que
// trois appels de dessin.
import * as THREE from 'three';

// Teintes réellement dominantes du parc automobile français : le blanc et le
// gris représentent plus de la moitié des immatriculations.
// Palette du parc français, pondérée par fréquence réelle : le blanc et les
// gris dominent, les couleurs vives restent rares mais présentes (c'est leur
// rareté qui les rend crédibles).
const COULEURS = [
  0xe8e9ea, 0xe8e9ea, 0xe8e9ea, 0xe8e9ea, 0xeceae2,   // blancs
  0xb9bcc0, 0x9a9ea3, 0x9a9ea3, 0x7c8085, 0x63666b,   // argents et gris
  0x2b2e33, 0x2b2e33, 0x1e2126,                        // noirs
  0x3d5a7a, 0x28405c, 0x8c9aa8, 0x4a7a9a,             // bleus
  0x7a2f2f, 0x9a3428, 0x5c2434,                        // rouges et bordeaux
  0x8a6a3a, 0xb8a888, 0x3f5f45, 0x6b7a3a,             // beiges et verts
  0xc27b2c, 0xc2a83a,                                  // orange et jaune, rares
];
// Les utilitaires sont blancs aux trois quarts, gris ou bleu artisan sinon.
const COULEURS_UTILITAIRE = [
  0xe8e9ea, 0xe8e9ea, 0xe8e9ea, 0xe8e9ea, 0xe8e9ea, 0xe8e9ea,
  0x9a9ea3, 0xb9bcc0, 0x3d5a7a,
];
// Deux-roues : noir dominant, quelques couleurs.
const COULEURS_SCOOTER = [0x232529, 0x232529, 0x2b2e33, 0x7a2f2f, 0xe8e9ea, 0x3d5a7a];

// Silhouettes du parc, choisies par tirage pondéré. Chaque type a sa
// géométrie propre : l'ancien gabarit unique étiré donnait 880 fois la même
// voiture à trois tailles.
const GABARITS = {
  //            demi-long  demi-larg  bas   ceinture  habitacle: L    l     haut  recul  hayon  parebrise  poids
  compacte:     { L: 1.80, W: 0.84, H0: 0.28, H1: 0.76, CL: 1.00, CW: 0.78, CH: 1.38, dz: 0.05,  tArK: 0.80, tAvK: 0.55, poids: 0.26 },
  berline:      { L: 2.25, W: 0.88, H0: 0.28, H1: 0.75, CL: 1.05, CW: 0.80, CH: 1.34, dz: -0.30, tArK: 0.72, tAvK: 0.62, poids: 0.20 },
  break:        { L: 2.20, W: 0.89, H0: 0.32, H1: 0.85, CL: 1.35, CW: 0.82, CH: 1.52, dz: -0.42, tArK: 0.94, tAvK: 0.60, poids: 0.24 },
  fourgonnette: { L: 2.05, W: 0.87, H0: 0.30, H1: 0.98, CL: 1.45, CW: 0.82, CH: 1.78, dz: -0.50, tArK: 0.97, tAvK: 0.66, poids: 0.15, utilitaire: true },
  fourgon:      { L: 2.55, W: 0.97, H0: 0.30, H1: 1.05, CL: 1.90, CW: 0.92, CH: 2.05, dz: -0.60, tArK: 0.98, tAvK: 0.70, poids: 0.09, utilitaire: true },
  scooter:      { poids: 0.06 },
};
function tirerType(graine) {
  let t = hash(graine);
  for (const [nom, g] of Object.entries(GABARITS)) {
    if (t < g.poids) return nom;
    t -= g.poids;
  }
  return 'berline';
}

// Demi-largeur d'un véhicule, en mètres. Une berline française fait 1,74 m
// hors rétroviseurs, ce qui sert de référence à tout le placement.
const DEMI_LARGEUR = 0.87;

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Types de voies où le stationnement latéral est plausible. Les routes de
// transit (`primary`, `secondary`) en sont exclues : personne ne se gare en
// pleine voie sur la départementale, et un véhicule à l'arrêt y gênerait la
// conduite du joueur.
const VOIES_STATIONNEMENT = new Set([
  'residential', 'unclassified', 'living_street', 'tertiary', 'service',
]);

// Une voiture garée ne doit pas se retrouver au milieu d'un carrefour. On
// repère les extrémités de voies, qui sont les points de raccordement.
function noeudsCarrefour(roads) {
  const compte = new Map();
  const cle = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  for (const r of roads) {
    if (!r.drivable) continue;
    for (const p of [r.pts[0], r.pts[r.pts.length - 1]]) {
      const k = cle(p[0], p[1]);
      compte.set(k, (compte.get(k) ?? 0) + 1);
    }
  }
  // Un point partagé par au moins deux voies est un carrefour.
  const pts = [];
  for (const [k, n] of compte) {
    if (n < 2) continue;
    const [x, z] = k.split(',').map(Number);
    pts.push([x, z]);
  }
  return pts;
}

// Indexe les emprises bâties dans une grille, pour tester rapidement si un
// point tombe dans une construction. Sans index, 900 places × 3 500 bâtiments
// représenteraient plus de trois millions de tests.
function indexerBatiments(buildings) {
  const CELL = 50;
  const grille = new Map();
  for (const b of buildings ?? []) {
    if (!b.pts || b.pts.length < 3) continue;
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of b.pts) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
    const boite = { minx, maxx, minz, maxz, pts: b.pts };
    for (let cx = Math.floor(minx / CELL); cx <= Math.floor(maxx / CELL); cx++) {
      for (let cz = Math.floor(minz / CELL); cz <= Math.floor(maxz / CELL); cz++) {
        const k = `${cx},${cz}`;
        if (!grille.has(k)) grille.set(k, []);
        grille.get(k).push(boite);
      }
    }
  }
  // Marge : le véhicule occupe une surface, pas un point. On teste son centre
  // avec une emprise légèrement dilatée.
  const MARGE = 1.6;
  return (x, z) => {
    const c = grille.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
    if (!c) return false;
    for (const b of c) {
      if (x < b.minx - MARGE || x > b.maxx + MARGE
        || z < b.minz - MARGE || z > b.maxz + MARGE) continue;
      // Test d'appartenance par lancer de rayon.
      let dedans = false;
      const p = b.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, zi] = p[i], [xj, zj] = p[j];
        if ((zi > z) !== (zj > z)
          && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dedans = !dedans;
      }
      if (dedans) return true;
    }
    return false;
  };
}

// Cherche les emplacements de stationnement le long des voies. Une place se
// justifie là où la rue est assez large pour qu'un véhicule à l'arrêt laisse
// passer la circulation.
function trouverPlaces(data, relief, roadY, passages = []) {
  const places = [];
  const carrefours = noeudsCarrefour(data.roads);
  // Les emprises des bâtiments modélisés à la main (Leclerc, gare, Poste…)
  // sont retirées de `buildings` mais restent des obstacles : sans elles, les
  // voitures se garaient à moitié dans la vitrine du Leclerc Express.
  const dansBatiment = indexerBatiments([
    ...(data.buildings ?? []),
    ...(data.emprisesModelisees ?? []),
  ]);

  // Grille des points à éviter (carrefours et passages piétons), pour ne pas
  // faire 600 × 800 comparaisons.
  const CELL = 25;
  const interdits = new Map();
  const ajouterInterdit = (x, z, rayon) => {
    const k = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!interdits.has(k)) interdits.set(k, []);
    interdits.get(k).push([x, z, rayon * rayon]);
  };
  for (const [x, z] of carrefours) ajouterInterdit(x, z, 9);
  for (const p of passages) ajouterInterdit(p.x, p.z, 6);

  // Zones SANS stationnement relevées sur photo : la dépose du collège Jean
  // Moulin, avenue de la 2ème Division Blindée (bordure dégagée sur toute la
  // longueur du préau, aucun véhicule au bord). Cercles le long de l'axe.
  const ZONES_SANS_STATIONNEMENT = [
    [-20, -202, 13], [-38, -204.5, 13], [-56, -207, 13],
    [-74, -209.5, 13], [-91, -212, 13],
  ];
  for (const [x, z, r] of ZONES_SANS_STATIONNEMENT) ajouterInterdit(x, z, r);

  // Emprises de stationnement : là où une aire OSM borde la voie, les véhicules
  // se rangent sur ses places marquées, en épi, et non le long de la chaussée.
  // Poser les deux produisait une double file, celle de rue occupant le bord de
  // l'asphalte pendant que les places en épi restaient vides plus loin.
  //
  // Constaté avenue du 18e Régiment d'Infanterie le 19/08/2026 : le panoramique
  // montre du stationnement perpendiculaire des deux côtés, le jeu affichait une
  // file continue dans l'axe, à 4,4 m du milieu de la voie.
  //
  // L'exclusion est inscrite dans TOUTES les cellules que l'emprise recouvre,
  // et non dans celle de son seul centre : `estInterdit` ne consulte que les
  // cellules voisines à plus ou moins une, soit 25 m, quand l'aire du Leclerc
  // porte un rayon de 48,8 m. Rangée au centre, elle serait invisible depuis
  // ses propres bords, précisément là où la voie la longe.
  for (const p of data.parkings ?? []) {
    if (p.station) continue;   // une station-service n'a pas de places
    let cx = 0, cz = 0;
    for (const [x, z] of p.pts) { cx += x; cz += z; }
    cx /= p.pts.length; cz /= p.pts.length;
    let rayon = 0;
    for (const [x, z] of p.pts) rayon = Math.max(rayon, Math.hypot(x - cx, z - cz));
    const portee = rayon + 4;
    const r2 = portee * portee;
    const ci0 = Math.floor((cx - portee) / CELL), ci1 = Math.floor((cx + portee) / CELL);
    const cj0 = Math.floor((cz - portee) / CELL), cj1 = Math.floor((cz + portee) / CELL);
    for (let ci = ci0; ci <= ci1; ci++) {
      for (let cj = cj0; cj <= cj1; cj++) {
        const k = `${ci},${cj}`;
        if (!interdits.has(k)) interdits.set(k, []);
        interdits.get(k).push([cx, cz, r2]);
      }
    }
  }

  const estInterdit = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const c = interdits.get(`${cx + ox},${cz + oz}`);
        if (!c) continue;
        for (const [ix, iz, r2] of c) {
          if ((x - ix) ** 2 + (z - iz) ** 2 < r2) return true;
        }
      }
    }
    return false;
  };

  for (const r of data.roads) {
    if (!r.drivable) continue;
    if (!VOIES_STATIONNEMENT.has(r.kind)) continue;
    // Une voie de desserte trop étroite ne laisse pas la place : en dessous
    // de 6 m, un véhicule à l'arrêt bloque le croisement, et les panoramiques
    // des rues étroites d'Artix ne montrent effectivement aucune file.
    if (r.width < 6) continue;
    if (r.rondPoint || r.bridge) continue;
    const [x0, z0] = r.pts[0];
    const distBourg = Math.hypot(x0, z0);
    if (distBourg > 1000) continue;

    // Densité de stationnement : forte en centre-bourg, faible en périphérie.
    // Revue à la baisse après comparaison aux panoramiques : les files quasi
    // continues n'existent que devant les commerces, pas dans les
    // lotissements où domine le stationnement sur parcelle.
    const densite = distBourg < 350 ? 0.52 : distBourg < 650 ? 0.3 : 0.13;

    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 12) continue;

      const ux = dx / len, uz = dz / len;      // sens de la voie
      const nx = -uz, nz = ux;                  // normale

      // Un véhicule occupe 5 m ; on laisse un intervalle pour les entrées
      // de garage et les bateaux de trottoir.
      const pas = 6.2;
      const n = Math.floor(len / pas);
      for (let k = 0; k < n; k++) {
        // Position le long du segment, avec un léger décalage aléatoire :
        // des voitures parfaitement alignées trahissent le procédural.
        const graine = Math.abs(x1 * 31.7 + z1 * 17.3 + k * 7.1);
        if (hash(graine) > densite) continue;

        const t = (k + 0.5) / n;
        const jitter = (hash(graine + 3.3) - 0.5) * 1.4;
        const cx = x1 + dx * t + ux * jitter;
        const cz = z1 + dz * t + uz * jitter;
        if (estInterdit(cx, cz)) continue;

        // Côté de stationnement : les deux bords sont possibles, sauf en sens
        // unique où l'on se gare majoritairement à droite.
        const cote = r.oneway ? 1 : (hash(graine + 5.9) > 0.5 ? 1 : -1);
        // Position latérale conforme à la pratique réelle, vérifiée sur les
        // panoramiques : sur une voie large, on stationne SUR la chaussée,
        // roues contre la bordure ; sur une voie moyenne, à cheval sur le
        // bord pour laisser passer la circulation. L'ancien calcul posait
        // systématiquement le véhicule au-delà du bord, c'est-à-dire sur le
        // trottoir ou la bande enherbée, ce qui ne se voit nulle part.
        const offset = r.width >= 7.5
          ? r.width / 2 - DEMI_LARGEUR - 0.12   // sur chaussée, contre la rive
          : r.width / 2 - 0.25;                  // à cheval sur la bordure
        const px = cx + nx * offset * cote;
        const pz = cz + nz * offset * cote;

        // Cap : dans le sens de circulation du côté choisi.
        const cap = Math.atan2(ux, uz) + (cote > 0 ? 0 : Math.PI);
        // Léger désalignement, comme un stationnement réel.
        const capReel = cap + (hash(graine + 11.7) - 0.5) * 0.14;

        // Un véhicule garé au ras du bitume ne doit pas se retrouver dans une
        // façade : les emprises bâties bordent parfois directement la rue.
        if (dansBatiment(px, pz)) continue;

        // Altitude prise sur le terrain naturel, comme la chaussée : sur
        // l'accotement terrassé, la voiture flotterait ou s'enterrerait.
        const sol = relief ? relief.hauteurRoute(px, pz) : 0;
        places.push({
          // Type et couleur sont tirés au rendu, selon la distribution du
          // parc (GABARITS).
          x: px, y: sol + roadY, z: pz, cap: capReel,
          graine,
          // Stationnement le long d'une voie, par opposition aux places
          // marquées d'un parking réel. C'est cette distinction que la passe
          // d'éclaircissement utilise pour décider quoi retirer.
          rue: true,
        });
      }
    }
  }
  return places;
}

// Éclaircissement du stationnement de rue.
//
// Le placement d'origine remplissait les voies au point d'aligner des files
// quasi continues sur toute la longueur d'une rue, ce qu'on ne voit nulle part
// à Artix : une rue de bourg a des trous, des entrées de garage, des tronçons
// vides. On retire donc une part des véhicules de rue, les places marquées des
// parkings étant conservées en entier : elles correspondent à un aménagement
// réel, et un parking à moitié vide se remarque plus qu'une rue clairsemée.
//
// Le tri est déterministe : il ne dépend que des coordonnées de chaque place,
// donc deux lancements donnent exactement la même ville.
function eclaircir(places) {
  // Chaînage des files : deux véhicules garés le long de la même rive se
  // suivent à un pas d'environ 6,2 m. On relie ceux qui sont à portée et
  // à peu près dans le même axe, ce qui reconstitue les files réelles sans
  // avoir à repasser par les segments de voie dont elles sont issues.
  const rue = places.filter((p) => p.rue);
  const autres = places.filter((p) => !p.rue);
  if (!rue.length) return places;

  const CELL = 10;
  const grille = new Map();
  rue.forEach((p, i) => {
    const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(i);
  });

  // Voisin suivant dans la file : le plus proche devant, dans l'axe du
  // véhicule et à moins de 9 m. Au-delà, la file est rompue par une entrée de
  // garage ou un carrefour, et le trou est déjà là.
  const PORTEE = 9;
  const suivant = new Int32Array(rue.length).fill(-1);
  const precedent = new Int32Array(rue.length).fill(-1);
  rue.forEach((p, i) => {
    const ax = Math.sin(p.cap), az = Math.cos(p.cap);
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let meilleur = -1, meilleureD = PORTEE * PORTEE;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const c = grille.get(`${cx + ox},${cz + oz}`);
        if (!c) continue;
        for (const j of c) {
          if (j === i) continue;
          const q = rue[j];
          const dx = q.x - p.x, dz = q.z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 >= meilleureD) continue;
          // Devant, et pas sur la rive d'en face : le voisin doit être dans
          // l'axe du véhicule, non à côté de lui.
          const along = dx * ax + dz * az;
          if (along <= 0) continue;
          const travers = Math.abs(dx * az - dz * ax);
          if (travers > 1.6) continue;
          meilleur = j; meilleureD = d2;
        }
      }
    }
    suivant[i] = meilleur;
    if (meilleur >= 0) precedent[meilleur] = i;
  });

  // Parcours de chaque file depuis sa tête, et retrait par blocs plutôt qu'un
  // véhicule sur deux : une alternance régulière se lit aussi mal qu'une file
  // pleine. On garde des grappes de deux à quatre voitures séparées par des
  // trous d'une à trois places, la longueur des unes comme des autres étant
  // tirée de la position de la tête de file.
  const garde = new Uint8Array(rue.length);
  const vu = new Uint8Array(rue.length);
  for (let tete = 0; tete < rue.length; tete++) {
    if (precedent[tete] >= 0) continue;   // pas une tête de file
    const p = rue[tete];
    let s = hash(Math.abs(p.x * 7.3 + p.z * 11.9));
    // Une file commence pleine ou vide selon la graine : sinon toutes les
    // rues démarrent par une voiture, ce qui se voit aux carrefours.
    let plein = s > 0.46;
    let reste = plein ? 1 + Math.floor(s * 3) : 2 + Math.floor(s * 3);
    // `vus` borne le parcours : le chaînage se referme sur lui-même quand une
    // rue boucle, et la file serait alors parcourue sans fin.
    for (let i = tete; i >= 0 && !vu[i]; i = suivant[i]) {
      vu[i] = 1;
      if (plein) garde[i] = 1;
      if (--reste <= 0) {
        s = hash(s * 97.3 + i * 1.7);
        plein = !plein;
        reste = plein ? 1 + Math.floor(s * 3) : 2 + Math.floor(s * 3);
      }
    }
  }

  // Files refermées sur elles-mêmes : une rue qui boucle n'a aucune tête, donc
  // aucun de ses véhicules n'a été visité. On les traite en repartant d'un
  // point quelconque de la boucle.
  for (let depart = 0; depart < rue.length; depart++) {
    if (vu[depart]) continue;
    const p = rue[depart];
    let s = hash(Math.abs(p.x * 7.3 + p.z * 11.9));
    let plein = s > 0.46;
    let reste = plein ? 1 + Math.floor(s * 3) : 2 + Math.floor(s * 3);
    for (let i = depart; i >= 0 && !vu[i]; i = suivant[i]) {
      vu[i] = 1;
      if (plein) garde[i] = 1;
      if (--reste <= 0) {
        s = hash(s * 97.3 + i * 1.7);
        plein = !plein;
        reste = plein ? 1 + Math.floor(s * 3) : 2 + Math.floor(s * 3);
      }
    }
  }

  // Le centre-bourg reste un peu plus dense que la périphérie : c'est là que
  // le joueur passe le plus, et les photographies de rue y montrent
  // effectivement des voitures partout. On y rend une petite part de ce que la
  // passe précédente vient d'enlever.
  //
  // La distance est mesurée sur la PLACE elle-même. Une première version la
  // prenait au premier point de la voie : une rue longue partant du bourg
  // voyait alors toutes ses places classées « centre », jusqu'au bout, et le
  // rattrapage réinjectait presque tout ce qui venait d'être retiré.
  for (let i = 0; i < rue.length; i++) {
    if (garde[i]) continue;
    const p = rue[i];
    if (p.x * p.x + p.z * p.z > 260 * 260) continue;
    if (hash(Math.abs(p.x * 3.1 + p.z * 5.7) + 41.3) < 0.18) garde[i] = 1;
  }

  const retenues = rue.filter((_, i) => garde[i]);
  return [...retenues, ...autres];
}

// Silhouette de véhicule simplifiée : une caisse, un habitacle trapézoïdal et
// quatre roues. À la distance où on les voit, la lecture tient à la proportion
// et aux vitres sombres, pas au détail de carrosserie.
//
// Les vitres font partie du même maillage, réparties dans un second groupe de
// matériaux : un vitrage rapporté sous forme de pavé droit percerait les
// montants inclinés de l'habitacle et donnerait un aspect de bloc posé.
// Construit la géométrie d'un type de véhicule à partir de ses cotes.
// Groupe 0 : carrosserie (couleur instanciée), groupe 1 : vitrages,
// groupe 2 : plaques d'immatriculation.
function construireGeometrie(t) {
  const g = new THREE.BufferGeometry();
  const pos = [], nrm = [];
  const quad = (a, b, c, d, n) => {
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    for (let i = 0; i < 6; i++) nrm.push(...n);
  };

  const { L, W, H0, H1, CL, CW, CH, dz } = t;
  const tAr = dz - CL * t.tArK, tAv = dz + CL * t.tAvK;

  // --- Carrosserie (groupe 0) ---
  quad([-W, H0, -L], [W, H0, -L], [W, H1, -L], [-W, H1, -L], [0, 0, -1]);  // arrière
  quad([W, H0, L], [-W, H0, L], [-W, H1, L], [W, H1, L], [0, 0, 1]);       // avant
  quad([-W, H0, L], [-W, H0, -L], [-W, H1, -L], [-W, H1, L], [-1, 0, 0]);  // gauche
  quad([W, H0, -L], [W, H0, L], [W, H1, L], [W, H1, -L], [1, 0, 0]);       // droite
  quad([-W, H1, L], [-W, H1, -L], [W, H1, -L], [W, H1, L], [0, 1, 0]);     // capot et coffre
  // Pavillon, opaque comme la carrosserie.
  quad([-CW, CH, tAv], [-CW, CH, tAr], [CW, CH, tAr], [CW, CH, tAv], [0, 1, 0]);

  const debutVitres = pos.length / 3;

  // --- Surfaces vitrées (groupe 1) : lunette, pare-brise et custodes ---
  quad([-CW, H1, dz - CL], [CW, H1, dz - CL], [CW, CH, tAr], [-CW, CH, tAr], [0, 0.3, -1]);
  quad([CW, H1, dz + CL], [-CW, H1, dz + CL], [-CW, CH, tAv], [CW, CH, tAv], [0, 0.3, 1]);
  quad([-CW, H1, dz + CL], [-CW, H1, dz - CL], [-CW, CH, tAr], [-CW, CH, tAv], [-1, 0, 0]);
  quad([CW, H1, dz - CL], [CW, H1, dz + CL], [CW, CH, tAv], [CW, CH, tAr], [1, 0, 0]);

  const debutPlaques = pos.length / 3;

  // --- Plaques d'immatriculation (groupe 2), avant et arrière ---
  const hP = H0 + 0.16;
  quad([-0.24, hP, L + 0.006], [0.24, hP, L + 0.006],
    [0.24, hP + 0.13, L + 0.006], [-0.24, hP + 0.13, L + 0.006], [0, 0, 1]);
  quad([0.24, hP, -L - 0.006], [-0.24, hP, -L - 0.006],
    [-0.24, hP + 0.13, -L - 0.006], [0.24, hP + 0.13, -L - 0.006], [0, 0, -1]);

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.addGroup(0, debutVitres, 0);
  g.addGroup(debutVitres, debutPlaques - debutVitres, 1);
  g.addGroup(debutPlaques, pos.length / 3 - debutPlaques, 2);
  g.computeBoundingSphere();
  return g;
}

// Géométrie d'un scooter : corps caréné (couleur instanciée, groupe 0),
// selle et colonne de guidon sombres (groupe 1). Les roues viennent du mesh
// de roues commun, en échelle réduite.
function construireScooter() {
  const g = new THREE.BufferGeometry();
  const pos = [], nrm = [];
  const quad = (a, b, c, d, n) => {
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    for (let i = 0; i < 6; i++) nrm.push(...n);
  };
  const boite = (x0, y0, z0, x1, y1, z1) => {
    quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
    quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1]);
    quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0]);
    quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0]);
    quad([x0, y1, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [0, 1, 0]);
  };
  // Plancher et carénage bas, puis tablier avant incliné.
  boite(-0.14, 0.25, -0.45, 0.14, 0.48, 0.35);
  boite(-0.13, 0.48, 0.28, 0.13, 1.02, 0.46);
  const debutSombre = pos.length / 3;
  // Selle et colonne de guidon (groupe 1, sombre).
  boite(-0.13, 0.62, -0.55, 0.13, 0.78, -0.05);
  boite(-0.24, 1.04, 0.30, 0.24, 1.10, 0.42);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.addGroup(0, debutSombre, 0);
  g.addGroup(debutSombre, pos.length / 3 - debutSombre, 1);
  g.computeBoundingSphere();
  return g;
}

export class VoituresGarees {
  // Le plafond n'existe que pour borner le coût des colliders physiques : le
  // rendu, entièrement instancié, ne coûte que trois appels de dessin quel que
  // soit l'effectif.
  //
  // Ramené de 1 400 à 880. À 1 400, il tranchait AVANT que l'éclaircissement
  // ne se voie : la ville en comptant 3 063 possibles et 2 100 après passe, le
  // chiffre affiché restait bloqué au plafond et le travail d'éclaircissement
  // ne changeait rien à l'écran. C'est lui, et non la passe d'éclaircissement,
  // qui fixait l'effectif réel.
  // `supplement` : places venues d'ailleurs (parkings en épi notamment), qui
  // partagent le même rendu instancié plutôt que d'ouvrir un second lot de
  // maillages pour les mêmes véhicules.
  constructor(scene, data, relief, roadY, passages = [], spawn = null,
    supplement = [], maximum = 880) {
    this.group = new THREE.Group();
    // Les places d'appoint n'apportent que leur position : type et teinte
    // sont tirés au rendu, avec la même distribution que le reste du parc.
    const complet = supplement.map((p) => ({ ...p }));
    // Les places d'appoint priment sur celles générées le long de la voie :
    // là où un parking en épi existe, personne ne se gare en bataille sur
    // l'accotement juste à côté.
    const CELL = 12;
    const occupe = new Set();
    for (const p of complet) {
      occupe.add(`${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`);
    }
    const libre = (p) => {
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oz = -1; oz <= 1; oz++) {
          if (occupe.has(`${cx + ox},${cz + oz}`)) return false;
        }
      }
      return true;
    };
    let places = [
      ...trouverPlaces(data, relief, roadY, passages).filter(libre),
      ...complet,
    ];

    // Zone de départ dégagée : une voiture garée à cheval sur le point
    // d'apparition ferait naître le joueur à l'intérieur d'un obstacle.
    if (spawn) {
      places = places.filter(
        (p) => (p.x - spawn.x) ** 2 + (p.z - spawn.z) ** 2 > 12 * 12,
      );
    }
    if (!places.length) { this.effectif = 0; return; }

    const avantEclaircissement = places.length;
    places = eclaircir(places);
    this.avant = avantEclaircissement;
    this.apresEclaircissement = places.length;

    // Plafond : on garde en priorité les places du centre-bourg, là où le
    // joueur passe et où le stationnement est réellement dense.
    if (places.length > maximum) {
      places.sort((a, b) => (a.x ** 2 + a.z ** 2) - (b.x ** 2 + b.z ** 2));
      places.length = maximum;
    }
    this.effectif = places.length;
    // Exposé pour la physique : un cuboïde par véhicule suffit à les rendre
    // solides, là où un maillage détaillé coûterait cher pour rien.
    this.obstacles = places;

    // Type et couleur de chaque véhicule, selon la distribution du parc.
    for (const p of places) {
      p.type = tirerType((p.graine ?? 0) + 31.7);
      const gab = GABARITS[p.type];
      const pal = p.type === 'scooter' ? COULEURS_SCOOTER
        : gab.utilitaire ? COULEURS_UTILITAIRE : COULEURS;
      p.couleur = pal[Math.floor(hash((p.graine ?? 0) + 47.3) * pal.length)];
    }

    const caisseMat = new THREE.MeshStandardMaterial({
      roughness: 0.42, metalness: 0.32,
      // La caisse est un volume ouvert par le bas : sans DoubleSide, un
      // véhicule vu depuis une pente laisserait voir son intérieur.
      side: THREE.DoubleSide,
    });
    const vitreMat = new THREE.MeshStandardMaterial({
      color: 0x1a2430, roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide,
    });
    const plaqueMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.35 });
    const sombreMat = new THREE.MeshStandardMaterial({ color: 0x1c1e21, roughness: 0.7 });
    const roueGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 10);
    const roueMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 });
    const feuGeo = new THREE.BoxGeometry(0.42, 0.15, 0.08);
    const feuArMat = new THREE.MeshStandardMaterial({
      color: 0x8c1c1c, emissive: 0x4a0d0d, emissiveIntensity: 0.5, roughness: 0.4,
    });
    const feuAvMat = new THREE.MeshStandardMaterial({
      color: 0xd8dce0, roughness: 0.2, metalness: 0.3,
    });
    const retroGeo = new THREE.BoxGeometry(0.09, 0.10, 0.16);

    // Ombre de contact instanciée : un dégradé radial couché sous chaque
    // véhicule. Sans elle, les centaines de voitures garées flottent sur la
    // chaussée dès que le soleil est bas : le CSM ne fournit plus d'ombre de
    // pied nette. Même recette que le blob du véhicule joueur (main.js).
    const ombreCanvas = document.createElement('canvas');
    ombreCanvas.width = ombreCanvas.height = 128;
    const octx = ombreCanvas.getContext('2d');
    const ograd = octx.createRadialGradient(64, 64, 8, 64, 64, 62);
    ograd.addColorStop(0, 'rgba(0,0,0,0.42)');
    ograd.addColorStop(0.6, 'rgba(0,0,0,0.20)');
    ograd.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = ograd;
    octx.fillRect(0, 0, 128, 128);
    const ombreGeo = new THREE.PlaneGeometry(2.4, 5.2);
    ombreGeo.rotateX(-Math.PI / 2);
    const ombreMat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(ombreCanvas),
      transparent: true, depthWrite: false, opacity: 0.8,
    });

    // Une silhouette par type de véhicule, chacune dans son InstancedMesh.
    // Les caisses sont HORS de la grille spatiale (elle exige une instance
    // par véhicule et par mesh) : 880 caisses d'une trentaine de triangles
    // restent négligeables dessinées en permanence. Roues, feux, rétros et
    // ombres, indexés par véhicule, restent dans la grille.
    const parType = {};
    for (const p of places) parType[p.type] = (parType[p.type] ?? 0) + 1;
    this.caisses = {};
    for (const [nom, n] of Object.entries(parType)) {
      this.caisses[nom] = nom === 'scooter'
        ? new THREE.InstancedMesh(construireScooter(), [caisseMat, sombreMat], n)
        : new THREE.InstancedMesh(construireGeometrie(GABARITS[nom]),
          [caisseMat, vitreMat, plaqueMat], n);
    }
    this.roues = new THREE.InstancedMesh(roueGeo, roueMat, places.length * 4);
    this.feuxAr = new THREE.InstancedMesh(feuGeo, feuArMat, places.length * 2);
    this.feuxAv = new THREE.InstancedMesh(feuGeo, feuAvMat, places.length * 2);
    this.retros = new THREE.InstancedMesh(retroGeo, sombreMat, places.length * 2);
    this.ombres = new THREE.InstancedMesh(ombreGeo, ombreMat, places.length);

    const m = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const q = new THREE.Quaternion();
    const axeY = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const pos = new THREE.Vector3();
    const ech = new THREE.Vector3();
    const idx = {};

    places.forEach((p, i) => {
      q.setFromAxisAngle(axeY, p.cap);
      const type = p.type;
      const gab = GABARITS[type];
      const scooter = type === 'scooter';
      // Variation d'échelle de ±4 % : deux breaks voisins ne sont jamais
      // exactement identiques.
      const e1 = 0.96 + hash((p.graine ?? 0) + 3.1) * 0.08;

      // Demi-dimensions du volume de collision, reprises par la physique.
      if (scooter) {
        p.demiL = 0.95; p.demiW = 0.35; p.demiH = 0.55; p.centreH = 0.65;
      } else {
        p.demiL = gab.L * e1;
        p.demiW = gab.W * e1;
        p.demiH = (gab.CH - gab.H0) / 2 * e1;
        p.centreH = (gab.H0 + gab.CH) / 2 * e1;
      }

      pos.set(p.x, p.y, p.z);
      ech.set(e1, e1, e1);
      m.compose(pos, q, ech);
      const j = idx[type] ?? 0;
      idx[type] = j + 1;
      this.caisses[type].setMatrixAt(j, m);
      col.setHex(p.couleur);
      // Légère variation de clarté : casse les doublons de teinte exacte.
      col.multiplyScalar(0.94 + hash((p.graine ?? 0) + 9.4) * 0.1);
      this.caisses[type].setColorAt(j, col);

      const qr = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, p.cap, Math.PI / 2, 'YXZ'),
      );
      if (scooter) {
        // Deux roues dans l'axe, en échelle réduite ; les emplacements de
        // roues et de feux inutilisés sont masqués par une matrice nulle.
        let n2 = 0;
        for (const szr of [-0.62, 0.62]) {
          const dr = new THREE.Vector3(0, 0.2, szr).applyQuaternion(q);
          m.compose(pos.clone().add(dr), qr, new THREE.Vector3(0.5, 0.68, 0.68));
          this.roues.setMatrixAt(i * 4 + n2, m);
          n2++;
        }
        this.roues.setMatrixAt(i * 4 + 2, zero);
        this.roues.setMatrixAt(i * 4 + 3, zero);
        for (let f = 0; f < 2; f++) {
          this.feuxAr.setMatrixAt(i * 2 + f, zero);
          this.feuxAv.setMatrixAt(i * 2 + f, zero);
          this.retros.setMatrixAt(i * 2 + f, zero);
        }
        m.compose(pos, q, new THREE.Vector3(0.34, 1, 0.42));
        this.ombres.setMatrixAt(i, m);
        return;
      }

      // Roues aux quatre coins, cotes du type.
      let n2 = 0;
      for (const sxr of [-1, 1]) {
        for (const szr of [-1, 1]) {
          const dr = new THREE.Vector3(sxr * (gab.W - 0.05) * e1, 0.31 * e1, szr * gab.L * 0.62 * e1)
            .applyQuaternion(q);
          m.compose(pos.clone().add(dr), qr, ech);
          this.roues.setMatrixAt(i * 4 + n2, m);
          n2++;
        }
      }

      // Feux et rétroviseurs aux cotes du type.
      const yFeu = (gab.H0 + (gab.H1 - gab.H0) * 0.62) * e1;
      const yRetro = (gab.H1 + 0.27) * e1;
      const zRetro = (gab.dz + gab.CL * gab.tAvK * 0.8) * e1;
      let f = 0;
      for (const cote2 of [-1, 1]) {
        const dAr = new THREE.Vector3(cote2 * 0.58 * gab.W * e1, yFeu, -(gab.L - 0.02) * e1)
          .applyQuaternion(q);
        m.compose(pos.clone().add(dAr), q, ech);
        this.feuxAr.setMatrixAt(i * 2 + f, m);
        const dAv = new THREE.Vector3(cote2 * 0.58 * gab.W * e1, yFeu, (gab.L - 0.02) * e1)
          .applyQuaternion(q);
        m.compose(pos.clone().add(dAv), q, ech);
        this.feuxAv.setMatrixAt(i * 2 + f, m);
        const dRe = new THREE.Vector3(cote2 * (gab.W + 0.06) * e1, yRetro, zRetro)
          .applyQuaternion(q);
        m.compose(pos.clone().add(dRe), q, ech);
        this.retros.setMatrixAt(i * 2 + f, m);
        f++;
      }

      // Ombre de contact aux proportions du type.
      m.compose(new THREE.Vector3(p.x, p.y + 0.03, p.z), q,
        new THREE.Vector3(gab.W / 0.87 * e1, 1, gab.L / 2.15 * e1));
      this.ombres.setMatrixAt(i, m);
    });

    const tousLesMeshes = [
      ...Object.values(this.caisses),
      this.roues, this.feuxAr, this.feuxAv, this.retros, this.ombres,
    ];
    for (const mesh of tousLesMeshes) mesh.instanceMatrix.needsUpdate = true;
    for (const c of Object.values(this.caisses)) {
      if (c.instanceColor) c.instanceColor.needsUpdate = true;
    }

    this.group.add(...tousLesMeshes);
    // Exposé pour le découpage spatial (`spatial.js`) : uniquement les
    // maillages indexés par véhicule (les caisses, réparties par silhouette,
    // ne respectent pas ce contrat et restent dessinées en permanence).
    this.group.userData.instances = {
      meshes: [this.roues, this.feuxAr, this.feuxAv, this.retros, this.ombres],
      positions: places.map((p) => [p.x, p.z]),
      ratios: [4, 2, 2, 2, 1],
    };
    scene.add(this.group);
  }
}
