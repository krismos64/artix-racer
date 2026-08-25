// Relief d'Artix reconstitué à partir des altitudes de sol de la BD TOPO.
//
// Chaque bâtiment IGN porte l'altitude mesurée de son assise. En interpolant
// ces 2 900 points sur la commune, on obtient un modèle de terrain fidèle :
// Artix présente 38 m de dénivelé sur la zone de jeu, ce qui se sent nettement
// au volant.
import { project } from './osm.js';

export const TAILLE = 3600;   // côté de la grille de terrain, en mètres
// Un pas de 12,5 m. À 37,5 m, le terrain interpolé s'écartait de la chaussée
// de plusieurs mètres dans les côtes d'Artix : la route s'enfonçait dans une
// tranchée et le bas-côté s'ouvrait sur le vide. Le coût reste modeste,
// 83 000 sommets pour 0,3 Mo de heightfield.
export const RESOLUTION = 288; // nombre de cellules par côté

export class Terrain {
  constructor(points, altRef) {
    this.altRef = altRef;
    this.res = RESOLUTION;
    this.taille = TAILLE;
    this.pas = TAILLE / RESOLUTION;
    // Hauteurs relatives à l'altitude de référence, en mètres.
    this.h = new Float32Array((RESOLUTION + 1) * (RESOLUTION + 1));
    this.construire(points);
  }

  // Interpolation par pondération inverse de la distance, sur les k points les
  // plus proches. Les altitudes BD TOPO sont réparties irrégulièrement (là où
  // il y a du bâti), une simple moyenne locale suffit donc mal : on cherche
  // toujours les voisins réels.
  construire(points) {
    if (!points.length) return;

    // Grille d'accélération : sans elle, 9 409 nœuds × 2 900 points seraient
    // 27 millions de distances à calculer.
    const CELL = 150;
    const index = new Map();
    for (const p of points) {
      const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push(p);
    }

    const demi = TAILLE / 2;
    for (let j = 0; j <= RESOLUTION; j++) {
      for (let i = 0; i <= RESOLUTION; i++) {
        const x = -demi + i * this.pas;
        const z = -demi + j * this.pas;

        // Rayon de recherche croissant jusqu'à trouver assez de voisins.
        let voisins = [];
        for (let rayon = 1; rayon <= 5 && voisins.length < 6; rayon++) {
          voisins = [];
          const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
          for (let ox = -rayon; ox <= rayon; ox++) {
            for (let oz = -rayon; oz <= rayon; oz++) {
              const c = index.get(`${cx + ox},${cz + oz}`);
              if (c) voisins.push(...c);
            }
          }
        }
        if (!voisins.length) { this.h[j * (RESOLUTION + 1) + i] = 0; continue; }

        // Pondération inverse de la distance au carré, sur les 8 plus proches.
        voisins.sort((a, b) =>
          ((a.x - x) ** 2 + (a.z - z) ** 2) - ((b.x - x) ** 2 + (b.z - z) ** 2));
        const k = Math.min(8, voisins.length);
        let somme = 0, poids = 0;
        for (let n = 0; n < k; n++) {
          const p = voisins[n];
          const d2 = Math.max(25, (p.x - x) ** 2 + (p.z - z) ** 2);
          const w = 1 / d2;
          somme += p.alt * w;
          poids += w;
        }
        this.h[j * (RESOLUTION + 1) + i] = somme / poids - this.altRef;
      }
    }

    // Lissage : les altitudes de bâti sont bruitées (dalles, terrassements).
    // Deux passes de moyenne suffisent à obtenir un relief roulant.
    for (let passe = 0; passe < 2; passe++) {
      const copie = this.h.slice();
      for (let j = 1; j < RESOLUTION; j++) {
        for (let i = 1; i < RESOLUTION; i++) {
          const idx = j * (RESOLUTION + 1) + i;
          this.h[idx] = (
            copie[idx] * 4
            + copie[idx - 1] + copie[idx + 1]
            + copie[idx - (RESOLUTION + 1)] + copie[idx + (RESOLUTION + 1)]
          ) / 8;
        }
      }
    }
  }

