import {
  Color3,
  DynamicTexture,
  PBRMaterial,
  Scene,
  Texture,
} from '@babylonjs/core';

function css(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

function shade(hex: number, amount: number): string {
  const r = Math.max(0, Math.min(255, ((hex >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((hex >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (hex & 255) + amount));
  return `rgb(${r},${g},${b})`;
}

function texture(
  scene: Scene,
  name: string,
  draw: (ctx: CanvasRenderingContext2D, size: number) => void,
  size = 256,
): DynamicTexture {
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  draw(ctx, size);
  tex.update(false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  return tex;
}

function noise(ctx: CanvasRenderingContext2D, size: number, alpha: number, seed: number): void {
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = 0; i < size * 4; i++) {
    const v = Math.floor(rand() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha * rand()})`;
    const s = 1 + Math.floor(rand() * 3);
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

function pbr(scene: Scene, name: string, tex: DynamicTexture, roughness = .92): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoTexture = tex;
  mat.metallic = 0;
  mat.roughness = roughness;
  mat.environmentIntensity = .55;
  mat.directIntensity = 1.05;
  // Les surfaces principales sont géométriquement fermées. Le rendu double
  // face reste activé comme garde-fou pour les anneaux cadastraux dont le sens
  // varie selon la source, sans recourir à un matériau transparent.
  mat.backFaceCulling = false;
  mat.freeze();
  return mat;
}

function solid(
  scene: Scene,
  name: string,
  color: Color3,
  roughness = .9,
  emissive = Color3.Black(),
): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color;
  mat.metallic = 0;
  mat.roughness = roughness;
  mat.emissiveColor = emissive;
  mat.environmentIntensity = .52;
  mat.directIntensity = 1.08;
  mat.backFaceCulling = false;
  mat.freeze();
  return mat;
}

export class MaterialLibrary {
  readonly terrain: PBRMaterial;
  readonly asphalt: PBRMaterial;
  readonly path: PBRMaterial;
  readonly shoulder: PBRMaterial;
  readonly marking: PBRMaterial;
  readonly paving: PBRMaterial;
  readonly sidewalk: PBRMaterial;
  readonly gutter: PBRMaterial;
  readonly parapet: PBRMaterial;
  readonly trunk: PBRMaterial;
  readonly foliage: PBRMaterial;
  readonly curb: PBRMaterial;
  readonly parking: PBRMaterial;
  readonly water: PBRMaterial;
  readonly rail: PBRMaterial;
  readonly hedge: PBRMaterial;
  readonly park: PBRMaterial;
  readonly field: PBRMaterial;
  readonly sports: PBRMaterial;
  readonly clay: PBRMaterial;
  readonly metal: PBRMaterial;
  readonly glass: PBRMaterial;
  readonly lamp: PBRMaterial;
  readonly parkedPaint: readonly PBRMaterial[];

  private readonly walls = new Map<number, PBRMaterial>();
  private readonly roofs = new Map<number, PBRMaterial>();

  constructor(private readonly scene: Scene) {
    const grass = texture(scene, 'grass-texture', (ctx, size) => {
      ctx.fillStyle = '#788d55';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .09, 41);
      for (let i = 0; i < 650; i++) {
        const x = (i * 73) % size;
        const y = (i * 151) % size;
        ctx.fillStyle = i % 3 ? '#8da36550' : '#5a704255';
        ctx.fillRect(x, y, 1, 3);
      }
    });
    grass.uScale = grass.vScale = 55;
    this.terrain = pbr(scene, 'terrain', grass, 1);

    const asphalt = texture(scene, 'asphalt-texture', (ctx, size) => {
      ctx.fillStyle = '#55595d';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .06, 91);
      for (let i = 0; i < 65; i++) {
        ctx.strokeStyle = i % 2 ? '#34373a38' : '#73767924';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo((i * 47) % size, (i * 83) % size);
        ctx.lineTo((i * 47 + 22) % size, (i * 83 + 7) % size);
        ctx.stroke();
      }
    });
    asphalt.uScale = asphalt.vScale = 3;
    this.asphalt = pbr(scene, 'asphalt', asphalt, .98);

    const path = texture(scene, 'path-texture', (ctx, size) => {
      ctx.fillStyle = '#978e7c';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .05, 27);
    });
    path.uScale = path.vScale = 4;
    this.path = pbr(scene, 'paths', path, 1);

    const shoulder = texture(scene, 'shoulder-texture', (ctx, size) => {
      ctx.fillStyle = '#777466';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .055, 123);
    }, 128);
    shoulder.uScale = shoulder.vScale = 5;
    this.shoulder = pbr(scene, 'shoulder', shoulder, 1);

    const white = texture(scene, 'road-marking', (ctx, size) => {
      ctx.fillStyle = '#e8e4d2';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .025, 51);
    }, 64);
    this.marking = pbr(scene, 'road-marking', white, .82);

    const paving = texture(scene, 'paving-stones', (ctx, size) => {
      ctx.fillStyle = '#776d61';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#4d473f';
      ctx.lineWidth = 2;
      const h = 18;
      for (let y = 0; y < size + h; y += h) {
        const offset = (Math.floor(y / h) & 1) * 14;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
        for (let x = -offset; x < size; x += 28) {
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke();
        }
      }
      noise(ctx, size, .035, 318);
    }, 256);
    paving.uScale = paving.vScale = 3.4;
    this.paving = pbr(scene, 'paving-stones', paving, .97);

    const sidewalk = texture(scene, 'sidewalk-surface', (ctx, size) => {
      ctx.fillStyle = '#98968e';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#77756f66';
      ctx.lineWidth = 1;
      for (let x = 0; x < size; x += 32) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size); ctx.stroke();
      }
      noise(ctx, size, .025, 481);
    }, 128);
    sidewalk.uScale = sidewalk.vScale = 4;
    this.sidewalk = pbr(scene, 'sidewalk-surface', sidewalk, .9);
    this.gutter = solid(scene, 'gutter', Color3.FromHexString('#666761'), .95);

    const neutral = texture(scene, 'neutral-concrete', (ctx, size) => {
      ctx.fillStyle = '#d4d0c6';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .025, 33);
    }, 128);
    this.parapet = pbr(scene, 'parapet', neutral, .96);

    const bark = texture(scene, 'bark', (ctx, size) => {
      ctx.fillStyle = '#6c5139';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = '#4c3828aa';
      for (let x = 4; x < size; x += 11) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 5, size); ctx.stroke();
      }
    }, 64);
    this.trunk = pbr(scene, 'bark', bark, 1);

    const leaf = texture(scene, 'foliage', (ctx, size) => {
      ctx.fillStyle = '#436c38';
      ctx.fillRect(0, 0, size, size);
      noise(ctx, size, .07, 71);
    }, 128);
    this.foliage = pbr(scene, 'foliage', leaf, 1);

    this.curb = solid(scene, 'curb', Color3.FromHexString('#c6c1b4'), .96);
    this.parking = solid(scene, 'parking', Color3.FromHexString('#666b70'), .98);
    this.water = solid(scene, 'water', Color3.FromHexString('#3f91b5'), .38, Color3.FromHexString('#071a21'));
    this.rail = solid(scene, 'rail', Color3.FromHexString('#4e5358'), .54);
    this.hedge = solid(scene, 'hedge', Color3.FromHexString('#355f38'), 1);
    this.park = solid(scene, 'park', Color3.FromHexString('#6e9754'), 1);
    this.field = solid(scene, 'field', Color3.FromHexString('#9ba65e'), 1);
    this.sports = solid(scene, 'sports', Color3.FromHexString('#4d9861'), .94);
    this.clay = solid(scene, 'clay', Color3.FromHexString('#b8835e'), .98);
    this.metal = solid(scene, 'street-metal', Color3.FromHexString('#38434b'), .58);
    this.glass = solid(scene, 'vehicle-glass', Color3.FromHexString('#172b38'), .23);
    this.lamp = solid(scene, 'street-lamp', Color3.FromHexString('#f5d58a'), .42, Color3.FromHexString('#6b4d1e'));
    this.parkedPaint = [
      solid(scene, 'parked-red', Color3.FromHexString('#aa3f39'), .38),
      solid(scene, 'parked-blue', Color3.FromHexString('#355f86'), .38),
      solid(scene, 'parked-silver', Color3.FromHexString('#a5a8a5'), .45),
    ];
  }

  wall(hex: number): PBRMaterial {
    const key = hex & 0xffffff;
    const cached = this.walls.get(key);
    if (cached) return cached;
    const tex = texture(this.scene, `wall-${key}`, (ctx, size) => {
      ctx.fillStyle = css(key);
      ctx.fillRect(0, 0, size, size);
      const floors = 3;
      const bays = 4;
      for (let floor = 0; floor < floors; floor++) {
        for (let bay = 0; bay < bays; bay++) {
          const x = bay * size / bays + 13;
          const y = floor * size / floors + 18;
          ctx.fillStyle = '#233442';
          ctx.fillRect(x, y, 24, 31);
          ctx.fillStyle = '#b8d2df';
          ctx.fillRect(x + 2, y + 2, 20, 12);
          ctx.fillStyle = '#ffffff35';
          ctx.fillRect(x + 4, y + 3, 5, 10);
          ctx.fillStyle = shade(key, -18);
          ctx.fillRect(x - 2, y + 31, 28, 3);
        }
      }
      noise(ctx, size, .018, key);
    });
    const mat = pbr(this.scene, `wall-${key}`, tex, .93);
    this.walls.set(key, mat);
    return mat;
  }

  roof(hex: number): PBRMaterial {
    const key = hex & 0xffffff;
    const cached = this.roofs.get(key);
    if (cached) return cached;
    const tex = texture(this.scene, `roof-${key}`, (ctx, size) => {
      ctx.fillStyle = css(key);
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = shade(key, -23);
      ctx.lineWidth = 2;
      for (let y = 0; y <= size; y += 18) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      }
      ctx.strokeStyle = shade(key, 12);
      ctx.lineWidth = 1;
      for (let y = 9; y <= size; y += 18) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke();
      }
      noise(ctx, size, .018, key + 99);
    });
    const mat = pbr(this.scene, `roof-${key}`, tex, .96);
    this.roofs.set(key, mat);
    return mat;
  }

  dispose(): void {
    for (const mat of [...this.walls.values(), ...this.roofs.values()]) {
      mat.albedoTexture?.dispose();
      mat.dispose();
    }
  }
}
