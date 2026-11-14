import * as THREE from 'three/webgpu';
import type { KeyboardInput } from './car';
import { Figurant, type ModeleHumain } from './foule';
import type { ArtixWorld } from './world';

// Le joueur à pied : un personnage articulé (hanches, genoux, épaules,
// coudes) animé par une marche calculée, sans fichier d'animation.
//
// Proportions d'un adulte de 1,72 m, mesurées depuis la plante des pieds :
// entrejambe 0,83, épaules 1,41, menton 1,50, crâne 1,72. Elles priment sur
// le détail : un rapport épaules/tête de 1,5 au lieu de 2,2 donne un bonhomme
// de neige. Chaque membre pivote à son ARTICULATION, sa géométrie décalée
// vers le bas : une capsule centrée sur l'épaule monterait dans le cou.
//
// Repère du personnage : +Z devant lui, comme la voiture. Une rotation X
// NÉGATIVE porte un membre pendant vers l'avant.

const MARCHE = 1.9;      // m/s, pas tranquille
const COURSE = 5.6;      // m/s, 20 km/h
const ROTATION = 2.6;    // rad/s au clavier
const RAYON = .32;       // encombrement au sol, pour les murs

function membre(rayon: number, longueur: number, materiau: THREE.Material): THREE.Mesh {
  // Capsule suspendue à son articulation : son sommet est à l'origine.
  const geometrie = new THREE.CapsuleGeometry(rayon, longueur - rayon * 2, 3, 8);
  geometrie.translate(0, -longueur / 2, 0);
  const mesh = new THREE.Mesh(geometrie, materiau);
  mesh.castShadow = true;
  return mesh;
}

export class Marcheur {
  readonly root = new THREE.Group();
  heading = 0;
  vitesse = 0;

  private readonly hanches: THREE.Group[] = [];
  private readonly genoux: THREE.Group[] = [];
  private readonly epaules: THREE.Group[] = [];
  private readonly coudes: THREE.Group[] = [];
  private readonly buste = new THREE.Group();
  private phase = 0;
  // Personnage animé, quand le modèle est chargé : il remplace l'assemblage
  // de capsules, qui reste le repli.
  private figurant: Figurant | null = null;

  // Nombre d'appuis au sol depuis le début : il augmente d'un à chaque pas,
  // le jeu s'en sert pour faire entendre la marche.
  get appuis(): number {
    return Math.floor(Math.abs(this.phase) / Math.PI);
  }
  private allure = 0;

