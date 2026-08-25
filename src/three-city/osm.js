// Conversion des données OpenStreetMap d'Artix (64170) en géométrie exploitable.
// Projection Mercator locale : à cette latitude, l'erreur est négligeable sur 4 km.

export const ORIGIN = { lat: 43.39743, lon: -0.57224 }; // centre-bourg d'Artix
const R = 6378137;

// GPS -> mètres, repère local centré sur le bourg. x = est, z = sud (repère Three.js).
export function project(lat, lon) {
  const x = (lon - ORIGIN.lon) * (Math.PI / 180) * R * Math.cos(ORIGIN.lat * Math.PI / 180);
  const z = -(lat - ORIGIN.lat) * (Math.PI / 180) * R;
  return [x, z];
}

// Largeur de chaussée réaliste par type de voie OSM.
const ROAD_WIDTH = {
  motorway: 14, trunk: 12, primary: 10, secondary: 8.5, tertiary: 7.5,
  unclassified: 6, residential: 6, living_street: 5.5, service: 4.5,
  motorway_link: 7, trunk_link: 7, primary_link: 6.5, secondary_link: 6, tertiary_link: 5.5,
  track: 3.5, pedestrian: 4, footway: 2, path: 1.8, cycleway: 2.5, steps: 1.8,
};

// Voies carrossables : seules celles-ci portent la voiture.
const DRIVABLE = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified',
  'residential', 'living_street', 'service', 'track',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);

// Hauteur d'étage moyenne pour l'extrusion des bâtiments.
const LEVEL_HEIGHT = 3.1;

// Hauteur d'un bâtiment. À Artix, 3 465 emprises sur 3 481 sont taggées
// `building=yes` sans hauteur ni étages : leur donner une valeur unique
// produirait une ville de blocs identiques. On déduit donc le gabarit de
// l'emprise au sol, qui distingue nettement pavillon, hangar et bâtiment public.
function buildingHeight(tags, footprint, seed = 0) {
  const h = parseFloat(tags['height'] ?? tags['building:height']);
  if (Number.isFinite(h)) return Math.max(2.5, h);
  const lv = parseFloat(tags['building:levels'] ?? tags['levels']);
  if (Number.isFinite(lv)) return Math.max(2.5, lv * LEVEL_HEIGHT + 1);

  // L'usage prime : à Artix, l'Intermarché, la mairie ou la gendarmerie sont
  // taggés `building=yes` et seul amenity/shop révèle leur nature.
  const usage = tags.amenity ?? tags.shop;
  switch (usage) {
    case 'place_of_worship': return 16;
    case 'townhall': return 11;
    case 'police': case 'fire_station': return 8.5;
    case 'school': case 'kindergarten': case 'college': return 9;
    case 'supermarket': case 'department_store': return 8;
    case 'fast_food': case 'restaurant': case 'cafe': return 5.2;
    case 'post_office': case 'bank': case 'pharmacy': return 6.5;
  }

  const type = tags.building;
  switch (type) {
    case 'church': case 'cathedral': return 17;
    case 'industrial': case 'warehouse': case 'factory': return 9.5;
    case 'commercial': case 'retail': case 'supermarket': return 7.5;
    case 'school': case 'public': case 'civic': case 'hospital': return 10;
    case 'apartments': return 13;
    case 'garage': case 'garages': case 'shed': case 'hut': return 2.8;
    case 'farm_auxiliary': case 'barn': return 6.5;
  }

  // Variation déterministe (±12 %) : deux maisons voisines de même taille
  // n'ont jamais exactement le même faîtage.
  const jitter = 0.88 + (Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.24;
  const a = footprint;
  if (a < 22) return 2.6 * jitter;    // abri de jardin, garage isolé
  if (a < 55) return 3.4 * jitter;    // dépendance, garage double
  if (a < 110) return 5.9 * jitter;   // pavillon de plain-pied, le cas courant
  if (a < 200) return 7.1 * jitter;   // maison R+1
  if (a < 420) return 8.4 * jitter;   // grande maison, petit collectif
  if (a < 900) return 8.0 * jitter;   // hangar agricole : large mais bas
  return 9.6 * jitter;                // bâtiment industriel ou commercial
}

// Aire d'un polygone (formule du lacet), sert à filtrer les micro-surfaces.
function area(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
  }
  return Math.abs(a / 2);
}

function isClosed(pts) {
  if (pts.length < 4) return false;
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1];
  return Math.hypot(ax - bx, az - bz) < 0.5;
}

// Rayon de jeu autour du bourg. Overpass renvoie les ways entiers dès qu'ils
// touchent la zone demandée : sans découpe, une seule nationale peut étendre
// la carte sur 17 km et diluer la géométrie utile.
const MAX_RADIUS = 3000;

