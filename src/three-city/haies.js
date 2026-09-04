// Haies de clôture : lauriers, thuyas, troènes et charmilles taillées.
//
// Le rendu précédent posait sur chaque barrière OSM `hedge` une boîte verte à
// trois faces plates, deux verts alternés par segment. Vue depuis la route,
// elle se lit comme un muret peint en vert : rien n'accroche la lumière sur
// une surface strictement plane, et une haie fait justement l'inverse, elle
// boursoufle.
//
// Relevés Street View d'Artix (imagerie mai 2026), qui donnent les quatre
// espèces effectivement plantées ici :
//
//  - D817 / avenue du Rhin et Danube : laurier-palme taillé, 1,6 m au-dessus
//    d'un muret de galets d'environ 1 m, grillage rigide vert intercalé.
//    Feuillage dense, largement ondulé, avec une section jaune-doré (troène
//    doré) qui rompt le vert au milieu du linéaire.
//  - Avenue Poumayou : cyprès de Leyland taillé, 2,2 m, vert très sombre,
//    crête franchement irrégulière.
//  - Rue de la Gare : charmille sur tronc, rideau rectangulaire à 5 m, taillée
//    au carré et portée par des fûts dégagés.
//
// Le principe retenu : un ruban de segments dont la crête ondule, épaissi en
// panse au milieu de sa hauteur, et dont la surface est déformée par un bruit
// déterministe. Tout part dans deux maillages fusionnés (feuillage, fûts de
// charmille), le coût dominant de la scène étant le nombre d'appels de dessin.
import * as THREE from 'three';

// Bruit déterministe. Deux exécutions donnent la même haie : indispensable
// pour qu'un aller-retour sur la même rue ne redessine pas un autre feuillage.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Espèces relevées, avec leurs cotes mesurées à la vue sur les panoramiques.
//
// `demi` est la demi-épaisseur à la panse, `crete` l'amplitude d'ondulation du
// sommet, `grain` la profondeur de la déformation de surface. Un thuya taillé
// ondule beaucoup plus qu'un laurier, dont la taille au taille-haie donne une
// crête presque droite : c'est ce contraste qui distingue les deux à l'oeil.
// Les clartés sont basses volontairement. Un feuillage réel réfléchit entre
// 10 et 15 % de la lumière, quand un enduit blanc en renvoie 75 : une haie
// posée à 0,40 de clarté ressort plus claire qu'une façade et se lit comme du
// plastique. Le tone mapping ACES de la scène remonte encore ces valeurs.
export const ESPECES = {
  laurier: {
    hauteur: 1.75, demi: 0.38, crete: 0.14, grain: 0.16,
    teinte: 0.28, sat: 0.42, clarte: 0.19,
  },
  thuya: {
    // Cyprès de Leyland de l'avenue Poumayou : plus haut, plus étroit, vert
    // sombre presque bleuté, et une crête très découpée faute de taille nette.
    hauteur: 2.20, demi: 0.34, crete: 0.30, grain: 0.20,
    teinte: 0.32, sat: 0.38, clarte: 0.14,
  },
  troene: {
    // Troène doré : le jaune-vert qui rompt le linéaire de la D817. Plus bas,
    // taillé serré, feuillage clair, mais clair POUR UNE HAIE.
    hauteur: 1.45, demi: 0.33, crete: 0.11, grain: 0.13,
    teinte: 0.19, sat: 0.52, clarte: 0.27,
  },
  charmille: {
    // Rideau sur tronc de la rue de la Gare : le feuillage ne descend pas au
    // sol, il commence à 1,9 m sur des fûts dégagés. `pied` porte cette cote.
    hauteur: 5.20, demi: 0.48, crete: 0.16, grain: 0.12, pied: 1.90,
    teinte: 0.25, sat: 0.44, clarte: 0.22,
  },
};

// Répartition des espèces le long d'un linéaire.
//
// Une haie réelle n'est pas monospécifique sur 300 m : la D817 alterne des
// tronçons de laurier et une section de troène doré. On tire l'espèce par
// TRONÇON (une quinzaine de mètres), pas par segment : changer d'essence tous
// les 3 m donnerait un damier qu'aucun jardin ne produit.
function especeDuTroncon(graine) {
  const t = hash(graine);
  if (t > 0.86) return 'troene';    // 14 % : la rupture dorée
  if (t > 0.58) return 'thuya';     // 28 % : conifère taillé
  return 'laurier';                 // 58 % : l'espèce dominante du bourg
}

