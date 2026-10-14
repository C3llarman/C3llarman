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
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
HELM = {
    'emberwatch':      (440, 0, 900, 460),
    'ninth-circle':    (420, 100, 880, 560),
    'ashen-coalition': (440, 40, 940, 540),
}
CREST_W, HELM_PX = 480, 192

for pid, box in HELM.items():
    src = Image.open(ROOT / f'reference/assets/crest-{pid}-source.png').convert('RGBA')
    full = src.crop(src.getchannel('A').getbbox())
    full.resize((CREST_W, round(full.height * CREST_W / full.width)), Image.LANCZOS) \
        .save(ROOT / f'public/assets/crest-{pid}.webp', quality=84, method=6)

    # helmet on a dark disc, circle-masked with a slightly soft edge
    helm = src.crop(box).resize((HELM_PX, HELM_PX), Image.LANCZOS)
    disc = Image.new('RGBA', helm.size, (14, 12, 10, 255))
    disc.alpha_composite(helm)
    mask = Image.new('L', (HELM_PX * 4,) * 2, 0)
    ImageDraw.Draw(mask).ellipse((4, 4, HELM_PX * 4 - 5, HELM_PX * 4 - 5), fill=255)
    disc.putalpha(mask.resize(helm.size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(.6)))
    disc.save(ROOT / f'public/assets/helm-{pid}.webp', quality=86, method=6)
    print(pid, full.size, '->', CREST_W)
