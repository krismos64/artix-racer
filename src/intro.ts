// Intro animée du lancement : trois voitures traversent un coucher de soleil
// béarnais, puis le titre « ARTIX RACER » s'écrase au centre, le tout calé
// sur une bande-son synthétisée.
//
// Elle JOUE PENDANT LE CHARGEMENT, par-dessus l'écran de chargement. La
// construction de la ville occupe le fil principal plusieurs secondes : seuls
// `transform` et `opacity` sont animés, que le navigateur compose hors du fil
// principal, et le son est programmé d'un bloc sur l'horloge Web Audio, qui
// tourne sur son propre fil. Une image JS en retard ne décale donc ni l'image
// ni le son.
//
// Une porte « appuyez sur une touche » précède l'animation : un navigateur
// refuse tout son avant un geste de l'utilisateur, et une intro muette
// perdrait la moitié de son effet. Aucun fichier audio : 0 octet à charger.

// Instants clés, en secondes depuis le geste. Ils pilotent À LA FOIS les
// délais CSS (variables `--t-*` posées sur #intro) et la programmation du
// son : une seule source, l'image et le son ne peuvent pas diverger.
const TEMPS = {
  passage1: .45,
  passage2: 1.05,
  passage3: 1.55,
  lignes: 1.9,
  impact: 2.6,
  passageFinal: 4.55,
  fin: 5.25,
};
// Durées des traversées, reprises par les animations CSS des voitures.
const DUREES = { passage1: .85, passage2: .8, passage3: .7, passageFinal: .6 };
const SORTIE = .7;

// Profil de voiture de sport vue de côté, avant à droite. Une seule
// silhouette pour toutes : la couleur et la taille suffisent à les
// distinguer à cette vitesse.
function voiture(couleur: string, reflet: string): string {
  // Deux groupes : la rotation CSS de la roue REMPLACE l'attribut `transform`
  // SVG du même élément, la roue partait alors se loger à l'origine du dessin.
  const roue = (cx: number) => `
    <g transform="translate(${cx} 66)"><g class="intro-roue">
      <circle r="19" fill="#0b0f14"/>
      <circle r="11" fill="#c9d2d9"/>
      <path d="M0-11V11M-11 0H11M-7.8-7.8 7.8 7.8M-7.8 7.8 7.8-7.8" stroke="#5c6870" stroke-width="2.4"/>
      <circle r="3.5" fill="#2a3138"/>
    </g></g>`;
  return `
    <svg viewBox="0 0 300 90" aria-hidden="true">
      <defs>
        <linearGradient id="c-${couleur.slice(1)}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${reflet}"/>
          <stop offset=".55" stop-color="${couleur}"/>
          <stop offset="1" stop-color="#1a0d10"/>
        </linearGradient>
      </defs>
      <ellipse cx="150" cy="84" rx="140" ry="6" fill="#000" opacity=".45"/>
      <path fill="url(#c-${couleur.slice(1)})" d="M8 61 10 50Q12 45 26 43L104 39Q128 26 160 25H174Q196 26 220 38L274 43Q292 46 295 54V61Q293 66 285 66H252A24 24 0 0 0 204 66H98A24 24 0 0 0 50 66H16Q8 66 8 61Z"/>
      <path fill="#0e1a24" d="M114 39Q132 30 158 29H170L172 39ZM178 29H180Q196 30 211 39H178Z"/>
      <path fill="#14090b" d="M6 45 3 37H24L22 43Z"/>
      <path fill="#14090b" d="M150 55H200L196 61H156Z" opacity=".5"/>
      <path d="M30 49H276" stroke="#fff" stroke-opacity=".28" stroke-width="1.5"/>
      <path fill="#fff6d8" d="M280 47 293 49 291 52 281 51Z"/>
      <rect x="8" y="47" width="7" height="4" rx="1.5" fill="#ff3b3b"/>
      ${roue(74)}${roue(226)}
    </svg>`;
}

