import {
  CascadedShadowGenerator,
  Color3,
  Color4,
  DefaultRenderingPipeline,
  DirectionalLight,
  Engine,
  HemisphericLight,
  ImageProcessingConfiguration,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  ReflectionProbe,
  RenderTargetTexture,
  Scene,
  ShadowGenerator,
  SSAO2RenderingPipeline,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { SkyMaterial } from '@babylonjs/materials';
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

// Direction du soleil, partagée entre la lumière directionnelle, le ciel
// analytique et la sonde d'environnement : les trois doivent raconter la même
// heure, sans quoi les ombres contredisent le ciel.
const SUN_DIRECTION = new Vector3(-.52, -.83, .34).normalize();

function createSky(scene: Scene): Mesh {
  // Ciel analytique officiel (modèle de Preetham) plutôt qu'un gradient peint :
  // la diffusion atmosphérique donne le voile de l'horizon, le bleu profond du
  // zénith et le halo solaire au bon endroit, celui de la lumière qui projette
  // les ombres. L'ancien shader avait un soleil peint en dur, déconnecté de la
  // DirectionalLight.
  const sky = MeshBuilder.CreateBox('sky', { size: 4200 }, scene);
  const material = new SkyMaterial('sky-analytique', scene);
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.useSunPosition = true;
  material.sunPosition = SUN_DIRECTION.scale(-1000);
  // Voile léger d'une journée d'été béarnaise : l'air n'y est jamais aussi sec
  // qu'en montagne, l'horizon blanchit sensiblement.
  material.turbidity = 5.5;
  material.rayleigh = 1.6;
  material.mieCoefficient = .006;
  material.mieDirectionalG = .8;
  material.luminance = .35;
  sky.material = material;
  sky.infiniteDistance = true;
  sky.isPickable = false;
  sky.applyFog = false;
  return sky;
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
  const count = 44;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = -1800 + t * 3600;
    const peak = 80 + Math.abs(Math.sin(t * 13.2)) * 95 + Math.abs(Math.sin(t * 31.4 + .8)) * 42;
    lower.push(new Vector3(x, -24, 1380));
    ridge.push(new Vector3(x, peak, 1380 + Math.sin(t * 8) * 55));
  }
  const mountains = MeshBuilder.CreateRibbon('pyrenees', { pathArray: [lower, ridge], closeArray: false, closePath: false }, scene);
  mountains.material = mountainMaterial;
  mountains.isPickable = false;
  mountains.infiniteDistance = true;

  const cloudMaterial = new PBRMaterial('cloud-material', scene);
  cloudMaterial.albedoColor = Color3.FromHexString('#f0eee6');
  cloudMaterial.emissiveColor = Color3.FromHexString('#343a3b');
  cloudMaterial.metallic = 0;
  cloudMaterial.roughness = 1;
  cloudMaterial.freeze();
  const clouds = [
    [-520, 245, 540, 1.2], [380, 285, 760, .95], [820, 220, 350, 1.1], [-960, 310, 920, .82],
  ];
  clouds.forEach(([x, y, z, scale], index) => {
    for (let lobe = 0; lobe < 3; lobe++) {
      const cloud = MeshBuilder.CreateSphere(`cloud-${index}-${lobe}`, { diameter: 55 + lobe * 13, segments: 8 }, scene);
      cloud.position.set(x + lobe * 38, y + (lobe === 1 ? 14 : 0), z);
      cloud.scaling.set(1.8 * scale, .38 * scale, .72 * scale);
      cloud.material = cloudMaterial;
      cloud.isPickable = false;
      cloud.infiniteDistance = true;
    }
  });
  return [mountains];
}

