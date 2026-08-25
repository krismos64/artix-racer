// Musique de fond, jouée en boucle dès le démarrage du jeu.
//
// Lue par un élément <audio> plutôt que par `decodeAudioData` : le fichier
// pèse 8 Mo, que le décodage porterait entièrement en mémoire sous forme de
// PCM décompressé (plus de 80 Mo). L'élément le diffuse au fil de l'eau, et
// son flux est branché sur le graphe Web Audio pour passer par le même bus
// que le reste du son.
const MUSIQUE = '/audio/music1.mp3';

export class ArcadeAudio {
  private context: AudioContext | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private turboOscillator: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private musique: HTMLAudioElement | null = null;
  private musiqueGain: GainNode | null = null;
  private musiqueActive = true;

  constructor() {
    const unlock = () => this.start();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
    // M coupe et relance la musique, comme le documente le README.
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

  update(speed: number, boosting: boolean, drifting: boolean): void {
    if (!this.context || !this.engineOscillator || !this.engineGain || !this.turboGain) return;
    const now = this.context.currentTime;
    const normalized = Math.min(1, Math.abs(speed) / 58);
    this.engineOscillator.frequency.setTargetAtTime(58 + normalized * 185, now, .045);
    this.engineGain.gain.setTargetAtTime(.018 + normalized * .048 + (drifting ? .018 : 0), now, .06);
    this.turboGain.gain.setTargetAtTime(boosting ? .028 : 0, now, .035);
  }

  private start(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    this.context = new AudioContext();
    const master = this.context.createGain();
    master.gain.value = .55;
    master.connect(this.context.destination);

    this.engineOscillator = this.context.createOscillator();
    this.engineOscillator.type = 'sawtooth';
    this.engineGain = this.context.createGain();
    const engineFilter = this.context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 480;
    this.engineGain.gain.value = .012;
    this.engineOscillator.connect(engineFilter).connect(this.engineGain).connect(master);
    this.engineOscillator.start();

    this.turboOscillator = this.context.createOscillator();
    this.turboOscillator.type = 'sine';
    this.turboOscillator.frequency.value = 920;
    this.turboGain = this.context.createGain();
    this.turboGain.gain.value = 0;
    this.turboOscillator.connect(this.turboGain).connect(master);
    this.turboOscillator.start();

    this.demarrerMusique(master);
  }

  private demarrerMusique(master: GainNode): void {
    if (!this.context || this.musique) return;
    const element = new Audio(MUSIQUE);
    element.loop = true;
    element.preload = 'auto';
    // Le volume de l'élément reste à 1 : le dosage se fait dans le graphe,
    // qui applique aussi le gain général.
    element.volume = 1;
    // Le gain de musique est bas devant le moteur : la musique accompagne la
    // conduite, elle ne la couvre pas.
    this.musiqueGain = this.context.createGain();
    this.musiqueGain.gain.value = .34;
    this.context.createMediaElementSource(element).connect(this.musiqueGain).connect(master);
    this.musique = element;
    if (this.musiqueActive) {
      // Le geste utilisateur qui a débloqué le contexte autorise aussi la
      // lecture ; en cas de refus du navigateur, le silence n'empêche rien.
      void element.play().catch((error) => {
        console.warn('Musique non démarrée :', error?.message ?? error);
      });
    }
  }
}
