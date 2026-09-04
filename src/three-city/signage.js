// Construction 3D de la signalisation et des panonceaux d'équipements.
import * as THREE from 'three';
import { anisotropie } from './textures.js';
import { CATEGORIES } from './poi.js';
import { ecarterDeChaussee } from './osm.js';

// Fabrique une texture de panneau à partir d'un dessin canvas. Les panneaux
// réels étant très lisibles, un rendu texte net vaut mieux qu'une géométrie
// détaillée qu'on ne distingue pas en roulant.
function texturePanneau(dessin, taille = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const ctx = c.getContext('2d');
  dessin(ctx, taille);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

function textureStop() {
  return texturePanneau((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    // Octogone rouge à liseré blanc.
    const r = s * 0.47, cx = s / 2, cy = s / 2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#c1272d';
    ctx.fill();
    ctx.lineWidth = s * 0.045;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${s * 0.30}px Helvetica, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STOP', cx, cy + s * 0.01);
  });
}

function textureCedez() {
  return texturePanneau((ctx, s) => {
    ctx.clearRect(0, 0, s, s);
    // Triangle pointe en bas, fond blanc, large bordure rouge.
    const cx = s / 2, marge = s * 0.06;
    ctx.beginPath();
    ctx.moveTo(marge, s * 0.16);
    ctx.lineTo(s - marge, s * 0.16);
    ctx.lineTo(cx, s - marge);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = s * 0.11;
    ctx.strokeStyle = '#c1272d';
    ctx.lineJoin = 'round';
    ctx.stroke();
  });
}

// Panneau de localisation d'un équipement : bandeau de couleur, pictogramme
// simple et nom du lieu.
function textureEquipement(nom, label, couleur) {
  const L = 512, H = 160;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  const hex = '#' + couleur.toString(16).padStart(6, '0');

  ctx.fillStyle = '#f2efe8';
  ctx.fillRect(0, 0, L, H);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, L, H * 0.30);
  ctx.strokeStyle = hex;
  ctx.lineWidth = 7;
  ctx.strokeRect(3.5, 3.5, L - 7, H - 7);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${H * 0.19}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), 16, H * 0.155);

  // Nom du lieu, réduit s'il est trop long pour la largeur du panneau.
  ctx.fillStyle = '#1d2530';
  let taille = H * 0.27;
  ctx.font = `600 ${taille}px Helvetica, Arial, sans-serif`;
  while (ctx.measureText(nom).width > L - 34 && taille > 12) {
    taille -= 1.5;
    ctx.font = `600 ${taille}px Helvetica, Arial, sans-serif`;
  }
  ctx.fillText(nom, 17, H * 0.66);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

