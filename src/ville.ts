// Construction de la ville en Three.js NATIF.
//
// Les modules `src/three-city/*.js` produisent des maillages Three : ils
// entrent tels quels dans la scène rendue. L'ancien pont vers Babylon
// (three-city-bridge.ts, 808 lignes) recopiait chaque géométrie et chaque
// matériau, ignorait les shaders modifiés et forçait le rendu des deux faces.
// Il ne reste ici que ce que le rendu demande en plus de la génération :
// ombres, fusion des petits maillages, et trois matériaux à nœuds.
import * as THREE from 'three/webgpu';
import { attribute, materialColor, materialEmissive, texture } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Accotements } from './three-city/accotements.js';
import { parseBDTopo } from './three-city/bdtopo.js';
import { buildLandmarks } from './three-city/landmarks.js';
import { findSpawn, parseOSM } from './three-city/osm.js';
import { ParkingsEpi } from './three-city/parking.js';
// @ts-ignore : module JS hérité, comme les autres imports three-city.
import { chargerFlotte } from './three-city/flotte.js';
import { VoituresGarees } from './three-city/parkedcars.js';
import { parsePOI } from './three-city/poi.js';
import { buildSignage } from './three-city/signage.js';
import { Pietons } from './three-city/pedestrians.js';
// @ts-ignore : module JS hérité, comme les autres imports three-city.
import { Circulation } from './three-city/traffic.js';
import { pointsAltitude, Terrain } from './three-city/terrain.js';
import { Touffes } from './three-city/touffes.js';
import { poserAnisotropie } from './three-city/textures.js';
import { buildWorld, GARDE_SOL, ROAD_Y } from './three-city/world.js';

type AnyRecord = Record<string, any>;

export interface SourcesVille {
  osm: AnyRecord;
  buildings: AnyRecord;
  poi: AnyRecord | null;
  roofs: AnyRecord | null;
  roofsLegacy: AnyRecord | null;
  facades: AnyRecord | null;
  panoramax: AnyRecord | null;
  facadesPhoto: AnyRecord | null;
  sols: AnyRecord | null;
  poteaux: AnyRecord | null;
  facadesCentre: AnyRecord | null;
}

export interface Ville {
  data: AnyRecord;
  terrain: AnyRecord;
  spawn: { x: number; z: number; heading: number; road?: string | null; width?: number };
  // Éclairage nocturne : foyers des lampadaires, matériau des lanternes et
  // matériau des vitrages (leur émission s'allume à la tombée du jour).
  foyers: Array<{ x: number; y: number; z: number }>;
  lanternes: THREE.MeshStandardMaterial | null;
  vitrages: THREE.MeshStandardMaterial | null;
  // Contenu animé (passants, circulation, touffes d'herbe), à appeler à
  // chaque image depuis la boucle de jeu.
  vivant: { update(dt: number, temps: number, x: number, z: number): void } | null;
  stats: { maillages: number; fusionnes: number };
}

// Maillages retrouvés par leur nom ou portant une ombre propre : jamais
// fusionnés avec leurs voisins.
const PROTEGES_FUSION = new Set([
  'vitrages', 'murs', 'murs-pierre', 'toitures', 'toitures-ardoise', 'toitures-acier',
  'cheminees', 'lucarnes', 'ventilations', 'trottoirs', 'bordures-trottoir',
  'ombres-pied', 'portes',
]);
// Le bâti ordinaire ne déclare pas `castShadow` (hérité de l'ancien moteur) :
// c'est lui qui porte l'essentiel des ombres de rue.
const PORTEURS_OMBRE = new Set(['murs', 'murs-pierre', 'toitures', 'toitures-ardoise',
  'toitures-acier', 'cheminees', 'lucarnes', 'ventilations']);

function removeModeledBuildingDuplicates(data: AnyRecord, buildings: AnyRecord[]): AnyRecord[] {
  const exclusions = [...(data.chateauxEau ?? []).map(
    (tower: AnyRecord) => ({ x: tower.x, z: tower.z, radius: tower.rayon + 6 }),
  )];
  for (const landmark of data.landmarkSources ?? []) {
    let x = 0, z = 0;
    for (const [px, pz] of landmark.pts) { x += px; z += pz; }
    x /= landmark.pts.length;
    z /= landmark.pts.length;
    let radius = 0;
    for (const [px, pz] of landmark.pts) radius = Math.max(radius, Math.hypot(px - x, pz - z));
    exclusions.push({ x, z, radius: radius + 4 });
  }
  if (!exclusions.length) return buildings;
  return buildings.filter((building) => {
    let x = 0, z = 0;
    for (const [px, pz] of building.pts) { x += px; z += pz; }
    x /= building.pts.length;
    z /= building.pts.length;
    return !exclusions.some((excluded) => Math.hypot(excluded.x - x, excluded.z - z) < excluded.radius);
  });
}

