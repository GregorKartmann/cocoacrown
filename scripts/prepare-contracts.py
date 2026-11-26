"""Prepares the pack "Lieferverträge und Kronen-Schatzkammer" for the game.

Usage: python3 -I scripts/prepare-contracts.py <vertraege-pack-dir> <project-dir>

Run after the other prepare-* scripts. Writes WebP to src/assets/art/vertraege/…
and src/assets/art/schatzkammer/… and extends manifest.json.
"""
import json, os, sys
from PIL import Image

src, proj = sys.argv[1], sys.argv[2]
out = os.path.join(proj, 'src', 'assets', 'art')
manifest_path = os.path.join(out, 'manifest.json')
manifest = json.load(open(manifest_path))


def trim(img, pad=2):
    a = img.getchannel('A').point(lambda v: 255 if v > 10 else 0)
    box = a.getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))


def save(img, key, quality=84):
    path = os.path.join(out, key + '.webp')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)
    manifest[key] = {'w': img.width, 'h': img.height}


def icons(folder, target, box=180):
    d = os.path.join(src, folder)
    for f in sorted(os.listdir(d)):
        if not f.endswith('.png'):
            continue
        img = trim(Image.open(os.path.join(d, f)).convert('RGBA'))
        s = min(1.0, box / img.width, box / img.height)
        if s < 1.0:
            img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        save(img, f'{target}/{f[:-4]}')


def picture(rel, key, max_w, max_h, quality=80):
    img = Image.open(os.path.join(src, rel)).convert('RGB')
    s = min(1.0, max_w / img.width, max_h / img.height)
    if s < 1.0:
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    save(img, key, quality)


icons('liefervertraege/kunden', 'vertraege/kunden')
icons('liefervertraege/siegel', 'vertraege/siegel', 160)
icons('liefervertraege/symbole', 'vertraege/symbole', 120)
icons('schatzkammer/boni', 'schatzkammer/boni')
icons('schatzkammer/symbole', 'schatzkammer/symbole', 160)
picture('liefervertraege/vertragspapier.webp', 'vertraege/vertragspapier', 720, 900)
picture('schatzkammer/kulisse_hoch.webp', 'schatzkammer/kulisse_hoch', 810, 1440, 78)
picture('schatzkammer/kulisse_quer.webp', 'schatzkammer/kulisse_quer', 1440, 810, 78)

with open(manifest_path, 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)
print(len(manifest), 'assets in manifest')
