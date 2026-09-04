import {
  Color3,
  Engine,
  Matrix,
  Mesh,
  MultiMaterial,
  PBRMaterial,
  Quaternion,
  Scene,
  ShadowGenerator,
  SubMesh,
  Texture,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import * as THREE from 'three';
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

export interface FaithfulCitySources {
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

export interface FaithfulCityResult {
  data: AnyRecord;
  terrain: AnyRecord;
  altitudeReference: number;
  spawn: { x: number; z: number; heading: number; road?: string | null; width?: number };
  // Éclairage nocturne : positions des foyers de lampadaires et matériau
  // Babylon des lanternes (pour allumer leur émission à la nuit).
  foyers: Array<{ x: number; y: number; z: number }>;
  lampMaterial: PBRMaterial | null;
  // Contenu animé (passants, touffes d'herbe) : la logique Three d'origine
  // reste vivante, ses matrices d'instances alimentant des thin instances
  // Babylon. À appeler chaque frame depuis la boucle de jeu.
  vivant: { update(dt: number, temps: number, x: number, z: number): void } | null;
  meshCount: number;
  instanceCount: number;
  materialCount: number;
}

// Maillages retrouvés par leur nom après conversion (émission des vitrages
// la nuit, ombres nommées, UV planaires des trottoirs) : jamais fusionnés.
const PROTEGES_FUSION = new Set([
  'vitrages', 'murs', 'murs-pierre', 'toitures', 'cheminees', 'lucarnes',
  'ventilations', 'trottoirs', 'bordures-trottoir',
]);

interface ConversionStats {
  meshes: number;
  fusions: number;
  instances: number;
  materials: number;
}

function color3(color: THREE.Color | undefined, fallback = new Color3(1, 1, 1)): Color3 {
  return color ? new Color3(color.r, color.g, color.b) : fallback;
}

function convertedMatrix(source: THREE.Matrix4): Matrix {
  // Garder le repère exact des données d'Artix : rendu, physique, noms de
  // rues et minicarte utilisent ainsi les mêmes coordonnées.
  return Matrix.FromArray(source.elements);
}

class ThreeCityConverter {
  private readonly materials = new WeakMap<THREE.Material, PBRMaterial>();
  private readonly textures = new WeakMap<THREE.Texture, Texture>();
  private materialSerial = 0;
  private meshSerial = 0;
  private textureSerial = 0;
  readonly stats: ConversionStats = { meshes: 0, instances: 0, materials: 0, fusions: 0 };
  private readonly fusionnables: Mesh[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly shadows: ShadowGenerator | null,
  ) {}

  // Matériau Babylon issu de la conversion d'un matériau Three, si ce dernier
  // a été rencontré pendant la traversée. Sert à piloter après coup une
  // propriété (émission des lanternes la nuit).
  materialFor(source: THREE.Material | null | undefined): PBRMaterial | null {
    return source ? this.materials.get(source) ?? null : null;
  }

  // Accès publics pour le pont d'instances vivantes : conversion d'une
  // géométrie et d'un matériau hors de la traversée de scène.
  vertexDataFor(geometry: THREE.BufferGeometry): { data: VertexData; vertices: number; indices: number } {
    return this.vertexData(geometry);
  }

  materialLive(source: THREE.Material): PBRMaterial {
    return this.material(source);
  }

  convert(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.visible) return;
      this.convertMesh(object);
    });
  }

  private texture(source: THREE.Texture | null | undefined): Texture | null {
    if (!source) return null;
    const cached = this.textures.get(source);
    if (cached) return cached;

    const image = source.image as HTMLCanvasElement | HTMLImageElement | undefined;
    if (!image) return null;
    let url = '';
    if ('toDataURL' in image && typeof image.toDataURL === 'function') {
      url = image.toDataURL('image/png');
    } else if ('src' in image && typeof image.src === 'string') {
      url = image.src;
    }
    if (!url) return null;

    // Retournement vertical : Three retourne ses images par défaut
    // (`flipY = true`) et Babylon aussi (`invertY = true`). Les textures
    // issues d'un glTF (palette de la flotte Kenney) sont déclarées non
    // retournées des deux côtés : leurs UV ont l'origine en haut.
    const texture = new Texture(url, this.scene, false, source.flipY !== false, Texture.TRILINEAR_SAMPLINGMODE);
    texture.name = `three-texture-${this.textureSerial++}`;
    texture.wrapU = source.wrapS === THREE.ClampToEdgeWrapping
      ? Texture.CLAMP_ADDRESSMODE
      : source.wrapS === THREE.MirroredRepeatWrapping
        ? Texture.MIRROR_ADDRESSMODE
        : Texture.WRAP_ADDRESSMODE;
    texture.wrapV = source.wrapT === THREE.ClampToEdgeWrapping
      ? Texture.CLAMP_ADDRESSMODE
      : source.wrapT === THREE.MirroredRepeatWrapping
        ? Texture.MIRROR_ADDRESSMODE
        : Texture.WRAP_ADDRESSMODE;
    texture.uScale = source.repeat.x;
    texture.vScale = source.repeat.y;
    texture.uOffset = source.offset.x;
    texture.vOffset = source.offset.y;
    texture.hasAlpha = false;
    // 16 : le maximum des GPU Apple Silicon. Le gain se voit surtout sur la
    // chaussée vue en fuyante, dont la texture se répète des dizaines de fois.
    texture.anisotropicFilteringLevel = 16;
    this.textures.set(source, texture);
    return texture;
  }

  private material(source: THREE.Material): PBRMaterial {
    const cached = this.materials.get(source);
    if (cached) return cached;

    const material = new PBRMaterial(
      source.name || `three-pbr-${this.materialSerial++}`,
      this.scene,
    );
    const standard = source as THREE.MeshStandardMaterial;
    material.albedoColor = color3(standard.color);
    material.metallic = Number.isFinite(standard.metalness) ? standard.metalness : 0;
    material.roughness = Number.isFinite(standard.roughness) ? standard.roughness : .88;
    // Poids neutres : c'est `scene.environmentIntensity` (par ambiance) qui
    // dose l'éclairage du panorama HDR, et la lumière directionnelle porte
    // son intensité propre.
    material.environmentIntensity = 1;
    material.directIntensity = 1;
    material.alpha = source.opacity ?? 1;
    // La ville source est construite par Three.js puis convertie vers une
    // scène Babylon en repère main droite. Les volumes procéduraux simples
    // passent correctement, mais certaines nappes cadastrales et plusieurs
    // éléments assemblés à la main (terrain, brisis de la mairie, pignons)
    // conservent un ordre de sommets que Babylon interprète à l'envers. Le
    // back-face culling ouvrait alors de véritables trous : le ciel clair se
    // voyait à la place de l'herbe et une façade de mairie disparaissait selon
    // l'angle. La ville ne contient pas de coque transparente : rendre les
    // deux faces est donc le garde-fou fidèle et déterministe.
    //
    // Ce garde-fou interdit de compter sur le back-face culling pour cacher
    // quoi que ce soit : une plaque à une seule face reste visible de dos, et
    // en repère main droite Babylon inverse en plus sa convention
    // d'enroulement, si bien qu'un STOP se lisait EN MIROIR depuis la voie
    // opposée. La parade n'est pas d'exempter le matériau mais de donner du
    // VOLUME à l'objet : voir la plaque des panneaux dans signage.js.
    material.backFaceCulling = false;
    material.twoSidedLighting = true;

    // Nuit : phares du joueur et lampadaires proches s'ajoutent au soleil et à
    // l'ambiante. Le plafond par défaut (4) éteindrait silencieusement les
    // lampes surnuméraires.
    material.maxSimultaneousLights = 10;

    const albedo = this.texture(standard.map);
    if (albedo) {
      material.albedoTexture = albedo;
      if (source.transparent || source.alphaTest > 0) albedo.hasAlpha = true;
    }
    const normal = this.texture(standard.normalMap);
    const bump = this.texture(standard.bumpMap);
    if (normal) {
      // Vraie carte de normales (photos de matière, convention OpenGL : +Y
      // vers le haut). En repère main droite, le chargeur glTF de Babylon
      // inverse l'axe Y et pas l'axe X : même réglage ici, sinon le relief
      // de la chaussée et de l'herbe ressort en creux.
      material.bumpTexture = normal;
      normal.gammaSpace = false;
      material.invertNormalMapX = false;
      material.invertNormalMapY = true;
      material.bumpTexture.level = standard.normalScale?.x ?? 1;
    } else if (bump) {
      material.bumpTexture = bump;
      bump.gammaSpace = false;
      if (standard.bumpScale != null) material.bumpTexture.level = standard.bumpScale;
    }

    // Carte de rugosité : le canal vert seulement, en désactivant la lecture
    // du métal dans le bleu. La conversion naïve (metallicTexture tel quel)
    // lisait le bleu comme métal et rendait l'herbe et certains sols
    // métalliques, presque blancs sous l'IBL.
    const rugosite = this.texture(standard.roughnessMap);
    if (rugosite) {
      rugosite.gammaSpace = false;
      material.metallicTexture = rugosite;
      material.useRoughnessFromMetallicTextureAlpha = false;
      material.useRoughnessFromMetallicTextureGreen = true;
      material.useMetallnessFromMetallicTextureBlue = false;
    }
    const occlusion = this.texture(standard.aoMap);
    if (occlusion) {
      occlusion.gammaSpace = false;
      material.ambientTexture = occlusion;
      material.ambientTextureStrength = standard.aoMapIntensity ?? 1;
      material.useAmbientInGrayScale = true;
    }
    // Lightmap Three → « shadowmap » Babylon : multiplie l'éclairage final.
    // Sert de variation à grande échelle (plaques d'herbe jaunie) posée sur
    // les mêmes UV que la couleur, avec sa propre répétition.
    const lightmap = this.texture(standard.lightMap);
    if (lightmap) {
      lightmap.coordinatesIndex = 0;
      material.lightmapTexture = lightmap;
      material.useLightmapAsShadowmap = true;
    }
    // Vernis des carrosseries (MeshPhysicalMaterial.clearcoat) : la couche
    // brillante par-dessus la peinture, ce qui distingue une voiture d'un
    // objet en plastique mat.
    const physique = source as THREE.MeshPhysicalMaterial;
    if (physique.clearcoat > 0) {
      material.clearCoat.isEnabled = true;
      material.clearCoat.intensity = physique.clearcoat;
      material.clearCoat.roughness = physique.clearcoatRoughness ?? .1;
    }

    if (standard.emissive) material.emissiveColor = color3(standard.emissive, Color3.Black());
    if (standard.emissiveIntensity != null) material.emissiveIntensity = standard.emissiveIntensity;
    const emissive = this.texture(standard.emissiveMap);
    if (emissive) material.emissiveTexture = emissive;

    if (source.alphaTest > 0) {
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
      material.alphaCutOff = source.alphaTest;
    } else if (source.transparent || source.opacity < 1) {
      material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
      material.alphaMode = Engine.ALPHA_COMBINE;
      material.needDepthPrePass = true;
      material.forceDepthWrite = source.depthWrite;
    } else {
      material.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
      material.forceDepthWrite = true;
    }

    if (source.polygonOffset) {
      material.zOffset = source.polygonOffsetFactor || -1;
      material.zOffsetUnits = source.polygonOffsetUnits || -1;
    }
    this.materials.set(source, material);
    this.stats.materials++;
    return material;
  }

  private vertexData(geometry: THREE.BufferGeometry, uvPlanaires = 0): { data: VertexData; vertices: number; indices: number } {
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const color = geometry.getAttribute('color');
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < position.count; i++) {
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
      if (normal) normals.push(normal.getX(i), normal.getY(i), normal.getZ(i));
      if (uv) uvs.push(uv.getX(i), uv.getY(i));
      // UV planaires monde pour les nappes construites sans UV (trottoirs) :
      // une tuile de `uvPlanaires` mètres, projetée depuis le dessus.
      else if (uvPlanaires > 0) uvs.push(position.getX(i) / uvPlanaires, position.getZ(i) / uvPlanaires);
      if (color) colors.push(color.getX(i), color.getY(i), color.getZ(i), color.itemSize > 3 ? color.getW(i) : 1);
    }

    const rawIndices = geometry.index
      ? Array.from(geometry.index.array as ArrayLike<number>)
      : Array.from({ length: position.count }, (_, index) => index);
    const indices = rawIndices;

    const data = new VertexData();
    data.positions = positions;
    data.indices = indices;
    if (normals.length) data.normals = normals;
    if (uvs.length) data.uvs = uvs;
    if (colors.length) data.colors = colors;
    return { data, vertices: position.count, indices: indices.length };
  }

  private convertMesh(source: THREE.Mesh): void {
    const geometry = source.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    if (!position?.count) return;

    const converted = this.vertexData(geometry, Number(source.userData.uvPlanaires) || 0);
    const mesh = new Mesh(source.name || `artix-mesh-${this.meshSerial++}`, this.scene);
    converted.data.applyToMesh(mesh, false);
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.alwaysSelectAsActiveMesh = source.frustumCulled === false;

    const sourceMaterials = Array.isArray(source.material) ? source.material : [source.material];
    if (sourceMaterials.length === 1) {
      mesh.material = this.material(sourceMaterials[0]);
    } else {
      const multi = new MultiMaterial(`three-multi-${this.meshSerial}`, this.scene);
      multi.subMaterials = sourceMaterials.map((material) => this.material(material));
      mesh.material = multi;
      mesh.subMeshes = [];
      for (const group of geometry.groups) {
        new SubMesh(
          group.materialIndex ?? 0,
          0,
          converted.vertices,
          group.start,
          group.count,
          mesh,
        );
      }
      if (!geometry.groups.length) {
        new SubMesh(0, 0, converted.vertices, 0, converted.indices, mesh);
      }
    }

    if (source instanceof THREE.InstancedMesh) {
      mesh.position.setAll(0);
      mesh.scaling.setAll(1);
      mesh.rotationQuaternion = Quaternion.Identity();
      const matrixBuffer = new Float32Array(source.count * 16);
      const instance = new THREE.Matrix4();
      const world = new THREE.Matrix4();
      for (let index = 0; index < source.count; index++) {
        source.getMatrixAt(index, instance);
        world.multiplyMatrices(source.matrixWorld, instance);
        convertedMatrix(world).copyToArray(matrixBuffer, index * 16);
      }
      mesh.thinInstanceSetBuffer('matrix', matrixBuffer, 16, true);
      if (source.instanceColor) {
        const colorBuffer = new Float32Array(source.count * 4);
        for (let index = 0; index < source.count; index++) {
          colorBuffer[index * 4] = source.instanceColor.getX(index);
          colorBuffer[index * 4 + 1] = source.instanceColor.getY(index);
          colorBuffer[index * 4 + 2] = source.instanceColor.getZ(index);
          colorBuffer[index * 4 + 3] = 1;
        }
        mesh.thinInstanceSetBuffer('color', colorBuffer, 4, true);
      }
      mesh.thinInstanceRefreshBoundingInfo(true);
      this.stats.instances += source.count;
    } else {
      const scaling = new Vector3();
      const rotation = new Quaternion();
      const translation = new Vector3();
      convertedMatrix(source.matrixWorld).decompose(scaling, rotation, translation);
      mesh.position.copyFrom(translation);
      mesh.scaling.copyFrom(scaling);
      mesh.rotationQuaternion = rotation;
    }

    // Ne jamais traduire `renderOrder` en renderingGroupId : Babylon efface
    // le depth buffer entre certains groupes. Les chaussées se dessinaient
    // alors par-dessus les bâtiments et formaient les longues bandes visibles
    // sur la capture. Les zOffset des matériaux suffisent pour le z-fighting.
    const shadowMeshes = new Set(['murs', 'murs-pierre', 'toitures', 'cheminees', 'lucarnes', 'ventilations']);
    const shouldCastShadow = source.castShadow || shadowMeshes.has(source.name)
      || source.name.startsWith('facades-photo');
    const caster = shouldCastShadow && !source.userData.noShadowCast;
    mesh.metadata = { caster };
    // Candidats à la fusion (voir `fusionner`) : petits maillages statiques à
    // matériau unique, hors thin instances et hors maillages retrouvés par
    // leur nom après coup (vitrages, lanternes, trottoirs).
    const fusionnable = !(source instanceof THREE.InstancedMesh)
      && !Array.isArray(source.material)
      && !mesh.alwaysSelectAsActiveMesh
      && !PROTEGES_FUSION.has(mesh.name)
      && !mesh.name.startsWith('facades-photo')
      && converted.indices <= 6000;
    if (fusionnable) {
      this.fusionnables.push(mesh);
    } else {
      if (caster) this.shadows?.addShadowCaster(mesh, false);
      mesh.freezeWorldMatrix();
    }
    this.stats.meshes++;
  }

  // Fusion des petits maillages statiques par matériau, ombre et cellule de
  // 300 m. Mesuré au profileur Chrome : la passe principale coûtait 11,7 ms
  // de JS par image pour 818 maillages actifs, soit 14 µs par appel de dessin
  // (rebind PBR complet à chaque changement de matériau, cascades d'ombre
  // comprises), quand la passe d'ombre en coûtait 2 µs. La ville comptait
  // 2 300 maillages de moins de 100 triangles (enseignes, poteaux, bordures,
  // mobilier) : les fusionner ramène les appels de dessin à quelques
  // centaines. La cellule spatiale garde un découpage utile au frustum.
  fusionner(): void {
    const groupes = new Map<string, Mesh[]>();
    for (const mesh of this.fusionnables) {
      mesh.computeWorldMatrix(true);
      const centre = mesh.getBoundingInfo().boundingSphere.centerWorld;
      const cle = [
        mesh.material!.uniqueId,
        mesh.metadata.caster ? 1 : 0,
        mesh.getVerticesDataKinds().join(','),
        Math.floor(centre.x / 300), Math.floor(centre.z / 300),
      ].join('|');
      let liste = groupes.get(cle);
      if (!liste) groupes.set(cle, liste = []);
      liste.push(mesh);
    }
    let serie = 0;
    for (const liste of groupes.values()) {
      const caster = liste[0].metadata.caster as boolean;
      let resultat: Mesh | null = liste[0];
      if (liste.length >= 2) {
        resultat = Mesh.MergeMeshes(liste, true, true, undefined, false, false);
        if (!resultat) continue;
        resultat.name = `fusion-${serie++}`;
        resultat.isPickable = false;
        resultat.receiveShadows = true;
        this.stats.fusions += liste.length - 1;
      }
      if (caster) this.shadows?.addShadowCaster(resultat, false);
      resultat.freezeWorldMatrix();
    }
    this.fusionnables.length = 0;
  }
}

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

