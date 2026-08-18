// Construit la ville d'Artix en 3D à partir des données OSM et BD TOPO.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { couleurMur, couleurToit } from './bdtopo.js';
import { texturerEnduit, texturerTuile, texturerPave, texturerEcorce } from './textures.js';
import { TAILLE as TERRAIN_TAILLE, RESOLUTION as TERRAIN_RES } from './terrain.js';

// Altitude de la chaussée. Sert de référence commune au rendu, au maillage
// de collision et au calcul de la hauteur d'apparition du véhicule.
export const ROAD_Y = 0.25;

// Garde entre la chaussée et le terrain qui l'entoure. Le sol est interpolé sur
// une grille de 22 m et la route sommet par sommet : sans un écart franc, le
// terrain ressort au-dessus de l'asphalte entre deux nœuds de grille et l'herbe
// déborde sur la voie. 35 cm restent invisibles depuis une caméra de conduite.
export const GARDE_SOL = 0.35;

// Palette proche des matériaux réels du Béarn : enduit clair, tuile canal, ardoise.
const WALL_COLORS = [0xd8cfc0, 0xe2dacb, 0xcfc4b2, 0xd2c8ba, 0xe6dfd2, 0xc8bda9];
// Teintes réservées, indexées après WALL_COLORS : pierre pour les églises,
// bardage métallique pour les hangars et grandes surfaces.
const SPECIAL_WALLS = [0xb8ae9a, 0xa8adb2];
const ROOF_COLORS = [0x9c4a2f, 0xa85436, 0x8d4128, 0xb35c3a, 0x6b5a52, 0x8f4b33];

// Génère un bruit déterministe à partir d'une graine, pour que la ville soit
// identique à chaque lancement.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Triangule un polygone simple (oreilles). Suffisant pour des emprises OSM.
function triangulate(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const idx = [...Array(n).keys()];
  let signedArea = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    signedArea += (pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]);
  }
  if (signedArea > 0) idx.reverse();

  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length];
      const b = idx[i];
      const c = idx[(i + 1) % idx.length];
      const [ax, az] = pts[a], [bx, bz] = pts[b], [cx, cz] = pts[c];
      const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
      if (cross <= 0) continue; // pas convexe

      let contains = false;
      for (const p of idx) {
        if (p === a || p === b || p === c) continue;
        const [px, pz] = pts[p];
        const d1 = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
        const d2 = (cx - bx) * (pz - bz) - (cz - bz) * (px - bx);
        const d3 = (ax - cx) * (pz - cz) - (az - cz) * (px - cx);
        if (d1 >= 0 && d2 >= 0 && d3 >= 0) { contains = true; break; }
      }
      if (contains) continue;
      tris.push([a, b, c]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

// Transforme une polyligne (route) en ruban continu de triangles.
// Les bords sont calculés par bissectrice à chaque sommet : le ruban reste
// d'un seul tenant dans les virages, sans trou ni pastille de rattrapage.
// `relief` (optionnel) plaque le ruban sur le terrain : y devient alors une
// hauteur au-dessus du sol plutôt qu'une altitude absolue.
// `pont` (en mètres) surélève le tablier au-dessus du terrain, avec des rampes
// d'accès aux deux extrémités.
// Pas de densification des rubans, en mètres. Choisi sous le pas du terrain
// (12,5 m) pour que la chaussée soit toujours au moins aussi finement décrite
// que le sol qu'elle doit dominer.
const PAS_RUBAN = 6;

// Insère des sommets intermédiaires sur les segments trop longs, en conservant
// les sommets d'origine : la géométrie du tracé OSM reste exacte, seule sa
// description en altitude gagne en finesse.
function densifier(pts, pas) {
  const out = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const long = Math.hypot(x2 - x1, z2 - z1);
    // Borne de sécurité : un segment de 1 200 m ne doit pas engendrer des
    // milliers de sommets à lui seul.
    const n = Math.min(256, Math.ceil(long / pas));
    for (let k = 1; k < n; k++) {
      const u = k / n;
      out.push([x1 + (x2 - x1) * u, z1 + (z2 - z1) * u]);
    }
    out.push(pts[i + 1]);
  }
  return out;
}

function ribbon(pts, width, y, positions, uvs, normals, relief = null, pont = 0) {
  if (!pts || pts.length < 2 || !(width > 0)) return;

  // Nettoyage : on retire les points invalides et les doublons.
  const brut = [];
  for (const q of pts) {
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) continue;
    const last = brut[brut.length - 1];
    if (last && Math.hypot(q[0] - last[0], q[1] - last[1]) < 0.01) continue;
    brut.push(q);
  }
  if (brut.length < 2) return;

  // Densification : OSM ne pose un nœud qu'aux changements de direction, si
  // bien que 61 % des segments d'Artix dépassent le pas du terrain (12,5 m) et
  // que certains atteignent 1 200 m. Le ruban n'ayant de sommet qu'aux nœuds,
  // son altitude est interpolée en ligne droite entre deux extrémités pendant
  // que le sol, lui, continue d'onduler : sur une longue portée en travers
  // d'une croupe, le terrain traverse l'asphalte et l'herbe recouvre la voie.
  // On insère donc des sommets intermédiaires pour que la chaussée épouse le
  // relief à la même finesse que lui.
  const p = relief ? densifier(brut, PAS_RUBAN) : brut;

  const h = width / 2;
  const left = [], right = [], dists = [];
  let dist = 0;

  for (let i = 0; i < p.length; i++) {
    // Direction entrante et sortante du sommet.
    let dirInX = 0, dirInZ = 0, dirOutX = 0, dirOutZ = 0;
    if (i > 0) {
      const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      dirInX = (p[i][0] - p[i - 1][0]) / l;
      dirInZ = (p[i][1] - p[i - 1][1]) / l;
      dist += l;
    }
    if (i < p.length - 1) {
      const l = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      dirOutX = (p[i + 1][0] - p[i][0]) / l;
      dirOutZ = (p[i + 1][1] - p[i][1]) / l;
    }
    if (i === 0) { dirInX = dirOutX; dirInZ = dirOutZ; }
    if (i === p.length - 1) { dirOutX = dirInX; dirOutZ = dirInZ; }

    // Bissectrice des deux directions, puis sa normale.
    let bx = dirInX + dirOutX, bz = dirInZ + dirOutZ;
    const bl = Math.hypot(bx, bz);
    if (bl < 1e-6) { bx = dirInX; bz = dirInZ; }
    else { bx /= bl; bz /= bl; }

    // Facteur d'élargissement dans les virages serrés (miter), borné pour
    // éviter les pointes démesurées sur un angle aigu.
    const cosHalf = Math.max(0.35, dirInX * bx + dirInZ * bz);
    const ext = Math.min(h / cosHalf, h * 2.5);

    left.push([p[i][0] - bz * ext, p[i][1] + bx * ext]);
    right.push([p[i][0] + bz * ext, p[i][1] - bx * ext]);
    dists.push(dist);
  }

  // Altitude de chaque bord : sur terrain accidenté, la chaussée suit le sol.
  // La moyenne des deux bords garde la voie plane en travers, comme une vraie
  // route terrassée. L'altitude est prise sur le terrain NATUREL, avant le
  // creusement pratiqué sous les routes : sinon la chaussée suivrait ce
  // creusement et l'herbe reviendrait affleurer la voie.
  const solRoute = relief
    ? (bx, bz) => relief.hauteurRoute(bx, bz)
    : () => 0;
  const yl = [], yr = [];
  for (let i = 0; i < p.length; i++) {
    const a = relief
      ? (solRoute(left[i][0], left[i][1])
        + solRoute(right[i][0], right[i][1])
        + solRoute(p[i][0], p[i][1]) * 2) / 4 + y
      : y;
    yl.push(a); yr.push(a);
  }

  // Ouvrage d'art : le tablier s'élève au-dessus du terrain naturel. La montée
  // est progressive depuis les deux culées, sinon la voiture heurterait une
  // marche à l'entrée du pont.
  if (pont > 0) {
    // Longueur cumulée, pour répartir les rampes d'accès.
    const total = dists[dists.length - 1] || 1;
    const rampe = Math.min(total * 0.32, 14);
    for (let i = 0; i < p.length; i++) {
      const d = dists[i];
      // Facteur 0 aux extrémités, 1 au centre de l'ouvrage.
      const t = Math.min(d / rampe, (total - d) / rampe, 1);
      const lissage = t <= 0 ? 0 : (1 - Math.cos(Math.max(0, t) * Math.PI)) / 2;
      yl[i] += pont * lissage;
      yr[i] += pont * lissage;
    }
  }

  // Deux triangles par intervalle, sur toute la longueur de la polyligne.
  for (let i = 0; i < p.length - 1; i++) {
    const l0 = left[i], r0 = right[i], l1 = left[i + 1], r1 = right[i + 1];
    const a0 = yl[i], a1 = yl[i + 1];
    // UV en mètres divisés par une taille de motif fixe (4 m) : sur une route
    // de 200 m, un ratio basé sur la largeur ferait défiler la texture des
    // centaines de fois et la moyennerait en aplat sombre.
    const v0 = dists[i] / 4, v1 = dists[i + 1] / 4;
    positions.push(
      l0[0], a0, l0[1], r0[0], a0, r0[1], l1[0], a1, l1[1],
      r0[0], a0, r0[1], r1[0], a1, r1[1], l1[0], a1, l1[1],
    );
    uvs.push(0, v0, 1, v0, 0, v1, 1, v0, 1, v1, 0, v1);
    for (let k = 0; k < 6; k++) normals.push(0, 1, 0);
  }
}

function meshFromArrays(positions, uvs, normals, material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}

