import * as THREE from 'three/webgpu';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ArtixWorld } from './world';

const ROTATION_ROUE = new THREE.Euler();
const QUATERNION_ROUE = new THREE.Quaternion();

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

// ---- Modèle de conduite ---------------------------------------------------
// Modèle « bicyclette » à deux essieux : la voiture a une vitesse en deux
// composantes (avant et latérale) et une vitesse de lacet. Chaque essieu
// produit une force latérale qui dépend de son angle de DÉRIVE (l'écart
// entre la direction où pointe le pneu et celle où il va), plafonnée par
// l'adhérence et par la charge qu'il porte. C'est ce plafond qui fait
// décrocher l'arrière au frein à main ou à l'accélération en virage.
// L'ancien modèle n'avait qu'une vitesse scalaire le long du cap : la
// voiture suivait un rail et un « dérapage » n'était qu'un drapeau.
const MASSE = 1500;            // kg, une 458 pèse 1 485 kg
const INERTIE_LACET = 2300;    // kg·m², résistance à la mise en rotation
const AVANT = 1.25;            // centre de gravité → essieu avant (m)
const ARRIERE = 1.40;          // centre de gravité → essieu arrière (m)
const EMPATTEMENT = AVANT + ARRIERE;
const VOIE = 1.68;             // largeur entre roues gauches et droites
const HAUTEUR_CG = .46;        // commande le transfert de charge au freinage
const PESANTEUR = 9.81;
// Courbe d'adhérence latérale (forme de Pacejka réduite à deux coefficients) :
// la force monte vite avec la dérive, plafonne vers 8°, puis retombe un peu.
const RAIDEUR_PNEU = 9;
const FORME_PNEU = 1.45;
const ADHERENCE_ROUTE = 1.35;
const ADHERENCE_TERRE = .8;
// Pas d'intégration plafonné : le modèle devient instable au-delà de 1/100 s
// (les forces latérales sont raides), d'où des sous-pas à 120 Hz.
const PAS_MAX = 1 / 120;

export class ArcadeCar {
  readonly root: THREE.Group;
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
  // Vitesse dans le repère de la caisse : `vAvant` le long du cap, `vCote`
  // vers la gauche du conducteur. `lacet` en rad/s, positif vers la gauche.
  private vAvant = 0;
  private vCote = 0;
  private lacet = 0;
  // Accélérations de la dernière image, pour l'assiette de la caisse.
  private accelAvant = 0;
  private accelCote = 0;
  private tour = 0;
  private readonly rouesAvant: THREE.Object3D[] = [];
  private readonly reposRoues = new Map<THREE.Object3D, THREE.Quaternion>();

  // Vitesse le long du cap, en m/s (négative en marche arrière). La couche
  // arcade la lit partout, et l'écrit pour le départ parfait.
  get speed(): number {
    return this.vAvant;
  }

  set speed(valeur: number) {
    this.vAvant = valeur;
  }

  // Vitesse réelle au sol, glissement latéral compris.
  get vitesseSol(): number {
    return Math.hypot(this.vAvant, this.vCote);
  }

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
        if (!/^wheel_(fl|fr|rl|rr)$/i.test(objet.name)) return;
        this.wheels.push(objet);
        this.reposRoues.set(objet, objet.quaternion.clone());
        if (/^wheel_f/i.test(objet.name)) this.rouesAvant.push(objet);
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
    this.boosting = Boolean(wantsBoost && throttle && this.boost > .015 && this.vAvant > 8 && this.onRoad);
    if (this.boosting) this.boost = Math.max(0, this.boost - dt * .17);
    else this.boost = Math.min(1, this.boost + dt * (this.vAvant < 4 ? .12 : .045));

    // Braquage : 0,55 rad à l'arrêt, 0,11 rad à 200 km/h. Un volant qui garde
    // son plein angle à haute vitesse envoie la voiture en tête-à-queue au
    // moindre appui sur une touche (le clavier n'a pas de demi-mesure).
    const vitesse = this.vitesseSol;
    const braquageMax = .55 / (1 + vitesse / 14);
    const cibleBraquage = steerInput * braquageMax;
    this.steering += (cibleBraquage - this.steering) * Math.min(1, dt * (steerInput ? 6 : 9));

