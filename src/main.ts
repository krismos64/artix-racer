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

// ---- Chaîne des Pyrénées au sud ------------------------------------------
// Le fond est peint, pas modelé : trois plans de crêtes emboîtés, chacun
// avec son dégradé de brume. C'est la perspective atmosphérique, et non le
// relief, qui donne l'échelle et la distance à une montagne lointaine.
//
// Le premier jet était un ruban unique en gris-vert opaque, brouillard
// désactivé : il se lisait comme un carton découpé posé derrière la ville.
// Pire, il portait un pic du Midi d'Ossau de 150 m de haut pour 85 m de
// large, dessiné sur une grille de 64 points (un tous les 56 m) : la dent
// tombait entre deux sommets et ressortait en un gigantesque triangle de
// travers, celui qu'on voyait à l'écran.
//
// Cotes réelles, mesurées depuis Artix (43,39743 N ; -0,57224 E) :
//   Ossau (Grand Pic 2 884 m) à 62,6 km, azimut 169,9°, hauteur apparente
//   2 467 m une fois la courbure terrestre retirée (307 m), soit 2,26° de
//   haut et 2,75° de large. Sur un fond posé à 1 380 m de la caméra, cela
//   fait 54 m de haut et 66 m de large : le pic doit être DISCRET, presque
//   une dent sur l'horizon. L'ancien était trois fois trop grand.
const OSSAU = {
  distanceCamera: 1380,     // profondeur du fond dans la scène
  hauteur: 54,              // hauteur apparente exacte, en mètres de scène
  demiLargeur: 33,
  x: -246,                  // azimut 169,9° projeté sur le plan de fond
  breche: .62,              // hauteur de la Fourche : 180 m sous le Grand Pic
  // TRICHE ASSUMÉE sur l'échelle du seul pic. À sa taille exacte (2,26° de
  // haut), l'Ossau se réduit à une dent de quelques pixels que la brume de
  // 63 km d'air efface presque : fidèle, mais invisible en roulant. Le
  // grossir de deux fois et demie le rend reconnaissable comme sur les vues
  // du Béarn, sans écraser la ville ni toucher au reste de la chaîne, qui
  // garde ses cotes réelles. Choix de Christophe, septembre 2026.
  exagerationHauteur: 2.5,
  exagerationLargeur: 1.6,
};

interface CretePyrenees {
  profondeur: number;   // distance à la caméra
  hauteur: number;      // altitude moyenne de la crête
  brume: number;        // 0 = crête nette, 1 = fondue dans le ciel
  graine: number;
  ossau: boolean;       // cette couche porte-t-elle le pic ?
}
// Trois plans, du plus lointain au plus proche. Les crêtes de l'arrière-plan
// sont plus hautes et plus pâles : c'est ce recouvrement, plus le contraste
// croissant vers l'avant, qui fait lire une chaîne et non une découpe.
const CRETES: CretePyrenees[] = [
  { profondeur: 1420, hauteur: 62, brume: .62, graine: 7.3, ossau: false },
  { profondeur: 1380, hauteur: 52, brume: .42, graine: 3.1, ossau: true },
  { profondeur: 1330, hauteur: 36, brume: .24, graine: 11.7, ossau: false },
];

// Profil d'une crête : sommes de sinus de périodes différentes, donc des
// pics irréguliers plutôt qu'une ondulation régulière. `u` va de 0 à 1.
function profilCrete(u: number, graine: number): number {
  const x = u * 22 + graine;
  return (Math.abs(Math.sin(x)) * .5
    + Math.abs(Math.sin(x * 2.3 + 1.7)) * .3
    + Math.abs(Math.sin(x * 5.1 + .4)) * .2);
}

