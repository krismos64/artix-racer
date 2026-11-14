# Arbres d'Artix, générés dans Blender.
#
#   /Applications/Blender.app/Contents/MacOS/Blender --background \
#       --python scripts/blender/arbres.py -- [dossier des rendus de contrôle]
#
# Cinq essences (platane taillé en tête de chat, feuillu libre, peuplier,
# conifère, saule), chacune en deux maillages : l'ÉCORCE (fût, charpentières, rameaux,
# en tubes effilés) et le FEUILLAGE (cartes portant une grappe de feuilles
# détourée, posées au bout des rameaux). Le jeu instancie ces deux maillages
# 3 500 fois : chaque arbre doit donc rester sous 500 triangles.
#
# Chaque modèle mesure 1 de haut, pied à l'origine : le jeu le met à
# l'échelle de l'arbre. Sortie en JSON (public/models/arbres/), repère du
# jeu : Y vers le haut. Blender travaille en Z vers le haut, la conversion
# se fait à l'export.
#
# Le feuillage porte deux astuces de jeu vidéo :
#   - normales SPHÉRIQUES (depuis le centre du houppier) : les cartes
#     s'éclairent comme un volume, pas comme des plans isolés ;
#   - couleur de sommet = occlusion : sombre au cœur du houppier, claire en
#     périphérie, ce qui donne sa profondeur à la couronne sans une ombre.
import json
import math
import os
import random
import sys

import bpy
from mathutils import Vector

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SORTIE = os.path.join(RACINE, 'public', 'models', 'arbres')
FEUILLAGE = os.path.join(RACINE, 'public', 'textures', 'facades', 'feuillage.png')
arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
RENDUS = arguments[0] if arguments else None

# Par essence. Longueurs en fraction de la hauteur de l'arbre.
#   fut        : hauteur où le tronc se divise
#   fleche     : hauteur où s'arrête l'axe central (0 = pas de flèche)
#   rayon      : rayon du tronc au pied, puis au sommet du fût
#   branches   : nombre de charpentières, plage de hauteurs d'insertion
#   elevation  : angle au-dessus de l'horizontale, en degrés
#   longueur   : longueur des charpentières
#   courbure   : > 0 la branche se redresse, < 0 elle retombe
#   rameaux    : rameaux par charpentière
#   houppier   : centre (hauteur) et demi-axes (rayon, demi-hauteur)
#   cartes     : nombre de cartes de feuillage et leur taille
ESSENCES = {
    # Platane d'alignement taillé en tête de chat : fût dégagé, charpentières
    # courtes et trapues, couronne large et plate.
    'platane': dict(fut=.54, fleche=0, rayon=(.046, .034), branches=6, insertion=(.47, .56),
                    elevation=(22, 40), longueur=(.24, .32), courbure=.5, rameaux=2,
                    houppier=(.76, .45, .2), cartes=96, taille=.27, graine=11),
    # Feuillu libre : tronc plus court, flèche centrale, houppier arrondi.
    'feuillu': dict(fut=.36, fleche=.74, rayon=(.040, .026), branches=6, insertion=(.30, .56),
                    elevation=(35, 60), longueur=(.26, .36), courbure=.35, rameaux=2,
                    houppier=(.66, .34, .31), cartes=100, taille=.245, graine=23),
    # Peuplier noir : fuseau étroit, branches plaquées contre l'axe.
    'peuplier': dict(fut=.14, fleche=.95, rayon=(.030, .022), branches=11, insertion=(.14, .86),
                     elevation=(62, 76), longueur=(.14, .20), courbure=.6, rameaux=1,
                     houppier=(.57, .12, .43), cartes=110, taille=.15, graine=37),
    # Conifère d'ornement (cèdre, sapin) : flèche droite, étages de branches
    # presque horizontales qui raccourcissent vers la cime.
    'conifere': dict(fut=.12, fleche=.97, rayon=(.036, .026), branches=13, insertion=(.14, .9),
                     elevation=(-8, 12), longueur=(.26, .34), courbure=-.25, rameaux=1,
                     houppier=(.55, .30, .44), cartes=104, taille=.2, graine=53, cone=True),
    # Saule : tronc court, couronne étalée dont les extrémités retombent.
    'saule': dict(fut=.30, fleche=0, rayon=(.050, .036), branches=7, insertion=(.25, .34),
                  elevation=(28, 50), longueur=(.34, .44), courbure=-.9, rameaux=2,
                  houppier=(.52, .45, .28), cartes=104, taille=.26, graine=41),
}


