// Passants d'Artix : ils marchent sur les 11,6 km de cheminements piétons
// réellement cartographiés, s'arrêtent pour discuter entre eux et traversent
// aux passages piétons.
//
// Le rendu se fait par InstancedMesh : quelques centaines de silhouettes
// animées ne coûtent qu'une poignée d'appels de dessin.
//
// Proportions : un adulte de 1,72 m à l'échelle 1, mesuré depuis la plante
// des pieds (entrejambe 0,83, épaules 1,41, sommet du crâne 1,72). La
// première version empilait une capsule de tronc et une sphère de tête de
// diamètre presque égal, pour un passant de 1,10 m : un bonhomme de neige
// plus petit que la Ferrari (1,19 m).
import * as THREE from 'three';

// Palette de vêtements : teintes ordinaires d'un bourg béarnais, sans
// saturation excessive qui trahirait le procédural.
const HAUTS = [
  0x3b5a6b, 0x2f4858, 0x7a3b3b, 0x46603f, 0x8a7a5c,
  0x2b2f36, 0x6b5b7b, 0xa8483c, 0x38566b, 0x9a8f7a,
];
const BAS = [0x2b3038, 0x3a3f47, 0x4a4034, 0x22262c, 0x5a4f42];
const PEAU = [0xe8c4a0, 0xd9ae86, 0xc99a70, 0xa87550, 0x8a5f3e];
const CHEVEUX = [0x2a1f18, 0x4a3524, 0x6b4a2f, 0x8a7250, 0x3a3a3a, 0x9c9184];
// Chaussures : cuir sombre et baskets claires, comme dans n'importe quelle
// rue. Des pieds tous noirs faisaient une rangée de points identiques.
const CHAUSSURES = [0x1e1c1a, 0x2c2622, 0x3a3128, 0x4a4a4e, 0xb8b2a6, 0x6b3f2c];

