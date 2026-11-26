"""Adds the Platin and Diamant medals (0.10.0) next to the achievement badges.

Usage: python3 -I scripts/prepare-medals.py <medaille_platin.png> <medaille_diamant.png> <project-dir>

Same treatment as prepare-goals.py: trim transparency, fit into 200 px, WebP.
"""
import json, os, sys
from PIL import Image

platin, diamant, proj = sys.argv[1], sys.argv[2], sys.argv[3]
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


for key, path in [('abzeichen/medaille_platin', platin), ('abzeichen/medaille_diamant', diamant)]:
    img = trim(Image.open(path).convert('RGBA'))
    s = min(1.0, 200 / img.width, 200 / img.height)
    if s < 1.0:
        img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    dest = os.path.join(out, key + '.webp')
    img.save(dest, 'WEBP', quality=86, method=6)
    manifest[key] = {'w': img.width, 'h': img.height}
    print(key, img.size)

with open(manifest_path, 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)
print(len(manifest), 'assets in manifest')
