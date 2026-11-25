"""Prepares the winter pack (Lebkuchen-Manufaktur, Adventskalender) for the game.

Usage: python3 -I scripts/prepare-winter.py <winter-pack-dir> <project-dir>

Run after the other prepare-* scripts. Everything lands under
src/assets/art/winter/ and is merged into manifest.json.
"""
import json, os, sys
from PIL import Image

src, proj = sys.argv[1], sys.argv[2]
out = os.path.join(proj, 'src', 'assets', 'art')
manifest_path = os.path.join(out, 'manifest.json')
manifest = json.load(open(manifest_path))

def save(img, key, quality=82):
    path = os.path.join(out, key + '.webp')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)
    manifest[key] = {'w': img.width, 'h': img.height}

def trim(img, pad=2):
    a = img.getchannel('A').point(lambda v: 255 if v > 10 else 0)
    box = a.getbbox()
    if not box:
        return img
    l, t, r, b = box
    return img.crop((max(0, l - pad), max(0, t - pad), min(img.width, r + pad), min(img.height, b + pad)))

def fit(img, mw, mh):
    s = min(1.0, mw / img.width, mh / img.height)
    if s < 1.0:
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    return img

budgets = {
    'maschinen': (420, 420), 'requisiten': (300, 300), 'produkte': (200, 200), 'figuren': (260, 420),
    'oberflaeche': (200, 200), 'effekte': (120, 120),
    # roof and garlands keep their full width: they stretch across the tower
    'deko': (700, 520),
}
for folder, (mw, mh) in budgets.items():
    d = os.path.join(src, folder)
    for f in sorted(os.listdir(d)):
        if f.endswith('.png'):
            img = Image.open(os.path.join(d, f)).convert('RGBA')
            if folder != 'deko':
                img = trim(img)
            save(fit(img, mw, mh), f'winter/{folder}/{f[:-4]}', 84 if folder == 'deko' else 82)

# advent doors: same canvas for all four states, no trimming
for f in sorted(os.listdir(os.path.join(src, 'advent'))):
    p = os.path.join(src, 'advent', f)
    if f.endswith('.png'):
        save(Image.open(p).convert('RGBA'), 'winter/advent/' + f[:-4], 86)
    elif f.endswith('.webp'):
        save(Image.open(p).convert('RGB'), 'winter/advent/' + f[:-5], 78)

for f in sorted(os.listdir(os.path.join(src, 'hintergruende'))):
    if f.endswith('.webp'):
        img = Image.open(os.path.join(src, 'hintergruende', f)).convert('RGB')
        save(fit(img, 1440, 810), 'winter/hintergruende/' + f[:-5], 78)

with open(manifest_path, 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)
print(len(manifest), 'assets in manifest')
