import {
  Color3,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
} from '@babylonjs/core';
import type { Point2, RoadData } from './types';

export type GameMode = 'free' | 'challenge';

interface RouteEdge {
  to: string;
  point: Point2;
  length: number;
  id: string;
}

function key(point: Point2): string {
  return `${Math.round(point[0] * 2) / 2},${Math.round(point[1] * 2) / 2}`;
}

function buildCheckpoints(roads: RoadData[], start: Point2): Point2[] {
  const graph = new Map<string, RouteEdge[]>();
  const points = new Map<string, Point2>();
  for (const road of roads) {
    if (!road.drivable || road.kind === 'service' || road.kind === 'track') continue;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const a = road.pts[i], b = road.pts[i + 1];
      if (Math.hypot(a[0], a[1]) > 1500 && Math.hypot(b[0], b[1]) > 1500) continue;
      const ka = key(a), kb = key(b);
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < .5) continue;
      points.set(ka, a); points.set(kb, b);
      const id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const ea = graph.get(ka) ?? [], eb = graph.get(kb) ?? [];
      ea.push({ to: kb, point: b, length, id });
      eb.push({ to: ka, point: a, length, id });
      graph.set(ka, ea); graph.set(kb, eb);
    }
  }

  let current = '';
  let nearest = Infinity;
  for (const [nodeKey, point] of points) {
    const distance = Math.hypot(point[0] - start[0], point[1] - start[1]);
    if (distance < nearest) { nearest = distance; current = nodeKey; }
  }
  if (!current) return [start];

  const route: Point2[] = [points.get(current)!];
  const visited = new Set<string>();
  let previous = '';
  let previousDirection: Point2 | null = null;
  let distance = 0;
  for (let step = 0; step < 700 && distance < 2600; step++) {
    const origin = points.get(current)!;
    const choices = (graph.get(current) ?? []).filter((edge) => edge.to !== previous || (graph.get(current)?.length ?? 0) === 1);
    if (!choices.length) break;
    choices.sort((a, b) => {
      const score = (edge: RouteEdge): number => {
        const fresh = visited.has(edge.id) ? -8 : 50;
        if (!previousDirection) return fresh + edge.length * .02;
        const dx = (edge.point[0] - origin[0]) / edge.length;
        const dz = (edge.point[1] - origin[1]) / edge.length;
        return fresh + (dx * previousDirection[0] + dz * previousDirection[1]) * 8 + edge.length * .01;
      };
      return score(b) - score(a);
    });
    const chosen = choices[0];
    visited.add(chosen.id);
    previousDirection = [(chosen.point[0] - origin[0]) / chosen.length, (chosen.point[1] - origin[1]) / chosen.length];
    previous = current;
    current = chosen.to;
    distance += chosen.length;
    route.push(chosen.point);
  }

  const checkpoints: Point2[] = [];
  let carry = 0;
  let next = 130;
  for (let i = 0; i < route.length - 1 && checkpoints.length < 10; i++) {
    const a = route[i], b = route[i + 1];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (carry + length >= next && checkpoints.length < 10) {
      const t = (next - carry) / length;
      checkpoints.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      next += 190;
    }
    carry += length;
  }
  return checkpoints.length >= 4 ? checkpoints : route.filter((_, index) => index > 0 && index % 4 === 0).slice(0, 8);
}

export class GameSession {
  private readonly checkpoints: Point2[];
  private readonly ring: Mesh;
  private mode: GameMode = 'free';
  private checkpointIndex = 0;
  private elapsed = 0;
  private running = false;
  private finishedTimer = 0;
  private completed = false;
  private score = 0;

  constructor(
    scene: Scene,
    roads: RoadData[],
    spawn: Point2,
    private readonly surfaceY: (x: number, z: number) => number,
  ) {
    this.checkpoints = buildCheckpoints(roads, spawn);
    this.ring = MeshBuilder.CreateTorus('arcade-checkpoint', { diameter: 9.5, thickness: .34, tessellation: 28 }, scene);
    const material = new StandardMaterial('checkpoint-material', scene);
    material.diffuseColor = Color3.FromHexString('#f1bf3f');
    material.emissiveColor = Color3.FromHexString('#8b5d08');
    material.specularColor = Color3.Black();
    material.freeze();
    this.ring.material = material;
    this.ring.rotation.x = Math.PI / 2;
    this.ring.billboardMode = Mesh.BILLBOARDMODE_Y;
    this.ring.isPickable = false;
    this.ring.setEnabled(false);
  }

  start(mode: GameMode): void {
    this.mode = mode;
    this.checkpointIndex = 0;
    this.elapsed = 0;
    this.score = 0;
    this.finishedTimer = 0;
    this.completed = false;
    this.running = mode === 'challenge';
    this.ring.setEnabled(this.running && this.checkpoints.length > 0);
    this.placeRing();
  }

  update(dt: number, x: number, z: number, speed: number): void {
    this.score += Math.abs(speed) * dt * (this.mode === 'challenge' ? 4 : 1);
    if (this.finishedTimer > 0) this.finishedTimer = Math.max(0, this.finishedTimer - dt);
    if (!this.running) return;
    this.elapsed += dt;
    this.ring.rotation.z += dt * 1.1;
    const pulse = 1 + Math.sin(this.elapsed * 4) * .045;
    this.ring.scaling.setAll(pulse);
    const target = this.checkpoints[this.checkpointIndex];
    if (!target || Math.hypot(target[0] - x, target[1] - z) > 9.5) return;
    this.score += 2500 + Math.abs(speed) * 30;
    this.checkpointIndex++;
    if (this.checkpointIndex >= this.checkpoints.length) {
      this.running = false;
      this.completed = true;
      this.ring.setEnabled(false);
      this.finishedTimer = 6;
      const previous = Number(localStorage.getItem('artix-racer-best') ?? Infinity);
      if (this.elapsed < previous) localStorage.setItem('artix-racer-best', this.elapsed.toFixed(3));
    } else this.placeRing();
  }

  get objective(): Point2 | null {
    return this.running ? this.checkpoints[this.checkpointIndex] ?? null : null;
  }

  get status(): { title: string; detail: string; progress: number; score: number; finished: boolean } {
    if (this.mode === 'free') {
      return { title: 'BALADE LIBRE', detail: 'Explorez Artix à votre rythme', progress: 0, score: Math.round(this.score), finished: false };
    }
    if (this.completed) {
      const best = Number(localStorage.getItem('artix-racer-best') ?? this.elapsed);
      return {
        title: 'PARCOURS TERMINÉ',
        detail: `${this.elapsed.toFixed(2)} s · record ${best.toFixed(2)} s`,
        progress: 1,
        score: Math.round(this.score),
        finished: true,
      };
    }
    return {
      title: 'TOUR D’ARTIX',
      detail: `${this.checkpointIndex + 1}/${Math.max(1, this.checkpoints.length)} · ${this.elapsed.toFixed(1)} s`,
      progress: this.checkpoints.length ? this.checkpointIndex / this.checkpoints.length : 0,
      score: Math.round(this.score),
      finished: false,
    };
  }

  private placeRing(): void {
    const target = this.checkpoints[this.checkpointIndex];
    if (!target) return;
    this.ring.position.set(target[0], this.surfaceY(target[0], target[1]) + 4.4, target[1]);
  }
}