class Maillage:
    """Sommets, normales, UV, couleurs et triangles d'un maillage, en Z haut."""

    def __init__(self):
        self.pos, self.nrm, self.uv, self.col, self.idx = [], [], [], [], []

    def sommet(self, p, n, uv, c):
        self.pos.append(Vector(p))
        self.nrm.append(Vector(n).normalized())
        self.uv.append(uv)
        self.col.append(c)
        return len(self.pos) - 1

    def export(self):
        # Blender (x, y, z haut) vers le jeu (x, y haut, z) : (x, z, -y).
        plat = lambda vecteurs: [round(v, 4) for p in vecteurs for v in (p.x, p.z, -p.y)]
        return {
            'pos': plat(self.pos),
            'nrm': plat(self.nrm),
            'uv': [round(v, 4) for uv in self.uv for v in uv],
            'col': [round(c, 3) for c in self.col for _ in range(3)],
            'idx': self.idx,
        }


def tube(maillage, points, rayons, cotes, clarte):
    """Tube effilé le long d'une ligne brisée. Le repère de chaque anneau est
    transporté de proche en proche, sinon le tube vrille aux changements de
    direction. UV : u autour du tube, v le long (la texture d'écorce se
    répète tous les 0,16 de hauteur d'arbre, soit environ 1,3 m)."""
    normale = Vector((1, 0, 0))
    longueur = 0
    anneaux = []
    for i, p in enumerate(points):
        tangente = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        normale = (normale - tangente * normale.dot(tangente))
        if normale.length < 1e-4:
            normale = tangente.orthogonal()
        normale.normalize()
        binormale = tangente.cross(normale)
        if i:
            longueur += (p - points[i - 1]).length
        anneau = []
        for k in range(cotes + 1):
            a = k / cotes * math.tau
            radial = normale * math.cos(a) + binormale * math.sin(a)
            anneau.append(maillage.sommet(p + radial * rayons[i], radial,
                                          (k / cotes * (2 if rayons[0] > .03 else 1), longueur / .16), clarte[i]))
        anneaux.append(anneau)
    for a, b in zip(anneaux, anneaux[1:]):
        for k in range(cotes):
            maillage.idx += [a[k], a[k + 1], b[k + 1], a[k], b[k + 1], b[k]]


def branche(alea, depart, direction, longueur, courbure, segments):
    """Ligne brisée d'une branche : elle part dans `direction` et s'infléchit
    vers le haut (courbure positive) ou retombe (négative)."""
    points = [depart.copy()]
    d = direction.normalized()
    for i in range(segments):
        d = (d + Vector((0, 0, courbure * .45 / segments))
             + Vector((alea.uniform(-.1, .1), alea.uniform(-.1, .1), 0))).normalized()
        points.append(points[-1] + d * longueur / segments)
    return points