// Pont d'instances vivantes : un InstancedMesh Three animé chaque frame par
// sa logique d'origine, rendu par Babylon en thin instances. Les matrices
// d'instances des deux moteurs partagent exactement le même agencement
// mémoire (colonne-major, translation en 12..14) : le Float32Array de Three
// est branché TEL QUEL comme buffer de thin instances, sans copie. Seules les
// couleurs d'instances demandent une recopie, Three les rangeant par trois
// composantes et Babylon par quatre.
class LiveInstancedBridge {
  private readonly paires: Array<{
    three: THREE.InstancedMesh;
    babylon: Mesh;
    couleurs: Float32Array | null;
    versionCouleurs: number;
  }> = [];

  constructor(private readonly scene: Scene, private readonly converter: ThreeCityConverter) {}

  adopter(im: THREE.InstancedMesh, name: string): void {
    const mesh = new Mesh(name, this.scene);
    const { data } = this.converter.vertexDataFor(im.geometry);
    data.applyToMesh(mesh);
    mesh.material = this.converter.materialLive(im.material as THREE.Material);
    // Le pool se déplace avec le véhicule : la sphère englobante serait
    // toujours fausse, on force le rendu comme le faisait frustumCulled=false.
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.isPickable = false;
    mesh.receiveShadows = true;
    mesh.thinInstanceSetBuffer('matrix', im.instanceMatrix.array as Float32Array, 16, false);
    mesh.thinInstanceCount = im.count;
    this.paires.push({ three: im, babylon: mesh, couleurs: null, versionCouleurs: -1 });
  }

