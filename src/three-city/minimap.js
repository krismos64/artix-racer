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
// Rayon réellement visible : le disque fait 95 px de rayon, et sa diagonale
// utile une fois la carte tournée reste dans ce cercle. Au-delà, une voie ne
// peut pas y tomber. L'ancienne portée de 420 m était trois fois trop large.
const PORTEE = (MAP_SIZE / 2) / MAP_SCALE + 40;   // 472 m, marge comprise
// Côté d'une cellule de la grille d'index, en mètres. À 240 m, le disque
// visible ne recouvre jamais plus de neuf cellules.
const CELLULE = 240;

// Couronne cardinale : les quatre points, posés sur le pourtour du disque.
const CARDINAUX = [
  { lettre: 'N', angle: 0 },
  { lettre: 'E', angle: Math.PI / 2 },
  { lettre: 'S', angle: Math.PI },
  { lettre: 'O', angle: -Math.PI / 2 },
];

// Secteurs pour l'affichage textuel du cap, par pas de 45°.
const SECTEURS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

export class Minicarte {
  constructor(canvas, data) {
    this.data = data;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = canvas.height = MAP_SIZE * devicePixelRatio;
    this.ctx.scale(devicePixelRatio, devicePixelRatio);
    // Cap lissé : la caisse vibre sur ses suspensions et son lacet instantané
    // fait trembler toute la carte. On suit le cap réel avec du retard, ce qui
    // ne se voit pas au volant mais stabilise le dessin.
    this.capLisse = null;
    this.preparerRoutes();
  }

  // Les voies carrossables ne changent jamais en cours de partie. Plutôt que
  // de filtrer les 902 routes et de recalculer couleur et épaisseur à chaque
  // image, on fige tout ici, une fois, et on range chaque voie dans une grille
  // pour que le dessin n'ait à considérer que son voisinage immédiat.
  preparerRoutes() {
    this.grille = new Map();
    let total = 0;
    for (const r of this.data.roads) {
      if (!r.drivable || r.pts.length < 2) continue;
      // Code couleur repris des cartes routières : jaune pour les axes
      // principaux, blanc pour la desserte, teinte distincte pour les ponts.
      const voie = {
        pts: r.pts,
        couleur: r.bridge ? '#7fd4ff'
          : r.rondPoint ? '#f0a63c'
          : r.width >= 8 ? '#e8c34a' : '#b9c2cc',
        epaisseur: Math.max(1, r.width * MAP_SCALE * 0.9),
      };
      total++;
      // Une voie s'inscrit dans toutes les cellules que sa boîte englobante
      // touche : une longue départementale doit rester visible depuis chacun
      // de ses tronçons, pas seulement depuis celle de son premier point.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of r.pts) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const ci0 = Math.floor(minX / CELLULE), ci1 = Math.floor(maxX / CELLULE);
      const cj0 = Math.floor(minZ / CELLULE), cj1 = Math.floor(maxZ / CELLULE);
      for (let ci = ci0; ci <= ci1; ci++) {
        for (let cj = cj0; cj <= cj1; cj++) {
          const cle = ci + ',' + cj;
          let seau = this.grille.get(cle);
          if (!seau) this.grille.set(cle, seau = []);
          seau.push(voie);
        }
      }
    }
    this.nbVoies = total;
    // Réutilisé à chaque image pour dédoublonner les voies à cheval sur
    // plusieurs cellules, sans allouer de Set par frame.
    this.vues = new Set();
  }

