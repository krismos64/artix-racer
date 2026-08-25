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
  vegetationDensity: number;
}

export const QUALITY: Record<QualityName, QualityProfile> = {
  performance: {
    label: 'Performance',
    hardwareScaling: 1.5,
    chunkRadius: 2,
    fogStart: 320,
    fogEnd: 690,
    shadowMap: 1024,
    shadows: false,
    vegetationDensity: 0.35,
  },
  balanced: {
    label: 'Équilibré',
    hardwareScaling: 1.18,
    chunkRadius: 3,
    fogStart: 520,
    fogEnd: 980,
    shadowMap: 1536,
    shadows: true,
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
