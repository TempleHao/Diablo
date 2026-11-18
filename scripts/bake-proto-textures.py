#!/usr/bin/env python3
"""归墟 3D 小样 · 离线烘焙材质（在照片扫描材质到位之前的替身，也是材质管线的测试数据）。

输出和 import-polyhaven.py 一样的三张图：
  diff.jpg  颜色（sRGB）
  nor.jpg   法线（OpenGL，Y 向上）
  rah.jpg   R=粗糙度 G=环境遮蔽 B=高度
所有噪声都在频域生成，天然无缝平铺。
用法：python3 scripts/bake-proto-textures.py dist/proto/tex
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

N = 1024
rng = np.random.default_rng(7)


def noise(scale, seed, power=2.0):
    """频域滤波的白噪声：无缝、各向同性，scale 越小越细。"""
    r = np.random.default_rng(seed)
    w = r.standard_normal((N, N))
    fx = np.fft.fftfreq(N)[:, None]; fy = np.fft.fftfreq(N)[None, :]
    f = np.sqrt(fx * fx + fy * fy) * N / scale
    filt = 1.0 / (1.0 + f ** power)
    out = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    out -= out.min(); out /= out.max() + 1e-9
    return out


def fbm(base, seed, octaves=6):
    s, a, tot = 0, 1.0, 0
    for i in range(octaves):
        s = s + a * noise(base / 2 ** i, seed + i * 31); tot += a; a *= .5
    return s / tot


def wrap_voronoi(n_cells, seed, jitter=.9):
    """无缝的 Voronoi：返回 (到最近点距离, 到第二近点距离, 所属格子 id)，单位为像素。"""
    r = np.random.default_rng(seed)
    g = int(np.sqrt(n_cells)); cell = N / g
    pts = []
    for i in range(g):
        for j in range(g):
            pts.append(((i + .5 + (r.random() - .5) * jitter) * cell, (j + .5 + (r.random() - .5) * jitter) * cell))
    pts = np.array(pts)
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    d1 = np.full((N, N), 1e9, np.float32); d2 = d1.copy(); idx = np.zeros((N, N), np.int32)
    for k, (px, py) in enumerate(pts):
        dx = np.abs(xx - px); dx = np.minimum(dx, N - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, N - dy)
        d = np.sqrt(dx * dx + dy * dy)
        m = d < d1
        d2 = np.where(m, d1, np.minimum(d2, d)); idx = np.where(m, k, idx); d1 = np.where(m, d, d1)
    return d1, d2, idx, len(pts)


def normal_from_height(h, strength):
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * .5 * strength
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * .5 * strength
    # 图像 y 向下，OpenGL 法线 Y 向上（v 增大方向），所以 y 分量取正的梯度
    n = np.stack([-gx, gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def cavity_ao(h, radius=12):
    blur = ndimage.gaussian_filter(h, radius, mode='wrap')
    ao = np.clip(1 - (blur - h) * 6, 0, 1)
    return ao ** 1.5


def save(out, name, alb, h, rough, ao, nstrength):
    d = os.path.join(out, name); os.makedirs(d, exist_ok=True)
    srgb = np.clip(alb, 0, 1) ** (1 / 2.2)
    Image.fromarray((srgb * 255 + .5).astype(np.uint8)).save(f'{d}/diff.jpg', quality=90)
    n = normal_from_height(h, nstrength)
    Image.fromarray(((n * .5 + .5) * 255 + .5).astype(np.uint8)).save(f'{d}/nor.jpg', quality=92)
    rah = np.stack([rough, ao, h], -1)
    Image.fromarray((np.clip(rah, 0, 1) * 255 + .5).astype(np.uint8)).save(f'{d}/rah.jpg', quality=92)
    print('baked', d)


def flagstone(out):
    """祭坛石板：不规则大石板，边缘被磨圆、有缺口和裂纹，缝里是泥和苔。贴图对应 3 米见方。"""
    d1, d2, idx, n = wrap_voronoi(25, 11, .7)
    edge = d2 - d1                               # 到石缝的距离（像素）
    rough_edge = edge + (fbm(60, 3, 5) - .5) * 22
    stone = np.clip((rough_edge - 4) / 26, 0, 1)
    stone = stone * stone * (3 - 2 * stone)
    r = np.random.default_rng(5)
    tilt = r.random((n, 2)) - .5; lvl = r.random(n); tint = r.random(n)
    yy, xx = np.mgrid[0:N, 0:N] / N
    surf = .55 + lvl[idx] * .18 + (tilt[idx, 0] * (xx - .5) + tilt[idx, 1] * (yy - .5)) * .25
    grain = fbm(160, 21, 6)
    pits = np.clip((noise(10, 33) - .62) * 4, 0, 1)
    cracks_v = wrap_voronoi(100, 41, 1.0)
    crack = np.clip(1 - (cracks_v[1] - cracks_v[0]) / 2.2, 0, 1) * (r.random(n) > .55)[idx] * stone
    h = stone * (surf + (grain - .5) * .16) - pits * .05 * stone - crack * .12
    h = h - h.min(); h /= h.max()
    base = np.array([.24, .215, .18])
    warm = np.array([.29, .25, .2]); cold = np.array([.19, .19, .185])
    col = base * (1 - tint[idx, None] * .0) * 1
    col = np.where(tint[idx, None] > .7, warm, np.where(tint[idx, None] < .3, cold, base))
    col = col * (.72 + .5 * fbm(90, 51, 5)[..., None]) * (.9 + .2 * grain[..., None])
    edge_wear = np.clip(1 - rough_edge / 30, 0, 1) * stone
    col = col * (1 + edge_wear[..., None] * .25)
    gap = np.array([.05, .042, .032]) * (1 + fbm(30, 61, 4)[..., None] * .6)
    moss = np.clip((fbm(70, 71, 4) - .45) * 4, 0, 1)
    gap = gap * (1 - moss[..., None]) + np.array([.035, .05, .02]) * moss[..., None]
    alb = col * stone[..., None] + gap * (1 - stone[..., None])
    alb = alb * (1 - crack[..., None] * .6) * (1 - pits[..., None] * .35)
    dirt = np.clip((fbm(220, 81, 4) - .45) * 2.5, 0, 1)
    alb = alb * (1 - dirt[..., None] * .45) * .82
    ao = cavity_ao(h, 10) * (.55 + .45 * stone)
    rough = np.clip(.78 + (grain - .5) * .2 + (1 - stone) * .15 - edge_wear * .1, 0, 1)
    save(out, 'baked-floor', alb, h, rough, ao, 9)


def rock(out):
    """石块表面：风化凹坑、层理、颗粒。给砌墙石块、柱子三向投影用，贴图对应 2 米见方。"""
    big = fbm(200, 101, 5); mid = fbm(60, 111, 5); fine = noise(4, 121, 1.6)
    pits = np.clip((noise(14, 131) - .6) * 3.5, 0, 1)
    strata = (np.sin((np.mgrid[0:N, 0:N][0] / N * 9 + big * 3) * np.pi * 2) * .5 + .5) ** 3
    h = big * .45 + mid * .35 + fine * .12 - pits * .25 + strata * .06
    h = h - h.min(); h /= h.max()
    tint = fbm(300, 141, 3)
    col = np.array([.25, .235, .21]) * (1 - tint[..., None]) + np.array([.33, .3, .26]) * tint[..., None]
    col = col * (.7 + .45 * mid[..., None]) * (.88 + .24 * fine[..., None]) * (1 - pits[..., None] * .45)
    stain = np.clip((fbm(120, 151, 4) - .5) * 3, 0, 1)
    col = col * (1 - stain[..., None] * .35)
    ao = cavity_ao(h, 8)
    rough = np.clip(.8 + (fine - .5) * .25 - stain * .1, 0, 1)
    save(out, 'baked-rock', col, h, rough, ao, 7)


def mud(out):
    """泥地：碎砾 + 湿泥 + 落叶腐殖，用来铺在石板缝隙大的地方和墙根。贴图对应 3 米见方。"""
    base = fbm(120, 201, 6)
    d1, d2, idx, n = wrap_voronoi(900, 211, 1.0)
    pebble = np.clip(1 - d1 / (np.random.default_rng(3).random(n)[idx] * 9 + 5), 0, 1) ** .7 * (np.random.default_rng(4).random(n) > .45)[idx]
    h = base * .6 + pebble * .4
    h = h - h.min(); h /= h.max()
    col = np.array([.11, .09, .07]) * (.7 + .6 * base[..., None])
    pc = np.random.default_rng(6).random(n)[idx][..., None]
    col = col * (1 - pebble[..., None]) + (np.array([.2, .19, .17]) * (.7 + .5 * pc)) * pebble[..., None]
    ao = cavity_ao(h, 6)
    rough = np.clip(.9 - pebble * .15 + (base - .5) * .1, 0, 1)
    save(out, 'baked-mud', col, h, rough, ao, 6)


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
    out = sys.argv[1] if len(sys.argv) > 1 else 'dist/proto/tex'
    flagstone(out); rock(out); mud(out)
    write_index(out)