// Construit le feuillage d'un tronçon de haie entre deux points.
//
// La section est un hexagone irrégulier plutôt qu'un rectangle : deux flancs
// qui se rejoignent sur une panse médiane, un dessus arrondi. C'est ce qui
// remplace la boîte, et ça ne coûte que 8 triangles par tranche.
//
// Le ruban est tranché tous les `PAS` mètres pour que la crête puisse onduler
// et que la haie suive le terrain sur un coteau.
// 0,7 m : à 1,4 m, une haie de 1,75 m n'avait que deux tranches par mètre et
// son flanc se lisait comme un panneau. Le relief d'une haie taillée se joue à
// l'échelle de la demi-touffe, pas du mètre.
const PAS = 0.7;

function tronconFeuillage(x1, z1, x2, z2, y1, y2, spec, graine, sortie, couleurs) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) return;
  const ux = dx / len, uz = dz / len;
  // Normale horizontale : l'épaisseur se développe perpendiculairement.
  const nx = -uz, nz = ux;

  const tranches = Math.max(1, Math.round(len / PAS));
  const { hauteur, demi, crete, grain } = spec;
  const pied = spec.pied ?? 0;

  // Profil de section : décalage latéral et hauteur relative de chaque anneau.
  // Quatre niveaux suffisent (base, panse basse, panse haute, crête) : la
  // silhouette d'une haie taillée n'a pas plus d'inflexions que ça.
  // Une haie taillée est un mur végétal : ses flancs montent presque droit,
  // et seule la crête s'arrondit. Le premier profil, qui plaçait la panse à
  // 30 % de hauteur et rentrait fortement le pied, donnait un bourrelet trapu
  // couché le long de la rue au lieu d'un écran dressé.
  const PROFIL = [
    { h: 0.00, e: 0.88 },   // pied, à peine rentré
    { h: 0.45, e: 1.00 },   // panse, l'épaisseur maximale
    { h: 0.86, e: 0.94 },   // le flanc reste plein presque jusqu'en haut
    { h: 1.00, e: 0.34 },   // crête arrondie, jamais un angle vif
  ];

  // Anneaux successifs le long du tronçon. Chaque anneau porte 4 paires de
  // sommets (un par niveau de profil, de chaque côté).
  const anneaux = [];
  for (let t = 0; t <= tranches; t++) {
    const f = t / tranches;
    const px = x1 + dx * f, pz = z1 + dz * f;
    const sol = y1 + (y2 - y1) * f;
    // Ondulation de la crête : une haie taillée reste irrégulière de quelques
    // centimètres, et c'est cette irrégularité qui la sépare d'un mur vert.
    // Deux fréquences superposées, sinon l'ondulation devient périodique.
    const g = graine + t * 3.31;
    const ondul = (hash(g) - 0.5) * crete + (hash(g * 2.7) - 0.5) * crete * 0.45;
    const haut = hauteur + ondul;

    const cote = [];
    for (let n = 0; n < PROFIL.length; n++) {
      const niveau = PROFIL[n];
      // Grain de surface : chaque sommet est repoussé le long de la normale
      // d'un bruit qui lui est propre, indexé sur la tranche ET sur le niveau.
      // Sans l'indice de niveau, tous les sommets d'un même anneau se
      // décalaient ensemble et le flanc restait un panneau lisse simplement
      // ondulé de loin en loin.
      //
      // Les deux flancs tirent des bruits indépendants : une haie dont les
      // deux faces bombent en même temps s'épaissit et s'amincit comme un
      // boudin, ce qui trahit la génération dès qu'on longe le linéaire.
      const bruitG = (hash(g * 5.1 + n * 17.3) - 0.5) * grain;
      const bruitD = (hash(g * 7.9 + n * 23.1) - 0.5) * grain;
      // Le sommet monte aussi d'un cran propre : la crête d'une haie taillée
      // n'est jamais une ligne, elle dentelle. Les niveaux bas ne bougent pas.
      const releve = niveau.h > 0.8 ? (hash(g * 3.3 + n * 9.7) - 0.5) * grain * 1.6 : 0;
      const ep = demi * niveau.e;
      const y = sol + pied + (haut - pied) * niveau.h + releve;
      cote.push({
        gx: px + nx * (ep + bruitG), gz: pz + nz * (ep + bruitG),
        dx2: px - nx * (ep + bruitD), dz2: pz - nz * (ep + bruitD),
        y,
      });
    }
    anneaux.push(cote);
  }

  // Couture des anneaux : deux flancs, un dessus, un dessous.
  //
  // Le dessous n'est jamais vu directement, mais il doit exister : le pont
  // Three vers Babylon force `backFaceCulling = false` et `twoSidedLighting`
  // (garde-fou contre les nappes cadastrales à l'envers). Un volume ouvert par
  // le bas laisse donc voir son intérieur éclairé comme une face avant, et la
  // haie ressort délavée, presque translucide au-dessus du pavé.
  // `nuance` module la couleur du quad autour de 1. Un flanc de haie sans
  // texture, éclairé de face, présente sinon de grandes plages parfaitement
  // uniformes que rien ne rompt : ce sont ces aplats qui font « plastique »,
  // bien plus que la teinte elle-même. La variation joue le rôle des paquets
  // de feuilles plus ou moins tournés vers la lumière.
  const quad = (nuance, ax, ay, az, bx, by, bz, cx, cy, cz, dx3, dy, dz3) => {
    sortie.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    sortie.push(ax, ay, az, cx, cy, cz, dx3, dy, dz3);
    if (couleurs) for (let k = 0; k < 6; k++) couleurs.push(nuance, nuance, nuance);
  };
  // Nuance propre à une tranche et à un niveau, entre 0,78 et 1,18.
  const nuanceDe = (t, n) => 0.78 + hash(graine * 1.7 + t * 6.1 + n * 2.9) * 0.40;

  for (let t = 0; t < anneaux.length - 1; t++) {
    const a = anneaux[t], b = anneaux[t + 1];
    for (let n = 0; n < PROFIL.length - 1; n++) {
      // Flanc gauche.
      quad(
        nuanceDe(t, n),
        a[n].gx, a[n].y, a[n].gz,
        b[n].gx, b[n].y, b[n].gz,
        b[n + 1].gx, b[n + 1].y, b[n + 1].gz,
        a[n + 1].gx, a[n + 1].y, a[n + 1].gz,
      );
      // Flanc droit, enroulé en sens inverse. Nuance décalée : les deux faces
      // d'une haie ne reçoivent jamais le même soleil.
      quad(
        nuanceDe(t + 41, n),
        a[n].dx2, a[n].y, a[n].dz2,
        a[n + 1].dx2, a[n + 1].y, a[n + 1].dz2,
        b[n + 1].dx2, b[n + 1].y, b[n + 1].dz2,
        b[n].dx2, b[n].y, b[n].dz2,
      );
    }
    // Dessus : referme les deux flancs au niveau de la crête. C'est la face la
    // plus exposée, donc la plus claire.
    const s = PROFIL.length - 1;
    quad(
      nuanceDe(t, s) * 1.10,
      a[s].gx, a[s].y, a[s].gz,
      b[s].gx, b[s].y, b[s].gz,
      b[s].dx2, b[s].y, b[s].dz2,
      a[s].dx2, a[s].y, a[s].dz2,
    );
    // Dessous, enroulé en sens inverse du dessus. Jamais éclairé : sombre.
    quad(
      0.55,
      a[0].gx, a[0].y, a[0].gz,
      a[0].dx2, a[0].y, a[0].dz2,
      b[0].dx2, b[0].y, b[0].dz2,
      b[0].gx, b[0].y, b[0].gz,
    );
  }

  // Bouts de haie : une extrémité ouverte laisse voir l'intérieur creux dès
  // qu'on la longe. On ferme les deux anneaux terminaux.
  for (const [anneau, sens] of [[anneaux[0], 1], [anneaux[anneaux.length - 1], -1]]) {
    for (let n = 0; n < PROFIL.length - 1; n++) {
      const a = anneau[n], b = anneau[n + 1];
      // Bout de haie : la tranche coupée est toujours plus sombre que les
      // flancs, elle regarde le long du linéaire et non le ciel.
      const nu = nuanceDe(sens > 0 ? 3 : 97, n) * 0.82;
      if (sens > 0) {
        quad(nu, a.gx, a.y, a.gz, a.dx2, a.y, a.dz2, b.dx2, b.y, b.dz2, b.gx, b.y, b.gz);
      } else {
        quad(nu, a.gx, a.y, a.gz, b.gx, b.y, b.gz, b.dx2, b.y, b.dz2, a.dx2, a.y, a.dz2);
      }
    }
  }
}