// Silhouette des Pyrénées à l'horizon : le pic du Midi d'Ossau, reconnaissable
// à sa double pointe, se dresse au centre comme vu depuis Artix.
const MONTAGNES = `
  <svg class="intro-montagnes" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
    <path fill="#1b2a44" d="M0 120V82L60 64 120 78 190 48 250 70 310 52 370 74 420 58 470 30 488 14 500 26 512 10 530 36 580 62 640 46 700 70 760 50 830 72 900 56 960 76 1000 66V120Z"/>
    <path fill="#0f1b2e" d="M0 120V96L90 84 170 98 260 80 350 96 450 86 560 98 650 82 760 96 860 84 1000 98V120Z"/>
  </svg>`;

const HTML = `
  <div class="intro-porte">
    <p class="intro-marque">ARTIX <span>RACER</span></p>
    <p class="intro-invite">Appuyez sur une touche ou cliquez pour démarrer le moteur</p>
    <small>Montez le son</small>
  </div>
  <div class="intro-cadre" aria-hidden="true">
    <div class="intro-ciel"></div>
    ${MONTAGNES}
    <div class="intro-sol"><div class="intro-grille"></div></div>
    <div class="intro-horizon"></div>
    <div class="intro-lignes"></div>
    <div class="intro-voiture v3">${voiture('#3d9fdc', '#a9dcff')}</div>
    <div class="intro-voiture v2">${voiture('#f2c44c', '#fff1b8')}</div>
    <div class="intro-voiture v1">${voiture('#d8262f', '#ff8a7a')}</div>
    <div class="intro-titre">
      <div class="intro-mots"><span class="mot artix">ARTIX</span><span class="mot racer">RACER</span></div>
      <i class="intro-souligne"></i>
      <p class="intro-sous-titre">ÉDITION ARCADE · ARTIX 64170 · BÉARN</p>
    </div>
    <div class="intro-voiture v4">${voiture('#d8262f', '#ff8a7a')}</div>
    <div class="intro-flash"></div>
  </div>
  <p class="intro-passer">Touche ou clic pour passer</p>`;

export function lancerIntro(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // `?intro=0` dans l'URL saute l'intro : utile en développement, où la page
  // se recharge des dizaines de fois par séance.
  if (new URLSearchParams(location.search).get('intro') === '0') return;

  const racine = document.createElement('section');
  racine.id = 'intro';
  racine.setAttribute('aria-label', 'Introduction');
  racine.innerHTML = HTML;
  for (const [cle, valeur] of Object.entries(TEMPS)) racine.style.setProperty(`--t-${cle}`, `${valeur}s`);
  for (const [cle, valeur] of Object.entries(DUREES)) racine.style.setProperty(`--d-${cle}`, `${valeur}s`);
  racine.style.setProperty('--d-sortie', `${SORTIE}s`);

  // Lignes de vitesse : position et décalage tirés une fois pour toutes,
  // l'animation CSS les fait ensuite défiler en boucle sans JS.
  const lignes = racine.querySelector<HTMLElement>('.intro-lignes')!;
  for (let i = 0; i < 18; i++) {
    const ligne = document.createElement('span');
    ligne.style.top = `${4 + Math.random() * 92}%`;
    ligne.style.width = `${12 + Math.random() * 22}vw`;
    ligne.style.animationDelay = `${-Math.random() * .4}s`;
    ligne.style.opacity = `${.35 + Math.random() * .65}`;
    lignes.appendChild(ligne);
  }
  document.body.appendChild(racine);

  let son: BandeSon | null = null;
  let etat: 'porte' | 'joue' | 'fini' = 'porte';

  const retirer = (): void => {
    if (etat === 'fini') return;
    etat = 'fini';
    removeEventListener('keydown', geste, true);
    removeEventListener('pointerdown', geste, true);
    racine.remove();
  };
  racine.addEventListener('animationend', (event) => {
    if (event.target === racine && (event.animationName === 'intro-sortie' || event.animationName === 'intro-passe')) retirer();
  });

  // Écouteur en phase de CAPTURE sur window, qui arrête la propagation :
  // pendant l'intro, aucune touche ne doit atteindre le jeu. Si le
  // chargement finit avant la fin de l'animation, le clavier du jeu est déjà
  // branché, et l'Entrée qui sert à passer l'intro lançait la balade libre
  // derrière elle (et la musique du jeu par-dessus la bande-son).
  // `stopImmediatePropagation` et non `stopPropagation` : un événement visant
  // window lui-même ne traverse aucune phase, la simple propagation arrêtée
  // laissait passer les autres écouteurs de window, dont celui du clavier.
  function geste(event: Event): void {
    event.stopImmediatePropagation();
    if (event instanceof KeyboardEvent && (event.repeat || event.metaKey || event.ctrlKey)) return;
    if (etat === 'porte') {
      etat = 'joue';
      son = new BandeSon();
      racine.classList.add('joue');
      // Le son part à l'image où les animations démarrent réellement : si le
      // fil principal est occupé par le chargement au moment du geste, le
      // style n'est recalculé qu'à la prochaine image.
      requestAnimationFrame(() => son?.jouer());
      // Filet de sécurité : `animationend` n'arrive pas si l'onglet est
      // masqué pendant l'intro.
      setTimeout(retirer, (TEMPS.fin + SORTIE + 1) * 1000);
    } else if (etat === 'joue') {
      racine.classList.add('passe');
      son?.couper();
      setTimeout(retirer, 800);
    }
  }
  addEventListener('keydown', geste, true);
  addEventListener('pointerdown', geste, true);
}