  // `pos` : position du véhicule, `cap` : son cap en radians, `dt` : durée de
  // l'image écoulée, qui sert au lissage. Sans `dt`, le cap est pris tel quel.
  dessiner(pos, cap, dt = 0) {
    const ctx = this.ctx;
    const data = this.data;

    // Lissage du cap. On interpole sur l'écart ramené dans [-PI, PI], sans
    // quoi le passage de +179° à -179° ferait faire un tour complet à la carte.
    if (this.capLisse === null || dt <= 0) {
      this.capLisse = cap;
    } else {
      let ecart = cap - this.capLisse;
      while (ecart > Math.PI) ecart -= Math.PI * 2;
      while (ecart < -Math.PI) ecart += Math.PI * 2;
      this.capLisse += ecart * Math.min(1, 9 * dt);
    }
    cap = this.capLisse;

    ctx.save();
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
    ctx.beginPath();
    ctx.arc(MAP_SIZE / 2, MAP_SIZE / 2, MAP_SIZE / 2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,16,22,0.82)';
    ctx.fill();
    ctx.clip();

    ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
    // La carte tourne avec la voiture, de façon que la route devant elle se
    // dessine vers le haut du disque et qu'un virage à droite fasse pivoter le
    // décor vers la gauche.
    //
    // `PI + cap`, et non `-cap` comme jusqu'au 19/08/2026. Deux conventions
    // s'additionnent ici : `osm.js` projette en x = est, z = sud, donc le
    // vecteur avant du véhicule à cap nul est +z, vers le bas de l'écran, d'où
    // le demi-tour ; et la rotation autour de Y de Three.js suit le sens
    // trigonométrique quand le canvas, dont l'axe y descend, tourne dans
    // l'autre sens, d'où le signe positif.
    //
    // L'ancienne valeur tombait juste à 90° et 270° et fausse partout ailleurs,
    // ce qui rendait le défaut intermittent selon la direction suivie.
    ctx.rotate(Math.PI + cap);
    ctx.translate(-pos.x * MAP_SCALE, -pos.z * MAP_SCALE);

    ctx.lineCap = 'round';
    // Seules les cellules que le disque recouvre sont visitées. Une voie
    // inscrite dans plusieurs d'entre elles n'est tracée qu'une fois.
    this.vues.clear();
    const ci0 = Math.floor((pos.x - PORTEE) / CELLULE);
    const ci1 = Math.floor((pos.x + PORTEE) / CELLULE);
    const cj0 = Math.floor((pos.z - PORTEE) / CELLULE);
    const cj1 = Math.floor((pos.z + PORTEE) / CELLULE);
    for (let ci = ci0; ci <= ci1; ci++) {
      for (let cj = cj0; cj <= cj1; cj++) {
        const seau = this.grille.get(ci + ',' + cj);
        if (!seau) continue;
        for (const voie of seau) {
          if (this.vues.has(voie)) continue;
          this.vues.add(voie);
          ctx.beginPath();
          const pts = voie.pts;
          for (let i = 0; i < pts.length; i++) {
            const [x, z] = pts[i];
            i ? ctx.lineTo(x * MAP_SCALE, z * MAP_SCALE)
              : ctx.moveTo(x * MAP_SCALE, z * MAP_SCALE);
          }
          ctx.strokeStyle = voie.couleur;
          ctx.lineWidth = voie.epaisseur;
          ctx.stroke();
        }
      }
    }

    // Équipements remarquables : une pastille colorée par catégorie, pour
    // repérer mairie, écoles et commerces d'un coup d'œil.
    if (data.poi?.equipements) {
      for (const e of data.poi.equipements) {
        if (Math.abs(e.x - pos.x) > PORTEE || Math.abs(e.z - pos.z) > PORTEE) continue;
        // Pastille pleine, contour clair : lisible sur l'asphalte comme sur le
        // fond sombre du disque.
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

    // Couronne cardinale : la carte tourne, donc le nord se déplace sur le
    // pourtour. C'est ce qui indique en direct vers où le véhicule roule, la
    // flèche centrale pointant toujours vers le haut par construction.
    this.dessinerCouronne(cap);

    // Flèche du véhicule, toujours au centre et pointant vers le haut : la
    // carte ayant tourné de -cap, le haut de l'écran est la route devant.
    ctx.save();
    ctx.translate(MAP_SIZE / 2, MAP_SIZE / 2);
    // Halo sombre : détache la flèche d'une chaussée claire passant dessous.
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(12,16,22,0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fillStyle = '#ff3b30';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Couronne des quatre points cardinaux, plus le cap chiffré au sommet.
  dessinerCouronne(cap) {
    const ctx = this.ctx;
    const c = MAP_SIZE / 2;
    const rayon = c - 13;
    ctx.save();
    ctx.translate(c, c);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const { lettre, angle } of CARDINAUX) {
      // Le nord du monde est en -Z. La couronne doit suivre exactement la
      // rotation appliquée à la carte, `PI + cap` : la déduire séparément
      // désynchronise les lettres du tracé qu'elles annotent.
      const a = angle + cap;
      const x = -Math.sin(a) * rayon;
      const y = Math.cos(a) * rayon;
      const nord = lettre === 'N';
      ctx.font = nord ? 'bold 11px system-ui, sans-serif'
        : '9px system-ui, sans-serif';
      // Pastille de fond : sans elle, une lettre posée sur une voie jaune
      // devient illisible.
      ctx.beginPath();
      ctx.arc(x, y, nord ? 8 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(12,16,22,0.78)';
      ctx.fill();
      ctx.fillStyle = nord ? '#ff6b5e' : '#8f9dab';
      ctx.fillText(lettre, x, y + 0.5);
    }

    // Cap chiffré, au-dessus de la flèche : la direction suivie, en degrés
    // depuis le nord et dans le sens des aiguilles, comme sur un compas.
    //
    // Deux conversions, pas une. `osm.js` projette en x = est, z = sud : le
    // vecteur avant du véhicule à cap nul est +z, donc plein sud, d'où les
    // 180°. Et la rotation autour de Y de Three.js suit le sens trigonométrique
    // quand un compas compte dans le sens horaire, d'où le signe négatif.
    // Corriger l'un sans l'autre remet le nord d'aplomb mais échange l'est et
    // l'ouest : c'est le tableau des huit directions qui l'a montré.
    let deg = (180 - cap * 180 / Math.PI) % 360;
    if (deg < 0) deg += 360;
    const secteur = SECTEURS[Math.round(deg / 45) % 8];
    ctx.font = 'bold 11px system-ui, sans-serif';
    const texte = `${Math.round(deg).toString().padStart(3, '0')}° ${secteur}`;
    const large = ctx.measureText(texte).width + 10;
    ctx.beginPath();
    ctx.roundRect(-large / 2, -c + 14, large, 16, 8);
    ctx.fillStyle = 'rgba(12,16,22,0.78)';
    ctx.fill();
    ctx.fillStyle = '#e8eef5';
    ctx.fillText(texte, 0, -c + 22.5);
    ctx.restore();
  }
}
