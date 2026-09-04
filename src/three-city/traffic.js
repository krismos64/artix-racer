// Circulation légère dans Artix : une douzaine de véhicules qui suivent le
// graphe des voies carrossables, roulent à droite, tournent aux carrefours
// et freinent derrière le joueur ou un autre véhicule. Même architecture
// que les passants (pedestrians.js) : agents sur un graphe de nœuds,
// InstancedMesh dynamiques animés chaque frame, adoptés par le
// LiveInstancedBridge côté Babylon.
//
// Les véhicules ne sont PAS des obstacles physiques : le trafic est léger
// et freine devant le joueur, un contact reste rare. À revoir si le besoin
// se présente (cuboïdes mobiles dans la physique).
import * as THREE from 'three';
import { COULEURS, GABARITS, construireGeometrie } from './parkedcars.js';

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Vitesse de croisière par type de voie, en m/s (25 à 45 km/h : on est dans
// un bourg, pas sur une départementale dégagée).
const VITESSES = {
  primary: 12.5, secondary: 12, tertiary: 10.5,
  unclassified: 9, residential: 7.5, living_street: 5,
};

// Graphe routier : nœuds aux points des polylignes carrossables, arêtes
// entre points consécutifs. Les dessertes (service) et chemins (track) sont
// exclus : le trafic de transit n'y passe pas.
function reseauRoutier(data) {
  const noeuds = [];
  const index = new Map();
  const cle = (x, z) => `${Math.round(x)},${Math.round(z)}`;
  const ajouter = (x, z) => {
    const k = cle(x, z);
    if (index.has(k)) return index.get(k);
    const id = noeuds.length;
    noeuds.push({ x, z, voisins: [] });
    index.set(k, id);
    return id;
  };
  for (const r of data.roads) {
    if (!r.drivable || r.bridge) continue;
    if (!(r.kind in VITESSES)) continue;
    // Le trafic reste dans le bourg : au-delà, le joueur ne croise personne
    // et les agents coûtent pour rien.
    if (Math.hypot(r.pts[0][0], r.pts[0][1]) > 1200) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = ajouter(r.pts[i][0], r.pts[i][1]);
      const b = ajouter(r.pts[i + 1][0], r.pts[i + 1][1]);
      if (a === b) continue;
      // Sens unique : arête directionnelle ; sinon les deux sens.
      noeuds[a].voisins.push({ vers: b, kind: r.kind, largeur: r.width });
      if (!r.oneway) noeuds[b].voisins.push({ vers: a, kind: r.kind, largeur: r.width });
    }
  }
  return noeuds;
}