// Bruit déterministe local, pour varier légèrement les éléments répétés.
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Hauteur du sol sous un point : les panneaux doivent suivre le relief.
function solEn(relief, x, z, roadY) {
  return (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
}

export function buildSignage(data, relief, roadY) {
  const group = new THREE.Group();
  const poi = data.poi;
  if (!poi) return { group, panneaux: [] };

  const poteauMat = new THREE.MeshStandardMaterial({
    color: 0x6e747a, roughness: 0.55, metalness: 0.6,
  });
  const poteauGeo = new THREE.CylinderGeometry(0.045, 0.05, 1, 6);

  // ---- Panneaux STOP et cédez-le-passage --------------------------------
  // FrontSide : en DoubleSide, le dos du panneau afficherait « POTS » en
  // miroir depuis la voie opposée.
  const matStop = new THREE.MeshStandardMaterial({
    map: textureStop(), transparent: true, roughness: 0.4,
    side: THREE.FrontSide, alphaTest: 0.5,
  });
  const matCedez = new THREE.MeshStandardMaterial({
    map: textureCedez(), transparent: true, roughness: 0.4,
    side: THREE.FrontSide, alphaTest: 0.5,
  });
  // Le dos reprend la texture du panneau comme masque de découpe, sinon un
  // carré gris apparaîtrait derrière l'octogone du STOP.
  const dosStop = new THREE.MeshStandardMaterial({
    map: textureStop(), color: 0x9aa0a6, alphaTest: 0.5, transparent: true,
    roughness: 0.6, metalness: 0.3, side: THREE.FrontSide,
  });
  const dosCedez = new THREE.MeshStandardMaterial({
    map: textureCedez(), color: 0x9aa0a6, alphaTest: 0.5, transparent: true,
    roughness: 0.6, metalness: 0.3, side: THREE.FrontSide,
  });
  // Un STOP réel mesure 70 cm : à l'échelle du jeu et avec le champ de vision
  // d'une caméra de poursuite, il devient illisible. On le grossit d'un tiers,
  // comme le font les jeux de conduite pour garder la signalisation lisible.
  const plaqueGeo = new THREE.PlaneGeometry(1.05, 1.05);

  // Route la plus proche d'un point : cap, distance et projection sur l'axe.
  // Les nœuds OSM de signalisation sont posés SUR l'axe de la chaussée ; il
  // faut donc décaler le panneau sur l'accotement, sinon il se dresse au
  // milieu de la voie.
  const routeProche = (x, z, portee = 40) => {
    let cap = 0, dMin = Infinity, px = x, pz = z, largeur = 6;
    let sens = null, oneway = false;
    for (const r of data.roads) {
      if (!r.drivable) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
        if (Math.abs(x1 - x) > portee && Math.abs(z1 - z) > portee) continue;
        const dx = x2 - x1, dz = z2 - z1;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        let t = ((x - x1) * dx + (z - z1) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = x1 + dx * t, qz = z1 + dz * t;
        const d = Math.hypot(x - qx, z - qz);
        if (d < dMin) {
          dMin = d; cap = Math.atan2(dx, dz);
          px = qx; pz = qz; largeur = r.width;
          // Sens de parcours du segment, conservé tel quel : c'est la
          // référence à laquelle OSM rapporte ses tags `direction`
          // (forward = dans le sens du tracé).
          sens = { ux: dx / Math.sqrt(l2), uz: dz / Math.sqrt(l2) };
          oneway = r.oneway === true;
        }
      }
    }
    return { cap, dMin, px, pz, largeur, sens, oneway };
  };

  // Position sur l'accotement, panneau tourné vers la chaussée.
  //
  // Le sens de `cap` dépend de l'ordre de parcours de la polyligne OSM, qui est
  // arbitraire : appliquer une rotation fixe planterait la moitié des panneaux
  // dos à la route. On calcule donc le cap à partir du vecteur qui va du
  // panneau vers l'axe de la voie, ce qui garantit qu'il fait toujours face au
  // conducteur, quel que soit le sens de numérisation de la route.
  // `direction` : tag OSM du nœud de signalisation, `forward` ou `backward`.
  // Il indique le sens de circulation concerné par rapport au tracé de la voie,
  // et c'est la seule information qui lève l'ambiguïté sur une route à double
  // sens — 77 des 81 panneaux d'Artix le portent. Sans lui, orienter le panneau
  // « vers la chaussée » revient à tirer son sens à pile ou face.
  const surAccotement = (x, z, decalage = 0.9, direction = null) => {
    const r = routeProche(x, z);
    if (!Number.isFinite(r.dMin) || r.dMin > 40) {
      return { x, z, cap: 0, trouve: false };
    }
    // Normale à la voie. Les deux côtés sont testés : on retient celui qui
    // éloigne le plus le panneau de toute chaussée, pour ne pas le planter sur
    // la voie transversale d'un carrefour.
    const nx = Math.cos(r.cap), nz = -Math.sin(r.cap);
    const recul = r.largeur / 2 + decalage;
    const candidats = [
      { x: r.px + nx * recul, z: r.pz + nz * recul },
      { x: r.px - nx * recul, z: r.pz - nz * recul },
    ];
    // Deux critères départagent les côtés : rester du côté où le nœud OSM se
    // trouvait déjà (les stops sont cartographiés côté circulation), et ne pas
    // atterrir sur une voie transversale. Le second l'emporte en cas de
    // conflit, un panneau planté sur la chaussée étant pire que du mauvais côté.
    let meilleur = candidats[0], meilleurScore = -Infinity;
    for (const c of candidats) {
      const d = routeProche(c.x, c.z, 25).dMin;
      const degagement = Number.isFinite(d) ? Math.min(d, 12) : 12;
      const proximiteOrigine = -Math.hypot(c.x - x, c.z - z);
      const score = degagement * 2 + proximiteOrigine;
      if (score > meilleurScore) { meilleurScore = score; meilleur = c; }
    }
    const px = meilleur.x, pz = meilleur.z;

    // Le panneau fait face au point de la voie qu'il signale, c'est-à-dire la
    // projection du nœud d'origine sur son axe. Un PlaneGeometry non tourné
    // regarde vers +Z : l'angle qui l'oriente vers un point est atan2(dx, dz).
    // Direction vers la voie SIGNALÉE, celle du nœud d'origine. La route la
    // plus proche de la position finale peut être une transversale de
    // carrefour : viser celle-ci mettrait le panneau de profil pour le
    // conducteur qu'il concerne.
    let vx = r.px - px, vz = r.pz - pz;

    // Un vecteur quasi nul (panneau pile sur l'axe) ne définit aucune
    // direction : on retombe sur la normale de la voie.
    if (Math.hypot(vx, vz) < 0.08) { vx = -nx; vz = -nz; }
    let cap = Math.atan2(vx, vz);

    // Garantie : la normale doit pointer vers la chaussée signalée. Ce contrôle
    // rattrape les cas où le choix du côté d'accotement a fait passer le
    // panneau de l'autre bord.
    const dotSignalee = Math.sin(cap) * vx + Math.cos(cap) * vz;
    if (dotSignalee < 0) cap += Math.PI;

    // Orientation définitive : un panneau fait face au conducteur qui VIENT
    // vers lui, donc sa normale remonte le sens de circulation. Regarder
    // simplement « vers la chaussée » laisse deux solutions sur une voie à
    // double sens, et en retient une au hasard.
    if (r.sens) {
      // Sens de circulation concerné : celui du tracé pour `forward`, l'opposé
      // pour `backward`. Sur une voie à sens unique, le tracé fait foi.
      const inverse = direction === 'backward';
      const cx = inverse ? -r.sens.ux : r.sens.ux;
      const cz2 = inverse ? -r.sens.uz : r.sens.uz;
      if (direction === 'forward' || direction === 'backward' || r.oneway) {
        // La face du panneau regarde à l'opposé de la circulation.
        cap = Math.atan2(-cx, -cz2);
        // Léger biais vers la chaussée : un panneau parfaitement parallèle à
        // l'axe est vu de trois quarts, comme en implantation réelle.
        const versVoie = Math.atan2(vx, vz);
        let ecart = versVoie - cap;
        while (ecart > Math.PI) ecart -= 2 * Math.PI;
        while (ecart < -Math.PI) ecart += 2 * Math.PI;
        cap += Math.max(-0.32, Math.min(0.32, ecart));
      }
    }

    return { x: px, z: pz, cap, capRoute: r.cap, trouve: true };
  };

  let nbStop = 0, nbCedez = 0;
  for (const s of poi.signalisation) {
    if (s.type === 'mini_roundabout') continue;   // traité au sol
    const pos = surAccotement(s.x, s.z, 0.9, s.direction);
    if (!pos.trouve) continue;
    const sol = solEn(relief, pos.x, pos.z, roadY);

    const poteau = new THREE.Mesh(poteauGeo, poteauMat);
    poteau.scale.y = 2.2;
    poteau.position.set(pos.x, sol + 1.1, pos.z);
    group.add(poteau);

    const plaque = new THREE.Mesh(plaqueGeo, s.type === 'stop' ? matStop : matCedez);
    // La face et le dos ne doivent jamais être coplanaires. Babylon rend les
    // deux côtés des maillages importés pour protéger les toitures et terrains
    // cadastraux mal orientés ; deux plans confondus se disputeraient alors le
    // depth buffer et le panneau clignoterait à chaque déplacement de caméra.
    const epaisseurPanneau = 0.018;
    const nx = Math.sin(pos.cap), nz = Math.cos(pos.cap);
    plaque.position.set(pos.x + nx * epaisseurPanneau, sol + 2.3,
      pos.z + nz * epaisseurPanneau);
    plaque.rotation.y = pos.cap;
    group.add(plaque);

    // Dos de tôle grise, comme sur un vrai panneau.
    const dos = new THREE.Mesh(plaqueGeo, s.type === 'stop' ? dosStop : dosCedez);
    dos.position.set(pos.x - nx * epaisseurPanneau, sol + 2.3,
      pos.z - nz * epaisseurPanneau);
    dos.rotation.y = pos.cap + Math.PI;
    group.add(dos);

    if (s.type === 'stop') nbStop++; else nbCedez++;
  }

  // ---- Sens interdits ----------------------------------------------------
  // Supprimés le 18/08/2026 : le placement était souvent faux sur le terrain.
  // OSM ne cartographie aucun panneau de sens interdit à Artix ; les 190 posés
  // étaient déduits du tag `oneway=yes` de 209 tronçons, puis placés par
  // heuristique (7 m dans le tronçon, bord le plus dégagé des deux). Une règle
  // de circulation réelle ne dit pas où se trouve le panneau qui l'annonce, et
  // le découpage OSM d'une voie en tronçons successifs ne correspond pas aux
  // entrées réelles. Ne pas réintroduire sans données de position.

  // ---- Panonceaux des équipements ---------------------------------------
  // Les équipements publics restent annoncés par un panneau de localisation.
  // Les commerces sont désormais identifiés par une vraie devanture fixée à
  // leur bâtiment (landmarks.js) : pas de panonceau planté sur le trottoir.
  const panneaux = [];
  const plaqueEquipGeo = new THREE.PlaneGeometry(3.2, 1.0);
  for (const e of poi.equipements) {
    const estCommerce = e.info?.icone === 'commerce'
      || ['pharmacy', 'bank'].includes(e.categorie);
    // Le HUD continue de connaître le lieu, même s'il n'a plus de panneau 3D.
    panneaux.push({ x: e.x, z: e.z, nom: e.nom, label: e.info.label });
    if (estCommerce) continue;

    // Le panneau se plante au bord de la voie la plus proche, tourné vers
    // elle : c'est là que le conducteur peut le lire.
    const pos = surAccotement(e.x, e.z);
    if (!pos.trouve) continue;

    // Rapprochement du commerce quand la voie est loin.
    //
    // Le nœud OSM d'un équipement est au CENTRE de son bâtiment, pas au bord
    // de la rue. Sur un commerce en fond de parcelle, `surAccotement` plantait
    // donc le panneau à vingt mètres de lui, isolé au milieu de son propre
    // parking : le panneau était au bon endroit du point de vue de la voirie,
    // mais ne se rattachait visuellement à rien.
    //
    // On le ramène vers le bâtiment sans le sortir de l'accotement : il reste
    // sur le bord de voie, mais on borne l'écart au lieu qu'il annonce. Le cap
    // n'est pas touché, le panneau devant toujours faire face au conducteur.
    // 14 m : assez pour rester en dehors de l'emprise des plus gros bâtiments
    // signalés (le supermarché du bourg fait 26 m de large, donc 13 m depuis
    // son centre), assez peu pour que le panneau se lise comme appartenant au
    // commerce et non planté au hasard.
    const ECART_MAX = 14;
    const dLieu = Math.hypot(pos.x - e.x, pos.z - e.z);
    if (dLieu > ECART_MAX) {
      const k = ECART_MAX / dLieu;
      pos.x = e.x + (pos.x - e.x) * k;
      pos.z = e.z + (pos.z - e.z) * k;
    }

    const sol = solEn(relief, pos.x, pos.z, roadY);

    const poteau = new THREE.Mesh(poteauGeo, poteauMat);
    poteau.scale.y = 2.9;
    poteau.position.set(pos.x, sol + 1.45, pos.z);
    group.add(poteau);

    // FrontSide uniquement : en DoubleSide, le dos du panneau montre la
    // texture en miroir et le texte se lit à l'envers depuis l'autre voie.
    const mat = new THREE.MeshStandardMaterial({
      map: textureEquipement(e.nom, e.info.label, e.info.couleur),
      roughness: 0.45, side: THREE.FrontSide,
    });
    const plaque = new THREE.Mesh(plaqueEquipGeo, mat);
    const epaisseurPanneau = 0.018;
    const nx = Math.sin(pos.cap), nz = Math.cos(pos.cap);
    plaque.position.set(pos.x + nx * epaisseurPanneau, sol + 3.15,
      pos.z + nz * epaisseurPanneau);
    plaque.rotation.y = pos.cap;
    group.add(plaque);

    // Face arrière neutre, légèrement en retrait : un panneau vu de dos
    // présente sa tôle, pas son texte.
    const dos = new THREE.Mesh(plaqueEquipGeo, new THREE.MeshStandardMaterial({
      color: 0xb9bcc0, roughness: 0.6, metalness: 0.3, side: THREE.FrontSide,
    }));
    dos.position.set(pos.x - nx * epaisseurPanneau, sol + 3.15,
      pos.z - nz * epaisseurPanneau);
    dos.rotation.y = pos.cap + Math.PI;
    group.add(dos);

  }

  // ---- Passages piétons -------------------------------------------------
  // Bandes blanches peintes en travers de la chaussée, orientées selon la voie.
  // Leur usure vient du relevé Panoramax passage par passage : les bandes
  // d'un marquage effacé tirent vers le gris de l'enrobé au lieu du blanc.
  const usures = data.sols?.passages ?? [];
  const usureEn = (x, z) => {
    let u = 0.8, dMin = 3;
    for (const q of usures) {
      const d = Math.hypot(q.x - x, q.z - z);
      if (d < dMin) { dMin = d; u = q.u; }
    }
    return u;
  };
  const bandes = [], bandesCol = [];
  for (const p of poi.passages) {
    // Orientation de la route sous le passage.
    let cap = 0, dMin = Infinity, largeur = 6;
    for (const r of data.roads) {
      if (!r.drivable) continue;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
        if (Math.abs(x1 - p.x) > 30 && Math.abs(z1 - p.z) > 30) continue;
        const dx = x2 - x1, dz = z2 - z1;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        let t = ((p.x - x1) * dx + (p.z - z1) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(p.x - (x1 + dx * t), p.z - (z1 + dz * t));
        if (d < dMin) { dMin = d; cap = Math.atan2(dx, dz); largeur = r.width; }
      }
    }
    if (dMin > 12) continue;   // pas de route à proximité

    // Passage piéton FRANÇAIS : les bandes sont PARALLÈLES à l'axe de la
    // circulation (2,5 m de long, 0,5 m de large, entraxe 1 m), répétées en
    // travers sur la largeur de la chaussée. L'ancienne version dessinait
    // cinq lignes en travers, une échelle plutôt qu'un passage.
    // Clarté de la peinture : blanche, tirée vers le gris par l'usure
    // relevée passage par passage (plancher relevé : un passage même usé
    // reste blanc de loin).
    const usure = usureEn(p.x, p.z);
    const clarte = 0.62 + usure * 0.38;
    const ux = Math.cos(cap), uz = -Math.sin(cap);          // travers de la voie
    const vx = Math.sin(cap), vz = Math.cos(cap);           // axe de la voie
    const DEMI_BANDE = 1.25, LARG_BANDE = 0.5, ENTRAXE = 1.02;
    const nb = Math.max(4, Math.round((largeur - 0.6) / ENTRAXE));
    for (let k = 0; k < nb; k++) {
      const off = (k - (nb - 1) / 2) * ENTRAXE;             // en travers
      const cx = p.x + ux * off, cz = p.z + uz * off;
      const y = solEn(relief, cx, cz, roadY) + 0.02;
      // Rectangle : longueur dans l'axe de la voie, largeur en travers.
      const ax = vx * DEMI_BANDE, az = vz * DEMI_BANDE;
      const bx = ux * (LARG_BANDE / 2), bz = uz * (LARG_BANDE / 2);
      bandes.push(
        cx - ax - bx, y, cz - az - bz,
        cx + ax - bx, y, cz + az - bz,
        cx + ax + bx, y, cz + az + bz,
        cx - ax - bx, y, cz - az - bz,
        cx + ax + bx, y, cz + az + bz,
        cx - ax + bx, y, cz - az + bz,
      );
      for (let v = 0; v < 6; v++) bandesCol.push(clarte, clarte, clarte * 0.985);
    }
  }
  if (bandes.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bandes, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(bandesCol, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      // Blanc franc : la peinture routière neuve est nettement plus claire
      // que l'ancien 0xf0ede4, et l'usure mesurée fait déjà le vieillissement.
      color: 0xfaf8f2, side: THREE.DoubleSide, vertexColors: true,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16,
    }));
    m.renderOrder = 4;
    group.add(m);
  }

  // ---- Ralentisseurs ----------------------------------------------------
  // Dos-d'âne peints en chevrons blancs, visibles de loin.
  const dosAne = [];
  for (const r of poi.ralentisseurs) {
    let cap = 0, dMin = Infinity, largeur = 6;
    for (const rt of data.roads) {
      if (!rt.drivable) continue;
      for (let i = 0; i < rt.pts.length - 1; i++) {
        const [x1, z1] = rt.pts[i], [x2, z2] = rt.pts[i + 1];
        if (Math.abs(x1 - r.x) > 30 && Math.abs(z1 - r.z) > 30) continue;
        const dx = x2 - x1, dz = z2 - z1;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        let t = ((r.x - x1) * dx + (r.z - z1) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(r.x - (x1 + dx * t), r.z - (z1 + dz * t));
        if (d < dMin) { dMin = d; cap = Math.atan2(dx, dz); largeur = rt.width; }
      }
    }
    if (dMin > 10) continue;
    const ux = Math.cos(cap), uz = -Math.sin(cap);
    const vx = Math.sin(cap), vz = Math.cos(cap);
    const demiL = largeur / 2 - 0.2;
    const y = solEn(relief, r.x, r.z, roadY) + 0.03;
    const ax = ux * demiL, az = uz * demiL;
    const bx = vx * 0.9, bz = vz * 0.9;
    dosAne.push(
      r.x - ax - bx, y, r.z - az - bz,
      r.x + ax - bx, y, r.z + az - bz,
      r.x + ax + bx, y, r.z + az + bz,
      r.x - ax - bx, y, r.z - az - bz,
      r.x + ax + bx, y, r.z + az + bz,
      r.x - ax + bx, y, r.z - az + bz,
    );
  }
  if (dosAne.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(dosAne, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xe8dfc8, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -16,
    }));
    m.renderOrder = 4;
    group.add(m);
  }

  // ---- Abribus ----------------------------------------------------------
  const abriMat = new THREE.MeshStandardMaterial({
    color: 0x3d4750, roughness: 0.5, metalness: 0.4,
  });
  for (const a of poi.arrets) {
    // Un abribus se pose plus en retrait qu'un panneau, et son fond est du
    // côté opposé à la route : l'ouverture donne sur la chaussée.
    const pos = surAccotement(a.x, a.z, 2.2);
    if (!pos.trouve) continue;
    const sol = solEn(relief, pos.x, pos.z, roadY);
    const cap = pos.cap;
    const abri = new THREE.Group();
    const toit = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 1.3), abriMat);
    toit.position.y = 2.35;
    abri.add(toit);
    for (const sx of [-1, 1]) {
      const montant = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.3, 0.09), abriMat);
      montant.position.set(sx * 1.2, 1.18, -0.55);
      abri.add(montant);
    }
    // Vitrage : fond et parois latérales transparents, comme les abribus
    // réels du réseau, avec un bandeau opaque en tête qui porte la structure.
    const verre = new THREE.MeshStandardMaterial({
      color: 0x9fb6c2, roughness: 0.08, metalness: 0.1,
      transparent: true, opacity: 0.24, side: THREE.DoubleSide,
    });
    const fond = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 1.75), verre);
    fond.position.set(0, 1.05, -0.6);
    abri.add(fond);
    const bandeau = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.28, 0.04), abriMat);
    bandeau.position.set(0, 2.06, -0.6);
    abri.add(bandeau);
    for (const sx of [-1, 1]) {
      const paroi = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.75), verre);
      paroi.rotation.y = Math.PI / 2;
      paroi.position.set(sx * 1.24, 1.05, -0.05);
      abri.add(paroi);
    }
    // Banc : une lame de bois sur deux pieds, à hauteur d'assise.
    const banc = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.05, 0.34),
      new THREE.MeshStandardMaterial({ color: 0x7a5c3d, roughness: 0.85 }),
    );
    banc.position.set(0, 0.48, -0.38);
    abri.add(banc);
    for (const sx of [-1, 1]) {
      const pied = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.46, 0.3), abriMat);
      pied.position.set(sx * 0.8, 0.24, -0.38);
      abri.add(pied);
    }
    // Cadre d'affichage sur la paroi côté arrivée du bus : une tache claire
    // qui casse la symétrie et se lit comme une affiche horaire.
    const affiche = new THREE.Mesh(
      new THREE.PlaneGeometry(0.52, 0.78),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d2, roughness: 0.6 }),
    );
    affiche.rotation.y = -Math.PI / 2;
    affiche.position.set(1.22, 1.32, -0.05);
    abri.add(affiche);
    abri.position.set(pos.x, sol, pos.z);
    abri.rotation.y = cap;
    group.add(abri);
  }

  // ---- Entrées d'agglomération bilingues --------------------------------
  // Artix est la première commune de France de plus de 3 000 habitants à
  // avoir adopté la signalisation bilingue français/occitan (2000). Le
  // panneau EB10 porte donc ARTIX et, dessous, Artics en graphie béarnaise.
  // Position : sur chaque axe entrant, au dernier point de la route qui reste
  // au contact du bâti continu du bourg.
  {
    const texAgglo = (() => {
      const L = 256, H = 192;
      const c = document.createElement('canvas');
      c.width = L; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(0, 0, L, H);
      ctx.strokeStyle = '#c2342b';
      ctx.lineWidth = 12;
      ctx.strokeRect(8, 8, L - 16, H * 0.62 - 16);
      ctx.fillStyle = '#1a1c20';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `bold ${H * 0.22}px Helvetica, Arial, sans-serif`;
      ctx.fillText('ARTIX', L / 2, H * 0.31 - 6);
      // Panneau complémentaire occitan, cadre plus fin.
      ctx.strokeStyle = '#7b7f83';
      ctx.lineWidth = 5;
      ctx.strokeRect(8, H * 0.66, L - 16, H * 0.30);
      ctx.font = `600 italic ${H * 0.17}px Helvetica, Arial, sans-serif`;
      ctx.fillText('Artics', L / 2, H * 0.81);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropie();
      return t;
    })();
    // Grille grossière du bâti pour mesurer le contact avec le bourg.
    const CEL = 60;
    const bati = new Set();
    for (const b of data.buildings ?? []) {
      let cx = 0, cz = 0;
      for (const [px, pz] of b.pts) { cx += px; cz += pz; }
      cx /= b.pts.length; cz /= b.pts.length;
      bati.add(`${Math.round(cx / CEL)},${Math.round(cz / CEL)}`);
    }
    const contactBati = (x, z) => {
      const gx = Math.round(x / CEL), gz = Math.round(z / CEL);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) if (bati.has(`${gx + i},${gz + j}`)) return true;
      }
      return false;
    };
    const poses = [];
    const matPanneau = new THREE.MeshStandardMaterial({
      map: texAgglo, roughness: 0.35, metalness: 0.15, side: THREE.FrontSide,
    });
    for (const r of data.roads) {
      if (!r.drivable || r.width < 5.6 || r.pts.length < 4) continue;
      // Parcours depuis l'extérieur : premier point encore hors du bâti dont
      // le suivant entre au contact du bourg.
      for (const sens of [1, -1]) {
        const pts = sens === 1 ? r.pts : [...r.pts].reverse();
        const [x0, z0] = pts[0];
        if (Math.hypot(x0, z0) < 550 || contactBati(x0, z0)) continue;
        let pose = null;
        for (let i = 0; i < pts.length - 1; i++) {
          if (contactBati(pts[i + 1][0], pts[i + 1][1])) { pose = i; break; }
        }
        if (pose == null) continue;
        const [x1, z1] = pts[pose], [x2, z2] = pts[pose + 1];
        if (poses.some(([px2, pz2]) => Math.hypot(px2 - x1, pz2 - z1) < 320)) continue;
        const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
        if (len < 1) continue;
        // Sur l'accotement droit du sens entrant, face au conducteur.
        const nx = dz / len, nz = -dx / len;
        const px = x1 + nx * (r.width / 2 + 1.4);
        const pz = z1 + nz * (r.width / 2 + 1.4);
        const sol = solEn(relief, px, pz, roadY);
        const mât = new THREE.Mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 2.6, 8),
          new THREE.MeshStandardMaterial({ color: 0x76797c, roughness: 0.45, metalness: 0.6 }),
        );
        mât.position.set(px, sol + 1.3, pz);
        group.add(mât);
        const panneau = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.79), matPanneau);
        panneau.position.set(px, sol + 2.2, pz);
        // Face au trafic entrant : la normale du plan pointe vers l'extérieur
        // du bourg, à l'opposé du sens de parcours.
        panneau.rotation.y = Math.atan2(-dx, -dz);
        group.add(panneau);
        poses.push([x1, z1]);
      }
      if (poses.length >= 7) break;
    }
  }

  // ---- Enseignes de façade des commerces ---------------------------------
  // Les commerces n'avaient aucun panneau 3D (seul le HUD les connaissait).
  // Sur les panoramiques du bourg, chaque devanture porte son bandeau au
  // dessus de la vitrine : c'est lui qu'on reconstitue, plaqué sur l'arête du
  // bâtiment la plus proche du point OSM du commerce.
  {
    // Les façades couvertes par une photo rectifiée portaient déjà leur vraie
    // enseigne : leur bandeau générique était donc supprimé pour éviter le
    // doublon. Le placage photo étant désactivé (voir PLACAGE_PHOTO dans
    // world.js), cette exclusion laisserait ces commerces muets : la carte
    // reste vide tant que le placage n'est pas rétabli.
    const photoParGraine = new Map();
    const PLACAGE_PHOTO = false;
    if (PLACAGE_PHOTO) {
      for (const f of data.facadesPhoto?.facades ?? []) photoParGraine.set(f.i, f.k);
    }

    const PALETTE_ENSEIGNE = [0x7a2430, 0x24493a, 0x1f2f45, 0x5c3a1e, 0x3a3a3e];
    const textureEnseigne = (nom, teinte) => {
      const L = 512, H = 96;
      const c = document.createElement('canvas');
      c.width = L; c.height = H;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#' + teinte.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, L, H);
      ctx.strokeStyle = '#d8cfb8';
      ctx.lineWidth = 4;
      ctx.strokeRect(6, 6, L - 12, H - 12);
      ctx.fillStyle = '#efe8d8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let taille = 44;
      ctx.font = `bold ${taille}px Georgia, 'Times New Roman', serif`;
      while (ctx.measureText(nom).width > L - 40 && taille > 15) {
        taille -= 2;
        ctx.font = `bold ${taille}px Georgia, 'Times New Roman', serif`;
      }
      ctx.fillText(nom, L / 2, H / 2 + 2);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropie();
      return t;
    };

    for (const e of poi.equipements) {
      if (e.info?.icone !== 'commerce') continue;
      // Enseignes dédiées déjà modélisées dans landmarks.js.
      if (['Maison Chaudron', 'CPC Invest', 'MMA', "Caisse d'Épargne", 'Pharmacie Barrouilhet', "Atmosph'Air", 'Pizzeria',
        'Stéphane Plaza Immobilier', 'Camguilhem', 'Human Immobilier', 'Fleur de Peau',
        'Vins et Délices', 'Amandine Fleurs', 'Boulangerie Nola', 'C. Dolci',
        'Pharmacie de la République', 'Média Immo', 'Centre de Beauté Fanny', 'Vapozen',
        'Allianz', "K'Méléon", 'Hair Libre', 'Les Tontons',
        'Guy Hoquet', 'D. Florès', 'Entendre',
        'Super U', "Mc Donald's", 'Crédit Agricole',
        "C'zen", 'Pharmacie du Plateau', "L'Artisienne", 'Banque Pouyanne',
        'Auberge du Parc', 'Gendarmerie nationale',
        'Intermarché', 'Leader Price', 'Crèche Municipale', 'Calandreta Artics',
        "Pizz'Artix", 'Maison de la santé', 'Gamm Vert', 'Mr.Bricolage', 'Action',
        'CERFRANCE ADOUR OCEAN', 'Bibliothèque Pour Tous', 'E.Leclerc Drive'].includes(e.nom)) continue;
      // Bâtiment porteur : l'emprise dont une arête passe au plus près du
      // point OSM du commerce.
      let porteur = null, meilleure = 18;
      for (const b of data.buildings ?? []) {
        if (!b.pts || b.pts.length < 3) continue;
        let cx = 0, cz = 0;
        for (const [px, pz] of b.pts) { cx += px; cz += pz; }
        cx /= b.pts.length; cz /= b.pts.length;
        if (Math.abs(cx - e.x) > 40 || Math.abs(cz - e.z) > 40) continue;
        const n = b.pts.length;
        for (let k = 0; k < n; k++) {
          const [ax, az] = b.pts[k], [bx, bz] = b.pts[(k + 1) % n];
          const dx = bx - ax, dz = bz - az;
          const l2 = dx * dx + dz * dz;
          if (l2 < 16) continue;
          let t = ((e.x - ax) * dx + (e.z - az) * dz) / l2;
          t = Math.max(0.12, Math.min(0.88, t));
          const px = ax + dx * t, pz = az + dz * t;
          const d = Math.hypot(e.x - px, e.z - pz);
          if (d < meilleure) {
            meilleure = d;
            porteur = { b, k, px, pz, ax, az, bx, bz, cx, cz, len: Math.sqrt(l2) };
          }
        }
      }
      if (!porteur) continue;
      if (photoParGraine.get(porteur.b.graine) === porteur.k) continue;
      const { ax, az, bx, bz, px, pz, cx, cz, len } = porteur;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      let nx = uz, nz = -ux;
      if (nx * (cx - px) + nz * (cz - pz) > 0) { nx = -nx; nz = -nz; }
      const graine = Math.abs(Math.round(e.x * 13 + e.z * 7));
      const teinte = PALETTE_ENSEIGNE[graine % PALETTE_ENSEIGNE.length];
      const largeur = Math.min(len - 1.2, Math.max(2.6, e.nom.length * 0.34));
      // Pas de bandeau plaqué ici : les devantures modélisées de landmarks.js
      // portent déjà le nom du commerce sur la façade. Seule l'enseigne
      // drapeau, qu'elles n'ont pas, est ajoutée.
      const sol = solEn(relief, px, pz, roadY);

      // Enseigne drapeau, perpendiculaire à la façade : c'est elle qu'on lit
      // en arrivant dans l'axe de la rue, le bandeau n'étant visible que de
      // face. La pharmacie porte sa croix verte, lumineuse comme la vraie ;
      // les autres commerces un carré à leur teinte avec l'initiale du nom.
      {
        const estPharmacie = e.categorie === 'pharmacy'
          || /pharmacie/i.test(e.nom ?? '');
        const drapeauTex = (() => {
          const T = 128;
          const c = document.createElement('canvas');
          c.width = c.height = T;
          const ctx = c.getContext('2d');
          if (estPharmacie) {
            ctx.fillStyle = '#0d8a3c';
            ctx.fillRect(0, 0, T, T);
            ctx.fillStyle = '#e9fff0';
            const br = T * 0.17;
            ctx.fillRect(T / 2 - br / 2, T * 0.14, br, T * 0.72);
            ctx.fillRect(T * 0.14, T / 2 - br / 2, T * 0.72, br);
          } else {
            ctx.fillStyle = '#' + teinte.toString(16).padStart(6, '0');
            ctx.fillRect(0, 0, T, T);
            ctx.strokeStyle = '#d8cfb8';
            ctx.lineWidth = 5;
            ctx.strokeRect(5, 5, T - 10, T - 10);
            ctx.fillStyle = '#efe8d8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${T * 0.58}px Georgia, serif`;
            ctx.fillText((e.nom ?? '?').trim().charAt(0).toUpperCase(), T / 2, T / 2 + 4);
          }
          const t2 = new THREE.CanvasTexture(c);
          t2.colorSpace = THREE.SRGBColorSpace;
          t2.anisotropy = anisotropie();
          return t2;
        })();
        const drapeauMat = new THREE.MeshStandardMaterial({
          map: drapeauTex, roughness: 0.5, side: THREE.FrontSide,
          // La croix de pharmacie est un caisson lumineux : émission portée
          // par la texture, active jour et nuit comme les vraies.
          emissive: estPharmacie ? 0xffffff : 0x000000,
          emissiveMap: estPharmacie ? drapeauTex : null,
          emissiveIntensity: estPharmacie ? 0.7 : 0,
        });
        // Ancrage à l'extrémité du bandeau, en saillie de 70 cm.
        const axL = px + ux * (largeur / 2 + 0.25);
        const azL = pz + uz * (largeur / 2 + 0.25);
        const bras = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.06, 0.72),
          new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.5, metalness: 0.5 }),
        );
        bras.position.set(axL + nx * 0.36, sol + 3.32, azL + nz * 0.36);
        bras.rotation.y = Math.atan2(nx, nz);
        group.add(bras);
        // Deux faces dos à dos : en DoubleSide, le verso serait en miroir.
        for (const face of [1, -1]) {
          const drapeau = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), drapeauMat);
          drapeau.position.set(
            axL + nx * 0.52 + ux * 0.012 * face,
            sol + 2.98,
            azL + nz * 0.52 + uz * 0.012 * face,
          );
          drapeau.rotation.y = Math.atan2(ux, uz) + (face > 0 ? 0 : Math.PI);
          group.add(drapeau);
        }
      }
    }
  }

  // ---- Jardinières du carrefour de la mairie ------------------------------
  // Les photographies de la place du Général de Gaulle montrent des bacs
  // maçonnés plantés d'arbustes autour de la placette pavée. Même emprise que
  // le pavage déclaré dans world.js.
  {
    const PLACETTE = { x: -1.3, z: 92.1, rayon: 26 };
    const betonMat = new THREE.MeshStandardMaterial({ color: 0xb9b2a4, roughness: 0.95 });
    const arbusteMat = new THREE.MeshStandardMaterial({ color: 0x3c6132, roughness: 1, flatShading: true });
    const fleursMat = new THREE.MeshStandardMaterial({ color: 0xc25a70, roughness: 0.9, flatShading: true });
    const surVoie = (x, z) => data.roads.some((r) => {
      if (!r.drivable) return false;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
        if (Math.abs(x1 - x) > 60 && Math.abs(z1 - z) > 60) continue;
        const dx = x2 - x1, dz = z2 - z1;
        const l2 = dx * dx + dz * dz;
        if (l2 < 1e-6) continue;
        let t = ((x - x1) * dx + (z - z1) * dz) / l2;
        t = Math.max(0, Math.min(1, t));
        const ddx = x - (x1 + dx * t), ddz = z - (z1 + dz * t);
        if (ddx * ddx + ddz * ddz < (r.width / 2 + 1.1) ** 2) return true;
      }
      return false;
    });
    let posees = 0;
    for (let a = 0; a < 16 && posees < 9; a++) {
      const angle = (a / 16) * Math.PI * 2 + 0.35;
      const px = PLACETTE.x + Math.cos(angle) * (PLACETTE.rayon - 2.2);
      const pz = PLACETTE.z + Math.sin(angle) * (PLACETTE.rayon - 2.2);
      if (surVoie(px, pz)) continue;
      const sol = solEn(relief, px, pz, roadY);
      const bac = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.46, 8), betonMat);
      bac.position.set(px, sol + 0.23, pz);
      group.add(bac);
      const arbuste = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 1), arbusteMat);
      arbuste.scale.y = 0.85;
      arbuste.position.set(px, sol + 0.85, pz);
      group.add(arbuste);
      // Une jardinière sur trois est fleurie : la place n'est pas un massif
      // uniforme.
      if (posees % 3 === 1) {
        const fleurs = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), fleursMat);
        fleurs.position.set(px + 0.3, sol + 0.62, pz + 0.18);
        group.add(fleurs);
      }
      posees++;
    }
  }

  // ---- Poteaux électriques et téléphoniques -------------------------------
  // Positions RÉELLES quand le relevé Panoramax existe : chaque poteau a été
  // vu comme un bâtonnet sombre contre le ciel depuis plusieurs panoramiques,
  // puis triangulé (scripts/panoramax-poteaux.mjs). À défaut, un semis
  // heuristique dans les lotissements, comme avant le relevé.
  {
    const positionsPoteaux = [];
    const releves = data.poteauxReels?.poteaux ?? [];
    if (releves.length >= 20) {
      for (const q of releves) {
        // Traverse perpendiculaire à la voie la plus proche, comme les vrais
        // supports dont la ligne suit la rue. La triangulation porte quelques
        // mètres d'imprécision : aucun poteau sur la chaussée.
        const [qx, qz] = ecarterDeChaussee(data.roads, q.x, q.z, 0.55);
        const r = routeProche(qx, qz, 30);
        positionsPoteaux.push([qx, qz, r.cap, hash(Math.abs(q.x * 7.3 + q.z * 3.1))]);
      }
    } else {
      for (const r of data.roads) {
        if (!r.drivable) continue;
        if (!['residential', 'unclassified'].includes(r.kind)) continue;
        const [x0, z0] = r.pts[0];
        const dist = Math.hypot(x0, z0);
        if (dist < 220 || dist > 1100) continue;
        let cumul = 30;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
          const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz);
          if (len < 1) continue;
          const nx = -dz / len, nz = dx / len;
          let d = 55 - cumul;
          while (d < len) {
            const t = d / len;
            const graine = Math.abs(x1 * 7.3 + z1 * 3.1 + d);
            positionsPoteaux.push([
              x1 + dx * t + nx * (r.width / 2 + 1.15),
              z1 + dz * t + nz * (r.width / 2 + 1.15),
              Math.atan2(dx, dz), hash(graine)]);
            d += 55;
          }
          cumul = (cumul + len) % 55;
        }
      }
    }

    // ---- Chaînage des lignes ---------------------------------------------
    // Les poteaux d'une même voie sont triés par abscisse curviligne. Deux
    // détections à moins de 8 m décrivent le même support (la triangulation
    // dédouble parfois) : la chaîne les enjambe au lieu de se rompre. Une
    // portée détectée de plus de 55 m cache forcément des supports que le
    // relevé a manqués (une portée réelle n'excède guère 50 m) : ils sont
    // interpolés le long de la ligne, plantés ET câblés.
    const liens = [];
    if (positionsPoteaux.length >= 2) {
      const paires = new Set();
      for (const r of data.roads) {
        if (!r.drivable) continue;
        const surVoie = [];
        let base = 0;
        for (let i = 0; i < r.pts.length - 1; i++) {
          const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
          const dx = x2 - x1, dz = z2 - z1;
          const l2 = dx * dx + dz * dz;
          const len = Math.sqrt(l2);
          if (len < 0.5) continue;
          positionsPoteaux.forEach(([px, pz], idx) => {
            if (Math.abs(px - x1) > len + 20 || Math.abs(pz - z1) > len + 20) return;
            let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
            if (t < -0.05 || t > 1.05) return;
            t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
            if (d < 13) surVoie.push({ idx, s: base + t * len });
          });
          base += len;
        }
        surVoie.sort((a, b) => a.s - b.s);
        let ancre = surVoie[0];
        for (let i = 1; i < surVoie.length; i++) {
          const b = surVoie[i];
          const ecart = b.s - ancre.s;
          if (ecart < 8) continue;             // même support dédoublé
          if (ecart <= 220 && ancre.idx !== b.idx) {
            const cle = ancre.idx < b.idx ? `${ancre.idx}-${b.idx}` : `${b.idx}-${ancre.idx}`;
            if (!paires.has(cle)) {
              paires.add(cle);
              liens.push([ancre.idx, b.idx]);
            }
          }
          ancre = b;
        }
      }
      // Interpolation des supports manquants sur les longues portées.
      const liensFinaux = [];
      for (const [ia, ib] of liens) {
        const [xa, za, capA] = positionsPoteaux[ia];
        const [xb, zb] = positionsPoteaux[ib];
        const d = Math.hypot(xb - xa, zb - za);
        if (d <= 55) { liensFinaux.push([ia, ib]); continue; }
        const n = Math.ceil(d / 48);
        let precedent = ia;
        for (let k = 1; k < n; k++) {
          const t = k / n;
          const idx = positionsPoteaux.length;
          positionsPoteaux.push([
            xa + (xb - xa) * t, za + (zb - za) * t, capA,
            hash(Math.abs(xa * 3.1 + zb * 7.7 + k))]);
          liensFinaux.push([precedent, idx]);
          precedent = idx;
        }
        liensFinaux.push([precedent, ib]);
      }
      liens.length = 0;
      liens.push(...liensFinaux);
    }

    // ---- Rendu des supports ----------------------------------------------
    const tetes = positionsPoteaux.map(([px, pz]) => solEn(relief, px, pz, roadY) + 7.05);
    if (positionsPoteaux.length) {
      const poteauGeo = new THREE.CylinderGeometry(0.07, 0.1, 7.4, 6);
      const traverseGeo = new THREE.BoxGeometry(1.0, 0.07, 0.07);
      const boisMat = new THREE.MeshStandardMaterial({ color: 0x74675a, roughness: 1 });
      const poteaux = new THREE.InstancedMesh(poteauGeo, boisMat, positionsPoteaux.length);
      const traverses = new THREE.InstancedMesh(traverseGeo, boisMat, positionsPoteaux.length);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const AXE_Y = new THREE.Vector3(0, 1, 0);
      positionsPoteaux.forEach(([px, pz, cap, g], i) => {
        const sol = solEn(relief, px, pz, roadY);
        q.setFromAxisAngle(AXE_Y, cap);
        m.compose(new THREE.Vector3(px, sol + 3.7, pz), q,
          new THREE.Vector3(1, 0.94 + g * 0.12, 1));
        poteaux.setMatrixAt(i, m);
        m.compose(new THREE.Vector3(px, sol + 7.1, pz), q, new THREE.Vector3(1, 1, 1));
        traverses.setMatrixAt(i, m);
      });
      poteaux.instanceMatrix.needsUpdate = true;
      traverses.instanceMatrix.needsUpdate = true;
      poteaux.castShadow = false;
      traverses.castShadow = false;
      group.add(poteaux);
      group.add(traverses);
    }

    // ---- Câbles ----------------------------------------------------------
    // Caténaire parabolique entre chaque paire chaînée, doublée pour figurer
    // les conducteurs. Ruban vertical fin fusionné en un seul maillage.
    if (liens.length) {
      const cablePos = [];
      const SEGMENTS = 6, EPAISSEUR = 0.05, FLECHE = 0.55;
      for (const [ia, ib] of liens) {
        const [xa, za] = positionsPoteaux[ia];
        const [xb, zb] = positionsPoteaux[ib];
        const ya = tetes[ia], yb = tetes[ib];
        const dx = xb - xa, dz = zb - za;
        const len = Math.hypot(dx, dz);
        if (len < 2) continue;
        const nx = -dz / len, nz = dx / len;
        for (const cote of [-0.18, 0.18]) {
          let px1 = xa + nx * cote, pz1 = za + nz * cote, py1 = ya;
          for (let sg = 1; sg <= SEGMENTS; sg++) {
            const t = sg / SEGMENTS;
            const px2 = xa + dx * t + nx * cote;
            const pz2 = za + dz * t + nz * cote;
            const py2 = ya + (yb - ya) * t - FLECHE * 4 * t * (1 - t);
            cablePos.push(
              px1, py1, pz1, px2, py2, pz2, px2, py2 - EPAISSEUR, pz2,
              px1, py1, pz1, px2, py2 - EPAISSEUR, pz2, px1, py1 - EPAISSEUR, pz1,
            );
            px1 = px2; pz1 = pz2; py1 = py2;
          }
        }
      }
      if (cablePos.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(cablePos, 3));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        group.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({
          color: 0x26272a, roughness: 0.9, side: THREE.DoubleSide,
        })));
      }
    }
  }

  // ---- Feux tricolores ---------------------------------------------------
  // Artix n'en compte aucun. Vérifié sur les données locales et confirmé en
  // direct auprès d'Overpass : zéro `traffic_signals` sur la commune, alors
  // que la même requête y relève 66 stops, 20 cédez-le-passage et 5
  // mini-ronds-points. La collecte n'est donc pas en cause, et Christophe le
  // confirme de sa connaissance de la ville.
  //
  // Une version antérieure en posait douze, déduits des carrefours de voies
  // larges. C'était de l'invention pure, contraire à la règle du projet : la
  // circulation d'Artix se règle aux stops, cédez-le-passage et ronds-points.

  // ---- Châteaux d'eau ---------------------------------------------------
  // Silhouette béarnaise classique : fût cylindrique étroit surmonté d'une
  // cuve tronconique évasée, coiffée d'une couverture plate débordante. Les
  // deux ouvrages d'Artix mesurent 15,1 m et 21,5 m, pour des fûts de 2 m et
  // 4,6 m de rayon.
  const betonMat = new THREE.MeshStandardMaterial({
    color: 0xc9c6bd, roughness: 0.92,
  });
  const betonClair = new THREE.MeshStandardMaterial({
    color: 0xd6d3ca, roughness: 0.88,
  });
  const bandeauMat = new THREE.MeshStandardMaterial({
    color: 0x9aa0a4, roughness: 0.7, metalness: 0.25,
  });

  for (const ce of data.chateauxEau ?? []) {
    const sol = solEn(relief, ce.x, ce.z, roadY) - roadY;
    const H = ce.hauteur;
    const rFut = Math.max(1.6, ce.rayon * 0.78);
    // La cuve déborde nettement du fût : c'est ce porte-à-faux qui donne la
    // silhouette reconnaissable de loin.
    const rCuve = Math.max(rFut * 1.75, ce.rayon * 1.5);
    const hCuve = H * 0.34;
    const yCuve = sol + H - hCuve;

    const tour = new THREE.Group();

    // Fût, très légèrement conique comme les ouvrages coulés en place.
    const fut = new THREE.Mesh(
      new THREE.CylinderGeometry(rFut * 0.94, rFut * 1.06, H - hCuve, 20),
      betonMat,
    );
    fut.position.set(ce.x, sol + (H - hCuve) / 2, ce.z);
    tour.add(fut);

    // Raccord tronconique entre le fût et la cuve.
    const jupe = new THREE.Mesh(
      new THREE.CylinderGeometry(rCuve, rFut * 0.94, hCuve * 0.46, 20),
      betonClair,
    );
    jupe.position.set(ce.x, yCuve + hCuve * 0.23, ce.z);
    tour.add(jupe);

    // Cuve cylindrique.
    const cuve = new THREE.Mesh(
      new THREE.CylinderGeometry(rCuve, rCuve, hCuve * 0.58, 20),
      betonClair,
    );
    cuve.position.set(ce.x, yCuve + hCuve * 0.75, ce.z);
    tour.add(cuve);

    // Bandeau technique en partie haute de cuve.
    const bandeau = new THREE.Mesh(
      new THREE.CylinderGeometry(rCuve * 1.03, rCuve * 1.03, hCuve * 0.12, 20),
      bandeauMat,
    );
    bandeau.position.set(ce.x, yCuve + hCuve * 0.97, ce.z);
    tour.add(bandeau);

    // Couverture plate débordante.
    const toit = new THREE.Mesh(
      new THREE.CylinderGeometry(rCuve * 1.09, rCuve * 1.09, 0.32, 20),
      bandeauMat,
    );
    toit.position.set(ce.x, sol + H + 0.16, ce.z);
    tour.add(toit);

    // Garde-corps et antenne : détails qui se lisent en silhouette.
    const antenne = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.09, H * 0.16, 6),
      bandeauMat,
    );
    antenne.position.set(ce.x, sol + H + H * 0.08, ce.z);
    tour.add(antenne);

    group.add(tour);
  }

  // ---- Mobilier urbain --------------------------------------------------
  // Bancs, corbeilles et bornes. Les bancs étaient collectés depuis OSM mais
  // n'avaient jamais été rendus ; les bornes ne sont pas cartographiées du tout
  // à Artix, alors qu'une rangée protège l'îlot du carrefour de la mairie sur
  // les photographies de rue. Elles sont donc déclarées par leur emprise.
  const boisMat = new THREE.MeshStandardMaterial({ color: 0x6b5540, roughness: 0.85 });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f45, roughness: 0.45, metalness: 0.6,
  });

  // Un banc public : deux piètements et une assise à lattes, réduite ici à un
  // volume plein. À la distance où on le voit en roulant, les lattes ne se
  // distinguent pas et coûteraient six fois plus de triangles.
  const geoAssise = new THREE.BoxGeometry(1.7, 0.08, 0.45);
  const geoDossier = new THREE.BoxGeometry(1.7, 0.38, 0.06);
  const geoPied = new THREE.BoxGeometry(0.07, 0.42, 0.42);
  let nbBancs = 0;
  for (const b of poi.bancs ?? []) {
    const pos = surAccotement(b.x, b.z, 1.4);
    if (!pos.trouve) continue;
    const sol = solEn(relief, pos.x, pos.z, roadY);
    const banc = new THREE.Group();
    const assise = new THREE.Mesh(geoAssise, boisMat);
    assise.position.y = 0.44;
    banc.add(assise);
    const dossier = new THREE.Mesh(geoDossier, boisMat);
    dossier.position.set(0, 0.66, -0.2);
    banc.add(dossier);
    for (const sx of [-1, 1]) {
      const pied = new THREE.Mesh(geoPied, metalMat);
      pied.position.set(sx * 0.72, 0.21, 0);
      banc.add(pied);
    }
    banc.position.set(pos.x, sol, pos.z);
    // Le banc fait face à la chaussée, comme sur les places du bourg.
    banc.rotation.y = pos.cap;
    group.add(banc);
    nbBancs++;
  }

  // Corbeilles de propreté : un fût cylindrique sur pied.
  const geoCorbeille = new THREE.CylinderGeometry(0.21, 0.18, 0.62, 10);
  let nbCorbeilles = 0;
  for (const c of poi.corbeilles ?? []) {
    const pos = surAccotement(c.x, c.z, 1.2);
    if (!pos.trouve) continue;
    const sol = solEn(relief, pos.x, pos.z, roadY);
    const m = new THREE.Mesh(geoCorbeille, metalMat);
    m.position.set(pos.x, sol + 0.5, pos.z);
    group.add(m);
    nbCorbeilles++;
  }

  // Bornes anti-stationnement. Absentes d'OpenStreetMap à Artix : leur emprise
  // est relevée sur les photographies de rue, où elles bordent l'îlot central
  // du carrefour de la mairie pour empêcher le stationnement sur le pavage.
  const BORNES = [
    // Îlot du carrefour de la mairie : un arc de bornes le long du trottoir.
    { x: -1.3, z: 92.1, rayon: 11.5, depuis: 20, jusqu: 200, pas: 2.6 },
  ];
  const geoBorne = new THREE.SphereGeometry(0.17, 8, 6);
  const geoFutBorne = new THREE.CylinderGeometry(0.11, 0.13, 0.62, 8);
  const borneMat = new THREE.MeshStandardMaterial({
    color: 0x9a9691, roughness: 0.72, metalness: 0.15,
  });
  let nbBornes = 0;
  for (const b of BORNES) {
    for (let a = b.depuis; a <= b.jusqu; a += (b.pas / b.rayon) * (180 / Math.PI)) {
      const rad = (a * Math.PI) / 180;
      const x = b.x + Math.cos(rad) * b.rayon;
      const z = b.z + Math.sin(rad) * b.rayon;
      const sol = solEn(relief, x, z, roadY);
      const borne = new THREE.Group();
      const fut = new THREE.Mesh(geoFutBorne, borneMat);
      fut.position.y = 0.31;
      borne.add(fut);
      // Chapeau arrondi : c'est ce qui distingue une borne d'un simple poteau.
      const tete = new THREE.Mesh(geoBorne, borneMat);
      tete.position.y = 0.63;
      borne.add(tete);
      borne.position.set(x, sol, z);
      group.add(borne);
      nbBornes++;
    }
  }

  // Artix n'ayant aucun feu, le cycle n'a rien à animer. La fonction est
  // conservée pour que la boucle de jeu garde un point d'accroche si une
  // commune en comportant devait être chargée un jour.
  const animerFeux = () => {};

  return {
    group,
    panneaux,
    animerFeux,
    stats: {
      stops: nbStop,
      cedez: nbCedez,
      passages: poi.passages.length,
      ralentisseurs: poi.ralentisseurs.length,
      equipements: poi.equipements.length,
      arrets: poi.arrets.length,
      bancs: nbBancs,
      corbeilles: nbCorbeilles,
      bornes: nbBornes,
    },
  };
}
