import {
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  VertexData,
} from '@babylonjs/core';
import earcut from 'earcut';
import { CHUNK_SIZE, ROAD_LIFT, TERRAIN_GUARD, chunkCoords, chunkKey } from './config';
import { couleurMur, couleurToit } from './data/bdtopo';
import { GeometryBuffer } from './mesh-builder';
import { MaterialLibrary } from './materials';
import { buildArtixLandmarks } from './landmarks';
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

interface ActiveChunk {
  key: string;
  meshes: Mesh[];
}

const MAJOR_ROADS = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const URBAN_ROADS = new Set(['primary', 'secondary', 'tertiary', 'residential', 'living_street', 'unclassified']);
const PAVED_CENTER = { x: -1.3, z: 92.1, radius: 26 };

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function centroid(pts: Point2[]): Point2 {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

function polygonArea(pts: Point2[]): number {
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    sum += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(sum * .5);
}

function cleanPolygon(input: Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of input) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > .08) out.push([p[0], p[1]]);
  }
  if (out.length > 2 && Math.hypot(out[0][0] - out.at(-1)![0], out[0][1] - out.at(-1)![1]) < .08) out.pop();
  return out;
}

function pointInPolygon(x: number, z: number, pts: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x: number, z: number, a: Point2, b: Point2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-6) return Math.hypot(x - a[0], z - a[1]);
  const t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / l2, 0, 1);
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

function triangulate(pts: Point2[]): number[] {
  const flat: number[] = [];
  for (const [x, z] of pts) flat.push(x, z);
  return earcut(flat);
}

function orientedRectangle(pts: Point2[]): { pts: Point2[]; long: number; wide: number; angle: number } | null {
  if (pts.length !== 4) return null;
  const [cx, cz] = centroid(pts);
  let xx = 0, zz = 0, xz = 0;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    xx += dx * dx; zz += dz * dz; xz += dx * dz;
  }
  let angle = .5 * Math.atan2(2 * xz, xx - zz);
  let ux = Math.cos(angle), uz = Math.sin(angle);
  let vx = -uz, vz = ux;
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    const u = dx * ux + dz * uz;
    const v = dx * vx + dz * vz;
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
  let long = maxU - minU, wide = maxV - minV;
  if (wide > long) {
    angle += Math.PI / 2;
    ux = Math.cos(angle); uz = Math.sin(angle);
    vx = -uz; vz = ux;
    [long, wide] = [wide, long];
    minU = -long / 2; maxU = long / 2; minV = -wide / 2; maxV = wide / 2;
  }
  const boxArea = Math.max(.01, long * wide);
  if (polygonArea(pts) / boxArea < .78) return null;
  const p = (u: number, v: number): Point2 => [cx + ux * u + vx * v, cz + uz * u + vz * v];
  return {
    pts: [p(minU, minV), p(maxU, minV), p(maxU, maxV), p(minU, maxV)],
    long,
    wide,
    angle,
  };
}

function addWalls(buffer: GeometryBuffer, pts: Point2[], base: number, top: number): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    buffer.quad(
      [a[0], base, a[1]], [b[0], base, b[1]], [b[0], top, b[1]], [a[0], top, a[1]],
      [0, 0, length / 12.8, 0, length / 12.8, (top - base) / 9.3, 0, (top - base) / 9.3],
    );
  }
}

function addParapet(buffer: GeometryBuffer, pts: Point2[], y: number): void {
  const height = .3;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    buffer.quad(
      [a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + height, b[1]], [a[0], y + height, a[1]],
    );
  }
}

function addGableRoof(
  roof: GeometryBuffer,
  walls: GeometryBuffer,
  rect: ReturnType<typeof orientedRectangle> & {},
  eave: number,
  ridge: number,
): void {
  const [p0, p1, p2, p3] = rect.pts;
  const r0: Point2 = [(p0[0] + p3[0]) * .5, (p0[1] + p3[1]) * .5];
  const r1: Point2 = [(p1[0] + p2[0]) * .5, (p1[1] + p2[1]) * .5];
  roof.quad(
    [p0[0], eave, p0[1]], [p1[0], eave, p1[1]], [r1[0], ridge, r1[1]], [r0[0], ridge, r0[1]],
    [0, 0, rect.long / 2.2, 0, rect.long / 2.2, rect.wide / 4.4, 0, rect.wide / 4.4],
  );
  roof.quad(
    [r0[0], ridge, r0[1]], [r1[0], ridge, r1[1]], [p2[0], eave, p2[1]], [p3[0], eave, p3[1]],
    [0, 0, rect.long / 2.2, 0, rect.long / 2.2, rect.wide / 4.4, 0, rect.wide / 4.4],
  );
  walls.triangle([p0[0], eave, p0[1]], [r0[0], ridge, r0[1]], [p3[0], eave, p3[1]]);
  walls.triangle([p1[0], eave, p1[1]], [p2[0], eave, p2[1]], [r1[0], ridge, r1[1]]);
}

