// Chargement du véhicule au format glTF, avec roues animées.
//
// Certains modèles sont exportés en Z-up (l'axe Y porte alors la longueur du
// véhicule) alors que Three.js travaille en Y-up. Le recalage d'orientation et
// d'échelle est fait ici, une fois, plutôt que d'être répété partout. Il est
// conditionnel : l'Audi R8 en place est déjà en Y-up et n'est pas tournée.
//
// Chaque roue porte dans le fichier une matrice d'orientation propre, héritée
// de la modélisation et sans signification physique. Faire tourner ces nœuds
// directement les entraînerait chacun autour d'un axe différent. On les
// enveloppe donc dans des pivots dont l'orientation est maîtrisée : le pivot
// tourne, le nœud d'origine conserve sa pose.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Longueur hors tout visée, en mètres. Le modèle est mis à l'échelle pour
// correspondre au gabarit utilisé par la physique.
const LONGUEUR_CIBLE = 4.25;

// Noms des roues dans le fichier. L'ordre suit celui attendu par la physique :
// avant-gauche, avant-droite, arrière-gauche, arrière-droite.
//
// Deux conventions de nommage cohabitent : la casse chameau, celle de l'Audi
// R8 en place, et celle des packs Kenney, en minuscules avec des tirets.
// Plutôt que d'imposer l'une des deux, on reconnaît les roues à leur nom quel
// qu'en soit le style.
const CONVENTIONS = [
  ['WheelFrontL', 'WheelFrontR', 'WheelRearL', 'WheelRearR'],
  ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'],
];

// Retient la convention dont les quatre noms sont présents dans le modèle.
function detecterRoues(racine) {
  for (const noms of CONVENTIONS) {
    if (noms.every((n) => racine.getObjectByName(n))) return noms;
  }
  return CONVENTIONS[0];
}

// Enveloppe un nœud dans deux pivots imbriqués, insérés à sa place dans la
// hiérarchie. Le pivot extérieur porte le braquage (rotation autour de la
// verticale), l'intérieur le roulement (rotation autour de l'axe de la roue).
// Séparer les deux évite que le braquage n'entraîne l'axe de roulement.
function enveloppper(noeud) {
  const parent = noeud.parent;
  const pivotBraquage = new THREE.Group();
  const pivotRoulement = new THREE.Group();

  // Le pivot de braquage se place à l'emplacement du nœud mais SANS reprendre
  // son orientation : il reste aligné sur le repère du véhicule, ce qui permet
  // de braquer autour d'une verticale franche.
  pivotBraquage.position.copy(noeud.position);
  pivotBraquage.scale.copy(noeud.scale);

  // Le pivot de roulement reste lui aussi neutre : c'est lui qui tournera.
  // L'orientation propre du nœud, arbitraire et sans signification physique,
  // est conservée sur le nœud lui-même, un cran plus bas. Ainsi la rotation
  // s'applique AVANT elle et reste alignée sur le repère du véhicule.
  noeud.position.set(0, 0, 0);
  noeud.scale.set(1, 1, 1);

  parent.add(pivotBraquage);
  pivotBraquage.add(pivotRoulement);
  pivotRoulement.add(noeud);
  return { braquage: pivotBraquage, roulement: pivotRoulement, noeud };
}

// Le pivot de roulement étant aligné sur le repère du véhicule, une roue tourne
// toujours autour de l'axe transversal, c'est-à-dire X dans le repère Three.js
// une fois le modèle recalé. Le sens dépend du côté, il est déterminé par la
// position de la roue.
const AXE_ROULEMENT = 'x';