// Texture d'une couche de crêtes : la silhouette est dessinée en opacité,
// avec un dégradé vertical qui fond le pied dans le ciel (brume de vallée)
// et garde les sommets denses. Les hauts sommets reçoivent leur neige.
//
// Passer par une texture plutôt que par de la géométrie permet une
// silhouette au pixel près, un dégradé continu et un seul quad par couche :
// impossible à obtenir avec un ruban de 64 points.
function texturerCrete(scene: Scene, crete: CretePyrenees, largeur = 2048, hauteur = 256): DynamicTexture {
  const texture = new DynamicTexture(`crete-${crete.graine}`, { width: largeur, height: hauteur }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, largeur, hauteur);

  // Ligne de crête, échantillonnée au pixel : plus de pic dessiné « entre
  // deux sommets », le défaut de l'ancien ruban.
  // Deux passes : la chaîne d'abord, seule, pour fixer l'échelle verticale ;
  // le pic ensuite, ajouté PAR-DESSUS cette échelle. Normaliser sur une
  // ligne qui contient déjà l'Ossau grossi écraserait toute la chaîne autour
  // de lui, exactement ce qu'on cherche à éviter.
  const fond: number[] = [];
  for (let px = 0; px < largeur; px++) fond.push(profilCrete(px / (largeur - 1), crete.graine));
  const maxFond = Math.max(...fond);

  const ligne: number[] = [];
  for (let px = 0; px < largeur; px++) {
    const u = px / (largeur - 1);
    let h = fond[px] / maxFond;
    if (crete.ossau) {
      // Silhouette de l'Ossau : deux dents séparées par la Fourche, 180 m
      // sous le Grand Pic. Le Petit Pic (2 812 m) est à peine plus bas et
      // se tient à l'est. Cotes ramenées à la largeur de la texture.
      const centre = .5 + OSSAU.x / 3600;
      const demi = OSSAU.demiLargeur * OSSAU.exagerationLargeur / 3600;
      const d = (u - centre) / demi;
      // Deux gaussiennes serrées et une brèche creusée entre elles.
      const grand = Math.exp(-((d + .45) ** 2) * 9);
      const petit = Math.exp(-((d - .55) ** 2) * 11) * .95;
      const fourche = Math.exp(-((d - .05) ** 2) * 46) * (1 - OSSAU.breche);
      const massif = Math.exp(-(d ** 2) * 1.6) * .5;
      // Hauteur du pic rapportée à celle de la chaîne : le rapport réel est
      // 54 m de pic pour 52 m de crête moyenne, soit à peine plus haut. Avec
      // l'exagération il monte à deux fois et demie la crête, ce qui le
      // détache franchement de la ligne d'horizon.
      const relief = Math.max(0, massif + Math.max(grand, petit) - fourche);
      h += relief * (OSSAU.hauteur / 52) * OSSAU.exagerationHauteur;
    }
    ligne.push(h);
  }
  // Échelle : la chaîne occupe 1, le pic dépasse au-delà. On divise par le
  // maximum atteint pour que rien ne sorte du canvas, mais le rapport entre
  // pic et crête est désormais fixé plus haut, pas subi.
  const maxLigne = Math.max(...ligne);

  // Remplissage colonne par colonne, avec dégradé vertical.
  //
  // La ligne de crête occupe la bande `PART_CRETE` du HAUT du canvas : le
  // sommet le plus élevé touche le bord supérieur, le plus bas s'arrête à
  // `PART_CRETE`. Sous cette bande, il n'y a plus que le pied de la montagne
  // qui se dissout dans la brume de vallée.
  //
  // Le calcul précédent partait du bas de la bande et REMONTAIT : une
  // colonne de faible hauteur y démarrait donc tout en haut du canvas, et
  // son remplissage descendait jusqu'au pied. Toutes les colonnes basses
  // peignaient ainsi un bloc plein par-dessus les crêtes, ce grand rectangle
  // gris à bords verticaux nets qui barrait le ciel.
  const PART_CRETE = .55;
  for (let px = 0; px < largeur; px++) {
    const h = ligne[px] / maxLigne;
    const sommet = hauteur * PART_CRETE * (1 - h);
    const grad = ctx.createLinearGradient(0, sommet, 0, hauteur);
    // Le sommet est le plus opaque, le pied se dissout dans la brume.
    // Corps de la montagne en GRIS : le blanc est réservé à la neige, sinon
    // elle ne se distingue pas du rocher (mesuré : 173 px blancs sur 256
    // dans la colonne du pic, la neige noyait toute la silhouette).
    grad.addColorStop(0, `rgba(150,158,170,${(1 - crete.brume * .18).toFixed(3)})`);
    grad.addColorStop(.30, `rgba(142,152,166,${(1 - crete.brume * .55).toFixed(3)})`);
    // Extinction rapide : au-delà du tiers inférieur de la bande, la brume
    // de vallée a tout mangé. Un dégradé étalé jusqu'au bas du plan
    // remplissait l'écran d'un voile laiteux au lieu d'une chaîne.
    grad.addColorStop(.62, `rgba(134,146,160,${(1 - crete.brume).toFixed(3)})`);
    grad.addColorStop(1, "rgba(130,142,158,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(px, sommet, 1, hauteur - sommet);
  }

  // Neige des hauts sommets : au-dessus d'une ligne d'enneigement, et
  // seulement là où la pente s'adoucit (une paroi verticale ne retient pas
  // la neige). Dessinée en blanc franc par-dessus la silhouette.
  const enneigement = crete.ossau ? .72 : .80;
  ctx.globalCompositeOperation = 'source-atop';
  for (let px = 0; px < largeur; px++) {
    const h = ligne[px] / maxLigne;
    if (h < enneigement) continue;
    // Épaisseur du manteau : croît avec l'altitude au-dessus de la limite.
    const part = (h - enneigement) / (1 - enneigement);
    const sommet = hauteur * PART_CRETE * (1 - h);
    const bas = sommet + hauteur * PART_CRETE * (.08 + part * .12);
    const grad = ctx.createLinearGradient(0, sommet, 0, bas);
    grad.addColorStop(0, `rgba(255,255,255,${(.55 + part * .40).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(px, sommet, 1, bas - sommet);
  }
  ctx.globalCompositeOperation = 'source-over';

  // Extinction latérale : le plan s'arrête net à ses deux extrémités, ce qui
  // dessinait deux arêtes verticales franches en plein ciel. On efface donc
  // progressivement les bords, la chaîne se perdant dans la brume comme elle
  // le fait vers l'est et l'ouest depuis la plaine.
  ctx.globalCompositeOperation = 'destination-out';
  const marge = largeur * .14;
  for (const [x0, x1] of [[0, marge], [largeur, largeur - marge]] as const) {
    const fondu = ctx.createLinearGradient(x0, 0, x1, 0);
    fondu.addColorStop(0, 'rgba(0,0,0,1)');
    fondu.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fondu;
    ctx.fillRect(Math.min(x0, x1), 0, marge, hauteur);
  }
  ctx.globalCompositeOperation = 'source-over';

  texture.update(false);
  texture.hasAlpha = true;
  return texture;
}

// Plans de crêtes. Renvoie les matériaux, dont la teinte est recalée sur
// chaque ambiance (`teinterBackdrop`) : une montagne bleutée à midi vire au
// mauve au couchant et disparaît presque la nuit.
function createBackdrop(scene: Scene): PBRMaterial[] {
  const materiaux: PBRMaterial[] = [];
  for (const crete of CRETES) {
    const texture = texturerCrete(scene, crete);
    const materiau = new PBRMaterial(`pyrenees-${crete.graine}`, scene);
    materiau.albedoTexture = texture;
    materiau.opacityTexture = texture;
    // Le canal alpha de la texture N'EST PAS lu tant que le matériau reste en
    // mode opaque : Babylon peignait donc le quad entier, y compris la moitié
    // basse transparente et les bords estompés. C'est ce qui produisait le
    // grand voile gris à arêtes verticales en travers du ciel, celui qui
    // survivait à toutes les corrections du dessin de la texture.
    texture.hasAlpha = true;
    materiau.useAlphaFromAlbedoTexture = true;
    materiau.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
    materiau.alphaMode = Engine.ALPHA_COMBINE;
    // Un fond lointain n'écrit pas la profondeur : il se dessine derrière
    // tout le reste, et le ciel se voit à travers ses parties transparentes.
    materiau.disableDepthWrite = true;
    materiau.unlit = true;
    materiau.backFaceCulling = false;
    materiau.metadata = { brume: crete.brume };
    materiaux.push(materiau);

    // Un seul quad par couche, largeur 3 600 m pour couvrir tout l'horizon
    // sud. La hauteur suit la cote apparente calculée pour l'Ossau.
    const largeur = 3600;
    const hauteur = crete.hauteur * (256 / 54) * 1.05;
    const plan = MeshBuilder.CreatePlane(`pyrenees-plan-${crete.graine}`, {
      width: largeur, height: hauteur, sideOrientation: Mesh.DOUBLESIDE,
    }, scene);
    plan.material = materiau;
    // Le pied du plan doit passer SOUS la ligne d'horizon, sinon la bande
    // transparente du bas laisse voir les crêtes flotter en l'air, détachées
    // du sol. On l'enfonce donc largement : la partie basse est de toute
    // façon masquée par le terrain et par la ville.
    plan.position.set(0, hauteur * .5 - 120, crete.profondeur);
    plan.isPickable = false;
    // PAS d'infiniteDistance : il recentre le plan sur la caméra à chaque
    // image, ce qui annule sa position en Z et écrase les trois couches à la
    // même profondeur. Le fond est assez loin (1 330 à 1 420 m) pour que le
    // déplacement du joueur ne produise aucune parallaxe visible.
    // Le brouillard linéaire (fin à 980 m en Équilibré) noierait un fond
    // situé au-delà de 1 300 m : la brume est peinte dans la texture.
    plan.applyFog = false;
    plan.freezeWorldMatrix();
  }
  return materiaux;
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

  const cretesPyrenees = createBackdrop(scene);
  // Teinte des crêtes, recalée à chaque ambiance. Une montagne lointaine
  // prend la couleur de l'air qui la sépare de l'observateur : elle est donc
  // dérivée de la couleur du brouillard, tirée vers le bleu et assombrie
  // d'autant moins que la couche est loin (celle du fond est presque le
  // ciel). Sans cela le fond restait gris-vert au couchant comme la nuit.
  const teinterBackdrop = (fog: Color3, neige: number): void => {
    for (const materiau of cretesPyrenees) {
      const brume = (materiau.metadata?.brume as number) ?? .6;
      // Plus la couche est embrumée, plus elle se rapproche de l'air ambiant.
      // L'étagement doit être FRANC : à teintes trop voisines (0,54 contre
      // 0,43 mesuré à l'écran), les trois couches se confondent en une seule
      // bande pâle et la chaîne perd sa profondeur. La couche de devant
      // descend donc nettement plus bas que celle du fond.
      const montagne = new Color3(
        fog.r * (.38 + brume * .96),
        fog.g * (.46 + brume * .92),
        fog.b * (.68 + brume * .78),
      );
      materiau.unfreeze?.();
      materiau.albedoColor = montagne;
      // Le matériau est `unlit` : l'émissif s'AJOUTE à l'albédo et lave
      // l'image s'il est trop fort. Il ne sert qu'à faire capter aux
      // sommets la lumière que la plaine n'a plus, dosé très bas.
      materiau.emissiveColor = montagne.scale(neige * .22 * (1 - brume * .6));
      materiau.freeze();
    }
  };
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
    neige: number;         // éclat des sommets enneigés du fond
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
      // Plein midi : la neige des sommets est éblouissante.
      neige: .55,
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
      // Le soir, les sommets gardent la lumière quand la plaine est à
      // l'ombre : c'est l'effet alpenglow, rose sur la neige.
      neige: .72,
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
      // La nuit, seule la neige capte encore un peu de clair de lune.
      neige: .18,
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
    teinterBackdrop(a.fog, a.neige);
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
