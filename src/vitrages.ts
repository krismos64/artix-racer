// Faux intérieurs derrière les vitrages (« interior mapping »).
//
// Chaque baie est un simple quadrilatère plaqué sur le mur. Le shader lance,
// pour chaque pixel de vitre, un rayon depuis l'œil dans une pièce virtuelle
// (une boîte derrière la baie) et peint la paroi touchée : fond, côtés,
// plafond, plancher. Quand on passe devant la façade, l'intérieur glisse
// derrière le cadre comme une vraie pièce. Aucune géométrie ni texture en
// plus, aucun appel de dessin : tout se calcule dans le matériau existant.
//
// Le repère de la baie se déduit des DÉRIVÉES à l'écran de la position et
// des UV : on obtient les vecteurs « un pas de u » et « un pas de v » en
// mètres, donc la largeur et la hauteur réelles de la baie, sans attribut
// supplémentaire ni hypothèse sur l'orientation du mur.
import type * as THREE from 'three/webgpu';
import {
  Fn, attribute, cameraPosition, dFdx, dFdy, dot, float, fract, materialColor, materialEmissive,
  max, min, mix, normalWorld, positionWorld, select, sin, smoothstep, step, texture, uv, vec2, vec3,
} from 'three/tsl';

// Profondeur de la pièce, en mètres. Plus courte, le fond colle à la vitre
// et la parallaxe disparaît ; plus longue, on ne voit que les côtés.
const PROFONDEUR = 2.6;

export function poserFauxInterieurs(materiau: THREE.MeshStandardMaterial): void {
  const carteNuit = materiau.emissiveMap;
  if (!carteNuit) return;

  const piece: any = Fn(() => {
    // Second jeu d'UV : quatre cases de 0,25 de large dans l'atlas de nuit
    // [noire, française allumée, noire, PVC allumée]. u local de 0 à 1 sur
    // la largeur de la baie, v de 0 (appui) à 1 (linteau).
    const uv1: any = uv(1);
    const u4: any = uv1.x.mul(4);
    const uL: any = fract(u4);
    const vL: any = uv1.y;

    // Vecteurs d'un pas de u et d'un pas de v, en mètres (repère cotangent).
    const P: any = positionWorld;
    const dp1: any = dFdx(P), dp2: any = dFdy(P);
    const du1: any = dFdx(u4), du2: any = dFdy(u4);
    const dv1: any = dFdx(vL), dv2: any = dFdy(vL);
    const det: any = du1.mul(dv2).sub(du2.mul(dv1));
    const inverse: any = float(1).div(select(det.abs().lessThan(1e-9), float(1e-9), det));
    const T: any = dp1.mul(dv2).sub(dp2.mul(dv1)).mul(inverse);
    const B: any = dp2.mul(du1).sub(dp1.mul(du2)).mul(inverse);

    // Rayon de l'œil vers le pixel, exprimé en unités de baie (u, v) et en
    // mètres pour la profondeur. La normale regarde l'observateur : son
    // opposé entre dans la pièce.
    const V: any = P.sub(cameraPosition).normalize();
    const vx: any = dot(V, T).div(max(dot(T, T), 1e-6));
    const vy: any = dot(V, B).div(max(dot(B, B), 1e-6));
    const vz: any = max(dot(V, normalWorld.negate()), .04);
    const sx: any = select(vx.abs().lessThan(1e-5), float(1e-5), vx);
    const sy: any = select(vy.abs().lessThan(1e-5), float(1e-5), vy);

    // Distance jusqu'à chaque paire de parois ; la plus courte l'emporte.
    const tx: any = select(sx.greaterThan(0), float(1).sub(uL), uL.negate()).div(sx);
    const ty: any = select(sy.greaterThan(0), float(1).sub(vL), vL.negate()).div(sy);
    const tz: any = float(PROFONDEUR).div(vz);
    const t: any = min(tz, min(tx, ty));
    const hu: any = uL.add(sx.mul(t));
    const hv: any = vL.add(sy.mul(t));
    const hz: any = vz.mul(t).div(PROFONDEUR);

    // Une teinte de murs par baie, tirée de sa position dans le monde.
    const origine: any = P.sub(T.mul(uL)).sub(B.mul(vL));
    const alea: any = fract(sin(dot(origine.xz.add(origine.y), vec2(12.9898, 78.233))).mul(43758.5453));
    const murs: any = mix(vec3(.78, .70, .58), vec3(.62, .68, .72), alea);

    const fond: any = tz.lessThanEqual(min(tx, ty));
    const horizontal: any = ty.lessThan(tx);
    // Mur du fond : plinthe sombre en bas, un cadre accroché au tiers haut.
    const cadre: any = step(.3, hu).mul(step(hu, .62)).mul(step(.5, hv)).mul(step(hv, .78));
    const murFond: any = murs.mul(mix(float(.55), float(1), smoothstep(.04, .09, hv)))
      .mul(mix(float(1), float(.45), cadre));
    const plafond: any = vec3(.9, .88, .84);
    const plancher: any = vec3(.36, .25, .17);
    const cote: any = murs.mul(.8);
    const paroi: any = select(fond, murFond,
      select(horizontal, select(sy.greaterThan(0), plafond, plancher), cote));
    // La lumière entre par la baie : les parois s'assombrissent vers le fond.
    return paroi.mul(mix(float(1), float(.42), hz));
  })();

  // Masque des vitres : la carte d'émission de nuit porte les carreaux en
  // clair et les bois en noir. On lit toujours la case ALLUMÉE du bon modèle
  // de fenêtre, que la pièce soit éclairée ou non.
  const uvNuit: any = uv(1);
  const moderne: any = step(.5, uvNuit.x);
  const uMasque: any = moderne.mul(.5).add(.25).add(fract(uvNuit.x.mul(4)).mul(.25));
  const carreaux: any = texture(carteNuit, vec2(uMasque, uvNuit.y));
  const vitre: any = smoothstep(.12, .3, dot(carreaux.rgb, vec3(.333)));

  const m = materiau as THREE.MeshStandardMaterial & Record<string, any>;
  // De jour, la pièce est sombre et la vitre garde son reflet de ciel et son
  // voilage peints, posés par-dessus.
  m.colorNode = mix(materialColor, piece.mul(.5).add(materialColor.rgb.mul(.5)), vitre);
  // De nuit, les pièces allumées laissent voir leurs murs : l'émission des
  // carreaux est modulée par la pièce. `emiCouleur` vaut noir sur une baie
  // éteinte, qui n'émet donc rien.
  m.emissiveNode = materialEmissive.mul(attribute('emiCouleur', 'vec3'))
    .mul(mix(vec3(1), piece.mul(1.7), vitre.mul(.75)));
}
