// Touffes d'herbe autour du véhicule.
//
// Le sol général porte une texture, ce qui suffit à distance mais laisse le
// bas-côté parfaitement lisse dès qu'on le longe de près : rien n'y accroche
// la lumière, et la pelouse se lit comme une surface peinte.
//
// Le principe retenu est un pool d'instances de taille FIXE, réparties une
// fois pour toutes sur une grille locale, et translatées avec le véhicule.
// Rien n'est créé ni détruit pendant la partie : quand la voiture sort de la
// cellule courante, les touffes concernées sont réécrites plus loin, à une
// position déterminée par leur coordonnée de grille. Deux passages au même
// endroit donnent donc exactement la même herbe.
import * as THREE from 'three';
import { anisotropie } from './textures.js';

// Bruit déterministe : deux appels avec la même cellule donnent la même
// touffe, quel que soit le trajet suivi pour y arriver.
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Géométrie d'une touffe : trois quads en étoile, plantés à 60 degrés l'un de
// l'autre. C'est le montage classique du billboard croisé, et il tient le
// choc sous tous les angles sans avoir à orienter quoi que ce soit vers la
// caméra pendant la partie.
//
// Douze triangles par touffe : à 900 instances, 10 800 triangles au total,
// soit moins d'un pour cent de ce que pèse la végétation arborée.
function construireTouffe(hauteur = 0.42, largeur = 0.34) {
  const pos = [], nrm = [], uv = [];
  const quad = (ux, uz) => {
    const hx = ux * largeur * 0.5, hz = uz * largeur * 0.5;
    // Normale tournée vers le haut plutôt que perpendiculaire au quad : un
    // brin d'herbe est éclairé par le ciel, pas par le côté. Sans cela, les
    // touffes ressortent en aplats sombres dès que le soleil est bas.
    pos.push(-hx, 0, -hz, hx, 0, hz, hx, hauteur, hz);
    pos.push(-hx, 0, -hz, hx, hauteur, hz, -hx, hauteur, -hz);
    for (let i = 0; i < 6; i++) nrm.push(0, 1, 0);
    uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  };
  quad(1, 0);
  quad(0.5, 0.866);
  quad(-0.5, 0.866);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeBoundingSphere();
  return g;
}

// Texture de touffe : quelques brins verticaux sur fond transparent.
//
// Le découpage passe par `alphaTest` et NON par `transparent: true` : un
// millier de touffes transparentes entreraient dans le tri des faces
// transparentes, avec le désordre habituel là où elles se recouvrent, et
// elles n'écriraient plus la profondeur. Avec `alphaTest`, le fragment est
// simplement rejeté : la touffe reste opaque et se trie comme le reste.
function texturerBrins(taille = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, taille, taille);
  // Une quinzaine de brins, plus larges en bas qu'en haut, avec une légère
  // courbure : un brin parfaitement droit se lit comme un trait.
  const BRINS = 15;
  for (let i = 0; i < BRINS; i++) {
    const base = (i + 0.5) / BRINS;
    const x0 = base * taille + (hash(i, 3.1) - 0.5) * taille * 0.06;
    // Hauteur variable : une touffe dont tous les brins montent à la même
    // hauteur ressemble à une brosse.
    const h = taille * (0.55 + hash(i, 7.7) * 0.42);
    const courbure = (hash(i, 11.3) - 0.5) * taille * 0.20;
    const larg = taille * 0.035 * (0.7 + hash(i, 13.9) * 0.6);
    // Vert tiré vers le jaune sur les brins clairs, vers le sombre à la base :
    // c'est ce dégradé qui donne du volume à la touffe.
    const clair = 96 + hash(i, 17.1) * 58;
    ctx.strokeStyle = `rgb(${Math.round(clair * 0.62)},${Math.round(clair)},${Math.round(clair * 0.40)})`;
    ctx.lineWidth = larg;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, taille);
    ctx.quadraticCurveTo(x0 + courbure * 0.5, taille - h * 0.55, x0 + courbure, taille - h);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // Pas de répétition : chaque quad porte la touffe entière.
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = anisotropie();
  return t;
}

