#!/usr/bin/env python3
"""Original, deterministic, tileable limestone PBR maps for the Cinder Archive.

No photographs, downloaded textures, or game assets are used. The files and this
generator are distributed under the repository's MIT license. This is surface
art for this game's stonework, not a claim of scanned material or AAA fidelity.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
OUT = Path(__file__).resolve().parents[1] / 'dist' / 'textures'
OUT.mkdir(parents=True, exist_ok=True)
RNG = np.random.default_rng(3817)


def periodic_noise(samples):
    """Bicubic interpolation with a wrapped border, including the last texel."""
    a = RNG.random((samples, samples)).astype(np.float32)
    wrapped = np.pad(a, ((2, 2), (2, 2)), mode='wrap')
    scale = SIZE / samples
    large = Image.fromarray(wrapped, 'F').resize(
        (round((samples + 4) * scale), round((samples + 4) * scale)), Image.Resampling.BICUBIC)
    offset = round(2 * scale)
    return np.asarray(large.crop((offset, offset, offset + SIZE, offset + SIZE))).copy()


def fractal(scales, weights):
    return sum(periodic_noise(s) * w for s, w in zip(scales, weights)) / sum(weights)


def save_rgb(name, value):
    image = Image.fromarray(np.uint8(np.clip(value, 0, 1) * 255), 'RGB')
    image.save(OUT / name, optimize=True)


def normal_map(height, strength):
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    normal = np.stack((-dx, -dy, np.ones_like(height)), axis=2)
    normal /= np.linalg.norm(normal, axis=2)[:, :, None]
    return normal * .5 + .5


def fractures():
    image = Image.new('L', (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(image)
    for _ in range(11):
        x, y = RNG.uniform(0, SIZE, 2)
        angle = RNG.uniform(0, np.pi * 2)
        points = [(x, y)]
        for _ in range(int(RNG.integers(7, 14))):
            angle += RNG.uniform(-.42, .42)
            step = RNG.uniform(10, 34)
            x += np.cos(angle) * step
            y += np.sin(angle) * step
            points.append((x, y))
        for ox in (-SIZE, 0, SIZE):
            for oy in (-SIZE, 0, SIZE):
                draw.line([(px + ox, py + oy) for px, py in points], fill=205, width=int(RNG.integers(1, 3)))
    sharp = np.asarray(image, np.float32) / 255
    soft = np.asarray(image.filter(ImageFilter.GaussianBlur(2.5)), np.float32) / 255
    return sharp, soft


for kind, tint in [('stone', (.45, .435, .398)), ('floor', (.38, .371, .338))]:
    broad = fractal([3, 7, 17, 43], [4, 2, 1, .6])
    fine = fractal([63, 127, 257, 509], [2, 1.6, 1, .5])
    pits = np.clip((periodic_noise(257) - .67) * 2.8, 0, 1)
    flecks = periodic_noise(511)
    warp = fractal([4, 11, 27], [3, 1, .5])
    yy, xx = np.mgrid[0:SIZE, 0:SIZE] / SIZE
    # Mineral inclusions and pale sedimentary veining; all underlying noise wraps.
    vein = np.sin((xx * 9 + yy * 13 + warp * 2) * np.pi * 2)
    minerals = np.clip((vein - .72) * 3, 0, 1) * .024
    crack, crack_halo = fractures()
    damp = np.clip((broad - .59) * 4.2, 0, .56)
    chalk = np.clip((broad - .46) * 2, -.21, .22)
    variation = (broad - .5) * .24 + (fine - .5) * .10 + (flecks - .5) * .034
    albedo = np.stack([np.full((SIZE, SIZE), c) + variation for c in tint], axis=2)
    albedo += minerals[:, :, None]
    albedo += chalk[:, :, None] * np.array([.075, .064, .044])
    albedo -= damp[:, :, None] * np.array([.18, .17, .14])
    albedo -= pits[:, :, None] * .055 + crack_halo[:, :, None] * .035 + crack[:, :, None] * .095
    height = (fine - .5) * .11 + (broad - .5) * .09 + minerals * .45 - pits * .033 - crack * .022
    roughness = np.clip(.85 + (fine - .5) * .20 - damp * .40 + pits * .08, .49, .99)
    save_rgb(f'environment-{kind}-basecolor.jpg', albedo)
    save_rgb(f'environment-{kind}-normal.jpg', normal_map(height, 23))
    save_rgb(f'environment-{kind}-roughness.jpg', np.repeat(roughness[:, :, None], 3, axis=2))

# Transparent, soft-edged dirt/water/ash patches. Deliberately no premade gore.
small = 512
field = fractal([3, 7, 19, 71], [3, 1.5, 1, .6])
yy, xx = np.mgrid[-1:1:complex(SIZE), -1:1:complex(SIZE)]
radius = np.sqrt(xx * xx / 1.0 + yy * yy / .55)
edge = np.clip(1.0 - radius + (field - .5) * .68, 0, 1)
alpha = np.clip(edge * 2.2, 0, 1) ** 1.5 * (.45 + field * .45)
grime = np.stack([.095 + field * .06, .085 + field * .045, .069 + field * .036, alpha], axis=2)
Image.fromarray(np.uint8(grime * 255), 'RGBA').resize((small, small), Image.Resampling.LANCZOS).save(
    OUT / 'environment-grime.png', optimize=True)

# Original funerary relief: radiating broken sun and inset lines carved in stone.
relief = Image.new('L', (SIZE, SIZE), 145)
draw = ImageDraw.Draw(relief)
draw.rounded_rectangle((64, 48, 960, 976), radius=30, outline=64, width=12)
draw.rounded_rectangle((99, 83, 925, 941), radius=18, outline=183, width=9)
for radius in (159, 173, 230):
    draw.ellipse((512-radius, 373-radius, 512+radius, 373+radius), outline=59 if radius != 173 else 195, width=11)
for i in range(16):
    a = i * np.pi / 8
    x1, y1 = 512 + np.cos(a) * 205, 373 + np.sin(a) * 205
    x2, y2 = 512 + np.cos(a) * 304, 373 + np.sin(a) * 304
    draw.line((x1, y1, x2, y2), fill=62, width=17)
    draw.line((x1+4, y1-4, x2+4, y2-4), fill=188, width=5)
for i in range(6):
    y = 750 + i * 26
    draw.line((290 + i % 2 * 31, y, 724 - i % 3 * 29, y), fill=69, width=5)
    for j in range(9):
        x = 310 + j * 45
        draw.line((x, y-5, x+9, y+5), fill=65, width=3)
relief = relief.filter(ImageFilter.GaussianBlur(1.2))
r = np.asarray(relief, np.float32) / 255
stone_noise = fractal([13, 73, 257], [2, 1, .4])
relief_height = r * .25 + stone_noise * .025
rgb = np.stack([.41 + (r-.55)*.18 + (stone_noise-.5)*.04,
                .392 + (r-.55)*.17 + (stone_noise-.5)*.04,
                .346 + (r-.55)*.15 + (stone_noise-.5)*.035], axis=2)
save_rgb('environment-relief-basecolor.jpg', rgb)
save_rgb('environment-relief-normal.jpg', normal_map(relief_height, 30))

files = sorted(OUT.glob('environment-*'))
print(json.dumps({'size': SIZE, 'license': 'MIT, original procedural source',
                  'files': [{'path': str(p.relative_to(OUT.parent.parent)), 'bytes': p.stat().st_size} for p in files]}, indent=2))
