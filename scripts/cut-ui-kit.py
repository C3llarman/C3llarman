#!/usr/bin/env python3
"""Cut reference/assets/ui/kit-sheet.png into the web assets in public/assets/ui/.

The sheet is one RGBA image with every piece on true alpha. This script crops
each piece by its box on the sheet and assembles the composite pieces CSS needs:

  frame.webp       9-slice card frame: one corner mirrored to all four, the
                   dark rail stretched between them. Used as border-image on
                   .card::after (slice values are printed below and must match
                   the CSS).
  plate-*.webp     metal / iron / parchment plates, used as 9-slice
                   border-image with `fill` so the painted rusty edges stay
                   put and only the centre stretches.
  stone.webp       page background: the stone square mirrored 2x2 so it tiles
                   with no seam.
  hp-*.webp        HP bar track (9-slice), red fill texture, spiked end caps.
  tab-*.webp       tab bar body (9-slice) and the red enamel active inset.
  velvet.webp      red cloth texture for section pennants.
  emblem/ornament pieces copied through as-is.

Re-run after replacing the sheet:  pip install pillow numpy && python3 scripts/cut-ui-kit.py
"""
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / 'reference/assets/ui/kit-sheet.png'
OUT = ROOT / 'public/assets/ui'
OUT.mkdir(parents=True, exist_ok=True)

im = Image.open(SHEET).convert('RGBA')

def crop(box, trim=True):
    c = im.crop(box)
    return c.crop(c.getbbox()) if trim else c

def save(img, name, max_w=None):
    if max_w and img.width > max_w:
        img = img.resize((max_w, round(img.height * max_w / img.width)), Image.LANCZOS)
    img.save(OUT / f'{name}.webp', 'WEBP', quality=86, method=6)
    print(f'{name}.webp {img.size}')
    return img

# ---- card frame (9-slice) -------------------------------------------------
corner = crop((12, 4, 246, 190))          # top-left, 234x186
rail = crop((464, 98, 960, 171))          # dark rail, 496x73, end caps ~40px
rail_mid = rail.crop((60, 0, rail.width - 60, rail.height))
CW, CH = corner.size
W = H = 2 * max(CW, CH) + 160
frame = Image.new('RGBA', (W, H))
# rails first, corners on top. Corner's top arm sits at y≈24..84, its left
# arm at x≈20..100; the rail's own metal spans y≈8..62 of its 73px.
RT = 64                                   # rail thickness on the canvas
top = rail_mid.resize((W - 2 * 120, RT), Image.LANCZOS)
frame.alpha_composite(top, (120, 22))
frame.alpha_composite(ImageOps.flip(top), (120, H - 22 - RT))
side = top.rotate(90, expand=True).resize((RT, H - 2 * 120), Image.LANCZOS)
frame.alpha_composite(side, (24, 120))
frame.alpha_composite(ImageOps.mirror(side), (W - 24 - RT, 120))
frame.alpha_composite(corner, (0, 0))
frame.alpha_composite(ImageOps.mirror(corner), (W - CW, 0))
frame.alpha_composite(ImageOps.flip(corner), (0, H - CH))
frame.alpha_composite(ImageOps.flip(ImageOps.mirror(corner)), (W - CW, H - CH))
save(frame, 'frame')
print(f'  frame slice: {CH} {CW} (top/bottom, left/right) on {W}x{H}')

# ---- plates (9-slice with fill) --------------------------------------------
save(crop((19, 591, 297, 856)), 'plate-metal')
save(crop((319, 591, 583, 856)), 'plate-iron')
save(crop((604, 591, 874, 855)), 'plate-parch')

# ---- page stone: mirror 2x2 so it tiles seamlessly ------------------------
stone = crop((895, 591, 1151, 856)).crop((14, 14, 242, 250)).convert('RGB')
sw, sh = stone.size
tile = Image.new('RGB', (sw * 2, sh * 2))
tile.paste(stone, (0, 0)); tile.paste(ImageOps.mirror(stone), (sw, 0))
tile.paste(ImageOps.flip(stone), (0, sh)); tile.paste(ImageOps.flip(ImageOps.mirror(stone)), (sw, sh))
save(tile, 'stone')

# ---- HP bar ---------------------------------------------------------------
save(crop((93, 513, 677, 580)), 'hp-track')
fill = crop((93, 444, 677, 510))
save(fill.crop((48, 16, fill.width - 48, fill.height - 16)), 'hp-fill')
save(crop((21, 444, 85, 582)), 'hp-cap-l')
save(crop((685, 444, 749, 582)), 'hp-cap-r')

# ---- section pennant cloth ------------------------------------------------
save(fill.crop((60, 18, 420, fill.height - 18)), 'velvet')