def construire(nom, e, lointain=False):
    """`lointain` : version à une soixantaine de triangles pour les arbres
    éloignés. Même silhouette (même enveloppe de houppier), mais un tronc à
    quatre côtés, des charpentières sans rameaux et seize grandes cartes."""
    alea = random.Random(e['graine'])
    cotes_tronc, cotes_branche = (4, 3) if lointain else (6, 4)
    nb_cartes = 16 if lointain else e['cartes']
    taille_carte = e['taille'] * (2.5 if lointain else 1)
    ecorce, feuilles = Maillage(), Maillage()
    centre = Vector((0, 0, e['houppier'][0]))
    rayon_h, demi_h = e['houppier'][1], e['houppier'][2]

    def dans_houppier(p):
        """0 au centre du houppier, 1 sur son enveloppe."""
        d = p - centre
        return math.sqrt((d.x / rayon_h) ** 2 + (d.y / rayon_h) ** 2 + (d.z / demi_h) ** 2)

    # ---- Tronc : pied évasé, léger dévers, puis flèche éventuelle ----------
    sommet = max(e['fut'], e['fleche'])
    niveaux = [0, .035, .12, e['fut'] * .6, e['fut']] + ([e['fleche'] * .8 + e['fut'] * .2, e['fleche']] if e['fleche'] else [])
    devers = Vector((alea.uniform(-.02, .02), alea.uniform(-.02, .02), 0))
    axe, rayons = [], []
    for z in niveaux:
        t = z / sommet
        axe.append(Vector((devers.x * t * t, devers.y * t * t, z)))
        r = e['rayon'][0] + (e['rayon'][1] - e['rayon'][0]) * min(1, z / e['fut'])
        if z > e['fut']:
            r = e['rayon'][1] * max(.18, 1 - (z - e['fut']) / (sommet - e['fut'] + 1e-6))
        # Empattement : le pied s'élargit de 45 % au ras du sol.
        rayons.append(r * (1.45 if z == 0 else 1.12 if z < .05 else 1))
    # L'écorce s'assombrit sous le houppier, qui lui fait de l'ombre.
    tube(ecorce, axe, rayons, cotes_tronc, [1 - .35 * min(1, z / e['fut']) for z in niveaux])

    def sur_axe(z):
        for a, b in zip(axe, axe[1:]):
            if a.z <= z <= b.z:
                return a.lerp(b, (z - a.z) / (b.z - a.z + 1e-9))
        return axe[-1].copy()

    # ---- Charpentières et rameaux ----------------------------------------
    ancrages = []
    n = e['branches']
    for i in range(n):
        azimut = i / n * math.tau + alea.uniform(-.35, .35) + i * 2.4 * (1 if e['fleche'] else 0)
        z = e['insertion'][0] + (e['insertion'][1] - e['insertion'][0]) * ((i * 7) % n) / max(1, n - 1)
        depart = sur_axe(z)
        elevation = math.radians(alea.uniform(*e['elevation']))
        direction = Vector((math.cos(azimut) * math.cos(elevation), math.sin(azimut) * math.cos(elevation), math.sin(elevation)))
        retrait = .82 if e.get('cone') else .35
        longueur = alea.uniform(*e['longueur']) * (1 - retrait * max(0, (z - e['fut']) / (sommet - e['fut'] + 1e-6)) if e['fleche'] else 1)
        ligne = branche(alea, depart, direction, longueur, e['courbure'], 3)
        gros = e['rayon'][1] * (.62 if e['fleche'] else .7)
        # De loin, une charpentière sur deux suffit à la silhouette.
        if not lointain or i % 2 == 0:
            tube(ecorce, ligne if not lointain else [ligne[0], ligne[3]],
                 [gros, gros * .7, gros * .42, gros * .18] if not lointain else [gros, gros * .2],
                 cotes_branche, [.72, .66, .6, .56] if not lointain else [.72, .56])
        ancrages += [ligne[2], ligne[3]]
        for k in range(0 if lointain else e['rameaux']):
            t = .45 + .4 * k / max(1, e['rameaux'] - 1) if e['rameaux'] > 1 else .6
            base = ligne[1].lerp(ligne[3], t)
            cote = 1 if k % 2 else -1
            lateral = Vector((-direction.y, direction.x, 0)).normalized() * cote
            sens = (direction.normalized() * .55 + lateral * .7 + Vector((0, 0, .35 if e['courbure'] > 0 else -.25))).normalized()
            rameau = branche(alea, base, sens, longueur * alea.uniform(.4, .55), e['courbure'] * .8, 2)
            tube(ecorce, rameau, [gros * .34, gros * .22, gros * .1], 3, [.6, .56, .52])
            ancrages += [rameau[1], rameau[2]]
    if e['fleche']:
        ancrages.append(axe[-1])

    # ---- Cartes de feuillage ----------------------------------------------
    # D'abord au bout de chaque rameau, puis des cartes de remplissage tirées
    # dans l'enveloppe du houppier pour boucher les jours.
    # De loin, les cartes ne suivent plus les rameaux : seize grandes
    # cartes réparties dans l'enveloppe.
    positions = [] if lointain else list(ancrages)
    while len(positions) < nb_cartes:
        u, v = alea.uniform(0, math.tau), alea.uniform(-1, 1)
        s = math.sqrt(1 - v * v)
        # Plus de cartes en périphérie qu'au cœur : c'est la silhouette qui se voit.
        r = alea.uniform(.55, 1.02)
        if e.get('cone'):
            # Enveloppe en cône : large en bas, pointue à la cime.
            haut = (v + 1) / 2
            positions.append(centre + Vector((math.cos(u) * rayon_h * r * (1 - haut) ** .8,
                                              math.sin(u) * rayon_h * r * (1 - haut) ** .8, v * demi_h)))
            continue
        positions.append(centre + Vector((math.cos(u) * s * rayon_h * r, math.sin(u) * s * rayon_h * r, v * demi_h * r)))
    for p in positions[:nb_cartes]:
        dehors = (p - centre)
        dehors = Vector((dehors.x / rayon_h, dehors.y / rayon_h, dehors.z / demi_h))
        if dehors.length < 1e-3:
            dehors = Vector((0, 0, 1))
        dehors.normalize()
        # Orientation de la carte : tournée vers l'extérieur, avec du désordre.
        face = (dehors * .7 + Vector((alea.uniform(-1, 1), alea.uniform(-1, 1), alea.uniform(-.4, .9))) * .55).normalized()
        droite = face.orthogonal().normalized()
        angle = alea.uniform(0, math.tau)
        haut = face.cross(droite)
        a = droite * math.cos(angle) + haut * math.sin(angle)
        b = face.cross(a)
        taille = taille_carte * alea.uniform(.78, 1.2) * .5
        if e.get('cone'):
            # Cartes plus petites vers la cime : la pointe reste fine.
            taille *= 1.2 - .8 * min(1, max(0, (p.z - (centre.z - demi_h)) / (2 * demi_h)))
        # Saule : les cartes du bord s'allongent vers le bas, en rideau.
        if nom == 'saule' and dans_houppier(p) > .75:
            b = (b * .4 + Vector((0, 0, -1))).normalized()
            a = b.orthogonal().normalized()
            p = p + Vector((0, 0, -taille * .5))
        # Normale d'éclairage : sphérique, relevée vers le ciel.
        # Très relevée : une feuille laisse passer la lumière, un houppier à
        # contre-jour reste vert. Avec une normale plus radiale, la moitié
        # de la couronne opposée au soleil sortait presque noire en jeu.
        normale = (dehors * .55 + Vector((0, 0, .75))).normalized()
        # Occlusion : 0,5 au cœur, 1 en périphérie ; le dessous reste sombre.
        clarte = .5 + .5 * min(1, dans_houppier(p)) ** 1.5
        clarte *= .78 + .22 * min(1, max(0, (p.z - (centre.z - demi_h)) / (2 * demi_h)))
        miroir = alea.random() < .5
        coins = [(-1, -1, 0, 0), (1, -1, 1, 0), (1, 1, 1, 1), (-1, 1, 0, 1)]
        rangs = [feuilles.sommet(p + a * (x * taille) + b * (y * taille), normale,
                                 (1 - u if miroir else u, v), clarte) for x, y, u, v in coins]
        feuilles.idx += [rangs[0], rangs[1], rangs[2], rangs[0], rangs[2], rangs[3]]
    return ecorce, feuilles


