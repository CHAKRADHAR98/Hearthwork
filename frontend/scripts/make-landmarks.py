#!/usr/bin/env python3
"""Builds public/sprites/spritesheets/landmarks.png: the team-project landmarks.

   * bridge   (128x96, 4x3 tiles): drawn here, a wooden footbridge over a stream
   * fountain (128x128, 4x4 tiles): the village fountain, recast in gold
   * well     (64x96, 2x3 tiles): the village well, turned into a wishing well (coins, sparkles, gold trim)

Run from frontend/:  python3 scripts/make-landmarks.py
"""
import colorsys
from PIL import Image, ImageDraw

SRC = 'public/sprites/spritesheets/village.png'
OUT = 'public/sprites/spritesheets/landmarks.png'

village = Image.open(SRC).convert('RGBA')
sheet = Image.new('RGBA', (512, 128), (0, 0, 0, 0))

GOLD = [(92, 58, 18), (150, 98, 26), (204, 150, 44), (236, 196, 84), (255, 236, 150)]
WATER = (62, 142, 240)
WATER_LIGHT = (126, 190, 255)
WATER_DARK = (40, 104, 200)


def gold_for(lum):
    i = min(len(GOLD) - 1, int(lum * len(GOLD)))
    return GOLD[i]


def sparkle(d, x, y, big=False):
    c, w = (255, 250, 210, 255), (255, 255, 255, 255)
    d.point((x, y), fill=w)
    for k in (1, 2) if big else (1,):
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            d.point((x + dx, y + dy), fill=c)


# ── golden fountain ──
fountain = village.crop((0, 800, 128, 928))
px = fountain.load()
for y in range(fountain.height):
    for x in range(fountain.width):
        r, g, b, a = px[x, y]
        if a == 0:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        is_water = b > r + 30 and b > g
        if not is_water:
            nr, ng, nb = gold_for(v * 0.95)
            px[x, y] = (nr, ng, nb, a)
d = ImageDraw.Draw(fountain)
for x, y, big in ((40, 30, True), (88, 44, False), (60, 70, True), (30, 92, False), (96, 96, True), (70, 20, False)):
    sparkle(d, x, y, big)
sheet.paste(fountain, (128, 0), fountain)

# ── wishing well ──
well = village.crop((384, 160, 448, 256))
d = ImageDraw.Draw(well)
wp = well.load()
# gold trim along the roof's top and bottom beams
for y in range(well.height):
    for x in range(well.width):
        r, g, b, a = wp[x, y]
        if a and y < 50 and (y < 6 or 40 <= y < 46):
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            nr, ng, nb = gold_for(min(1, v * 1.1))
            wp[x, y] = (nr, ng, nb, a)
# coins glinting in the water
for x, y in ((24, 59), (33, 61), (41, 58), (29, 63)):
    d.rectangle((x, y, x + 2, y + 1), fill=(255, 214, 72, 255))
    d.point((x, y), fill=(255, 250, 200, 255))
# a little gold star on the roof
cx, cy = 32, 10
for dx, dy in ((0, -3), (0, -2), (-1, -1), (0, -1), (1, -1), (-3, 0), (-2, 0), (-1, 0), (0, 0), (1, 0), (2, 0), (3, 0), (-1, 1), (0, 1), (1, 1), (-2, 2), (2, 2)):
    d.point((cx + dx, cy + dy), fill=(255, 214, 72, 255))
for x, y, big in ((12, 52, True), (52, 30, False), (50, 70, True)):
    sparkle(d, x, y, big)
sheet.paste(well, (256, 0), well)

# ── wooden bridge over a stream (drawn) ──
bridge = Image.new('RGBA', (128, 96), (0, 0, 0, 0))
d = ImageDraw.Draw(bridge)
STONE = [(110, 100, 92), (150, 140, 128), (188, 180, 166)]
WOOD = [(70, 42, 24), (112, 70, 38), (150, 98, 54), (184, 128, 72)]
# stream with stone banks
d.rectangle((0, 28, 127, 31), fill=STONE[1])
d.line((0, 28, 127, 28), fill=STONE[2])
d.rectangle((0, 32, 127, 63), fill=WATER)
d.rectangle((0, 64, 127, 67), fill=STONE[1])
d.line((0, 67, 127, 67), fill=STONE[0])
for x in range(0, 128, 8):  # bank stone joints
    d.point((x, 30), fill=STONE[0])
    d.point((x + 4, 66), fill=STONE[0])
for x, y in ((6, 38), (20, 52), (100, 42), (112, 56), (10, 58), (116, 36)):  # ripples
    d.line((x, y, x + 6, y), fill=WATER_LIGHT)
# shadow of the deck on the water
d.rectangle((34, 32, 94, 63), fill=WATER_DARK)
# deck planks
d.rectangle((36, 6, 91, 89), fill=WOOD[2])
for y in range(6, 90, 6):
    d.line((36, y, 91, y), fill=WOOD[1])
    d.line((36, y + 1, 91, y + 1), fill=WOOD[3])
    for x in (44, 63, 82):
        d.point((x if (y // 6) % 2 else x + 6, y + 3), fill=WOOD[1])
# rails with posts
for x0 in (31, 92):
    d.rectangle((x0, 4, x0 + 4, 91), fill=WOOD[1])
    d.line((x0, 4, x0, 91), fill=WOOD[3])
    d.line((x0 + 4, 4, x0 + 4, 91), fill=WOOD[0])
    for y in (2, 26, 66, 88):
        d.rectangle((x0 - 1, y, x0 + 5, y + 5), fill=WOOD[0])
        d.rectangle((x0, y + 1, x0 + 4, y + 3), fill=WOOD[2])
# gold plaque on the left rail
d.rectangle((24, 70, 33, 77), fill=GOLD[1])
d.rectangle((25, 71, 32, 76), fill=GOLD[3])
d.line((26, 73, 31, 73), fill=GOLD[1])
sheet.paste(bridge, (0, 0), bridge)

sheet.save(OUT)
print('wrote', OUT, sheet.size)
