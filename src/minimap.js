// Minicarte du HUD.
//
// Elle est dessinée en canvas 2D plutôt qu'en 3D : un rendu vectoriel des
// seules voies carrossables coûte moins qu'une seconde caméra sur la scène, et
// donne un tracé net à cette taille.
//
// Extraite de main.js sans modification de son dessin : mêmes couleurs, même
// échelle, même portée.

const MAP_SIZE = 190;
const MAP_SCALE = 0.22;   // pixels par mètre
// Au-delà, une voie ne peut pas tomber dans le disque affiché.
const PORTEE = 420;

export class Minicarte {
  constructor(canvas, data) {
    this.data = data;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = canvas.height = MAP_SIZE * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
  }

  // `pos` : position du véhicule, `cap` : son cap en radians.
  dessiner(pos, cap) {
    const ctx = this.ctx;
    const data = this.data;
    ctx.save();
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.beginPath();
    ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,16,22,0.82)';
    ctx.fill();
    ctx.clip();

    ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
    ctx.rotate(-cap);   // la carte tourne avec la voiture
    ctx.translate(-pos.x * MAP_SCALE, -pos.z * MAP_SCALE);

    ctx.lineCap = 'round';
    for (const r of data.roads) {
      if (!r.drivable) continue;
      const [x0, z0] = r.pts[0];
      if (Math.abs(x0 - pos.x) > PORTEE && Math.abs(z0 - pos.z) > PORTEE) continue;
      ctx.beginPath();
      for (let i = 0; i < r.pts.length; i++) {
        const [x, z] = r.pts[i];
        i ? ctx.lineTo(x * MAP_SCALE, z * MAP_SCALE) : ctx.moveTo(x * MAP_SCALE, z * MAP_SCALE);
      }
      // Code couleur repris des cartes routières : jaune pour les axes
      // principaux, blanc pour la desserte, teinte distincte pour les ponts.
      ctx.strokeStyle = r.bridge ? '#7fd4ff'
        : r.rondPoint ? '#f0a63c'
        : r.width >= 8 ? '#e8c34a' : '#b9c2cc';
      ctx.lineWidth = Math.max(1, r.width * MAP_SCALE * 0.9);
      ctx.stroke();
    }

    // Équipements remarquables : une pastille colorée par catégorie, pour
    // repérer mairie, écoles et commerces d'un coup d'œil.
    if (data.poi?.equipements) {
      for (const e of data.poi.equipements) {
        if (Math.abs(e.x - pos.x) > PORTEE || Math.abs(e.z - pos.z) > PORTEE) continue;
        ctx.beginPath();
        ctx.arc(e.x * MAP_SCALE, e.z * MAP_SCALE, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#' + e.info.couleur.toString(16).padStart(6, '0');
        ctx.fill();
        ctx.lineWidth = 0.8;
        ctx.strokeStyle = 'rgba(255,255,255,.75)';
        ctx.stroke();
      }
    }
    ctx.restore();

    // Flèche du véhicule, toujours au centre.
    ctx.save();
    ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff3b30';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}
