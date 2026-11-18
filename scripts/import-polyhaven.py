#!/usr/bin/env python3
"""把 Poly Haven 下载的材质（zip 或文件夹）转成 3D 小样用的格式。

每个材质输出到 dist/proto/tex/<材质名>/：
  diff.jpg  颜色      nor.jpg  OpenGL 法线      rah.jpg  R=粗糙度 G=AO B=高度
同时生成 1k/ 子目录给手机和中低画质用。
认得的文件名：*_diff_*, *_col_*, *_nor_gl_*, *_rough_*, *_ao_*, *_disp_*, *_arm_*（AO/粗糙度/金属度合一）。
用法：python3 scripts/import-polyhaven.py 下载目录或压缩包... [--out dist/proto/tex] [--size 2048]
"""
import sys, os, re, zipfile, io, argparse
from PIL import Image
import numpy as np

KEYS = {'diff': r'_(diff|col|albedo|basecolor)_', 'nor': r'_nor_gl_', 'rough': r'_rough(ness)?_', 'ao': r'_ao_', 'disp': r'_(disp|height)_', 'arm': r'_arm_'}


def collect(paths):
    """返回 {材质名: {种类: PIL.Image}}"""
    sets = {}
    def take(name, opener):
        base = os.path.basename(name).lower()
        if not re.search(r'\.(jpe?g|png|tiff?|exr)$', base): return
        for k, pat in KEYS.items():
            if re.search(pat, base):
                slug = re.split(pat, base)[0]
                try: img = opener()
                except Exception as e: print('跳过', name, e); return
                sets.setdefault(slug, {})[k] = img
                return
    for p in paths:
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                for f in files:
                    fp = os.path.join(root, f)
                    if f.lower().endswith('.zip'): collect_zip(fp, take)
                    else: take(fp, lambda fp=fp: Image.open(fp))
        elif p.lower().endswith('.zip'): collect_zip(p, take)
        else: take(p, lambda p=p: Image.open(p))
    return sets


def collect_zip(path, take):
    z = zipfile.ZipFile(path)
    for n in z.namelist():
        take(n, lambda n=n: Image.open(io.BytesIO(z.read(n))))


def chan(img, size, c=None):
    im = img.convert('RGB' if c is None else 'L') if img.mode not in ('I;16', 'I', 'F') else img
    if im.mode in ('I;16', 'I', 'F'):
        a = np.asarray(im, np.float32); a = (a - a.min()) / (a.max() - a.min() + 1e-9)
        im = Image.fromarray((a * 255).astype(np.uint8))
    return im.resize((size, size), Image.LANCZOS)


def write(slug, s, out, size):
    if 'diff' not in s or 'nor' not in s:
        print(f'{slug}: 缺颜色或法线（GL）图，跳过'); return
    for sub, sz in (('', size), ('1k', 1024)):
        d = os.path.join(out, slug, sub); os.makedirs(d, exist_ok=True)
        chan(s['diff'], sz).save(f'{d}/diff.jpg', quality=90)
        chan(s['nor'], sz).save(f'{d}/nor.jpg', quality=93)
        if 'rough' in s: r = chan(s['rough'], sz, 'L')
        elif 'arm' in s: r = chan(s['arm'], sz).split()[1]
        else: r = Image.new('L', (sz, sz), 200)
        if 'ao' in s: a = chan(s['ao'], sz, 'L')
        elif 'arm' in s: a = chan(s['arm'], sz).split()[0]
        else: a = Image.new('L', (sz, sz), 255)
        h = chan(s['disp'], sz, 'L') if 'disp' in s else Image.new('L', (sz, sz), 128)
        Image.merge('RGB', (r, a, h)).save(f'{d}/rah.jpg', quality=92)
    print(f'{slug}: 已导入（{", ".join(sorted(s))}）')


def write_index(out):
    """tex/index.json：小样运行时按它决定有哪些材质可用，不去瞎猜文件（避免一堆 404）。"""
    import json
    sets = {}
    for slug in sorted(os.listdir(out)):
        d = os.path.join(out, slug)
        if os.path.isfile(os.path.join(d, 'diff.jpg')):
            sets[slug] = {'lo': os.path.isfile(os.path.join(d, '1k', 'diff.jpg'))}
    json.dump(sets, open(os.path.join(out, 'index.json'), 'w'), ensure_ascii=False, indent=1)
    print('index.json:', ', '.join(sets))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+'); ap.add_argument('--out', default='dist/proto/tex'); ap.add_argument('--size', type=int, default=2048)
    a = ap.parse_args()
    sets = collect(a.paths)
    if not sets: print('没找到 Poly Haven 格式的贴图'); sys.exit(1)
    for slug, s in sorted(sets.items()): write(slug, s, a.out, a.size)
    write_index(a.out)