  constructor(scene: THREE.Scene, private readonly world: ArtixWorld) {
    const peau = new THREE.MeshStandardMaterial({ color: 0xd9ae86, roughness: .75 });
    const veste = new THREE.MeshStandardMaterial({ color: 0x2f4a66, roughness: .85 });
    const jean = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: .9 });
    const cuir = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: .6 });
    const cheveux = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: .95 });
    const ombre = (mesh: THREE.Mesh): THREE.Mesh => { mesh.castShadow = true; return mesh; };
    const regard = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: .4 });

    // Buste : du bassin (0,83) aux épaules (1,41), plus large en haut, aplati
    // d'avant en arrière. Les épaules font 0,42 m de large, la tête 0,19.
    const torse = ombre(new THREE.Mesh(new THREE.CylinderGeometry(.205, .155, .56, 14), veste));
    torse.scale.z = .58;
    torse.position.y = 1.12;
    const carrure = ombre(new THREE.Mesh(new THREE.SphereGeometry(.205, 14, 8), veste));
    carrure.scale.set(1, .32, .58);
    carrure.position.y = 1.4;
    const bassin = ombre(new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), jean));
    bassin.scale.set(1, .55, .66);
    bassin.position.y = .86;
    const cou = new THREE.Mesh(new THREE.CylinderGeometry(.048, .055, .12, 10), peau);
    cou.position.y = 1.46;
    const tete = ombre(new THREE.Mesh(new THREE.SphereGeometry(.098, 16, 12), peau));
    tete.scale.set(.95, 1.18, 1.02);
    tete.position.y = 1.615;
    // Chevelure : calotte posée sur l'arrière et le dessus du crâne.
    const chevelure = new THREE.Mesh(
      new THREE.SphereGeometry(.104, 16, 10, 0, Math.PI * 2, 0, Math.PI * .56), cheveux);
    chevelure.scale.set(.97, 1.16, 1.06);
    chevelure.position.set(0, 1.625, -.012);
    chevelure.rotation.x = -.28;
    // Visage : deux yeux et l'arête du nez. À la distance de la caméra
    // d'épaule, c'est ce qui dit de quel côté regarde le personnage.
    const visage: THREE.Mesh[] = [];
    for (const cote of [1, -1]) {
      const oeil = new THREE.Mesh(new THREE.SphereGeometry(.011, 8, 6), regard);
      oeil.position.set(cote * .034, 1.632, .093);
      visage.push(oeil);
    }
    const nez = new THREE.Mesh(new THREE.ConeGeometry(.013, .04, 6), peau);
    nez.position.set(0, 1.605, .104);
    nez.rotation.x = .35;
    this.buste.add(torse, carrure, cou, tete, chevelure, nez, ...visage);

    for (const cote of [1, -1]) {
      // Bras : épaule à 1,39 m, coude 0,30 m plus bas, main au bout.
      const epaule = new THREE.Group();
      epaule.position.set(cote * .225, 1.39, 0);
      const coude = new THREE.Group();
      coude.position.y = -.29;
      const main = new THREE.Mesh(new THREE.SphereGeometry(.044, 8, 6), peau);
      main.position.y = -.285;
      coude.add(membre(.04, .27, veste), main);
      epaule.add(membre(.047, .31, veste), coude);
      this.buste.add(epaule);
      this.epaules.push(epaule);
      this.coudes.push(coude);

      // Jambe : hanche à 0,86 m, genou 0,43 m plus bas, pied au sol.
      const hanche = new THREE.Group();
      hanche.position.set(cote * .092, .86, 0);
      const genou = new THREE.Group();
      genou.position.y = -.42;
      const pied = ombre(new THREE.Mesh(new THREE.BoxGeometry(.095, .075, .25), cuir));
      pied.position.set(0, -.4, .06);
      genou.add(membre(.056, .41, jean), pied);
      hanche.add(membre(.072, .45, jean), genou);
      this.root.add(hanche);
      this.hanches.push(hanche);
      this.genoux.push(genou);
    }
    // Le buste pivote au BASSIN (0,86 m) : penché depuis les pieds, il se
    // détacherait des hanches en course.
    for (const piece of this.buste.children) piece.position.y -= .86;
    this.buste.position.y = .86;
    this.root.add(this.buste, bassin);
    this.root.name = 'joueur-a-pied';
    this.root.visible = false;
    scene.add(this.root);
  }

  // Remplace les capsules par le personnage animé (modèle Quaternius).
  adopter(modele: ModeleHumain): void {
    for (const piece of this.root.children) piece.visible = false;
    this.figurant = new Figurant(modele, 0);
    this.root.add(this.figurant.root);
  }

  // Pose le personnage en (x, z), tourné vers `cap`.
  placer(x: number, z: number, cap: number): void {
    this.root.position.set(x, this.world.surfaceY(x, z), z);
    this.heading = cap;
    this.root.rotation.y = cap;
    this.vitesse = 0;
    this.allure = 0;
  }

  update(dt: number, input: KeyboardInput): void {
    const avance = (input.down('z', 'w', 'arrowup', 'throttle') ? 1 : 0)
      - (input.down('s', 'arrowdown', 'reverse') ? 1 : 0);
    const tourne = (input.down('q', 'a', 'arrowleft', 'left') ? 1 : 0)
      - (input.down('d', 'arrowright', 'right') ? 1 : 0);
    const court = input.down('shift', 'boost');

    this.heading += tourne * ROTATION * dt;
    // On recule au pas, jamais en courant.
    const cible = avance > 0 ? (court ? COURSE : MARCHE) : avance < 0 ? -MARCHE * .6 : 0;
    this.vitesse += (cible - this.vitesse) * Math.min(1, dt * 8);

    // Glissement le long des murs : chaque axe est essayé séparément.
    const p = this.root.position;
    const dx = Math.sin(this.heading) * this.vitesse * dt;
    const dz = Math.cos(this.heading) * this.vitesse * dt;
    // Déjà pris dans un obstacle (descente de voiture dans une place
    // serrée) : on laisse sortir.
    if (!this.world.bloque(p.x + dx, p.z + dz, RAYON) || this.world.bloque(p.x, p.z, RAYON - .12)) { p.x += dx; p.z += dz; }
    else if (!this.world.bloque(p.x + dx, p.z, RAYON)) p.x += dx;
    else if (!this.world.bloque(p.x, p.z + dz, RAYON)) p.z += dz;
    else this.vitesse = 0;
    const sol = this.world.surfaceY(p.x, p.z);
    p.y += (sol - p.y) * Math.min(1, dt * 16);
    this.root.rotation.y = this.heading;

    this.animer(dt);
  }

  // Marche calculée. La phase avance avec la DISTANCE parcourue (une
  // foulée complète tous les 1,45 m au pas, 2,6 m en course), sinon les
  // pieds patinent. Jambes en opposition, bras opposés aux jambes.
  private animer(dt: number): void {
    const v = Math.abs(this.vitesse);
    const course = Math.min(1, Math.max(0, (v - MARCHE) / (COURSE - MARCHE)));
    this.allure += (Math.min(1, v / MARCHE) - this.allure) * Math.min(1, dt * 10);
    const foulee = 1.45 + course * 1.15;
    this.phase += (this.vitesse / foulee) * Math.PI * 2 * dt;
    if (this.figurant) {
      this.figurant.animer(dt, this.vitesse);
      return;
    }
    const amplitude = (.46 + course * .42) * this.allure;

    for (let i = 0; i < 2; i++) {
      const phi = this.phase + i * Math.PI;
      const balancier = Math.sin(phi);
      // Hanche : négatif = jambe vers l'avant.
      this.hanches[i].rotation.x = -balancier * amplitude;
      // Genou : il plie quand la jambe revient de l'arrière vers l'avant.
      const pli = Math.max(0, Math.sin(phi + 1.9));
      this.genoux[i].rotation.x = pli * (.75 + course * .7) * this.allure;
      // Bras opposé à la jambe du même côté ; coude plié en course.
      this.epaules[i].rotation.x = balancier * amplitude * (.7 + course * .5);
      this.epaules[i].rotation.z = (i === 0 ? 1 : -1) * .06;
      this.coudes[i].rotation.x = -(.18 + course * 1.15) * (.3 + .7 * this.allure);
    }
    // Le buste monte à chaque appui et penche vers l'avant en course.
    this.buste.position.y = .86 + Math.abs(Math.cos(this.phase)) * .028 * this.allure;
    this.buste.rotation.x = course * .16 * this.allure;
  }
}
