// Profils graphiques et résolution dynamique.
//
// Les réglages de rendu étaient dispersés en constantes dans main.js et
// streetlights.js. Ce module les regroupe pour qu'un profil les fixe tous de
// façon cohérente, plutôt que de laisser le joueur ajuster dix curseurs sans
// savoir lequel pèse.
//
// Un changement de profil ne reconstruit pas la ville : il n'agit que sur des
// réglages du renderer, des passes d'écran et des seuils de distance.

// Trois profils. Les valeurs de « Équilibré » reprennent exactement celles qui
// étaient en dur avant ce chantier : le comportement par défaut du jeu reste
// donc identique à ce qu'il était.
export const PROFILS = {
  performance: {
    nom: 'Performance',
    pixelRatioMax: 1.0,
    gtaoEchelle: 0.5,
    ombres: false,
    ombreCarte: 1024,
    brouillardProche: 200,
    brouillardLoin: 700,
    lampesCalculees: 8,
    passants: 70,
    smaa: false,
    // Distance au-delà de laquelle les petits objets ne sont plus affichés.
    distanceDetails: 220,
  },
  equilibre: {
    nom: 'Équilibré',
    pixelRatioMax: 1.5,
    gtaoEchelle: 0.5,
    ombres: true,
    ombreCarte: 2048,
    brouillardProche: 320,
    brouillardLoin: 1250,
    lampesCalculees: 20,
    passants: 140,
    smaa: true,
    distanceDetails: 400,
  },
  qualite: {
    nom: 'Qualité',
    pixelRatioMax: 2.0,
    gtaoEchelle: 0.75,
    ombres: true,
    ombreCarte: 2048,
    brouillardProche: 420,
    brouillardLoin: 1600,
    lampesCalculees: 28,
    passants: 180,
    smaa: true,
    distanceDetails: 650,
  },
};

// Profil retenu par défaut.
export const PROFIL_DEFAUT = 'equilibre';

export class Qualite {
  // `cibles` rassemble les objets sur lesquels un profil agit. Ils sont
  // fournis par main.js plutôt que cherchés ici : ce module ne connaît pas la
  // structure de la scène.
  constructor(cibles, profil = PROFIL_DEFAUT) {
    this.cibles = cibles;
    this.nomProfil = profil;
    this.profil = PROFILS[profil] ?? PROFILS[PROFIL_DEFAUT];

    // Facteur de résolution dynamique, appliqué par-dessus le pixel ratio du
    // profil. 1 = pleine résolution du profil.
    this.facteur = 1;
    this.autoResolution = true;

    // Moyenne glissante du temps de frame. Une seule frame longue ne doit pas
    // déclencher de baisse : c'est la tendance qui compte.
    this.moyenneMs = 16.7;
    this.dernierChangement = 0;
  }

  // Applique le profil courant. Appelé au démarrage et à chaque changement.
  appliquer() {
    const p = this.profil;
    const c = this.cibles;

    if (c.renderer) {
      c.renderer.setPixelRatio(Math.min(devicePixelRatio, p.pixelRatioMax * this.facteur));
      c.renderer.shadowMap.enabled = p.ombres;
      if (c.soleil) c.soleil.shadow.mapSize.set(p.ombreCarte, p.ombreCarte);
    }
    if (c.scene?.fog) {
      c.scene.fog.near = p.brouillardProche;
      c.scene.fog.far = p.brouillardLoin;
    }
    if (c.eclairage) c.eclairage.setPool?.(p.lampesCalculees);
    if (c.smaa) c.smaa.enabled = p.smaa;
    if (c.majGtao) c.majGtao(p.gtaoEchelle);
    if (c.onProfil) c.onProfil(p);
  }

