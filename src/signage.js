// Construction 3D de la signalisation et des panonceaux d'équipements.
import * as THREE from 'three';
import { anisotropie } from './textures.js';
import { CATEGORIES } from './poi.js';

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
    plaque.position.set(pos.x, sol + 2.3, pos.z);
    plaque.rotation.y = pos.cap;
    group.add(plaque);

    // Dos de tôle grise, comme sur un vrai panneau.
    const dos = new THREE.Mesh(plaqueGeo, s.type === 'stop' ? dosStop : dosCedez);
    dos.position.set(pos.x, sol + 2.3, pos.z);
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
  // Un panneau de localisation planté devant chaque commerce ou équipement
  // public nommé, comme les panneaux directionnels d'entrée de bourg.
  const panneaux = [];
  const plaqueEquipGeo = new THREE.PlaneGeometry(3.2, 1.0);
  for (const e of poi.equipements) {
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
    plaque.position.set(pos.x, sol + 3.15, pos.z);
    plaque.rotation.y = pos.cap;
    group.add(plaque);

    // Face arrière neutre, légèrement en retrait : un panneau vu de dos
    // présente sa tôle, pas son texte.
    const dos = new THREE.Mesh(plaqueEquipGeo, new THREE.MeshStandardMaterial({
      color: 0xb9bcc0, roughness: 0.6, metalness: 0.3, side: THREE.FrontSide,
    }));
    dos.position.set(pos.x, sol + 3.15, pos.z);
    dos.rotation.y = pos.cap + Math.PI;
    group.add(dos);

    // La position d'origine sert au HUD : c'est celle du lieu, pas du panneau.
    panneaux.push({ x: e.x, z: e.z, nom: e.nom, label: e.info.label });
  }

  // ---- Passages piétons -------------------------------------------------
  // Bandes blanches peintes en travers de la chaussée, orientées selon la voie.
  const bandes = [];
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

    // Cinq bandes dans le sens de la marche, en travers de la chaussée.
    const ux = Math.cos(cap), uz = -Math.sin(cap);          // travers de la voie
    const vx = Math.sin(cap), vz = Math.cos(cap);           // axe de la voie
    const demiL = largeur / 2 - 0.25;
    const nb = 5, pas = 0.62, larg = 0.34;
    for (let k = 0; k < nb; k++) {
      const off = (k - (nb - 1) / 2) * pas;
      const cx = p.x + vx * off, cz = p.z + vz * off;
      const y = solEn(relief, cx, cz, roadY) + 0.02;
      // Rectangle : longueur en travers, largeur dans l'axe.
      const ax = ux * demiL, az = uz * demiL;
      const bx = vx * (larg / 2), bz = vz * (larg / 2);
      bandes.push(
        cx - ax - bx, y, cz - az - bz,
        cx + ax - bx, y, cz + az - bz,
        cx + ax + bx, y, cz + az + bz,
        cx - ax - bx, y, cz - az - bz,
        cx + ax + bx, y, cz + az + bz,
        cx - ax + bx, y, cz - az + bz,
      );
    }
  }
  if (bandes.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bandes, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xf0ede4, side: THREE.DoubleSide,
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
    const fond = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 1.9),
      new THREE.MeshStandardMaterial({ color: 0x2a3a48, roughness: 0.2, metalness: 0.2 }),
    );
    fond.position.set(0, 1.25, -0.6);
    abri.add(fond);
    abri.position.set(pos.x, sol, pos.z);
    abri.rotation.y = cap;
    group.add(abri);
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
