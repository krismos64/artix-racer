// Bâtiments remarquables d'Artix, modélisés spécifiquement.
//
// Les repères d'une ville ne se reconnaissent pas à leur emprise mais à leur
// silhouette. La mairie est reconstituée d'après les photographies du bourg
// (Wikimedia Commons, CC BY-SA, Jean Michel Etchecolonea) : façade blanche,
// toit mansardé en ardoise à forte pente, rangée de lucarnes, R+1 sur comble.
import * as THREE from 'three';
import { anisotropie } from './textures.js';

// Reconstruit le rectangle englobant orienté d'une emprise : longueur, largeur
// et cap du grand axe. Les bâtiments publics étant sensiblement rectangulaires,
// cela suffit à poser un volume juste.
function boiteOrientee(pts) {
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x; cz += z; }
  cx /= pts.length; cz /= pts.length;

  let sxx = 0, szz = 0, sxz = 0;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
  }
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ax = Math.cos(theta), az = Math.sin(theta);

  let lmin = Infinity, lmax = -Infinity, wmin = Infinity, wmax = -Infinity;
  for (const [x, z] of pts) {
    const dx = x - cx, dz = z - cz;
    const l = dx * ax + dz * az;
    const w = -dx * az + dz * ax;
    lmin = Math.min(lmin, l); lmax = Math.max(lmax, l);
    wmin = Math.min(wmin, w); wmax = Math.max(wmax, w);
  }
  return {
    cx: cx + ax * (lmin + lmax) / 2 - az * (wmin + wmax) / 2,
    cz: cz + az * (lmin + lmax) / 2 + ax * (wmin + wmax) / 2,
    longueur: lmax - lmin,
    largeur: wmax - wmin,
    cap: theta,
  };
}

// Texture du fronton : « LIBERTÉ ÉGALITÉ FRATERNITÉ », comme sur la façade.
function textureDevise() {
  const L = 1024, H = 128;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(0, 0, L, H);
  ctx.fillStyle = '#8c8378';
  ctx.font = `600 ${H * 0.42}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText('LIBERTÉ  ÉGALITÉ  FRATERNITÉ', L / 2, H / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

// Enseigne du Leclerc Express de l'avenue Maréchal Leclerc de Hautecloque.
//
// Dessinée en canvas comme toutes les textures du projet, à partir des
// éléments observés sur place : le sigle carré bleu portant un E blanc, le nom
// en bas-de-casse bleu, et la mention EXPRESS en capitales sur pavé bleu.
// Aucun fichier d'image n'est importé.
//
// Le bleu relevé sur la devanture est un outremer soutenu, nettement plus
// sombre qu'un bleu primaire : c'est lui qui porte la lecture de l'enseigne
// depuis l'avenue.
const BLEU_ENSEIGNE = '#0b3d91';

function textureEnseigne() {
  const L = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  // Fond blanc du bandeau : la devanture est un long panneau clair sur lequel
  // le lettrage se détache.
  ctx.fillStyle = '#f7f7f5';
  ctx.fillRect(0, 0, L, H);

  // Sigle : carré bleu à coins vifs portant un E blanc, à gauche du nom.
  const cote = H * 0.62;
  const sx = L * 0.10, sy = (H - cote) / 2;
  ctx.fillStyle = BLEU_ENSEIGNE;
  ctx.fillRect(sx, sy, cote, cote);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${cote * 0.74}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', sx + cote / 2, sy + cote / 2 + cote * 0.02);

  // Nom en bas-de-casse, la forme qu'il prend sur les devantures.
  ctx.fillStyle = BLEU_ENSEIGNE;
  ctx.font = `700 ${H * 0.46}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('Leclerc', sx + cote * 1.35, H / 2);

  // Mention EXPRESS : capitales blanches sur pavé bleu, à la suite du nom.
  const wNom = ctx.measureText('Leclerc').width;
  const px = sx + cote * 1.35 + wNom + H * 0.10;
  const pw = L - px - L * 0.06, ph = H * 0.34;
  ctx.fillStyle = BLEU_ENSEIGNE;
  ctx.fillRect(px, (H - ph) / 2, pw, ph);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${ph * 0.62}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '3px';
  ctx.fillText('EXPRESS', px + pw / 2, H / 2 + 1);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

// Panonceau carré du sigle seul, posé en façade de part et d'autre de
// l'entrée : deux exemplaires sur le bâtiment réel.
function texturePanonceau() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  // Cadre bleu, laissant une marge blanche comme sur les panneaux réels.
  const m = S * 0.12;
  ctx.fillStyle = BLEU_ENSEIGNE;
  ctx.fillRect(m, m, S - 2 * m, S - 2 * m);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${S * 0.52}px Helvetica, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('E', S / 2, S / 2 + S * 0.02);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

// Mairie d'Artix : 27,1 × 17,4 m, façade blanche, toit mansardé en ardoise.
function construireMairie(boite, solY) {
  const g = new THREE.Group();
  const { longueur: L, largeur: W } = boite;

  // Matériaux volontairement opaques et double face. La mairie est composée
  // de volumes et de pans de toiture procéduraux convertis vers Babylon.js ;
  // une face arrière éliminée donnait l'impression d'un bâtiment transparent
  // en vue oblique.
  const facade = new THREE.MeshStandardMaterial({
    color: 0xeeeae2, roughness: 0.88, side: THREE.DoubleSide,
    transparent: false, opacity: 1, depthWrite: true,
  });
  const ardoise = new THREE.MeshStandardMaterial({
    color: 0x303941, roughness: 0.78, flatShading: true,
    side: THREE.DoubleSide, transparent: false, opacity: 1, depthWrite: true,
  });
  const menuiserie = new THREE.MeshStandardMaterial({
    color: 0xf3efe6, roughness: 0.58, side: THREE.DoubleSide,
    transparent: false, opacity: 1, depthWrite: true,
  });
  const vitrage = new THREE.MeshStandardMaterial({
    color: 0x243440, roughness: 0.26, metalness: 0.05,
    side: THREE.DoubleSide, transparent: false, opacity: 1, depthWrite: true,
  });

  // --- Corps de bâtiment : rez-de-chaussée et étage, façade blanche -------
  const hMur = 7.4;
  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, hMur, W), facade);
  corps.position.y = hMur / 2;
  g.add(corps);

  // Bandeau mouluré séparant l'étage du comble.
  const bandeau = new THREE.Mesh(new THREE.BoxGeometry(L + 0.5, 0.38, W + 0.5), facade);
  bandeau.position.y = hMur + 0.19;
  g.add(bandeau);

  // --- Toit mansardé -----------------------------------------------------
  // Le brisis (pan inférieur très pentu) fait tout le caractère du bâtiment.
  const hBrisis = 3.6;
  const retrait = 2.6;   // recul du terrasson par rapport à l'égout

  const brisis = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, hBrisis, 4, 1, true),
    ardoise,
  );
  // Un cylindre à 4 faces est un tronc de pyramide : on le met aux cotes du
  // bâtiment par une mise à l'échelle non uniforme.
  brisis.scale.set(1, 1, 1);
  brisis.geometry.dispose();
  // Construction manuelle : quatre pans trapézoïdaux entre l'égout et le
  // terrasson, chacun légèrement débordant.
  const hb = L / 2 + 0.42, wb = W / 2 + 0.42;
  const ht = L / 2 - retrait, wt = W / 2 - retrait;
  const y0 = hMur + 0.38, y1 = y0 + hBrisis;
  const pos = [];
  const quad = (a, b, c, d) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  };
  quad([-hb, y0, wb], [hb, y0, wb], [ht, y1, wt], [-ht, y1, wt]);      // avant
  quad([hb, y0, -wb], [-hb, y0, -wb], [-ht, y1, -wt], [ht, y1, -wt]);  // arrière
  quad([hb, y0, wb], [hb, y0, -wb], [ht, y1, -wt], [ht, y1, wt]);      // droite
  quad([-hb, y0, -wb], [-hb, y0, wb], [-ht, y1, wt], [-ht, y1, -wt]);  // gauche
  const geoBrisis = new THREE.BufferGeometry();
  geoBrisis.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geoBrisis.computeVertexNormals();
  const meshBrisis = new THREE.Mesh(geoBrisis, ardoise);
  g.add(meshBrisis);

  // Terrasson : pan supérieur presque plat, coiffant l'ensemble.
  const terrasson = new THREE.Mesh(
    new THREE.BoxGeometry(L - retrait * 2, 0.5, W - retrait * 2),
    ardoise,
  );
  terrasson.position.y = y1 + 0.25;
  g.add(terrasson);

  // --- Lucarnes : la rangée qui signe la façade --------------------------
  // Sur la photo, sept lucarnes à fronton triangulaire percent le brisis.
  const nbLucarnes = Math.max(4, Math.min(8, Math.round(L / 3.6)));
  for (let i = 0; i < nbLucarnes; i++) {
    const t = (i + 0.5) / nbLucarnes;
    const x = -L / 2 + t * L;
    for (const sz of [1, -1]) {
      const luc = new THREE.Group();
      // Joue de lucarne, avancée sur le pan de toit.
      const joue = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.5, 1.1), facade);
      luc.add(joue);
      // Fronton triangulaire.
      const fronton = new THREE.Mesh(
        new THREE.ConeGeometry(0.92, 0.62, 4),
        facade,
      );
      fronton.rotation.y = Math.PI / 4;
      fronton.position.y = 1.06;
      luc.add(fronton);
      // Fenêtre de la lucarne.
      const fen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.0), vitrage);
      fen.position.set(0, 0.05, sz * 0.57);
      if (sz < 0) fen.rotation.y = Math.PI;
      luc.add(fen);

      // Position sur le brisis, à mi-hauteur du pan.
      const prof = (wb + wt) / 2 + 0.12;
      luc.position.set(x, y0 + hBrisis * 0.46, sz * prof);
      g.add(luc);
    }
  }

  // --- Percements de façade ----------------------------------------------
  // Deux niveaux de fenêtres hautes, régulièrement espacées.
  const nbTravees = Math.max(4, Math.min(9, Math.round(L / 3.2)));
  for (let i = 0; i < nbTravees; i++) {
    const t = (i + 0.5) / nbTravees;
    const x = -L / 2 + t * L;
    for (const sz of [1, -1]) {
      for (const [y, h] of [[2.1, 2.0], [5.2, 1.8]]) {
        // Boîtes minces plutôt que plans : les encadrements restent visibles
        // sur les deux faces après conversion vers le repère droit Babylon.
        const cadre = new THREE.Mesh(new THREE.BoxGeometry(1.38, h + 0.26, 0.16), menuiserie);
        cadre.position.set(x, y, sz * (W / 2 + 0.07));
        g.add(cadre);
        const vitre = new THREE.Mesh(new THREE.BoxGeometry(1.10, h - 0.04, 0.12), vitrage);
        vitre.position.set(x, y, sz * (W / 2 + 0.17));
        g.add(vitre);
      }
    }
  }

  // Jardinières fleuries visibles sur la façade réelle : elles apportent les
  // roses et pourpres qui manquaient au centre civique sans transformer la
  // mairie en décor fantaisiste.
  const bacMat = new THREE.MeshStandardMaterial({ color: 0x4a4037, roughness: 0.95 });
  const feuilleMat = new THREE.MeshStandardMaterial({ color: 0x35613a, roughness: 1 });
  const fleurMats = [0xb92f58, 0xe58aa4, 0x8c4f9c, 0xf0d7bf]
    .map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.86 }));
  for (let i = 0; i < nbTravees; i++) {
    const x = -L / 2 + ((i + 0.5) / nbTravees) * L;
    const bac = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 0.34), bacMat);
    bac.position.set(x, 4.18, W / 2 + 0.31);
    g.add(bac);
    for (let f = 0; f < 5; f++) {
      const touffe = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.16 + (f % 2) * 0.025, 0),
        f % 3 === 0 ? fleurMats[(i + f) % fleurMats.length] : feuilleMat,
      );
      touffe.position.set(x - 0.44 + f * 0.22, 4.42 + (f % 2) * 0.05, W / 2 + 0.34);
      g.add(touffe);
    }
  }
  // Fenêtres sur les pignons.
  for (const sx of [1, -1]) {
    for (const [y, h] of [[2.1, 2.0], [5.2, 1.8]]) {
      for (const off of [-W / 4, W / 4]) {
        const vitre = new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 1.12), vitrage);
        vitre.position.set(sx * (L / 2 + 0.11), y, off);
        g.add(vitre);
      }
    }
  }

  // --- Devise républicaine en façade -------------------------------------
  const devise = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 0.62, 0.8),
    new THREE.MeshStandardMaterial({ map: textureDevise(), roughness: 0.7, side: THREE.DoubleSide }),
  );
  devise.position.set(0, 6.9, W / 2 + 0.06);
  g.add(devise);

  // --- Entrée : porte vitrée et marches ----------------------------------
  const porte = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.14), vitrage);
  porte.position.set(0, 1.35, W / 2 + 0.16);
  g.add(porte);

  // Encadrement central et marquise : la façade conserve une entrée lisible
  // même vue rapidement depuis l'avenue.
  const encadrement = new THREE.Mesh(
    new THREE.BoxGeometry(3.15, 3.12, 0.22), menuiserie);
  encadrement.position.set(0, 1.56, W / 2 + 0.08);
  g.add(encadrement);
  // Reposer la porte devant l'encadrement afin qu'elle ne soit pas masquée.
  porte.position.z = W / 2 + 0.23;
  const marquise = new THREE.Mesh(
    new THREE.BoxGeometry(3.7, 0.18, 1.05), ardoise);
  marquise.position.set(0, 3.0, W / 2 + 0.55);
  g.add(marquise);
  const perron = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.36, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xdcd8d0, roughness: 0.9 }),
  );
  perron.position.set(0, 0.18, W / 2 + 0.8);
  g.add(perron);

  // --- Mât et drapeau ----------------------------------------------------
  const matMetal = new THREE.MeshStandardMaterial({ color: 0xd4d6d5, roughness: 0.42, metalness: 0.45 });
  for (let m = 0; m < 3; m++) {
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 7, 6), matMetal);
    mat.position.set(-1.3 + m * 1.3, 3.5, W / 2 + 1.65);
    g.add(mat);
  }

  // Drapeau français, opaque, orienté parallèlement à la façade.
  const couleursDrapeau = [0x21468b, 0xf2f0ea, 0xd33a3d];
  for (let i = 0; i < 3; i++) {
    const pan = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 1.05),
      new THREE.MeshStandardMaterial({ color: couleursDrapeau[i], roughness: 0.82, side: THREE.DoubleSide }),
    );
    pan.position.set(-1.3 + 0.21 + i * 0.42, 6.2, W / 2 + 1.68);
    g.add(pan);
  }

  return g;
}

// Construit tous les bâtiments remarquables identifiés dans les données.
// Immeuble d'angle à pan arrondi. Le bâti du centre-bourg d'Artix compte
// plusieurs immeubles de rapport dont l'angle sur rue est arrondi, ce que
// l'extrusion d'une emprise cadastrale rend en arête vive. Relevé sur
// photographie de rue : R+1 sur rez-de-chaussée commercial, volets battants
// blancs à l'étage, corniche marquée, toiture d'ardoise à faible pente.
function construireAngleArrondi(boite, hauteur) {
  const g = new THREE.Group();
  const L = boite.longueur, l = boite.largeur;
  // Rayon du pan coupé : borné pour rester crédible sur une emprise étroite.
  const rayon = Math.min(l * 0.42, 3.2);

  const murMat = new THREE.MeshStandardMaterial({ color: 0xd6cfc2, roughness: 0.92 });
  const socleMat = new THREE.MeshStandardMaterial({ color: 0x53534f, roughness: 0.8 });
  const toitMat = new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.75 });
  const volet = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 });

  const hSocle = 3.1;                       // rez-de-chaussée commercial
  const hEtage = Math.max(2.8, hauteur - hSocle - 0.7);

  // Corps principal, en deux volumes : le socle plus sombre des devantures et
  // l'étage enduit clair.
  const socle = new THREE.Mesh(new THREE.BoxGeometry(L, hSocle, l), socleMat);
  socle.position.y = hSocle / 2;
  g.add(socle);
  const etage = new THREE.Mesh(new THREE.BoxGeometry(L, hEtage, l), murMat);
  etage.position.y = hSocle + hEtage / 2;
  g.add(etage);

  // Le pan arrondi : un demi-cylindre plaqué à l'extrémité de l'emprise, sur
  // toute la hauteur. C'est lui qui donne sa silhouette à l'immeuble d'angle.
  for (const [y, h, mat] of [[hSocle / 2, hSocle, socleMat],
    [hSocle + hEtage / 2, hEtage, murMat]]) {
    const rond = new THREE.Mesh(
      new THREE.CylinderGeometry(rayon, rayon, h, 14, 1, false, -Math.PI / 2, Math.PI),
      mat,
    );
    rond.position.set(L / 2, y, 0);
    rond.rotation.y = Math.PI / 2;
    g.add(rond);
  }

  // Corniche : un bandeau débordant sous la toiture, très marqué sur ces
  // immeubles. Sans lui, le volume se lit comme une simple boîte.
  const corniche = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.5, 0.28, l + 0.5), murMat);
  corniche.position.y = hSocle + hEtage + 0.14;
  g.add(corniche);

  // Volets battants blancs, par paires de part et d'autre des baies.
  const nBaies = Math.max(2, Math.round(L / 2.6));
  const geoVolet = new THREE.BoxGeometry(0.42, 1.32, 0.05);
  for (let i = 0; i < nBaies; i++) {
    const x = -L / 2 + (L / nBaies) * (i + 0.5);
    for (const cote of [-1, 1]) {
      for (const dx of [-0.55, 0.55]) {
        const v = new THREE.Mesh(geoVolet, volet);
        v.position.set(x + dx, hSocle + hEtage * 0.55, cote * (l / 2 + 0.03));
        g.add(v);
      }
    }
  }

  // Les deux commerces réellement présents sur ce rez-de-chaussée sont lus
  // comme des boutiques, pas comme un socle sombre uniforme. L'un a son store
  // déployé, l'autre son rideau baissé : cela donne immédiatement de la vie au
  // carrefour sans ajouter de panneaux sur le trottoir.
  const boutiquesAngle = [
    { nom: 'VAPOZEN', x: -L * .23, fond: '#315d68', ouverte: true },
    { nom: 'CENTRE BEAUTÉ', x: L * .18, fond: '#7b4662', ouverte: false },
  ];
  for (const boutique of boutiquesAngle) {
    const dev = creerDevantureCommerce(boutique.nom, Math.min(6.8, L * .34),
      boutique.fond, boutique.ouverte);
    dev.position.set(boutique.x, 0, l / 2 + .08);
    g.add(dev);
  }

  // Toiture d'ardoise à faible pente, débordant de la corniche.
  const toit = new THREE.Mesh(new THREE.BoxGeometry(L + 0.8, 0.5, l + 0.8), toitMat);
  toit.position.y = hSocle + hEtage + 0.5;
  g.add(toit);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Cyprès. Les photographies du centre-bourg en montrent plusieurs, élancés et
// sombres, à côté des feuillus ronds que le jeu plantait partout : une
// silhouette conique très reconnaissable, qui manquait à la végétation.
export function construireCypres(hauteur = 8) {
  const g = new THREE.Group();
  const troncMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 });
  const feuilleMat = new THREE.MeshStandardMaterial({
    color: 0x24422a, roughness: 1, flatShading: true,
  });
  const tronc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, hauteur * 0.22, 6), troncMat);
  tronc.position.y = hauteur * 0.11;
  g.add(tronc);
  // Trois cônes emboîtés : un seul cône donne une pointe trop régulière, trois
  // suggèrent la masse dense et irrégulière d'un cyprès.
  const etages = [[0.20, 0.62, 1.15], [0.48, 0.44, 0.85], [0.72, 0.30, 0.62]];
  for (const [base, rayon, hauteurRel] of etages) {
    const c = new THREE.Mesh(
      new THREE.ConeGeometry(rayon, hauteur * hauteurRel * 0.55, 7), feuilleMat);
    c.position.y = hauteur * base + hauteur * hauteurRel * 0.275;
    g.add(c);
  }
  return g;
}

