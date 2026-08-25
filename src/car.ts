import {
  AbstractMesh,
  Axis,
  Color3,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Quaternion,
  Scene,
  SceneLoader,
  ShadowGenerator,
  Space,
  SpotLight,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import type { ArtixWorld } from './world';

export interface SpawnPoint {
  x: number;
  z: number;
  heading: number;
  road?: string | null;
}

export class KeyboardInput {
  private readonly keys = new Set<string>();
  private readonly taps = new Set<string>();

  constructor() {
    addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (!this.keys.has(key)) this.taps.add(key);
      this.keys.add(key);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    });
    addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    document.querySelectorAll<HTMLElement>('[data-control]').forEach((control) => {
      const key = control.dataset.control ?? '';
      const press = (event: PointerEvent) => {
        event.preventDefault();
        if (!this.keys.has(key)) this.taps.add(key);
        this.keys.add(key);
        control.setPointerCapture?.(event.pointerId);
      };
      const release = (event: PointerEvent) => {
        event.preventDefault();
        this.keys.delete(key);
      };
      control.addEventListener('pointerdown', press);
      control.addEventListener('pointerup', release);
      control.addEventListener('pointercancel', release);
      control.addEventListener('lostpointercapture', release);
    });
  }

  down(...keys: string[]): boolean {
    return keys.some((key) => this.keys.has(key));
  }

  tapped(key: string): boolean {
    if (!this.taps.has(key)) return false;
    this.taps.delete(key);
    return true;
  }
}

export class ArcadeCar {
  readonly root: TransformNode;
  speed = 0;
  steering = 0;
  heading: number;
  onRoad = true;
  boost = 1;
  boosting = false;
  drifting = false;
  distanceTravelled = 0;

  private readonly start: SpawnPoint;
  private readonly wheels: TransformNode[] = [];
  private lastX: number;
  private lastZ: number;
  private visualRoll = 0;
  private visualPitch = 0;

  constructor(
    private readonly scene: Scene,
    private readonly world: ArtixWorld,
    spawn: SpawnPoint,
    private readonly shadow: ShadowGenerator | null,
  ) {
    this.start = { ...spawn };
    this.heading = spawn.heading;
    this.lastX = spawn.x;
    this.lastZ = spawn.z;
    this.root = new TransformNode('player-car', scene);
    this.root.position.set(spawn.x, world.surfaceY(spawn.x, spawn.z), spawn.z);
    this.root.rotationQuaternion = Quaternion.FromEulerAngles(0, this.heading, 0);
  }

  // Éclairage nocturne du véhicule : deux projecteurs de phares et quatre
  // plaques émissives (optiques blanches à l'avant, feux rouges à l'arrière).
  // Construit paresseusement au premier passage en ambiance nuit, tout est
  // parenté au châssis. L'avant du véhicule est +Z local : la rotation Y de
  // `heading` envoie ce +Z sur (sin h, 0, cos h), le vecteur d'avance de la
  // physique.
  private nightNodes: TransformNode | null = null;
  private headlights: SpotLight[] = [];

  setNight(active: boolean): void {
    if (active && !this.nightNodes) {
      const rig = new TransformNode('car-nuit', this.scene);
      rig.parent = this.root;
      const feuMat = new StandardMaterial('feu-arriere', this.scene);
      feuMat.emissiveColor = Color3.FromHexString('#ff2a1e');
      feuMat.disableLighting = true;
      const optiqueMat = new StandardMaterial('optique-avant', this.scene);
      optiqueMat.emissiveColor = Color3.FromHexString('#fff3d2');
      optiqueMat.disableLighting = true;
      for (const cote of [-1, 1]) {
        // Projecteur : porté vers l'avant et rabattu vers la chaussée, portée
        // limitée pour ne pas éclairer tout le quartier.
        const phare = new SpotLight(
          `phare-${cote}`,
          new Vector3(cote * .58, .68, 1.9),
          new Vector3(cote * .04, -.22, 1).normalize(),
          1.05, 8, this.scene,
        );
        phare.parent = rig;
        phare.diffuse = Color3.FromHexString('#ffe9c0');
        phare.intensity = 55;
        phare.range = 48;
        this.headlights.push(phare);

        const optique = MeshBuilder.CreatePlane(`optique-${cote}`, { width: .3, height: .11 }, this.scene);
        optique.parent = rig;
        optique.position.set(cote * .58, .66, 2.02);
        optique.material = optiqueMat;
        optique.isPickable = false;

        const feu = MeshBuilder.CreatePlane(`feu-${cote}`, { width: .34, height: .1 }, this.scene);
        feu.parent = rig;
        feu.position.set(cote * .55, .74, -2.05);
        feu.rotation.y = Math.PI;
        feu.material = feuMat;
        feu.isPickable = false;
      }
      this.nightNodes = rig;
    }
    this.nightNodes?.setEnabled(active);
    for (const phare of this.headlights) phare.setEnabled(active);
  }