function addRoadQuad(
  buffer: GeometryBuffer,
  a: Point2,
  b: Point2,
  width: number,
  yA: number,
  yB: number,
  extra = 0,
): void {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < .05) return;
  const nx = -dz / len, nz = dx / len;
  const half = width * .5;
  const ex = dx / len * extra, ez = dz / len * extra;
  const l0: Point2 = [a[0] + nx * half - ex, a[1] + nz * half - ez];
  const r0: Point2 = [a[0] - nx * half - ex, a[1] - nz * half - ez];
  const l1: Point2 = [b[0] + nx * half + ex, b[1] + nz * half + ez];
  const r1: Point2 = [b[0] - nx * half + ex, b[1] - nz * half + ez];
  buffer.quad(
    [l0[0], yA, l0[1]], [l1[0], yB, l1[1]], [r1[0], yB, r1[1]], [r0[0], yA, r0[1]],
    [0, 0, len / 5, 0, len / 5, 1, 0, 1],
  );
}

function addOffsetRoadQuad(
  buffer: GeometryBuffer,
  a: Point2,
  b: Point2,
  width: number,
  offset: number,
  yA: number,
  yB: number,
): void {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < .05) return;
  const nx = -dz / len, nz = dx / len;
  const oa: Point2 = [a[0] + nx * offset, a[1] + nz * offset];
  const ob: Point2 = [b[0] + nx * offset, b[1] + nz * offset];
  addRoadQuad(buffer, oa, ob, width, yA, yB, .08);
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

function addPreciseBand(
  buffer: GeometryBuffer,
  segment: RoadSegment,
  inner: number,
  outer: number,
  side: number,
  yInnerA: number,
  yInnerB: number,
  yOuterA = yInnerA,
  yOuterB = yInnerB,
): void {
  const [naX, naZ, ka] = segment.normalA;
  const [nbX, nbZ, kb] = segment.normalB;
  const a0: [number, number, number] = [segment.a[0] + naX * inner * ka * side, yInnerA, segment.a[1] + naZ * inner * ka * side];
  const b0: [number, number, number] = [segment.b[0] + nbX * inner * kb * side, yInnerB, segment.b[1] + nbZ * inner * kb * side];
  const a1: [number, number, number] = [segment.a[0] + naX * outer * ka * side, yOuterA, segment.a[1] + naZ * outer * ka * side];
  const b1: [number, number, number] = [segment.b[0] + nbX * outer * kb * side, yOuterB, segment.b[1] + nbZ * outer * kb * side];
  // Ordre antihoraire vu du ciel dans le repère main gauche de Babylon.
  if (side > 0) buffer.quad(a0, a1, b1, b0);
  else buffer.quad(a0, b0, b1, a1);
}

function addPreciseRoad(buffer: GeometryBuffer, segment: RoadSegment, yA: number, yB: number, width: number): void {
  addPreciseBand(buffer, segment, width / 2, -width / 2, 1, yA, yB);
}

function addBox(
  buffer: GeometryBuffer,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  angle = 0,
): void {
  const c = Math.cos(angle), s = Math.sin(angle);
  const hw = width * .5, hd = depth * .5;
  const p = (lx: number, lz: number): [number, number, number] => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  const a = p(-hw, -hd), b = p(hw, -hd), d = p(-hw, hd), e = p(hw, hd);
  const ay: [number, number, number] = [a[0], y + height, a[2]];
  const by: [number, number, number] = [b[0], y + height, b[2]];
  const dy: [number, number, number] = [d[0], y + height, d[2]];
  const ey: [number, number, number] = [e[0], y + height, e[2]];
  buffer.quad(a, d, dy, ay);
  buffer.quad(b, by, ey, e);
  buffer.quad(a, ay, by, b);
  buffer.quad(d, e, ey, dy);
  buffer.quad(ay, dy, ey, by);
}

