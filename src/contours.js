// Contours de silhouette, pour un rendu proche du dessin animé.
//
// Le trait noir souligne la géométrie réelle sans toucher aux couleurs : les
// teintes de façade relevées sur photographie restent intactes. C'est ce qui
// distingue cette passe d'un cel shading, lequel quantifie l'éclairage et
// écrase justement ces nuances mesurées.
//
// Détection sur profondeur ET normales. La profondeur seule manque les arêtes
// entre deux surfaces jointives (l'angle d'un mur, le pli d'une toiture) : de
// part et d'autre de l'arête, la distance à la caméra est presque identique.
// Les normales, elles, y basculent franchement. À l'inverse les normales
// seules manquent les silhouettes devant un fond de même orientation.
//
// Les deux textures sont empruntées à la passe d'occlusion ambiante, qui les
// calcule déjà : la détection ne coûte donc aucun rendu de géométrie
// supplémentaire, seulement le filtrage en espace écran.
import * as THREE from 'three';

export const ShaderContours = {
  name: 'ShaderContours',
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    resolution: { value: new THREE.Vector2() },
    cameraNear: { value: 0.1 },
    cameraFar: { value: 3000 },
    // Sensibilité de chaque détecteur, réglée par balayage en mesurant la part
    // de pixels sombres de l'image (26,9 % sans contours sur la vue de
    // l'église). En dessous de ces valeurs le détecteur s'emballe : à 0,0006
    // sur la profondeur, l'image passait à 67,6 % de noir.
    seuilProfondeur: { value: 0.015 },
    seuilNormale: { value: 0.15 },
    epaisseur: { value: 1.2 },
    couleur: { value: new THREE.Color(0x1a1a1e) },
    intensite: { value: 1.0 },
    // Ombrage en paliers. `celPaliers` à 0 le désactive entièrement, ce qui
    // laisse les contours seuls.
    celPaliers: { value: 0.0 },
    // Dosage : à 1, l'aplat remplace la nuance continue ; en dessous, les deux
    // se mélangent et les teintes de façade relevées sur photo restent
    // partiellement lisibles.
    celDose: { value: 0.75 },
    // Renfort de saturation, pour compenser l'aplatissement.
    celSaturation: { value: 1.25 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    #include <packing>
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform sampler2D tNormal;
    uniform vec2 resolution;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float seuilProfondeur;
    uniform float seuilNormale;
    uniform float epaisseur;
    uniform vec3 couleur;
    uniform float intensite;
    uniform float celPaliers;
    uniform float celDose;
    uniform float celSaturation;

    // Profondeur linéaire en unités de scène : la valeur brute du tampon est
    // très resserrée près de la caméra, comparer deux échantillons bruts
    // donnerait des contours partout au premier plan et nulle part au loin.
    float profondeur(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      float vz = perspectiveDepthToViewZ(d, cameraNear, cameraFar);
      return viewZToOrthographicDepth(vz, cameraNear, cameraFar);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 texel = epaisseur / resolution;

      // Quatre voisins en croix. Un noyau de Sobel complet sur huit voisins
      // double le coût pour un trait à peine plus propre à cette résolution.
      vec2 o1 = vec2(texel.x, 0.0);
      vec2 o2 = vec2(0.0, texel.y);

      float dC = profondeur(vUv);
      float dL = profondeur(vUv - o1);
      float dR = profondeur(vUv + o1);
      float dB = profondeur(vUv - o2);
      float dT = profondeur(vUv + o2);

      // Détection par courbure, et non par écart brut. Sur une surface plane
      // vue de biais (une chaussée en enfilade, un toit rasant), la profondeur
      // varie fortement d'un pixel à l'autre sans qu'il y ait la moindre
      // arête : un seuil sur l'écart brut noircissait alors toute l'image.
      //
      // La dérivée seconde, elle, s'annule sur un plan quelle que soit son
      // inclinaison, et ne réagit qu'aux vraies ruptures de profondeur. On
      // compare donc le centre à la moyenne de ses voisins opposés.
      float courbure = abs(dL + dR - 2.0 * dC) + abs(dB + dT - 2.0 * dC);
      // Rapportée à la distance : un décrochement de 20 cm se voit au premier
      // plan, pas à 200 m.
      float bordD = step(seuilProfondeur * dC, courbure);

      // Écart d'orientation : le produit scalaire tombe dès que deux faces ne
      // regardent plus dans la même direction.
      //
      // La cible de normales de la passe d'occlusion est en HalfFloatType :
      // les composantes y sont DEJA dans [-1, 1]. Les décoder avec le
      // 2 * x - 1 d'usage (qui vaut pour une cible en octets non signés) les
      // projetait hors domaine, et le détecteur répondait alors de la même
      // façon quel que soit le seuil, de 0,05 à 1,5.
      vec3 nC = normalize(texture2D(tNormal, vUv).xyz);
      vec3 nL = normalize(texture2D(tNormal, vUv - o1).xyz);
      vec3 nR = normalize(texture2D(tNormal, vUv + o1).xyz);
      vec3 nB = normalize(texture2D(tNormal, vUv - o2).xyz);
      vec3 nT = normalize(texture2D(tNormal, vUv + o2).xyz);
      float ecartN = (1.0 - dot(nC, nL)) + (1.0 - dot(nC, nR))
                   + (1.0 - dot(nC, nB)) + (1.0 - dot(nC, nT));
      float bordN = step(seuilNormale, ecartN);

      // Le ciel n'a ni géométrie ni normale : sans cette borne, l'horizon se
      // retrouve cerné d'un trait qui suit le dôme, et la quantification y
      // trace des bandes.
      float dansScene = step(dC, 0.999);

      vec3 teinte = base.rgb;

      // Ombrage en paliers. Le shader ne reçoit que l'image déjà éclairée, pas
      // le produit lumière-normale : on quantifie donc la LUMINANCE et on
      // remet la teinte d'origine par-dessus. Quantifier les trois canaux
      // séparément décalerait les couleurs vers les primaires et détruirait
      // les teintes de façade mesurées sur photographie.
      if (celPaliers > 0.5) {
        float lum = dot(teinte, vec3(0.2126, 0.7152, 0.0722));
        // Paliers resserrés dans les valeurs sombres, où l'œil discrimine le
        // plus : une répartition linéaire écrase les ombres en un seul aplat.
        float q = floor(pow(max(lum, 0.0), 0.75) * celPaliers + 0.5) / celPaliers;
        float lumQ = pow(q, 1.3333);
        // Rapport plutôt que différence : une façade sombre et une claire
        // gardent leur écart relatif.
        vec3 aplat = teinte * (lumQ / max(lum, 0.001));

        // Le ciel est exclu de la quantification. C'est un dégradé très
        // progressif sur toute la hauteur de l'image : le moindre palier y
        // trace une bande nette qui suit la courbure du dôme, artefact bien
        // plus visible que le gain d'aplat sur une surface sans détail.
        float dose = celDose * dansScene;

        // Les surfaces déjà très sombres sont préservées : quantifier une
        // chaussée à 0,08 de luminance la ramenait au premier palier et lui
        // faisait perdre marquage et nuances d'usure.
        dose *= smoothstep(0.06, 0.16, lum);

        teinte = mix(teinte, aplat, dose);
        // Saturation renforcée autour de la luminance conservée.
        float l2 = dot(teinte, vec3(0.2126, 0.7152, 0.0722));
        teinte = clamp(mix(vec3(l2), teinte, celSaturation), 0.0, 1.0);
      }

      float trait = max(bordD, bordN) * dansScene * intensite;
      gl_FragColor = vec4(mix(teinte, couleur, trait), base.a);
    }
  `,
};