  async loadModel(): Promise<void> {
    try {
      const result = await SceneLoader.ImportMeshAsync('', '/models/', 'AudiR8-babylon.glb', this.scene);
      const pivot = new TransformNode('audi-r8-pivot', this.scene);
      const roots = result.meshes.filter((mesh) => !mesh.parent);
      for (const root of roots) root.parent = pivot;

      const bounds = pivot.getHierarchyBoundingVectors(true);
      const size = bounds.max.subtract(bounds.min);
      const length = Math.max(size.x, size.z);
      const scale = length > .01 ? 4.35 / length : 1;
      const center = bounds.min.add(bounds.max).scale(.5);
      pivot.scaling.setAll(scale);
      pivot.position.set(-center.x * scale, -bounds.min.y * scale + .04, -center.z * scale);
      pivot.parent = this.root;

      for (const mesh of result.meshes) {
        mesh.receiveShadows = true;
        if (mesh instanceof Mesh) this.shadow?.addShadowCaster(mesh, false);
        const material = mesh.material;
        if (material instanceof PBRMaterial) {
          material.environmentIntensity = .7;
          material.directIntensity = 1.1;
        }
      }

      const candidates = [...result.transformNodes, ...result.meshes]
        .filter((node) => /wheel(front|rear)[lr]$/i.test(node.name));
      for (const node of candidates) {
        if (node instanceof TransformNode && !this.wheels.includes(node)) this.wheels.push(node);
      }
    } catch (error) {
      console.warn('Modèle Audi indisponible, voiture de secours utilisée.', error);
      this.buildFallback();
    }
  }

  update(dt: number, input: KeyboardInput): void {
    const throttle = input.down('z', 'w', 'arrowup', 'throttle') ? 1 : 0;
    const reverse = input.down('s', 'arrowdown', 'reverse') ? 1 : 0;
    const brake = input.down(' ', 'handbrake') ? 1 : 0;
    // La scène fidèle emploie le repère droit des données géographiques :
    // son sens de lacet est l'inverse de l'ancien prototype Three.js.
    const steerInput = (input.down('q', 'a', 'arrowleft', 'left') ? 1 : 0)
      + (input.down('d', 'arrowright', 'right') ? -1 : 0);
    const wantsBoost = input.down('shift', 'boost');

    this.onRoad = this.world.isOnRoad(this.root.position.x, this.root.position.z);
    this.boosting = Boolean(wantsBoost && throttle && this.boost > .015 && this.speed > 8 && this.onRoad);
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * .17);
    else this.boost = Math.min(1, this.boost + dt * (this.speed < 4 ? .12 : .045));
    const maxForward = this.onRoad ? (this.boosting ? 66 : 52) : 18;
    const maxReverse = -11;
    const acceleration = this.onRoad ? (this.boosting ? 15.2 : 10.4) : 4.2;

