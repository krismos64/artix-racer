// Parkings en épi des quartiers d'habitat collectif.
//
// Les barres d'immeubles d'Artix (avenue Edmond Rostand, rue Dufau) sont
// desservies par des voies bordées de places perpendiculaires marquées au sol.
// Ces places ne sont pas cartographiées dans OpenStreetMap, mais leur présence
// est visible sur l'orthophoto IGN et se déduit de la règle qui les gouverne :
// un immeuble collectif implique un stationnement résidentiel le long de sa
// voie de desserte.
//
// Le module reconnaît ces situations et pose la bande goudronnée, le marquage
// et les véhicules qui l'occupent.
import * as THREE from 'three';

// Cotes réglementaires françaises d'une place perpendiculaire.
const PLACE_LARGEUR = 2.4;
const PLACE_LONGUEUR = 5.0;

function hash(n) {
  const s = Math.sin(n * 91.7) * 28657.13;
  return s - Math.floor(s);
}

// Un immeuble collectif : emprise étendue et hauteur d'au moins deux étages.
// C'est ce qui distingue une barre d'un pavillon, et donc ce qui justifie un
// stationnement résidentiel groupé.
function immeublesCollectifs(buildings) {
  const out = [];
  for (const b of buildings ?? []) {
    const surface = b.surface ?? b.footprint ?? 0;
    const h = b.hauteur ?? b.height ?? 0;
    // R+2 au minimum et emprise de barre : un pavillon à étage atteint 6,5 m
    // et 240 m², ce qui ne justifie aucun parking résidentiel groupé.
    if (surface < 400 || h < 8) continue;
    // Un hangar est vaste et bas, un immeuble est allongé et haut.
    if (b.nature === 'Industriel, agricole ou commercial') continue;
    let cx = 0, cz = 0;
    for (const [x, z] of b.pts) { cx += x; cz += z; }
    cx /= b.pts.length; cz /= b.pts.length;
    let rayon = 0;
    for (const [x, z] of b.pts) rayon = Math.max(rayon, Math.hypot(x - cx, z - cz));
    out.push({ x: cx, z: cz, rayon, surface });
  }
  return out;
}

// Cherche les tronçons de voie qui desservent un immeuble collectif et qui
// peuvent donc porter un parking en épi.
function trouverBandes(data) {
  const collectifs = immeublesCollectifs(data.buildings);
  if (!collectifs.length) return [];

  // Grille des immeubles : sans elle, chaque segment de voie serait comparé à
  // toute la ville.
  const CELL = 60;
  const grille = new Map();
  for (const c of collectifs) {
    const k = `${Math.floor(c.x / CELL)},${Math.floor(c.z / CELL)}`;
    if (!grille.has(k)) grille.set(k, []);
    grille.get(k).push(c);
  }
  const collectifProche = (x, z, portee) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        for (const c of grille.get(`${cx + ox},${cz + oz}`) ?? []) {
          if (Math.hypot(c.x - x, c.z - z) < portee + c.rayon) return c;
        }
      }
    }
    return null;
  };

  const bandes = [];
  for (const r of data.roads) {
    if (!r.drivable) continue;
    // Voies de desserte uniquement : on ne se gare pas en épi sur une
    // départementale.
    if (!['residential', 'service', 'unclassified', 'living_street'].includes(r.kind)) continue;
    if (r.rondPoint || r.bridge) continue;

    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      // Une bande courte n'accueille pas assez de places pour se lire.
      if (len < 22) continue;

      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      // 22 m depuis la façade : au-delà, la voie ne dessert plus l'immeuble et
      // le stationnement redevient du simple bord de trottoir.
      const imm = collectifProche(mx, mz, 22);
      if (!imm) continue;

      // Le parking se pose du côté opposé à l'immeuble : c'est la disposition
      // observée avenue Edmond Rostand, où les places font face aux entrées.
      const versImm = Math.sign((imm.x - mx) * nx + (imm.z - mz) * nz) || 1;
      const cote = -versImm;

      bandes.push({
        x1, z1, x2, z2, ux, uz, nx: nx * cote, nz: nz * cote,
        len, largeurVoie: r.width,
      });
    }
  }
  return bandes;
}