function featureCenter(pts: Point2[]): Point2 {
  return centroid(pts);
}

function addTerrainPolygon(
  buffer: GeometryBuffer,
  pts: Point2[],
  terrain: TerrainLike,
  lift: number,
): void {
  const clean = cleanPolygon(pts);
  if (clean.length < 3) return;
  const tri = triangulate(clean);
  for (let i = 0; i < tri.length; i += 3) {
    const a = clean[tri[i]], b = clean[tri[i + 1]], c = clean[tri[i + 2]];
    const vertex = (p: Point2): [number, number, number] => [p[0], terrain.hauteurEn(p[0], p[1]) + lift, p[1]];
    const crossY = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
    if (crossY > 0) buffer.triangle(vertex(a), vertex(b), vertex(c));
    else buffer.triangle(vertex(a), vertex(c), vertex(b));
  }
}

function addTree(trunks: GeometryBuffer, leaves: GeometryBuffer, x: number, y: number, z: number, scale: number): void {
  const r = .16 * scale, h = 2.6 * scale;
  const sides = 5;
  for (let i = 0; i < sides; i++) {
    const a = i / sides * Math.PI * 2;
    const b = (i + 1) / sides * Math.PI * 2;
    trunks.quad(
      [x + Math.cos(a) * r, y, z + Math.sin(a) * r],
      [x + Math.cos(b) * r, y, z + Math.sin(b) * r],
      [x + Math.cos(b) * r, y + h, z + Math.sin(b) * r],
      [x + Math.cos(a) * r, y + h, z + Math.sin(a) * r],
    );
  }
  const cy = y + h + .7 * scale;
  const radius = 1.35 * scale;
  const top = [x, cy + 1.4 * scale, z] as const;
  const bottom = [x, cy - 1.1 * scale, z] as const;
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const b = (i + 1) / 6 * Math.PI * 2;
    const pa = [x + Math.cos(a) * radius, cy, z + Math.sin(a) * radius] as const;
    const pb = [x + Math.cos(b) * radius, cy, z + Math.sin(b) * radius] as const;
    leaves.triangle(top, pa, pb);
    leaves.triangle(bottom, pb, pa);
  }
}

export class ArtixWorld {
  readonly terrainMesh: Mesh;
  readonly materials: MaterialLibrary;
  readonly roads: RoadData[];
  readonly buildings: BuildingData[];

  private readonly chunks = new Map<string, ChunkData>();
  private readonly active = new Map<string, ActiveChunk>();
  private readonly queue: string[] = [];
  private radius = 3;
  private vegetationDensity = .62;
  private lastCenter = '';
  private frameSinceChunk = 0;
  private readonly queryOnly: boolean;

  constructor(
    private readonly scene: Scene,
    readonly terrain: TerrainLike,
    private readonly map: CityMapData,
    private readonly altRef: number,
    private readonly shadow: ShadowGenerator | null,
    queryOnly = false,
  ) {
    this.queryOnly = queryOnly;
    this.roads = map.roads;
    this.buildings = map.buildings;
    this.materials = new MaterialLibrary(scene);
    this.terrainMesh = this.buildTerrain();
    if (queryOnly) this.terrainMesh.setEnabled(false);
    this.indexData();
    if (!queryOnly) this.buildLandmarks();
  }

  setQuality(radius: number, vegetationDensity: number): void {
    this.radius = radius;
    this.vegetationDensity = vegetationDensity;
    this.lastCenter = '';
  }