// Immeuble de rue à pignon central, type « Au Comptoir ».
//
// Long bâtiment de bourg (39 x 11 m dans la BD TOPO) abritant plusieurs
// commerces en rez-de-chaussée. Relevé sur photographie de rue :
//   - rez-de-chaussée commercial à 2,98 m, devantures sombres en applique
//   - égout de toiture à 6,43 m, faîtage du pignon à 8,76 m
//   - un avant-corps central en pignon, surmonté d'une lucarne cintrée : c'est
//     lui qui donne son visage au bâtiment et qu'une extrusion d'emprise perd
//   - toiture de tuiles rouges à deux pans, débordante
//   - volets roulants blancs à l'étage
//
// Barre de logements « Pyrénées », avenue Edmond Rostand. Cinquième repère
// modélisé à la main, et le premier immeuble collectif du jeu.
//
// Relevé sur une vue Panoramax du 13 janvier 2025 (`refs/avenue-edmond-rostand.png`)
// recoupée avec les données. C'est le bâtiment le mieux documenté du lot : la
// BD TOPO donne ici les attributs qui manquaient aux précédents.
//
//   - emprise et cap : BD TOPO 2150, 62,36 x 9,20 m, 555 m², cap 22,2 degrés
//   - **3 étages et 24 logements** déclarés, ce qui fixe le découpage en
//     niveaux sans avoir à le déduire de la photo
//   - toiture : LiDAR HD, **monopente**, gouttière 10,1 m, faîtage 11,8 m.
//     La photo laissait croire à deux pans, c'était la perspective : le
//     versant unique descend vers la rue
//
// Éléments relevés à la vue, absents de toute donnée : les bandeaux saillants
// entre niveaux, le soubassement ocre, les marquises d'entrée en charpente
// métallique, et l'enseigne verticale « PYRÉNÉES » sur potence.
function construireBarreLogements(dims) {
  const g = new THREE.Group();
  const { longueur: L, largeur: l } = dims;

  // Hauteurs : la gouttière LiDAR (10,1 m) répartie sur les 3 niveaux
  // déclarés par la BD TOPO, plus un soubassement.
  const H_SOCLE = 0.75;
  const H_GOUTTIERE = 10.1;
  const H_FAITE = 11.8;
  const NIVEAUX = 3;
  const hNiveau = (H_GOUTTIERE - H_SOCLE) / NIVEAUX;
  // Côté rue, en z local. Mesuré : ce flanc est à 22,1 m de l'axe de l'avenue
  // Edmond Rostand contre 37,4 m pour l'autre. Les entrées, l'enseigne et le
  // point bas de la monopente s'y rapportent tous, d'où une constante plutôt
  // qu'un signe recopié à cinq endroits.
  const Z_RUE = -1;

  // Teintes mesurées sur la photo par rapport de luminance. Le crème est
  // nettement plus chaud que le blanc cassé du centre-bourg : c'est une
  // opération de logement social des années 1960, pas du bâti ancien.
  // Le soubassement est à 0,96 de la clarté du mur mais bien plus saturé
  // (chromaticité rouge 0,417 contre 0,375), d'où l'ocre et non un simple gris.
  const enduitMat = new THREE.MeshStandardMaterial({ color: 0xd0c09a, roughness: 0.93 });
  const socleMat = new THREE.MeshStandardMaterial({ color: 0xc9a866, roughness: 0.9 });
  const bandeauMat = new THREE.MeshStandardMaterial({ color: 0xdcd2b4, roughness: 0.88 });
  const tuileMat = new THREE.MeshStandardMaterial({ color: 0x8d6a4e, roughness: 0.9 });
  const menuiserieMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.6 });
  const vitreMat = new THREE.MeshStandardMaterial({
    color: 0x2c3338, roughness: 0.25, metalness: 0.3,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x6a6f70, roughness: 0.55, metalness: 0.5,
  });

  // ---- Soubassement ------------------------------------------------------
  // Légèrement débordant : c'est ce ressaut qui porte l'ombre au pied du mur.
  const socle = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.16, H_SOCLE, l + 0.16), socleMat);
  socle.position.y = H_SOCLE / 2;
  g.add(socle);

  // ---- Corps du bâtiment -------------------------------------------------
  const corps = new THREE.Mesh(
    new THREE.BoxGeometry(L, H_GOUTTIERE - H_SOCLE, l), enduitMat);
  corps.position.y = H_SOCLE + (H_GOUTTIERE - H_SOCLE) / 2;
  g.add(corps);

  // ---- Bandeaux d'étage --------------------------------------------------
  // Fins ressauts horizontaux qui courent sur toute la longueur. Ce sont eux
  // qui donnent son rythme à la façade : sans eux, une barre de 62 m devient
  // un mur nu de 10 m de haut.
  const geoBandeau = new THREE.BoxGeometry(L + 0.2, 0.26, l + 0.2);
  for (let i = 1; i < NIVEAUX; i++) {
    const b = new THREE.Mesh(geoBandeau, bandeauMat);
    b.position.y = H_SOCLE + i * hNiveau;
    g.add(b);
  }
  // Bandeau de couronnement, sous la gouttière.
  const couronnement = new THREE.Mesh(geoBandeau, bandeauMat);
  couronnement.position.y = H_GOUTTIERE - 0.14;
  g.add(couronnement);

  // ---- Fenêtres ----------------------------------------------------------
  // 24 logements sur 3 niveaux, soit 8 logements par niveau. Chacun ouvre par
  // deux baies en façade, d'où 16 travées et un entraxe de 3,9 m. Un comptage
  // direct sur la photo n'était pas exploitable : la vue est si rasante que
  // l'entraxe apparent passe de 226 à 22 pixels d'un bout à l'autre du
  // cliché. Le pignon reste aveugle, aucune ouverture sur les petits côtés :
  // c'est le trait le plus marquant du bâtiment vu de l'avenue.
  const NB_TRAVEES = 16;
  const pas = L / NB_TRAVEES;
  const largBaie = 1.2, hautBaie = 1.3;
  // Instanciation obligatoire : 16 travées sur 3 niveaux et deux façades font
  // 96 baies, soit 192 maillages si on les ajoute un par un. Mesuré ainsi,
  // l'immeuble coûtait 4,5 fps pour seulement 2 536 triangles : le poste
  // dominant était le nombre d'appels de dessin, pas la géométrie. Deux
  // InstancedMesh remplacent les 192 objets.
  const nBaies = NB_TRAVEES * NIVEAUX * 2;
  const geoVitre = new THREE.BoxGeometry(largBaie, hautBaie, 0.08);
  const geoCadre = new THREE.BoxGeometry(largBaie + 0.16, hautBaie + 0.16, 0.05);
  const cadres = new THREE.InstancedMesh(geoCadre, menuiserieMat, nBaies);
  const vitres = new THREE.InstancedMesh(geoVitre, vitreMat, nBaies);
  const mBaie = new THREE.Matrix4();
  let iB = 0;
  for (let t = 0; t < NB_TRAVEES; t++) {
    const x = -L / 2 + pas * (t + 0.5);
    for (let n = 0; n < NIVEAUX; n++) {
      const y = H_SOCLE + n * hNiveau + hNiveau * 0.55;
      for (const cote of [-1, 1]) {
        mBaie.makeTranslation(x, y, cote * (l / 2 + 0.03));
        cadres.setMatrixAt(iB, mBaie);
        mBaie.makeTranslation(x, y, cote * (l / 2 + 0.06));
        vitres.setMatrixAt(iB, mBaie);
        iB++;
      }
    }
  }
  cadres.instanceMatrix.needsUpdate = true;
  vitres.instanceMatrix.needsUpdate = true;
  g.add(cadres, vitres);

  // ---- Marquises d'entrée ------------------------------------------------
  // Auvents en charpente métallique au-dessus des halls, côté rue seulement.
  // Trois cages d'escalier pour 24 logements, soit une entrée toutes les deux
  // travées et demie.
  // Porche maçonné en avant-corps, relevé sur la seconde vue Panoramax du
  // 8 janvier 2025 : un volume enduit saillant, couvert d'un appentis de
  // tuiles à gouttière débordante, et une menuiserie blanche toute hauteur
  // (double vantail encadré de panneaux vitrés fixes). Une première version
  // en dalle métallique sur poteaux était fausse : les joues du porche sont
  // des murs pleins, et la couverture est en tuile comme le reste.
  //
  // Instanciés, comme les baies : trois entrées font une quinzaine d'objets
  // ajoutés un par un, et c'est le nombre d'appels de dessin qui pèse ici.
  const NB_ENTREES = 3;
  // Proportions relevées sur le zoom du hall, la menuiserie servant de mètre
  // étalon (porte 2,05 m plus imposte, soit 2,4 m) : 2,53 m sous la sous-face
  // de l'auvent. Le porche est large et peu saillant, pas l'inverse.
  const SAILLIE_PORCHE = 1.5;
  const LARG_PORCHE = 4.2;
  const H_PORCHE = 2.6;
  const zNu = Z_RUE * (l / 2);

  // Joues larges : mesurées sur la photo, elles occupent 0,21 de la largeur du
  // porche chacune contre 0,55 pour la menuiserie, soit 0,86 m pour 2,30 m.
  // La prise de vue étant oblique, la joue éloignée y est écrasée (85 px
  // contre 110) : on retient une valeur intermédiaire.
  const LARG_JOUE = 0.7;
  const geoJoue = new THREE.BoxGeometry(LARG_JOUE, H_PORCHE, SAILLIE_PORCHE);
  // L'auvent part du nu de la façade et déborde vers l'avant seulement : une
  // boîte centrée sur la saillie laissait un vide entre son arrière et le mur,
  // et on voyait la façade passer entre l'auvent et les joues.
  const DEBORD_AUVENT = 0.35;
  const geoAuvent = new THREE.BoxGeometry(
    LARG_PORCHE + 0.5, 0.22, SAILLIE_PORCHE + DEBORD_AUVENT);
  const geoBaieHall = new THREE.BoxGeometry(
    LARG_PORCHE - 2 * LARG_JOUE, H_PORCHE - 0.35, 0.1);
  const geoSeuil = new THREE.BoxGeometry(LARG_PORCHE + 0.3, 0.16, SAILLIE_PORCHE + 0.3);

  const joues = new THREE.InstancedMesh(geoJoue, enduitMat, NB_ENTREES * 2);
  const auvents = new THREE.InstancedMesh(geoAuvent, tuileMat, NB_ENTREES);
  const baiesHall = new THREE.InstancedMesh(geoBaieHall, vitreMat, NB_ENTREES);
  const seuils = new THREE.InstancedMesh(geoSeuil, socleMat, NB_ENTREES);
  const mE = new THREE.Matrix4();
  for (let e = 0; e < NB_ENTREES; e++) {
    const x = -L / 2 + L * (e + 0.5) / NB_ENTREES;
    // Joues latérales : deux murets pleins qui portent l'auvent.
    [-1, 1].forEach((sx, k) => {
      // Les joues descendent jusqu'au sol, devant le soubassement : ce sont
      // des murs pleins, pas des poteaux posés sur le socle.
      mE.makeTranslation(x + sx * (LARG_PORCHE - LARG_JOUE) / 2,
        H_PORCHE / 2, zNu + Z_RUE * (SAILLIE_PORCHE / 2));
      joues.setMatrixAt(e * 2 + k, mE);
    });
    // Appentis de tuiles : posé sur les joues, adossé à la façade, débordant
    // vers l'avant. Le centre est donc décalé de la moitié du débord.
    mE.makeTranslation(x, H_PORCHE + 0.11,
      zNu + Z_RUE * ((SAILLIE_PORCHE + DEBORD_AUVENT) / 2));
    auvents.setMatrixAt(e, mE);
    // Menuiserie du hall, au nu de la façade sous le porche.
    mE.makeTranslation(x, (H_PORCHE - 0.35) / 2 + 0.16, zNu + Z_RUE * 0.06);
    baiesHall.setMatrixAt(e, mE);
    // Seuil béton, légèrement débordant.
    mE.makeTranslation(x, 0.08, zNu + Z_RUE * (SAILLIE_PORCHE / 2));
    seuils.setMatrixAt(e, mE);
  }
  for (const im of [joues, auvents, baiesHall, seuils]) im.instanceMatrix.needsUpdate = true;
  g.add(joues, auvents, baiesHall, seuils);

  // ---- Enseignes des cages d'escalier ------------------------------------
  // Chaque entrée porte le nom d'une vallée béarnaise sur un panneau
  // vertical en drapeau (« OSSAU » et « …ETOUS » lisibles sur la photo de
  // l'avenue ; la troisième vallée est l'Aspe).
  const VALLEES = ['OSSAU', 'ASPE', 'BARETOUS'];
  for (let e = 0; e < NB_ENTREES; e++) {
    const xE = -L / 2 + L * (e + 0.5) / NB_ENTREES;
    const zE = zNu + Z_RUE * (SAILLIE_PORCHE + 0.18);
    const potE = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.9, 0.05), metalMat);
    potE.position.set(xE, H_SOCLE + 5.6, zE);
    g.add(potE);
    const texV = (() => {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 512;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#e8e5dc';
      ctx.fillRect(0, 0, 96, 512);
      ctx.fillStyle = '#33383c';
      ctx.textAlign = 'center';
      ctx.font = 'bold 52px Helvetica, Arial, sans-serif';
      const nom = VALLEES[e % VALLEES.length];
      const pasV = 460 / (nom.length + 1);
      [...nom].forEach((ch, i2) => ctx.fillText(ch, 48, 60 + pasV * (i2 + 1)));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropie();
      return t;
    })();
    const panneauE = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.2),
      new THREE.MeshStandardMaterial({ map: texV, roughness: 0.55, side: THREE.DoubleSide }));
    panneauE.position.set(xE, H_SOCLE + 5.2, zE);
    panneauE.rotation.y = Math.PI / 2;
    g.add(panneauE);
  }

  // ---- Enseigne « PYRÉNÉES » ---------------------------------------------
  // Panneau vertical suspendu à une potence, près du pignon. C'est le nom de
  // la résidence, et le seul repère qui identifie le bâtiment de loin.
  const xEns = L / 2 - pas * 0.9;
  const zEns = Z_RUE * (l / 2 + 0.5);
  const potence = new THREE.Mesh(new THREE.BoxGeometry(0.07, 4.2, 0.07), metalMat);
  potence.position.set(xEns, H_SOCLE + 5.4, zEns);
  g.add(potence);
  const panneau = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 3.4, 0.62), menuiserieMat);
  panneau.position.set(xEns, H_SOCLE + 5.0, zEns);
  g.add(panneau);

  // ---- Toiture en monopente ----------------------------------------------
  // Le LiDAR est formel : un seul versant (forme 1), de 10,1 m de gouttière à
  // 11,8 m de faîtage, soit une pente faible sur 9,2 m de large. La photo
  // suggérait deux pans, mais on la regarde par en dessous depuis la rue et
  // seul le débord y est visible.
  const debord = 0.55;
  const xT = L / 2 + debord;
  // Le versant descend vers la rue, comme le montre la photo prise du trottoir.
  const zBas = Z_RUE * (l / 2 + debord), zHaut = -Z_RUE * (l / 2 + debord);
  const toitGeo = new THREE.BufferGeometry();
  toitGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    -xT, H_GOUTTIERE, zBas, xT, H_FAITE, zHaut, xT, H_GOUTTIERE, zBas,
    -xT, H_GOUTTIERE, zBas, -xT, H_FAITE, zHaut, xT, H_FAITE, zHaut,
  ], 3));
  toitGeo.computeVertexNormals();
  const toit = new THREE.Mesh(toitGeo, tuileMat);
  g.add(toit);

  // Rives : les deux triangles qui ferment le volume sous le versant, sans
  // quoi on voit le dessous du toit depuis les pignons.
  for (const sx of [-1, 1]) {
    const rg = new THREE.BufferGeometry();
    const x = sx * L / 2;
    rg.setAttribute('position', new THREE.Float32BufferAttribute([
      x, H_GOUTTIERE, Z_RUE * (l / 2), x, H_FAITE, -Z_RUE * (l / 2),
      x, H_GOUTTIERE, -Z_RUE * (l / 2),
    ], 3));
    rg.computeVertexNormals();
    g.add(new THREE.Mesh(rg, new THREE.MeshStandardMaterial({
      color: enduitMat.color, roughness: enduitMat.roughness, side: THREE.DoubleSide,
    })));
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Église Saint-Pierre, place de la Mairie. Quatrième repère modélisé à la main.
//
// Relevé sur photographie de face (`Artix_eglise_001.JPG`, trois quarts ouest)
// recoupée avec trois sources de données :
//
//   - emprise, cap et contreforts : cadastre OSM (way 63687376, 93 sommets)
//     6 contreforts par flanc, entraxe 4,48 m, saillie 0,65 m ; nef de 15,42 m
//     hors contreforts ; chevet polygonal de 3,9 m de profondeur
//   - hauteur moyenne du corps : BD TOPO, 9,9 m
//   - forme de toiture : LiDAR HD, deux pans, gouttière à 6,4 m, azimut 30°
//     (le faîtage LiDAR de 11,8 m est contaminé par le clocher, qui partage
//     l'emprise : il n'a pas été retenu)
//
// L'échelle verticale de la photo est calée en posant la hauteur BD TOPO comme
// mi-hauteur de nef, ce qui donne un clocher de 5,06 m de côté, cohérent avec
// un clocher-porche de bourg. Un calage direct sur la gouttière LiDAR donnait
// un clocher de 3,86 m, trop étroit pour porter des baies géminées : le sol au
// pied de la façade n'est pas au même plan que la voiture qui sert d'étalon,
// l'église étant sur une plateforme surélevée.
//
// Ce que l'extrusion de l'emprise perdait : le clocher-porche et sa flèche
// d'ardoise (les deux tiers de la hauteur du monument), les contreforts, le
// chevet polygonal, et le contraste entre l'enduit clair et la pierre de
// taille des chaînes d'angle.
function construireEglise(dims) {
  const g = new THREE.Group();
  const { longueur: L, largeur: l } = dims;

  // Hauteurs relevées, en mètres au-dessus de l'assise.
  const H_EGOUT = 8.38;      // gouttière de la nef
  const H_FAITE = 11.42;     // faîtage de la nef
  const H_CHAMBRE = 12.43;   // bas de la chambre des cloches
  const H_APPUI = 13.15;     // appui des baies campanaires
  const H_CORNICHE = 17.78;  // corniche à modillons
  const H_FLECHE = 18.50;    // égout de la flèche
  const H_POINTE = 26.30;    // pointe de la flèche
  const H_CROIX = 28.41;     // sommet de la croix
  const COTE_CLOCHER = 5.06; // le clocher est carré en plan

  // Teintes relevées sur la photo par rapport de luminance, la prise de vue
  // étant à contre-jour côté façade : la pierre de taille mesure 0,81 de la
  // clarté de l'enduit au soleil, l'ardoise 0,20. L'enduit ressort bleuté sur
  // la photo (181,188,203) parce qu'il reçoit la lumière du ciel ; c'est le
  // contrefort en plein soleil qui donne la vraie dominante, légèrement chaude.
  const enduitMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d8, roughness: 0.93 });
  const pierreMat = new THREE.MeshStandardMaterial({ color: 0xc3bba9, roughness: 0.88 });
  // `flatShading` sur l'ardoise : la flèche est une pyramide à quatre pans, et
  // les normales lissées d'un ConeGeometry à 4 segments la rendent en dôme
  // arrondi. Le pan plat est ce qui distingue une flèche d'un clocher à bulbe.
  const ardoiseMat = new THREE.MeshStandardMaterial({
    color: 0x3f444b, roughness: 0.72, flatShading: true,
  });
  const sombreMat = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.6 });
  // La nef n'est PAS couverte en ardoise : mesurée sur la photo, sa toiture
  // ressort à 1,12 fois la clarté du mur au soleil et 5 fois celle de la
  // flèche. C'est une couverture claire (fibrociment ou tôle), et l'ardoise
  // est réservée au clocher. Les couvrir toutes deux en ardoise écrasait le
  // contraste qui fait lire le clocher comme un volume distinct.
  const couvertureMat = new THREE.MeshStandardMaterial({ color: 0xb9bcbe, roughness: 0.85 });

  // Repère local : x va du clocher (ouest) vers le chevet (est), origine au
  // centre de l'emprise. Le clocher occupe donc l'extrémité x négative.
  const X_CLOCHER = -L / 2 + COTE_CLOCHER / 2;
  const X_NEF_OUEST = X_CLOCHER + COTE_CLOCHER / 2;   // nu arrière du clocher
  const X_NEF_EST = L / 2;

  // ---- Nef ---------------------------------------------------------------
  // Le clocher est engagé dans la façade ouest : la nef part de son nu
  // arrière, sinon les deux volumes s'interpénètrent visiblement au faîtage.
  const lNef = X_NEF_EST - X_NEF_OUEST;
  const nef = new THREE.Mesh(new THREE.BoxGeometry(lNef, H_EGOUT, l), enduitMat);
  nef.position.set((X_NEF_OUEST + X_NEF_EST) / 2, H_EGOUT / 2, 0);
  g.add(nef);

  // Toiture à deux pans, faîtage dans l'axe de la nef (azimut LiDAR 30°, soit
  // le grand axe du bâtiment). Débord marqué, comme sur la photo.
  const debord = 0.4;
  const x0 = X_NEF_OUEST - debord, x1 = X_NEF_EST + debord;
  const zT = l / 2 + debord;
  const toitGeo = new THREE.BufferGeometry();
  // L'ordre des sommets fixe le sens des normales : vu de l'extérieur, chaque
  // triangle doit tourner dans le sens antihoraire, sinon le pan est éclairé
  // par sa face arrière et disparaît (`FrontSide` par défaut).
  toitGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    // pan sud, vu depuis z positif
    x0, H_EGOUT, zT, x1, H_FAITE, 0, x1, H_EGOUT, zT,
    x0, H_EGOUT, zT, x0, H_FAITE, 0, x1, H_FAITE, 0,
    // pan nord, vu depuis z négatif
    x1, H_EGOUT, -zT, x0, H_FAITE, 0, x0, H_EGOUT, -zT,
    x1, H_EGOUT, -zT, x1, H_FAITE, 0, x0, H_FAITE, 0,
  ], 3));
  toitGeo.computeVertexNormals();
  g.add(new THREE.Mesh(toitGeo, couvertureMat));

  // Pignon du chevet, pour fermer le volume sous la toiture.
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute([
    X_NEF_EST, H_EGOUT, l / 2, X_NEF_EST, H_EGOUT, -l / 2, X_NEF_EST, H_FAITE, 0,
  ], 3));
  pg.computeVertexNormals();
  // `DoubleSide` sur le pignon : un triangle isolé n'a pas de sens de parcours
  // évident, et le rendre visible des deux faces coûte moins qu'un pignon
  // invisible parce que ses sommets tournaient dans le mauvais sens.
  g.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({
    color: enduitMat.color, roughness: enduitMat.roughness, side: THREE.DoubleSide,
  })));

  // ---- Contreforts -------------------------------------------------------
  // 6 par flanc, relevés un par un sur le cadastre : entraxe 4,48 m, largeur
  // 0,8 m, saillie 0,65 m. Ils sont en pierre de taille et montent presque
  // jusqu'à l'égout, avec un fruit léger qui les fait paraître plus larges au
  // pied. C'est le rythme le plus visible du flanc sud depuis la place.
  const NB_CF = 6, ENTRAXE = 4.48, SAILLIE = 0.65, LARG_CF = 0.8;
  const hCf = H_EGOUT - 0.5;
  const geoCf = new THREE.BoxGeometry(LARG_CF, hCf, SAILLIE);
  const uPremier = X_NEF_OUEST + 1.2;
  for (let i = 0; i < NB_CF; i++) {
    const x = uPremier + i * ENTRAXE;
    if (x > X_NEF_EST - 0.6) break;
    for (const cote of [-1, 1]) {
      const cf = new THREE.Mesh(geoCf, pierreMat);
      cf.position.set(x, hCf / 2, cote * (l / 2 + SAILLIE / 2));
      g.add(cf);
    }
  }

  // Oculi du bas-côté : un par travée, en haut du mur, juste sous l'égout.
  const geoOcu = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12);
  for (let i = 0; i < NB_CF - 1; i++) {
    const x = uPremier + (i + 0.5) * ENTRAXE;
    if (x > X_NEF_EST - 0.6) break;
    for (const cote of [-1, 1]) {
      const o = new THREE.Mesh(geoOcu, sombreMat);
      o.rotation.x = Math.PI / 2;
      o.position.set(x, H_EGOUT - 1.15, cote * (l / 2 + 0.05));
      g.add(o);
    }
  }

  // ---- Chevet ------------------------------------------------------------
  // Le cadastre donne une abside polygonale de 3,9 m de profondeur, plus
  // étroite que la nef. Rendue en demi-cylindre à 7 pans : à la distance où on
  // la voit depuis la route, la facettisation suffit.
  const rChevet = l * 0.42;
  const chevet = new THREE.Mesh(
    new THREE.CylinderGeometry(rChevet, rChevet, H_EGOUT, 7, 1, false, -Math.PI / 2, Math.PI),
    enduitMat);
  chevet.position.set(X_NEF_EST, H_EGOUT / 2, 0);
  g.add(chevet);
  // Croupe du chevet : un demi-cône posé sur le demi-cylindre. Le débord est
  // repris à l'identique de celui de l'abside, sans marge supplémentaire :
  // avec `rChevet + debord`, le cône dépassait la demi-largeur de la nef et
  // venait percer ses deux pans de toiture, laissant un triangle en saillie.
  const hCroupe = H_FAITE - H_EGOUT;
  const toitChevet = new THREE.Mesh(
    new THREE.ConeGeometry(rChevet + 0.15, hCroupe, 7, 1, false, -Math.PI / 2, Math.PI),
    couvertureMat);
  toitChevet.position.set(X_NEF_EST, H_EGOUT + hCroupe / 2, 0);
  g.add(toitChevet);

  // ---- Clocher-porche ----------------------------------------------------
  // Engagé dans la façade ouest et carré en plan. Il porte les deux tiers de
  // la hauteur du monument : c'est lui qui signale l'église de loin, bien
  // avant que la nef ne soit lisible.
  const xClo = X_CLOCHER;
  const tour = new THREE.Mesh(
    new THREE.BoxGeometry(COTE_CLOCHER, H_CORNICHE, COTE_CLOCHER), enduitMat);
  tour.position.set(xClo, H_CORNICHE / 2, 0);
  g.add(tour);

  // Chaînes d'angle en pierre de taille : quatre arêtes verticales appareillées,
  // très marquées sur la photo. Sans elles, la tour est un bloc d'enduit nu.
  const geoChaine = new THREE.BoxGeometry(0.5, H_CORNICHE, 0.5);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const ch = new THREE.Mesh(geoChaine, pierreMat);
      ch.position.set(xClo + sx * (COTE_CLOCHER / 2 - 0.1), H_CORNICHE / 2,
        sz * (COTE_CLOCHER / 2 - 0.1));
      g.add(ch);
    }
  }

  // Bandeau de pierre marquant le bas de la chambre des cloches.
  const bandeau = new THREE.Mesh(
    new THREE.BoxGeometry(COTE_CLOCHER + 0.24, 0.35, COTE_CLOCHER + 0.24), pierreMat);
  bandeau.position.set(xClo, H_CHAMBRE, 0);
  g.add(bandeau);

  // Corniche à modillons sous la flèche : un débord franc qui porte l'ombre la
  // plus visible du clocher.
  const corniche = new THREE.Mesh(
    new THREE.BoxGeometry(COTE_CLOCHER + 0.5, 0.42, COTE_CLOCHER + 0.5), pierreMat);
  corniche.position.set(xClo, H_CORNICHE - 0.21, 0);
  g.add(corniche);

  // Baies campanaires géminées : deux arcs en plein cintre par face, séparés
  // par un trumeau, garnis d'abat-sons sombres. Rendues comme un renfoncement
  // sombre sommé d'un demi-cylindre, plutôt qu'en vrai percement : à cette
  // hauteur, seule la silhouette compte.
  const hBaie = H_CORNICHE - 0.7 - H_APPUI;
  // Baies étroites : sur la photo, les deux baies d'une face occupent ensemble
  // moins de la moitié de sa largeur, séparées par un trumeau franc. Une
  // valeur plus généreuse les fait se rejoindre d'une face à l'autre et la
  // chambre des cloches devient une bande ajourée continue.
  const largBaie = COTE_CLOCHER * 0.15;
  const geoBaie = new THREE.BoxGeometry(largBaie, hBaie, 0.16);
  const geoArc = new THREE.CylinderGeometry(largBaie / 2, largBaie / 2, 0.16, 8, 1, false, 0, Math.PI);
  for (const face of [0, 1, 2, 3]) {
    const ang = face * Math.PI / 2;
    const nx = Math.sin(ang), nz = Math.cos(ang);
    for (const d of [-1, 1]) {
      // Décalage latéral de part et d'autre du trumeau central.
      const tx = -nz * d * largBaie * 1.15, tz = nx * d * largBaie * 1.15;
      const bx = xClo + nx * (COTE_CLOCHER / 2 + 0.02) + tx;
      const bz = nz * (COTE_CLOCHER / 2 + 0.02) + tz;
      const baie = new THREE.Mesh(geoBaie, sombreMat);
      baie.position.set(bx, H_APPUI + hBaie / 2, bz);
      baie.rotation.y = ang;
      g.add(baie);
      const arc = new THREE.Mesh(geoArc, sombreMat);
      arc.rotation.z = Math.PI / 2;
      arc.rotation.y = ang + Math.PI / 2;
      arc.position.set(bx, H_APPUI + hBaie, bz);
      g.add(arc);
    }
  }

  // ---- Flèche ------------------------------------------------------------
  // Pyramide d'ardoise à quatre pans, très pentue (72 degrés mesurés). Son
  // égout déborde légèrement de la corniche.
  const hFleche = H_POINTE - H_FLECHE;
  const fleche = new THREE.Mesh(
    new THREE.ConeGeometry(COTE_CLOCHER * 0.76, hFleche, 4), ardoiseMat);
  fleche.rotation.y = Math.PI / 4;   // arêtes dans l'axe des faces de la tour
  fleche.position.set(xClo, H_FLECHE + hFleche / 2, 0);
  g.add(fleche);

  // Croix sommitale : deux barres croisées, lisibles en silhouette sur le ciel.
  const croixMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2c, roughness: 0.5, metalness: 0.6,
  });
  const hCroix = H_CROIX - H_POINTE;
  const mat = new THREE.Mesh(new THREE.BoxGeometry(0.09, hCroix, 0.09), croixMat);
  mat.position.set(xClo, H_POINTE + hCroix / 2, 0);
  g.add(mat);
  const bras = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.09, 0.09), croixMat);
  bras.position.set(xClo, H_POINTE + hCroix * 0.62, 0);
  g.add(bras);

  // ---- Façade ouest ------------------------------------------------------
  // Médaillon sculpté circulaire au-dessus du portail, puis deux baies
  // jumelles étroites, puis le portail en plein cintre. Ces trois éléments
  // superposés font la façade reconnaissable depuis la place.
  const xF = xClo - COTE_CLOCHER / 2 - 0.03;
  const medaillon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.78, 0.12, 14), pierreMat);
  medaillon.rotation.z = Math.PI / 2;
  medaillon.position.set(xF, H_EGOUT + 1.4, 0);
  g.add(medaillon);

  const hJum = 2.6, largJum = 0.5;
  for (const d of [-1, 1]) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.14, hJum, largJum), sombreMat);
    j.position.set(xF, H_EGOUT - 2.2, d * largJum * 0.85);
    g.add(j);
  }

  const hPortail = 3.1, largPortail = 1.9;
  const portail = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, hPortail, largPortail), sombreMat);
  portail.position.set(xF, hPortail / 2, 0);
  g.add(portail);
  const arcPortail = new THREE.Mesh(
    new THREE.CylinderGeometry(largPortail / 2, largPortail / 2, 0.16, 12, 1, false, 0, Math.PI),
    sombreMat);
  arcPortail.rotation.z = Math.PI / 2;
  arcPortail.rotation.y = Math.PI / 2;
  arcPortail.position.set(xF, hPortail, 0);
  g.add(arcPortail);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Les hauteurs viennent de la photo, mises à l'échelle par une porte standard
// de 2,05 m ; l'emprise et le cap viennent de la BD TOPO.
function construireImmeubleRue(dims) {
  const g = new THREE.Group();
  const { longueur: L, largeur: l } = dims;
  const H_RDC = 2.98;
  const H_EGOUT = 6.43;
  const H_FAITE = 8.76;

  const enduitMat = new THREE.MeshStandardMaterial({ color: 0xc9c3b4, roughness: 0.94 });
  const tuileMat = new THREE.MeshStandardMaterial({ color: 0x9c4f33, roughness: 0.88 });
  const devantures = [
    new THREE.MeshStandardMaterial({ color: 0x24313a, roughness: 0.42, metalness: 0.12 }),
    new THREE.MeshStandardMaterial({ color: 0x9f4d2e, roughness: 0.68, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: 0x4d675f, roughness: 0.58, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color: 0x5c3033, roughness: 0.61, metalness: 0.04 }),
  ];
  const devantureMat = devantures[0];
  const voletMat = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7 });

  // Rez-de-chaussée : enduit, mais bordé de devantures sombres sur la façade
  // qui donne sur la rue. C'est le contraste clair/sombre entre les deux
  // niveaux qui rend un immeuble de bourg reconnaissable.
  const rdc = new THREE.Mesh(new THREE.BoxGeometry(L, H_RDC, l), enduitMat);
  rdc.position.y = H_RDC / 2;
  g.add(rdc);

  // Devantures réelles de l'immeuble, relevées sur les panoramiques et
  // positionnées par projection des POI sur le grand axe : Au Comptoir à
  // l'extrémité côté carrefour, la Maison de la Presse vers le milieu, la
  // pizzeria à l'autre bout. La façade rue est le -z local (voir la rotation
  // du bloc IMMEUBLES_RUE).
  const DEVANTURES = [
    // x local = abscisse sur le grand axe (projection mesurée des POI).
    { nom: 'AU COMPTOIR', sous: 'BRASSERIE', x: 12.7, larg: 8.5, fond: '#141618', encre: '#f2efe6' },
    { nom: 'maison de la presse', sous: null, x: 1.5, larg: 7, fond: '#f2c11c', encre: '#123a6e' },
    // Le café du bout de rangée, visible sur les panoramiques ; la pizzeria
    // réelle est place du Général de Gaulle, pas dans cet immeuble.
    { nom: 'CAFÉ', sous: null, x: -8.6, larg: 6.5, fond: '#5c2828', encre: '#f2e7d2' },
  ];
  const textureDeuxLignes = (d) => {
    const Lc = 1024, Hc = 150;
    const c = document.createElement('canvas');
    c.width = Lc; c.height = Hc;
    const ctx = c.getContext('2d');
    ctx.fillStyle = d.fond;
    ctx.fillRect(0, 0, Lc, Hc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = d.encre;
    if (d.sous) {
      ctx.font = 'bold 64px Georgia, serif';
      ctx.fillText(d.nom, Lc / 2, 50);
      ctx.font = '600 36px Helvetica, Arial, sans-serif';
      ctx.fillText(d.sous.split('').join(' '), Lc / 2, 114);
    } else {
      ctx.font = 'bold 72px Helvetica, Arial, sans-serif';
      ctx.fillText(d.nom, Lc / 2, Hc / 2 + 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  };
  const vitreCom = new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: 0.22, metalness: 0.1 });
  for (const d of DEVANTURES) {
    // La position reste dans l'emprise même si le garde-fou a rétracté L.
    const x = Math.max(-L / 2 + d.larg / 2 + 0.4, Math.min(L / 2 - d.larg / 2 - 0.4, d.x));
    const fondMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(d.fond), roughness: 0.55,
    });
    const dev = new THREE.Mesh(new THREE.BoxGeometry(d.larg, 2.42, 0.12), fondMat);
    dev.position.set(x, 1.35, -(l / 2 + 0.06));
    g.add(dev);
    // Vitrines en retrait de part et d'autre de la porte.
    for (const cote of [-1, 1]) {
      const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(d.larg * 0.32, 1.75), vitreCom);
      vitrine.position.set(x + cote * d.larg * 0.24, 1.2, -(l / 2 + 0.13));
      vitrine.rotation.y = Math.PI;
      g.add(vitrine);
    }
    const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), vitreCom);
    porte.position.set(x, 1.06, -(l / 2 + 0.13));
    porte.rotation.y = Math.PI;
    g.add(porte);
    // Casquette au-dessus du bandeau, dans le ton de la devanture.
    const auvent = new THREE.Mesh(new THREE.BoxGeometry(d.larg * 0.96, 0.14, 0.65), fondMat);
    auvent.position.set(x, 2.72, -(l / 2 + 0.35));
    auvent.rotation.x = 0.09;
    g.add(auvent);
    const enseigne = new THREE.Mesh(
      new THREE.PlaneGeometry(d.larg * 0.9, 0.72),
      new THREE.MeshStandardMaterial({ map: textureDeuxLignes(d), roughness: 0.6 }),
    );
    enseigne.position.set(x, 2.28, -(l / 2 + 0.145));
    enseigne.rotation.y = Math.PI;
    g.add(enseigne);
  }

  // Étage : enduit clair sur toute la longueur.
  const hEtage = H_EGOUT - H_RDC;
  const etage = new THREE.Mesh(new THREE.BoxGeometry(L, hEtage, l), enduitMat);
  etage.position.y = H_RDC + hEtage / 2;
  g.add(etage);

  // Volets roulants blancs, alignés à l'étage sur les deux longs côtés.
  const nBaies = Math.max(4, Math.round(L / 3.4));
  const geoVolet = new THREE.BoxGeometry(0.95, 1.35, 0.06);
  for (let i = 0; i < nBaies; i++) {
    const x = -L / 2 + (L / nBaies) * (i + 0.5);
    for (const cote of [-1, 1]) {
      const v = new THREE.Mesh(geoVolet, voletMat);
      v.position.set(x, H_RDC + hEtage * 0.52, cote * (l / 2 + 0.04));
      g.add(v);
    }
  }

  // Toiture à deux pans : deux plans inclinés se rejoignant sur le faîtage,
  // avec un débord marqué. Construite en géométrie explicite plutôt qu'en
  // boîte aplatie, sans quoi la pente ne se lit pas depuis la route.
  const hToit = H_FAITE - H_EGOUT;
  const debord = 0.45;
  const demiL = L / 2 + debord, demil = l / 2 + debord;
  const toitGeo = new THREE.BufferGeometry();
  const yE = H_EGOUT, yF = H_EGOUT + hToit;
  // Chaque pan est un quadrilatère : bord d'égout en bas, faîtage en haut.
  const v = [
    // pan avant
    -demiL, yE, demil, demiL, yE, demil, demiL, yF, 0,
    -demiL, yE, demil, demiL, yF, 0, -demiL, yF, 0,
    // pan arrière
    demiL, yE, -demil, -demiL, yE, -demil, -demiL, yF, 0,
    demiL, yE, -demil, -demiL, yF, 0, demiL, yF, 0,
  ];
  toitGeo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  toitGeo.computeVertexNormals();
  const toit = new THREE.Mesh(toitGeo, tuileMat);
  g.add(toit);

  // Pignons triangulaires aux deux extrémités, pour fermer le volume sous la
  // toiture. Sans eux, on voit l'intérieur du toit par les côtés.
  for (const sx of [-1, 1]) {
    const pg = new THREE.BufferGeometry();
    const x = sx * (L / 2);
    pg.setAttribute('position', new THREE.Float32BufferAttribute([
      x, yE, l / 2, x, yE, -l / 2, x, yF, 0,
    ], 3));
    pg.computeVertexNormals();
    g.add(new THREE.Mesh(pg, enduitMat));
  }

  // Avant-corps central en pignon : la partie saillante qui monte jusqu'au
  // faîtage, percée d'une lucarne cintrée. C'est le détail le plus
  // caractéristique du bâtiment.
  const largAvant = Math.min(5.2, L * 0.16);
  const saillie = 0.55;
  const avant = new THREE.Mesh(
    new THREE.BoxGeometry(largAvant, H_EGOUT, l + saillie * 2), enduitMat);
  avant.position.y = H_EGOUT / 2;
  g.add(avant);
  // Son propre pignon triangulaire, sur les deux faces.
  for (const cote of [-1, 1]) {
    const pg = new THREE.BufferGeometry();
    const zz = cote * (l / 2 + saillie);
    pg.setAttribute('position', new THREE.Float32BufferAttribute([
      -largAvant / 2, yE, zz, largAvant / 2, yE, zz, 0, yF + 0.3, zz,
    ], 3));
    pg.computeVertexNormals();
    g.add(new THREE.Mesh(pg, enduitMat));
  }
  // Lucarne cintrée : un cylindre couché, bouché par la face du pignon.
  for (const cote of [-1, 1]) {
    const luc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.1, 10, 1, false, 0, Math.PI),
      devantureMat);
    luc.rotation.z = Math.PI / 2;
    luc.rotation.y = Math.PI / 2;
    luc.position.set(0, yE + 1.15, cote * (l / 2 + saillie + 0.06));
    g.add(luc);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Enseigne de commerce plaquée sur une façade, sans toucher au bâtiment.