  sync(): void {
    for (const p of this.paires) {
      p.babylon.thinInstanceCount = p.three.count;
      p.babylon.thinInstanceBufferUpdated('matrix');
      const ic = p.three.instanceColor;
      if (ic && ic.version !== p.versionCouleurs) {
        p.versionCouleurs = ic.version;
        const n = ic.count;
        if (!p.couleurs || p.couleurs.length < n * 4) {
          p.couleurs = new Float32Array(n * 4);
          p.couleurs.fill(1);
        }
        const src = ic.array as Float32Array;
        for (let i = 0; i < n; i++) {
          p.couleurs[i * 4] = src[i * 3];
          p.couleurs[i * 4 + 1] = src[i * 3 + 1];
          p.couleurs[i * 4 + 2] = src[i * 3 + 2];
          p.couleurs[i * 4 + 3] = 1;
        }
        p.babylon.thinInstanceSetBuffer('color', p.couleurs, 4, false);
      }
    }
  }
}

export async function buildFaithfulArtix(
  scene: Scene,
  sources: FaithfulCitySources,
  shadows: ShadowGenerator | null,
  progress?: (percent: number, message: string) => Promise<void>,
): Promise<FaithfulCityResult> {
  const roofs = sources.roofs?.toits?.length ? sources.roofs : sources.roofsLegacy;
  // Les textures canvas de la ville sont créées pendant buildWorld : fixer
  // l'anisotropie maximale avant, sinon elles restent au réglage par défaut.
  (poserAnisotropie as any)(16);
  const data = parseOSM(sources.osm) as AnyRecord;
  // Façades rectifiées depuis Panoramax : consommées par buildWorld.
  data.facadesPhoto = sources.facadesPhoto ?? null;
  // Placage HD multi-façades du corridor commerçant, prioritaire sur le
  // placage général.
  data.facadesCentre = sources.facadesCentre ?? null;
  // Sols mesurés (chaussées, parkings, usure des passages) : buildWorld et
  // buildSignage s'en servent pour caler leurs teintes sur les photos.
  data.sols = sources.sols ?? null;
  // Poteaux triangulés depuis les panoramiques : positions réelles des
  // supports aériens, consommées par buildSignage.
  data.poteauxReels = sources.poteaux ?? null;
  // Renseigné après parseBDTopo, plus bas.
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

  await progress?.(42, 'Génération fidèle des routes, toits et façades…');
  const sourceScene = new THREE.Scene();
  const world = buildWorld(sourceScene, data);

  if (data.poi) {
    const signage = buildSignage(data, terrain, ROAD_Y);
    sourceScene.add(signage.group);
  }

  const shoulders = new Accotements(data, terrain, ROAD_Y);
  if (shoulders.effectif) sourceScene.add(shoulders.group);

  const spawn = findSpawn(data.roads, data.buildings);
  const lane = (spawn.width ?? 6) * .22;
  spawn.x += Math.cos(spawn.heading) * lane;
  spawn.z -= Math.sin(spawn.heading) * lane;

  const parkings = new ParkingsEpi(sourceScene, data, terrain, ROAD_Y);
  // Flotte low-poly (Kenney) pour le parc garé et la circulation. En cas
  // d'échec de chargement, les deux modules retombent sur leurs silhouettes
  // en boîte : la ville se construit quand même.
  let flotte: AnyRecord | null = null;
  try {
    flotte = await chargerFlotte();
  } catch (error) {
    console.warn('Flotte de véhicules indisponible, silhouettes en boîte :', error);
  }
  new (VoituresGarees as any)(
    sourceScene,
    data,
    terrain,
    ROAD_Y,
    data.poi?.passages ?? [],
    spawn,
    [...(parkings.places ?? []), ...(world.placesEpi ?? [])],
    880,
    flotte,
  );

  if (data.landmarkSources?.length) {
    const landmarks = buildLandmarks(data, terrain, ROAD_Y);
    sourceScene.add(landmarks.group);
  }

  await progress?.(58, 'Conversion de la ville exacte vers Babylon.js…');
  const converter = new ThreeCityConverter(scene, shadows);
  converter.convert(sourceScene);
  converter.fusionner();
  console.info(`Ville convertie : ${converter.stats.meshes} maillages, ${converter.stats.fusions} fusionnés, ${converter.stats.materials} matériaux`);

  sourceScene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  sourceScene.clear();

  // ---- Contenu animé : passants et touffes d'herbe ------------------------
  // Les modules Three d'origine gardent toute leur logique (réseau piéton,
  // replantation par cellules) ; seul leur rendu passe par le pont de thin
  // instances. Ils ne rejoignent pas sourceScene, qui est vidée juste au-dessus.
  let vivant: FaithfulCityResult['vivant'] = null;
  try {
    // L'herbe s'écarte de la chaussée et de ses abords, comme dans le jeu
    // d'origine : grille de segments de voies au pas de 100 m.
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
    // Les touffes ne poussent pas sur un terrain de sport : la pelouse d'un
    // stade est tondue ras, et les plateaux d'enrobé encore moins. Boîtes
    // englobantes des 27 emprises OSM, avec un mètre de marge.
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

    const groupeFactice = new THREE.Group();
    const touffes = new (Touffes as any)(groupeFactice, terrain, ROAD_Y, { estPlantable: herbePlantable });
    const pietons = new (Pietons as any)(data, terrain, ROAD_Y, 110);
    // Circulation légère : une douzaine de véhicules sur le graphe des voies.
    const circulation = new (Circulation as any)(data, terrain, ROAD_Y, 12, flotte);
    const live = new LiveInstancedBridge(scene, converter);
    live.adopter(touffes.mesh, 'touffes-herbe');
    if (pietons.effectif) {
      const parties = [pietons.corps, pietons.tete, pietons.cheveux,
        pietons.jambeG, pietons.jambeD, pietons.brasG, pietons.brasD];
      parties.forEach((im, i) => live.adopter(im, `pietons-${i}`));
    }
    if (circulation.effectif) {
      const partiesCirc = [...Object.values(circulation.caisses),
        ...Object.values(circulation.details ?? {}),
        circulation.roues, circulation.feuxAr, circulation.feuxAv];
      partiesCirc.forEach((im, i) => live.adopter(im as THREE.InstancedMesh, `circulation-${i}`));
    }
    vivant = {
      update(dt: number, temps: number, x: number, z: number): void {
        if (pietons.effectif) pietons.update(Math.min(dt, .1), temps, { x, z });
        if (circulation.effectif) circulation.update(Math.min(dt, .1), { x, z });
        touffes.maj(x, z, true);
        live.sync();
      },
    };
  } catch (error) {
    console.warn('Contenu animé indisponible :', error);
  }

  return {
    data,
    terrain,
    altitudeReference: bdtopo.altRef,
    spawn,
    vivant,
    foyers: (world.foyers ?? []) as Array<{ x: number; y: number; z: number }>,
    lampMaterial: converter.materialFor(world.lampHeads as THREE.Material | null),
    meshCount: converter.stats.meshes,
    instanceCount: converter.stats.instances,
    materialCount: converter.stats.materials,
  };
}
