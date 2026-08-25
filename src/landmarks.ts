import {
  Color3,
  DynamicTexture,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  ShadowGenerator,
  Texture,
  TransformNode,
  Vector3,
  VertexData,
} from '@babylonjs/core';
import type { CityMapData, LandmarkSource, Point2, TerrainLike } from './types';

export interface ArtixPlace {
  name: string;
  detail: string;
  x: number;
  z: number;
  radius: number;
}

// Coordonnées projetées depuis les données OSM livrées avec le jeu.
export const ARTIX_PLACES: readonly ArtixPlace[] = [
  { name: "Mairie d’Artix", detail: 'Place de la Mairie', x: -12, z: 50, radius: 105 },
  { name: 'Église Saint-Pierre', detail: 'Centre historique', x: 12, z: 170, radius: 90 },
  { name: 'Leclerc Express', detail: 'Centre-bourg', x: 57, z: -88, radius: 90 },
  { name: 'Gare d’Artix', detail: 'Quartier de la gare', x: 167, z: 442, radius: 125 },
  { name: 'Maison de la Santé', detail: 'Avenue de la Gare', x: 137, z: 215, radius: 75 },
  { name: 'Piscine municipale', detail: 'Quartier des sports', x: 400, z: -14, radius: 95 },
  { name: 'Groupe scolaire Jean Sarrailh', detail: 'Quartier Sarrailh', x: 349, z: -660, radius: 145 },
  { name: 'Résidence Pyrénées', detail: 'Avenue Edmond Rostand', x: 10, z: -582, radius: 105 },
  { name: 'Auberge du Parc', detail: 'Avenue du Corps-Franc Pommiès', x: -192, z: 153, radius: 70 },
  { name: 'Zone d’activités Eurolacq', detail: 'Entrée est d’Artix', x: 1120, z: 650, radius: 360 },
];

interface Bounds {
  cx: number;
  cz: number;
  length: number;
  width: number;
  angle: number;
}

function orientedBounds(pts: Point2[]): Bounds {
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;
  let xx = 0, zz = 0, xz = 0;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    xx += dx * dx; zz += dz * dz; xz += dx * dz;
  }
  const angle = .5 * Math.atan2(2 * xz, xx - zz);
  const ax = Math.cos(angle), az = Math.sin(angle);
  let minL = Infinity, maxL = -Infinity, minW = Infinity, maxW = -Infinity;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    const l = dx * ax + dz * az;
    const w = -dx * az + dz * ax;
    minL = Math.min(minL, l); maxL = Math.max(maxL, l);
    minW = Math.min(minW, w); maxW = Math.max(maxW, w);
  }
  return {
    cx: cx + ax * (minL + maxL) / 2 - az * (minW + maxW) / 2,
    cz: cz + az * (minL + maxL) / 2 + ax * (minW + maxW) / 2,
    length: maxL - minL,
    width: maxW - minW,
    angle,
  };
}

function material(scene: Scene, name: string, hex: string, roughness = .88, emissive = false): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = Color3.FromHexString(hex);
  mat.metallic = 0;
  mat.roughness = roughness;
  if (emissive) mat.emissiveColor = Color3.FromHexString(hex).scale(.18);
  mat.backFaceCulling = false;
  mat.freeze();
  return mat;
}