//
// Certains commerces n'ont pas besoin d'un repère modélisé : leur bâtiment est
// correctement extrudé, il leur manque seulement le bandeau qui les identifie
// depuis la rue. Cette fonction pose un simple panneau, à charge de l'appelant
// de lui donner sa position et son cap.
//
// Le texte est dessiné en canvas comme le reste des textures du projet.
function textureEnseigneCommerce(nom, fond, encre) {
  const L = 1024, H = 256;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fond;
  ctx.fillRect(0, 0, L, H);
  // Filet clair en bordure : les caissons d'enseigne ont un encadrement, et
  // sans lui le panneau se fond dans la façade quand les teintes sont proches.
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = H * 0.05;
  ctx.strokeRect(H * 0.06, H * 0.06, L - H * 0.12, H - H * 0.12);
  ctx.fillStyle = encre;
  // La taille s'adapte à la longueur du nom : un nom long déborderait sinon.
  let taille = H * 0.46;
  ctx.font = `700 ${taille}px Helvetica, Arial, sans-serif`;
  const dispo = L * 0.86;
  while (ctx.measureText(nom).width > dispo && taille > 20) {
    taille -= 4;
    ctx.font = `700 ${taille}px Helvetica, Arial, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '2px';
  ctx.fillText(nom, L / 2, H / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

// Devanture complète, adossée à une façade existante. Tous les éléments ont
// une épaisseur réelle : aucune surface n'est coplanaire au mur, ce qui évite
// le clignotement et donne des ombres lisibles en roulant.
function creerDevantureCommerce(nom, largeur, fond, ouverte = true) {
  const g = new THREE.Group();
  const H = 2.72;
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(fond), roughness: .72 });
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#303638'; ctx.fillRect(0, 0, c.width, c.height);

  // Bandeau commercial intégré au dessin de la façade. Le cadre et le filet
  // donnent l'épaisseur visuelle d'un caisson sans créer un panneau autonome.
  ctx.fillStyle = fond; ctx.fillRect(16, 18, 992, 122);
  ctx.strokeStyle = 'rgba(255,255,255,.58)'; ctx.lineWidth = 8;
  ctx.strokeRect(28, 30, 968, 98);
  ctx.fillStyle = '#fff8e8';
  let taille = 63;
  ctx.font = `700 ${taille}px Helvetica, Arial, sans-serif`;
  while (ctx.measureText(nom).width > 900 && taille > 25) {
    taille -= 3; ctx.font = `700 ${taille}px Helvetica, Arial, sans-serif`;
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(nom, 512, 80);

  if (ouverte) {
    // Vitrines opaques bleutées, reflets de ciel et lumière chaude intérieure.
    ctx.fillStyle = '#203640'; ctx.fillRect(26, 158, 972, 338);
    const reflet = ctx.createLinearGradient(0, 158, 0, 496);
    reflet.addColorStop(0, 'rgba(130,180,196,.34)');
    reflet.addColorStop(.55, 'rgba(32,54,64,.08)');
    reflet.addColorStop(1, 'rgba(8,15,19,.48)');
    ctx.fillStyle = reflet; ctx.fillRect(26, 158, 972, 338);
    ctx.fillStyle = 'rgba(250,205,122,.25)';
    ctx.fillRect(70, 330, 250, 130); ctx.fillRect(690, 330, 250, 130);
    ctx.strokeStyle = '#b9b9b0'; ctx.lineWidth = 13;
    for (const x of [26, 350, 674, 998]) {
      ctx.beginPath(); ctx.moveTo(x, 158); ctx.lineTo(x, 496); ctx.stroke();
    }
    ctx.strokeRect(432, 184, 160, 312);
    ctx.fillStyle = '#d7d1bd'; ctx.fillRect(552, 330, 10, 72);
    ctx.fillStyle = '#3e9a63'; ctx.fillRect(452, 205, 120, 38);
    ctx.fillStyle = '#ffffff'; ctx.font = '700 22px Helvetica, Arial, sans-serif';
    ctx.fillText('OUVERT', 512, 225);
  } else {
    // Rideau métallique baissé : les lames sont peintes dans la texture afin
    // de rester nettes sans ajouter une dizaine de maillages par commerce.
    ctx.fillStyle = '#8e908d'; ctx.fillRect(26, 158, 972, 338);
    ctx.strokeStyle = '#6e716f'; ctx.lineWidth = 5;
    for (let y = 174; y < 496; y += 24) {
      ctx.beginPath(); ctx.moveTo(26, y); ctx.lineTo(998, y); ctx.stroke();
    }
    ctx.fillStyle = '#262b2d'; ctx.fillRect(470, 426, 84, 18);
    ctx.fillStyle = '#6b3535'; ctx.fillRect(446, 278, 132, 42);
    ctx.fillStyle = '#fff2e4'; ctx.font = '700 22px Helvetica, Arial, sans-serif';
    ctx.fillText('FERMÉ', 512, 300);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropie();
  const facade = new THREE.Mesh(
    new THREE.PlaneGeometry(largeur, H),
    new THREE.MeshStandardMaterial({
      map: texture, roughness: .52,
      emissive: ouverte ? 0x2b2418 : 0x000000,
      emissiveIntensity: ouverte ? .08 : 0,
    }),
  );
  facade.position.set(0, H / 2, .20);
  g.add(facade);

  if (ouverte) {
    // Store banne déployé : toile inclinée, débordant franchement sur le
    // trottoir et projetant une ombre sur la vitrine.
    const store = new THREE.Mesh(new THREE.BoxGeometry(largeur * .9, .12, 1.08), accent);
    store.position.set(0, 2.13, .66);
    store.rotation.x = -.13;
    g.add(store);
  } else {
    // Store roulé visible au-dessus du rideau fermé.
    const rouleau = new THREE.Mesh(
      new THREE.CylinderGeometry(.16, .16, largeur * .9, 10), accent);
    rouleau.rotation.z = Math.PI / 2;
    rouleau.position.set(0, 2.08, .31);
    g.add(rouleau);
  }

  g.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

function pointDansEmprise(x, z, pts) {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    const croise = ((zi > z) !== (zj > z))
      && x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (croise) dedans = !dedans;
  }
  return dedans;
}

function projectionSegment(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-8) return { x: x1, z: z1, t: 0, d: Math.hypot(px - x1, pz - z1) };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / l2));
  const x = x1 + dx * t, z = z1 + dz * t;
  return { x, z, t, d: Math.hypot(px - x, pz - z) };
}

// Transforme les POI commerciaux réels en devantures plaquées sur l'emprise
// bâtie la plus proche. La position et l'orientation viennent donc des données
// d'Artix, pas d'un décor commercial semé au hasard.
function construireDevanturesPOI(data, relief, roadY) {
  const g = new THREE.Group();
  const commerces = (data.poi?.equipements ?? []).filter((e) =>
    e.info?.icone === 'commerce' || ['pharmacy', 'bank'].includes(e.categorie));
  const dejaModelises = new Set(['Au Comptoir', 'Maison de la Presse', 'Leclerc Express', 'Maison Chaudron',
    'CPC Invest', 'MMA', "Caisse d'Épargne", 'Pharmacie Barrouilhet', "Atmosph'Air", 'Pizzeria',
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
    'CERFRANCE ADOUR OCEAN', 'Bibliothèque Pour Tous', 'E.Leclerc Drive']);
  const palettes = ['#9b4934', '#315d68', '#4f704f', '#7d5935', '#68435f', '#285b86'];

  for (const e of commerces) {
    if (dejaModelises.has(e.nom)) continue;
    let choix = null;
    for (const b of data.buildings ?? []) {
      const pts = b.pts;
      if (!pts || pts.length < 3) continue;
      let bord = null;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        const p = projectionSegment(e.x, e.z, a[0], a[1], c[0], c[1]);
        if (!bord || p.d < bord.p.d) bord = { p, a, c };
      }
      if (!bord) continue;
      const dedans = pointDansEmprise(e.x, e.z, pts);
      const score = dedans ? bord.p.d * .25 : bord.p.d;
      if (!choix || score < choix.score) choix = { b, bord, score, dedans };
    }
    // Au-delà de 18 m d'une emprise, le POI décrit probablement un grand site
    // (station-service, zone commerciale) et une petite devanture serait fausse.
    if (!choix || (!choix.dedans && choix.bord.p.d > 18)) continue;

    const { b, bord } = choix;
    const [x1, z1] = bord.a, [x2, z2] = bord.c;
    const dx = x2 - x1, dz = z2 - z1;
    const longueur = Math.hypot(dx, dz);
    if (longueur < 2.4) continue;
    let nx = -dz / longueur, nz = dx / longueur;
    let cx = 0, cz = 0;
    for (const [x, z] of b.pts) { cx += x; cz += z; }
    cx /= b.pts.length; cz /= b.pts.length;
    if ((bord.p.x - cx) * nx + (bord.p.z - cz) * nz < 0) { nx = -nx; nz = -nz; }

    const largeur = Math.max(2.5, Math.min(6.4, longueur * .78));
    let graine = 0;
    for (let i = 0; i < e.nom.length; i++) graine = (graine * 31 + e.nom.charCodeAt(i)) >>> 0;
    const ouverte = graine % 5 !== 0;
    const devanture = creerDevantureCommerce(
      e.nom.toUpperCase(), largeur, palettes[graine % palettes.length], ouverte);
    const assise = b.zSol != null && data.altRef != null
      ? b.zSol - data.altRef + roadY - .04
      : (relief ? relief.hauteurRoute(cx, cz) : 0) + roadY - .04;
    devanture.position.set(bord.p.x + nx * .14, assise, bord.p.z + nz * .14);
    devanture.rotation.y = Math.atan2(nx, nz);
    g.add(devanture);
  }
  return g;
}

// Façade de la gare d'Artix observée depuis son parvis : volume bas et blanc,
// travées de pierre blonde, grande entrée vitrée, horloge et nom de la gare.
// Les matières restent opaques afin d'éviter les défauts de tri et de garder
// le coût de rendu adapté à un jeu arcade dans le navigateur.
function textureGare() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f4f0e8'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#263544';
  ctx.font = '700 92px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.letterSpacing = '16px';
  ctx.fillText('GARE  D’ARTIX', c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

function construireGare(dims) {
  const g = new THREE.Group();
  const L = dims.longueur, W = dims.largeur;
  const H = 4.75;
  const blanc = new THREE.MeshStandardMaterial({ color: 0xe9e6de, roughness: 0.91 });
  const pierre = new THREE.MeshStandardMaterial({ color: 0xb9a17d, roughness: 0.97 });
  const verre = new THREE.MeshStandardMaterial({ color: 0x203747, roughness: 0.18, metalness: 0.12 });
  const anthracite = new THREE.MeshStandardMaterial({ color: 0x27323a, roughness: 0.62 });
  const zinc = new THREE.MeshStandardMaterial({ color: 0x6f797d, roughness: 0.69, metalness: 0.18 });
  const pave = new THREE.MeshStandardMaterial({ color: 0xaaa69c, roughness: 0.98 });
  const herbe = new THREE.MeshStandardMaterial({ color: 0x4e7542, roughness: 1 });

  // Corps principal et bandeaux : la superposition donne du relief à la
  // façade sans multiplier les textures ni les matériaux transparents.
  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), blanc);
  corps.position.y = H / 2; g.add(corps);
  const socle = new THREE.Mesh(new THREE.BoxGeometry(L + .08, .42, W + .08), anthracite);
  socle.position.y = .21; g.add(socle);
  const toit = new THREE.Mesh(new THREE.BoxGeometry(L + 1.05, .34, W + .9), zinc);
  toit.position.y = H + .17; g.add(toit);

  // Deux façades lisibles : le côté ville est le plus détaillé, mais le nom
  // reste identifiable depuis le quai si le joueur longe la voie ferrée.
  for (const cote of [-1, 1]) {
    const z = cote * (W / 2 + .07);
    const entree = new THREE.Mesh(new THREE.BoxGeometry(Math.min(7.2, L * .26), 3.45, .14), verre);
    entree.position.set(L * .08, 2.04, z); g.add(entree);
    for (const x of [-L * .34, -L * .18, L * .31]) {
      const baie = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3.2, L * .11), 2.55, .12), verre);
      baie.position.set(x, 1.72, z + cote * .01); g.add(baie);
    }
    // Travées en pierre blonde, détail très visible sur le bâtiment réel.
    for (const x of [-L * .27, -L * .05, L * .21]) {
      const travee = new THREE.Mesh(new THREE.BoxGeometry(1.08, H - .5, .2), pierre);
      travee.position.set(x, H / 2, z + cote * .03); g.add(travee);
    }
    const panneau = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(10, L * .38), 1.18),
      new THREE.MeshStandardMaterial({ map: textureGare(), roughness: .78, side: THREE.DoubleSide }),
    );
    panneau.position.set(-L * .06, H - .78, z + cote * .11);
    panneau.rotation.y = cote < 0 ? Math.PI : 0;
    g.add(panneau);
  }

  // Horloge au-dessus de l'entrée, sans transparence.
  const cadran = new THREE.Mesh(new THREE.CylinderGeometry(.56, .56, .12, 24), blanc);
  cadran.rotation.x = Math.PI / 2;
  cadran.position.set(L * .08, H + .58, W / 2 + .05); g.add(cadran);
  for (const [angle, len] of [[-.35, .35], [1.15, .25]]) {
    const aiguille = new THREE.Mesh(new THREE.BoxGeometry(.055, len, .05), anthracite);
    aiguille.rotation.z = angle;
    aiguille.position.set(L * .08 + Math.sin(-angle) * len * .23, H + .58 + Math.cos(angle) * len * .23, W / 2 + .15);
    g.add(aiguille);
  }

  // Parvis compact : dallage et îlot planté reprennent l'aménagement réel et
  // empêchent le bâtiment de paraître posé directement dans l'herbe.
  const parvis = new THREE.Mesh(new THREE.BoxGeometry(L * .82, .12, 8.5), pave);
  parvis.position.set(0, .02, W / 2 + 4.1); g.add(parvis);
  const ilot = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, .18, 24), herbe);
  ilot.scale.x = 1.7; ilot.position.set(-L * .2, .15, W / 2 + 5.0); g.add(ilot);
  for (let i = 0; i < 7; i++) {
    const touffe = new THREE.Mesh(new THREE.ConeGeometry(.25 + (i % 2) * .1, .85, 7),
      new THREE.MeshStandardMaterial({ color: i % 2 ? 0x78944d : 0x496b39, roughness: 1 }));
    touffe.position.set(-L * .2 + Math.cos(i * 2.3) * 2.2, .62, W / 2 + 5 + Math.sin(i * 2.3) * 1.25);
    g.add(touffe);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Leclerc Express du centre-bourg, dans les murs de l'ancien Intermarché.
//
// Emprise et cap viennent d'OSM (way 63685613, 974 m², 42,9 x 26,5 m, cap
// 10,4 degrés) ; la hauteur de 5 m et l'usage commercial de la BD TOPO, qui le
// donne à toiture-terrasse.
//
// L'extrusion automatique en ferait une boîte grise, alors que ce qui
// l'identifie depuis la rue tient à trois choses : le long bandeau blanc
// d'acrotère, la façade entièrement vitrée sous auvent, et l'enseigne bleue.
function construireSupermarche(dims) {
  const g = new THREE.Group();
  const L = dims.longueur, W = dims.largeur;
  // Hauteur au sommet de l'acrotère, relevé BD TOPO. Le corps de bâtiment est
  // un peu plus bas, l'acrotère le dépassant.
  const H = 4.35;
  const ACROTERE = 0.65;

  const murMat = new THREE.MeshStandardMaterial({
    // Bardage blanc cassé, légèrement grisé : le blanc pur ressort en tache
    // sous le ciel et écrase le bandeau d'enseigne.
    color: 0xe4e4e0, roughness: 0.82, side: THREE.DoubleSide,
  });
  const soubMat = new THREE.MeshStandardMaterial({
    // Soubassement gris, sali par les projections : très présent sur la photo.
    color: 0x9d9c97, roughness: 0.92, side: THREE.DoubleSide,
  });
  const vitreMat = new THREE.MeshStandardMaterial({
    // Vitrine opaque et sombre, comme le vitrage du bâti ordinaire : la
    // transmission physique coûterait cher pour un intérieur qu'on ne voit pas.
    color: 0x2c3540, roughness: 0.16, metalness: 0.10, side: THREE.DoubleSide,
  });
  const menuiserieMat = new THREE.MeshStandardMaterial({
    color: 0xd8d8d4, roughness: 0.55, metalness: 0.25, side: THREE.DoubleSide,
  });
  const toitMat = new THREE.MeshStandardMaterial({
    // Étanchéité de toiture-terrasse : gris moyen mat, jamais brillant.
    color: 0x6f7175, roughness: 0.96, side: THREE.DoubleSide,
  });

  // Corps du bâtiment. La façade avant (+Z) est traitée à part, elle porte
  // toute la vitrine ; les trois autres sont du bardage plein.
  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), murMat);
  corps.position.y = H / 2;
  corps.castShadow = true;
  corps.receiveShadow = true;
  g.add(corps);

  // Acrotère : le bandeau qui ceinture la toiture-terrasse et masque son bord.
  // C'est lui qui donne au bâtiment sa ligne horizontale franche.
  const acro = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.3, ACROTERE, W + 0.3), murMat);
  acro.position.y = H + ACROTERE / 2;
  acro.castShadow = true;
  g.add(acro);

  // Terrasse, en léger retrait sous le haut d'acrotère.
  const terrasse = new THREE.Mesh(new THREE.PlaneGeometry(L, W), toitMat);
  terrasse.rotation.x = -Math.PI / 2;
  terrasse.position.y = H + ACROTERE * 0.55;
  terrasse.receiveShadow = true;
  g.add(terrasse);

  // --- Façade avant : vitrine continue sous auvent -----------------------
  //
  // Elle occupe les deux tiers de la longueur, le reste étant l'annexe pleine
  // visible à droite sur la photo. Le vitrage est posé en applique devant le
  // bardage plutôt que percé dedans : la façade est une simple boîte, il n'y a
  // pas d'épaisseur où creuser une baie.
  const zF = W / 2;
  const LARG_VITRINE = L * 0.62;
  const xVitrine = -L * 0.12;   // décalée vers la gauche, comme sur place
  const H_ALLEGE = 0.55;        // soubassement sous la vitrine
  const H_VITRE = 2.35;

  // Soubassement : bandeau gris continu au pied de la vitrine.
  const soub = new THREE.Mesh(
    new THREE.BoxGeometry(LARG_VITRINE, H_ALLEGE, 0.10), soubMat);
  soub.position.set(xVitrine, H_ALLEGE / 2, zF + 0.05);
  g.add(soub);

  // Vitrage, d'un seul tenant : les montants viennent par-dessus.
  const vitre = new THREE.Mesh(
    new THREE.PlaneGeometry(LARG_VITRINE, H_VITRE), vitreMat);
  vitre.position.set(xVitrine, H_ALLEGE + H_VITRE / 2, zF + 0.04);
  g.add(vitre);

  // Montants d'aluminium, tous les 2,4 m environ : c'est ce rythme vertical
  // qui fait lire une devanture de commerce plutôt qu'un mur sombre.
  const nMont = Math.max(2, Math.round(LARG_VITRINE / 2.4));
  const montGeo = new THREE.BoxGeometry(0.09, H_VITRE, 0.07);
  const montants = new THREE.InstancedMesh(montGeo, menuiserieMat, nMont + 1);
  const mm = new THREE.Matrix4();
  for (let i = 0; i <= nMont; i++) {
    const x = xVitrine - LARG_VITRINE / 2 + (LARG_VITRINE * i) / nMont;
    mm.makeTranslation(x, H_ALLEGE + H_VITRE / 2, zF + 0.09);
    montants.setMatrixAt(i, mm);
  }
  montants.instanceMatrix.needsUpdate = true;
  g.add(montants);

  // Traverse haute, qui ferme la vitrine sous l'auvent.
  const trav = new THREE.Mesh(
    new THREE.BoxGeometry(LARG_VITRINE, 0.14, 0.10), menuiserieMat);
  trav.position.set(xVitrine, H_ALLEGE + H_VITRE + 0.07, zF + 0.07);
  g.add(trav);

  // Auvent en débord sur toute la vitrine : il porte l'ombre horizontale qui
  // détache la devanture du bardage, très marquée sur la photo.
  const DEB = 1.35;
  const auvent = new THREE.Mesh(
    new THREE.BoxGeometry(LARG_VITRINE + 1.2, 0.16, DEB), murMat);
  auvent.position.set(xVitrine, H_ALLEGE + H_VITRE + 0.35, zF + DEB / 2);
  auvent.castShadow = true;
  g.add(auvent);

  // --- Enseigne ----------------------------------------------------------
  // Bandeau posé sur l'acrotère, débordant légèrement : sur place, l'enseigne
  // est fixée en applique au-dessus de la ligne de toiture.
  // Largeur bornée, et hauteur calée sur celle de l'acrotère : une enseigne
  // plus haute que son support déborde forcément.
  const LARG_ENS = Math.min(L * 0.42, 11);
  const texEns = textureEnseigne();
  const ens = new THREE.Mesh(
    new THREE.PlaneGeometry(LARG_ENS, Math.min(LARG_ENS * 0.25, ACROTERE * 0.8)),
    new THREE.MeshStandardMaterial({
      map: texEns, roughness: 0.55,
      // Légère émission : les enseignes de magasin sont rétroéclairées et
      // restent lisibles à la tombée du jour. L'intensité est faible, il ne
      // s'agit pas d'en faire une source lumineuse.
      //
      // L'émission reprend la MÊME texture que la couleur : sans `emissiveMap`,
      // un `emissive` blanc éclaire uniformément tout le panneau et efface le
      // lettrage, au lieu de rétroéclairer le fond clair comme un caisson réel.
      emissive: 0xffffff, emissiveMap: texEns, emissiveIntensity: 0.12,
      side: THREE.DoubleSide,
    }));
  // Plaquée sur l'acrotère et non au-dessus : un premier essai la posait à
  // `H + ACROTERE * 0.62`, ce qui la faisait flotter au-dessus de la ligne de
  // toiture, détachée du bâtiment. Elle occupe maintenant la hauteur du
  // bandeau, comme sur la devanture réelle.
  ens.position.set(xVitrine, H + ACROTERE * 0.32, zF + 0.20);
  g.add(ens);

  // Deux panonceaux du sigle en façade, de part et d'autre de l'entrée.
  const panMat = new THREE.MeshStandardMaterial({
    map: texturePanonceau(), roughness: 0.6, side: THREE.DoubleSide,
  });
  const panGeo = new THREE.PlaneGeometry(0.85, 0.85);
  // Resserrés autour de l'entrée : un premier essai plaçait le second trop
  // loin sur la droite, isolé au milieu du bardage.
  for (const dx of [-LARG_VITRINE * 0.26, LARG_VITRINE * 0.06]) {
    const pan = new THREE.Mesh(panGeo, panMat);
    pan.position.set(xVitrine + dx, H_ALLEGE + H_VITRE + 0.62, zF + 0.12);
    g.add(pan);
  }

  g.userData = { L, W, H, ACROTERE, vitreMat, menuiserieMat, soubMat };
  return g;
}

// Une face du salon ATMOSPH'AIR : caisson anthracite toute hauteur, grande
// vitrine sombre, bandeau lettré blanc. Le salon habille les DEUX côtés du
// coin sud-ouest de l'immeuble 1126 : cette fonction est posée deux fois
// (face ouest : vitrine panoramique et téléphone vertical sur le montant ;
// face sud : vitrine plus porte vitrée).
function construireFaceAtmosphair({ largeur, porte, telVertical }) {
  const g = new THREE.Group();
  const anthracite = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x39434a, roughness: 0.16, metalness: 0.12 });
  // Caisson plein sur toute la hauteur du rez-de-chaussée.
  const caisson = new THREE.Mesh(new THREE.BoxGeometry(largeur, 3.15, 0.16), anthracite);
  caisson.position.set(0, 1.58, 0.08);
  g.add(caisson);
  if (porte) {
    // Face sud : vitrine à gauche, porte vitrée à droite.
    const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(largeur * 0.5, 1.9), vitre);
    vitrine.position.set(-largeur * 0.2, 1.35, 0.17);
    g.add(vitrine);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.1), vitre);
    p.position.set(largeur * 0.3, 1.15, 0.17);
    g.add(p);
  } else {
    // Face ouest : une seule grande vitrine panoramique, presque toute la
    // largeur, montant plein à droite (côté coin) portant le téléphone.
    const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(largeur * 0.72, 2.15), vitre);
    vitrine.position.set(-largeur * 0.08, 1.42, 0.17);
    g.add(vitrine);
  }
  // Bandeau lettré : capitales blanches espacées sur l'anthracite.
  const texBandeau = (() => {
    const L = 1024, H = 130;
    const c = document.createElement('canvas');
    c.width = L; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2f33';
    ctx.fillRect(0, 0, L, H);
    ctx.fillStyle = '#f0efe9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 72px Helvetica, Arial, sans-serif';
    ctx.fillText("A T M O S P H ' A I R", L / 2, H / 2 + 4);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(largeur * 0.92, 0.62),
    new THREE.MeshStandardMaterial({ map: texBandeau, roughness: 0.5 }));
  bandeau.position.set(0, 2.72, 0.17);
  g.add(bandeau);
  if (telVertical) {
    // « 05 59 02 05 44 » empilé sur le montant droit, comme sur la vraie
    // vitrine.
    const texTel = (() => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 512;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#2b2f33';
      ctx.fillRect(0, 0, 64, 512);
      ctx.fillStyle = '#e8e7e1';
      ctx.textAlign = 'center';
      ctx.font = 'bold 40px Helvetica, Arial, sans-serif';
      const chiffres = ['05', '59', '02', '05', '44'];
      chiffres.forEach((ch, i) => ctx.fillText(ch, 32, 70 + i * 95));
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const tel = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.8),
      new THREE.MeshStandardMaterial({ map: texTel, roughness: 0.5 }));
    tel.position.set(largeur * 0.42, 1.5, 0.17);
    g.add(tel);
  }
  return g;
}

// Complexe sportif de la salle polyvalente (bâtiment 1675, 96 x 39 m, face
// au parking sud). Le bâti générique donne les volumes ; cette fonction
// plaque les éléments signature relevés en photo sur la façade SUD
// (normale -9°) : halle basket à l'OUEST (demi-lune vitrée, aileron vert
// SALLE DES SPORTS, banderole 80 ANS DE BASKET, losanges décoratifs),
// salle polyvalente à l'EST (auvent courbe Salle Polyvalente, bande de
// brise-soleil, casquettes de sheds). Les deux sas vitrés en saillie sont
// les bâtiments 2008/2009, reconstruits ici (le LiDAR leur prêtait la
// hauteur des sheds voisins : rendus en tours de 8 m par le générique).
function construireComplexeSportif(sol) {
  const g = new THREE.Group();
  const capFacade = -0.16;                     // normale -9° mesurée
  const nx = Math.sin(capFacade), nz = Math.cos(capFacade);
  const blanc = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.55 });
  const vertAmande = new THREE.MeshStandardMaterial({ color: 0x9db07f, roughness: 0.6 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x2e3a40, roughness: 0.18, metalness: 0.1 });
  const sombre = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6 });

  const texteCanvas = (largeur, hauteur, fond, encre, police, lignes) => {
    const c = document.createElement('canvas');
    c.width = largeur; c.height = hauteur;
    const ctx = c.getContext('2d');
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, largeur, hauteur);
    ctx.fillStyle = encre;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = police;
    const pas = hauteur / (lignes.length + 1);
    lignes.forEach((l, i) => ctx.fillText(l, largeur / 2, pas * (i + 1)));
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  };
  // Pose un mesh plat plaqué sur la façade sud, à `saillie` mètres du mur.
  const plaquer = (mesh, x, z, h, saillie = 0.12) => {
    mesh.position.set(x + nx * saillie, sol(x, z) + h, z + nz * saillie);
    mesh.rotation.y = capFacade;
    g.add(mesh);
  };

  // ---- Halle basket (ouest) ---------------------------------------------
  // Demi-lune vitrée à meneaux bruns, la pièce maîtresse de l'entrée.
  const texLune = (() => {
    const T = 512;
    const c = document.createElement('canvas');
    c.width = c.height = T;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b333a';                  // vitrage sombre
    ctx.fillRect(0, 0, T, T);
    ctx.strokeStyle = '#6d5843';                // meneaux brun bois
    ctx.lineWidth = 10;
    for (let i = 1; i < 6; i++) {
      ctx.beginPath(); ctx.moveTo((T / 6) * i, 0); ctx.lineTo((T / 6) * i, T); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (T / 6) * i); ctx.lineTo(T, (T / 6) * i); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const lune = new THREE.Mesh(new THREE.CircleGeometry(3.6, 28, 0, Math.PI),
    new THREE.MeshStandardMaterial({ map: texLune, roughness: 0.25, metalness: 0.08 }));
  plaquer(lune, -58.7, -226.8, 2.5, 0.14);
  // Arc de rive brun autour de la demi-lune.
  const arc = new THREE.Mesh(new THREE.RingGeometry(3.6, 3.95, 28, 1, 0, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x6d5843, roughness: 0.55, side: THREE.DoubleSide }));
  plaquer(arc, -58.7, -226.8, 2.5, 0.15);

  // Aileron vert en pointe, « SALLE DES SPORTS », dépasse du toit.
  const aileron = (() => {
    const forme = new THREE.Shape();
    forme.moveTo(-1.7, 0);
    forme.lineTo(1.7, 0);
    forme.lineTo(0.9, 10.2);
    forme.lineTo(-0.2, 10.2);
    forme.closePath();
    return new THREE.Mesh(new THREE.ShapeGeometry(forme), vertAmande);
  })();
  plaquer(aileron, -55.2, -226.6, 0.05, 0.18);
  const texSports = texteCanvas(160, 512, '#9db07f', '#2e3428',
    'bold 54px Helvetica, Arial, sans-serif', ['SALLE', 'DES', 'SPORTS']);
  const sports = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 4.8),
    new THREE.MeshStandardMaterial({ map: texSports, roughness: 0.6 }));
  plaquer(sports, -55.2, -226.6, 6.4, 0.22);

  // Banderole du club : 80 ans de basket sur fond noir.
  const texBasket = texteCanvas(1024, 128, '#141518', '#f0efe9',
    'bold 52px Helvetica, Arial, sans-serif', ['1946 - 2026   80 ANS DE BASKET']);
  const banderole = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.95),
    new THREE.MeshStandardMaterial({ map: texBasket, roughness: 0.6 }));
  plaquer(banderole, -62.6, -227.5, 3.3, 0.16);
  // Portes vitrées sous la banderole.
  const portesHalle = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 2.5), vitre);
  plaquer(portesHalle, -62.6, -227.5, 1.25, 0.13);

  // Losanges décoratifs sombres du soubassement ouest.
  for (const t of [3, 7, 11]) {
    const losange = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), sombre);
    const lx = -68 - t * 0.985, lz = -228.4 - t * 0.155;   // le long de l'arête 9
    losange.position.set(lx + nx * 0.13, sol(lx, lz) + 3.2, lz + nz * 0.13);
    losange.rotation.y = capFacade;
    losange.rotation.z = Math.PI / 4;
    g.add(losange);
  }

  // ---- Entrée de la salle polyvalente (décroché central) -----------------
  // Marquise courbe blanche (cylindre couché tronqué, bombé vers le
  // parking), lettrage porté par un bandeau plat dessous : mapper le texte
  // sur la courbe l'aurait écrit perpendiculairement (UV cylindriques).
  const marquiseSP = new THREE.Mesh(
    new THREE.CylinderGeometry(1.35, 1.35, 6.2, 20, 1, true, -Math.PI * 0.42, Math.PI * 0.5),
    new THREE.MeshStandardMaterial({ color: 0xeceae2, roughness: 0.5, side: THREE.DoubleSide }));
  marquiseSP.rotation.z = Math.PI / 2;
  marquiseSP.position.set(-47.5 + nx * 1.0, sol(-47.5, -225.4) + 3.5, -225.4 + nz * 1.0);
  marquiseSP.rotation.y = capFacade;
  g.add(marquiseSP);
  const texSP = texteCanvas(1024, 128, '#eceae2', '#4a4d42',
    'bold 58px Helvetica, Arial, sans-serif', ['Salle Polyvalente']);
  const bandeauSP = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.7),
    new THREE.MeshStandardMaterial({ map: texSP, roughness: 0.5 }));
  plaquer(bandeauSP, -47.5, -225.4, 3.3, 0.9);
  // Sas vitré blanc sous la marquise.
  const sasSP = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 2.7), vitre);
  plaquer(sasSP, -47.5, -225.4, 1.35, 0.13);
  const cadreSP = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.35, 0.2), blanc);
  plaquer(cadreSP, -47.5, -225.4, 2.9, 0.14);

  // ---- Salle polyvalente (est) : brise-soleil et casquettes de sheds -----
  const texLames = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5a5347';
    ctx.fillRect(0, 0, 64, 128);
    ctx.fillStyle = '#2e2b25';
    for (let y = 4; y < 128; y += 12) ctx.fillRect(0, y, 64, 6);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(16, 1);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  // La façade est file de (-21,7,-221,2) à (-44,7,-225) : cap du fil ~-9°.
  const lames = new THREE.Mesh(new THREE.PlaneGeometry(22.6, 1.25),
    new THREE.MeshStandardMaterial({ map: texLames, roughness: 0.7 }));
  plaquer(lames, -33.2, -223.1, 4.1, 0.14);
  // Cinq casquettes de sheds inclinées, débordantes, régulièrement espacées.
  for (let i = 0; i < 5; i++) {
    const casquette = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.14, 1.7), blanc);
    const t = 2.6 + i * 4.5;                    // abscisse le long de la façade
    const cx = -21.7 - t * 0.985, cz = -221.2 - t * 0.155;
    casquette.position.set(cx + nx * 0.5, sol(cx, cz) + 5.35, cz + nz * 0.5);
    casquette.rotation.y = capFacade;
    casquette.rotation.x = -0.28;               // pente vers le parking
    g.add(casquette);
  }

  // ---- Sas vitrés en saillie (ex-bâtiments 2008 et 2009) -----------------
  for (const [sx, sz, cap] of [[-30.97, -221.72, 1.40], [-20.19, -219.97, 1.41]]) {
    const sas = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(3.5, 2.9, 2.0), vitre);
    corps.position.y = 1.45;
    sas.add(corps);
    const couronne = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.45, 2.2), blanc);
    couronne.position.y = 3.05;
    sas.add(couronne);
    sas.position.set(sx, sol(sx, sz), sz);
    sas.rotation.y = cap;
    g.add(sas);
  }
  return g;
}

// Citystade entre la salle polyvalente et la Calandreta (pitch « multi »
// OSM, rectangle mesuré 21,5 x 12,2 m centré (9,4, -224,2)). Relevé photo :
// bardage bas vert amande pâle, palissade de barreaux galvanisés à 3 m,
// pare-ballons à poteaux bleu-gris et filets aux deux extrémités, paniers de
// basket, sol en enrobé sombre. Repère local : X = grand axe.
function construireCitystade() {
  const g = new THREE.Group();
  const LONG = 21.5, LARGE = 12.2;
  const vertPale = new THREE.MeshStandardMaterial({ color: 0xccd6b4, roughness: 0.6 });
  const galva = new THREE.MeshStandardMaterial({ color: 0x8f979d, roughness: 0.45, metalness: 0.4 });
  const bleuGris = new THREE.MeshStandardMaterial({ color: 0x5a6b7d, roughness: 0.5, metalness: 0.3 });

  // Sol : enrobé sombre du plateau, posé au-dessus de la pelouse OSM.
  const solStade = new THREE.Mesh(new THREE.PlaneGeometry(LONG, LARGE),
    new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.92 }));
  solStade.rotation.x = -Math.PI / 2;
  solStade.position.y = 0.03;
  g.add(solStade);

  // Barreaux : texture répétée à alphaTest, un plan par côté (des centaines
  // de cylindres seraient hors budget).
  const texBarreaux = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.fillStyle = '#9aa2a8';
    for (let x = 2; x < 64; x += 16) ctx.fillRect(x, 0, 5, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const matBarreaux = (rep) => {
    const t = texBarreaux.clone();
    t.needsUpdate = true;
    t.repeat.set(rep, 1);
    return new THREE.MeshStandardMaterial({
      map: t, transparent: true, alphaTest: 0.4, roughness: 0.45, metalness: 0.4,
      side: THREE.DoubleSide,
    });
  };
  // Filet des pare-ballons : grille très fine, à peine opaque.
  const matFilet = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(210,214,218,0.85)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 64; i += 8) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 64); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(64, i); ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(10, 3);
    return new THREE.MeshStandardMaterial({
      map: t, transparent: true, opacity: 0.55, roughness: 0.6,
      side: THREE.DoubleSide, depthWrite: false,
    });
  })();

  // Périmètre : bardage plein (1 m) surmonté de barreaux (jusqu'à 3 m).
  const cotes = [
    { cx: 0, cz: -LARGE / 2, l: LONG, rot: 0 },
    { cx: 0, cz: LARGE / 2, l: LONG, rot: 0 },
    { cx: -LONG / 2, cz: 0, l: LARGE, rot: Math.PI / 2 },
    { cx: LONG / 2, cz: 0, l: LARGE, rot: Math.PI / 2 },
  ];
  for (const c of cotes) {
    const bardage = new THREE.Mesh(new THREE.BoxGeometry(c.l, 1.0, 0.08), vertPale);
    bardage.position.set(c.cx, 0.5, c.cz);
    bardage.rotation.y = c.rot;
    g.add(bardage);
    const haut = new THREE.Mesh(new THREE.PlaneGeometry(c.l, 2.0), matBarreaux(c.l / 1.0));
    haut.position.set(c.cx, 2.0, c.cz);
    haut.rotation.y = c.rot;
    g.add(haut);
    // Lisse haute galva.
    const lisse = new THREE.Mesh(new THREE.BoxGeometry(c.l, 0.07, 0.07), galva);
    lisse.position.set(c.cx, 3.0, c.cz);
    lisse.rotation.y = c.rot;
    g.add(lisse);
  }
  // Poteaux du périmètre, tous les ~3,6 m.
  for (const c of cotes) {
    const n = Math.round(c.l / 3.6);
    for (let i = 0; i <= n; i++) {
      const poteau = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8), galva);
      const t = -c.l / 2 + (c.l / n) * i;
      poteau.position.set(
        c.rot === 0 ? c.cx + t : c.cx,
        1.5,
        c.rot === 0 ? c.cz : c.cz + t);
      g.add(poteau);
    }
  }

  // Pare-ballons aux extrémités : trois poteaux hauts bleu-gris et filet.
  for (const bout of [-1, 1]) {
    for (const pz of [-LARGE / 2, 0, LARGE / 2]) {
      const mat5 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.6, 8), bleuGris);
      mat5.position.set(bout * LONG / 2, 2.8, pz);
      g.add(mat5);
    }
    const filet = new THREE.Mesh(new THREE.PlaneGeometry(LARGE, 2.6), matFilet);
    filet.position.set(bout * LONG / 2, 4.3, 0);
    filet.rotation.y = Math.PI / 2;
    g.add(filet);
    // Panier de basket tourné vers l'intérieur : poteau, panneau blanc,
    // arceau.
    const potPanier = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 8), galva);
    potPanier.position.set(bout * (LONG / 2 - 1.1), 1.55, 0);
    g.add(potPanier);
    const panneau = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75),
      new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: 0.5, side: THREE.DoubleSide }));
    panneau.position.set(bout * (LONG / 2 - 1.25), 2.9, 0);
    panneau.rotation.y = bout > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(panneau);
    const arceau = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0xc8452c, roughness: 0.5 }));
    arceau.rotation.x = Math.PI / 2;
    arceau.position.set(bout * (LONG / 2 - 1.55), 2.6, 0);
    g.add(arceau);
  }
  return g;
}

// Fresque murale du pignon est de la halle des sports, face au citystade :
// peinture naïve colorée (ciel, collines, silhouettes) relevée sur photo.
function construireFresque() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  // Ciel, collines, bande de fête colorée : évocation, pas reproduction.
  const ciel = ctx.createLinearGradient(0, 0, 0, 100);
  ciel.addColorStop(0, '#a8cbe0');
  ciel.addColorStop(1, '#dfeaf0');
  ctx.fillStyle = ciel;
  ctx.fillRect(0, 0, 512, 110);
  ctx.fillStyle = '#7fa863';
  ctx.beginPath();
  ctx.moveTo(0, 110);
  for (let x = 0; x <= 512; x += 32) ctx.lineTo(x, 95 + 18 * Math.sin(x / 60));
  ctx.lineTo(512, 192); ctx.lineTo(0, 192);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5c8a4a';
  ctx.fillRect(0, 140, 512, 52);
  const teintes = ['#c8452c', '#e0a231', '#4a76a8', '#b05c8a', '#3f9b6e'];
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = teintes[i % teintes.length];
    const x = 20 + i * 35, h = 26 + (i % 3) * 9;
    ctx.fillRect(x, 158 - h, 9, h);          // silhouettes dansantes stylisées
    ctx.beginPath(); ctx.arc(x + 4.5, 152 - h, 6, 0, Math.PI * 2); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return new THREE.Mesh(new THREE.PlaneGeometry(8, 3),
    new THREE.MeshStandardMaterial({ map: t, roughness: 0.65 }));
}

// Entrée du collège Jean Moulin, avenue de la 2ème Division Blindée, face à
// la salle polyvalente. La photo montre un AUVENT ADOSSÉ à la façade nord du
// long bâtiment 1952 (pas un préau isolé : une première pose flottante
// enjambait l'avenue comme un pont), un pan d'entrée bleu-gris en retrait à
// la jonction des deux fronts, et une contre-allée de places en épi VIDES
// entre l'avenue et le collège (bande dédiée dans parking.js, zone sans
// voitures dans parkedcars.js).
function construireEntreeCollege(sol) {
  const g = new THREE.Group();
  const acier = new THREE.MeshStandardMaterial({ color: 0x7d8578, roughness: 0.45, metalness: 0.35 });
  const dalle = new THREE.MeshStandardMaterial({ color: 0xdedbd2, roughness: 0.6 });

  // Un segment d'auvent en console le long d'un front : toit fin débordant
  // de 2,5 m devant le mur, rive claire, poteaux fins côté rue tous les 5 m.
  // Convention vérifiée : X local → (ux, uz) exige rotation.y = atan2(-uz, ux).
  const segmentAuvent = (cx, cz, longueur, ux, uz) => {
    const seg = new THREE.Group();
    const toit = new THREE.Mesh(new THREE.BoxGeometry(longueur, 0.14, 2.5), dalle);
    toit.position.y = 2.95;
    seg.add(toit);
    const rive = new THREE.Mesh(new THREE.BoxGeometry(longueur, 0.26, 2.6),
      new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.55 }));
    rive.position.y = 2.82;
    seg.add(rive);
    const n = Math.floor(longueur / 5);
    for (let i = 0; i <= n; i++) {
      const poteau = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.85, 8), acier);
      // Z local positif = côté rue (le nord, vérifié par (sin θ, cos θ)).
      poteau.position.set(-longueur / 2 + (longueur - n * 5) / 2 + i * 5, 1.42, 1.05);
      seg.add(poteau);
    }
    seg.position.set(cx, sol(cx, cz), cz);
    seg.rotation.y = Math.atan2(-uz, ux);
    g.add(seg);
  };
  // Front ouest : arête 6 du bâtiment 1952, A(-44,4,-190,3)→B(-89,9,-197,5).
  segmentAuvent(-66.93, -195.28, 44, -0.987, -0.156);
  // Front est : arête 4, A(-12,8,-186,3)→B(-44,3,-190,8).
  segmentAuvent(-28.36, -189.94, 30, -0.988, -0.141);

  // Pan d'entrée bleu-gris en retrait, à la jonction des deux fronts.
  const pan = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2),
    new THREE.MeshStandardMaterial({ color: 0x8fa2ad, roughness: 0.55 }));
  pan.position.set(-44.4 + 0.156 * 0.12, sol(-44.4, -190.55) + 1.6, -190.55 - 0.988 * 0.12);
  pan.rotation.y = Math.atan2(0.156, -0.988);
  g.add(pan);
  return g;
}

// Une façade du magasin « Tendances du Moment », le grand commerce fermé
// derrière la station Leclerc (emprises 1074 à l'ouest et 1067 à l'est, en
// retrait l'une de l'autre : le bandeau se pose en deux plans). Signature du
// lieu : bandeau blanc à groupes de RAYURES VERTICALES MULTICOLORES, lettrage
// cursif noir, vitrines aux rideaux blancs baissés, porche ENTRÉE à fronton.
function construireFacadeTendances({ largeur, texte, porche }) {
  const g = new THREE.Group();
  const blancMur = new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.6 });
  // Rideaux métalliques blancs baissés : mats, à peine plus gris que le mur.
  const rideau = new THREE.MeshStandardMaterial({ color: 0xdddcd6, roughness: 0.7 });

  // Fond de façade commerciale sous le bandeau.
  const fond = new THREE.Mesh(new THREE.BoxGeometry(largeur, 2.9, 0.12), blancMur);
  fond.position.set(0, 1.45, 0.06);
  g.add(fond);
  // Vitrines à rideaux baissés, réparties sur la largeur.
  const nVitrines = Math.max(2, Math.round(largeur / 4.2));
  const pas = largeur / nVitrines;
  for (let i = 0; i < nVitrines; i++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(pas * 0.72, 2.15), rideau);
    v.position.set(-largeur / 2 + pas * (i + 0.5), 1.22, 0.13);
    g.add(v);
  }

  // Bandeau signature : blanc, rayures multicolores en groupes, cursive.
  const texBandeau = (() => {
    const L = 2048, H = 128;
    const c = document.createElement('canvas');
    c.width = L; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f4f2ee';
    ctx.fillRect(0, 0, L, H);
    // Trois groupes de rayures : extrémités et un accent aux deux tiers,
    // comme sur le bandeau réel.
    const couleurs = ['#c8102e', '#e87511', '#e8c211', '#3f9b35', '#1f6fbe', '#5b3a8e', '#c2358c'];
    let graine = 7;
    const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
    for (const [debut, fin] of [[0, 0.12], [0.62, 0.74], [0.90, 1]]) {
      let px = L * debut;
      while (px < L * fin) {
        const w = 8 + alea() * 26;
        ctx.fillStyle = couleurs[Math.floor(alea() * couleurs.length)];
        ctx.fillRect(px, 0, w, H);
        px += w + 4 + alea() * 18;
      }
    }
    if (texte) {
      ctx.fillStyle = '#22211f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Cursive : la vraie enseigne est manuscrite ; l'italique gras serré en
      // est la meilleure approximation sans police embarquée.
      ctx.font = 'italic 700 76px "Brush Script MT", "Snell Roundhand", cursive';
      ctx.fillText('Tendances du Moment', L * 0.38, H / 2 + 6);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(largeur, 0.95),
    new THREE.MeshStandardMaterial({ map: texBandeau, roughness: 0.55 }));
  bandeau.position.set(0, 3.35, 0.13);
  g.add(bandeau);

  if (porche) {
    // Avant-corps d'entrée : deux jambages, fronton triangulaire blanc et
    // « ENTRÉE » en capitales noires.
    for (const cote of [-1, 1]) {
      const jambage = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.5, 1.5), blancMur);
      jambage.position.set(cote * 1.55, 1.25, 0.8);
      g.add(jambage);
    }
    const texEntree = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f4f2ee';
      ctx.fillRect(0, 0, 256, 64);
      ctx.fillStyle = '#26251f';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 34px Helvetica, Arial, sans-serif';
      ctx.fillText('ENTRÉE', 128, 34);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const linteau = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 1.5),
      new THREE.MeshStandardMaterial({ map: texEntree, roughness: 0.55 }));
    linteau.position.set(0, 2.8, 0.8);
    g.add(linteau);
    // Fronton triangulaire plat au-dessus du linteau.
    const tri = new THREE.Shape();
    tri.moveTo(-1.9, 0);
    tri.lineTo(1.9, 0);
    tri.lineTo(0, 1.0);
    tri.closePath();
    const fronton = new THREE.Mesh(new THREE.ShapeGeometry(tri),
      new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.6, side: THREE.DoubleSide }));
    fronton.position.set(0, 3.1, 1.5);
    g.add(fronton);
    const portes = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x39434a, roughness: 0.2, metalness: 0.1 }));
    portes.position.set(0, 1.15, 0.16);
    g.add(portes);
  }
  return g;
}

// Station-service du Leclerc Express : auvent au chant JAUNE VIF sur quatre
// fûts (le jaune se voit de tout le carrefour, c'est la signature du lieu),
// deux îlots de distribution et le totem de prix. Silhouette immédiatement
// reconnaissable depuis l'avenue, absente de toutes les bases.
function construireStation() {
  const g = new THREE.Group();
  const blanc = new THREE.MeshStandardMaterial({ color: 0xe9eaea, roughness: 0.55 });
  // Jaune tenu clair : sous ACES un jaune moyen vire au moutarde terne.
  const jaune = new THREE.MeshStandardMaterial({ color: 0xf2df3a, roughness: 0.5 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.5 });

  // Dimensions de l'auvent réel mesuré sur la BD TOPO : 12,1 x 5,2 m.
  const marquise = new THREE.Mesh(new THREE.BoxGeometry(12.1, 0.45, 5.2), blanc);
  marquise.position.y = 4.15;
  g.add(marquise);
  // Chant périphérique jaune, épais comme sur la vraie station.
  const bandeau = new THREE.Mesh(new THREE.BoxGeometry(12.3, 0.72, 5.4), jaune);
  bandeau.position.y = 3.85;
  g.add(bandeau);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.9, 8), metal);
      fut.position.set(sx * 4.7, 1.95, sz * 1.6);
      g.add(fut);
    }
  }
  for (const sx of [-1, 1]) {
    const ilot = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.14, 1.1), blanc);
    ilot.position.set(sx * 2.2, 0.07, 0);
    g.add(ilot);
    const pompe = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.55),
      new THREE.MeshStandardMaterial({ color: 0xdfe2e4, roughness: 0.5 }));
    pompe.position.set(sx * 2.2, 0.99, 0);
    g.add(pompe);
    for (const f of [-1, 1]) {
      const ecran = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5),
        new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.3 }));
      ecran.position.set(sx * 2.2, 1.25, f * 0.29);
      ecran.rotation.y = f > 0 ? 0 : Math.PI;
      g.add(ecran);
    }
  }
  return g;
}

// Totem de prix BLANC de la station : tête E.LECLERC bleue, lignes de prix
// rouges, « 24/24 » en pied. Posé HORS du groupe station : il borde la D32
// (le poser dans le groupe le faisait pivoter avec l'auvent, tranche vers la
// route).
function construireTotemLeclerc() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.4, metalness: 0.5 });
  const texTotem = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2f3f4';
    ctx.fillRect(0, 0, 128, 256);
    ctx.fillStyle = '#1d3f8f';
    ctx.fillRect(0, 0, 128, 52);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Helvetica, Arial, sans-serif';
    ctx.fillText('E.LECLERC', 64, 34);
    ctx.fillStyle = '#c8102e';
    ctx.font = 'bold 20px Helvetica, Arial, sans-serif';
    for (let i = 0; i < 3; i++) ctx.fillText('—.——', 64, 92 + i * 40);
    ctx.fillStyle = '#1d3f8f';
    ctx.font = 'bold 26px Helvetica, Arial, sans-serif';
    ctx.fillText('24/24', 64, 232);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const totem = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 0.24), [
    metal, metal, metal, metal,
    new THREE.MeshStandardMaterial({ map: texTotem, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ map: texTotem, roughness: 0.5 }),
  ]);
  totem.position.set(0, 2.1, 0);
  g.add(totem);
  const totemPied = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.24), metal);
  totemPied.position.set(0, 0.45, 0);
  g.add(totemPied);
  return g;
}

// Terrasse de brasserie : store banne au-dessus de la devanture et tables
// rondes sur le trottoir. `nx, nz` : normale de la façade, vers la rue.
function construireTerrasse(nx, nz) {
  const g = new THREE.Group();
  const toile = new THREE.MeshStandardMaterial({ color: 0x6e2430, roughness: 0.85, side: THREE.DoubleSide });
  const store = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 2.2), toile);
  store.position.set(nx * 0.95, 2.9, nz * 0.95);
  store.rotation.y = Math.atan2(nx, nz);
  store.rotateX(-0.55);
  g.add(store);
  const alu = new THREE.MeshStandardMaterial({ color: 0x7a7d80, roughness: 0.4, metalness: 0.5 });
  const tx = -nz, tz = nx;   // tangente de la façade
  for (let t = 0; t < 3; t++) {
    const table = new THREE.Group();
    const plateau = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 12), alu);
    plateau.position.y = 0.72;
    table.add(plateau);
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.16, 0.72, 8), alu);
    pied.position.y = 0.36;
    table.add(pied);
    for (const a of [0.8, 2.4, 4.2]) {
      const chaise = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.45, 0.36), alu);
      chaise.position.set(Math.cos(a + t) * 0.72, 0.24, Math.sin(a + t) * 0.72);
      table.add(chaise);
    }
    table.position.set(nx * 2.4 + (t - 1) * 2.1 * tx, 0, nz * 2.4 + (t - 1) * 2.1 * tz);
    g.add(table);
  }
  return g;
}

// Préau d'école : toit monopente clair sur six poteaux verts, côté cour.
function construirePreau() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a6f52, roughness: 0.55, metalness: 0.35 });
  const toitPreau = new THREE.Mesh(new THREE.BoxGeometry(9, 0.14, 4.6),
    new THREE.MeshStandardMaterial({ color: 0xb9bec2, roughness: 0.6, side: THREE.DoubleSide }));
  toitPreau.position.y = 2.75;
  toitPreau.rotation.z = 0.07;
  g.add(toitPreau);
  for (const sx of [-1, 0, 1]) {
    for (const sz of [-1, 1]) {
      const poteau = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.8, 8), metal);
      poteau.position.set(sx * 4.1, 1.4, sz * 2.0);
      g.add(poteau);
    }
  }
  return g;
}

// Texture du caisson d'enseigne de La Poste : lettres bleu nuit sur fond
// jaune, l'identité visuelle réelle, dessinée en canvas comme toutes les
// enseignes du projet.
function texturePoste() {
  const L = 512, H = 96;
  const c = document.createElement('canvas');
  c.width = L; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5c500';
  ctx.fillRect(0, 0, L, H);
  ctx.fillStyle = '#003b7f';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${H * 0.52}px Helvetica, Arial, sans-serif`;
  ctx.fillText('LA POSTE', L / 2 + H * 0.35, H / 2 + 2);
  // L'oiseau postal, réduit à sa flèche pliée bleu nuit.
  ctx.beginPath();
  ctx.moveTo(H * 0.35, H * 0.7);
  ctx.lineTo(H * 0.75, H * 0.3);
  ctx.lineTo(H * 0.95, H * 0.52);
  ctx.lineTo(H * 0.65, H * 0.62);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropie();
  return t;
}

// Bureau de poste d'Artix, reconstruit d'après les panoramiques de l'avenue :
// R+1 crème à corniche, balcon filant à garde-corps blanc sur toute la
// façade, baies barreaudées au rez-de-chaussée, caisson jaune LA POSTE et
// boîte aux lettres sur rue.
function construirePoste(boite) {
  const g = new THREE.Group();
  // L'emprise BD TOPO sous le POI est l'îlot entier (23 x 23 m) : le bureau
  // de poste réel n'en occupe que l'aile sur rue, environ 15 x 10 m sur les
  // panoramiques. Les cotes sont plafonnées en conséquence.
  const L = Math.min(boite.longueur, 18), W = Math.min(boite.largeur, 11.5);
  const creme = new THREE.MeshStandardMaterial({ color: 0xefe9db, roughness: 0.85, side: THREE.DoubleSide });
  const gris = new THREE.MeshStandardMaterial({ color: 0x9c9c98, roughness: 0.9 });
  const blanc = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 });
  const sombre = new THREE.MeshStandardMaterial({ color: 0x232a33, roughness: 0.4 });

  const H_MUR = 6.6;
  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H_MUR, W), creme);
  corps.position.y = H_MUR / 2;
  g.add(corps);
  // Soubassement gris.
  const soub = new THREE.Mesh(new THREE.BoxGeometry(L + 0.06, 0.7, W + 0.06), gris);
  soub.position.y = 0.35;
  g.add(soub);
  // Corniche et toit à quatre pans très plat.
  const corniche = new THREE.Mesh(new THREE.BoxGeometry(L + 0.5, 0.3, W + 0.5), blanc);
  corniche.position.y = H_MUR + 0.15;
  g.add(corniche);
  const toit = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(L, W) / 2 * 0.72, 1.5, 4),
    new THREE.MeshStandardMaterial({ color: 0x6a4a38, roughness: 0.8 }));
  toit.rotation.y = Math.PI / 4;
  toit.scale.set(1, 1, W / L);
  toit.position.y = H_MUR + 1.02;
  g.add(toit);

  // Les deux longues façades reçoivent le même traitement : celle sur rue
  // porte en plus l'enseigne (posée par l'appelant selon l'orientation).
  for (const face of [-1, 1]) {
    const zF = face * (W / 2 + 0.02);
    // Rez : trois baies vitrées barreaudées et la porte.
    for (let k = 0; k < 3; k++) {
      const xB = -L / 2 + (k + 0.75) * L / 4;
      const baie = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.7), sombre);
      baie.position.set(xB, 1.85, zF);
      baie.rotation.y = face > 0 ? 0 : Math.PI;
      g.add(baie);
      for (let bar = 0; bar < 5; bar++) {
        const barre = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.7, 0.03), blanc);
        barre.position.set(xB - 0.8 + bar * 0.4, 1.85, zF + face * 0.04);
        g.add(barre);
      }
    }
    const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.5), sombre);
    porte.position.set(L / 2 - 2.2, 1.28, zF);
    porte.rotation.y = face > 0 ? 0 : Math.PI;
    g.add(porte);

    // Balcon filant du R+1 : dalle en saillie et garde-corps barreaudé blanc.
    const dalle = new THREE.Mesh(new THREE.BoxGeometry(L * 0.92, 0.14, 0.9), blanc);
    dalle.position.set(0, 3.45, face * (W / 2 + 0.45));
    g.add(dalle);
    const lisse = new THREE.Mesh(new THREE.BoxGeometry(L * 0.92, 0.05, 0.05), blanc);
    lisse.position.set(0, 4.45, face * (W / 2 + 0.88));
    g.add(lisse);
    const nBarreaux = Math.floor(L * 0.92 / 0.24);
    for (let bar = 0; bar < nBarreaux; bar++) {
      const barre = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.95, 0.025), blanc);
      barre.position.set(-L * 0.46 + bar * 0.24, 3.98, face * (W / 2 + 0.88));
      g.add(barre);
    }
    // Portes-fenêtres de l'étage.
    for (let k = 0; k < 4; k++) {
      const pf = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.15), sombre);
      pf.position.set(-L / 2 + (k + 0.6) * L / 4.4, 4.65, zF);
      pf.rotation.y = face > 0 ? 0 : Math.PI;
      g.add(pf);
    }
  }

  // Caisson d'enseigne LA POSTE au-dessus de l'entrée, et l'inscription en
  // GRANDES lettres sur l'étage, comme peinte sur l'enduit : c'est elle qui
  // identifie le bâtiment depuis l'avenue.
  const enseigneMat = new THREE.MeshStandardMaterial({ map: texturePoste(), roughness: 0.5 });
  for (const face of [-1, 1]) {
    const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.82), enseigneMat);
    enseigne.position.set(0, 2.95, face * (W / 2 + 0.08));
    enseigne.rotation.y = face > 0 ? 0 : Math.PI;
    g.add(enseigne);
  }
  const grandesLettres = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 160;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 160);
    ctx.fillStyle = '#003b7f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 118px Helvetica, Arial, sans-serif';
    ctx.fillText('LA POSTE', 512, 84);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const lettresMat = new THREE.MeshStandardMaterial({
    map: grandesLettres, transparent: true, alphaTest: 0.2, roughness: 0.8,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8,
  });
  // Sur les DEUX longues façades : quel que soit le côté rue issu du calcul
  // d'axes, l'inscription se lit depuis l'avenue. Calée sous la corniche.
  for (const face of [-1, 1]) {
    const inscription = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(L * 0.72, 11), 1.15), lettresMat);
    inscription.position.set(0, 6.3, face * (W / 2 + 0.06));
    inscription.rotation.y = face > 0 ? 0 : Math.PI;
    g.add(inscription);
  }
  // Boîte aux lettres jaune sur rue : la signature d'un bureau de poste.
  const bal = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xf5c500, roughness: 0.55 }));
  bal.position.set(L / 2 - 0.8, 0.55, W / 2 + 1.1);
  g.add(bal);
  // Distributeur de billets encastré et drapeaux bleus, relevés sur les
  // panoramiques : le caisson bleu du DAB à côté de la porte, et deux
  // enseignes drapeau superposées en tête de façade.
  const bleuPoste = new THREE.MeshStandardMaterial({ color: 0x1a4fa0, roughness: 0.45 });
  for (const face of [-1, 1]) {
    const dab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.7, 0.16), bleuPoste);
    dab.position.set(L / 2 - 4.2, 1.25, face * (W / 2 + 0.06));
    g.add(dab);
    const ecranDab = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.3 }));
    ecranDab.position.set(L / 2 - 4.2, 1.45, face * (W / 2 + 0.15));
    ecranDab.rotation.y = face > 0 ? 0 : Math.PI;
    g.add(ecranDab);
    for (let k = 0; k < 2; k++) {
      const drapeau = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.7), bleuPoste);
      drapeau.position.set(L / 2 - 2.6, 3.6 - k * 0.65, face * (W / 2 + 0.35));
      g.add(drapeau);
    }
  }
  return g;
}