// Découpe une polyligne en tronçons contenus dans le rayon de jeu.
function clipToRadius(pts) {
  const parts = [];
  let current = [];
  for (const p of pts) {
    if (Math.hypot(p[0], p[1]) <= MAX_RADIUS) {
      current.push(p);
    } else if (current.length) {
      // On garde le point sortant pour que la route file proprement hors champ.
      current.push(p);
      parts.push(current);
      current = [];
    }
  }
  if (current.length) parts.push(current);
  return parts.filter((s) => s.length >= 2);
}

export function parseOSM(raw) {
  const roads = [], buildings = [], areas = [], rails = [], water = [], barriers = [];
  const chateauxEau = [];
  const landmarkSources = [];
  const terrains = [];
  const parkings = [];        // aires de stationnement de surface

  for (const el of raw.elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const tags = el.tags || {};
    const pts = el.geometry.map((g) => project(g.lat, g.lon));

    // Tout ce qui est entièrement hors zone est écarté d'emblée.
    if (pts.every((p) => Math.hypot(p[0], p[1]) > MAX_RADIUS)) continue;

    if (tags.highway) {
      const kind = tags.highway;
      const drivable = DRIVABLE.has(kind) && tags.access !== 'private' && tags.access !== 'no';
      const oneway = tags.oneway === 'yes';
      const rondPoint = tags.junction === 'roundabout' || tags.junction === 'circular';

      // Largeur : le nombre de voies réel prime sur le type de voie. Une rue
      // à sens unique d'une seule voie est nettement plus étroite qu'une
      // bidirectionnelle, et ce contraste se sent au volant.
      const voies = parseInt(tags.lanes) || null;
      let width = ROAD_WIDTH[kind] ?? 5;
      if (voies) {
        // 3,2 m par voie plus les accotements : cote courante en agglomération.
        width = Math.max(3.4, voies * 3.2 + (oneway ? 0.6 : 1.0));
      } else if (oneway) {
        width *= 0.62;   // sens unique non renseigné : voie unique
      }
      // Les ronds-points sont des anneaux à voie unique, toujours étroits.
      if (rondPoint) width = Math.min(width, 6.4);

      // Une nationale traversant le département est ramenée à ses tronçons utiles.
      for (const seg of clipToRadius(pts)) {
        roads.push({
          pts: seg, width, kind, drivable,
          surface: tags.surface ?? (drivable ? 'asphalt' : 'ground'),
          name: tags.name ?? null,
          maxspeed: parseInt(tags.maxspeed) || (kind === 'motorway' ? 130 : kind === 'primary' ? 80 : 50),
          bridge: tags.bridge === 'yes',
          // Niveau d'ouvrage : un pont de layer 1 passe au-dessus du terrain.
          layer: parseInt(tags.layer) || 0,
          // Sous-type de cheminement : distingue trottoir et passage piéton.
          footway: tags.footway ?? null,
          oneway, rondPoint, voies,
        });
      }
      continue;
    }

    // Château d'eau : silhouette trop caractéristique pour être traitée comme
    // un bâtiment ordinaire extrudé. On garde son emprise et sa hauteur pour
    // le modéliser à part.
    if (tags.man_made === 'water_tower') {
      if (!isClosed(pts)) continue;
      const anneau = pts.slice(0, -1);
      let cx = 0, cz = 0;
      for (const [px, pz] of anneau) { cx += px; cz += pz; }
      cx /= anneau.length; cz /= anneau.length;
      let rayon = 0;
      for (const [px, pz] of anneau) rayon += Math.hypot(px - cx, pz - cz);
      rayon /= anneau.length;
      chateauxEau.push({
        x: cx, z: cz, rayon,
        hauteur: parseFloat(tags.height) || 20,
        nom: tags.name ?? null,
      });
      continue;
    }

    // Bâtiments remarquables : leur silhouette est modélisée à part, à partir
    // des photographies du bourg. On garde leur emprise réelle.
    if (tags.amenity === 'townhall' && isClosed(pts)) {
      landmarkSources.push({ type: 'townhall', pts: pts.slice(0, -1), nom: tags.name ?? null });
      continue;
    }

    // L'église Saint-Pierre est modélisée à la main : clocher-porche,
    // contreforts et chevet polygonal, qu'une extrusion d'emprise réduirait à
    // une boîte. Artix compte une seconde église (l'Assomption), laissée en
    // bâtiment ordinaire faute de photographie.
    if (tags.building === 'church' && tags.name === 'Église Saint-Pierre' && isClosed(pts)) {
      landmarkSources.push({ type: 'church', pts: pts.slice(0, -1), nom: tags.name });
      continue;
    }

    if (tags.building || tags['building:part']) {
      if (!isClosed(pts) || area(pts) < 12) continue;
      // Les hameaux très éloignés ne sont jamais vus de près : on s'en tient
      // au bourg et à sa périphérie pour tenir le budget de triangles.
      const [bx, bz] = pts[0];
      if (Math.hypot(bx, bz) > 1800) continue;
      const footprint = area(pts);
      // Type fonctionnel : les tags amenity/shop décrivent souvent mieux le
      // bâtiment que `building=yes`, majoritaire à Artix.
      const usage = tags.amenity ?? tags.shop ?? tags.leisure ?? null;
      buildings.push({
        pts: pts.slice(0, -1),
        height: buildingHeight(tags, footprint, el.id ?? bx * 7 + bz * 13),
        footprint,
        kind: tags.building ?? 'yes',
        usage,
        name: tags.name ?? null,
      });
      continue;
    }

    if (tags.railway === 'rail') { rails.push({ pts }); continue; }

    // Haies, murets, clôtures et alignements d'arbres : ils dessinent les
    // limites de parcelles, très visibles au volant dans un lotissement.
    if (tags.barrier || tags.natural === 'tree_row') {
      const kind = tags.natural === 'tree_row' ? 'tree_row' : tags.barrier;
      for (const seg of clipToRadius(pts)) {
        barriers.push({
          pts: seg, kind,
          height: kind === 'hedge' ? 1.6 : kind === 'wall' ? 1.4
            : kind === 'tree_row' ? 5.5 : 1.25,
        });
      }
      continue;
    }

    if (tags.natural === 'water' || tags.waterway) {
      if (tags.waterway && !isClosed(pts)) {
        water.push({ pts, river: true, width: tags.waterway === 'river' ? 12 : 4 });
      } else if (isClosed(pts) && area(pts) > 60) {
        water.push({ pts: pts.slice(0, -1), river: false });
      }
      continue;
    }

    // Terrains de sport : Artix en compte 27, du terrain de football au
    // boulodrome. Leur revêtement (gazon, stabilisé, béton, résine) est bien
    // plus caractéristique qu'une pelouse générique.
    if (tags.leisure === 'pitch' && isClosed(pts) && area(pts) > 60) {
      terrains.push({
        pts: pts.slice(0, -1),
        sport: tags.sport ?? null,
        surface: tags.surface ?? null,
        nom: tags.name ?? null,
      });
      continue;
    }

    // Aires de stationnement. Le bourg en compte plus de 100, soit 10 ha
    // d'enrobé : ce sont de grandes surfaces plates très visibles depuis la
    // route, que le jeu ignorait faute d'être demandées à Overpass.
    if ((tags.amenity === 'parking' || tags.amenity === 'fuel')
      && isClosed(pts) && area(pts) > 60) {
      parkings.push({
        pts: pts.slice(0, -1),
        surface: tags.surface ?? 'asphalt',
        station: tags.amenity === 'fuel',
        nom: tags.name ?? null,
      });
      continue;
    }

    const zone = tags.landuse ?? tags.leisure;
    if (zone && isClosed(pts) && area(pts) > 150) {
      areas.push({ pts: pts.slice(0, -1), kind: zone });
    }
  }

  return { roads, buildings, areas, rails, water, barriers, chateauxEau, landmarkSources, terrains, parkings };
}

