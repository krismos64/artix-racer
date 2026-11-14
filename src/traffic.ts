// Collisions et frôlements avec la circulation.
//
// Les véhicules sont ceux de `three-city/traffic.js` (flotte rgsdev
// instanciée, qui suit le graphe des voies). Ce module ne dessine rien : il
// lit leur position à chaque image et répond à deux questions, « le joueur
// vient-il d'en percuter un ? » et « vient-il d'en frôler un ? ».
//
// Jusqu'au 14 novembre 2026, douze voitures en boîtes roulaient en double à
// côté de la flotte : on percutait des boîtes et on traversait les vraies
// voitures.

// Agent de la circulation, tel que le tient three-city/traffic.js.
export interface AgentCirculation {
  _px?: number;
  _pz?: number;
  _ux?: number;
  _uz?: number;
  vitesse: number;
  arret?: number;
}

// Frôlement : passer à moins de 5 m d'un véhicule, à plus de 50 km/h, puis
// s'en éloigner à 9 m sans l'avoir touché. Validé APRÈS le dépassement
// seulement : le récompenser à l'approche paierait aussi les collisions
// imminentes.
const FROLE_ENTREE = 5;
const FROLE_SORTIE = 9;
const FROLE_VITESSE = 14;
// Gabarit de contact : demi-longueur et demi-largeur d'une berline, élargies
// du demi-gabarit du joueur. Un rectangle orienté et non un cercle : à
// 2,55 m de rayon, on « percutait » une voiture croisée sur l'autre voie.
const DEMI_LONGUEUR = 2.1 + 1.7;
const DEMI_LARGEUR = .9 + .85;

interface Suivi {
  dernierChoc: number;
  // Frôlement en cours : distance minimale et position du véhicule à ce
  // moment.
  frole: { distance: number; x: number; z: number } | null;
}

export class TrafficSystem {
  // Frôlements validés depuis le dernier appel (position du véhicule
  // frôlé) : l'appelant les lit puis vide la liste.
  readonly frolements: { x: number; z: number }[] = [];
  private readonly suivis: Suivi[];
  private joueurAvant: [number, number] | null = null;

  constructor(private readonly agents: AgentCirculation[]) {
    this.suivis = agents.map(() => ({ dernierChoc: -10, frole: null }));
  }

  update(playerX: number, playerZ: number, now: number, playerSpeed = 0): boolean {
    let collided = false;
    // Téléportation du joueur (touche R) : plus de 25 m en une image. Les
    // approches en cours sont oubliées, sinon le saut lui-même « éloigne »
    // le véhicule et valide un frôlement fictif.
    if (this.joueurAvant && Math.hypot(playerX - this.joueurAvant[0], playerZ - this.joueurAvant[1]) > 25) {
      for (const suivi of this.suivis) suivi.frole = null;
      this.frolements.length = 0;
    }
    this.joueurAvant = [playerX, playerZ];

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i], suivi = this.suivis[i];
      if (agent._px == null || agent._pz == null) continue;
      const dx = playerX - agent._px, dz = playerZ - agent._pz;
      const distance = Math.hypot(dx, dz);
      if (distance > FROLE_SORTIE + 4) {
        if (suivi.frole) {
          this.frolements.push({ x: suivi.frole.x, z: suivi.frole.z });
          suivi.frole = null;
        }
        continue;
      }
      // Position du joueur dans le repère du véhicule : le long de sa
      // marche, et en travers.
      const ux = agent._ux ?? 0, uz = agent._uz ?? 1;
      const long = dx * ux + dz * uz;
      const travers = -dx * uz + dz * ux;
      const contact = Math.abs(long) < DEMI_LONGUEUR && Math.abs(travers) < DEMI_LARGEUR;
      if (contact) {
        suivi.frole = null;
        if (now - suivi.dernierChoc > 1.2) {
          suivi.dernierChoc = now;
          // Le véhicule percuté s'immobilise trois secondes.
          agent.arret = 3;
          collided = true;
        }
      } else if (distance < FROLE_ENTREE && now - suivi.dernierChoc > 1.5) {
        if (!suivi.frole) {
          if (Math.abs(playerSpeed) >= FROLE_VITESSE) suivi.frole = { distance, x: agent._px, z: agent._pz };
        } else if (distance < suivi.frole.distance) {
          suivi.frole = { distance, x: agent._px, z: agent._pz };
        }
      } else if (suivi.frole && distance > FROLE_SORTIE) {
        this.frolements.push({ x: suivi.frole.x, z: suivi.frole.z });
        suivi.frole = null;
      }
    }
    return collided;
  }
}