export class ParkingsEpi {
  constructor(scene, data, relief, roadY) {
    this.group = new THREE.Group();
    this.places = [];
    const bandes = trouverBandes(data);
    if (!bandes.length) { this.effectif = 0; return; }

    const sol = (x, z) => (relief ? relief.hauteurRoute(x, z) : 0);

    // Bande goudronnée et marquage, en géométrie fusionnée.
    const enrobePos = [], marquagePos = [];
    // Le marquage est posé légèrement au-dessus de l'enrobé, lui-même au-dessus
    // de la chaussée : sans ces décalages, les surfaces coplanaires clignotent.
    const Y_ENROBE = roadY + 0.012;
    const Y_TRAIT = roadY + 0.024;

    const quad = (tab, ax, ay, az, bx, by, bz, cx2, cy, cz2, dx2, dy, dz2) => {
      tab.push(ax, ay, az, bx, by, bz, cx2, cy, cz2);
      tab.push(ax, ay, az, cx2, cy, cz2, dx2, dy, dz2);
    };

    for (const b of bandes) {
      // Nombre entier de places sur la longueur du tronçon.
      const n = Math.floor(b.len / PLACE_LARGEUR);
      if (n < 4) continue;
      const marge = (b.len - n * PLACE_LARGEUR) / 2;

      // Bord intérieur de la bande : au ras de la chaussée.
      const d0 = b.largeurVoie / 2;
      const d1 = d0 + PLACE_LONGUEUR;

      // Rectangle d'enrobé couvrant toute la bande.
      const p = (long, lat) => [
        b.x1 + b.ux * long + b.nx * lat,
        b.z1 + b.uz * long + b.nz * lat,
      ];
      const [ax, az] = p(marge, d0);
      const [bx, bz] = p(b.len - marge, d0);
      const [cx2, cz2] = p(b.len - marge, d1);
      const [dx2, dz2] = p(marge, d1);
      quad(enrobePos,
        ax, sol(ax, az) + Y_ENROBE, az,
        bx, sol(bx, bz) + Y_ENROBE, bz,
        cx2, sol(cx2, cz2) + Y_ENROBE, cz2,
        dx2, sol(dx2, dz2) + Y_ENROBE, dz2);

      // Traits de séparation, perpendiculaires à la voie.
      for (let k = 0; k <= n; k++) {
        const long = marge + k * PLACE_LARGEUR;
        const demi = 0.06;    // demi-largeur du trait
        const [t1x, t1z] = p(long - demi, d0);
        const [t2x, t2z] = p(long + demi, d0);
        const [t3x, t3z] = p(long + demi, d1);
        const [t4x, t4z] = p(long - demi, d1);
        quad(marquagePos,
          t1x, sol(t1x, t1z) + Y_TRAIT, t1z,
          t2x, sol(t2x, t2z) + Y_TRAIT, t2z,
          t3x, sol(t3x, t3z) + Y_TRAIT, t3z,
          t4x, sol(t4x, t4z) + Y_TRAIT, t4z);

        // Une place sur deux environ est occupée : un parking plein comme un
        // parking vide se remarquent tous les deux comme artificiels.
        if (k === n) continue;
        const graine = Math.abs(t1x * 13.7 + t1z * 29.3);
        if (hash(graine) > 0.55) continue;
        const [px, pz] = p(long + PLACE_LARGEUR / 2, d0 + PLACE_LONGUEUR / 2 - 0.2);
        this.places.push({
          x: px, z: pz, y: sol(px, pz) + roadY,
          // Le véhicule est perpendiculaire à la voie, capot vers l'extérieur
          // ou marche arrière selon les habitudes.
          cap: Math.atan2(b.nx, b.nz) + (hash(graine + 7.7) > 0.45 ? 0 : Math.PI),
          graine,
        });
      }
    }

    this.effectif = this.places.length;
    if (!enrobePos.length) return;

    const geoEnrobe = new THREE.BufferGeometry();
    geoEnrobe.setAttribute('position', new THREE.Float32BufferAttribute(enrobePos, 3));
    geoEnrobe.computeVertexNormals();
    const matEnrobe = new THREE.MeshStandardMaterial({
      color: 0x3e4247, roughness: 0.94, side: THREE.DoubleSide,
    });
    this.group.add(new THREE.Mesh(geoEnrobe, matEnrobe));

    if (marquagePos.length) {
      const geoTraits = new THREE.BufferGeometry();
      geoTraits.setAttribute('position', new THREE.Float32BufferAttribute(marquagePos, 3));
      geoTraits.computeVertexNormals();
      const matTraits = new THREE.MeshStandardMaterial({
        color: 0xd8d8d2, roughness: 0.8, side: THREE.DoubleSide,
      });
      this.group.add(new THREE.Mesh(geoTraits, matTraits));
    }

    scene.add(this.group);
  }
}
