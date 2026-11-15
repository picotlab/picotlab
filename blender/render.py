"""Picotlab -> Blender studio render.

    lab/hookloop/blender/render.sh <in.obj|in.py> <out.png> [options]        (safe wrapper: nice, 300 s cap, memory check)
    /Applications/Blender.app/Contents/MacOS/Blender -b --python lab/hookloop/blender/render.py -- <in.obj|in.py> <out.png> [options]

SAFETY: a Metal GPU render once starved WindowServer and kernel-panicked this Mac. Defaults are CPU-only,
6 threads, a small preview, no fuzz. The GPU is opt-in (--gpu) and should only be used on an idle machine.

Input is a Picotlab export: the OBJ text ("Copy OBJ") or the Blender script ("Copy Blender script"),
saved to a file. The .py is executed as-is, so only pass scripts Picotlab produced. Units are metres (true size).

Flat pieces (scarf, cowl, blanket): `node export.js "<prompt>" samples/x` writes x.obj (the app's draped cloth, metres, with UVs)
and x.json (props, colour sequence, palette). Pass x.obj; the x.json next to it is picked up automatically and gives the rod / box /
head form, a stitch-scale yarn texture (one stitch = one UV unit across, one colour-sequence period down) and the stripes.

Options
  --final                   final quality: 1600x1200, 96 samples, fuzz 1 (still CPU unless --gpu)
  --gpu                     render Cycles on the Metal GPU (opt-in; can freeze the desktop)
  --threads N               CPU threads (default 6, half of this Mac's 12 cores)
  --engine cycles|eevee     render engine (default cycles; EEVEE always uses the GPU)
  --samples N               Cycles samples (default 24 preview / 96 final, adaptive + denoised)
  --res WxH                 image size (default 800x600 preview / 1600x1200 final)
  --color #rrggbb           yarn colour (default: the .py's material colour, else Denim #5b7fc4)
  --stitches auto|on|off    rebuild each stitch as two twisted yarn legs from the mesh topology (default auto = for round pieces)
  --fuzz F                  fibre halo density 0..1 (default 0 preview / 1 final; capped at 60k fibres)
  --form auto|on|off        head form under a hat (default auto = when the piece is a hat opening downward)
  --view three-quarter|front|side|top   camera angle (default three-quarter)
  --blend out.blend         also save the scene for opening in the Blender UI
"""
import bpy, bmesh, sys, os, re, math, time, json
from mathutils import Vector, Matrix

T0 = time.time()
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(argv) < 2:
    print(__doc__); sys.exit(1)
src, out = os.path.abspath(argv[0]), os.path.abspath(argv[1])
opts = {'engine': 'cycles', 'samples': None, 'res': None, 'color': None, 'stitches': 'auto', 'fuzz': None,
        'form': 'auto', 'view': 'three-quarter', 'blend': None, 'threads': '6'}
flags = {'final': False, 'gpu': False}
i = 2
while i < len(argv):
    k = argv[i].lstrip('-')
    if k in flags:
        flags[k] = True; i += 1; continue
    if k not in opts or i + 1 >= len(argv):
        sys.exit(f'unknown or incomplete option: {argv[i]}')
    opts[k] = argv[i + 1]; i += 2
final = flags['final']
opts['samples'] = opts['samples'] or ('96' if final else '24')
opts['res'] = opts['res'] or ('1600x1200' if final else '800x600')
opts['fuzz'] = opts['fuzz'] or '0'

def log(*a): print('[picotlab]', *a, flush=True)

def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(h):
    h = h.lstrip('#'); return tuple(srgb_to_lin(int(h[j:j + 2], 16) / 255) for j in (0, 2, 4))

# ---------------------------------------------------------------- import
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
text = open(src, encoding='utf-8').read()
_mp = os.path.splitext(src)[0] + '.json'
meta = json.load(open(_mp)) if os.path.exists(_mp) else None   # flat-piece sidecar written by export.js
thick = None
if src.lower().endswith('.py'):
    exec(compile(text, src, 'exec'), {'__name__': '__main__', '__file__': src})
    ob = bpy.data.objects.get('Picotlab') or bpy.data.objects.get('Hookloop') or next(o for o in scene.objects if o.type == 'MESH')
    for m in ob.modifiers:
        if m.type == 'SOLIDIFY': thick = m.thickness
    if not opts['color'] and ob.data.materials:
        mt = ob.data.materials[0]
        b = mt.node_tree.nodes.get('Principled BSDF') if mt.use_nodes else None
        if b: opts['color'] = tuple(b.inputs['Base Color'].default_value)[:3]
    for m in list(ob.modifiers): ob.modifiers.remove(m)
