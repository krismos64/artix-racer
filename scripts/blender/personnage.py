# Personnage animé du jeu, converti en glTF par Blender.
#
#   Blender --background --disable-autoexec "Animated Human.blend" \
#       --python scripts/blender/personnage.py -- <dossier des textures> [aperçu.png]
#
# Source : « Animated Human » de Quaternius (CC0), téléchargé sur
# OpenGameArt. Le fichier d'origine est un .blend : on y garde le maillage
# (1 578 polygones), son squelette de 41 os et six animations (repos,
# marche, course, saut, coup, chute), exportés en un seul .glb. Les tenues
# sont de petites palettes de couleurs, copiées à côté du modèle : le jeu
# en change pour varier les passants.
import math
import os
import shutil
import sys

import bpy

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SORTIE = os.path.join(RACINE, 'public', 'models', 'personnages')
arguments = sys.argv[sys.argv.index('--') + 1:]
TEXTURES = arguments[0]
APERCU = arguments[1] if len(arguments) > 1 else None
GARDEES = ['Idle', 'Walk', 'Run', 'Jump', 'Punch', 'Death']

os.makedirs(SORTIE, exist_ok=True)
# Tenues : une image de palette par variante.
tenues = sorted(f for f in os.listdir(TEXTURES) if f.startswith('Clothed') and f.endswith('.png'))
for tenue in tenues:
    shutil.copy(os.path.join(TEXTURES, tenue), os.path.join(SORTIE, tenue.replace('Clothed', 'tenue-').lower()))
# Le .blend cherche sa texture à côté de lui : on la rattache.
for image in bpy.data.images:
    if image.name.endswith('.png'):
        image.filepath = os.path.join(TEXTURES, 'ClothedLightSkin.png')
        image.reload()

for action in list(bpy.data.actions):
    if action.name not in GARDEES:
        bpy.data.actions.remove(action)

armature = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
maillage = next(o for o in bpy.data.objects if o.type == 'MESH')
print('ECHELLE', tuple(round(v, 3) for v in armature.scale), 'ROTATION', tuple(round(v, 2) for v in armature.rotation_euler))

if APERCU:
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.cycles.device = 'CPU'
    scene.render.resolution_x, scene.render.resolution_y = 1200, 520
    for o in list(bpy.data.objects):
        if o.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(o)
    monde = bpy.data.worlds.new('ciel')
    monde.use_nodes = True
    monde.node_tree.nodes['Background'].inputs[0].default_value = (.7, .78, .9, 1)
    scene.world = monde
    soleil = bpy.data.objects.new('soleil', bpy.data.lights.new('soleil', 'SUN'))
    soleil.data.energy = 3
    soleil.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(soleil)
    # Trois poses côte à côte : repos, marche, course.
    if not armature.animation_data:
        armature.animation_data_create()
    copies = []
    for rang, (nom, image) in enumerate((('Idle', 0), ('Walk', 8), ('Run', 5))):
        armature.animation_data.action = bpy.data.actions[nom]
        scene.frame_set(image)
        graphe = bpy.context.evaluated_depsgraph_get()
        fige = bpy.data.meshes.new_from_object(maillage.evaluated_get(graphe))
        copie = bpy.data.objects.new(f'pose-{nom}', fige)
        copie.matrix_world = maillage.matrix_world.copy()
        copie.location.x += (rang - 1) * 2.2
        scene.collection.objects.link(copie)
        copies.append(copie)
    maillage.hide_render = True
    haut = max(max((c.matrix_world @ v.co).z for v in c.data.vertices) for c in copies)
    print('HAUTEUR', round(haut, 3))
    camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 7.2
    camera.location = (2.5, -8, haut * .55)
    camera.rotation_euler = (math.radians(88), 0, math.radians(17))
    scene.collection.objects.link(camera)
    scene.camera = camera
    scene.render.filepath = APERCU
    bpy.ops.render.render(write_still=True)
    for copie in copies:
        bpy.data.objects.remove(copie)
    maillage.hide_render = False

armature.animation_data.action = bpy.data.actions['Idle']
bpy.context.scene.frame_set(0)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(SORTIE, 'humain.glb'), export_format='GLB',
    export_animations=True, export_animation_mode='ACTIONS', export_skins=True,
    export_yup=True, export_apply=False,
)
print('ACTIONS', [a.name for a in bpy.data.actions], 'TENUES', tenues)
