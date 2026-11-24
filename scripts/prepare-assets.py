"""Prepares the painted asset pack for the game.

Usage: python3 -I scripts/prepare-assets.py <pack-dir> <project-dir>

- trims transparent margins so bottom-centre anchors sit on the visible feet/base
- scales every sprite to the largest size the game ever shows it at (≈ 2.5× DPR)
- re-encodes as WebP with alpha (≈ 10× smaller than the source PNGs)
- crops head-and-shoulder portraits from the figure sprites for managers
- writes src/assets/art/manifest.json with the final pixel sizes
"""
import json, os, sys
from PIL import Image

src, proj = sys.argv[1], sys.argv[2]
out = os.path.join(proj, 'src', 'assets', 'art')
os.makedirs(out, exist_ok=True)
manifest = {}

def save(img, key, quality=82):
    path = os.path.join(out, key + '.webp')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, 'WEBP', quality=quality, method=6)
    manifest[key] = {'w': img.width, 'h': img.height}

def trim(img, pad=2):
    if img.mode != 'RGBA':
        return img
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

groups = {
    'maschinen': (420, 420), 'maschinen/upgrades': (160, 160), 'logistik': (360, 360),
    'figuren': (200, 220), 'figuren/laufposen': (200, 220), 'produkte': (160, 160),
    'requisiten': (260, 260), 'gebaeude': (900, 700), 'effekte': (220, 220), 'oberflaeche': (128, 128),
}
for folder, (mw, mh) in groups.items():
    d = os.path.join(src, folder)
    for f in sorted(os.listdir(d)):
        if not f.endswith('.png'):
            continue
        name = f[:-4]
        rel = f'{folder}/{f}'
        key = f'{folder}/{name}'
        if folder == 'oberflaeche' and name in ('dialog_elfenbein', 'button_bordeaux', 'button_petrol', 'hud_espresso'):
            # 9-slice frames: keep full size and margins, PNG-quality WebP
            img = Image.open(os.path.join(src, rel)).convert('RGBA')
            save(img, key, 90)
            continue
        if folder == 'gebaeude' and name == 'aufzugsschacht':
            sprite(rel, key, 220, 420, do_trim=False)
            continue
        sprite(rel, key, mw, mh)

# Backgrounds (opaque, wide)
for f in sorted(os.listdir(os.path.join(src, 'hintergruende'))):
    if f.endswith('.webp'):
        img = Image.open(os.path.join(src, 'hintergruende', f)).convert('RGB')
        save(img, 'hintergruende/' + f[:-5], 78)

# Manager portraits: square head-and-shoulders crops from the full figures
PORTRAITS = {
    'managerin_produktion': 0.50, 'managerin_versand': 0.52, 'meisterin': 0.50, 'chocolatiere': 0.50,
    'arbeiterin_sack': 0.40, 'vorarbeiter': 0.50, 'inhaber': 0.44, 'fahrer': 0.45, 'arbeiter_schaufel': 0.47,
}
for name, cx_rel in PORTRAITS.items():
    img = trim(Image.open(os.path.join(src, 'figuren', name + '.png')).convert('RGBA'), 0)
    w, h = img.size
    size = int(h * 0.36)
    cx = int(w * cx_rel)
    box = (cx - size // 2, 0, cx + size // 2, size)
    crop = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    region = img.crop((max(0, box[0]), 0, min(w, box[2]), size))
    crop.paste(region, (max(0, -box[0]), 0))
    save(crop.resize((192, 192), Image.LANCZOS), 'portraits/' + name, 86)
bust = Image.open(os.path.join(src, 'oberflaeche', 'manager.png')).convert('RGBA')
bust = trim(bust, 0)
sq = max(bust.size)
canvas = Image.new('RGBA', (sq, sq), (0, 0, 0, 0))
canvas.paste(bust, ((sq - bust.width) // 2, sq - bust.height))
save(canvas.resize((192, 192), Image.LANCZOS), 'portraits/herr_direktor', 86)

with open(os.path.join(out, 'manifest.json'), 'w') as fh:
    json.dump(manifest, fh, indent=1, sort_keys=True)

# App icons go to public/ unchanged
pub = os.path.join(proj, 'public')
ic = os.path.join(src, 'app-icons')
for f, dest in [('icon-192.png', 'icon-192.png'), ('icon-512.png', 'icon-512.png'), ('icon-maskable-512.png', 'icon-maskable-512.png'), ('apple-touch-icon.png', 'apple-touch-icon.png'), ('favicon-32.png', 'favicon-32.png')]:
    Image.open(os.path.join(ic, f)).save(os.path.join(pub, dest))
print(len(manifest), 'assets written')
