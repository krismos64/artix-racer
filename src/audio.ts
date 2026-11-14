// Bande-son du jeu, entièrement synthétisée (Web Audio), sauf la musique.
//
// Aucun fichier d'effet : chaque son est fabriqué à partir d'oscillateurs et
// de bruit filtré, puis réglé sur ce que fait réellement le jeu (régime du
// moteur tiré de la vitesse et du rapport, crissement tiré de la dérive des
// pneus, choc proportionné à la vitesse perdue). Trois familles :
//   - continus : moteur, pneus, vent, sirène, ambiance de la ville ;
//   - ponctuels : chocs, klaxon, pas, portière, signaux de mission ;
//   - musique : fichier diffusé au fil de l'eau.
//
// La musique passe par un élément <audio> plutôt que par `decodeAudioData` :
// le fichier pèse 8 Mo, que le décodage porterait en mémoire sous forme de
// PCM décompressé (plus de 80 Mo).
const MUSIQUE = '/audio/music1.mp3';

// Ce que le jeu fournit à chaque image.
export interface EtatSon {
  vitesse: number;      // m/s le long du cap
  pointe: number;       // vitesse de pointe du véhicule conduit (m/s)
  gaz: boolean;         // pédale enfoncée
  nitro: boolean;
  glisse: number;       // 0 à 1 : à quel point les pneus arrière dérapent
  surRoute: boolean;
  sport: boolean;       // moteur de sportive (huit cylindres, haut régime)
  lourd: boolean;       // utilitaire : moteur grave, peu de régime
  aPied: boolean;
  nuit: boolean;
  sirene: number;       // 0 à 1
  sirenePan: number;    // -1 (gauche) à 1 (droite)
  temps: number;        // horloge du jeu, en secondes
}

export type Signal = 'livre' | 'echec' | 'etoile' | 'arrete' | 'mission';

// Rapports de boîte : part de la vitesse de pointe atteinte en haut de
// chaque rapport. Le régime retombe à chaque passage, c'est ce qui fait
// entendre une accélération et non une sirène qui monte.
const RAPPORTS = [.17, .32, .49, .66, .83, 1.04];

export class ArcadeAudio {
  private context: AudioContext | null = null;
  private master!: GainNode;
  private analyseur!: AnalyserNode;
  private bruit!: AudioBuffer;
  private musique: HTMLAudioElement | null = null;
  private musiqueActive = true;

  // Moteur : trois oscillateurs accordés sur la fréquence d'allumage.
  private moteurOsc: OscillatorNode[] = [];
  private moteurGain!: GainNode;
  private moteurFiltre!: BiquadFilterNode;
  private turboGain!: GainNode;
  private rapport = 0;
  private regime = .2;
  // Pneus, roulement, vent : du bruit filtré dont on règle volume et timbre.
  private crissementGain!: GainNode;
  private crissementFiltre!: BiquadFilterNode;
  private roulementGain!: GainNode;
  private roulementFiltre!: BiquadFilterNode;
  private ventGain!: GainNode;
  // Sirène deux-tons, placée à gauche ou à droite.
  private sireneOsc!: OscillatorNode;
  private sireneGain!: GainNode;
  private sirenePan!: StereoPannerNode;
  // Ambiance : prochain chant d'oiseau ou grillon, en secondes de jeu.
  private prochainAmbiance = 2;

  constructor() {
    const unlock = () => this.start();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
    // M coupe et relance la musique.
    addEventListener('keydown', (event) => {
      if (event.code === 'KeyM') this.toggleMusique();
    });
  }

  toggleMusique(): boolean {
    this.musiqueActive = !this.musiqueActive;
    if (this.musique) {
      if (this.musiqueActive) void this.musique.play().catch(() => {});
      else this.musique.pause();
    }
    return this.musiqueActive;
  }

