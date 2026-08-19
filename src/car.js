// Physique du véhicule : châssis rigide + 4 roues à suspension indépendante,
// modèle de pneu type "cercle d'adhérence" (Pacejka simplifié).
import * as THREE from 'three';

// Caractéristiques proches d'une sportive GT type Audi R8 (le modèle affiché
// à l'écran) : masse plus légère qu'une compacte, appui aéro plus franc,
// régime moteur plus haut. Le châssis a été calé sur une compacte tant que le
// modèle 3D restait générique ; il ne l'est plus depuis l'Audi R8.
export const SPEC = {
  mass: 1620,               // kg (R8 en ordre de marche, réservoir plein)
  wheelBase: 2.65,          // m (empattement)
  trackWidth: 1.62,         // m (voie)
  wheelRadius: 0.33,
  suspensionRest: 0.30,         // course utile de l'amortisseur
  // Raideur calculée pour que la charge statique (1/4 du véhicule) enfonce
  // le ressort d'un tiers de sa course : réglage usuel en suspension routière.
  suspensionStiffness: (1620 * 9.81 / 4) / (0.30 / 3),
  // Amortissement proche du critique (coefficient 0,45) : la caisse se pose
  // sans rebondir. c = 2·ζ·√(k·m) avec m = masse non suspendue par roue.
  suspensionDamping: 2 * 0.45 * Math.sqrt((1620 * 9.81 / 4) / (0.30 / 3) * (1620 / 4)),
  maxSteer: 0.58,               // rad (~33°)
  // Étagement inchangé : déjà calé pour ne pas démultiplier à outrance en
  // première. Le régime moteur, plus haut, en tire davantage.
  gears: [-3.3, 0, 3.4, 2.05, 1.42, 1.10, 0.90, 0.75],
  finalDrive: 3.6,
  idleRpm: 900,
  maxRpm: 8500,
  shiftUpRpm: 7800,   // passage avant la zone rouge, là où le couple retombe
  shiftDownRpm: 2800,
  brakeTorque: 6200,
  handbrakeTorque: 4600,
  maxReverseSpeed: 8.3,     // m/s, soit 30 km/h : limite d'un rapport de recul
  // Traînée aéro : ½·ρ·Cx·S. Cx plus favorable qu'une compacte (carrosserie
  // basse, diffuseur), mais le maître-couple grandit avec la largeur de voie.
  dragCoef: 0.34,
  rollResist: 12.5,
  cgHeight: 0.46,      // centre de gravité plus bas qu'une compacte
};

// Décalage vertical de l'ancrage de suspension dans le repère du véhicule.
// Le collider de caisse descend jusqu'à -0,40 : l'ancrage doit rester au-dessus
// pour que le rayon ne parte pas de l'intérieur du solide.
export const ANCHOR_Y = -0.34;

// Hauteur à laquelle poser l'origine du véhicule pour qu'il repose exactement
// sur ses suspensions au-dessus d'une chaussée située à roadY.
export function restingHeight(roadY = 0.08) {
  const staticLoad = (SPEC.mass * 9.81) / 4;
  const compression = Math.min(SPEC.suspensionRest * 0.9, staticLoad / SPEC.suspensionStiffness);
  const springLength = SPEC.suspensionRest - compression;
  return roadY + SPEC.wheelRadius + springLength - ANCHOR_Y;
}

// Couple moteur en fonction du régime (N·m).
//
// Courbe d'un V10 atmosphérique de sportive : 320 N·m de couple maximum vers
// 4 500 tr/min, plateau large jusqu'à 6 800, puis chute progressive vers le
// régime maximum à 8 500. Le bas régime reste moins creux qu'un moteur de
// compacte, sans devenir plat pour autant : un V10 atmosphérique tire mais
// ne « plaque » pas comme un diesel suralimenté, dont le pic de couple
// arrive dès 1 500 tr/min.
//
// Calé pour un 0-100 km/h autour de 5 à 6 s et une vitesse d'équilibre
// (couple roue = traînée aéro) proche de 250 à 260 km/h avec l'étagement et
// le pont en place, plutôt que sur la seule vitesse théorique en dernier
// rapport, qui dépasse très largement ce que la traînée laisse jamais
// atteindre.
export function engineTorque(rpm) {
  const r = THREE.MathUtils.clamp(rpm, 0, SPEC.maxRpm);
  if (r < 1200) return 130 + r * 0.05;
  if (r < 4500) return 190 + (r - 1200) * ((320 - 190) / (4500 - 1200));
  if (r < 6800) return 320 - Math.abs(r - 5600) * 0.008;
  return Math.max(150, 320 * 0.75 - (r - 6800) * 0.05);
}

