import * as THREE from 'three/webgpu';
import type { ModeleFlotte } from './car';
import type { ArtixWorld } from './world';

// Niveau de recherche et poursuite.
//
// Les infractions (passant renversé, véhicule pris à son conducteur, choc
// avec la circulation) font monter un niveau de recherche de 0 à 3 étoiles.
// Chaque étoile met une voiture de patrouille aux trousses du joueur. Les
// patrouilles suivent le graphe des voies par le plus court chemin (A*),
// puis foncent en ligne droite dans les vingt derniers mètres. Semer la
// police (plus aucune patrouille à moins de 90 m pendant 12 s) fait
// redescendre le niveau d'une étoile ; se laisser rejoindre à l'arrêt, c'est
// l'arrestation.
//
// Les patrouilles ne passent pas par le modèle de conduite du joueur : elles
// avancent le long de leur chemin à vitesse commandée, ce qui suffit à une
// voiture qu'on voit surtout dans son rétroviseur et coûte presque rien.

interface Noeud { x: number; z: number; voisins: number[] }

interface Patrouille {
  groupe: THREE.Group;
  gyros: THREE.Mesh[];
  noeud: number;          // dernier nœud atteint
  chemin: number[];       // nœuds restant à parcourir
  x: number;
  z: number;
  cap: number;
  vitesse: number;
  recalcul: number;       // secondes avant le prochain calcul de chemin
  active: boolean;
  dernierChoc: number;
}

export type EvenementPolice = 'arrete' | 'choc' | null;

const POINTE = 27;            // m/s, 97 km/h : assez pour rattraper une citadine
const ACCELERATION = 8;
const PORTEE_DIRECTE = 22;    // en deçà, la patrouille vise le joueur lui-même
const DISTANCE_SEMEE = 90;
const DELAI_SEME = 12;
const DELAI_ARRET = 1.6;

export class Police {
  // Étoiles de recherche, de 0 à 3.
  niveau = 0;
  private gravite = 0;
  private seme = 0;
  private immobile = 0;
  private temps = 0;
  private readonly noeuds: Noeud[];
  private readonly patrouilles: Patrouille[] = [];
  private sirene: { contexte: AudioContext; gain: GainNode; oscillateur: OscillatorNode } | null = null;

