// Signalisation routière et équipements publics d'Artix.
//
// Les feux, stops et passages piétons sont cartographiés dans OSM comme des
// nœuds, pas des surfaces : ils viennent d'une requête Overpass distincte.
// Artix ne compte aucun feu tricolore : la circulation y est réglée par stops,
// cédez-le-passage et ronds-points, ce que reproduit fidèlement ce module.
import { project } from './osm.js';

const RAYON_MAX = 2000;

// Catégories d'équipements à signaler au joueur, avec leur libellé et la
// couleur de leur panonceau. L'ordre définit la priorité d'affichage quand
// plusieurs équipements se superposent.
// Enseignes ayant changé depuis le relevé OSM. Le tag `name` reste celui de
// l'ancienne enseigne tant que personne n'a mis la carte à jour, et le HUD
// annoncerait un commerce qui n'existe plus. La correspondance est tenue à la
// main, sur constat de terrain : c'est une donnée LUE, pas déduite.
const ENSEIGNES_ACTUELLES = {
  // L'Intermarché du centre-bourg est devenu un Leclerc Express.
  'Intermarché': 'Leclerc Express',
  // L'ancien Leader Price de l'avenue Maréchal Leclerc abrite Loto Tyche.
  'Leader Price': 'Loto Tyche',
};

export const CATEGORIES = {
  townhall:        { label: 'Mairie',            couleur: 0x2f5fa8, icone: 'civique' },
  school:          { label: 'École',             couleur: 0xd4913a, icone: 'ecole' },
  college:         { label: 'Collège',           couleur: 0xd4913a, icone: 'ecole' },
  kindergarten:    { label: 'Crèche',            couleur: 0xd4913a, icone: 'ecole' },
  place_of_worship:{ label: 'Église',            couleur: 0x6b6459, icone: 'civique' },
  police:          { label: 'Gendarmerie',       couleur: 0x2f5fa8, icone: 'civique' },
  fire_station:    { label: 'Pompiers',          couleur: 0xb03028, icone: 'civique' },
  post_office:     { label: 'La Poste',          couleur: 0x2f5fa8, icone: 'civique' },
  pharmacy:        { label: 'Pharmacie',         couleur: 0x2e8b4f, icone: 'sante' },
  doctors:         { label: 'Santé',             couleur: 0x2e8b4f, icone: 'sante' },
  social_facility: { label: 'EHPAD',             couleur: 0x2e8b4f, icone: 'sante' },
  bank:            { label: 'Banque',            couleur: 0x4a5a6a, icone: 'commerce' },
  supermarket:     { label: 'Supermarché',       couleur: 0xc06020, icone: 'commerce' },
  bakery:          { label: 'Boulangerie',       couleur: 0xc06020, icone: 'commerce' },
  butcher:         { label: 'Boucherie',         couleur: 0xc06020, icone: 'commerce' },
  restaurant:      { label: 'Restaurant',        couleur: 0xc06020, icone: 'commerce' },
  fast_food:       { label: 'Restauration',      couleur: 0xc06020, icone: 'commerce' },
  bar:             { label: 'Bar',               couleur: 0xc06020, icone: 'commerce' },
  fuel:            { label: 'Station-service',   couleur: 0x1f6f8b, icone: 'commerce' },
  doityourself:    { label: 'Bricolage',         couleur: 0xc06020, icone: 'commerce' },
  garden_centre:   { label: 'Jardinerie',        couleur: 0xc06020, icone: 'commerce' },
  sports_centre:   { label: 'Sport',             couleur: 0x2e7d6b, icone: 'sport' },
  swimming_pool:   { label: 'Piscine',           couleur: 0x2e7d6b, icone: 'sport' },
  pitch:           { label: 'Terrain de sport',  couleur: 0x2e7d6b, icone: 'sport' },
  stadium:         { label: 'Stade',             couleur: 0x2e7d6b, icone: 'sport' },
  sports_hall:     { label: 'Gymnase',           couleur: 0x2e7d6b, icone: 'sport' },
  community_centre:{ label: 'Salle des fêtes',   couleur: 0x8a4a8a, icone: 'civique' },
  library:         { label: 'Bibliothèque',      couleur: 0x8a4a8a, icone: 'civique' },
  parking:         { label: 'Parking',           couleur: 0x2f5fa8, icone: 'parking' },
};

