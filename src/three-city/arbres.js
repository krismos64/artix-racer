// Arbres modélisés dans Blender (scripts/blender/arbres.py) : quatre
// essences, chacune en deux maillages (écorce et feuillage), de hauteur 1 et
// pied à l'origine. Le jeu les instancie à la taille de chaque arbre.
//
// Avant le 14 novembre 2026, un arbre était un cylindre, cinq cônes et trois
// icosaèdres : des masses facettées qui se lisaient comme des blocs dès
// qu'on s'approchait. Ici, une vraie charpente porte une centaine de cartes
// de feuilles détourées, pour le même ordre de triangles (500 par arbre).
import * as THREE from 'three';

const BASE = '/models/arbres/';
export const ESSENCES = ['platane', 'feuillu', 'peuplier', 'saule'];

function geometrie(lot) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(lot.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(lot.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(lot.uv, 2));
  // Couleur de sommet : l'occlusion calculée à la génération (cœur du
  // houppier sombre, écorce assombrie sous la couronne).
  g.setAttribute('color', new THREE.Float32BufferAttribute(lot.col, 3));
  g.setIndex(lot.idx);
  g.computeBoundingSphere();
  return g;
}

// Renvoie { platane: { ecorce, feuilles }, ... } ou null si un fichier
// manque : la ville retombe alors sur ses arbres procéduraux.
export async function chargerArbres() {
  try {
    const arbres = {};
    await Promise.all(ESSENCES.map(async (nom) => {
      const reponse = await fetch(`${BASE}${nom}.json`);
      if (!reponse.ok) throw new Error(`${nom}: ${reponse.status}`);
      const source = await reponse.json();
      arbres[nom] = { ecorce: geometrie(source.ecorce), feuilles: geometrie(source.feuilles) };
    }));
    return arbres;
  } catch (erreur) {
    console.warn('Arbres modélisés indisponibles, arbres procéduraux :', erreur);
    return null;
  }
}
