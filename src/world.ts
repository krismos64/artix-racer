// Index spatial d'Artix : altitudes, collisions et noms de rue.
//
// Cette classe NE DESSINE RIEN. Tout le visuel de la ville vient de la couche
// Three.js (`src/three-city/*.js`) convertie en Babylon par
// `src/three-city-bridge.ts`. `ArtixWorld` ne conserve que ce que la logique
// de jeu interroge image par image : la hauteur du sol sous la voiture, la
// présence d'une chaussée, le nom de la rue et les collisions avec le bâti.
//
// Les données sont rangées dans une grille de cellules (`CHUNK_SIZE`) pour que
// chaque requête ne teste que les neuf cellules voisines au lieu des 3 542
// bâtiments et des milliers de segments de voirie de la commune.
import { ROAD_LIFT, TERRAIN_GUARD, chunkCoords, chunkKey } from './config';
import type {
  AreaData,
  BarrierData,
  BuildingData,
  CityMapData,
  ParkingData,
  Point2,
  RailData,
  RoadData,
  SportsFieldData,
  TerrainLike,
  WaterData,
} from './types';

interface RoadSegment {
  a: Point2;
  b: Point2;
  width: number;
  drivable: boolean;
  kind: string;
  marking: boolean;
  name: string | null;
  normalA: [number, number, number];
  normalB: [number, number, number];
  junctionA: boolean;
  junctionB: boolean;
  paved: boolean;
}

interface ChunkData {
  roads: RoadSegment[];
  buildings: BuildingData[];
  areas: AreaData[];
  parkings: ParkingData[];
  water: WaterData[];
  barriers: BarrierData[];
  terrains: SportsFieldData[];
  rails: RailData[];
}

const MAJOR_ROADS = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const PAVED_CENTER = { x: -1.3, z: 92.1, radius: 26 };