// Signalisation verticale : type OSM -> forme et libellé du panneau.
export const PANNEAUX = {
  stop:          { forme: 'octogone', label: 'STOP',  fond: 0xc1272d, texte: 0xffffff },
  give_way:      { forme: 'triangle', label: '',      fond: 0xffffff, texte: 0xc1272d },
  mini_roundabout:{ forme: 'rond',    label: '',      fond: 0x1a54a8, texte: 0xffffff },
};

export function parsePOI(raw, terrain = null) {
  const signalisation = [];   // stops, cédez-le-passage, ronds-points
  const passages = [];        // passages piétons
  const ralentisseurs = [];
  const equipements = [];     // bâtiments et commerces à signaler
  const arrets = [];          // arrêts de bus
  const bancs = [];
  const corbeilles = [];       // corbeilles de propreté
  const arbres = [];          // arbres cartographiés individuellement
  const lampadaires = [];     // points lumineux réels
  const chateauxEau = [];

  for (const p of raw.poi) {
    const [x, z] = project(p.lat, p.lon);
    if (Math.hypot(x, z) > RAYON_MAX) continue;
    const t = p.tags ?? {};

    // --- Signalisation routière ---
    if (t.highway === 'stop' || t.highway === 'give_way' || t.highway === 'mini_roundabout') {
      signalisation.push({ x, z, type: t.highway, direction: t.direction ?? null });
      continue;
    }
    if (t.highway === 'crossing') { passages.push({ x, z }); continue; }
    if (t.traffic_calming) { ralentisseurs.push({ x, z, type: t.traffic_calming }); continue; }
    if (t.highway === 'bus_stop') { arrets.push({ x, z, nom: t.name ?? null }); continue; }
    if (t.amenity === 'bench') { bancs.push({ x, z }); continue; }
    if (t.amenity === 'waste_basket') { corbeilles.push({ x, z }); continue; }

    // Arbres cartographiés un par un : leur position est réelle, ce qui vaut
    // mieux qu'un semis aléatoire. Les hauteurs ne sont pas renseignées à
    // Artix, on les tire d'une plage plausible selon le type de feuillage.
    if (t.natural === 'tree') {
      const feuillu = t.leaf_type !== 'needleleaved';
      arbres.push({
        x, z,
        hauteur: t.height ? parseFloat(t.height) : null,
        feuillu,
        espece: t.species ?? t['species:fr'] ?? t.genus ?? null,
      });
      continue;
    }

    // Lampadaires cartographiés un par un : 20 à Artix, à leur emplacement
    // réel. Ils servent de points d'éclairage nocturne.
    if (t.highway === 'street_lamp') {
      lampadaires.push({ x, z, hauteur: t.height ? parseFloat(t.height) : null });
      continue;
    }

    // Château d'eau : silhouette repérable de loin, à modéliser à part.
    if (t.man_made === 'water_tower') {
      chateauxEau.push({ x, z, nom: t.name ?? null, hauteur: t.height ? parseFloat(t.height) : null });
      continue;
    }

    // --- Équipements et commerces ---
    // On cherche la catégorie la plus significative parmi les tags présents.
    const cles = [t.amenity, t.shop, t.leisure, t.tourism, t.healthcare, t.office];
    let cat = null;
    for (const c of cles) {
      if (c && CATEGORIES[c]) { cat = c; break; }
    }
    // Cas particuliers : un `shop` inconnu reste un commerce, un `leisure`
    // inconnu reste un équipement sportif.
    if (!cat && t.shop) cat = 'commerce_divers';
    if (!cat && t.leisure === 'swimming_area') cat = 'swimming_pool';

    if (cat && t.name) {
      equipements.push({
        x, z,
        categorie: cat,
        nom: ENSEIGNES_ACTUELLES[t.name] ?? t.name,
        // Un équipement sans catégorie connue reste affichable sous son nom.
        info: CATEGORIES[cat] ?? { label: 'Commerce', couleur: 0xc06020, icone: 'commerce' },
      });
    }
  }

  return { signalisation, passages, ralentisseurs, equipements, arrets, bancs, corbeilles,
    arbres, chateauxEau, lampadaires };
}