function createEnvironment(scene: Scene, probeMeshes: Mesh[]): void {
  // L'éclairage d'ambiance PBR (IBL) est rendu depuis le vrai ciel plutôt que
  // depuis trois gradients de 32 pixels : carrosseries, vitrages et toitures
  // reflètent ainsi exactement le ciel affiché, avec le sol de prairie en
  // contre-jour. Rendu une seule fois au démarrage, le soleil étant fixe.
  const horizonGround = MeshBuilder.CreateDisc('horizon-ground', { radius: 2400, tessellation: 48 }, scene);
  horizonGround.rotation.x = Math.PI / 2;
  horizonGround.position.y = -6;
  const groundMaterial = new PBRMaterial('horizon-ground-material', scene);
  groundMaterial.albedoColor = Color3.FromHexString('#7d8a5c');
  groundMaterial.metallic = 0;
  groundMaterial.roughness = 1;
  groundMaterial.backFaceCulling = false;
  groundMaterial.freeze();
  horizonGround.material = groundMaterial;
  horizonGround.isPickable = false;

  const probe = new ReflectionProbe('environnement', 128, scene, true);
  probe.position.set(0, 14, 0);
  for (const mesh of [...probeMeshes, horizonGround]) probe.renderList!.push(mesh);
  probe.refreshRate = RenderTargetTexture.REFRESHRATE_RENDER_ONCE;
  scene.environmentTexture = probe.cubeTexture;
  scene.environmentIntensity = .85;
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

  const sky = createSky(scene);
  const backdrop = createBackdrop(scene);
  createEnvironment(scene, [sky, ...backdrop]);

  const ambient = new HemisphericLight('ambient', new Vector3(.15, 1, .1), scene);
  ambient.diffuse = new Color3(.76, .84, .92);
  ambient.groundColor = new Color3(.28, .31, .25);
  ambient.intensity = .72;

  const sun = new DirectionalLight('sun', SUN_DIRECTION.clone(), scene);
  sun.diffuse = new Color3(1, .92, .8);
  sun.intensity = 1.28;
  const shadow = new CascadedShadowGenerator(1536, sun);
  shadow.numCascades = 2;
  shadow.lambda = .72;
  shadow.shadowMaxZ = 330;
  shadow.stabilizeCascades = true;
  shadow.filter = ShadowGenerator.FILTER_PCF;
  shadow.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadow.bias = .0025;
  shadow.normalBias = .035;
  shadow.setDarkness(.24);

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
  scene.imageProcessingConfiguration.vignetteWeight = 1.1;
  scene.imageProcessingConfiguration.vignetteStretch = .25;
  scene.imageProcessingConfiguration.vignetteColor = new Color4(.025, .035, .045, 1);

  // Occlusion ambiante en profil Qualité : c'est elle qui assoit les bâtiments
  // au sol et creuse les angles de rue, la zone la plus « flottante » du rendu
  // sans elle. Créée détachée, attachée par applyQuality.
  const ssao = new SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: .5, blurRatio: .5 }, []);
  ssao.radius = 1.9;
  ssao.totalStrength = 1.05;
  ssao.samples = 12;
  ssao.maxZ = 260;

  await progress(12, 'Chargement des données réelles d’Artix…');
  const [rawOsm, rawBati, rawPoi, rawRoofs, rawRoofsLegacy, rawFacades] = await Promise.all([
    loadJson<any>('artix-osm.json', true),
    loadJson<any>('artix-bdtopo.json', true),
    loadJson<any>('artix-poi.json'),
    loadJson<any>('artix-toits-lidar.json'),
    loadJson<any>('artix-toitures.json'),
    loadJson<any>('artix-facades.json'),
  ]);
  if (!rawOsm || !rawBati) throw new Error('Les données essentielles d’Artix sont absentes.');

  await progress(26, 'Reconstruction du modèle Three.js original…');
  const faithful = await buildFaithfulArtix(scene, {
    osm: rawOsm,
    buildings: rawBati,
    poi: rawPoi,
    roofs: rawRoofs,
    roofsLegacy: rawRoofsLegacy,
    facades: rawFacades,
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
    camera.maxZ = profile.fogEnd + 250;
    sun.shadowEnabled = profile.shadows;
    pipeline.bloomEnabled = next !== 'performance';
    if (next === 'quality') {
      scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao', camera);
    } else {
      scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao', camera);
    }
    world.setQuality(profile.chunkRadius, profile.vegetationDensity);
    traffic.setDensity(next === 'performance' ? .5 : next === 'balanced' ? .78 : 1);
    qualityEl.textContent = profile.label;
  };
  applyQuality(DEFAULT_QUALITY);

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

    if (playing && !paused) {
      car.update(dt, input);
      world.update(car.root.position.x, car.root.position.z);
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