// Bande-son synthétisée : passages de voitures avec effet Doppler, montée de
// bruit avant l'impact, coup de grosse caisse, accord de synthé et arpège.
class BandeSon {
  private readonly ctx = new AudioContext();
  private readonly bus: GainNode;
  private readonly reverbe: GainNode;
  private readonly bruit: AudioBuffer;

  constructor() {
    const ctx = this.ctx;
    // Compresseur en bout de chaîne : l'impact empile une dizaine de voix,
    // il évite la saturation sans baisser le reste.
    const compresseur = ctx.createDynamicsCompressor();
    compresseur.threshold.value = -14;
    compresseur.ratio.value = 4;
    compresseur.connect(ctx.destination);
    this.bus = ctx.createGain();
    this.bus.gain.value = .8;
    this.bus.connect(compresseur);

    this.bruit = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const donnees = this.bruit.getChannelData(0);
    for (let i = 0; i < donnees.length; i++) donnees[i] = Math.random() * 2 - 1;

    // Réverbération à réponse impulsionnelle générée (bruit à décroissance
    // exponentielle sur 2,4 s) : donne de l'espace à l'impact sans fichier.
    const duree = ctx.sampleRate * 2.4;
    const impulsion = ctx.createBuffer(2, duree, ctx.sampleRate);
    for (let canal = 0; canal < 2; canal++) {
      const d = impulsion.getChannelData(canal);
      for (let i = 0; i < duree; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / duree) ** 3;
    }
    const convolveur = ctx.createConvolver();
    convolveur.buffer = impulsion;
    this.reverbe = ctx.createGain();
    this.reverbe.gain.value = .35;
    this.reverbe.connect(convolveur).connect(this.bus);
  }

  jouer(): void {
    void this.ctx.resume();
    const t0 = this.ctx.currentTime + .02;
    this.nappe(t0, t0 + TEMPS.impact);
    this.passage(t0 + TEMPS.passage1, DUREES.passage1, 1, 150, .5);
    this.passage(t0 + TEMPS.passage2, DUREES.passage2, -1, 190, .38);
    this.passage(t0 + TEMPS.passage3, DUREES.passage3, 1, 230, .22);
    this.montee(t0 + TEMPS.passage3 + .1, t0 + TEMPS.impact);
    this.impact(t0 + TEMPS.impact);
    this.passage(t0 + TEMPS.passageFinal, DUREES.passageFinal, 1, 170, .45);
  }