export class Car {
  constructor(RAPIER, world, spawn) {
    this.RAPIER = RAPIER;
    this.world = world;

    const body = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y ?? 1.2, spawn.z)
      .setRotation(quatFromYaw(spawn.heading ?? 0))
      .setLinearDamping(0.05)
      .setAngularDamping(0.6)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(body);

    // Caisse : demi-dimensions, centrée sur l'origine du corps. Le rendu
    // décale la carrosserie vers le haut, la physique reste symétrique :
    // un collider décalé perturbe le tenseur d'inertie calculé par Rapier.
    const col = RAPIER.ColliderDesc.cuboid(0.84, 0.40, 2.10)
      .setMass(SPEC.mass)
      .setFriction(0.3)
      .setRestitution(0.1);
    this.collider = world.createCollider(col, this.body);

    const hw = SPEC.trackWidth / 2;
    const hl = SPEC.wheelBase / 2;
    // Ancrage des suspensions, au niveau du plancher (y = 0 dans le repère caisse).
    // Position locale : avant gauche, avant droite, arrière gauche, arrière droite.
    // Propulsion arrière, comme l'Audi R8 réelle affichée à l'écran : le
    // moteur est central-arrière, les roues avant ne font que diriger. Avec
    // la traction avant héritée d'une compacte générique, le couple du V10
    // saturait l'adhérence des deux seules roues motrices dès 50-70 km/h : le
    // régime moteur grimpait librement (plus assez de charge transmissible
    // pour le freiner) mais la vitesse stagnait, la boîte auto ne passant
    // alors jamais le rapport suivant faute d'atteindre le régime de passage.
    this.wheels = [
      { pos: new THREE.Vector3(-hw, ANCHOR_Y, hl), steer: true, drive: false, brakeBias: 0.62 },
      { pos: new THREE.Vector3(hw, ANCHOR_Y, hl), steer: true, drive: false, brakeBias: 0.62 },
      { pos: new THREE.Vector3(-hw, ANCHOR_Y, -hl), steer: false, drive: true, brakeBias: 0.38 },
      { pos: new THREE.Vector3(hw, ANCHOR_Y, -hl), steer: false, drive: true, brakeBias: 0.38 },
    ].map((w) => ({
      ...w, compression: 0, lastCompression: 0, grounded: false, wasGrounded: false,
      slip: 0, spin: 0, contactPoint: new THREE.Vector3(), suspForce: 0,
      worldPos: new THREE.Vector3(),
    }));

    // Traction avant : deux roues motrices. Fixe pour toute la vie du véhicule.
    this._driveWheels = this.wheels.filter((w) => w.drive).length;

    this.steer = 0;
    this.gear = 2;          // index dans SPEC.gears (2 = première)
    this.rpm = SPEC.idleRpm;
    this.throttle = 0;
    this.brake = 0;
    this.clutch = 1;
    this.clutchSlip = 1;   // 1 = embrayage patinant (arrêt), 0 = prise directe
    this.shiftTimer = 0;
    this.speed = 0;
    this.autoGearbox = true;
    this.onRoad = true;
    this.airborne = false;
    this.odometer = 0;
    this._up = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._q = new THREE.Quaternion();

