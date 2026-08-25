// Modèle 3D du véhicule, construit en géométrie procédurale.
// La carrosserie est un volume défini par sections transversales successives,
// technique de modélisation de coque : chaque section fixe la largeur, la
// hauteur de bas de caisse et la ligne de toit à une position donnée de la
// longueur. Un simple profil extrudé donnerait une silhouette plate.
import * as THREE from 'three';
import { SPEC } from './car.js';

// L'origine du repère véhicule est au centre du collider de caisse ; les roues
// tournent autour de y = -0,54 et ont 0,33 m de rayon, donc le sol est à -0,87.
// Le plancher de caisse se pose 22 cm au-dessus du sol : garde au sol réaliste,
// et les roues dépassent nettement sous les ailes.
const FLOOR_Y = -0.74;

// Sections de la carrosserie, de l'arrière (z négatif) vers l'avant.
// Proportions d'une compacte deux volumes de la fin des années 90 : caisse
// haute et droite, pavillon long et plat, montant arrière large, poupe presque
// verticale, porte-à-faux courts. Cote à cote : 4,15 m de long, 1,74 m de large,
// 1,44 m de haut.
// z      : position longitudinale
// demiL  : demi-largeur de caisse
// bas    : hauteur du bas de caisse
// haut   : hauteur de la ligne de ceinture (capot / coffre)
// toit   : demi-largeur du pavillon (0 = pas de pavillon à cette section)
// toitY  : hauteur du pavillon
// `aile` gonfle localement la largeur au droit des passages de roue : c'est ce
// galbe qui distingue une carrosserie d'une boîte, et il se voit au premier
// coup d'œil en vue de poursuite.
const SECTIONS = [
  // --- Poupe : bouclier puis hayon très redressé ---
  { z: -2.14, demiL: 0.70, bas: 0.26, haut: 0.78, toit: 0,    toitY: 0,    aile: 0 },
  { z: -2.05, demiL: 0.79, bas: 0.20, haut: 0.87, toit: 0,    toitY: 0,    aile: 0.01 },
  { z: -1.94, demiL: 0.845, bas: 0.14, haut: 0.94, toit: 0.42, toitY: 1.08, aile: 0.02 },
  { z: -1.78, demiL: 0.862, bas: 0.11, haut: 0.965, toit: 0.56, toitY: 1.28, aile: 0.03 },
  // --- Aile arrière : galbe au droit de la roue ---
  { z: -1.55, demiL: 0.868, bas: 0.10, haut: 0.975, toit: 0.66, toitY: 1.40, aile: 0.055 },
  { z: -1.31, demiL: 0.870, bas: 0.095, haut: 0.978, toit: 0.71, toitY: 1.445, aile: 0.062 },
  { z: -1.10, demiL: 0.870, bas: 0.09, haut: 0.980, toit: 0.732, toitY: 1.458, aile: 0.048 },
  // --- Flanc médian, portes ---
  { z: -0.82, demiL: 0.868, bas: 0.09, haut: 0.980, toit: 0.742, toitY: 1.465, aile: 0.018 },
  { z: -0.42, demiL: 0.866, bas: 0.09, haut: 0.980, toit: 0.748, toitY: 1.470, aile: 0 },
  { z:  0.00, demiL: 0.866, bas: 0.09, haut: 0.980, toit: 0.750, toitY: 1.472, aile: 0 },
  { z:  0.38, demiL: 0.866, bas: 0.09, haut: 0.978, toit: 0.746, toitY: 1.468, aile: 0.012 },
  // --- Aile avant : second galbe ---
  { z:  0.70, demiL: 0.868, bas: 0.095, haut: 0.965, toit: 0.66, toitY: 1.40, aile: 0.045 },
  { z:  0.98, demiL: 0.870, bas: 0.10, haut: 0.945, toit: 0.54, toitY: 1.27, aile: 0.062 },
  { z:  1.22, demiL: 0.868, bas: 0.105, haut: 0.912, toit: 0,   toitY: 0,    aile: 0.055 },
  { z:  1.48, demiL: 0.860, bas: 0.115, haut: 0.878, toit: 0,   toitY: 0,    aile: 0.032 },
  // --- Capot, court et légèrement plongeant ---
  { z:  1.74, demiL: 0.850, bas: 0.13, haut: 0.852, toit: 0,   toitY: 0,    aile: 0.008 },
  { z:  1.96, demiL: 0.830, bas: 0.155, haut: 0.828, toit: 0,  toitY: 0,    aile: 0 },
  { z:  2.10, demiL: 0.790, bas: 0.19, haut: 0.800, toit: 0,   toitY: 0,    aile: 0 },
  { z:  2.19, demiL: 0.715, bas: 0.24, haut: 0.755, toit: 0,   toitY: 0,    aile: 0 },
];