// Devanture de la boulangerie Maison Chaudron, reconstruite d'après les
// panoramiques de l'avenue : bandeau noir mat portant le nom en lettres
// dorées et la mention ARTISAN BOULANGER PÂTISSIER, vitrines sombres à
// encadrements noirs, porte vitrée centrale et enseigne drapeau dorée en épi.
function construireBoulangerie() {
  const g = new THREE.Group();
  const noir = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.55 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x232c31, roughness: 0.22, metalness: 0.1 });
  const LARGEUR = 7.2, H_BANDEAU = 1.0;

  // Fond de devanture : panneau noir sur toute la largeur du commerce.
  const fond = new THREE.Mesh(new THREE.BoxGeometry(LARGEUR, 2.9, 0.14), noir);
  fond.position.set(0, 1.45, 0.07);
  g.add(fond);
  // Vitrines de part et d'autre de la porte, en léger retrait du cadre noir.
  for (const cote of [-1, 1]) {
    const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 1.85), vitre);
    vitrine.position.set(cote * 2.15, 1.25, 0.15);
    g.add(vitrine);
  }
  const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 2.15), vitre);
  porte.position.set(0, 1.1, 0.15);
  g.add(porte);

  // Bandeau d'enseigne : le nom en doré, la mention en capitales blanches.
  const texture = (() => {
    const L = 1024, H = 150;
    const c = document.createElement('canvas');
    c.width = L; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#141516';
    ctx.fillRect(0, 0, L, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#cfa64b';
    ctx.font = 'italic bold 62px Georgia, serif';
    ctx.fillText('Maison Chaudron', L / 2, 46);
    ctx.fillStyle = '#efece4';
    ctx.font = '600 34px Helvetica, Arial, sans-serif';
    ctx.fillText('A R T I S A N   B O U L A N G E R   P Â T I S S I E R', L / 2, 112);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(LARGEUR * 0.96, H_BANDEAU),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.5 }));
  bandeau.position.set(0, 2.62, 0.16);
  g.add(bandeau);

  // Enseigne drapeau dorée : l'épi de blé stylisé, perpendiculaire à la rue.
  const epi = (() => {
    const T = 128;
    const c = document.createElement('canvas');
    c.width = c.height = T;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, T, T);
    ctx.strokeStyle = '#cfa64b';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(T / 2, T * 0.9);
    ctx.lineTo(T / 2, T * 0.14);
    ctx.stroke();
    for (let k = 0; k < 5; k++) {
      const y = T * (0.2 + k * 0.13);
      for (const cote2 of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(T / 2, y);
        ctx.quadraticCurveTo(T / 2 + cote2 * T * 0.2, y - T * 0.05, T / 2 + cote2 * T * 0.28, y - T * 0.14);
        ctx.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const drapeauMat = new THREE.MeshStandardMaterial({
    map: epi, transparent: true, alphaTest: 0.3, roughness: 0.45, side: THREE.DoubleSide,
  });
  const potence = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.6), noir);
  potence.position.set(LARGEUR / 2 - 0.4, 3.1, 0.3);
  g.add(potence);
  const drapeau = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), drapeauMat);
  drapeau.position.set(LARGEUR / 2 - 0.4, 2.78, 0.58);
  drapeau.rotation.y = Math.PI / 2;
  g.add(drapeau);
  return g;
}

