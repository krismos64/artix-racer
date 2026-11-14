import * as THREE from 'three/webgpu';
import { dot, float, mix, pass, renderOutput, screenUV, smoothstep, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { chromaticAberration } from 'three/addons/tsl/display/ChromaticAberrationNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import './style.css';
import { MotionArcade } from './arcade';
import { lancerIntro } from './intro';
import { FumeePneus } from './fumee';
import { ArcadeAudio } from './audio';
import { ArcadeCar, KeyboardInput } from './car';
import { DEFAULT_QUALITY, QUALITY, type QualityName } from './config';
import { GameSession, type GameMode } from './game';
import { nearestArtixPlace } from './lieux';
import { Minimap } from './minimap';
import { Missions } from './missions';
import { Obstacles, type Mobile, type PlaceGaree } from './obstacles';
// @ts-ignore : module JS hérité.
import { geometrieRoue } from './three-city/parkedcars.js';
import { Marcheur } from './pieton';
import { Police } from './police';
import type { ContexteMesure } from './profil';
import { TrafficSystem, type AgentCirculation } from './traffic';
import type { CityMapData } from './types';
import { construireVille } from './ville';
import { ArtixWorld } from './world';

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const loading = document.querySelector<HTMLElement>('#loading')!;
const loadingText = document.querySelector<HTMLElement>('#loading-text')!;
const loadingBar = document.querySelector<HTMLElement>('#loading-bar')!;
const speedEl = document.querySelector<HTMLElement>('#speed')!;
const fpsEl = document.querySelector<HTMLElement>('#fps')!;
const drawsEl = document.querySelector<HTMLElement>('#draws')!;
const meshesEl = document.querySelector<HTMLElement>('#meshes')!;
const memoryEl = document.querySelector<HTMLElement>('#memory')!;
const qualityEl = document.querySelector<HTMLElement>('#quality-label')!;
const startScreen = document.querySelector<HTMLElement>('#start-screen')!;
const pauseScreen = document.querySelector<HTMLElement>('#pause-screen')!;
const missionTitle = document.querySelector<HTMLElement>('#mission-title')!;
const missionDetail = document.querySelector<HTMLElement>('#mission-detail')!;
const missionProgress = document.querySelector<HTMLElement>('#mission-progress')!;
const scoreEl = document.querySelector<HTMLElement>('#score')!;
const surfaceStatus = document.querySelector<HTMLElement>('#surface-status')!;
const streetNameEl = document.querySelector<HTMLElement>('#street-name')!;
const placeNameEl = document.querySelector<HTMLElement>('#place-name')!;
const boostBar = document.querySelector<HTMLElement>('#boost-bar')!;
const minimapCanvas = document.querySelector<HTMLCanvasElement>('#minimap')!;
const hudElements = [...document.querySelectorAll<HTMLElement>('.hud')];
const telemetryEl = document.querySelector<HTMLElement>('.telemetry')!;

interface MemoryPerformance extends Performance {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
}

function progress(percent: number, message: string): Promise<void> {
  loadingBar.style.width = `${percent}%`;
  loadingText.textContent = message;
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function loadJson<T>(name: string, required = false): Promise<T | null> {
  try {
    const response = await fetch(`/data/${name}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } catch (error) {
    if (required) throw new Error(`Impossible de charger ${name}: ${String(error)}`);
    console.warn(`Donnée facultative ignorée : ${name}`, error);
    return null;
  }
}

// Les intensités de lumière ont été réglées sous Babylon, dont le PBR ne
// divise pas le diffus par π. Three le fait : à réglage égal, une lumière y
// éclaire π fois moins. Toutes les intensités d'origine passent par ce facteur.
const PI = Math.PI;

// ---- Ciel HDRI et soleil ---------------------------------------------------
// Panoramas Poly Haven (CC0) préparés par scripts/ciel-soleil.mjs, qui
// plafonne le disque solaire (sinon il entre dans l'éclairage d'ambiance et
// éclaire tout sans ombre, en doublant la lumière directionnelle) et mesure
// sa position dans l'image. Le même panorama sert de fond et d'éclairage
// d'ambiance : les nuages visibles sont ceux qui se reflètent sur la
// carrosserie, et la lumière directionnelle est posée sous le soleil du
// panorama.
interface CielHdr {
  fichier: string;          // public/textures/ciel/<fichier>.hdr
  azimutImageDeg: number;   // colonne du soleil dans le panorama (0 à 360)
  elevationDeg: number;     // hauteur du soleil dans le panorama
}
const CIELS: Record<string, CielHdr> = {
  jour: { fichier: 'jour', azimutImageDeg: 215.7, elevationDeg: 48.9 },
  soir: { fichier: 'soir', azimutImageDeg: 215.9, elevationDeg: 6.2 },
  nuit: { fichier: 'nuit', azimutImageDeg: 215.6, elevationDeg: 17.1 },
};

// Position (unitaire) d'un astre depuis son azimut boussole (0 = nord,
// 90 = est) et son élévation. Repère du jeu : +X est, +Z sud, Y haut.
function positionAstre(azimutDeg: number, elevationDeg: number): THREE.Vector3 {
  const a = azimutDeg * PI / 180, e = elevationDeg * PI / 180;
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

// Rotation (autour de Y) qui amène le soleil du panorama à l'azimut voulu.
// Three projette la colonne u d'un panorama équirectangulaire sur l'angle
// (u - 0,5) × 2π mesuré de +X vers +Z, et `backgroundRotation` tourne le
// ciel dans le sens INVERSE de l'angle donné. Mesuré en jeu le 14 novembre
// 2026 : avec le sens +1, le soleil du soir apparaissait au nord (-90°) au
// lieu de l'ouest-sud-ouest (165°), ses ombres partant pourtant vers l'est.
const SENS_ROTATION_CIEL = -1;
const DECALAGE_PANORAMA = .5;
function rotationCiel(ciel: CielHdr, azimutDeg: number): number {
  const p = positionAstre(azimutDeg, 0);
  const cible = Math.atan2(p.z, p.x);
  const image = (ciel.azimutImageDeg / 360 - DECALAGE_PANORAMA) * PI * 2;
  return SENS_ROTATION_CIEL * (cible - image);
}

// ---- Chaîne des Pyrénées au sud ------------------------------------------
// Le fond est peint, pas modelé : un panorama des Pyrénées généré par Codex
// (fond vert détouré), qui porte l'étagement des plans et la brume. C'est la
// perspective atmosphérique, et non le relief, qui donne l'échelle à une
// montagne lointaine.
//
// Un ARC de cylindre centré sur la caméra, et non un plan : un plan de
// 3 600 m vu de biais avait ses côtés à plus de 2 000 m, coupés net par le
// plan lointain. Sur un arc, chaque point de crête est à distance constante.
const ARC_FOND = 110 * PI / 180;     // ouverture, de part et d'autre du sud
const RAYON_FOND = 1380;
// Répétitions du panorama sur l'arc, en miroir : 3,5 fois sur 110°, soit 31°
// et 760 m d'arc par image. Étirée d'un seul tenant, elle aplatissait les pics.
const REPET_PANORAMA = 3.5;

function createBackdrop(scene: THREE.Scene): { materiau: THREE.MeshBasicMaterial; noeud: THREE.Group } {
  const texture = new THREE.TextureLoader().load('/textures/fond/pyrenees.png');
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.repeat.x = REPET_PANORAMA;
  // Le brouillard (fin à 980 m en Équilibré) noierait un fond situé à
  // 1 380 m : la brume est peinte dans l'image. Pas d'écriture de
  // profondeur, il se dessine derrière tout le reste.
  const materiau = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, fog: false,
    side: THREE.DoubleSide, vertexColors: true,
  });
  // Hauteur tirée du rapport de l'image (2 172 × 724) sur 760 m d'arc par
  // répétition, pour garder des pics à leurs proportions.
  const hauteur = (RAYON_FOND * ARC_FOND / REPET_PANORAMA) * (724 / 2172);
  // Le pied passe SOUS la ligne d'horizon, sinon la bande transparente du bas
  // laisse voir les crêtes flotter en l'air.
  const yBas = -120, yHaut = hauteur - 120;
  const SEGMENTS = 96;
  const positions: number[] = [], uvs: number[] = [], couleurs: number[] = [], indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    const phi = (u - .5) * ARC_FOND;
    const x = RAYON_FOND * Math.sin(phi), z = RAYON_FOND * Math.cos(phi);
    positions.push(x, yBas, z, x, yHaut, z);
    // v = 0 au pied, 1 en haut : bas et haut de l'image.
    uvs.push(u, 0, u, 1);
    // Fondu des deux extrémités de l'arc par l'alpha de sommet : la
    // répétition en miroir interdit de l'estomper dans l'image.
    const fondu = Math.min(1, Math.min(u, 1 - u) / .1);
    couleurs.push(1, 1, 1, fondu, 1, 1, 1, fondu);
    if (i < SEGMENTS) {
      const k = i * 2;
      indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geometrie = new THREE.BufferGeometry();
  geometrie.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometrie.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometrie.setAttribute('color', new THREE.Float32BufferAttribute(couleurs, 4));
  geometrie.setIndex(indices);
  const arc = new THREE.Mesh(geometrie, materiau);
  arc.name = 'pyrenees';
  // Toujours dans le champ (il suit la caméra) : inutile de le tester.
  arc.frustumCulled = false;
  arc.renderOrder = -10;
  const noeud = new THREE.Group();
  noeud.name = 'fond-pyrenees';
  noeud.add(arc);
  scene.add(noeud);
  return { materiau, noeud };
}

async function start(): Promise<void> {
  await progress(4, 'Initialisation du rendu…');
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  await renderer.init();
  renderer.setSize(innerWidth, innerHeight, false);
  // Échelle 1 = un pixel de rendu par pixel CSS, comme avant le port.
  renderer.setPixelRatio(1 / QUALITY[DEFAULT_QUALITY].hardwareScaling);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  // Repère main droite, Z vers le sud : celui des données d'Artix et de
  // Three, sans aucune conversion.
  const scene = new THREE.Scene();
  const brouillard = new THREE.Fog(new THREE.Color(.64, .75, .83),
    QUALITY[DEFAULT_QUALITY].fogStart, QUALITY[DEFAULT_QUALITY].fogEnd);
  scene.fog = brouillard;
  scene.background = new THREE.Color(.55, .70, .84);
  (window as any).__scene = scene;
  (window as any).__renderer = renderer;
  (window as any).__THREE = THREE;

  const { materiau: pyrenees, noeud: fondPyrenees } = createBackdrop(scene);

  // Ambiante hémisphérique basse : c'est le panorama qui porte la lumière du
  // ciel, avec ses couleurs. Trop forte, elle éclaire toutes les faces
  // pareil et aplatit la ville.
  const ambient = new THREE.HemisphereLight(0xffffff, 0xffffff, .25 * PI);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2 * PI);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(QUALITY[DEFAULT_QUALITY].shadowMap);
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .05;
  // Ombres en cascade : une carte par tranche de profondeur, jusqu'à 330 m.
  // Au-delà, le brouillard a déjà effacé le contraste d'une ombre. La
  // lumière de chaque cascade recule de `lightMargin` derrière sa tranche :
  // la portée de la caméra d'ombre doit couvrir ce recul plus la profondeur
  // de la tranche, sinon les ombres lointaines sont coupées.
  sun.shadow.camera.far = 1400;
  const AVEC_CASCADES = new URLSearchParams(location.search).get('csm') !== '0';
  let cascades: CSMShadowNode | null = null;
  if (AVEC_CASCADES) {
    cascades = new CSMShadowNode(sun, {
      cascades: QUALITY[DEFAULT_QUALITY].cascades, maxFar: 330, mode: 'practical', lightMargin: 220,
    });
    sun.shadow.shadowNode = cascades;
  } else {
    // Repli de diagnostic (`?csm=0`) : une seule carte de 300 m de côté.
    const c = sun.shadow.camera;
    c.left = c.bottom = -150;
    c.right = c.top = 150;
    c.updateProjectionMatrix();
  }
  scene.add(sun, sun.target);

  // Textures de ciel chargées à la demande et gardées : le premier passage
  // dans une ambiance coûte le chargement et le préfiltrage, les suivants
  // sont immédiats.
  const cielsCharges = new Map<string, Promise<THREE.DataTexture>>();
  const obtenirCiel = (nom: string): Promise<THREE.DataTexture> => {
    let promesse = cielsCharges.get(nom);
    if (!promesse) {
      promesse = new HDRLoader().loadAsync(`/textures/ciel/${CIELS[nom].fichier}.hdr`).then((texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        return texture;
      });
      cielsCharges.set(nom, promesse);
    }
    return promesse;
  };
  let cielGeneration = 0;

  // ---- Ambiances d'éclairage (touche L) ----------------------------------
  // Chaque ambiance a son panorama HDR : le fond, l'éclairage d'ambiance et
  // la lumière directionnelle en dérivent ensemble. La fin de journée est la
  // plus payante : le soleil rasant allonge les ombres dans les rues.
  interface Ambiance {
    nom: string;
    ciel: keyof typeof CIELS;
    azimut: number;        // azimut boussole du soleil (ou de la lune)
    elevationMin: number;  // plancher : un soleil à 6° donne des ombres inexploitables
    sunDiffuse: [number, number, number];
    sunIntensity: number;
    envIntensity: number;  // poids de l'éclairage d'ambiance du panorama
    cielNiveau: number;    // clarté du fond de ciel affiché
    ambientIntensity: number;
    ambientDiffuse: [number, number, number];
    ambientGround: [number, number, number];
    fog: [number, number, number];
    exposure: number;
    darkness: number;      // part de lumière qui subsiste dans l'ombre
    fenetres: number;      // intensité d'émission des vitrages
  }
  const AMBIANCES: Ambiance[] = [
    {
      nom: 'Midi',
      ciel: 'jour',
      // Début d'après-midi d'été : soleil haut au sud-sud-ouest.
      azimut: 205,
      elevationMin: 0,
      sunDiffuse: [1, .95, .88],
      // Soleil fort, ambiance basse : c'est l'écart entre les deux qui fait
      // lire les ombres. À 2,0 contre 1,5 d'ambiance (réglage d'avant le
      // port), l'ombre d'un platane se devinait à peine sur la chaussée.
      sunIntensity: 2.9,
      envIntensity: .9,
      cielNiveau: 1,
      ambientIntensity: .1,
      ambientDiffuse: [.76, .84, .92],
      ambientGround: [.28, .31, .25],
      fog: [.70, .78, .86],
      exposure: 1,
      darkness: 0,
      fenetres: 0,
    },
    {
      nom: 'Fin de journée',
      ciel: 'soir',
      // Soleil couchant à l'ouest-sud-ouest ; le panorama le met à 6° au-dessus
      // de l'horizon, la lumière est relevée à 9° pour garder des ombres nettes.
      // Panorama pâle et très lumineux : dosé bas et exposé sous le jour,
      // sinon la fin de journée ressort plus blanche que midi.
      azimut: 255,
      elevationMin: 9,
      sunDiffuse: [1, .66, .40],
      sunIntensity: 2.4,
      envIntensity: .5,
      cielNiveau: .8,
      ambientIntensity: .08,
      ambientDiffuse: [.72, .62, .66],
      ambientGround: [.30, .25, .22],
      fog: [.74, .60, .50],
      exposure: .82,
      darkness: 0,
      fenetres: .12,
    },
    {
      nom: 'Nuit',
      ciel: 'nuit',
      // Clair de lune au sud-est, lumière froide très faible. Une ville
      // éclairée au sodium n'est jamais noire entre deux lampadaires :
      // l'ambiante remonte, avec un sol qui renvoie une teinte chaude.
      azimut: 150,
      elevationMin: 0,
      sunDiffuse: [.55, .65, .9],
      sunIntensity: .55,
      envIntensity: .40,
      cielNiveau: .55,
      ambientIntensity: .22,
      ambientDiffuse: [.42, .46, .62],
      ambientGround: [.22, .17, .13],
      fog: [.09, .10, .15],
      exposure: 1.05,
      darkness: .5,
      fenetres: .85,
    },
  ];
  let ambianceIndex = 0;
  const directionSoleil = new THREE.Vector3(0, 1, 0);
  // Renseignés après la construction de la ville et du véhicule.
  let carNuit: { setNight(active: boolean): void } | null = null;
  let lanternes: THREE.MeshStandardMaterial | null = null;
  let vitrages: THREE.MeshStandardMaterial | null = null;
  let foyersLampes: Array<{ x: number; y: number; z: number }> = [];
  const lampesPool: THREE.PointLight[] = [];
  let lampesGlow: THREE.Mesh | null = null;
  let nuitActive = false;
  let lampesTimer = 9;
  const INTENSITE_LAMPE = 260 * PI;
  // Projecteurs de phares : une seule paire pour tout le jeu, accrochée au
  // véhicule conduit. Faisceau étroit, quasi horizontal : l'énergie se
  // dépose entre quinze et trente-cinq mètres devant la voiture.
  const INTENSITE_PHARE = 1500;
  const phares = new THREE.Group();
  phares.name = 'projecteurs';
  const projecteurs: THREE.SpotLight[] = [];
  for (const cote of [-1, 1]) {
    const phare = new THREE.SpotLight(0xffe9c0, 0, 70, .29, .5, 2);
    phare.position.set(cote * .58, .68, 0);
    phare.target.position.set(cote * .58 + cote * .8, .68 - 1.1, 20);
    phares.add(phare, phare.target);
    projecteurs.push(phare);
  }
  // Exposition de base. L'ACES de Three multiplie l'entrée par 1/0,6 avant
  // sa courbe, celui de Babylon non : à exposition égale, l'image sortait
  // 1,67 fois plus claire (planche de bord blanche en vue conducteur).
  const EXPOSITION = .94 * .6;

  const applyAmbiance = (index: number): void => {
    const a = AMBIANCES[index];
    const ciel = CIELS[a.ciel];
    const astre = positionAstre(a.azimut, Math.max(ciel.elevationDeg, a.elevationMin));
    // La direction de la lumière va de `position` vers `target`.
    directionSoleil.copy(astre);
    sun.position.copy(sun.target.position).addScaledVector(astre, 400);
    sun.color.setRGB(...a.sunDiffuse);
    sun.intensity = a.sunIntensity * PI;
    sun.shadow.intensity = 1 - a.darkness;
    // Chaque cascade tient une COPIE de l'ombre du soleil, prise à sa
    // création : le réglage doit lui être recopié.
    for (const lumiere of cascades?.lights ?? []) {
      if (lumiere.shadow) lumiere.shadow.intensity = 1 - a.darkness;
    }
    ambient.intensity = a.ambientIntensity * PI;
    ambient.color.setRGB(...a.ambientDiffuse);
    ambient.groundColor.setRGB(...a.ambientGround);
    brouillard.color.setRGB(...a.fog);
    // Panorama des Pyrénées voilé de la teinte de l'air : bleuté le jour,
    // doré au soir, presque éteint la nuit.
    pyrenees.color.setRGB(Math.min(1, a.fog[0] * 1.3), Math.min(1, a.fog[1] * 1.3), Math.min(1, a.fog[2] * 1.3));
    renderer.toneMappingExposure = a.exposure * EXPOSITION;
    scene.environmentIntensity = a.envIntensity;
    scene.backgroundIntensity = a.cielNiveau;
    // Vitrages : leur émission raconte les pièces éclairées à la tombée du jour.
    if (vitrages) {
      vitrages.emissive.setRGB(1, .78, .5);
      vitrages.emissiveIntensity = a.fenetres;
    }
    // Éclairage nocturne : phares et feux du véhicule, lanternes émissives et
    // pool de lampes de rue autour du joueur. Lampes et projecteurs restent
    // PRÉSENTS le jour, à intensité nulle : changer le nombre de lumières
    // visibles fait recompiler tous les matériaux, soit une à trois secondes
    // de gel au premier passage en nuit (constaté le 14 novembre 2026).
    nuitActive = a.nom === 'Nuit';
    carNuit?.setNight(nuitActive);
    if (lanternes) {
      lanternes.emissive.set('#ffc878');
      lanternes.emissiveIntensity = nuitActive ? 1.7 : 0;
    }
    if (!nuitActive) for (const lampe of lampesPool) lampe.intensity = 0;
    for (const phare of projecteurs) phare.intensity = nuitActive ? INTENSITE_PHARE : 0;
    if (lampesGlow) lampesGlow.visible = nuitActive;
    lampesTimer = 9;
    // Panorama : tourné pour que son soleil tombe à l'azimut de la lumière,
    // posé en fond et en éclairage d'ambiance.
    const rotation = rotationCiel(ciel, a.azimut);
    const generation = ++cielGeneration;
    obtenirCiel(a.ciel).then((texture) => {
      if (generation !== cielGeneration) return;
      scene.background = texture;
      scene.environment = texture;
      scene.backgroundRotation.set(0, rotation, 0);
      scene.environmentRotation.set(0, rotation, 0);
    }).catch((error) => console.warn('Ciel indisponible :', error));
    console.info(`Ambiance : ${a.nom}`);
  };

  // Champ vertical de 1,03 rad, soit 59°.
  const camera = new THREE.PerspectiveCamera(1.03 * 180 / PI, innerWidth / innerHeight, .35, 1800);
  camera.position.set(0, 8, -12);
  scene.add(camera);
  (window as any).__camera = camera;

  // ---- Post-traitement ----------------------------------------------------
  // Chaîne : scène en HDR linéaire, occlusion ambiante (profil Qualité),
  // bloom, tone mapping ACES, puis en espace d'affichage aberration
  // chromatique, étalonnage, vignette et anticrénelage FXAA.
  const pipeline = new THREE.RenderPipeline(renderer);
  pipeline.outputColorTransform = false;
  // Force de l'aberration chromatique, pilotée par la couche arcade en
  // unités d'origine (6 au repos, 15 au plus fort).
  const effets = { aberration: 6 };
  const uAberration = uniform(.06);
  const construirePipeline = (profil: { ssao: boolean }, avecBloom: boolean): void => {
    const passe = pass(scene, camera);
    const couleur = passe.getTextureNode('output');
    let hdr: any = couleur;
    if (profil.ssao) {
      // Occlusion ambiante : elle assoit les bâtiments au sol et creuse les
      // angles de rue. Normales reconstruites depuis la profondeur, donc
      // sans seconde passe de géométrie.
      const occlusion = ao(passe.getTextureNode('depth'), null as any, camera);
      occlusion.radius.value = 2.5;
      occlusion.scale.value = 1.6;
      occlusion.resolutionScale = .5;
      // La carte brute est tramée (16 échantillons par pixel) : un flou
      // gaussien la lisse avant de l'appliquer.
      const lisse: any = gaussianBlur(occlusion.getTextureNode(), null as any, 3);
      // `?ao=voir` affiche la seule carte d'occlusion, pour la régler.
      if (new URLSearchParams(location.search).get('ao') === 'voir') {
        pipeline.outputNode = vec4(vec3(lisse.r), 1);
        pipeline.needsUpdate = true;
        return;
      }
      hdr = hdr.mul(vec4(vec3(lisse.r), 1));
    }
    if (avecBloom) hdr = hdr.add(bloom(couleur, .18, .5, .86));
    let image: any = renderOutput(hdr, THREE.ACESFilmicToneMapping, THREE.SRGBColorSpace);
    image = chromaticAberration(image, uAberration, vec2(.5, .5), float(1));
    // Étalonnage : contraste relevé et saturation d'un cran, l'équivalent
    // d'une LUT « film » sans fichier à charger.
    const luminance = dot(image.rgb, vec3(.2126, .7152, .0722));
    let rgb: any = mix(vec3(luminance), image.rgb, 1.1);
    rgb = rgb.sub(.5).mul(1.12).add(.5);
    // Vignette légère : trop forte, elle se lit comme un défaut d'optique.
    const centre = screenUV.sub(.5);
    const bord = smoothstep(float(.18), float(.62), dot(centre, centre).mul(1.6));
    rgb = rgb.mul(mix(float(1), float(.72), bord));
    pipeline.outputNode = fxaa(vec4(rgb, image.a));
    pipeline.needsUpdate = true;
  };

  // Diagnostic depuis la console : __regarder(x, y, z) force la caméra à
  // viser cette direction (repérage du soleil du panorama), __regarder()
  // rend la main.
  let regardDebug: THREE.Vector3 | null = null;
  (window as any).__regarder = (x?: number, y?: number, z?: number): void => {
    regardDebug = x == null ? null : new THREE.Vector3(x, y ?? 0, z ?? 0);
  };

  // __camLibre(x, y, z, cx, cy, cz) pose la caméra en (x, y, z) visant
  // (cx, cy, cz), pour inspecter un point de la ville ; __camLibre() rend
  // la main.
  let camLibre: { oeil: THREE.Vector3; cible: THREE.Vector3 } | null = null;
  (window as any).__camLibre = (x?: number, y = 0, z = 0, cx = 0, cy = 0, cz = 0): void => {
    camLibre = x == null ? null : { oeil: new THREE.Vector3(x, y, z), cible: new THREE.Vector3(cx, cy, cz) };
  };

  await progress(12, 'Chargement des données réelles d’Artix…');
  const [rawOsm, rawBati, rawPoi, rawRoofs, rawRoofsLegacy, rawFacades, rawPanoramax] = await Promise.all([
    loadJson<any>('artix-osm.json', true),
    loadJson<any>('artix-bdtopo.json', true),
    loadJson<any>('artix-poi.json'),
    loadJson<any>('artix-toits-lidar.json'),
    loadJson<any>('artix-toitures.json'),
    loadJson<any>('artix-facades.json'),
    loadJson<any>('artix-panoramax.json'),
  ]);
  const rawFacadesPhoto = await loadJson<any>('artix-facades-photo.json');
  const rawSols = await loadJson<any>('artix-sols.json');
  const rawPoteaux = await loadJson<any>('artix-poteaux.json');
  const rawFacadesCentre = await loadJson<any>('artix-facades-centre.json');
  if (!rawOsm || !rawBati) throw new Error('Les données essentielles d’Artix sont absentes.');

  await progress(26, 'Construction de la ville…');
  const ville = await construireVille(scene, {
    osm: rawOsm,
    buildings: rawBati,
    poi: rawPoi,
    roofs: rawRoofs,
    roofsLegacy: rawRoofsLegacy,
    facades: rawFacades,
    panoramax: rawPanoramax,
    facadesPhoto: rawFacadesPhoto,
    sols: rawSols,
    poteaux: rawPoteaux,
    facadesCentre: rawFacadesCentre,
  }, Math.min(16, renderer.getMaxAnisotropy()), progress);
  const map = ville.data as CityMapData;
  (window as any).__ville = ville;
  const spawn = ville.spawn;

  await progress(72, 'Indexation du sol et des collisions…');
  // ArtixWorld ne dessine rien : il n'indexe que les requêtes de la boucle
  // de jeu (altitude, chaussée, nom de rue, collision).
  const world = new ArtixWorld(ville.terrain as any, map);

  await progress(82, 'Chargement du véhicule…');
  // `car` est le véhicule que le joueur conduit (ou vient de quitter).
  // `voitures` garde tous ceux qu'il a pris : la Ferrari, puis chaque
  // voiture garée dont il a pris le volant.
  let car = new ArcadeCar(scene, world, spawn);
  const voitures: ArcadeCar[] = [car];
  await car.loadModel();
  (window as any).__car = car;

  // Éclairage public nocturne : un pool de lampes réelles suit le véhicule et
  // se pose sur les foyers de lampadaires les plus proches ; les halos au sol
  // assurent la continuité au loin. Portée et intensité franches : à 70 cd
  // sur 30 m, seule une flaque au pied du mât s'allumait, alors qu'un bourg
  // éclairé au sodium se traverse sans phares.
  carNuit = { setNight: (active) => car.setNight(active) };
  lanternes = ville.lanternes;
  vitrages = ville.vitrages;
  foyersLampes = ville.foyers;
  for (let i = 0; i < 12; i++) {
    const lampe = new THREE.PointLight(0xffcf92, INTENSITE_LAMPE, 62, 2);
    lampe.name = `lampe-rue-${i}`;
    lampe.position.set(0, -100, 0);
    lampe.intensity = 0;
    scene.add(lampe);
    lampesPool.push(lampe);
  }
  // Projecteurs accrochés au nez du véhicule conduit.
  const accrocherPhares = (): void => {
    phares.position.z = car.demiLongueur - .12;
    car.root.add(phares);
  };
  accrocherPhares();

  // Flaques de lumière sous TOUS les lampadaires : sans elles, les rues au
  // loin restaient noires et les lampes semblaient s'allumer au passage du
  // joueur. Un seul maillage de disques à dégradé radial, en mélange
  // additif : des centaines de halos pour un appel de dessin.
  if (foyersLampes.length) {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const SEGMENTS = 12, RAYON = 11.5;
    for (const f of foyersLampes) {
      const solY = f.y - 6.9 + .07;
      const base = positions.length / 3;
      positions.push(f.x, solY, f.z);
      uvs.push(.5, .5);
      for (let sg = 0; sg <= SEGMENTS; sg++) {
        const a = (sg / SEGMENTS) * PI * 2;
        positions.push(f.x + Math.cos(a) * RAYON, solY, f.z + Math.sin(a) * RAYON);
        uvs.push(.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5);
        if (sg > 0) indices.push(base, base + sg, base + sg + 1);
      }
    }
    const geometrie = new THREE.BufferGeometry();
    geometrie.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometrie.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometrie.setIndex(indices);
    const taille = 128;
    const dessin = document.createElement('canvas');
    dessin.width = dessin.height = taille;
    const ctx = dessin.getContext('2d')!;
    const grad = ctx.createRadialGradient(taille / 2, taille / 2, 4, taille / 2, taille / 2, taille / 2);
    grad.addColorStop(0, 'rgba(255,214,150,0.95)');
    grad.addColorStop(.35, 'rgba(255,198,122,0.58)');
    grad.addColorStop(.7, 'rgba(255,186,104,0.22)');
    grad.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, taille, taille);
    lampesGlow = new THREE.Mesh(geometrie, new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(dessin), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: .5,
    }));
    lampesGlow.name = 'halos-lampadaires';
    lampesGlow.visible = false;
    scene.add(lampesGlow);
  }

  const input = new KeyboardInput();
  // Mode à pied (touche F) : le joueur descend de voiture, marche dans la
  // ville et remonte en revenant près de la portière.
  const marcheur = new Marcheur(scene, world);
  let aPied = false;
  const invite = document.createElement('div');
  invite.className = 'invite-action hud hidden';
  document.body.appendChild(invite);
  // Position et cap du joueur, qu'il conduise ou qu'il marche : la ville
  // vivante, les lampadaires, la minicarte et le HUD suivent ce point.
  const joueur = (): THREE.Vector3 => (aPied ? marcheur.root.position : car.root.position);
  const capJoueur = (): number => (aPied ? marcheur.heading : car.heading);
  // Obstacles solides : voitures garées, arbres, mâts de lampadaires, et
  // les véhicules que le joueur a laissés derrière lui.
  const places = (ville.parc?.places ?? []) as PlaceGaree[];
  const obstacles = new Obstacles(places, ville.troncs, [...ville.foyers, ...ville.poteaux], (x, z) => world.isOnRoad(x, z));
  world.obstacles = obstacles;
  let mobiles: Mobile[] = [];
  obstacles.mobiles = () => mobiles;
  const majMobiles = (): void => {
    // En voiture, celle qu'on conduit ne se bloque pas elle-même.
    mobiles = voitures.filter((v) => aPied || v !== car)
      .map((v) => ({ x: v.root.position.x, z: v.root.position.z, r: 1.25 }));
  };
  const roueFlotte = ville.flotte ? (geometrieRoue() as THREE.BufferGeometry) : null;
  const sol = new THREE.Vector3();

  // Missions de livraison (touche G), en balade libre.
  const missions = new Missions(scene, map.roads, (x, z) => world.surfaceY(x, z));

  // Police : étoiles de recherche, patrouilles, arrestation.
  const police = new Police(scene, world, ville.trafic?.noeuds ?? [],
    ville.flotte?.berline ?? null, ville.flotte?.palette ?? null, roueFlotte);
  (window as any).__police = police;
  const etoilesEl = document.createElement('span');
  etoilesEl.className = 'recherche';
  const etatEl = document.createElement('span');
  etatEl.className = 'etat-voiture';
  scoreEl.parentElement?.append(etoilesEl, etatEl);
  const voileArret = document.createElement('div');
  voileArret.className = 'arrestation';
  voileArret.textContent = 'ARRÊTÉ';
  document.body.appendChild(voileArret);
  let arretEnCours = 0;
  let appuisAvant = 0;
  let klaxonDans = 0;
  let etoilesAvant = 0;

  // Véhicule à portée du marcheur : d'abord ceux qu'il a déjà conduits,
  // sinon une voiture garée dont le modèle est chargé.
  const vehiculeAPortee = (): { voiture?: ArcadeCar; place?: PlaceGaree; agent?: AgentCirculation } | null => {
    const p = marcheur.root.position;
    let voiture: ArcadeCar | undefined, distance = 3.4;
    for (const v of voitures) {
      const d = sol.copy(v.root.position).setY(p.y).distanceTo(p);
      if (d < distance) { distance = d; voiture = v; }
    }
    if (voiture) return { voiture };
    const place = roueFlotte ? obstacles.vehiculeProche(p.x, p.z, 1.5) : null;
    if (place && ville.flotte?.[place.type]) return { place };
    // Véhicule de la circulation, à l'arrêt (il freine devant un piéton) et
    // à moins de 3 m.
    if (!roueFlotte || !ville.trafic) return null;
    for (const agent of ville.circulation) {
      if (agent.retire || agent._px == null || agent._pz == null || !agent.type) continue;
      if (agent.vitesse < 1.5 && Math.hypot(agent._px - p.x, agent._pz - p.z) < 3.2 && ville.flotte?.[agent.type]) return { agent };
    }
    return null;
  };

  const basculerAPied = (): void => {
    if (!aPied) {
      // On ne saute pas d'une voiture lancée : il faut être presque arrêté.
      if (car.vitesseSol > 2.5) return;
      car.arreter();
      // Portière conducteur à gauche : (cos cap, -sin cap). Si un mur ou un
      // obstacle s'y trouve, on descend de l'autre côté.
      const p = car.root.position;
      const gx = Math.cos(car.heading), gz = -Math.sin(car.heading);
      const cote = world.bloque(p.x + gx * 1.9, p.z + gz * 1.9, .35) ? -1 : 1;
      marcheur.placer(p.x + gx * 1.9 * cote, p.z + gz * 1.9 * cote, car.heading);
      marcheur.root.visible = true;
      aPied = true;
      if (cameraMode === 1) car.setVueCabine(false);
      majMobiles();
      audio.portiere();
      return;
    }
    const cible = vehiculeAPortee();
    if (!cible) return;
    let suivante = cible.voiture;
    if (cible.place && roueFlotte) {
      // Voiture garée : son instance est effacée et un vrai véhicule conduit
      // prend sa place, même modèle, même teinte, même cap.
      const place = cible.place;
      suivante = new ArcadeCar(scene, world, { x: place.x, z: place.z, heading: place.cap });
      suivante.habillerFlotte(ville.flotte![place.type], ville.flotte!.palette, place.couleur,
        place.echelle ?? 1, roueFlotte, place.type);
      ville.parc!.retirer(place);
      voitures.push(suivante);
      // Voiture garée : un vol discret, une demi-étoile.
      police.signaler(.5);
    } else if (cible.agent && roueFlotte && ville.trafic) {
      // Véhicule de la circulation : il quitte le trafic, un véhicule
      // conduit le remplace au même endroit, même cap, même teinte.
      const agent = cible.agent;
      const x = agent._px!, z = agent._pz!;
      const cap = agent.capLisse ?? Math.atan2(agent._ux ?? 0, agent._uz ?? 1);
      const couleur = ville.trafic.retirer(agent) as number;
      suivante = new ArcadeCar(scene, world, { x, z, heading: cap });
      suivante.habillerFlotte(ville.flotte![agent.type!], ville.flotte!.palette, couleur, 1, roueFlotte, agent.type);
      voitures.push(suivante);
      // Le conducteur, éjecté par la portière gauche, s'enfuit en courant.
      ville.passants?.apparaitre(x + Math.cos(cap) * 1.8, z - Math.sin(cap) * 1.8);
      // Prendre une voiture à son conducteur : une étoile.
      police.signaler(1);
    }
    if (!suivante) return;
    // L'ancienne voiture éteint ses phares : chaque projecteur allumé compte
    // dans le plafond de lumières des matériaux.
    if (suivante !== car) car.setNight(false);
    car = suivante;
    (window as any).__car = car;
    accrocherPhares();
    car.setNight(nuitActive);
    marcheur.root.visible = false;
    aPied = false;
    car.setVueCabine(cameraMode === 1);
    majMobiles();
    audio.portiere();
  };
  const audio = new ArcadeAudio();
  (window as any).__audio = audio;
  const traffic = new TrafficSystem(ville.circulation);
  const session = new GameSession(scene, map.roads, [spawn.x, spawn.z], (x, z) => world.surfaceY(x, z));
  const minimap = new Minimap(minimapCanvas, map.roads);
  let cameraMode = 0;
  let quality: QualityName = DEFAULT_QUALITY;
  let playing = false;
  let paused = false;
  let desiredScaling = QUALITY[quality].hardwareScaling;
  let echelle = desiredScaling;
  let resolutionTimer = 0;
  let fpsAccumulator = 0;
  let fpsSamples = 0;

  const poserEchelle = (valeur: number): void => {
    echelle = valeur;
    renderer.setPixelRatio(1 / valeur);
  };

  const applyQuality = (next: QualityName): void => {
    quality = next;
    const profile = QUALITY[next];
    desiredScaling = profile.hardwareScaling;
    poserEchelle(desiredScaling);
    brouillard.near = profile.fogStart;
    brouillard.far = profile.fogEnd;
    // Jamais sous 1 600 m : le fond de chaîne pyrénéenne est à 1 380 m.
    camera.far = Math.max(profile.fogEnd + 250, 1600);
    camera.updateProjectionMatrix();
    sun.castShadow = profile.shadows;
    construirePipeline(profile, next !== 'performance');
    qualityEl.textContent = profile.label;
  };
  applyQuality(DEFAULT_QUALITY);
  // Ambiance de départ : charge le panorama de jour et pose la lumière.
  applyAmbiance(ambianceIndex);

  const arcade = new MotionArcade(camera, effets, telemetryEl, scoreEl);
  const fumee = new FumeePneus(scene, camera);
  const lancerSession = (mode: GameMode): void => {
    // Départ arrêté en chrono : `car.update` est suspendu pendant le compte à
    // rebours, l'état de conduite resterait figé sur sa dernière valeur.
    if (mode === 'challenge') {
      car.arreter();
      missions.arreter();
    }
    session.start(mode);
    arcade.demarrer(mode);
  };

  const cameraPosition = new THREE.Vector3(car.root.position.x, car.root.position.y + 4, car.root.position.z - 9);
  const desiredCamera = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const forward = new THREE.Vector3();
  let plongee = 0;

  const begin = (mode: GameMode): void => {
    playing = true;
    paused = false;
    // Sortie de l'écran titre : l'illustration s'avance et s'efface (0,7 s)
    // pendant que la caméra plonge depuis 22 m de haut vers sa place de
    // poursuite. La caméra conducteur, rigide, ne s'interpole pas.
    if (!startScreen.classList.contains('hidden')) {
      startScreen.classList.add('sortie');
      const finSortie = (event: AnimationEvent): void => {
        if (event.animationName !== 'titre-sortie') return;
        startScreen.removeEventListener('animationend', finSortie);
        startScreen.classList.add('hidden');
        startScreen.classList.remove('sortie');
      };
      startScreen.addEventListener('animationend', finSortie);
      if (cameraMode !== 1) {
        car.forward(forward);
        cameraPosition.set(
          car.root.position.x - forward.x * 34,
          car.root.position.y + 22,
          car.root.position.z - forward.z * 34,
        );
        plongee = 1;
      }
    }
    pauseScreen.classList.add('hidden');
    hudElements.forEach((element) => element.classList.remove('hidden'));
    lancerSession(mode);
    canvas.focus();
  };
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => begin((button.dataset.mode ?? 'free') as GameMode));
  });

  // Vue conducteur : l'œil et la ligne de regard, exprimés dans le repère
  // LOCAL du châssis (+Z avant, +X gauche du conducteur, Y haut).
  // C'est le RECUL qui commande, pas la hauteur : le volant (jante de 36 cm)
  // mangeait 69 % de la hauteur de l'image à 12 cm de recul, 38 % à 55 cm,
  // la position réelle d'un conducteur adossé. 1,02 m de hauteur laisse
  // 19 cm sous le pavillon d'une 458.
  // Ligne de regard, en DÉPLACEMENT depuis l'œil : plongée de 0,7 m sur
  // 20 m, soit 2°, l'angle sous lequel un conducteur regarde la chaussée
  // trente mètres devant lui.
  const REGARD_LOCAL = new THREE.Vector3(0, -.7, 20);
  const oeilMonde = new THREE.Vector3();
  const regardMonde = new THREE.Vector3();

  await progress(100, 'Prêt à rouler');
  loading.classList.add('hidden');
  startScreen.classList.remove('hidden');

  let hudTimer = 0;
  let capPrecedent = car.heading;
  let lacetLisse = 0;
  let nomCandidat: string | null = null;
  let nomDepuis = 0;
  let instantPrecedent = performance.now();

  const image = (): void => {
    const maintenant = performance.now();
    const ecoule = (maintenant - instantPrecedent) / 1000;
    instantPrecedent = maintenant;
    const dt = Math.min(.05, ecoule);

    if (!playing && input.tapped('enter')) begin('free');
    if (input.tapped('1')) applyQuality('performance');
    if (input.tapped('2')) applyQuality('balanced');
    if (input.tapped('3')) applyQuality('quality');
    if (playing && (input.tapped('p') || input.tapped('escape'))) {
      paused = !paused;
      pauseScreen.classList.toggle('hidden', !paused);
    }
    if (playing && input.tapped('c')) {
      cameraMode = (cameraMode + 1) % 3;
      // Les sièges disparaissent en vue conducteur : leur dossier se trouve
      // entre l'œil et le pare-brise.
      car.setVueCabine(cameraMode === 1);
    }
    if (playing && input.tapped('r')) {
      car.reset();
      marcheur.root.visible = false;
      aPied = false;
      majMobiles();
      police.lever();
    }
    if (playing && !paused && (input.tapped('f') || input.tapped('e'))) basculerAPied();
    // G : prendre une livraison, ou abandonner celle en cours. Pas pendant
    // le Tour d'Artix, qui a déjà son parcours.
    if (playing && !paused && input.tapped('g') && !session.objective) {
      const lancee = missions.basculer(joueur().x, joueur().z);
      arcade.annoncer(lancee ? 'LIVRAISON' : 'COURSE ABANDONNÉE', lancee ? 'checkpoint' : 'compte');
      audio.signal(lancee ? 'mission' : 'echec');
    }
    if (playing && input.tapped('t')) lancerSession('challenge');
    if (input.tapped('l')) {
      ambianceIndex = (ambianceIndex + 1) % AMBIANCES.length;
      applyAmbiance(ambianceIndex);
    }

    if (nuitActive && foyersLampes.length) {
      lampesTimer += dt;
      const px = joueur().x, pz = joueur().z;
      if (lampesTimer > .4) {
        lampesTimer = 0;
        const proches = foyersLampes
          .map((f) => ({ f, d: (f.x - px) ** 2 + (f.z - pz) ** 2 }))
          .sort((a, b) => a.d - b.d)
          .slice(0, lampesPool.length);
        lampesPool.forEach((lampe, i) => {
          const foyer = proches[i]?.f;
          if (foyer) lampe.position.set(foyer.x, foyer.y, foyer.z);
          else lampe.position.y = -100;
        });
      }
      // Intensité continue selon la distance au joueur : pleine jusqu'à 34 m,
      // éteinte au-delà de 70 m, en courbe au carré pour que le recyclage
      // d'une lampe d'un foyer à l'autre ne se lise pas comme un allumage.
      for (const lampe of lampesPool) {
        const d = Math.hypot(lampe.position.x - px, lampe.position.z - pz);
        const t = Math.max(0, Math.min(1, (70 - d) / 36));
        lampe.intensity = INTENSITE_LAMPE * t * t;
      }
    }

    if (playing && !paused) {
      // Arrêt sur image après un choc franc : la voiture, le chrono et la
      // circulation attendent ; caméra, secousse et passants continuent.
      const gele = arcade.gele;
      // Temps du JEU : ralenti à l'arrivée. La couche arcade garde le temps
      // réel, sinon le ralenti ralentirait sa propre sortie.
      const dtJeu = dt * arcade.echelleTemps;
      arcade.accelerateur = !aPied && input.down('z', 'w', 'arrowup', 'throttle');
      if (aPied) marcheur.update(dt, input);
      else if (!arcade.fige && !gele) car.update(dtJeu, input);
      // Passants percutés : secousse de caméra et points retirés. Un choc
      // contre un passant ne fait pas rebondir la voiture, il la freine.
      let sourd = false;
      const renverses = ville.vivant?.update(dtJeu, maintenant / 1000, joueur().x, joueur().z,
        aPied ? 0 : car.vitesseSol, aPied) ?? 0;
      if (renverses > 0) {
        car.impact = Math.max(car.impact, 9);
        // Un corps, pas de la tôle : choc mat.
        sourd = true;
        car.speed *= .8;
        session.ajouterPoints(-500 * renverses);
        police.signaler(renverses);
      }
      // À pied, la circulation n'a personne à percuter : seuls les chocs et
      // les frôlements en voiture comptent.
      if (!aPied && !gele && traffic.update(car.root.position.x, car.root.position.z, maintenant / 1000, car.speed)) {
        car.hitTraffic();
        // Trois accrochages valent une étoile.
        police.signaler(.34);
        audio.klaxon(0, 1);
      }
      for (const f of traffic.frolements.splice(0)) arcade.frolement(f.x, f.z, car, session);
      if (!aPied && !arcade.fige && !gele) session.update(dtJeu, car.root.position.x, car.root.position.z, car.speed);
      // Livraison en cours : arrivée ou temps écoulé.
      const mission = missions.update(dt, joueur().x, joueur().z, aPied ? marcheur.vitesse : car.vitesseSol);
      if (mission?.type === 'livre') {
        session.ajouterPoints(mission.gain);
        arcade.annoncer('LIVRÉ', 'go', `+${mission.gain.toLocaleString('fr-FR')}`);
        audio.signal('livre');
      } else if (mission?.type === 'echec') {
        arcade.annoncer('TROP TARD', 'compte');
        audio.signal('echec');
      }
      // Poursuite : les patrouilles visent le joueur, en voiture ou à pied.
      if (arretEnCours <= 0) {
        const evenement = police.update(dt, joueur().x, joueur().z, aPied ? Math.abs(marcheur.vitesse) : car.vitesseSol);
        if (evenement === 'choc' && !aPied) car.hitTraffic();
        // Une étoile de plus : alarme.
        if (police.niveau > etoilesAvant) audio.signal('etoile');
        etoilesAvant = police.niveau;
        if (evenement === 'arrete') {
          arretEnCours = 2.6;
          audio.signal('arrete');
          voileArret.classList.add('actif');
          session.ajouterPoints(-2000);
          missions.arreter();
        }
      } else {
        // Arrestation : l'écran se voile, puis le joueur repart du point de
        // départ au volant de la Ferrari, recherche levée.
        arretEnCours -= dt;
        car.arreter();
        if (arretEnCours <= 0) {
          police.lever();
          if (car !== voitures[0]) car.setNight(false);
          car = voitures[0];
          (window as any).__car = car;
          car.reset();
          accrocherPhares();
          car.setNight(nuitActive);
          marcheur.root.visible = false;
          aPied = false;
          majMobiles();
          voileArret.classList.remove('actif');
        }
      }
      // Bruit du choc : lu AVANT la couche arcade, qui remet `impact` à zéro.
      if (car.impact > 0) audio.choc(car.impact / 28, sourd);
      arcade.update(dt, car, session);
      fumee.update(dtJeu, car, world, nuitActive);
      // ---- Son ------------------------------------------------------------
      // Position d'une source par rapport au joueur : -1 à gauche, 1 à
      // droite. La gauche du cap est (cos cap, -sin cap).
      const panVers = (x: number, z: number): number => {
        const dx = x - joueur().x, dz = z - joueur().z;
        const d = Math.hypot(dx, dz) || 1;
        return -(dx * Math.cos(capJoueur()) - dz * Math.sin(capJoueur())) / d;
      };
      // Chocs : la couche arcade remet `car.impact` à zéro, il est donc lu
      // avant elle, plus haut. Ici, les pas du marcheur.
      if (aPied && marcheur.appuis !== appuisAvant) {
        appuisAvant = marcheur.appuis;
        if (Math.abs(marcheur.vitesse) > .4) {
          audio.pas(Math.abs(marcheur.vitesse) > 3, !world.isOnRoad(joueur().x, joueur().z) && !world.estMineral(joueur().x, joueur().z));
        }
      }
      // Klaxons : un conducteur bloqué par le joueur à pied s'impatiente.
      klaxonDans -= dt;
      if (aPied && klaxonDans <= 0) {
        const bloque = ville.circulation.find((agent) => !agent.retire && agent._px != null
          && agent.vitesse < .5 && Math.hypot(agent._px - joueur().x, agent._pz! - joueur().z) < 9);
        if (bloque) {
          audio.klaxon(panVers(bloque._px!, bloque._pz!), .8);
          klaxonDans = 2.2 + Math.random() * 2.5;
        }
      }
      audio.update({
        vitesse: car.speed, pointe: car.profil.pointe, gaz: car.gaz, nitro: car.boosting,
        glisse: car.glisse, surRoute: car.onRoad, sport: car.aCabine, lourd: car.profil.masse > 1550,
        aPied, nuit: nuitActive, sirene: police.sirene, sirenePan: panVers(police.sireneX, police.sireneZ),
        temps: maintenant / 1000,
      });
    } else if (paused) audio.update(null);
    car.forward(forward);

    // Vitesse de lacet RÉELLE (rad/s), lissée sur un tiers de seconde. La
    // visée de la caméra poursuite se décale vers l'intérieur du virage. Elle
    // suit la rotation effective de la voiture, jamais la direction : en
    // contre-braquage, le volant pointe d'un côté pendant que la caisse
    // tourne de l'autre.
    if (dt > 0) {
      let dCap = car.heading - capPrecedent;
      dCap = Math.atan2(Math.sin(dCap), Math.cos(dCap));
      // Un saut de cap (réapparition, touche R) n'est pas une rotation.
      const lacet = Math.abs(dCap) > .5 ? 0 : dCap / dt;
      lacetLisse += (lacet - lacetLisse) * (1 - Math.exp(-dt * 3));
    }
    capPrecedent = car.heading;

    if (aPied) {
      // Caméra d'épaule : 4,4 m derrière le personnage, 2,2 m de haut,
      // visée un peu au-dessus de sa tête pour garder la rue dans le cadre.
      const p = marcheur.root.position;
      const fx = Math.sin(marcheur.heading), fz = Math.cos(marcheur.heading);
      // La caméra recule depuis la tête par pas de 0,55 m et s'arrête au
      // dernier point libre : dos à un mur, elle se rapproche au lieu de
      // passer à l'intérieur du bâtiment.
      let recul = 4.4;
      for (let d = .55; d <= 4.4; d += .55) {
        if (world.collidesBuilding(p.x - fx * d, p.z - fz * d, .3)) { recul = Math.max(.6, d - .55); break; }
      }
      desiredCamera.set(p.x - fx * recul, p.y + 2.2, p.z - fz * recul);
      cameraTarget.set(p.x + fx * 3, p.y + 1.5, p.z + fz * 3);
    } else if (cameraMode === 0) {
      desiredCamera.set(
        car.root.position.x - forward.x * 9.2,
        car.root.position.y + 4.25,
        car.root.position.z - forward.z * 9.2,
      );
      // Gauche du véhicule : (cos cap, -sin cap). À 4 m par rad/s de lacet,
      // borné à 4,5 m, le regard gagne une dizaine de degrés vers la sortie
      // du virage. Nul à l'arrêt, plein dès 43 km/h.
      const deport = Math.max(-4.5, Math.min(4.5, lacetLisse * 4)) * Math.min(1, Math.abs(car.speed) / 12);
      cameraTarget.set(
        car.root.position.x + forward.x * 7.5 + Math.cos(car.heading) * deport,
        car.root.position.y + 1.1,
        car.root.position.z + forward.z * 7.5 - Math.sin(car.heading) * deport,
      );
    } else if (cameraMode === 1) {
      // Vue conducteur. La position vient du CHÂSSIS, tangage et roulis
      // visuels compris : une caméra posée sur la seule position du véhicule
      // ignorait cette assiette, et l'habitacle semblait glisser devant
      // l'œil à chaque coup d'accélérateur.
      car.versMonde(car.oeil, oeilMonde);
      desiredCamera.copy(car.root.position).add(oeilMonde);
      car.versMonde(REGARD_LOCAL, regardMonde);
      cameraTarget.copy(desiredCamera).add(regardMonde);
    } else {
      desiredCamera.set(
        car.root.position.x - forward.x * 14 + Math.cos(car.heading) * 8,
        car.root.position.y + 8.6,
        car.root.position.z - forward.z * 14 - Math.sin(car.heading) * 8,
      );
      cameraTarget.set(car.root.position.x + forward.x * 5, car.root.position.y + 1, car.root.position.z + forward.z * 5);
    }
    // La vue conducteur ne s'interpole PAS : elle est solidaire de la caisse,
    // comme une caméra vissée au tableau de bord.
    if (cameraMode === 1 && !aPied) {
      cameraPosition.copy(desiredCamera);
    } else {
      // Pendant la plongée d'entrée (1 s), interpolation trois fois plus
      // lente : sinon la descente de 22 m se lit comme un saut de caméra.
      plongee = Math.max(0, plongee - dt);
      const cameraLerp = 1 - Math.exp(-dt * (aPied ? 6 : cameraMode === 0 ? 7.5 : 5) * (plongee > 0 ? .33 : 1));
      cameraPosition.lerp(desiredCamera, cameraLerp);
    }
    // Champ dynamique et secousse : la couche arcade pose la caméra.
    arcade.cadrer(dt, car, cameraPosition, cameraTarget, cameraMode);
    // 6 unités d'origine valent un décalage de 0,06 % du rayon de l'image
    // en bord de champ : sous le seuil où l'on remarque les franges.
    uAberration.value = effets.aberration * .01;
    // Fond de Pyrénées centré sur la caméra en plan.
    fondPyrenees.position.x = camera.position.x;
    fondPyrenees.position.z = camera.position.z;
    // Plan proche rapproché en vue conducteur : le volant se tient à 35 cm
    // de l'œil, exactement sur le plan proche des vues extérieures, qui le
    // tranchait en deux.
    const procheVoulu = cameraMode === 1 && !aPied ? .08 : .35;
    if (camera.near !== procheVoulu) {
      camera.near = procheVoulu;
      camera.updateProjectionMatrix();
    }
    if (regardDebug) camera.lookAt(regardDebug.clone().add(camera.position));
    if (camLibre) {
      camera.position.copy(camLibre.oeil);
      camera.lookAt(camLibre.cible);
    }

    // Sans cascades, la carte d'ombre unique suit le véhicule.
    if (!AVEC_CASCADES) {
      sun.target.position.copy(car.root.position);
      sun.position.copy(car.root.position).addScaledVector(directionSoleil, 400);
    }

    pipeline.render();

    speedEl.textContent = String(Math.round(Math.abs(aPied ? marcheur.vitesse : car.speed) * 3.6));
    // Invite contextuelle : remonter en voiture quand on est à sa portée.
    const invitation = !playing ? '' : aPied
      ? ((): string => {
        const cible = vehiculeAPortee();
        return cible?.voiture ? 'F  monter en voiture' : cible?.place || cible?.agent ? 'F  prendre ce véhicule' : '';
      })()
      // Pas d'invite pendant le Tour d'Artix : on y reste au volant.
      : (car.vitesseSol < 2.5 && !session.objective && !arcade.fige ? 'F  descendre de voiture' : '');
    if (invite.textContent !== invitation) {
      invite.textContent = invitation;
      invite.classList.toggle('hidden', !invitation);
    }
    boostBar.style.transform = `scaleX(${car.boost.toFixed(3)})`;
    hudTimer += dt;
    if (playing && hudTimer >= .09) {
      const status = session.status;
      const course = missions.statut(joueur().x, joueur().z);
      missionTitle.textContent = course?.titre ?? status.title;
      missionDetail.textContent = course?.detail ?? (session.objective ? status.detail : 'G : prendre une livraison');
      missionProgress.style.width = `${Math.round((course?.progression ?? status.progress) * 100)}%`;
      scoreEl.textContent = String(status.score).padStart(6, '0');
      const jp = joueur();
      const etoiles = '★'.repeat(police.niveau) + '☆'.repeat(3 - police.niveau);
      if (etoilesEl.textContent !== etoiles) {
        etoilesEl.textContent = etoiles;
        etoilesEl.classList.toggle('actif', police.niveau > 0);
      }
      const etat = car.degats > .05 ? `ÉTAT ${Math.round((1 - car.degats) * 100)} %` : '';
      if (etatEl.textContent !== etat) etatEl.textContent = etat;
      const surRoute = aPied ? world.isOnRoad(jp.x, jp.z) : car.onRoad;
      const roadName = surRoute ? world.roadNameAt(jp.x, jp.z) : null;
      surfaceStatus.textContent = aPied ? (roadName?.toUpperCase() ?? 'À PIED')
        : car.onRoad ? (car.drifting ? 'DÉRAPAGE' : (roadName?.toUpperCase() ?? 'SUR LA ROUTE')) : 'HORS-PISTE';
      surfaceStatus.classList.toggle('offroad', !aPied && !car.onRoad);
      // Le nom de rue ne change qu'après 0,45 s de présence confirmée : à un
      // carrefour, la voiture frôle la transversale et le libellé clignotait
      // entre les deux noms.
      const nomVoulu = roadName ?? (surRoute ? 'Voie communale d’Artix' : 'Hors chaussée');
      if (nomVoulu === streetNameEl.textContent) nomCandidat = null;
      else if (nomVoulu !== nomCandidat) { nomCandidat = nomVoulu; nomDepuis = 0; }
      else if ((nomDepuis += hudTimer) >= .45) {
        streetNameEl.textContent = nomVoulu;
        nomCandidat = null;
        streetNameEl.classList.remove('change');
        void streetNameEl.offsetWidth;
        streetNameEl.classList.add('change');
      }
      const place = nearestArtixPlace(jp.x, jp.z);
      placeNameEl.textContent = place ? `${place.name} · ${place.detail}` : 'Commune d’Artix · 64170';
      minimap.update(hudTimer, jp.x, jp.z, capJoueur(), session.objective ?? missions.objectif);
      hudTimer = 0;
    }
    resolutionTimer += dt;
    if (ecoule > 0) {
      fpsAccumulator += 1 / ecoule;
      fpsSamples++;
    }
    if (resolutionTimer >= 2) {
      // Résolution dynamique : sous 51 images par seconde, le rendu baisse
      // d'un cran ; au-dessus de 59, il remonte vers l'échelle du profil.
      const averageFps = fpsSamples ? fpsAccumulator / fpsSamples : 60;
      const profile = QUALITY[quality];
      const maxScaling = profile.hardwareScaling + .52;
      if (averageFps < 51 && desiredScaling < maxScaling) desiredScaling = Math.min(maxScaling, desiredScaling + .08);
      else if (averageFps > 59 && desiredScaling > profile.hardwareScaling) desiredScaling = Math.max(profile.hardwareScaling, desiredScaling - .04);
      if (Math.abs(echelle - desiredScaling) > .015) poserEchelle(desiredScaling);

      fpsEl.textContent = `${Math.round(averageFps)} FPS`;
      drawsEl.textContent = `${renderer.info.render.triangles.toLocaleString('fr-FR')} triangles`;
      meshesEl.textContent = `${renderer.info.render.drawCalls} appels de dessin`;
      const memory = (performance as MemoryPerformance).memory;
      memoryEl.textContent = memory
        ? `${Math.round(memory.usedJSHeapSize / 1048576)} Mo JS`
        : `échelle ${echelle.toFixed(2)}×`;
      resolutionTimer = 0;
      fpsAccumulator = 0;
      fpsSamples = 0;
    }
  };
  renderer.setAnimationLoop(image);
  // Ciels du soir et de la nuit téléchargés d'avance, une fois le jeu
  // lancé : la première bascule d'ambiance n'attend plus le réseau.
  setTimeout(() => { void obtenirCiel('soir'); void obtenirCiel('nuit'); }, 4000);

  // Mesures à la demande : `__comparer()` donne le coût réel hors vsync,
  // `__profil()` les compteurs du moteur, `__repartition()` les maillages
  // visibles par matériau. Chargées paresseusement.
  const mesure: ContexteMesure = {
    renderer, scene, camera, soleil: sun,
    rendre: () => pipeline.render(),
    suspendre: (arret) => {
      instantPrecedent = performance.now();
      renderer.setAnimationLoop(arret ? null : image);
    },
  };
  (window as any).__profil = async () => (await import('./profil')).profiler(mesure);
  (window as any).__repartition = async (sommet?: number) => (await import('./profil')).repartition(mesure, sommet);
  (window as any).__comparer = async (echantillons?: number) => (await import('./profil')).comparer(mesure, echantillons);

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });
}

// L'intro joue par-dessus l'écran de chargement, pendant que la ville se
// construit : elle ne retarde pas le jeu d'une seconde.
lancerIntro();
start().catch((error) => {
  console.error(error);
  loadingText.textContent = error instanceof Error ? error.message : String(error);
  loadingBar.style.background = '#d85b52';
});