else:
    # Picotlab writes (old exports say Hookloop) Blender axes (x, -z, y) already: import without axis conversion
    bpy.ops.wm.obj_import(filepath=src, forward_axis='Y', up_axis='Z')
    ob = next(o for o in scene.objects if o.type == 'MESH')
ob.name = 'Picotlab'
me = ob.data
for p in me.polygons: p.use_smooth = True
col = opts['color'] if isinstance(opts['color'], tuple) else hex_lin(opts['color'] or '#5b7fc4')
log(f'imported {os.path.basename(src)}: {len(me.vertices)} verts, {len(me.polygons)} faces')

# stitch type per round from the pattern comment, e.g. "# R16–R18 (rib): ..." (rounds are 1-based)
round_st = {}
for a, b, st in re.findall(r'^#\s*R(\d+)(?:\s*[–-]\s*R(\d+))?\s*\((\w+)\)', text, re.M):
    for r in range(int(a), int(b or a) + 1): round_st[r - 1] = st.lower()

# ---------------------------------------------------------------- topology: rounds and rings
M = ob.matrix_world
P = [M @ v.co for v in me.vertices]
N = len(P)
adj = [set() for _ in range(N)]
for e in me.edges:
    a, b = e.vertices; adj[a].add(b); adj[b].add(a)
lvl = [-1] * N; lvl[0] = 0; q = [0]
for v in q:
    for w in adj[v]:
        if lvl[w] < 0: lvl[w] = lvl[v] + 1; q.append(w)
same = [[w for w in adj[v] if lvl[w] == lvl[v]] for v in range(N)]
ringy = sum(1 for v in range(1, N) if len(same[v]) == 2) / max(1, N - 1)
structured = lvl.count(-1) == 0 and ringy > 0.9 and len(adj[0]) >= 4
log(f'round structure: {"yes" if structured else "no"} ({ringy:.0%} of vertices sit on a 2-neighbour ring)')