// Vitesse de marche : 1,2 m/s en moyenne, un peu plus vite pour certains.
const VITESSE_BASE = 1.15;

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Volume de révolution à sections elliptiques empilées, pour un buste qui
// s'élargit aux épaules et se resserre au bassin. Chaque section donne
// [demi-largeur X, demi-profondeur Z, hauteur Y]. Le volume est FERMÉ par un
// disque en haut et en bas : le pont Three→Babylon désactive le back-face
// culling sur tous les matériaux, un volume ouvert par une extrémité montre
// son intérieur éclairé et ressort délavé.
function tronc(sections, segments) {
  const pos = [], idx = [];
  for (const [rx, rz, y] of sections) {
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * rx, y, Math.sin(a) * rz);
    }
  }
  // Bandes latérales entre sections consécutives.
  for (let s = 0; s < sections.length - 1; s++) {
    const b0 = s * segments, b1 = (s + 1) * segments;
    for (let k = 0; k < segments; k++) {
      const k2 = (k + 1) % segments;
      idx.push(b0 + k, b1 + k, b0 + k2);
      idx.push(b0 + k2, b1 + k, b1 + k2);
    }
  }
  // Fermetures : un sommet central par extrémité.
  const bas = pos.length / 3;
  pos.push(0, sections[0][2], 0);
  for (let k = 0; k < segments; k++) {
    idx.push(bas, (k + 1) % segments, k);
  }
  const haut = pos.length / 3;
  const dernier = (sections.length - 1) * segments;
  pos.push(0, sections[sections.length - 1][2], 0);
  for (let k = 0; k < segments; k++) {
    idx.push(haut, dernier + k, dernier + (k + 1) % segments);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Concatène plusieurs géométries en une seule, pour épargner un appel de
// dessin par partie. Trois.js fournit `mergeGeometries`, mais il exige des
// jeux d'attributs identiques ; ici toutes les pièces n'ont que `position`,
// les normales étant recalculées après coup.
function fusionner(geometries) {
  const pos = [], idx = [];
  let decalage = 0;
  for (const g of geometries) {
    const p = g.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    const ind = g.index ? g.index.array : null;
    if (ind) {
      for (let i = 0; i < ind.length; i++) idx.push(ind[i] + decalage);
    } else {
      for (let i = 0; i < p.length / 3; i++) idx.push(i + decalage);
    }
    decalage += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// Calotte sphérique refermée par un disque : la chevelure coiffe le crâne
// sans laisser de bord ouvert.
function calotte(rayon, fraction, segments) {
  const g = new THREE.SphereGeometry(rayon, segments, 8, 0, Math.PI * 2, 0, Math.PI * fraction);
  const pos = Array.from(g.attributes.position.array);
  const idx = Array.from(g.index.array);
  // Le dernier anneau de la sphère partielle borde l'ouverture : on le
  // referme par un disque au niveau de son plan.
  const yBord = Math.cos(Math.PI * fraction) * rayon;
  const rBord = Math.sin(Math.PI * fraction) * rayon;
  const centre = pos.length / 3;
  pos.push(0, yBord, 0);
  const premier = centre + 1;
  for (let k = 0; k < segments; k++) {
    const a1 = (k / segments) * Math.PI * 2;
    const a2 = ((k + 1) / segments) * Math.PI * 2;
    pos.push(Math.cos(a1) * rBord, yBord, Math.sin(a1) * rBord);
    idx.push(centre, premier + k, premier + ((k + 1) % segments));
    void a2;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// Extrait le réseau de cheminements piétons : trottoirs, sentiers, places.
// Les passants s'y déplacent de nœud en nœud, comme de vrais promeneurs.
export function reseauPieton(data, relief) {
  const noeuds = [];
  const index = new Map();       // clé de position -> index de nœud
  const cle = (x, z) => `${Math.round(x * 2)},${Math.round(z * 2)}`;

  const ajouter = (x, z, traversee = false) => {
    const k = cle(x, z);
    if (index.has(k)) {
      const id = index.get(k);
      // Un nœud partagé entre trottoir et passage piéton garde le marquage.
      if (traversee) noeuds[id].traversee = true;
      return id;
    }
    const id = noeuds.length;
    noeuds.push({ x, z, voisins: [], traversee });
    index.set(k, id);
    return id;
  };

  // `living_street` est une rue carrossable (zone de rencontre), pas un
  // cheminement : l'inclure faisait marcher les passants sur la chaussée.
  const PIETON = new Set(['footway', 'path', 'pedestrian', 'steps']);

  // Segments de chaussée, pour écarter les cheminements qui les recouvrent.
  // OSM trace 24 % des points piétons sur l'axe de la voie : les y laisser
  // ferait marcher les passants au milieu de la route.
  const chaussees = [];
  for (const r of data.roads) {
    if (!r.drivable) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      chaussees.push({
        x1: r.pts[i][0], z1: r.pts[i][1],
        x2: r.pts[i + 1][0], z2: r.pts[i + 1][1],
        demi: r.width / 2,
      });
    }
  }

  // Distance d'un point à la chaussée la plus proche, et vecteur pour s'en
  // écarter. Renvoie null si le point est déjà hors de toute voie.
  const ecarterDeLaRoute = (x, z) => {
    let dMin = Infinity, px = 0, pz = 0, demi = 0;
    for (const s of chaussees) {
      if (Math.abs(s.x1 - x) > 30 && Math.abs(s.z1 - z) > 30) continue;
      const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
      const l2 = dx * dx + dz * dz;
      if (l2 < 1e-6) continue;
      let t = ((x - s.x1) * dx + (z - s.z1) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.x1 + dx * t, qz = s.z1 + dz * t;
      const d = Math.hypot(x - qx, z - qz);
      if (d < dMin) { dMin = d; px = qx; pz = qz; demi = s.demi; }
    }
    // Le trottoir commence au bord de chaussée, plus une marge de sécurité.
    const marge = demi + 1.3;
    if (!Number.isFinite(dMin) || dMin >= marge) return null;
    // Direction depuis l'axe de la voie vers le point : on pousse dans ce sens.
    let vx = x - px, vz = z - pz;
    const l = Math.hypot(vx, vz);
    if (l < 0.05) {
      // Point exactement sur l'axe : on choisit une perpendiculaire.
      vx = 1; vz = 0;
    } else { vx /= l; vz /= l; }
    return { x: px + vx * marge, z: pz + vz * marge };
  };

  for (const r of data.roads) {
    if (!PIETON.has(r.kind)) continue;
    // Hors zone de jeu : inutile d'y faire marcher quelqu'un.
    if (Math.hypot(r.pts[0][0], r.pts[0][1]) > 1200) continue;
    // Un passage piéton traverse la chaussée par nature : ses points ne
    // doivent pas être repoussés, sinon la traversée disparaît.
    const traversee = r.footway === 'crossing';

    let precedent = null;
    for (const [x0, z0] of r.pts) {
      // Repoussé hors de la chaussée si le tracé OSM la recouvre.
      const corrige = traversee ? null : ecarterDeLaRoute(x0, z0);
      const x = corrige ? corrige.x : x0;
      const z = corrige ? corrige.z : z0;
      const id = ajouter(x, z, traversee);
      if (precedent !== null && precedent !== id) {
        const d = Math.hypot(noeuds[id].x - noeuds[precedent].x,
          noeuds[id].z - noeuds[precedent].z);
        // Arêtes trop longues : on ne les segmente pas, la marche reste fluide.
        if (d > 0.5 && d < 90) {
          noeuds[precedent].voisins.push(id);
          noeuds[id].voisins.push(precedent);
        }
      }
      precedent = id;
    }
  }

  // Seconde passe : une arête peut traverser une chaussée même si ses deux
  // extrémités sont sur le trottoir (cheminement qui longe puis coupe la voie).
  // On coupe ces liaisons, sauf celles marquées comme passage piéton.
  for (const n of noeuds) {
    n.voisins = n.voisins.filter((idV) => {
      const v = noeuds[idV];
      if (!v) return false;
      // Milieu de l'arête : s'il tombe en pleine chaussée, la liaison est
      // une traversée sauvage qu'on supprime.
      const mx = (n.x + v.x) / 2, mz = (n.z + v.z) / 2;
      return !ecarterDeLaRoute(mx, mz) || n.traversee || v.traversee;
    });
  }

  // On ne garde que les nœuds connectés : un point isolé bloquerait un passant.
  return noeuds.filter((n) => n.voisins.length > 0).length > 20 ? noeuds : [];
}

export class Pietons {
  constructor(data, relief, roadY, effectif = 120) {
    this.relief = relief;
    this.roadY = roadY;
    this.noeuds = reseauPieton(data, relief);
    this.agents = [];
    this.group = new THREE.Group();
    if (!this.noeuds.length) return;

    // Nœuds effectivement praticables, tirés au sort comme points de départ.
    this.praticables = this.noeuds
      .map((n, i) => (n.voisins.length ? i : -1))
      .filter((i) => i >= 0);
    if (this.praticables.length < 4) { this.noeuds = []; return; }

    this.construireMeshes(effectif);
    this.peupler(effectif);
  }

  // Silhouette humaine simplifiée en SIX maillages : buste, tête (cou
  // compris), chevelure, puis jambes, bras et chaussures, chacun de ces
  // trois derniers réunissant le membre gauche et le droit dans un même
  // maillage de 2n instances. Chaque partie est animée indépendamment pour
  // que la marche se lise. Le nombre de maillages compte : à neuf, les
  // passants coûtaient 5,5 fps ; à six, 0,4.
  construireMeshes(n) {
    const mat = (rough) => new THREE.MeshStandardMaterial({ roughness: rough });

    // Buste : tronc de pyramide à section elliptique, large aux épaules
    // (0,42 m) et resserré au bassin (0,32 m). Une capsule donnait un
    // cylindre de 0,34 m de diamètre constant, d'où la silhouette en gélule.
    // Les sections sont EMPILÉES, épaules comprises, pour que le volume soit
    // fermé : le pont désactive le back-face culling sur tous les matériaux,
    // un volume ouvert ressort délavé (déjà vécu sur les haies).
    // Sections mesurées depuis le bas du vêtement (hanches, 0,95 m du sol)
    // jusqu'aux trapèzes. Hauteur totale 0,53 m : un veston s'arrête à la
    // hanche. Descendre plus bas (l'essai à 0,84) habillait le haut des
    // cuisses et effaçait l'articulation des jambes.
    const bustGeo = tronc([
      [0.150, 0.100, 0.000],   // bas du vêtement, sur les hanches
      [0.146, 0.096, 0.055],   // taille, le point le plus étroit
      [0.180, 0.112, 0.245],   // cage thoracique
      [0.208, 0.122, 0.435],   // épaules, le point le plus large
      [0.196, 0.114, 0.490],   // haut des épaules
      [0.138, 0.094, 0.530],   // trapèzes, resserrés vers le cou
    ], 12);

    // Tête ovoïde AVEC son cou, en un seul maillage : les deux portent la
    // même carnation et ne bougent jamais l'un par rapport à l'autre, les
    // séparer coûtait un appel de dessin pour rien (le coût dominant de la
    // scène est le nombre d'appels, pas les triangles).
    // Une sphère parfaite de 0,23 m lisait comme une boule de bonhomme de
    // neige : elle est étirée en hauteur et aplatie en largeur.
    const teteGeo = new THREE.SphereGeometry(0.098, 10, 8);
    teteGeo.scale(0.86, 1.16, 0.94);
    const couGeo = new THREE.CylinderGeometry(0.052, 0.064, 0.115, 7);
    couGeo.translate(0, -0.145, 0);
    const teteEtCou = fusionner([teteGeo, couGeo]);

    // Chevelure : calotte posée sur le crâne, refermée par un disque pour
    // que le volume reste clos (le pont désactive le back-face culling).
    const chevGeo = calotte(0.103, 0.58, 9);
    chevGeo.scale(0.88, 1.16, 0.96);

    // Membres : plus fins et plus longs que les anciens. Jambe = cuisse +
    // mollet (0,80 m), bras = 0,58 m épaule-poignet.
    // Jambe : hanche 0,826 à cheville 0,095, soit 0,73 m entre les centres
    // des deux calottes. Le pivot étant la hanche, on DÉCALE la géométrie
    // vers le bas : ainsi une rotation de cuisse fait balancer la jambe au
    // lieu de la faire tourner sur son milieu.
    const membreGeo = new THREE.CapsuleGeometry(0.052, 0.645, 3, 6);
    membreGeo.translate(0, -0.3765, 0);
    // Bras : épaule 1,41 à poignet 0,68, soit 0,73 m. Même décalage, pivot
    // à l'épaule. Sans lui, la capsule centrée sur l'épaule montait à
    // 1,675 m, au-dessus du cou, et barrait le torse en diagonale.
    const brasGeo = new THREE.CapsuleGeometry(0.040, 0.58, 3, 6);
    brasGeo.translate(0, -0.365, 0);
    // Chaussure : semelle au sol, chaussure décalée vers l'AVANT du pied
    // (le pivot est la cheville, les orteils sont devant).
    const chaussureGeo = new THREE.BoxGeometry(0.098, 0.068, 0.245);
    // Semelle sous la cheville (la boîte descend de 0,068 depuis le pivot)
    // et décalée vers l'AVANT : les orteils dépassent, le talon non.
    chaussureGeo.translate(0, -0.034, 0.052);

    this.corps = new THREE.InstancedMesh(bustGeo, mat(0.85), n);
    this.tete = new THREE.InstancedMesh(teteEtCou, mat(0.7), n);
    this.cheveux = new THREE.InstancedMesh(chevGeo, mat(0.9), n);
    // Membres pairs : UN SEUL maillage de 2n instances par type, le membre
    // gauche du passant i à l'indice i, le droit à n + i. Gauche et droite
    // partagent la même couleur (le haut, le bas, la chaussure), seule leur
    // matrice diffère : les séparer coûtait trois appels de dessin par
    // cascade d'ombre pour un résultat identique à l'image.
    this.jambes = new THREE.InstancedMesh(membreGeo, mat(0.85), n * 2);
    this.bras = new THREE.InstancedMesh(brasGeo, mat(0.85), n * 2);
    // Chaussures : sans elles, la capsule de jambe se termine en dôme et le
    // passant paraît flotter.
    this.pieds = new THREE.InstancedMesh(chaussureGeo, mat(0.55), n * 2);
    this.effectifMax = n;

    for (const m of [this.corps, this.tete, this.cheveux,
      this.jambes, this.bras, this.pieds]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
    }

    // Objets de travail de `update`, alloués une fois. Les paires
    // maillage/signe sont figées ici : les recréer à chaque passant allouait
    // deux tableaux et deux sous-tableaux par membre animé.
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qq = new THREE.Quaternion();
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._axeY = new THREE.Vector3(0, 1, 0);
    this._echelle = new THREE.Vector3(1, 1, 1);
    this._posTmp = new THREE.Vector3();
    this._cheville = new THREE.Vector3();
    // Chaque membre porte son signe (gauche 1, droite -1) et le décalage
    // d'instance qui lui revient dans le maillage partagé.
    this._membres = [[1, 0], [-1, n]];
    // Liste des maillages à marquer pour mise à jour, figée elle aussi.
    this._tousMaillages = [this.corps, this.tete, this.cheveux,
      this.jambes, this.bras, this.pieds];
  }

  peupler(n) {
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const depart = this.praticables[Math.floor(hash(i * 7.3) * this.praticables.length)];
      const t = hash(i * 3.1);

      const agent = {
        noeud: depart,
        cible: this.choisirVoisin(depart, -1),
        avance: 0,
        // Chacun a sa taille et son allure : un groupe uniforme se repère
        // immédiatement comme artificiel. Les cotes de placement valent
        // 1,72 m à T = 1, donc 1,60 m à 1,86 m : la dispersion réelle des
        // adultes. L'ancienne plage (0,90 à 1,12 sur des cotes calées à
        // 1,10 m) peuplait la ville de passants d'un mètre de haut.
        taille: 0.93 + t * 0.15,
        vitesse: VITESSE_BASE * (0.78 + hash(i * 5.7) * 0.5),
        phase: hash(i * 11.3) * Math.PI * 2,
        // État : marche, arrêt, ou conversation avec un voisin.
        etat: 'marche',
        minuteur: 2 + hash(i * 2.9) * 12,
        interlocuteur: -1,
        // Geste de conversation, pour que les échanges se voient de loin.
        geste: 0,
      };
      this.agents.push(agent);

      // Couleurs fixées une fois : elles ne changent pas d'une frame à l'autre.
      // Les deux membres d'une paire vivent dans le même maillage, aux
      // indices i et n + i : même teinte, matrices distinctes.
      col.setHex(HAUTS[Math.floor(hash(i * 13.7) * HAUTS.length)] || 0x3b5a6b);
      this.corps.setColorAt(i, col);
      this.bras.setColorAt(i, col);
      this.bras.setColorAt(n + i, col);
      col.setHex(BAS[Math.floor(hash(i * 17.1) * BAS.length)]);
      this.jambes.setColorAt(i, col);
      this.jambes.setColorAt(n + i, col);
      // Le cou porte la même carnation que le visage : une teinte distincte
      // trahirait le raccord entre les deux volumes.
      col.setHex(PEAU[Math.floor(hash(i * 19.3) * PEAU.length)]);
      this.tete.setColorAt(i, col);
      col.setHex(CHEVEUX[Math.floor(hash(i * 23.9) * CHEVEUX.length)]);
      this.cheveux.setColorAt(i, col);
      col.setHex(CHAUSSURES[Math.floor(hash(i * 29.5) * CHAUSSURES.length)]);
      this.pieds.setColorAt(i, col);
      this.pieds.setColorAt(n + i, col);
    }
    for (const m of this._tousMaillages) {
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  // Choisit un voisin, en évitant de repartir d'où l'on vient sauf impasse.
  choisirVoisin(noeud, venantDe) {
    const v = this.noeuds[noeud]?.voisins ?? [];
    if (!v.length) return noeud;
    const autres = v.filter((x) => x !== venantDe);
    const liste = autres.length ? autres : v;
    return liste[Math.floor(Math.random() * liste.length)];
  }

  update(dt, temps, posVoiture) {
    if (!this.agents.length) return;
    // Objets de travail réutilisés d'une frame à l'autre. Avec 140 passants
    // animés en sept maillages instanciés, les temporaires alloués ici
    // pesaient plusieurs milliers d'objets par frame.
    const m = this._m;
    const q = this._q;
    const echelle = this._echelle;
    const axeY = this._axeY;
    const posTmp = this._posTmp;
    const cheville = this._cheville;
    const qq = this._qq;
    const eulerTmp = this._euler;
    const membres = this._membres;

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const nA = this.noeuds[a.noeud];
      const nB = this.noeuds[a.cible];
      if (!nA || !nB) continue;

      const dx = nB.x - nA.x, dz = nB.z - nA.z;
      const longueur = Math.hypot(dx, dz) || 1;

      a.minuteur -= dt;

      // Réaction à la voiture : un passant qui voit arriver un véhicule
      // s'écarte et interrompt sa conversation. Sans cela, les groupes
      // restent plantés au milieu du passage, ce qui casse l'illusion.
      if (posVoiture) {
        const pp = this.position(a);
        const dv = Math.hypot(pp.x - posVoiture.x, pp.z - posVoiture.z);
        if (dv < 9) {
          if (a.etat === 'discute') {
            const autre = this.agents[a.interlocuteur];
            if (autre) { autre.etat = 'marche'; autre.minuteur = 5 + Math.random() * 10; }
            a.etat = 'marche';
            a.interlocuteur = -1;
            a.minuteur = 5 + Math.random() * 10;
          }
          // Pas de côté : on décale légèrement l'agent hors de la trajectoire.
          a.ecart = Math.min(0.9, (9 - dv) * 0.16);
          a.ecartCap = Math.atan2(pp.x - posVoiture.x, pp.z - posVoiture.z);
        } else if (a.ecart) {
          a.ecart *= 0.92;
          if (a.ecart < 0.02) a.ecart = 0;
        }
      }

      // --- Conversations ---------------------------------------------------
      // Deux passants qui se croisent s'arrêtent parfois pour discuter. C'est
      // ce qui donne vie à une rue : des gens immobiles qui se parlent.
      if (a.etat === 'marche' && a.minuteur <= 0) {
        // Cherche un voisin proche également en marche. La recherche ne balaie
        // qu'un échantillon : sur 140 agents, un test exhaustif à chaque frame
        // serait quadratique pour un résultat identique.
        const pa = this.position(a);
        const debut = Math.floor(Math.random() * this.agents.length);
        for (let k = 0; k < 24; k++) {
          const j = (debut + k) % this.agents.length;
          if (j === i) continue;
          const b = this.agents[j];
          if (b.etat !== 'marche') continue;
          const pb = this.position(b);
          if (Math.hypot(pa.x - pb.x, pa.z - pb.z) < 3.2) {
            a.etat = 'discute'; b.etat = 'discute';
            a.interlocuteur = j; b.interlocuteur = i;
            const duree = 8 + Math.random() * 22;
            a.minuteur = duree; b.minuteur = duree;
            break;
          }
        }
        if (a.etat === 'marche') a.minuteur = 4 + Math.random() * 14;
      }

      if (a.etat === 'discute') {
        // Gesticulation : le bras s'anime par intermittence, comme quelqu'un
        // qui ponctue ses phrases.
        a.geste = Math.sin(temps * 3.4 + a.phase) * 0.5 + Math.sin(temps * 1.7 + a.phase * 2) * 0.3;
        if (a.minuteur <= 0) {
          a.etat = 'marche';
          a.minuteur = 6 + Math.random() * 16;
          const autre = this.agents[a.interlocuteur];
          if (autre && autre.etat === 'discute') {
            autre.etat = 'marche';
            autre.minuteur = 6 + Math.random() * 16;
          }
          a.interlocuteur = -1;
        }
      } else {
        // --- Marche ---
        a.avance += (a.vitesse * dt) / longueur;
        while (a.avance >= 1) {
          a.avance -= 1;
          const precedent = a.noeud;
          a.noeud = a.cible;
          a.cible = this.choisirVoisin(a.noeud, precedent);
        }
        a.geste *= 0.9;
      }

      // --- Placement et animation -----------------------------------------
      const p = this.position(a);
      // Pas de côté devant la voiture, appliqué au rendu seulement : le
      // cheminement suivi reste celui du réseau piéton.
      if (a.ecart) {
        p.x += Math.sin(a.ecartCap) * a.ecart;
        p.z += Math.cos(a.ecartCap) * a.ecart;
      }
      const sol = this.relief ? this.relief.hauteurRoute(p.x, p.z) : 0;
      const base = sol + this.roadY;
      const T = a.taille;

      // Orientation : dans le sens de marche, ou vers l'interlocuteur.
      let cap = Math.atan2(dx, dz);
      if (a.etat === 'discute' && a.interlocuteur >= 0) {
        const autre = this.agents[a.interlocuteur];
        if (autre) {
          const pb = this.position(autre);
          cap = Math.atan2(pb.x - p.x, pb.z - p.z);
        }
      }
      q.setFromAxisAngle(axeY, cap);

      // Balancement des membres : cadence proportionnelle à la vitesse.
      const cadence = a.etat === 'discute' ? 0 : temps * a.vitesse * 4.4 + a.phase;
      const swing = Math.sin(cadence) * 0.42;
      // Léger tangage du corps au rythme des pas.
      const bob = a.etat === 'discute' ? 0 : Math.abs(Math.sin(cadence)) * 0.022;

      echelle.set(T, T, T);
      // Cotes anatomiques d'un adulte de 1,72 m à T = 1, mesurées depuis la
      // plante des pieds : entrejambe 0,83, épaules 1,41, menton 1,50,
      // sommet du crâne 1,72. Les anciennes (buste à 0,62, tête à 0,98)
      // donnaient un passant de 1,10 m, soit un enfant de six ans à côté de
      // la Ferrari qui fait 1,19 m.
      // Le buste est posé par son BASSIN : sa géométrie est empilée vers le
      // haut depuis y = 0.
      m.compose(posTmp.set(p.x, base + (0.945 + bob) * T, p.z), q, echelle);
      this.corps.setMatrixAt(i, m);

      // Tête et cou en un bloc, posés sur les trapèzes.
      m.compose(posTmp.set(p.x, base + (1.605 + bob) * T, p.z), q, echelle);
      this.tete.setMatrixAt(i, m);
      m.compose(posTmp.set(p.x, base + (1.618 + bob) * T, p.z), q, echelle);
      this.cheveux.setMatrixAt(i, m);

      // Jambes : décalage latéral et balancement en opposition de phase. Le
      // pivot est la HANCHE (0,83), la capsule descendant de là vers le sol.
      // Écartement des hanches : 0,068 m de part et d'autre de l'axe, soit
      // 2,6 cm de vide entre deux cuisses de 5,2 cm de rayon. À 0,088 les
      // jambes bâillaient et le passant marchait en cow-boy.
      const latX = Math.cos(cap) * 0.068 * T;
      const latZ = -Math.sin(cap) * 0.068 * T;
      for (const paire of membres) {
        const signe = paire[0], base2 = paire[1], k = base2 + i;
        eulerTmp.set(swing * signe, cap, 0, 'YXZ');
        qq.setFromEuler(eulerTmp);
        const hancheX = p.x + latX * signe;
        const hancheZ = p.z + latZ * signe;
        // Pivot à la HANCHE : la géométrie de la jambe est décalée vers le
        // bas, la rotation la fait donc balancer comme une vraie cuisse.
        // L'avancée du pied vient de CETTE rotation seule : l'ajouter aussi
        // en translation (l'ancien `av`) déportait la jambe deux fois et
        // laissait la chaussure à un mètre de son propriétaire.
        m.compose(posTmp.set(hancheX, base + 0.826 * T, hancheZ), qq, echelle);
        this.jambes.setMatrixAt(k, m);

        // Chaussure : posée à l'extrémité de la capsule de jambe, obtenue en
        // faisant subir au vecteur hanche->cheville la rotation de la cuisse.
        // Le pied reste horizontal (quaternion `q`, cap seul) : une chaussure
        // qui pivoterait avec la cuisse pointerait vers le ciel.
        cheville.set(0, -0.751, 0).applyQuaternion(qq).multiplyScalar(T);
        m.compose(
          posTmp.set(
            hancheX + cheville.x,
            base + 0.826 * T + cheville.y,
            hancheZ + cheville.z,
          ),
          q, echelle,
        );
        this.pieds.setMatrixAt(k, m);
      }

      // Bras : balancement inverse des jambes, ou gesticulation en discussion.
      for (const paire of membres) {
        const signe = paire[0], k = paire[1] + i;
        const angle = a.etat === 'discute'
          ? -0.7 - a.geste * signe * 0.6
          : -swing * signe;
        // Rentré de 7° vers le corps : le buste se resserre de 0,208 aux
        // épaules à 0,146 à la taille, un bras strictement vertical laissait
        // 4 cm de jour sous l'aisselle et donnait une posture de pingouin.
        // En conversation le bras s'écarte, le geste doit rester lisible.
        const rentre = a.etat === 'discute' ? -0.02 : 0.12;
        eulerTmp.set(angle, cap, rentre * signe, 'YXZ');
        qq.setFromEuler(eulerTmp);
        // Pivot à l'ÉPAULE (1,41), écarté de 0,205 m de l'axe : la
        // demi-largeur d'épaules est 0,208, le bras affleure le buste.
        m.compose(
          posTmp.set(
            p.x + Math.cos(cap) * 0.205 * T * signe,
            base + (1.405 + bob) * T,
            p.z - Math.sin(cap) * 0.205 * T * signe,
          ),
          qq, echelle,
        );
        this.bras.setMatrixAt(k, m);
      }
    }

    for (const mesh of this._tousMaillages) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  position(a) {
    const nA = this.noeuds[a.noeud], nB = this.noeuds[a.cible];
    if (!nA) return { x: 0, z: 0 };
    if (!nB) return { x: nA.x, z: nA.z };
    return {
      x: nA.x + (nB.x - nA.x) * a.avance,
      z: nA.z + (nB.z - nA.z) * a.avance,
    };
  }

  // Nombre de passants réellement dessinés, piloté par le profil graphique.
  // Les agents excédentaires continuent d'exister et de marcher, seul leur
  // rendu s'arrête : borner `count` sur les maillages instanciés coûte un
  // simple entier, là où reconstruire réallouerait sept géométries.
  setVisibles(n) {
    this.visibles = Math.max(0, Math.min(this.agents.length, n));
    // Les maillages pairs rangent le membre gauche du passant i à l'indice i
    // et le droit à effectifMax + i : borner leur `count` à `visibles` comme
    // les autres effacerait TOUS les membres droits. Le pool étant contigu,
    // on prend l'intervalle qui couvre les deux moitiés.
    for (const m of this._tousMaillages ?? []) {
      const pair = m === this.jambes || m === this.bras || m === this.pieds;
      m.count = pair ? this.effectifMax + this.visibles : this.visibles;
    }
    return this.visibles;
  }

  get effectif() { return this.agents.length; }
}
