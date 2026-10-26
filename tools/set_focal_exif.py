"""Пишет FocalLengthIn35mmFilm (0xA405) в Exif IFD (0x8769) и в IFD0.

    python set_focal_exif.py <in.jpg> <out.jpg> <f_px>

f35 = f_px / width_px * 36. Без этого тега SHARP молча берёт 30 мм.
Запускать из venv Depth Pro (там есть Pillow).
"""
import sys
from PIL import Image

src, dst, f_px = sys.argv[1], sys.argv[2], float(sys.argv[3])
im = Image.open(src).convert("RGB")
f35 = max(1, round(f_px / im.width * 36))
exif = im.getexif()
exif[0xA405] = f35
exif.get_ifd(0x8769)[0xA405] = f35
im.save(dst, quality=97, exif=exif)
print(f"{im.width}px, f_px {f_px:.1f} -> f35 {f35} mm")
