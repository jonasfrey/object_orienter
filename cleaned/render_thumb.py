# license Jonas Immanuel Frey GPL
import bpy
import sys
import math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
obj_path = argv[0]
out_path = argv[1]

for obj in bpy.data.objects:
    bpy.data.objects.remove(obj, do_unlink=True)

bpy.ops.wm.obj_import(filepath=obj_path)

all_objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']

min_x = min_y = min_z = float('inf')
max_x = max_y = max_z = float('-inf')

for obj in all_objs:
    for v in obj.bound_box:
        wv = obj.matrix_world @ Vector(v)
        min_x, max_x = min(min_x, wv.x), max(max_x, wv.x)
        min_y, max_y = min(min_y, wv.y), max(max_y, wv.y)
        min_z, max_z = min(min_z, wv.z), max(max_z, wv.z)

if min_x == float('inf'):
    min_x = min_y = min_z = -1
    max_x = max_y = max_z = 1

cx = (min_x + max_x) / 2
cy = (min_y + max_y) / 2
cz = (min_z + max_z) / 2

size = max(max_x - min_x, max_y - min_y, max_z - min_z)
if size < 0.001:
    size = 1.0

dist = size * 2.5

bpy.ops.object.camera_add(location=(cx + dist * 0.6, cy - dist * 0.8, cz + dist * 0.5))
cam = bpy.context.object
bpy.context.scene.camera = cam

# Point camera at center using an empty
bpy.ops.object.empty_add(type='PLAIN_AXES', location=(cx, cy, cz))
target = bpy.context.object
c = cam.constraints.new(type='TRACK_TO')
c.target = target
c.track_axis = 'TRACK_NEGATIVE_Z'
c.up_axis = 'UP_Z'

bpy.ops.object.light_add(type='SUN', location=(cx + size * 2, cy, cz + size * 3))
bpy.context.object.data.energy = 3

bpy.ops.object.light_add(type='AREA', location=(cx - size, cy + size * 2, cz + size * 1.5))
bpy.context.object.data.energy = 200
bpy.context.object.data.size = size * 2

# Join all mesh objects into one (for simpler handling)
bpy.ops.object.select_all(action='DESELECT')
for obj in all_objs:
    obj.select_set(True)
if len(all_objs) > 0:
    bpy.context.view_layer.objects.active = all_objs[0]

# Render settings
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = out_path
scene.render.film_transparent = False
# EEVEE needs no cycles settings

bpy.ops.render.render(write_still=True)
print(f"Rendered: {out_path}")
