// Passants d'Artix : ils marchent sur les 11,6 km de cheminements piétons
// réellement cartographiés, s'arrêtent pour discuter entre eux et traversent
// aux passages piétons.
//
// Le rendu se fait par InstancedMesh : quelques centaines de silhouettes
// animées ne coûtent qu'une poignée d'appels de dessin.
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

// Vitesse de marche : 1,2 m/s en moyenne, un peu plus vite pour certains.
const VITESSE_BASE = 1.15;

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
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

  // Silhouette humaine simplifiée : corps, tête, deux jambes, deux bras.
  // Chaque partie est un InstancedMesh distinct, animé indépendamment pour
  // que la marche se lise.
  construireMeshes(n) {
    const mat = (rough) => new THREE.MeshStandardMaterial({ roughness: rough });

    const corpsGeo = new THREE.CapsuleGeometry(0.17, 0.42, 4, 8);
    const teteGeo = new THREE.SphereGeometry(0.115, 10, 8);
    const membreGeo = new THREE.CapsuleGeometry(0.058, 0.34, 3, 6);
    const brasGeo = new THREE.CapsuleGeometry(0.048, 0.30, 3, 6);
    const chevGeo = new THREE.SphereGeometry(0.121, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);

    this.corps = new THREE.InstancedMesh(corpsGeo, mat(0.85), n);
    this.tete = new THREE.InstancedMesh(teteGeo, mat(0.7), n);
    this.cheveux = new THREE.InstancedMesh(chevGeo, mat(0.9), n);
    this.jambeG = new THREE.InstancedMesh(membreGeo, mat(0.85), n);
    this.jambeD = new THREE.InstancedMesh(membreGeo, mat(0.85), n);
    this.brasG = new THREE.InstancedMesh(brasGeo, mat(0.85), n);
    this.brasD = new THREE.InstancedMesh(brasGeo, mat(0.85), n);

    for (const m of [this.corps, this.tete, this.cheveux,
      this.jambeG, this.jambeD, this.brasG, this.brasD]) {
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
    this._membres = [[this.jambeG, 1], [this.jambeD, -1]];
    this._bras = [[this.brasG, 1], [this.brasD, -1]];
    // Liste des maillages à marquer pour mise à jour, figée elle aussi.
    this._tousMaillages = [this.corps, this.tete, this.cheveux,
      this.jambeG, this.jambeD, this.brasG, this.brasD];
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
        // immédiatement comme artificiel.
        taille: 0.90 + t * 0.22,
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
      col.setHex(HAUTS[Math.floor(hash(i * 13.7) * HAUTS.length)] || 0x3b5a6b);
      this.corps.setColorAt(i, col);
      this.brasG.setColorAt(i, col);
      this.brasD.setColorAt(i, col);
      col.setHex(BAS[Math.floor(hash(i * 17.1) * BAS.length)]);
      this.jambeG.setColorAt(i, col);
      this.jambeD.setColorAt(i, col);
      col.setHex(PEAU[Math.floor(hash(i * 19.3) * PEAU.length)]);
      this.tete.setColorAt(i, col);
      col.setHex(CHEVEUX[Math.floor(hash(i * 23.9) * CHEVEUX.length)]);
      this.cheveux.setColorAt(i, col);
    }
    for (const m of [this.corps, this.tete, this.cheveux,
      this.jambeG, this.jambeD, this.brasG, this.brasD]) {
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
    const qq = this._qq;
    const eulerTmp = this._euler;
    const membres = this._membres;
    const bras = this._bras;

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
      m.compose(posTmp.set(p.x, base + (0.62 + bob) * T, p.z), q, echelle);
      this.corps.setMatrixAt(i, m);

      m.compose(posTmp.set(p.x, base + (0.98 + bob) * T, p.z), q, echelle);
      this.tete.setMatrixAt(i, m);
      m.compose(posTmp.set(p.x, base + (0.995 + bob) * T, p.z), q, echelle);
      this.cheveux.setMatrixAt(i, m);

      // Jambes : décalage latéral et balancement en opposition de phase.
      const latX = Math.cos(cap) * 0.075 * T;
      const latZ = -Math.sin(cap) * 0.075 * T;
      for (const paire of membres) {
        const mesh = paire[0], signe = paire[1];
        const av = Math.sin(cadence) * signe * 0.19 * T;
        eulerTmp.set(swing * signe, cap, 0, 'YXZ');
        qq.setFromEuler(eulerTmp);
        m.compose(
          posTmp.set(
            p.x + latX * signe + Math.sin(cap) * av,
            base + 0.28 * T,
            p.z + latZ * signe + Math.cos(cap) * av,
          ),
          qq, echelle,
        );
        mesh.setMatrixAt(i, m);
      }

      // Bras : balancement inverse des jambes, ou gesticulation en discussion.
      for (const paire of bras) {
        const mesh = paire[0], signe = paire[1];
        const angle = a.etat === 'discute'
          ? -0.7 - a.geste * signe * 0.6
          : -swing * signe;
        eulerTmp.set(angle, cap, 0, 'YXZ');
        qq.setFromEuler(eulerTmp);
        m.compose(
          posTmp.set(
            p.x + Math.cos(cap) * 0.215 * T * signe,
            base + (0.66 + bob) * T,
            p.z - Math.sin(cap) * 0.215 * T * signe,
          ),
          qq, echelle,
        );
        mesh.setMatrixAt(i, m);
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
    for (const m of this._tousMaillages ?? []) m.count = this.visibles;
    return this.visibles;
  }

  get effectif() { return this.agents.length; }
}
