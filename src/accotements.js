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
// `exhaussement` : hauteur dont la bande est relevée au-dessus de la chaussée.
// Seul le trottoir l'est réellement ; les autres revêtements affleurent la
// voie ou s'en creusent légèrement (`creux`).
//
// 14 cm est la hauteur vue d'une bordure T2 de voirie française, la plus
// répandue en agglomération. Elle est assez marquée pour se lire depuis la
// route sans qu'un écart de roue ne fasse décoller la voiture.
const REVETEMENTS = {
  // Le trottoir mesure 0,32 fois la clarté d'un volet blanc sur les
  // photographies du centre-bourg : le béton de voirie est nettement plus
  // sombre que le gris clair employé jusqu'ici, qui le rapprochait d'un mur.
  trottoir:   { couleur: 0x98968e, largeur: 1.6, creux: 0.00, exhaussement: 0.14 },
  enrobe:     { couleur: 0x4a4d52, largeur: 1.2, creux: 0.01, exhaussement: 0 },
  stabilise:  { couleur: 0x8c8172, largeur: 1.4, creux: 0.03, exhaussement: 0 },
  gravier:    { couleur: 0x8f8574, largeur: 1.3, creux: 0.04, exhaussement: 0 },
  herbe:      { couleur: 0x6f8a4e, largeur: 2.2, creux: 0.06, exhaussement: 0 },
};

