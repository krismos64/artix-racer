// Accotements : la bande entre la chaussée et le terrain.
//
// Deux problèmes qu'ils résolvent ensemble.
//
// D'abord un trou : le terrain est interpolé sur une grille de 37,5 m, la
// chaussée suit le tracé réel de la voie. En pente, les deux divergent — jusqu'à
// plusieurs mètres sur les côtes d'Artix — et un vide s'ouvre entre la route et
// le sol, ce qui donne l'impression d'une chaussée transparente sur le bas-côté.
// Une bande cousue d'un bord à l'autre ferme ce vide quelle que soit la pente.
//
// Ensuite un défaut de réalisme : de l'herbe borde aujourd'hui toutes les voies,
// alors qu'en agglomération l'accotement est goudronné, stabilisé ou bordé d'un
// trottoir. Le revêtement se déduit du contexte de la voie.
import * as THREE from 'three';

// Revêtements d'accotement, par contexte. Les teintes sont celles observées sur
// les orthophotos et les photographies de rue d'Artix.
const REVETEMENTS = {
  // Le trottoir mesure 0,32 fois la clarté d'un volet blanc sur les
  // photographies du centre-bourg : le béton de voirie est nettement plus
  // sombre que le gris clair employé jusqu'ici, qui le rapprochait d'un mur.
  trottoir:   { couleur: 0x74736e, largeur: 1.6, creux: 0.00 },
  enrobe:     { couleur: 0x4a4d52, largeur: 1.2, creux: 0.01 },
  stabilise:  { couleur: 0x8c8172, largeur: 1.4, creux: 0.03 },
  gravier:    { couleur: 0x8f8574, largeur: 1.3, creux: 0.04 },
  herbe:      { couleur: 0x6f8a4e, largeur: 2.2, creux: 0.06 },
};

// Décide du revêtement d'accotement d'une voie. Aucune donnée OSM ne le
// renseigne à Artix : on l'infère du type de voie et de sa position, ce qui
// reproduit la règle réelle d'aménagement.
function revetementDe(r, distBourg) {
  // Un revêtement explicitement cartographié prime toujours.
  if (r.surface === 'gravel' || r.surface === 'fine_gravel') return 'gravier';
  if (r.surface === 'ground' || r.surface === 'grass' || r.surface === 'dirt') return 'herbe';

  // Une voie de desserte de lotissement a presque toujours un trottoir.
  if (distBourg < 700 && (r.kind === 'residential' || r.kind === 'living_street')) {
    return 'trottoir';
  }
  // Les axes traversant l'agglomération sont bordés d'enrobé ou de trottoir.
  if (distBourg < 500) return 'trottoir';
  if (distBourg < 900) return r.width >= 7 ? 'enrobe' : 'stabilise';
  // Voies de desserte et chemins de campagne : accotement stabilisé.
  if (r.kind === 'service' || r.kind === 'track') return 'stabilise';
  // Route départementale hors agglomération : bande stabilisée puis herbe.
  if (r.width >= 7) return 'stabilise';
  return 'herbe';
}

export class Accotements {
  constructor(data, relief, roadY) {
    this.group = new THREE.Group();
    if (!data.roads?.length) { this.effectif = 0; return; }

    // Une géométrie par revêtement : cinq appels de dessin pour toute la ville.
    const parRev = new Map();
    for (const k of Object.keys(REVETEMENTS)) parRev.set(k, []);

    // Altitude de chaussée : le terrain NATUREL, celui sur lequel les rubans de
    // route sont posés. Lire le terrain terrassé ferait replonger l'accotement
    // dans la tranchée qu'il est censé combler.
    const altRoute = relief
      ? (x, z) => relief.hauteurRoute(x, z) + roadY
      : () => roadY;
    // Altitude du terrain tel qu'il est réellement affiché, côté extérieur.
    const altSol = relief
      ? (x, z) => relief.hauteurEn(x, z)
      : () => 0;

    let compte = 0;
    for (const r of data.roads) {
      if (!r.drivable) continue;
      // Un pont a son propre tablier et ses garde-corps : border ses côtés
      // d'une bande de terrain le rattacherait au sol qu'il enjambe.
      if (r.bridge) continue;

      const [x0, z0] = r.pts[0];
      const distBourg = Math.hypot(x0, z0);
      const cle = revetementDe(r, distBourg);
      const rev = REVETEMENTS[cle];
      const tab = parRev.get(cle);

      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 0.5) continue;
        const ux = dx / len, uz = dz / len;
        const nx = -uz, nz = ux;

        // Découpage en pas courts : sur une pente, une bande d'un seul tenant
        // ne suivrait pas le terrain et rouvrirait le trou qu'elle doit fermer.
        const pas = 4;
        const n = Math.max(1, Math.round(len / pas));
        const bordChaussee = r.width / 2;

        for (const cote of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            const t0 = k / n, t1 = (k + 1) / n;
            const ax = x1 + dx * t0, az = z1 + dz * t0;
            const bx = x1 + dx * t1, bz = z1 + dz * t1;

            // Bord intérieur : au ras de la chaussée, à son altitude.
            const i1x = ax + nx * bordChaussee * cote, i1z = az + nz * bordChaussee * cote;
            const i2x = bx + nx * bordChaussee * cote, i2z = bz + nz * bordChaussee * cote;
            const y1 = altRoute(ax, az) - rev.creux;
            const y2 = altRoute(bx, bz) - rev.creux;

            // Bord extérieur : à la largeur de l'accotement, raccordé au
            // terrain visible. C'est ce raccord qui coud la route au sol.
            const e1x = ax + nx * (bordChaussee + rev.largeur) * cote;
            const e1z = az + nz * (bordChaussee + rev.largeur) * cote;
            const e2x = bx + nx * (bordChaussee + rev.largeur) * cote;
            const e2z = bz + nz * (bordChaussee + rev.largeur) * cote;
            // On descend jusqu'au terrain, sans jamais remonter au-dessus de
            // la chaussée : un accotement plus haut que la route masquerait la
            // voie et bloquerait la sortie de route.
            const s1 = Math.min(altSol(e1x, e1z), y1);
            const s2 = Math.min(altSol(e2x, e2z), y2);

            // Deux triangles, orientés vers le haut.
            if (cote > 0) {
              tab.push(i1x, y1, i1z, i2x, y2, i2z, e2x, s2, e2z);
              tab.push(i1x, y1, i1z, e2x, s2, e2z, e1x, s1, e1z);
            } else {
              tab.push(i1x, y1, i1z, e2x, s2, e2z, i2x, y2, i2z);
              tab.push(i1x, y1, i1z, e1x, s1, e1z, e2x, s2, e2z);
            }
            compte++;
          }
        }
      }
    }

    for (const [cle, pos] of parRev) {
      if (!pos.length) continue;
      const rev = REVETEMENTS[cle];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: rev.couleur, roughness: cle === 'trottoir' ? 0.9 : 0.96,
        side: THREE.DoubleSide,
        // La bande affleure la chaussée : sans décalage, les deux surfaces
        // clignotent le long du bord de voie.
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }));
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.group.add(m);
    }
    this.effectif = compte;
    this.stats = Object.fromEntries(
      [...parRev].map(([k, v]) => [k, v.length / 18]),
    );
  }
}
