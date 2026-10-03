import { Vector3, type DefaultRenderingPipeline, type UniversalCamera } from '@babylonjs/core';
import type { ArcadeCar } from './car';
import type { GameMode, GameSession } from './game';

// Motion design arcade : tout ce qui fait SENTIR la vitesse et les actions
// sans toucher à la scène 3D. Le coût dominant du jeu est le nombre d'appels
// de dessin (84 % de l'image, mesuré le 4 septembre 2026) : aucun effet ici
// n'en ajoute. La caméra (champ, secousse) et deux réglages du pipeline déjà
// en place font le travail côté rendu ; le reste est une couche DOM animée
// en CSS (transform et opacity, composités par le navigateur hors du canvas).

const FOV_BASE = 1.03;
// Ouverture gagnée entre 36 et 198 km/h (10 → 55 m/s), puis sous nitro. Au
// total +0,19 rad (≈ 11°) : au-delà, les façades proches se déforment en
// bord d'image et la vitesse se lit comme un fish-eye.
const FOV_VITESSE = .1;
const FOV_NITRO = .09;
const ABERRATION_BASE = 6;

// Bruit de secousse : somme de sinus à fréquences non commensurables, assez
// irrégulière pour ne jamais se lire comme une oscillation, et sans tirage
// aléatoire (une secousse aléatoire image par image vibre au lieu de cogner).
function bruit(t: number, graine: number): number {
  return Math.sin(t * 31.7 + graine) * .5 + Math.sin(t * 17.3 + graine * 2.1) * .3 + Math.sin(t * 53.1 + graine * 3.7) * .2;
}

function relancer(element: HTMLElement, classe: string): void {
  element.classList.remove(classe);
  void element.offsetWidth; // force le navigateur à oublier l'animation en cours
  element.classList.add(classe);
}

function creer(parent: HTMLElement, classe: string, texte = ''): HTMLElement {
  const element = document.createElement('div');
  element.className = classe;
  element.textContent = texte;
  parent.appendChild(element);
  return element;
}

export class MotionArcade {
  private readonly couche: HTMLElement;
  private readonly lignes: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly combo: HTMLElement;
  private readonly comboMultiplicateur: HTMLElement;
  private readonly comboPoints: HTMLElement;
  private readonly offset = new Vector3();
  private readonly cible = new Vector3();

  private temps = 0;
  // « Trauma » à la Squirrel Eiserloh : la secousse vaut trauma², un choc
  // léger reste discret et un choc franc cogne fort.
  private trauma = 0;
  private fov = FOV_BASE;
  private kickNitro = 0;
  private nitroAvant = false;
  private opaciteLignes = -1;
  private compte = 0;
  private dernierEntier = -1;
  private derapagePoints = 0;
  private derapageDuree = 0;
  private derapageRepos = 0;
  private boostClasse = false;

  constructor(
    private readonly camera: UniversalCamera,
    private readonly pipeline: DefaultRenderingPipeline,
    private readonly telemetrie: HTMLElement,
    private readonly scoreEl: HTMLElement,
  ) {
    this.couche = creer(document.body, 'arcade-fx');
    this.lignes = creer(this.couche, 'lignes-vitesse');
    this.flash = creer(this.couche, 'flash-impact');
    this.combo = creer(this.couche, 'combo');
    creer(this.combo, 'combo-titre', 'DÉRAPAGE');
    this.comboMultiplicateur = creer(this.combo, 'combo-multi');
    this.comboPoints = creer(this.combo, 'combo-points');
  }

  // Tant que le compte à rebours tourne, la voiture et le chrono restent figés.
  get fige(): boolean {
    return this.compte > 0;
  }

  demarrer(mode: GameMode): void {
    this.annulerDerapage();
    if (mode !== 'challenge') {
      this.compte = 0;
      this.banniere('C’EST PARTI', 'titre');
      return;
    }
    this.compte = 3;
    this.dernierEntier = -1;
  }

