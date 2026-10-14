"""Masthead mark: the full-colour logo (public/assets/masthead.webp) recast
as a one-colour gold duotone, so the small header mark doesn't read as a
fourth team next to the red / green / black-gold party crests.
Re-run after changing the logo: pip install pillow numpy
"""
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
src = Image.open(ROOT / 'public/assets/masthead.webp').convert('RGBA')
a = np.asarray(src).astype(np.float32) / 255
lum = (0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2])
lum = np.clip((lum - 0.08) / 0.8, 0, 1) ** 0.85
# dark bronze -> gold -> bone
stops = np.array([[0.16, 0.11, 0.06], [0.82, 0.66, 0.35], [0.96, 0.91, 0.78]])
t = lum[..., None]
rgb = np.where(t < 0.6, stops[0] + (stops[1] - stops[0]) * (t / 0.6),
               stops[1] + (stops[2] - stops[1]) * ((t - 0.6) / 0.4))
out = np.dstack([rgb, a[..., 3:]]) * 255
img = Image.fromarray(out.astype(np.uint8), 'RGBA')
img = img.crop(img.getchannel('A').getbbox())
img = img.resize((round(img.width * 160 / img.height), 160), Image.LANCZOS)
img.save(ROOT / 'public/assets/masthead-mark.webp', quality=88, method=6)
print('masthead-mark.webp', img.size)
