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

  const facade = new THREE.MeshStandardMaterial({ color: 0xf4f2ee, roughness: 0.82 });
  const ardoise = new THREE.MeshStandardMaterial({
    color: 0x3f444b, roughness: 0.72, flatShading: true,
  });
  const menuiserie = new THREE.MeshStandardMaterial({ color: 0xf8f7f4, roughness: 0.5 });
  const vitrage = new THREE.MeshStandardMaterial({
    color: 0x2a3440, roughness: 0.18, metalness: 0.3,
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
        const cadre = new THREE.Mesh(new THREE.PlaneGeometry(1.32, h + 0.2), menuiserie);
        cadre.position.set(x, y, sz * (W / 2 + 0.03));
        if (sz < 0) cadre.rotation.y = Math.PI;
        g.add(cadre);
        const vitre = new THREE.Mesh(new THREE.PlaneGeometry(1.12, h), vitrage);
        vitre.position.set(x, y, sz * (W / 2 + 0.05));
        if (sz < 0) vitre.rotation.y = Math.PI;
        g.add(vitre);
      }
    }
  }
  // Fenêtres sur les pignons.
  for (const sx of [1, -1]) {
    for (const [y, h] of [[2.1, 2.0], [5.2, 1.8]]) {
      for (const off of [-W / 4, W / 4]) {
        const vitre = new THREE.Mesh(new THREE.PlaneGeometry(1.12, h), vitrage);
        vitre.position.set(sx * (L / 2 + 0.05), y, off);
        vitre.rotation.y = sx * Math.PI / 2;
        g.add(vitre);
      }
    }
  }

  // --- Devise républicaine en façade -------------------------------------
  const devise = new THREE.Mesh(
    new THREE.PlaneGeometry(L * 0.62, 0.8),
    new THREE.MeshStandardMaterial({ map: textureDevise(), roughness: 0.7 }),
  );
  devise.position.set(0, 6.9, W / 2 + 0.06);
  g.add(devise);

  // --- Entrée : porte vitrée et marches ----------------------------------
  const porte = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), vitrage);
  porte.position.set(0, 1.35, W / 2 + 0.06);
  g.add(porte);
  const perron = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.36, 1.6),
    new THREE.MeshStandardMaterial({ color: 0xdcd8d0, roughness: 0.9 }),
  );
  perron.position.set(0, 0.18, W / 2 + 0.8);
  g.add(perron);

  // --- Mât et drapeau ----------------------------------------------------
  const mat = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.06, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.4, metalness: 0.5 }),
  );
  mat.position.set(-L / 2 + 1.4, 3.5, W / 2 + 1.6);
  g.add(mat);

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
  const devantureMat = new THREE.MeshStandardMaterial({
    color: 0x14161c, roughness: 0.35, metalness: 0.25,
  });
  const voletMat = new THREE.MeshStandardMaterial({ color: 0xe8e6df, roughness: 0.7 });

  // Rez-de-chaussée : enduit, mais bordé de devantures sombres sur la façade
  // qui donne sur la rue. C'est le contraste clair/sombre entre les deux
  // niveaux qui rend un immeuble de bourg reconnaissable.
  const rdc = new THREE.Mesh(new THREE.BoxGeometry(L, H_RDC, l), enduitMat);
  rdc.position.y = H_RDC / 2;
  g.add(rdc);

  // Devantures : un bandeau sombre appliqué sur la façade rue, interrompu par
  // les trumeaux entre commerces.
  const nCommerces = Math.max(3, Math.round(L / 9));
  const largCom = (L / nCommerces) * 0.78;
  for (let i = 0; i < nCommerces; i++) {
    const x = -L / 2 + (L / nCommerces) * (i + 0.5);
    const dev = new THREE.Mesh(
      new THREE.BoxGeometry(largCom, 2.42, 0.12), devantureMat);
    dev.position.set(x, 1.35, l / 2 + 0.06);
    g.add(dev);
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

export function buildLandmarks(data, relief, roadY) {
  const group = new THREE.Group();
  const traites = [];   // emprises à retirer des bâtiments ordinaires

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

  // Immeubles d'angle du centre-bourg, relevés sur photographie de rue. Leur
  // pan arrondi et leurs volets battants ne se déduisent d'aucune donnée : la
  // BD TOPO ne donne qu'une emprise et une hauteur, dont l'extrusion produit
  // une boîte à arêtes vives.
  const ANGLES_ARRONDIS = [
    // Immeuble abritant Vapozen et le Centre de Beauté Fanny, à l'angle du
    // carrefour de la mairie : R+1 sur rez-de-chaussée commercial.
    { x: 15.2, z: 85.5, longueur: 21, largeur: 11, cap: 0.15, hauteur: 8.4 },
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
    const imm = construireAngleArrondi(
      { longueur: a.longueur, largeur: a.largeur }, a.hauteur);
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

  // Enseignes de commerce posées en façade, sans repère modélisé. Le bâtiment
  // reste extrudé automatiquement : seul le bandeau est ajouté, ce qui suffit
  // à l'identifier depuis la rue.
  //
  // `cap` est celui de la NORMALE SORTANTE de la façade, mesurée sur l'emprise
  // OSM : c'est la direction vers laquelle l'enseigne regarde.
  const ENSEIGNES_FACADE = [
    // Loto Tyche, avenue Maréchal Leclerc de Hautecloque. Il occupe les murs
    // de l'ancien Leader Price, qu'OSM porte encore sous ce nom. Façade sur
    // parking, côté sud-ouest, 29,1 m de long.
    {
      // Altitude : le bâtiment fait 3,7 m au faîtage et sa toiture descend sur
      // les bords. Un premier essai à 3,1 m faisait dépasser le haut du
      // panneau au-dessus de la ligne de toit.
      x: 829.0, z: 488.6, cap: -0.583, largeur: 4.2, hauteur: 0.80,
      altitude: 2.55, nom: 'LOTO TYCHE',
      fond: '#1d4f8f', encre: '#ffffff',
    },
  ];
  for (const e of ENSEIGNES_FACADE) {
    const sol = (relief ? relief.hauteurRoute(e.x, e.z) : 0) + roadY;
    const pan = new THREE.Mesh(
      new THREE.PlaneGeometry(e.largeur, e.hauteur),
      new THREE.MeshStandardMaterial({
        map: textureEnseigneCommerce(e.nom, e.fond, e.encre),
        roughness: 0.6, side: THREE.DoubleSide,
      }));
    // Légèrement en avant du nu de façade : le bâtiment extrudé occupe déjà ce
    // plan, et poser l'enseigne dessus produirait du z-fighting.
    const dec = 0.14;
    pan.position.set(
      e.x + Math.sin(e.cap) * dec,
      sol + e.altitude,
      e.z + Math.cos(e.cap) * dec,
    );
    pan.rotation.y = e.cap;
    group.add(pan);
    // Pas d'entrée dans `traites` : le bâtiment garde son extrusion.
  }

  const IMMEUBLES_RUE = [
    // « Au Comptoir » et les commerces attenants, carrefour de la Patte d'Oie.
    // Bâtiment 1081 de la BD TOPO : 354 m², 39,2 x 11,2 m, cap -74,7 degrés.
    { x: 47.4, z: -12.5, longueur: 39.2, largeur: 11.2, cap: -1.303 },
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
    const imm = construireImmeubleRue({ longueur: b.longueur, largeur: b.largeur });
    imm.position.set(b.x, sol, b.z);
    imm.rotation.y = rot;
    group.add(imm);
    traites.push({ x: b.x, z: b.z, rayon: Math.max(b.longueur, b.largeur) / 2 + 2 });
  }

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

  return { group, traites };
}
