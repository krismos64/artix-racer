// Moteur sonore (Web Audio API). Tous les BRUITS sont synthétisés : le son
// moteur est un banc d'oscillateurs harmoniques piloté par le régime, approche
// utilisée par les simulateurs pour un rendu continu sans boucle audible.
//
// La MUSIQUE, elle, est un fichier lu en boucle (`public/audio/music1.mp3`).
// Elle passe par le même bus que la musique générative qu'elle remplace, donc
// la touche M et la coupure du son continuent de la piloter. La boucle
// générative reste dans le code, en secours : si le fichier est absent ou
// illisible, elle reprend la main plutôt que de laisser le jeu muet.

// Fichier de musique. Mettre à `null` pour revenir à la boucle générative.
const MUSIQUE = 'audio/music1.mp3';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.musicOn = true;
    // Passe à `true` quand le fichier est chargé et joué : la boucle
    // générative se tait alors d'elle-même.
    this.musiqueFichier = false;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;

    // ---- Bus principal ----------------------------------------------------
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    // Compresseur : évite la saturation quand tout joue en même temps.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    this.master.connect(comp).connect(ctx.destination);

    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.32;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);

    this.buildEngine();
    this.buildAmbience();
    this.buildMusic();
    // L'horloge musicale démarre maintenant, pas à la construction des nœuds.
    this.nextNoteTime = ctx.currentTime + 0.1;
    this.ready = true;
    // Chargement du morceau en tâche de fond : la boucle générative joue
    // pendant le décodage, puis se tait dès que le fichier démarre.
    this.chargerMusique();
  }

  // Table d'onde d'un cycle moteur complet. Chaque période contient les quatre
  // explosions d'un cycle quatre temps : une attaque brutale suivie d'une
  // décroissance, avec un léger déséquilibre entre cylindres. C'est ce qui
  // donne le grain caractéristique, impossible à obtenir avec des sinusoïdes.
  buildWavetable() {
    const ctx = this.ctx;
    const N = 2048;
    const cycle = new Float32Array(N);

    // Quatre explosions par cycle, d'amplitude légèrement inégale : aucun
    // moteur réel n'a quatre cylindres parfaitement identiques.
    const amplitudes = [1.0, 0.94, 0.98, 0.91];
    for (let c = 0; c < 4; c++) {
      const debut = Math.floor((c / 4) * N);
      const duree = Math.floor(N / 4);
      for (let i = 0; i < duree; i++) {
        const t = i / duree;
        // Attaque très raide, décroissance exponentielle : profil d'une
        // détonation dans un cylindre.
        const enveloppe = t < 0.06
          ? t / 0.06
          : Math.exp(-(t - 0.06) * 7.5);
        // Contenu spectral riche : la combustion n'est pas un son pur.
        const contenu = Math.sin(t * Math.PI * 2 * 3)
          + 0.55 * Math.sin(t * Math.PI * 2 * 7 + 1.1)
          + 0.30 * Math.sin(t * Math.PI * 2 * 13 + 2.3)
          + 0.18 * Math.sin(t * Math.PI * 2 * 23 + 0.7);
        cycle[(debut + i) % N] += enveloppe * contenu * amplitudes[c] * 0.34;
      }
    }

    // Conversion en série de Fourier : PeriodicWave attend les coefficients,
    // pas l'échantillon temporel. On les extrait par DFT sur 64 harmoniques.
    const H = 64;
    const real = new Float32Array(H);
    const imag = new Float32Array(H);
    for (let h = 1; h < H; h++) {
      let re = 0, im = 0;
      for (let i = 0; i < N; i++) {
        const a = (2 * Math.PI * h * i) / N;
        re += cycle[i] * Math.cos(a);
        im -= cycle[i] * Math.sin(a);
      }
      real[h] = (re / N) * 2;
      imag[h] = (im / N) * 2;
    }
    this.waveMoteur = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  // ---- MOTEUR ------------------------------------------------------------
  buildEngine() {
    const ctx = this.ctx;
    this.engineBus = ctx.createGain();
    this.engineBus.gain.value = 0;

    // Filtre passe-bas : ouvre avec l'accélérateur (effet "admission").
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 1.2;

    // Résonance d'échappement.
    this.exhaustPeak = ctx.createBiquadFilter();
    this.exhaustPeak.type = 'peaking';
    this.exhaustPeak.frequency.value = 180;
    this.exhaustPeak.gain.value = 7;
    this.exhaustPeak.Q.value = 1.1;

    this.engineBus.connect(this.engineFilter).connect(this.exhaustPeak).connect(this.sfxBus);

    // Un moteur ne bourdonne pas : il émet des impulsions d'explosion. Le
    // caractère vient de cette granularité, qu'un banc d'oscillateurs continus
    // ne peut pas reproduire. On génère donc une table d'onde périodique qui
    // contient déjà la forme d'une détonation, puis on la fait défiler à la
    // fréquence d'allumage.
    this.buildWavetable();

    // Harmoniques résiduels : ils épaississent le son sans porter le grain.
    const harmonics = [
      { mult: 0.5, gain: 0.16, type: 'sawtooth' },  // sous-harmonique (grave)
      { mult: 1.0, gain: 0.14, type: 'sawtooth' },
      { mult: 2.0, gain: 0.10, type: 'square' },    // ordre 2 du 4 cylindres
      { mult: 3.0, gain: 0.05, type: 'sawtooth' },
    ];
    this.oscs = harmonics.map((h) => {
      const o = ctx.createOscillator();
      o.type = h.type;
      const g = ctx.createGain();
      g.gain.value = h.gain;
      // Léger désaccord : deux oscillateurs par harmonique donnent du corps.
      o.detune.value = (Math.random() - 0.5) * 14;
      o.connect(g).connect(this.engineBus);
      o.start();
      return { osc: o, gain: g, mult: h.mult, base: h.gain };
    });

    // Voix principale : la table d'explosions, dupliquée et désaccordée pour
    // épaissir le son comme le font les moteurs réels (cylindres jamais
    // parfaitement synchrones).
    this.voixMoteur = [];
    for (const detune of [-9, 6]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.waveMoteur);
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(this.engineBus);
      o.start();
      this.voixMoteur.push({ osc: o, gain: g });
    }

    // Bruit d'admission/turbine, filtré en bande passante.
    this.intakeNoise = this.noiseSource(0.6);
    this.intakeFilter = ctx.createBiquadFilter();
    this.intakeFilter.type = 'bandpass';
    this.intakeFilter.frequency.value = 1400;
    this.intakeFilter.Q.value = 0.8;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeNoise.connect(this.intakeFilter).connect(this.intakeGain).connect(this.sfxBus);

    // Sifflement de turbo, monte avec la charge.
    this.turbo = ctx.createOscillator();
    this.turbo.type = 'sine';
    this.turbo.frequency.value = 3000;
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turbo.connect(this.turboGain).connect(this.sfxBus);
    this.turbo.start();
  }

  // ---- BRUITS DE ROULEMENT ET VENT ---------------------------------------
  buildAmbience() {
    const ctx = this.ctx;

    // Roulement des pneus : bruit rose filtré.
    this.tireNoise = this.noiseSource(0.5);
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 480;
    this.tireFilter.Q.value = 0.55;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    this.tireNoise.connect(this.tireFilter).connect(this.tireGain).connect(this.sfxBus);

    // Crissement de pneus : bruit haut + résonance forte.
    this.skidNoise = this.noiseSource(0.5);
    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1750;
    this.skidFilter.Q.value = 5.5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skidNoise.connect(this.skidFilter).connect(this.skidGain).connect(this.sfxBus);

    // Vent : bruit passe-haut qui monte avec la vitesse.
    this.windNoise = this.noiseSource(0.4);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'highpass';
    this.windFilter.frequency.value = 700;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.windNoise.connect(this.windFilter).connect(this.windGain).connect(this.sfxBus);

    // Ambiance extérieure discrète (oiseaux/campagne) : très léger souffle.
    this.ambNoise = this.noiseSource(0.3);
    const ambF = ctx.createBiquadFilter();
    ambF.type = 'bandpass'; ambF.frequency.value = 2200; ambF.Q.value = 0.4;
    const ambG = ctx.createGain(); ambG.gain.value = 0.012;
    this.ambNoise.connect(ambF).connect(ambG).connect(this.sfxBus);
  }

  // Générateur de bruit en boucle (2 s de bruit rose pré-calculé).
  noiseSource(amp = 0.5) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    // Bruit rose (Voss-McCartney simplifié) : plus naturel que le blanc.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11 * amp;
      b6 = w * 0.115926;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start();
    return src;
  }

  // ---- MISE À JOUR TEMPS RÉEL --------------------------------------------
  update(state, dt) {
    if (!this.ready || this.muted) return;
    const now = this.ctx.currentTime;
    const smooth = 0.06;
    const set = (param, v) => param.setTargetAtTime(v, now, smooth);

    // La table d'onde contient un cycle moteur complet : elle défile donc à la
    // fréquence de rotation du vilebrequin divisée par deux (cycle 4 temps),
    // soit rpm/120. Les harmoniques résiduels suivent l'ordre 2.
    const fCycle = Math.max(6, state.rpm / 120);
    for (const v of this.voixMoteur) {
      v.osc.frequency.setTargetAtTime(fCycle, now, 0.025);
    }

    // Fréquence de base : régime / 60 * (cylindres / 2) pour un 4 cylindres.
    const f0 = Math.max(12, (state.rpm / 60) * 2);
    for (const o of this.oscs) {
      o.osc.frequency.setTargetAtTime(f0 * o.mult, now, 0.03);
    }

    const load = state.throttle;
    const rpmNorm = (state.rpm - 850) / 6350;

    // Volume moteur : audible au ralenti, plus fort en charge.
    set(this.engineBus.gain, 0.13 + rpmNorm * 0.24 + load * 0.28);
    // Le filtre s'ouvre largement en montée en régime : c'est ce qui donne la
    // sensation de moteur qui « prend ses tours ».
    set(this.engineFilter.frequency, 480 + load * 3400 + rpmNorm * rpmNorm * 4200);
    set(this.engineFilter.Q, 1.1 + load * 1.6);
    set(this.exhaustPeak.gain, 5 + load * 9);
    // La résonance d'échappement monte avec le régime, comme un vrai silencieux.
    this.exhaustPeak.frequency.setTargetAtTime(120 + rpmNorm * 190, now, 0.08);

    // Voix d'explosion : dominantes en charge, discrètes en décélération.
    for (const v of this.voixMoteur) {
      v.gain.gain.setTargetAtTime(0.34 + load * 0.42, now, smooth);
    }

    // Admission + turbo
    set(this.intakeGain.gain, load * (0.035 + rpmNorm * 0.075));
    this.intakeFilter.frequency.setTargetAtTime(900 + rpmNorm * 2400, now, 0.08);
    set(this.turboGain.gain, load * rpmNorm * rpmNorm * 0.024);
    this.turbo.frequency.setTargetAtTime(2200 + rpmNorm * 5200, now, 0.1);

    // Roulement : dépend de la vitesse et du revêtement.
    const v = Math.min(1, state.speed / 45);
    set(this.tireGain.gain, state.grounded ? v * (state.onRoad ? 0.09 : 0.17) : 0);
    this.tireFilter.frequency.setTargetAtTime(
      (state.onRoad ? 420 : 260) + v * 700, now, 0.1,
    );

    // Crissement proportionnel au glissement des pneus.
    const skid = Math.min(1, state.slip * 1.4) * Math.min(1, state.speed / 6);
    set(this.skidGain.gain, skid * 0.2);
    this.skidFilter.frequency.setTargetAtTime(1450 + skid * 900, now, 0.05);

    // Vent
    set(this.windGain.gain, Math.min(0.1, (state.speed / 60) ** 2 * 0.14));
    this.windFilter.frequency.setTargetAtTime(500 + state.speed * 22, now, 0.15);

    // Crépitement à la décélération : quand on lève le pied alors que le
    // moteur tourne haut, l'essence imbrûlée détone dans l'échappement.
    const leverDePied = this.chargePrec > 0.55 && load < 0.12;
    if (leverDePied && rpmNorm > 0.42) {
      this.crepitementActif = 0.55 + rpmNorm * 0.45;
      this.crepitementFin = now + 0.35 + rpmNorm * 0.5;
    }
    if (this.crepitementActif && now < this.crepitementFin) {
      // Détonations espacées irrégulièrement, jamais à cadence fixe.
      if (now > (this.prochainCrepitement ?? 0)) {
        this.crepitement(this.crepitementActif);
        this.prochainCrepitement = now + 0.05 + Math.random() * 0.11;
      }
    } else {
      this.crepitementActif = 0;
    }
    this.chargePrec = load;
  }

  // ---- ÉVÉNEMENTS PONCTUELS ----------------------------------------------
  shift() {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // Coupure d'allumage : petit "pop" d'échappement.
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.14, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.14);

    // Soupape de décharge : chuintement bref à la coupure des gaz. C'est un
    // marqueur sonore très identifiable, présent sur tous les jeux du genre.
    this.chuintement(t, 0.16);
  }

  // Souffle court et aigu, filtré en bande passante descendante.
  chuintement(t, force = 0.14) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.26);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.9);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(1500, t + 0.24);
    f.Q.value = 1.6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(force, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  // Crépitement d'échappement à la décélération : de petites détonations
  // irrégulières quand on lève le pied à haut régime. Très caractéristique,
  // et c'est ce qui rend un moteur « vivant » dans un jeu.
  crepitement(intensite) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const nb = 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < nb; k++) {
      const dt = k * (0.03 + Math.random() * 0.05);
      const amp = (0.05 + Math.random() * 0.09) * intensite;

      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(180 + Math.random() * 160, t + dt);
      o.frequency.exponentialRampToValueAtTime(55, t + dt + 0.07);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, t + dt);
      g.gain.exponentialRampToValueAtTime(amp, t + dt + 0.004);
      g.gain.exponentialRampToValueAtTime(0.001, t + dt + 0.09);
      o.connect(g).connect(this.sfxBus);
      o.start(t + dt); o.stop(t + dt + 0.1);
    }
  }

  impact(force) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const amp = Math.min(0.55, 0.06 + force * 0.05);

    // Composante métallique : bruit filtré en descente.
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(280, t + 0.3);
    f.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);

    // Composante grave : le "boum" de la tôle.
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.22);
    const og = ctx.createGain();
    og.gain.setValueAtTime(amp * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    o.connect(og).connect(this.sfxBus);
    o.start(t); o.stop(t + 0.28);
  }

  horn(on) {
    if (!this.ready || this.muted) return;
    if (on && !this.hornNodes) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.13, ctx.currentTime, 0.01);
      // Klaxon réel : deux notes (tierce) légèrement désaccordées.
      const oscs = [440, 554].map((f) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.connect(g);
        o.start();
        return o;
      });
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      g.connect(filter).connect(this.sfxBus);
      this.hornNodes = { g, oscs };
    } else if (!on && this.hornNodes) {
      const { g, oscs } = this.hornNodes;
      const t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.03);
      oscs.forEach((o) => o.stop(t + 0.2));
      this.hornNodes = null;
    }
  }

  // ---- MUSIQUE -----------------------------------------------------------
  // Piste électronique générative : basse, nappe, arpège et batterie,
  // écrite en JS pour rester 100 % hors ligne.
  buildMusic() {
    const ctx = this.ctx;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2600;
    this.musicFilter.connect(this.musicBus);

    // Réverbération courte par convolution sur bruit décroissant.
    const rev = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 1.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
      }
    }
    rev.buffer = ir;
    const revGain = ctx.createGain();
    revGain.gain.value = 0.24;
    this.musicFilter.connect(revGain).connect(rev).connect(this.musicBus);

    this.bpm = 128;
    this.step = 0;
    this.nextNoteTime = ctx.currentTime + 0.12;
    // La mineur : progression Am - F - C - G, efficace en conduite.
    this.progression = [
      [57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62],
    ];
  }

  // Charge et joue le fichier de musique en boucle. Appelé depuis `start`,
  // sans être attendu : le jeu ne doit pas patienter sur un décodage de
  // plusieurs mégaoctets, la boucle générative couvre l'intervalle.
  async chargerMusique() {
    if (!MUSIQUE || !this.ctx) return false;
    try {
      const r = await fetch(MUSIQUE);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const donnees = await r.arrayBuffer();
      // `decodeAudioData` en promesse : la forme à callback est obsolète.
      const buffer = await this.ctx.decodeAudioData(donnees);
      // Le contexte a pu être fermé entre-temps (rechargement rapide).
      if (!this.ctx || this.ctx.state === 'closed') return false;

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      // Le morceau passe par son propre gain, branché sur le bus musique :
      // il hérite ainsi de la touche M et de la coupure générale, sans passer
      // par le filtre et la réverbération réglés pour la boucle générative.
      this.gainFichier = this.ctx.createGain();
      this.gainFichier.gain.value = 0.55;
      src.connect(this.gainFichier).connect(this.musicBus);
      src.start();
      this.sourceMusique = src;
      // La boucle générative se tait : `tickMusic` la court-circuite.
      this.musiqueFichier = true;
      return true;
    } catch (err) {
      // Fichier absent ou illisible : la boucle générative garde la main.
      console.warn(`Musique ${MUSIQUE} indisponible, boucle générative :`, err.message);
      return false;
    }
  }

  midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  // Ordonnanceur : appelé à chaque frame, planifie les notes en avance.
  tickMusic() {
    if (!this.ready || !this.musicOn || this.muted) return;
    // Le fichier a pris la main : plus aucune note à planifier.
    if (this.musiqueFichier) return;
    const ctx = this.ctx;
    const stepDur = 60 / this.bpm / 4; // double-croche

    // Resynchronisation sur retard important seulement (onglet en arrière-plan,
    // longue pause) : un seuil trop serré repousserait l'horloge à chaque frame
    // et la musique n'avancerait jamais.
    if (this.nextNoteTime < ctx.currentTime - 1) {
      this.nextNoteTime = ctx.currentTime + 0.05;
    }

    // Borne de sécurité : jamais plus d'une mesure planifiée d'un coup.
    let guard = 0;
    while (this.nextNoteTime < ctx.currentTime + 0.14 && guard++ < 32) {
      this.scheduleStep(this.step, this.nextNoteTime, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextNoteTime += stepDur;
    }
  }

  scheduleStep(step, t, dur) {
    const bar = Math.floor(step / 16) % 4;
    const chord = this.progression[bar];
    const s = step % 16;

    // --- Grosse caisse : quatre temps ---
    if (s % 4 === 0) this.kick(t);
    // --- Caisse claire sur 2 et 4 ---
    if (s === 4 || s === 12) this.snare(t);
    // --- Charleston en croches ---
    if (s % 2 === 0) this.hat(t, s % 4 === 0 ? 0.032 : 0.02);

    // --- Basse : fondamentale de l'accord, motif syncopé ---
    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      this.bass(this.midi(chord[0] - 24), t, dur * 1.7);
    }
    // --- Nappe : accord tenu au début de chaque mesure ---
    if (s === 0) {
      for (const n of chord) this.pad(this.midi(n), t, dur * 15);
    }
    // --- Arpège : monte et descend sur l'accord ---
    if (s % 2 === 1) {
      const idx = Math.floor(s / 2) % 4;
      const note = chord[idx % chord.length] + (idx === 3 ? 12 : 0);
      this.pluck(this.midi(note + 12), t, dur * 1.4);
    }
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + 0.32);
  }

  snare(t) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 1500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.34, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    src.connect(f).connect(g).connect(this.musicFilter);
    src.start(t);
  }

  hat(t, amp) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.06);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(f).connect(g).connect(this.musicFilter);
    src.start(t);
  }

  bass(freq, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq / 2;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(340, t);
    f.frequency.exponentialRampToValueAtTime(140, t + dur);
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f); sub.connect(f);
    f.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.02);
    sub.start(t); sub.stop(t + dur + 0.02);
  }

  pad(freq, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(0.055, t + 0.35);
    g.gain.setValueAtTime(0.055, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    // Deux oscillateurs désaccordés : nappe large.
    [-6, 6].forEach((det) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.1);
    });
    g.connect(this.musicFilter);
  }

  pluck(freq, t, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.075, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicFilter);
    o.start(t); o.stop(t + dur + 0.02);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ready) {
      this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.15);
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.ready) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.08);
    }
  }
}