  // Niveau de sortie mesuré (efficace et crête, de 0 à 1) : sert à vérifier
  // depuis la console qu'un son sort et qu'il ne sature pas.
  niveau(): { efficace: number; crete: number } {
    if (!this.context) return { efficace: 0, crete: 0 };
    const echantillons = new Float32Array(this.analyseur.fftSize);
    this.analyseur.getFloatTimeDomainData(echantillons);
    let somme = 0, crete = 0;
    for (const v of echantillons) {
      somme += v * v;
      crete = Math.max(crete, Math.abs(v));
    }
    return { efficace: Math.sqrt(somme / echantillons.length), crete };
  }

  update(etat: EtatSon | null): void {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime;
    // Pause ou jeu non lancé : tout ce qui est continu se tait.
    if (!etat) {
      for (const gain of [this.moteurGain, this.turboGain, this.crissementGain, this.roulementGain,
        this.ventGain, this.sireneGain]) gain.gain.setTargetAtTime(0, t, .08);
      return;
    }
    const v = Math.abs(etat.vitesse);

    // ---- Moteur ----------------------------------------------------------
    // Rapport engagé d'après la vitesse, avec 12 % d'hystérésis pour ne pas
    // battre entre deux rapports à vitesse stable.
    const part = v / Math.max(1, etat.pointe);
    while (this.rapport < RAPPORTS.length - 1 && part > RAPPORTS[this.rapport]) this.rapport++;
    while (this.rapport > 0 && part < RAPPORTS[this.rapport - 1] * .88) this.rapport--;
    const bas = this.rapport ? RAPPORTS[this.rapport - 1] * .88 : 0;
    const dansRapport = Math.min(1, Math.max(0, (part - bas) / (RAPPORTS[this.rapport] - bas)));
    // Régime de 0 (ralenti) à 1 (zone rouge) : il repart de 45 % après un
    // passage de rapport, et monte un peu plus haut pédale enfoncée.
    const cible = (this.rapport ? .45 : .12) + dansRapport * (this.rapport ? .5 : .83) + (etat.gaz ? .05 : 0);
    this.regime += (cible - this.regime) * .18;
    // Fréquence d'allumage : un huit cylindres à 8 500 tr/min chante vers
    // 560 Hz, un quatre cylindres à 6 000 vers 200 Hz, un diesel plus bas.
    const ralenti = etat.sport ? 62 : etat.lourd ? 34 : 42;
    const rouge = etat.sport ? 520 : etat.lourd ? 150 : 215;
    const f = ralenti + (rouge - ralenti) * this.regime + (etat.nitro ? 30 : 0);
    this.moteurOsc[0].frequency.setTargetAtTime(f * .5, t, .03);
    this.moteurOsc[1].frequency.setTargetAtTime(f, t, .03);
    this.moteurOsc[2].frequency.setTargetAtTime(f * 2.01, t, .03);
    // Sous charge, le moteur s'ouvre : plus fort et plus riche en aigus.
    const charge = etat.gaz ? 1 : .35;
    this.moteurFiltre.frequency.setTargetAtTime(260 + this.regime * (etat.sport ? 2600 : 1300) * charge, t, .06);
    this.moteurGain.gain.setTargetAtTime(etat.aPied ? 0 : (.05 + this.regime * .11) * (.55 + charge * .45), t, .07);
    this.turboGain.gain.setTargetAtTime(etat.nitro ? .03 : 0, t, .04);

    // ---- Pneus et air ----------------------------------------------------
    // Crissement : bruit en bande étroite vers 1,4 kHz sur route, plus grave
    // et sans résonance dans l'herbe (on y entend la terre, pas la gomme).
    const glisse = etat.aPied ? 0 : etat.glisse * Math.min(1, v / 10);
    this.crissementFiltre.frequency.setTargetAtTime(etat.surRoute ? 1250 + glisse * 500 : 420, t, .05);
    this.crissementFiltre.Q.setTargetAtTime(etat.surRoute ? 7 : 1.2, t, .05);
    this.crissementGain.gain.setTargetAtTime(glisse * (etat.surRoute ? .16 : .2), t, .05);
    // Roulement : grondement sourd, plus présent hors chaussée.
    const allure = etat.aPied ? 0 : Math.min(1, v / 45);
    this.roulementFiltre.frequency.setTargetAtTime(etat.surRoute ? 240 + allure * 500 : 520, t, .1);
    this.roulementGain.gain.setTargetAtTime(allure * (etat.surRoute ? .07 : .16), t, .1);
    this.ventGain.gain.setTargetAtTime(allure * allure * .09, t, .15);

    // ---- Sirène ----------------------------------------------------------
    // Deux-tons de la police française : 435 Hz puis 580 Hz, une
    // demi-seconde chacun.
    this.sireneOsc.frequency.setTargetAtTime(Math.floor(etat.temps * 2) % 2 ? 580 : 435, t, .01);
    this.sireneGain.gain.setTargetAtTime(etat.sirene * .06, t, .12);
    this.sirenePan.pan.setTargetAtTime(Math.max(-1, Math.min(1, etat.sirenePan)), t, .1);

    // ---- Ambiance --------------------------------------------------------
    // Oiseaux le jour, grillons la nuit, à intervalles irréguliers. On ne les
    // entend qu'à faible allure : à 100 km/h, le vent couvre tout.
    if (etat.temps >= this.prochainAmbiance) {
      this.prochainAmbiance = etat.temps + (etat.nuit ? .9 + Math.random() * 1.6 : 1.5 + Math.random() * 4);
      const volume = Math.max(0, 1 - v / 14);
      if (volume > .05) {
        if (etat.nuit) this.grillon(volume, Math.random() * 2 - 1);
        else this.oiseau(volume, Math.random() * 2 - 1);
      }
    }
  }

