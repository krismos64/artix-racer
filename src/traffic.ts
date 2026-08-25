import {
  Color3,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  ShadowGenerator,
  TransformNode,
} from '@babylonjs/core';
import type { RoadData } from './types';

interface TrafficCar {
  root: TransformNode;
  route: RoadData;
  segment: number;
  direction: 1 | -1;
  progress: number;
  speed: number;
  active: boolean;
  lastCollision: number;
}

const COLORS = ['#dfb13a', '#4178a8', '#d85a4f', '#e5e2d8', '#3d4a51'];

function roadLength(road: RoadData): number {
  let total = 0;
  for (let i = 0; i < road.pts.length - 1; i++) {
    total += Math.hypot(road.pts[i + 1][0] - road.pts[i][0], road.pts[i + 1][1] - road.pts[i][1]);
  }
  return total;
}

export class TrafficSystem {
  private readonly cars: TrafficCar[] = [];
  private readonly paints: PBRMaterial[] = [];
  private readonly glass: PBRMaterial;
  private readonly rubber: PBRMaterial;
  private densityCount = Infinity;

  constructor(
    private readonly scene: Scene,
    roads: RoadData[],
    private readonly surfaceY: (x: number, z: number) => number,
    shadow: ShadowGenerator | null,
  ) {
    this.glass = this.material('traffic-glass', '#172a34', .24);
    this.rubber = this.material('traffic-rubber', '#181b1d', .98);
    this.paints = COLORS.map((color, index) => this.material(`traffic-paint-${index}`, color, .38));

    const candidates = roads
      .filter((road) => road.drivable && road.pts.length > 2 && roadLength(road) > 115)
      .filter((road) => road.pts.some(([x, z]) => Math.hypot(x, z) < 1450))
      .sort((a, b) => roadLength(b) - roadLength(a));

    const count = Math.min(12, candidates.length);
    for (let i = 0; i < count; i++) {
      const route = candidates[(i * 7) % candidates.length];
      const root = new TransformNode(`traffic-${i}`, scene);
      this.buildCar(root, this.paints[i % this.paints.length], shadow);
      const segment = Math.min(route.pts.length - 2, Math.floor((i / Math.max(1, count)) * (route.pts.length - 1)));
      this.cars.push({
        root,
        route,
        segment,
        direction: i % 3 === 0 ? -1 : 1,
        progress: (i * .37) % 1,
        speed: 7.5 + (i * 1.71) % 7.5,
        active: true,
        lastCollision: -10,
      });
    }
  }

  update(dt: number, playerX: number, playerZ: number, now: number): boolean {
    let collided = false;
    for (let carIndex = 0; carIndex < this.cars.length; carIndex++) {
      const car = this.cars[carIndex];
      if (carIndex >= this.densityCount) {
        car.root.setEnabled(false);
        car.active = false;
        continue;
      }
      const pts = car.route.pts;
      let a = pts[car.segment], b = pts[car.segment + car.direction];
      if (!b) {
        car.direction = car.direction === 1 ? -1 : 1;
        b = pts[car.segment + car.direction];
        car.progress = 0;
      }
      if (!a || !b) continue;

      const length = Math.max(.1, Math.hypot(b[0] - a[0], b[1] - a[1]));
      car.progress += car.speed * dt / length;
      while (car.progress >= 1) {
        car.progress -= 1;
        car.segment += car.direction;
        if (car.segment <= 0 || car.segment >= pts.length - 1) {
          car.segment = Math.max(0, Math.min(pts.length - 1, car.segment));
          car.direction = car.direction === 1 ? -1 : 1;
        }
        a = pts[car.segment];
        b = pts[car.segment + car.direction];
        if (!b) break;
      }
      if (!b) continue;

      const segmentLength = Math.max(.1, Math.hypot(b[0] - a[0], b[1] - a[1]));
      const laneOffset = car.route.width >= 6 ? Math.min(1.35, car.route.width * .18) : 0;
      const nx = -(b[1] - a[1]) / segmentLength;
      const nz = (b[0] - a[0]) / segmentLength;
      const x = a[0] + (b[0] - a[0]) * car.progress + nx * laneOffset;
      const z = a[1] + (b[1] - a[1]) * car.progress + nz * laneOffset;
      const distance = Math.hypot(x - playerX, z - playerZ);
      const shouldBeActive = distance < 620;
      if (shouldBeActive !== car.active) {
        car.active = shouldBeActive;
        car.root.setEnabled(shouldBeActive);
      }
      if (!shouldBeActive) continue;

      car.root.position.set(x, this.surfaceY(x, z) + .05, z);
      car.root.rotationQuaternion = Quaternion.FromEulerAngles(0, Math.atan2(b[0] - a[0], b[1] - a[1]), 0);
      if (distance < 2.55 && now - car.lastCollision > 1.2) {
        car.lastCollision = now;
        collided = true;
      }
    }
    return collided;
  }

  setDensity(multiplier: number): void {
    const visible = Math.round(this.cars.length * multiplier);
    this.densityCount = visible;
    this.cars.forEach((car, index) => {
      if (index >= visible) car.root.setEnabled(false);
      car.active = index < visible;
    });
  }

  private buildCar(root: TransformNode, paint: PBRMaterial, shadow: ShadowGenerator | null): void {
    const body = MeshBuilder.CreateBox(`${root.name}-body`, { width: 1.72, height: .5, depth: 3.85 }, this.scene);
    body.position.y = .46;
    body.material = paint;
    body.parent = root;
    const cabin = MeshBuilder.CreateBox(`${root.name}-cabin`, { width: 1.42, height: .43, depth: 1.85 }, this.scene);
    cabin.position.set(0, .91, -.1);
    cabin.material = this.glass;
    cabin.parent = root;
    shadow?.addShadowCaster(body, false);
    shadow?.addShadowCaster(cabin, false);
    const positions = [[-.84, .24, 1.15], [.84, .24, 1.15], [-.84, .24, -1.15], [.84, .24, -1.15]];
    for (const [x, y, z] of positions) {
      const wheel = MeshBuilder.CreateCylinder(`${root.name}-wheel`, { height: .18, diameter: .54, tessellation: 10 }, this.scene);
      wheel.position.set(x, y, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = this.rubber;
      wheel.parent = root;
    }
  }

  private material(name: string, color: string, roughness: number): PBRMaterial {
    const material = new PBRMaterial(name, this.scene);
    material.albedoColor = Color3.FromHexString(color);
    material.metallic = 0;
    material.roughness = roughness;
    material.freeze();
    return material;
  }
}
