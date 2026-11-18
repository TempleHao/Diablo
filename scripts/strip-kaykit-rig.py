#!/usr/bin/env python3
"""从 KayKit Character Pack: Skeletons（CC0）里只留下骨架和要用的动作，去掉模型、贴图。

3D 小样的人物全部由代码建模（dist/proto/actors.js），只借用这套骨架的动作数据。
用法：python3 scripts/strip-kaykit-rig.py Skeleton_Warrior.glb dist/proto/models/rig/humanoid.glb
"""
import sys, json, struct

KEEP = ['Idle', 'Idle_Combat', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Walking_C', 'Walking_D_Skeletons',
        'Running_A', 'Running_B', 'Spellcast_Shoot', 'Spellcast_Long', 'Spellcast_Raise', 'Spellcast_Summon',
        'Hit_A', 'Hit_B', 'Death_A', 'Death_B', 'Death_C_Skeletons', 'Spawn_Ground_Skeletons', 'Skeletons_Awaken_Floor',
        '1H_Melee_Attack_Chop', '1H_Melee_Attack_Slice_Diagonal', '2H_Melee_Attack_Chop', '2H_Melee_Attack_Spin', '2H_Melee_Idle',
        'Unarmed_Melee_Attack_Punch_A', 'Taunt', 'Dodge_Forward']


def main(src, dst):
    b = open(src, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    bin0 = 20 + jl + 8
    blob = b[bin0:bin0 + struct.unpack('<I', b[20 + jl:24 + jl])[0]]

    anims = [a for a in j['animations'] if a['name'] in KEEP]
    missing = set(KEEP) - {a['name'] for a in anims}
    if missing: print('缺少动作：', ', '.join(sorted(missing)))

    # 只保留动作用到的 accessor / bufferView，重新打包二进制
    acc_map, views, out = {}, [], bytearray()
    new_acc = []
    def take(i):
        if i in acc_map: return acc_map[i]
        a = dict(j['accessors'][i]); v = j['bufferViews'][a['bufferView']]
        start = v.get('byteOffset', 0) + a.get('byteOffset', 0)
        comp = {5126: 4, 5123: 2, 5125: 4, 5121: 1}[a['componentType']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[a['type']]
        size = a['count'] * comp * n
        while len(out) % 4: out.append(0)
        views.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': size})
        out.extend(blob[start:start + size])
        a['bufferView'] = len(views) - 1; a.pop('byteOffset', None)
        new_acc.append(a); acc_map[i] = len(new_acc) - 1
        return acc_map[i]
    for a in anims:
        for s in a['samplers']: s['input'] = take(s['input']); s['output'] = take(s['output'])

    nodes = []
    for n in j['nodes']:
        n = {k: v for k, v in n.items() if k not in ('mesh', 'skin')}
        nodes.append(n)
    g = {'asset': {'version': '2.0', 'generator': 'strip-kaykit-rig (KayKit CC0 rig + animations)'},
         'scene': 0, 'scenes': j['scenes'], 'nodes': nodes, 'animations': anims,
         'accessors': new_acc, 'bufferViews': views, 'buffers': [{'byteLength': len(out)}]}
    js = json.dumps(g, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    while len(out) % 4: out.append(0)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
    print(f'{dst}: {len(anims)} 个动作，{total // 1024} KB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