  couper(): void {
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0, t, .08);
    setTimeout(() => void this.ctx.close(), 700);
  }

  private source(): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = this.bruit;
    source.loop = true;
    return source;
  }

  private osc(type: OscillatorType, frequence: number, debut: number, fin: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = frequence;
    o.start(debut);
    o.stop(fin);
    return o;
  }

  // Grondement sourd sous la première partie, coupé net à l'impact pour que
  // le silence d'une fraction de seconde fasse ressortir le coup.
  private nappe(debut: number, fin: number): void {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(.0001, debut);
    gain.gain.exponentialRampToValueAtTime(.14, debut + .6);
    gain.gain.setValueAtTime(.14, fin - .05);
    gain.gain.linearRampToValueAtTime(0, fin);
    const filtre = this.ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.value = 260;
    this.osc('sawtooth', 55, debut, fin).connect(filtre);
    this.osc('sine', 41.2, debut, fin).connect(filtre);
    filtre.connect(gain).connect(this.bus);
  }

  // Une voiture qui passe : moteur en dent de scie dont la hauteur chute
  // au croisement (Doppler, d'environ une quinte), souffle d'air filtré, et
  // panoramique d'un côté à l'autre dans le sens de la traversée.
  private passage(t: number, d: number, sens: number, hauteur: number, volume: number): void {
    const ctx = this.ctx;
    const milieu = t + d * .48;
    const fin = t + d * 1.25;
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-sens, t);
    pan.pan.linearRampToValueAtTime(sens, t + d);
    const env = ctx.createGain();
    env.gain.setValueAtTime(.0001, t);
    env.gain.exponentialRampToValueAtTime(volume, milieu);
    env.gain.exponentialRampToValueAtTime(.0001, fin);
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.frequency.setValueAtTime(600, t);
    filtre.frequency.exponentialRampToValueAtTime(3400, milieu);
    filtre.frequency.exponentialRampToValueAtTime(480, fin);
    for (const [type, facteur] of [['sawtooth', 1], ['square', .5], ['sawtooth', 1.007]] as const) {
      const o = this.osc(type, hauteur * facteur, t, fin);
      o.frequency.setValueAtTime(hauteur * facteur, t);
      o.frequency.linearRampToValueAtTime(hauteur * facteur * 1.12, milieu - d * .04);
      o.frequency.exponentialRampToValueAtTime(hauteur * facteur * .64, milieu + d * .14);
      o.frequency.linearRampToValueAtTime(hauteur * facteur * .56, fin);
      o.connect(filtre);
    }
    const souffle = this.source();
    const passeBande = ctx.createBiquadFilter();
    passeBande.type = 'bandpass';
    passeBande.frequency.value = 1400;
    passeBande.Q.value = .6;
    const gainSouffle = ctx.createGain();
    gainSouffle.gain.value = .7;
    souffle.connect(passeBande).connect(gainSouffle).connect(env);
    souffle.start(t);
    souffle.stop(fin);
    filtre.connect(env);
    env.connect(pan);
    pan.connect(this.bus);
    pan.connect(this.reverbe);
  }

  // Montée avant l'impact : bruit dont la bande grimpe de 300 à 6 000 Hz,
  // doublé d'un sifflement qui monte de trois octaves.
  private montee(debut: number, fin: number): void {
    const ctx = this.ctx;
    const bruit = this.source();
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'bandpass';
    filtre.Q.value = 3;
    filtre.frequency.setValueAtTime(300, debut);
    filtre.frequency.exponentialRampToValueAtTime(6000, fin);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(.0001, debut);
    gain.gain.exponentialRampToValueAtTime(.4, fin - .02);
    gain.gain.linearRampToValueAtTime(0, fin);
    bruit.connect(filtre).connect(gain).connect(this.bus);
    bruit.start(debut);
    bruit.stop(fin);
    const sifflet = this.osc('sine', 200, debut, fin);
    sifflet.frequency.exponentialRampToValueAtTime(1600, fin);
    const gainSifflet = ctx.createGain();
    gainSifflet.gain.setValueAtTime(.0001, debut);
    gainSifflet.gain.exponentialRampToValueAtTime(.07, fin - .02);
    gainSifflet.gain.linearRampToValueAtTime(0, fin);
    sifflet.connect(gainSifflet).connect(this.bus);
  }

  private impact(t: number): void {
    const ctx = this.ctx;
    // Grosse caisse : sinus qui plonge de 150 à 40 Hz en 0,35 s.
    const caisse = this.osc('sine', 150, t, t + .7);
    caisse.frequency.exponentialRampToValueAtTime(40, t + .35);
    const gainCaisse = ctx.createGain();
    gainCaisse.gain.setValueAtTime(1, t);
    gainCaisse.gain.exponentialRampToValueAtTime(.001, t + .65);
    caisse.connect(gainCaisse).connect(this.bus);
    // Claquement : bruit passe-haut très court, envoyé dans la réverbération.
    const claque = this.source();
    const passeHaut = ctx.createBiquadFilter();
    passeHaut.type = 'highpass';
    passeHaut.frequency.value = 1800;
    const gainClaque = ctx.createGain();
    gainClaque.gain.setValueAtTime(.55, t);
    gainClaque.gain.exponentialRampToValueAtTime(.001, t + .3);
    claque.connect(passeHaut).connect(gainClaque);
    gainClaque.connect(this.bus);
    gainClaque.connect(this.reverbe);
    claque.start(t);
    claque.stop(t + .35);

    // Accord de ré mineur 9 (ré, fa, la, do, mi) en dents de scie désaccordées
    // par paires, filtre qui se referme sur 2,2 s : le « stab » synthwave.
    const filtre = ctx.createBiquadFilter();
    filtre.type = 'lowpass';
    filtre.Q.value = 4;
    filtre.frequency.setValueAtTime(5200, t);
    filtre.frequency.exponentialRampToValueAtTime(650, t + 2.2);
    const gainAccord = ctx.createGain();
    gainAccord.gain.setValueAtTime(.0001, t);
    gainAccord.gain.exponentialRampToValueAtTime(.32, t + .01);
    gainAccord.gain.exponentialRampToValueAtTime(.12, t + 1.1);
    gainAccord.gain.exponentialRampToValueAtTime(.0001, t + 3.4);
    for (const frequence of [73.42, 146.83, 174.61, 220, 261.63, 329.63]) {
      for (const desaccord of [-9, 9]) {
        const o = this.osc('sawtooth', frequence, t, t + 3.5);
        o.detune.value = desaccord;
        o.connect(filtre);
      }
    }
    filtre.connect(gainAccord);
    gainAccord.connect(this.bus);
    gainAccord.connect(this.reverbe);

    // Arpège montant en doubles croches à 140 bpm (0,107 s) : il porte le
    // titre jusqu'au dernier passage de voiture.
    const notes = [293.66, 349.23, 440, 523.25, 587.33, 523.25, 440, 349.23,
      349.23, 440, 523.25, 659.25, 698.46, 659.25, 523.25, 440,
      440, 523.25, 659.25, 880];
    notes.forEach((frequence, i) => {
      const debut = t + .32 + i * .107;
      const o = this.osc('square', frequence, debut, debut + .2);
      const passeBas = ctx.createBiquadFilter();
      passeBas.type = 'lowpass';
      passeBas.frequency.value = 2400;
      const g = ctx.createGain();
      g.gain.setValueAtTime(.0001, debut);
      g.gain.exponentialRampToValueAtTime(.075, debut + .008);
      g.gain.exponentialRampToValueAtTime(.0001, debut + .18);
      const pan = ctx.createStereoPanner();
      pan.pan.value = i % 2 ? .35 : -.35;
      o.connect(passeBas).connect(g).connect(pan);
      pan.connect(this.bus);
      pan.connect(this.reverbe);
    });
  }
}