// Pizzeria « Pronto Pizza », place du Général de Gaulle. Bâtiment 1121 de la
// BD TOPO, retiré du bâti ordinaire : pavillon de plain-pied (gouttière
// LiDAR 2,8 m, faîtage 4,2 m) dont l'extrusion automatique aurait coiffé la
// façade d'un toit de tuiles ; le vrai toit est gris anthracite et le pignon
// d'enseigne à clins blancs dépasse la gouttière. Relevé Panoramax
// (prises 90d6fc5d et 55be8906, janv. 2025) : grande baie sous store banne
// framboise délavé, enseigne noire à lettrage doré dans le pignon, entrée au
// nord sous auvent anthracite, panneau mural « COMMANDEZ AU 05 59 53 91 31 ».
// Repère local : façade rue dans le plan z = 0 (face +Z), X+ vers le SUD.
function construirePizzeria() {
  const g = new THREE.Group();
  const L = 12.2, PROF = 10, H_MUR = 2.8, H_FAITE = 4.2;

  const blanc = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.92 });
  const toitMat = new THREE.MeshStandardMaterial({
    color: 0x54565a, roughness: 0.9, side: THREE.DoubleSide,
  });
  const anthracite = new THREE.MeshStandardMaterial({ color: 0x3c3e42, roughness: 0.7 });
  const noir = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.55 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x232c31, roughness: 0.22, metalness: 0.1 });
  // Framboise passé par des étés de plein ouest : tenu clair pour ACES.
  const storeMat = new THREE.MeshStandardMaterial({ color: 0xc98a94, roughness: 0.85 });

  // Clins horizontaux du pignon : lignes d'ombre discrètes sur blanc cassé,
  // 1 m de bardage par tuile de texture (les UV de ShapeGeometry sont en mètres).
  const clinsMat = (() => {
    const T = 128;
    const c = document.createElement('canvas');
    c.width = c.height = T;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f0eee8';
    ctx.fillRect(0, 0, T, T);
    ctx.fillStyle = '#d9d6cd';
    for (let y = 0; y < T; y += 16) ctx.fillRect(0, y, T, 3);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropie();
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide });
  })();

  // Corps principal : murs blancs sous toit à deux pans, faîte le long de la
  // façade (LiDAR : azimut de faîtage ~30°, dans l'axe de l'arête sur rue).
  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H_MUR, PROF), blanc);
  corps.position.set(0, H_MUR / 2, -PROF / 2);
  g.add(corps);
  const pente = Math.atan2(H_FAITE - H_MUR, PROF / 2);
  const versant = Math.hypot(H_FAITE - H_MUR, PROF / 2);
  for (const cote of [-1, 1]) {
    // cote -1 : pan côté rue (couvre z 0 → -PROF/2), cote 1 : pan arrière.
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(L + 0.6, versant + 0.6), toitMat);
    pan.position.set(0, (H_MUR + H_FAITE) / 2 - 0.04, -PROF / 2 - cote * PROF / 4);
    pan.rotation.x = -Math.PI / 2 - cote * pente;
    g.add(pan);
  }
  for (const cote of [-1, 1]) {
    const tri = new THREE.Shape();
    tri.moveTo(-PROF / 2, 0);
    tri.lineTo(PROF / 2, 0);
    tri.lineTo(0, H_FAITE - H_MUR);
    tri.closePath();
    const pignon = new THREE.Mesh(new THREE.ShapeGeometry(tri),
      new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.92, side: THREE.DoubleSide }));
    pignon.position.set(cote * L / 2, H_MUR, -PROF / 2);
    pignon.rotation.y = Math.PI / 2;
    g.add(pignon);
  }

  // ---- Avant-corps commerçant, moitié SUD de la façade -------------------
  // Saillie de 28 cm : soubassement et allège blancs, grande baie vitrée,
  // store banne, pignon à clins portant l'enseigne, chapeau à deux pans qui
  // meurt dans le pan ouest du toit principal.
  const AC_X = 3.1, AC_L = 6.2, SAILLIE = 0.28;
  const murBas = new THREE.Mesh(new THREE.BoxGeometry(AC_L, 2.9, SAILLIE), blanc);
  murBas.position.set(AC_X, 1.45, SAILLIE / 2);
  g.add(murBas);
  const cadreBaie = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.8, 0.06), noir);
  cadreBaie.position.set(AC_X, 1.7, SAILLIE - 0.02);
  g.add(cadreBaie);
  const baie = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 1.6), vitre);
  baie.position.set(AC_X, 1.7, SAILLIE + 0.02);
  g.add(baie);
  const tablette = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.07, 0.2), blanc);
  tablette.position.set(AC_X, 0.78, SAILLIE + 0.04);
  g.add(tablette);
  const store = new THREE.Mesh(new THREE.BoxGeometry(5.3, 0.06, 0.8), storeMat);
  store.position.set(AC_X, 2.72, SAILLIE + 0.38);
  store.rotation.x = 0.5;
  g.add(store);

  const HAUT_PIGNON = 1.85;
  const triAv = new THREE.Shape();
  triAv.moveTo(-AC_L / 2, 0);
  triAv.lineTo(AC_L / 2, 0);
  triAv.lineTo(0, HAUT_PIGNON);
  triAv.closePath();
  const pignonAv = new THREE.Mesh(new THREE.ShapeGeometry(triAv), clinsMat);
  pignonAv.position.set(AC_X, 2.9, SAILLIE);
  g.add(pignonAv);
  // Chapeau : faîte perpendiculaire à la rue, pans inclinés autour de Z,
  // débordant devant le pignon pour masquer la tranche du triangle.
  const penteAv = Math.atan2(HAUT_PIGNON, AC_L / 2);
  const versantAv = Math.hypot(HAUT_PIGNON, AC_L / 2);
  for (const cote of [-1, 1]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(versantAv + 0.55, 0.07, 3.0), toitMat);
    pan.position.set(AC_X + cote * AC_L / 4, 2.9 + HAUT_PIGNON / 2 + 0.04, SAILLIE + 0.25 - 1.5);
    pan.rotation.z = -cote * penteAv;
    g.add(pan);
  }

  // Enseigne du pignon : « Pronto Pizza » en script doré, téléphone dessous.
  const texEnseigne = (() => {
    const Lc = 1024, Hc = 256;
    const c = document.createElement('canvas');
    c.width = Lc; c.height = Hc;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#191a1c';
    ctx.fillRect(0, 0, Lc, Hc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d9b25c';
    ctx.font = 'italic bold 118px "Snell Roundhand", "Brush Script MT", cursive';
    ctx.fillText('Pronto Pizza', Lc / 2, 96);
    ctx.fillStyle = '#efece4';
    ctx.font = '600 52px Helvetica, Arial, sans-serif';
    ctx.fillText('05 59 53 91 31', Lc / 2, 204);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.1),
    new THREE.MeshStandardMaterial({ map: texEnseigne, roughness: 0.5 }));
  enseigne.position.set(AC_X, 3.5, SAILLIE + 0.02);
  g.add(enseigne);

  // ---- Entrée, moitié NORD de la façade ----------------------------------
  // Le porche réel est rentrant ; plaqué à fleur comme les autres devantures,
  // l'auvent en appentis anthracite suffit à donner la lecture.
  const auvent = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.07, 1.0), anthracite);
  auvent.position.set(-2.4, 2.5, 0.48);
  auvent.rotation.x = 0.28;
  g.add(auvent);
  // Panneau mural : pizza dorée illustrée et numéro de commande.
  const texPanneau = (() => {
    const Lc = 256, Hc = 384;
    const c = document.createElement('canvas');
    c.width = Lc; c.height = Hc;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#191a1c';
    ctx.fillRect(0, 0, Lc, Hc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#d9b25c';
    ctx.font = 'italic bold 44px "Snell Roundhand", "Brush Script MT", cursive';
    ctx.fillText('Pronto', Lc / 2, 44);
    ctx.fillText('Pizza', Lc / 2, 92);
    // Pizza vue de dessus : disque doré, croûte plus claire, garnitures sombres.
    ctx.fillStyle = '#c89a4e';
    ctx.beginPath();
    ctx.arc(Lc / 2, 208, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#e0c07a';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(Lc / 2, 208, 63, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#5a3424';
    for (const [dx, dy] of [[-30, -22], [18, -34], [34, 10], [-12, 26], [-38, 14], [8, -4], [24, 38]]) {
      ctx.beginPath();
      ctx.arc(Lc / 2 + dx, 208 + dy, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#efece4';
    ctx.font = '600 21px Helvetica, Arial, sans-serif';
    ctx.fillText('COMMANDEZ AU', Lc / 2, 316);
    ctx.fillStyle = '#d9b25c';
    ctx.font = 'bold 27px Helvetica, Arial, sans-serif';
    ctx.fillText('05 59 53 91 31', Lc / 2, 352);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const panneau = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 2.15),
    new THREE.MeshStandardMaterial({ map: texPanneau, roughness: 0.5 }));
  panneau.position.set(-3.5, 1.32, 0.04);
  g.add(panneau);
  const cadrePorte = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.05), blanc);
  cadrePorte.position.set(-1.5, 1.1, 0.02);
  g.add(cadrePorte);
  const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.0), vitre);
  porte.position.set(-1.5, 1.05, 0.06);
  g.add(porte);
  // Petite vitrine à cadre noir près du coin nord (carte des pizzas).
  const cadreVitrine = new THREE.Mesh(new THREE.BoxGeometry(1.35, 1.15, 0.05), noir);
  cadreVitrine.position.set(-5.1, 1.55, 0.02);
  g.add(cadreVitrine);
  const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.95), vitre);
  vitrine.position.set(-5.1, 1.55, 0.06);
  g.add(vitrine);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Salon Hair Libre, entre la Poste et la pizzeria Pronto Pizza. Le bâtiment
// 1079 avait été retiré du bâti comme « annexe de la Poste » : c'est en
// réalité l'immeuble du salon, et le front restait TROUÉ entre la Poste et
// la pizzeria. Relevé sur les photos (prises 55f1c083 et c6b6463c) : R+1
// crème, toit en pignon vers la rue, bande de brique sous le toit à gauche,
// bandeau anthracite à montant rouge-brun, « HAIR LIBRE » blanc et deux
// médaillons cuivrés, vitrines à affiches roses, portail de garage au sud.
// Repère local : façade rue dans le plan z = 0 (face +Z), X+ vers le SUD.
function construireHairLibre() {
  const g = new THREE.Group();
  const L = 11.2, PROF = 8, H_MUR = 5.6, H_FAITE = 7.2;
  const creme = new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.9 });
  const anthracite = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6 });
  const rougeBrun = new THREE.MeshStandardMaterial({ color: 0x8a3c2e, roughness: 0.7 });
  const ardoise = new THREE.MeshStandardMaterial({
    color: 0x4a4a50, roughness: 0.9, side: THREE.DoubleSide,
  });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.25, metalness: 0.1 });

  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H_MUR, PROF), creme);
  corps.position.set(0, H_MUR / 2, -PROF / 2);
  g.add(corps);
  // Bande de brique sous le toit, côté nord de la façade.
  const brique = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x9c5a40, roughness: 0.85 }));
  brique.position.set(-3.4, 4.9, 0.04);
  g.add(brique);
  // Fenêtre de l'étage et son volet roulant brun.
  const fenetre = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), vitre);
  fenetre.position.set(-0.6, 4.5, 0.03);
  g.add(fenetre);
  const volet = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x6a4a34, roughness: 0.8 }));
  volet.position.set(1.6, 4.5, 0.03);
  g.add(volet);

  // Toit : pignon face à la rue (l'orthophoto montre le faîte perpendiculaire
  // à l'avenue), deux pans qui descendent vers le nord et le sud.
  const HAUT_PIGNON = H_FAITE - H_MUR;
  const tri = new THREE.Shape();
  tri.moveTo(-L / 2, 0);
  tri.lineTo(L / 2, 0);
  tri.lineTo(0, HAUT_PIGNON);
  tri.closePath();
  const pignon = new THREE.Mesh(new THREE.ShapeGeometry(tri),
    new THREE.MeshStandardMaterial({ color: 0xf0ede4, roughness: 0.9, side: THREE.DoubleSide }));
  pignon.position.set(0, H_MUR, 0);
  g.add(pignon);
  const penteT = Math.atan2(HAUT_PIGNON, L / 2);
  const versantT = Math.hypot(HAUT_PIGNON, L / 2);
  for (const cote of [-1, 1]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(versantT + 0.7, 0.09, PROF + 0.6), ardoise);
    pan.position.set(cote * L / 4, H_MUR + HAUT_PIGNON / 2 + 0.05, -PROF / 2 + 0.15);
    pan.rotation.z = -cote * penteT;
    g.add(pan);
  }

  // Bandeau anthracite du RDC avec son montant vertical rouge-brun à droite,
  // signature graphique du salon.
  const bandeau = new THREE.Mesh(new THREE.BoxGeometry(8.6, 1.05, 0.12), anthracite);
  bandeau.position.set(-0.9, 2.72, 0.06);
  g.add(bandeau);
  const montant = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.25, 0.14), rougeBrun);
  montant.position.set(3.15, 1.63, 0.07);
  g.add(montant);

  // Enseigne : HAIR LIBRE entre deux médaillons ronds cuivrés.
  const texEnseigne = (() => {
    const Lc = 1024, Hc = 160;
    const c = document.createElement('canvas');
    c.width = Lc; c.height = Hc;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#33363a';
    ctx.fillRect(0, 0, Lc, Hc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f2f2ee';
    ctx.font = '600 66px Helvetica, Arial, sans-serif';
    ctx.fillText('H A I R   L I B R E', Lc / 2, 62);
    ctx.font = '600 30px Helvetica, Arial, sans-serif';
    ctx.fillText('S A L O N   D E   C O I F F U R E', Lc / 2, 122);
    for (const cx of [90, Lc - 90]) {
      ctx.strokeStyle = '#b87748';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(cx, Hc / 2, 52, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#e8e2d6';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(cx, Hc / 2 - 34);
      ctx.lineTo(cx, Hc / 2 + 30);
      ctx.moveTo(cx - 20, Hc / 2 - 12);
      ctx.lineTo(cx + 20, Hc / 2 - 12);
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.95),
    new THREE.MeshStandardMaterial({ map: texEnseigne, roughness: 0.5 }));
  enseigne.position.set(-0.9, 2.72, 0.14);
  g.add(enseigne);

  // Vitrines sombres à affiches roses de part et d'autre de la porte.
  const rose = new THREE.MeshStandardMaterial({ color: 0xc98a94, roughness: 0.7 });
  for (const dx of [-3.6, -2.2, 0.6, 2.0]) {
    const affiche = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), rose);
    affiche.position.set(dx, 1.25, 0.09);
    g.add(affiche);
  }
  const vitrineFond = new THREE.Mesh(new THREE.BoxGeometry(8.6, 2.2, 0.05), vitre);
  vitrineFond.position.set(-0.9, 1.1, 0.02);
  g.add(vitrineFond);
  const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.05), vitre);
  porte.position.set(-0.8, 1.05, 0.1);
  g.add(porte);

  // Portail de garage au sud de la boutique.
  const portail = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x3c3e42, roughness: 0.65 }));
  portail.position.set(4.35, 1.2, 0.02);
  g.add(portail);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Bistrot « Les Tontons », le café du centre, face à l'esplanade de la place
// du Général de Gaulle. Relevé sur le panoramique 360 cc2500e5 (janv. 2025) :
// véranda-terrasse vitrée à structure claire et piliers maçonnés, bandeau
// vert foncé « BISTROT LES TONTONS », porche d'entrée blanc à fronton
// « BIENVENUE » au bout sud, jardinières basses à haies taillées devant.
// L'ortho montre les toits blancs de la véranda à l'EST du corps du bâtiment
// 498 (laissé au bâti ordinaire, il ferme le fond). Façade sur +Z local.
function construireLesTontons() {
  const g = new THREE.Group();
  const L = 12, PROF = 3, H = 2.9;
  const structure = new THREE.MeshStandardMaterial({ color: 0xb9c0ba, roughness: 0.6 });
  const pilier = new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 0.85 });
  const vitre = new THREE.MeshStandardMaterial({
    color: 0x2c343a, roughness: 0.18, metalness: 0.1,
  });
  const vertFonce = new THREE.MeshStandardMaterial({ color: 0x2e4a34, roughness: 0.6 });
  const blanc = new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.7 });

  // Toit plat blanc de la véranda, léger débord.
  const toit = new THREE.Mesh(new THREE.BoxGeometry(L + 0.4, 0.14, PROF + 0.4), blanc);
  toit.position.set(0, H + 0.07, -PROF / 2);
  g.add(toit);
  // Vitrage filant en façade, montants clairs, piliers maçonnés aux tiers.
  const vitrage = new THREE.Mesh(new THREE.PlaneGeometry(L - 0.3, H - 1.0), vitre);
  vitrage.position.set(0, 1.3, 0.01);
  g.add(vitrage);
  for (let k = 0; k <= 6; k++) {
    const montant = new THREE.Mesh(new THREE.BoxGeometry(0.07, H - 0.9, 0.07), structure);
    montant.position.set(-L / 2 + 0.15 + k * (L - 0.3) / 6, 1.32, 0.03);
    g.add(montant);
  }
  for (const px of [-L / 2 + 0.3, L / 2 - 0.3]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, H, 0.55), pilier);
    p.position.set(px, H / 2, -0.1);
    g.add(p);
  }
  // Soubassement et bandeau d'enseigne vert foncé.
  const soub = new THREE.Mesh(new THREE.BoxGeometry(L, 0.85, 0.1), structure);
  soub.position.set(0, 0.42, 0);
  g.add(soub);
  const texEnseigne = (() => {
    const Lc = 1024, Hc = 110;
    const c = document.createElement('canvas');
    c.width = Lc; c.height = Hc;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2e4a34';
    ctx.fillRect(0, 0, Lc, Hc);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#efe9d8';
    ctx.font = 'bold 56px Georgia, serif';
    ctx.fillText('BISTROT  LES  TONTONS', Lc / 2, Hc / 2 + 2);
    // Silhouettes de quilles de part et d'autre, comme sur le bandeau réel.
    ctx.fillStyle = '#e8e2d0';
    for (const cx of [70, Lc - 70]) {
      ctx.beginPath();
      ctx.ellipse(cx, 72, 12, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, 34, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(L - 1.2, 0.62),
    new THREE.MeshStandardMaterial({ map: texEnseigne, roughness: 0.55 }));
  bandeau.position.set(0, H - 0.38, 0.06);
  g.add(bandeau);

  // Porche d'entrée « BIENVENUE » au bout sud : petit volume vitré blanc à
  // fronton triangulaire.
  {
    const porche = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.5, 1.6), blanc);
    corps.position.set(0, 1.25, 0);
    porche.add(corps);
    const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.0), vitre);
    porte.position.set(0, 1.05, 0.81);
    porche.add(porte);
    const triP = new THREE.Shape();
    triP.moveTo(-1.15, 0);
    triP.lineTo(1.15, 0);
    triP.lineTo(0, 0.55);
    triP.closePath();
    const fronton = new THREE.Mesh(new THREE.ShapeGeometry(triP),
      new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.7, side: THREE.DoubleSide }));
    fronton.position.set(0, 2.5, 0.82);
    porche.add(fronton);
    const texB = (() => {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 40;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f2f1ec';
      ctx.fillRect(0, 0, 256, 40);
      ctx.fillStyle = '#5a5a54';
      ctx.font = '600 22px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BIENVENUE', 128, 21);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const mention = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25),
      new THREE.MeshStandardMaterial({ map: texB, roughness: 0.6 }));
    mention.position.set(0, 2.62, 0.83);
    porche.add(mention);
    porche.position.set(L / 2 + 1.15, 0, 0.2);
    g.add(porche);
  }

  // Jardinières maçonnées basses à haies taillées, en avant de la terrasse.
  for (const dx of [-4.2, 0, 4.2]) {
    const bac = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 0.9 }));
    bac.position.set(dx, 0.27, 4.4);
    g.add(bac);
    const haie = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.7, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 0.95 }));
    haie.position.set(dx, 0.9, 4.4);
    g.add(haie);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Super U de la zone commerciale est. Le magasin est ABSENT de la BD TOPO
// (bâtiment trop récent) : l'emprise vient d'OSM (halle en L de ~106 × 119 m,
// way nommé Super U) et il manquait donc entièrement au jeu. Les prises
// Panoramax de janv. 2025 le montrent en chantier mais confirment le bardage
// bois doré des pignons ; l'habillage reprend la charte publique de
// l'enseigne (carré rouge au U blanc, lettres rouges sur bandeau blanc).
// Construit en coordonnées MONDE (polygone OSM brut), à poser en (0, 0, 0).
function construireSuperU(sol) {
  const g = new THREE.Group();
  const H = 7.5;
  const PTS = [
    [1326, 370], [1337, 384], [1330, 390], [1365, 435], [1347, 459],
    [1326, 474], [1323, 488], [1304, 483], [1288, 462], [1280, 468],
    [1259, 442], [1288, 419], [1278, 407],
  ];
  const yBase = Math.min(...PTS.map(([x, z]) => sol(x, z))) - 0.25;

  // Murs par segments : bardage bois brun-doré sur tout le tour (relevé
  // Panoramax : la halle est entièrement bardée, teinte tenue claire pour
  // ACES). PAS de couleurs de sommets : le pont Three vers Babylon convertit
  // `instanceColor` mais ignore `vertexColors`, un premier jet en était
  // ressorti tout blanc.
  const murPos = [];
  for (let i = 0; i < PTS.length; i++) {
    const [x1, z1] = PTS[i], [x2, z2] = PTS[(i + 1) % PTS.length];
    murPos.push(x1, yBase, z1, x2, yBase, z2, x2, yBase + H, z2);
    murPos.push(x1, yBase, z1, x2, yBase + H, z2, x1, yBase + H, z1);
  }
  const gm = new THREE.BufferGeometry();
  gm.setAttribute('position', new THREE.Float32BufferAttribute(murPos, 3));
  gm.computeVertexNormals();
  gm.computeBoundingSphere();
  g.add(new THREE.Mesh(gm, new THREE.MeshStandardMaterial({
    color: 0x9a7648, roughness: 0.88, side: THREE.DoubleSide,
  })));

  // Toit terrasse : le polygone triangulé à plat, gris moyen clair (ACES).
  {
    const forme = new THREE.Shape();
    forme.moveTo(PTS[0][0], PTS[0][1]);
    for (let i = 1; i < PTS.length; i++) forme.lineTo(PTS[i][0], PTS[i][1]);
    forme.closePath();
    const toit = new THREE.Mesh(new THREE.ShapeGeometry(forme),
      new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.95, side: THREE.DoubleSide }));
    toit.rotation.x = Math.PI / 2;
    toit.position.y = yBase + H;
    // ShapeGeometry est construit dans le plan XY : après la rotation, son Y
    // devient -Z monde, d'où le miroir pour retomber sur les Z du polygone.
    toit.scale.z = -1;
    g.add(toit);
  }

  // Façade d'entrée, côté parking (segment (1365,435)→(1347,459)) : vitrage
  // bas, auvent, et bandeau blanc au logo U.
  {
    const ax = 1365, az = 435, bx = 1347, bz = 459;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    const [ux2, uz2] = [(bx - ax) / len, (bz - az) / len];
    const [nx2, nz2] = [-uz2, ux2];  // vers le sud-est (parking)
    const rot = Math.atan2(nx2, nz2);
    const ySol = sol(mx, mz);
    const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(len - 6, 3),
      new THREE.MeshStandardMaterial({ color: 0x232a30, roughness: 0.2, metalness: 0.1 }));
    vitrine.position.set(mx + nx2 * 0.15, ySol + 1.6, mz + nz2 * 0.15);
    vitrine.rotation.y = rot;
    g.add(vitrine);
    const auvent = new THREE.Mesh(new THREE.BoxGeometry(len - 4, 0.25, 4),
      new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.7 }));
    auvent.position.set(mx + nx2 * 2.1, ySol + 3.6, mz + nz2 * 2.1);
    auvent.rotation.y = Math.atan2(-uz2, ux2);
    g.add(auvent);
    // Casquette blanche filante en tête de façade, comme sur la halle réelle.
    const casquette = new THREE.Mesh(new THREE.BoxGeometry(len + 1, 1.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.65 }));
    casquette.position.set(mx + nx2 * 0.3, yBase + H - 0.75, mz + nz2 * 0.3);
    casquette.rotation.y = Math.atan2(-uz2, ux2);
    g.add(casquette);
    // Enseigne charte : « SUPER » en bleu, carré rouge au U blanc, « Artix »
    // en rouge, sur fond blanc.
    const texU = (() => {
      const c = document.createElement('canvas');
      c.width = 1024; c.height = 160;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f4f3f0';
      ctx.fillRect(0, 0, 1024, 160);
      ctx.fillStyle = '#1a4fa0';
      ctx.font = 'bold 104px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('SUPER', 90, 86);
      ctx.fillStyle = '#d63b2f';
      ctx.fillRect(478, 20, 120, 120);
      ctx.fillStyle = '#f4f3f0';
      ctx.font = 'bold 96px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('U', 538, 84);
      ctx.fillStyle = '#d63b2f';
      ctx.font = 'italic bold 60px Georgia, serif';
      ctx.textAlign = 'left';
      ctx.fillText('Artix', 640, 90);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropie();
      return t;
    })();
    const matEnseigneU = new THREE.MeshStandardMaterial({ map: texU, roughness: 0.55 });
    const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), matEnseigneU);
    bandeau.position.set(mx + nx2 * 0.62, yBase + H - 0.75, mz + nz2 * 0.62);
    bandeau.rotation.y = rot;
    g.add(bandeau);
    // Enseigne répétée sur TOUTES les façades assez longues (16 m et plus) :
    // le magasin se signale quel que soit le sens d'arrivée. La façade
    // d'entrée (segment 3) garde son bandeau sur casquette, on la saute.
    {
      let ccx = 0, ccz = 0;
      for (const [px, pz] of PTS) { ccx += px; ccz += pz; }
      ccx /= PTS.length; ccz /= PTS.length;
      for (let i = 0; i < PTS.length; i++) {
        if (i === 3) continue;
        const [x1, z1] = PTS[i], [x2, z2] = PTS[(i + 1) % PTS.length];
        const dl = Math.hypot(x2 - x1, z2 - z1);
        if (dl < 16) continue;
        const fx = (x1 + x2) / 2, fz = (z1 + z2) / 2;
        let qnx = (z2 - z1) / dl, qnz = -(x2 - x1) / dl;
        if ((ccx - fx) * qnx + (ccz - fz) * qnz > 0) { qnx = -qnx; qnz = -qnz; }
        const ens = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.2), matEnseigneU);
        ens.position.set(fx + qnx * 0.15, yBase + H - 1.3, fz + qnz * 0.15);
        ens.rotation.y = Math.atan2(qnx, qnz);
        g.add(ens);
      }
    }
  }

  // Station-service Super U derrière le McDonald's. Street View mars 2026 :
  // auvent au BANDEAU DE LATTES BOIS (assorti au magasin), îlots de pompes,
  // local AdBlue blanc à damier vert, totem de prix U.
  {
    const sx = 1402.2, sz = 559.2;
    const ySt = sol(sx, sz);
    const latteBois = new THREE.MeshStandardMaterial({ color: 0x9a7648, roughness: 0.85 });
    const auventS = new THREE.Mesh(new THREE.BoxGeometry(14, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.6 }));
    auventS.position.set(sx, ySt + 4.7, sz);
    g.add(auventS);
    // Bandeau de lattes bois sur les quatre chants de l'auvent.
    for (const [dx, dz, lx, lz] of [[0, -4.05, 14.1, 0.15], [0, 4.05, 14.1, 0.15], [-7.05, 0, 0.15, 8.1], [7.05, 0, 0.15, 8.1]]) {
      const chant = new THREE.Mesh(new THREE.BoxGeometry(lx, 0.9, lz), latteBois);
      chant.position.set(sx + dx, ySt + 4.7, sz + dz);
      g.add(chant);
    }
    for (const [dx, dz] of [[-5, -2.4], [5, -2.4], [-5, 2.4], [5, 2.4]]) {
      const fut = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.5, 10),
        new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.5, metalness: 0.4 }));
      fut.position.set(sx + dx, ySt + 2.25, sz + dz);
      g.add(fut);
    }
    // Îlots de pompes : blocs blancs à flanc vert.
    for (const dx of [-3, 3]) {
      const ilot = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 5),
        new THREE.MeshStandardMaterial({ color: 0xc9c7c0, roughness: 0.9 }));
      ilot.position.set(sx + dx, ySt + 0.09, sz);
      g.add(ilot);
      for (const dz of [-1.4, 1.4]) {
        const pompe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.5),
          new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.55 }));
        pompe.position.set(sx + dx, ySt + 1.03, sz + dz);
        g.add(pompe);
        const flanc = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.52),
          new THREE.MeshStandardMaterial({ color: 0x4a9c3a, roughness: 0.6 }));
        flanc.position.set(sx + dx, ySt + 1.75, sz + dz);
        g.add(flanc);
      }
    }
    // Local AdBlue : cube blanc à bande damier verte.
    const adblue = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2),
      new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.7 }));
    adblue.position.set(sx + 10, ySt + 1.1, sz + 4);
    g.add(adblue);
    const damier = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.4, 2.05),
      new THREE.MeshStandardMaterial({ color: 0x4a9c3a, roughness: 0.6 }));
    damier.position.set(sx + 10, ySt + 0.55, sz + 4);
    g.add(damier);
    // Totem de prix : caisson blanc à tête U rouge.
    const totem = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xf2f1ec, roughness: 0.6 }));
    totem.position.set(sx - 9, ySt + 1.7, sz - 4);
    g.add(totem);
    const teteU = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.42),
      new THREE.MeshStandardMaterial({ color: 0xcc0f2f, roughness: 0.5 }));
    teteU.position.set(sx - 9, ySt + 3.85, sz - 4);
    g.add(teteU);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// McDonald's de la zone commerciale (bâtiment BD TOPO 1492, retiré du bâti