# ---- tab bar ---------------------------------------------------------------
bar = crop((16, 865, 975, 1008))          # 959x143, studs at x≈325 and x≈617
# The sheet paints icons into each segment; icons stay HTML, so both pieces
# are stitched from the plain metal either side of the icon.
def stitch(*boxes):
    parts = [bar.crop((x0, 0, x1, bar.height)) for x0, x1 in boxes]
    out = Image.new('RGBA', (sum(p.width for p in parts), bar.height))
    x = 0
    for p in parts:
        out.alpha_composite(p, (x, 0)); x += p.width
    return out
save(stitch((0, 140), (819, 959)), 'tab-body')         # 9-slice 130 sides
save(stitch((300, 430), (512, 642)), 'tab-active')     # 9-slice 110 sides

# ---- emblems / ornaments, straight copies ---------------------------------
for name, box in {
    'shield': (971, 7, 1173, 347),
    'fleur': (1136, 264, 1251, 442), 'filigree': (957, 330, 1059, 500),
    'spike': (1074, 380, 1135, 490), 'stud': (1227, 423, 1270, 471),
    'boss': (1286, 422, 1336, 474),
}.items():
    save(crop(box), name)
banners = crop((1166, 7, 1531, 416))
save(banners.crop((0, 0, 250, banners.height)).crop(banners.crop((0, 0, 250, banners.height)).getbbox()), 'banner-lion')

# ---- pieces only the concept sheet has (it has true alpha too) -----------
# Its finished frames bake the shield and cloth into the corner, so they
# can't 9-slice - reference only. The divider rod and the angular steel
# brackets are clean, separate pieces.
concept = Image.open(ROOT / 'reference/assets/ui/concept-sheet.png').convert('RGBA')
def ccrop(box):
    c = concept.crop(box)
    return c.crop(c.getbbox())

rod = ccrop((847, 432, 1515, 482))        # brass rod: spiked caps + centre diamond
rh = rod.height
# caps and diamond kept whole; the plain rod between them repeats
save(rod.crop((0, 0, 50, rh)), 'rod-cap-l')
save(rod.crop((rod.width - 50, 0, rod.width, rh)), 'rod-cap-r')
mid = rod.width // 2
save(rod.crop((mid - 26, 0, mid + 26, rh)), 'rod-diamond')
save(rod.crop((120, 0, 220, rh)), 'rod-mid')

save(ccrop((863, 669, 964, 865)), 'bracket-tall')    # Rogue: narrow pointed corner
save(ccrop((1314, 753, 1439, 873)), 'bracket-wing')  # Hunter

# ---- measured grounds for the contrast check ------------------------------
# Text never sits on raw texture: CSS lays a flat tint over each one (values
# below MUST match public/index.html). For each tinted surface we record the
# worst-case pixel (1st percentile for dark text on a light ground, 99th for
# light text on a dark one) and scripts/check-contrast.mjs tests every text
# colour against it - so the check covers the texture, not a flat guess.
import json
import numpy as np

TINTS = {  # surface: (file, inset px, tint hex, tint alpha, text is 'dark'|'light')
    'plate':  ('plate-metal', 34, '#DED6C4', 0.90, 'dark'),
    'parch':  ('plate-parch', 34, '#E2D5B5', 0.80, 'dark'),
    'iron':   ('plate-iron',  30, '#1E1B18', 0.85, 'light'),
    'page':   ('stone',        0, '#14110D', 0.55, 'light'),
    'velvet': ('velvet',       0, '#5A0C16', 0.55, 'light'),
    'tabbar': ('tab-body',    40, '#000000', 0.00, 'light'),
    'tabon':  ('tab-active',  40, '#000000', 0.00, 'light'),
}

def _lum(rgb):
    c = rgb / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]

grounds = {}
for surf, (f, inset, tint, alpha, text) in TINTS.items():
    a = np.asarray(Image.open(OUT / f'{f}.webp').convert('RGB'), float)
    h, w, _ = a.shape
    xi = 120 if f.startswith('tab') else inset   # tab pieces: skip the end caps
    px = a[inset:h - inset, xi:w - xi].reshape(-1, 3)
    t = np.array([int(tint[i:i + 2], 16) for i in (1, 3, 5)], float)
    mixed = alpha * t + (1 - alpha) * px            # CSS blends in sRGB
    lum = _lum(mixed)
    target = np.percentile(lum, 1 if text == 'dark' else 99)
    worst = mixed[np.abs(lum - target).argmin()]
    med = mixed[np.abs(lum - np.median(lum)).argmin()]
    hx = lambda v: '#%02X%02X%02X' % tuple(int(round(x)) for x in v)
    grounds[surf] = {'tint': tint, 'alpha': alpha, 'text': text, 'worst': hx(worst), 'median': hx(med)}
(OUT / 'grounds.json').write_text(json.dumps(grounds, indent=1) + '\n')
print(json.dumps(grounds, indent=1))