// Fûts d'une charmille sur tronc : la haie de la rue de la Gare repose sur des
// troncs espacés d'environ 3 m, bien visibles sous le rideau de feuillage.
function futsCharmille(x1, z1, x2, z2, y1, y2, pied, sortie) {
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.round(len / 3.0));
  for (let k = 0; k <= n; k++) {
    const f = k / n;
    // Le dernier fût d'un segment est le premier du suivant : on saute pour
    // éviter les troncs jumeaux aux jonctions.
    if (k === n && len > 0.05) continue;
    const px = x1 + dx * f, pz = z1 + dz * f;
    const sol = y1 + (y2 - y1) * f;
    const r = 0.085 + hash(px * 13.7 + pz * 5.3) * 0.035;
    // Prisme hexagonal : à la distance où on longe une charmille, six côtés
    // suffisent, et un cylindre lissé coûterait le double pour rien.
    const COTES = 6;
    const haut = pied + 0.35;   // le fût monte un peu dans le feuillage
    for (let i = 0; i < COTES; i++) {
      const a1 = (i / COTES) * Math.PI * 2, a2 = ((i + 1) / COTES) * Math.PI * 2;
      const ax = px + Math.cos(a1) * r, az = pz + Math.sin(a1) * r;
      const bx = px + Math.cos(a2) * r, bz = pz + Math.sin(a2) * r;
      sortie.push(ax, sol, az, bx, sol, bz, bx, sol + haut, bz);
      sortie.push(ax, sol, az, bx, sol + haut, bz, ax, sol + haut, az);
    }
  }
}