def objet_blender(nom, maillage, materiau):
    mesh = bpy.data.meshes.new(nom)
    faces = [maillage.idx[i:i + 3] for i in range(0, len(maillage.idx), 3)]
    mesh.from_pydata([tuple(p) for p in maillage.pos], [], faces)
    uv = mesh.uv_layers.new(name='uv')
    couleur = mesh.color_attributes.new(name='clarte', type='FLOAT_COLOR', domain='CORNER')
    for boucle in mesh.loops:
        uv.data[boucle.index].uv = maillage.uv[boucle.vertex_index]
        c = maillage.col[boucle.vertex_index]
        couleur.data[boucle.index].color = (c, c, c, 1)
    mesh.update()
    objet = bpy.data.objects.new(nom, mesh)
    objet.data.materials.append(materiau)
    bpy.context.scene.collection.objects.link(objet)
    return objet


def materiaux():
    """Matériaux du rendu de contrôle : écorce brune, feuillage détouré."""
    ecorce = bpy.data.materials.new('ecorce')
    ecorce.use_nodes = True
    noeuds = ecorce.node_tree.nodes
    clarte = noeuds.new('ShaderNodeVertexColor')
    clarte.layer_name = 'clarte'
    melange = noeuds.new('ShaderNodeMixRGB')
    melange.blend_type = 'MULTIPLY'
    melange.inputs[0].default_value = 1
    melange.inputs[1].default_value = (.36, .30, .24, 1)
    ecorce.node_tree.links.new(clarte.outputs['Color'], melange.inputs[2])
    ecorce.node_tree.links.new(melange.outputs[0], noeuds['Principled BSDF'].inputs['Base Color'])

    feuille = bpy.data.materials.new('feuillage')
    feuille.use_nodes = True
    noeuds = feuille.node_tree.nodes
    image = noeuds.new('ShaderNodeTexImage')
    image.image = bpy.data.images.load(FEUILLAGE)
    clarte = noeuds.new('ShaderNodeVertexColor')
    clarte.layer_name = 'clarte'
    teinte = noeuds.new('ShaderNodeMixRGB')
    teinte.blend_type = 'MULTIPLY'
    teinte.inputs[0].default_value = 1
    teinte.inputs[1].default_value = (.30, .52, .22, 1)
    ombre = noeuds.new('ShaderNodeMixRGB')
    ombre.blend_type = 'MULTIPLY'
    ombre.inputs[0].default_value = 1
    liens = feuille.node_tree.links
    liens.new(image.outputs['Color'], teinte.inputs[2])
    liens.new(teinte.outputs[0], ombre.inputs[1])
    liens.new(clarte.outputs['Color'], ombre.inputs[2])
    bsdf = noeuds['Principled BSDF']
    liens.new(ombre.outputs[0], bsdf.inputs['Base Color'])
    liens.new(image.outputs['Alpha'], bsdf.inputs['Alpha'])
    return ecorce, feuille