function centroid(pts: Point2[]): Point2 {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

function pointInPolygon(x: number, z: number, pts: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function distanceToSegment(x: number, z: number, a: Point2, b: Point2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return Math.hypot(x - a[0], z - a[1]);
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

function roadBisectors(pts: Point2[]): Array<[number, number, number]> {
  return pts.map((point, index) => {
    let inX = 0, inZ = 0, outX = 0, outZ = 0;
    if (index > 0) {
      const previous = pts[index - 1];
      const length = Math.hypot(point[0] - previous[0], point[1] - previous[1]) || 1;
      inX = (point[0] - previous[0]) / length;
      inZ = (point[1] - previous[1]) / length;
    }
    if (index < pts.length - 1) {
      const next = pts[index + 1];
      const length = Math.hypot(next[0] - point[0], next[1] - point[1]) || 1;
      outX = (next[0] - point[0]) / length;
      outZ = (next[1] - point[1]) / length;
    }
    if (index === 0) { inX = outX; inZ = outZ; }
    if (index === pts.length - 1) { outX = inX; outZ = inZ; }
    let bx = inX + outX, bz = inZ + outZ;
    const length = Math.hypot(bx, bz);
    if (length < 1e-6) { bx = inX; bz = inZ; }
    else { bx /= length; bz /= length; }
    const factor = Math.min(2.5, 1 / Math.max(.35, inX * bx + inZ * bz));
    return [-bz, bx, factor];
  });
}

function interpolateNormal(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  let nx = a[0] + (b[0] - a[0]) * t;
  let nz = a[1] + (b[1] - a[1]) * t;
  const length = Math.hypot(nx, nz) || 1;
  nx /= length; nz /= length;
  return [nx, nz, a[2] + (b[2] - a[2]) * t];
}

function featureCenter(pts: Point2[]): Point2 {
  return centroid(pts);
}

export class ArtixWorld {
  readonly roads: RoadData[];
  readonly buildings: BuildingData[];

  private readonly chunks = new Map<string, ChunkData>();

  constructor(
    readonly terrain: TerrainLike,
    private readonly map: CityMapData,
  ) {
    this.roads = map.roads;
    this.buildings = map.buildings;
    this.indexData();
  }

  surfaceY(x: number, z: number): number {
    return this.isOnRoad(x, z)
      ? this.terrain.hauteurRoute(x, z) + ROAD_LIFT
      : this.terrain.solVisible(x, z, TERRAIN_GUARD) + .025;
  }

  isOnRoad(x: number, z: number): boolean {
    const [cx, cz] = chunkCoords(chunkKey(x, z));
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const data = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!data) continue;
        for (const road of data.roads) {
          if (!road.drivable) continue;
          if (distanceToSegment(x, z, road.a, road.b) <= road.width * .52) return true;
        }
      }
    }
    return false;
  }

  roadNameAt(x: number, z: number): string | null {
    const [cx, cz] = chunkCoords(chunkKey(x, z));
    let best: { distance: number; name: string } | null = null;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const data = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!data) continue;
        for (const road of data.roads) {
          if (!road.drivable || !road.name) continue;
          const distance = distanceToSegment(x, z, road.a, road.b);
          // Les rues secondaires OSM sont parfois interrompues ou complétées
          // par une voie de service anonyme. Un rayon de 45 m, comme dans le
          // projet Artix original, garde le nom lisible tout le long de l'îlot.
          if (distance <= 45 && (!best || distance < best.distance)) best = { distance, name: road.name };
        }
      }
    }
    return best?.name ?? null;
  }

  collidesBuilding(x: number, z: number, radius = 0): boolean {
    // La chaussée visible reste toujours prioritaire. Les anciens colliders
    // circulaires des repères débordaient largement sur les rues et créaient
    // des murs invisibles au milieu de la route.
    if (this.isOnRoad(x, z)) return false;

    // Les bâtiments remarquables issus d'OSM gardent leur emprise réelle au
    // lieu d'un rayon approximatif. Ils ont été retirés de `map.buildings`
    // pour éviter une double géométrie, mais doivent rester solides.
    const landmarks = this.map.landmarkSources ?? [];
    if (landmarks.some((landmark) => landmark.pts?.length && (
      pointInPolygon(x, z, landmark.pts)
      || (radius > 0 && (
        pointInPolygon(x + radius, z, landmark.pts)
        || pointInPolygon(x - radius, z, landmark.pts)
        || pointInPolygon(x, z + radius, landmark.pts)
        || pointInPolygon(x, z - radius, landmark.pts)
      ))
    ))) return true;
    const [cx, cz] = chunkCoords(chunkKey(x, z));
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const data = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!data) continue;
        if (data.buildings.some((b) => {
          if (pointInPolygon(x, z, b.pts)) return true;
          if (radius <= 0) return false;
          return pointInPolygon(x + radius, z, b.pts)
            || pointInPolygon(x - radius, z, b.pts)
            || pointInPolygon(x, z + radius, b.pts)
            || pointInPolygon(x, z - radius, b.pts);
        })) return true;
      }
    }
    return false;
  }

  private ensureChunk(key: string): ChunkData {
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = {
        roads: [], buildings: [], areas: [], parkings: [], water: [],
        barriers: [], terrains: [], rails: [],
      };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  private indexData(): void {
    const nodeWays = new Map<string, Set<RoadData>>();
    for (const road of this.roads) {
      if (!road.drivable || road.bridge) continue;
      for (const [x, z] of road.pts) {
        const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
        const ways = nodeWays.get(key) ?? new Set<RoadData>();
        ways.add(road);
        nodeWays.set(key, ways);
      }
    }
    for (const road of this.roads) {
      const normals = roadBisectors(road.pts);
      let carry = 0;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const a = road.pts[i], b = road.pts[i + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const parts = Math.max(1, Math.ceil(length / 11));
        for (let p = 0; p < parts; p++) {
          const t0 = p / parts, t1 = (p + 1) / parts;
          const pa: Point2 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
          const pb: Point2 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
          const mx = (pa[0] + pb[0]) * .5, mz = (pa[1] + pb[1]) * .5;
          const marking = MAJOR_ROADS.has(road.kind) && Math.floor((carry + length * t0) / 9) % 2 === 0;
          const pavedByTag = ['paving_stones', 'sett', 'cobblestone'].includes(road.surface);
          const paved = pavedByTag || Math.hypot(mx - PAVED_CENTER.x, mz - PAVED_CENTER.z) < PAVED_CENTER.radius;
          const aKey = `${Math.round(pa[0] * 10)},${Math.round(pa[1] * 10)}`;
          const bKey = `${Math.round(pb[0] * 10)},${Math.round(pb[1] * 10)}`;
          this.ensureChunk(chunkKey(mx, mz)).roads.push({
            a: pa, b: pb, width: road.width, drivable: road.drivable, kind: road.kind, marking, name: road.name,
            normalA: interpolateNormal(normals[i], normals[i + 1], t0),
            normalB: interpolateNormal(normals[i], normals[i + 1], t1),
            junctionA: t0 === 0 && (nodeWays.get(aKey)?.size ?? 0) > 1,
            junctionB: t1 === 1 && (nodeWays.get(bKey)?.size ?? 0) > 1,
            paved,
          });
        }
        carry += length;
      }
    }
    for (const building of this.buildings) {
      const [x, z] = centroid(building.pts);
      this.ensureChunk(chunkKey(x, z)).buildings.push(building);
    }
    const addFeature = <T extends { pts: Point2[] }>(items: T[] | undefined, field: keyof ChunkData): void => {
      for (const item of items ?? []) {
        const [x, z] = featureCenter(item.pts);
        (this.ensureChunk(chunkKey(x, z))[field] as T[]).push(item);
      }
    };
    addFeature(this.map.areas, 'areas');
    addFeature(this.map.parkings, 'parkings');
    addFeature(this.map.water, 'water');
    addFeature(this.map.barriers, 'barriers');
    addFeature(this.map.terrains, 'terrains');
    addFeature(this.map.rails, 'rails');
  }
}