// `basDesPneus` : hauteur, dans le repère du corps rigide, à laquelle le bas
// des pneus doit tomber. La physique ancre ses roues à ANCHOR_Y sous le centre
// du corps et le pneu descend d'un rayon de plus. Passée en paramètre plutôt
// qu'importée de car.js, pour éviter une dépendance circulaire entre les deux
// modules.
export async function chargerVoiture(url, basDesPneus = -0.67) {
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const racine = gltf.scene;

  // --- Recalage d'orientation ---------------------------------------------
  // On mesure avant toute transformation pour reconnaître l'axe long.
  const boite = new THREE.Box3().setFromObject(racine);
  const dims = new THREE.Vector3();
  boite.getSize(dims);

  const conteneur = new THREE.Group();
  // Modèle Z-up : la longueur est portée par Y et la hauteur par Z. Un quart
  // de tour autour de X remet le véhicule debout, longueur suivant Z.
  if (dims.y > dims.z) racine.rotation.x = -Math.PI / 2;
  conteneur.add(racine);

  // --- Échelle -------------------------------------------------------------
  // Remesure après rotation : la longueur est maintenant sur Z.
  const boite2 = new THREE.Box3().setFromObject(conteneur);
  const dims2 = new THREE.Vector3();
  boite2.getSize(dims2);
  const longueur = Math.max(dims2.x, dims2.y, dims2.z);
  const echelle = longueur > 0.01 ? LONGUEUR_CIBLE / longueur : 1;
  conteneur.scale.setScalar(echelle);

  // --- Recentrage ----------------------------------------------------------
  // Le maillage est positionné sur le centre du corps rigide, autour duquel la
  // physique place ses roues à ANCHOR_Y. Le bas des pneus du modèle doit donc
  // tomber à cette même hauteur, moins le rayon de roue : sinon le véhicule
  // s'enfonce dans la chaussée ou flotte au-dessus.
  const boite3 = new THREE.Box3().setFromObject(conteneur);
  const centre = new THREE.Vector3();
  boite3.getCenter(centre);
  racine.position.x -= centre.x / echelle;
  racine.position.z -= centre.z / echelle;

  // Le calage vertical vise le bas des PNEUS, pas le bas de la boîte globale.
  // Les deux se confondent tant qu'aucune pièce ne descend plus bas qu'eux,
  // mais rien ne le garantit : un bas de caisse, un échappement ou un aileron
  // modélisés bas font plonger la boîte, et la voiture s'enfonce d'autant dans
  // la chaussée. Le symptôme est alors des roues invisibles, avalées par le
  // revêtement, alors que rien n'est faux dans le modèle.
  const boitePneus = new THREE.Box3();
  let pneuTrouve = false;
  racine.traverse((o) => {
    if (!o.isMesh || !/tyre|pneu|tire/i.test(o.name)) return;
    boitePneus.expandByObject(o);
    pneuTrouve = true;
  });
  const basReel = pneuTrouve ? boitePneus.min.y : boite3.min.y;
  racine.position.y -= (basReel - basDesPneus) / echelle;

  // --- Roues ---------------------------------------------------------------
  const roues = [];
  let rayon = 0.32;
  const NOMS_ROUES = detecterRoues(racine);
  for (const nom of NOMS_ROUES) {
    const noeud = racine.getObjectByName(nom);
    if (!noeud) continue;
    // Rayon mesuré sur la géométrie brute du pneu, sans passer par Box3 :
    // `setFromObject` travaille en coordonnées monde, donc après la rotation
    // arbitraire portée par le nœud, ce qui gonfle la boîte alignée sur les
    // axes et surestime le rayon de moitié.
    //
    // On retient la MÉDIANE des trois dimensions : la boîte d'une roue est un
    // disque, deux dimensions valent le diamètre et la troisième la largeur.
    const dim = { x: 0, y: 0, z: 0 };
    noeud.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      dim.x = Math.max(dim.x, bb.max.x - bb.min.x);
      dim.y = Math.max(dim.y, bb.max.y - bb.min.y);
      dim.z = Math.max(dim.z, bb.max.z - bb.min.z);
    });
    const tri = [dim.x, dim.y, dim.z].sort((p, q) => p - q);
    const diam = tri[1] * echelle;
    if (diam > 0.1) rayon = diam / 2;

    const pivots = enveloppper(noeud);
    // Position dans le repère du véhicule : sert à distinguer avant et arrière.
    const pos = new THREE.Vector3();
    pivots.braquage.getWorldPosition(pos);
    conteneur.worldToLocal(pos);
    roues.push({
      nom, axe: AXE_ROULEMENT, ...pivots,
      directrice: /front/i.test(nom),
      z: pos.z,
    });
  }

  // Les quatre pivots partageant le repère du véhicule, les roues tournent
  // toutes dans le même sens : pas de correction miroir à appliquer.

  // --- Volant --------------------------------------------------------------
  // Le volant est modélisé en pièces séparées, portées par la colonne de
  // direction : c'est elle qui tourne, entraînant l'ensemble.
  const colonne = racine.getObjectByName('InteriorSteeringCylinder');
  let volant = null;
  if (colonne) volant = enveloppper(colonne);

  // Poste de conduite : plutôt que des cotes devinées, on part de la position
  // réelle du volant une fois tout le recalage appliqué. Les yeux du conducteur
  // se tiennent en arrière et au-dessus de lui.
  const siege = new THREE.Vector3(-0.36, 1.10, 0.10);
  if (volant) {
    conteneur.updateWorldMatrix(true, true);
    const pv = new THREE.Vector3();
    // Le pivot, pas le nœud : l'enveloppement a remis ce dernier à l'origine.
    volant.braquage.getWorldPosition(pv);
    conteneur.worldToLocal(pv);
    // L'habitacle de ce concept-car est un volume fermé, sans transparence
    // exploitable depuis l'intérieur : une caméra placée à hauteur d'yeux n'y
    // voit que de la carrosserie. On la porte donc au ras du pare-brise, juste
    // au-dessus du capot — le compromis habituel quand l'intérieur n'est pas
    // conçu pour être filmé de dedans.
    const boiteHab = new THREE.Box3().setFromObject(conteneur);
    const sommet = new THREE.Vector3(0, boiteHab.max.y, 0);
    conteneur.worldToLocal(sommet);
    siege.set(pv.x, sommet.y + 0.04, pv.z + 0.55);
  } else {
    // Modèle sans intérieur : l'Audi R8 est une carrosserie extérieure seule,
    // sans volant ni habitacle. Les cotes en dur d'un autre véhicule y
    // placeraient la caméra n'importe où, donc on déduit le poste de conduite
    // du gabarit réel : au ras du pavillon, avancé au tiers avant, décalé du
    // côté conducteur. Le rendu vaut celui d'une caméra capot.
    const boiteHab = new THREE.Box3().setFromObject(conteneur);
    const sommet = new THREE.Vector3(0, boiteHab.max.y, 0);
    conteneur.worldToLocal(sommet);
    siege.set(-0.36, sommet.y + 0.04, LONGUEUR_CIBLE * 0.14);
  }

  // Ombres portées : la carrosserie projette, l'habitacle reçoit.
  racine.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // Certains exports laissent les matériaux en double face, ce qui double
    // inutilement le coût de rasterisation sur un volume fermé.
    if (o.material && !o.material.transparent) o.material.side = THREE.FrontSide;
  });

  return {
    car: conteneur,
    roues,
    volant,
    siege,
    rayonRoue: rayon,
    echelle,
    // Compatibilité avec l'ancien contrat d'appel.
    wheels: roues.map((r) => r.roulement),
    rouesDetectees: roues.length === 4,
  };
}

// Fait tourner les roues d'après la distance réellement parcourue, et braque
// les roues directrices. À appeler à chaque image.
//
// `distance` en mètres (signée : négative en marche arrière), `braquage` en
// radians.
export function animerRoues(roues, distance, braquage, rayonRoue) {
  if (!roues?.length) return;
  const angle = distance / Math.max(0.05, rayonRoue);
  for (const r of roues) {
    r.roulement.rotation[r.axe] -= angle;
    if (r.directrice) r.braquage.rotation.y = braquage;
  }
}