    // Vecteurs de travail de `update`, alloués une fois pour toutes. La boucle
    // des roues tourne quatre fois par pas de physique, soixante fois par
    // seconde : les objets temporaires qu'elle créait représentaient
    // l'essentiel des 99 Ko alloués par frame mesurés avant ce chantier.
    //
    // Chacun porte un rôle unique et ne sert qu'à ce rôle. Deux valeurs
    // vivantes en même temps ne doivent jamais partager le même vecteur,
    // sinon la seconde écrase la première et le résultat change.
    this._pos = new THREE.Vector3();        // position du corps
    this._vel = new THREE.Vector3();        // vitesse linéaire
    this._rayDir = new THREE.Vector3();     // direction du rayon de suspension
    this._anchorVec = new THREE.Vector3();  // ancrage relatif au centre
    this._contactVec = new THREE.Vector3(); // contact relatif au centre
    this._suspForce = new THREE.Vector3();  // force de suspension
    this._pointVel = new THREE.Vector3();   // vitesse au point de contact
    this._crossTmp = new THREE.Vector3();   // produit vectoriel intermédiaire
    this._wFwd = new THREE.Vector3();       // axe longitudinal de la roue
    this._wRight = new THREE.Vector3();     // axe transversal de la roue
    this._tireForce = new THREE.Vector3();  // effort pneu résultant
    this._tireVec = new THREE.Vector3();    // point d'application de cet effort
    this._latTmp = new THREE.Vector3();     // composante latérale
    this._drag = new THREE.Vector3();       // traînée aérodynamique
    this._kmhFwd = new THREE.Vector3();     // axe avant, lecture de vitesse
    this._kmhVel = new THREE.Vector3();     // vitesse, lecture de vitesse
    this._euler = new THREE.Euler();        // conversions de cap
    // Structures brutes passées à Rapier, qui les lit sans les retenir.
    this._forceArg = { x: 0, y: 0, z: 0 };
    this._pointArg = { x: 0, y: 0, z: 0 };
    // Rayon de suspension réutilisé d'un pas à l'autre : ses champs `origin`
    // et `dir` sont réécrits avant chaque lancer.
    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  }

  // Renvoie un nouveau vecteur : un vecteur partagé serait écrasé dès qu'on
  // enchaîne deux lectures dans la même expression. Les appelants qui lisent
  // la position à chaque frame (caméras, HUD) passent par `lirePosition`.
  get position() {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  // Écrit la position dans un vecteur fourni : aucune allocation. À préférer
  // dans tout code appelé à chaque frame.
  lirePosition(cible) {
    const t = this.body.translation();
    return cible.set(t.x, t.y, t.z);
  }

  get quaternion() {
    const r = this.body.rotation();
    return this._q.set(r.x, r.y, r.z, r.w);
  }

  // input : { throttle, brake, steer, handbrake, shiftUp, shiftDown }
  update(dt, input) {
    // Rapier conserve les forces d'un pas sur l'autre jusqu'à resetForces().
    // Sans cette remise à zéro, chaque frame ajoute au cumul des précédentes
    // et le véhicule est propulsé vers le ciel.
    this.body.resetForces(true);
    this.body.resetTorques(true);

    const rot = this.quaternion;
    const pos = this.lirePosition(this._pos);
    this._up.set(0, 1, 0).applyQuaternion(rot);
    this._fwd.set(0, 0, 1).applyQuaternion(rot);
    this._right.set(1, 0, 0).applyQuaternion(rot);

    const lv = this.body.linvel();
    const vel = this._vel.set(lv.x, lv.y, lv.z);
    const fwdSpeed = vel.dot(this._fwd);
    this.speed = vel.length();
    // Vitesse signée dans l'axe du véhicule : négative en marche arrière.
    // C'est elle qui donne le sens de rotation des roues, et non le rapport
    // engagé, qui reste sur la marche arrière pendant une poussée en descente.
    this.fwdSpeed = fwdSpeed;
    this.odometer += Math.abs(fwdSpeed) * dt;

    // --- Direction : braquage réduit à haute vitesse (assistance variable) --
    const speedKmh = Math.abs(fwdSpeed) * 3.6;
    const steerLimit = SPEC.maxSteer * (1 - Math.min(0.68, speedKmh / 190));
    const target = input.steer * steerLimit;
    // Rappel progressif du volant, plus rapide au retour au centre.
    const rate = Math.abs(target) > Math.abs(this.steer) ? 4.2 : 7.5;
    this.steer += (target - this.steer) * Math.min(1, rate * dt);

    // --- Boîte de vitesses -------------------------------------------------
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (input.shiftUp) {
      // Depuis la marche arrière, la montée ramène en première.
      if (this.gear === 0) { this.gear = 2; this.shiftTimer = 0.25; }
      else this.shiftGear(1);
    }
    if (input.shiftDown) {
      // En première et à l'arrêt, descendre engage la marche arrière.
      if (this.gear === 2 && Math.abs(fwdSpeed) < 2) { this.gear = 0; this.shiftTimer = 0.25; }
      else this.shiftGear(-1);
    }

    const gearRatio = SPEC.gears[this.gear];
    const wheelAngularSpeed = fwdSpeed / SPEC.wheelRadius;
    if (gearRatio !== 0) {
      // Régime imposé par les roues si l'embrayage était rigide.
      const rpmRoues = Math.abs(wheelAngularSpeed * gearRatio * SPEC.finalDrive * 9.549);
      // Embrayage : à basse vitesse il patine, le moteur peut donc monter dans
      // les tours alors que la voiture est encore à l'arrêt. Sans cela, le
      // régime reste au ralenti au démarrage et le couple disponible est
      // minimal : la voiture ne peut plus repartir depuis l'arrêt.
      // 5 m/s (18 km/h) pour un accouplement complet : au-delà, l'embrayage
      // est ferme et tout le couple passe aux roues.
      const vitesseAccouplement = 5;
      const patinage = THREE.MathUtils.clamp(
        1 - Math.abs(fwdSpeed) / vitesseAccouplement, 0, 1,
      );
      // Sous patinage, le régime suit l'accélérateur ; au-delà, il suit les roues.
      const rpmLibre = SPEC.idleRpm + input.throttle * (SPEC.maxRpm - SPEC.idleRpm) * 0.62;
      const cible = Math.max(SPEC.idleRpm, rpmRoues * (1 - patinage) + rpmLibre * patinage);
      this.rpm += (cible - this.rpm) * Math.min(1, 8 * dt);
      this.clutchSlip = patinage;
    } else {
      // Au point mort le moteur suit l'accélérateur.
      const free = SPEC.idleRpm + input.throttle * (SPEC.maxRpm - SPEC.idleRpm);
      this.rpm += (free - this.rpm) * Math.min(1, 3 * dt);
      this.clutchSlip = 1;
    }
    this.rpm = THREE.MathUtils.clamp(this.rpm, SPEC.idleRpm, SPEC.maxRpm);

    if (this.autoGearbox && this.shiftTimer <= 0 && input.handbrake < 0.5) {
      // Marche arrière : engagée en maintenant le frein une fois à l'arrêt.
      if (fwdSpeed < 0.6 && input.brake > 0.5 && this.gear !== 0) {
        this.gear = 0; this.shiftTimer = 0.35;
      } else if (this.gear === 0 && input.throttle > 0.4 && input.brake < 0.1) {
        // On ne quitte la marche arrière que sur une demande explicite
        // d'accélérateur, frein relâché : sinon R serait annulée dans la frame
        // même où elle vient d'être engagée, la touche de recul faisant office
        // de frein.
        this.gear = 2; this.shiftTimer = 0.35;
      } else if (this.gear >= 2) {
        // Montée quand le régime dépasse le seuil et qu'il reste un rapport.
        if (this.rpm > SPEC.shiftUpRpm && this.gear < SPEC.gears.length - 1) {
          this.shiftGear(1);
        } else if (this.rpm < SPEC.shiftDownRpm && this.gear > 2) {
          this.shiftGear(-1);
        }
      }
    }
    // En marche arrière, la pédale de recul devient l'accélérateur et la pédale
    // d'avance devient le frein : c'est le comportement attendu au volant, sans
    // quoi la touche de recul freinerait la marche arrière qu'elle vient
    // d'engager.
    let throttle = input.throttle;
    let brake = input.brake;
    if (this.gear === 0) {
      throttle = input.brake;
      brake = input.throttle;
    }

    this.clutch = this.shiftTimer > 0 ? 0 : 1;
    this.throttle = throttle;
    this.brake = brake;

    // --- Couple aux roues --------------------------------------------------
    let engineNm = engineTorque(this.rpm) * throttle * this.clutch;
    // Un embrayage qui patine ne transmet qu'une partie du couple : c'est la
    // friction des disques qui limite, pas le moteur. Sans ce bridage, le
    // couple plein arrivait aux roues dès l'arrêt et la voiture bondissait.
    if (this.clutchSlip > 0.01) {
      engineNm *= 0.66 + (1 - this.clutchSlip) * 0.34;
    }
    // Bridage de la marche arrière : une boîte réelle est limitée par son
    // unique rapport de recul, on ne dépasse pas une trentaine de km/h.
    if (this.gear === 0 && fwdSpeed < -SPEC.maxReverseSpeed) engineNm = 0;
    const driveForceTotal = gearRatio === 0 ? 0
      : (engineNm * gearRatio * SPEC.finalDrive * 0.88) / SPEC.wheelRadius;

    // --- Suspension + adhérence, roue par roue -----------------------------
    let groundedCount = 0;
    // Le nombre de roues motrices ne change jamais : le compter à chaque pas
    // allouait un tableau intermédiaire soixante fois par seconde.
    const driveWheels = this._driveWheels;

    for (const w of this.wheels) {
      // Position monde de l'ancrage de suspension
      w.worldPos.copy(w.pos).applyQuaternion(rot).add(pos);
      const rayDir = this._rayDir.copy(this._up).negate();
      const maxDist = SPEC.suspensionRest + SPEC.wheelRadius;

      // Un seul rayon réutilisé : en construire un par roue allouait quatre
      // objets Rapier et huit littéraux par pas de physique.
      const ray = this._ray;
      ray.origin.x = w.worldPos.x;
      ray.origin.y = w.worldPos.y;
      ray.origin.z = w.worldPos.z;
      ray.dir.x = rayDir.x;
      ray.dir.y = rayDir.y;
      ray.dir.z = rayDir.z;
      // Le corps du véhicule est exclu via son handle, sinon le rayon touche
      // la caisse elle-même dès le premier mètre.
      const hit = this.world.castRay(
        ray, maxDist, true,
        undefined, undefined, undefined, this.body,
      );

      w.lastCompression = w.compression;
      if (!hit) {
        w.grounded = false;
        w.wasGrounded = false;
        w.compression = 0;
        w.suspForce = 0;
        w.slip *= 0.9;
        w.spin += (throttle * 40 - w.spin) * dt * 2; // roue qui s'emballe en l'air
        continue;
      }

      groundedCount++;
      w.grounded = true;
      const dist = hit.timeOfImpact;
      // Longueur actuelle du ressort = distance au sol moins le rayon de roue.
      // La compression se mesure par rapport à la longueur au repos, sinon
      // le ressort pousse en permanence et éjecte la voiture.
      const springLength = THREE.MathUtils.clamp(dist - SPEC.wheelRadius, 0, SPEC.suspensionRest);
      w.compression = SPEC.suspensionRest - springLength;
      w.contactPoint.copy(rayDir).multiplyScalar(dist).add(w.worldPos);

      // Force de ressort + amortisseur. Le ressort est dimensionné pour porter
      // le quart du véhicule à mi-course.
      // La vitesse de compression est bornée : au premier contact, l'écart
      // brut divisé par dt produirait une force de plusieurs méganewtons.
      // Au premier contact lastCompression vaut 0 : sans amorçage, l'écart brut
      // divisé par dt produit une pointe d'amortissement de plusieurs tonnes.
      if (!w.wasGrounded) w.lastCompression = w.compression;
      w.wasGrounded = true;
      const rawVel = (w.compression - w.lastCompression) / Math.max(dt, 1e-3);
      const springVel = THREE.MathUtils.clamp(rawVel, -3, 3);
      let f = w.compression * SPEC.suspensionStiffness + springVel * SPEC.suspensionDamping;
      // Plafond par roue : 2,5 fois la charge statique. Assez pour absorber un
      // dos-d'âne, trop peu pour catapulter la voiture.
      f = THREE.MathUtils.clamp(f, 0, (SPEC.mass * 9.81 / 4) * 2.5);
      if (!Number.isFinite(f)) f = 0;
      w.suspForce = f;

      // La force de ressort s'applique à l'ancrage de suspension sur le châssis,
      // pas au sol : appliquée au point de contact elle créerait un bras de
      // levier qui fait basculer la voiture.
      const anchorVec = this._anchorVec.copy(w.worldPos).sub(pos);
      const contactVec = this._contactVec.copy(w.contactPoint).sub(pos);
      this.applyForceAt(this._suspForce.copy(this._up).multiplyScalar(f), anchorVec);

      // Vitesse au point de contact
      const av = this.body.angvel();
      const pointVel = this._pointVel.copy(vel).add(
        this._crossTmp.set(av.x, av.y, av.z).cross(contactVec),
      );

      // Repère de la roue (avec braquage)
      const steerAngle = w.steer ? this.steer : 0;
      const wFwd = this._wFwd.copy(this._fwd).applyAxisAngle(this._up, -steerAngle).normalize();
      const wRight = this._wRight.copy(this._right).applyAxisAngle(this._up, -steerAngle).normalize();

      const vLong = pointVel.dot(wFwd);
      const vLat = pointVel.dot(wRight);

      // Charge verticale -> adhérence disponible (cercle d'adhérence)
      const load = f;
      const mu = this.onRoad ? 1.15 : 0.72;      // asphalte vs bas-côté
      const gripMax = load * mu;

      // Force latérale : proportionnelle au dérapage, saturée
      const slipAngle = Math.atan2(vLat, Math.abs(vLong) + 1.2);
      let latForce = -slipAngle * load * 5.2;
      // Frein à main : on annule l'adhérence latérale arrière -> drift
      if (input.handbrake > 0.5 && !w.drive) latForce *= 0.28;

      // Force longitudinale : traction + freinage
      let longForce = 0;
      if (w.drive && driveWheels) longForce += (driveForceTotal / driveWheels);
      const brakeInput = brake * SPEC.brakeTorque * w.brakeBias
        + (input.handbrake > 0.5 && !w.drive ? SPEC.handbrakeTorque : 0);
      if (brakeInput > 0) {
        longForce -= Math.sign(vLong) * Math.min(brakeInput / SPEC.wheelRadius, Math.abs(vLong) * SPEC.mass / Math.max(dt, 1e-3) * 0.25);
      }
      // Résistance au roulement : proportionnelle à la charge (coefficient
      // pneu/asphalte ~0,013), plus un terme visqueux léger.
      longForce -= Math.sign(vLong) * load * 0.013 + vLong * 1.6;

      // Saturation par cercle d'adhérence, la traction servie en premier.
      // Une répartition proportionnelle écraserait la force motrice dès que le
      // pneu dérive un peu : sur l'herbe, où gripMax est faible, la voiture
      // s'immobiliserait à plein gaz sans pouvoir repartir.
      const longMax = Math.min(Math.abs(longForce), gripMax);
      longForce = Math.sign(longForce) * longMax;
      // Le reste de l'adhérence, calculé sur le cercle, revient au guidage.
      const resteLat = Math.sqrt(Math.max(0, gripMax * gripMax - longMax * longMax));
      const latAvant = latForce;
      latForce = THREE.MathUtils.clamp(latForce, -resteLat, resteLat);
      w.slip = Math.min(1, Math.abs(latAvant - latForce) / Math.max(gripMax, 1));

      // Vitesse de rotation de la roue, pour l'affichage
      w.spin = vLong / SPEC.wheelRadius;

      // `wFwd` et `wRight` restent nécessaires ensuite : on compose dans des
      // vecteurs distincts plutôt que de les écraser.
      const force = this._tireForce.copy(wFwd).multiplyScalar(longForce)
        .add(this._latTmp.copy(wRight).multiplyScalar(latForce));
      // Les efforts pneu naissent au sol, mais on remonte le point
      // d'application à la hauteur du centre de gravité : le bras de levier
      // complet ferait tonneau au premier virage un peu appuyé.
      const tireVec = this._tireVec.copy(contactVec);
      tireVec.y += SPEC.cgHeight * 0.75;
      this.applyForceAt(force, tireVec);
    }

    this.airborne = groundedCount === 0;

    // --- Traînée aérodynamique + appui ------------------------------------
    if (this.speed > 0.5) {
      const drag = this._drag.copy(vel).multiplyScalar(-SPEC.dragCoef * this.speed);
      this.body.addForce({ x: drag.x, y: drag.y, z: drag.z }, true);
      // Appui aéro : plaque la voiture au sol à haute vitesse. Toujours dirigé
      // vers le bas du monde, jamais suivant l'axe de la caisse : sinon la
      // force devient propulsive dès que le véhicule s'incline ou se retourne.
      if (groundedCount > 0) {
        const df = Math.min(6000, this.speed * this.speed * 1.6);
        this.body.addForce({ x: 0, y: -df, z: 0 }, true);
      }
    }

    // Stabilisation en l'air : évite les tonneaux incontrôlables.
    if (this.airborne) {
      const av = this.body.angvel();
      this.body.applyTorqueImpulse({
        x: -av.x * 90 * dt, y: -av.y * 40 * dt, z: -av.z * 90 * dt,
      }, true);
    }
  }

  applyForceAt(force, relPoint) {
    // Une seule valeur non finie propagée dans le solveur suffit à faire
    // diverger toute la simulation : on filtre à la source.
    if (!Number.isFinite(force.x) || !Number.isFinite(force.y) || !Number.isFinite(force.z)) return;
    const t = this.body.translation();
    // Rapier lit ces deux structures pendant l'appel et n'en garde pas la
    // référence : les réutiliser est sûr et évite deux objets par appel, soit
    // huit par pas de physique.
    const f = this._forceArg;
    f.x = force.x; f.y = force.y; f.z = force.z;
    const p = this._pointArg;
    p.x = t.x + relPoint.x; p.y = t.y + relPoint.y; p.z = t.z + relPoint.z;
    this.body.addForceAtPoint(f, p, true);
  }

  // Détecte une simulation partie en vrille et remet le véhicule d'aplomb.
  checkSanity(spawn) {
    const t = this.body.translation();
    const bad = !Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)
      || Math.abs(t.x) > 12000 || Math.abs(t.z) > 12000 || t.y < -120 || t.y > 900;
    if (bad) { this.reset(spawn); return true; }
    return false;
  }

  shiftGear(dir) {
    if (this.shiftTimer > 0) return;
    const next = this.gear + dir;
    // Bornes : on ne descend pas sous la première en marche avant, et on ne
    // tombe jamais en marche arrière par un simple rétrogradage.
    if (dir < 0 && this.gear <= 2) return;
    if (dir > 0 && this.gear >= SPEC.gears.length - 1) return;
    if (next < 0 || next >= SPEC.gears.length) return;
    this.gear = next === 1 ? (dir > 0 ? 2 : 2) : next;
    this.shiftTimer = 0.25;
  }

  get gearLabel() {
    if (this.gear === 0) return 'R';
    if (this.gear === 1) return 'N';
    return String(this.gear - 1);
  }

  // Lu à chaque frame par le HUD et l'audio : sans vecteurs réutilisés, ce
  // seul accesseur allouait deux Vector3 par lecture.
  get speedKmh() {
    const lv = this.body.linvel();
    const fwd = this._kmhFwd.set(0, 0, 1).applyQuaternion(this.quaternion);
    return this._kmhVel.set(lv.x, lv.y, lv.z).dot(fwd) * 3.6;
  }

  reset(spawn) {
    this.body.setTranslation({ x: spawn.x, y: (spawn.y ?? 1.2), z: spawn.z }, true);
    this.body.setRotation(quatFromYaw(spawn.heading ?? 0), true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.gear = 2;
    this.rpm = SPEC.idleRpm;
    this.steer = 0;
    // Sans cette remise à zéro, l'amortisseur repart sur un écart énorme.
    for (const w of this.wheels) {
      w.compression = 0; w.lastCompression = 0; w.suspForce = 0;
      w.slip = 0; w.spin = 0; w.wasGrounded = false;
    }
  }

  // Remet la voiture sur ses roues sans la téléporter.
  flip() {
    const p = this.body.translation();
    this.body.setTranslation({ x: p.x, y: p.y + 1.4, z: p.z }, true);
    const yaw = this._euler.setFromQuaternion(this.quaternion, 'YXZ').y;
    this.body.setRotation(quatFromYaw(yaw), true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}

function quatFromYaw(yaw) {
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}
