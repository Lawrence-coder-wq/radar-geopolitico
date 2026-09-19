# -*- coding: utf-8 -*-
"""Disegna l'icona di GeoLaw (globo scuro con meridiani, bordo rosso e segnale radar) e la salva come .ico."""
import math
import os
from PIL import Image, ImageDraw, ImageFilter

QUI = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
L = 1024                      # si disegna grande e poi si rimpicciolisce: bordi puliti
C = L // 2
ROSSO = (255, 59, 78)
VERDE = (61, 255, 139)

img = Image.new("RGBA", (L, L), (0, 0, 0, 0))

# fondo: quadrato arrotondato quasi nero
fondo = ImageDraw.Draw(img)
fondo.rounded_rectangle([24, 24, L - 24, L - 24], radius=210, fill=(7, 10, 14, 255), outline=(42, 51, 64, 255), width=10)

# alone rosso dietro al globo
alone = Image.new("RGBA", (L, L), (0, 0, 0, 0))
ImageDraw.Draw(alone).ellipse([C - 380, C - 380, C + 380, C + 380], fill=ROSSO + (120,))
img.alpha_composite(alone.filter(ImageFilter.GaussianBlur(60)))

# globo
R = 330
globo = Image.new("RGBA", (L, L), (0, 0, 0, 0))
g = ImageDraw.Draw(globo)
g.ellipse([C - R, C - R, C + R, C + R], fill=(11, 22, 36, 255))
for k in (0.34, 0.7):                                   # meridiani
    g.ellipse([C - R * k, C - R, C + R * k, C + R], outline=VERDE + (150,), width=9)
g.line([C, C - R, C, C + R], fill=VERDE + (150,), width=9)
for k in (0.0, 0.5, -0.5):                              # paralleli
    y = C + R * k
    mezza = math.sqrt(max(0, R * R - (R * k) ** 2))
    g.line([C - mezza, y, C + mezza, y], fill=VERDE + (150,), width=9)
maschera = Image.new("L", (L, L), 0)
ImageDraw.Draw(maschera).ellipse([C - R, C - R, C + R, C + R], fill=255)
img.paste(globo, (0, 0), maschera)
d = ImageDraw.Draw(img)
d.ellipse([C - R, C - R, C + R, C + R], outline=ROSSO + (255,), width=22)

# segnale radar: punto rosso con due anelli, in alto a destra (zona Medio Oriente)
px, py = C + 120, C - 70
for raggio, alfa in ((150, 90), (96, 170)):
    anello = Image.new("RGBA", (L, L), (0, 0, 0, 0))
    ImageDraw.Draw(anello).ellipse([px - raggio, py - raggio, px + raggio, py + raggio], outline=ROSSO + (alfa,), width=14)
    img.alpha_composite(anello)
d.ellipse([px - 44, py - 44, px + 44, py + 44], fill=ROSSO + (255,), outline=(255, 255, 255, 255), width=10)

img = img.resize((256, 256), Image.LANCZOS)
img.save(os.path.join(QUI, "geolaw.ico"), sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)])
img.save(os.path.join(QUI, "web", "icona.png"))
print("icona creata")