// Construit tout le feuillage de haie de la commune.
//
// `lignes` : tableau de { pts, espece? }, en coordonnées jeu. `hauteurSol`
// donne l'altitude du terrain, `estLibre` écarte un segment qui tomberait sur
// la chaussée (fourni par l'appelant, seul à connaître les routes).
//
// Retourne un groupe, ou null si rien n'a été planté.
export function construireHaies(lignes, {
  hauteurSol = null, estLibre = null, roadY = 0.25,
} = {}) {
  // Un tableau de positions PAR ESPÈCE : chaque essence a sa teinte, et un
  // seul maillage par espèce garde le compte d'appels de dessin à quatre.
  const parEspece = new Map();
  const futs = [];
  let compteur = 0;

  for (const ligne of lignes) {
    const pts = ligne.pts;
    if (!pts || pts.length < 2) continue;
    // Longueur cumulée : elle sert à découper en tronçons d'espèce constante.
    let parcouru = 0;

    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      // Un segment de plus de 120 m dans OSM est presque toujours une erreur
      // de saisie ou une limite communale, pas une haie plantée.
      if (len < 0.3 || len > 120) continue;
      // Test du segment en plusieurs points, pas seulement en son milieu : une
      // haie de 40 m dont le milieu tombe dans un jardin peut parfaitement
      // traverser la chaussée à son extrémité, et c'est exactement ce qui
      // arrivait aux carrefours, la clôture barrant la rue en travers.
      if (estLibre) {
        const pas = Math.max(2, Math.ceil(len / 3));
        let libre = true;
        for (let k = 0; k <= pas; k++) {
          const t = k / pas;
          if (!estLibre(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) { libre = false; break; }
        }
        if (!libre) { parcouru += len; continue; }
      }

      // Espèce : imposée par l'appelant, sinon tirée par tronçon de 15 m.
      const espece = ligne.espece
        ?? especeDuTroncon(Math.floor(parcouru / 15) * 7.7 + Math.round(x1 * 0.31 + z1 * 0.17));
      const spec = ESPECES[espece] ?? ESPECES.laurier;

      const y1 = (hauteurSol ? hauteurSol(x1, z1) : 0) + roadY;
      const y2 = (hauteurSol ? hauteurSol(x2, z2) : 0) + roadY;

      if (!parEspece.has(espece)) parEspece.set(espece, { pos: [], col: [] });
      const bac = parEspece.get(espece);
      tronconFeuillage(x1, z1, x2, z2, y1, y2, spec,
        Math.abs(x1 * 3.7 + z1 * 11.3) + parcouru, bac.pos, bac.col);

      if (spec.pied) futsCharmille(x1, z1, x2, z2, y1, y2, spec.pied, futs);

      parcouru += len;
      compteur++;
    }
  }

  if (!compteur) return null;

  const group = new THREE.Group();
  group.name = 'haies';

  for (const [espece, bac] of parEspece) {
    if (!bac.pos.length) continue;
    const spec = ESPECES[espece];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bac.pos, 3));
    // Nuance par facette. Le pont recopie l'attribut `color` dans la
    // géométrie Babylon, et le maillage le lit par défaut : c'est le moyen le
    // moins cher de rompre les aplats, sans texture ni appel de dessin
    // supplémentaire. Le matériau reste blanc, la teinte d'espèce étant
    // portée par la couleur elle-même.
    g.setAttribute('color', new THREE.Float32BufferAttribute(bac.col, 3));
    // Normales calculées sur la géométrie déformée : c'est le bruit de surface
    // qui produit l'accroche de lumière, il faut donc que les normales le
    // suivent. `flatShading` conserve les facettes, un lissage effacerait le
    // relief qu'on vient de créer.
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(spec.teinte, spec.sat, spec.clarte),
      vertexColors: true, roughness: 1, flatShading: true,
    }));
    mesh.name = `haie-${espece}`;
    // Ombre reçue seulement : une haie qui projette son ombre dans les
    // cascades coûte une passe entière pour un gain nul à hauteur de conduite.
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  if (futs.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(futs, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x6b5a45, roughness: 1, flatShading: true,
    }));
    mesh.name = 'haie-futs';
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group.children.length ? group : null;
}