  update(dt: number, car: ArcadeCar, session: GameSession): void {
    const vitesse = Math.abs(car.speed);

    if (this.compte > 0) {
      this.compte = Math.max(0, this.compte - dt);
      const entier = Math.ceil(this.compte);
      if (entier !== this.dernierEntier) {
        this.dernierEntier = entier;
        this.banniere(entier > 0 ? String(entier) : 'GO !', entier > 0 ? 'compte' : 'go');
      }
    }

    // Chocs : secousse et flash proportionnels à la vitesse d'impact. Un
    // frottement à 5 m/s ne doit presque rien faire, un mur à 50 m/s tout.
    if (car.impact > 0) {
      const force = Math.min(1, car.impact / 30);
      if (force > .08) {
        this.trauma = Math.min(1, this.trauma + .25 + force * .75);
        this.flash.style.setProperty('--force', (.25 + force * .6).toFixed(2));
        relancer(this.flash, 'choc');
        if (this.derapagePoints > 0) {
          this.points('COMBO PERDU', 'rate');
          this.annulerDerapage();
        }
      }
      car.impact = 0;
    }

    // Combo de dérapage : le multiplicateur monte d'un cran toutes les 1,2 s
    // de glisse continue, plafonné à ×5. Il est encaissé après 0,35 s de
    // reprise d'adhérence, perdu au premier choc.
    if (car.drifting && car.onRoad && !this.fige) {
      this.derapageDuree += dt;
      this.derapageRepos = 0;
      const multi = this.multiplicateur();
      this.derapagePoints += vitesse * dt * 6 * multi;
      if (this.derapageDuree > .3) {
        this.combo.classList.add('actif');
        this.combo.dataset.palier = String(multi);
        this.comboMultiplicateur.textContent = `×${multi}`;
        this.comboPoints.textContent = String(Math.round(this.derapagePoints));
      }
    } else if (this.derapagePoints > 0) {
      this.derapageRepos += dt;
      if (this.derapageRepos > .35) {
        const gain = Math.round(this.derapagePoints);
        if (this.derapageDuree > .3) {
          session.ajouterPoints(gain);
          this.points(`+${gain.toLocaleString('fr-FR')}`, 'derapage');
          relancer(this.scoreEl, 'gain');
        }
        this.annulerDerapage();
      }
    }

    for (const evenement of session.evenements.splice(0)) {
      if (evenement.type === 'checkpoint') {
        this.banniere(`CHECKPOINT ${evenement.rang}/${evenement.total}`, 'checkpoint');
        this.points(`+${Math.round(evenement.points).toLocaleString('fr-FR')}`, 'checkpoint');
        relancer(this.scoreEl, 'gain');
      } else {
        this.banniere('ARRIVÉE', 'go');
        if (evenement.record) setTimeout(() => this.banniere('NOUVEAU RECORD', 'record'), 1100);
      }
    }

    // Grondement continu : sous nitro et hors-piste à vitesse. Il fixe un
    // plancher de trauma au lieu de s'additionner, sinon il s'emballe.
    const grondement = car.boosting ? .32 : !car.onRoad ? Math.min(.3, vitesse / 60) : 0;
    this.trauma = Math.max(this.trauma, grondement);

    if (car.boosting && !this.nitroAvant) this.kickNitro = 1;
    this.nitroAvant = car.boosting;
    if (car.boosting !== this.boostClasse) {
      this.boostClasse = car.boosting;
      this.telemetrie.classList.toggle('nitro', car.boosting);
    }
    this.telemetrie.classList.toggle('rapide', vitesse > 44);

    // Lignes de vitesse : invisibles sous 108 km/h, nettes sous nitro.
    const lignes = Math.min(1, Math.max(0, (vitesse - 30) / 30)) * .22 + (car.boosting ? .3 : 0);
    if (Math.abs(lignes - this.opaciteLignes) > .02) {
      this.opaciteLignes = lignes;
      this.lignes.style.opacity = lignes.toFixed(2);
      // Animation coupée quand la couche est transparente : un calque plein
      // écran animé coûte du compositing même à opacité nulle.
      this.lignes.classList.toggle('actif', lignes > .02);
    }
  }

  // Applique la caméra calculée par la boucle de jeu, plus le champ dynamique
  // et la secousse. À appeler À LA PLACE de position.copyFrom + setTarget.
  cadrer(dt: number, car: ArcadeCar, position: Vector3, cible: Vector3, cameraMode: number): void {
    this.temps += dt;
    const vitesse = Math.abs(car.speed);
    const cabine = cameraMode === 1;
    // En vue conducteur, l'habitacle donne déjà l'échelle : moitié d'effet,
    // sinon le volant gonfle et dégonfle à chaque coup d'accélérateur.
    const dosage = cabine ? .5 : 1;

    this.kickNitro = Math.max(0, this.kickNitro - dt * 3);
    const fovVoulu = FOV_BASE + dosage * (
      FOV_VITESSE * Math.min(1, Math.max(0, (vitesse - 10) / 45))
      + (car.boosting ? FOV_NITRO : 0)
      + this.kickNitro * .05
    );
    this.fov += (fovVoulu - this.fov) * (1 - Math.exp(-dt * 4));
    this.camera.fov = this.fov;

    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    const s = this.trauma * this.trauma * dosage;
    // La secousse décale surtout la VISÉE (rotation perçue) et peu l'œil :
    // déplacer l'œil de 30 cm en vue extérieure fait traverser le capot.
    this.offset.set(bruit(this.temps, 1) * .08 * s, bruit(this.temps, 2) * .06 * s, bruit(this.temps, 3) * .08 * s);
    this.camera.position.copyFrom(position).addInPlace(this.offset);
    this.cible.set(
      cible.x + bruit(this.temps, 4) * .55 * s,
      cible.y + bruit(this.temps, 5) * .4 * s,
      cible.z + bruit(this.temps, 6) * .55 * s,
    );
    this.camera.setTarget(this.cible);

    if (this.pipeline.chromaticAberrationEnabled) {
      const v = Math.min(1, Math.max(0, (vitesse - 25) / 35));
      // Plafond ≈ 15 : à 34 (premier essai), chaque arête de façade et de
      // marquage se doublait d'un arc-en-ciel lisible à l'arrêt sur image.
      this.pipeline.chromaticAberration.aberrationAmount = ABERRATION_BASE + v * 3 + (car.boosting ? 5 : 0) + this.trauma * 12;
    }
  }

  private multiplicateur(): number {
    return Math.min(5, 1 + Math.floor(this.derapageDuree / 1.2));
  }

  private annulerDerapage(): void {
    this.derapagePoints = 0;
    this.derapageDuree = 0;
    this.derapageRepos = 0;
    this.combo.classList.remove('actif');
  }

  private banniere(texte: string, variante: string): void {
    const element = creer(this.couche, `banniere ${variante}`, texte);
    element.addEventListener('animationend', () => element.remove(), { once: true });
  }

  private points(texte: string, variante: string): void {
    const element = creer(this.couche, `points-volants ${variante}`, texte);
    element.addEventListener('animationend', () => element.remove(), { once: true });
  }
}
