import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as clonerSquelette } from 'three/addons/utils/SkeletonUtils.js';

// Personnages animés : le joueur à pied et les passants proches de lui.
//
// Modèle : « Animated Human » de Quaternius (CC0), converti par
// scripts/blender/personnage.py. Un maillage de 1 578 polygones sur un
// squelette de 41 os, avec six animations (repos, marche, course, saut,
// coup, chute). Ses tenues sont de petites palettes de couleurs : changer
// d'image change les vêtements et la carnation.
//
// Un maillage à squelette ne s'instancie pas : chaque personnage animé est
// un appel de dessin et 41 os à mettre à jour. La ville compte 110 passants.
// Seuls les plus proches du joueur prennent donc ce modèle ; au-delà de
// 45 m, ils restent les silhouettes instanciées de pedestrians.js, que l'on
// ne distingue plus d'un personnage animé à cette distance.

const TAILLE = 1.76;
const TENUES = ['lightskin', 'darkskin1', 'lightskin2', 'darkskin', 'lightskin1', 'darkskin2'];
// Vitesse à laquelle chaque animation a été dessinée : la cadence est
// réglée dessus, sinon les pieds patinent.
const ALLURE_MARCHE = 1.45;
const ALLURE_COURSE = 5.2;

export interface ModeleHumain {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  tenues: THREE.Texture[];
  // Échelle et décalage qui mettent le modèle à 1,76 m, pieds au sol.
  echelle: number;
  pied: number;
}

export async function chargerHumain(): Promise<ModeleHumain | null> {
  try {
    const gltf = await new GLTFLoader().loadAsync('/models/personnages/humain.glb');
    const chargeur = new THREE.TextureLoader();
    const regler = <T extends THREE.Texture>(texture: T): T => {
      texture.colorSpace = THREE.SRGBColorSpace;
      // Le glTF a ses UV origine en haut. Palette de quelques pixels : pas
      // de filtrage, sinon les teintes bavent l'une sur l'autre.
      texture.flipY = false;
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      return texture;
    };
    const tenues: THREE.Texture[] = [];
    for (const nom of TENUES) {
      const origine = regler(await chargeur.loadAsync(`/models/personnages/tenue-${nom}.png`));
      tenues.push(origine);
      // Deux variantes par palette : les vêtements changent de teinte, la
      // peau et les cheveux restent. Six palettes pour 110 passants, deux
      // voisins portaient souvent le même maillot vert.
      for (const rotation of [140, 250]) tenues.push(regler(reteindre(origine.image as HTMLImageElement, rotation)));
    }
    gltf.scene.updateMatrixWorld(true);
    const boite = new THREE.Box3().setFromObject(gltf.scene);
    const echelle = TAILLE / (boite.max.y - boite.min.y);
    return { scene: gltf.scene, animations: gltf.animations, tenues, echelle, pied: -boite.min.y * echelle };
  } catch (erreur) {
    console.warn('Personnage animé indisponible, silhouettes procédurales :', erreur);
    return null;
  }
}

// Copie d'une palette où les couleurs VIVES tournent de `degres` sur le
// cercle des teintes. La peau et les cheveux (teintes entre le rouge et le
// jaune, de 5° à 50°) et les gris ne bougent pas.
function reteindre(image: HTMLImageElement, degres: number): THREE.CanvasTexture {
  const toile = document.createElement('canvas');
  toile.width = image.width;
  toile.height = image.height;
  const ctx = toile.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, toile.width, toile.height);
  const couleur = new THREE.Color();
  const tsl = { h: 0, s: 0, l: 0 };
  for (let i = 0; i < pixels.data.length; i += 4) {
    couleur.setRGB(pixels.data[i] / 255, pixels.data[i + 1] / 255, pixels.data[i + 2] / 255);
    couleur.getHSL(tsl);
    const teinte = tsl.h * 360;
    if (tsl.s < .2 || (teinte > 5 && teinte < 50)) continue;
    couleur.setHSL((tsl.h + degres / 360) % 1, tsl.s * .85, tsl.l);
    pixels.data[i] = Math.round(couleur.r * 255);
    pixels.data[i + 1] = Math.round(couleur.g * 255);
    pixels.data[i + 2] = Math.round(couleur.b * 255);
  }
  ctx.putImageData(pixels, 0, 0);
  return new THREE.CanvasTexture(toile);
}

type Allure = 'Idle' | 'Walk' | 'Run' | 'Death';

// Un personnage animé : une copie du modèle avec son propre squelette.
export class Figurant {
  readonly root = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private readonly materiau: THREE.MeshStandardMaterial;
  private courante: Allure = 'Idle';