// Cherche le point de départ : le centre du bourg, sur une vraie route
// carrossable. La voiture est placée au milieu d'un segment long et droit,
// dans l'axe de la chaussée, pour ne pas démarrer sur un bas-côté.
export function findSpawn(roads, buildings = []) {
  // Grille des bâtiments proches du centre : le point de départ ne doit jamais
  // tomber dans une emprise, la voiture apparaîtrait encastrée dans un mur.
  const proches = buildings.filter((b) => {
    const [bx, bz] = b.pts[0];
    return Math.hypot(bx, bz) < 900;
  });
  const dansBatiment = (x, z) => proches.some((b) => {
    let dedans = false;
    for (let i = 0, j = b.pts.length - 1; i < b.pts.length; j = i++) {
      const [xi, zi] = b.pts[i], [xj, zj] = b.pts[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dedans = !dedans;
    }
    return dedans;
  });

  let best = null, bestScore = Infinity;
  for (const r of roads) {
    if (!r.drivable || r.width < 6) continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [x1, z1] = r.pts[i];
      const [x2, z2] = r.pts[i + 1];
      const segLen = Math.hypot(x2 - x1, z2 - z1);
      if (segLen < 18) continue; // segment trop court : risque de virage

      // Milieu du segment, donc bien au centre de la voie.
      const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
      const d = Math.hypot(mx, mz);
      if (d > 700) continue; // on reste dans le bourg, pas sur la rocade
      if (dansBatiment(mx, mz)) continue; // jamais à l'intérieur d'une emprise

      // La distance au centre domine : largeur et longueur ne font que départager.
      const score = d - r.width * 4 - Math.min(segLen, 60);
      if (score < bestScore) {
        bestScore = score;
        best = {
          x: mx, z: mz,
          heading: Math.atan2(x2 - x1, z2 - z1),
          road: r.name, width: r.width,
        };
      }
    }
  }
  return best ?? { x: 0, z: 0, heading: 0, road: null };
}
