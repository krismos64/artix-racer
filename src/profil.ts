/**
 * Profilage à la demande, appelé depuis la console : `__profil()`.
 *
 * L'instrumentation Babylon n'est PAS active en permanence : les requêtes de
 * temps GPU (EXT_disjoint_timer_query) coûtent elles-mêmes quelques dixièmes
 * de milliseconde par frame et fausseraient la mesure qu'on cherche. Elle est
 * donc branchée au moment de l'appel, laissée tourner le temps de l'échantillon
 * puis débranchée.
 *
 * PIÈGE MESURÉ le 4 septembre 2026 : le compteur `gpuFrameTimeCounter` ne dit
 * PAS le coût du rendu. Tant que la boucle est cadencée par le vsync, il
 * mesure l'intervalle entre deux images, soit ~12 ms quoi qu'on fasse. Scène
 * entièrement vidée de ses maillages : il affichait encore 11,64 ms. Une
 * lecture naïve conclut « le GPU est saturé » alors qu'il chôme.
 * Pour un vrai chiffre, utiliser `comparer()` : elle sort de la boucle
 * d'affichage, dessine en rafale et pose une barrière readPixels.
 */
import type { Engine, Scene } from '@babylonjs/core';
import { EngineInstrumentation, SceneInstrumentation } from '@babylonjs/core';

interface Poste {
  nom: string;
  ms: number;
  /** Part du temps de frame, quand le poste s'y rapporte. */
  part?: number;
}

function moyenne(compteur: { average: number } | undefined): number {
  const valeur = compteur?.average;
  return Number.isFinite(valeur) ? (valeur as number) : Number.NaN;
}

function ligne(poste: Poste): string {
  const ms = Number.isFinite(poste.ms) ? `${poste.ms.toFixed(2)} ms` : 'non mesuré';
  const part = poste.part !== undefined && Number.isFinite(poste.part)
    ? `  ${(poste.part * 100).toFixed(0)} %`
    : '';
  return `${poste.nom.padEnd(30, ' ')} ${ms.padStart(12, ' ')}${part}`;
}

/**
 * Mesure pendant `secondes` puis imprime le découpage dans la console.
 * Renvoie les chiffres bruts pour un usage programmatique.
 */