function box(
  scene: Scene,
  parent: TransformNode,
  name: string,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  mat: PBRMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  mesh.position.set(x, y, z);
  mesh.material = mat;
  mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

function pyramidRoof(
  scene: Scene,
  parent: TransformNode,
  name: string,
  width: number,
  depth: number,
  height: number,
  y: number,
  mat: PBRMaterial,
): Mesh {
  const mesh = MeshBuilder.CreateCylinder(name, {
    diameterTop: .08,
    diameterBottom: 2,
    height,
    tessellation: 4,
  }, scene);
  mesh.scaling.set(width / 2, 1, depth / 2);
  mesh.rotation.y = Math.PI / 4;
  mesh.position.y = y;
  mesh.material = mat;
  mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

function gableRoof(
  scene: Scene,
  parent: TransformNode,
  name: string,
  length: number,
  width: number,
  eave: number,
  rise: number,
  mat: PBRMaterial,
): Mesh {
  const hl = length / 2, hw = width / 2, ridge = eave + rise;
  const positions = [
    -hl, eave, -hw, hl, eave, -hw, hl, ridge, 0, -hl, ridge, 0,
    -hl, ridge, 0, hl, ridge, 0, hl, eave, hw, -hl, eave, hw,
    -hl, eave, -hw, -hl, ridge, 0, -hl, eave, hw,
    hl, eave, -hw, hl, eave, hw, hl, ridge, 0,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals;
  const mesh = new Mesh(name, scene);
  data.applyToMesh(mesh);
  mesh.material = mat;
  mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

function mansardRoof(
  scene: Scene,
  parent: TransformNode,
  length: number,
  width: number,
  bottomY: number,
  height: number,
  retreat: number,
  mat: PBRMaterial,
): Mesh {
  const hb = length / 2 + .42, wb = width / 2 + .42;
  const ht = length / 2 - retreat, wt = width / 2 - retreat;
  const topY = bottomY + height;
  const positions = [
    -hb, bottomY, wb, hb, bottomY, wb, ht, topY, wt, -ht, topY, wt,
    hb, bottomY, -wb, -hb, bottomY, -wb, -ht, topY, -wt, ht, topY, -wt,
    hb, bottomY, wb, hb, bottomY, -wb, ht, topY, -wt, ht, topY, wt,
    -hb, bottomY, -wb, -hb, bottomY, wb, -ht, topY, wt, -ht, topY, -wt,
  ];
  const indices: number[] = [];
  for (let i = 0; i < 4; i++) indices.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  data.positions = positions; data.indices = indices; data.normals = normals;
  const mesh = new Mesh('mairie-mansarde', scene);
  data.applyToMesh(mesh);
  mesh.material = mat;
  mesh.parent = parent;
  mesh.receiveShadows = true;
  return mesh;
}

function signMaterial(scene: Scene, name: string, text: string, background: string, color = '#ffffff'): PBRMaterial {
  const texture = new DynamicTexture(`${name}-texture`, { width: 1024, height: 256 }, scene, false);
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 13;
  ctx.strokeRect(10, 10, 1004, 236);
  ctx.fillStyle = color;
  const fontSize = text.length > 22 ? 82 : text.length > 14 ? 100 : 122;
  ctx.font = `800 ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 132, 930);
  texture.update(false);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 8;
  const mat = new PBRMaterial(`${name}-material`, scene);
  mat.albedoTexture = texture;
  mat.emissiveTexture = texture;
  mat.emissiveColor = new Color3(.12, .12, .12);
  mat.metallic = 0;
  mat.roughness = .62;
  mat.backFaceCulling = false;
  mat.freeze();
  return mat;
}

function sign(
  scene: Scene,
  parent: TransformNode,
  name: string,
  text: string,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  background = '#185a93',
  color = '#ffffff',
): Mesh {
  const panel = MeshBuilder.CreatePlane(name, { width, height, sideOrientation: Mesh.DOUBLESIDE }, scene);
  panel.position.set(x, y, z);
  panel.material = signMaterial(scene, name, text, background, color);
  panel.parent = parent;
  return panel;
}

function lowestGround(terrain: TerrainLike, b: Bounds): number {
  let ground = Infinity;
  const ca = Math.cos(-b.angle), sa = Math.sin(-b.angle);
  for (const u of [-b.length / 2, 0, b.length / 2]) {
    for (const v of [-b.width / 2, 0, b.width / 2]) {
      const x = b.cx + u * ca - v * sa;
      const z = b.cz + u * sa + v * ca;
      ground = Math.min(ground, terrain.hauteurRoute(x, z));
    }
  }
  return ground - .25;
}

function townHall(scene: Scene, terrain: TerrainLike, source: LandmarkSource): TransformNode {
  const b = orientedBounds(source.pts);
  const root = new TransformNode('mairie-artix', scene);
  root.position.set(b.cx, lowestGround(terrain, b), b.cz);
  root.rotation.y = -b.angle;
  const wall = material(scene, 'mairie-wall', '#f4f2ee', .82);
  const slate = material(scene, 'mairie-slate', '#3f444b', .72);
  const glass = material(scene, 'mairie-glass', '#2a3440', .2);
  const trim = material(scene, 'mairie-trim', '#f8f7f4', .55);
  const hWall = 7.4, roofBase = hWall + .38, roofHeight = 3.6, retreat = 2.6;
  box(scene, root, 'mairie-corps', b.length, hWall, b.width, 0, hWall / 2, 0, wall);
  box(scene, root, 'mairie-corniche', b.length + .5, .38, b.width + .5, 0, hWall + .19, 0, wall);
  mansardRoof(scene, root, b.length, b.width, roofBase, roofHeight, retreat, slate);
  box(scene, root, 'mairie-terrasson', b.length - retreat * 2, .5, b.width - retreat * 2, 0, roofBase + roofHeight + .25, 0, slate);
  const bays = Math.max(4, Math.min(9, Math.round(b.length / 3.2)));
  for (let i = 0; i < bays; i++) {
    const x = -b.length / 2 + (i + .5) * b.length / bays;
    for (const side of [-1, 1]) {
      for (const [y, height] of [[2.1, 2], [5.2, 1.8]]) {
        box(scene, root, 'mairie-window-frame', 1.32, height + .2, .06, x, y, side * (b.width / 2 + .03), trim);
        box(scene, root, 'mairie-window', 1.12, height, .07, x, y, side * (b.width / 2 + .07), glass);
      }
    }
  }
  box(scene, root, 'mairie-porte', 2.35, 2.65, .1, 0, 1.35, b.width / 2 + .06, glass);
  box(scene, root, 'mairie-perron', 4.2, .36, 1.6, 0, .18, b.width / 2 + .8, trim);
  sign(scene, root, 'mairie-devise', 'LIBERTÉ  ÉGALITÉ  FRATERNITÉ', b.length * .62, .8, 0, 6.9, b.width / 2 + .08, '#f4f2ee', '#8c8378');
  const dormers = Math.max(4, Math.min(8, Math.round(b.length / 3.6)));
  for (let i = 0; i < dormers; i++) {
    const x = -b.length / 2 + (i + .5) * b.length / dormers;
    for (const side of [-1, 1]) {
      box(scene, root, 'mairie-lucarne', 1.15, 1.5, 1.1, x, roofBase + roofHeight * .46, side * ((b.width / 2 + .42 + b.width / 2 - retreat) / 2 + .12), wall);
      box(scene, root, 'mairie-lucarne-window', .72, 1, .08, x, roofBase + roofHeight * .46, side * ((b.width / 2 + .42 + b.width / 2 - retreat) / 2 + .69), glass);
      const front = MeshBuilder.CreateCylinder('mairie-lucarne-fronton', { diameterTop: 0, diameterBottom: 1.84, height: .62, tessellation: 4 }, scene);
      front.scaling.z = .45;
      front.rotation.y = Math.PI / 4;
      front.position.set(x, roofBase + roofHeight * .46 + 1.06, side * ((b.width / 2 + .42 + b.width / 2 - retreat) / 2 + .12));
      front.material = wall; front.parent = root;
    }
  }
  const pole = MeshBuilder.CreateCylinder('mairie-drapeau-mat', { height: 7, diameter: .11, tessellation: 6 }, scene);
  pole.position.set(-b.length / 2 + 1.4, 3.5, b.width / 2 + 1.6);
  pole.material = trim; pole.parent = root;
  return root;
}

function church(scene: Scene, terrain: TerrainLike, source: LandmarkSource): TransformNode {
  const b = orientedBounds(source.pts);
  const root = new TransformNode('eglise-saint-pierre', scene);
  root.position.set(b.cx, lowestGround(terrain, b), b.cz);
  root.rotation.y = -b.angle;
  const wall = material(scene, 'church-wall', '#e6e2d8', .93);
  const stone = material(scene, 'church-stone', '#c3bba9', .88);
  const slate = material(scene, 'church-slate', '#3f444b', .72);
  const lightRoof = material(scene, 'church-light-roof', '#b9bcbe', .85);
  const dark = material(scene, 'church-openings', '#1b1714', .6);
  const naveWidth = b.width - 1.3;
  const H_EAVE = 8.38, H_RIDGE = 11.42, H_BELFRY = 12.43, H_OPENING = 13.15;
  const H_CORNICE = 17.78, H_SPIRE = 18.5, H_POINT = 26.3, H_CROSS = 28.41;
  const towerSize = 5.06;
  const towerX = -b.length / 2 + towerSize / 2;
  const naveWest = towerX + towerSize / 2;
  const naveEast = b.length / 2;
  const naveLength = naveEast - naveWest;
  const naveCenter = (naveWest + naveEast) / 2;
  box(scene, root, 'church-nave', naveLength, H_EAVE, naveWidth, naveCenter, H_EAVE / 2, 0, wall);
  const roofNode = new TransformNode('church-roof-node', scene);
  roofNode.position.x = naveCenter; roofNode.parent = root;
  gableRoof(scene, roofNode, 'church-roof', naveLength + .8, naveWidth + .8, H_EAVE, H_RIDGE - H_EAVE, lightRoof);
  const buttressHeight = H_EAVE - .5;
  for (let i = 0; i < 6; i++) {
    const x = naveWest + 1.2 + i * 4.48;
    if (x > naveEast - .6) break;
    for (const side of [-1, 1]) {
      box(scene, root, 'church-buttress', .8, buttressHeight, .65, x, buttressHeight / 2, side * (naveWidth / 2 + .325), stone);
      const oculus = MeshBuilder.CreateCylinder('church-oculus', { height: .12, diameter: .84, tessellation: 12 }, scene);
      oculus.rotation.x = Math.PI / 2;
      oculus.position.set(x + 2.24, H_EAVE - 1.15, side * (naveWidth / 2 + .06));
      oculus.material = dark; oculus.parent = root;
    }
  }
  const apseRadius = naveWidth * .42;
  const apse = MeshBuilder.CreateCylinder('church-apse', { height: H_EAVE, diameter: apseRadius * 2, tessellation: 7, arc: .5 }, scene);
  apse.position.set(naveEast, H_EAVE / 2, 0); apse.rotation.y = Math.PI / 2;
  apse.material = wall; apse.parent = root;
  const apseRoof = MeshBuilder.CreateCylinder('church-apse-roof', { height: H_RIDGE - H_EAVE, diameterTop: 0, diameterBottom: apseRadius * 2.03, tessellation: 7, arc: .5 }, scene);
  apseRoof.position.set(naveEast, H_EAVE + (H_RIDGE - H_EAVE) / 2, 0); apseRoof.rotation.y = Math.PI / 2;
  apseRoof.material = lightRoof; apseRoof.parent = root;
  box(scene, root, 'church-tower', towerSize, H_CORNICE, towerSize, towerX, H_CORNICE / 2, 0, wall);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(scene, root, 'church-corner-stone', .5, H_CORNICE, .5, towerX + sx * (towerSize / 2 - .1), H_CORNICE / 2, sz * (towerSize / 2 - .1), stone);
  }
  box(scene, root, 'church-belfry-band', towerSize + .24, .35, towerSize + .24, towerX, H_BELFRY, 0, stone);
  box(scene, root, 'church-cornice', towerSize + .5, .42, towerSize + .5, towerX, H_CORNICE - .21, 0, stone);
  const openingHeight = H_CORNICE - .7 - H_OPENING;
  for (let face = 0; face < 4; face++) {
    const angle = face * Math.PI / 2;
    const nx = Math.sin(angle), nz = Math.cos(angle);
    for (const offset of [-1, 1]) {
      const tx = -nz * offset * towerSize * .1725;
      const tz = nx * offset * towerSize * .1725;
      box(scene, root, 'church-belfry-opening', towerSize * .15, openingHeight, .16,
        towerX + nx * (towerSize / 2 + .03) + tx, H_OPENING + openingHeight / 2,
        nz * (towerSize / 2 + .03) + tz, dark).rotation.y = angle;
    }
  }
  const spire = pyramidRoof(scene, root, 'church-spire', towerSize * 1.08, towerSize * 1.08, H_POINT - H_SPIRE, H_SPIRE + (H_POINT - H_SPIRE) / 2, slate);
  spire.position.x = towerX;
  const cross = material(scene, 'church-cross', '#2a2a2c', .5);
  box(scene, root, 'church-cross-pole', .09, H_CROSS - H_POINT, .09, towerX, H_POINT + (H_CROSS - H_POINT) / 2, 0, cross);
  box(scene, root, 'church-cross-arm', .78, .09, .09, towerX, H_POINT + (H_CROSS - H_POINT) * .62, 0, cross);
  const facadeX = towerX - towerSize / 2 - .04;
  box(scene, root, 'church-portal', .16, 3.1, 1.9, facadeX, 1.55, 0, dark);
  const medallion = MeshBuilder.CreateCylinder('church-medallion', { height: .12, diameter: 1.56, tessellation: 14 }, scene);
  medallion.rotation.z = Math.PI / 2; medallion.position.set(facadeX, H_EAVE + 1.4, 0);
  medallion.material = stone; medallion.parent = root;
  return root;
}

function leclerc(scene: Scene, terrain: TerrainLike): TransformNode {
  const b: Bounds = { cx: 57, cz: -88.4, length: 42.9, width: 26.5, angle: .1814 };
  const root = new TransformNode('leclerc-express', scene);
  root.position.set(b.cx, lowestGround(terrain, b), b.cz);
  root.rotation.y = -b.angle;
  const wall = material(scene, 'leclerc-wall', '#eee9dd', .9);
  const trim = material(scene, 'leclerc-trim', '#244f83', .7);
  const glass = material(scene, 'leclerc-glass', '#203743', .23);
  const roof = material(scene, 'leclerc-roof', '#565c61', .9);
  box(scene, root, 'leclerc-corps', b.length, 4.35, b.width, 0, 2.175, 0, wall);
  box(scene, root, 'leclerc-acrotere', b.length + .3, .65, b.width + .3, 0, 4.675, 0, wall);
  box(scene, root, 'leclerc-vitrine', b.length * .61, 2.35, .09, -b.length * .1, 1.75, b.width / 2 + .06, glass);
  box(scene, root, 'leclerc-auvent', b.length * .67, .2, 1.8, -b.length * .1, 3.35, b.width / 2 + .83, trim);
  sign(scene, root, 'leclerc-sign', 'E.LECLERC  EXPRESS', 11, .52, -b.length * .12, 4.56, b.width / 2 + .2, '#0b3d91');
  return root;
}

function residence(scene: Scene, terrain: TerrainLike): TransformNode {
  const b: Bounds = { cx: 10.2, cz: -582.4, length: 62.36, width: 9.2, angle: .3879 };
  const root = new TransformNode('residence-pyrenees', scene);
  root.position.set(b.cx, lowestGround(terrain, b), b.cz);
  root.rotation.y = -b.angle;
  const cream = material(scene, 'residence-wall', '#d4c29a', .95);
  const ochre = material(scene, 'residence-socle', '#a87947', .94);
  const glass = material(scene, 'residence-glass', '#2d3b42', .32);
  const trim = material(scene, 'residence-trim', '#ece2c8', .86);
  const roof = material(scene, 'residence-roof', '#80624d', .91);
  const hBase = .75, hGutter = 10.1, hRidge = 11.8, floors = 3;
  const floorHeight = (hGutter - hBase) / floors;
  box(scene, root, 'residence-socle', b.length + .16, hBase, b.width + .16, 0, hBase / 2, 0, ochre);
  box(scene, root, 'residence-corps', b.length, hGutter - hBase, b.width, 0, hBase + (hGutter - hBase) / 2, 0, cream);
  for (let floor = 1; floor < floors; floor++) {
    box(scene, root, 'residence-bandeau', b.length + .2, .26, b.width + .2, 0, hBase + floor * floorHeight, 0, trim);
  }
  box(scene, root, 'residence-couronnement', b.length + .2, .26, b.width + .2, 0, hGutter - .14, 0, trim);
  const bayWidth = 1.2;
  for (let bay = 0; bay < 16; bay++) {
    const x = -b.length / 2 + (bay + .5) * b.length / 16;
    for (let floor = 0; floor < floors; floor++) {
      const y = hBase + floor * floorHeight + floorHeight * .55;
      for (const side of [-1, 1]) {
        box(scene, root, 'residence-frame', bayWidth + .16, 1.46, .05, x, y, side * (b.width / 2 + .03), trim);
        box(scene, root, 'residence-window', bayWidth, 1.3, .08, x, y, side * (b.width / 2 + .07), glass);
      }
    }
  }
  for (let entrance = 0; entrance < 3; entrance++) {
    const x = -b.length / 2 + b.length * (entrance + .5) / 3;
    box(scene, root, 'residence-porch-side', .7, 2.6, 1.5, x - 1.75, 1.3, -b.width / 2 - .75, cream);
    box(scene, root, 'residence-porch-side', .7, 2.6, 1.5, x + 1.75, 1.3, -b.width / 2 - .75, cream);
    box(scene, root, 'residence-door', 2.8, 2.25, .1, x, 1.28, -b.width / 2 - .08, glass);
    box(scene, root, 'residence-awning', 4.7, .22, 1.85, x, 2.71, -b.width / 2 - .93, roof);
  }
  const roofPositions = [
    -b.length / 2 - .55, hGutter, -b.width / 2 - .55,
    b.length / 2 + .55, hGutter, -b.width / 2 - .55,
    b.length / 2 + .55, hRidge, b.width / 2 + .55,
    -b.length / 2 - .55, hRidge, b.width / 2 + .55,
  ];
  const roofNormals: number[] = [];
  VertexData.ComputeNormals(roofPositions, [0, 1, 2, 0, 2, 3], roofNormals);
  const roofData = new VertexData(); roofData.positions = roofPositions; roofData.indices = [0, 1, 2, 0, 2, 3]; roofData.normals = roofNormals;
  const roofMesh = new Mesh('residence-monopente', scene); roofData.applyToMesh(roofMesh); roofMesh.material = roof; roofMesh.parent = root;
  box(scene, root, 'residence-sign-pole', .07, 4.2, .07, b.length / 2 - b.length / 16 * .9, 6.15, -b.width / 2 - .5, material(scene, 'residence-metal', '#6a6f70', .55));
  box(scene, root, 'residence-sign', .06, 3.4, .62, b.length / 2 - b.length / 16 * .9, 5.75, -b.width / 2 - .55, trim);
  return root;
}

function townShops(scene: Scene, terrain: TerrainLike): TransformNode {
  const b: Bounds = { cx: 47.4, cz: -12.5, length: 39.2, width: 11.2, angle: -1.303 };
  const root = new TransformNode('commerces-centre', scene);
  root.position.set(b.cx, lowestGround(terrain, b), b.cz);
  root.rotation.y = -b.angle;
  const wall = material(scene, 'shops-wall', '#d8cfbf', .92);
  const storefront = material(scene, 'shops-front', '#34444b', .72);
  const roof = material(scene, 'shops-roof', '#7f543d', .92);
  const glass = material(scene, 'shops-glass', '#1b303c', .27);
  box(scene, root, 'shops-corps', b.length, 6.35, b.width, 0, 3.18, 0, wall);
  const shopCount = Math.max(3, Math.round(b.length / 9));
  for (let shop = 0; shop < shopCount; shop++) {
    const x = -b.length / 2 + b.length / shopCount * (shop + .5);
    box(scene, root, 'shops-storefront', b.length / shopCount * .78, 2.42, .12, x, 1.35, b.width / 2 + .07, storefront);
  }
  const upperBays = Math.max(4, Math.round(b.length / 3.4));
  for (let bay = 0; bay < upperBays; bay++) {
    const x = -b.length / 2 + b.length / upperBays * (bay + .5);
    for (const side of [-1, 1]) box(scene, root, 'shops-shutter', .95, 1.35, .06, x, 4.65, side * (b.width / 2 + .04), glass);
  }
  gableRoof(scene, root, 'shops-roof', b.length + 1, b.width + 1, 6.3, 2.3, roof);
  box(scene, root, 'shops-central-front', Math.min(5.2, b.length * .16), 6.43, b.width + 1.1, 0, 3.215, 0, wall);
  return root;
}

function roundedCornerBuilding(scene: Scene, terrain: TerrainLike): TransformNode {
  const b: Bounds = { cx: 15.2, cz: 85.5, length: 21, width: 11, angle: -.15 };
  const root = new TransformNode('immeuble-angle-mairie', scene);
  root.position.set(b.cx, lowestGround(terrain, b), b.cz);
  root.rotation.y = b.angle;
  const wall = material(scene, 'corner-wall', '#d6cfc2', .92);
  const base = material(scene, 'corner-shop-base', '#53534f', .8);
  const slate = material(scene, 'corner-roof', '#4a4f56', .75);
  const shutters = material(scene, 'corner-shutters', '#f2efe6', .6);
  box(scene, root, 'corner-shop-base', b.length, 3.1, b.width, 0, 1.55, 0, base);
  box(scene, root, 'corner-upper-floor', b.length, 4.6, b.width, 0, 5.4, 0, wall);
  const radius = Math.min(b.width * .42, 3.2);
  const rounded = MeshBuilder.CreateCylinder('corner-rounded-end', { height: 7.7, diameter: radius * 2, tessellation: 14, arc: .5 }, scene);
  rounded.position.set(b.length / 2, 3.85, 0); rounded.rotation.y = Math.PI / 2;
  rounded.material = wall; rounded.parent = root;
  box(scene, root, 'corner-cornice', b.length + .5, .28, b.width + .5, 0, 7.84, 0, wall);
  box(scene, root, 'corner-roof', b.length + .8, .5, b.width + .8, 0, 8.23, 0, slate);
  for (let bay = 0; bay < 7; bay++) {
    const x = -b.length / 2 + (bay + .5) * b.length / 7;
    for (const side of [-1, 1]) {
      box(scene, root, 'corner-shutter', .42, 1.32, .05, x - .55, 5.35, side * (b.width / 2 + .03), shutters);
      box(scene, root, 'corner-shutter', .42, 1.32, .05, x + .55, 5.35, side * (b.width / 2 + .03), shutters);
    }
  }
  return root;
}

export function buildArtixLandmarks(
  scene: Scene,
  terrain: TerrainLike,
  map: CityMapData,
  shadow: ShadowGenerator | null,
): TransformNode {
  const group = new TransformNode('artix-real-landmarks', scene);
  const additions: TransformNode[] = [];
  for (const source of map.landmarkSources ?? []) {
    if (source.type === 'townhall') additions.push(townHall(scene, terrain, source));
    if (source.type === 'church') additions.push(church(scene, terrain, source));
  }
  additions.push(leclerc(scene, terrain), residence(scene, terrain), townShops(scene, terrain), roundedCornerBuilding(scene, terrain));
  for (const root of additions) {
    root.parent = group;
    for (const mesh of root.getChildMeshes(false)) {
      mesh.receiveShadows = true;
      if (!mesh.name.includes('sign') && !mesh.name.includes('window')) shadow?.addShadowCaster(mesh, false);
    }
  }
  group.position = Vector3.Zero();
  return group;
}

export function nearestArtixPlace(x: number, z: number): ArtixPlace | null {
  let best: ArtixPlace | null = null;
  let bestDistance = Infinity;
  for (const place of ARTIX_PLACES) {
    const distance = Math.hypot(place.x - x, place.z - z);
    if (distance <= place.radius && distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best;
}

export function filterLandmarkBuildings(buildings: CityMapData['buildings'], map: CityMapData): CityMapData['buildings'] {
  const exclusions: Array<{ x: number; z: number; radius: number }> = [
    { x: 57, z: -88.4, radius: 26 },
    { x: 47.4, z: -12.5, radius: 23 },
    { x: 15.2, z: 85.5, radius: 13 },
  ];
  for (const source of map.landmarkSources ?? []) {
    const b = orientedBounds(source.pts);
    exclusions.push({ x: b.cx, z: b.cz, radius: Math.max(b.length, b.width) / 2 + 3 });
  }
  for (const tower of map.chateauxEau ?? []) {
    exclusions.push({ x: tower.x, z: tower.z, radius: tower.rayon + 6 });
  }
  return buildings.filter((building) => {
    const b = orientedBounds(building.pts);
    return !exclusions.some((item) => Math.hypot(b.cx - item.x, b.cz - item.z) < item.radius);
  });
}