export class Circulation {
  // `flotte` : modèles low-poly de flotte.js ; sans elle, silhouettes en
  // boîte de parkedcars.js.
  constructor(data, relief, roadY, effectif = 12, flotte = null) {
    this.flotte = flotte;
    this.relief = relief;
    this.roadY = roadY;
    this.noeuds = reseauRoutier(data);
    this.agents = [];
    this.group = new THREE.Group();
    this.effectif = 0;
    const praticables = this.noeuds
      .map((n, i) => (n.voisins.length ? i : -1))
      .filter((i) => i >= 0);
    if (praticables.length < 8) return;

    // Types roulants : pas de scooter (sa silhouette garée n'a pas de
    // conducteur) ni de fourgon long, qui tournerait mal sur les nœuds serrés.
    const TYPES = ['compacte', 'berline', 'break', 'fourgonnette'];
    const parType = {};
    const types = [];
    for (let i = 0; i < effectif; i++) {
      const t = TYPES[Math.floor(hash(i * 3.7) * TYPES.length)];
      types.push(t);
      parType[t] = (parType[t] ?? 0) + 1;
    }

    const caisseMat = new THREE.MeshStandardMaterial({
      roughness: 0.42, metalness: 0.32, side: THREE.DoubleSide,
    });
    const vitreMat = new THREE.MeshStandardMaterial({
      color: 0x1a2430, roughness: 0.15, metalness: 0.4, side: THREE.DoubleSide,
    });
    const plaqueMat = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.35 });
    this.caisses = {};
    this.details = {};
    const idxDepart = {};
    // Même montage que le parc garé : carrosserie vernie teintée par
    // instance, détails (vitres, roues, feux) à la palette du kit.
    const peintureMat = new THREE.MeshPhysicalMaterial({
      roughness: 0.38, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08,
    });
    const detailsMat = flotte
      ? new THREE.MeshStandardMaterial({ map: flotte.palette, roughness: 0.55, metalness: 0.05 })
      : null;
    for (const [nom, n] of Object.entries(parType)) {
      const modele = flotte?.[nom];
      if (modele) {
        this.caisses[nom] = new THREE.InstancedMesh(modele.peinture, peintureMat, n);
        this.details[nom] = new THREE.InstancedMesh(modele.details, detailsMat, n);
        continue;
      }
      this.caisses[nom] = new THREE.InstancedMesh(
        construireGeometrie(GABARITS[nom]), [caisseMat, vitreMat, plaqueMat], n);
    }
    const roueGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.22, 10);
    const roueMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 });
    this.roues = new THREE.InstancedMesh(roueGeo, roueMat, effectif * 4);
    const feuGeo = new THREE.BoxGeometry(0.42, 0.15, 0.08);
    this.feuxAr = new THREE.InstancedMesh(feuGeo, new THREE.MeshStandardMaterial({
      color: 0x8c1c1c, emissive: 0x5a1010, emissiveIntensity: 0.7, roughness: 0.4,
    }), effectif * 2);
    this.feuxAv = new THREE.InstancedMesh(feuGeo, new THREE.MeshStandardMaterial({
      color: 0xd8dce0, roughness: 0.2, metalness: 0.3,
    }), effectif * 2);

    const col = new THREE.Color();
    for (let i = 0; i < effectif; i++) {
      const type = types[i];
      const j = idxDepart[type] ?? 0;
      idxDepart[type] = j + 1;
      const depart = praticables[Math.floor(hash(i * 7.9) * praticables.length)];
      const arete = this.noeuds[depart].voisins[0];
      this.agents.push({
        type, indexType: j,
        noeud: depart,
        cible: arete.vers,
        kind: arete.kind, largeur: arete.largeur,
        avance: hash(i * 5.3) * 0.8,
        vitesse: 0,
        vitesseMax: (VITESSES[arete.kind] ?? 8) * (0.85 + hash(i * 9.1) * 0.3),
        capLisse: null,
      });
      col.setHex(COULEURS[Math.floor(hash(i * 13.7) * COULEURS.length)]);
      col.multiplyScalar(0.94 + hash(i * 9.4) * 0.1);
      this.caisses[type].setColorAt(j, col);
    }

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qr = new THREE.Quaternion();
    this._axeY = new THREE.Vector3(0, 1, 0);
    this._ech = new THREE.Vector3(1, 1, 1);
    this._pos = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._echRoue = new THREE.Vector3(1, 1, 1);
    this._tous = [...Object.values(this.caisses), ...Object.values(this.details),
      this.roues, this.feuxAr, this.feuxAv];
    for (const m of this._tous) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      this.group.add(m);
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.effectif = effectif;
  }

  choisirVoisin(noeud, venantDe) {
    const v = this.noeuds[noeud].voisins;
    const autres = v.filter((a) => a.vers !== venantDe);
    const liste = autres.length ? autres : v;
    return liste[Math.floor(Math.random() * liste.length)];
  }

  update(dt, posVoiture) {
    if (!this.effectif) return;
    const m = this._m, q = this._q, qr = this._qr, pos = this._pos, tmp = this._tmp;

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const na = this.noeuds[a.noeud], nb = this.noeuds[a.cible];
      const dx = nb.x - na.x, dz = nb.z - na.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      const ux = dx / len, uz = dz / len;
      // Conduite à droite : décalage vers la droite du sens de marche.
      const offset = Math.min(2.1, Math.max(1.1, a.largeur * 0.25));
      const rx = -uz * offset, rz = ux * offset;

      const px = na.x + dx * (a.avance / len) + rx;
      const pz = na.z + dz * (a.avance / len) + rz;

      // Freinage : joueur ou congénère devant à moins de 12 m dans le cône
      // avant. Le trafic est léger, une décélération franche suffit.
      let cible = a.vitesseMax;
      const versJoueurX = posVoiture.x - px, versJoueurZ = posVoiture.z - pz;
      const dJoueur = Math.hypot(versJoueurX, versJoueurZ);
      if (dJoueur < 12 && (versJoueurX * ux + versJoueurZ * uz) / (dJoueur || 1) > 0.5) cible = 0;
      for (let k2 = 0; k2 < this.agents.length && cible > 0; k2++) {
        if (k2 === i) continue;
        const b = this.agents[k2];
        const bx = b._px ?? 0, bz = b._pz ?? 0;
        const dxk = bx - px, dzk = bz - pz;
        const dk = Math.hypot(dxk, dzk);
        if (dk < 9 && (dxk * ux + dzk * uz) / (dk || 1) > 0.75) cible = Math.min(cible, b.vitesse * 0.9);
      }
      a.vitesse += (cible - a.vitesse) * Math.min(1, dt * (cible < a.vitesse ? 5 : 1.6));
      a.avance += a.vitesse * dt;
      a._px = px; a._pz = pz;

      if (a.avance >= len) {
        a.avance -= len;
        const venantDe = a.noeud;
        a.noeud = a.cible;
        const arete = this.choisirVoisin(a.noeud, venantDe);
        // Cul-de-sac en sens unique : le nœud atteint n'a aucune arête
        // sortante. Le véhicule fait demi-tour vers son nœud d'origine ;
        // sans ce garde-fou, l'exception tuait la boucle de rendu entière.
        if (!arete) {
          a.cible = venantDe;
          a.avance = 0;
          continue;
        }
        a.cible = arete.vers;
        a.kind = arete.kind;
        a.largeur = arete.largeur;
        a.vitesseMax = (VITESSES[arete.kind] ?? 8) * (0.85 + hash(i * 9.1) * 0.3);
      }

      // Cap lissé : les changements de segment ne font pas pivoter la caisse
      // d'un coup.
      const capBrut = Math.atan2(ux, uz);
      if (a.capLisse === null) a.capLisse = capBrut;
      let ecart = capBrut - a.capLisse;
      while (ecart > Math.PI) ecart -= Math.PI * 2;
      while (ecart < -Math.PI) ecart += Math.PI * 2;
      a.capLisse += ecart * Math.min(1, dt * 7);

      const sol = (this.relief ? this.relief.hauteurRoute(px, pz) : 0) + this.roadY;
      q.setFromAxisAngle(this._axeY, a.capLisse);
      pos.set(px, sol, pz);
      m.compose(pos, q, this._ech);
      this.caisses[a.type].setMatrixAt(a.indexType, m);
      if (this.details[a.type]) {
        // Modèle complet : roues et feux sont dans le maillage de détails,
        // les annexes de la silhouette en boîte restent masquées.
        this.details[a.type].setMatrixAt(a.indexType, m);
        const modele = this.flotte[a.type];
        const rayon = modele.rayonRoue / 0.31;
        this._echRoue.set(rayon, 1, rayon);
        qr.setFromEuler(new THREE.Euler(0, a.capLisse, Math.PI / 2, 'YXZ'));
        modele.roues.forEach((r, n2) => {
          tmp.set(r.x, r.y, r.z).applyQuaternion(q);
          m.compose(tmp.add(pos), qr, this._echRoue);
          this.roues.setMatrixAt(i * 4 + n2, m);
        });
        for (let n2 = modele.roues.length; n2 < 4; n2++) this.roues.setMatrixAt(i * 4 + n2, this._zero);
        for (let f = 0; f < 2; f++) {
          this.feuxAr.setMatrixAt(i * 2 + f, this._zero);
          this.feuxAv.setMatrixAt(i * 2 + f, this._zero);
        }
        continue;
      }

      const gab = GABARITS[a.type];
      qr.setFromEuler(new THREE.Euler(0, a.capLisse, Math.PI / 2, 'YXZ'));
      let n2 = 0;
      for (const sxr of [-1, 1]) {
        for (const szr of [-1, 1]) {
          tmp.set(sxr * (gab.W - 0.05), 0.31, szr * gab.L * 0.62).applyQuaternion(q);
          m.compose(tmp.add(pos), qr, this._ech);
          this.roues.setMatrixAt(i * 4 + n2, m);
          n2++;
        }
      }
      const yFeu = gab.H0 + (gab.H1 - gab.H0) * 0.62;
      let f = 0;
      for (const cote of [-1, 1]) {
        tmp.set(cote * 0.58 * gab.W, yFeu, -(gab.L - 0.02)).applyQuaternion(q);
        m.compose(tmp.add(pos), q, this._ech);
        this.feuxAr.setMatrixAt(i * 2 + f, m);
        tmp.set(cote * 0.58 * gab.W, yFeu, gab.L - 0.02).applyQuaternion(q);
        m.compose(tmp.add(pos), q, this._ech);
        this.feuxAv.setMatrixAt(i * 2 + f, m);
        f++;
      }
    }
    for (const mesh of this._tous) mesh.instanceMatrix.needsUpdate = true;
  }
}
