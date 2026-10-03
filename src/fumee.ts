import { Color4, ParticleSystem, Scene, Texture, Vector3 } from '@babylonjs/core';
import type { ArcadeCar } from './car';
import type { ArtixWorld } from './world';

// Fumée de pneus en dérapage et poussière hors-piste. Un seul système de
// particules pour les deux roues arrière et les deux matières, soit UN appel
// de dessin quand il émet, aucun sinon : le coût du jeu est le nombre
// d'appels (84 % de l'image). L'émetteur alterne d'une roue à l'autre à
// chaque image, ce qui trace les deux traînées.
//
// Changer de matière en cours de route ne recolore pas les bouffées déjà
// émises : Babylon fige à la NAISSANCE de chaque particule sa couleur, son
// pas vers `colorDead` (thinParticleSystem.function.js), sa taille, sa durée
// de vie et sa direction. Seule la gravité est commune, d'où une poussière
// plus lourde obtenue par une poussée verticale plus faible.
//
// Sprite : bouffée générée par Codex sur fond noir, transparence tirée de la
// luminance (ImageMagick, niveaux 4 % à 80 %), 256 px. Couleur unie #eeeeee :
// la matière vient du canal alpha, la teinte des couleurs du système.

// Roues arrière de la 458 dans le repère LOCAL du châssis (+Z avant) : voie
// de ±0,84 m (`wheel_rl`/`wheel_rr` du modèle), essieu à 1,3 m derrière le
// centre. La hauteur d'émission dépend de la matière (REGLAGES.hauteur).
const ROUES = [new Vector3(.84, 0, -1.3), new Vector3(-.84, 0, -1.3)];

type Matiere = 'fumee' | 'poussiere';

interface Reglage {
  couleur1: [number, number, number, number];
  couleur2: [number, number, number, number];
  morte: [number, number, number];
  vie: [number, number];
  taille: [number, number];
  monteeMin: number;
  monteeMax: number;
  // Centre de la bouffée au-dessus du sol. Émise au ras du sol, sa moitié
  // basse passait sous la chaussée et ressortait en demi-dôme plat : il faut
  // au moins la moitié de la taille moyenne de départ.
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
  // Terre sèche du Béarn, brun ocre. Hors chaussée, Artix est surtout herbe
  // et jardins : une poussière plus sombre se perdrait sur le vert. Bouffées
  // plus larges, plus longues et plus basses que la fumée, qui monte.
  poussiere: {
    // Opacité plus haute que la fumée (0,45 contre 0,26) : à 0,3, sur
    // l'herbe sombre, la traînée se réduisait à des volutes à peine lisibles.
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

export class FumeePneus {
  private readonly systeme: ParticleSystem;
  private readonly emetteur = new Vector3();
  private readonly local = new Vector3();
  private roue = 0;
  private nuit = false;
  private matiere: Matiere = 'fumee';

  constructor(scene: Scene) {
    // 600 places : la fumée à 180 km/h émet 250 particules/s qui vivent
    // jusqu'à 2,2 s, soit 550 en vol. À 400, la traînée se trouait.
    const s = new ParticleSystem('fumee-pneus', 600, scene);
    s.particleTexture = new Texture('/textures/fumee.png', scene);
    s.emitter = this.emetteur;
    s.minEmitBox = new Vector3(-.25, 0, -.25);
    s.maxEmitBox = new Vector3(.25, .1, .25);
    s.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    // La bouffée gonfle en se dissipant : 1 → 3,5 fois sa taille de départ.
    s.addSizeGradient(0, 1);
    s.addSizeGradient(1, 3.5);
    s.minInitialRotation = 0;
    s.maxInitialRotation = Math.PI * 2;
    s.minAngularSpeed = -.8;
    s.maxAngularSpeed = .8;
    // Dispersion latérale ; la montée dépend de la matière (voir REGLAGES).
    s.direction1 = new Vector3(-.6, .4, -.6);
    s.direction2 = new Vector3(.6, 1.1, .6);
    s.minEmitPower = .4;
    s.maxEmitPower = 1.2;
    s.gravity = new Vector3(0, .35, 0);
    s.emitRate = 0;
    this.systeme = s;
    this.regler();
    s.start();
  }

  update(car: ArcadeCar, world: ArtixWorld, nuit: boolean): void {
    const vitesse = Math.abs(car.speed);
    // Poussière dès 18 km/h sur la terre, dérapage ou pas : la vitesse
    // plafonne à 65 km/h hors-piste (18 m/s), le seuil de la fumée (29 km/h)
    // n'aurait laissé qu'une fenêtre étroite. Sur un sol minéral hors
    // chaussée (place pavée, parking), pas de terre à soulever : il se
    // comporte comme la route, fumée en dérapage seulement.
    const terre = !car.onRoad && !world.estMineral(car.root.position.x, car.root.position.z);
    const matiere: Matiere | null = terre ? (vitesse > 5 ? 'poussiere' : null)
      : car.drifting && vitesse > 8 ? 'fumee' : null;
    if (!matiere) {
      this.systeme.emitRate = 0;
      return;
    }
    if (matiere !== this.matiere || nuit !== this.nuit) {
      this.matiere = matiere;
      this.nuit = nuit;
      this.regler();
    }
    // Débit proportionnel à la vitesse. Fumée : 90 particules/s à 29 km/h,
    // 250 à 180 km/h ; à 60 par seconde, la voiture avançait de 35 cm entre
    // deux bouffées d'une même roue et la traînée se lisait comme une file de
    // boules. Poussière : 50 à 18 km/h, 110 à 65 km/h, ses bouffées plus
    // larges se recouvrent avec moins de particules.
    this.systeme.emitRate = matiere === 'fumee' ? 60 + vitesse * 3.8 : 30 + vitesse * 4.5;
    this.roue = 1 - this.roue;
    car.root.getDirectionToRef(ROUES[this.roue], this.local);
    this.emetteur.copyFrom(car.root.position).addInPlace(this.local);
    this.emetteur.y += REGLAGES[matiere].hauteur;
  }

  // Les particules ne sont pas éclairées par la scène : une fumée blanche
  // pleine luminance brillerait comme un néon la nuit. Teinte divisée par
  // 3,3 sous la lune.
  private regler(): void {
    const r = REGLAGES[this.matiere];
    const k = this.nuit ? .3 : 1;
    const s = this.systeme;
    s.color1 = new Color4(r.couleur1[0] * k, r.couleur1[1] * k, r.couleur1[2] * k, r.couleur1[3]);
    s.color2 = new Color4(r.couleur2[0] * k, r.couleur2[1] * k, r.couleur2[2] * k, r.couleur2[3]);
    s.colorDead = new Color4(r.morte[0] * k, r.morte[1] * k, r.morte[2] * k, 0);
    [s.minLifeTime, s.maxLifeTime] = r.vie;
    [s.minSize, s.maxSize] = r.taille;
    s.direction1.y = r.monteeMin;
    s.direction2.y = r.monteeMax;
  }
}
