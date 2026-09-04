export const CHUNK_SIZE = 256;
export const TERRAIN_GUARD = 0.22;
export const ROAD_LIFT = 0.075;

export type QualityName = 'performance' | 'balanced' | 'quality';

export interface QualityProfile {
  label: string;
  hardwareScaling: number;
  chunkRadius: number;
  fogStart: number;
  fogEnd: number;
  shadowMap: number;
  shadows: boolean;
  // Filtrage des ombres (PCF) : 'low' scintille sur les arêtes, 'high'
  // adoucit les bords de pénombre. Coût réel surtout au-delà de 'medium'.
  shadowFilter: 'low' | 'medium' | 'high';
  cascades: number;
  // Occlusion ambiante : elle assoit les bâtiments au sol et creuse les
  // angles de rue, à demi-résolution son coût reste faible sur M4.
  ssao: boolean;
  // Flou de mouvement lié à la vitesse (post-process caméra).
  motionBlur: boolean;
  vegetationDensity: number;
}

export const QUALITY: Record<QualityName, QualityProfile> = {
  performance: {
    label: 'Performance',
    hardwareScaling: 1.35,
    chunkRadius: 2,
    fogStart: 320,
    fogEnd: 690,
    shadowMap: 1024,
    shadows: false,
    shadowFilter: 'low',
    cascades: 2,
    ssao: false,
    motionBlur: false,
    vegetationDensity: 0.35,
  },
  balanced: {
    // Rendu en résolution native : le facteur 1,18 d'avant étirait l'image
    // et floutait tout, alors que le M4 tient 60 fps en natif.
    label: 'Équilibré',
    hardwareScaling: 1,
    chunkRadius: 3,
    fogStart: 520,
    fogEnd: 980,
    shadowMap: 2048,
    shadows: true,
    shadowFilter: 'medium',
    cascades: 2,
    // Ni SSAO ni flou de mouvement ici : les deux exigent la pré-passe, qui
    // redessine toute la ville une seconde fois (800 appels de dessin de
    // plus). Mesuré : 50 fps avec, 58 sans, sur un rendu déjà rabaissé à
    // 967 × 512 par l'échelle dynamique. Ils restent au profil Qualité.
    ssao: false,
    motionBlur: false,
    vegetationDensity: 0.62,
  },
  quality: {
    label: 'Qualité',
    hardwareScaling: 1,
    chunkRadius: 4,
    fogStart: 720,
    fogEnd: 1320,
    shadowMap: 2048,
    shadows: true,
    shadowFilter: 'high',
    cascades: 3,
    ssao: true,
    motionBlur: true,
    vegetationDensity: 1,
  },
};

export const DEFAULT_QUALITY: QualityName = 'balanced';

export function chunkKey(x: number, z: number): string {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
}

export function chunkCoords(key: string): [number, number] {
  const [x, z] = key.split(',').map(Number);
  return [x, z];
}