// ordinaire). Relevé Panoramax 82c6553a : toit en pente asymétrique noir à
// rives blanches, attique noir portant « McDonald's » en blanc et les arches
// jaunes, vitrage filant sur soubassement latté brun, tour de jeux
// rouge-orangé à toboggan au nord-est. Façade principale au NORD (-Z local),
// vers le parking et le rond-point.
function construireMcDo() {
  const g = new THREE.Group();
  const L = 27.4, PROF = 19.1, H_SOUB = 1.0, H_VITRE = 1.7, H_ATTIQUE = 1.8;
  // Street View mars 2026 : le soubassement est un parement de pierre gris
  // clair (pas des lattes), l'attique est fait de PANNEAUX alternés corten,
  // vert très foncé et blanc, portant les M jaunes et le lettrage gris.
  const pierre = new THREE.MeshStandardMaterial({ color: 0xb8b5ac, roughness: 0.9 });
  const noir = new THREE.MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.7 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x262c31, roughness: 0.2, metalness: 0.1 });
  const blanc = new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.6 });
  const corten = new THREE.MeshStandardMaterial({ color: 0x8a4a30, roughness: 0.8 });

  const soub = new THREE.Mesh(new THREE.BoxGeometry(L, H_SOUB, PROF), pierre);
  soub.position.y = H_SOUB / 2;
  g.add(soub);
  const cVitre = new THREE.Mesh(new THREE.BoxGeometry(L - 0.2, H_VITRE, PROF - 0.2), vitre);
  cVitre.position.y = H_SOUB + H_VITRE / 2;
  g.add(cVitre);
  // Meneaux noirs de la bande vitrée, côté parking.
  for (let k = 0; k < 8; k++) {
    const meneau = new THREE.Mesh(new THREE.BoxGeometry(0.1, H_VITRE, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.5 }));
    meneau.position.set(-L / 2 + 2.2 + k * (L - 4.4) / 7, H_SOUB + H_VITRE / 2, -PROF / 2 - 0.02);
    g.add(meneau);
  }
  const attique = new THREE.Mesh(new THREE.BoxGeometry(L, H_ATTIQUE, PROF), noir);
  attique.position.y = H_SOUB + H_VITRE + H_ATTIQUE / 2;
  g.add(attique);
  // Panneaux d'attique plaqués : corten et blancs, sur les faces nord (-Z,
  // parking) et est (+X, route).
  const yAtt = H_SOUB + H_VITRE + H_ATTIQUE / 2;
  const panneauxAttique = [
    // [face, décalage le long de la façade, largeur, matériau]
    ['N', -8.5, 6, corten], ['N', -2.5, 3.2, blanc], ['N', 6, 9, corten],
    ['E', -5, 4, corten], ['E', 1.5, 3.2, blanc], ['E', 6.5, 4.5, corten],
  ];
  for (const [face, du, larg, mat] of panneauxAttique) {
    const pan = new THREE.Mesh(new THREE.PlaneGeometry(larg, H_ATTIQUE - 0.1), mat);
    if (face === 'N') {
      pan.position.set(du, yAtt, -PROF / 2 - 0.04);
      pan.rotation.y = Math.PI;
    } else {
      pan.position.set(L / 2 + 0.04, yAtt, du);
      pan.rotation.y = Math.PI / 2;
    }
    g.add(pan);
  }

  // Toit : deux pans asymétriques décalés, noirs, soulignés d'une rive
  // blanche, la silhouette signature du pavillon.
  const yToit = H_SOUB + H_VITRE + H_ATTIQUE;
  for (const [dz, larg, dy, pente] of [[-PROF / 4, PROF / 2 + 2, 1.1, 0.16], [PROF / 4, PROF / 2 + 2, 1.7, -0.16]]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(L + 1.6, 0.18, larg), noir);
    pan.position.set(0, yToit + dy, dz);
    pan.rotation.x = pente;
    g.add(pan);
    const rive = new THREE.Mesh(new THREE.BoxGeometry(L + 1.7, 0.1, 0.5), blanc);
    rive.position.set(0, yToit + dy + (dz < 0 ? 0.09 : 0.09), dz + (dz < 0 ? -larg / 2 + 0.2 : larg / 2 - 0.2));
    rive.rotation.x = pente;
    g.add(rive);
  }

  // M jaunes sur les panneaux blancs, « McDonald's » en lettres grises
  // argentées sur les pans corten (comme sur les photos).
  const texM = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#f2c200';
    ctx.font = 'bold 250px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('m', 128, 96);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const texLettrage = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 128);
    ctx.fillStyle = '#c9c7c2';
    ctx.font = 'bold 92px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("McDonald's", 512, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const yEns = H_SOUB + H_VITRE + H_ATTIQUE / 2;
  const matM = new THREE.MeshStandardMaterial({ map: texM, roughness: 0.5, transparent: true, alphaTest: 0.2 });
  const matLettrage = new THREE.MeshStandardMaterial({ map: texLettrage, roughness: 0.4, metalness: 0.3, transparent: true, alphaTest: 0.2 });
  for (const [face, du] of [['N', -2.5], ['E', 1.5]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), matM);
    if (face === 'N') { m.position.set(du, yEns, -PROF / 2 - 0.08); m.rotation.y = Math.PI; }
    else { m.position.set(L / 2 + 0.08, yEns, du); m.rotation.y = Math.PI / 2; }
    g.add(m);
  }
  for (const [face, du] of [['N', 6], ['E', 6.5]]) {
    const lett = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.95), matLettrage);
    if (face === 'N') { lett.position.set(du, yEns, -PROF / 2 - 0.08); lett.rotation.y = Math.PI; }
    else { lett.position.set(L / 2 + 0.08, yEns, du); lett.rotation.y = Math.PI / 2; }
    g.add(lett);
  }
  // Photinias rouges et verts en pied de façade, jardinière rouge : la
  // végétation d'enseigne du parvis (Street View).
  for (const [dx, teinte, ech] of [[-9, 0xa83a2c, 1], [-5.5, 0x3f6d3f, 0.85], [-1.5, 0xa83a2c, 0.9], [3, 0x3f6d3f, 1], [7.5, 0xa83a2c, 0.8]]) {
    const buisson = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8),
      new THREE.MeshStandardMaterial({ color: teinte, roughness: 0.95 }));
    buisson.scale.set(ech, 0.8 * ech, ech);
    buisson.position.set(dx, 0.55, -PROF / 2 - 1.6);
    g.add(buisson);
  }
  const jardiniere = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.1),
    new THREE.MeshStandardMaterial({ color: 0xc5334a, roughness: 0.6 }));
  jardiniere.position.set(-12.5, 0.35, -PROF / 2 - 2.2);
  g.add(jardiniere);

  // Tour de jeux : volume rouge-orangé à panneaux, toit cintré gris, hublot
  // et toboggan sombre : le repère des enfants, très visible de la route.
  {
    const tour = new THREE.Group();
    const corps = new THREE.Mesh(new THREE.BoxGeometry(4.2, 6.2, 4.2),
      new THREE.MeshStandardMaterial({ color: 0xb8402e, roughness: 0.6 }));
    corps.position.y = 3.1;
    tour.add(corps);
    for (const [px, pz, ry] of [[0, 2.12, 0], [2.12, 0, Math.PI / 2]]) {
      const panneau = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5 }));
      panneau.position.set(px, 2.4, pz + (pz ? 0.01 : 0));
      panneau.rotation.y = ry;
      tour.add(panneau);
    }
    const hublot = new THREE.Mesh(new THREE.CircleGeometry(0.85, 20),
      new THREE.MeshStandardMaterial({ color: 0x1e2226, roughness: 0.15, metalness: 0.1 }));
    hublot.position.set(0, 4.9, 2.13);
    tour.add(hublot);
    const toitT = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 4.6, 16, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.7, side: THREE.DoubleSide }));
    toitT.rotation.z = Math.PI / 2;
    toitT.rotation.y = Math.PI / 2;
    toitT.position.y = 6.2;
    tour.add(toitT);
    const toboggan = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 5.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x1f3a2c, roughness: 0.5 }));
    toboggan.position.set(1.6, 2.6, -1.4);
    toboggan.rotation.z = 0.7;
    tour.add(toboggan);
    tour.position.set(L / 2 - 2.5, 0, -PROF / 2 - 5.2);
    g.add(tour);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Décor du E.Leclerc Drive, rue Jean Monnet (halle 589, laissée au bâti
// ordinaire). Street View mai 2026 : bardage blanc nervuré, ATTIQUE brun
// très foncé filant, casquette ORANGE à l'entrée, enseignes « E.Leclerc
// DRIVE » (logo bleu, DRIVE orange) : posées ici sur les QUATRE façades de
// la boîte orientée, plus « Location E.Leclerc » sur la façade principale.
function construireLeclercDrive(sol) {
  const g = new THREE.Group();
  const CX = 1047.3, CZ = 676.3;
  const U = [0.874, 0.486], V = [-0.486, 0.874];
  const DEMI_L = 34.3, DEMI_l = 23.9;
  const H = 4.1;
  const yBase = sol(CX, CZ);
  const brunFonce = new THREE.MeshStandardMaterial({ color: 0x3a3028, roughness: 0.75 });

  const texDrive = (() => {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a3028';
    ctx.fillRect(0, 0, 768, 128);
    // Carré bleu E.Leclerc, puis DRIVE en orange.
    ctx.fillStyle = '#1d50a8';
    ctx.fillRect(40, 18, 300, 92);
    ctx.fillStyle = '#f2f1ec';
    ctx.font = 'bold 58px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E.Leclerc', 190, 66);
    ctx.fillStyle = '#e87820';
    ctx.font = 'bold 72px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DRIVE', 380, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const matDrive = new THREE.MeshStandardMaterial({ map: texDrive, roughness: 0.5 });

  // Une enseigne au milieu de chaque façade de la boîte orientée, normale
  // vers l'extérieur.
  const faces = [
    { mx: CX + U[0] * DEMI_L, mz: CZ + U[1] * DEMI_L, n: U },
    { mx: CX - U[0] * DEMI_L, mz: CZ - U[1] * DEMI_L, n: [-U[0], -U[1]] },
    { mx: CX + V[0] * DEMI_l, mz: CZ + V[1] * DEMI_l, n: V },
    { mx: CX - V[0] * DEMI_l, mz: CZ - V[1] * DEMI_l, n: [-V[0], -V[1]] },
  ];
  for (const f of faces) {
    const ens = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.1), matDrive);
    ens.position.set(f.mx + f.n[0] * 0.15, yBase + H - 0.8, f.mz + f.n[1] * 0.15);
    ens.rotation.y = Math.atan2(f.n[0], f.n[1]);
    g.add(ens);
  }

  // Façade principale sud-ouest (+V) : attique brun filant, casquette orange
  // au-dessus de l'entrée, sas blanc, enseigne Location.
  {
    const f = faces[2];
    const rot = Math.atan2(f.n[0], f.n[1]);
    const attique = new THREE.Mesh(new THREE.BoxGeometry(36, 1.5, 0.3), brunFonce);
    attique.position.set(f.mx + f.n[0] * 0.1, yBase + H - 0.75, f.mz + f.n[1] * 0.1);
    attique.rotation.y = Math.atan2(-U[1], -U[0]);
    g.add(attique);
    const casquette = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.5, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xe87820, roughness: 0.55 }));
    casquette.position.set(f.mx + U[0] * 8 + f.n[0] * 0.7, yBase + 2.6, f.mz + U[1] * 8 + f.n[1] * 0.7);
    casquette.rotation.y = Math.atan2(-U[1], -U[0]);
    g.add(casquette);
    const sas = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.6 }));
    sas.position.set(f.mx - U[0] * 10 + f.n[0] * 0.6, yBase + 1.6, f.mz - U[1] * 10 + f.n[1] * 0.6);
    sas.rotation.y = Math.atan2(-U[1], -U[0]);
    g.add(sas);
    const texLoc = (() => {
      const c = document.createElement('canvas');
      c.width = 512; c.height = 96;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#3a3028';
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = '#e87820';
      ctx.beginPath();
      ctx.arc(60, 48, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2f1ec';
      ctx.font = 'bold 50px Helvetica, Arial, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Location', 120, 50);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = anisotropie();
      return t;
    })();
    const ensLoc = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.85),
      new THREE.MeshStandardMaterial({ map: texLoc, roughness: 0.5 }));
    ensLoc.position.set(f.mx + U[0] * 8 + f.n[0] * 0.28, yBase + H - 0.75, f.mz + U[1] * 8 + f.n[1] * 0.28);
    ensLoc.rotation.y = rot;
    g.add(ensLoc);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Totem McDrive au bord du rond-point d'accès : mât noir aux arches jaunes.
function construireTotemMcDo() {
  const g = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 7.2, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.6 }));
  mat.position.y = 3.6;
  g.add(mat);
  const texM = (() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#2b2b2e';
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#f2c200';
    ctx.font = 'bold 130px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('m', 64, 58);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  for (const ry of [0, Math.PI]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.35),
      new THREE.MeshStandardMaterial({ map: texM, roughness: 0.5 }));
    m.position.set(0, 6.2, ry ? -0.26 : 0.26);
    m.rotation.y = ry;
    g.add(m);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// Gendarmerie d'Artix, avenue de la Gare (bâtiment 979, retiré du bâti
// ordinaire). Relevé Street View mai 2026 : pavillon administratif bas et
// blanc sous un GRAND toit à croupes débordant gris-brun, bande vitrée
// filante, bandeau « GENDARMERIE NATIONALE », drapeau, clôture blanche.
// Façade d'accueil sur +Z local (face ouest en monde).
function construireGendarmerie() {
  const g = new THREE.Group();
  const L = 27.1, PROF = 18.4, H_MUR = 3.2;
  const blanc = new THREE.MeshStandardMaterial({ color: 0xf0efe8, roughness: 0.85 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x262c31, roughness: 0.2, metalness: 0.1 });
  const toitMat = new THREE.MeshStandardMaterial({
    color: 0x55504a, roughness: 0.9, side: THREE.DoubleSide,
  });

  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H_MUR, PROF), blanc);
  corps.position.set(0, H_MUR / 2, -PROF / 2);
  g.add(corps);
  const bandeVitree = new THREE.Mesh(new THREE.PlaneGeometry(L - 4, 1.3), vitre);
  bandeVitree.position.set(0, 1.9, 0.01);
  g.add(bandeVitree);

  // Toit à croupes très débordant : pyramide tronquée aplatie, en quatre pans.
  const DEB = 1.6, H_TOIT = 2.6;
  const pans = new THREE.Mesh(new THREE.CylinderGeometry(
    Math.hypot(L * 0.22, PROF * 0.22), Math.hypot(L / 2 + DEB, PROF / 2 + DEB), H_TOIT, 4),
  toitMat);
  pans.rotation.y = Math.PI / 4;
  pans.scale.set(1, 1, (PROF + DEB * 2) / (L + DEB * 2));
  pans.position.set(0, H_MUR + H_TOIT / 2, -PROF / 2);
  g.add(pans);

  // Bandeau GENDARMERIE NATIONALE au-dessus de la bande vitrée.
  const texG = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a3a7c';
    ctx.fillRect(0, 0, 1024, 96);
    ctx.fillStyle = '#f2f2ee';
    ctx.font = '600 52px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GENDARMERIE NATIONALE', 512, 50);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(10, 0.85),
    new THREE.MeshStandardMaterial({ map: texG, roughness: 0.55 }));
  bandeau.position.set(0, 2.75, 0.06);
  g.add(bandeau);

  // Mât et drapeau tricolore devant l'entrée.
  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.5, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.4, metalness: 0.5 }));
  mat.position.set(-6, 3.25, 4);
  g.add(mat);
  const texDrapeau = (() => {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#26437c';
    ctx.fillRect(0, 0, 32, 64);
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(32, 0, 32, 64);
    ctx.fillStyle = '#c5334a';
    ctx.fillRect(64, 0, 32, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const drapeau = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6),
    new THREE.MeshStandardMaterial({ map: texDrapeau, roughness: 0.7, side: THREE.DoubleSide }));
  drapeau.position.set(-5.5, 6, 4);
  g.add(drapeau);

  // Clôture grillagée blanche le long de la façade.
  for (const dx of [-12, -8, -4, 0, 4, 8, 12]) {
    const poteau = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.5, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.6 }));
    poteau.position.set(dx, 0.75, 6.5);
    g.add(poteau);
  }
  const grille = new THREE.Mesh(new THREE.PlaneGeometry(25, 1.4),
    new THREE.MeshStandardMaterial({
      color: 0xeceae4, roughness: 0.7, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
    }));
  grille.position.set(0, 0.72, 6.5);
  g.add(grille);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Façade-décor de la Banque Pouyanne, zone est (relevé Street View mai
// 2026) : long plain-pied contemporain, bardage bois sombre à claire-voie,
// trame de vitrages verticaux, portiques rouge brique, monopente claire
// débordante et deux mâts à fanions rouges. Plaquée sur le bâti ordinaire.
function construireFacadePouyanne() {
  const g = new THREE.Group();
  const L = 30;
  const bardage = new THREE.MeshStandardMaterial({ color: 0x5a4c40, roughness: 0.85 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x2a3238, roughness: 0.2, metalness: 0.1 });
  const rouge = new THREE.MeshStandardMaterial({ color: 0x9c3a2c, roughness: 0.7 });
  const clair = new THREE.MeshStandardMaterial({ color: 0xd8d6d0, roughness: 0.6 });

  const fond = new THREE.Mesh(new THREE.BoxGeometry(L, 3.2, 0.15), bardage);
  fond.position.set(0, 1.6, 0);
  g.add(fond);
  for (let k = 0; k < 9; k++) {
    const v = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.5), vitre);
    v.position.set(-L / 2 + 2.5 + k * 3.1, 1.55, 0.09);
    g.add(v);
  }
  for (const dx of [-L / 2 + 0.6, -L / 6, L / 6, L / 2 - 0.6]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.45), rouge);
    p.position.set(dx, 1.7, 0.12);
    g.add(p);
  }
  // Débord de la monopente au-dessus de la façade.
  const casquette = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.16, 1.6), clair);
  casquette.position.set(0, 3.5, 0.55);
  g.add(casquette);
  // Mâts haubanés à fanions triangulaires rouges.
  for (const dx of [-L / 4, L / 4]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x9a9a96, roughness: 0.4, metalness: 0.5 }));
    m.position.set(dx, 5.1, 0.2);
    g.add(m);
    const triF = new THREE.Shape();
    triF.moveTo(0, 0);
    triF.lineTo(1.1, -0.35);
    triF.lineTo(0, -0.7);
    triF.closePath();
    const fanion = new THREE.Mesh(new THREE.ShapeGeometry(triF),
      new THREE.MeshStandardMaterial({ color: 0xb8402e, roughness: 0.7, side: THREE.DoubleSide }));
    fanion.position.set(dx + 0.05, 6.6, 0.2);
    g.add(fanion);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Façade-décor de L'Artisienne, avenue de Castille (relevé Street View) :
// fronton à redans étagés gris clair, enseigne caisson noire à épis dorés,
// entrée vitrée centrale et panneaux menu. Plaquée sur le bâti ordinaire.
function construireFacadeArtisienne() {
  const g = new THREE.Group();
  const L = 14;
  const gris = new THREE.MeshStandardMaterial({ color: 0xdedbd4, roughness: 0.85 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x262c31, roughness: 0.2, metalness: 0.1 });
  const noir = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.55 });

  const mur = new THREE.Mesh(new THREE.BoxGeometry(L, 4.6, 0.25), gris);
  mur.position.set(0, 2.3, 0);
  g.add(mur);
  // Fronton à trois redans, la signature art déco du bâtiment.
  for (const [larg, h] of [[8, 0.7], [5, 0.65], [2.6, 0.6]]) {
    const gradin = new THREE.Mesh(new THREE.BoxGeometry(larg, h, 0.25), gris);
    const empil = { 8: 4.6, 5: 5.3, 2.6: 5.95 }[larg];
    gradin.position.set(0, empil + h / 2, 0);
    g.add(gradin);
  }
  // Bande de soulignement gris foncé à mi-hauteur.
  const bande = new THREE.Mesh(new THREE.BoxGeometry(L, 0.25, 0.27), noir);
  bande.position.set(0, 2.95, 0);
  g.add(bande);
  const texA = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 160;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#141516';
    ctx.fillRect(0, 0, 1024, 160);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8dfc0';
    ctx.font = 'italic bold 72px Georgia, serif';
    ctx.fillText("L'Artisienne", 512, 58);
    ctx.fillStyle = '#d9b25c';
    ctx.font = '600 36px Helvetica, Arial, sans-serif';
    ctx.fillText('BOULANGERIE  PÂTISSERIE  ARTISANALE', 512, 122);
    // Épis de blé stylisés de part et d'autre.
    ctx.strokeStyle = '#d9b25c';
    ctx.lineWidth = 5;
    for (const cx of [86, 938]) {
      ctx.beginPath();
      ctx.moveTo(cx, 132);
      ctx.lineTo(cx, 34);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const y = 46 + k * 20;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(cx - 14, y - 12);
        ctx.moveTo(cx, y);
        ctx.lineTo(cx + 14, y - 12);
        ctx.stroke();
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const caisson = new THREE.Mesh(new THREE.BoxGeometry(8.5, 1.35, 0.2),
    new THREE.MeshStandardMaterial({ map: texA, roughness: 0.5 }));
  caisson.position.set(0, 3.9, 0.18);
  g.add(caisson);
  const entree = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.3), vitre);
  entree.position.set(0, 1.2, 0.14);
  g.add(entree);
  for (const dx of [-3.2, 3.2]) {
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9), noir);
    menu.position.set(dx, 1.25, 0.14);
    g.add(menu);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Décor de l'Auberge du Parc (relevés Street View mai 2026 et Panoramax) :
// panneau peint au sapin sur le pignon ouest, façade-décor de l'aile à
// colombages avec galerie-balcon bois filante, ancienne piscine bâchée.
// L'auberge est à vendre et enherbée : l'état actuel est conservé.
function construireDecorAuberge(sol) {
  const g = new THREE.Group();
  const boisSombre = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.85 });
  // Panneau « Auberge du Parc » du pignon ouest, légèrement incliné.
  const texP = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f0ede2';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#3f6d3f';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, 496, 240);
    ctx.fillStyle = '#3f6d3f';
    // Sapin stylisé à gauche.
    for (let k = 0; k < 3; k++) {
      const y = 70 + k * 40, w = 30 + k * 16;
      ctx.beginPath();
      ctx.moveTo(90, y - 34);
      ctx.lineTo(90 - w / 2, y);
      ctx.lineTo(90 + w / 2, y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(84, 180, 12, 26);
    ctx.font = 'italic bold 52px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Auberge', 320, 90);
    ctx.fillText('du Parc', 320, 150);
    ctx.font = '600 26px Helvetica, Arial, sans-serif';
    ctx.fillText('Bar · Restaurant', 320, 210);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  // Sur le pignon ouest (arête 0 : milieu (-200,87, 151,39), normale
  // (-0,55, -0,84)), en hauteur comme le panneau réel.
  const panneau = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7),
    new THREE.MeshStandardMaterial({ map: texP, roughness: 0.6 }));
  panneau.position.set(-200.87 - 0.55 * 0.2, sol(-200.87, 151.39) + 4.6, 151.39 - 0.84 * 0.2);
  panneau.rotation.y = Math.atan2(-0.55, -0.84);
  panneau.rotation.z = 0.06;
  g.add(panneau);

  // Aile à colombages : galerie-balcon bois filante sur la façade nord-est
  // (arête 4 : milieu (-181,22, 150,80), normale (0,84, -0,54)).
  {
    const cx = -181.22, cz = 150.80, nx = 0.84, nz = -0.54;
    const rot = Math.atan2(nx, nz);
    const ySol = sol(cx, cz);
    const aile = new THREE.Group();
    // Colombages : traverses brunes sur l'enduit crème du bâti (plaquées).
    for (const dx of [-6, -3, 0, 3, 6]) {
      const colomb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.06), boisSombre);
      colomb.position.set(dx, 4.4, 0.1);
      aile.add(colomb);
    }
    const lisseH = new THREE.Mesh(new THREE.BoxGeometry(14, 0.18, 0.06), boisSombre);
    lisseH.position.set(0, 3.3, 0.1);
    aile.add(lisseH);
    // Galerie : plancher, garde-corps à barreaux, consoles.
    const plancher = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 1.1), boisSombre);
    plancher.position.set(0, 3.1, 0.65);
    aile.add(plancher);
    const lisse = new THREE.Mesh(new THREE.BoxGeometry(14, 0.08, 0.08), boisSombre);
    lisse.position.set(0, 4.1, 1.15);
    aile.add(lisse);
    for (let k = 0; k < 18; k++) {
      const barreau = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.95, 0.05), boisSombre);
      barreau.position.set(-6.7 + k * 0.79, 3.62, 1.15);
      aile.add(barreau);
    }
    aile.position.set(cx, ySol, cz);
    aile.rotation.y = rot;
    g.add(aile);
  }

  // Ancienne piscine bâchée, bleu délavé, dans la cour sud-ouest.
  const bache = new THREE.Mesh(new THREE.PlaneGeometry(8, 4),
    new THREE.MeshStandardMaterial({ color: 0x7fa8c0, roughness: 0.85 }));
  bache.rotation.x = -Math.PI / 2;
  bache.rotation.z = -1.16;
  bache.position.set(-191.5, sol(-191.5, 159.5) + 0.03, 159.5);
  g.add(bache);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Pavillon crèche municipale + Bibliothèque Pour Tous, avenue de la 2e DB
// (bâtiment 2013, retiré du bâti). Street View mai 2026 : plain-pied à pans
// alternés crème et rouge brique, deux frontons triangulaires, toit de
// tuiles, enseigne « BIBLIOTHÈQUE POUR TOUS », clôture crème basse. Le POI
// OSM de la bibliothèque (place du Général de Gaulle) était périmé : elle
// est ICI. Façade sur +Z local (face nord en monde).
function construireCrecheBibliotheque() {
  const g = new THREE.Group();
  const L = 24.8, PROF = 16.9, H = 2.9;
  const creme = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9 });
  const brique = new THREE.MeshStandardMaterial({ color: 0xa04a38, roughness: 0.85 });
  const tuile = new THREE.MeshStandardMaterial({
    color: 0x8a4f38, roughness: 0.9, side: THREE.DoubleSide,
  });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.25, metalness: 0.1 });

  const corps = new THREE.Mesh(new THREE.BoxGeometry(L, H, PROF), creme);
  corps.position.set(0, H / 2, -PROF / 2);
  g.add(corps);
  // Pans rouge brique alternés sur la façade.
  for (const dx of [-8.5, -2.5, 3.5, 9.5]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(2.6, H - 0.3, 0.08), brique);
    pan.position.set(dx, H / 2, 0.04);
    g.add(pan);
  }
  for (const dx of [-5.5, 6.5]) {
    const fen = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.4), vitre);
    fen.position.set(dx, 1.5, 0.09);
    g.add(fen);
  }
  // Toit à deux pans doux et deux frontons triangulaires sur la façade.
  const pente = Math.atan2(1.6, PROF / 2);
  for (const cote of [-1, 1]) {
    const pan = new THREE.Mesh(new THREE.BoxGeometry(L + 1, 0.14, PROF / 2 + 1.2), tuile);
    pan.position.set(0, H + 0.8, -PROF / 2 - cote * PROF / 4);
    pan.rotation.x = -cote * pente;
    g.add(pan);
  }
  for (const dx of [-6.5, 5.5]) {
    const tri = new THREE.Shape();
    tri.moveTo(-2.2, 0);
    tri.lineTo(2.2, 0);
    tri.lineTo(0, 1.5);
    tri.closePath();
    const fronton = new THREE.Mesh(new THREE.ShapeGeometry(tri),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, side: THREE.DoubleSide }));
    fronton.position.set(dx, H, 0.06);
    g.add(fronton);
    const chapeau = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.12, 0.9), tuile);
    chapeau.position.set(dx, H + 0.85, 0.1);
    g.add(chapeau);
  }
  // Enseigne de la bibliothèque, côté est de la façade.
  const texB = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2f1ec';
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = '#1d50a8';
    // Livres stylisés à gauche.
    for (let k = 0; k < 3; k++) ctx.fillRect(30 + k * 18, 30 - k * 4, 12, 68 + k * 8);
    ctx.font = '600 40px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('BIBLIOTHÈQUE', 110, 46);
    ctx.fillText('POUR TOUS', 110, 92);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65),
    new THREE.MeshStandardMaterial({ map: texB, roughness: 0.55 }));
  enseigne.position.set(-4, 2.1, 0.1);
  g.add(enseigne);
  // Clôture crème basse à barreaux le long de la rue.
  for (let k = 0; k <= 10; k++) {
    const poteau = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.05, 0.14), creme);
    poteau.position.set(-L / 2 + 1 + k * (L - 2) / 10, 0.52, 5.2);
    g.add(poteau);
  }
  for (const dy of [0.35, 0.95]) {
    const lisse = new THREE.Mesh(new THREE.BoxGeometry(L - 1.5, 0.09, 0.06), creme);
    lisse.position.set(0, dy, 5.2);
    g.add(lisse);
  }

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Halle Gamm vert + Mr.Bricolage du retail park est : ABSENTE de la BD TOPO
// (emprise OSM seulement, comme le Super U). Street View mars 2026 : bardage
// anthracite nervuré à bandes de lattes bois, lettres rouges géantes
// Mr.Bricolage et pastille verte à l'est, bandeau Gamm vert et sas vitré à
// l'ouest. Construite en coordonnées MONDE.
function construireRetailBricoGamm(sol) {
  const g = new THREE.Group();
  const H = 6.5;
  const PTS = [[1466, 477], [1476, 454], [1532, 479], [1522, 502]];
  const yBase = Math.min(...PTS.map(([x, z]) => sol(x, z))) - 0.25;
  const anthracite = new THREE.MeshStandardMaterial({ color: 0x4a4c50, roughness: 0.85, side: THREE.DoubleSide });
  const murPos = [];
  for (let i = 0; i < PTS.length; i++) {
    const [x1, z1] = PTS[i], [x2, z2] = PTS[(i + 1) % PTS.length];
    murPos.push(x1, yBase, z1, x2, yBase, z2, x2, yBase + H, z2);
    murPos.push(x1, yBase, z1, x2, yBase + H, z2, x1, yBase + H, z1);
  }
  const gm = new THREE.BufferGeometry();
  gm.setAttribute('position', new THREE.Float32BufferAttribute(murPos, 3));
  gm.computeVertexNormals();
  gm.computeBoundingSphere();
  g.add(new THREE.Mesh(gm, anthracite));
  const forme = new THREE.Shape();
  forme.moveTo(PTS[0][0], PTS[0][1]);
  for (let i = 1; i < PTS.length; i++) forme.lineTo(PTS[i][0], PTS[i][1]);
  forme.closePath();
  const toit = new THREE.Mesh(new THREE.ShapeGeometry(forme),
    new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.95, side: THREE.DoubleSide }));
  toit.rotation.x = Math.PI / 2;
  toit.position.y = yBase + H;
  toit.scale.z = -1;
  g.add(toit);

  // Façade commerciale sud (segment (1522,502)→(1466,477), normale
  // extérieure (-0,408, 0,913)... orientée vers la voie au sud-est).
  const [nx, nz] = [0.408, 0.913];
  const rot = Math.atan2(nx, nz);
  const dir = [0.913, -0.408];
  const milieu = [1494, 489.5];
  const poser = (mesh, u, y, saillie) => {
    mesh.position.set(milieu[0] + dir[0] * u + nx * saillie, y, milieu[1] + dir[1] * u + nz * saillie);
    mesh.rotation.y = rot;
    g.add(mesh);
  };
  // Lattes bois par touches.
  for (const u of [-24, -8, 8, 24]) {
    poser(new THREE.Mesh(new THREE.BoxGeometry(3, H - 1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 0.85 })), u, yBase + H / 2 - 0.5, 0.08);
  }
  // Sas vitré central (Gamm vert) à fronton blanc.
  poser(new THREE.Mesh(new THREE.BoxGeometry(8, H + 0.8, 0.4),
    new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.6 })), -6, yBase + (H + 0.8) / 2, 0.1);
  poser(new THREE.Mesh(new THREE.PlaneGeometry(6.5, H - 1),
    new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.2, metalness: 0.1 })), -6, yBase + H / 2 - 0.4, 0.35);
  // Enseigne Gamm vert : blanc et rond vert sur l'anthracite.
  const texGV = (() => {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3c3e42';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#f2f1ec';
    ctx.font = 'bold 56px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gamm vert', 30, 50);
    ctx.fillStyle = '#4a9c3a';
    ctx.beginPath();
    ctx.arc(430, 48, 30, 0, Math.PI * 2);
    ctx.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  poser(new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3),
    new THREE.MeshStandardMaterial({ map: texGV, roughness: 0.5 })), -17, yBase + H - 1.2, 0.1);
  // Lettres rouges géantes Mr.Bricolage et pastille verte.
  const texMB = (() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 160;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 1024, 160);
    ctx.fillStyle = '#d63b2f';
    ctx.font = 'bold 120px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Mr.Bricolage', 512, 84);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  poser(new THREE.Mesh(new THREE.PlaneGeometry(15, 2.3),
    new THREE.MeshStandardMaterial({ map: texMB, roughness: 0.5, transparent: true, alphaTest: 0.2 })),
  17, yBase + H - 1.6, 0.1);
  const pastille = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24),
    new THREE.MeshStandardMaterial({ color: 0x9ccf6a, roughness: 0.6 }));
  poser(pastille, 9, yBase + 2.6, 0.12);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Magasin Action du retail park est, lui aussi absent de la BD TOPO :
