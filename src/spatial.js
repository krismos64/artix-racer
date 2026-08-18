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
function deplacerInstance(mesh, src, dst, tampon) {
  const m = mesh.instanceMatrix.array;
  const o1 = src * 16, o2 = dst * 16;
  for (let k = 0; k < 16; k++) tampon[k] = m[o2 + k];
  for (let k = 0; k < 16; k++) m[o2 + k] = m[o1 + k];
  for (let k = 0; k < 16; k++) m[o1 + k] = tampon[k];

  const c = mesh.instanceColor?.array;
  if (c) {
    const c1 = src * 3, c2 = dst * 3;
    for (let k = 0; k < 3; k++) tampon[k] = c[c2 + k];
    for (let k = 0; k < 3; k++) c[c2 + k] = c[c1 + k];
    for (let k = 0; k < 3; k++) c[c1 + k] = tampon[k];
  }
}

export class GrilleInstances {
  // `meshes` : maillages partageant le MÊME ordre d'instances (les trois
  // maillages d'un arbre, par exemple : fût, charpente, feuillage). Ils sont
  // réordonnés ensemble, sans quoi le feuillage d'un arbre se retrouverait sur
  // le fût d'un autre.
  constructor(meshes, positions, { taille = 250, marge = 60 } = {}) {
    this.meshes = meshes.filter(Boolean);
    this.total = positions.length;
    this.taille = taille;
    this.marge = marge;
    // Position de chaque instance, dans l'ordre courant du tampon.
    this.pos = positions.map(([x, z]) => ({ x, z }));
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
          for (const mesh of this.meshes) deplacerInstance(mesh, i, fin, this.tampon);
          const t = this.pos[i]; this.pos[i] = this.pos[fin]; this.pos[fin] = t;
        }
        fin++;
      }
    }

    this.affichees = fin;
    for (const mesh of this.meshes) {
      mesh.count = fin;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return fin;
  }
}
