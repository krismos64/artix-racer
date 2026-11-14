/**
 * Mesures à la demande, appelées depuis la console du navigateur.
 *
 * PIÈGE MESURÉ le 4 septembre 2026, toujours vrai : tant que la boucle est
 * cadencée par le vsync, un chronomètre posé autour d'une image mesure
 * l'intervalle entre deux images (~12 ms à 83 Hz, 16,7 ms à 60 Hz) quoi
 * qu'on dessine. Pour un chiffre décisionnel, `comparer()` sort de la boucle
 * d'affichage, dessine en rafale et attend que le GPU ait tout exécuté.
 */
import type * as THREE from 'three/webgpu';

export interface ContexteMesure {
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  soleil: THREE.DirectionalLight;
  /** Dessine une image complète, post-traitement compris. */
  rendre(): void;
  /** Suspend ou relance la boucle de jeu. */
  suspendre(arret: boolean): void;
}

// Barrière : rend la main quand le GPU a exécuté toutes les commandes
// soumises. Sans elle, on ne chronomètre que leur mise en file.
async function barriere(renderer: THREE.WebGPURenderer): Promise<void> {
  const backend = renderer.backend as unknown as {
    device?: { queue: { onSubmittedWorkDone(): Promise<void> } };
    gl?: WebGL2RenderingContext;
  };
  if (backend.device) await backend.device.queue.onSubmittedWorkDone();
  else backend.gl?.finish();
}

/** Compteurs du moteur sur la dernière image : appels de dessin, triangles. */
export function profiler(c: ContexteMesure): Record<string, number> {
  const info = c.renderer.info;
  const releve = {
    appelsDeDessin: info.render.drawCalls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  };
  console.table(releve);
  return releve;
}

/**
 * Maillages visibles par matériau. Le coût du rendu étant dominé par le
 * nombre d'appels de dessin, savoir LESQUELS sont nombreux dit où porter
 * l'effort de fusion.
 */
export function repartition(c: ContexteMesure, sommet = 20): void {
  const parMateriau = new Map<string, { nombre: number; triangles: number }>();
  c.scene.traverseVisible((objet) => {
    const mesh = objet as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materiau = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const nom = `${materiau.name || materiau.type} · ${mesh.name.replace(/-\d+$/, '') || '(sans nom)'}`;
    const entree = parMateriau.get(nom) ?? { nombre: 0, triangles: 0 };
    entree.nombre++;
    const geometrie = mesh.geometry;
    entree.triangles += (geometrie.index?.count ?? geometrie.getAttribute('position')?.count ?? 0) / 3;
    parMateriau.set(nom, entree);
  });
  const classement = [...parMateriau.entries()].sort((a, b) => b[1].nombre - a[1].nombre);
  console.log(`\n════ Maillages visibles par matériau (${classement.length} groupes) ════`);
  for (const [nom, { nombre, triangles }] of classement.slice(0, sommet)) {
    console.log(`${String(nombre).padStart(5)} maillages  ${Math.round(triangles).toLocaleString('fr-FR').padStart(12)} triangles   ${nom}`);
  }
}

/**
 * Découpage RÉEL du coût de rendu, hors vsync. Chaque poste est mesuré par
 * soustraction : on le coupe, on remesure. La scène vidée de ses maillages
 * donne le plancher incompressible.
 */
export async function comparer(c: ContexteMesure, echantillons = 60): Promise<Record<string, number>> {
  const { renderer, scene } = c;
  // Hors boucle d'affichage, le moteur ne fait plus avancer son compteur
  // d'images : la passe de scène et les cartes d'ombre, mises à jour une
  // fois par image, ne seraient pas redessinées et la rafale ne mesurerait
  // que le carré de post-traitement (0,84 ms constaté). On l'avance à la main.
  const image = (): void => {
    const interne = renderer as unknown as { _nodes: { nodeFrame: { update(): void; frameId: number } }; info: { frame: number } };
    interne._nodes.nodeFrame.update();
    interne.info.frame = interne._nodes.nodeFrame.frameId;
    c.rendre();
  };
  const rafale = async (prepare?: () => void, restaure?: () => void): Promise<number> => {
    prepare?.();
    // Chauffe : couper un poste fait recompiler des matériaux.
    for (let i = 0; i < 12; i++) image();
    await barriere(renderer);
    const debut = performance.now();
    for (let i = 0; i < echantillons; i++) image();
    await barriere(renderer);
    const ms = (performance.now() - debut) / echantillons;
    restaure?.();
    return ms;
  };

  // Relevé AVANT de sortir de la boucle : le compteur est remis à zéro
  // d'une image à l'autre et ne vaut plus rien en rafale.
  const appels = renderer.info.render.drawCalls;
  c.suspendre(true);
  await new Promise((r) => setTimeout(r, 150));
  try {
    const complet = await rafale();

    const ombres = c.soleil.castShadow;
    const sansOmbres = await rafale(() => { c.soleil.castShadow = false; }, () => { c.soleil.castShadow = ombres; });

    const ratio = renderer.getPixelRatio();
    const quartResolution = await rafale(() => renderer.setPixelRatio(ratio / 2), () => renderer.setPixelRatio(ratio));

    const visibles = scene.children.filter((enfant) => enfant.visible && !(enfant as THREE.Light).isLight);
    const sceneVide = await rafale(
      () => visibles.forEach((enfant) => { enfant.visible = false; }),
      () => visibles.forEach((enfant) => { enfant.visible = true; }));

    const geometrie = complet - sceneVide;
    const taille = { x: renderer.domElement.width, y: renderer.domElement.height };
    const cout = (nom: string, ms: number) =>
      `${nom.padEnd(34, ' ')} ${`${ms.toFixed(2)} ms`.padStart(9)}  ${((ms / complet) * 100).toFixed(0).padStart(3)} %`;
    console.log([
      '',
      '════ Coût réel du rendu (hors vsync) ════',
      `${taille.x} × ${taille.y} · ${appels} appels de dessin`,
      `Image complète : ${complet.toFixed(2)} ms`,
      '',
      cout('Géométrie (appels de dessin)', geometrie),
      cout('Remplissage de pixels', complet - quartResolution),
      cout('Ombres cascadées', complet - sansOmbres),
      cout('Plancher (scène vide + post)', sceneVide),
      '',
      geometrie > (complet - quartResolution) * 2
        ? '→ Goulot : la GÉOMÉTRIE. Fusionner des maillages paie, un upscaler ne sert à rien.'
        : '→ Goulot : le REMPLISSAGE. Baisser la résolution ou alléger les shaders paie.',
      '═════════════════════════════════════════',
    ].join('\n'));
    return { complet, sansOmbres, quartResolution, sceneVide, geometrie, appels };
  } finally {
    // La boucle porte la logique de jeu : la relancer quoi qu'il arrive,
    // sinon le véhicule et le HUD restent figés.
    c.suspendre(false);
  }
}