export class Touffes {
  // `rayon` : distance au-delà de laquelle plus aucune touffe n'est posée.
  // 38 m est le bon compromis mesuré à l'oeil : au-delà, une touffe de 40 cm
  // ne couvre plus qu'un pixel ou deux et n'apporte rien qu'un scintillement.
  //
  // `pas` : espacement moyen de la grille de plantation. Les touffes ne sont
  // pas posées à intervalle régulier, chacune étant décalée dans sa cellule.
  constructor(scene, relief, roadY, {
    rayon = 38, pas = 2.4, densite = 0.55, estPlantable = null,
  } = {}) {
    this.rayon = rayon;
    this.pas = pas;
    this.densite = densite;
    this.relief = relief;
    this.roadY = roadY;
    // Décide si une position peut recevoir de l'herbe. Fourni par l'appelant,
    // qui seul sait où passent les routes et les bâtiments.
    this.estPlantable = estPlantable;

    // Rayon exprimé en cellules : c'est le côté du carré balayé autour du
    // véhicule. Le pool est dimensionné pour ce carré, pas pour le disque, la
    // différence étant absorbée par le compteur d'instances.
    this.demiCellules = Math.ceil(rayon / pas);
    const cote = this.demiCellules * 2 + 1;
    this.capacite = cote * cote;

    const geo = construireTouffe();
    const mat = new THREE.MeshStandardMaterial({
      map: texturerBrins(64),
      // Découpage franc, sans tri des faces transparentes. Le seuil est haut :
      // plus bas, les pixels à demi couverts du bord des brins subsistent et
      // dessinent un halo carré autour de chaque touffe.
      alphaTest: 0.45,
      transparent: false,
      side: THREE.DoubleSide,
      roughness: 1,
    });
    // La teinte de chaque touffe vient de sa couleur d'INSTANCE, posée à la
    // plantation : sans elle, mille touffes du même vert forment un tapis.
    // `instanceColor` est indépendant de `vertexColors`, qui reste inutile ici.
    this.mesh = new THREE.InstancedMesh(geo, mat, this.capacite);
    // Les touffes ne projettent pas d'ombre : à cette taille, l'ombre portée
    // n'est pas discernable et chaque instance coûterait une passe de plus.
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    // La sphère englobante d'un InstancedMesh couvre toutes ses instances, et
    // celles-ci se déplacent avec le véhicule : le frustum culling la
    // calculerait faux. On le coupe, le pool étant de toute façon borné au
    // voisinage immédiat.
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);

    // Objets de travail, alloués une fois : la mise à jour tourne dans la
    // boucle de jeu et ne doit rien créer.
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._axe = new THREE.Vector3(0, 1, 0);
    this._ech = new THREE.Vector3();
    this._col = new THREE.Color();

    // Cellule de référence de la dernière replantation.
    this._cx = Infinity;
    this._cz = Infinity;
    this.affichees = 0;
  }

  // Replante le pool autour de (x, z). Appelée à chaque frame, elle ne fait
  // réellement le travail que lorsque le véhicule a changé de cellule : entre
  // deux, les touffes sont déjà au bon endroit et il n'y a rien à écrire.
  maj(x, z, actif = true) {
    if (!actif) {
      this.mesh.count = 0;
      this.affichees = 0;
      // La cellule de référence est invalidée : sans cela, réactiver les
      // touffes au même endroit ne replanterait rien et le pool resterait vide.
      this._cx = Infinity;
      return 0;
    }

    const cx = Math.round(x / this.pas);
    const cz = Math.round(z / this.pas);
    if (cx === this._cx && cz === this._cz) return this.affichees;
    this._cx = cx;
    this._cz = cz;

    const r2 = this.rayon * this.rayon;
    const d = this.demiCellules;
    let n = 0;
    for (let i = -d; i <= d; i++) {
      for (let j = -d; j <= d; j++) {
        const gx = cx + i, gz = cz + j;
        // Densité : une cellule sur deux environ reste nue. Le tirage dépend
        // de la coordonnée de grille, donc le même point donne toujours le
        // même résultat, quel que soit le chemin par lequel on y arrive.
        const a = hash(gx, gz);
        if (a > this.densite) continue;

        // Position dans la cellule, décalée pour rompre l'alignement : une
        // grille régulière de touffes se lit immédiatement comme telle.
        const px = (gx + (hash(gx, gz + 0.37) - 0.5) * 0.85) * this.pas;
        const pz = (gz + (hash(gx + 0.71, gz) - 0.5) * 0.85) * this.pas;

        const dx = px - x, dz = pz - z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 > r2) continue;

        // Ni sur la chaussée, ni dans un bâtiment : c'est l'appelant qui
        // tranche, lui seul connaissant la ville.
        if (this.estPlantable && !this.estPlantable(px, pz)) continue;

        const y = (this.relief ? this.relief.hauteurEn(px, pz) : 0);
        this._p.set(px, y, pz);
        // Rotation autour de la verticale seulement : une touffe pousse droit.
        this._q.setFromAxisAngle(this._axe, hash(gx + 3.3, gz + 5.9) * Math.PI * 2);
        // Taille variable, un peu plus haute que large sur les sujets vigoureux.
        const s = 0.62 + hash(gx + 9.1, gz + 2.7) * 0.75;
        this._ech.set(s, s * (0.8 + hash(gx, gz + 13.1) * 0.55), s);
        this._m.compose(this._p, this._q, this._ech);
        this.mesh.setMatrixAt(n, this._m);

        // Teinte : la même palette que le sol, en un peu plus soutenu. Les
        // touffes les plus claires tirent vers le jaune, comme l'herbe sèche.
        const t = hash(gx + 17.7, gz + 23.3);
        this._col.setRGB(
          0.30 + t * 0.20,
          0.42 + t * 0.20,
          0.20 + t * 0.10,
        );
        this.mesh.setColorAt(n, this._col);
        n++;
      }
    }

    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.affichees = n;
    return n;
  }
}
