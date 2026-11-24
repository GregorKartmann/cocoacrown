"""Prepares the expansion pack (floors 6–8 and Rezeptlabor) for the game.

Usage: python3 -I scripts/prepare-expansion.py <expansion-pack-dir> <project-dir>

Run it after scripts/prepare-assets.py: it adds its sprites to the same
folders under src/assets/art/ and merges its sizes into manifest.json.
"""
import json, os, sys
from PIL import Image

src, proj = sys.argv[1], sys.argv[2]
out = os.path.join(proj, 'src', 'assets', 'art')
manifest_path = os.path.join(out, 'manifest.json')
manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}

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

def fit(img, max_w, max_h):
    s = min(1.0, max_w / img.width, max_h / img.height)
    if s < 1.0:
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    return img

def sprite(rel, key, max_w, max_h, do_trim=True, quality=82):
    img = Image.open(os.path.join(src, rel)).convert('RGBA')
    if do_trim:
        img = trim(img)
    save(fit(img, max_w, max_h), key, quality)

# same size budgets as the base pack
groups = {
    'maschinen': (420, 420), 'maschinen/upgrades': (160, 160), 'produkte': (160, 160),
    'requisiten': (260, 260), 'effekte': (220, 220),
    'forschung/symbole': (164, 164), 'forschung': (220, 220),
}
for folder, (mw, mh) in groups.items():
    d = os.path.join(src, folder)
    for f in sorted(os.listdir(d)):
        if not f.endswith('.png'):
            continue
        sprite(f'{folder}/{f}', f'{folder}/{f[:-4]}', mw, mh)

# research node frames: keep their full margins so all six states line up exactly
for f in sorted(os.listdir(os.path.join(src, 'forschung', 'rahmen'))):
    if f.endswith('.png'):
        img = Image.open(os.path.join(src, 'forschung', 'rahmen', f)).convert('RGBA')
        save(img, 'forschung/rahmen/' + f[:-4], 88)

# opaque backgrounds
for f in sorted(os.listdir(os.path.join(src, 'hintergruende'))):
    if f.endswith('.webp'):
        save(Image.open(os.path.join(src, 'hintergruende', f)).convert('RGB'), 'hintergruende/' + f[:-5], 78)
save(Image.open(os.path.join(src, 'forschung', 'labor.webp')).convert('RGB'), 'forschung/labor', 76)

with open(manifest_path, 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)
print(len(manifest), 'assets in manifest')
