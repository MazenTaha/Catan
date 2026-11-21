"""Check runtime GLBs, skin weights and optional previous-asset rig compatibility. No Blender needed."""
import argparse
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
FORMATS = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}


class GLB:
    def __init__(self, path):
        data = path.read_bytes()
        magic, version, length = struct.unpack_from('<III', data)
        assert magic == 0x46546c67 and version == 2 and length == len(data)
        n = struct.unpack_from('<I', data, 12)[0]
        self.j = json.loads(data[20:20 + n])
        self.bin = data[28 + n:]

    def read(self, index):
        a = self.j['accessors'][index]
        v = self.j['bufferViews'][a['bufferView']]
        fmt = '<' + FORMATS[a['componentType']] * SIZES[a['type']]
        stride = v.get('byteStride', struct.calcsize(fmt))
        offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        return [struct.unpack_from(fmt, self.bin, offset + i * stride) for i in range(a['count'])]

    def nodes_under(self, name):
        start = next(i for i, n in enumerate(self.j['nodes']) if n.get('name') == name)
        nodes = []

        def visit(i):
            nodes.append(self.j['nodes'][i])
            for child in self.j['nodes'][i].get('children', []):
                visit(child)
        visit(start)
        return nodes


def check(asset, baseline):
    g = GLB(ROOT / asset['runtime'])
    nodes = g.nodes_under(asset['name'])
    tris, weighted = 0, 0
    for n in nodes:
        if 'mesh' not in n:
            continue
        for p in g.j['meshes'][n['mesh']]['primitives']:
            tris += g.j['accessors'][p['indices']]['count'] // 3
            for key in ('POSITION', 'NORMAL', 'WEIGHTS_0'):
                if key in p['attributes']:
                    values = g.read(p['attributes'][key])
                    assert all(math.isfinite(v) for row in values for v in row), key
                    if key == 'WEIGHTS_0':
                        assert all(min(row) >= 0 and abs(sum(row) - 1) < 1e-5 for row in values)
                        weighted += len(values)
            if 'JOINTS_0' in p['attributes']:
                assert all(0 <= v < asset['bones'] for row in g.read(p['attributes']['JOINTS_0']) for v in row)
    assert tris <= asset['maxTriangles'], (asset['name'], tris)
    if asset.get('bones'):
        assert len(g.j.get('skins', [])) == 1
    names = {n.get('name') for n in nodes}
    assert set(asset.get('parts', []) + asset.get('variants', [])).issubset(names)
    for skin in g.j.get('skins', []):
        assert len(skin['joints']) == asset['bones']
    if baseline and not asset['name'].endswith('Far'):
        old = GLB(baseline / asset['runtime'])
        old_nodes = {n['name']: n for n in old.nodes_under(asset['name'])}
        # Mesh objects may change topology/materials, while joint transforms and hierarchy stay fixed.
        for n in nodes:
            if 'mesh' in n:
                continue
            prev = old_nodes[n['name']]
            for key in ('translation', 'rotation', 'scale', 'matrix'):
                assert n.get(key) == prev.get(key), (n['name'], key)
            children = lambda d, x: [d.j['nodes'][i]['name'] for i in x.get('children', [])]
            assert children(g, n) == children(old, prev), n['name']
        for new_skin, old_skin in zip(g.j.get('skins', []), old.j.get('skins', [])):
            assert g.read(new_skin['inverseBindMatrices']) == old.read(old_skin['inverseBindMatrices'])
        if asset['name'] == 'Sheep':
            for n in nodes:
                if n['name'] == 'Sheep':
                    continue  # File-layout position is reset by the runtime asset loader.
                for key in ('translation', 'rotation', 'scale'):
                    assert n.get(key) == old_nodes[n['name']].get(key), (n['name'], key)
    if asset['name'] == 'SheepFar':
        close = {n['name']: n for n in g.nodes_under('Sheep')}
        for n in nodes[1:]:
            for key in ('translation', 'rotation', 'scale'):
                assert n.get(key) == close[n['name'][:-3]].get(key), (n['name'], key)
    return {'name': asset['name'], 'triangles': tris, 'weightedVertices': weighted, 'compatible': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, help='Earlier repo-layout asset directory, to compare rig transforms')
    args = parser.parse_args()
    manifest = json.loads((Path(__file__).with_name('creatures.json')).read_text(encoding='utf-8'))
    print(json.dumps([check(a, args.baseline) for a in manifest['assets']], indent=2))
