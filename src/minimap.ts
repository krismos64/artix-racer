import type { Point2, RoadData } from './types';

export class Minimap {
  private readonly ctx: CanvasRenderingContext2D;
  private timer = 0;
  private readonly size = 210;
  private readonly radius = 250;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly roads: RoadData[]) {
    const ratio = Math.min(2, devicePixelRatio || 1);
    canvas.width = this.size * ratio;
    canvas.height = this.size * ratio;
    canvas.style.width = `${this.size}px`;
    canvas.style.height = `${this.size}px`;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.scale(ratio, ratio);
  }

  update(dt: number, x: number, z: number, heading: number, objective: Point2 | null): void {
    this.timer += dt;
    if (this.timer < .08) return;
    this.timer = 0;
    const ctx = this.ctx;
    const center = this.size * .5;
    const scale = center / this.radius;
    const sin = Math.sin(-heading), cos = Math.cos(-heading);
    const project = (px: number, pz: number): Point2 => {
      const dx = px - x, dz = pz - z;
      return [center + (dx * cos - dz * sin) * scale, center - (dx * sin + dz * cos) * scale];
    };

    ctx.clearRect(0, 0, this.size, this.size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 3, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#0b1923dd';
    ctx.fillRect(0, 0, this.size, this.size);

    for (const road of this.roads) {
      if (!road.drivable) continue;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const a = road.pts[i], b = road.pts[i + 1];
        if (Math.min(Math.hypot(a[0] - x, a[1] - z), Math.hypot(b[0] - x, b[1] - z)) > this.radius * 1.35) continue;
        const pa = project(a[0], a[1]), pb = project(b[0], b[1]);
        ctx.strokeStyle = ['primary', 'secondary', 'trunk'].includes(road.kind) ? '#d7c98e' : '#758491';
        ctx.lineWidth = Math.max(1, road.width * scale * .36);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }
    }

    // Les noms de rues font partie de la carte, pas seulement du HUD. On en
    // affiche au plus cinq autour de la voiture pour conserver une lecture
    // nette sur la mini-carte circulaire.
    const labels: Array<{ name: string; x: number; y: number; angle: number; distance: number }> = [];
    const seen = new Set<string>();
    for (const road of this.roads) {
      if (!road.drivable || !road.name || seen.has(road.name)) continue;
      let best: (typeof labels)[number] | null = null;
      for (let i = 0; i < road.pts.length - 1; i++) {
        const a = road.pts[i], b = road.pts[i + 1];
        const mx = (a[0] + b[0]) * .5, mz = (a[1] + b[1]) * .5;
        const distance = Math.hypot(mx - x, mz - z);
        if (distance > this.radius * .78) continue;
        const pa = project(a[0], a[1]), pb = project(b[0], b[1]);
        let angle = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;
        const candidate = { name: road.name, x: (pa[0] + pb[0]) * .5, y: (pa[1] + pb[1]) * .5, angle, distance };
        if (!best || distance < best.distance) best = candidate;
      }
      if (best) { labels.push(best); seen.add(road.name); }
    }
    labels.sort((a, b) => a.distance - b.distance);
    ctx.font = '700 7px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const label of labels.slice(0, 5)) {
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate(label.angle);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#08141de8';
      ctx.strokeText(label.name, 0, -4, 92);
      ctx.fillStyle = '#eef5f8';
      ctx.fillText(label.name, 0, -4, 92);
      ctx.restore();
    }

    if (objective) {
      const [ox, oz] = project(objective[0], objective[1]);
      ctx.fillStyle = '#f4c54f';
      ctx.shadowColor = '#f4c54f';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(ox, oz, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.translate(center, center);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 4);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = '#ffffff42';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(center, center, center - 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}
