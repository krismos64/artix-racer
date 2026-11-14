import * as THREE from 'three/webgpu';
import { ARTIX_PLACES } from './lieux';
import type { Point2, RoadData } from './types';

// Missions de livraison, en balade libre (touche G).
//
// Une course envoie le joueur vers un lieu-dit d'Artix à plus de 250 m, en
// temps limité. Il s'y rend comme il veut : sa voiture, une autre, à pied.
// Chaque course réussie enchaîne sur la suivante avec une prime en hausse ;
// un échec remet la série à zéro. La destination est un faisceau de lumière
// visible par-dessus les toits, doublé d'un point sur la minicarte.

const INTITULES = ['Livraison de pain', 'Colis express', 'Course pressée', 'Pièces détachées', 'Commande à livrer'];
// Allure de référence pour fixer le temps accordé : 27 km/h de moyenne,
// virages et circulation compris, plus 15 s de mise en route.
const ALLURE = 7.5;
const MARGE = 15;
const RAYON_ARRIVEE = 8;

export type EvenementMission =
  | { type: 'livre'; gain: number; serie: number; lieu: string }
  | { type: 'echec' }
  | null;

export class Missions {
  private readonly faisceau: THREE.Group;
  private readonly colonne: THREE.Mesh;
  private destination: { x: number; z: number; nom: string } | null = null;
  private distance = 0;
  private accorde = 0;
  private restant = 0;
  private serie = 0;
  private numero = 0;
  private temps = 0;

  constructor(
    scene: THREE.Scene,
    private readonly roads: RoadData[],
    private readonly surfaceY: (x: number, z: number) => number,
  ) {
    // Faisceau : colonne de 140 m en mélange additif, sans brouillard pour
    // rester visible de loin, et un anneau au sol qui marque la zone d'arrêt.
    const lumiere = new THREE.MeshBasicMaterial({
      color: 0xffb41f, transparent: true, opacity: .5, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const colonne = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 3.2, 140, 20, 1, true), lumiere);
    colonne.position.y = 70;
    this.colonne = colonne;
    const anneau = new THREE.Mesh(new THREE.TorusGeometry(RAYON_ARRIVEE, .22, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc94a, fog: false }));
    anneau.rotation.x = Math.PI / 2;
    anneau.position.y = .35;
    this.faisceau = new THREE.Group();
    this.faisceau.name = 'mission-destination';
    this.faisceau.add(colonne, anneau);
    this.faisceau.visible = false;
    scene.add(this.faisceau);
  }

  get active(): boolean {
    return this.destination !== null;
  }

  // Secondes restantes de la course en cours (0 sans course).
  get tempsRestant(): number {
    return this.destination ? Math.max(0, this.restant) : 0;
  }

  // Point visé, pour la minicarte.
  get objectif(): Point2 | null {
    return this.destination ? [this.destination.x, this.destination.z] : null;
  }

  // Lignes du bandeau de mission.
  statut(x: number, z: number): { titre: string; detail: string; progression: number } | null {
    if (!this.destination) return null;
    const reste = Math.hypot(this.destination.x - x, this.destination.z - z);
    return {
      titre: `${INTITULES[this.numero % INTITULES.length].toUpperCase()}${this.serie ? ` · SÉRIE ×${this.serie + 1}` : ''}`,
      detail: `${this.destination.nom} · ${Math.round(reste)} m · ${Math.ceil(this.restant)} s`,
      progression: 1 - Math.min(1, reste / this.distance),
    };
  }

  // Lance une course depuis (x, z), ou abandonne celle en cours.
  basculer(x: number, z: number): boolean {
    if (this.destination) {
      this.arreter();
      this.serie = 0;
      return false;
    }
    this.lancer(x, z);
    return this.active;
  }

  arreter(): void {
    this.destination = null;
    this.faisceau.visible = false;
  }

  private lancer(x: number, z: number): void {
    // Lieux à plus de 250 m, sinon la course se boucle en dix secondes. La
    // zone d'activités, à 1,3 km du bourg, ne sort que pour une série lancée.
    const candidats = ARTIX_PLACES.filter((lieu) => {
      const d = Math.hypot(lieu.x - x, lieu.z - z);
      return d > 250 && (d < 900 || this.serie >= 2) && lieu.name !== this.destination?.nom;
    });
    if (!candidats.length) return;
    const lieu = candidats[Math.floor(Math.random() * candidats.length)];
    // Le lieu-dit est le centre d'un bâtiment : la livraison se fait sur la
    // chaussée la plus proche, sinon le faisceau tombe dans un mur.
    const [px, pz] = this.chausseeProche(lieu.x, lieu.z);
    this.destination = { x: px, z: pz, nom: lieu.name };
    this.distance = Math.hypot(px - x, pz - z);
    this.accorde = this.distance / ALLURE + MARGE;
    this.restant = this.accorde;
    this.numero++;
    this.faisceau.position.set(px, this.surfaceY(px, pz), pz);
    this.faisceau.visible = true;
  }

  private chausseeProche(x: number, z: number): Point2 {
    let meilleur: Point2 = [x, z], distance = Infinity;
    for (const route of this.roads) {
      if (!route.drivable || route.kind === 'track') continue;
      for (const [px, pz] of route.pts) {
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < distance) { distance = d; meilleur = [px, pz]; }
      }
    }
    return meilleur;
  }

  update(dt: number, x: number, z: number, vitesse: number): EvenementMission {
    if (!this.destination) return null;
    this.temps += dt;
    this.restant -= dt;
    const reste = Math.hypot(this.destination.x - x, this.destination.z - z);
    // Le faisceau respire, et s'élargit avec la distance : à 700 m, une
    // colonne de 3 m de large ne faisait plus qu'un trait d'un pixel.
    const largeur = Math.max(1, reste / 110) * (1 + Math.sin(this.temps * 3) * .06);
    this.colonne.scale.set(largeur, 1, largeur);
    // Livré : dans l'anneau ET presque à l'arrêt (moins de 22 km/h). Passer
    // en trombe ne dépose rien.
    if (reste < RAYON_ARRIVEE && Math.abs(vitesse) < 6) {
      const gain = Math.round((1500 + this.distance * 4 + Math.max(0, this.restant) * 40) * (1 + this.serie * .25));
      const lieu = this.destination.nom;
      this.serie++;
      this.arreter();
      // La course suivante part du point de livraison.
      this.lancer(x, z);
      return { type: 'livre', gain, serie: this.serie, lieu };
    }
    if (this.restant <= 0) {
      this.arreter();
      this.serie = 0;
      return { type: 'echec' };
    }
    return null;
  }
}
