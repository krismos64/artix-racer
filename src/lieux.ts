// Lieux-dits d'Artix affichés dans le bandeau du HUD (« VOUS ROULEZ SUR »).
//
// Simple table de noms et de rayons : la géométrie de ces lieux est construite
// par la couche Three.js (`src/three-city/landmarks.js`), pas ici.

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
