// Obstacles ponctuels de la ville : voitures garées, arbres, lampadaires.
//
// `ArtixWorld` ne connaît que le bâti. Jusqu'au 14 novembre 2026, on
// traversait donc un platane ou une voiture garée comme un fantôme. Ce
// module range ces obstacles dans une grille de 24 m et répond à une seule
// question : « un disque de rayon r posé en (x, z) touche-t-il quelque
// chose ? ». Deux formes suffisent : le disque (fût, mât) et le rectangle
// orienté (véhicule).

// Véhicule garé, tel que le pose three-city/parkedcars.js.
export interface PlaceGaree {
  x: number;
  y: number;
  z: number;
  cap: number;
  type: string;
  couleur: number;
  demiL: number;
  demiW: number;
  echelle?: number;
  // Posé quand le joueur a pris le véhicule : il ne bloque plus rien.
  retire?: boolean;
}

interface Disque { x: number; z: number; r: number }

// Tout ce qui se déplace et bloque le passage (les voitures que le joueur a
// conduites puis laissées) : trop peu nombreux pour mériter la grille.
export interface Mobile { x: number; z: number; r: number }

const CELLULE = 24;

export class Obstacles {
  private readonly disques = new Map<string, Disque[]>();
  private readonly vehicules = new Map<string, PlaceGaree[]>();
  // Fourni par le jeu : les véhicules laissés à l'arrêt, hors celui conduit.
  mobiles: () => Mobile[] = () => [];

  constructor(
    readonly places: PlaceGaree[],
    troncs: Array<{ x: number; z: number; h: number }>,
    mats: Array<{ x: number; z: number }>,
    estRoute: (x: number, z: number) => boolean,
  ) {
    for (const place of places) this.ranger(this.vehicules, place.x, place.z, place);
    // Fût d'un platane : 4 % de sa hauteur, entre 22 et 45 cm de rayon.
    // Un pied tombé sur la chaussée (position OSM approximative) est ignoré,
    // sinon un arbre invisible à cet endroit barrerait la rue.
    for (const t of troncs) {
      if (estRoute(t.x, t.z)) continue;
      this.ranger(this.disques, t.x, t.z, { x: t.x, z: t.z, r: Math.min(.45, Math.max(.22, t.h * .04)) });
    }
    for (const m of mats) {
      if (estRoute(m.x, m.z)) continue;
      this.ranger(this.disques, m.x, m.z, { x: m.x, z: m.z, r: .14 });
    }
  }

  private ranger<T>(grille: Map<string, T[]>, x: number, z: number, element: T): void {
    const cle = `${Math.floor(x / CELLULE)},${Math.floor(z / CELLULE)}`;
    let liste = grille.get(cle);
    if (!liste) grille.set(cle, liste = []);
    liste.push(element);
  }

  // Distance d'un point au rectangle orienté d'un véhicule garé (0 dedans).
  private static distanceVehicule(p: PlaceGaree, x: number, z: number): number {
    const dx = x - p.x, dz = z - p.z;
    const sin = Math.sin(p.cap), cos = Math.cos(p.cap);
    // Repère du véhicule : `long` le long de sa marche, `travers` en travers.
    const long = dx * sin + dz * cos;
    const travers = dx * cos - dz * sin;
    const ex = Math.max(0, Math.abs(long) - p.demiL);
    const ez = Math.max(0, Math.abs(travers) - p.demiW);
    return Math.hypot(ex, ez);
  }

  collision(x: number, z: number, rayon: number): boolean {
    const cx = Math.floor(x / CELLULE), cz = Math.floor(z / CELLULE);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const cle = `${cx + ox},${cz + oz}`;
        for (const d of this.disques.get(cle) ?? []) {
          if (Math.hypot(d.x - x, d.z - z) < d.r + rayon) return true;
        }
        for (const p of this.vehicules.get(cle) ?? []) {
          if (!p.retire && Obstacles.distanceVehicule(p, x, z) < rayon) return true;
        }
      }
    }
    for (const m of this.mobiles()) {
      if (Math.hypot(m.x - x, m.z - z) < m.r + rayon) return true;
    }
    return false;
  }

  // Véhicule garé le plus proche à portée de main, pour y monter.
  vehiculeProche(x: number, z: number, portee: number): PlaceGaree | null {
    const cx = Math.floor(x / CELLULE), cz = Math.floor(z / CELLULE);
    let meilleur: PlaceGaree | null = null, distance = portee;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        for (const p of this.vehicules.get(`${cx + ox},${cz + oz}`) ?? []) {
          if (p.retire || p.type === 'scooter') continue;
          const d = Obstacles.distanceVehicule(p, x, z);
          if (d < distance) { distance = d; meilleur = p; }
        }
      }
    }
    return meilleur;
  }
}
