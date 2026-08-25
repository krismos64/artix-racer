export class ArcadeAudio {
  private context: AudioContext | null = null;
  private engineOscillator: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private turboOscillator: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  constructor() {
    const unlock = () => this.start();
    addEventListener('pointerdown', unlock, { once: true });
    addEventListener('keydown', unlock, { once: true });
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
  }
}
