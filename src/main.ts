import {
  CascadedShadowGenerator,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  DynamicTexture,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointLight,
  HDRCubeTexture,
  Matrix,
  MotionBlurPostProcess,
  ColorCurves,
  Texture,
  Scene,
  ShadowGenerator,
  SSAO2RenderingPipeline,
  StandardMaterial,
  UniversalCamera,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import './style.css';
import { ArcadeAudio } from './audio';
import { ArcadeCar, KeyboardInput } from './car';
import { DEFAULT_QUALITY, QUALITY, type QualityName } from './config';
import { GameSession, type GameMode } from './game';
import { nearestArtixPlace } from './landmarks';
import { Minimap } from './minimap';
import { buildFaithfulArtix } from './three-city-bridge';
import { TrafficSystem } from './traffic';
import type { CityMapData } from './types';
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

// ---- Ciel HDRI et soleil ---------------------------------------------------
// Panoramas Poly Haven (CC0) préparés par scripts/ciel-soleil.mjs, qui
// plafonne le disque solaire (sinon il entre dans l'éclairage d'ambiance et
// éclaire tout sans ombre, en doublant la lumière directionnelle) et mesure
// sa position dans l'image. Le même panorama sert de fond (skybox) et
// d'éclairage d'ambiance précalculé (IBL) : les nuages visibles sont ceux
// qui se reflètent sur la carrosserie, et la lumière directionnelle est
// posée exactement sous le soleil du panorama. L'ancien ciel analytique de
// Preetham donnait un dégradé sans nuage, gris-beige sous ACES, et la sonde
// d'environnement rendue depuis lui des reflets sans intérêt.
interface CielHdr {
  fichier: string;          // public/textures/ciel/<fichier>.hdr
  taille: number;           // résolution du cube, par face
  azimutImageDeg: number;   // colonne du soleil dans le panorama (0 à 360)
  elevationDeg: number;     // hauteur du soleil dans le panorama
}
const CIELS: Record<string, CielHdr> = {
  jour: { fichier: 'jour', taille: 1024, azimutImageDeg: 215.7, elevationDeg: 48.9 },
  soir: { fichier: 'soir', taille: 512, azimutImageDeg: 215.9, elevationDeg: 6.2 },
  nuit: { fichier: 'nuit', taille: 512, azimutImageDeg: 215.6, elevationDeg: 17.1 },
};
// Sens de rotation du panorama, MESURÉ en jeu (balayage du ciel à la
// recherche du disque solaire, matrice identité puis rotation de 1 rad) :
// une rotation de +1 rad déplace le soleil de +57° dans le sens +X vers +Z.
const SENS_ROTATION_CIEL = 1;

// Position (unitaire) d'un astre depuis son azimut boussole (0 = nord,
// 90 = est) et son élévation. Repère du jeu : +X est, +Z sud, Y haut.
function positionAstre(azimutDeg: number, elevationDeg: number): Vector3 {
  const a = azimutDeg * Math.PI / 180, e = elevationDeg * Math.PI / 180;
  return new Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
}

// Rotation (autour de Y) qui amène le soleil du panorama à l'azimut voulu.
// Babylon projette la colonne u du panorama sur l'angle (u - 0,75) × 2π
// mesuré de +X vers +Z : MESURÉ en jeu (le soleil du ciel de jour, colonne
// 0,599, apparaît à -54° sans rotation), et non les (u - 0,5) × 2π supposés
// d'abord, qui décalaient le soleil de 90° par rapport aux ombres.
function rotationCiel(ciel: CielHdr, azimutDeg: number): number {
  const p = positionAstre(azimutDeg, 0);
  const cible = Math.atan2(p.z, p.x);
  const image = (ciel.azimutImageDeg / 360 - .75) * Math.PI * 2;
  return SENS_ROTATION_CIEL * (cible - image);
}

function chargerCiel(scene: Scene, ciel: CielHdr): Promise<HDRCubeTexture> {
  return new Promise((resolve, reject) => {
    const texture = new HDRCubeTexture(
      `/textures/ciel/${ciel.fichier}.hdr`, scene, ciel.taille,
      false, true, false, true,
      () => resolve(texture),
      (message) => reject(new Error(message ?? `Ciel ${ciel.fichier} illisible`)),
    );
  });
}

// Sphère de ciel : PBR sans éclairage, qui affiche le panorama tel quel puis
// passe par le même tone mapping que la scène, pour rester cohérent avec
// l'éclairage qu'il produit. Rayon 1 450 m : au-delà du fond de Pyrénées
// (1 380 m) et en deçà du plan lointain de la caméra (1 600 m). Une SPHÈRE
// et non une boîte : les coins d'une boîte de même taille (2 500 m) passaient
// derrière le plan lointain et le ciel s'y découpait en un grand trapèze de
// couleur de fond.
function createSkybox(scene: Scene): { mesh: Mesh; material: PBRMaterial } {
  const mesh = MeshBuilder.CreateSphere('ciel', { diameter: 2900, segments: 24 }, scene);
  const material = new PBRMaterial('ciel-materiau', scene);
  material.backFaceCulling = false;
  material.disableLighting = true;
  material.twoSidedLighting = true;
  material.microSurface = 1;
  mesh.material = material;
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.applyFog = false;
  return { mesh, material };
}

function createBackdrop(scene: Scene): Mesh[] {
  const mountainMaterial = new PBRMaterial('pyrenees-material', scene);
  mountainMaterial.albedoColor = Color3.FromHexString('#536d78');
  mountainMaterial.emissiveColor = Color3.FromHexString('#14232a');
  mountainMaterial.metallic = 0;
  mountainMaterial.roughness = 1;
  mountainMaterial.backFaceCulling = false;
  mountainMaterial.freeze();
  const lower: Vector3[] = [], ridge: Vector3[] = [];
  const count = 64;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = -1800 + t * 3600;
    let peak = 80 + Math.abs(Math.sin(t * 13.2)) * 95 + Math.abs(Math.sin(t * 31.4 + .8)) * 42;
    // Pic du Midi d'Ossau au sud-sud-est (azimut réel ~160° depuis Artix,
    // soit x ≈ +500 pour un fond à 1 380 m) : la dent à deux pointes qui
    // signe l'horizon béarnais, Grand Pic et son épaulement.
    peak += 150 * Math.exp(-(((x - 500) / 85) ** 2));
    peak += 60 * Math.exp(-(((x - 620) / 60) ** 2));
    lower.push(new Vector3(x, -24, 1380));
    ridge.push(new Vector3(x, peak, 1380 + Math.sin(t * 8) * 55));
  }
  const mountains = MeshBuilder.CreateRibbon('pyrenees', { pathArray: [lower, ridge], closeArray: false, closePath: false }, scene);
  mountains.material = mountainMaterial;
  mountains.isPickable = false;
  mountains.infiniteDistance = true;
  // Sans quoi le brouillard linéaire (fin à 980 m en Équilibré) noyait
  // entièrement un fond situé à 1 380 m : les Pyrénées existaient dans la
  // scène depuis le début mais ne se voyaient jamais.
  mountains.applyFog = false;
  // Les nuages sculptés en sphères ont disparu : ceux du panorama HDR les
  // remplacent, avec leur vraie lumière.
  return [mountains];
}