// Matériaux à reprendre pour le rendu natif. Chaque matériau n'est traité
// qu'une fois, plusieurs maillages le partagent.
function adapterMateriau(source: THREE.Material, nomMaillage: string, vus: Map<THREE.Material, THREE.Material>): THREE.Material {
  const connu = vus.get(source);
  if (connu) return connu;
  let materiau: THREE.Material = source;
  const basique = source as THREE.MeshBasicMaterial;

  if (nomMaillage === 'ombres-pied') {
    // Carte en niveaux de gris, blanc = aucun effet : le fond est MULTIPLIÉ
    // par elle. Pas de brouillard, il éclaircirait la carte et donc l'ombre.
    materiau = new THREE.MeshBasicMaterial({
      map: basique.map, transparent: true, depthWrite: false,
      blending: THREE.MultiplyBlending, premultipliedAlpha: true, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
  } else if ((source as any).isMeshBasicMaterial && !source.transparent) {
    // Marquages au sol : un matériau non éclairé brille en pleine nuit. Le
    // Lambert reçoit la lumière sans reflet, comme une peinture mate.
    materiau = new THREE.MeshLambertMaterial({
      color: basique.color, map: basique.map, vertexColors: basique.vertexColors,
      side: basique.side, polygonOffset: basique.polygonOffset,
      polygonOffsetFactor: basique.polygonOffsetFactor, polygonOffsetUnits: basique.polygonOffsetUnits,
    });
  }

  const standard = materiau as THREE.MeshStandardMaterial & AnyRecord;
  if (standard.lightMap) {
    // Three AJOUTE une lightmap à l'éclairage indirect. Celles de la ville
    // (plaques d'herbe jaunie) sont des multiplicateurs proches du blanc :
    // elles passent dans la couleur, à leur propre répétition.
    standard.colorNode = materialColor.mul(texture(standard.lightMap).rgb);
    standard.lightMap = null;
  }
  if (nomMaillage === 'vitrages') {
    // Émission baie par baie : l'attribut `emiCouleur` vaut noir sur une baie
    // éteinte. Remplace le `onBeforeCompile` d'origine, que ni le pont ni le
    // rendu à nœuds ne lisent.
    standard.onBeforeCompile = () => {};
    standard.emissiveNode = materialEmissive.mul(attribute('emiCouleur', 'vec3'));
  }
  vus.set(source, materiau);
  return materiau;
}

// Fusion des petits maillages statiques par matériau, ombre et cellule de
// 300 m. Le coût dominant est le nombre d'appels de dessin : la ville compte
// plus de 2 000 maillages de moins de 100 triangles (enseignes, poteaux,
// bordures, mobilier).
function fusionner(racine: THREE.Object3D): number {
  const groupes = new Map<string, THREE.Mesh[]>();
  racine.traverse((objet) => {
    const mesh = objet as THREE.Mesh;
    if (!mesh.isMesh || (mesh as any).isInstancedMesh || !mesh.visible) return;
    if (Array.isArray(mesh.material) || mesh.frustumCulled === false) return;
    if (PROTEGES_FUSION.has(mesh.name) || mesh.name.startsWith('facades-photo')) return;
    const geometrie = mesh.geometry;
    const sommets = geometrie.getAttribute('position')?.count ?? 0;
    const indices = geometrie.index ? geometrie.index.count : sommets;
    if (!sommets || indices > 6000) return;
    if (!geometrie.boundingSphere) geometrie.computeBoundingSphere();
    const centre = geometrie.boundingSphere!.center.clone().applyMatrix4(mesh.matrixWorld);
    const attributs = Object.keys(geometrie.attributes).sort()
      .map((nom) => `${nom}${geometrie.attributes[nom].itemSize}`).join(',');
    const cle = [
      mesh.material.uuid, mesh.castShadow ? 1 : 0, mesh.renderOrder,
      geometrie.index ? 'i' : 'n', attributs,
      Math.floor(centre.x / 300), Math.floor(centre.z / 300),
    ].join('|');
    let liste = groupes.get(cle);
    if (!liste) groupes.set(cle, liste = []);
    liste.push(mesh);
  });

  let fusionnes = 0, serie = 0;
  for (const liste of groupes.values()) {
    if (liste.length < 2) continue;
    const geometries = liste.map((mesh) => {
      const g = mesh.geometry.clone();
      g.applyMatrix4(mesh.matrixWorld);
      return g;
    });
    const fusion = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();
    if (!fusion) continue;
    const resultat = new THREE.Mesh(fusion, liste[0].material);
    resultat.name = `fusion-${serie++}`;
    resultat.castShadow = liste[0].castShadow;
    resultat.receiveShadow = true;
    resultat.renderOrder = liste[0].renderOrder;
    resultat.matrixAutoUpdate = false;
    racine.add(resultat);
    for (const mesh of liste) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    fusionnes += liste.length - 1;
  }
  return fusionnes;
}

// Enroulement de chaque triangle aligné sur sa normale stockée. Un matériau
// à deux faces retourne la normale d'après l'ENROULEMENT vu par la caméra :
// un triangle dont l'ordre des sommets contredit sa normale (polygone
// cadastral horaire, normale posée à la main vers le haut) est éclairé à
// l'envers. Chaussée et parkings ressortaient noirs sous le soleil. On
// inverse tout triangle dont la normale géométrique (b - a) × (c - a)
// s'oppose à la somme de ses normales de sommet.
function alignerEnroulement(geometrie: THREE.BufferGeometry): void {
  const position = geometrie.getAttribute('position');
  const normale = geometrie.getAttribute('normal');
  if (!position || !normale) return;
  const p = position.array as ArrayLike<number>, n = normale.array as ArrayLike<number>;
  // Lecture directe des tableaux : valable pour des attributs non entrelacés
  // de pas 3, ce que produisent tous les modules de la ville.
  if ((position as any).isInterleavedBufferAttribute || (normale as any).isInterleavedBufferAttribute) return;
  let index = geometrie.index;
  let tableau: Uint16Array | Uint32Array | null = null;
  const total = index ? index.count : position.count;
  let inverses = 0;
  for (let t = 0; t + 2 < total; t += 3) {
    const ia = index ? index.getX(t) : t, ib = index ? index.getX(t + 1) : t + 1, ic = index ? index.getX(t + 2) : t + 2;
    const a = ia * 3, b = ib * 3, c = ic * 3;
    const abx = p[b] - p[a], aby = p[b + 1] - p[a + 1], abz = p[b + 2] - p[a + 2];
    const acx = p[c] - p[a], acy = p[c + 1] - p[a + 1], acz = p[c + 2] - p[a + 2];
    const fx = aby * acz - abz * acy, fy = abz * acx - abx * acz, fz = abx * acy - aby * acx;
    const nx = n[a] + n[b] + n[c], ny = n[a + 1] + n[b + 1] + n[c + 1], nz = n[a + 2] + n[b + 2] + n[c + 2];
    if (fx * nx + fy * ny + fz * nz >= 0) continue;
    if (!tableau) {
      // Géométrie sans index : on lui en donne un, l'échange de deux
      // indices évitant de permuter tous les attributs de sommet.
      tableau = position.count > 65535 ? new Uint32Array(total) : new Uint16Array(total);
      for (let i = 0; i < total; i++) tableau[i] = index ? index.getX(i) : i;
    }
    tableau[t + 1] = ic;
    tableau[t + 2] = ib;
    inverses++;
  }
  if (tableau && inverses) geometrie.setIndex(new THREE.BufferAttribute(tableau, 1));
}

// Ombres, UV planaires et matériaux d'un sous-arbre généré par la ville.
function preparer(racine: THREE.Object3D, vus: Map<THREE.Material, THREE.Material>): number {
  let maillages = 0;
  const alignees = new Set<THREE.BufferGeometry>();
  racine.updateMatrixWorld(true);
  racine.traverse((objet) => {
    const mesh = objet as THREE.Mesh;
    if (!mesh.isMesh) return;
    maillages++;
    if (!alignees.has(mesh.geometry)) {
      alignees.add(mesh.geometry);
      alignerEnroulement(mesh.geometry);
    }
    mesh.receiveShadow = true;
    mesh.castShadow = !mesh.userData.noShadowCast
      && (mesh.castShadow || PORTEURS_OMBRE.has(mesh.name) || mesh.name.startsWith('facades-photo'));
    // Nappes construites sans UV (trottoirs) : une tuile de `uvPlanaires`
    // mètres, projetée depuis le dessus.
    const pas = Number(mesh.userData.uvPlanaires) || 0;
    const position = mesh.geometry.getAttribute('position');
    if (pas > 0 && position && !mesh.geometry.getAttribute('uv')) {
      const uv = new Float32Array(position.count * 2);
      for (let i = 0; i < position.count; i++) {
        uv[i * 2] = position.getX(i) / pas;
        uv[i * 2 + 1] = position.getZ(i) / pas;
      }
      mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => adapterMateriau(m, mesh.name, vus))
      : adapterMateriau(mesh.material, mesh.name, vus);
  });
  return maillages;
}

export async function construireVille(
  scene: THREE.Scene,
  sources: SourcesVille,
  anisotropie: number,
  progress?: (percent: number, message: string) => Promise<void>,
): Promise<Ville> {
  const roofs = sources.roofs?.toits?.length ? sources.roofs : sources.roofsLegacy;
  // Les textures de la ville sont créées pendant buildWorld : fixer
  // l'anisotropie avant, sinon elles restent au réglage par défaut.
  (poserAnisotropie as any)(anisotropie);
  const data = parseOSM(sources.osm) as AnyRecord;
  data.facadesPhoto = sources.facadesPhoto ?? null;
  data.facadesCentre = sources.facadesCentre ?? null;
  data.sols = sources.sols ?? null;
  data.poteauxReels = sources.poteaux ?? null;
  const bdtopo = (parseBDTopo as any)(sources.buildings, roofs, sources.facades, sources.panoramax) as AnyRecord;
  data.emprisesModelisees = bdtopo.emprisesModelisees ?? [];
  data.buildings = removeModeledBuildingDuplicates(data, bdtopo.batiments);
  data.altRef = bdtopo.altRef;

  const altitudePoints = pointsAltitude(sources.buildings);
  const terrain = new Terrain(altitudePoints, bdtopo.altRef);
  terrain.terrasser(data.roads, GARDE_SOL);
  data.terrain = terrain;
  if (sources.poi) {
    data.poi = parsePOI(sources.poi);
    if (data.poi.chateauxEau?.length) {
      data.chateauxEau = [...(data.chateauxEau ?? []), ...data.poi.chateauxEau.map(
        (tower: AnyRecord) => ({ ...tower, rayon: tower.rayon ?? 3, hauteur: tower.hauteur ?? 20 }),
      )];
    }
  }

  await progress?.(42, 'Génération des routes, toits et façades…');
  // Tout le statique va dans un groupe à part : c'est lui qu'on prépare et
  // qu'on fusionne, le contenu animé le rejoint ensuite sans y passer.
  const statique = new THREE.Group();
  statique.name = 'ville';
  const world = buildWorld(statique as any, data) as AnyRecord;

  if (data.poi) statique.add(buildSignage(data, terrain, ROAD_Y).group);
  const shoulders = new Accotements(data, terrain, ROAD_Y);
  if (shoulders.effectif) statique.add(shoulders.group);

  const spawn = findSpawn(data.roads, data.buildings) as Ville['spawn'];
  const lane = (spawn.width ?? 6) * .22;
  spawn.x += Math.cos(spawn.heading) * lane;
  spawn.z -= Math.sin(spawn.heading) * lane;

  const parkings = new ParkingsEpi(statique as any, data, terrain, ROAD_Y) as AnyRecord;
  // Flotte rgsdev pour le parc garé et la circulation. En cas d'échec de
  // chargement, les deux modules retombent sur leurs silhouettes en boîte.
  let flotte: AnyRecord | null = null;
  try {
    flotte = await chargerFlotte();
  } catch (error) {
    console.warn('Flotte de véhicules indisponible, silhouettes en boîte :', error);
  }
  new (VoituresGarees as any)(
    statique, data, terrain, ROAD_Y, data.poi?.passages ?? [], spawn,
    [...(parkings.places ?? []), ...(world.placesEpi ?? [])], 880, flotte,
  );
  if (data.landmarkSources?.length) statique.add(buildLandmarks(data, terrain, ROAD_Y).group);

  await progress?.(58, 'Préparation du rendu de la ville…');
  const vus = new Map<THREE.Material, THREE.Material>();
  const maillages = preparer(statique, vus);
  const fusionnes = fusionner(statique);
  // Ville statique : aucune matrice à recalculer à chaque image.
  statique.traverse((objet) => { objet.matrixAutoUpdate = false; });
  scene.add(statique);
  console.info(`Ville : ${maillages} maillages générés, ${fusionnes} fusionnés`);

  const maillageVitrages = statique.getObjectByName('vitrages') as THREE.Mesh | undefined;

  // ---- Contenu animé : passants, circulation, touffes d'herbe -------------
  let vivant: Ville['vivant'] = null;
  try {
    // L'herbe s'écarte de la chaussée et de ses abords : grille de segments
    // de voies au pas de 100 m.
    const CELL = 100;
    const roadGrid = new Map<string, Array<{ x1: number; z1: number; x2: number; z2: number; w: number }>>();
    for (const r of data.roads as Array<{ drivable: boolean; width: number; pts: Array<[number, number]> }>) {
      if (!r.drivable) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const seg = { x1: r.pts[i][0], z1: r.pts[i][1], x2: r.pts[i + 1][0], z2: r.pts[i + 1][1], w: r.width };
        const cx1 = Math.floor(Math.min(seg.x1, seg.x2) / CELL), cx2 = Math.floor(Math.max(seg.x1, seg.x2) / CELL);
        const cz1 = Math.floor(Math.min(seg.z1, seg.z2) / CELL), cz2 = Math.floor(Math.max(seg.z1, seg.z2) / CELL);
        for (let cx = cx1; cx <= cx2; cx++) {
          for (let cz = cz1; cz <= cz2; cz++) {
            const k = `${cx},${cz}`;
            if (!roadGrid.has(k)) roadGrid.set(k, []);
            roadGrid.get(k)!.push(seg);
          }
        }
      }
    }
    // Pas de touffes sur un terrain de sport : pelouse tondue ras ou enrobé.
    const terrainsSport = ((data.terrains ?? []) as Array<{ pts: Array<[number, number]> }>).map((t) => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [px, pz] of t.pts) {
        x0 = Math.min(x0, px); x1 = Math.max(x1, px);
        z0 = Math.min(z0, pz); z1 = Math.max(z1, pz);
      }
      return { x0: x0 - 1, x1: x1 + 1, z0: z0 - 1, z1: z1 + 1 };
    });
    const herbePlantable = (x: number, z: number): boolean => {
      for (const t of terrainsSport) {
        if (x > t.x0 && x < t.x1 && z > t.z0 && z < t.z1) return false;
      }
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

    const anime = new THREE.Group();
    anime.name = 'ville-animee';
    const touffes = new (Touffes as any)(anime, terrain, ROAD_Y, { estPlantable: herbePlantable });
    const pietons = new (Pietons as any)(data, terrain, ROAD_Y, 110);
    const circulation = new (Circulation as any)(data, terrain, ROAD_Y, 12, flotte);
    if (pietons.effectif) anime.add(pietons.group);
    if (circulation.effectif) anime.add(circulation.group);
    preparer(anime, vus);
    scene.add(anime);
    vivant = {
      update(dt: number, temps: number, x: number, z: number): void {
        if (pietons.effectif) pietons.update(Math.min(dt, .1), temps, { x, z });
        if (circulation.effectif) circulation.update(Math.min(dt, .1), { x, z });
        touffes.maj(x, z, true);
      },
    };
  } catch (error) {
    console.warn('Contenu animé indisponible :', error);
  }

  return {
    data,
    terrain,
    spawn,
    vivant,
    foyers: (world.foyers ?? []) as Array<{ x: number; y: number; z: number }>,
    lanternes: (world.lampHeads as THREE.MeshStandardMaterial | null) ?? null,
    vitrages: (maillageVitrages?.material as THREE.MeshStandardMaterial | undefined) ?? null,
    stats: { maillages, fusionnes },
  };
}