  // Bascule vers un autre profil sans reconstruire la scène.
  choisir(nom) {
    if (!PROFILS[nom]) return this.nomProfil;
    this.nomProfil = nom;
    this.profil = PROFILS[nom];
    // Un changement manuel repart d'une résolution pleine : sinon le profil
    // choisi paraît flou sans que rien ne l'explique.
    this.facteur = 1;
    this.appliquer();
    return nom;
  }

  // Fait défiler les profils, pour une bascule au clavier.
  suivant() {
    const noms = Object.keys(PROFILS);
    const i = noms.indexOf(this.nomProfil);
    return this.choisir(noms[(i + 1) % noms.length]);
  }
}

// --- Résolution dynamique ---------------------------------------------------
//
// Le principe : si le temps de frame reste durablement au-dessus du budget, on
// rend dans moins de pixels ; si la marge revient, on remonte. Tout l'enjeu est
// d'éviter l'oscillation, une image qui change de netteté en permanence étant
// plus gênante qu'une image un peu douce mais stable.
//
// Trois garde-fous pour cela :
//   - une moyenne glissante, pour qu'une frame isolée ne déclenche rien
//   - deux seuils distincts (descente et remontée), l'écart entre les deux
//     formant l'hystérésis
//   - un délai minimal entre deux ajustements
Object.assign(Qualite.prototype, {
  // Budget visé : 16,7 ms pour 60 images par seconde.
  BUDGET_MS: 16.7,
  // Au-dessus de ce seuil, on baisse. En dessous du second, on remonte.
  // L'écart entre les deux est l'hystérésis : sans lui, le système se remet à
  // baisser dès qu'il vient de remonter, et la netteté bat en permanence.
  SEUIL_BAISSE: 19.5,
  SEUIL_HAUSSE: 14.5,
  // Bornes du facteur. Le plancher est volontairement haut : en dessous de
  // 0,7, le rendu devient franchement flou et le gain ne le justifie plus.
  FACTEUR_MIN: 0.7,
  FACTEUR_MAX: 1.0,
  // Pas d'ajustement. La descente est plus franche que la remontée : on veut
  // récupérer vite quand ça rame, et revenir lentement pour ne pas rebasculer.
  PAS_BAISSE: 0.1,
  PAS_HAUSSE: 0.05,
  // Délai minimal entre deux ajustements, en secondes.
  DELAI_S: 1.5,

  // À appeler une fois par frame avec le temps de la frame écoulée.
  tick(dtMs, tempsS) {
    if (!this.autoResolution) return false;
    // Moyenne glissante : environ une seconde de mémoire à 60 fps.
    this.moyenneMs += (dtMs - this.moyenneMs) * 0.05;
    if (tempsS - this.dernierChangement < this.DELAI_S) return false;

    const avant = this.facteur;
    if (this.moyenneMs > this.SEUIL_BAISSE) {
      this.facteur = Math.max(this.FACTEUR_MIN, this.facteur - this.PAS_BAISSE);
    } else if (this.moyenneMs < this.SEUIL_HAUSSE) {
      this.facteur = Math.min(this.FACTEUR_MAX, this.facteur + this.PAS_HAUSSE);
    }
    if (this.facteur === avant) return false;

    this.dernierChangement = tempsS;
    const r = this.cibles.renderer;
    if (r) {
      r.setPixelRatio(Math.min(devicePixelRatio, this.profil.pixelRatioMax * this.facteur));
      // Les passes d'écran allouent leurs cibles d'après le pixel ratio : sans
      // ce rappel, elles resteraient dimensionnées pour l'ancienne résolution.
      this.cibles.onResolution?.();
    }
    return true;
  },

  // Le joueur peut couper l'ajustement automatique : la résolution revient
  // alors à celle du profil.
  setAuto(on) {
    this.autoResolution = on;
    if (!on && this.facteur !== 1) {
      this.facteur = 1;
      this.cibles.renderer?.setPixelRatio(
        Math.min(devicePixelRatio, this.profil.pixelRatioMax));
      this.cibles.onResolution?.();
    }
    return this.autoResolution;
  },
});