async function start(): Promise<void> {
  await progress(4, 'Initialisation de Babylon.js…');
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  }, true);
  engine.setHardwareScalingLevel(QUALITY[DEFAULT_QUALITY].hardwareScaling);

  const scene = new Scene(engine);
  // Accès de diagnostic depuis la console du navigateur.
  (window as any).__scene = scene;
  // Les données et les géométries sources viennent de Three.js (repère main
  // droite). Babylon utilise le même repère pour conserver l'orientation des
  // faces, des normales et des rotations sans conversion destructive.
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(.55, .70, .84, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = new Color3(.64, .75, .83);
  scene.fogStart = QUALITY[DEFAULT_QUALITY].fogStart;
  scene.fogEnd = QUALITY[DEFAULT_QUALITY].fogEnd;
  scene.skipPointerMovePicking = true;
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  scene.imageProcessingConfiguration.exposure = .94;
  scene.imageProcessingConfiguration.contrast = 1.18;

  createBackdrop(scene);
  const skybox = createSkybox(scene);
  // Textures de ciel chargées à la demande et gardées : le premier passage
  // dans une ambiance coûte le chargement et le préfiltrage (une seconde),
  // les suivants sont immédiats.
  const cielsCharges = new Map<string, Promise<HDRCubeTexture>>();
  const obtenirCiel = (nom: string): Promise<HDRCubeTexture> => {
    let promesse = cielsCharges.get(nom);
    if (!promesse) {
      promesse = chargerCiel(scene, CIELS[nom]);
      cielsCharges.set(nom, promesse);
    }
    return promesse;
  };
  let cielGeneration = 0;

  // Ambiante hémisphérique très basse : c'est le panorama (IBL) qui porte la
  // lumière du ciel, avec ses couleurs (bleu du zénith, sol en contre-jour).
  // À 0,72 elle éclairait toutes les faces pareil et aplatissait la ville.
  const ambient = new HemisphericLight('ambient', new Vector3(.15, 1, .1), scene);
  ambient.diffuse = new Color3(.76, .84, .92);
  ambient.groundColor = new Color3(.28, .31, .25);
  ambient.intensity = .25;

  const sun = new DirectionalLight('sun', positionAstre(205, 49).scale(-1), scene);
  sun.diffuse = new Color3(1, .95, .88);
  sun.intensity = 2.0;
  const shadow = new CascadedShadowGenerator(QUALITY[DEFAULT_QUALITY].shadowMap, sun);
  shadow.numCascades = QUALITY[DEFAULT_QUALITY].cascades;
  shadow.lambda = .72;
  shadow.shadowMaxZ = 330;
  shadow.stabilizeCascades = true;
  shadow.filter = ShadowGenerator.FILTER_PCF;
  shadow.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadow.bias = .0025;
  shadow.normalBias = .035;
  shadow.setDarkness(.3);

  // ---- Ambiances d'éclairage (touche L) ----------------------------------
  // Chaque ambiance a son panorama HDR : le fond, l'éclairage d'ambiance et
  // la lumière directionnelle en dérivent ensemble. Changer d'heure revient
  // à charger le ciel correspondant et à re-régler ce petit jeu de
  // paramètres. La fin de journée est l'ambiance la plus payante : le soleil
  // rasant allonge les ombres des bâtiments dans les rues.
  interface Ambiance {
    nom: string;
    ciel: keyof typeof CIELS;
    azimut: number;        // azimut boussole du soleil (ou de la lune)
    elevationMin: number;  // plancher pour la lumière : un soleil à 6° donne des ombres inexploitables
    sunDiffuse: Color3;
    sunIntensity: number;
    envIntensity: number;  // poids de l'éclairage d'ambiance du panorama
    cielNiveau: number;    // clarté du fond de ciel affiché
    ambientIntensity: number;
    ambientDiffuse: Color3;
    ambientGround: Color3;
    fog: Color3;
    clear: Color4;
    exposure: number;
    darkness: number;
    fenetres: number;      // intensité d'émission des vitrages
  }
  const AMBIANCES: Ambiance[] = [
    {
      nom: 'Midi',
      ciel: 'jour',
      // Début d'après-midi d'été : soleil haut au sud-sud-ouest.
      azimut: 205,
      elevationMin: 0,
      sunDiffuse: new Color3(1, .95, .88),
      sunIntensity: 2.0,
      envIntensity: 1.5,
      cielNiveau: 1,
      ambientIntensity: .25,
      ambientDiffuse: new Color3(.76, .84, .92),
      ambientGround: new Color3(.28, .31, .25),
      fog: new Color3(.70, .78, .86),
      clear: new Color4(.55, .70, .84, 1),
      exposure: 1,
      darkness: .3,
      fenetres: 0,
    },
    {
      nom: 'Fin de journée',
      ciel: 'soir',
      // Soleil couchant à l'ouest-sud-ouest ; le panorama le met à 6° au-dessus
      // de l'horizon, la lumière est relevée à 9° pour garder des ombres nettes.
      azimut: 255,
      elevationMin: 9,
      // Panorama pâle et très lumineux (moyenne 0,86, plus que le jour) :
      // dosé bas et exposé sous le jour, sinon la fin de journée ressort
      // plus blanche que midi. Le soleil porte l'orangé.
      sunDiffuse: new Color3(1, .66, .40),
      sunIntensity: 1.7,
      envIntensity: .7,
      cielNiveau: .8,
      ambientIntensity: .15,
      ambientDiffuse: new Color3(.72, .62, .66),
      ambientGround: new Color3(.30, .25, .22),
      fog: new Color3(.74, .60, .50),
      clear: new Color4(.72, .58, .48, 1),
      exposure: .82,
      darkness: .28,
      fenetres: .12,
    },
    {
      nom: 'Nuit',
      ciel: 'nuit',
      // Clair de lune : lune au sud-est, lumière froide très faible.
      azimut: 150,
      elevationMin: 0,
      sunDiffuse: new Color3(.55, .65, .9),
      sunIntensity: .35,
      envIntensity: .25,
      cielNiveau: .55,
      ambientIntensity: .05,
      ambientDiffuse: new Color3(.32, .38, .55),
      ambientGround: new Color3(.08, .09, .13),
      fog: new Color3(.05, .07, .12),
      clear: new Color4(.04, .06, .11, 1),
      exposure: .8,
      darkness: .5,
      fenetres: .85,
    },
  ];
  let ambianceIndex = 0;
  // Renseignés après la construction de la ville et du véhicule : la touche L
  // n'est lue qu'une fois la partie lancée, ces références existent donc au
  // premier appel.
  let carNuit: { setNight(active: boolean): void } | null = null;
  let lampesMateriau: PBRMaterial | null = null;
  let foyersLampes: Array<{ x: number; y: number; z: number }> = [];
  let lampesPool: PointLight[] = [];
  let lampesGlow: Mesh | null = null;
  let nuitActive = false;
  let lampesTimer = 9;
  const applyAmbiance = (index: number): void => {
    const a = AMBIANCES[index];
    const ciel = CIELS[a.ciel];
    const astre = positionAstre(a.azimut, Math.max(ciel.elevationDeg, a.elevationMin));
    sun.direction.copyFrom(astre.scale(-1));
    sun.diffuse.copyFrom(a.sunDiffuse);
    sun.intensity = a.sunIntensity;
    ambient.intensity = a.ambientIntensity;
    ambient.diffuse.copyFrom(a.ambientDiffuse);
    ambient.groundColor.copyFrom(a.ambientGround);
    scene.fogColor.copyFrom(a.fog);
    scene.clearColor.copyFrom(a.clear);
    scene.imageProcessingConfiguration.exposure = a.exposure;
    scene.environmentIntensity = a.envIntensity;
    shadow.setDarkness(a.darkness);
    // Vitrages : leur émission raconte les pièces éclairées à la tombée du
    // jour. Le matériau vient de la conversion Three, retrouvé par son mesh.
    const vitrages = scene.getMeshByName('vitrages');
    const materiauVitrage = vitrages?.material as PBRMaterial | null;
    if (materiauVitrage) {
      materiauVitrage.unfreeze?.();
      materiauVitrage.emissiveColor = new Color3(1, .78, .5);
      materiauVitrage.emissiveIntensity = a.fenetres;
    }
    // Éclairage nocturne : phares et feux du véhicule, lanternes émissives et
    // pool de lampes de rue autour du joueur.
    nuitActive = a.nom === 'Nuit';
    carNuit?.setNight(nuitActive);
    if (lampesMateriau) {
      lampesMateriau.unfreeze?.();
      lampesMateriau.emissiveColor = Color3.FromHexString('#ffc878');
      lampesMateriau.emissiveIntensity = nuitActive ? 1.7 : 0;
    }
    for (const lampe of lampesPool) lampe.setEnabled(nuitActive);
    lampesGlow?.setEnabled(nuitActive);
    lampesTimer = 9;
    // Panorama : tourné pour que son soleil tombe à l'azimut de la lumière,
    // posé en éclairage d'ambiance et, en copie non préfiltrée, en fond.
    const rotation = rotationCiel(ciel, a.azimut);
    const generation = ++cielGeneration;
    obtenirCiel(a.ciel).then((texture) => {
      if (generation !== cielGeneration) return;
      texture.setReflectionTextureMatrix(Matrix.RotationY(rotation));
      scene.environmentTexture = texture;
      const fond = texture.clone();
      fond.coordinatesMode = Texture.SKYBOX_MODE;
      fond.setReflectionTextureMatrix(Matrix.RotationY(rotation));
      fond.level = a.cielNiveau;
      const ancien = skybox.material.reflectionTexture;
      skybox.material.reflectionTexture = fond;
      if (ancien && ancien !== fond) ancien.dispose();
    }).catch((error) => console.warn('Ciel indisponible :', error));
    console.info(`Ambiance : ${a.nom}`);
  };


  const camera = new UniversalCamera('camera', new Vector3(0, 8, -12), scene);
  camera.fov = 1.03;
  camera.minZ = .35;
  camera.maxZ = 1800;
  const pipeline = new DefaultRenderingPipeline('arcade-pipeline', true, scene, [camera]);
  pipeline.fxaaEnabled = true;
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = .86;
  pipeline.bloomWeight = .18;
  pipeline.bloomKernel = 32;
  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = .18;
  pipeline.sharpen.colorAmount = .92;
  scene.imageProcessingConfiguration.vignetteEnabled = true;
  // Vignette allégée : à 1,1 elle assombrissait tout le pourtour de l'image
  // et se lisait comme un défaut d'optique plutôt qu'un cadrage.
  scene.imageProcessingConfiguration.vignetteWeight = .7;
  scene.imageProcessingConfiguration.vignetteStretch = .25;
  scene.imageProcessingConfiguration.vignetteColor = new Color4(.025, .035, .045, 1);
  // Grain fin animé et légère aberration chromatique en bord de champ : les
  // deux signatures d'une prise de vue réelle, dosées pour rester sous le
  // seuil où on les remarque en roulant.
  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 6;
  pipeline.grain.animated = true;
  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 6;
  pipeline.chromaticAberration.radialIntensity = .7;
  // Étalonnage couleur (courbes) : ombres poussées vers le bleu, hautes
  // lumières vers le chaud, saturation globale relevée d'un cran. C'est
  // l'équivalent d'une LUT « film » sans fichier à charger.
  const courbes = new ColorCurves();
  courbes.globalSaturation = 10;
  courbes.shadowsHue = 215;
  courbes.shadowsSaturation = 8;
  courbes.highlightsHue = 45;
  courbes.highlightsSaturation = 5;
  courbes.highlightsExposure = -3;
  scene.imageProcessingConfiguration.colorCurves = courbes;
  scene.imageProcessingConfiguration.colorCurvesEnabled = true;
  // Flou de mouvement caméra (lu dans la profondeur de la pré-passe déjà
  // rendue pour le SSAO), dosé par la vitesse dans la boucle de jeu. Il est
  // ré-attaché par applyQuality pour rester APRÈS le pipeline, que Babylon
  // reconstruit (et rattache en fin de liste) à chaque changement d'option.
  // La caméra est obligatoire à la construction : sans elle, le post-process
  // n'a pas de scène et ne trouve pas la pré-passe.
  const flou = new MotionBlurPostProcess('flou-vitesse', scene, 1, camera);
  flou.isObjectBased = false;
  flou.motionBlurSamples = 10;
  flou.motionStrength = 0;
  // Diagnostic depuis la console : __regarder(x, y, z) force la caméra à
  // viser cette direction (repérage du soleil du panorama), __regarder()
  // rend la main.
  let regardDebug: Vector3 | null = null;
  (window as any).__regarder = (x?: number, y?: number, z?: number): void => {
    regardDebug = x == null ? null : new Vector3(x, y ?? 0, z ?? 0);
  };

  // Occlusion ambiante en profil Qualité : c'est elle qui assoit les bâtiments
  // au sol et creuse les angles de rue, la zone la plus « flottante » du rendu
  // sans elle. Créée détachée, attachée par applyQuality.
  const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: .5, blurRatio: .5 }, []);
  ssao.radius = 1.9;
  ssao.totalStrength = 1.05;
  ssao.samples = 12;
  ssao.maxZ = 260;

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

  await progress(26, 'Reconstruction du modèle Three.js original…');
  const faithful = await buildFaithfulArtix(scene, {
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
  }, shadow, progress);
  const map = faithful.data as CityMapData;
  const terrain = faithful.terrain;
  const spawn = faithful.spawn;

  await progress(72, 'Activation du rendu PBR Babylon.js…');
  const world = new ArtixWorld(
    scene,
    terrain as any,
    map,
    faithful.altitudeReference,
    shadow,
    true,
  );
  world.setQuality(QUALITY[DEFAULT_QUALITY].chunkRadius, QUALITY[DEFAULT_QUALITY].vegetationDensity);

  await progress(82, 'Chargement du véhicule…');
  const car = new ArcadeCar(scene, world, spawn, shadow);
  await car.loadModel();
  // Accès de diagnostic : permet de téléporter le véhicule depuis la console.
  (window as any).__car = car;

  // Éclairage public nocturne : un petit pool de lampes réelles suit le
  // véhicule et se pose sur les foyers de lampadaires les plus proches. Six
  // sources suffisent : au-delà du rayon d'une lanterne au sodium, l'œil ne
  // distingue plus quelle lampe éclaire quoi.
  carNuit = car;
  lampesMateriau = faithful.lampMaterial;
  foyersLampes = faithful.foyers;
  // Les halos au sol portent l'essentiel de l'éclairage public perçu ; le
  // pool de vraies lumières n'est qu'un appoint volumétrique discret autour
  // du joueur. Le doser bas rend invisible le recyclage des lampes d'un
  // foyer à l'autre, qui se lisait comme un allumage au passage.
  for (let i = 0; i < 8; i++) {
    const lampe = new PointLight(`lampe-rue-${i}`, new Vector3(0, -100, 0), scene);
    lampe.diffuse = Color3.FromHexString('#ffc878');
    lampe.intensity = 70;
    lampe.range = 30;
    lampe.setEnabled(false);
    lampesPool.push(lampe);
  }

  // Flaques de lumière sous TOUS les lampadaires : le pool ci-dessus ne fait
  // vivre que l'entourage immédiat du joueur ; sans les flaques, les rues au
  // loin restaient noires et les lampes semblaient s'allumer à son passage.
  // Un unique maillage fusionné de disques émissifs à dégradé radial : des
  // centaines de halos pour un seul appel de dessin, aucune vraie lumière.
  const lampGlow = (() => {
    if (!foyersLampes.length) return null;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const SEGMENTS = 10, RAYON = 7.5;
    for (const f of foyersLampes) {
      const solY = f.y - 6.9 + .07;
      const base = positions.length / 3;
      positions.push(f.x, solY, f.z);
      uvs.push(.5, .5);
      for (let sg = 0; sg <= SEGMENTS; sg++) {
        const a = (sg / SEGMENTS) * Math.PI * 2;
        positions.push(f.x + Math.cos(a) * RAYON, solY, f.z + Math.sin(a) * RAYON);
        uvs.push(.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5);
        if (sg > 0) indices.push(base, base + sg, base + sg + 1);
      }
    }
    const mesh = new Mesh('halos-lampadaires', scene);
    const data = new VertexData();
    data.positions = positions;
    data.uvs = uvs;
    data.indices = indices;
    data.applyToMesh(mesh);
    // Dégradé radial dessiné une fois : blanc sodium au centre, néant au bord.
    const taille = 128;
    const tex = new DynamicTexture('halo-lampe', { width: taille, height: taille }, scene, false);
    const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(taille / 2, taille / 2, 4, taille / 2, taille / 2, taille / 2);
    grad.addColorStop(0, 'rgba(255,206,134,0.8)');
    grad.addColorStop(.4, 'rgba(255,192,112,0.34)');
    grad.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, taille, taille);
    tex.update(false);
    tex.hasAlpha = true;
    const materiau = new StandardMaterial('halo-lampe-materiau', scene);
    materiau.emissiveTexture = tex;
    materiau.opacityTexture = tex;
    materiau.disableLighting = true;
    materiau.alphaMode = Engine.ALPHA_ADD;
    materiau.disableDepthWrite = true;
    mesh.material = materiau;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    return mesh;
  })();
  lampesGlow = lampGlow;

  const input = new KeyboardInput();
  const audio = new ArcadeAudio();
  const traffic = new TrafficSystem(scene, map.roads, (x, z) => world.surfaceY(x, z), shadow);
  const session = new GameSession(scene, map.roads, [spawn.x, spawn.z], (x, z) => world.surfaceY(x, z));
  const minimap = new Minimap(minimapCanvas, map.roads);
  let cameraMode = 0;
  let quality: QualityName = DEFAULT_QUALITY;
  let playing = false;
  let paused = false;
  let desiredScaling = QUALITY[quality].hardwareScaling;
  let resolutionTimer = 0;
  let fpsAccumulator = 0;
  let fpsSamples = 0;

  const applyQuality = (next: QualityName): void => {
    quality = next;
    const profile = QUALITY[next];
    desiredScaling = profile.hardwareScaling;
    engine.setHardwareScalingLevel(desiredScaling);
    scene.fogStart = profile.fogStart;
    scene.fogEnd = profile.fogEnd;
    // Jamais sous 1 600 m : le fond de chaîne pyrénéenne est à 1 380 m de la
    // caméra (infiniteDistance) et le plan lointain le clippait en Équilibré
    // et Performance : les montagnes n'étaient JAMAIS visibles.
    camera.maxZ = Math.max(profile.fogEnd + 250, 1600);
    sun.shadowEnabled = profile.shadows;
    shadow.numCascades = profile.cascades;
    shadow.filteringQuality = profile.shadowFilter === 'high' ? ShadowGenerator.QUALITY_HIGH
      : profile.shadowFilter === 'medium' ? ShadowGenerator.QUALITY_MEDIUM : ShadowGenerator.QUALITY_LOW;
    pipeline.bloomEnabled = next !== 'performance';
    if (profile.ssao) {
      scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera);
    } else {
      scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', camera);
    }
    // Le flou de mouvement se rattache en dernier, après la reconstruction
    // du pipeline provoquée par le changement de bloom.
    camera.detachPostProcess(flou);
    if (profile.motionBlur) camera.attachPostProcess(flou);
    world.setQuality(profile.chunkRadius, profile.vegetationDensity);
    traffic.setDensity(next === 'performance' ? .5 : next === 'balanced' ? .78 : 1);
    qualityEl.textContent = profile.label;
  };
  applyQuality(DEFAULT_QUALITY);
  // Ambiance de départ : charge le panorama de jour et pose la lumière.
  applyAmbiance(ambianceIndex);

  const begin = (mode: GameMode): void => {
    playing = true;
    paused = false;
    startScreen.classList.add('hidden');
    pauseScreen.classList.add('hidden');
    hudElements.forEach((element) => element.classList.remove('hidden'));
    session.start(mode);
    canvas.focus();
  };
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => begin((button.dataset.mode ?? 'free') as GameMode));
  });

  const cameraPosition = new Vector3(car.root.position.x, car.root.position.y + 4, car.root.position.z - 9);
  const desiredCamera = new Vector3();
  const cameraTarget = new Vector3();
  const forward = new Vector3();

  await progress(100, 'Prêt à rouler');
  loading.classList.add('hidden');
  startScreen.classList.remove('hidden');

  let hudTimer = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(.05, engine.getDeltaTime() / 1000);

    if (!playing && input.tapped('enter')) begin('free');
    if (input.tapped('1')) applyQuality('performance');
    if (input.tapped('2')) applyQuality('balanced');
    if (input.tapped('3')) applyQuality('quality');
    if (playing && (input.tapped('p') || input.tapped('escape'))) {
      paused = !paused;
      pauseScreen.classList.toggle('hidden', !paused);
    }
    if (playing && input.tapped('c')) cameraMode = (cameraMode + 1) % 3;
    if (playing && input.tapped('r')) car.reset();
    if (playing && input.tapped('t')) session.start('challenge');
    if (input.tapped('l')) {
      ambianceIndex = (ambianceIndex + 1) % AMBIANCES.length;
      applyAmbiance(ambianceIndex);
    }

    if (nuitActive && foyersLampes.length) {
      lampesTimer += dt;
      if (lampesTimer > .4) {
        lampesTimer = 0;
        const px = car.root.position.x, pz = car.root.position.z;
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
      // Intensité continue en fonction de la distance au joueur : pleine à
      // moins de 18 m, nulle au-delà de 36 m. Une lampe du pool se
      // repositionne donc toujours éteinte et monte en puissance à
      // l'approche : c'est ce qui supprime l'allumage visible au passage,
      // les halos au sol assurant la constance de l'éclairage perçu.
      const px = car.root.position.x, pz = car.root.position.z;
      for (const lampe of lampesPool) {
        const d = Math.hypot(lampe.position.x - px, lampe.position.z - pz);
        const t = Math.max(0, Math.min(1, (36 - d) / 18));
        lampe.intensity = 70 * t * t;
      }
    }

    if (playing && !paused) {
      car.update(dt, input);
      world.update(car.root.position.x, car.root.position.z);
      // Passants et touffes d'herbe : logique Three animée, rendu Babylon.
      faithful.vivant?.update(dt, performance.now() / 1000, car.root.position.x, car.root.position.z);
      if (traffic.update(dt, car.root.position.x, car.root.position.z, performance.now() / 1000)) car.hitTraffic();
      session.update(dt, car.root.position.x, car.root.position.z, car.speed);
      audio.update(car.speed, car.boosting, car.drifting);
    } else if (paused) audio.update(0, false, false);
    car.forward(forward);

    if (cameraMode === 0) {
      desiredCamera.set(
        car.root.position.x - forward.x * 9.2,
        car.root.position.y + 4.25,
        car.root.position.z - forward.z * 9.2,
      );
      cameraTarget.set(
        car.root.position.x + forward.x * 7.5,
        car.root.position.y + 1.1,
        car.root.position.z + forward.z * 7.5,
      );
    } else if (cameraMode === 1) {
      desiredCamera.set(
        car.root.position.x + forward.x * .3 - Math.cos(car.heading) * .28,
        car.root.position.y + 1.14,
        car.root.position.z + forward.z * .3 + Math.sin(car.heading) * .28,
      );
      cameraTarget.set(
        car.root.position.x + forward.x * 16,
        car.root.position.y + 1.05,
        car.root.position.z + forward.z * 16,
      );
    } else {
      desiredCamera.set(
        car.root.position.x - forward.x * 14 + Math.cos(car.heading) * 8,
        car.root.position.y + 8.6,
        car.root.position.z - forward.z * 14 - Math.sin(car.heading) * 8,
      );
      cameraTarget.set(car.root.position.x + forward.x * 5, car.root.position.y + 1, car.root.position.z + forward.z * 5);
    }
    const cameraLerp = 1 - Math.exp(-dt * (cameraMode === 0 ? 7.5 : cameraMode === 1 ? 15 : 5));
    Vector3.LerpToRef(cameraPosition, desiredCamera, cameraLerp, cameraPosition);
    camera.position.copyFrom(cameraPosition);
    camera.setTarget(cameraTarget);
    if (regardDebug) camera.setTarget(camera.position.add(regardDebug));
    // Flou de mouvement : nul sous 12 m/s (43 km/h), plein vers 60 m/s ; la
    // vue capot en reçoit moins, l'œil y est déjà dans le mouvement.
    const vitesseFlou = Math.max(0, Math.min(1, (Math.abs(car.speed) - 12) / 48));
    flou.motionStrength = QUALITY[quality].motionBlur ? vitesseFlou * (cameraMode === 1 ? .5 : .85) : 0;

    scene.render();

    speedEl.textContent = String(Math.round(Math.abs(car.speed) * 3.6));
    boostBar.style.transform = `scaleX(${car.boost.toFixed(3)})`;
    hudTimer += dt;
    if (playing && hudTimer >= .09) {
      const status = session.status;
      missionTitle.textContent = status.title;
      missionDetail.textContent = status.detail;
      missionProgress.style.width = `${Math.round(status.progress * 100)}%`;
      scoreEl.textContent = String(status.score).padStart(6, '0');
      const roadName = car.onRoad ? world.roadNameAt(car.root.position.x, car.root.position.z) : null;
      surfaceStatus.textContent = car.onRoad ? (car.drifting ? 'DÉRAPAGE' : (roadName?.toUpperCase() ?? 'SUR LA ROUTE')) : 'HORS-PISTE';
      surfaceStatus.classList.toggle('offroad', !car.onRoad);
      streetNameEl.textContent = roadName ?? (car.onRoad ? 'Voie communale d’Artix' : 'Hors chaussée');
      const place = nearestArtixPlace(car.root.position.x, car.root.position.z);
      placeNameEl.textContent = place ? `${place.name} · ${place.detail}` : 'Commune d’Artix · 64170';
      minimap.update(hudTimer, car.root.position.x, car.root.position.z, car.heading, session.objective);
      hudTimer = 0;
    }
    resolutionTimer += dt;
    const currentFps = engine.getFps();
    if (Number.isFinite(currentFps)) {
      fpsAccumulator += currentFps;
      fpsSamples++;
    }
    if (resolutionTimer >= 2) {
      const averageFps = fpsSamples ? fpsAccumulator / fpsSamples : 60;
      const profile = QUALITY[quality];
      const maxScaling = profile.hardwareScaling + .52;
      if (averageFps < 51 && desiredScaling < maxScaling) desiredScaling = Math.min(maxScaling, desiredScaling + .08);
      else if (averageFps > 59 && desiredScaling > profile.hardwareScaling) desiredScaling = Math.max(profile.hardwareScaling, desiredScaling - .04);
      if (Math.abs(engine.getHardwareScalingLevel() - desiredScaling) > .015) engine.setHardwareScalingLevel(desiredScaling);

      fpsEl.textContent = `${Number.isFinite(averageFps) ? Math.round(averageFps) : 60} FPS`;
      drawsEl.textContent = `${scene.getActiveIndices().toLocaleString('fr-FR')} indices actifs`;
      meshesEl.textContent = `${scene.getActiveMeshes().length} maillages · ville fidèle`;
      const memory = (performance as MemoryPerformance).memory;
      memoryEl.textContent = memory
        ? `${Math.round(memory.usedJSHeapSize / 1048576)} Mo JS`
        : `échelle ${engine.getHardwareScalingLevel().toFixed(2)}×`;
      resolutionTimer = 0;
      fpsAccumulator = 0;
      fpsSamples = 0;
    }
  });

  addEventListener('resize', () => engine.resize());
}

start().catch((error) => {
  console.error(error);
  loadingText.textContent = error instanceof Error ? error.message : String(error);
  loadingBar.style.background = '#d85b52';
});
