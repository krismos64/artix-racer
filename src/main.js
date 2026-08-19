// Artix Racer : boucle de jeu principale.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { parseOSM, findSpawn, project } from './osm.js';
import { parseBDTopo } from './bdtopo.js';
import { Terrain, pointsAltitude, TAILLE as TERRAIN_TAILLE, RESOLUTION as TERRAIN_RES } from './terrain.js';
import { parsePOI } from './poi.js';
import { buildSignage } from './signage.js';
import { buildLandmarks } from './landmarks.js';
import { ShaderContours } from './contours.js';
import { Pietons } from './pedestrians.js';
import { EclairagePublic } from './streetlights.js';
import { VoituresGarees } from './parkedcars.js';
import { ParkingsEpi } from './parking.js';
import { Accotements } from './accotements.js';
import { buildWorld, ROAD_Y, GARDE_SOL } from './world.js';
import { Car, SPEC, restingHeight, ANCHOR_Y } from './car.js';
import { buildCarMesh } from './carmesh.js';
import { chargerVoiture, animerRoues } from './carmodel.js';

import { AudioEngine } from './audio.js';
import { Qualite, PROFILS, PROFIL_DEFAUT } from './quality.js';
import { GrilleInstances } from './spatial.js';
import { Minicarte } from './minimap.js';
import { Touffes } from './touffes.js';

// Modèle du véhicule piloté.
//
// Le pack Kenney Car Kit (CC0) a été essayé et écarté : 2 000 triangles au lieu
// de 213 000 et des roues nommées séparément, mais un style cartoon assumé.
// Ses carrosseries sont trapues (hauteur sur longueur de 0,44 à 0,60, quand une
// berline réelle est à 0,36), en aplats de couleur, avec des roues en disques
// plats et aucun vitrage. Dans une ville reconstituée au LiDAR et à la
// photographie de rue, le contraste est trop fort.
//
// `chargerVoiture` reconnaît malgré tout la convention de nommage Kenney
// (`wheel-front-left` et compagnie) : déposer un de ces GLB dans
// `public/models/` et changer cette constante suffit à l'essayer.
const MODELE_VOITURE = 'models/AudiR8.glb';

const el = (id) => document.getElementById(id);
const loaderText = el('loader-text');
const loaderBar = el('loader-bar');

// Journal de construction : ce qui a été lu, ce qui a été posé. Ces relevés
// servent à comparer la donnée au rendu (un compteur dit ce qui est posé, pas
// ce qui a été lu) et n'ont d'intérêt qu'en développement. Les avertissements
// et les erreurs, eux, restent affichés en production.
const diag = import.meta.env.DEV
  ? (...a) => console.log(...a)
  : () => {};

function progress(pct, text) {
  loaderBar.style.width = pct + '%';
  if (text) loaderText.textContent = text;
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
}

// ---------------------------------------------------------------------------
// Entrées clavier
// ---------------------------------------------------------------------------
const keys = new Set();
const pressed = new Set(); // touches consommées une seule fois

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (!keys.has(k)) pressed.add(k);
  keys.add(k);
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

