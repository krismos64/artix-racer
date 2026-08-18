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
const COULEURS = [
  0xe8e9ea, 0xe8e9ea, 0xe8e9ea,   // blanc, très majoritaire
  0x9a9ea3, 0x9a9ea3, 0x7c8085,   // gris
  0x2b2e33, 0x2b2e33,             // noir
  0x8c9aa8, 0x3d5a7a,             // bleus
  0x7a2f2f, 0x8a6a3a, 0x3f5f45,   // rouge, beige, vert
];

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
  const dansBatiment = indexerBatiments(data.buildings);

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
    // Une voie de desserte trop étroite ne laisse pas la place.
    if (r.width < 5.4) continue;
    if (r.rondPoint || r.bridge) continue;
    const [x0, z0] = r.pts[0];
    const distBourg = Math.hypot(x0, z0);
    if (distBourg > 1000) continue;

    // Densité de stationnement : forte en centre-bourg, faible en périphérie.
    const densite = distBourg < 350 ? 0.62 : distBourg < 650 ? 0.38 : 0.18;

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
        // Le véhicule est rangé sur l'accotement, son flanc affleurant le bord
        // de chaussée. Le calcul part du bord et non de l'axe : sinon, sur une
        // rue étroite, la voiture se retrouve à cheval sur la file de
        // circulation et bloque le passage.
        const offset = r.width / 2 + DEMI_LARGEUR - 0.35;
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
          x: px, y: sol + roadY, z: pz, cap: capReel,
          couleur: COULEURS[Math.floor(hash(graine + 13.1) * COULEURS.length)],
          // Trois gabarits : citadine, berline, utilitaire.
          gabarit: hash(graine + 19.3),
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
function construireGeometrie() {
  const g = new THREE.BufferGeometry();
  const pos = [], nrm = [];
  // Indices de début des faces vitrées, pour découper les groupes.
  let debutVitres = 0;

  // Quad orienté vers l'extérieur. Three.js n'affiche que les faces dont les
  // sommets tournent dans le sens antihoraire vu depuis la normale : l'ordre
  // est inversé ici pour que les quatre coins, écrits dans le sens naturel de
  // lecture, produisent des faces visibles de l'extérieur.
  const quad = (a, b, c, d, n) => {
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
    for (let i = 0; i < 6; i++) nrm.push(...n);
  };

  const L = 2.15, W = 0.87, H0 = 0.28, H1 = 0.78;   // demi-cotes caisse
  const CL = 1.05, CW = 0.80, CH = 1.35;            // habitacle
  const dz = -0.25;                                  // recul de l'habitacle
  // Sommets du toit, plus courts que la base : c'est cette inclinaison qui
  // donne au volume sa lecture de voiture plutôt que de caisse.
  const tAr = dz - CL * 0.72, tAv = dz + CL * 0.62;

  // --- Carrosserie (groupe 0) ---
  quad([-W, H0, -L], [W, H0, -L], [W, H1, -L], [-W, H1, -L], [0, 0, -1]);  // arrière
  quad([W, H0, L], [-W, H0, L], [-W, H1, L], [W, H1, L], [0, 0, 1]);       // avant
  quad([-W, H0, L], [-W, H0, -L], [-W, H1, -L], [-W, H1, L], [-1, 0, 0]);  // gauche
  quad([W, H0, -L], [W, H0, L], [W, H1, L], [W, H1, -L], [1, 0, 0]);       // droite
  quad([-W, H1, L], [-W, H1, -L], [W, H1, -L], [W, H1, L], [0, 1, 0]);     // capot
  // Pas de face inférieure : elle n'est jamais visible sur un véhicule posé
  // au sol, et l'économiser allège le maillage de 900 instances.
  // Pavillon, opaque comme la carrosserie.
  quad([-CW, CH, tAv], [-CW, CH, tAr], [CW, CH, tAr], [CW, CH, tAv], [0, 1, 0]);

  debutVitres = pos.length / 3;

  // --- Surfaces vitrées (groupe 1) : lunette, pare-brise et custodes ---
  quad([-CW, H1, dz - CL], [CW, H1, dz - CL], [CW, CH, tAr], [-CW, CH, tAr], [0, 0.3, -1]);
  quad([CW, H1, dz + CL], [-CW, H1, dz + CL], [-CW, CH, tAv], [CW, CH, tAv], [0, 0.3, 1]);
  quad([-CW, H1, dz + CL], [-CW, H1, dz - CL], [-CW, CH, tAr], [-CW, CH, tAv], [-1, 0, 0]);
  quad([CW, H1, dz - CL], [CW, H1, dz + CL], [CW, CH, tAv], [CW, CH, tAr], [1, 0, 0]);

  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.addGroup(0, debutVitres, 0);
  g.addGroup(debutVitres, pos.length / 3 - debutVitres, 1);
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
    // Les places d'appoint n'apportent que leur position : teinte et gabarit
    // sont tirés ici, avec la même distribution que le reste du parc.
    const complet = supplement.map((p) => ({
      ...p,
      couleur: p.couleur ?? COULEURS[Math.floor(hash(p.graine ?? 0) * COULEURS.length)],
      gabarit: p.gabarit ?? hash((p.graine ?? 0) + 23.9),
    }));
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

    const caisseGeo = construireGeometrie();
    const caisseMat = new THREE.MeshStandardMaterial({
      roughness: 0.42, metalness: 0.32,
      // La caisse est un volume ouvert par le bas : sans DoubleSide, un
      // véhicule vu depuis une pente laisserait voir son intérieur.
      side: THREE.DoubleSide,
    });
    // Vitrage : second groupe du même maillage, donc parfaitement raccordé aux
    // montants. La teinte instanciée ne s'applique qu'à la carrosserie.
    const vitreMat = new THREE.MeshStandardMaterial({
      color: 0x1a2430, roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide,
    });
    const roueGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 10);
    const roueMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 });
    // Feux : ce sont eux qui font lire une silhouette comme une voiture à
    // distance, bien plus que le détail de la carrosserie.
    const feuGeo = new THREE.BoxGeometry(0.42, 0.15, 0.08);
    const feuArMat = new THREE.MeshStandardMaterial({
      color: 0x8c1c1c, emissive: 0x4a0d0d, emissiveIntensity: 0.5, roughness: 0.4,
    });
    const feuAvMat = new THREE.MeshStandardMaterial({
      color: 0xd8dce0, roughness: 0.2, metalness: 0.3,
    });

    this.caisses = new THREE.InstancedMesh(
      caisseGeo, [caisseMat, vitreMat], places.length,
    );
    // Quatre roues par véhicule, dans un seul mesh instancié.
    this.roues = new THREE.InstancedMesh(roueGeo, roueMat, places.length * 4);
    // Deux feux par extrémité.
    this.feuxAr = new THREE.InstancedMesh(feuGeo, feuArMat, places.length * 2);
    this.feuxAv = new THREE.InstancedMesh(feuGeo, feuAvMat, places.length * 2);

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const axeY = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    const pos = new THREE.Vector3();
    const ech = new THREE.Vector3();

    places.forEach((p, i) => {
      q.setFromAxisAngle(axeY, p.cap);
      // Gabarit : citadine courte, berline moyenne, utilitaire haut.
      const court = p.gabarit < 0.34;
      const haut = p.gabarit > 0.86;
      const sx = court ? 0.94 : 1;
      const sz = court ? 0.86 : haut ? 1.08 : 1;
      const sy = haut ? 1.22 : 1;
      ech.set(sx, sy, sz);
      // Demi-dimensions du volume de collision, reprises telles quelles par la
      // physique pour que l'obstacle coïncide avec ce qui est affiché.
      p.demiL = 2.15 * sz;
      p.demiW = 0.87 * sx;
      // Du bas de caisse (0.28) au pavillon (1.35), soit une demi-hauteur de
      // 0.535 pour un centre à 0.815. Aligné sur le rendu, pas approximé.
      p.demiH = 0.535 * sy;
      p.centreH = 0.815 * sy;

      pos.set(p.x, p.y, p.z);
      m.compose(pos, q, ech);
      this.caisses.setMatrixAt(i, m);
      col.setHex(p.couleur);
      this.caisses.setColorAt(i, col);

      // Roues aux quatre coins.
      const qr = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, p.cap, Math.PI / 2, 'YXZ'),
      );
      let n = 0;
      for (const sxr of [-1, 1]) {
        for (const szr of [-1, 1]) {
          const dr = new THREE.Vector3(sxr * 0.83 * sx, 0.31, szr * 1.42 * sz)
            .applyQuaternion(q);
          m.compose(pos.clone().add(dr), qr, new THREE.Vector3(1, 1, 1));
          this.roues.setMatrixAt(i * 4 + n, m);
          n++;
        }
      }

      // Feux, posés à hauteur de caisse aux deux extrémités.
      const yFeu = 0.58 * sy;
      let f = 0;
      for (const cote2 of [-1, 1]) {
        const dAr = new THREE.Vector3(cote2 * 0.52 * sx, yFeu, -2.13 * sz)
          .applyQuaternion(q);
        m.compose(pos.clone().add(dAr), q, new THREE.Vector3(1, 1, 1));
        this.feuxAr.setMatrixAt(i * 2 + f, m);

        const dAv = new THREE.Vector3(cote2 * 0.52 * sx, yFeu, 2.13 * sz)
          .applyQuaternion(q);
        m.compose(pos.clone().add(dAv), q, new THREE.Vector3(1, 1, 1));
        this.feuxAv.setMatrixAt(i * 2 + f, m);
        f++;
      }
    });

    for (const mesh of [this.caisses, this.roues, this.feuxAr, this.feuxAv]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.caisses.instanceColor) this.caisses.instanceColor.needsUpdate = true;

    this.group.add(this.caisses, this.roues, this.feuxAr, this.feuxAv);
    scene.add(this.group);
  }
}