  constructor(
    scene: THREE.Scene,
    private readonly world: ArtixWorld,
    reseau: Array<{ x: number; z: number; voisins: Array<{ vers: number }> }>,
    modele: ModeleFlotte | null,
    palette: THREE.Texture | null,
    geometrieRoue: THREE.BufferGeometry | null,
  ) {
    // Graphe NON orienté : une patrouille en intervention prend les sens
    // interdits.
    this.noeuds = reseau.map((n) => ({ x: n.x, z: n.z, voisins: [] as number[] }));
    reseau.forEach((n, i) => {
      for (const arete of n.voisins) {
        if (!this.noeuds[i].voisins.includes(arete.vers)) this.noeuds[i].voisins.push(arete.vers);
        if (!this.noeuds[arete.vers].voisins.includes(i)) this.noeuds[arete.vers].voisins.push(i);
      }
    });
    if (!modele || !palette || !geometrieRoue || this.noeuds.length < 8) return;

    const blanc = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f6, roughness: .4, clearcoat: .8 });
    const details = new THREE.MeshStandardMaterial({ map: palette, roughness: .3, metalness: .05 });
    const gomme = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6 });
    const bande = new THREE.MeshStandardMaterial({ color: 0x1c3f94, roughness: .5 });
    for (let i = 0; i < 3; i++) {
      const groupe = new THREE.Group();
      groupe.name = `patrouille-${i}`;
      const caisse = new THREE.Mesh(modele.peinture, blanc);
      const accessoires = new THREE.Mesh(modele.details, details);
      caisse.castShadow = accessoires.castShadow = true;
      groupe.add(caisse, accessoires);
      // Bande bleue sur les flancs et rampe lumineuse sur le pavillon.
      for (const cote of [-1, 1]) {
        const flanc = new THREE.Mesh(new THREE.BoxGeometry(.02, .16, modele.demiL * 1.5), bande);
        flanc.position.set(cote * (modele.demiW + .005), modele.hauteur * .48, 0);
        groupe.add(flanc);
      }
      const gyros: THREE.Mesh[] = [];
      for (const cote of [-1, 1]) {
        // Matériau non éclairé : le bloom du rendu en fait un éclat.
        const gyro = new THREE.Mesh(new THREE.BoxGeometry(.42, .13, .26),
          new THREE.MeshBasicMaterial({ color: 0x2a6bff }));
        gyro.position.set(cote * .24, modele.hauteur + .05, -.1);
        groupe.add(gyro);
        gyros.push(gyro);
      }
      const rayon = modele.rayonRoue / .31;
      for (const r of modele.roues) {
        const roue = new THREE.Mesh(geometrieRoue, gomme);
        roue.position.set(r.x, r.y, r.z);
        roue.rotation.z = Math.PI / 2;
        roue.scale.set(rayon, 1, rayon);
        groupe.add(roue);
      }
      groupe.visible = false;
      scene.add(groupe);
      this.patrouilles.push({
        groupe, gyros, noeud: 0, chemin: [], x: 0, z: 0, cap: 0, vitesse: 0,
        recalcul: 0, active: false, dernierChoc: -10,
      });
    }
  }

  // Une infraction. `etoiles` : sa gravité, en étoiles (1 pour un passant
  // renversé, 0,34 pour un accrochage : il en faut trois pour une étoile).
  signaler(etoiles: number): void {
    if (!this.patrouilles.length) return;
    this.gravite = Math.min(3, Math.max(this.gravite, this.niveau) + etoiles);
    this.niveau = Math.min(3, Math.floor(this.gravite + 1e-6));
    this.seme = 0;
  }

  // Fin de poursuite : arrestation, ou retour au point de départ.
  lever(): void {
    this.niveau = 0;
    this.gravite = 0;
    this.seme = 0;
    this.immobile = 0;
    for (const p of this.patrouilles) {
      p.active = false;
      p.groupe.visible = false;
    }
    this.regLerSirene(0);
  }

  update(dt: number, x: number, z: number, vitesseJoueur: number): EvenementPolice {
    if (!this.patrouilles.length) return null;
    this.temps += dt;
    let evenement: EvenementPolice = null;

    // Une patrouille par étoile ; les surnuméraires rentrent au poste.
    this.patrouilles.forEach((p, i) => {
      const voulue = i < this.niveau;
      if (voulue && !p.active) this.deployer(p, x, z);
      if (!voulue && p.active) {
        p.active = false;
        p.groupe.visible = false;
      }
    });

    let plusProche = Infinity;
    for (const p of this.patrouilles) {
      if (!p.active) continue;
      const distance = Math.hypot(p.x - x, p.z - z);
      plusProche = Math.min(plusProche, distance);
      this.conduire(p, dt, x, z, distance);

      // Contact avec le joueur : choc s'il roule, arrestation s'il s'arrête.
      if (distance < 4.2 && this.temps - p.dernierChoc > 1.5 && vitesseJoueur > 2) {
        p.dernierChoc = this.temps;
        p.vitesse *= .2;
        evenement = 'choc';
      }
      // Gyrophare : les deux feux alternent quatre fois par seconde.
      const phase = Math.floor(this.temps * 8) % 2;
      p.gyros[0].visible = phase === 0;
      p.gyros[1].visible = phase === 1;
    }

    if (this.niveau > 0) {
      // Rattrapé et à l'arrêt assez longtemps : arrêté.
      if (plusProche < 9 && vitesseJoueur < 2) this.immobile += dt;
      else this.immobile = Math.max(0, this.immobile - dt * 2);
      if (this.immobile >= DELAI_ARRET) evenement = 'arrete';
      // Semé : le niveau redescend d'une étoile.
      if (plusProche > DISTANCE_SEMEE) this.seme += dt;
      else this.seme = 0;
      if (this.seme >= DELAI_SEME) {
        this.seme = 0;
        this.gravite = Math.max(0, this.niveau - 1);
        this.niveau = this.gravite;
      }
    }
    this.regLerSirene(this.niveau > 0 && plusProche < 160 ? Math.max(.15, 1 - plusProche / 160) : 0);
    return evenement;
  }

  // Fait apparaître une patrouille sur un nœud de voie entre 110 et 200 m
  // du joueur : hors de vue dans le bourg, mais sur lui en quelques secondes.
  private deployer(p: Patrouille, x: number, z: number): void {
    let choix = -1, meilleur = Infinity;
    const depart = Math.floor(Math.random() * this.noeuds.length);
    for (let k = 0; k < this.noeuds.length; k++) {
      const i = (depart + k) % this.noeuds.length;
      const n = this.noeuds[i];
      if (!n.voisins.length) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      // Pas deux patrouilles sur le même nœud : elles arriveraient l'une
      // dans l'autre.
      const libre = this.patrouilles.every((q) => q === p || !q.active || Math.hypot(q.x - n.x, q.z - n.z) > 40);
      if (d > 110 && d < 200 && libre) { choix = i; break; }
      // Repli : le nœud le plus proche de 150 m.
      if (Math.abs(d - 150) < meilleur) { meilleur = Math.abs(d - 150); choix = i; }
    }
    if (choix < 0) return;
    p.noeud = choix;
    p.x = this.noeuds[choix].x;
    p.z = this.noeuds[choix].z;
    p.chemin = [];
    p.vitesse = 0;
    p.recalcul = 0;
    p.active = true;
    p.groupe.visible = true;
  }

  private conduire(p: Patrouille, dt: number, x: number, z: number, distance: number): void {
    let ciblex: number, ciblez: number;
    let vitesseVoulue = POINTE;
    if (distance < PORTEE_DIRECTE) {
      // Derniers mètres : droit sur le joueur, en ralentissant pour ne pas
      // le traverser.
      ciblex = x;
      ciblez = z;
      // Arrêt à 7 m du joueur, centre à centre : pare-chocs contre
      // pare-chocs. À 4 m (premier essai), la patrouille entrait dans la
      // voiture du joueur.
      // Vitesse tirée de la distance de freinage restante (v² = 2·a·d) : en
      // la faisant décroître linéairement, la patrouille arrivait encore à
      // 26 m/s à 15 m et finissait dans la voiture du joueur.
      vitesseVoulue = distance < 7 ? 0 : Math.min(POINTE, Math.sqrt(2 * ACCELERATION * 1.4 * (distance - 7)));
    } else {
      p.recalcul -= dt;
      if (p.recalcul <= 0 || !p.chemin.length) {
        p.recalcul = 1.2;
        p.chemin = this.chemin(p.noeud, this.noeudProche(x, z));
      }
      const suivant = p.chemin[0];
      if (suivant == null) return;
      ciblex = this.noeuds[suivant].x;
      ciblez = this.noeuds[suivant].z;
      if (Math.hypot(ciblex - p.x, ciblez - p.z) < 2.5) {
        p.noeud = suivant;
        p.chemin.shift();
      }
    }
    const dx = ciblex - p.x, dz = ciblez - p.z;
    const longueur = Math.hypot(dx, dz) || 1e-6;
    const capVoulu = Math.atan2(dx, dz);
    let ecart = capVoulu - p.cap;
    ecart = Math.atan2(Math.sin(ecart), Math.cos(ecart));
    // Une autre patrouille juste devant, plus près du joueur : on attend
    // derrière elle au lieu de la traverser.
    for (const q of this.patrouilles) {
      if (q === p || !q.active) continue;
      if (Math.hypot(q.x - p.x, q.z - p.z) < 6 && Math.hypot(q.x - x, q.z - z) < distance) vitesseVoulue = 0;
    }
    // Un virage serré fait lever le pied.
    vitesseVoulue *= 1 - Math.min(.65, Math.abs(ecart) * .7);
    p.cap += ecart * Math.min(1, dt * 6);
    p.vitesse += Math.max(-ACCELERATION * 2 * dt, Math.min(ACCELERATION * dt, vitesseVoulue - p.vitesse));
    // Jamais à moins de 6,5 m du joueur, quelle que soit la vitesse restante.
    if (distance < PORTEE_DIRECTE && distance < 6.5) p.vitesse = 0;
    const pas = Math.min(longueur, p.vitesse * dt);
    const nx = p.x + (dx / longueur) * pas, nz = p.z + (dz / longueur) * pas;
    // Ni dans une autre patrouille : celle de rang inférieur a la priorité.
    const rang = this.patrouilles.indexOf(p);
    const genee = this.patrouilles.some((q, i) => i < rang && q.active && Math.hypot(q.x - nx, q.z - nz) < 5);
    // En poursuite directe, pas question de couper à travers une maison.
    if (genee) p.vitesse = 0;
    else if (distance >= PORTEE_DIRECTE || !this.world.collidesBuilding(nx, nz, .9)) {
      p.x = nx;
      p.z = nz;
    } else p.vitesse = 0;
    p.groupe.position.set(p.x, this.world.surfaceY(p.x, p.z), p.z);
    p.groupe.rotation.y = p.cap;
  }

  private noeudProche(x: number, z: number): number {
    let choix = 0, meilleur = Infinity;
    for (let i = 0; i < this.noeuds.length; i++) {
      const n = this.noeuds[i];
      if (!n.voisins.length) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < meilleur) { meilleur = d; choix = i; }
    }
    return choix;
  }

  // Plus court chemin par A* (coût : distance parcourue, estimation : vol
  // d'oiseau). File triée par insertion : le graphe d'Artix compte quelques
  // milliers de nœuds et la recherche est relancée une fois par seconde.
  private chemin(depart: number, arrivee: number): number[] {
    if (depart === arrivee) return [];
    const but = this.noeuds[arrivee];
    const cout = new Map<number, number>([[depart, 0]]);
    const origine = new Map<number, number>();
    const ouverts: Array<{ noeud: number; f: number }> = [{ noeud: depart, f: 0 }];
    let explores = 0;
    while (ouverts.length && explores++ < 6000) {
      const courant = ouverts.shift()!.noeud;
      if (courant === arrivee) {
        const chemin: number[] = [];
        for (let n = arrivee; n !== depart; n = origine.get(n)!) chemin.unshift(n);
        return chemin;
      }
      const ici = this.noeuds[courant];
      for (const voisin of ici.voisins) {
        const v = this.noeuds[voisin];
        const g = cout.get(courant)! + Math.hypot(v.x - ici.x, v.z - ici.z);
        if (g >= (cout.get(voisin) ?? Infinity)) continue;
        cout.set(voisin, g);
        origine.set(voisin, courant);
        const f = g + Math.hypot(but.x - v.x, but.z - v.z);
        let rang = ouverts.length;
        while (rang > 0 && ouverts[rang - 1].f > f) rang--;
        ouverts.splice(rang, 0, { noeud: voisin, f });
      }
    }
    return [];
  }

  // Deux-tons de la police française : 435 Hz puis 580 Hz, une demi-seconde
  // chacun. Synthétisé, aucun fichier.
  private regLerSirene(volume: number): void {
    if (volume > 0 && !this.sirene) {
      try {
        const contexte = new AudioContext();
        const oscillateur = contexte.createOscillator();
        oscillateur.type = 'square';
        const filtre = contexte.createBiquadFilter();
        filtre.type = 'lowpass';
        filtre.frequency.value = 1400;
        const gain = contexte.createGain();
        gain.gain.value = 0;
        oscillateur.connect(filtre).connect(gain).connect(contexte.destination);
        oscillateur.start();
        this.sirene = { contexte, gain, oscillateur };
      } catch {
        return;
      }
    }
    if (!this.sirene) return;
    const { contexte, gain, oscillateur } = this.sirene;
    const instant = contexte.currentTime;
    gain.gain.setTargetAtTime(volume * .035, instant, .15);
    oscillateur.frequency.setTargetAtTime(Math.floor(this.temps * 2) % 2 ? 580 : 435, instant, .01);
  }
}