// boîte anthracite sur son emprise OSM, bandeau blanc à lettres bleu marine
// et chevron rouge (charte de l'enseigne). Coordonnées MONDE.
function construireAction(sol) {
  const g = new THREE.Group();
  const H = 6.5;
  const PTS = [[1586, 557], [1612, 578], [1586, 612], [1559, 592]];
  const yBase = Math.min(...PTS.map(([x, z]) => sol(x, z))) - 0.25;
  const murPos = [];
  for (let i = 0; i < PTS.length; i++) {
    const [x1, z1] = PTS[i], [x2, z2] = PTS[(i + 1) % PTS.length];
    murPos.push(x1, yBase, z1, x2, yBase, z2, x2, yBase + H, z2);
    murPos.push(x1, yBase, z1, x2, yBase + H, z2, x1, yBase + H, z1);
  }
  const gm = new THREE.BufferGeometry();
  gm.setAttribute('position', new THREE.Float32BufferAttribute(murPos, 3));
  gm.computeVertexNormals();
  gm.computeBoundingSphere();
  g.add(new THREE.Mesh(gm, new THREE.MeshStandardMaterial({
    color: 0x4a4c50, roughness: 0.85, side: THREE.DoubleSide,
  })));
  const forme = new THREE.Shape();
  forme.moveTo(PTS[0][0], PTS[0][1]);
  for (let i = 1; i < PTS.length; i++) forme.lineTo(PTS[i][0], PTS[i][1]);
  forme.closePath();
  const toit = new THREE.Mesh(new THREE.ShapeGeometry(forme),
    new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.95, side: THREE.DoubleSide }));
  toit.rotation.x = Math.PI / 2;
  toit.position.y = yBase + H;
  toit.scale.z = -1;
  g.add(toit);
  // Façade ouest (segment (1559,592)→(1586,557), normale (-0,79, -0,61)) :
  // vitrine et enseigne face à la voie du parc.
  const [nx, nz] = [-0.79, -0.61];
  const rot = Math.atan2(nx, nz);
  const milieu = [1572.5, 574.5];
  const texAc = (() => {
    const c = document.createElement('canvas');
    c.width = 768; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2f1ec';
    ctx.fillRect(0, 0, 768, 128);
    // Chevron rouge et bleu de la charte.
    ctx.fillStyle = '#d63b2f';
    ctx.beginPath();
    ctx.moveTo(60, 24);
    ctx.lineTo(130, 64);
    ctx.lineTo(60, 104);
    ctx.lineTo(96, 64);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a3a6e';
    ctx.font = 'bold 88px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Action', 180, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.7),
    new THREE.MeshStandardMaterial({ map: texAc, roughness: 0.5 }));
  enseigne.position.set(milieu[0] + nx * 0.1, yBase + H - 1.3, milieu[1] + nz * 0.1);
  enseigne.rotation.y = rot;
  g.add(enseigne);
  const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(10, 3),
    new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.2, metalness: 0.1 }));
  vitrine.position.set(milieu[0] + nx * 0.1, yBase + 1.7, milieu[1] + nz * 0.1);
  vitrine.rotation.y = rot;
  g.add(vitrine);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// Devanture de commerce paramétrée, posée en absolu sur une arête mesurée :
// bandeau à enseigne dessinée, vitrines en retrait, porte vitrée, casquette.
function construireDevantureCommerce({ nom, sous, fond, encre, largeur }) {
  const g = new THREE.Group();
  const fondMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(fond), roughness: 0.55 });
  const vitre = new THREE.MeshStandardMaterial({ color: 0x20282d, roughness: 0.22, metalness: 0.1 });
  const panneau = new THREE.Mesh(new THREE.BoxGeometry(largeur, 2.9, 0.14), fondMat);
  panneau.position.set(0, 1.45, 0.07);
  g.add(panneau);
  for (const cote of [-1, 1]) {
    const vitrine = new THREE.Mesh(new THREE.PlaneGeometry(largeur * 0.32, 1.8), vitre);
    vitrine.position.set(cote * largeur * 0.24, 1.22, 0.15);
    g.add(vitrine);
  }
  const porte = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), vitre);
  porte.position.set(0, 1.06, 0.15);
  g.add(porte);
  const tex = (() => {
    const L = 1024, H = 150;
    const c = document.createElement('canvas');
    c.width = L; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = fond;
    ctx.fillRect(0, 0, L, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = encre;
    if (sous) {
      ctx.font = 'bold 62px Helvetica, Arial, sans-serif';
      ctx.fillText(nom, L / 2, 48);
      ctx.fillStyle = '#e9e6de';
      ctx.font = '600 34px Helvetica, Arial, sans-serif';
      ctx.fillText(sous.split('').join(' '), L / 2, 112);
    } else {
      ctx.font = 'bold 74px Helvetica, Arial, sans-serif';
      ctx.fillText(nom, L / 2, H / 2 + 4);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = anisotropie();
    return t;
  })();
  const enseigne = new THREE.Mesh(new THREE.PlaneGeometry(largeur * 0.9, 0.78),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 }));
  enseigne.position.set(0, 2.3, 0.16);
  g.add(enseigne);
  const casquette = new THREE.Mesh(new THREE.BoxGeometry(largeur * 0.96, 0.13, 0.6), fondMat);
  casquette.position.set(0, 2.78, 0.32);
  casquette.rotation.x = -0.09;
  g.add(casquette);
  return g;
}