def rendre(chemin):
    """Planche de contrôle : les quatre essences côte à côte, vues de côté."""
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 1500, 820
    scene.render.film_transparent = False
    monde = bpy.data.worlds.new('ciel')
    monde.use_nodes = True
    monde.node_tree.nodes['Background'].inputs[0].default_value = (.62, .74, .9, 1)
    monde.node_tree.nodes['Background'].inputs[1].default_value = .9
    scene.world = monde
    soleil = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN'))
    soleil.data.energy = 3.2
    soleil.rotation_euler = (math.radians(48), 0, math.radians(35))
    scene.collection.objects.link(soleil)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    sol = bpy.context.object
    herbe = bpy.data.materials.new('sol')
    herbe.diffuse_color = (.3, .36, .24, 1)
    sol.data.materials.append(herbe)
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 6.2
    camera.location = (2.5, -6, 2.6)
    camera.rotation_euler = (math.radians(68), 0, 0)
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = chemin
    bpy.ops.render.render(write_still=True)


def principal():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(SORTIE, exist_ok=True)
    mat_ecorce, mat_feuille = materiaux()
    for rang, (nom, e) in enumerate(ESSENCES.items()):
        ecorce, feuilles = construire(nom, e)
        ecorce_loin, feuilles_loin = construire(nom, e, lointain=True)
        with open(os.path.join(SORTIE, f'{nom}.json'), 'w') as fichier:
            json.dump({'ecorce': ecorce.export(), 'feuilles': feuilles.export(),
                       'lointain': {'ecorce': ecorce_loin.export(), 'feuilles': feuilles_loin.export()}},
                      fichier, separators=(',', ':'))
        print(f'{nom} : {(len(ecorce.idx) + len(feuilles.idx)) // 3} triangles, '
              f'lointain {(len(ecorce_loin.idx) + len(feuilles_loin.idx)) // 3}')
        if RENDUS:
            # Rangée du devant : modèles complets ; derrière : versions lointaines.
            for recul, lot in ((0, (ecorce, feuilles)), (2.2, (ecorce_loin, feuilles_loin))):
                for maillage, materiau in zip(lot, (mat_ecorce, mat_feuille)):
                    objet = objet_blender(f'{nom}-{materiau.name}-{recul}', maillage, materiau)
                    objet.location = (rang * 1.25, recul, 0)
    if RENDUS:
        os.makedirs(RENDUS, exist_ok=True)
        rendre(os.path.join(RENDUS, 'arbres.png'))


principal()