    const pas = Math.max(1, Math.ceil(dt / PAS_MAX));
    const h = dt / pas;
    let choc = 0;
    let deriveArriere = 0;
    for (let i = 0; i < pas; i++) {
      deriveArriere = this.integrer(h, throttle, reverse, brake);
      choc = Math.max(choc, this.deplacer(h));
    }
    if (choc > 0) this.impact = Math.max(this.impact, choc);
    this.distanceTravelled += vitesse * dt;

    // Dérapage : l'essieu arrière glisse de plus de 9° à plus de 30 km/h.
    // C'est maintenant une mesure, plus un drapeau lié au frein à main.
    this.drifting = Math.abs(deriveArriere) > .16 && vitesse > 8;

    // Sol sous les quatre roues : hauteur de caisse, tangage et roulis du
    // relief. Un seul point sous le centre laissait la voiture horizontale
    // dans les pentes, le nez planté dans la côte.
    const p = this.root.position;
    const ax = Math.sin(this.heading), az = Math.cos(this.heading);
    const gx = Math.cos(this.heading), gz = -Math.sin(this.heading);
    const solAvant = this.world.surfaceY(p.x + ax * AVANT, p.z + az * AVANT);
    const solArriere = this.world.surfaceY(p.x - ax * ARRIERE, p.z - az * ARRIERE);
    const solGauche = this.world.surfaceY(p.x + gx * VOIE / 2, p.z + gz * VOIE / 2);
    const solDroite = this.world.surfaceY(p.x - gx * VOIE / 2, p.z - gz * VOIE / 2);
    const sol = (solAvant + solArriere + solGauche + solDroite) / 4;
    p.y += (sol - p.y) * Math.min(1, dt * 14);

    // Assiette : la caisse plonge au freinage, se cabre à l'accélération et
    // prend du roulis vers l'extérieur du virage, par-dessus la pente du sol.
    // Une rotation X positive baisse le nez, une rotation Z positive lève le
    // flanc gauche.
    const tangageSol = -Math.atan2(solAvant - solArriere, EMPATTEMENT);
    const roulisSol = Math.atan2(solGauche - solDroite, VOIE);
    const tangage = tangageSol + Math.max(-.035, Math.min(.045, -this.accelAvant * .0032));
    const roulis = roulisSol + Math.max(-.07, Math.min(.07, this.accelCote * .0075));
    this.visualPitch += (tangage - this.visualPitch) * Math.min(1, dt * 7);
    this.visualRoll += (roulis - this.visualRoll) * Math.min(1, dt * 7);
    this.root.rotation.set(this.visualPitch, this.heading, this.visualRoll);