bb_min = Vector((min(p.x for p in P), min(p.y for p in P), min(p.z for p in P)))
bb_max = Vector((max(p.x for p in P), max(p.y for p in P), max(p.z for p in P)))
ring_len = [(P[v] - P[w]).length for v in range(N) for w in same[v]]
ring_len.sort()
w_med = ring_len[len(ring_len) // 2] if ring_len else 0.007
if meta: thick = meta['thick_m']
if thick is None: thick = 0.41 * w_med  # yarn ~ 0.34 stitch width, x1.2 like the page
log(f'stitch width ~{w_med * 1000:.1f} mm, yarn ~{thick * 1000:.1f} mm, size {((bb_max - bb_min) * 100).to_tuple(1)} cm')

# outward normals (hat: away from the axis below the crown)
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
NRM = [M.to_3x3() @ bm.verts[i].normal for i in range(N)]
bm.free()
ctr = Vector(((bb_min.x + bb_max.x) / 2, (bb_min.y + bb_max.y) / 2, (bb_min.z + bb_max.z) / 2))
out_dot = sum(NRM[i].dot(P[i] - ctr) for i in range(N))
if meta:   # cloth sheet: make the face normals point up (the app's winding faces down), so solidify thickens downward
    top = max(range(N), key=lambda i: P[i].z)
    if NRM[top].z < 0:
        NRM = [-n for n in NRM]; me.flip_normals()
elif out_dot < 0:
    NRM = [-n for n in NRM]
    me.flip_normals()

is_hat = structured and P[0].z > bb_max.z - 3 * thick and min(P[v].z for v in range(N) if lvl[v] == max(lvl)) < ctr.z
want_form = (opts['form'] == 'on' or (opts['form'] == 'auto' and is_hat)) and not meta
want_st = (opts['stitches'] == 'on' or (opts['stitches'] == 'auto' and structured)) and not meta

# ---------------------------------------------------------------- materials
def principled(name, color, rough, sheen=0.0, sss=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough
    for k, v in (('Sheen Weight', sheen), ('Sheen Roughness', 0.35), ('Subsurface Weight', sss)):
        if k in b.inputs: b.inputs[k].default_value = v
    if 'Subsurface Radius' in b.inputs: b.inputs['Subsurface Radius'].default_value = (1.0, 0.6, 0.4)
    if 'Subsurface Scale' in b.inputs: b.inputs['Subsurface Scale'].default_value = thick * 0.6
    return m, b

def yarn_material(name, color, ply_scale):
    """Twisted-ply yarn: diagonal bands along the strand's UV + fibre noise, as colour variation and bump."""
    m, b = principled(name, color, 0.78, sheen=0.9, sss=0.25)
    nt, L = m.node_tree, m.node_tree.links
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (ply_scale, 1.0, 1.0)
    L.new(tc.outputs['UV'], mp.inputs['Vector'])
    wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'DIAGONAL'
    wave.inputs['Scale'].default_value = 1.0; wave.inputs['Distortion'].default_value = 1.5
    wave.inputs['Detail'].default_value = 3.0
    L.new(mp.outputs['Vector'], wave.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 900.0
    noise.inputs['Detail'].default_value = 8.0
    L.new(tc.outputs['Object'], noise.inputs['Vector'])
    mix = nt.nodes.new('ShaderNodeMath'); mix.operation = 'MULTIPLY_ADD'
    L.new(wave.outputs['Fac'], mix.inputs[0]); mix.inputs[1].default_value = 0.7; L.new(noise.outputs['Fac'], mix.inputs[2])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.55
    bump.inputs['Distance'].default_value = thick * 0.15
    L.new(mix.outputs['Value'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*[c * 0.62 for c in color], 1); ramp.color_ramp.elements[1].color = (*color, 1)
    ramp.color_ramp.elements[0].position = 0.25; ramp.color_ramp.elements[1].position = 1.0
    L.new(mix.outputs['Value'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], b.inputs['Base Color'])
    return m

def stitch_image(meta):
    """One colour-sequence period as a texture: 64 x 32 px per stitch, V-shaped stitches like the page's texCanvas.
    Rows are stacked bottom-up in the colour order; u = stitches, v = periods in the OBJ's UVs."""
    import numpy as np
    per, seq, pal = meta['period'], meta['seq'], meta['palette']
    rib = meta['stitch'] == 'rib'; cw, rh = (128 if rib else 64), 32
    tall = 2.3 if rib else {'sc': 1.0, 'hdc': 1.6, 'dc': 2.0, 'tc': 2.5}.get(meta['stitch'], 1.0)
    H, Wd = rh * per, cw
    yy, xx = np.mgrid[0:H, 0:Wd].astype(float)          # canvas coords, y down
    img = np.zeros((H, Wd, 4)); img[..., 3] = 1
    def hexc(h): h = h.lstrip('#'); return np.array([int(h[j:j + 2], 16) / 255 for j in (0, 2, 4)])
    def segd(x0, y0, x1, y1, X, Y):
        dx, dy = x1 - x0, y1 - y0; t = np.clip(((X - x0) * dx + (Y - y0) * dy) / (dx * dx + dy * dy), 0, 1)
        return np.hypot(X - (x0 + t * dx), Y - (y0 + t * dy))
    tot = sum(n for _, n in seq)
    def letter(i):
        k = i % tot
        for L, n in seq:
            if k < n: return L
            k -= n
    for r in range(per):
        c = hexc(pal['ABCD'.index(letter(r))]); y0 = (per - 1 - r) * rh
        sl = slice(y0, y0 + rh); X, Y = xx[sl], yy[sl] - y0
        img[sl, :, :3] = c * 0.52
        for k in range(2 if rib else 1):
            x0 = k * 64; fp = rib and k == 0
            v_top, v_mid = 5, rh * (0.38 if tall > 1.5 else 0.55)
            hi = 1.12 if fp else (0.78 if rib else 1.0)
            d = np.minimum(segd(x0 + 10, v_top, x0 + 32, v_mid, X, Y), segd(x0 + 32, v_mid, x0 + 54, v_top, X, Y))
            m = np.clip(7.5 - d, 0, 1)[..., None]       # leg stroke 15 px wide, antialiased
            col = np.minimum(1, c * hi) * (1 - 0.18 * np.clip(d / 7.5, 0, 1)[..., None])  # darker toward the edge = rounded
            img[sl, :, :3] = img[sl, :, :3] * (1 - m) + col * m
            if tall > 1.2:
                d2 = segd(x0 + 32, v_mid, x0 + 30, rh - 3, X, Y); m2 = np.clip((8 if fp else 5) - d2, 0, 1)[..., None]
                img[sl, :, :3] = img[sl, :, :3] * (1 - m2) + np.minimum(1, c * hi) * m2
    img = img[::-1]                                       # Blender images are bottom-up
    im = bpy.data.images.new('Stitches', Wd, H, alpha=False); im.pixels.foreach_set(img.reshape(-1).astype('float32'))
    im.pack(); return im

def cloth_material(name, meta):
    """Stitch-texture yarn for flat pieces: the period image (colour + stripes) drives colour and a bump; fibre noise on top."""
    m, b = principled(name, (0.5, 0.5, 0.5), 0.9, sheen=0.9, sss=0.15)
    nt, L = m.node_tree, m.node_tree.links
    uv = nt.nodes.new('ShaderNodeUVMap')
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = stitch_image(meta); tex.extension = 'REPEAT'; tex.interpolation = 'Cubic'
    L.new(uv.outputs['UV'], tex.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 600.0; noise.inputs['Detail'].default_value = 8.0
    tc = nt.nodes.new('ShaderNodeTexCoord'); L.new(tc.outputs['Object'], noise.inputs['Vector'])
    mixc = nt.nodes.new('ShaderNodeMix'); mixc.data_type = 'RGBA'; mixc.blend_type = 'MULTIPLY'; mixc.inputs[0].default_value = 0.35
    L.new(tex.outputs['Color'], mixc.inputs[6]); L.new(noise.outputs['Color'], mixc.inputs[7]); L.new(mixc.outputs[2], b.inputs['Base Color'])
    bw = nt.nodes.new('ShaderNodeRGBToBW'); L.new(tex.outputs['Color'], bw.inputs['Color'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.9; bump.inputs['Distance'].default_value = thick * 0.35
    L.new(bw.outputs['Val'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

yarn = cloth_material('Yarn', meta) if meta else yarn_material('Yarn', col, 1.0 / (thick * 2.2))
me.materials.clear()
if want_st:
    skin_mat, _ = principled('Yarn under-layer', tuple(c * 0.55 for c in col), 0.95, sheen=0.5)
    me.materials.append(skin_mat)
else:
    me.materials.append(yarn)
sol = ob.modifiers.new('Yarn thickness', 'SOLIDIFY'); sol.thickness = thick * (0.8 if want_st else 1.0); sol.offset = -1
sub = ob.modifiers.new('Subdivision', 'SUBSURF'); sub.levels = sub.render_levels = 1 if want_st else 2
if meta: sub.levels = sub.render_levels = 1   # the cloth grid is already ~1 cm; keeps the stitch UVs crisp

# ---------------------------------------------------------------- stitches: two yarn legs per stitch (the page's V)
def tube_mesh(name, strands, radius, ring=7):
    """strands: list of point lists. Returns a mesh of round tubes with UV u = length along strand, v = around."""
    verts, faces, uvs = [], [], []
    for pts in strands:
        n = len(pts); base = len(verts); s_acc = [0.0]
        for j in range(1, n): s_acc.append(s_acc[-1] + (pts[j] - pts[j - 1]).length)
        for j in range(n):
            tng = (pts[min(j + 1, n - 1)] - pts[max(j - 1, 0)]).normalized()
            ax = tng.orthogonal().normalized(); ay = tng.cross(ax)
            taper = 0.55 + 0.45 * math.sin(math.pi * (0.08 + 0.84 * j / (n - 1)))
            for k in range(ring):
                a = 2 * math.pi * k / ring
                verts.append(pts[j] + (ax * math.cos(a) + ay * math.sin(a)) * radius * taper)
        for j in range(n - 1):
            for k in range(ring):
                a0, a1 = base + j * ring + k, base + j * ring + (k + 1) % ring
                faces.append((a0, a1, a1 + ring, a0 + ring))
                uvs.append([(s_acc[j], k / ring), (s_acc[j], (k + 1) / ring), (s_acc[j + 1], (k + 1) / ring), (s_acc[j + 1], k / ring)])
        faces.append(tuple(base + k for k in reversed(range(ring)))); uvs.append([(0, 0)] * ring)
        e = base + (n - 1) * ring
        faces.append(tuple(e + k for k in range(ring))); uvs.append([(s_acc[-1], 0)] * ring)
    m = bpy.data.meshes.new(name); m.from_pydata(verts, [], faces); m.update()
    uvl = m.uv_layers.new(name='UVMap')
    li = 0
    for f, fu in zip(m.polygons, uvs):
        for c in fu: uvl.data[li].uv = c; li += 1
    for p in m.polygons: p.use_smooth = True
    return m

stitch_ob = None
if want_st:
    rings = {}
    for v in range(1, N): rings.setdefault(lvl[v], []).append(v)
    order = {}
    for r, vs in rings.items():  # walk each round's ring to get stitch order (k parity for ribbing)
        start = min(vs); seq = [start]; prev = None; cur = start
        while True:
            nx = [w for w in same[cur] if w != prev]
            if not nx or nx[0] == start: break
            prev, cur = cur, nx[0]; seq.append(cur)
            if len(seq) > len(vs): break
        for k, v in enumerate(seq): order[v] = k
    strands = []
    for v in range(1, N):
        if len(same[v]) != 2: continue
        r = lvl[v] - 1; st = round_st.get(r, 'sc')
        a, b = same[v]
        t = P[a] - P[b]; w = t.length / 2; t.normalize()
        par = [p for p in adj[v] if lvl[p] == lvl[v] - 1]
        base = sum((P[p] for p in par), Vector()) / len(par)
        u = P[v] - base; h = u.length; u = (u - t * u.dot(t)).normalized()
        n = t.cross(u).normalized()
        if n.dot(NRM[v]) < 0: t, n = -t, -n
        lift = ((-0.2 if order.get(v, 0) % 2 else 0.55) if st == 'rib' else 0.25) * thick
        p0 = P[v] - u * (0.42 * h) + n * lift
        tall = {'sc': 1.0, 'hdc': 1.08, 'dc': 1.15, 'rib': 1.15}.get(st, 1.0)
        for s in (1, -1):
            th = 0.42 * s
            c = Vector((-0.17 * s, 0, 0)); d = Vector((-math.sin(th), math.cos(th), 0))
            pts = []
            for j in range(6):
                f = j / 5; y = (f - 0.5) * 2 * 0.40 * tall
                loc = c + d * y
                bulge = 0.35 * (1 - (2 * f - 1) ** 2)
                pts.append(p0 + t * (loc.x * w * 2) + u * (loc.y * h) + n * (bulge * thick))
            strands.append(pts)
        if st in ('hdc', 'dc', 'rib'):  # the yarn-over bar across the post
            y = -0.05 * h
            strands.append([p0 + t * (x * w) + u * (y + x * 0.25 * h) + n * (0.35 * thick + 0.1 * thick * (1 - x * x)) for x in (-0.8, -0.4, 0, 0.4, 0.8)])
    sm = tube_mesh('Stitches', strands, thick * 0.46)
    sm.materials.append(yarn)
    stitch_ob = bpy.data.objects.new('Stitches', sm); scene.collection.objects.link(stitch_ob)
    log(f'built {len(strands)} yarn strands for {N - 1} stitches ({len(sm.vertices)} verts)')

# fibre halo: short fibres generated directly as a hair-curves object (Cycles renders them natively).
# The old particle-hair version rendered metres-long streaks (its length was rescaled by the velocity
# settings at evaluation), so length and count are now set per fibre and hard-capped here.
FUZZ_CAP = 60000            # refuse to render more fibres than this
FUZZ_MAX_LEN = 2.0          # x yarn thickness
fuzz = min(1.0, float(opts['fuzz']))
if fuzz > 0 and opts['engine'] == 'cycles':
    import random
    rng = random.Random(7)
    host = stitch_ob or ob
    hm = host.data
    polys = [p for p in hm.polygons if p.loop_total == 4]
    areas = [p.area for p in polys]; total = sum(areas)
    count = int(min(FUZZ_CAP, total / (thick * thick) * 1.5) * fuzz)
    est = int(total / (thick * thick) * 1.5 * fuzz)
    log(f'fuzz: {count} fibres (uncapped estimate {est}), max {FUZZ_MAX_LEN * thick * 1000:.2f} mm')
    if count > FUZZ_CAP: sys.exit(f'refusing render: {count} fibres > cap {FUZZ_CAP}')
    if count > 0:
        cum, acc = [], 0.0
        for a in areas: acc += a; cum.append(acc)
        import bisect
        mw = host.matrix_world
        pos = []
        for _ in range(count):
            p = polys[min(len(polys) - 1, bisect.bisect_left(cum, rng.random() * total))]
            v = [hm.vertices[k].co for k in p.vertices]
            a, b = rng.random(), rng.random()
            root = mw @ ((v[0] * (1 - a) + v[1] * a) * (1 - b) + (v[3] * (1 - a) + v[2] * a) * b)
            n = (mw.to_3x3() @ p.normal).normalized()
            d = (n + Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.9).normalized()
            if d.dot(n) < 0.15: d = (d + n * 0.5).normalized()
            L = min(FUZZ_MAX_LEN, rng.uniform(0.25, 0.75)) * thick
            bend = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.25 * L
            for q in (root, root + d * (L * 0.5) + bend * 0.5, root + d * L + bend):
                pos.extend(q)
        # hard check before anything renders: no fibre longer than the clamp
        for k in range(0, len(pos), 9):
            assert math.dist(pos[k:k + 3], pos[k + 6:k + 9]) <= FUZZ_MAX_LEN * thick * 1.2, 'fibre too long'
        try:
            hc = bpy.data.hair_curves.new('Fuzz')
            hc.add_curves([3] * count)
            hc.position_data.foreach_set('vector', pos)
            rad = hc.attributes.get('radius') or hc.attributes.new('radius', 'FLOAT', 'POINT')
            rad.data.foreach_set('value', [thick * 0.02, thick * 0.014, thick * 0.006] * count)
            fz, _ = principled('Yarn fibres', tuple(min(1.0, c * 1.25) for c in col), 0.6)
            hc.materials.append(fz)
            scene.collection.objects.link(bpy.data.objects.new('Fuzz', hc))
        except Exception as e:
            log('fuzz skipped:', e)

# ---------------------------------------------------------------- head form (rebuilt from the hat, like the page's headForm())
def ellipsoid(name, c, r, mat, segs=64):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=segs // 2, radius=1.0)
    for v in bm.verts: v.co = Vector((c[0] + v.co.x * r[0], c[1] + v.co.y * r[1], c[2] + v.co.z * r[2]))
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    for p in m.polygons: p.use_smooth = True
    m.materials.append(mat); o = bpy.data.objects.new(name, m); scene.collection.objects.link(o); return o

def cylinder(name, c, r, z0, z1, mat):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=r, radius2=r, depth=z1 - z0)
    for v in bm.verts: v.co += Vector((c[0], c[1], (z0 + z1) / 2))
    m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
    for p in m.polygons: p.use_smooth = True
    m.materials.append(mat); o = bpy.data.objects.new(name, m); scene.collection.objects.link(o); return o

frame_lo, frame_hi = bb_min.copy(), bb_max.copy()
floor_z = min(0.0, bb_min.z - thick)
if want_form:
    pad = thick / 1.2 * 0.6 + 0.0005
    mh = re.search(r'(\d+(?:\.\d+)?)\s*cm head', text)  # the app's head size, from the pattern comment
    # anatomical head form, mirrored from headDims() in src/app.js (cm there, metres here): cranium cu above the brow line,
    # face and jaw cl below it, ears, a brow ridge; neck and shoulders keep the older body proportion c
    k = (float(mh.group(1)) / 100 / (2 * math.pi)) if mh else ((bb_max.y - bb_min.y) / 2 - pad - thick) / 1.07
    sc_ = k * 2 * math.pi / 0.56                      # head size / 56 cm
    a, b, c = 0.93 * k, 1.07 * k, 1.12 * k
    cu, cl = 0.115 * sc_, 0.115 * 1.1 * sc_
    ear_h, ear_w, ear_d, ear_top = 0.062 * sc_, 0.016 * sc_, 0.034 * sc_, 0.003 * sc_
    ear_dy = ear_top + ear_h / 2
    ear_x = a * math.sqrt(max(0.0, 1 - (ear_dy / cl) ** 2)) + ear_w * 0.3
    cx, cy = (bb_min.x + bb_max.x) / 2, (bb_min.y + bb_max.y) / 2
    y0 = P[0].z - pad - cu                            # brow / ear-top line
    fm, _ = principled('Head form', (0.62, 0.6, 0.57), 0.55)
    def head_half(name, r_up, r_dn):                  # ellipsoid whose upper half has radius r_up and lower half r_dn
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=1.0)
        for v in bm.verts: v.co = Vector((cx + v.co.x * a, cy + v.co.y * b, y0 + v.co.z * (r_up if v.co.z >= 0 else r_dn)))
        m = bpy.data.meshes.new(name); bm.to_mesh(m); bm.free()
        for p in m.polygons: p.use_smooth = True
        m.materials.append(fm); o = bpy.data.objects.new(name, m); scene.collection.objects.link(o)
    head_half('Head', cu, cl)
    for sx in (-1, 1):
        ellipsoid('Ear', (cx + sx * ear_x, cy + 0.05 * b, y0 - ear_dy), (ear_w / 2, ear_d / 2, ear_h / 2), fm, segs=24)
    ellipsoid('Brow', (cx, cy - 0.55 * b, y0), (0.6 * a, 0.47 * b, 0.008 * sc_), fm, segs=32)
    cylinder('Neck', (cx, cy), a * 0.52, y0 - 2.2 * c, y0 - 1.0 * c, fm)
    ellipsoid('Shoulders', (cx, cy, y0 - 2.6 * c), (a * 2.6, b * 1.1, c * 0.72), fm)
    floor_z = min(floor_z, y0 - 2.6 * c - 0.72 * c)
    frame_lo = Vector((min(bb_min.x, cx - a), min(bb_min.y, cy - b), min(bb_min.z, y0 - cl - 0.2 * c)))
    log(f'head form: circumference ~{2 * math.pi * k * 100:.0f} cm')

# ---------------------------------------------------------------- props for flat pieces (rod, posts, bed box, head form), from export.js's sidecar
if meta:
    wood, _ = principled('Prop wood', (0.32, 0.2, 0.1), 0.55)
    bedm, _ = principled('Prop bed', (0.3, 0.3, 0.32), 0.8)
    for pr in meta['props']:
        if pr['t'] == 'cylX':
            bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=pr['r'], radius2=pr['r'], depth=pr['x1'] - pr['x0'])
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
            for v in bm.verts: v.co += Vector(((pr['x0'] + pr['x1']) / 2, pr['c'][1], pr['c'][2]))
            mm = bpy.data.meshes.new('Rod'); bm.to_mesh(mm); bm.free(); mm.materials.append(wood)
            for q in mm.polygons: q.use_smooth = True
            scene.collection.objects.link(bpy.data.objects.new('Rod', mm))
        elif pr['t'] == 'cylZ': cylinder('Post', pr['c'], pr['r'], pr['z0'], pr['z1'], wood)
        elif pr['t'] == 'ell': ellipsoid('Form', pr['c'], pr['r'], bedm)
        elif pr['t'] == 'box':
            bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
            lo, hi = Vector(pr['min']), Vector(pr['max']); lo, hi = Vector(map(min, lo, hi)), Vector(map(max, lo, hi))
            for v in bm.verts: v.co = (lo + hi) / 2 + Vector((v.co.x * (hi.x - lo.x), v.co.y * (hi.y - lo.y), v.co.z * (hi.z - lo.z)))
            mm = bpy.data.meshes.new('Bed'); bm.to_mesh(mm); bm.free(); mm.materials.append(bedm)
            scene.collection.objects.link(bpy.data.objects.new('Bed', mm))
    for o in scene.objects:
        if o.name.split('.')[0] in ('Rod', 'Post', 'Form', 'Bed'):
            for cc in o.bound_box:
                w = o.matrix_world @ Vector(cc)
                frame_lo = Vector(map(min, frame_lo, w)); frame_hi = Vector(map(max, frame_hi, w))
    frame_lo.z = min(frame_lo.z, 0.0)

# ---------------------------------------------------------------- studio: sweep backdrop, soft lights, camera
size = (frame_hi - frame_lo).length
fc = (frame_lo + frame_hi) / 2
bd, _ = principled('Backdrop', (0.42, 0.4, 0.38), 0.85)
bm = bmesh.new()
W, D, Hh, R = size * 12, size * 6, size * 6, size * 1.5
prof = [(-D, 0.0)] + [(R * math.sin(t), R - R * math.cos(t)) for t in [i / 12 * math.pi / 2 for i in range(13)]] + [(R, Hh)]
rows = []
for x in (-W / 2, W / 2):
    rows.append([bm.verts.new((fc.x + x, fc.y + D * 0.15 + yy, floor_z + zz)) for yy, zz in prof])
for j in range(len(prof) - 1):
    bm.faces.new((rows[0][j], rows[1][j], rows[1][j + 1], rows[0][j + 1]))
m = bpy.data.meshes.new('Backdrop'); bm.to_mesh(m); bm.free()
for p in m.polygons: p.use_smooth = True
m.materials.append(bd); bdo = bpy.data.objects.new('Backdrop', m); scene.collection.objects.link(bdo)

views = {'three-quarter': (-0.62, -1.0, 0.7 if meta else 0.42), 'front': (0.0, -1.0, 0.18), 'side': (-1.0, -0.05, 0.2), 'top': (-0.3, -0.5, 1.2)}
vd = Vector(views.get(opts['view'], views['three-quarter'])).normalized()
cam_d = bpy.data.cameras.new('Camera'); cam_d.lens = 85; cam_d.sensor_width = 36
cam = bpy.data.objects.new('Camera', cam_d); scene.collection.objects.link(cam); scene.camera = cam
rx, ry = map(int, opts['res'].lower().split('x'))
fov = 2 * math.atan(18 / 85) * (min(rx, ry) / max(rx, ry) if rx > ry else 1)
dist = (size / 2) / math.sin(fov / 2) * 0.95
cam.location = fc + vd * dist
cam.rotation_euler = (fc - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam_d.clip_start = dist * 0.05; cam_d.clip_end = dist * 50
cam_d.dof.use_dof = True; cam_d.dof.focus_distance = dist; cam_d.dof.aperture_fstop = 11

def area(name, loc, power, sz, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = power; l.size = sz; l.color = color
    if hasattr(l, 'shape'): l.shape = 'DISK'
    o = bpy.data.objects.new(name, l); scene.collection.objects.link(o); o.location = loc
    o.rotation_euler = (fc - o.location).to_track_quat('-Z', 'Y').to_euler(); return o

s = dist / 1.0
area('Key', fc + Vector((-1.0, -0.8, 1.1)).normalized() * dist * 0.9, 30 * s * s, dist * 0.7, (1.0, 0.96, 0.9))
area('Fill', fc + Vector((1.2, -0.6, 0.3)).normalized() * dist, 9 * s * s, dist * 1.0, (0.9, 0.95, 1.0))
area('Rim', fc + Vector((0.6, 1.0, 0.9)).normalized() * dist * 0.8, 25 * s * s, dist * 0.4)
world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.5, 0.5, 0.52, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.08

# ---------------------------------------------------------------- render settings
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = rx, ry, 100
scene.render.image_settings.file_format = 'PNG'; scene.render.filepath = out
try: scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
except Exception:
    try: scene.view_settings.view_transform = 'Filmic'
    except Exception: pass
if opts['engine'] == 'eevee':
    for e in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: scene.render.engine = e; break
        except Exception: continue
    log('engine', scene.render.engine)
else:
    scene.render.engine = 'CYCLES'
    cy = scene.cycles; cy.samples = int(opts['samples']); cy.use_denoising = True; cy.use_adaptive_sampling = True
    cy.max_bounces = 8
    cy.device = 'CPU'; dev = 'CPU'
    scene.render.threads_mode = 'FIXED'; scene.render.threads = int(opts['threads'])
    if flags['gpu']:
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            prefs.compute_device_type = 'METAL'; prefs.get_devices()
            if any(d.type == 'METAL' for d in prefs.devices):
                for d in prefs.devices: d.use = d.type == 'METAL'
                cy.device = 'GPU'; dev = 'METAL'
        except Exception as e: log('gpu probe failed, staying on CPU:', e)
    log(f'engine CYCLES on {dev}' + (f' ({scene.render.threads} threads)' if dev == 'CPU' else '') + f', {cy.samples} samples, {opts["res"]}')

if opts['blend']:
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(opts['blend'])); log('saved', opts['blend'])
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
bpy.ops.render.render(write_still=True)
log(f'wrote {out} in {time.time() - T0:.0f} s')
