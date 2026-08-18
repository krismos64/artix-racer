// Éclairage public nocturne.
//
// Une scène peut compter un millier de lampadaires, mais un moteur temps réel
// ne supporte qu'une poignée de lumières dynamiques : chacune coûte une passe
// de calcul par fragment éclairé. La solution classique est un pool de
// lumières réelles réaffectées en continu aux foyers les plus proches du
// joueur, les autres n'étant représentées que par leur lanterne émissive.
import * as THREE from 'three';

// Portée d'un foyer. À 26 m, la flaque de lumière s'arrêtait au pied du mât et
// la rue restait noire entre deux lampadaires, alors qu'un éclairage public
// réel se recouvre d'un point lumineux à l'autre. 45 m couvre l'inter-distance
// courante d'une rue de bourg.
const PORTEE = 45;
// Nombre de lumières réellement calculées. Chacune coûte une passe par
// fragment éclairé, mais 8 ne couvraient que les deux ou trois mâts les plus
// proches : dès qu'on roulait, la ville retombait dans le noir. 20 tient le
// champ de vision proche sans coût mesurable sur le M4.
//
// Le pool est alloué à la taille maximale utilisée par les profils : le profil
// courant en éteint une partie via `setPool` plutôt que de recréer les
// lumières, ce qui éviterait une recompilation de matériaux à chaque bascule.
const POOL = 28;

export class EclairagePublic {
  constructor(scene, foyers) {
    this.foyers = foyers ?? [];
    this.lampes = [];
    this.actif = false;
    if (!this.foyers.length) return;

    // Grille spatiale : sans elle, chercher les foyers proches parmi un
    // millier de points à chaque frame coûterait plus cher que l'éclairage.
    this.CELL = 40;
    this.grille = new Map();
    this.foyers.forEach((f, i) => {
      const k = `${Math.floor(f.x / this.CELL)},${Math.floor(f.z / this.CELL)}`;
      if (!this.grille.has(k)) this.grille.set(k, []);
      this.grille.get(k).push(i);
    });

    for (let i = 0; i < POOL; i++) {
      // Lumière ponctuelle plutôt que projecteur : une lanterne de rue diffuse
      // dans toutes les directions vers le bas, et le calcul est moins lourd.
      // `decay` à 1,25 plutôt que 1,7 : l'atténuation physique en carré de la
      // distance vide la rue de sa lumière en quelques mètres. Les moteurs de
      // jeu adoucissent systématiquement cette décroissance pour qu'un
      // lampadaire éclaire la chaussée et pas seulement son pied.
      const l = new THREE.PointLight(0xffd9a0, 0, PORTEE, 1.25);
      l.visible = false;
      scene.add(l);
      this.lampes.push({ light: l, foyer: -1 });
    }
    // Par défaut toutes les lampes du pool sont servies ; le profil graphique
    // en réduit le nombre au démarrage.
    this.actives = this.lampes.length;
  }

  // Nombre de foyers réellement calculés, piloté par le profil graphique. Les
  // lumières excédentaires sont éteintes plutôt que détruites : les recréer à
  // chaque changement de profil coûterait une recompilation de matériaux.
  setPool(n) {
    this.actives = Math.max(0, Math.min(this.lampes.length, n));
    for (let i = this.actives; i < this.lampes.length; i++) {
      this.lampes[i].light.visible = false;
      this.lampes[i].foyer = -1;
    }
    return this.actives;
  }

  // `intensite` va de 0 (plein jour, éteint) à 1 (nuit noire, plein feu).
  update(posVoiture, intensite) {
    if (!this.lampes.length) return;

    // Extinction complète en journée : aucune lumière calculée.
    if (intensite <= 0.02) {
      if (this.actif) {
        for (const l of this.lampes) { l.light.visible = false; l.foyer = -1; }
        this.actif = false;
      }
      return;
    }
    this.actif = true;

    // Foyers candidats : ceux des cellules voisines de la voiture.
    const cx = Math.floor(posVoiture.x / this.CELL);
    const cz = Math.floor(posVoiture.z / this.CELL);
    const proches = [];
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const c = this.grille.get(`${cx + ox},${cz + oz}`);
        if (!c) continue;
        for (const i of c) {
          const f = this.foyers[i];
          const d = (f.x - posVoiture.x) ** 2 + (f.z - posVoiture.z) ** 2;
          if (d < PORTEE * PORTEE * 2.2) proches.push({ i, d });
        }
      }
    }
    proches.sort((a, b) => a.d - b.d);

    // Affectation : chaque lumière du pool prend le foyer le plus proche non
    // encore servi. Une lumière déjà sur le bon foyer n'est pas déplacée, ce
    // qui évite les sauts d'éclairage quand deux foyers sont à égale distance.
    // Seules les lampes actives du profil courant sont servies.
    const n = this.actives ?? this.lampes.length;
    const retenus = proches.slice(0, n);
    const dejaPris = new Set();
    for (let i = 0; i < n; i++) {
      const l = this.lampes[i];
      if (l.foyer >= 0 && retenus.some((r) => r.i === l.foyer)) dejaPris.add(l.foyer);
    }

    let curseur = 0;
    for (let i = 0; i < n; i++) {
      const l = this.lampes[i];
      if (l.foyer >= 0 && dejaPris.has(l.foyer)) {
        // Conserve son foyer, ajuste seulement l'intensité.
        l.light.intensity = this.puissance(l.foyer, posVoiture, intensite);
        continue;
      }
      // Cherche un foyer libre.
      while (curseur < retenus.length && dejaPris.has(retenus[curseur].i)) curseur++;
      if (curseur >= retenus.length) {
        l.light.visible = false;
        l.foyer = -1;
        continue;
      }
      const cible = retenus[curseur++];
      const f = this.foyers[cible.i];
      l.light.position.set(f.x, f.y, f.z);
      l.light.visible = true;
      l.foyer = cible.i;
      dejaPris.add(cible.i);
      l.light.intensity = this.puissance(cible.i, posVoiture, intensite);
    }
  }

  // Atténuation douce en limite de portée : une lumière qui apparaît d'un coup
  // se remarque immédiatement comme un artefact.
  puissance(idxFoyer, pos, intensite) {
    const f = this.foyers[idxFoyer];
    const d = Math.hypot(f.x - pos.x, f.z - pos.z);
    const fondu = THREE.MathUtils.clamp(1 - (d - PORTEE * 0.7) / (PORTEE * 0.8), 0, 1);
    // Puissance relevée avec la portée : à intensité égale, étendre le rayon
    // d'action dilue la lumière et la rue paraît encore plus sombre.
    return 55 * intensite * fondu;
  }
}