  // Choc : `force` de 0 à 1. Tôle froissée contre un mur ou une voiture
  // (bruit bref et clinquant sur un coup sourd), ou choc mat contre un corps.
  choc(force: number, sourd = false): void {
    const ctx = this.context;
    if (!ctx || force < .04) return;
    const t = ctx.currentTime, f = Math.min(1, force);
    // Coup grave : une sinusoïde qui tombe de 110 à 38 Hz.
    const coup = ctx.createOscillator();
    coup.frequency.setValueAtTime(110, t);
    coup.frequency.exponentialRampToValueAtTime(38, t + .18);
    this.enveloppe(coup, .28 * f + .06, .22);
    // Éclat : bruit filtré, plus clair et plus long pour de la tôle.
    const eclat = ctx.createBufferSource();
    eclat.buffer = this.bruit;
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'bandpass';
    filtre.frequency.value = sourd ? 380 : 1700 + f * 1500;
    filtre.Q.value = sourd ? .8 : 1.6;
    eclat.connect(filtre);
    this.enveloppe(filtre, (sourd ? .16 : .3) * f + .03, sourd ? .12 : .16 + f * .22, eclat);
    if (!sourd && f > .35) {
      // Choc franc : trois partiels inharmoniques, la tôle qui sonne.
      for (const hz of [523, 811, 1289]) {
        const partiel = ctx.createOscillator();
        partiel.type = 'triangle';
        partiel.frequency.value = hz * (.95 + Math.random() * .1);
        this.enveloppe(partiel, .05 * f, .35);
      }
    }
  }

  // Klaxon de la circulation : deux notes à la tierce, placées dans l'espace.
  klaxon(pan = 0, volume = 1): void {
    const ctx = this.context;
    if (!ctx) return;
    const sortie = ctx.createStereoPanner();
    sortie.pan.value = Math.max(-1, Math.min(1, pan));
    sortie.connect(this.master);
    const duree = .28 + Math.random() * .3;
    for (const hz of [415, 523]) {
      const note = ctx.createOscillator();
      note.type = 'square';
      note.frequency.value = hz;
      const filtre = ctx.createBiquadFilter();
      filtre.type = 'lowpass';
      filtre.frequency.value = 1800;
      note.connect(filtre);
      this.enveloppe(filtre, .05 * volume, duree, note, sortie, true);
    }
  }

