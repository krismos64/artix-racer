import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import sharp from 'sharp';
const ORIGIN = { lat: 43.39743, lon: -0.57224 };
const R = 6378137;
const project = (lat, lon) => [
  (lon - ORIGIN.lon) * (Math.PI / 180) * R * Math.cos(ORIGIN.lat * Math.PI / 180),
  -(lat - ORIGIN.lat) * (Math.PI / 180) * R,
];
const inv = JSON.parse(readFileSync('data/panoramax-inventaire.json', 'utf8'));
const photos = inv.photos.filter((p) => p.az !== null).map((p) => {
  const [x, z] = project(p.lat, p.lon); return { id: p.id, x, z, az: p.az };
});
const CIBLES = [['caisse-epargne', 89.3, -58.8], ['pharmacie-barrouilhet', 107.6, -73.1]];
async function dl(id) {
  const chemin = `.panoramax-cache-hd/${id}.jpg`;
  if (existsSync(chemin)) return chemin;
  const r = await fetch(`https://panoramax.ign.fr/api/pictures/${id}/hd.jpg`, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  writeFileSync(chemin, Buffer.from(await r.arrayBuffer()));
  return chemin;
}
for (const [nom, cx, cz] of CIBLES) {
  const cands = photos.map((p) => ({ ...p, d: Math.hypot(p.x - cx, p.z - cz) }))
    .filter((p) => p.d > 8 && p.d < 30).sort((a, b) => a.d - b.d);
  for (const p of cands.slice(0, 2)) {
    try {
      const chemin = await dl(p.id);
      const meta = await sharp(chemin).metadata();
      const W = meta.width, H = meta.height;
      const gis = (Math.atan2(cx - p.x, -(cz - p.z)) * 180 / Math.PI + 360) % 360;
      const xC = ((((gis - p.az + 540) % 360) / 360)) * W;
      const demi = W / 7;
      const left = Math.max(0, Math.round(xC - demi));
      await sharp(chemin)
        .extract({ left, top: Math.round(H * 0.32), width: Math.min(W - left, Math.round(demi * 2)), height: Math.round(H * 0.28) })
        .resize({ width: 1300 }).jpeg({ quality: 82 })
        .toFile(`${process.env.SCRATCH}/${nom}-d${Math.round(p.d)}.jpg`);
      console.log(`${nom} : ${Math.round(p.d)} m`);
    } catch (e) { console.log(`${nom} : ${e.message}`); }
  }
}