// Construit le contour fermé d'une section, dans le plan (x, y).
// Le contour part du bas gauche, remonte à gauche, franchit le pavillon s'il
// existe, puis redescend à droite.
function contourSection(s) {
  const pts = [];
  const congé = 0.10;                 // adoucissement des arêtes verticales
  // Le galbe d'aile s'ajoute à mi-hauteur de flanc : la caisse s'élargit au
  // droit des roues, comme sur une carrosserie emboutie.
  const aile = s.aile ?? 0;
  const yAile = s.bas + (s.haut - s.bas) * 0.34;

  pts.push([-s.demiL + congé, s.bas]);          // bas gauche
  pts.push([-s.demiL, s.bas + congé]);
  if (aile > 0.005) {
    pts.push([-s.demiL - aile * 0.75, yAile - 0.14]);
    pts.push([-s.demiL - aile, yAile]);          // sommet du galbe
    pts.push([-s.demiL - aile * 0.6, yAile + 0.18]);
  }
  pts.push([-s.demiL, s.haut - congé]);         // ligne de ceinture gauche
  if (s.toit > 0) {
    pts.push([-s.toit - 0.06, s.haut + 0.04]);  // pied de montant gauche
    pts.push([-s.toit, s.toitY - congé]);
    pts.push([-s.toit + congé, s.toitY]);       // pavillon gauche
    pts.push([s.toit - congé, s.toitY]);        // pavillon droit
    pts.push([s.toit, s.toitY - congé]);
    pts.push([s.toit + 0.06, s.haut + 0.04]);   // pied de montant droit
  } else {
    pts.push([-s.demiL + congé, s.haut]);       // capot / coffre plat
    pts.push([s.demiL - congé, s.haut]);
  }
  pts.push([s.demiL, s.haut - congé]);
  if (aile > 0.005) {
    pts.push([s.demiL + aile * 0.6, yAile + 0.18]);
    pts.push([s.demiL + aile, yAile]);           // sommet du galbe, côté droit
    pts.push([s.demiL + aile * 0.75, yAile - 0.14]);
  }
  pts.push([s.demiL, s.bas + congé]);
  pts.push([s.demiL - congé, s.bas]);           // bas droit
  return pts;
}

// Relie deux sections consécutives par une bande de quadrilatères.
// Les contours n'ayant pas toujours le même nombre de points (présence ou non
// d'un pavillon), on les rééchantillonne à un nombre fixe de points.
function reechantillonne(pts, n) {
  // Longueur cumulée le long du contour.
  const lens = [0];
  for (let i = 1; i < pts.length; i++) {
    lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = lens[lens.length - 1];
  const out = [];
  for (let k = 0; k < n; k++) {
    const cible = (k / (n - 1)) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < cible) i++;
    const t = (cible - lens[i - 1]) / Math.max(1e-6, lens[i] - lens[i - 1]);
    out.push([
      pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
      pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
    ]);
  }
  return out;
}

