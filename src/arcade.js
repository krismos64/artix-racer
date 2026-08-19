// Grade couleur arcade, pour un rendu de jeu de course plutôt qu'une
// reconstitution photoréaliste : contraste et saturation poussés, vignettage
// doux aux bords, grain fin. Le principe est proche d'un LUT de jeu vidéo,
// sans jamais toucher à la géométrie ni aux données mesurées sur photo :
// c'est le grade qui change, pas les teintes de façade elles-mêmes.
//
// Placé juste avant `OutputPass` : le mappage de tons ACES et l'exposition du
// renderer doivent s'appliquer APRÈS ce grade, sinon les couleurs poussées
// saturent mal et l'image blanchit dans les hautes lumières.
import * as THREE from 'three';

export const ShaderArcade = {
  name: 'ShaderArcade',
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2() },
    // Contraste en S : creuse les ombres, remonte les hautes lumières, sans
    // écraser les teintes moyennes où vit l'essentiel de la scène. Réglé sur
    // une image déjà tone-mappée : une valeur proche de celle d'avant
    // écraserait encore la chaussée et le feuillage sombre en noir plein.
    contraste: { value: 0.08 },
    // Renfort de saturation global, plus marqué que le rendu naturaliste.
    saturation: { value: 1.15 },
    // Vignettage : bord de champ assombri, pas noirci. `rayon` fixe où il
    // commence à mordre, `force` son intensité maximale au coin de l'écran.
    vignetteRayon: { value: 0.68 },
    vignetteForce: { value: 0.22 },
    // Grain fin, indépendant de la luminance de l'image : un vrai bruit de
    // capteur s'accroche aux ombres, mais ici l'effet visé est stylistique et
    // non un défaut de capture, donc l'amplitude reste constante.
    grain: { value: 0.025 },
    temps: { value: 0.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float contraste;
    uniform float saturation;
    uniform float vignetteRayon;
    uniform float vignetteForce;
    uniform float grain;
    uniform float temps;

    // Bruit sans dépendance externe, dérivé une seule fois par pixel et par
    // image : le grain scintille d'une frame à l'autre plutôt que de rester
    // collé à l'écran, ce qui se lirait comme un défaut d'affichage statique.
    float bruit(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233)) + temps) * 43758.5453);
    }

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;

      // Contraste en S autour du gris moyen : une courbe classique de grade
      // colorimétrique, plus douce qu'une simple mise à l'échelle qui
      // écraserait uniformément ombres et lumières.
      c = clamp((c - 0.5) * (1.0 + contraste) + 0.5, 0.0, 1.0);

      // Saturation : écart à la luminance perçue, amplifié.
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = clamp(mix(vec3(lum), c, saturation), 0.0, 1.0);

      // Vignettage : distance au centre normalisée par le format d'écran,
      // pour que le cercle reste un cercle quel que soit le ratio largeur/
      // hauteur plutôt qu'une ellipse.
      vec2 centre = vUv - 0.5;
      centre.x *= resolution.x / resolution.y;
      float d = length(centre);
      float vig = 1.0 - vignetteForce * smoothstep(vignetteRayon, 1.0, d);
      c *= vig;

      // Grain, centré sur zéro pour ne pas assombrir ni éclaircir l'image en
      // moyenne.
      c += (bruit(vUv * resolution) - 0.5) * grain;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};
