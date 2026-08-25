export type Point2 = [number, number];

export interface RoadData {
  pts: Point2[];
  width: number;
  kind: string;
  drivable: boolean;
  surface: string;
  name: string | null;
  oneway?: boolean;
  rondPoint?: boolean;
  maxspeed?: number;
  bridge?: boolean;
  layer?: number;
  footway?: string | null;
}

export interface LandmarkSource {
  type: 'townhall' | 'church';
  pts: Point2[];
  nom?: string | null;
}

export interface AreaData {
  pts: Point2[];
  kind: string;
}

export interface ParkingData {
  pts: Point2[];
  surface: string;
  station?: boolean;
  nom?: string | null;
}

export interface WaterData {
  pts: Point2[];
  river: boolean;
  width?: number;
}

export interface BarrierData {
  pts: Point2[];
  kind: string;
  height: number;
}

export interface SportsFieldData {
  pts: Point2[];
  sport?: string | null;
  surface?: string | null;
  nom?: string | null;
}

export interface RailData {
  pts: Point2[];
}

export interface CityMapData {
  roads: RoadData[];
  buildings: BuildingData[];
  areas: AreaData[];
  parkings: ParkingData[];
  water: WaterData[];
  barriers: BarrierData[];
  terrains: SportsFieldData[];
  rails: RailData[];
  chateauxEau?: Array<{ x: number; z: number; rayon: number; hauteur: number; nom?: string | null }>;
  landmarkSources?: LandmarkSource[];
}

export interface BuildingData {
  pts: Point2[];
  surface: number;
  hauteur: number;
  penteToit?: number | null;
  murs?: string | null;
  toit?: string | null;
  nature?: string | null;
  usage?: string | null;
  zSol?: number | null;
  graine: number;
  toiture?: {
    t?: number | string;
    c?: number;
    g?: number;
    f?: number;
  } | null;
  teinteMur?: number | null;
}

export interface TerrainLike {
  res: number;
  taille: number;
  pas: number;
  h: Float32Array;
  hauteurEn(x: number, z: number): number;
  hauteurRoute(x: number, z: number): number;
  solVisible(x: number, z: number, garde: number): number;
}