  // Abaisse le terrain sous les routes jusqu'à l'altitude de la chaussée moins
  // une garde. Sans cette étape, le sol interpolé sur sa grille de 22 m peut
  // ressortir au-dessus de l'asphalte entre deux nœuds, et l'herbe déborde sur
  // la voie. C'est l'équivalent numérique du terrassement d'une route.
  terrasser(roads, garde) {
    const demi = TAILLE / 2;
    const n = RESOLUTION + 1;
    // Le terrain naturel sert de référence pendant tout le terrassement :
    // lire `this.h` en cours de modification ferait dériver les altitudes de
    // chaussée au fil des segments traités.
    // Conservé sur l'instance : `ribbon` doit poser les routes sur le terrain
    // NATUREL. S'il lisait le terrain terrassé, la chaussée redescendrait avec
    // lui et le creusement n'aurait plus aucun effet.
    this.naturel = this.h.slice();
    const naturel = this.naturel;
    const hauteurNaturelle = (x, z) => {
      const fx = (x + demi) / this.pas, fz = (z + demi) / this.pas;
      // Même prolongation du bord que dans `echantillonner` : les deux doivent
      // renvoyer la même altitude, sinon le terrassement creuserait par rapport
      // à une référence que le ruban n'utilise pas.
      const i = Math.min(RESOLUTION - 1, Math.max(0, Math.floor(fx)));
      const j = Math.min(RESOLUTION - 1, Math.max(0, Math.floor(fz)));
      const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
      const h00 = naturel[j * n + i], h10 = naturel[j * n + i + 1];
      const h01 = naturel[(j + 1) * n + i], h11 = naturel[(j + 1) * n + i + 1];
      return (h00 * (1 - tx) + h10 * tx) * (1 - tz)
           + (h01 * (1 - tx) + h11 * tx) * tz;
    };

    for (const r of roads) {
      if (!r.drivable) continue;
      // Un pont ne se terrasse pas : son tablier passe au-dessus du terrain,
      // qui doit rester intact dessous. Creuser ici ferait plonger la route
      // au lieu de l'élever.
      if (r.bridge) continue;
      for (let s = 0; s < r.pts.length - 1; s++) {
        const [x1, z1] = r.pts[s];
        const [x2, z2] = r.pts[s + 1];
        const long = Math.hypot(x2 - x1, z2 - z1);
        if (long < 0.01) continue;

        // Emprise à traiter : largeur de voie plus une marge d'accotement.
        // Bornée à 14 m : au-delà, le terrassement raboterait le relief bien
        // au-delà de la chaussée et aplatirait les coteaux d'Artix.
        const emprise = Math.min(14, r.width / 2 + this.pas);
        const minX = Math.min(x1, x2) - emprise, maxX = Math.max(x1, x2) + emprise;
        const minZ = Math.min(z1, z2) - emprise, maxZ = Math.max(z1, z2) + emprise;

        const i0 = Math.max(0, Math.floor((minX + demi) / this.pas));
        const i1 = Math.min(RESOLUTION, Math.ceil((maxX + demi) / this.pas));
        const j0 = Math.max(0, Math.floor((minZ + demi) / this.pas));
        const j1 = Math.min(RESOLUTION, Math.ceil((maxZ + demi) / this.pas));

        for (let j = j0; j <= j1; j++) {
          for (let i = i0; i <= i1; i++) {
            const x = -demi + i * this.pas;
            const z = -demi + j * this.pas;

            // Distance du nœud au segment de route.
            const dx = x2 - x1, dz = z2 - z1;
            let t = ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const px = x1 + dx * t, pz = z1 + dz * t;
            const d = Math.hypot(x - px, z - pz);
            if (d > emprise) continue;

            // Altitude de la chaussée à cet endroit, sur le terrain naturel :
            // c'est exactement celle que `ribbon` utilisera pour poser le ruban.
            const altRoute = hauteurNaturelle(px, pz);
            // La garde s'estompe vers le bord de l'emprise, pour un raccord
            // progressif avec le terrain naturel.
            // Raccord progressif sur 4 m, exprimé en mètres et non en pas de
            // grille : sinon la largeur du talus changerait avec la résolution.
            const bord = Math.min(1, Math.max(0, (emprise - d) / 4));
            const cible = altRoute - garde * bord;

            const idx = j * n + i;
            if (this.h[idx] > cible) this.h[idx] = cible;
          }
        }
      }
    }
  }