  // Un pas : petit claquement sur l'enrobé, frottement étouffé dans l'herbe.
  pas(course: boolean, herbe: boolean): void {
    const ctx = this.context;
    if (!ctx) return;
    const source = ctx.createBufferSource();
    source.buffer = this.bruit;
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'bandpass';
    filtre.frequency.value = herbe ? 340 : 760 + Math.random() * 240;
    filtre.Q.value = herbe ? .7 : 2.2;
    source.connect(filtre);
    // Niveau mesuré à 0,01 de crête au premier réglage (0,09), soit dix
    // fois sous le ralenti du moteur : remonté à 0,4.
    this.enveloppe(filtre, (herbe ? .3 : .4) * (course ? 1.4 : 1), herbe ? .1 : .06, source);
  }

  // Portière : coup sourd puis déclic du pêne.
  portiere(): void {
    const ctx = this.context;
    if (!ctx) return;
    const t = ctx.currentTime;
    const coup = ctx.createOscillator();
    coup.frequency.setValueAtTime(140, t);
    coup.frequency.exponentialRampToValueAtTime(55, t + .09);
    this.enveloppe(coup, .22, .12);
    const declic = ctx.createBufferSource();
    declic.buffer = this.bruit;
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'highpass';
    filtre.frequency.value = 2200;
    declic.connect(filtre);
    this.enveloppe(filtre, .07, .03, declic, undefined, false, .07);
  }

  // Signaux de jeu : quelques notes, reconnaissables sans regarder l'écran.
  signal(nom: Signal): void {
    const notes: Record<Signal, number[]> = {
      mission: [523, 659],                  // deux notes montantes : c'est parti
      livre: [523, 659, 784, 1047],         // arpège majeur : réussi
      echec: [392, 330, 262],               // descente : raté
      etoile: [880, 660, 880, 660],         // alarme : on est recherché
      arrete: [330, 247, 196, 147],         // descente lente : arrêté
    };
    const ctx = this.context;
    if (!ctx) return;
    const pas = nom === 'arrete' ? .2 : .09;
    notes[nom].forEach((hz, i) => {
      const note = ctx.createOscillator();
      note.type = nom === 'etoile' ? 'square' : 'triangle';
      note.frequency.value = hz;
      this.enveloppe(note, nom === 'etoile' ? .045 : .1, pas * 1.8, note, undefined, false, i * pas);
    });
  }