  constructor(modele: ModeleHumain, tenue = 0) {
    const copie = clonerSquelette(modele.scene);
    copie.scale.setScalar(modele.echelle);
    copie.position.y = modele.pied;
    this.materiau = new THREE.MeshStandardMaterial({ map: modele.tenues[tenue % modele.tenues.length], roughness: .85 });
    copie.traverse((objet) => {
      const mesh = objet as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = this.materiau;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Le squelette déforme le maillage au-delà de sa boîte au repos.
      mesh.frustumCulled = false;
    });
    this.root.add(copie);
    this.mixer = new THREE.AnimationMixer(copie);
    for (const clip of modele.animations) {
      const action = this.mixer.clipAction(clip);
      if (clip.name === 'Death') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      this.actions.set(clip.name, action);
    }
    this.actions.get('Idle')?.play();
  }

  vetir(modele: ModeleHumain, tenue: number): void {
    this.materiau.map = modele.tenues[tenue % modele.tenues.length];
  }

  // Avance l'animation. `vitesse` en m/s ; `aTerre` joue la chute.
  animer(dt: number, vitesse: number, aTerre = false): void {
    const v = Math.abs(vitesse);
    const voulue: Allure = aTerre ? 'Death' : v < .25 ? 'Idle' : v < 3 ? 'Walk' : 'Run';
    if (voulue !== this.courante) {
      const avant = this.actions.get(this.courante), apres = this.actions.get(voulue);
      if (apres) {
        apres.reset().play();
        // Fondu d'un cinquième de seconde entre deux allures.
        if (avant) avant.crossFadeTo(apres, voulue === 'Death' ? .08 : .2, false);
        this.courante = voulue;
      }
    }
    const action = this.actions.get(this.courante);
    if (action) {
      action.timeScale = this.courante === 'Walk' ? Math.max(.5, v / ALLURE_MARCHE)
        : this.courante === 'Run' ? Math.max(.6, v / ALLURE_COURSE) : 1;
    }
    this.mixer.update(dt);
  }
}

// Passant de pedestrians.js, tel que la foule le lit et le masque.
interface Passant {
  _x?: number;
  _y?: number;
  _z?: number;
  _cap?: number;
  vitesse: number;
  etat: string;
  fuite?: number;
  chute?: number;
  masque?: boolean;
}

// Les passants proches du joueur, dessinés par des personnages animés.
export class Foule {
  private readonly figurants: Figurant[] = [];
  private readonly porte: Array<Passant | null> = [];
  private attente = 0;

  constructor(scene: THREE.Scene, private readonly modele: ModeleHumain, private readonly passants: Passant[], effectif = 14) {
    for (let i = 0; i < effectif; i++) {
      const figurant = new Figurant(modele, i);
      figurant.root.visible = false;
      scene.add(figurant.root);
      this.figurants.push(figurant);
      this.porte.push(null);
    }
  }

  update(dt: number, x: number, z: number): void {
    // Attribution revue trois fois par seconde : chaque figurant garde son
    // passant tant qu'il reste à moins de 55 m, les places libres vont aux
    // passants les plus proches à moins de 45 m.
    this.attente -= dt;
    if (this.attente <= 0) {
      this.attente = .33;
      const distance = (p: Passant): number => Math.hypot((p._x ?? 1e9) - x, (p._z ?? 1e9) - z);
      for (let i = 0; i < this.porte.length; i++) {
        const p = this.porte[i];
        if (p && distance(p) > 55) {
          p.masque = false;
          this.porte[i] = null;
          this.figurants[i].root.visible = false;
        }
      }
      const libres = this.porte.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
      if (libres.length) {
        const candidats = this.passants
          .map((p, rang) => ({ p, rang, d: distance(p) }))
          .filter((c) => !c.p.masque && c.d < 45)
          .sort((a, b) => a.d - b.d);
        for (const c of candidats) {
          const i = libres.shift();
          if (i == null) break;
          c.p.masque = true;
          this.porte[i] = c.p;
          // Tenue stable d'un passant à l'autre : tirée de son rang.
          this.figurants[i].vetir(this.modele, c.rang * 7);
          this.figurants[i].root.visible = true;
        }
      }
    }
    for (let i = 0; i < this.porte.length; i++) {
      const p = this.porte[i];
      if (!p || p._x == null) continue;
      const figurant = this.figurants[i];
      figurant.root.position.set(p._x, p._y ?? 0, p._z ?? 0);
      figurant.root.rotation.y = p._cap ?? 0;
      const aTerre = (p.chute ?? 0) > .85;
      const allure = p.etat === 'discute' ? 0 : p.vitesse * ((p.fuite ?? 0) > 0 ? 3.2 : 1);
      figurant.animer(dt, allure, aTerre);
    }
  }
}
