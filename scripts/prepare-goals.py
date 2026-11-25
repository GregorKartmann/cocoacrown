"""Prepares the achievement pack (Erfolge und Tagesziele) for the game.

Usage: python3 -I scripts/prepare-goals.py <erfolge-pack-dir> <project-dir>

Run after prepare-assets.py and prepare-expansion.py. Only the badges are
needed: the pack's "symbole/" are copies of art the game already has.
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

for folder in ['abzeichen', 'abzeichen/alternativen']:
    d = os.path.join(src, folder)
    for f in sorted(os.listdir(d)):
        if not f.endswith('.png'):
            continue
        img = trim(Image.open(os.path.join(d, f)).convert('RGBA'))
        s = min(1.0, 200 / img.width, 200 / img.height)
        if s < 1.0:
            img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
        key = f'{folder}/{f[:-4]}'
        path = os.path.join(out, key + '.webp')
        os.makedirs(os.path.dirname(path), exist_ok=True)
        img.save(path, 'WEBP', quality=84, method=6)
        manifest[key] = {'w': img.width, 'h': img.height}

with open(manifest_path, 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)
print(len(manifest), 'assets in manifest')
