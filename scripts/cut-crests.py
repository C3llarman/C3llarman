"""Cut each party's crest into the two sizes the page uses.

  reference/assets/crest-<id>-source.png  (full coat of arms, true alpha)
    -> public/assets/crest-<id>.webp   full crest, for the big landing banner
    -> public/assets/helm-<id>.webp    round helmet medallion, for anything small
                                       (Dungeon map markers, Guild rows)

The full crests have the party name painted on a scroll, which is mush below
~100px, so small placements use the helmet alone. HELM is each helmet's square
crop box in source pixels. Re-run after changing a source: pip install pillow
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
HELM = {
    'emberwatch':      (440, 0, 900, 460),
    'ninth-circle':    (420, 100, 880, 560),
    'ashen-coalition': (440, 40, 940, 540),
}
CREST_W, HELM_PX = 480, 192
# recolour id -> (source party, target hue in degrees)
FROST = {'rimeguard': ('ninth-circle', 200)}
FROST_TAVERN_PX = 400


def medallion(src, box, px):
    """helmet on a dark disc, circle-masked with a slightly soft edge"""
    helm = src.crop(box).resize((px, px), Image.LANCZOS)
    disc = Image.new('RGBA', helm.size, (14, 12, 10, 255))
    disc.alpha_composite(helm)
    mask = Image.new('L', (px * 4,) * 2, 0)
    ImageDraw.Draw(mask).ellipse((4, 4, px * 4 - 5, px * 4 - 5), fill=255)
    disc.putalpha(mask.resize(helm.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(.6 * px / HELM_PX)))
    return disc


def shift_greens(src, hue):
    """move the saturated greens (~60-185 deg) to `hue`; brass and bone stay put"""
    hsv = np.asarray(src.convert('RGB').convert('HSV')).astype(np.float32)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    deg = h * 360 / 255
    w = np.clip((deg - 58) / 14, 0, 1) * np.clip((185 - deg) / 15, 0, 1) * np.clip((s - 30) / 40, 0, 1)
    h = h + (hue * 255 / 360 - h) * w
    s = s * (1 - .2 * w)
    v = np.clip(v * (1 + .1 * w), 0, 255)
    out = Image.fromarray(np.stack([h, s, v], -1).astype(np.uint8), 'HSV').convert('RGBA')
    out.putalpha(src.getchannel('A'))
    return out


for pid, box in HELM.items():
    src = Image.open(ROOT / f'reference/assets/crest-{pid}-source.png').convert('RGBA')
    full = src.crop(src.getchannel('A').getbbox())
    full.resize((CREST_W, round(full.height * CREST_W / full.width)), Image.LANCZOS) \
        .save(ROOT / f'public/assets/crest-{pid}.webp', quality=84, method=6)

    medallion(src, box, HELM_PX).save(ROOT / f'public/assets/helm-{pid}.webp', quality=86, method=6)
    print(pid, full.size, '->', CREST_W)

for pid, (base, hue) in FROST.items():
    src = shift_greens(Image.open(ROOT / f'reference/assets/crest-{base}-source.png').convert('RGBA'), hue)
    src = src.transpose(Image.FLIP_LEFT_RIGHT)
    x0, y0, x1, y1 = HELM[base]
    box = (src.width - x1, y0, src.width - x0, y1)
    medallion(src, box, HELM_PX).save(ROOT / f'public/assets/helm-{pid}.webp', quality=86, method=6)
    medallion(src, box, FROST_TAVERN_PX).save(ROOT / f'public/assets/crest-{pid}.webp', quality=84, method=6)
    print(pid, f'recoloured from {base}')