export function buildLandmarks(data, relief, roadY) {
  const group = new THREE.Group();
  const traites = [];   // emprises à retirer des bâtiments ordinaires

  // Garde-fou générique des modèles posés à la main : si un coin de la boîte
  // mord une chaussée carrossable, les dimensions sont réduites par paliers
  // (jusqu'à -28 %) jusqu'au dégagement. Les débords venaient toujours d'un
  // écart entre l'emprise réelle en L et sa boîte englobante, ou d'un cap en
  // dur erroné : ce garde-fou rend l'erreur inoffensive.
  const retracterHorsChaussee = (x, z, longueur, largeur, rotY) => {
    const mord = (L2, W2) => {
      const ca = Math.cos(rotY), sa = Math.sin(rotY);
      for (const su of [-1, 1]) {
        for (const sv of [-1, 1]) {
          const u = su * L2 / 2, v = sv * W2 / 2;
          const px = x + u * ca + v * sa;
          const pz = z - u * sa + v * ca;
          for (const r of data.roads ?? []) {
            if (!r.drivable) continue;
            for (let i = 0; i < r.pts.length - 1; i++) {
              const [x1, z1] = r.pts[i], [x2, z2] = r.pts[i + 1];
              if (Math.abs(x1 - px) > 60 && Math.abs(z1 - pz) > 60) continue;
              const dx = x2 - x1, dz = z2 - z1;
              const l2 = dx * dx + dz * dz;
              if (l2 < 1e-6) continue;
              let t = ((px - x1) * dx + (pz - z1) * dz) / l2;
              t = Math.max(0, Math.min(1, t));
              const ddx = px - (x1 + dx * t), ddz = pz - (z1 + dz * t);
              if (ddx * ddx + ddz * ddz < (r.width / 2 + 0.35) ** 2) return true;
            }
          }
        }
      }
      return false;
    };
    let k = 1;
    while (k > 0.72 && mord(longueur * k, largeur * k)) k -= 0.04;
    return { longueur: longueur * k, largeur: largeur * k };
  };

  for (const b of data.landmarkSources ?? []) {
    if (b.type !== 'townhall') continue;
    const boite = boiteOrientee(b.pts);
    const sol = (relief ? relief.hauteurRoute(boite.cx, boite.cz) : 0) + roadY;

    const mairie = construireMairie(boite, sol);
    mairie.position.set(boite.cx, sol, boite.cz);
    // Le cap PCA donne le grand axe : on aligne le bâtiment dessus.
    mairie.rotation.y = -boite.cap;
    group.add(mairie);

    traites.push({ x: boite.cx, z: boite.cz, rayon: Math.max(boite.longueur, boite.largeur) / 2 + 3 });
  }

  // Gare SNCF : emprise BD TOPO 1349, coordonnées géographiques de la gare
  // et silhouette reconstituée d'après les vues publiques du parvis.
  const GARE = { pts: [
    [164.1730, 459.1706], [158.7213, 469.0335],
    [183.3186, 485.0635], [188.6974, 475.8908],
  ] };
  {
    const boite = boiteOrientee(GARE.pts);
    let sol = Infinity;
    for (const [x, z] of GARE.pts) {
      const h = (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
      if (h < sol) sol = h;
    }
    sol -= .2;
    const gare = construireGare(boite);
    gare.position.set(boite.cx, sol, boite.cz);
    gare.rotation.y = -boite.cap;
    group.add(gare);
    traites.push({ x: boite.cx, z: boite.cz, rayon: Math.max(boite.longueur, boite.largeur) / 2 + 4 });
  }

  // Immeubles d'angle du centre-bourg, relevés sur photographie de rue. Leur
  // pan arrondi et leurs volets battants ne se déduisent d'aucune donnée : la
  // BD TOPO ne donne qu'une emprise et une hauteur, dont l'extrusion produit
  // une boîte à arêtes vives.
  const ANGLES_ARRONDIS = [
    // Immeuble abritant Vapozen et le Centre de Beauté Fanny, à l'angle du
    // carrefour de la mairie : R+1 sur rez-de-chaussée commercial.
    // Recalé sur la boîte orientée du bâtiment BD TOPO 1120 : l'ancien cap en
    // dur (0,15) était perpendiculaire au cap mesuré (-1,44), le grand axe de
    // l'immeuble barrait la rue.
    { x: 16.8, z: 87.6, longueur: 18.7, largeur: 11, cap: 1.442, hauteur: 8.4 },
  ];
  for (const a of ANGLES_ARRONDIS) {
    // Altitude d'assise : on retient le point le plus BAS sous l'emprise. Le
    // terrain d'Artix est en pente, et poser le bâtiment sur l'altitude de son
    // centre le laisse flotter du côté descendant. Un pied enterré est
    // invisible, un bâtiment suspendu se remarque immédiatement.
    let sol = Infinity;
    const demiL = a.longueur / 2, demil = a.largeur / 2;
    for (const dx of [-demiL, 0, demiL]) {
      for (const dz of [-demil, 0, demil]) {
        const h = (relief ? relief.hauteurRoute(a.x + dx, a.z + dz) : 0) + roadY;
        if (h < sol) sol = h;
      }
    }
    // Léger enfoncement : ferme le joint avec le trottoir sur terrain irrégulier.
    sol -= 0.35;
    const dims = retracterHorsChaussee(a.x, a.z, a.longueur, a.largeur, a.cap);
    const imm = construireAngleArrondi(dims, a.hauteur);
    imm.position.set(a.x, sol, a.z);
    imm.rotation.y = a.cap;
    group.add(imm);
    traites.push({ x: a.x, z: a.z, rayon: Math.max(a.longueur, a.largeur) / 2 + 2 });
  }

  // Immeubles de rue à pignon central, relevés sur photographie. Leur emprise
  // et leur cap viennent de la BD TOPO, leurs hauteurs et leur silhouette de
  // la photo : la BD TOPO ne donne qu'une hauteur moyenne, dont l'extrusion
  // efface l'avant-corps et la pente de toiture.
  // Leclerc Express du centre-bourg. Il occupe les murs de l'ancien
  // Intermarché, qu'OSM porte encore sous ce nom : le relevé date d'avant le
  // changement d'enseigne, que Christophe confirme.
  //
  // Emprise et cap relevés sur l'OSM téléchargé (way 63685613, 974 m²,
  // 42,9 x 26,5 m, cap 10,4 degrés) ; hauteur de 5 m et usage commercial de la
  // BD TOPO (index 1128, 981 m²), qui le donne à toiture-terrasse.
  const SUPERMARCHES = [
    { x: 57.0, z: -88.4, longueur: 42.9, largeur: 26.5, cap: 0.1814 },
  ];
  for (const sm of SUPERMARCHES) {
    // Assise au point le plus bas de l'emprise, comme les autres repères : sur
    // terrain en pente, se caler sur le centre laisse un côté en l'air.
    let sol = Infinity;
    const rot = -sm.cap;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (const du of [-sm.longueur / 2, 0, sm.longueur / 2]) {
      for (const dv of [-sm.largeur / 2, 0, sm.largeur / 2]) {
        const x = sm.x + du * ca - dv * sa;
        const z = sm.z + du * sa + dv * ca;
        const h = (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
        if (h < sol) sol = h;
      }
    }
    sol -= 0.25;
    const bat = construireSupermarche(
      { longueur: sm.longueur, largeur: sm.largeur });
    bat.position.set(sm.x, sol, sm.z);
    bat.rotation.y = rot;
    group.add(bat);
    traites.push({
      x: sm.x, z: sm.z,
      rayon: Math.max(sm.longueur, sm.largeur) / 2 + 2,
    });
  }

  const IMMEUBLES_RUE = [
    // « Au Comptoir » et les commerces attenants, carrefour de la Patte d'Oie.
    // Bâtiment 1081 de la BD TOPO : 355 m², 39,2 x 11,2 m, cap -75 degrés.
    // Centre = celui de la BOÎTE ORIENTÉE de l'emprise, pas son centroïde :
    // l'ancienne valeur (centroïde, décalé de 5,4 m vers le sud-est sur cette
    // emprise en L) faisait déborder l'immeuble sur la chaussée du carrefour.
    { x: 44.6, z: -8.0, longueur: 39.2, largeur: 11.2, cap: -1.309 },
  ];
  for (const b of IMMEUBLES_RUE) {
    // Assise au point le plus bas de l'emprise, comme pour les autres repères :
    // sur terrain en pente, se caler sur le centre laisse un côté en l'air.
    let sol = Infinity;
    const demiL = b.longueur / 2, demil = b.largeur / 2;
    // Le cap ACP est mesuré dans le repère des données ; Three.js tourne en
    // sens inverse autour de Y, d'où la négation, comme pour la mairie.
    const rot = -b.cap;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    for (const du of [-demiL, 0, demiL]) {
      for (const dv of [-demil, 0, demil]) {
        // Les décalages sont exprimés dans le repère du bâtiment : il faut les
        // ramener dans celui du monde avant d'interroger le relief.
        const x = b.x + du * ca - dv * sa;
        const z = b.z + du * sa + dv * ca;
        const h = (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
        if (h < sol) sol = h;
      }
    }
    sol -= 0.3;
    const dims = retracterHorsChaussee(b.x, b.z, b.longueur, b.largeur, -b.cap);
    const imm = construireImmeubleRue(dims);
    // Les devantures sont construites sur le -z local, qui correspond à la
    // façade rue (normale mesurée (-0.966, -0.259)) : les génériques d'avant
    // étaient bâties sur +z et regardaient la cour.
    imm.position.set(b.x, sol, b.z);
    imm.rotation.y = rot;
    group.add(imm);
    traites.push({ x: b.x, z: b.z, rayon: Math.max(b.longueur, b.largeur) / 2 + 2 });
  }

  // Devantures issues des POI commerciaux d'Artix. Elles sont ajoutées après
  // les repères faits main pour que les commerces déjà modélisés puissent être
  // exclus et ne reçoivent pas une seconde façade par-dessus la première.
  group.add(construireDevanturesPOI(data, relief, roadY));

  // Église Saint-Pierre : emprise et cap depuis le cadastre OSM par analyse en
  // composantes principales, comme la mairie. Hauteurs relevées sur
  // photographie et recoupées BD TOPO (9,9 m de hauteur moyenne) et LiDAR HD.
  for (const b of data.landmarkSources ?? []) {
    if (b.type !== 'church') continue;
    const boite = boiteOrientee(b.pts);
    // La boîte englobante inclut les contreforts (0,65 m de saillie par
    // flanc) : la nef elle-même est d'autant plus étroite, et c'est elle que
    // la fonction de construction attend.
    const largeurNef = boite.largeur - 1.3;

    // Assise au point le plus bas de l'emprise, comme les autres repères : sur
    // terrain en pente, se caler sur le centre laisse un côté en l'air.
    let sol = Infinity;
    const rot = -boite.cap;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const demiL = boite.longueur / 2, demil = boite.largeur / 2;
    for (const du of [-demiL, 0, demiL]) {
      for (const dv of [-demil, 0, demil]) {
        const x = boite.cx + du * ca - dv * sa;
        const z = boite.cz + du * sa + dv * ca;
        const h = (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
        if (h < sol) sol = h;
      }
    }
    sol -= 0.3;

    const eg = construireEglise({ longueur: boite.longueur, largeur: largeurNef });
    eg.position.set(boite.cx, sol, boite.cz);
    eg.rotation.y = rot;
    group.add(eg);
    traites.push({
      x: boite.cx, z: boite.cz,
      rayon: Math.max(boite.longueur, boite.largeur) / 2 + 3,
    });
  }

  // Barres de logements collectifs. Relevées sur vue Panoramax et recoupées
  // BD TOPO (emprise, cap, nombre d'étages et de logements) et LiDAR HD
  // (monopente, gouttière, faîtage). Elles sont écartées de l'extrusion
  // automatique par `BATIMENTS_MODELISES` dans `bdtopo.js`.
  const BARRES = [
    // Résidence « Pyrénées », avenue Edmond Rostand. Bâtiment 2150 de la
    // BD TOPO : 555 m², 62,4 x 9,2 m, cap 22,2 degrés, 3 étages, 24 logements.
    { x: 10.2, z: -582.4, longueur: 62.36, largeur: 9.2, cap: 0.3879 },
  ];
  for (const b of BARRES) {
    // Assise au point le plus bas de l'emprise, comme les autres repères. Sur
    // 62 m de long, une barre posée sur l'altitude de son centre décolle
    // franchement d'un bout.
    let sol = Infinity;
    const rot = -b.cap;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const demiL = b.longueur / 2, demil = b.largeur / 2;
    // Cinq points sur la longueur : deux extrémités ne suffisent pas à
    // détecter un creux au milieu.
    for (const du of [-demiL, -demiL / 2, 0, demiL / 2, demiL]) {
      for (const dv of [-demil, 0, demil]) {
        const x = b.x + du * ca - dv * sa;
        const z = b.z + du * sa + dv * ca;
        const h = (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
        if (h < sol) sol = h;
      }
    }
    sol -= 0.3;
    const barre = construireBarreLogements({ longueur: b.longueur, largeur: b.largeur });
    barre.position.set(b.x, sol, b.z);
    barre.rotation.y = rot;
    group.add(barre);
    traites.push({ x: b.x, z: b.z, rayon: Math.max(b.longueur, b.largeur) / 2 + 3 });
  }

  // ---- Aménagements du corridor commerçant -------------------------------
  // Station-service du Leclerc, terrasse d'Au Comptoir, préaux d'écoles :
  // positions des POI réels, orientations calées sur la voirie ou la façade.
  {
    // Station : posée exactement sur l'emprise de son auvent BD TOPO
    // (bâtiment 1075, 12,1 x 5,2 m, cap 1,248 rad), retiré du bâti ordinaire.
    // Le poser au POI la plantait dans ce petit bâtiment, qui coiffait la
    // marquise d'un toit et la faisait lire comme une maisonnette.
    const station = construireStation();
    station.position.set(97.5, (relief ? relief.hauteurRoute(97.5, -35) : 0) + roadY, -35);
    station.rotation.y = -1.248;
    group.add(station);
    // Totem au bord NORD de la D32 (axe à z ≈ -50,5 au droit de la station),
    // grandes faces dans l'axe de la route pour être lu en la longeant.
    const totemLeclerc = construireTotemLeclerc();
    totemLeclerc.position.set(99, (relief ? relief.hauteurRoute(99, -48.5) : 0) + roadY, -48.5);
    totemLeclerc.rotation.y = Math.atan2(0.92, -0.38);
    group.add(totemLeclerc);

    // « Tendances du Moment », le grand commerce fermé derrière la station :
    // deux corps mesurés sur la BD TOPO, en retrait l'un de l'autre. Le corps
    // EST (1067, gouttière 6 m) porte le lettrage cursif et le porche
    // ENTRÉE ; le corps OUEST (1074, 3,8 m) porte rayures et vitrines.
    const solTdm = (relief ? relief.hauteurRoute(97, -26) : 0) + roadY;
    const tdmEst = construireFacadeTendances({ largeur: 13.6, texte: true, porche: true });
    // Façade sud de 1067 : A(97,3,-25,5)→B(110,9,-24,2), normale 175°.
    tdmEst.position.set(104.1, solTdm, -24.85);
    tdmEst.rotation.y = 175 * Math.PI / 180;
    group.add(tdmEst);
    const tdmOuest = construireFacadeTendances({ largeur: 15.1, texte: false, porche: false });
    // Façade sud de 1074 : de (97,4,-27,1) à (82,3,-29,3), normale ~172°.
    tdmOuest.position.set(89.85, solTdm, -28.2);
    tdmOuest.rotation.y = 172 * Math.PI / 180;
    group.add(tdmOuest);

    // ---- Zone commerciale est (Super U, McDonald's, Crédit Agricole) -----
    {
      const solZC = (x, z) => (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
      // Super U : construit en coordonnées monde sur son emprise OSM.
      group.add(construireSuperU(solZC));
      // McDonald's : boîte orientée du bâtiment 1492 (27,4 × 19,1 m,
      // cap 1,68 rad), façade principale vers le parking au nord.
      const mcdo = construireMcDo();
      mcdo.position.set(1434.04, solZC(1434.04, 531.55) - 0.15, 531.55);
      mcdo.rotation.y = 0.109;
      group.add(mcdo);
      const totemM = construireTotemMcDo();
      totemM.position.set(1412, solZC(1412, 507), 507);
      totemM.rotation.y = Math.atan2(-0.97, -0.26);
      group.add(totemM);
      // E.Leclerc Drive : décor plaqué sur la halle 589, enseignes sur les
      // quatre façades de la boîte orientée.
      group.add(construireLeclercDrive(solZC));
      // Crédit Agricole : devanture sur l'arête mesurée du bâtiment
      // tertiaire 1479 (8 m, milieu (1262,84, 543,11), normale 2,48 rad),
      // bandeau anthracite à lettres vert enseigne.
      const ca = construireDevantureCommerce({
        nom: 'CRÉDIT AGRICOLE', sous: null,
        fond: '#2e3134', encre: '#5abf8e', largeur: 7,
      });
      ca.position.set(1262.84, solZC(1262.84, 543.11), 543.11);
      ca.rotation.y = 2.48;
      group.add(ca);
    }

    // ---- Lieux relevés sur Street View (mai 2026) ------------------------
    {
      const solRV = (x, z) => (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
      // Crèche municipale + Bibliothèque Pour Tous (bâtiment 2013), façade
      // nord sur l'avenue de la 2e DB (normale mesurée (0,16, -0,99)).
      const crecheBib = construireCrecheBibliotheque();
      crecheBib.position.set(4.4, solRV(4.4, -177.8) - 0.12, -177.8);
      crecheBib.rotation.y = 2.982;
      group.add(crecheBib);
      // Retail park est : halle Gamm vert + Mr.Bricolage et magasin Action,
      // tous deux absents de la BD TOPO (emprise OSM seule).
      group.add(construireRetailBricoGamm(solRV));
      group.add(construireAction(solRV));
      // Banderole multicolore de l'Escola Calandreta, plaquée sur l'annexe
      // mesurée (arête sud, 6,4 m, normale (-0,16, 0,99)).
      {
        const texCal = (() => {
          const c = document.createElement('canvas');
          c.width = 768; c.height = 96;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#f4f2ea';
          ctx.fillRect(0, 0, 768, 96);
          const teintes = ['#d63b2f', '#e8871e', '#3f8f3f', '#1d50a8', '#8a3c8f'];
          ctx.font = 'bold 54px Georgia, serif';
          ctx.textBaseline = 'middle';
          const mot = 'Escola Calandreta';
          let x = 40;
          for (let i = 0; i < mot.length; i++) {
            ctx.fillStyle = teintes[i % teintes.length];
            ctx.fillText(mot[i], x, 52);
            x += ctx.measureText(mot[i]).width + 2;
          }
          const t = new THREE.CanvasTexture(c);
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = anisotropie();
          return t;
        })();
        const banderole = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 0.75),
          new THREE.MeshStandardMaterial({ map: texCal, roughness: 0.7 }));
        banderole.position.set(63.71, solRV(63.71, -217.46) + 2.6, -217.46);
        banderole.rotation.y = -0.158;
        group.add(banderole);
      }
      // Maison de la santé : entrée vitrée sous large auvent à poutres bois
      // apparentes, pan de lattes, tableau de plaques de praticiens.
      {
        const sante = new THREE.Group();
        const boisFonce = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.85 });
        const auvent = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 3.2),
          new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.8 }));
        auvent.position.set(0, 3.4, 1.4);
        sante.add(auvent);
        for (const dx of [-3.4, -1.2, 1.2, 3.4]) {
          const poutre = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 3.1), boisFonce);
          poutre.position.set(dx, 3.18, 1.4);
          sante.add(poutre);
        }
        const vitrage = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 2.6),
          new THREE.MeshStandardMaterial({ color: 0x2a3036, roughness: 0.2, metalness: 0.1 }));
        vitrage.position.set(-1, 1.45, 0.06);
        sante.add(vitrage);
        const lattes = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.1, 0.1),
          new THREE.MeshStandardMaterial({ color: 0xa87c48, roughness: 0.8 }));
        lattes.position.set(3, 1.6, 0.05);
        sante.add(lattes);
        const plaques = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.8),
          new THREE.MeshStandardMaterial({ color: 0xefeee8, roughness: 0.5 }));
        plaques.position.set(4.6, 1.6, 0.06);
        sante.add(plaques);
        sante.position.set(134.81, solRV(134.81, 206.46), 206.46);
        sante.rotation.y = 3.062;
        sante.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        group.add(sante);
      }
      // Ancien Leader Price, FERMÉ en 2026 : casquette verte délavée et
      // rideau baissé sur la façade sud-est de la halle 648, aucune enseigne
      // (l'exclusion du POI évite l'enseigne générique mensongère).
      {
        const friche = new THREE.Group();
        const casquette = new THREE.Mesh(new THREE.BoxGeometry(11, 0.7, 1),
          new THREE.MeshStandardMaterial({ color: 0x5a7a5a, roughness: 0.8 }));
        casquette.position.set(0, 3.5, 0.55);
        friche.add(casquette);
        const rideau = new THREE.Mesh(new THREE.PlaneGeometry(9, 3),
          new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.6, metalness: 0.3 }));
        rideau.position.set(0, 1.6, 0.06);
        friche.add(rideau);
        friche.position.set(845.9, solRV(845.9, 484.2), 484.2);
        friche.rotation.y = Math.atan2(0.84, 0.55);
        friche.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        group.add(friche);
      }
      // Pizz'Artix : petite enseigne blanche à lettres rouges sur la maison
      // rose de l'avenue (le commerce est discret, la devanture reste sobre).
      const pizzArtix = construireDevantureCommerce({
        nom: "Pizz'Artix", sous: 'PIZZERIA',
        fond: '#f4f2ee', encre: '#c5334a', largeur: 3.5,
      });
      pizzArtix.position.set(-87.76, solRV(-87.76, 54.14), 54.14);
      pizzArtix.rotation.y = 2.673;
      group.add(pizzArtix);
      // CERFRANCE, l'expert-comptable qui partage l'immeuble du Crédit
      // Agricole (bandeau EXPERTISE COMPTABLE vu sur les photos).
      const cerfrance = construireDevantureCommerce({
        nom: 'CERFRANCE', sous: 'EXPERTISE COMPTABLE',
        fond: '#f2f2f0', encre: '#1a7a4a', largeur: 5.5,
      });
      cerfrance.position.set(1269.48, solRV(1269.48, 548.14), 548.14);
      cerfrance.rotation.y = 2.479;
      group.add(cerfrance);
    }

    // ---- Lieux relevés sur Street View, première tournée -----------------
    {
      const solSV = (x, z) => (relief ? relief.hauteurRoute(x, z) : 0) + roadY;
      // Gendarmerie : boîte orientée du bâtiment 979 (27,1 × 18,4 m), façade
      // d'accueil à l'ouest (normale mesurée (-0,95, -0,31)).
      const gendarmerie = construireGendarmerie();
      gendarmerie.position.set(270.1, solSV(270.1, 321.9) - 0.12, 321.9);
      gendarmerie.rotation.y = Math.atan2(-0.95, -0.31);
      group.add(gendarmerie);
      // Banque Pouyanne : façade-décor plaquée sur la longue façade nord-est
      // du bâtiment 655 (normale (0,72, -0,69)).
      const pouyanne = construireFacadePouyanne();
      pouyanne.position.set(656.3, solSV(656.3, 539.8), 539.8);
      pouyanne.rotation.y = Math.atan2(0.72, -0.69);
      group.add(pouyanne);
      // L'Artisienne : façade-décor à fronton sur la face nord-ouest du
      // bâtiment 323, vers l'avenue de Castille (la fiche retenait le
      // sud-est, la photo montre l'entrée côté avenue).
      const artisienne = construireFacadeArtisienne();
      artisienne.position.set(-486.1, solSV(-486.1, 474.2), 474.2);
      artisienne.rotation.y = Math.atan2(-0.71, -0.7);
      group.add(artisienne);
      // Auberge du Parc : panneau du pignon, galerie à colombages, piscine
      // bâchée (le bâti 346 reste extrudé, le décor s'y plaque).
      group.add(construireDecorAuberge(solSV));
    }

    // Bistrot Les Tontons, le café du centre : véranda accolée au flanc EST
    // du bâtiment 498 (laissé au bâti ordinaire), sur l'arête mesurée
    // (-48,69, 31,65)→(-36,81, 40,43), normale (0,593, -0,803) vers
    // l'esplanade. La terrasse (jardinières) s'avance vers la place.
    {
      const tontons = construireLesTontons();
      tontons.position.set(-41.86,
        (relief ? relief.hauteurRoute(-41.86, 34.84) : 0) + roadY - 0.1, 34.84);
      tontons.rotation.y = Math.atan2(0.593, -0.803);
      group.add(tontons);
    }

    // Hair Libre : sur la façade ouest de SON emprise 1079 (11,2 m, de
    // (24,6, 48,2) à (21,1, 58,8), normale (-0,95, -0,31) vers l'avenue),
    // dans l'espace resté libre entre la Poste et Pronto Pizza.
    {
      const hairLibre = construireHairLibre();
      hairLibre.position.set(22.85,
        (relief ? relief.hauteurRoute(22.85, 53.5) : 0) + roadY - 0.12, 53.5);
      hairLibre.rotation.y = Math.atan2(-0.95, -0.31);
      group.add(hairLibre);
    }

    // Pizzeria « Pronto Pizza » : posée sur le milieu de la façade rue du
    // bâtiment 1121 (arête de 12,2 m, milieu (17,42, 68,95), normale
    // mesurée -1,93 rad vers l'avenue du 18e RI). Le POI fast_food
    // (21,8, 65,5) est posé DANS le bâtiment : ne pas s'en servir.
    const pizzeria = construirePizzeria();
    pizzeria.position.set(17.42,
      (relief ? relief.hauteurRoute(17.42, 68.95) : 0) + roadY - 0.12, 68.95);
    pizzeria.rotation.y = -1.93;
    group.add(pizzeria);

    // Complexe sportif de la salle polyvalente : éléments signature plaqués
    // sur la façade sud du bâtiment 1675 (voir construireComplexeSportif).
    const complexe = construireComplexeSportif(
      (x, z) => (relief ? relief.hauteurRoute(x, z) : 0) + roadY);
    group.add(complexe);

    // Entrée du collège Jean Moulin, en face, côté sud de l'avenue.
    const entreeCollege = construireEntreeCollege(
      (x, z) => (relief ? relief.hauteurRoute(x, z) : 0) + roadY);
    group.add(entreeCollege);

    // Paniers du plateau de basket de la cité Edmond Rostand (pitch OSM
    // tagué tennis à tort, corrigé dans osm.js) : un panier à chaque petit
    // côté, tourné vers le centre du terrain.
    {
      const galvaB = new THREE.MeshStandardMaterial({ color: 0x8f979d, roughness: 0.45, metalness: 0.4 });
      for (const [bx, bz, capB] of [[19.3, -636.3, 2.77], [31.1, -667.0, -0.37]]) {
        const panierG = new THREE.Group();
        const potB = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 8), galvaB);
        potB.position.y = 1.55;
        panierG.add(potB);
        const panneauB = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75),
          new THREE.MeshStandardMaterial({ color: 0xe8e9ea, roughness: 0.5, side: THREE.DoubleSide }));
        panneauB.position.set(0, 2.9, 0.25);
        panierG.add(panneauB);
        const arceauB = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.02, 6, 14),
          new THREE.MeshStandardMaterial({ color: 0xc8452c, roughness: 0.5 }));
        arceauB.rotation.x = Math.PI / 2;
        arceauB.position.set(0, 2.6, 0.55);
        panierG.add(arceauB);
        panierG.position.set(bx, (relief ? relief.hauteurRoute(bx, bz) : 0) + roadY, bz);
        panierG.rotation.y = capB;
        group.add(panierG);
      }
    }

    // Étendoirs à linge de la cité Edmond Rostand, sur l'esplanade de
    // gravillons (structures en T reliées par des fils, visibles sur la
    // photo et l'orthophoto, côté est de l'esplanade).
    {
      const metalEt = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.4, metalness: 0.5 });
      for (const [ex, ez, capE] of [[28.5, -612.5, 1.21], [31.5, -619.5, 1.21]]) {
        const et = new THREE.Group();
        for (const bout of [-1, 1]) {
          const montant = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.85, 8), metalEt);
          montant.position.set(bout * 3.2, 0.92, 0);
          et.add(montant);
          const traverse = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.5), metalEt);
          traverse.position.set(bout * 3.2, 1.82, 0);
          et.add(traverse);
        }
        for (const fil of [-0.6, 0, 0.6]) {
          const corde = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 6.4, 4), metalEt);
          corde.rotation.z = Math.PI / 2;
          corde.position.set(0, 1.8, fil);
          et.add(corde);
        }
        et.position.set(ex, (relief ? relief.hauteurRoute(ex, ez) : 0) + roadY, ez);
        et.rotation.y = capE;
        group.add(et);
      }
    }

    // Citystade entre la salle polyvalente et la Calandreta : posé sur le
    // rectangle du pitch OSM (grand axe (0,153, -0,988) : X local dessus
    // exige atan2(-uz, ux)).
    const citystade = construireCitystade();
    citystade.position.set(9.4, (relief ? relief.hauteurRoute(9.4, -224.2) : 0) + roadY, -224.2);
    citystade.rotation.y = Math.atan2(0.988, 0.153);
    group.add(citystade);

    // Fresque du pignon est de la halle, face au citystade (arête 22 du
    // bâtiment 1675, normale 81°).
    const fresque = construireFresque();
    const solFr = (relief ? relief.hauteurRoute(-10.2, -229) : 0) + roadY;
    fresque.position.set(-10.2 + Math.sin(1.41) * 0.14, solFr + 2.2, -229 + Math.cos(1.41) * 0.14);
    fresque.rotation.y = 1.41;
    group.add(fresque);

    // Terrasse d'Au Comptoir : au droit du bar (projection du POI sur le
    // grand axe de l'immeuble), au pied de la façade rue, tables vers le
    // trottoir. Normale de façade mesurée sur l'emprise.
    const terrasse = construireTerrasse(-0.966, -0.259);
    terrasse.position.set(42.5, (relief ? relief.hauteurRoute(42.5, -21.8) : 0) + roadY, -21.8);
    group.add(terrasse);

    // La Poste : bâtiment BD TOPO le plus proche du POI, remplacé par le
    // modèle dédié et écarté du bâti ordinaire.
    {
      let choix = null;
      for (const b of data.buildings ?? []) {
        if (!b.pts || b.pts.length < 3) continue;
        let cx = 0, cz = 0;
        for (const [px, pz] of b.pts) { cx += px; cz += pz; }
        cx /= b.pts.length; cz /= b.pts.length;
        const d = Math.hypot(cx - 38, cz - 39.3);
        if (d < (choix?.d ?? 16)) choix = { b, d };
      }
      if (choix) {
        let sol = Infinity;
        for (const [px, pz] of choix.b.pts) {
          const h = (relief ? relief.hauteurRoute(px, pz) : 0) + roadY;
          if (h < sol) sol = h;
        }
        // L'îlot 1077 est quasi carré (23,2 × 23,4 m) : le PCA de la boîte
        // orientée y est instable et partait à l'est-ouest, bâtiment tourné
        // de 90° (balcon et enseigne face aux voisins). L'aile sur rue est
        // donc calée sur l'ARÊTE MESURÉE de la façade avenue : 16 m, du bout
        // sud (25,98, 41,82) au bout nord (30,08, 26,34), normale extérieure
        // (-0,967, -0,256) vers l'avenue du 18e RI (74 prises Panoramax de
        // face). La Poste occupe TOUTE cette arête : CPC Invest, son voisin
        // immédiat au nord sur la photo 5e2b9192, est en réalité sur l'îlot
        // 1078, jointif au coin (30,08, 26,34). Grand axe le long de l'arête
        // (ux, uz) = (0,256, -0,967) : rotation atan2(-uz, ux).
        const L_POSTE = 16, W_POSTE = 11.5;
        const cxP = 28.03 + 0.967 * (W_POSTE / 2);
        const czP = 34.08 + 0.256 * (W_POSTE / 2);
        const poste = construirePoste({ longueur: L_POSTE, largeur: W_POSTE });
        poste.position.set(cxP, sol, czP);
        poste.rotation.y = Math.atan2(0.967, 0.256);
        group.add(poste);
        traites.push({ x: cxP, z: czP, rayon: Math.max(L_POSTE, W_POSTE) / 2 + 3 });
      }
    }

    // Boulangerie Maison Chaudron : moitié sud de la façade ouest de l'îlot
    // 1078, face à l'avenue (arête et normale mesurées sur l'emprise BD TOPO).
    {
      const boulangerie = construireBoulangerie();
      const solB = (relief ? relief.hauteurRoute(33.3, 13.7) : 0) + roadY;
      boulangerie.position.set(33.3, solB, 13.7);
      // La devanture regarde la normale extérieure (-0.968, -0.25).
      boulangerie.rotation.y = Math.atan2(-0.968, -0.25);
      group.add(boulangerie);
    }

    // CPC Invest : il jouxte la Poste au nord (photo 5e2b9192, la façade
    // anthracite touche le DAB), mais sur l'îlot 1078, PAS sur celui de la
    // Poste : POI projeté sur l'arête avenue de 1078 (17,4 m, normale
    // (-0,969, -0,246)), à 6 m du coin commun (30,08, 26,34). La Maison
    // Chaudron occupe la même arête plus au nord, les deux ne se touchent pas.
    {
      const cpc = construireDevantureCommerce({
        nom: 'CPC Invest', sous: 'AGENCES IMMOBILIÈRES',
        fond: '#2b2d30', encre: '#c98a4b', largeur: 6.5,
      });
      cpc.position.set(31.41, (relief ? relief.hauteurRoute(31.41, 20.81) : 0) + roadY, 20.81);
      cpc.rotation.y = Math.atan2(-0.969, -0.246);
      group.add(cpc);
    }

    // Agence MMA : façade carrefour de l'immeuble blanc (bât 1089, arête
    // mesurée, normale (-0.14, 0.99)), avec les trois macarons de l'enseigne.
    {
      const mma = construireDevantureCommerce({
        nom: 'MMA', sous: 'ASSURANCES',
        fond: '#f0efe9', encre: '#00417d', largeur: 6,
      });
      const solM = (relief ? relief.hauteurRoute(11, -29.4) : 0) + roadY;
      mma.position.set(11, solM, -29.4);
      mma.rotation.y = Math.atan2(-0.14, 0.99);
      group.add(mma);
      const teintesMacarons = [0x0064ac, 0x00a562, 0xd42e12];
      teintesMacarons.forEach((teinte, k) => {
        const macaron = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18),
          new THREE.MeshStandardMaterial({ color: teinte, roughness: 0.4 }));
        // Alignés au-dessus de la casquette, dans l'axe de la façade.
        const dxm = (k - 1) * 0.85;
        macaron.position.set(11 + dxm * 0.99, solM + 3.45, -29.4 - dxm * 0.14 + 0.2);
        macaron.rotation.y = Math.atan2(-0.14, 0.99);
        group.add(macaron);
      });
    }

    // Abri caddies du Leclerc Express, contre la façade côté parking : toit
    // translucide sur poteaux et file de chariots imbriqués.
    {
      const abri = new THREE.Group();
      const metalC = new THREE.MeshStandardMaterial({ color: 0x8f959a, roughness: 0.35, metalness: 0.6 });
      const toitC = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 1.7),
        new THREE.MeshStandardMaterial({
          color: 0xdfe4e6, roughness: 0.25, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
        }));
      toitC.position.y = 2.15;
      abri.add(toitC);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const poteauC = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.15, 8), metalC);
          poteauC.position.set(sx * 1.95, 1.07, sz * 0.75);
          abri.add(poteauC);
        }
      }
      // File de caddies : petites cages métalliques imbriquées.
      for (let k = 0; k < 6; k++) {
        const caddie = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.62), metalC);
        caddie.position.set(-1.7 + k * 0.62, 0.62, 0);
        abri.add(caddie);
      }
      // Position mesurée sur l'orthophoto IGN : le toit blanc de l'abri est
      // au MILIEU du parking, à cheval entre deux rangées dos à dos, vers
      // (43,4, -63,4), pas contre la façade. Grand axe parallèle aux rangées
      // (façade sud du magasin, direction (0,982, 0,19)).
      const solA = (relief ? relief.hauteurRoute(43.4, -63.4) : 0) + roadY;
      abri.position.set(43.4, solA, -63.4);
      abri.rotation.y = Math.atan2(-0.19, 0.982);
      group.add(abri);
    }

    // ---- Rue commerçante ouest (avenue de la République) -----------------
    // Huit devantures relevées sur les prises Panoramax de la séquence
    // fa492f76 (photos HD entières, janv. 2025) et posées sur les arêtes
    // mesurées de leurs bâtiments. Deux pièges recoupés à la photo :
    // Camguilhem et Human Immobilier partagent l'îlot 445, leur front commun
    // est l'arête k6 (24,5 m, normale (0,46, -0,89) vers l'avenue), les POI
    // mal posés faisaient retenir la venelle et l'arrière.
    {
      const DEVANTURES_OUEST = [
        // Maison béarnaise d'angle au toit d'ardoise, RDC anthracite,
        // enseigne blanche et rond rose (rendu : lettres blanches sur gris).
        { nom: 'Stéphane Plaza', sous: 'IMMOBILIER', fond: '#3a3d40', encre: '#f2f2ee',
          largeur: 6.5, x: -76.24, z: 49.02, rot: -0.468 },
        // Bandeau et drapeau noirs « BOUCHERIE », portail bois à droite.
        { nom: 'Camguilhem', sous: 'BOUCHERIE  CHARCUTERIE', fond: '#17181a', encre: '#f2efe6',
          largeur: 6.5, x: -99.8, z: 48.1, rot: Math.atan2(0.46, -0.89) },
        // Bandeau bleu roi HUMAN Immobilier, lettres blanches.
        { nom: 'HUMAN', sous: 'IMMOBILIER', fond: '#1d3f8f', encre: '#f2f2ee',
          largeur: 6.5, x: -114.8, z: 40.3, rot: Math.atan2(0.46, -0.89) },
        // Boutique de vêtements sous linteau bois d'une maison en galets.
        { nom: 'Fleur de Peau', sous: null, fond: '#8a6a4a', encre: '#f4efe6',
          largeur: 4, x: -112.95, z: 30.28, rot: -0.473 },
        // Devanture vert sauge sur maison en galets, lettrage doré.
        { nom: 'Vins & Délices', sous: 'ÉPICERIE FINE', fond: '#6b7d5a', encre: '#d9c07a',
          largeur: 5, x: -130.26, z: 21.4, rot: -0.471 },
        // Potence « Fleuriste » vert sur blanc, petite façade en retrait.
        { nom: 'Amandine Fleurs', sous: 'FLEURISTE', fond: '#eef0e8', encre: '#3f6d3f',
          largeur: 3, x: -138.57, z: 17.84, rot: -0.431 },
        // Devanture d'angle anthracite à encadrements jaune ocre, fermée
        // mais l'enseigne reste (rendu : lettres crème ocré sur anthracite).
        { nom: 'BOULANGERIE NOLA', sous: 'PÂTISSERIE', fond: '#3c3e42', encre: '#f0e8ce',
          largeur: 5, x: -179.22, z: 7.11, rot: 2.698 },
        // Angle moderne blanc, bandeau anthracite, logo doré cursif.
        { nom: 'C. Dolci', sous: 'PÂTISSERIE', fond: '#33363a', encre: '#d9b25c',
          largeur: 5, x: -66.79, z: 29.89, rot: 2.477 },
        // Façade blanche, enseigne drapeau orange (zoom photo 613365f4),
        // dans la rue qui monte au nord du carrefour de la mairie.
        { nom: 'Guy Hoquet', sous: "L'IMMOBILIER", fond: '#f2f1ec', encre: '#e8730a',
          largeur: 3.6, x: -52.44, z: 52.31, rot: -2.182 },
        // Salon de coiffure, pose mesurée (12 prises), teintes sobres faute
        // de photo frontale exploitable.
        { nom: 'D. Florès', sous: 'COIFFURE', fond: '#4a4440', encre: '#e8e2d4',
          largeur: 4, x: -149.87, z: 21.91, rot: 2.67 },
        // Audioprothésiste : charte nationale bleu sur blanc.
        { nom: 'Entendre', sous: 'AUDIOPROTHÉSISTE', fond: '#f2f2f0', encre: '#0a5a96',
          largeur: 4, x: -182.32, z: 28.9, rot: -1.84 },
      ];
      for (const d of DEVANTURES_OUEST) {
        const dev = construireDevantureCommerce({
          nom: d.nom, sous: d.sous, fond: d.fond, encre: d.encre, largeur: d.largeur,
        });
        dev.position.set(d.x, (relief ? relief.hauteurRoute(d.x, d.z) : 0) + roadY, d.z);
        dev.rotation.y = d.rot;
        group.add(dev);
      }
    }

    // ---- Front est de l'avenue et pourtour de la place -------------------
    // Six devantures relevées sur photos HD (carrefour de la pharmacie,
    // séquence fa492f76 et vues ciblées). Allianz et K'Méléon partagent
    // l'arête est de l'îlot 495 face à la place (14,8 m, normale (0,87,
    // 0,50)) : leurs POI décalés faisaient croiser les cadrages.
    {
      const DEVANTURES_EST = [
        // Bandeau vert foncé à cursive blanche, croix verte, soubassement
        // brun cuivré (rendu : bandeau vert, lettres blanches).
        { nom: 'Pharmacie', sous: 'DE LA RÉPUBLIQUE', fond: '#1e5c38', encre: '#f2efe6',
          largeur: 4.5, x: 9.84, z: 110.6, rot: 2.857 },
        // Bandeau blanc, lettres bleu roi « LOCATIONS GESTION ».
        { nom: 'MÉDIA IMMO', sous: 'LOCATIONS  GESTION', fond: '#f2f2f0', encre: '#1d50a8',
          largeur: 6, x: 25, z: 96.4, rot: -2.019 },
        // Bandeau rouge brique, lettres blanches, vitrine cintrée.
        { nom: 'CENTRE DE BEAUTÉ', sous: 'Fanny', fond: '#a33f2a', encre: '#f2efe6',
          largeur: 6, x: 12.33, z: 90.55, rot: -1.131 },
        // Bandeau noir, lettres blanches espacées, casquette CBD/Vape.
        { nom: 'VAPOZEN', sous: 'CBD SHOP  VAPESHOP', fond: '#141516', encre: '#f2f2ee',
          largeur: 3.2, x: 14.03, z: 77.79, rot: -1.922 },
        // Vitrine sous casquette grise, panonceaux bleu marine.
        { nom: 'Allianz', sous: 'ASSURANCES', fond: '#f2f2f0', encre: '#1a3d6e',
          largeur: 4.5, x: -23.89, z: 62.04, rot: 1.048 },
        // Bandeau cintré blanc à lettres grises sur façade saumon.
        { nom: "K'Méléon", sous: 'COIFFEUR · VISAGISTE', fond: '#f4f2ee', encre: '#4a4a4a',
          largeur: 4.5, x: -28.27, z: 69.63, rot: 1.048 },
        // Bandeau noir, « C'zen » en grande cursive blanche à feuille verte
        // (relevé Street View mai 2026, 915 av. de la République).
        { nom: "C'zen", sous: "L'ART DE LA BEAUTÉ", fond: '#232326', encre: '#f2f2ee',
          largeur: 5, x: -22.28, z: 89.8, rot: 1.067 },
        // Maison béarnaise à bandeau anthracite, perron à rampes vertes
        // (relevé Street View, rue Dufau, plateau nord).
        { nom: 'PHARMACIE DU PLATEAU', sous: 'MATÉRIEL MÉDICAL · ORTHOPÉDIE', fond: '#33363a', encre: '#f2f2ee',
          largeur: 8, x: 186, z: -469.5, rot: 1.227 },
      ];
      for (const d of DEVANTURES_EST) {
        const dev = construireDevantureCommerce({
          nom: d.nom, sous: d.sous, fond: d.fond, encre: d.encre, largeur: d.largeur,
        });
        dev.position.set(d.x, (relief ? relief.hauteurRoute(d.x, d.z) : 0) + roadY, d.z);
        dev.rotation.y = d.rot;
        group.add(dev);
      }
    }

    // Caisse d'Épargne : devanture RELEVÉE SUR PHOTO : lettres bleu foncé sur
    // bandeau blanc, écureuil rouge en drapeau au coin est. La façade
    // commerçante est la façade SUD du bâtiment 1126 : l'arête 6 mesurée
    // A(77,6,-48,2)→B(92,7,-54,5), normale 0,39 rad, longe la rue de la
    // Patte d'Oie (D32) à 4 m. La façade EST donne sur le parking : une
    // première pose s'y était trompée, piégée par les prises Panoramax de la
    // desserte du parking comptées comme « rue ».
    {
      // Lettres gris anthracite sur bandeau blanc (vérifié sur la vue
      // rapprochée : pas de bleu).
      const ce = construireDevantureCommerce({
        nom: "CAISSE D'EPARGNE", sous: null,
        fond: '#f4f3f0', encre: '#3a3f44', largeur: 8,
      });
      const solCE = (relief ? relief.hauteurRoute(87.5, -52.4) : 0) + roadY;
      ce.position.set(87.5, solCE, -52.4);
      ce.rotation.y = Math.atan2(0.38, 0.92);
      group.add(ce);
      // Drapeau carré rouge, sigle blanc simplifié de l'écureuil.
      const sigle = (() => {
        const T = 128;
        const c = document.createElement('canvas');
        c.width = c.height = T;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#d1202f';
        ctx.fillRect(0, 0, T, T);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(T * 0.52, T * 0.5, T * 0.28, -2.6, 1.2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(T * 0.3, T * 0.72);
        ctx.lineTo(T * 0.74, T * 0.62);
        ctx.stroke();
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      // L'agence signale ses deux angles : écureuil en drapeau à chaque coin
      // de la façade rue, et grand carré plaqué en haut de la façade ouest
      // (D32), visible en arrivant du pont : trois enseignes relevées sur les
      // photos du carrefour.
      const matSigle = new THREE.MeshStandardMaterial({ map: sigle, roughness: 0.5, side: THREE.DoubleSide });
      const drapeauCE = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), matSigle);
      drapeauCE.position.set(91.6, solCE + 3.4, -53.5);
      drapeauCE.rotation.y = Math.atan2(0.92, -0.38);
      group.add(drapeauCE);
      // Enseigne drapeau VERTICALE rouge à la limite salon/banque sur la
      // façade sud (t ≈ 4,5 m de l'arête 6), sigle blanc en tête : c'est le
      // panneau qu'on voit en arrivant de l'ouest par la D32.
      const rougeCE = new THREE.MeshStandardMaterial({ color: 0xd1202f, roughness: 0.5, side: THREE.DoubleSide });
      const panneauCE = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.4), rougeCE);
      panneauCE.position.set(82.05, solCE + 3.9, -49.15);
      panneauCE.rotation.y = Math.atan2(0.92, -0.38);
      group.add(panneauCE);
      const sigleHaut = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), matSigle);
      sigleHaut.position.set(82.05, solCE + 4.85, -49.15);
      sigleHaut.rotation.y = Math.atan2(0.92, -0.38);
      group.add(sigleHaut);
      const carreCE = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), matSigle);
      // Plaqué 15 cm devant le plan de l'arête 5 (normale (-0,92, 0,39)).
      carreCE.position.set(76.98, solCE + 3.9, -49.24);
      carreCE.rotation.y = -1.17;
      group.add(carreCE);
    }

    // Salon ATMOSPH'AIR (le nom réel porte l'apostrophe) : devanture d'ANGLE
    // au coin sud-ouest du 1126, coin B(77,6,-48,2) partagé par l'arête 5
    // (façade ouest, normale -1,17 rad) et l'arête 6 (façade sud, normale
    // 0,39 rad). Face ouest : vitrine panoramique et téléphone vertical ;
    // face sud : vitrine et porte. Relevé sur les photos du carrefour.
    {
      const solSalon = (relief ? relief.hauteurRoute(76.6, -50.5) : 0) + roadY;
      const faceOuest = construireFaceAtmosphair({ largeur: 4.9, porte: false, telVertical: true });
      // Centre à 2,45 m du coin le long de l'arête 5 (direction (-0,39, -0,91)).
      faceOuest.position.set(76.64, solSalon, -50.43);
      faceOuest.rotation.y = -1.17;
      group.add(faceOuest);
      const faceSud = construireFaceAtmosphair({ largeur: 3.8, porte: true, telVertical: false });
      // Centre à 1,9 m du coin le long de l'arête 6 (direction (0,92, -0,38)).
      faceSud.position.set(79.35, solSalon, -48.92);
      faceSud.rotation.y = 0.39;
      group.add(faceSud);
    }

    // Pharmacie Barrouilhet, relevée sur photo : le long bandeau du
    // rez-de-chaussée est ANTHRACITE à grandes lettres blanches PHARMACIE
    // (pas vert : le vert n'est que dans les croix), et la signature du
    // pignon sur rue : bandeau vertical noir à croix vertes, grande croix
    // lumineuse en drapeau à l'angle et carré d'enseigne orange en tête.
    {
      const ph = construireDevantureCommerce({
        nom: 'P H A R M A C I E', sous: null,
        fond: '#2a2e31', encre: '#f2f6f0', largeur: 8,
      });
      const solPh = (relief ? relief.hauteurRoute(110.9, -69.2) : 0) + roadY;
      ph.position.set(110.9, solPh, -69.2);
      ph.rotation.y = Math.atan2(0.70, 0.71);
      group.add(ph);
      // Pignon sur rue (normale mesurée (-0.67, -0.74)) : bandeau vertical.
      const bandeauTex = (() => {
        const c = document.createElement('canvas');
        c.width = 96; c.height = 640;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#141816';
        ctx.fillRect(0, 0, 96, 640);
        ctx.fillStyle = '#2fae5f';
        for (let k = 0; k < 5; k++) {
          const y = 60 + k * 120, T = 30;
          ctx.fillRect(48 - T / 2 - 14, y - 5, T + 28, 10);
          ctx.fillRect(48 - 5, y - T / 2 - 14, 10, T + 28);
        }
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const solPi = (relief ? relief.hauteurRoute(105.5, -75.5) : 0) + roadY;
      const bandeau = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 5.6),
        new THREE.MeshStandardMaterial({ map: bandeauTex, roughness: 0.6 }));
      bandeau.position.set(105.5 - 0.67 * 0.08, solPi + 3.4, -75.5 - 0.74 * 0.08);
      bandeau.rotation.y = Math.atan2(-0.67, -0.74);
      group.add(bandeau);
      // Grande croix verte en drapeau, lumineuse comme la vraie.
      const croixTex = (() => {
        const T = 128;
        const c = document.createElement('canvas');
        c.width = c.height = T;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, T, T);
        ctx.fillStyle = '#12b45a';
        const b = T * 0.3;
        ctx.fillRect(T / 2 - b / 2, T * 0.06, b, T * 0.88);
        ctx.fillRect(T * 0.06, T / 2 - b / 2, T * 0.88, b);
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      })();
      const croixMat2 = new THREE.MeshStandardMaterial({
        map: croixTex, transparent: true, alphaTest: 0.3, roughness: 0.4,
        emissive: 0xffffff, emissiveMap: croixTex, emissiveIntensity: 0.7,
        side: THREE.DoubleSide,
      });
      const croix = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.15), croixMat2);
      croix.position.set(105.5 - 0.67 * 0.9 - 0.74 * -2.2, solPi + 5.4, -75.5 - 0.74 * 0.9 + 0.67 * -2.2);
      croix.rotation.y = Math.atan2(-0.74, 0.67);
      group.add(croix);
      // Seconde croix, déportée en potence sur la façade sud de l'immeuble
      // Caisse d'Épargne (t ≈ 6,5 m de l'arête 6, juste à droite du panneau
      // CE rouge sur la vue rapprochée) : elle capte la D32 pour la
      // pharmacie, de l'autre côté du carrefour.
      const croix2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), croixMat2);
      croix2.position.set(83.81, solPi + 4.2, -50.19);
      croix2.rotation.y = Math.atan2(0.92, -0.38);
      group.add(croix2);
      // Carré d'enseigne orange en tête de pignon.
      const carre = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62),
        new THREE.MeshStandardMaterial({ color: 0xd2691e, roughness: 0.55, side: THREE.DoubleSide }));
      carre.position.set(105.5 - 0.67 * 0.9 - 0.74 * -1.2, solPi + 6.6, -75.5 - 0.74 * 0.9 + 0.67 * -1.2);
      carre.rotation.y = Math.atan2(-0.74, 0.67);
      group.add(carre);
    }

    // Commerce accolé à la pharmacie (bâtiment 1072) : devanture sobre sur
    // sa façade rue, sans inventer d'enseigne.
    {
      const dc = construireDevantureCommerce({
        nom: ' ', sous: null, fond: '#3c4247', encre: '#3c4247', largeur: 8.5,
      });
      const solDc = (relief ? relief.hauteurRoute(92.2, -86.5) : 0) + roadY;
      dc.position.set(92.2, solDc, -86.5);
      dc.rotation.y = Math.atan2(-0.99, -0.16);
      group.add(dc);
    }

    // Préaux : écoles élémentaires Jean Moulin et Jean Sarrailh, posés côté
    // cour, à l'écart de la rue.
    for (const [px, pz, capP] of [[-70, -31, 0.3], [352, -715, 1.2]]) {
      const preau = construirePreau();
      preau.position.set(px, (relief ? relief.hauteurRoute(px, pz) : 0) + roadY, pz);
      preau.rotation.y = capP;
      group.add(preau);
    }
  }

  return { group, traites };
}