function buildBodyGeometry() {
  // Densité relevée : 26 points par section donnaient une carrosserie
  // visiblement facettée. À 48, les galbes de toit et d'ailes se lisent comme
  // des surfaces continues.
  const N = 48;
  const bruts = SECTIONS.map((s) => ({
    z: s.z,
    pts: reechantillonne(contourSection(s), N),
  }));

  // Interpolation longitudinale : deux anneaux intermédiaires entre chaque
  // paire de sections. Sans cela, les arêtes transversales restent visibles
  // sur le capot et le pavillon.
  const anneaux = [];
  const SUB = 2;
  for (let a = 0; a < bruts.length - 1; a++) {
    const r0 = bruts[a], r1 = bruts[a + 1];
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB;
      // Lissage en cosinus : les raccords sont tangents, pas anguleux.
      const u = (1 - Math.cos(t * Math.PI)) / 2;
      anneaux.push({
        z: r0.z + (r1.z - r0.z) * t,
        pts: r0.pts.map((p, i) => [
          p[0] + (r1.pts[i][0] - p[0]) * u,
          p[1] + (r1.pts[i][1] - p[1]) * u,
        ]),
      });
    }
  }
  anneaux.push(bruts[bruts.length - 1]);

  const pos = [];
  // Surface latérale : un quad entre chaque paire de points consécutifs.
  for (let a = 0; a < anneaux.length - 1; a++) {
    const r0 = anneaux[a], r1 = anneaux[a + 1];
    for (let i = 0; i < N - 1; i++) {
      const p0 = r0.pts[i], p1 = r0.pts[i + 1];
      const q0 = r1.pts[i], q1 = r1.pts[i + 1];
      pos.push(p0[0], p0[1], r0.z, q0[0], q0[1], r1.z, p1[0], p1[1], r0.z);
      pos.push(p1[0], p1[1], r0.z, q0[0], q0[1], r1.z, q1[0], q1[1], r1.z);
    }
  }

  // Fermeture avant et arrière, en éventail depuis le centre de la section.
  for (const [anneau, sens] of [[anneaux[0], -1], [anneaux[anneaux.length - 1], 1]]) {
    let cx = 0, cy = 0;
    for (const p of anneau.pts) { cx += p[0]; cy += p[1]; }
    cx /= anneau.pts.length; cy /= anneau.pts.length;
    for (let i = 0; i < N - 1; i++) {
      const p = anneau.pts[i], q = anneau.pts[i + 1];
      if (sens < 0) pos.push(cx, cy, anneau.z, p[0], p[1], anneau.z, q[0], q[1], anneau.z);
      else pos.push(cx, cy, anneau.z, q[0], q[1], anneau.z, p[0], p[1], anneau.z);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// Bleu marine métallisé.
export function buildCarMesh(color = 0x1c2b4a) {
  const car = new THREE.Group();
  // La carrosserie va dans ce sous-groupe ; les roues sont positionnées
  // chaque frame par la physique et restent sur le groupe racine.
  const shell = new THREE.Group();
  shell.position.y = FLOOR_Y;
  car.add(shell);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color, roughness: 0.26, metalness: 0.5,
    clearcoat: 1, clearcoatRoughness: 0.06,   // vernis carrosserie
  });
  // Vitrage opaque teinté : `transmission` rendrait la caisse translucide et
  // laisserait voir le décor au travers de la voiture.
  // Rugosité un peu relevée : un vitrage trop lisse renvoie le ciel en aplat
  // clair et la lunette arrière ressort comme un rectangle blanc.
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0e1420, roughness: 0.24, metalness: 0.1,
    clearcoat: 0.6, clearcoatRoughness: 0.2, side: THREE.DoubleSide,
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.7, metalness: 0.2 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.15, metalness: 0.95 });

  // --- Carrosserie --------------------------------------------------------
  const body = new THREE.Mesh(buildBodyGeometry(), bodyMat);
  // Pas d'ombre portée, comme le modèle importé : voir `carmodel.js`.
  body.castShadow = false;
  shell.add(body);

  // --- Vitrages, plaqués juste au-dessus de la surface de caisse ----------
  // Pare-brise : inclinaison modérée, comme sur une compacte de cette époque.
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.68), glassMat);
  windshield.position.set(0, 1.24, 1.02);
  windshield.rotation.x = -0.52;
  shell.add(windshield);

  // Hayon vitré, très redressé.
  const rearGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.30, 0.60), glassMat);
  rearGlass.position.set(0, 1.24, -1.86);
  rearGlass.rotation.x = 0.42;
  shell.add(rearGlass);

  // Vitres latérales. La custode arrière est courte : le montant C large qui
  // la suit est l'élément le plus reconnaissable de cette silhouette.
  for (const sx of [-1, 1]) {
    const avant = new THREE.Mesh(new THREE.PlaneGeometry(0.82, 0.42), glassMat);
    avant.position.set(sx * 0.755, 1.24, 0.30);
    avant.rotation.y = sx * Math.PI / 2;
    shell.add(avant);

    const arriere = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.38), glassMat);
    arriere.position.set(sx * 0.755, 1.24, -0.60);
    arriere.rotation.y = sx * Math.PI / 2;
    shell.add(arriere);

    // Montant B, en teinte carrosserie sombre : sépare les deux vitres.
    const montantB = new THREE.Mesh(new THREE.PlaneGeometry(0.10, 0.44), trimMat);
    montantB.position.set(sx * 0.757, 1.24, -0.16);
    montantB.rotation.y = sx * Math.PI / 2;
    shell.add(montantB);
  }

  // --- Boucliers ----------------------------------------------------------
  // Boucliers pleine largeur peints en teinte carrosserie, comme sur les
  // finitions de série de cette génération.
  const frontBumper = new THREE.Mesh(new THREE.BoxGeometry(1.70, 0.34, 0.26), bodyMat);
  frontBumper.position.set(0, 0.36, 2.10);
  shell.add(frontBumper);

  const rearBumper = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.34, 0.24), bodyMat);
  rearBumper.position.set(0, 0.36, -2.06);
  shell.add(rearBumper);

  // Bande de protection sombre en bas de bouclier.
  for (const [z, w] of [[2.13, 1.68], [-2.09, 1.64]]) {
    const bande = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.10), trimMat);
    bande.position.set(0, 0.24, z);
    shell.add(bande);
  }

  // --- Calandre : bandeau horizontal étroit entre les phares -------------
  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.11, 0.05), trimMat);
  grille.position.set(0, 0.70, 2.14);
  shell.add(grille);
  const grilleBar = new THREE.Mesh(new THREE.BoxGeometry(0.70, 0.035, 0.07), chromeMat);
  grilleBar.position.set(0, 0.70, 2.15);
  shell.add(grilleBar);
  // Prise d'air basse dans le bouclier.
  const airIntake = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.09, 0.05), trimMat);
  airIntake.position.set(0, 0.40, 2.24);
  shell.add(airIntake);

  // --- Phares avant : blocs larges, presque rectangulaires ---------------
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff4dd, emissive: 0xffeec0, emissiveIntensity: 2.4, roughness: 0.12,
  });
  const headlights = [];
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 0.07), headMat);
    h.position.set(sx * 0.56, 0.72, 2.14);
    shell.add(h);
    headlights.push(h);
  }

  // --- Feux arrière : blocs verticaux dans les ailes ---------------------
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x8c1010, emissive: 0xd41414, emissiveIntensity: 1.1, roughness: 0.3,
  });
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.34, 0.07), tailMat);
    t.position.set(sx * 0.70, 0.80, -2.09);
    shell.add(t);
  }

  // --- Rétroviseurs, montés en pied de vitre ----------------------------
  for (const sx of [-1, 1]) {
    const bras = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), trimMat);
    bras.position.set(sx * 0.90, 1.10, 0.66);
    shell.add(bras);
    const coque = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.11, 0.09), bodyMat);
    coque.position.set(sx * 0.98, 1.10, 0.66);
    shell.add(coque);
  }

  // --- Baguettes de protection latérales --------------------------------
  for (const sx of [-1, 1]) {
    const baguette = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 2.55), trimMat);
    baguette.position.set(sx * 0.875, 0.60, -0.06);
    shell.add(baguette);
  }

  // --- Poignées de porte -------------------------------------------------
  for (const sx of [-1, 1]) {
    for (const z of [0.42, -0.52]) {
      const poignee = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.16), trimMat);
      poignee.position.set(sx * 0.878, 0.86, z);
      shell.add(poignee);
    }
  }

  // --- Passages de roue : anneaux sombres creusant les ailes -------------
  const archMat = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, roughness: 1 });
  const hw = SPEC.trackWidth / 2, hl = SPEC.wheelBase / 2;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.46, 0.26, 18, 1, true), archMat,
    );
    arch.rotation.z = Math.PI / 2;
    // Les roues tournent autour de y = -0,54 dans le repère véhicule, soit
    // +0,20 une fois le décalage FLOOR_Y appliqué.
    arch.position.set(sx * (hw - 0.03), 0.20, sz * hl);
    shell.add(arch);
  }

  // --- Bas de caisse et échappement --------------------------------------
  for (const sx of [-1, 1]) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 2.10), trimMat);
    skirt.position.set(sx * 0.88, 0.10, 0);
    shell.add(skirt);

    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.14, 10), chromeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(sx * 0.42, 0.20, -2.28);
    shell.add(pipe);
  }

  // --- Roues -------------------------------------------------------------
  const wheels = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101012, roughness: 0.95 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.22, metalness: 0.9 });
  const discMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3d, roughness: 0.5, metalness: 0.7 });

  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(SPEC.wheelRadius, SPEC.wheelRadius, 0.24, 24),
      tireMat,
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = false;
    g.add(tire);

    // Jante alliage à branches fines, montée de série sur les finitions
    // intermédiaires de ce segment.
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(SPEC.wheelRadius * 0.66, SPEC.wheelRadius * 0.66, 0.24, 22),
      rimMat,
    );
    rim.rotation.z = Math.PI / 2;
    g.add(rim);
    // Creux de jante : anneau sombre en fond, pour donner du relief.
    const creux = new THREE.Mesh(
      new THREE.CylinderGeometry(SPEC.wheelRadius * 0.58, SPEC.wheelRadius * 0.58, 0.245, 20),
      new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.6, metalness: 0.5 }),
    );
    creux.rotation.z = Math.PI / 2;
    g.add(creux);
    for (let k = 0; k < 8; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.252, 0.055, 0.03), rimMat);
      spoke.rotation.x = (k / 8) * Math.PI * 2;
      g.add(spoke);
    }
    // Moyeu central.
    const moyeu = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.26, 12), rimMat,
    );
    moyeu.rotation.z = Math.PI / 2;
    g.add(moyeu);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(SPEC.wheelRadius * 0.48, SPEC.wheelRadius * 0.48, 0.03, 16),
      discMat,
    );
    disc.rotation.z = Math.PI / 2;
    g.add(disc);

    car.add(g);
    wheels.push(g);
  }

  return { car, wheels, headlights, headMat, tailMat, bodyMat };
}