  // Chant d'oiseau : deux ou trois sifflements glissés entre 2,4 et 4,5 kHz.
  private oiseau(volume: number, pan: number): void {
    const ctx = this.context!;
    const sortie = ctx.createStereoPanner();
    sortie.pan.value = pan;
    sortie.connect(this.master);
    const base = 2400 + Math.random() * 1500;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const depart = ctx.currentTime + i * .13;
      const sifflet = ctx.createOscillator();
      sifflet.frequency.setValueAtTime(base * (1 + Math.random() * .2), depart);
      sifflet.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * .3), depart + .08);
      this.enveloppe(sifflet, .022 * volume, .09, sifflet, sortie, false, i * .13);
    }
  }

  // Grillon : une note à 4,6 kHz hachée trente fois par seconde.
  private grillon(volume: number, pan: number): void {
    const ctx = this.context!;
    const sortie = ctx.createStereoPanner();
    sortie.pan.value = pan;
    sortie.connect(this.master);
    for (let i = 0; i < 9; i++) {
      const stridulation = ctx.createOscillator();
      stridulation.frequency.value = 4600;
      this.enveloppe(stridulation, .012 * volume, .022, stridulation, sortie, false, i * .034);
    }
  }

  // Joue une source avec une attaque franche et une extinction exponentielle,
  // puis la libère. `maintenu` garde le niveau avant d'éteindre (klaxon).
  private enveloppe(
    noeud: AudioNode, volume: number, duree: number,
    source: AudioScheduledSourceNode = noeud as AudioScheduledSourceNode,
    sortie: AudioNode = this.master, maintenu = false, retard = 0,
  ): void {
    const ctx = this.context!;
    const t = ctx.currentTime + retard;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + .006);
    if (maintenu) gain.gain.setValueAtTime(volume, t + duree * .85);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duree);
    noeud.connect(gain).connect(sortie);
    source.start(t);
    source.stop(t + duree + .03);
    source.onended = () => gain.disconnect();
  }

  private bruitContinu(filtre: BiquadFilterNode, gain: GainNode): void {
    const source = this.context!.createBufferSource();
    source.buffer = this.bruit;
    source.loop = true;
    gain.gain.value = 0;
    source.connect(filtre).connect(gain).connect(this.master);
    source.start();
  }

  private start(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    const ctx = this.context = new AudioContext();
    // Sortie : gain général, puis un compresseur qui retient les pointes
    // (un choc par-dessus le moteur à fond ne doit pas saturer).
    this.master = ctx.createGain();
    this.master.gain.value = .6;
    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -14;
    compresseur.ratio.value = 5;
    this.analyseur = ctx.createAnalyser();
    this.analyseur.fftSize = 2048;
    this.master.connect(compresseur).connect(this.analyseur).connect(ctx.destination);

    // Deux secondes de bruit blanc, partagées par tous les sons bruités.
    this.bruit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const donnees = this.bruit.getChannelData(0);
    for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;

    // Moteur : sous-harmonique en dent de scie (le grondement), fondamentale
    // carrée (le corps), octave légèrement désaccordée (le mordant).
    this.moteurFiltre = ctx.createBiquadFilter();
    this.moteurFiltre.type = 'lowpass';
    this.moteurFiltre.Q.value = 1.4;
    this.moteurGain = ctx.createGain();
    this.moteurGain.gain.value = 0;
    this.moteurFiltre.connect(this.moteurGain).connect(this.master);
    const timbres: Array<[OscillatorType, number]> = [['sawtooth', .9], ['square', .45], ['sawtooth', .3]];
    for (const [type, niveau] of timbres) {
      const osc = ctx.createOscillator();
      osc.type = type;
      const dosage = ctx.createGain();
      dosage.gain.value = niveau;
      osc.connect(dosage).connect(this.moteurFiltre);
      osc.start();
      this.moteurOsc.push(osc);
    }
    const turbo = ctx.createOscillator();
    turbo.frequency.value = 920;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    turbo.connect(this.turboGain).connect(this.master);
    turbo.start();

    this.crissementFiltre = ctx.createBiquadFilter();
    this.crissementFiltre.type = 'bandpass';
    this.crissementGain = ctx.createGain();
    this.bruitContinu(this.crissementFiltre, this.crissementGain);
    this.roulementFiltre = ctx.createBiquadFilter();
    this.roulementFiltre.type = 'lowpass';
    this.roulementGain = ctx.createGain();
    this.bruitContinu(this.roulementFiltre, this.roulementGain);
    const ventFiltre = ctx.createBiquadFilter();
    ventFiltre.type = 'highpass';
    ventFiltre.frequency.value = 1800;
    this.ventGain = ctx.createGain();
    this.bruitContinu(ventFiltre, this.ventGain);

    this.sireneOsc = ctx.createOscillator();
    this.sireneOsc.type = 'square';
    const sireneFiltre = ctx.createBiquadFilter();
    sireneFiltre.type = 'lowpass';
    sireneFiltre.frequency.value = 1500;
    this.sireneGain = ctx.createGain();
    this.sireneGain.gain.value = 0;
    this.sirenePan = ctx.createStereoPanner();
    this.sireneOsc.connect(sireneFiltre).connect(this.sireneGain).connect(this.sirenePan).connect(this.master);
    this.sireneOsc.start();

    this.demarrerMusique();
  }

  private demarrerMusique(): void {
    if (!this.context || this.musique) return;
    const element = new Audio(MUSIQUE);
    element.loop = true;
    element.preload = 'auto';
    element.volume = 1;
    // Gain bas devant le moteur : la musique accompagne, elle ne couvre pas.
    const gain = this.context.createGain();
    gain.gain.value = .3;
    this.context.createMediaElementSource(element).connect(gain).connect(this.master);
    this.musique = element;
    if (this.musiqueActive) {
      void element.play().catch((error) => {
        console.warn('Musique non démarrée :', error?.message ?? error);
      });
    }
  }
}