  // Altitude du terrain en un point quelconque, par interpolation bilinéaire.
  hauteurEn(x, z) {
    return this.echantillonner(this.h, x, z);
  }

  // Altitude du terrain avant terrassement. Les routes s'y posent : sinon
  // elles suivraient le creusement pratiqué pour elles et l'herbe reviendrait
  // affleurer la chaussée.
  hauteurRoute(x, z) {
    return this.echantillonner(this.naturel ?? this.h, x, z);
  }

  // Altitude de la surface que le joueur VOIT sous ses roues : l'herbe hors
  // chaussée, l'asphalte sur la voie. C'est ce que doivent suivre le terrain de
  // collision et l'ombre de contact, faute de quoi la voiture roule sur une
  // surface invisible et paraît flotter.
  //
  // `world.js` abaisse le maillage d'herbe de `garde` sous le terrain terrassé,
  // tandis que la chaussée reste sur le terrain naturel. Entre les deux, la
  // frange où `terrasser()` estompe son creusement impose un raccord continu :
  //
  //   creusement nul   -> terrasse - garde, le sol d'herbe dessiné
  //   creusement plein -> naturel, ce qui porte la chaussée
  //
  // d'où l'interpolation linéaire, qui évite la marche qu'un seuil créerait au
  // bord de chaque route.
  solVisible(x, z, garde) {
    const terrasse = this.echantillonner(this.h, x, z);
    if (!this.naturel) return terrasse - garde;
    const creuse = this.echantillonner(this.naturel, x, z) - terrasse;
    return terrasse - garde + 2 * creuse;
  }

  echantillonner(champ, x, z) {
    const demi = TAILLE / 2;
    const fx = (x + demi) / this.pas;
    const fz = (z + demi) / this.pas;
    // Hors de la grille, on prolonge le bord au lieu de retomber à zéro. Les
    // routes sont chargées jusqu'à 3 000 m alors que le terrain s'arrête à
    // 1 800 m : renvoyer 0 y plaquait la chaussée à l'altitude de référence
    // pendant que le sol gardait la sienne, et l'herbe repassait au-dessus.
    const i = Math.min(RESOLUTION - 1, Math.max(0, Math.floor(fx)));
    const j = Math.min(RESOLUTION - 1, Math.max(0, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - i)), tz = Math.min(1, Math.max(0, fz - j));
    const n = RESOLUTION + 1;
    const h00 = champ[j * n + i], h10 = champ[j * n + i + 1];
    const h01 = champ[(j + 1) * n + i], h11 = champ[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz)
         + (h01 * (1 - tx) + h11 * tx) * tz;
  }
}

// Extrait les points d'altitude exploitables depuis les bâtiments BD TOPO.
export function pointsAltitude(rawBati, rayonMax = 2400) {
  const pts = [];
  for (const b of rawBati.batiments) {
    if (b.zSol == null || !b.pts?.length) continue;
    const [lon, lat] = b.pts[0];
    const [x, z] = project(lat, lon);
    if (Math.hypot(x, z) > rayonMax) continue;
    pts.push({ x, z, alt: b.zSol });
  }
  return pts;
}
