import {
  AbstractMesh,
  Axis,
  Color3,
  DynamicTexture,
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
  // Pièces d'habitacle masquées en vue conducteur. Le siège du conducteur se
  // tient forcément entre l'œil et le pare-brise dès que la caméra recule
  // assez pour dégager le volant : son dossier bouchait alors tout le centre
  // de l'image. Aucun jeu de course n'affiche le dossier du joueur.
  private readonly piecesCabine: AbstractMesh[] = [];
  // Contrepartie des précédentes : affichées SEULEMENT en vue conducteur, ce
  // sont les morceaux de garniture conservés quand la pièce entière s'efface.
  private readonly piecesCabineAvant: AbstractMesh[] = [];
  private cabineMasquee = false;
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
        // Faisceau étroit, quasi horizontal, à forte concentration axiale :
        // l'énergie se dépose entre quinze et trente-cinq mètres devant le
        // véhicule. Le bord du cône, seul à frôler la chaussée proche, est
        // éteint par l'exposant élevé : c'est lui qui écrasait le premier
        // plan dans les réglages précédents.
        const phare = new SpotLight(
          `phare-${cote}`,
          new Vector3(cote * .58, .68, 1.9),
          new Vector3(cote * .04, -.055, 1).normalize(),
          .58, 26, this.scene,
        );
        phare.innerAngle = .3;
        phare.parent = rig;
        phare.diffuse = Color3.FromHexString('#ffe9c0');
        // Les matériaux de la ville suivent l'atténuation physique en 1/d² :
        // l'intensité se lit comme des candelas. 520 donne l'équivalent du
        // plein soleil à une vingtaine de mètres devant le véhicule.
        phare.intensity = 480;
        phare.range = 70;
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
      // Ferrari 458 Italia, le modèle de l'exemple `webgl_materials_car` de
      // three.js (auteur vicent091036). Il remplace l'Audi R8 : 1,68 Mo contre
      // 4,4 Mo, aucune texture (tout est porté par 17 matériaux de couleur),
      // et un intérieur complet avec volant, sièges et tableau de bord, là où
      // le modèle précédent n'avait qu'un habitacle sommaire.
      const result = await SceneLoader.ImportMeshAsync('', '/models/', 'ferrari.glb', this.scene);
      const pivot = new TransformNode('ferrari-pivot', this.scene);
      const roots = result.meshes.filter((mesh) => !mesh.parent);
      for (const root of roots) root.parent = pivot;

      const bounds = pivot.getHierarchyBoundingVectors(true);
      const size = bounds.max.subtract(bounds.min);
      const length = Math.max(size.x, size.z);
      const scale = length > .01 ? 4.35 / length : 1;
      const center = bounds.min.add(bounds.max).scale(.5);
      pivot.scaling.setAll(scale);
      pivot.position.set(-center.x * scale, -bounds.min.y * scale + .04, -center.z * scale);
      // Le modèle regarde -Z (roues avant à z = -1,16, arrière à +1,50), la
      // scène attend l'inverse. Sans ce demi-tour, la voiture roule en marche
      // arrière et ses phares éclairent derrière elle.
      pivot.rotation.y = Math.PI;
      pivot.parent = this.root;

      for (const mesh of result.meshes) {
        mesh.receiveShadows = true;
        if (mesh instanceof Mesh) this.shadow?.addShadowCaster(mesh, false);
        const material = mesh.material;
        if (!(material instanceof PBRMaterial)) continue;
        material.environmentIntensity = 1;
        material.directIntensity = 1;

        switch (material.name) {
          // Carrosserie : vernis épais sur peinture. C'est la couche brillante
          // qui reflète le ciel HDR et fait lire une carrosserie plutôt qu'un
          // volume de plastique mat.
          case 'Body_Color':
            material.albedoColor = new Color3(.62, .02, .03);
            material.metallic = .25;
            material.roughness = .28;
            material.clearCoat.isEnabled = true;
            material.clearCoat.intensity = 1;
            material.clearCoat.roughness = .05;
            break;
          // Vitrage teinté : le modèle le donne en gris opaque, ce qui bouche
          // l'habitacle qu'il vient justement de modéliser.
          case 'Glass_Gray':
            material.alpha = .32;
            material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
            material.albedoColor = new Color3(.08, .09, .11);
            material.metallic = .1;
            material.roughness = .06;
            break;
          // Jantes et chrome : métal poli, la seule surface franchement
          // métallique de la voiture.
          case 'metal_chrome':
          case 'metal_gray':
            material.metallic = 1;
            material.roughness = .18;
            break;
          // Pneus : caoutchouc mat, jamais métallique. Laissés au réglage du
          // modèle, ils accrochaient la lumière comme du vinyle.
          case 'Tires':
            material.metallic = 0;
            material.roughness = .95;
            material.albedoColor = new Color3(.045, .045, .05);
            break;
          default:
            break;
        }
      }
      this.buildContactShadow();

      // Roues : le modèle three.js les nomme `wheel_fl`, `wheel_fr`,
      // `wheel_rl`, `wheel_rr`. L'ancien motif visait le nommage de l'Audi
      // (`wheelFrontL`) et ne trouvait plus rien, les roues restaient figées.
      const candidates = [...result.transformNodes, ...result.meshes]
        .filter((node) => /^wheel_(fl|fr|rl|rr)$/i.test(node.name));
      for (const node of candidates) {
        if (node instanceof TransformNode && !this.wheels.includes(node)) this.wheels.push(node);
      }

      // Diagnostic depuis la console : `__cabine()` liste les pièces de la
      // voiture qui se tiennent devant l'œil en vue conducteur, classées par
      // l'angle qu'elles occupent. `__cabine('nom')` en masque une pour voir
      // l'effet. C'est ainsi qu'on identifie ce qui bouche, au lieu de le
      // deviner d'après les bornes du glTF, qui sont exprimées avant les
      // transformations de nœud et ne disent rien de la position réelle.
      (window as unknown as Record<string, unknown>).__cabine = (nom?: string) => {
        if (nom) {
          const m = this.scene.getMeshByName(nom);
          if (!m) return `aucun maillage nommé ${nom}`;
          m.setEnabled(!m.isEnabled());
          return `${nom} ${m.isEnabled() ? 'affiché' : 'masqué'}`;
        }
        const cam = this.scene.activeCamera;
        if (!cam) return 'pas de caméra';
        const dansVoiture = (m: AbstractMesh) => {
          let p = m.parent;
          while (p) { if (p === this.root) return true; p = p.parent; }
          return false;
        };
        const lignes: { nom: string; distance: number; angle: number }[] = [];
        for (const m of this.scene.meshes) {
          if (!m.isEnabled() || !dansVoiture(m)) continue;
          const bb = m.getBoundingInfo().boundingBox;
          const d = Vector3.Distance(bb.centerWorld, cam.position);
          if (d > 3) continue;
          const vers = bb.centerWorld.subtract(cam.position).normalize();
          if (Vector3.Dot(vers, cam.getForwardRay().direction) < .3) continue;
          const taille = bb.maximumWorld.subtract(bb.minimumWorld).length();
          lignes.push({ nom: m.name, distance: +d.toFixed(2), angle: +(taille / d).toFixed(2) });
        }
        lignes.sort((a, b) => b.angle - a.angle);
        return lignes.slice(0, 12);
      };

      // Pièces masquées en vue conducteur : tout ce qui compose les sièges.
      //
      // `leather` seul ne suffisait pas, la capture montrait encore un dossier
      // gris clair. Sa couleur (#bababa, presque blanc) ne correspond pas au
      // matériau `Leather` (#6e6e72, gris-mauve foncé) mais aux garnitures
      // `Interior_light` et `Carpet`. Le siège de ce modèle est donc assemblé
      // à partir de plusieurs meshes, coquille et garniture séparées.
      //
      // Les noms visés sont exacts : `steering_leather`, `steering_carbon` et
      // les autres pièces en `steering_*` appartiennent au volant et doivent
      // rester à l'écran.
      // Le tri se fait sur l'ÉTENDUE des meshes, seule mesure fiable ici (le
      // modèle est compressé en Draco, sa géométrie n'est pas lisible hors
      // navigateur, mais les bornes des accesseurs le restent) :
      //
      //   leather        z[-0,41 ; 1,08]   sièges
      //   trim           z[-0,35 ; 1,08]   surpiqûres des sièges
      //   carpet         z[-0,56 ; 1,10]   moquette
      //   interior_dark  z[-2,16 ; 2,16]   garniture de TOUTE la voiture
      //   interior_light z[-2,16 ; 2,15]   idem
      //
      // Les deux derniers courent sur les 4,3 m du véhicule : ce sont les
      // garnitures générales, planche de bord comprise. Les avoir masqués
      // trouait le tableau de bord, la console centrale laissant voir la rue
      // au travers et la casquette d'instruments flottant en arche isolée.
      const PIECES_SIEGE = ['leather', 'trim', 'carpet'];
      for (const mesh of result.meshes) {
        if (PIECES_SIEGE.includes(mesh.name.toLowerCase())) this.piecesCabine.push(mesh);
      }

      // `interior_dark` est le cas difficile : UNE SEULE primitive de 20 563
      // sommets couvrant les 4,5 m du véhicule, qui porte à la fois la coque
      // des sièges ET la planche de bord. La masquer entière ramène le
      // dossier devant l'œil ; la garder troue le tableau de bord. Aucun tri
      // par nom ne peut départager.
      //
      // On la coupe donc en deux à l'exécution : un clone dont on retire les
      // triangles situés DEVANT le seuil (la planche) sert en vue conducteur,
      // l'original restant pour les vues extérieures. Le seuil est posé à
      // z = 0 dans le repère LOCAL du modèle, qui sépare l'avant (négatif, la
      // planche) de l'arrière (positif, les sièges).
      const garniture = result.meshes.find((m) => /^interior_dark$/i.test(m.name));
      if (garniture instanceof Mesh) {
        const avant = this.decouperCabine(garniture, 0);
        if (avant) {
          // La partie AVANT (planche de bord) reste seule visible en vue
          // conducteur ; l'original, qui contient aussi les sièges, s'efface.
          this.piecesCabine.push(garniture);
          this.piecesCabineAvant.push(avant);
        }
      }

      // Réapplique l'état courant : le modèle peut finir de charger alors que
      // le joueur est déjà passé en vue conducteur.
      this.setVueCabine(this.cabineMasquee);
    } catch (error) {
      console.warn('Modèle Ferrari indisponible, voiture de secours utilisée.', error);
      this.buildFallback();
    }
  }

  // Copie d'un maillage ne gardant que les triangles situés en deçà de `seuil`
  // sur l'axe Z local, c'est-à-dire vers l'AVANT du véhicule : dans le repère
  // du modèle, l'avant est en z négatif (les roues avant sont à -1,16, les
  // arrière à +1,49), c'est le demi-tour du pivot qui remet l'ensemble à
  // l'endroit. Sert à séparer la planche de bord des sièges quand les deux
  // partagent une même primitive.
  //
  // Le tri se fait sur le CENTRE de chaque triangle : découper au sommet près
  // laisserait des trous sur les faces à cheval sur le seuil.
  private decouperCabine(source: Mesh, seuil: number): Mesh | null {
    const positions = source.getVerticesData('position');
    const indices = source.getIndices();
    if (!positions || !indices) return null;

    const gardes: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      let z = 0;
      for (let k = 0; k < 3; k++) z += positions[indices[i + k] * 3 + 2];
      if (z / 3 < seuil) gardes.push(indices[i], indices[i + 1], indices[i + 2]);
    }
    if (!gardes.length || gardes.length === indices.length) return null;

    const copie = source.clone(`${source.name}-avant`, source.parent);
    if (!copie) return null;
    // `clone` partage la géométrie : il faut la rendre unique avant d'y
    // toucher, sinon la découpe s'applique aussi à l'original.
    copie.makeGeometryUnique();
    copie.setIndices(gardes);
    copie.setEnabled(false);
    return copie;
  }

  // Vue conducteur : masque les sièges, qui se trouvent entre l'œil et la
  // route. Appelée à chaque changement de caméra depuis la boucle de jeu.
  setVueCabine(masquee: boolean): void {
    this.cabineMasquee = masquee;
    for (const mesh of this.piecesCabine) mesh.setEnabled(!masquee);
    for (const mesh of this.piecesCabineAvant) mesh.setEnabled(masquee);
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

  // Ombre de contact : dégradé radial sombre couché sous le châssis. L'ombre
  // en cascade du soleil s'arrête au bas de caisse et laisse la voiture
  // flotter sur l'enrobé ; ce voile assoit les pneus au sol sous tous les
  // éclairages, y compris la nuit où le soleil ne projette plus rien.
  private buildContactShadow(): void {
    const taille = 128;
    const texture = new DynamicTexture('ombre-contact', { width: taille, height: taille }, this.scene, false);
    const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(taille / 2, taille / 2, 6, taille / 2, taille / 2, taille / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(.55, 'rgba(0,0,0,0.30)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, taille, taille);
    texture.update(false);
    texture.hasAlpha = true;
    const materiau = new StandardMaterial('ombre-contact-materiau', this.scene);
    materiau.diffuseColor = Color3.Black();
    materiau.emissiveColor = Color3.Black();
    materiau.specularColor = Color3.Black();
    materiau.opacityTexture = texture;
    materiau.disableLighting = true;
    materiau.disableDepthWrite = true;
    const voile = MeshBuilder.CreateGround('ombre-contact-plan', { width: 2.7, height: 5.1 }, this.scene);
    voile.material = materiau;
    voile.position.y = .05;
    voile.isPickable = false;
    voile.receiveShadows = false;
    voile.parent = this.root;
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