  async warmup(x: number, z: number): Promise<void> {
    if (this.queryOnly) return;
    const [cx, cz] = chunkCoords(chunkKey(x, z));
    const keys: string[] = [];
    const warmRadius = Math.min(2, this.radius);
    for (let dz = -warmRadius; dz <= warmRadius; dz++) {
      for (let dx = -warmRadius; dx <= warmRadius; dx++) keys.push(`${cx + dx},${cz + dz}`);
    }
    keys.sort((a, b) => {
      const [ax, az] = chunkCoords(a), [bx, bz] = chunkCoords(b);
      return Math.hypot(ax - cx, az - cz) - Math.hypot(bx - cx, bz - cz);
    });
    for (let i = 0; i < keys.length; i++) {
      this.activate(keys[i]);
      if (i % 3 === 2) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    this.update(x, z, true);
  }

  update(x: number, z: number, force = false): void {
    if (this.queryOnly) return;
    const center = chunkKey(x, z);
    this.frameSinceChunk++;
    if (!force && center === this.lastCenter && this.frameSinceChunk < 3) return;
    this.lastCenter = center;
    const [cx, cz] = chunkCoords(center);
    const wanted = new Set<string>();
    const candidates: Array<{ key: string; d: number }> = [];
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        if (Math.hypot(dx, dz) > this.radius + .45) continue;
        const key = `${cx + dx},${cz + dz}`;
        wanted.add(key);
        if (!this.active.has(key) && !this.queue.includes(key)) candidates.push({ key, d: dx * dx + dz * dz });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    this.queue.push(...candidates.map((c) => c.key));

    for (const [key, chunk] of this.active) {
      const [kx, kz] = chunkCoords(key);
      if (Math.hypot(kx - cx, kz - cz) <= this.radius + 1.5) continue;
      this.disposeChunk(chunk);
      this.active.delete(key);
    }

    if (this.queue.length && (force || this.frameSinceChunk >= 3)) {
      const next = this.queue.shift()!;
      if (wanted.has(next) && !this.active.has(next)) this.activate(next);
      this.frameSinceChunk = 0;
    }
  }

  get activeChunkCount(): number {
    return this.active.size;
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
    const landmarks = ((this.map as any).landmarkSources ?? []) as Array<{ pts?: Point2[] }>;
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

  private buildTerrain(): Mesh {
    const positions: number[] = [], indices: number[] = [], normals: number[] = [], uvs: number[] = [];
    const n = this.terrain.res + 1;
    const half = this.terrain.taille / 2;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + i * this.terrain.pas;
        const z = -half + j * this.terrain.pas;
        positions.push(x, this.terrain.solVisible(x, z, TERRAIN_GUARD), z);
        uvs.push(i / this.terrain.res, j / this.terrain.res);
      }
    }
    for (let j = 0; j < this.terrain.res; j++) {
      for (let i = 0; i < this.terrain.res; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    VertexData.ComputeNormals(positions, indices, normals);
    const data = new VertexData();
    data.positions = positions; data.indices = indices; data.normals = normals; data.uvs = uvs;
    const mesh = new Mesh('terrain-artix', this.scene);
    data.applyToMesh(mesh, false);
    mesh.material = this.materials.terrain;
    mesh.receiveShadows = true;
    mesh.freezeWorldMatrix();
    return mesh;
  }

  private buildLandmarks(): void {
    buildArtixLandmarks(this.scene, this.terrain, this.map, this.shadow);
    for (const [index, tower] of (this.map.chateauxEau ?? []).entries()) {
      const ground = this.terrain.hauteurEn(tower.x, tower.z);
      const height = clamp(tower.hauteur, 13, 30);
      const radius = clamp(tower.rayon, 2.5, 6.5);
      for (let leg = 0; leg < 4; leg++) {
        const angle = leg / 4 * Math.PI * 2;
        const support = MeshBuilder.CreateCylinder(`water-tower-${index}-leg-${leg}`, {
          height: height - 4,
          diameter: .48,
          tessellation: 8,
        }, this.scene);
        support.position.set(
          tower.x + Math.cos(angle) * radius * .52,
          ground + (height - 4) * .5,
          tower.z + Math.sin(angle) * radius * .52,
        );
        support.material = this.materials.metal;
        support.receiveShadows = true;
      }
      const tank = MeshBuilder.CreateCylinder(`water-tower-${index}-tank`, {
        height: 4.8,
        diameterTop: radius * 1.62,
        diameterBottom: radius * 2.05,
        tessellation: 18,
      }, this.scene);
      tank.position.set(tower.x, ground + height - 2.4, tower.z);
      tank.material = this.materials.parapet;
      tank.receiveShadows = true;
      this.shadow?.addShadowCaster(tank, false);
      const cap = MeshBuilder.CreateSphere(`water-tower-${index}-cap`, { diameter: radius * 1.65, segments: 12, slice: .46 }, this.scene);
      cap.position.set(tower.x, ground + height + .15, tower.z);
      cap.material = this.materials.parapet;
      cap.receiveShadows = true;
    }
  }

  private activate(key: string): void {
    const data = this.chunks.get(key) ?? {
      roads: [], buildings: [], areas: [], parkings: [], water: [],
      barriers: [], terrains: [], rails: [],
    };
    const meshes: Mesh[] = [];
    const shoulder = new GeometryBuffer();
    const road = new GeometryBuffer();
    const paving = new GeometryBuffer();
    const paths = new GeometryBuffer();
    const markings = new GeometryBuffer();
    const curbs = new GeometryBuffer();
    const sidewalks = new GeometryBuffer();
    const gutters = new GeometryBuffer();
    const junctions = new Map<string, { x: number; z: number; width: number; paved: boolean }>();

    for (const seg of data.roads) {
      const yA = this.terrain.hauteurRoute(seg.a[0], seg.a[1]) + ROAD_LIFT;
      const yB = this.terrain.hauteurRoute(seg.b[0], seg.b[1]) + ROAD_LIFT;
      if (seg.drivable) {
        addPreciseRoad(seg.paved ? paving : road, seg, yA, yB, seg.width);
        const addJunction = (point: Point2): void => {
          const junctionKey = `${Math.round(point[0] * 10)},${Math.round(point[1] * 10)}`;
          const previous = junctions.get(junctionKey);
          junctions.set(junctionKey, {
            x: point[0], z: point[1],
            width: Math.max(previous?.width ?? 0, seg.width),
            paved: seg.paved || previous?.paved === true,
          });
        };
        if (seg.junctionA) addJunction(seg.a);
        if (seg.junctionB) addJunction(seg.b);
        if (seg.marking && seg.width >= 7) addPreciseRoad(markings, seg, yA + .016, yB + .016, .11);
        if (MAJOR_ROADS.has(seg.kind)) {
          const edge = seg.width * .5 - .32;
          addPreciseBand(markings, seg, edge - .0375, edge + .0375, 1, yA + .018, yB + .018);
          addPreciseBand(markings, seg, edge - .0375, edge + .0375, -1, yA + .018, yB + .018);
        }
        if (URBAN_ROADS.has(seg.kind)) {
          for (const side of [-1, 1]) {
            const edge = seg.width * .5;
            addPreciseBand(gutters, seg, edge, edge + .2, side, yA - .025, yB - .025);
            addPreciseBand(curbs, seg, edge + .2, edge + .23, side, yA - .025, yB - .025, yA + .14, yB + .14);
            addPreciseBand(sidewalks, seg, edge + .23, edge + 1.82, side, yA + .14, yB + .14,
              clamp(this.terrain.hauteurEn(seg.a[0], seg.a[1]), yA - .16, yA + .64),
              clamp(this.terrain.hauteurEn(seg.b[0], seg.b[1]), yB - .16, yB + .64));
          }
        } else {
          for (const side of [-1, 1]) {
            const edge = seg.width * .5;
            addPreciseBand(shoulder, seg, edge, edge + 1.4, side, yA - .025, yB - .025,
              Math.min(this.terrain.hauteurEn(seg.a[0], seg.a[1]), yA),
              Math.min(this.terrain.hauteurEn(seg.b[0], seg.b[1]), yB));
          }
        }
      } else {
        addPreciseRoad(paths, seg, yA + .01, yB + .01, seg.width);
      }
    }

    for (const junction of junctions.values()) {
      const y = this.terrain.hauteurRoute(junction.x, junction.z) + ROAD_LIFT + .002;
      (junction.paved ? paving : road).disc(junction.x, y, junction.z, junction.width * .62, 12);
    }

    this.pushMesh(meshes, shoulder.toMesh(`shoulder-${key}`, this.scene), this.materials.shoulder, false);
    this.pushMesh(meshes, road.toMesh(`roads-${key}`, this.scene), this.materials.asphalt, false);
    this.pushMesh(meshes, paving.toMesh(`paving-${key}`, this.scene), this.materials.paving, false);
    this.pushMesh(meshes, paths.toMesh(`paths-${key}`, this.scene), this.materials.path, false);
    this.pushMesh(meshes, markings.toMesh(`markings-${key}`, this.scene), this.materials.marking, false);
    this.pushMesh(meshes, curbs.toMesh(`curbs-${key}`, this.scene), this.materials.curb, false);
    this.pushMesh(meshes, sidewalks.toMesh(`sidewalks-${key}`, this.scene), this.materials.sidewalk, false);
    this.pushMesh(meshes, gutters.toMesh(`gutters-${key}`, this.scene), this.materials.gutter, false);

    const park = new GeometryBuffer(), fields = new GeometryBuffer();
    const sports = new GeometryBuffer(), clay = new GeometryBuffer();
    const parking = new GeometryBuffer(), water = new GeometryBuffer();
    for (const area of data.areas) {
      const destination = ['forest', 'wood', 'recreation_ground', 'village_green', 'park'].includes(area.kind)
        ? park : fields;
      addTerrainPolygon(destination, area.pts, this.terrain, .035);
    }
    for (const lot of data.parkings) addTerrainPolygon(parking, lot.pts, this.terrain, .055);
    for (const pitch of data.terrains) {
      const destination = pitch.surface === 'clay' || pitch.sport === 'tennis' ? clay : sports;
      addTerrainPolygon(destination, pitch.pts, this.terrain, .065);
    }
    for (const feature of data.water) {
      if (feature.river) {
        for (let i = 0; i < feature.pts.length - 1; i++) {
          const a = feature.pts[i], b = feature.pts[i + 1];
          const yA = this.terrain.hauteurEn(a[0], a[1]) - .12;
          const yB = this.terrain.hauteurEn(b[0], b[1]) - .12;
          addRoadQuad(water, a, b, feature.width ?? 4, yA, yB, .25);
        }
      } else addTerrainPolygon(water, feature.pts, this.terrain, -.12);
    }
    this.pushMesh(meshes, park.toMesh(`parks-${key}`, this.scene), this.materials.park, false);
    this.pushMesh(meshes, fields.toMesh(`fields-${key}`, this.scene), this.materials.field, false);
    this.pushMesh(meshes, sports.toMesh(`sports-${key}`, this.scene), this.materials.sports, false);
    this.pushMesh(meshes, clay.toMesh(`clay-${key}`, this.scene), this.materials.clay, false);
    this.pushMesh(meshes, parking.toMesh(`parking-${key}`, this.scene), this.materials.parking, false);
    this.pushMesh(meshes, water.toMesh(`water-${key}`, this.scene), this.materials.water, false);

    const rails = new GeometryBuffer();
    for (const railway of data.rails) {
      for (let i = 0; i < railway.pts.length - 1; i++) {
        const a = railway.pts[i], b = railway.pts[i + 1];
        const yA = this.terrain.hauteurEn(a[0], a[1]) + .09;
        const yB = this.terrain.hauteurEn(b[0], b[1]) + .09;
        addOffsetRoadQuad(rails, a, b, .11, .72, yA, yB);
        addOffsetRoadQuad(rails, a, b, .11, -.72, yA, yB);
      }
    }
    this.pushMesh(meshes, rails.toMesh(`rails-${key}`, this.scene), this.materials.rail, false);

    const wallBuffers = new Map<number, GeometryBuffer>();
    const roofBuffers = new Map<number, GeometryBuffer>();
    for (const building of data.buildings) this.addBuilding(building, wallBuffers, roofBuffers);
    for (const [color, buffer] of wallBuffers) {
      this.pushMesh(meshes, buffer.toMesh(`walls-${color}-${key}`, this.scene), this.materials.wall(color), false);
    }
    for (const [color, buffer] of roofBuffers) {
      this.pushMesh(meshes, buffer.toMesh(`roofs-${color}-${key}`, this.scene), this.materials.roof(color), false);
    }

    const hedge = new GeometryBuffer(), metal = new GeometryBuffer(), lamps = new GeometryBuffer();
    const parkedGlass = new GeometryBuffer();
    const parkedBodies = [new GeometryBuffer(), new GeometryBuffer(), new GeometryBuffer()];
    this.addStreetDetails(key, data, hedge, metal, lamps, parkedBodies, parkedGlass);
    this.pushMesh(meshes, hedge.toMesh(`hedges-${key}`, this.scene), this.materials.hedge, false);
    this.pushMesh(meshes, metal.toMesh(`street-metal-${key}`, this.scene), this.materials.metal, false);
    this.pushMesh(meshes, lamps.toMesh(`street-lamps-${key}`, this.scene), this.materials.lamp, false);
    this.pushMesh(meshes, parkedGlass.toMesh(`parked-glass-${key}`, this.scene), this.materials.glass, false);
    parkedBodies.forEach((buffer, index) => {
      this.pushMesh(meshes, buffer.toMesh(`parked-${index}-${key}`, this.scene), this.materials.parkedPaint[index], false);
    });

    const trunks = new GeometryBuffer(), leaves = new GeometryBuffer();
    this.addVegetation(key, data, trunks, leaves);
    this.pushMesh(meshes, trunks.toMesh(`trunks-${key}`, this.scene), this.materials.trunk, false);
    this.pushMesh(meshes, leaves.toMesh(`foliage-${key}`, this.scene), this.materials.foliage, false);

    this.active.set(key, { key, meshes });
  }

  private addBuilding(
    building: BuildingData,
    wallBuffers: Map<number, GeometryBuffer>,
    roofBuffers: Map<number, GeometryBuffer>,
  ): void {
    let pts = cleanPolygon(building.pts);
    if (pts.length < 3 || polygonArea(pts) < 8) return;
    const wallColor = couleurMur(building) as number;
    const roofColor = couleurToit(building) as number;
    const walls = wallBuffers.get(wallColor) ?? new GeometryBuffer();
    const roofs = roofBuffers.get(roofColor) ?? new GeometryBuffer();
    wallBuffers.set(wallColor, walls);
    roofBuffers.set(roofColor, roofs);

    const [cx, cz] = centroid(pts);
    const base = building.zSol == null ? this.terrain.hauteurEn(cx, cz) : building.zSol - this.altRef;
    const height = clamp(building.hauteur || 6, 2.5, 24);
    const rect = orientedRectangle(pts);
    const roofType = building.toiture?.t;
    const measuredRise = Number(building.toiture?.f) - Number(building.toiture?.g);
    const inferredRise = building.penteToit ?? (rect ? Math.min(3.2, rect.wide * .22) : 0);
    const rise = clamp(Number.isFinite(measuredRise) && measuredRise > .25 ? measuredRise : inferredRise, .65, 4.2);
    const wantsPitch = roofType === 1 || roofType === 2 || roofType === 'deux_pans' || roofType === 'monopente';
    const gable = Boolean(rect && (wantsPitch || roofType == null) && building.surface < 1300);

    if (gable && rect) {
      pts = rect.pts;
      const eave = base + Math.max(2.3, height - rise);
      addWalls(walls, pts, base - .04, eave + .03);
      addGableRoof(roofs, walls, rect, eave + .06, base + height);
      if (building.graine % 5 === 0 && rect.long > 7) {
        addBox(walls, cx + Math.cos(rect.angle) * rect.long * .18, eave + rise * .35, cz - Math.sin(rect.angle) * rect.long * .18, .55, 1.15, .55, rect.angle);
      }
    } else {
      const top = base + height;
      addWalls(walls, pts, base - .04, top + .02);
      const tri = triangulate(pts);
      if (!tri.length) return;
      roofs.appendPolygon(pts, top + .035, tri, .08);
      addParapet(roofs, pts, top + .04);
      if (building.surface > 260 && building.graine % 3 === 0) {
        addBox(roofs, cx, top + .04, cz, Math.min(3.2, Math.sqrt(building.surface) * .16), .72, 1.5, building.graine * .17);
      }
    }
  }

  private addStreetDetails(
    key: string,
    data: ChunkData,
    hedge: GeometryBuffer,
    metal: GeometryBuffer,
    lamps: GeometryBuffer,
    parkedBodies: GeometryBuffer[],
    parkedGlass: GeometryBuffer,
  ): void {
    for (const barrier of data.barriers) {
      for (let i = 0; i < barrier.pts.length - 1; i++) {
        const a = barrier.pts[i], b = barrier.pts[i + 1];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < .5) continue;
        const x = (a[0] + b[0]) * .5, z = (a[1] + b[1]) * .5;
        const y = this.terrain.hauteurEn(x, z);
        const angle = Math.atan2(b[0] - a[0], b[1] - a[1]);
        const destination = barrier.kind === 'hedge' || barrier.kind === 'tree_row' ? hedge : metal;
        addBox(destination, x, y, z, barrier.kind === 'tree_row' ? .65 : .25, clamp(barrier.height, .7, 2.2), length, angle);
      }
    }

    const [cx, cz] = chunkCoords(key);
    let state = ((cx * 1597334677) ^ (cz * 3812015801) ^ 0xa511e9b3) >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const urban = data.roads.filter((segment) => segment.drivable && URBAN_ROADS.has(segment.kind));
    const lampCount = Math.min(3, Math.floor(urban.length / 7));
    for (let i = 0; i < lampCount; i++) {
      const segment = urban[Math.floor(rand() * urban.length)];
      if (!segment) break;
      const dx = segment.b[0] - segment.a[0], dz = segment.b[1] - segment.a[1];
      const length = Math.hypot(dx, dz);
      if (length < 4) continue;
      const nx = -dz / length, nz = dx / length;
      const side = rand() < .5 ? -1 : 1;
      const t = .25 + rand() * .5;
      const x = segment.a[0] + dx * t + nx * side * (segment.width * .5 + 1.45);
      const z = segment.a[1] + dz * t + nz * side * (segment.width * .5 + 1.45);
      const y = this.terrain.hauteurRoute(x, z);
      const angle = Math.atan2(dx, dz);
      addBox(metal, x, y, z, .13, 4.8, .13, angle);
      addBox(lamps, x, y + 4.68, z, .6, .18, .28, angle);
    }

    if (data.buildings.length < 4 || urban.length < 4 || ((cx * 7 + cz * 11) & 1) !== 0) return;
    const segment = urban[Math.floor(rand() * urban.length)];
    const dx = segment.b[0] - segment.a[0], dz = segment.b[1] - segment.a[1];
    const length = Math.hypot(dx, dz);
    if (length < 5) return;
    const nx = -dz / length, nz = dx / length;
    const side = rand() < .5 ? -1 : 1;
    const t = .24 + rand() * .52;
    const x = segment.a[0] + dx * t + nx * side * (segment.width * .5 + 1.32);
    const z = segment.a[1] + dz * t + nz * side * (segment.width * .5 + 1.32);
    if (this.collidesBuilding(x, z)) return;
    const y = this.terrain.hauteurRoute(x, z) + .04;
    const angle = Math.atan2(dx, dz);
    const body = parkedBodies[Math.floor(rand() * parkedBodies.length)];
    addBox(body, x, y + .14, z, 1.72, .52, 4.05, angle);
    addBox(parkedGlass, x, y + .61, z, 1.44, .42, 2.05, angle);
  }

  private addVegetation(key: string, data: ChunkData, trunks: GeometryBuffer, leaves: GeometryBuffer): void {
    const [cx, cz] = chunkCoords(key);
    let state = ((cx * 73856093) ^ (cz * 19349663) ^ 0x9e3779b9) >>> 0;
    const rand = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    const target = Math.floor((9 + Math.min(9, data.buildings.length * .14)) * this.vegetationDensity);
    let placed = 0;
    for (let attempt = 0; attempt < target * 8 && placed < target; attempt++) {
      const x = (cx + rand()) * CHUNK_SIZE;
      const z = (cz + rand()) * CHUNK_SIZE;
      if (data.roads.some((r) => distanceToSegment(x, z, r.a, r.b) < r.width * .5 + 4)) continue;
      if (data.buildings.some((b) => pointInPolygon(x, z, b.pts))) continue;
      const y = this.terrain.solVisible(x, z, TERRAIN_GUARD);
      addTree(trunks, leaves, x, y, z, .75 + rand() * .65);
      placed++;
    }
  }

  private pushMesh(meshes: Mesh[], mesh: Mesh | null, material: PBRMaterial, castsShadow: boolean): void {
    if (!mesh) return;
    mesh.material = material;
    mesh.receiveShadows = true;
    if (castsShadow && this.shadow) this.shadow.addShadowCaster(mesh, false);
    meshes.push(mesh);
  }

  private disposeChunk(chunk: ActiveChunk): void {
    for (const mesh of chunk.meshes) {
      this.shadow?.removeShadowCaster(mesh, false);
      mesh.dispose(false, false);
    }
  }
}