    if (throttle) this.speed += acceleration * dt * (1 - Math.max(0, this.speed) / maxForward);
    if (reverse) {
      if (this.speed > 1) this.speed -= 14 * dt;
      else this.speed -= 5.8 * dt * (1 - Math.abs(Math.min(0, this.speed)) / Math.abs(maxReverse));
    }
    this.drifting = Boolean(brake && Math.abs(this.speed) > 8 && Math.abs(steerInput) > .1);
    if (brake) this.speed -= Math.sign(this.speed || 1) * Math.min(Math.abs(this.speed), (this.drifting ? 5.5 : 19) * dt);
    if (!throttle && !reverse) {
      const drag = (.65 + Math.abs(this.speed) * .018) * dt;
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), drag);
    }
    this.speed = Math.max(maxReverse, Math.min(maxForward, this.speed));

    const speedFactor = Math.min(1, Math.abs(this.speed) / 5);
    const steerLimit = .61 * (1 - Math.min(.56, Math.abs(this.speed) / 78));
    const targetSteer = steerInput * steerLimit;
    this.steering += (targetSteer - this.steering) * Math.min(1, dt * (steerInput ? 5.4 : 8.5));
    const driftTurn = this.drifting ? 1.72 : 1;
    this.heading += this.steering * speedFactor * dt * 1.5 * driftTurn * Math.sign(this.speed || 1);

    this.lastX = this.root.position.x;
    this.lastZ = this.root.position.z;
    const forwardX = Math.sin(this.heading), forwardZ = Math.cos(this.heading);
    this.root.position.x += forwardX * this.speed * dt;
    this.root.position.z += forwardZ * this.speed * dt;
    this.distanceTravelled += Math.abs(this.speed * dt);

    if (this.world.collidesBuilding(this.root.position.x, this.root.position.z, 1.05)) {
      this.root.position.x = this.lastX;
      this.root.position.z = this.lastZ;
      this.speed *= -.16;
    }

    const ground = this.world.surfaceY(this.root.position.x, this.root.position.z);
    this.root.position.y += (ground - this.root.position.y) * Math.min(1, dt * 14);
    const targetRoll = -this.steering * Math.min(1, Math.abs(this.speed) / 22) * (this.drifting ? .14 : .075);
    const targetPitch = this.boosting ? -.025 : throttle ? -.012 : reverse ? .018 : 0;
    this.visualRoll += (targetRoll - this.visualRoll) * Math.min(1, dt * 7);
    this.visualPitch += (targetPitch - this.visualPitch) * Math.min(1, dt * 6);
    this.root.rotationQuaternion = Quaternion.FromEulerAngles(this.visualPitch, this.heading, this.visualRoll);

    const wheelDelta = this.speed * dt / .34;
    for (const wheel of this.wheels) wheel.rotate(Axis.X, wheelDelta, Space.LOCAL);
  }

  reset(): void {
    this.speed = 0;
    this.steering = 0;
    this.heading = this.start.heading;
    this.root.position.set(this.start.x, this.world.surfaceY(this.start.x, this.start.z), this.start.z);
    this.root.rotationQuaternion = Quaternion.FromEulerAngles(0, this.heading, 0);
  }

  hitTraffic(): void {
    this.speed *= -.22;
    this.boost = Math.max(0, this.boost - .12);
  }

  forward(target = new Vector3()): Vector3 {
    return target.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  private buildFallback(): void {
    const paint = new PBRMaterial('fallback-paint', this.scene);
    paint.albedoColor = Color3.FromHexString('#b52c26');
    paint.metallic = .72;
    paint.roughness = .28;
    const glass = new PBRMaterial('fallback-glass', this.scene);
    glass.albedoColor = new Color3(.035, .07, .1);
    glass.metallic = .15;
    glass.roughness = .2;
    const rubber = new PBRMaterial('fallback-rubber', this.scene);
    rubber.albedoColor = new Color3(.018, .02, .022);
    rubber.metallic = 0;
    rubber.roughness = .95;

    const body = MeshBuilder.CreateBox('fallback-body', { width: 1.82, height: .48, depth: 4.2 }, this.scene);
    body.position.y = .62;
    body.material = paint;
    body.parent = this.root;
    const cabin = MeshBuilder.CreateBox('fallback-cabin', { width: 1.55, height: .56, depth: 2.05 }, this.scene);
    cabin.position.set(0, 1.02, -.12);
    cabin.material = glass;
    cabin.parent = this.root;
    this.shadow?.addShadowCaster(body);
    this.shadow?.addShadowCaster(cabin);

    const wheelPositions = [
      [-.88, .36, 1.35], [.88, .36, 1.35], [-.88, .36, -1.35], [.88, .36, -1.35],
    ];
    for (const [x, y, z] of wheelPositions) {
      const pivot = new TransformNode('fallback-wheel-pivot', this.scene);
      pivot.position.set(x, y, z);
      pivot.parent = this.root;
      const wheel = MeshBuilder.CreateCylinder('fallback-wheel', { height: .26, diameter: .68, tessellation: 16 }, this.scene);
      wheel.rotation.z = Math.PI / 2;
      wheel.material = rubber;
      wheel.parent = pivot;
      this.wheels.push(pivot);
      this.shadow?.addShadowCaster(wheel);
    }
  }
}
