import * as THREE from 'three/webgpu';
import type { ArcadeCar } from './car';
import type { ArtixWorld } from './world';

// Fumée de pneus en dérapage et poussière hors-piste. Un seul maillage de
// quads pour les deux roues arrière et les deux matières, soit UN appel de
// dessin quand il émet, aucun sinon : le coût du jeu est le nombre d'appels.
// L'émetteur alterne d'une roue à l'autre à chaque image, ce qui trace les
// deux traînées.
//
// Three n'a pas de système de particules : les 600 bouffées sont simulées
// ici et leurs quads orientés face caméra sur le processeur (2 400 sommets,
// négligeable). Chaque particule fige à sa NAISSANCE sa couleur, sa taille,
// sa durée de vie et sa direction : changer de matière en cours de route ne
// recolore pas les bouffées déjà émises.
//
// Sprite : bouffée générée par Codex sur fond noir, transparence tirée de la
// luminance, 256 px. La matière vient du canal alpha, la teinte des couleurs
// de sommet.

// Roues arrière de la 458 dans le repère LOCAL du châssis (+Z avant) : voie
// de ±0,84 m, essieu à 1,3 m derrière le centre.
const ROUES = [new THREE.Vector3(.84, 0, -1.3), new THREE.Vector3(-.84, 0, -1.3)];
const CAPACITE = 600;
// La bouffée gonfle en se dissipant : 1 → 3,5 fois sa taille de départ.
const GONFLEMENT = 2.5;
const POUSSEE_VERTICALE = .35;

type Matiere = 'fumee' | 'poussiere';

interface Reglage {
  couleur1: [number, number, number, number];
  couleur2: [number, number, number, number];
  morte: [number, number, number];
  vie: [number, number];
  taille: [number, number];
  monteeMin: number;
  monteeMax: number;
  // Centre de la bouffée au-dessus du sol : au moins la moitié de la taille
  // de départ, sinon sa moitié basse passe sous la chaussée.
  hauteur: number;
}

const REGLAGES: Record<Matiere, Reglage> = {
  fumee: {
    couleur1: [.92, .92, .94, .26],
    couleur2: [.82, .83, .86, .18],
    morte: [.8, .8, .84],
    vie: [1.1, 2.2],
    taille: [.9, 1.5],
    monteeMin: .4,
    monteeMax: 1.1,
    hauteur: .45,
  },
  // Terre sèche du Béarn, brun ocre. Bouffées plus larges, plus longues et
  // plus basses que la fumée, et plus opaques : à 0,3 sur l'herbe sombre, la
  // traînée se réduisait à des volutes à peine lisibles.
  poussiere: {
    couleur1: [.72, .6, .44, .45],
    couleur2: [.6, .5, .36, .34],
    morte: [.66, .58, .46],
    vie: [1.6, 2.8],
    taille: [1.2, 2],
    monteeMin: .1,
    monteeMax: .45,
    hauteur: .75,
  },
};

const hasard = (min: number, max: number): number => min + Math.random() * (max - min);

export class FumeePneus {
  private readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly couleurs: Float32Array;
  // Par particule : x, y, z, vx, vy, vz, âge, vie, taille, angle, rotation.
  private readonly etat = new Float32Array(CAPACITE * 11);
  // Par particule : couleur de naissance (rgba) puis couleur morte (rgb).
  private readonly teintes = new Float32Array(CAPACITE * 7);
  private vivantes = 0;
  private reste = 0;
  private roue = 0;
  private readonly emetteur = new THREE.Vector3();
  private readonly droite = new THREE.Vector3();
  private readonly haut = new THREE.Vector3();

