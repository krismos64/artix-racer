import * as THREE from 'three/webgpu';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  readonly root: THREE.Group;
  speed = 0;
  steering = 0;
  heading: number;
  onRoad = true;
  boost = 1;
  boosting = false;
  drifting = false;
  distanceTravelled = 0;
  // Vitesse d'impact (m/s) du dernier choc, relevée puis remise à zéro par
  // la couche de motion design (secousse caméra, flash, perte du combo).
  impact = 0;

  private readonly start: SpawnPoint;
  private readonly wheels: THREE.Object3D[] = [];
  // Pièces d'habitacle masquées en vue conducteur. Le siège du conducteur se
  // tient forcément entre l'œil et le pare-brise dès que la caméra recule
  // assez pour dégager le volant : son dossier bouchait tout le centre de
  // l'image.
  private readonly piecesCabine: THREE.Object3D[] = [];
  // Contrepartie : affichées SEULEMENT en vue conducteur, ce sont les
  // morceaux de garniture conservés quand la pièce entière s'efface.
  private readonly piecesCabineAvant: THREE.Object3D[] = [];
  private cabineMasquee = false;
  private lastX: number;
  private lastZ: number;
  private visualRoll = 0;
  private visualPitch = 0;

  constructor(
    scene: THREE.Scene,
    private readonly world: ArtixWorld,
    spawn: SpawnPoint,
  ) {
    this.start = { ...spawn };
    this.heading = spawn.heading;
    this.lastX = spawn.x;
    this.lastZ = spawn.z;
    this.root = new THREE.Group();
    this.root.name = 'player-car';
    // Lacet, puis tangage, puis roulis : l'ordre d'un véhicule.
    this.root.rotation.order = 'YXZ';
    this.root.position.set(spawn.x, world.surfaceY(spawn.x, spawn.z), spawn.z);
    this.root.rotation.set(0, this.heading, 0);
    scene.add(this.root);
  }

  // Vecteur du repère LOCAL du châssis (+Z avant, +X gauche du conducteur)
  // exprimé dans le monde, tangage et roulis compris. Sans la position.
  versMonde(local: THREE.Vector3, cible: THREE.Vector3): THREE.Vector3 {
    return cible.copy(local).applyQuaternion(this.root.quaternion);
  }

  // Éclairage nocturne du véhicule : deux projecteurs de phares et quatre
  // plaques émissives (optiques blanches à l'avant, feux rouges à l'arrière).
  // Construit à la création et seulement masqué le jour : ajouter une
  // lumière en cours de partie fait recompiler tous les matériaux.
  private nightNodes: THREE.Group | null = null;

  setNight(active: boolean): void {
    if (!this.nightNodes) {
      const rig = new THREE.Group();
      rig.name = 'car-nuit';
      const feuMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e });
      const optiqueMat = new THREE.MeshBasicMaterial({ color: 0xfff3d2 });
      for (const cote of [-1, 1]) {
        // Faisceau étroit, quasi horizontal : l'énergie se dépose entre
        // quinze et trente-cinq mètres devant le véhicule. Demi-angle de
        // 0,29 rad, pénombre sur la moitié extérieure du cône : c'est le
        // bord du cône, seul à frôler la chaussée proche, qui écrasait le
        // premier plan dans les premiers réglages.
        const phare = new THREE.SpotLight(0xffe9c0, 1500, 70, .29, .5, 2);
        phare.position.set(cote * .58, .68, 1.9);
        phare.target.position.set(cote * .58 + cote * .04 * 20, .68 - .055 * 20, 1.9 + 20);
        rig.add(phare, phare.target);

        const optique = new THREE.Mesh(new THREE.PlaneGeometry(.3, .11), optiqueMat);
        optique.position.set(cote * .58, .66, 2.02);
        rig.add(optique);

        const feu = new THREE.Mesh(new THREE.PlaneGeometry(.34, .1), feuMat);
        feu.position.set(cote * .55, .74, -2.05);
        feu.rotation.y = Math.PI;
        rig.add(feu);
      }
      this.root.add(rig);
      this.nightNodes = rig;
    }
    this.nightNodes.visible = active;
  }

  async loadModel(): Promise<void> {
    try {
      // Ferrari 458 Italia, le modèle de l'exemple `webgl_materials_car` de
      // three.js (auteur vicent091036) : 1,68 Mo, aucune texture (17
      // matériaux de couleur), intérieur complet. Compressé en Draco, d'où
      // le décodeur servi depuis public/draco/.
      const draco = new DRACOLoader().setDecoderPath('/draco/');
      const gltf = await new GLTFLoader().setDRACOLoader(draco).loadAsync('/models/ferrari.glb');
      draco.dispose();
      const pivot = new THREE.Group();
      pivot.name = 'ferrari-pivot';
      pivot.add(gltf.scene);

      const bornes = new THREE.Box3().setFromObject(pivot);
      const taille = bornes.getSize(new THREE.Vector3());
      const longueur = Math.max(taille.x, taille.z);
      const echelle = longueur > .01 ? 4.35 / longueur : 1;
      const centre = bornes.getCenter(new THREE.Vector3());
      pivot.scale.setScalar(echelle);
      // Le modèle regarde -Z (roues avant à z = -1,16, arrière à +1,50), la
      // scène attend l'inverse : demi-tour, et le centre change donc de signe
      // en X et en Z.
      pivot.rotation.y = Math.PI;
      pivot.position.set(centre.x * echelle, -bornes.min.y * echelle + .04, centre.z * echelle);
      this.root.add(pivot);

      const materiaux = new Map<THREE.Material, THREE.Material>();
      gltf.scene.traverse((objet) => {
        const mesh = objet as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const source = mesh.material as THREE.MeshStandardMaterial;
        let materiau = materiaux.get(source);
        if (!materiau) {
          materiau = this.reglerMateriau(source);
          materiaux.set(source, materiau);
        }
        mesh.material = materiau;
      });
      this.buildContactShadow();

      // Roues : `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`.
      gltf.scene.traverse((objet) => {
        if (/^wheel_(fl|fr|rl|rr)$/i.test(objet.name)) this.wheels.push(objet);
      });

      // Pièces masquées en vue conducteur : tout ce qui compose les sièges.
      // Le tri s'est fait sur l'ÉTENDUE des pièces :
      //   leather        z[-0,41 ; 1,08]   sièges
      //   trim           z[-0,35 ; 1,08]   surpiqûres des sièges
      //   carpet         z[-0,56 ; 1,10]   moquette
      //   interior_dark  z[-2,16 ; 2,16]   garniture de TOUTE la voiture
      // `steering_*` appartient au volant et reste à l'écran.
      const PIECES_SIEGE = ['leather', 'trim', 'carpet'];
      gltf.scene.traverse((objet) => {
        if (PIECES_SIEGE.includes(objet.name.toLowerCase())) this.piecesCabine.push(objet);
      });

      // `interior_dark` porte à la fois la coque des sièges ET la planche de
      // bord dans une seule primitive de 20 563 sommets. La masquer entière
      // ramène le dossier devant l'œil, la garder troue le tableau de bord.
      // Elle est coupée en deux à l'exécution : une copie réduite aux
      // triangles de l'AVANT (la planche) sert en vue conducteur, l'original
      // reste pour les vues extérieures.
      const garniture = gltf.scene.getObjectByName('interior_dark') as THREE.Mesh | undefined;
      if (garniture?.isMesh) {
        const avant = this.decouperCabine(garniture, 0);
        if (avant) {
          this.piecesCabine.push(garniture);
          this.piecesCabineAvant.push(avant);
        }
      }
      this.setVueCabine(this.cabineMasquee);
    } catch (error) {
      console.warn('Modèle Ferrari indisponible, voiture de secours utilisée.', error);
      this.buildFallback();
    }
  }

  private reglerMateriau(source: THREE.MeshStandardMaterial): THREE.Material {
    switch (source.name) {
      // Carrosserie : vernis épais sur peinture. C'est la couche brillante
      // qui reflète le ciel HDR et fait lire une carrosserie plutôt qu'un
      // volume de plastique mat.
      case 'Body_Color':
        return new THREE.MeshPhysicalMaterial({
          name: source.name, color: new THREE.Color(.62, .02, .03),
          metalness: .25, roughness: .28, clearcoat: 1, clearcoatRoughness: .05,
        });
      // Vitrage teinté : le modèle le donne en gris opaque, ce qui bouche
      // l'habitacle qu'il vient justement de modéliser.
      case 'Glass_Gray':
        return new THREE.MeshStandardMaterial({
          name: source.name, color: new THREE.Color(.08, .09, .11),
          metalness: .1, roughness: .06, transparent: true, opacity: .32,
        });
      // Jantes et chrome : la seule surface franchement métallique.
      case 'metal_chrome':
      case 'metal_gray':
        source.metalness = 1;
        source.roughness = .18;
        return source;
      // Pneus : caoutchouc mat. Laissés au réglage du modèle, ils
      // accrochaient la lumière comme du vinyle.
      case 'Tires':
        source.metalness = 0;
        source.roughness = .95;
        source.color.setRGB(.045, .045, .05);
        return source;
      default:
        return source;
    }
  }

  // Copie d'un maillage ne gardant que les triangles situés en deçà de
  // `seuil` sur l'axe Z local, c'est-à-dire vers l'AVANT du véhicule (z
  // négatif dans le repère du modèle). Le tri se fait sur le CENTRE de chaque
  // triangle : découper au sommet près laisserait des trous.
  private decouperCabine(source: THREE.Mesh, seuil: number): THREE.Mesh | null {
    const position = source.geometry.getAttribute('position');
    const index = source.geometry.index;
    if (!position || !index) return null;
    const gardes: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
      if ((position.getZ(a) + position.getZ(b) + position.getZ(c)) / 3 < seuil) gardes.push(a, b, c);
    }
    if (!gardes.length || gardes.length === index.count) return null;
    const geometrie = source.geometry.clone();
    geometrie.setIndex(gardes);
    const copie = new THREE.Mesh(geometrie, source.material);
    copie.name = `${source.name}-avant`;
    copie.position.copy(source.position);
    copie.quaternion.copy(source.quaternion);
    copie.scale.copy(source.scale);
    copie.castShadow = false;
    copie.visible = false;
    source.parent?.add(copie);
    return copie;
  }

  // Vue conducteur : masque les sièges, qui se trouvent entre l'œil et la
  // route. Appelée à chaque changement de caméra depuis la boucle de jeu.
  setVueCabine(masquee: boolean): void {
    this.cabineMasquee = masquee;
    for (const piece of this.piecesCabine) piece.visible = !masquee;
    for (const piece of this.piecesCabineAvant) piece.visible = masquee;
  }

  update(dt: number, input: KeyboardInput): void {
    const throttle = input.down('z', 'w', 'arrowup', 'throttle') ? 1 : 0;
    const reverse = input.down('s', 'arrowdown', 'reverse') ? 1 : 0;
    const brake = input.down(' ', 'handbrake') ? 1 : 0;
    // Repère main droite, Z vers le sud : un lacet positif tourne à gauche.
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
      this.impact = Math.max(this.impact, Math.abs(this.speed));
      this.speed *= -.16;
    }

    const ground = this.world.surfaceY(this.root.position.x, this.root.position.z);
    this.root.position.y += (ground - this.root.position.y) * Math.min(1, dt * 14);
    const targetRoll = -this.steering * Math.min(1, Math.abs(this.speed) / 22) * (this.drifting ? .14 : .075);
    const targetPitch = this.boosting ? -.025 : throttle ? -.012 : reverse ? .018 : 0;
    this.visualRoll += (targetRoll - this.visualRoll) * Math.min(1, dt * 7);
    this.visualPitch += (targetPitch - this.visualPitch) * Math.min(1, dt * 6);
    this.root.rotation.set(this.visualPitch, this.heading, this.visualRoll);

    const wheelDelta = this.speed * dt / .34;
    for (const wheel of this.wheels) wheel.rotateX(wheelDelta);
  }

  reset(): void {
    this.speed = 0;
    this.steering = 0;
    this.heading = this.start.heading;
    this.root.position.set(this.start.x, this.world.surfaceY(this.start.x, this.start.z), this.start.z);
    this.root.rotation.set(0, this.heading, 0);
  }

  arreter(): void {
    this.speed = 0;
    this.steering = 0;
    this.boosting = false;
    this.drifting = false;
  }

  hitTraffic(): void {
    this.impact = Math.max(this.impact, Math.abs(this.speed));
    this.speed *= -.22;
    this.boost = Math.max(0, this.boost - .12);
  }

  forward(target = new THREE.Vector3()): THREE.Vector3 {
    return target.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // Ombre de contact : dégradé radial sombre couché sous le châssis. L'ombre
  // en cascade du soleil s'arrête au bas de caisse et laisse la voiture
  // flotter sur l'enrobé ; ce voile assoit les pneus au sol sous tous les
  // éclairages, y compris la nuit.
  private buildContactShadow(): void {
    const taille = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = taille;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(taille / 2, taille / 2, 6, taille / 2, taille / 2, taille / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(.55, 'rgba(0,0,0,0.30)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, taille, taille);
    const geometrie = new THREE.PlaneGeometry(2.7, 5.1);
    geometrie.rotateX(-Math.PI / 2);
    const voile = new THREE.Mesh(geometrie, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false,
    }));
    voile.name = 'ombre-contact';
    voile.position.y = .05;
    this.root.add(voile);
  }

  private buildFallback(): void {
    const paint = new THREE.MeshStandardMaterial({ color: 0xb52c26, metalness: .72, roughness: .28 });
    const glass = new THREE.MeshStandardMaterial({ color: new THREE.Color(.035, .07, .1), metalness: .15, roughness: .2 });
    const rubber = new THREE.MeshStandardMaterial({ color: new THREE.Color(.018, .02, .022), roughness: .95 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, .48, 4.2), paint);
    body.position.y = .62;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, .56, 2.05), glass);
    cabin.position.set(0, 1.02, -.12);
    body.castShadow = cabin.castShadow = true;
    this.root.add(body, cabin);

    const roue = new THREE.CylinderGeometry(.34, .34, .26, 16);
    roue.rotateZ(Math.PI / 2);
    for (const [x, y, z] of [[-.88, .36, 1.35], [.88, .36, 1.35], [-.88, .36, -1.35], [.88, .36, -1.35]]) {
      const wheel = new THREE.Mesh(roue, rubber);
      wheel.position.set(x, y, z);
      wheel.castShadow = true;
      this.root.add(wheel);
      this.wheels.push(wheel);
    }
  }
}