    // Roues : elles tournent à la vitesse d'avance, et les roues avant
    // pivotent avec le volant. Frein à main : les roues arrière se bloquent.
    this.tour += this.vAvant * dt / .34;
    for (const roue of this.wheels) {
      const repos = this.reposRoues.get(roue);
      if (!repos) { roue.rotateX(this.vAvant * dt / .34); continue; }
      const avant = this.rouesAvant.includes(roue);
      ROTATION_ROUE.set(avant || !brake ? this.tour : 0, avant ? this.steering : 0, 0, 'YXZ');
      roue.quaternion.copy(repos).multiply(QUATERNION_ROUE.setFromEuler(ROTATION_ROUE));
    }
  }

  // Un pas de dynamique : forces des pneus, du moteur et de l'air, puis
  // vitesses. Renvoie l'angle de dérive de l'essieu arrière.
  private integrer(h: number, throttle: number, reverse: number, freinMain: number): number {
    const adherence = this.onRoad ? ADHERENCE_ROUTE : ADHERENCE_TERRE;
    const vMax = this.onRoad ? (this.boosting ? 66 : 52) : 22;

    // Force longitudinale. Moteur : 10,4 m/s² à l'arrêt (15,2 sous nitro),
    // qui s'éteint en approchant la vitesse de pointe. Marche arrière
    // plafonnée à 40 km/h. La pédale de frein (S) freine tant qu'on avance.
    let pousse = 0;
    if (throttle) {
      const accel = this.onRoad ? (this.boosting ? 15.2 : 10.4) : 5;
      pousse += MASSE * accel * Math.max(0, 1 - Math.max(0, this.vAvant) / vMax);
    }
    let freinage = 0;
    if (reverse) {
      if (this.vAvant > .8) freinage = 17;
      else pousse -= MASSE * 5.8 * Math.max(0, 1 - Math.max(0, -this.vAvant) / 11);
    }
    // Frein à main : roues arrière bloquées, donc peu de décélération (un
    // pneu qui glisse freine moins qu'un pneu qui roule) mais plus aucun
    // guidage à l'arrière.
    if (freinMain) freinage = Math.max(freinage, 5.5);
    // Air et roulement : faibles sur route, forts dans l'herbe.
    const trainee = this.onRoad ? .65 + Math.abs(this.vAvant) * .018 : 2.2 + Math.abs(this.vAvant) * .16;
    let forceAvant = pousse;
    const resistance = MASSE * (freinage + (throttle || reverse ? trainee * .35 : trainee));
    // Les freins s'opposent au mouvement sans jamais l'inverser.
    const arretPossible = MASSE * Math.abs(this.vAvant) / h;
    forceAvant -= Math.sign(this.vAvant) * Math.min(resistance, arretPossible);

    // Charge par essieu : le freinage charge l'avant, l'accélération
    // l'arrière. Un essieu délesté a moins d'adhérence.
    const transfert = MASSE * this.accelAvant * HAUTEUR_CG / EMPATTEMENT;
    const chargeAvant = Math.max(MASSE * PESANTEUR * .15, MASSE * PESANTEUR * ARRIERE / EMPATTEMENT - transfert);
    const chargeArriere = Math.max(MASSE * PESANTEUR * .15, MASSE * PESANTEUR * AVANT / EMPATTEMENT + transfert);

    // Angle de dérive de chaque essieu : vitesse du pneu décomposée dans son
    // propre repère. À très basse vitesse, le dénominateur est plancher à
    // 2 m/s, sinon l'angle saute de ±90° au moindre frémissement.
    const d = this.steering, cd = Math.cos(d), sd = Math.sin(d);
    const vLatAvant = this.vCote + AVANT * this.lacet;
    const longAvant = this.vAvant * cd + vLatAvant * sd;
    const latAvant = -this.vAvant * sd + vLatAvant * cd;
    const deriveAvant = Math.atan2(latAvant, Math.max(2, Math.abs(longAvant)));
    const latArriere = this.vCote - ARRIERE * this.lacet;
    const deriveArriere = Math.atan2(latArriere, Math.max(2, Math.abs(this.vAvant)));

    // L'arrière partage son adhérence entre la traction et le guidage : à
    // pleine accélération en virage, il lui reste moins de tenue latérale.
    // Propulsion : c'est ce qui permet de faire glisser l'arrière au gaz.
    const part = Math.min(1, Math.abs(pousse) / (adherence * chargeArriere));
    let adherenceArriere = adherence * Math.sqrt(1 - .3 * part * part);
    // Frein à main : l'arrière garde 58 % de sa tenue. À 42 % (premier
    // essai), la voiture faisait un tête-à-queue complet en une seconde.
    if (freinMain) adherenceArriere *= .58;
    const pneu = (derive: number, plafond: number): number =>
      -plafond * Math.sin(FORME_PNEU * Math.atan(RAIDEUR_PNEU * derive));
    const forceLatAvant = pneu(deriveAvant, adherence * chargeAvant);
    const forceLatArriere = pneu(deriveArriere, adherenceArriere * chargeArriere);

    const accelAvant = (forceAvant - forceLatAvant * sd) / MASSE;
    const accelCote = (forceLatAvant * cd + forceLatArriere) / MASSE;
    // Amortissement du lacet : il représente ce que le modèle ne calcule pas
    // (pneus déformés, carrossage) et laisse au joueur le temps de
    // contre-braquer au clavier.
    const accelLacet = (AVANT * forceLatAvant * cd - ARRIERE * forceLatArriere) / INERTIE_LACET
      - this.lacet * 1.4;
    this.accelAvant += (accelAvant - this.accelAvant) * Math.min(1, h * 12);
    this.accelCote += (accelCote - this.accelCote) * Math.min(1, h * 12);

    // Repère tournant : la rotation de la caisse échange vitesse avant et
    // vitesse latérale.
    this.vAvant += (accelAvant + this.vCote * this.lacet) * h;
    this.vCote += (accelCote - this.vAvant * this.lacet) * h;
    this.lacet += accelLacet * h;
    this.vAvant = Math.max(-11, Math.min(vMax + 2, this.vAvant));

    // Presque à l'arrêt, les pneus ne glissent plus : la dérive latérale et
    // le lacet résiduels s'éteignent, la voiture ne pivote pas sur place.
    const lent = Math.max(0, 1 - Math.abs(this.vAvant) / 3);
    if (lent > 0) {
      this.vCote *= Math.exp(-h * 9 * lent);
      const lacetRoulant = this.vAvant * Math.tan(d) / EMPATTEMENT;
      this.lacet += (lacetRoulant - this.lacet) * Math.min(1, h * 10 * lent);
    }
    this.heading += this.lacet * h;
    return deriveArriere;
  }

  // Avance la voiture d'un pas, en glissant le long des murs : si le
  // déplacement complet heurte un bâtiment, on essaie chaque axe séparément.
  // Renvoie la vitesse perdue dans le choc (0 sans contact). L'ancien
  // comportement, un rebond en arrière, collait la voiture au mur dès qu'on
  // le frôlait de biais.
  private deplacer(h: number): number {
    const p = this.root.position;
    const ax = Math.sin(this.heading), az = Math.cos(this.heading);
    const gx = Math.cos(this.heading), gz = -Math.sin(this.heading);
    const vx = ax * this.vAvant + gx * this.vCote;
    const vz = az * this.vAvant + gz * this.vCote;
    const nx = p.x + vx * h, nz = p.z + vz * h;
    this.lastX = p.x;
    this.lastZ = p.z;
    if (!this.world.collidesBuilding(nx, nz, 1.05)) {
      p.x = nx;
      p.z = nz;
      return 0;
    }
    const libreX = !this.world.collidesBuilding(nx, p.z, 1.05);
    const libreZ = !this.world.collidesBuilding(p.x, nz, 1.05);
    let rx = 0, rz = 0;
    if (libreX && (!libreZ || Math.abs(vx) >= Math.abs(vz))) { p.x = nx; rx = vx * .82; }
    else if (libreZ) { p.z = nz; rz = vz * .82; }
    // Vitesse restante (celle qui longe le mur, frottée), ramenée dans le
    // repère de la caisse. La composante perdue fait la force du choc.
    const perdue = Math.hypot(vx - rx, vz - rz);
    this.vAvant = rx * ax + rz * az;
    this.vCote = rx * gx + rz * gz;
    this.lacet *= .5;
    return perdue;
  }

  reset(): void {
    this.arreter();
    this.heading = this.start.heading;
    this.root.position.set(this.start.x, this.world.surfaceY(this.start.x, this.start.z), this.start.z);
    this.root.rotation.set(0, this.heading, 0);
  }

  arreter(): void {
    this.vAvant = 0;
    this.vCote = 0;
    this.lacet = 0;
    this.accelAvant = 0;
    this.accelCote = 0;
    this.steering = 0;
    this.boosting = false;
    this.drifting = false;
  }

  hitTraffic(): void {
    this.impact = Math.max(this.impact, this.vitesseSol);
    this.vAvant *= -.22;
    this.vCote *= .3;
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
