// Découpage spatial des maillages instanciés.
//
// Un InstancedMesh n'est écarté par le frustum culling qu'en bloc : sa sphère
// englobante couvre toutes ses instances, donc celle des 3 500 arbres d'Artix
// couvre la commune entière et le maillage est toujours dessiné en entier.
// Mesuré avant ce chantier : 5,01 millions de triangles soumis par frame,
// identiques au centre-bourg et à 3,4 km de là.
//
// Le principe retenu tire parti de ce que `count` ne dessine que les `count`
// PREMIÈRES instances d'un maillage. En rangeant les instances par cellule
// spatiale, du plus proche du véhicule au plus lointain, il suffit d'ajuster
// `count` pour écarter tout ce qui est trop loin, sans toucher à la géométrie
// ni créer un objet Three.js de plus.
//
// Le tri complet à chaque frame coûterait plus cher que le gain. On ne
// réordonne donc que lorsque le véhicule a franchi une fraction de cellule.

// Écrit la matrice de l'instance `src` à l'emplacement `dst`, couleur comprise.
// `ratio` : nombre d'instances consécutives portées par une seule entité (les
// quatre roues d'un véhicule garé, par exemple). Le bloc entier se déplace
// ensemble, sinon une roue quitterait sa caisse en cours de réordonnancement.
function deplacerInstance(mesh, srcEntite, dstEntite, ratio, tampon) {
  const m = mesh.instanceMatrix.array;
  const c = mesh.instanceColor?.array;
  for (let r = 0; r < ratio; r++) {
    const src = srcEntite * ratio + r, dst = dstEntite * ratio + r;
    const o1 = src * 16, o2 = dst * 16;
    for (let k = 0; k < 16; k++) tampon[k] = m[o2 + k];
    for (let k = 0; k < 16; k++) m[o2 + k] = m[o1 + k];
    for (let k = 0; k < 16; k++) m[o1 + k] = tampon[k];

    if (c) {
      const c1 = src * 3, c2 = dst * 3;
      for (let k = 0; k < 3; k++) tampon[k] = c[c2 + k];
      for (let k = 0; k < 3; k++) c[c2 + k] = c[c1 + k];
      for (let k = 0; k < 3; k++) c[c1 + k] = tampon[k];
    }
  }
}

export class GrilleInstances {
  // `meshes` : maillages partageant le MÊME ordre d'ENTITÉS (les trois
  // maillages d'un arbre : fût, charpente, feuillage ; ou les quatre parties
  // d'un véhicule garé : caisse, roues, feux arrière, feux avant). Ils sont
  // réordonnés ensemble, sans quoi le feuillage d'un arbre se retrouverait sur
  // le fût d'un autre.
  //
  // `ratios` : nombre d'instances par entité pour chaque mesh, dans le même
  // ordre que `meshes`. Une caisse porte une instance par véhicule, ses roues
  // quatre : `ratios` vaut alors `[1, 4, 2, 2]`. Omis, chaque mesh porte une
  // instance par entité (le cas des arbres et des lampadaires).
  constructor(meshes, positions, { taille = 250, marge = 60, ratios = null } = {}) {
    this.meshes = meshes.filter(Boolean);
    this.ratios = this.meshes.map((_, i) => ratios?.[i] ?? 1);
    this.total = positions.length;
    this.taille = taille;
    this.marge = marge;
    // Position de chaque instance, dans l'ordre courant du tampon.
    this.pos = positions.map(([x, z]) => ({ x, z }));
    // Une matrice à la fois : `deplacerInstance` boucle sur les instances
    // d'un bloc, le tampon est réutilisé à chaque tour.
    this.tampon = new Float32Array(16);
    this.dernierX = Infinity;
    this.dernierZ = Infinity;
    this.affichees = this.total;
    // Diagnostic : nombre de réordonnancements réellement effectués.
    this.reordonnancements = 0;
  }

  // Réordonne les instances par distance croissante au point donné, puis borne
  // `count` à celles qui tombent dans la portée.
  //
  // `portee` est la distance d'affichage du profil graphique. La marge évite
  // qu'un objet n'apparaisse brutalement en limite de champ : on trie sur la
  // portée augmentée, et le frustum culling de la carte d'ombre s'occupe du
  // reste.
  maj(x, z, portee) {
    if (!this.meshes.length) return this.affichees;
    // Rien à faire tant que le véhicule reste dans la même fraction de
    // cellule : le tri est stable à cette échelle.
    const seuil = this.taille * 0.25;
    if (Math.abs(x - this.dernierX) < seuil && Math.abs(z - this.dernierZ) < seuil) {
      return this.affichees;
    }
    this.dernierX = x;
    this.dernierZ = z;
    this.reordonnancements++;

    const limite = (portee + this.marge) ** 2;
    // Partition en place : tout ce qui est dans la portée passe devant. On ne
    // trie pas réellement, une partition suffit et coûte un seul balayage.
    let fin = 0;
    for (let i = 0; i < this.total; i++) {
      const p = this.pos[i];
      const dx = p.x - x, dz = p.z - z;
      if (dx * dx + dz * dz <= limite) {
        if (i !== fin) {
          this.meshes.forEach((mesh, m) => deplacerInstance(mesh, i, fin, this.ratios[m], this.tampon));
          const t = this.pos[i]; this.pos[i] = this.pos[fin]; this.pos[fin] = t;
        }
        fin++;
      }
    }

    this.affichees = fin;
    this.meshes.forEach((mesh, m) => {
      mesh.count = fin * this.ratios[m];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return fin;
  }
}