// Texture d'asphalte procédurale (granulométrie + usure), évite tout asset externe.
function asphaltTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  // Gris clair : la texture est multipliée par la couleur du matériau, puis
  // encore assombrie par le tone mapping. Un gris moyen finit quasi noir.
  ctx.fillStyle = '#c4c4ca';
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 30;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  // Traces de roulement plus sombres.
  ctx.fillStyle = 'rgba(40,40,44,0.16)';
  ctx.fillRect(size * 0.18, 0, size * 0.13, size);
  ctx.fillRect(size * 0.69, 0, size * 0.13, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  // Sans cet espace colorimétrique, Three.js traite la texture comme linéaire
  // et l'asphalte ressort presque noir à l'écran.
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function grassTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5c7a42';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const g = 60 + Math.random() * 60;
    ctx.fillStyle = `rgba(${g * 0.62},${g},${g * 0.42},0.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene, data) {
  const group = new THREE.Group();
  const collisionTris = []; // triangles envoyés au moteur physique
  const asphalt = asphaltTexture();
  // Grain de crépi, partagé par tous les bâtiments : une seule texture en
  // mémoire, répétée sur les UV déjà calculées à l'échelle du mètre.
  const enduit = texturerEnduit(256);
  enduit.repeat.set(1, 1);
  const tuile = texturerTuile(256);

  // ---- Sol général -------------------------------------------------------
  // Le plan est subdivisé : avec 4 sommets seulement, l'interpolation de
  // profondeur sur 6 km est si grossière que le sol passe devant la chaussée.
  // La subdivision reprend exactement la grille du terrain : un plan plus
  // grossier que le heightfield rebomberait entre deux nœuds terrassés et
  // ramènerait l'herbe par-dessus la chaussée que le terrassement venait de
  // dégager.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(TERRAIN_TAILLE, TERRAIN_TAILLE, TERRAIN_RES, TERRAIN_RES),
    new THREE.MeshStandardMaterial({ map: grassTexture(), color: 0x8fa86a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  // Écart franc sous la chaussée. Le sol est échantillonné sur une grille de
  // 22 m alors que la route l'est à chaque sommet de polyligne : entre deux
  // nœuds, un terrain trop proche remonte au-dessus de l'asphalte et l'herbe
  // déborde sur la voie.
  ground.position.y = ROAD_Y - GARDE_SOL;
  ground.receiveShadow = true;
  // Le sol reçoit les ombres mais n'en projette pas. Avec ses 165 888 triangles
  // il pesait à lui seul les trois quarts de la passe d'ombre, pour un résultat
  // invisible : un terrain ne projette sur lui-même que dans les fortes pentes,
  // et le volume d'ombre est resserré à 124 m autour du véhicule. Le drapeau est
  // posé ici car l'activation en masse de main.js retient tout maillage de plus
  // de 5 000 sommets, critère qui vise les bâtiments et attrapait le relief.
  ground.castShadow = false;
  ground.userData.noShadowCast = true;

  // Quand le relief est disponible, les sommets du plan sont déplacés en
  // hauteur : le sol épouse alors les altitudes réelles mesurées par l'IGN.
  const relief = data.terrain ?? null;
  if (relief) {
    const pos = ground.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Le plan est encore dans son repère local (X, Y), avant rotation :
      // son Y correspond donc à -Z dans le monde.
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, relief.hauteurEn(x, -y));
    }
    pos.needsUpdate = true;
    ground.geometry.computeVertexNormals();
  }
  group.add(ground);

  // ---- Zones (forêts, champs, parcs) ------------------------------------
  const zoneColors = {
    forest: 0x3c5a2e, grass: 0x6f8f4a, meadow: 0x7a9850, farmland: 0x9a8f52,
    residential: 0x8a8778, industrial: 0x8c8a86, cemetery: 0x6d8354,
    vineyard: 0x7d8a45, orchard: 0x6b8a45,
    park: 0x5f8a44, pitch: 0x4e7d3d, garden: 0x658c46, sports_centre: 0x5a8442,
  };
  // Les zones se posent juste au-dessus du sol, bien sous la chaussée : ce sont
  // des couvertures de terrain, elles ne doivent jamais mordre sur la voie.
  const ZONE_Y = ROAD_Y - GARDE_SOL + 0.03;
  const zonePos = {}; // par type
  for (const z of data.areas) {
    const tris = triangulate(z.pts);
    const arr = (zonePos[z.kind] ??= []);
    const altZ = (px, pz) => (relief ? relief.hauteurEn(px, pz) : 0) + ZONE_Y;
    for (const [a, b, c] of tris) {
      arr.push(z.pts[a][0], altZ(z.pts[a][0], z.pts[a][1]), z.pts[a][1]);
      arr.push(z.pts[b][0], altZ(z.pts[b][0], z.pts[b][1]), z.pts[b][1]);
      arr.push(z.pts[c][0], altZ(z.pts[c][0], z.pts[c][1]), z.pts[c][1]);
    }
  }
  for (const [kind, pos] of Object.entries(zonePos)) {
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: zoneColors[kind] ?? 0x6f8f4a, roughness: 1, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8,
    }));
    m.receiveShadow = true;
    m.renderOrder = -5;
    group.add(m);
  }

  // ---- Eau ---------------------------------------------------------------
  const waterPos = [];
  for (const w of data.water) {
    if (w.river) {
      const h = w.width / 2;
      for (let i = 0; i < w.pts.length - 1; i++) {
        const [x1, z1] = w.pts[i], [x2, z2] = w.pts[i + 1];
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
        if (len < 0.01) continue;
        const nx = (-dz / len) * h, nz = (dx / len) * h;
        waterPos.push(
          x1 + nx, 0.05, z1 + nz, x1 - nx, 0.05, z1 - nz, x2 + nx, 0.05, z2 + nz,
          x1 - nx, 0.05, z1 - nz, x2 - nx, 0.05, z2 - nz, x2 + nx, 0.05, z2 + nz,
        );
      }
    } else {
      for (const [a, b, c] of triangulate(w.pts)) {
        waterPos.push(w.pts[a][0], 0.05, w.pts[a][1]);
        waterPos.push(w.pts[b][0], 0.05, w.pts[b][1]);
        waterPos.push(w.pts[c][0], 0.05, w.pts[c][1]);
      }
    }
  }
  if (waterPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(waterPos, 3));
    g.computeVertexNormals();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x2f5f7a, roughness: 0.08, metalness: 0.6, side: THREE.DoubleSide,
      transparent: true, opacity: 0.88,
    })));
  }

  // ---- Routes ------------------------------------------------------------
  // Placettes pavées, relevées sur photographie de rue. OSM ne porte le tag
  // `surface=paving_stones` que sur deux cheminements piétons d'Artix, à plus
  // de 380 m du bourg : le pavage du carrefour de la mairie, pourtant la plus
  // grande surface pavée de la commune et traversée par toute la circulation,
  // n'y figure pas. Il est donc déclaré ici, par son emprise mesurée.
  const PLACETTES_PAVEES = [
    // Carrefour de la mairie, entre la pharmacie de la République et l'arrêt
    // de bus : large placette en pavés autour du mini-rond-point.
    { x: -1.3, z: 92.1, rayon: 26 },
  ];
  const estPavee = (x, z) => PLACETTES_PAVEES.some(
    (p) => Math.hypot(x - p.x, z - p.z) < p.rayon);

  const roadPos = [], roadUv = [], roadNrm = [];
  const pathPos = [], pathUv = [], pathNrm = [];
  const pavePos = [], paveUv = [], paveNrm = [];
  for (const r of data.roads) {
    // Le revêtement décide du maillage : le champ `surface` d'OSM était
    // transmis depuis le début mais n'avait jamais été lu au rendu, si bien
    // que pavés, béton et gravier ressortaient tous en enrobé.
    const paveeParTag = r.surface === 'paving_stones' || r.surface === 'sett'
      || r.surface === 'cobblestone';

    // Une avenue traverse le carrefour sans y avoir son milieu : tester le
    // point central de la polyligne ne retenait qu'une voie sur dix. On découpe
    // donc la voie segment par segment, et chaque segment part vers le maillage
    // correspondant à son revêtement. Les sommets partagés appartiennent aux
    // deux tronçons, sans quoi un trou s'ouvrirait à la limite du pavage.
    if (!paveeParTag && !r.bridge) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1];
        // Un segment compte comme pavé dès que l'une de ses extrémités tombe
        // dans l'emprise : mieux vaut un léger débordement qu'une placette
        // trouée là où les sommets OSM sont espacés.
        const pave = estPavee(a[0], a[1]) || estPavee(b[0], b[1]);
        if (pave) ribbon([a, b], r.width, ROAD_Y, pavePos, paveUv, paveNrm, relief);
        else if (r.drivable) ribbon([a, b], r.width, ROAD_Y, roadPos, roadUv, roadNrm, relief);
        else ribbon([a, b], r.width, ROAD_Y - 0.03, pathPos, pathUv, pathNrm, relief);
      }
      continue;
    }

    if (paveeParTag) {
      // Les pavés se posent au niveau de la chaussée : la placette EST la
      // chaussée sur ce carrefour, la voiture y roule.
      ribbon(r.pts, r.width, ROAD_Y, pavePos, paveUv, paveNrm, relief);
    } else if (r.drivable) {
      // Les ponts d'Artix franchissent des ruisseaux et des voies étroites :
      // un léger bombement du tablier suffit à les rendre lisibles, et la
      // voiture le franchit sans que le terrain ait besoin d'être creusé.
      ribbon(r.pts, r.width, ROAD_Y, roadPos, roadUv, roadNrm, relief,
        r.bridge ? 0.85 : 0);
    } else {
      ribbon(r.pts, r.width, ROAD_Y - 0.03, pathPos, pathUv, pathNrm, relief);
    }
  }
  // polygonOffset tire la chaussée vers la caméra dans le depth buffer : c'est
  // le remède standard au z-fighting entre surfaces quasi coplanaires, bien
  // plus fiable qu'un simple écart en Y sur une scène de plusieurs kilomètres.
  // DoubleSide : l'orientation des triangles dépend du sens de parcours de la
  // polyligne OSM, qui n'est pas garanti. Sans cela, une route sur deux
  // disparaît par backface culling.
  // Teinte calée sur photographie de rue. Sur un panoramique du centre-bourg,
  // la chaussée mesure 0,47 fois la clarté d'un volet blanc voisin ; le rendu
  // était à 0,95, soit un enrobé presque aussi clair qu'un mur peint. Les
  // rapports entre surfaces d'une même photo sont fiables même quand la mesure
  // absolue ne l'est pas, la prise de vue étant souvent à contre-jour.
  //
  // Ce calage n'avait jamais été vérifié à l'écran : mesuré sur capture, le
  // rendu tombait à 0,06 au lieu de 0,47, soit huit fois trop sombre. Deux
  // causes cumulées, l'albédo et l'éclairage. En linéaire, la texture (0,552)
  // multipliée par la couleur d'alors (0,270) donnait 0,149 quand la façade
  // atteint 0,744, soit un rapport d'albédo de 0,20 ; et une surface
  // horizontale ne reçoit que la composante basse de la lumière
  // hémisphérique, plus sombre que le ciel qui éclaire les murs.
  const roadMesh = meshFromArrays(roadPos, roadUv, roadNrm,
    new THREE.MeshStandardMaterial({
      map: asphalt, roughness: 0.92, color: 0xd0d0d6, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
    }));
  roadMesh.renderOrder = 2;

  // Placettes pavées. Teinte relevée sur photographie : à l'ombre, le pavé
  // mesure 0,36 fois la clarté de l'enrobé voisin, avec une dominante un peu
  // plus chaude. Rugosité plus forte que l'enrobé : un pavage ne luit pas.
  let paveMesh = null;
  if (pavePos.length) {
    const pave = texturerPave(256);
    // Un pavé fait environ 20 cm : la texture porte 6 pavés en largeur, donc
    // un motif de 1,2 m. Les UV sont en mètres divisés par 4 dans `ribbon`,
    // d'où cette répétition.
    pave.repeat.set(3.4, 3.4);
    paveMesh = meshFromArrays(pavePos, paveUv, paveNrm,
      new THREE.MeshStandardMaterial({
        map: pave, roughness: 0.97, color: 0x6d6459, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
      }));
    paveMesh.renderOrder = 2;
    group.add(paveMesh);
  }

  // ---- Aires de stationnement -------------------------------------------
  // Plus de 100 surfaces à Artix, 10 hectares d'enrobé au total : les parkings
  // du Leclerc, de la Place des Tilleuls et des commerces du bourg sont de
  // grandes étendues plates que l'on longe en roulant. Elles n'étaient pas
  // demandées à Overpass jusqu'ici, donc totalement absentes du rendu.
  const parkPos = [], parkUv = [], parkNrm = [];
  const margePos = [];
  // Places en épi déduites des aires OSM, transmises aux véhicules stationnés :
  // sans elles, les voitures de ces parkings viennent du stationnement de rue
  // et se rangent dans l'axe de la voie, en travers des places marquées.
  const placesEpi = [];
  for (const p of data.parkings ?? []) {
    let tris = triangulate(p.pts);
    // Repli en éventail depuis le centroïde. L'algorithme d'oreilles échoue sur
    // 52 des 127 aires d'Artix (17 700 m² perdus, soit un sixième du total) :
    // les emprises de parking OSM comportent des sommets colinéaires et des
    // angles rentrants qu'il ne sait pas découper. Un éventail donne une
    // triangulation moins propre mais couvre toute l'emprise, ce qui suffit
    // pour une surface plane vue du sol.
    if (!tris.length && p.pts.length >= 3) {
      tris = [];
      for (let i = 1; i < p.pts.length - 1; i++) tris.push([0, i, i + 1]);
    }
    // Juste sous la chaussée : un parking affleure la voie qui le dessert,
    // sans jamais passer au-dessus.
    const altP = (px, pz) => (relief ? relief.hauteurRoute(px, pz) : 0) + ROAD_Y - 0.02;
    for (const [a, b, c] of tris) {
      for (const k of [a, b, c]) {
        const [x, z] = p.pts[k];
        parkPos.push(x, altP(x, z), z);
        // UV en mètres : la texture d'enrobé garde la même granulométrie que
        // sur la chaussée, sinon le raccord se voit.
        parkUv.push(x / 4, z / 4);
        parkNrm.push(0, 1, 0);
      }
    }
  }
  // Marquage des places. Sans lui, un parking se lit comme une simple dalle
  // d'enrobé. On remplit chaque aire de bandes parallèles à son grand axe,
  // espacées de la largeur réglementaire d'une place.
  const LARG_PLACE = 2.5, LONG_PLACE = 5.0;
  for (const p of data.parkings ?? []) {
    if (p.station) continue;   // une station-service n'a pas de places marquées
    // Grand axe de l'aire, par analyse en composantes principales : les places
    // se rangent perpendiculairement à lui, comme sur un parking réel.
    let cx = 0, cz = 0;
    for (const [x, z] of p.pts) { cx += x; cz += z; }
    cx /= p.pts.length; cz /= p.pts.length;
    let sxx = 0, szz = 0, sxz = 0;
    for (const [x, z] of p.pts) {
      const dx = x - cx, dz = z - cz;
      sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
    }
    const th = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    const ux = Math.cos(th), uz = Math.sin(th);
    const vx = -uz, vz = ux;
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const [x, z] of p.pts) {
      const dx = x - cx, dz = z - cz;
      const u = dx * ux + dz * uz, v = dx * vx + dz * vz;
      uMin = Math.min(uMin, u); uMax = Math.max(uMax, u);
      vMin = Math.min(vMin, v); vMax = Math.max(vMax, v);
    }
    // Une aire trop étroite ne porte pas de rangée lisible.
    if (uMax - uMin < LONG_PLACE || vMax - vMin < LARG_PLACE * 2) continue;
    const altM = (px, pz) => (relief ? relief.hauteurRoute(px, pz) : 0) + ROAD_Y + 0.005;

    // Les places bordent les deux GRANDS côtés de l'aire, nez vers le bord, et
    // la voie de circulation passe entre les deux rangées. Une version
    // antérieure les cherchait aux deux bouts du grand axe : sur une emprise
    // oblique, `uMin` et `uMax` ne sont atteints qu'en un seul coin, si bien
    // que le test d'appartenance rejetait la totalité des traits. Le parking
    // de l'avenue Edmond Rostand (52 x 16 m) n'avait ainsi aucun marquage,
    // douze traits calculés et douze rejetés.
    //
    // Pour trouver le bord réel à une abscisse donnée, on balaie v depuis
    // chaque côté jusqu'à entrer dans l'emprise : une boîte englobante ne
    // suffit pas dès que l'aire n'est pas un rectangle aligné.
    const PAS_SONDE = 0.25;

    // Combien de rangées l'aire peut-elle porter ? Une rangée occupe la
    // profondeur d'une place, et il faut encore une voie de circulation pour
    // la desservir. En dessous de deux rangées plus une voie, l'aire n'en
    // porte qu'une seule, adossée à son bord le plus dégagé.
    //
    // Sans ce test, l'emprise de l'avenue Edmond Rostand (15,6 m de large, qui
    // englobe le parking ET sa voie de desserte) recevait des places sur ses
    // deux bords, dont l'un longe la barre de logements à 5,2 m : des places
    // apparaissaient sur la bande enherbée au pied de l'immeuble, où il n'y en
    // a aucune.
    const LARG_VOIE = 6.0;
    const largeurAire = vMax - vMin;
    const deuxRangees = largeurAire >= 2 * LONG_PLACE + LARG_VOIE;

    // Bord retenu quand une seule rangée tient : le plus éloigné du bâti, la
    // desserte se faisant par l'autre. À défaut de bâti connu à ce stade de la
    // construction (les repères modélisés à la main ne sont ajoutés qu'après),
    // on retient le bord le plus long, qui porte la rangée principale.
    let sensRetenu = 1;
    if (!deuxRangees) {
      const longueurBord = (sens) => {
        const vDep = sens > 0 ? vMin : vMax;
        let n = 0;
        for (let u = uMin; u <= uMax; u += LARG_PLACE) {
          for (let d = 0; d < largeurAire; d += PAS_SONDE) {
            const v = vDep + sens * d;
            if (pointInPoly(cx + ux * u + vx * v, cz + uz * u + vz * v, p.pts)) {
              // Le bord ne compte que s'il peut recevoir une place entière.
              const vi = v + sens * LONG_PLACE;
              if (pointInPoly(cx + ux * u + vx * vi, cz + uz * u + vz * vi, p.pts)) n++;
              break;
            }
          }
        }
        return n;
      };
      sensRetenu = longueurBord(1) >= longueurBord(-1) ? 1 : -1;
    }
    const sensActifs = deuxRangees ? [1, -1] : [sensRetenu];

    for (let u = uMin + LARG_PLACE; u < uMax - 0.5; u += LARG_PLACE) {
      for (const sens of sensActifs) {
        const vDepart = sens > 0 ? vMin : vMax;
        let vBord = null;
        for (let d = 0; d < vMax - vMin; d += PAS_SONDE) {
          const v = vDepart + sens * d;
          if (pointInPoly(cx + ux * u + vx * v, cz + uz * u + vz * v, p.pts)) {
            vBord = v;
            break;
          }
        }
        if (vBord === null) continue;
        // Le trait de séparation part du bord et s'enfonce d'une longueur de
        // place vers l'intérieur.
        const v0 = vBord, v1 = vBord + sens * LONG_PLACE;
        const ax = cx + ux * u + vx * v0, az = cz + uz * u + vz * v0;
        const bx = cx + ux * u + vx * v1, bz = cz + uz * u + vz * v1;
        if (!pointInPoly(bx, bz, p.pts)) continue;
        const nx = ux * 0.06, nz = uz * 0.06;
        margePos.push(
          ax - nx, altM(ax, az), az - nz, ax + nx, altM(ax, az), az + nz,
          bx - nx, altM(bx, bz), bz - nz,
          ax + nx, altM(ax, az), az + nz, bx + nx, altM(bx, bz), bz + nz,
          bx - nx, altM(bx, bz), bz - nz,
        );

        // Une place occupe l'intervalle entre ce trait et le suivant. Le
        // véhicule s'y range perpendiculairement au bord, capot vers
        // l'extérieur ou en marche arrière selon les habitudes.
        const uc = u + LARG_PLACE / 2;
        if (uc > uMax - 0.5) continue;
        const vc = vBord + sens * (LONG_PLACE / 2);
        const px2 = cx + ux * uc + vx * vc, pz2 = cz + uz * uc + vz * vc;
        if (!pointInPoly(px2, pz2, p.pts)) continue;
        const graine = Math.abs(px2 * 13.7 + pz2 * 29.3);
        // Une place sur deux environ reste libre : un parking plein comme un
        // parking vide se remarquent tous les deux comme artificiels.
        if (hash(graine) > 0.55) continue;
        placesEpi.push({
          x: px2, z: pz2,
          y: (relief ? relief.hauteurRoute(px2, pz2) : 0) + ROAD_Y,
          // La normale au bord donne l'axe du véhicule.
          cap: Math.atan2(-sens * vx, -sens * vz)
            + (hash(graine + 7.7) > 0.45 ? 0 : Math.PI),
          graine,
        });
      }
    }
  }
  if (margePos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(margePos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0xe8e4d8, roughness: 0.85, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
    }));
    m.renderOrder = 3;
    group.add(m);
  }

  if (parkPos.length) {
    const parkMesh = meshFromArrays(parkPos, parkUv, parkNrm,
      new THREE.MeshStandardMaterial({
        // Un peu plus clair que la chaussée : l'enrobé d'un parking est moins
        // circulé, donc moins noirci par la gomme et les hydrocarbures.
        map: asphalt, roughness: 0.94, color: 0x9a9a9f, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
      }));
    parkMesh.renderOrder = 1;
    parkMesh.receiveShadow = true;
    group.add(parkMesh);
  }

  // ---- Ouvrages d'art : tabliers et garde-corps -------------------------
  // Le tablier surélevé doit porter la voiture : il entre dans le maillage de
  // collision, contrairement aux routes ordinaires que le terrain porte déjà.
  const pontPos = [], pontUv = [], pontNrm = [];
  const gcPos = [];
  for (const r of data.roads) {
    if (!r.drivable || !r.bridge) continue;
    const h = 0.85;
    const avant = pontPos.length;
    ribbon(r.pts, r.width, ROAD_Y, pontPos, pontUv, pontNrm, relief, h);
    // Les triangles du tablier deviennent des obstacles solides.
    for (let i = avant; i < pontPos.length; i++) collisionTris.push(pontPos[i]);

    // Garde-corps : deux bandeaux continus le long des rives du tablier.
    // Sans eux, un pont ressemble à une bande d'asphalte flottante.
    const demi = r.width / 2;
    const hg = 0.95;
    let cumul = 0;
    const total = r.pts.reduce((s, q, i) => i
      ? s + Math.hypot(q[0] - r.pts[i - 1][0], q[1] - r.pts[i - 1][1]) : 0, 0);
    const rampe = Math.min(total * 0.32, 14);
    // Élévation du tablier en un point donné de la polyligne.
    const elev = (d) => {
      const t = Math.min(d / rampe, (total - d) / rampe, 1);
      return h * (t <= 0 ? 0 : (1 - Math.cos(Math.max(0, t) * Math.PI)) / 2);
    };

    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.3) continue;
      const nx = (-dz / len) * demi, nz = (dx / len) * demi;
      const y1 = (relief ? relief.hauteurRoute(x1, z1) : 0) + ROAD_Y + elev(cumul);
      const y2 = (relief ? relief.hauteurRoute(x2, z2) : 0) + ROAD_Y + elev(cumul + len);
      cumul += len;

      for (const s of [1, -1]) {
        const ax = x1 + nx * s, az = z1 + nz * s;
        const bx = x2 + nx * s, bz = z2 + nz * s;
        gcPos.push(
          ax, y1, az, bx, y2, bz, bx, y2 + hg, bz,
          ax, y1, az, bx, y2 + hg, bz, ax, y1 + hg, az,
        );
      }
    }
  }
  if (pontPos.length) {
    const m = meshFromArrays(pontPos, pontUv, pontNrm,
      new THREE.MeshStandardMaterial({
        map: asphalt, roughness: 0.9, color: 0xd0d0d4, side: THREE.DoubleSide,
      }));
    m.renderOrder = 3;
    group.add(m);
  }
  if (gcPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(gcPos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0xb8bcc0, roughness: 0.7, metalness: 0.35, side: THREE.DoubleSide,
    })));
  }
  group.add(roadMesh);
  // Les routes portent la voiture : elles vont au moteur physique.
  // La chaussée n'entre plus dans le maillage de collision : le sol plat la
  // porte à la même altitude, et un ruban surélevé de quelques centimètres
  // formerait une marche au bord de la route.

  if (pathPos.length) {
    const pathMesh = meshFromArrays(pathPos, pathUv, pathNrm,
      new THREE.MeshStandardMaterial({
        color: 0x9c8f78, roughness: 1, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
      }));
    pathMesh.renderOrder = 1;
    group.add(pathMesh);
  }

  // ---- Marquage au sol ---------------------------------------------------
  // Le marquage suit les règles réelles : ligne axiale discontinue sur les
  // bidirectionnelles, rives sur les axes larges, rien sur les sens uniques
  // étroits ni dans les ronds-points.
  const markPos = [], markUv = [], markNrm = [];
  const traceLigne = (a, b, largeur, hauteurPont) => {
    ribbon([a, b], largeur, ROAD_Y + 0.015, markPos, markUv, markNrm, relief, hauteurPont);
  };

  for (const r of data.roads) {
    if (!r.drivable) continue;
    // Un rond-point n'a pas d'axe : le marquage y serait absurde.
    if (r.rondPoint) continue;
    const hPont = r.bridge ? 3.2 + Math.max(0, r.layer ?? 0) * 1.4 : 0;
    // Un pont est trop court pour porter des rampes de marquage cohérentes :
    // on le laisse nu, comme souvent en réalité.
    if (hPont > 0) continue;

    // Ligne axiale : uniquement sur les voies bidirectionnelles assez larges.
    if (!r.oneway && r.width >= 6.2) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
        const len = Math.hypot(x2 - x1, z2 - z1);
        const steps = Math.max(1, Math.floor(len / 6));
        for (let s = 0; s < steps; s += 2) {
          const t0 = s / steps, t1 = Math.min(1, (s + 1) / steps);
          traceLigne(
            [x1 + (x2 - x1) * t0, z1 + (z2 - z1) * t0],
            [x1 + (x2 - x1) * t1, z1 + (z2 - z1) * t1],
            0.16, 0,
          );
        }
      }
    }

    // Lignes de rive continues sur les axes principaux : elles cadrent la
    // chaussée et donnent beaucoup de lisibilité en conduite.
    if (r.width >= 7.6) {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
        const dx = x2 - x1, dz = z2 - z1;
        const len = Math.hypot(dx, dz);
        if (len < 0.5) continue;
        const nx = (-dz / len) * (r.width / 2 - 0.42);
        const nz = (dx / len) * (r.width / 2 - 0.42);
        for (const s of [1, -1]) {
          traceLigne(
            [x1 + nx * s, z1 + nz * s],
            [x2 + nx * s, z2 + nz * s],
            0.13, 0,
          );
        }
      }
    }
  }
  if (markPos.length) {
    const markMesh = meshFromArrays(markPos, markUv, markNrm,
      new THREE.MeshBasicMaterial({
        color: 0xe8e4d8, side: THREE.DoubleSide,
        polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
      }));
    markMesh.renderOrder = 3;
    group.add(markMesh);
  }

  // ---- Bâtiments ---------------------------------------------------------
  // Deux maillages fusionnés (murs, toitures) avec couleur par sommet : la
  // teinte vient du matériau réel de chaque bâtiment (BD TOPO), il n'est donc
  // plus possible de regrouper par palette fixe.
  const wallPos2 = [], wallCol = [], wallUv = [];
  const roofPos = [], roofCol = [], roofUv = [];
  // Fenêtres : petits quads sombres plaqués sur les façades. C'est ce qui
  // distingue le plus nettement un bâtiment d'un simple bloc coloré.
  const winPos = [];
  // Encadrement des baies, en maillage séparé : un dormant clair autour d'une
  // vitre sombre est ce qui rend une fenêtre lisible de loin, bien plus que la
  // teinte du vitrage lui-même.
  const cadrePos = [];

  // Niveau d'assise des bâtiments, relatif au terrain.
  const BASE_OFFSET = ROAD_Y - 0.04;
  const teinte = new THREE.Color();

  data.buildings.forEach((b, bi) => {
    const n = b.pts.length;
    if (n < 3) return;

    // Assise réelle : altitude mesurée du sol quand elle existe, sinon le
    // terrain interpolé sous le centre de l'emprise. Sans cela, les maisons
    // d'un coteau flotteraient ou seraient enterrées.
    // Centroïde de l'emprise, calculé une fois : il sert à l'assise, à
    // l'orientation des normales de façade et à la toiture.
    let ctrX = 0, ctrZ = 0;
    for (const [px, pz] of b.pts) { ctrX += px; ctrZ += pz; }
    ctrX /= n; ctrZ /= n;

    let assise = BASE_OFFSET;
    if (relief) {
      if (b.zSol != null && data.altRef != null) {
        assise = b.zSol - data.altRef + BASE_OFFSET;
      } else {
        assise = relief.hauteurRoute(ctrX, ctrZ) + BASE_OFFSET;
      }
    }
    const BASE_Y = assise;
    // La BD TOPO donne une hauteur mesurée jusqu'au faîtage. On en retranche
    // la couverture pour obtenir l'égout, à partir duquel les pans sont
    // reconstruits : sinon la toiture s'ajouterait par-dessus la hauteur réelle.
    const hTotal = b.hauteur ?? b.height;
    const surface = b.surface ?? b.footprint ?? 0;
    // Hauteur de couverture. Le LiDAR la mesure directement : gouttière et
    // faîtage sont relevés sur le même toit, donc leur écart ne mélange pas la
    // déclivité du sol, contrairement aux altitudes extrêmes de la BD TOPO.
    const toitLidar = b.toiture ?? null;
    // Bornée à 6 m : au-delà, le relevé a capté une superstructure (silo,
    // cheminée, machinerie) et non la couverture. Aucune toiture d'Artix ne
    // dépasse cette hauteur, clochers mis à part, qui sont modélisés séparément.
    const couvLidar = toitLidar && toitLidar.t !== 0 && toitLidar.f != null
      ? Math.min(6, toitLidar.f - toitLidar.g) : null;
    let couverture = couvLidar != null
      ? Math.min(couvLidar, hTotal * 0.55)
      : b.penteToit != null && b.penteToit > 0.3
        ? Math.min(b.penteToit, hTotal * 0.42) : hTotal * 0.24;
    // Le mur doit garder une hauteur habitable. Sans cette borne, la couverture
    // mangeait tout : 1 177 bâtiments sur 2 119 se retrouvaient au plancher de
    // 2,2 m, dont un hangar de 9,8 m à qui le relevé attribuait 11,5 m de
    // toiture. Un mur trop bas ne peut plus recevoir de fenêtre, et c'est ce
    // qui laissait 69 % du bâti en façades entièrement aveugles.
    //
    // 2,5 m sous plafond est le minimum d'une pièce d'habitation : on rend à la
    // façade ce que la couverture lui prenait au-delà.
    const H_MUR_MIN = 2.5;
    if (hTotal - couverture < H_MUR_MIN) {
      couverture = Math.max(0.4, hTotal - H_MUR_MIN);
    }
    // Une couverture ne dépasse pas 40 % de la hauteur d'une maison. Le relevé
    // LiDAR attribuait 2,2 m de toiture à un pavillon de 4,7 m, d'où des
    // pyramides écrasantes sur tout le lotissement : la gouttière mesurée est
    // souvent celle d'un débord ou d'un auvent, pas celle du corps principal.
    // Les grands volumes agricoles gardent leur relevé, une halle pouvant
    // effectivement être plus toiture que mur.
    if (surface < 400) couverture = Math.min(couverture, hTotal * 0.4);
    const h = Math.max(2.2, hTotal - couverture);
    const top = BASE_Y + h;   // altitude de l'égout de toiture

    // Teinte de façade : matériau réel quand il est connu (pierre, brique,
    // aggloméré enduit, béton, bois), enduit clair par défaut.
    teinte.setHex(couleurMur(b));
    const wr = teinte.r, wg = teinte.g, wb = teinte.b;

    // Murs
    for (let i = 0; i < n; i++) {
      const [x1, z1] = b.pts[i];
      const [x2, z2] = b.pts[(i + 1) % n];
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.01) continue;
      // Normale de la façade, orientée vers l'EXTÉRIEUR. Le sens dépend de
      // l'ordre des sommets du contour, qui n'est pas garanti d'un bâtiment à
      // l'autre dans les données : sur ceux tracés en sens horaire, la normale
      // pointait vers le centre et le décalage de 4 cm enfonçait fenêtres et
      // dormants DANS le mur, où ils étaient masqués. C'est ce qui laissait des
      // façades entièrement aveugles alors que les baies étaient bien
      // générées, bien placées et bien dimensionnées.
      let nx = dz / len, nz = -dx / len;
      // Test au milieu du segment : si la normale se rapproche du centroïde,
      // elle regarde vers l'intérieur.
      if (nx * (ctrX - (x1 + x2) / 2) + nz * (ctrZ - (z1 + z2) / 2) > 0) {
        nx = -nx; nz = -nz;
      }

      // Les murs partent du niveau du sol, pas de y = 0 : le terrain affleure
      // désormais la chaussée et les bâtiments seraient enfoncés d'autant.
      wallPos2.push(x1, BASE_Y, z1, x2, BASE_Y, z2, x2, top, z2);
      wallPos2.push(x1, BASE_Y, z1, x2, top, z2, x1, top, z1);
      for (let k = 0; k < 6; k++) wallCol.push(wr, wg, wb);
      wallUv.push(0, 0, len / 3, 0, len / 3, h / 3, 0, 0, len / 3, h / 3, 0, h / 3);

      // Mur = obstacle solide.
      collisionTris.push(x1, BASE_Y, z1, x2, BASE_Y, z2, x2, top, z2);
      collisionTris.push(x1, BASE_Y, z1, x2, top, z2, x1, top, z1);

      // --- Fenêtres sur cette façade ---
      // Le nombre de niveaux vient de la BD TOPO quand il est renseigné,
      // sinon il se déduit de la hauteur (2,9 m par étage).
      // Seuil abaissé à 2,4 m de mur : une maison de plain-pied béarnaise a
      // 2,5 m sous plafond, et l'exiger à 2,8 privait d'ouverture les deux
      // tiers du bâti. L'allège et la hauteur de baie s'adaptent aux façades
      // basses, sinon la fenêtre dépasse l'égout et se voit rejetée.
      if (!b.leger && len > 3.2 && h > 2.4) {
        // Le nombre de niveaux est borné par ce que le mur peut contenir : la
        // BD TOPO compte parfois les combles comme un étage, et empiler 3
        // niveaux sur 2,5 m de mur donnait des fenêtres tous les 83 cm, toutes
        // rejetées ensuite pour dépassement de l'égout.
        const niveauxPossibles = Math.max(1, Math.floor(h / 2.4));
        const niveaux = Math.max(1, Math.min(6, niveauxPossibles,
          b.etages ?? Math.round(h / 2.9)));
        const parNiveau = Math.max(1, Math.min(6, Math.floor(len / 3.1)));
        const hNiveau = h / niveaux;
        // Sur un niveau bas, la baie est plus courte et son allège descend :
        // c'est la proportion réelle d'une fenêtre de dépendance.
        const hauteurF = Math.min(1.12, hNiveau * 0.42);
        const allege = Math.min(1.0, hNiveau * 0.32);
        const largeur = 0.86;
        // Léger décalage vers l'extérieur pour éviter le z-fighting.
        const ox = nx * 0.04, oz = nz * 0.04;

        for (let e = 0; e < niveaux; e++) {
          // Allège proportionnelle à la hauteur du niveau, plafonnée à 1 m.
          const yb = BASE_Y + allege + e * hNiveau;
          const yh = yb + hauteurF;
          // Marge sous l'égout resserrée : 35 cm sur un mur de 2,5 m suffisait
          // à tout rejeter.
          if (yh > top - 0.2) continue;
          for (let k = 0; k < parNiveau; k++) {
            const t = (k + 0.5) / parNiveau;
            const cxw = x1 + dx * t, czw = z1 + dz * t;
            const ux = (dx / len) * (largeur / 2), uz = (dz / len) * (largeur / 2);
            winPos.push(
              cxw - ux + ox, yb, czw - uz + oz,
              cxw + ux + ox, yb, czw + uz + oz,
              cxw + ux + ox, yh, czw + uz + oz,
              cxw - ux + ox, yb, czw - uz + oz,
              cxw + ux + ox, yh, czw + uz + oz,
              cxw - ux + ox, yh, czw - uz + oz,
            );
            // Dormant : un quadrilatère un peu plus large et plus haut, posé
            // légèrement en retrait de la vitre.
            const MARGE = 0.11;
            const vx2 = (dx / len) * (largeur / 2 + MARGE);
            const vz2 = (dz / len) * (largeur / 2 + MARGE);
            const yb2 = yb - MARGE, yh2 = yh + MARGE;
            const ox2 = nx * 0.025, oz2 = nz * 0.025;
            cadrePos.push(
              cxw - vx2 + ox2, yb2, czw - vz2 + oz2,
              cxw + vx2 + ox2, yb2, czw + vz2 + oz2,
              cxw + vx2 + ox2, yh2, czw + vz2 + oz2,
              cxw - vx2 + ox2, yb2, czw - vz2 + oz2,
              cxw + vx2 + ox2, yh2, czw + vz2 + oz2,
              cxw - vx2 + ox2, yh2, czw - vz2 + oz2,
            );
          }
        }
      }
    }

    // Toiture à deux pans en tuile canal, faîtage dans le sens de la longueur :
    // c'est la couverture des maisons béarnaises. Une pyramide vers le centroïde
    // donnerait à chaque bâtiment le même toit à quatre pans.
    // Couverture : matériau réel issu des fichiers fonciers (tuile, ardoise,
    // zinc, béton), à défaut bac acier sur les grands volumes et tuile ailleurs.
    const rc = new THREE.Color(couleurToit(b));
    let cx = 0, cz = 0;
    for (const [px, pz] of b.pts) { cx += px; cz += pz; }
    cx /= n; cz /= n;

    // Orientation du faîtage. Le relevé LiDAR HD, quand il couvre le bâtiment,
    // donne la direction mesurée sur la couverture réelle. À défaut, on la
    // déduit de l'emprise par analyse en composantes principales : le faîtage
    // suit le grand axe, ce qui est le cas sur 94 % des bâtiments d'Artix
    // d'après la comparaison avec le LiDAR.
    const lidar = b.toiture ?? null;
    let theta;
    if (lidar && lidar.t === 2) {
      theta = lidar.c;
    } else {
      let sxx = 0, szz = 0, sxz = 0;
      for (const [px, pz] of b.pts) {
        const dx = px - cx, dz = pz - cz;
        sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
      }
      theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    }
    const ax = Math.cos(theta), az = Math.sin(theta);   // grand axe (faîtage)
    const px2 = -az, pz2 = ax;                          // axe transversal (pente)

    // Étendue du bâtiment sur chaque axe.
    let longMin = Infinity, longMax = -Infinity, larMax = 0;
    for (const [qx, qz] of b.pts) {
      const dx = qx - cx, dz = qz - cz;
      const along = dx * ax + dz * az;
      longMin = Math.min(longMin, along);
      longMax = Math.max(longMax, along);
      larMax = Math.max(larMax, Math.abs(dx * px2 + dz * pz2));
    }

    // Pente de toiture. La BD TOPO donne l'écart entre l'altitude minimale et
    // maximale du toit, c'est-à-dire la hauteur réelle de la couverture.
    // À défaut, on estime : couverture quasi plate sur les grands volumes,
    // pente marquée sur l'habitat.
    // Le LiDAR mesure directement l'écart entre gouttière et faîtage, ce qui
    // est exactement la hauteur de couverture recherchée. Contrairement à la
    // BD TOPO, cet écart ne mélange pas la déclivité du sol : les deux points
    // sont relevés sur le même toit.
    const platte = lidar
      ? lidar.t === 0
      : surface > 700 || b.nature === 'Industriel, agricole ou commercial'
        || b.usage === 'supermarket' || b.kind === 'industrial' || b.kind === 'warehouse';
    // La pente BD TOPO est bornée : sur un terrain en pente, l'écart entre
    // altitude minimale et maximale du toit intègre la déclivité du sol et
    // produirait des toits en pointe.
    const penteMax = platte ? 0.9 : Math.min(2.2, larMax * 0.62);
    let pente;
    if (couvLidar != null) {
      // Mesure LiDAR, plafonnée par la largeur du bâtiment. Une couverture ne
      // dépasse pas en hauteur ce que sa portée permet : au-delà, c'est que le
      // relevé a capté autre chose que le toit (silo, cheminée, machinerie sur
      // un hangar industriel), et l'appliquer produirait une arête géante
      // traversant la scène.
      const plafond = Math.min(platte ? 1.4 : 4.5, larMax * 0.55);
      pente = Math.min(plafond, Math.max(0.5, couverture));
    } else if (platte) {
      pente = Math.min(0.6, Math.max(0.25, couverture));
    } else {
      pente = Math.min(penteMax, Math.max(0.5, couverture));
    }
    const faitageY = top + pente;
    // Débord de toiture, très marqué sur les maisons du Sud-Ouest.
    const debord = 0.4;

    // Deux points de faîtage, aux extrémités du grand axe. Leur retrait décide
    // de la forme : faible, le faîtage court jusqu'aux pignons (toit à deux
    // pans) ; marqué, les extrémités s'inclinent (croupe). Le LiDAR tranche par
    // bâtiment ; sans lui, un retrait moyen convient aux deux cas.
    //
    // Le retrait est corrigé par le remplissage de l'emprise, c'est-à-dire la
    // part du rectangle englobant réellement bâtie. À Artix, 90 % des emprises
    // sont découpées (bâtiments en L, en U, corps accolés) : sur celles-là, un
    // faîtage courant d'un bout à l'autre relie des sommets très éloignés et
    // fait éclater la toiture en éventail. Un faîtage plus court, ramené vers
    // le centre, produit un volume cohérent.
    const rectangle = (longMax - longMin) * larMax * 2;
    const remplissage = rectangle > 0
      ? Math.min(1, surface / rectangle) : 1;
    // 1 sur une emprise rectangulaire, jusqu'à 0.45 sur une emprise très
    // découpée : le faîtage se raccourcit d'autant.
    const compacite = Math.max(0.45, Math.min(1, (remplissage - 0.3) / 0.5));
    const retraitBase = lidar
      ? (lidar.t === 2 ? larMax * 0.1 : larMax * 0.5)
      : larMax * 0.35;
    const demiLong = (longMax - longMin) / 2;
    const retrait = Math.min(
      demiLong * 0.85,
      retraitBase + demiLong * (1 - compacite) * 0.8,
    );
    const f1x = cx + ax * (longMin + retrait), f1z = cz + az * (longMin + retrait);
    const f2x = cx + ax * (longMax - retrait), f2z = cz + az * (longMax - retrait);

    for (let i = 0; i < n; i++) {
      const [x1, z1] = b.pts[i];
      const [x2, z2] = b.pts[(i + 1) % n];
      // Chaque arête de mur est débordée vers l'extérieur, puis reliée au
      // segment de faîtage le plus proche.
      const e1x = x1 + (x1 - cx) / (Math.hypot(x1 - cx, z1 - cz) || 1) * debord;
      const e1z = z1 + (z1 - cz) / (Math.hypot(x1 - cx, z1 - cz) || 1) * debord;
      const e2x = x2 + (x2 - cx) / (Math.hypot(x2 - cx, z2 - cz) || 1) * debord;
      const e2z = z2 + (z2 - cz) / (Math.hypot(x2 - cx, z2 - cz) || 1) * debord;

      // Le sommet du faîtage retenu est celui dont la projection est la plus
      // proche du milieu de l'arête : c'est ce qui crée les deux pans.
      const mx = (x1 + x2) / 2 - cx, mz = (z1 + z2) / 2 - cz;
      const along = mx * ax + mz * az;
      const fx = along < 0 ? f1x : f2x, fz = along < 0 ? f1z : f2z;

      roofPos.push(e1x, top, e1z, e2x, top, e2z, fx, faitageY, fz);
      for (let k = 0; k < 3; k++) roofCol.push(rc.r, rc.g, rc.b);
      // UV projetées sur les axes du toit : les rangs de tuiles courent
      // parallèlement au faîtage, comme sur une couverture réelle. Une
      // projection sur les axes du monde les ferait tourner d'un bâtiment à
      // l'autre, ce qui se remarque immédiatement vu d'en haut.
      for (const [ux, uz] of [[e1x, e1z], [e2x, e2z], [fx, fz]]) {
        const dx = ux - cx, dz = uz - cz;
        roofUv.push((dx * ax + dz * az) / 1.4, (dx * px2 + dz * pz2) / 1.4);
      }
    }

    // Panneau de faîtage reliant les deux sommets : ferme la toiture entre
    // les croupes des deux extrémités.
    roofPos.push(f1x, faitageY, f1z, f2x, faitageY, f2z, cx, faitageY, cz);
    for (let k = 0; k < 3; k++) roofCol.push(rc.r, rc.g, rc.b);
    for (const [ux, uz] of [[f1x, f1z], [f2x, f2z], [cx, cz]]) {
      const dx = ux - cx, dz = uz - cz;
      roofUv.push((dx * ax + dz * az) / 1.4, (dx * px2 + dz * pz2) / 1.4);
    }
  });

  if (wallPos2.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wallPos2, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    // Normales recalculées depuis la géométrie : celles déduites de l'ordre des
    // sommets ne sont pas fiables, le sens de parcours des emprises variant.
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // DoubleSide : sans cela, la moitié des murs seraient éclairés de
    // l'intérieur et disparaîtraient par backface culling.
    // Grain de crépi par-dessus la teinte de chaque bâtiment. La texture est
    // en niveaux de gris et se multiplie avec la couleur par sommet : les
    // teintes relevées sur les photographies sont conservées, le grain ne fait
    // que les moduler. Sans lui, une façade est un aplat parfaitement lisse,
    // ce qui est le défaut le plus visible en conduite.
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.86, side: THREE.DoubleSide,
      map: enduit, bumpMap: enduit, bumpScale: 0.35,
    }));
    // Pas de castShadow : la passe d'ombre redessinerait les 3 500 bâtiments
    // à chaque frame, pour un gain visuel marginal en vue de conduite.
    m.receiveShadow = true;
    group.add(m);
  }

  if (winPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(winPos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // Vitrage sombre légèrement réfléchissant : de loin, ce sont ces trouées
    // régulières qui donnent l'échelle et le caractère habité des façades.
    //
    // `metalness` ramené de 0,35 à 0,08. En PBR, un matériau métallique n'a pas
    // de couleur diffuse et ne restitue que ce qu'il réfléchit : la carte
    // d'environnement de la scène étant un simple dégradé, le vitrage sortait
    // presque noir mat et se confondait avec l'ombre propre du mur. Les
    // fenêtres étaient bien générées et bien placées, mais indiscernables sur
    // un enduit clair en plein jour. Même piège que la carrosserie de la
    // voiture, déclarée `metallicFactor = 1` dans son glTF.
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x38414d, roughness: 0.28, metalness: 0.08, side: THREE.DoubleSide,
    }));
    m.renderOrder = 1;
    group.add(m);
  }

  if (cadrePos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cadrePos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // Dormant blanc cassé, comme les menuiseries relevées sur les photos de
    // rue d'Artix. Rendu sous la vitre, d'où un `renderOrder` inférieur.
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0xece9e2, roughness: 0.7, side: THREE.DoubleSide,
    }));
    m.renderOrder = 0;
    group.add(m);
  }

  if (roofPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(roofCol, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(roofUv, 2));
    // Les pans sont inclinés : les normales doivent être déduites de la
    // géométrie, sinon tous les toits reçoivent la lumière comme s'ils étaient plats.
    g.computeVertexNormals();
    g.computeBoundingSphere();
    // Le rythme des rangs de tuiles est ce qui identifie une couverture du
    // Sud-Ouest, et il porte loin : c'est visible sur toute la ligne de toits.
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, side: THREE.DoubleSide,
      map: tuile, bumpMap: tuile, bumpScale: 0.5,
    }));
    m.receiveShadow = true;
    group.add(m);
  }

  // ---- Voies ferrées -----------------------------------------------------
  const railPos = [], railUv = [], railNrm = [];
  for (const r of data.rails) ribbon(r.pts, 3.2, ROAD_Y + 0.02, railPos, railUv, railNrm, relief);
  if (railPos.length) {
    group.add(meshFromArrays(railPos, railUv, railNrm,
      new THREE.MeshStandardMaterial({ color: 0x554b40, roughness: 1, side: THREE.DoubleSide })));
  }

  // ---- Terrains de sport -------------------------------------------------
  // Artix en compte 27 : football, tennis, basket, handball, athlétisme,
  // pétanque, skatepark. Leur revêtement est bien plus caractéristique qu'une
  // pelouse générique, et ce sont des repères visuels dans le bourg.
  const REVETEMENTS = {
    soccer:     0x4a7d3a,   // gazon de football, vert soutenu
    tennis:     0x9c5a3c,   // terre battue ocre
    basketball: 0x7a5a48,   // enrobé teinté
    handball:   0x5a6f8c,   // résine bleutée
    multi:      0x5a6f8c,   // plateau multisports
    athletics:  0xa8503c,   // piste en résine rouge
    boules:     0xb5a88c,   // stabilisé clair
    skateboard: 0x8a8a8e,   // béton lissé
    volleyball: 0xa8703c,
    defaut:     0x6f8f4a,
  };
  const terrainPos = [], terrainCol = [];
  const teinteT = new THREE.Color();
  // Bordures de boulodrome : les jeux de pétanque sont toujours ceinturés de
  // planches ou de madriers qui retiennent le stabilisé et arrêtent les boules.
  // Sans elles, l'aire se lit comme un simple carré de gravier.
  const bordPos = [];
  for (const t of data.terrains ?? []) {
    const couleur = REVETEMENTS[t.sport] ?? REVETEMENTS.defaut;
    teinteT.setHex(couleur);
    // Légèrement au-dessus du terrain naturel, sous la chaussée.
    const altT = (px, pz) => (relief ? relief.hauteurRoute(px, pz) : 0) + ROAD_Y - 0.12;
    for (const [a, b, c] of triangulate(t.pts)) {
      for (const idx of [a, b, c]) {
        terrainPos.push(t.pts[idx][0], altT(t.pts[idx][0], t.pts[idx][1]), t.pts[idx][1]);
        terrainCol.push(teinteT.r, teinteT.g, teinteT.b);
      }
    }

    if (t.sport === 'boules') {
      const H = 0.22;   // hauteur du madrier au-dessus du stabilisé
      const n = t.pts.length;
      for (let i = 0; i < n; i++) {
        const [x1, z1] = t.pts[i];
        const [x2, z2] = t.pts[(i + 1) % n];
        const y1 = altT(x1, z1), y2 = altT(x2, z2);
        // Face verticale de la planche, visible depuis l'extérieur.
        bordPos.push(x1, y1, z1, x2, y2, z2, x2, y2 + H, z2);
        bordPos.push(x1, y1, z1, x2, y2 + H, z2, x1, y1 + H, z1);
      }
    }
  }
  if (terrainPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(terrainPos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(terrainCol, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    m.renderOrder = 1;
    m.receiveShadow = true;
    group.add(m);
  }
  if (bordPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bordPos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x6b5540, roughness: 1, side: THREE.DoubleSide,
    })));
  }

  // ---- Haies, murets et clôtures ----------------------------------------
  // Ces limites de parcelles structurent le paysage d'un lotissement bien plus
  // que les bâtiments seuls : sans elles, les maisons flottent sur une pelouse.
  const hedgePos = [], hedgeCol = [], wallPos = [];
  const hedgeColor = new THREE.Color(0x3f6b32);
  const hedgeColor2 = new THREE.Color(0x4c7a3a);

  // Une barrière longeant une route est souvent tracée à un mètre de l'axe :
  // la poser telle quelle barrerait la chaussée. On écarte tout segment qui
  // empiète sur une voie carrossable.
  const segmentsRoute = [];
  for (const r of data.roads) {
    if (!r.drivable) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      segmentsRoute.push({
        x1: r.pts[i][0], z1: r.pts[i][1],
        x2: r.pts[i + 1][0], z2: r.pts[i + 1][1],
        demi: r.width / 2 + 0.8,
      });
    }
  }
  const surChaussee = (x, z) => segmentsRoute.some((s) => {
    if (Math.abs(s.x1 - x) > 60 && Math.abs(s.z1 - z) > 60) return false;
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    const l2 = dx * dx + dz * dz;
    if (l2 < 1e-6) return false;
    let t = ((x - s.x1) * dx + (z - s.z1) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ddx = x - (s.x1 + dx * t), ddz = z - (s.z1 + dz * t);
    return ddx * ddx + ddz * ddz < s.demi * s.demi;
  });

  for (const b of data.barriers ?? []) {
    if (b.kind === 'tree_row') continue; // traité avec la végétation
    const solide = b.kind === 'wall';
    const demi = solide ? 0.16 : b.kind === 'hedge' ? 0.45 : 0.06;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const [x1, z1] = b.pts[i], [x2, z2] = b.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 0.3 || len > 120) continue;
      // Milieu du segment testé : suffisant pour écarter les barrières qui
      // traversent une route.
      if (surChaussee((x1 + x2) / 2, (z1 + z2) / 2)) continue;
      const nx = (-dz / len) * demi, nz = (dx / len) * demi;
      const h = b.height;
      const cible = solide ? wallPos : hedgePos;
      // Base posée sur le terrain : une haie de coteau doit suivre la pente.
      const yb1 = (relief ? relief.hauteurRoute(x1, z1) : 0) + ROAD_Y;
      const yb2 = (relief ? relief.hauteurRoute(x2, z2) : 0) + ROAD_Y;

      // Deux flancs et un dessus : suffisant vu depuis la route.
      for (const s of [1, -1]) {
        cible.push(
          x1 + nx * s, yb1, z1 + nz * s, x2 + nx * s, yb2, z2 + nz * s, x2 + nx * s, yb2 + h, z2 + nz * s,
          x1 + nx * s, yb1, z1 + nz * s, x2 + nx * s, yb2 + h, z2 + nz * s, x1 + nx * s, yb1 + h, z1 + nz * s,
        );
      }
      cible.push(
        x1 + nx, yb1 + h, z1 + nz, x2 + nx, yb2 + h, z2 + nz, x2 - nx, yb2 + h, z2 - nz,
        x1 + nx, yb1 + h, z1 + nz, x2 - nx, yb2 + h, z2 - nz, x1 - nx, yb1 + h, z1 - nz,
      );

      if (!solide) {
        // Feuillage nuancé : deux verts alternés selon la position.
        const c = (Math.abs(Math.round(x1) + Math.round(z1)) % 2) ? hedgeColor : hedgeColor2;
        for (let k = 0; k < 18; k++) hedgeCol.push(c.r, c.g, c.b);
      }
    }
  }
  if (hedgePos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(hedgePos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(hedgeCol, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, side: THREE.DoubleSide, flatShading: true,
    })));
  }
  if (wallPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0xbfb5a4, roughness: 0.95, side: THREE.DoubleSide,
    })));
  }

  // ---- Végétation : arbres le long des routes et dans les zones boisées --
  const trees = plantTrees(data, relief);
  if (trees) group.add(trees);

  // ---- Lampadaires sur les axes principaux ------------------------------
  const lamps = placeLamps(data, relief);
  if (lamps) group.add(lamps);

  scene.add(group);
  return {
    group,
    collisionTris: new Float32Array(collisionTris),
    // Foyers lumineux, pour l'éclairage public nocturne.
    foyers: lamps?.userData.foyers ?? [],
    lampHeads: lamps?.userData.lampHeads ?? null,
    // Places en épi des aires OSM, pour y garer des véhicules bien orientés.
    placesEpi,
    // Maillages instanciés éligibles au découpage spatial, avec la position de
    // chaque instance.
    instances: trees?.userData.instances ?? null,
  };
}

function plantTrees(data, relief = null) {
  const positions = [];

  // Alignements d'arbres réellement cartographiés : plus fidèles que les
  // plantations aléatoires le long des routes.
  for (const b of data.barriers ?? []) {
    if (b.kind !== 'tree_row') continue;
    for (let i = 0; i < b.pts.length - 1; i++) {
      const [x1, z1] = b.pts[i], [x2, z2] = b.pts[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.max(1, Math.floor(len / 9));
      for (let k = 0; k <= n; k++) {
        const t = k / (n || 1);
        const seed = Math.abs(x1 * 17 + z1 * 31 + k);
        positions.push([x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 5 + hash(seed) * 3.5]);
      }
    }
  }
  // Dans les forêts
  for (const z of data.areas) {
    if (z.kind !== 'forest' && z.kind !== 'park' && z.kind !== 'orchard') continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, zz] of z.pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, zz); maxZ = Math.max(maxZ, zz);
    }
    // Maillage lâche : au pas de 15 m, une grande forêt génère des dizaines de
    // milliers d'arbres et effondre le framerate.
    const step = z.kind === 'orchard' ? 26 : 32;
    for (let x = minX; x < maxX; x += step) {
      for (let zz = minZ; zz < maxZ; zz += step) {
        if (!pointInPoly(x, zz, z.pts)) continue;
        const seed = Math.abs(x * 31 + zz * 17);
        positions.push([x + (hash(seed) - 0.5) * 8, zz + (hash(seed + 5) - 0.5) * 8, 4 + hash(seed + 9) * 5]);
      }
    }
  }
  // Arbres cartographiés un par un dans OSM : 415 à Artix, à leur position
  // réelle. Ils remplacent avantageusement les plantations aléatoires le long
  // des routes, qui tombaient parfois en plein champ ou sur un trottoir.
  const arbresReels = new Set();
  for (const a of data.poi?.arbres ?? []) {
    // Hauteur : renseignée quand elle existe, sinon tirée d'une plage plausible
    // pour un arbre d'alignement de bourg.
    const seed = Math.abs(a.x * 13 + a.z * 7);
    const h = a.hauteur ?? (a.feuillu ? 7 + hash(seed) * 5 : 9 + hash(seed) * 6);
    positions.push([a.x, a.z, h, true]);   // true = arbre réel, jamais écarté
    // Mémorisé pour éviter de replanter un arbre inventé au même endroit.
    arbresReels.add(`${Math.round(a.x / 12)},${Math.round(a.z / 12)}`);
  }

  // Alignements le long des routes secondaires, uniquement là où aucun arbre
  // réel n'est cartographié : ils comblent les axes non relevés sans doubler
  // les plantations existantes.
  for (const r of data.roads) {
    if (!r.drivable || r.width < 6.5) continue;
    for (let i = 0; i < r.pts.length - 1; i += 3) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 12) continue;
      const nx = -dz / len, nz = dx / len;
      const off = r.width / 2 + 3.5;
      const seed = Math.abs(x1 * 13 + z1 * 7);
      if (hash(seed) > 0.55) {
        const px = x1 + nx * off, pz = z1 + nz * off;
        if (arbresReels.has(`${Math.round(px / 12)},${Math.round(pz / 12)}`)) continue;
        positions.push([px, pz, 5 + hash(seed + 3) * 3]);
      }
    }
  }
  if (!positions.length) return null;

  // Plafond de sécurité. Les arbres réellement cartographiés (4e champ à true)
  // sont conservés en priorité absolue : ce sont eux qui donnent à la ville sa
  // physionomie exacte. Le reste est trié par proximité du bourg.
  const MAX_TREES = 3500;
  if (positions.length > MAX_TREES) {
    positions.sort((a, b) => {
      if (a[3] !== b[3]) return a[3] ? -1 : 1;
      return (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2);
    });
    positions.length = MAX_TREES;
  }

  const group = new THREE.Group();
  // Fût peu conique : les platanes d'alignement, régulièrement recépés, ont un
  // tronc presque cylindrique jusqu'à la couronne.
  // Le fût est un cylindre de hauteur 1 et de rayon 1 : l'instanciation lui
  // donne sa hauteur ET son rayon réels, ce qui permet de faire varier
  // l'épaisseur avec la taille de l'arbre. Un rayon fixe donnait le même
  // diamètre à un sujet de 4 m et à un platane de 9 m, soit un élancement de
  // 37 pour 1 sur les grands, quand un platane réel tient entre 12 et 18.
  // Deux segments en hauteur : le pied s'évase en contrefort, le reste du fût
  // reste presque droit. 8 côtés au lieu de 6, l'arête hexagonale se lisant
  // franchement sur les troncs de premier plan.
  const trunkGeo = new THREE.CylinderGeometry(0.78, 1, 1, 8, 2);
  {
    // Renflement du pied : on écarte les sommets du premier quart de hauteur.
    // Un tronc adulte n'attaque jamais le sol en cylindre net, il s'épate.
    const p = trunkGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > -0.34) continue;
      // t vaut 0 au quart de la hauteur, 1 au ras du sol.
      const t = (-0.34 - y) / 0.16;
      const k = 1 + t * t * 0.42;
      p.setX(i, p.getX(i) * k);
      p.setZ(i, p.getZ(i) * k);
    }
    trunkGeo.computeVertexNormals();
  }
  // Couronne en trois lobes décalés plutôt qu'un icosaèdre unique. Le sujet
  // isolé ne présente jamais une boule régulière : la lumière accroche des
  // masses de feuillage séparées par des creux, et c'est ce découpage qui se
  // lit de loin, bien avant le détail des feuilles.
  // Un seul icosaèdre par arbre donnait une silhouette lisible en fond de plan
  // mais franchement géométrique dès qu'on l'approchait.
  // Géométrie unitaire : l'instanciation lui donne rayon et aplatissement.
  const leafGeo = (() => {
    // Subdivision 1 : 80 faces contre 20, assez pour que le lobe cesse de se
    // lire comme un polyèdre sans faire exploser le compte de triangles à
    // 3 500 exemplaires.
    const lobes = [
      { p: [0, 0.12, 0], r: 0.82 },
      { p: [0.42, -0.16, -0.26], r: 0.62 },
      { p: [-0.38, -0.10, 0.34], r: 0.58 },
    ].map(({ p, r }) => {
      const g = new THREE.IcosahedronGeometry(r, 1);
      // Déformation par sommet : un lobe strictement sphérique reste trop
      // régulier. On tire chaque sommet le long de sa normale d'un bruit
      // stable, ce qui creuse la surface sans coûter de géométrie.
      const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i);
        const k = 1 + (hash(x * 12.9 + y * 78.2 + z * 37.7) - 0.5) * 0.34;
        a.setXYZ(i, x * k, y * k, z * k);
      }
      g.translate(p[0], p[1], p[2]);
      return g;
    });
    const g = mergeGeometries(lobes);
    g.computeVertexNormals();
    return g;
  })();

  // Charpente : les branches qui relient le fût au houppier. Sans elles la
  // couronne flotte au-dessus du tronc, défaut visible sur tout sujet de
  // premier plan. Géométrie unitaire séparée, instanciée avec le matériau
  // d'écorce, montée sur la même transformation que le fût.
  // Chaque branche est un tronc de cône incliné partant du sommet du fût.
  const branchGeo = (() => {
    const parts = [];
    const N = 5;
    for (let i = 0; i < N; i++) {
      // Angles irréguliers : une charpente régulière trahit la génération.
      const a = (i / N) * Math.PI * 2 + hash(i * 4.7) * 0.9;
      const incl = 0.62 + hash(i * 9.3) * 0.30;   // écartement depuis l'axe
      const lon = 0.72 + hash(i * 2.1) * 0.34;    // longueur de la branche
      // Branche effilée : forte à l'insertion, fine à l'extrémité.
      const g = new THREE.CylinderGeometry(0.055, 0.16, lon, 5, 1, true);
      // Le cylindre est centré : on le remonte pour que sa base soit à 0.
      g.translate(0, lon / 2, 0);
      // Inclinaison puis rotation autour de l'axe du tronc.
      g.rotateZ(incl);
      g.rotateY(a);
      parts.push(g);
    }
    const g = mergeGeometries(parts);
    g.computeVertexNormals();
    return g;
  })();
  // Couleur blanche : la teinte vient de la couleur d'instance de chaque
  // arbre, que le matériau multiplie. Un brun ici les assombrirait toutes.
  const ecorce = texturerEcorce();
  // Répétition serrée autour du tronc, lâche en hauteur : c'est ce qui garde
  // les cannelures verticales. Répéter en Y les recouperait en tronçons.
  ecorce.repeat.set(3, 1);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: ecorce, bumpMap: ecorce, bumpScale: 0.6, roughness: 1,
  });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f6b30, roughness: 1, flatShading: true });

  // Cyprès du centre-bourg. Les photographies de rue en montrent plusieurs
  // autour du carrefour de la mairie : une silhouette conique sombre et
  // élancée, très différente des feuillus ronds plantés partout ailleurs.
  // Aucune donnée ne distingue l'espèce d'un arbre à Artix, leur emprise est
  // donc relevée à la vue.
  const CYPRES = [
    { x: 34, z: 78, h: 9.5 }, { x: 37, z: 83, h: 8.2 },
    { x: 40, z: 88, h: 10.1 }, { x: 30, z: 96, h: 8.8 },
  ];
  if (CYPRES.length) {
    // Cône unique instancié : à la distance où on les voit en roulant, la
    // silhouette suffit, et trois cônes emboîtés par arbre coûteraient le
    // triple pour un gain invisible.
    const cypGeo = new THREE.ConeGeometry(1, 1, 7);
    const cypMat = new THREE.MeshStandardMaterial({
      color: 0x24422a, roughness: 1, flatShading: true,
    });
    const cypres = new THREE.InstancedMesh(cypGeo, cypMat, CYPRES.length);
    const m = new THREE.Matrix4();
    CYPRES.forEach((c, i) => {
      const sol = (relief ? relief.hauteurRoute(c.x, c.z) : 0) + ROAD_Y;
      // Le cône est centré sur son axe : on le remonte d'une demi-hauteur.
      m.makeScale(c.h * 0.16, c.h, c.h * 0.16);
      m.setPosition(c.x, sol + c.h / 2, c.z);
      cypres.setMatrixAt(i, m);
    });
    cypres.instanceMatrix.needsUpdate = true;
    cypres.castShadow = false;
    cypres.receiveShadow = true;
    group.add(cypres);
  }

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const branches = new THREE.InstancedMesh(branchGeo, trunkMat, positions.length);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, positions.length);
  // Les branches partagent le matériau d'écorce, donc la couleur d'instance du
  // tronc leur est recopiée : une charpente d'une autre teinte que son fût se
  // repère immédiatement.
  branches.castShadow = false;
  // Pas d'ombre portée sur les feuillages : quelques milliers d'instances dans
  // la passe d'ombre coûtent bien plus qu'elles n'apportent visuellement.
  leaves.castShadow = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const AXE_Y = new THREE.Vector3(0, 1, 0);

  positions.forEach(([x, z, h, aligne], i) => {
    // Pied posé sur le terrain : sans cela les arbres d'un coteau flottent.
    const sol = relief ? relief.hauteurRoute(x, z) : 0;
    // Les arbres d'alignement d'Artix sont des platanes taillés en tête de
    // chat : tronc dégagé haut et couronne large et aplatie, très différente
    // du houppier arrondi d'un sujet libre. Le fût occupe donc une plus grande
    // part de la hauteur, et la couronne s'étale.
    // Le fût monte du sol jusqu'au bas de la couronne, sans la traverser.
    // Le fût monte jusqu'à l'insertion de la charpente, pas plus haut. À 0,86
    // il ressortait au-dessus du feuillage comme un mât de parasol, la
    // couronne étant centrée plus haut et fortement aplatie.
    const hautFut = h * (aligne ? 0.62 : 0.55);
    // Rayon proportionnel à la hauteur : l'élancement d'un platane adulte
    // tourne autour de 15 pour 1 (hauteur totale sur diamètre). Le sujet
    // d'alignement, régulièrement recépé, porte un fût un peu plus fort que
    // l'arbre libre de même taille. Une variation par arbre évite l'alignement
    // de perches strictement identiques.
    const rTronc = h * (aligne ? 0.040 : 0.034) * (0.82 + hash(i * 5.1) * 0.4);
    m.compose(new THREE.Vector3(x, sol + hautFut / 2, z), q,
      new THREE.Vector3(rTronc, hautFut, rTronc));
    trunks.setMatrixAt(i, m);
    // Écorce : le gris-vert clair du platane côtoie le brun sombre des
    // feuillus de bord de route. Sans cette variation les 3 500 troncs
    // ressortent d'un brun uniforme qui trahit l'instanciation.
    // Clartés basses : un tronc est une surface sombre, même en plein soleil.
    // La texture d'écorce éclaircit déjà l'ensemble en la multipliant, une
    // clarté élevée ici donnait des fûts plus clairs que les façades la nuit.
    // Mesuré sur capture : le platane clair ressortait à 0,67 de la clarté
    // d'une façade en enduit blanc, là où une écorce (réflectance 0,15 contre
    // 0,75 pour l'enduit) doit tomber vers 0,25. Ramené en conséquence.
    const e = hash(i * 8.3);
    if (e > 0.62) col.setHSL(0.11, 0.05 + e * 0.04, 0.13 + e * 0.04);
    else col.setHSL(0.08, 0.18 + e * 0.10, 0.09 + e * 0.05);
    trunks.setColorAt(i, col);
    branches.setColorAt(i, col);
    const r = h * (aligne ? 0.42 : 0.34);
    // Charpente greffée au sommet du fût, à l'échelle de la couronne qu'elle
    // porte : les branches doivent mordre dans le feuillage, sinon le raccord
    // se voit autant qu'avant. Une rotation propre à chaque arbre évite que
    // toute une allée présente la même charpente.
    const echB = r * 0.92;
    q.setFromAxisAngle(AXE_Y, hash(i * 6.7) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, sol + hautFut * 0.94, z), q,
      new THREE.Vector3(echB, echB, echB));
    branches.setMatrixAt(i, m);
    q.identity();
    // Aplatissement : 0,55 donne la couronne en plateau de la taille en
    // têtard, 0,95 le houppier presque sphérique d'un arbre libre.
    const aplat = aligne ? 0.62 : 0.95;
    // Centre de couronne abaissé : à 1,02 de la hauteur, le houppier coiffait
    // le fût sans le rejoindre. Il doit envelopper le haut de la charpente,
    // les branches ressortant en périphérie et non par-dessus.
    // Rotation propre à chaque arbre : les trois lobes étant décalés, une
    // orientation commune rendrait le motif répétitif immédiatement lisible.
    q.setFromAxisAngle(AXE_Y, hash(i * 1.9) * Math.PI * 2);
    m.compose(new THREE.Vector3(x, sol + h * (aligne ? 0.84 : 0.76), z), q,
      new THREE.Vector3(r, r * aplat, r));
    leaves.setMatrixAt(i, m);
    q.identity();
    // Palette de feuillages calée sur les photographies du bourg : les grands
    // conifères d'ornement (cèdres bleus) y côtoient les feuillus, avec des
    // verts nettement plus clairs et plus gris que le vert foncé uniforme.
    const t = hash(i * 3.7);
    if (t > 0.82) {
      // Conifère bleuté : le cèdre du carrefour est un repère du bourg.
      col.setHSL(0.34, 0.14 + t * 0.08, 0.44 + t * 0.10);
    } else if (t > 0.55) {
      // Feuillu clair, feuillage d'alignement.
      col.setHSL(0.24 + t * 0.03, 0.32 + t * 0.10, 0.34 + t * 0.08);
    } else {
      // Feuillu dense, vert soutenu.
      col.setHSL(0.26 + t * 0.04, 0.36 + t * 0.14, 0.25 + t * 0.09);
    }
    leaves.setColorAt(i, col);
  });
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  // Les couleurs par instance ne remontent au GPU que si leur buffer est
  // explicitement invalidé après le remplissage.
  if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
  if (branches.instanceColor) branches.instanceColor.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  group.add(trunks, branches, leaves);
  // Exposé pour le découpage spatial : les trois maillages partagent le même
  // ordre d'instances et doivent être réordonnés ensemble, sinon le feuillage
  // d'un arbre se retrouverait sur le fût d'un autre.
  group.userData.instances = {
    meshes: [trunks, branches, leaves],
    positions: positions.map(([x, z]) => [x, z]),
  };
  return group;
}

function placeLamps(data, relief = null) {
  const spots = [];
  const reels = new Set();

  // Lampadaires réellement cartographiés : 20 à Artix, à leur emplacement
  // exact. Ils sont placés en premier et jamais écartés par le plafond.
  for (const l of data.poi?.lampadaires ?? []) {
    spots.push([l.x, l.z, true]);
    reels.add(`${Math.round(l.x / 10)},${Math.round(l.z / 10)}`);
  }

  // Complément le long des axes du bourg : OSM ne référence que 20 mâts alors
  // que la commune en compte des centaines. On densifie là où l'éclairage
  // public existe réellement, c'est-à-dire sur les voies principales et dans
  // les rues habitées, jamais sur les chemins agricoles.
  for (const r of data.roads) {
    if (!r.drivable) continue;
    // Critère d'éclairage : voie assez large ou rue de lotissement nommée,
    // et située dans le tissu urbain.
    const enAgglo = Math.hypot(r.pts[0][0], r.pts[0][1]) < 900;
    const eclairee = enAgglo && (r.width >= 6 || (r.name && r.width >= 4.5));
    if (!eclairee) continue;

    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
      const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
      if (len < 20) continue;
      const nx = -dz / len, nz = dx / len;
      const off = r.width / 2 + 1;
      // Un mât tous les 30 m environ, cote courante en agglomération.
      const n = Math.max(1, Math.floor(len / 30));
      for (let k = 0; k <= n; k++) {
        const t = n ? k / n : 0.5;
        const px = x1 + dx * t + nx * off;
        const pz = z1 + dz * t + nz * off;
        // Pas de doublon avec un lampadaire réel déjà placé.
        if (reels.has(`${Math.round(px / 10)},${Math.round(pz / 10)}`)) continue;
        spots.push([px, pz, false]);
      }
    }
  }
  if (!spots.length) return null;

  const MAX_LAMPS = 1200;
  if (spots.length > MAX_LAMPS) {
    // Les mâts réels passent en tête, le reste est trié par proximité du bourg.
    spots.sort((a, b) => {
      if (a[2] !== b[2]) return a[2] ? -1 : 1;
      return (a[0] ** 2 + a[1] ** 2) - (b[0] ** 2 + b[1] ** 2);
    });
    spots.length = MAX_LAMPS;
  }

  const g = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 7, 5);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x50555a, roughness: 0.6, metalness: 0.4 });
  const headGeo = new THREE.BoxGeometry(0.7, 0.16, 0.32);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffe9b0, emissive: 0xffce70, emissiveIntensity: 1.4,
  });

  const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);

  // Emplacements des foyers lumineux, transmis au moteur d'éclairage nocturne.
  const foyers = [];

  spots.forEach(([x, z], i) => {
    const sol = relief ? relief.hauteurRoute(x, z) : 0;
    m.compose(new THREE.Vector3(x, sol + 3.5, z), q, s);
    poles.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(x, sol + 7, z), q, s);
    heads.setMatrixAt(i, m);
    // Le foyer est à la hauteur de la lanterne : c'est de là que part la
    // lumière projetée sur la chaussée.
    foyers.push({ x, y: sol + 6.9, z });
  });
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  g.add(poles, heads);
  g.userData.lampHeads = headMat;
  g.userData.foyers = foyers;
  return g;
}

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
