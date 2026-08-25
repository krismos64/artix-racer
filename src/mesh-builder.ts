import { Mesh, Scene, VertexBuffer, VertexData } from '@babylonjs/core';

export class GeometryBuffer {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  quad(
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    d: readonly number[],
    uv: readonly number[] = [0, 0, 1, 0, 1, 1, 0, 1],
  ): void {
    const base = this.vertexCount;
    this.positions.push(...a, ...b, ...c, ...d);
    this.uvs.push(...uv);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  triangle(
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    uv: readonly number[] = [0, 0, 1, 0, .5, 1],
  ): void {
    const base = this.vertexCount;
    this.positions.push(...a, ...b, ...c);
    this.uvs.push(...uv);
    this.indices.push(base, base + 1, base + 2);
  }

  disc(x: number, y: number, z: number, radius: number, segments = 12): void {
    const base = this.vertexCount;
    this.positions.push(x, y, z);
    this.uvs.push(.5, .5);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      this.positions.push(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius);
      this.uvs.push(.5 + Math.cos(a) * .5, .5 + Math.sin(a) * .5);
    }
    // Babylon.js travaille par défaut en repère main gauche. Cet ordre donne
    // une normale orientée vers le ciel, identique à celle des rubans routiers.
    for (let i = 0; i < segments; i++) this.indices.push(base, base + i + 2, base + i + 1);
  }

  appendPolygon(
    pts: ReadonlyArray<readonly number[]>,
    y: number,
    triangulated: number[],
    uvScale = .08,
    reverse = false,
  ): void {
    const base = this.vertexCount;
    for (const [x, z] of pts) {
      this.positions.push(x, y, z);
      this.uvs.push(x * uvScale, z * uvScale);
    }
    for (let i = 0; i < triangulated.length; i += 3) {
      const ia = triangulated[i], ib = triangulated[i + 1], ic = triangulated[i + 2];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      const crossY = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      const upward = crossY > 0;
      if (upward !== reverse) this.indices.push(base + ia, base + ib, base + ic);
      else this.indices.push(base + ia, base + ic, base + ib);
    }
  }

  toMesh(name: string, scene: Scene): Mesh | null {
    if (!this.indices.length) return null;
    VertexData.ComputeNormals(this.positions, this.indices, this.normals);
    const data = new VertexData();
    data.positions = this.positions;
    data.indices = this.indices;
    data.normals = this.normals;
    data.uvs = this.uvs;
    const mesh = new Mesh(name, scene);
    data.applyToMesh(mesh, false);
    mesh.setVerticesData(VertexBuffer.UVKind, this.uvs, false, 2);
    mesh.freezeWorldMatrix();
    mesh.doNotSyncBoundingInfo = false;
    return mesh;
  }
}