export async function profiler(
  engine: Engine,
  scene: Scene,
  secondes = 5,
): Promise<Record<string, number>> {
  const instrumentationScene = new SceneInstrumentation(scene);
  instrumentationScene.captureFrameTime = true;
  instrumentationScene.captureRenderTime = true;
  instrumentationScene.captureInterFrameTime = true;
  instrumentationScene.captureActiveMeshesEvaluationTime = true;
  instrumentationScene.captureRenderTargetsRenderTime = true;
  instrumentationScene.captureParticlesRenderTime = true;
  instrumentationScene.capturePhysicsTime = true;
  instrumentationScene.captureCameraRenderTime = true;

  const instrumentationMoteur = new EngineInstrumentation(engine);
  instrumentationMoteur.captureGPUFrameTime = true;

  console.log(`[profil] mesure en cours pendant ${secondes} s, roulez normalement…`);
  await new Promise((r) => setTimeout(r, secondes * 1000));

  const frame = moyenne(instrumentationScene.frameTimeCounter);
  const rendu = moyenne(instrumentationScene.renderTimeCounter);
  const interFrame = moyenne(instrumentationScene.interFrameTimeCounter);
  const evaluation = moyenne(instrumentationScene.activeMeshesEvaluationTimeCounter);
  const cibles = moyenne(instrumentationScene.renderTargetsRenderTimeCounter);
  const particules = moyenne(instrumentationScene.particlesRenderTimeCounter);
  const physique = moyenne(instrumentationScene.physicsTimeCounter);
  const camera = moyenne(instrumentationScene.cameraRenderTimeCounter);
  // Le compteur GPU est en nanosecondes.
  // Plafonné par le vsync, gardé pour information seulement (voir en tête).
  const gpu = moyenne(instrumentationMoteur.gpuFrameTimeCounter) / 1e6;

  const maillages = scene.getActiveMeshes().length;
  const indices = scene.getActiveIndices();
  const fps = engine.getFps();
  const echelle = engine.getHardwareScalingLevel();
  const taille = `${engine.getRenderWidth()} × ${engine.getRenderHeight()}`;

  const budget = frame > 0 ? frame : Number.NaN;
  const postes: Poste[] = [
    { nom: 'Temps de frame (CPU total)', ms: frame },
    { nom: '  dont rendu', ms: rendu, part: rendu / budget },
    { nom: '    dont évaluation maillages', ms: evaluation, part: evaluation / budget },
    { nom: '    dont cibles de rendu (ombres, pré-passe)', ms: cibles, part: cibles / budget },
    { nom: '    dont caméra (post-process)', ms: camera, part: camera / budget },
    { nom: '    dont particules', ms: particules, part: particules / budget },
    { nom: '  dont physique', ms: physique, part: physique / budget },
    { nom: 'Hors frame (logique de jeu, HUD)', ms: interFrame },
    { nom: 'Temps GPU (plafonné vsync)', ms: gpu },
  ];

  console.log(
    [
      '',
      '════ Profil Artix Racer ════',
      `${Math.round(fps)} fps · ${taille} · échelle ${echelle.toFixed(2)}×`,
      `${maillages} maillages actifs · ${indices.toLocaleString('fr-FR')} indices`,
      '',
      ...postes.map(ligne),
      '',
      '(Le temps GPU est plafonné par le vsync : ~12 ms même scène vide.',
      ' Il ne dit rien du coût réel. Lancer __comparer() pour le vrai découpage.)',
      '════════════════════════════',
    ].join('\n'),
  );

  instrumentationScene.dispose();
  instrumentationMoteur.dispose();

  return { fps, frame, rendu, interFrame, evaluation, cibles, particules, physique, camera, gpu, maillages, indices, echelle };
}

/**
 * Répartition des appels de dessin par matériau : le coût dominant étant le
 * nombre de maillages soumis, savoir LESQUELS sont nombreux dit où porter
 * l'effort de fusion.
 */
export function repartition(scene: Scene, sommet = 20): void {
  const parMateriau = new Map<string, { nombre: number; indices: number }>();
  for (const maillage of scene.getActiveMeshes().data.slice(0, scene.getActiveMeshes().length)) {
    if (!maillage) continue;
    const nom = maillage.material?.name ?? '(sans matériau)';
    const entree = parMateriau.get(nom) ?? { nombre: 0, indices: 0 };
    entree.nombre++;
    entree.indices += maillage.getTotalIndices();
    parMateriau.set(nom, entree);
  }
  const classement = [...parMateriau.entries()].sort((a, b) => b[1].nombre - a[1].nombre);
  console.log(`\n════ Appels de dessin par matériau (${classement.length} matériaux) ════`);
  for (const [nom, { nombre, indices }] of classement.slice(0, sommet)) {
    console.log(`${String(nombre).padStart(5)} maillages  ${indices.toLocaleString('fr-FR').padStart(12)} indices   ${nom}`);
  }
  const reste = classement.slice(sommet).reduce((somme, [, e]) => somme + e.nombre, 0);
  if (reste) console.log(`${String(reste).padStart(5)} maillages   (${classement.length - sommet} autres matériaux)`);
}

/**
 * Découpage RÉEL du coût de rendu, hors vsync.
 *
 * Méthode : on arrête la boucle d'affichage, on dessine `echantillons` images
 * en rafale et on chronomètre le mur. WebGL étant asynchrone, un `readPixels`
 * 1 × 1 sert de barrière : le CPU y attend que toutes les commandes soient
 * exécutées, ce qui rend le chiffre comparable d'une configuration à l'autre.
 *
 * Chaque poste est mesuré par soustraction (on le coupe, on remesure). La
 * scène vidée de ses maillages donne le plancher incompressible.
 */