const down = (...ks) => ks.some((k) => keys.has(k));
function tapped(k) {
  if (pressed.has(k)) { pressed.delete(k); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
async function init() {
  await progress(5, 'Initialisation du moteur physique...');
  await RAPIER.init();

  await progress(15, "Chargement des données cartographiques d'Artix...");

  // `fetch` ne rejette pas sur un 404 : sans contrôle du statut, un fichier
  // absent remonte une erreur d'analyse JSON qui ne dit pas lequel manque.
  async function charger(nom, { requis = false } = {}) {
    try {
      const r = await fetch(`data/${nom}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (err) {
      if (requis) throw new Error(`données indispensables illisibles (${nom}) : ${err.message}`);
      // Une source facultative illisible dégrade la ville en silence : sans ce
      // message, on cherche longtemps pourquoi les toits sont plats ou les
      // façades grises.
      console.warn(`Source facultative ignorée (${nom}) : ${err.message}`);
      return null;
    }
  }

  const [raw, rawBati, rawPoi, rawToits, rawToitsLidar, rawFacades] = await Promise.all([
    // Sans le réseau OSM il n'y a ni route ni ville : seule source obligatoire.
    charger('artix-osm.json', { requis: true }),
    // BD TOPO : hauteurs mesurées et matériaux réels des bâtiments d'Artix.
    charger('artix-bdtopo.json'),
    // Signalisation et équipements : cartographiés en nœuds OSM, ils
    // n'apparaissent pas dans la requête des surfaces.
    charger('artix-poi.json'),
    // Toitures relevées au LiDAR HD : forme réelle de la couverture, que ni
    // OSM ni la BD TOPO ne fournissent.
    charger('artix-toitures.json'),
    // Relevé LiDAR détaillé : forme, gouttière et faîtage mesurés par
    // bâtiment. Prend le pas sur le classement en trois catégories ci-dessus.
    charger('artix-toits-lidar.json'),
    // Teintes de façade relevées sur les photographies de rue Panoramax.
    charger('artix-facades.json'),
  ]);

  // Le relevé détaillé remplace l'ancien classement quand il est présent.
  const toitsRetenus = rawToitsLidar?.toits?.length ? rawToitsLidar : rawToits;

  await progress(28, 'Analyse du réseau routier...');
  const data = parseOSM(raw);

  // Les emprises OSM d'Artix viennent du cadastre : ni hauteur, ni matériau.
  // Quand la BD TOPO est disponible, elle les remplace intégralement.
  let terrain = null;
  if (rawBati) {
    const bdt = parseBDTopo(rawBati, toitsRetenus, rawFacades);
    if (toitsRetenus?.toits?.length) {
      const f = { 0: 0, 1: 0, 2: 0 };
      for (const t of toitsRetenus.toits) f[t.f]++;
      diag(`Toitures LiDAR : ${toitsRetenus.toits.length} mesurées `
        + `(${f[0]} plates, ${f[1]} monopentes, ${f[2]} à deux pans)`);
    } else if (toitsRetenus?.toitures?.length) {
      diag(`Toitures LiDAR : ${toitsRetenus.toitures.length} relevées`);
    }
    if (rawFacades?.facades?.length) {
      const retenues = bdt.batiments.filter((b) => b.teinteMur != null).length;
      diag(`Façades Panoramax : ${rawFacades.facades.length} relevées, `
        + `${retenues} appliquées`);
    }
    if (bdt.batiments.length > 200) {
      // Les châteaux d'eau sont modélisés à part : on retire leur emprise de
      // la liste des bâtiments, sinon un bloc extrudé se superposerait à la
      // tour et masquerait sa silhouette.
      // Les repères modélisés à part (châteaux d'eau, mairie) sont exclus des
      // bâtiments extrudés, sinon un bloc se superposerait à leur silhouette.
      const exclusions = [...(data.chateauxEau ?? []).map(
        (t) => ({ x: t.x, z: t.z, rayon: t.rayon + 6 }),
      )];
      for (const lm of data.landmarkSources ?? []) {
        let cx = 0, cz = 0;
        for (const [px, pz] of lm.pts) { cx += px; cz += pz; }
        cx /= lm.pts.length; cz /= lm.pts.length;
        let r = 0;
        for (const [px, pz] of lm.pts) r = Math.max(r, Math.hypot(px - cx, pz - cz));
        exclusions.push({ x: cx, z: cz, rayon: r + 4 });
      }
      data.buildings = exclusions.length
        ? bdt.batiments.filter((b) => {
          let cx = 0, cz = 0;
          for (const [px, pz] of b.pts) { cx += px; cz += pz; }
          cx /= b.pts.length; cz /= b.pts.length;
          return !exclusions.some((t) => Math.hypot(t.x - cx, t.z - cz) < t.rayon);
        })
        : bdt.batiments;
      data.altRef = bdt.altRef;
      // Relief réel : les altitudes de sol mesurées par l'IGN sur chaque
      // bâtiment donnent un modèle de terrain fidèle. Artix n'est pas plate,
      // elle présente près de 40 m de dénivelé sur la zone de jeu.
      const pts = pointsAltitude(rawBati);
      if (pts.length > 300) {
        terrain = new Terrain(pts, bdt.altRef);
        // Terrassement : le terrain est creusé sous les voies carrossables pour
        // qu'il ne ressorte jamais au-dessus de l'asphalte. Sans cette étape,
        // le sol interpolé sur sa grille de 22 m remonte entre deux nœuds et
        // l'herbe déborde sur la chaussée.
        terrain.terrasser(data.roads, GARDE_SOL);
        data.terrain = terrain;
      }
      diag(`BD TOPO : ${bdt.batiments.length} bâtiments, `
        + `${pts.length} points d'altitude`);
    }
  }

  // --- Rendu --------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    canvas: el('game'), antialias: true, powerPreference: 'high-performance',
  });
  // Sur écran Retina, rendre à 2x quadruple le nombre de pixels pour un gain
  // visuel faible en jeu. 1,5x est le bon compromis netteté / fluidité.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  // Les ombres sont réglées plus bas, une fois la ville construite : c'est là
  // que se décide quels maillages les projettent. Elles sont actives par
  // défaut, la touche O les coupe.
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc4e8);
  scene.fog = new THREE.Fog(0x9fc4e8, 320, 1250);

  // Dôme de ciel : un fond uni donne un horizon plat et artificiel. Un dégradé
  // du zénith vers l'horizon, plus quelques nuages, installe la profondeur.
  const skyGeo = new THREE.SphereGeometry(2600, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      hautCiel: { value: new THREE.Color(0x4a86c8) },
      basCiel: { value: new THREE.Color(0xc9dcee) },
      // Direction du soleil, tenue à jour par le cycle jour/nuit. Elle porte
      // le disque solaire et le halo qui l'entoure, tous deux dessinés dans ce
      // shader plutôt qu'ajoutés en géométrie : un dôme les rend gratuitement.
      soleilDir: { value: new THREE.Vector3(0.5, 0.5, 0.3) },
      // Teinte du disque et de son halo, plus chaude à l'horizon.
      soleilTeinte: { value: new THREE.Color(0xfff0d8) },
      // Force du halo, nulle une fois le soleil couché.
      soleilForce: { value: 1 },
      // Densité des nuages. Ils restent très discrets : un ciel de bourg
      // béarnais est le plus souvent voilé, jamais chargé de cumulus dessinés.
      nuages: { value: 0.5 },
      // Défilement lent des nuages, pour qu'un arrêt prolongé ne fige pas le
      // ciel. Une valeur, pas une horloge : la boucle l'avance elle-même.
      derive: { value: 0 },
    },
    vertexShader: `
      varying float hauteur;
      varying vec3 dir;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        dir = normalize(position);
        hauteur = dir.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 hautCiel;
      uniform vec3 basCiel;
      uniform vec3 soleilDir;
      uniform vec3 soleilTeinte;
      uniform float soleilForce;
      uniform float nuages;
      uniform float derive;
      varying float hauteur;
      varying vec3 dir;

      // Bruit de valeur à trois octaves. Il ne sert qu'aux voiles nuageux,
      // dont on ne veut que la basse fréquence : trois octaves suffisent, et
      // au-delà le voile se met à grésiller quand la caméra tourne.
      float alea(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float bruitVal(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(alea(i), alea(i + vec2(1.0, 0.0)), u.x),
                   mix(alea(i + vec2(0.0, 1.0)), alea(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float voile(vec2 p) {
        return bruitVal(p) * 0.55 + bruitVal(p * 2.3) * 0.30 + bruitVal(p * 4.7) * 0.15;
      }

      void main() {
        // Dégradé resserré près de l'horizon, comme un vrai ciel.
        float t = clamp(pow(max(hauteur, 0.0), 0.55), 0.0, 1.0);
        vec3 couleur = mix(basCiel, hautCiel, t);

        // Brume d'horizon : l'air épaissit vers le bas et délave la teinte.
        // C'est elle qui raccorde le ciel au brouillard de la scène, sans quoi
        // la ligne d'horizon tranche net entre les deux.
        float brume = pow(1.0 - clamp(abs(hauteur), 0.0, 1.0), 5.0);
        couleur = mix(couleur, basCiel * 1.06 + 0.03, brume * 0.55);

        // Voiles nuageux. Projection de la direction sur un plan horizontal :
        // les nuages s'étirent près de l'horizon comme vus par la tranche, ce
        // qu'un placage sphérique ne donne pas. Le facteur est borné pour que
        // la projection n'explose pas au ras de l'horizon.
        float ph = max(abs(hauteur), 0.12);
        vec2 uv = dir.xz / ph * 0.55 + vec2(derive, derive * 0.35);
        float n = voile(uv);
        // Seuil haut et transition large : on cherche un ciel voilé, pas des
        // masses dessinées. Le voile s'efface près de l'horizon, où il se
        // confondrait avec la brume.
        float masse = smoothstep(0.52, 0.86, n) * nuages
          * smoothstep(0.04, 0.30, hauteur);
        // Le nuage prend la teinte du ciel éclaircie, jamais un blanc pur :
        // au coucher, un nuage blanc sur un ciel orange trahit le placage.
        vec3 tonNuage = mix(couleur, soleilTeinte, 0.22) * 1.16 + 0.02;
        couleur = mix(couleur, tonNuage, masse * 0.55);

        // Disque solaire et son halo. Le halo est large et faible, le disque
        // étroit et vif : c'est le rapport entre les deux qui donne un soleil
        // plutôt qu'une tache. Les deux s'éteignent avec soleilForce, sinon
        // un disque resterait visible après le coucher.
        float cosA = dot(dir, soleilDir);
        float halo = pow(max(cosA, 0.0), 220.0);
        float disque = smoothstep(0.9993, 0.9997, cosA);
        couleur += soleilTeinte * (halo * 0.55 + disque * 1.7) * soleilForce;

        gl_FragColor = vec4(couleur, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.renderOrder = -100;
  scene.add(sky);

  // --- Environnement pour les surfaces métalliques -------------------------
  // La carrosserie du véhicule est déclarée `metallicFactor = 1` dans le glTF.
  // En PBR, un métal pur n'a pas de couleur diffuse : il ne restitue que ce
  // qu'il réfléchit. Sans carte d'environnement, il n'a rien à réfléchir et
  // ressort noir, quelle que soit la teinte de peinture du fichier : c'est ce
  // qui donnait une voiture presque noire là où le modèle porte un rouge vif.
  //
  // On génère donc une petite carte à partir d'un dégradé ciel/sol accordé à
  // la scène, plutôt que de charger un HDR externe : le rendu reste cohérent
  // avec l'éclairage du jeu et aucun asset ne s'ajoute au projet.
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envCanvas = document.createElement('canvas');
  envCanvas.width = 16; envCanvas.height = 128;
  {
    const ctx = envCanvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 128);
    // Zénith, horizon, puis sol : les trois zones que reflète une carrosserie.
    grad.addColorStop(0.00, '#6f9fd8');
    grad.addColorStop(0.45, '#cfe0f2');
    grad.addColorStop(0.52, '#b9b6ac');
    grad.addColorStop(1.00, '#54524b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 16, 128);
  }
  const envTex = new THREE.CanvasTexture(envCanvas);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  envTex.colorSpace = THREE.SRGBColorSpace;
  const envRT = pmrem.fromEquirectangular(envTex);
  // `environment` n'affecte que les reflets : le fond visible reste le dôme de
  // ciel dégradé, qui suit le cycle jour/nuit.
  scene.environment = envRT.texture;
  envTex.dispose();
  pmrem.dispose();

  // Le plan proche conditionne toute la précision du depth buffer : à 0,3 m
  // pour 4 km de portée, les surfaces au sol deviennent indiscernables.
  // 1 m suffit largement pour une caméra de jeu de voiture.
  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 1, 3000);

  // Occlusion ambiante en espace écran. C'est elle qui pose les objets au sol :
  // sans elle, une voiture garée ou un poteau semblent flotter, faute d'ombre
  // de contact. Elle assombrit aussi les angles rentrants des façades, ce qui
  // révèle le volume des bâtiments là où l'éclairage direct les aplatit.
  let composer = null;
  try {
    const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { OutputPass }] = await Promise.all([
      import('three/examples/jsm/postprocessing/EffectComposer.js'),
      import('three/examples/jsm/postprocessing/RenderPass.js'),
      import('three/examples/jsm/postprocessing/GTAOPass.js'),
      import('three/examples/jsm/postprocessing/OutputPass.js'),
    ]);
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    // L'occlusion est calculée en demi-résolution. C'est le poste le plus
    // coûteux de la frame : mesuré à 3,7 ms en pleine résolution, soit à lui
    // seul l'écart entre 49 et 60 fps, très loin devant les ombres. L'occlusion
    // ambiante est une donnée basse fréquence (de larges dégradés au pied des
    // objets, aucun détail fin), la calculer sur deux fois moins de pixels ne
    // se voit pas : captures comparées à midi, images indiscernables.
    // Pilotée par le profil graphique : `let` et non `const`, la valeur change
    // quand le joueur bascule de profil.
    let GTAO_ECHELLE = PROFILS[PROFIL_DEFAUT].gtaoEchelle;
    const gtao = new GTAOPass(scene, camera,
      Math.round(innerWidth * GTAO_ECHELLE), Math.round(innerHeight * GTAO_ECHELLE));
    // Rayon court : on cherche les ombres de contact au pied des objets, pas
    // un assombrissement global qui ternirait toute la scène.
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.2, thickness: 1.0,
      scale: 1.0, samples: 8, distanceFallOff: 1.0 });
    // Le ciel n'a pas de géométrie à occlure : sans cette borne, la passe
    // assombrit le dôme au-delà des bâtiments et l'horizon vire au gris.
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
    composer.addPass(gtao);
    // `addPass` redimensionne la passe à la taille du composer multipliée par
    // le pixelRatio, écrasant les dimensions passées au constructeur. La
    // demi-résolution doit donc être imposée après l'ajout, jamais avant.
    const redimGtao = () => gtao.setSize(
      Math.round(innerWidth * renderer.getPixelRatio() * GTAO_ECHELLE),
      Math.round(innerHeight * renderer.getPixelRatio() * GTAO_ECHELLE));
    redimGtao();
    // Contours de silhouette, avant le mappage de tons : le trait doit subir la
    // même courbe que le reste de l'image, sinon il ressort d'un noir plat qui
    // tranche avec la scène. Il réutilise la profondeur et les normales que la
    // passe d'occlusion vient de calculer, sans rendu de géométrie en plus.
    const { ShaderPass } = await import('three/examples/jsm/postprocessing/ShaderPass.js');
    const contours = new ShaderPass(ShaderContours);
    contours.uniforms.cameraNear.value = camera.near;
    contours.uniforms.cameraFar.value = camera.far;
    // Six paliers : assez pour lire comme un aplat, assez pour que deux façades
    // de teintes voisines ne se confondent pas. Trois paliers, valeur classique
    // du cel shading, effaçaient les écarts de teinte relevés sur photographie.
    contours.uniforms.celPaliers.value = 6.0;
    contours.enabled = false;   // désactivés par défaut, touche K pour comparer
    composer.addPass(contours);
    // Les textures de la GTAO ne sont créées qu'à son premier rendu : on les
    // rebranche à chaque frame plutôt qu'une fois pour toutes.
    const majContours = () => {
      contours.uniforms.tDepth.value = gtao.depthTexture ?? null;
      contours.uniforms.tNormal.value = gtao.normalTexture ?? null;
      // Résolution des TEXTURES échantillonnées, pas celle de l'écran : la
      // passe d'occlusion travaille en demi-résolution, et annoncer la taille
      // écran faisait lire quatre fois le même texel au lieu de comparer des
      // voisins. Le détecteur voyait alors un écart partout et noyait l'image
      // de noir dès qu'on abaissait les seuils.
      const img = gtao.depthTexture?.image;
      if (img?.width) contours.uniforms.resolution.value.set(img.width, img.height);
    };
    majContours();

    // Anticrénelage (touche A). Le `antialias: true` demandé au renderer est
    // sans effet dès qu'on passe par le composer : celui-ci rend dans ses
    // propres cibles, dont le MSAA vaut 0. Les arêtes de toiture crénelaient
    // donc pour rien.
    //
    // SMAA plutôt que MSAA, mesuré sur cette scène : le MSAA coûte 16 fps en
    // 4x comme en 2x, la géométrie étant trop dense pour lui (3 500 bâtiments,
    // chaque échantillon multipliant le travail de rastérisation). SMAA
    // travaille sur l'image finale, à coût constant : entre 0 et 3 fps, la
    // valeur exacte n'étant pas isolable par alternance, l'ordre des séries
    // changeant le signe du résultat. Gain mesuré sur capture en contrepartie :
    // un quart de bords crénelés en moins.
    //
    // Placé après les contours et avant OutputPass : il doit lisser le trait
    // de silhouette comme le reste, et le mappage de tons reste en dernier.
    const { SMAAPass } = await import('three/examples/jsm/postprocessing/SMAAPass.js');
    // Les dimensions passées ici sont de toute façon écrasées par `addPass`,
    // qui redimensionne la passe à la taille du composer. On les fournit
    // quand même : le constructeur les attend et alloue ses cibles avec.
    const smaa = new SMAAPass(
      Math.round(innerWidth * renderer.getPixelRatio()),
      Math.round(innerHeight * renderer.getPixelRatio()));
    smaa.enabled = true;
    composer.addPass(smaa);
    composer.userData = { ...(composer.userData ?? {}), smaa };

    // Sans cette passe, le mappage de tons et l'espace colorimétrique du
    // renderer ne sont pas appliqués et l'image sort délavée.
    // OutputPass reprend le mappage de tons et l'exposition réglés sur le
    // renderer, y compris leurs variations au fil de la journée : ces réglages
    // restent portés par le renderer et ne doivent pas être neutralisés ici.
    composer.addPass(new OutputPass());

    // Redimensionnement complet de la chaîne de passes.
    //
    // `EffectComposer` capture le pixel ratio du renderer À SA CONSTRUCTION et
    // le garde dans `_pixelRatio`. Changer `renderer.setPixelRatio()` ensuite,
    // ce que font les profils graphiques et la résolution dynamique, ne
    // touchait donc PAS aux cibles du composer : le profil Performance
    // continuait de calculer autant de pixels qu'Équilibré, et le profil
    // Qualité pas un de plus. Seule la copie finale à l'écran changeait de
    // facteur d'échelle, ce qui explique qu'aucun des deux ne se voyait à
    // l'écran ni au compteur.
    //
    // `composer.setPixelRatio()` réaligne les cibles, puis rappelle
    // `setSize` : il faut donc réimposer l'échelle du GTAO après, sans quoi la
    // passe repasse en pleine résolution.
    const redimComposer = () => {
      // `setPixelRatio` appelle `setSize(_width, _height)` avec les dernières
      // dimensions connues : on les rafraîchit d'abord, sinon un changement de
      // profil après un redimensionnement de fenêtre repartirait de l'ancienne
      // taille et l'image sortirait étirée.
      composer.setSize(innerWidth, innerHeight);
      composer.setPixelRatio(renderer.getPixelRatio());
      // SMAA reçoit ses dimensions par ce `setSize` en cascade, déjà
      // multipliées par le pixel ratio : rien de plus à faire pour lui. GTAO,
      // lui, doit revenir à son échelle réduite, que `setSize` vient d'écraser.
      redimGtao();
      majContours();
    };
    window.addEventListener('resize', redimComposer);
    // Exposé pour la boucle de jeu et les bascules au clavier. Fusion et non
    // remplacement : `smaa` y a déjà été déposé plus haut.
    // `redimComposer` est exposé pour que le module de qualité redimensionne
    // toute la chaîne après un changement de profil ou un ajustement de
    // résolution dynamique.
    const setEchelleGtao = (e) => {
      GTAO_ECHELLE = e;
      redimGtao();
      majContours();
    };
    composer.userData = {
      ...(composer.userData ?? {}),
      contours, majContours, redimGtao, redimComposer, setEchelleGtao,
    };
    diag('Occlusion ambiante : active');
  } catch (err) {
    console.warn('Occlusion ambiante indisponible, rendu direct :', err.message);
  }

  // --- Éclairage ----------------------------------------------------------
  const sun = new THREE.DirectionalLight(0xfff2dd, 3.4);
  sun.position.set(140, 220, 90);
  sun.castShadow = true;
  // Volume d'ombre resserré autour du véhicule : couvrir toute la ville en
  // 2048² coûte une passe de rendu complète par frame pour un gain nul, les
  // ombres lointaines n'étant pas discernables.
  // 2048² sur un volume resserré : la résolution au sol double par rapport à
  // 1024², ce qui suffit à obtenir des bords d'ombre nets sur la chaussée
  // plutôt que l'escalier caractéristique des cartes trop grossières.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 320;
  const S = 62;
  sun.shadow.camera.left = -S; sun.shadow.camera.right = S;
  sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.035;
  // La carte d'ombre n'est pas recalculée à chaque frame. Elle ne change que si
  // le volume se déplace (il suit la voiture) ou si le soleil tourne : entre
  // deux, la redessiner revient à refaire une passe de rendu complète pour un
  // résultat identique au pixel près. Le rafraîchissement est déclenché à la
  // demande dans la boucle, via `sun.shadow.needsUpdate`.
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun, sun.target);

  // Ambiance du ciel, volontairement plus faible que le soleil : c'est le
  // rapport entre les deux qui creuse les volumes. À intensité égale, une
  // façade éclairée et une façade à l'ombre se ressemblent, et la scène paraît
  // plate quelle que soit la qualité des textures.
  // La couleur basse représente la lumière renvoyée par le sol. Un vert olive
  // franc (0x5d6b45) teintait en vert TOUTE surface horizontale, chaussée
  // comprise : l'asphalte gris ressortait vert sombre sous la voiture, au point
  // de passer pour de l'herbe débordant sur la voie. Artix n'est pas une
  // prairie continue, la moitié du sol visible depuis la route étant de
  // l'enrobé : un gris légèrement chaud, à peine verdi, rend le rebond du
  // bas-côté sans repeindre la route.
  const hemi = new THREE.HemisphereLight(0xa8c8ea, 0x9a9a92, 1.15);
  scene.add(hemi);
  // Teinte de sol diurne, conservée pour pouvoir y revenir : la nuit, le
  // rebond du sol vire à l'orangé des lanternes.
  // Rebond du sol, qui éclaire toutes les surfaces horizontales. Éclairci de
  // 0x6e6f60 à 0x9a9a92 : la chaussée ne reçoit presque pas de lumière du ciel
  // (une surface horizontale voit surtout la composante basse de la lumière
  // hémisphérique), et elle ressortait à 0,06 de la clarté d'une façade là où
  // la photographie de rue la donne à 0,47. Agir sur la seule couleur du
  // matériau plafonnait à 0,18, même en blanc pur.
  //
  // La teinte reste neutre et à peine chaude : un rebond verdâtre teintait
  // autrefois l'enrobé au point de le faire passer pour de l'herbe.
  const SOL_JOUR = new THREE.Color(0x9a9a92);

  if (rawPoi) {
    data.poi = parsePOI(rawPoi);
    // Un château d'eau peut être cartographié en nœud comme en surface :
    // on réunit les deux sources.
    if (data.poi.chateauxEau?.length) {
      data.chateauxEau = [...(data.chateauxEau ?? []), ...data.poi.chateauxEau.map(
        (c) => ({ ...c, rayon: c.rayon ?? 3, hauteur: c.hauteur ?? 20 }),
      )];
    }
  }

  await progress(42, "Construction de la ville (3481 bâtiments)...");
  const { collisionTris, group: cityGroup, foyers, lampHeads, placesEpi,
    instances: instancesVegetation, vitrages, eau } = buildWorld(scene, data);

  // Éclairage public : les lanternes projettent réellement de la lumière sur
  // la chaussée à la tombée du jour.
  const eclairage = new EclairagePublic(scene, foyers);
  diag(`Éclairage public : ${foyers.length} foyers`);

  // Signalisation et panonceaux d'équipements, posés après la ville pour
  // disposer du relief définitif.
  let signage = null;
  if (data.poi) {
    signage = buildSignage(data, data.terrain ?? null, ROAD_Y);
    scene.add(signage.group);
    diag('Signalisation :', JSON.stringify(signage.stats));
  }

  // Point d'apparition calculé dès maintenant : il sert à dégager la zone de
  // départ, sinon la voiture du joueur pourrait naître à l'intérieur d'un
  // véhicule stationné et être éjectée au premier pas de simulation.
  const spawn = findSpawn(data.roads, data.buildings);
  // Décalage d'une demi-voie vers la droite : on démarre sur sa file, pas à
  // cheval sur l'axe médian.
  const lane = (spawn.width ?? 6) * 0.22;
  spawn.x += Math.cos(spawn.heading) * lane;
  spawn.z -= Math.sin(spawn.heading) * lane;

  // Accotements : ils cousent la chaussée au terrain et portent le revêtement
  // réel du bas-côté. Sans eux, la grille de terrain au pas de 37 m s'écarte
  // de la route en pente et laisse un vide sur le bord de voie.
  const accotements = new Accotements(data, data.terrain ?? null, ROAD_Y);
  if (accotements.effectif) {
    scene.add(accotements.group);
    diag(`Accotements : ${accotements.effectif} bandes, `
      + JSON.stringify(accotements.stats));
  }

  // Parkings en épi des quartiers d'habitat collectif : bande goudronnée et
  // places marquées le long des voies desservant les barres d'immeubles.
  const parkings = new ParkingsEpi(scene, data, data.terrain ?? null, ROAD_Y);
  if (parkings.effectif) {
    diag(`Parkings en épi : ${parkings.effectif} places occupées`);
  }

  // Véhicules en stationnement le long des rues du bourg. Sur les photographies
  // de rue d'Artix, ils sont partout : leur absence donnait aux rues un aspect
  // de maquette vide.
  // Les places d'appoint viennent de deux sources : les bandes déduites des
  // bâtiments (`parking.js`) et les aires de stationnement OSM, dont le
  // marquage donne des places en épi correctement orientées. Sans ces
  // dernières, les véhicules de ces parkings venaient du stationnement de rue
  // et se rangeaient dans l'axe de la voie, en travers des places marquées.
  const garees = new VoituresGarees(
    scene, data, data.terrain ?? null, ROAD_Y, data.poi?.passages ?? [], spawn,
    [...(parkings.places ?? []), ...(placesEpi ?? [])],
  );
  if (garees.effectif) {
    diag(`Véhicules stationnés : ${garees.effectif}`
      + (garees.avant
        ? ` (${garees.avant} places trouvées, ${garees.apresEclaircissement} après éclaircissement)`
        : ''));
  }

  // Passants : ils marchent sur les cheminements piétons réels du bourg,
  // s'arrêtent pour discuter et donnent vie aux rues.
  // L'effectif des passants est figé à la construction (un InstancedMesh est
  // dimensionné une fois). Le profil le fixe au démarrage ; en cours de partie,
  // un changement de profil masque les passants excédentaires plutôt que de
  // reconstruire, ce qui éviterait de réallouer sept maillages instanciés.
  const pietons = new Pietons(data, data.terrain ?? null, ROAD_Y,
    PROFILS.qualite.passants);
  if (pietons.effectif) {
    scene.add(pietons.group);
    diag(`Passants : ${pietons.effectif} sur ${pietons.noeuds.length} nœuds piétons`);
  }

  // Bâtiments remarquables modélisés d'après les photographies du bourg.
  if (data.landmarkSources?.length) {
    const lm = buildLandmarks(data, data.terrain ?? null, ROAD_Y);
    scene.add(lm.group);
    diag(`Repères modélisés : ${lm.traites.length}`);
  }
  // Ombres actives par défaut : c'est ce qui sépare le plus nettement un
  // rendu de jeu d'une maquette. Le volume d'ombre suit le véhicule et reste
  // resserré, ce qui borne le coût ; la touche O permet de les couper sur une
  // machine modeste.
  let shadowsHigh = true;
  renderer.shadowMap.enabled = true;
  // Seuls les gros maillages projettent : les bâtiments portent l'essentiel de
  // l'ombre, le mobilier urbain n'apporterait presque rien pour un coût de passe
  // supplémentaire. `noShadowCast` exclut le terrain, qui dépasse largement le
  // seuil sans rien apporter à la passe.
  cityGroup.traverse((o) => {
    if (o.isMesh && !o.userData.noShadowCast
      && o.geometry.attributes.position.count > 5000) o.castShadow = true;
  });
  el('shadow-state').textContent = 'ACTIVÉES';

  // --- Profils graphiques -------------------------------------------------
  // Les réglages de rendu sont regroupés dans `quality.js`. Le profil
  // « Équilibré » reprend exactement les valeurs qui étaient en dur ici, donc
  // le comportement par défaut du jeu ne change pas.
  const qualite = new Qualite({
    renderer,
    scene,
    soleil: sun,
    eclairage,
    get smaa() { return composer?.userData?.smaa ?? null; },
    // Redimensionne toute la chaîne de passes après un changement de
    // résolution : sans la remise à niveau du pixel ratio du composer, le
    // renderer change d'échelle mais les cibles de rendu, elles, ne bougent
    // pas et le profil choisi ne calcule ni plus ni moins de pixels.
    onResolution: () => composer?.userData?.redimComposer?.(),
    majGtao: (e) => composer?.userData?.setEchelleGtao?.(e),
    // Appliqué à chaque bascule de profil : ce qui ne se règle pas sur le
    // renderer lui-même.
    onProfil: (p) => {
      shadowsHigh = p.ombres;
      cityGroup.traverse((o) => {
        if (o.isMesh && !o.userData.noShadowCast
          && o.geometry.attributes.position.count > 5000) o.castShadow = p.ombres;
      });
      // Pas de `needsUpdate` en masse sur les matériaux de la scène : Three.js
      // recompile déjà les programmes concernés quand `shadowMap.enabled`
      // change, et forcer les quelque cent matériaux de la ville provoquait
      // une recompilation complète, donc une saccade d'une seconde à chaque
      // bascule de profil.
      if (p.ombres) sun.shadow.needsUpdate = true;
      pietons?.setVisibles?.(p.passants);
      el('shadow-state').textContent = p.ombres ? 'ACTIVÉES' : 'DÉSACTIVÉES';
      el('aa-state').textContent = p.smaa ? 'ACTIVÉ' : 'DÉSACTIVÉ';
      const q = el('quality-state');
      if (q) q.textContent = p.nom.toUpperCase();
    },
  }, PROFIL_DEFAUT);
  qualite.appliquer();
  diag(`Profil graphique : ${qualite.profil.nom}`);

  // --- Découpage spatial de la végétation ---------------------------------
  // Les arbres sont le poste le plus lourd de la scène : 3 500 instances pour
  // 1,18 million de triangles à eux seuls, dessinés en entier quel que soit
  // l'endroit où se trouve la voiture, la sphère englobante d'un InstancedMesh
  // couvrant toute la commune. La grille les range par distance et n'en
  // dessine que la part utile.
  const grilleVegetation = instancesVegetation
    ? new GrilleInstances(instancesVegetation.meshes, instancesVegetation.positions)
    : null;
  if (grilleVegetation) {
    diag(`Découpage spatial : ${grilleVegetation.total} arbres instanciés`);
  }

  // --- Monde physique -----------------------------------------------------
  await progress(66, 'Génération des collisions...');
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / 60;

  // Sol infini de secours (bas-côtés, champs).
  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  if (terrain) {
    // Terrain de collision épousant le relief réel. Rapier attend les hauteurs
    // rangées par colonnes, l'axe Z du heightfield correspondant à notre Z.
    const n = TERRAIN_RES + 1;
    const heights = new Float32Array(n * n);
    // Le heightfield porte tout : la chaussée n'entre pas dans le maillage de
    // collision (`world.js`), seuls les ponts et les bâtiments y sont. Il doit
    // donc concilier deux exigences que le terrain sépare :
    //
    // - sous la route, suivre le terrain NATUREL, sur lequel la chaussée est
    //   posée. Suivre le champ terrassé y ferait rouler la voiture 35 cm sous
    //   l'asphalte qu'elle voit
    // - dans l'herbe, suivre le sol VISIBLE, c'est-à-dire le champ terrassé
    //   abaissé de la garde de sol. C'est le champ que `world.js` donne aux
    //   sommets du maillage d'herbe
    //
    // Prendre `naturel` partout, ce qui était fait jusqu'au 19/08/2026,
    // laissait la voiture rouler 31 cm au-dessus de l'herbe dessinée : elle
    // paraissait flotter, son ombre portée visible sous les roues.
    //
    // Hors des emprises de route, `h` et `naturel` sont égaux, le terrassement
    // ne creusant que sous la voirie. Le minimum des deux surfaces donne donc
    // exactement le sol visible dans l'herbe, et le naturel sous la chaussée.
    // La règle est celle de `terrain.solVisible()`, appliquée ici directement
    // sur les tableaux : les indices de grille étant connus, l'interpolation
    // bilinéaire de la méthode n'aurait rien à interpoler.
    const naturel = terrain.naturel ?? terrain.h;
    const terrasse = terrain.h;

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const creuse = naturel[idx] - terrasse[idx];
        const sol = terrasse[idx] - GARDE_SOL + 2 * creuse;
        // Rapier indexe [colonne * n + ligne] ; on transpose en conséquence.
        heights[i * n + j] = sol + ROAD_Y - 0.04;
      }
    }
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(
        TERRAIN_RES, TERRAIN_RES, heights,
        { x: TERRAIN_TAILLE, y: 1, z: TERRAIN_TAILLE },
      ).setFriction(0.85),
      groundBody,
    );
    // Plancher de secours très bas, au cas où le véhicule sortirait de la
    // grille de terrain : évite une chute infinie.
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(6000, 0.5, 6000).setTranslation(0, -80, 0),
      groundBody,
    );
  } else {
    // Sans relief, un sol plat affleurant la chaussée. Un sol plus bas
    // créerait une marche verticale au bord de la route, plus haute que le
    // rayon des roues, et la voiture ne pourrait plus y remonter.
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(3000, 0.5, 3000)
        .setTranslation(0, ROAD_Y - 0.5 - 0.04, 0)
        .setFriction(0.85),
      groundBody,
    );
  }

  // Maillage de collision : routes et bâtiments.
  // Rapier produit des NaN si le maillage contient des triangles dégénérés
  // (aire nulle, sommets confondus). On filtre avant de le lui passer.
  const clean = [];
  let rejected = 0;
  for (let i = 0; i < collisionTris.length; i += 9) {
    let ok = true;
    for (let k = 0; k < 9; k++) {
      const v = collisionTris[i + k];
      if (!Number.isFinite(v) || Math.abs(v) > 1e5) { ok = false; break; }
    }
    if (ok) {
      // Aire du triangle via le produit vectoriel : rejette les aplatis.
      const ax = collisionTris[i + 3] - collisionTris[i];
      const ay = collisionTris[i + 4] - collisionTris[i + 1];
      const az = collisionTris[i + 5] - collisionTris[i + 2];
      const bx = collisionTris[i + 6] - collisionTris[i];
      const by = collisionTris[i + 7] - collisionTris[i + 1];
      const bz = collisionTris[i + 8] - collisionTris[i + 2];
      const cx = ay * bz - az * by;
      const cy = az * bx - ax * bz;
      const cz = ax * by - ay * bx;
      if (Math.hypot(cx, cy, cz) * 0.5 < 1e-4) ok = false;
    }
    if (ok) for (let k = 0; k < 9; k++) clean.push(collisionTris[i + k]);
    else rejected++;
  }
  diag(`Collisions : ${clean.length / 9} triangles retenus, ${rejected} rejetés`);

  const verts = new Float32Array(clean);
  const indices = new Uint32Array(verts.length / 3);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  const cityBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(verts, indices).setFriction(1.0).setRestitution(0.05),
    cityBody,
  );

  // Véhicules stationnés : chacun devient un obstacle solide. Un cuboïde par
  // voiture, tous portés par un seul corps fixe, ce qui reste léger même à
  // plusieurs centaines.
  if (garees.obstacles?.length) {
    const gareesBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const q = new THREE.Quaternion();
    const axeY = new THREE.Vector3(0, 1, 0);
    for (const o of garees.obstacles) {
      q.setFromAxisAngle(axeY, o.cap);
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(o.demiW, o.demiH, o.demiL)
          .setTranslation(o.x, o.y + o.centreH, o.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.6)
          .setRestitution(0.1),
        gareesBody,
      );
    }
    diag(`Collisions véhicules garés : ${garees.obstacles.length} cuboïdes`);
  }

  // --- Véhicule -----------------------------------------------------------
  await progress(80, 'Positionnement du véhicule...');
  // Hauteur d'équilibre : la voiture est posée pile sur ses suspensions,
  // sinon la chute initiale écrase un seul coin et la fait basculer.
  // Sur terrain accidenté, la hauteur d'apparition suit l'altitude locale.
  // `hauteurRoute` et non `hauteurEn`, pour la raison exposée dans `aller()` :
  // le point d'apparition est choisi sur une voie, et la chaussée repose sur le
  // terrain naturel. Le terrain terrassé l'y faisait naître 35 cm trop bas,
  // suspensions écrasées dès la première frame.
  spawn.y = restingHeight(ROAD_Y + (terrain ? terrain.hauteurRoute(spawn.x, spawn.z) : 0));
  const car = new Car(RAPIER, world, spawn);
  // Déplacement direct depuis la console, pour inspecter un quartier précis
  // sans avoir à y rouler : aller(x, z, cap).
  window.aller = (x, z, cap = 0) => {
    // hauteurRoute et non hauteurEn : la chaussée repose sur le terrain
    // naturel, tandis que hauteurEn renvoie le terrain terrassé, plus bas.
    car.reset({
      x, z, heading: cap,
      y: restingHeight(ROAD_Y + (terrain ? terrain.hauteurRoute(x, z) : 0)),
    });
    return `x=${x} z=${z}`;
  };
  // Diagnostic : état des roues et du volant, pour vérifier depuis la console
  // que la rotation suit bien la distance parcourue.
  window.diagRoues = () => (rouesImportees ?? []).map((r) => ({
    nom: r.nom,
    roulement: +r.roulement.rotation[r.axe].toFixed(2),
    braquage: +r.braquage.rotation.y.toFixed(3),
  }));
  // Véhicule : un modèle glTF fourni prend le pas sur le modèle procédural.
  // En cas d'absence ou d'erreur de chargement, on retombe sur ce dernier
  // plutôt que de laisser le jeu sans voiture.
  // `headMat` et `tailMat` pilotent les feux du modèle procédural au fil du
  // cycle jour/nuit ; le modèle importé porte les siens dans sa texture.
  let carMesh, wheelMeshes, headMat, tailMat;
  let modeleImporte = false;
  // Éléments animés du modèle importé : roues, volant et rayon de roulement.
  let rouesImportees = null, volantImporte = null;
  let rayonRoueImporte = 0.32;
  try {
    const importe = await chargerVoiture(MODELE_VOITURE,
      ANCHOR_Y - SPEC.wheelRadius);
    carMesh = importe.car;
    // Sans roues isolées, la carrosserie reste d'un bloc : le tableau vide
    // désactive proprement leur animation.
    wheelMeshes = importe.wheels;
    rouesImportees = importe.rouesDetectees ? importe.roues : null;
    volantImporte = importe.volant;
    rayonRoueImporte = importe.rayonRoue;
    modeleImporte = true;
    diag(`Modèle importé : échelle ${importe.echelle.toFixed(3)}, `
      + `${importe.roues.length} roues, rayon ${importe.rayonRoue.toFixed(3)} m, `
      + `volant ${importe.volant ? 'oui' : 'non'}`);
  } catch (err) {
    console.warn('Modèle glTF indisponible, modèle procédural utilisé :', err.message);
    const proc = buildCarMesh(0x1c2b4a);
    carMesh = proc.car; wheelMeshes = proc.wheels;
    headMat = proc.headMat; tailMat = proc.tailMat;
  }
  // La carrosserie ne projette plus d'ombre, retiré le 19/08/2026. Sur la
  // chaussée et les trottoirs, la carte d'ombre du soleil rendait sous le
  // véhicule une tache aux contours instables : le volume d'ombre est resserré
  // autour de la voiture et la carte n'est pas recalculée à chaque image, si
  // bien que l'ombre décrochait du véhicule en roulage. Le décor continue de
  // projeter la sienne, bâtiments et arbres compris.
  carMesh.castShadow = false;
  scene.add(carMesh);

  // Ombre de contact : un dégradé radial plaqué au sol sous la voiture.
  // Sans cela, ombres coupées, le véhicule semble flotter.
  const blobCanvas = document.createElement('canvas');
  blobCanvas.width = blobCanvas.height = 128;
  const bctx = blobCanvas.getContext('2d');
  const grad = bctx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  bctx.fillStyle = grad;
  bctx.fillRect(0, 0, 128, 128);
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 6.4),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(blobCanvas),
      transparent: true, depthWrite: false, opacity: 0.85,
    }),
  );
  blob.rotation.x = -Math.PI / 2;
  scene.add(blob);

  // Phares : deux faisceaux réels, allumés la nuit.
  const beams = [];
  for (const sx of [-0.6, 0.6]) {
    const beam = new THREE.SpotLight(0xfff0d0, 0, 90, 0.55, 0.45, 1.2);
    beam.position.set(sx, 0.63, 2.2);
    beam.target.position.set(sx * 0.5, -0.4, 26);
    carMesh.add(beam, beam.target);
    beams.push(beam);
  }

  // --- Audio --------------------------------------------------------------
  const audio = new AudioEngine();

  // --- Caméras ------------------------------------------------------------
  const CAMS = ['Poursuite', 'Capot', 'Cinématique', 'Aérienne'];
  let camMode = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let camInit = false;
  // Objets de travail du bloc caméra, alloués une fois. Le calcul de cadrage
  // tourne à chaque frame et créait une douzaine de Vector3 par passage.
  const camP = new THREE.Vector3();       // position du véhicule
  const camFwd = new THREE.Vector3();     // axe avant du véhicule
  const camUp = new THREE.Vector3();      // axe haut du véhicule
  const camSide = new THREE.Vector3();    // axe latéral du véhicule
  const camCible = new THREE.Vector3();   // position visée par la caméra
  const camVise = new THREE.Vector3();    // point regardé
  const camDepuis = new THREE.Vector3();  // origine du rayon anti-traversée
  const camVers = new THREE.Vector3();    // direction de ce rayon
  // Vecteurs de la boucle de simulation.
  const velTmp = new THREE.Vector3();     // vitesse courante
  const deltaTmp = new THREE.Vector3();   // écart de vitesse, détection de choc
  const eulerTmp = new THREE.Euler();     // conversions de cap
  const posTmp = new THREE.Vector3();     // position du véhicule, lue une fois par frame
  // Vecteur propre à la minicarte : le partager avec `posTmp` exposerait à un
  // écrasement silencieux, l'ordre des appels dans la frame pouvant changer.
  const posCarte = new THREE.Vector3();
  // Structures brutes réutilisées pour le rayon Rapier de la caméra.
  const camRayOrig = { x: 0, y: 0, z: 0 };
  const camRayDir = { x: 0, y: 0, z: 0 };
  const camRay = new RAPIER.Ray(camRayOrig, camRayDir);

  // --- Minicarte ----------------------------------------------------------
  // Le dessin lui-même est dans `minimap.js` : il ne dépend que du canvas, des
  // données cartographiques et de la position du véhicule.
  const minicarte = new Minicarte(el('minimap'), data);
  // Dessinée à chaque image. Elle l'était auparavant depuis le bloc du
  // `streetTimer`, à 2 images par seconde : la carte avançait par sauts de 7 m
  // à 50 km/h. Le dessin ne parcourt que les voies à portée, par la grille de
  // `minimap.js`, ce qui rend la cadence pleine abordable.
  const drawMinimap = (dt) => minicarte.dessiner(
    car.lirePosition(posCarte),
    eulerTmp.setFromQuaternion(car.quaternion, 'YXZ').y,
    dt,
  );

  // --- Compteur (aiguille + chiffres) -------------------------------------
  const needle = el('needle');
  const speedTxt = el('speed');
  const gearTxt = el('gear');
  const rpmBar = el('rpm-fill');
  const streetTxt = el('street');
  const lieuPanel = el('lieu-panel');
  const lieuTxt = el('lieu');
  const lieuLabel = el('lieu-label');
  const limitePanel = el('limite-panel');
  const limiteTxt = el('limite');
  const naturePanel = el('nature-panel');
  const natureTxt = el('nature');
  const camTxt = el('cam-mode');
  const clockTxt = el('clock');
  const distTxt = el('dist');

  // Nom de la rue la plus proche, pour l'affichage.
  let streetTimer = 0;
  // La position est passée par l'appelant plutôt que relue : `car.position`
  // construit un Vector3 à chaque accès, et cette fonction tourne dans la
  // boucle de jeu.
  function nearestStreet(p) {
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    let best = null, bestD = 45 * 45;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const pts = namedGrid.get(`${cx + ox},${cz + oz}`);
        if (!pts) continue;
        for (const pt of pts) {
          const d = (pt.x - p.x) ** 2 + (pt.z - p.z) ** 2;
          if (d < bestD) { bestD = d; best = pt.road; }
        }
      }
    }
    return best;
  }

  // Index spatial des segments de route : une grille de 100 m évite de
  // parcourir les 1210 voies à chaque frame.
  const CELL = 100;
  const roadGrid = new Map();
  const cellKey = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const r of data.roads) {
    if (!r.drivable) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const seg = { x1: r.pts[i][0], z1: r.pts[i][1], x2: r.pts[i + 1][0], z2: r.pts[i + 1][1], w: r.width };
      // Un segment peut traverser plusieurs cellules : on l'inscrit dans toutes.
      const minX = Math.min(seg.x1, seg.x2), maxX = Math.max(seg.x1, seg.x2);
      const minZ = Math.min(seg.z1, seg.z2), maxZ = Math.max(seg.z1, seg.z2);
      for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
        for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
          const k = `${cx},${cz}`;
          if (!roadGrid.has(k)) roadGrid.set(k, []);
          roadGrid.get(k).push(seg);
        }
      }
    }
  }

  // Index des routes nommées, même grille que la détection de chaussée.
  const namedGrid = new Map();
  for (const r of data.roads) {
    if (!r.name || !r.drivable) continue;
    for (const [x, z] of r.pts) {
      const k = cellKey(x, z);
      if (!namedGrid.has(k)) namedGrid.set(k, []);
      namedGrid.get(k).push({ x, z, road: r });
    }
  }

  // Détection du revêtement sous la voiture (route ou bas-côté).
  // Même raison que `nearestStreet` : la position vient de l'appelant.
  function checkOnRoad(p) {
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    // On balaie la cellule courante et ses voisines.
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const segs = roadGrid.get(`${cx + ox},${cz + oz}`);
        if (!segs) continue;
        for (const s of segs) {
          const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
          const len2 = dx * dx + dz * dz;
          if (len2 < 1e-6) continue;
          let t = ((p.x - s.x1) * dx + (p.z - s.z1) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ddx = p.x - (s.x1 + dx * t), ddz = p.z - (s.z1 + dz * t);
          if (ddx * ddx + ddz * ddz < (s.w / 2 + 1) ** 2) return true;
        }
      }
    }
    return false;
  }

  // --- Touffes d'herbe de premier plan ------------------------------------
  // Le sol porte une texture, ce qui suffit à distance mais laisse le bas-côté
  // parfaitement lisse dès qu'on le longe. Un pool d'instances de taille fixe
  // suit le véhicule et replante autour de lui, sans rien créer en cours de
  // partie.
  //
  // L'herbe s'écarte de la chaussée et de ses abords : la marge est plus large
  // que celle de la détection de revêtement, pour laisser la place à
  // l'accotement et au trottoir sans que des brins ne poussent au travers.
  const herbePlantable = (x, z) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const segs = roadGrid.get(`${cx + ox},${cz + oz}`);
        if (!segs) continue;
        for (const seg of segs) {
          const dx = seg.x2 - seg.x1, dz = seg.z2 - seg.z1;
          const len2 = dx * dx + dz * dz;
          if (len2 < 1e-6) continue;
          let t = ((x - seg.x1) * dx + (z - seg.z1) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ddx = x - (seg.x1 + dx * t), ddz = z - (seg.z1 + dz * t);
          if (ddx * ddx + ddz * ddz < (seg.w / 2 + 2.6) ** 2) return false;
        }
      }
    }
    return true;
  };
  const touffes = new Touffes(scene, data.terrain ?? null, ROAD_Y, {
    estPlantable: herbePlantable,
  });

  // --- Traces de pneus ----------------------------------------------------
  const skidGeo = new THREE.PlaneGeometry(0.24, 0.6);
  const skidMat = new THREE.MeshBasicMaterial({
    color: 0x0a0a0a, transparent: true, opacity: 0.42, depthWrite: false,
  });
  const MAX_SKIDS = 900;
  const skidPool = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKIDS);
  skidPool.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  skidPool.count = 0;
  skidPool.frustumCulled = false;
  scene.add(skidPool);
  let skidIndex = 0;
  // Nombre d'empreintes réellement écrites : il plafonne à MAX_SKIDS une fois
  // l'anneau bouclé. Distinct de skidIndex, qui repart à zéro.
  let skidEcrites = 0;
  const skidMatrix = new THREE.Matrix4();
  // Objets temporaires réutilisés : addSkid est appelé jusqu'à quatre fois par
  // frame en glissade, une fois par roue.
  const skidPos = new THREE.Vector3();
  const skidQuat = new THREE.Quaternion();
  const skidEuler = new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ');
  const skidEchelle = new THREE.Vector3(1, 1, 1);

  function addSkid(pos, yaw) {
    skidPos.set(pos.x, 0.12, pos.z);
    skidEuler.set(-Math.PI / 2, 0, -yaw, 'XYZ');
    skidQuat.setFromEuler(skidEuler);
    skidMatrix.compose(skidPos, skidQuat, skidEchelle);
    skidPool.setMatrixAt(skidIndex, skidMatrix);
    skidIndex = (skidIndex + 1) % MAX_SKIDS;
    // Une seule progression du compteur : les deux lignes cumulées d'avant
    // affichaient une instance de plus que d'empreintes écrites, laissée à la
    // matrice identité, soit un carré parasite posé à l'origine du monde.
    skidEcrites = Math.min(MAX_SKIDS, skidEcrites + 1);
    skidPool.count = skidEcrites;
    skidPool.instanceMatrix.needsUpdate = true;
  }

  // --- Cycle jour/nuit ----------------------------------------------------
  let timeOfDay = 10.5; // heures
  let timeSpeed = 0.06; // heures par seconde réelle
  const skyDay = new THREE.Color(0x9fc4e8);
  const skySunset = new THREE.Color(0xe89a5c);
  const skyNight = new THREE.Color(0x0a1020);

  // Couleurs de mélange du cycle, allouées une fois. `updateSky` tourne à
  // chaque frame : y construire cinq `Color` revenait à confier au ramasse-
  // miettes trois cents objets par seconde, pour des valeurs constantes.
  const CIEL_BLANC = new THREE.Color(0xffffff);
  const CIEL_ZENITH = new THREE.Color(0x1c4c86);
  const AMBIANCE_NUIT = new THREE.Color(0x4a5a7e);
  const SOL_NUIT = new THREE.Color(0x6b5335);
  // Teintes du disque solaire, du plein jour au ras de l'horizon.
  const SOLEIL_HAUT = new THREE.Color(0xfff4e2);
  const SOLEIL_BAS = new THREE.Color(0xff9d4a);
  // Couleur de ciel courante, recalculée en place à chaque frame.
  const cielCourant = new THREE.Color();

  // Décalage lumière/véhicule, recalculé selon l'heure. La lumière directionnelle
  // n'a pas de position physique : seul ce vecteur définit la direction du soleil.
  const sunOffset = new THREE.Vector3(140, 220, 90);
  // Position de la voiture et orientation du soleil au dernier recalcul de la
  // carte d'ombre : c'est l'écart à ces deux valeurs qui déclenche le suivant.
  const ombreAncre = new THREE.Vector3(1e9, 0, 1e9); // force un premier recalage
  let ombreSoleilX = Infinity;

  function updateSky() {
    const h = timeOfDay;
    const sunAngle = ((h - 6) / 12) * Math.PI; // 6h lever, 18h coucher
    const elev = Math.sin(sunAngle);
    // Course basse : au zénith, les ombres tombent sous les bâtiments et rien
    // ne se lit depuis la route. Une élévation plafonnée les garde allongées
    // toute la journée, ce qui révèle le relief des façades et le volume des
    // toitures. C'est le parti pris de la plupart des jeux de conduite.
    sunOffset.set(Math.cos(sunAngle) * 260, Math.max(34, elev * 155), 130);
    sun.intensity = Math.max(0, elev) * 3.6;

    // Teinte de ciel du moment, calculée EN PLACE dans `cielCourant` : les
    // `clone()` d'avant allouaient une couleur par frame, et les `new Color`
    // des mélanges trois de plus.
    const sky = cielCourant;
    if (elev > 0.25) sky.copy(skyDay);
    else if (elev > -0.08) {
      const t = (elev + 0.08) / 0.33;
      sky.copy(skyNight)
        .lerp(skySunset, Math.min(1, t * 1.6))
        .lerp(skyDay, Math.max(0, t - 0.45) * 1.8);
    } else sky.copy(skyNight);

    // `scene.background` et `fog.color` pointent désormais le MÊME objet, qui
    // est réécrit chaque frame : les affecter suffit une fois pour toutes,
    // Three.js lisant la valeur au moment du rendu.
    if (scene.background !== sky) scene.background = sky;
    if (scene.fog.color !== sky) scene.fog.color = sky;
    // Le dôme suit le cycle : zénith plus soutenu que l'horizon, l'écart se
    // resserrant à mesure que le soleil descend.
    const ecart = 0.45 + Math.max(0, elev) * 0.35;
    skyMat.uniforms.basCiel.value.copy(sky).lerp(CIEL_BLANC, 0.22 * ecart);
    skyMat.uniforms.hautCiel.value.copy(sky).lerp(CIEL_ZENITH, 0.55 * ecart);

    // Disque solaire : sa direction est celle de la lumière directionnelle,
    // normalisée. Le dôme étant centré sur le véhicule, `sunOffset` donne
    // directement la direction vue depuis lui.
    skyMat.uniforms.soleilDir.value.copy(sunOffset).normalize();
    // Plus le soleil descend, plus il rougit : l'atmosphère traversée filtre
    // le bleu. La bascule se fait sur les 25 premiers degrés d'élévation.
    const bas = 1 - Math.min(1, Math.max(0, elev) / 0.42);
    skyMat.uniforms.soleilTeinte.value.copy(SOLEIL_HAUT).lerp(SOLEIL_BAS, bas);
    // Extinction sous l'horizon : sans elle, un disque resterait accroché au
    // dôme toute la nuit.
    skyMat.uniforms.soleilForce.value = Math.max(0, Math.min(1, (elev + 0.06) / 0.14));
    // Les nuages s'effacent la nuit, faute de quoi ils ressortent en gris
    // clair sur un ciel presque noir.
    skyMat.uniforms.nuages.value = 0.30 + Math.max(0, elev) * 0.34;
    // Ambiance nocturne. Un plancher à 0,3 avec la couleur du ciel de nuit
    // (presque noire) laissait la ville dans le noir absolu dès le soleil
    // couché : seules les deux ou trois lanternes du pool éclairaient encore
    // quelque chose, et tout le reste disparaissait.
    //
    // Une ville éclairée n'est jamais noire : le halo des lampadaires, les
    // vitrines et la réverbération du ciel sur la couche nuageuse donnent une
    // clarté de fond bien supérieure à une pleine nature. C'est cette lueur
    // urbaine que reproduit le plancher, remonté à 0,85.
    hemi.intensity = 0.85 + Math.max(0, elev) * 1.15;
    // La couleur d'ambiance suit le ciel de jour, mais ne le suit plus la nuit :
    // un ciel à 0x0a1020 ne renvoie aucune lumière exploitable. On bascule vers
    // un bleu nuit soutenu, la teinte que prend une rue sous éclairage public.
    const nuitProfonde = THREE.MathUtils.clamp((0.10 - elev) / 0.16, 0, 1);
    hemi.color.copy(sky).lerp(AMBIANCE_NUIT, nuitProfonde * 0.85);
    // Le sol renvoie la lumière orangée des lanternes plutôt que sa teinte
    // diurne : c'est ce rebond chaud qui fait lire une chaussée de nuit.
    hemi.groundColor.copy(SOL_JOUR).lerp(SOL_NUIT, nuitProfonde);
    sun.color.setHSL(0.09, 0.42, 0.5 + Math.max(0, elev) * 0.35);

    const night = elev < 0.06;
    const beamPower = night ? 130 : 0;
    for (const b of beams) b.intensity = beamPower;
    // Absent sur un modèle importé, dont les phares font partie de la texture.
    if (headMat) headMat.emissiveIntensity = night ? 3.4 : 1.1;
    renderer.toneMappingExposure = night ? 1.35 : 1.05;

    // Éclairage public : allumage progressif au crépuscule, comme les
    // cellules photoélectriques qui commandent les lampadaires réels.
    // Pleine puissance sous l'horizon, extinction complète en plein jour.
    nuitFacteur = THREE.MathUtils.clamp((0.10 - elev) / 0.16, 0, 1);
    if (lampHeads) lampHeads.emissiveIntensity = 0.15 + nuitFacteur * 2.6;
    // Fenêtres éclairées : elles s'allument avec les lampadaires. L'émission
    // reprend la couleur de sommet du vitrage, donc seules les baies déclarées
    // chaudes à la construction s'allument réellement ; les autres, très
    // sombres, n'émettent rien de visible. Une seule écriture par frame sur un
    // matériau partagé, sans recompilation.
    if (vitrages) vitrages.emissiveIntensity = nuitFacteur * 1.5;

    return night;
  }

  // Intensité de l'éclairage public, de 0 (jour) à 1 (nuit noire).
  let nuitFacteur = 0;

  // Commandes du véhicule, objet unique réécrit à chaque frame.
  const input = {
    throttle: 0, brake: 0, steer: 0, handbrake: 0,
    shiftUp: false, shiftDown: false,
  };

  // --- Détection de choc --------------------------------------------------
  let lastVel = new THREE.Vector3();
  let crashCooldown = 0;

  // --- Boucle -------------------------------------------------------------
  let last = performance.now();
  let accumulator = 0;
  // Pas fixe à 60 Hz, comme le timestep du monde Rapier : les deux doivent
  // rester accordés, sinon la physique n'avance pas du temps qu'on lui donne.
  const PAS_PHYSIQUE = 1 / 60;
  // Plafond de rattrapage : au-delà, on préfère perdre du temps simulé plutôt
  // que d'enchaîner les pas et de faire chuter encore le framerate.
  const MAX_PAS = 5;
  let paused = false;
  let fpsTimer = 0, frames = 0;
  const fpsTxt = el('fps');

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;

    // --- Touches d'action ---
    if (tapped('c')) { camMode = (camMode + 1) % CAMS.length; camInit = false; camTxt.textContent = CAMS[camMode]; }
    if (tapped('r')) { car.reset(spawn); }
    if (tapped('f')) { car.flip(); }
    if (tapped('m')) { audio.setMusic(!audio.musicOn); el('music-state').textContent = audio.musicOn ? 'ON' : 'OFF'; }
    if (tapped('n')) { audio.setMuted(!audio.muted); el('sound-state').textContent = audio.muted ? 'OFF' : 'ON'; }
    if (tapped('h')) el('help').classList.toggle('hidden');
    if (tapped('p')) { paused = !paused; el('paused').classList.toggle('hidden', !paused); }
    if (tapped('t')) { timeSpeed = timeSpeed > 0.5 ? 0.06 : 2.2; }
    if (tapped('o')) {
      // Les ombres coûtent une passe de rendu complète sur toute la ville :
      // c'est un choix laissé au joueur selon sa machine.
      shadowsHigh = !shadowsHigh;
      renderer.shadowMap.enabled = shadowsHigh;
      cityGroup.traverse((o) => {
        if (o.isMesh && !o.userData.noShadowCast
          && o.geometry.attributes.position.count > 5000) o.castShadow = shadowsHigh;
      });
      // Les matériaux doivent être recompilés au changement de mode d'ombrage.
      scene.traverse((o) => { if (o.isMesh) o.material.needsUpdate = true; });
      // La carte n'étant plus rafraîchie automatiquement, il faut la redessiner
      // en réactivant les ombres : sinon elle resterait telle qu'au moment de la
      // coupure, et la ville s'afficherait avec des ombres périmées.
      if (shadowsHigh) sun.shadow.needsUpdate = true;
      el('shadow-state').textContent = shadowsHigh ? 'ACTIVÉES' : 'DÉSACTIVÉES';
    }
    if (tapped('k')) {
      // Rendu dessin animé : contours de silhouette et ombrage en paliers,
      // sous la même bascule. Les deux se règlent séparément par les uniformes
      // de la passe, mais se pilotent ensemble au clavier.
      const c = composer?.userData?.contours;
      if (c) {
        c.enabled = !c.enabled;
        el('cartoon-state').textContent = c.enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ';
        diag(`Rendu dessin animé : ${c.enabled ? 'activé' : 'désactivé'}`);
      }
    }
    if (tapped('a')) {
      const s = composer?.userData?.smaa;
      if (s) {
        s.enabled = !s.enabled;
        el('aa-state').textContent = s.enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ';
        diag(`Anticrénelage : ${s.enabled ? 'activé' : 'désactivé'}`);
      }
    }
    if (tapped('g')) {
      car.autoGearbox = !car.autoGearbox;
      el('gearbox-mode').textContent = car.autoGearbox ? 'AUTO' : 'MANU';
    }
    // Profil graphique : Performance, Équilibré, Qualité.
    if (tapped('j')) {
      const n = qualite.suivant();
      diag(`Profil graphique : ${PROFILS[n].nom}`);
    }
    // Ajustement automatique de la résolution : le joueur peut le couper.
    if (tapped('u')) {
      const on = qualite.setAuto(!qualite.autoResolution);
      el('auto-res-state').textContent = on ? 'ON' : 'OFF';
      diag(`Résolution dynamique : ${on ? 'active' : 'coupée'}`);
    }
    audio.horn(down('b'));

    if (!paused) {
      timeOfDay = (timeOfDay + timeSpeed * dt) % 24;

      // Commandes réécrites dans un objet réutilisé : un littéral par frame
      // n'est pas cher, mais c'est une allocation de plus dans une boucle qui
      // n'en veut aucune.
      input.throttle = down('arrowup', 'z', 'w') ? 1 : 0;
      input.brake = down('arrowdown', 's') ? 1 : 0;
      // Repère Three.js : Y pointe vers le haut, une rotation positive autour
      // de Y tourne vers la gauche vue du dessus. La physique applique
      // `-steerAngle` aux roues, donc un braquage à gauche demande une valeur
      // négative ici.
      input.steer = (down('arrowright', 'd') ? 1 : 0) - (down('arrowleft', 'q', 'a') ? 1 : 0);
      input.handbrake = down(' ') ? 1 : 0;
      input.shiftUp = !car.autoGearbox && tapped('e');
      input.shiftDown = !car.autoGearbox && tapped('x');

      const prevGear = car.gear;
      car.onRoad = checkOnRoad(car.lirePosition(posTmp));

      // Pas de temps fixe : la physique reste stable quel que soit le framerate.
      accumulator += dt;
      let steps = 0;
      while (accumulator >= PAS_PHYSIQUE && steps < MAX_PAS) {
        car.update(PAS_PHYSIQUE, input);
        world.step();
        accumulator -= PAS_PHYSIQUE;
        steps++;
      }
      // Après une chute de framerate, le retard accumulé peut dépasser ce que
      // le plafond de pas permet de rattraper. Le conserver ferait tourner la
      // simulation à fond pendant les frames suivantes : le jeu paraîtrait
      // accéléré, puis reprendrait son rythme. On abandonne donc le retard
      // au-delà d'un pas, ce qui revient à ralentir imperceptiblement le temps
      // simulé plutôt qu'à le rendre saccadé.
      //
      // Le seuil laisse passer le report normal d'une frame sur l'autre (un
      // écran à 60 Hz ne tombe jamais pile sur 1/60) et ne coupe que le retard
      // franc.
      if (accumulator > PAS_PHYSIQUE) accumulator = PAS_PHYSIQUE;
      if (car.gear !== prevGear) audio.shift();
      car.checkSanity(spawn);

      // --- Choc ---
      crashCooldown = Math.max(0, crashCooldown - dt);
      const lv = car.body.linvel();
      const vel = velTmp.set(lv.x, lv.y, lv.z);
      const delta = deltaTmp.copy(vel).sub(lastVel).length();
      if (delta > 4.5 && crashCooldown <= 0 && !car.airborne) {
        audio.impact(delta);
        crashCooldown = 0.25;
      }
      lastVel.copy(vel);

      // --- Synchro du modèle 3D ---
      // Une seule lecture de position pour tout le bloc : chaque accès à
      // `car.position` alloue un vecteur.
      const cp = car.lirePosition(posTmp);
      carMesh.position.copy(cp);
      carMesh.quaternion.copy(car.quaternion);

      // L'ombre de contact suit la voiture, à plat, orientée selon son cap.
      const yaw = eulerTmp.setFromQuaternion(car.quaternion, 'YXZ').y;
      // Posée sur le sol RÉELLEMENT dessiné, garde de sol comprise : sans elle,
      // l'ombre flottait 33 cm au-dessus de l'herbe, sous une voiture qui
      // flottait de 31. `solVisible` applique la même règle que le heightfield.
      blob.position.set(cp.x,
        (terrain ? terrain.solVisible(cp.x, cp.z, GARDE_SOL) : -GARDE_SOL)
          + ROAD_Y + 0.02, cp.z);
      blob.rotation.set(-Math.PI / 2, 0, -yaw);
      // Elle s'estompe quand la voiture décolle.
      blob.material.opacity = car.airborne ? 0.25 : 0.85;
      blob.visible = !shadowsHigh;

      let maxSlip = 0, grounded = false;
      car.wheels.forEach((w, i) => {
        const mesh = wheelMeshes[i];
        // Un modèle importé dont les roues n'ont pas pu être isolées reste
        // d'un bloc : on saute l'animation sans casser le reste.
        if (mesh && !modeleImporte) {
          // La roue remonte dans le passage quand la suspension se comprime.
          const springLength = SPEC.suspensionRest - w.compression;
          const yLocal = w.pos.y - (w.grounded ? springLength : SPEC.suspensionRest);
          mesh.position.set(w.pos.x, yLocal, w.pos.z);
          // La physique applique -steerAngle : l'affichage doit suivre,
          // sinon les roues pointent à l'opposé de la trajectoire.
          mesh.rotation.y = w.steer ? -car.steer : 0;
          mesh.children[0].rotation.x -= w.spin * dt; // rotation du pneu
        }
        maxSlip = Math.max(maxSlip, w.slip);
        if (w.grounded) grounded = true;

        // Traces au sol quand la roue glisse.
        if (w.grounded && w.slip > 0.28 && car.speed > 3) {
          const yaw = eulerTmp.setFromQuaternion(car.quaternion, 'YXZ').y;
          addSkid(w.contactPoint, yaw);
        }
      });

      // Modèle importé : les roues tournent d'après la distance réellement
      // parcourue, pas d'après une animation préenregistrée. Le rapport
      // distance / rayon donne l'angle exact, ce qui évite le patinage visuel
      // d'une rotation calée sur la seule vitesse.
      if (modeleImporte && rouesImportees) {
        const avance = (car.fwdSpeed ?? car.speed) * dt;
        animerRoues(rouesImportees, avance, -car.steer, rayonRoueImporte);
        // Le volant suit le braquage, amplifié comme sur un vrai véhicule où
        // le rapport de direction dépasse deux tours de volant.
        if (volantImporte) volantImporte.roulement.rotation.z = car.steer * 3.6;
      }

      // Feux stop
      if (tailMat) tailMat.emissiveIntensity = input.brake > 0.1 || input.handbrake > 0.5 ? 3.2 : 1.0;

      // --- Audio ---
      audio.update({
        rpm: car.rpm, throttle: input.throttle, speed: car.speed,
        slip: maxSlip, grounded, onRoad: car.onRoad,
      }, dt);

      // --- Le volume d'ombre accompagne la voiture, par sauts ---
      // La direction du soleil est fixée par l'heure ; on translate la paire
      // lumière/cible pour garder le véhicule au centre de la carte.
      //
      // Le déplacement se fait par sauts et non en continu : la carte d'ombre
      // étant recalculée à la main, la bouger d'un centimètre obligerait à la
      // redessiner à chaque frame, ce qui annulerait tout le bénéfice. Tant que
      // la voiture reste dans la zone déjà couverte, la carte en place est
      // valable telle quelle.
      //
      // Le seuil de 6 m est un compromis : le volume fait 124 m de côté, donc
      // même à pleine vitesse la voiture reste largement au centre entre deux
      // recalages. À 134 km/h (37 m/s) cela déclenche environ 6 recalculs par
      // seconde au lieu de 60.
      const sp = cp;
      const bougeAssez = Math.hypot(sp.x - ombreAncre.x, sp.z - ombreAncre.z) > 6;
      // Le soleil tourne avec l'heure : même à l'arrêt, la carte doit suivre
      // sa course, sans quoi les ombres resteraient figées au fil de la journée.
      const soleilABouge = Math.abs(sunOffset.x - ombreSoleilX) > 1.5;

      if (bougeAssez || soleilABouge) {
        ombreAncre.set(sp.x, 0, sp.z);
        ombreSoleilX = sunOffset.x;
        sun.target.position.set(sp.x, 0, sp.z);
        sun.position.set(sp.x + sunOffset.x, sunOffset.y, sp.z + sunOffset.z);
        sun.target.updateMatrixWorld();
        // Seul moment où la passe d'ombre est réellement exécutée.
        sun.shadow.needsUpdate = true;
      }
    }

    // La musique continue en pause : l'ordonnanceur doit tourner hors du bloc
    // de simulation, sinon son horloge décroche pendant l'arrêt.
    audio.tickMusic();

    // Pas de cycle de feux à animer : Artix n'a aucun feu tricolore. Le point
    // d'accroche reste dans signage.js si une commune en comportant devait
    // être chargée un jour.

    // Position du véhicule pour tout ce qui suit, y compris en pause : ces
    // trois consommateurs tournent hors du bloc de simulation.
    const posVoiture = car.lirePosition(posTmp);

    // Passants : animation continue, y compris en pause pour que la ville
    // reste vivante quand le joueur observe.
    if (pietons?.effectif) pietons.update(Math.min(dt, 0.1), now / 1000, posVoiture);

    // Le dôme de ciel accompagne le véhicule : il doit rester à distance
    // constante, sinon on finirait par en sortir.
    sky.position.copy(posVoiture);
    // Défilement des nuages : très lent, de l'ordre d'un tour de motif en
    // quelques minutes. Assez pour qu'un arrêt prolongé ne fige pas le ciel,
    // assez peu pour qu'on ne le voie pas bouger en roulant.
    skyMat.uniforms.derive.value += dt * 0.0035;
    // Courant : les normales de la nappe glissent très lentement dans le sens
    // des X. Décaler l'offset d'une texture ne coûte rien, là où animer la
    // géométrie de l'eau supposerait de réécrire ses sommets chaque frame.
    if (eau?.normalMap) {
      eau.normalMap.offset.x += dt * 0.0055;
      eau.normalMap.offset.y += dt * 0.0022;
    }

    const night = updateSky();

    // Les lampadaires proches de la voiture s'allument réellement : le pool de
    // lumières est réaffecté à chaque frame aux foyers les plus proches.
    eclairage.update(posVoiture, nuitFacteur);

    // Végétation : seules les instances à portée sont dessinées. La grille ne
    // se réordonne que lorsque le véhicule a franchi une fraction de cellule,
    // le tri restant valable entre-temps.
    grilleVegetation?.maj(posVoiture.x, posVoiture.z, qualite.profil.distanceDetails);
    // Touffes de premier plan : coupées sur le profil Performance, où le
    // budget va d'abord à la ville elle-même. La replantation n'a réellement
    // lieu qu'au franchissement d'une cellule, soit tous les 2,4 m.
    touffes.maj(posVoiture.x, posVoiture.z, qualite.profil.touffes);
    el('night-badge').classList.toggle('hidden', !night);

    // --- Caméra -------------------------------------------------------------
    // Tout ce bloc écrit dans des vecteurs réutilisés : `camCible` porte la
    // position visée, `camVise` le point regardé. Les deux restent distincts,
    // les partager confondrait cadrage et visée.
    const p = car.lirePosition(camP);
    const q = car.quaternion;
    const fwd = camFwd.set(0, 0, 1).applyQuaternion(q);
    const up = camUp.set(0, 1, 0).applyQuaternion(q);
    const speedT = Math.min(1, car.speed / 50);

    const targetPos = camCible;
    const targetLook = camVise;
    let fov = 64;
    if (camMode === 0) {        // Poursuite
      const dist = 8.6 + speedT * 2.6;
      const height = 3.4 + speedT * 0.6;
      targetPos.copy(p).addScaledVector(fwd, -dist);
      targetPos.y += height;
      targetLook.copy(p).addScaledVector(fwd, 7);
      targetLook.y += 0.9;
      fov = 62 + speedT * 16;
    } else if (camMode === 1) { // Capot
      targetPos.copy(p).addScaledVector(fwd, 1.3).addScaledVector(up, 0.28);
      targetLook.copy(p).addScaledVector(fwd, 18).addScaledVector(up, 0.15);
      fov = 72 + speedT * 10;
    } else if (camMode === 2) { // Cinématique : recule et s'incline
      camSide.set(1, 0, 0).applyQuaternion(q);
      targetPos.copy(p).addScaledVector(fwd, -9).addScaledVector(camSide, 5.5);
      targetPos.y += 2.2;
      targetLook.copy(p);
      targetLook.y += 0.7;
      fov = 52;
    } else {                    // Aérienne
      targetPos.copy(p);
      targetPos.y += 58; targetPos.z += -26;
      targetLook.copy(p);
      fov = 60;
    }

    // Anti-traversée : si un mur s'interpose entre la voiture et la caméra de
    // poursuite, on rapproche la caméra jusqu'au point de contact. Sans cela,
    // la caméra passe au travers des façades en rue étroite.
    if (camMode === 0 || camMode === 2) {
      const depuis = camDepuis.copy(p);
      depuis.y += 1.2;
      const vers = camVers.copy(targetPos).sub(depuis);
      const dist = vers.length();
      if (dist > 0.5) {
        vers.divideScalar(dist);
        camRayOrig.x = depuis.x; camRayOrig.y = depuis.y; camRayOrig.z = depuis.z;
        camRayDir.x = vers.x; camRayDir.y = vers.y; camRayDir.z = vers.z;
        camRay.origin = camRayOrig;
        camRay.dir = camRayDir;
        const hit = world.castRay(camRay, dist, true, undefined, undefined, undefined, car.body);
        if (hit && hit.timeOfImpact < dist) {
          // On garde une marge pour ne pas coller au mur.
          targetPos.copy(depuis).addScaledVector(vers, Math.max(1.6, hit.timeOfImpact - 0.4));
        }
      }
    }

    if (!camInit) { camPos.copy(targetPos); camLook.copy(targetLook); camInit = true; }
    // Lissage : plus réactif en caméra embarquée.
    const lerp = camMode === 1 ? 1 : Math.min(1, 7 * dt);
    camPos.lerp(targetPos, lerp);
    camLook.lerp(targetLook, Math.min(1, 10 * dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (Math.abs(camera.fov - fov) > 0.1) {
      camera.fov += (fov - camera.fov) * Math.min(1, 4 * dt);
      camera.updateProjectionMatrix();
    }

    // --- HUD ---------------------------------------------------------------
    drawMinimap(dt);
    const kmh = Math.abs(car.speedKmh);
    speedTxt.textContent = Math.round(kmh);
    gearTxt.textContent = car.gearLabel;
    const rpmPct = ((car.rpm - SPEC.idleRpm) / (SPEC.maxRpm - SPEC.idleRpm)) * 100;
    rpmBar.style.width = Math.max(0, rpmPct) + '%';
    rpmBar.style.background = car.rpm > SPEC.shiftUpRpm
      ? 'linear-gradient(90deg,#ff9500,#ff2d20)'
      : 'linear-gradient(90deg,#4ac0ff,#3ee08a)';
    // Aiguille : -120° à +120° sur 260 km/h
    needle.style.transform = `rotate(${-120 + Math.min(260, kmh) / 260 * 240}deg)`;
    distTxt.textContent = (car.odometer / 1000).toFixed(2);

    const hh = Math.floor(timeOfDay);
    const mm = Math.floor((timeOfDay - hh) * 60);
    clockTxt.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    streetTimer -= dt;
    if (streetTimer <= 0) {
      streetTimer = 0.5;
      const s = nearestStreet(posTmp);
      streetTxt.textContent = s?.name ?? (car.onRoad ? 'Voie communale' : 'Hors chaussée');

      // Vitesse limite réelle de la voie : 149 routes d'Artix la portent.
      if (s?.maxspeed) {
        limiteTxt.textContent = s.maxspeed;
        limitePanel.classList.remove('hidden');
        // Excès signalé au conducteur, comme un radar pédagogique.
        limitePanel.classList.toggle('exces', Math.abs(car.speedKmh) > s.maxspeed + 8);
      } else {
        limitePanel.classList.add('hidden');
      }

      // Nature de la voie : sens unique, rond-point, pont. Ces indications
      // viennent des données réelles et aident à se repérer dans le bourg.
      let nature = '';
      if (s?.rondPoint) nature = '⟳ Rond-point';
      else if (s?.bridge) nature = '⌒ Pont';
      else if (s?.oneway) nature = '→ Sens unique';
      else if (s?.voies >= 2) nature = `${s.voies} voies`;
      if (nature) {
        natureTxt.textContent = nature;
        naturePanel.classList.remove('hidden');
      } else {
        naturePanel.classList.add('hidden');
      }

      // Lieu remarquable à proximité : mairie, école, commerce, équipement
      // sportif. Le joueur voit ainsi devant quoi il passe.
      if (signage?.panneaux?.length) {
        // Position déjà lue pour cette frame : `car.position` allouerait un
        // Vector3 de plus à chaque passage.
        const p = posTmp;
        let proche = null, dMin = 55;
        for (const pan of signage.panneaux) {
          const d = Math.hypot(pan.x - p.x, pan.z - p.z);
          if (d < dMin) { dMin = d; proche = pan; }
        }
        if (proche) {
          lieuTxt.textContent = proche.nom;
          lieuLabel.textContent = proche.label;
          lieuPanel.classList.remove('hidden');
        } else {
          lieuPanel.classList.add('hidden');
        }
      }
    }

    // Résolution dynamique : la moyenne glissante et l'hystérésis sont dans
    // `quality.js`. On lui passe le temps de la frame écoulée, pas une moyenne
    // déjà lissée, sinon le lissage s'appliquerait deux fois.
    if (qualite.tick(dt * 1000, now / 1000)) {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
    }

    frames++;
    fpsTimer += dt;
    if (fpsTimer >= 0.5) {
      fpsTxt.textContent = Math.round(frames / fpsTimer);
      frames = 0; fpsTimer = 0;
    }

    if (composer) {
      // La passe d'occlusion recrée ses cibles au redimensionnement : on
      // rebranche ses textures tant que les contours sont actifs.
      if (composer.userData?.contours?.enabled) composer.userData.majContours();
      composer.render();
    } else renderer.render(scene, camera);
  }

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  await progress(95, 'Préparation audio...');
  camTxt.textContent = CAMS[camMode];
  el('spawn-street').textContent = spawn.road ?? 'centre-bourg';

  await progress(100, 'Prêt.');
  el('loader').classList.add('done');
  el('start-screen').classList.remove('hidden');

  // Le navigateur exige une interaction pour démarrer l'audio.
  const startGame = () => {
    audio.start();
    el('start-screen').classList.add('hidden');
    el('hud').classList.remove('hidden');
    last = performance.now();
  };
  el('start-btn').addEventListener('click', startGame);
  addEventListener('keydown', function once(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      if (!el('start-screen').classList.contains('hidden')) {
        startGame();
        removeEventListener('keydown', once);
      }
    }
  });

  // Exposé pour le débogage depuis la console.
  // `renderer` est exposé pour le diagnostic : `renderer.info.render.calls`
  // donne le nombre réel d'appels de dessin par frame, seule mesure fiable du
  // coût de la scène. Sans lui, on en est réduit à compter les meshes, ce qui
  // surestime largement le vrai coût.
  // `setHeure` permet de sauter directement à une heure du cycle jour/nuit, ce
  // qui rend l'éclairage nocturne testable sans attendre que le temps tourne.
  window.__game = { car, world, scene, camera, renderer, composer, data, spawn, SPEC, audio, collisionTris: verts, RAPIER,
    qualite, grilleVegetation, minicarte,
    setHeure: (h) => { timeOfDay = ((h % 24) + 24) % 24; },
    getHeure: () => timeOfDay,
    // Coût d'un dessin de minicarte, moyenné sur `n` appels. Le budget de
    // frame étant la contrainte dominante du projet, une passe de HUD portée
    // de 2 à 60 images par seconde doit être chiffrée, pas supposée.
    mesureCarte: (n = 300) => {
      const p = car.lirePosition(new THREE.Vector3());
      const cap = eulerTmp.setFromQuaternion(car.quaternion, 'YXZ').y;
      // Une passe à blanc écarte le coût de premier appel (compilation JIT,
      // allocation des chemins) du chiffre rapporté.
      for (let i = 0; i < 20; i++) minicarte.dessiner(p, cap, 0.016);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) minicarte.dessiner(p, cap, 0.016);
      const ms = (performance.now() - t0) / n;
      return { ms: +ms.toFixed(3), voies: minicarte.vues.size,
        surBudget16ms: +(ms / 16.7 * 100).toFixed(1) + '%' };
    } };

  requestAnimationFrame(frame);
}

init().catch((e) => {
  console.error(e);
  loaderText.textContent = 'Erreur : ' + e.message;
  loaderText.style.color = '#ff6b6b';
});