// Bordure de trottoir : la pierre qui sépare le caniveau du cheminement.
// Teinte plus claire et plus froide que la dalle, comme un béton préfabriqué
// à côté d'un enrobé de trottoir vieilli. C'est ce contraste qui rend la ligne
// de bordure lisible de loin, bien plus que sa hauteur.
const BORDURE_COULEUR = 0xb4b2a8;
// Chanfrein en tête de bordure. Deux centimètres suffisent : il n'ajoute
// qu'une bande de triangles, mais c'est lui qui accroche la lumière rasante et
// donne l'arête. Sans lui, la bordure se lit comme un mur net et sec.
const CHANFREIN = 0.02;
// Caniveau : le fil d'eau est légèrement en contrebas de la chaussée, ce qui
// creuse une ombre continue au pied de la bordure.
const CANIVEAU = 0.03;

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
    // Bordures de trottoir, toutes rues confondues : un sixième maillage. Elles
    // sont séparées du revêtement pour porter leur propre teinte, c'est ce
    // contraste qui rend la ligne de bordure lisible depuis la chaussée.
    const bordures = [];

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

            if (!rev.exhaussement) {
              // Bande de plain-pied : elle descend jusqu'au terrain, sans
              // jamais remonter au-dessus de la chaussée. Un accotement plus
              // haut que la route masquerait la voie et bloquerait la sortie
              // de route.
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
              continue;
            }

            // --- Trottoir relevé -------------------------------------------
            //
            // Quatre bandes en travers, de la chaussée vers la parcelle :
            // le caniveau au fil d'eau, la face verticale de bordure, le
            // chanfrein qui casse son arête, puis la dalle de cheminement.
            // La bordure est un maillage distinct : c'est son changement de
            // matériau qui la rend lisible, la seule hauteur ne suffisant pas.
            const h = rev.exhaussement;
            // Ligne de caniveau, un peu en contrebas de la chaussée : c'est ce
            // creux qui pose une ombre continue au pied de la bordure.
            const c1x = i1x + nx * 0.18 * cote, c1z = i1z + nz * 0.18 * cote;
            const c2x = i2x + nx * 0.18 * cote, c2z = i2z + nz * 0.18 * cote;
            const cy1 = y1 - CANIVEAU, cy2 = y2 - CANIVEAU;
            // Pied puis tête de bordure, cette dernière chanfreinée.
            const p1x = c1x + nx * 0.02 * cote, p1z = c1z + nz * 0.02 * cote;
            const p2x = c2x + nx * 0.02 * cote, p2z = c2z + nz * 0.02 * cote;
            const t1x = p1x + nx * CHANFREIN * cote, t1z = p1z + nz * CHANFREIN * cote;
            const t2x = p2x + nx * CHANFREIN * cote, t2z = p2z + nz * CHANFREIN * cote;
            const ty1 = cy1 + h, ty2 = cy2 + h;

            // Le trottoir suit la chaussée en altitude, pas le terrain : une
            // dalle de cheminement est plane en travers, et la raccorder au
            // sol naturel la ferait onduler le long de la rue. Elle ne rejoint
            // le terrain que par son bord extérieur, et l'écart y est borné :
            // sans borne, une parcelle en fort remblai tirerait la dalle vers
            // le haut et le trottoir passerait par-dessus la bordure.
            const s1 = Math.max(Math.min(altSol(e1x, e1z), ty1 + 0.5), ty1 - 0.3);
            const s2 = Math.max(Math.min(altSol(e2x, e2z), ty2 + 0.5), ty2 - 0.3);

            // Chaque bande est écrite comme deux triangles. `cote` décide du
            // sens de parcours, faute de quoi un côté de la rue aurait ses
            // normales retournées.
            const bande = (cible, ax1, ay1, az1, ax2, ay2, az2,
              bx1, by1, bz1, bx2, by2, bz2) => {
              if (cote > 0) {
                cible.push(ax1, ay1, az1, ax2, ay2, az2, bx2, by2, bz2);
                cible.push(ax1, ay1, az1, bx2, by2, bz2, bx1, by1, bz1);
              } else {
                cible.push(ax1, ay1, az1, bx2, by2, bz2, ax2, ay2, az2);
                cible.push(ax1, ay1, az1, bx1, by1, bz1, bx2, by2, bz2);
              }
            };

            // Caniveau, du bord de chaussée au pied de bordure.
            bande(tab, i1x, y1, i1z, i2x, y2, i2z, c1x, cy1, c1z, c2x, cy2, c2z);
            // Face verticale de la bordure, puis son chanfrein.
            bande(bordures, c1x, cy1, c1z, c2x, cy2, c2z, p1x, ty1 - CHANFREIN, p1z,
              p2x, ty2 - CHANFREIN, p2z);
            bande(bordures, p1x, ty1 - CHANFREIN, p1z, p2x, ty2 - CHANFREIN, p2z,
              t1x, ty1, t1z, t2x, ty2, t2z);
            // Dalle de cheminement, jusqu'au bord de parcelle.
            bande(tab, t1x, ty1, t1z, t2x, ty2, t2z, e1x, s1, e1z, e2x, s2, e2z);
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
      // Le décalage de profondeur ne concerne que les bandes coplanaires à la
      // chaussée : sans lui, les deux surfaces clignotent le long du bord de
      // voie. Le trottoir, lui, est désormais relevé de 14 cm et forme un
      // volume : le décaler le ferait flotter devant le caniveau.
      const coplanaire = !rev.exhaussement;
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: rev.couleur, roughness: cle === 'trottoir' ? 0.88 : 0.96,
        side: THREE.DoubleSide,
        polygonOffset: coplanaire,
        polygonOffsetFactor: coplanaire ? -2 : 0,
        polygonOffsetUnits: coplanaire ? -4 : 0,
      }));
      m.receiveShadow = true;
      m.renderOrder = 1;
      this.group.add(m);
    }

    if (bordures.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(bordures, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      // Pas de `polygonOffset` : la bordure est un volume, elle n'est
      // coplanaire avec rien et le décalage ne ferait que la faire flotter
      // devant le caniveau. Rugosité un peu plus basse que la dalle, un béton
      // préfabriqué étant plus lisse qu'un enrobé de trottoir.
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
        color: BORDURE_COULEUR, roughness: 0.82, side: THREE.DoubleSide,
      }));
      m.receiveShadow = true;
      this.group.add(m);
      this.bordures = bordures.length / 18;
    }

    this.effectif = compte;
    this.stats = Object.fromEntries(
      [...parRev].map(([k, v]) => [k, v.length / 18]),
    );
  }
}
