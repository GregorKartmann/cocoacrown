"""Prepares the pack "Etagen 9 und 10" (Skulpturen-Atelier, Schokoladen-Galerie).

Usage: python3 -I scripts/prepare-floors910.py <etagen-9-10-pack-dir> <project-dir>

Run after the other prepare-* scripts. The sprites come trimmed already; they
are only scaled to the same budgets as the base and expansion packs, so the
relative attachment points from the pack's assets.json stay valid.
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


def fit(img, max_w, max_h):
    s = min(1.0, max_w / img.width, max_h / img.height)
    if s < 1.0:
        img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    return img


def sprite(rel, key, max_w, max_h):
    save(fit(Image.open(os.path.join(src, rel)).convert('RGBA'), max_w, max_h), key)


# rooms: same 1024 × 512 as the other floors (floor line ≈ 458)
for name, key in [('skulpturen_atelier', 'etage_skulpturen'), ('schokoladen_galerie', 'etage_galerie')]:
    img = Image.open(os.path.join(src, 'hintergruende', name + '.webp')).convert('RGB').resize((1024, 512), Image.LANCZOS)
    save(img, 'hintergruende/' + key, 78)

for f in ['giessformen_karussell', 'praegeanlage']:
    sprite(f'maschinen/{f}.png', f'maschinen/{f}', 420, 420)
for f in ['formteller', 'praegewalze']:
    sprite(f'maschinen/teile/{f}.png', f'maschinen/teile/{f}', 320, 320)
for f in ['schwan', 'loewe', 'relief_kakao', 'relief_stadt']:
    sprite(f'produkte/{f}.png', f'produkte/{f}', 160, 160)
for f in ['formen_werkbank', 'galerie_sockel', 'galerieleuchte', 'restaurierung_wagen']:
    sprite(f'requisiten/{f}.png', f'requisiten/{f}', 260, 260)
for f in ['bildhauerin', 'kuratorin', 'restaurator']:
    sprite(f'figuren/{f}.png', f'figuren/{f}', 220, 220)
for f in ['kaeltenebel_01', 'kaeltenebel_02', 'kaeltenebel_03', 'galerie_lichtkegel', 'galerie_lichtfleck']:
    sprite(f'effekte/{f}.png', f'effekte/{f}', 220, 220)
# the base pack already has effekte/goldglanz
sprite('effekte/goldglanz.png', 'effekte/galerie_glanz', 220, 220)

with open(manifest_path, 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)
print(len(manifest), 'assets in manifest')