  constructor(scene: THREE.Scene, private readonly camera: THREE.Camera) {
    this.positions = new Float32Array(CAPACITE * 12);
    this.couleurs = new Float32Array(CAPACITE * 16);
    const uv = new Float32Array(CAPACITE * 8);
    const indices = new Uint16Array(CAPACITE * 6);
    for (let i = 0; i < CAPACITE; i++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
      const k = i * 4;
      indices.set([k, k + 1, k + 2, k, k + 2, k + 3], i * 6);
    }
    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometrie.setAttribute('color', new THREE.BufferAttribute(this.couleurs, 4).setUsage(THREE.DynamicDrawUsage));
    geometrie.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometrie.setIndex(new THREE.BufferAttribute(indices, 1));
    geometrie.setDrawRange(0, 0);
    const materiau = new THREE.MeshBasicMaterial({
      map: new THREE.TextureLoader().load('/textures/fumee.png'),
      transparent: true, depthWrite: false, vertexColors: true,
    });
    this.mesh = new THREE.Mesh(geometrie, materiau);
    this.mesh.name = 'fumee-pneus';
    // Les bouffées suivent la voiture : la sphère englobante serait fausse.
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  update(dt: number, car: ArcadeCar, world: ArtixWorld, nuit: boolean): void {
    const vitesse = Math.abs(car.speed);
    // Poussière dès 18 km/h sur la terre, dérapage ou pas. Sur un sol minéral
    // hors chaussée (place pavée, parking), pas de terre à soulever : fumée
    // en dérapage seulement, comme sur la route.
    const terre = !car.onRoad && !world.estMineral(car.root.position.x, car.root.position.z);
    const matiere: Matiere | null = terre ? (vitesse > 5 ? 'poussiere' : null)
      : car.drifting && vitesse > 8 ? 'fumee' : null;

    if (matiere) {
      // Débit proportionnel à la vitesse. Fumée : 90 particules/s à 29 km/h,
      // 250 à 180 km/h (à 60 par seconde la traînée se lisait comme une file
      // de boules). Poussière : 50 à 18 km/h, 110 à 65 km/h.
      const debit = matiere === 'fumee' ? 60 + vitesse * 3.8 : 30 + vitesse * 4.5;
      this.roue = 1 - this.roue;
      car.versMonde(ROUES[this.roue], this.emetteur).add(car.root.position);
      this.emetteur.y += REGLAGES[matiere].hauteur;
      this.reste += debit * dt;
      while (this.reste >= 1) {
        this.reste -= 1;
        this.emettre(REGLAGES[matiere], nuit);
      }
    } else this.reste = 0;

    if (!this.vivantes) {
      this.mesh.visible = false;
      return;
    }
    this.simuler(dt);
  }

  private emettre(r: Reglage, nuit: boolean): void {
    if (this.vivantes >= CAPACITE) return;
    const i = this.vivantes++;
    const e = i * 11, t = i * 7;
    this.etat[e] = this.emetteur.x + hasard(-.25, .25);
    this.etat[e + 1] = this.emetteur.y + hasard(0, .1);
    this.etat[e + 2] = this.emetteur.z + hasard(-.25, .25);
    // Dispersion latérale ; la montée dépend de la matière.
    const elan = hasard(.4, 1.2);
    this.etat[e + 3] = hasard(-.6, .6) * elan;
    this.etat[e + 4] = hasard(r.monteeMin, r.monteeMax) * elan;
    this.etat[e + 5] = hasard(-.6, .6) * elan;
    this.etat[e + 6] = 0;
    this.etat[e + 7] = hasard(r.vie[0], r.vie[1]);
    this.etat[e + 8] = hasard(r.taille[0], r.taille[1]);
    this.etat[e + 9] = hasard(0, Math.PI * 2);
    this.etat[e + 10] = hasard(-.8, .8);
    // Les particules ne sont pas éclairées : une fumée blanche pleine
    // luminance brillerait comme un néon la nuit. Teinte divisée par 3,3.
    const k = nuit ? .3 : 1, m = Math.random();
    for (let c = 0; c < 3; c++) {
      this.teintes[t + c] = (r.couleur1[c] + (r.couleur2[c] - r.couleur1[c]) * m) * k;
      this.teintes[t + 4 + c] = r.morte[c] * k;
    }
    this.teintes[t + 3] = r.couleur1[3] + (r.couleur2[3] - r.couleur1[3]) * m;
  }

  private simuler(dt: number): void {
    this.droite.setFromMatrixColumn(this.camera.matrixWorld, 0);
    this.haut.setFromMatrixColumn(this.camera.matrixWorld, 1);
    const { etat, teintes, positions, couleurs, droite: d, haut: h } = this;
    for (let i = 0; i < this.vivantes; i++) {
      const e = i * 11;
      etat[e + 6] += dt;
      if (etat[e + 6] >= etat[e + 7]) {
        // Particule morte : la dernière vivante prend sa place.
        const dernier = --this.vivantes;
        etat.copyWithin(e, dernier * 11, dernier * 11 + 11);
        teintes.copyWithin(i * 7, dernier * 7, dernier * 7 + 7);
        i--;
        continue;
      }
      etat[e + 4] += POUSSEE_VERTICALE * dt;
      etat[e] += etat[e + 3] * dt;
      etat[e + 1] += etat[e + 4] * dt;
      etat[e + 2] += etat[e + 5] * dt;
      etat[e + 9] += etat[e + 10] * dt;

      const age = etat[e + 6] / etat[e + 7];
      const demi = etat[e + 8] * (1 + GONFLEMENT * age) * .5;
      const cos = Math.cos(etat[e + 9]) * demi, sin = Math.sin(etat[e + 9]) * demi;
      // Axes du quad : repère caméra tourné de l'angle de la particule.
      const ax = d.x * cos + h.x * sin, ay = d.y * cos + h.y * sin, az = d.z * cos + h.z * sin;
      const bx = h.x * cos - d.x * sin, by = h.y * cos - d.y * sin, bz = h.z * cos - d.z * sin;
      const x = etat[e], y = etat[e + 1], z = etat[e + 2];
      const p = i * 12;
      positions[p] = x - ax - bx; positions[p + 1] = y - ay - by; positions[p + 2] = z - az - bz;
      positions[p + 3] = x + ax - bx; positions[p + 4] = y + ay - by; positions[p + 5] = z + az - bz;
      positions[p + 6] = x + ax + bx; positions[p + 7] = y + ay + by; positions[p + 8] = z + az + bz;
      positions[p + 9] = x - ax + bx; positions[p + 10] = y - ay + by; positions[p + 11] = z - az + bz;

      const t = i * 7;
      const r = teintes[t] + (teintes[t + 4] - teintes[t]) * age;
      const g = teintes[t + 1] + (teintes[t + 5] - teintes[t + 1]) * age;
      const b = teintes[t + 2] + (teintes[t + 6] - teintes[t + 2]) * age;
      const a = teintes[t + 3] * (1 - age);
      for (let s = 0; s < 4; s++) {
        const c = i * 16 + s * 4;
        couleurs[c] = r; couleurs[c + 1] = g; couleurs[c + 2] = b; couleurs[c + 3] = a;
      }
    }
    const geometrie = this.mesh.geometry;
    geometrie.setDrawRange(0, this.vivantes * 6);
    geometrie.attributes.position.needsUpdate = true;
    geometrie.attributes.color.needsUpdate = true;
    this.mesh.visible = this.vivantes > 0;
  }
}