export async function comparer(
  engine: Engine,
  scene: Scene,
  echantillons = 60,
): Promise<Record<string, number>> {
  const moteur = engine as unknown as {
    _gl: WebGL2RenderingContext;
    _activeRenderLoops: (() => void)[];
  };
  const gl = moteur._gl;
  const pixel = new Uint8Array(4);
  // Les boucles d'origine portent la logique de jeu : les relancer telles
  // quelles à la fin, sinon le véhicule et le HUD restent figés.
  const boucles = [...moteur._activeRenderLoops];

  const rafale = async (prepare?: () => void, restaure?: () => void): Promise<number> => {
    prepare?.();
    for (let i = 0; i < 12; i++) scene.render(); // chauffe (compilation, caches)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const debut = performance.now();
    for (let i = 0; i < echantillons; i++) scene.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const ms = (performance.now() - debut) / echantillons;
    restaure?.();
    return ms;
  };

  engine.stopRenderLoop();
  await new Promise((r) => setTimeout(r, 150));

  const maillagesActifs = scene.getActiveMeshes().length;
  const complet = await rafale();

  const soleil = scene.lights.find((l) => l.getShadowGenerator?.());
  const carteOmbre = soleil?.getShadowGenerator()?.getShadowMap() ?? null;
  const listeOmbre = carteOmbre?.renderList ? [...carteOmbre.renderList] : null;
  const sansOmbres = carteOmbre && listeOmbre
    ? await rafale(() => { carteOmbre.renderList = []; }, () => { carteOmbre.renderList = listeOmbre; })
    : complet;

  const camera = scene.activeCamera!;
  const gestionnaire = scene.postProcessRenderPipelineManager;
  const pipeline = gestionnaire.supportedPipelines.find((p) => p.name === 'arcade-pipeline');
  const sansPost = pipeline
    ? await rafale(
        () => gestionnaire.detachCamerasFromRenderPipeline(pipeline.name, camera),
        () => gestionnaire.attachCamerasToRenderPipeline(pipeline.name, camera))
    : complet;

  const echelle = engine.getHardwareScalingLevel();
  const quartResolution = await rafale(
    () => engine.setHardwareScalingLevel(echelle * 2),
    () => engine.setHardwareScalingLevel(echelle));

  const visibles = scene.meshes.filter((m) => m.isEnabled() && m.isVisible);
  const sceneVide = await rafale(
    () => visibles.forEach((m) => { m.isVisible = false; }),
    () => visibles.forEach((m) => { m.isVisible = true; }));

  for (const boucle of boucles) engine.runRenderLoop(boucle);

  const geometrie = complet - sceneVide;
  const cout = (nom: string, ms: number) =>
    `${nom.padEnd(34, ' ')} ${`${ms.toFixed(2)} ms`.padStart(9)}  ${((ms / complet) * 100).toFixed(0).padStart(3)} %`;

  console.log(
    [
      '',
      '════ Coût réel du rendu (hors vsync) ════',
      `${engine.getRenderWidth()} × ${engine.getRenderHeight()} · ${maillagesActifs} maillages actifs`,
      `Image complète : ${complet.toFixed(2)} ms`,
      '',
      cout('Géométrie (appels de dessin)', geometrie),
      cout('Remplissage de pixels', complet - quartResolution),
      cout('Post-process', complet - sansPost),
      cout('Ombres cascadées', complet - sansOmbres),
      cout('Plancher (scène vide)', sceneVide),
      '',
      geometrie > (complet - quartResolution) * 2
        ? '→ Goulot : la GÉOMÉTRIE. Fusionner des maillages paie, un upscaler ne sert à rien.'
        : '→ Goulot : le REMPLISSAGE. Baisser la résolution ou alléger les shaders paie.',
      '═════════════════════════════════════════',
    ].join('\n'),
  );

  return { complet, sansOmbres, sansPost, quartResolution, sceneVide, geometrie, maillagesActifs };
}
