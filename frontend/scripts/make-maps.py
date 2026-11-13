#!/usr/bin/env python3
"""Builds Hearthwork's default maps from the game's own sprite sheets.

   * frontend/utils/defaultmap.json            the office every new office starts with
   * backend/src/village/defaultMarket.json    the Market Square room (offices that never customised theirs)

Both stay editable in the map editor. Run from the repo root:  python3 frontend/scripts/make-maps.py
"""
import json
import os
import random

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')

SIZES = {  # object footprints in tiles (w, h), anchored at the bottom-left tile
    'grasslands-basic_tree': (3, 3), 'grasslands-light_basic_tree': (3, 3), 'grasslands-short_basic_tree': (3, 3),
    'grasslands-short_light_basic_tree': (3, 3), 'grasslands-basic_tree_bundle': (5, 5), 'grasslands-light_basic_tree_bundle': (5, 5),
    'grasslands-big_rock_1': (2, 2), 'grasslands-big_rock_2': (2, 2), 'grasslands-big_rock_3': (2, 2), 'grasslands-big_rock_4': (2, 2),
    'grasslands-big_rock_5': (2, 2), 'grasslands-big_rock_6': (2, 2), 'grasslands-stone_tall_1': (1, 2), 'grasslands-big_wood_table': (2, 2),
    'village-house_red': (8, 7), 'village-house_blue': (8, 5), 'village-house_grey': (8, 5), 'village-house_blue_wide': (10, 5),
    'village-house_grey_wide': (10, 5), 'village-house_blue_small': (4, 5), 'village-house_grey_small': (4, 5),
    'village-stall_flags': (8, 4), 'village-stall_small': (4, 4), 'village-stall_long': (10, 4), 'village-wheat_tall': (1, 3),
    'village-wheat_row': (3, 1), 'village-log_pile': (2, 3), 'village-small_fountain': (3, 4), 'village-lamp_post_right_on': (2, 2),
    'village-lamp_post_left_off': (2, 2), 'village-three_boxes': (2, 2), 'village-well_no_top_filled': (2, 2), 'village-filled_water_trough': (2, 1),
    'village-sign_1': (1, 2), 'village-sign_2': (1, 2), 'village-sign_3': (1, 2), 'village-sign_4': (1, 2),
}
FLOWERS = [f'grasslands-{c}_flower_{i}' for c in ('iight_green', 'vibrant_green', 'blue') for i in range(1, 7)]
SMALL = ['grasslands-foliage_%d' % i for i in (1, 2, 3, 4, 9, 10, 11, 12)] + ['grasslands-pebbles_%d' % i for i in (1, 2, 5)] + ['grasslands-stone_%d' % i for i in (1, 2, 4)]
STONE = ['village-light_stone_tile_%d' % i for i in range(1, 10)]
TREES = ['grasslands-basic_tree', 'grasslands-light_basic_tree', 'grasslands-short_basic_tree', 'grasslands-short_light_basic_tree']


class Room:
    def __init__(self, name, w, h, floor='ground-normal_detailed_grass', pad=0):
        self.name, self.w, self.h = name, w, h
        self.t = {}
        self.used = set()  # tiles covered by objects
        for x in range(-pad, w + pad):
            for y in range(-pad, h + pad):
                self.tile(x, y)['floor'] = floor

    def tile(self, x, y):
        return self.t.setdefault(f'{x}, {y}', {})

    def free(self, x, y, w=1, h=1):
        return all((x + dx, y - dy) not in self.used and f'{x + dx}, {y - dy}' in self.t for dx in range(w) for dy in range(h))

    def clean(self, x, y, w, h):
        """No paving or special tiles under a footprint (trees never grow on paths, gates or desks)."""
        for dx in range(w):
            for dy in range(h):
                t = self.t.get(f'{x + dx}, {y - dy}')
                if t is None or t.get('above_floor') or t.get('floor', '').endswith('dirt') or any(k in t for k in ('villageId', 'villageSpot', 'villageExit', 'privateAreaId', 'impassable')):
                    return False
        return True

    def obj(self, x, y, name, force=False):
        w, h = SIZES.get(name, (1, 1))
        if not force and not self.free(x, y, w, h):
            return False
        if not force and 'tree' in name and not self.clean(x, y, w, h):
            return False
        self.tile(x, y)['object'] = name
        for dx in range(w):
            for dy in range(h):
                self.used.add((x + dx, y - dy))
        return True

    def floor(self, x0, y0, x1, y1, name):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                self.tile(x, y)['floor'] = name

    def pave(self, x0, y0, x1, y1):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                self.tile(x, y)['above_floor'] = random.choice(STONE)

    def mark(self, x0, y0, x1, y1, **kv):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                self.tile(x, y).update(kv)

    def wall(self, x0, y0, x1, y1, keep=()):
        """A wooden fence around a rectangle, with gaps at `keep` tiles."""
        for x in range(x0, x1 + 1):
            for y in (y0, y1):
                if (x, y) in keep: continue
                n = 'tl' if (x, y) == (x0, y0) else 'tr' if (x, y) == (x1, y0) else 'bl' if (x, y) == (x0, y1) else 'br' if (x, y) == (x1, y1) else ('top' if y == y0 else 'bottom')
                self.obj(x, y, f'grasslands-fence_{n}', force=True); self.tile(x, y)['impassable'] = True
        for y in range(y0 + 1, y1):
            for x in (x0, x1):
                if (x, y) in keep: continue
                self.obj(x, y, f'grasslands-fence_{"left" if x == x0 else "right"}', force=True); self.tile(x, y)['impassable'] = True

    def sprinkle(self, x0, y0, x1, y1, names, n):
        for _ in range(n * 6):
            if n <= 0: break
            x, y = random.randint(x0, x1), random.randint(y0, y1)
            t = self.tile(x, y)
            if (x, y) in self.used or t.get('above_floor') or any(k in t for k in ('villageSpot', 'villageExit', 'villageId', 'teleporter')): continue
            if self.obj(x, y, random.choice(names)): n -= 1

    def forest(self, x0, y0, x1, y1, density=0.55, keep_out=()):
        """A thick wood: big tree clumps first, single trees in the gaps (bottom rows first so canopies overlap nicely)."""
        for y in range(y1, y0 - 1, -3):
            for x in range(x0, x1 + 1, 4):
                if random.random() < density:
                    self.obj(x + random.randint(-1, 1), y + random.randint(-1, 0), random.choice(['grasslands-basic_tree_bundle', 'grasslands-light_basic_tree_bundle']))
        for y in range(y1, y0 - 1, -2):
            for x in range(x0, x1 + 1, 2):
                if random.random() < density: self.obj(x, y, random.choice(TREES))

    def json(self, **extra):
        return {'name': self.name, 'tilemap': self.t, **extra}


# ═════════════════════════════ the office ═════════════════════════════
def stone_wall(r, x0, y0, x1, y1, keep=()):
    """The grey stone wall pieces (grasslands), with gaps at `keep`."""
    for x in range(x0, x1 + 1):
        for y in (y0, y1):
            if (x, y) in keep: continue
            n = 'tl' if (x, y) == (x0, y0) else 'tr' if (x, y) == (x1, y0) else 'bl' if (x, y) == (x0, y1) else 'br' if (x, y) == (x1, y1) else ('top' if y == y0 else 'bottom')
            r.obj(x, y, f'grasslands-stone_wall_{n}', force=True); r.tile(x, y)['impassable'] = True
    for y in range(y0 + 1, y1):
        for x in (x0, x1):
            if (x, y) in keep: continue
            r.obj(x, y, f'grasslands-stone_wall_{"left" if x == x0 else "right"}', force=True); r.tile(x, y)['impassable'] = True


def office():
    W, H = 50, 40
    r = Room('Office', W, H)
    r.pave(23, 4, 26, 34); r.pave(6, 20, 43, 21); r.pave(18, 15, 31, 26)
    r.obj(23, 22, 'village-small_fountain', force=True)
    for lx, ly in ((18, 16), (30, 16), (18, 26), (30, 26)): r.obj(lx, ly, 'village-lamp_post_right_on')
    for bx, by in ((20, 18), (28, 18), (20, 24), (28, 24)): r.obj(bx, by, 'village-bench_left' if bx < 24 else 'village-bench_right')
    # gate to the Market Square
    r.mark(24, 3, 25, 3, villageId='village')
    r.obj(21, 5, 'village-lamp_post_right_on'); r.obj(27, 5, 'village-lamp_post_right_on')
    r.obj(22, 7, 'village-sign_2'); r.obj(27, 7, 'grasslands-arrow_sign_right')
    for x in (20, 21, 28, 29): r.obj(x, 8, random.choice(FLOWERS))
    # west: Focus garden (fenced patio, 4 desk pods, private area)
    r.floor(5, 8, 16, 17, 'ground-detailed_dirt'); r.pave(6, 9, 15, 16)
    r.wall(5, 8, 16, 17, keep=((16, 12), (16, 13)))
    for dx, dy in ((7, 11), (11, 11), (7, 15), (11, 15)):
        r.obj(dx + 1, dy, 'grasslands-big_wood_table', force=True)
        r.obj(dx, dy, 'grasslands-big_wood_stool'); r.obj(dx + 3, dy, 'grasslands-big_wood_stool')
    r.mark(6, 9, 15, 16, privateAreaId='focus')
    r.obj(13, 10, 'village-three_boxes')
    # east: Meeting court (stone walls, long table, private area)
    r.pave(33, 9, 43, 18)
    stone_wall(r, 32, 8, 44, 19, keep=((37, 19), (38, 19), (39, 19)))
    for x in range(35, 42):
        for y, n in ((12, 'top'), (13, 'bottom')):
            r.tile(x, y)['object'] = f'grasslands-long_wood_table_{n}'; r.used.add((x, y)); r.tile(x, y)['impassable'] = True
    for x in range(35, 42, 2):
        r.obj(x, 11, 'grasslands-small_wood_stool'); r.obj(x, 14, 'grasslands-small_wood_stool')
    r.mark(33, 9, 43, 18, privateAreaId='meeting')
    r.obj(33, 17, 'village-lamp_post_left_off'); r.obj(42, 17, 'village-lamp_post_right_on'); r.obj(34, 10, 'village-three_boxes')
    r.obj(41, 10, 'village-sign_3')
    # south-west: Lounge (benches round a little pond)
    r.floor(6, 25, 16, 33, 'ground-detailed_dirt')
    r.obj(10, 30, 'village-well_no_top_filled', force=True); r.mark(10, 29, 11, 30, impassable=True)
    for bx, by, b in ((8, 29, 'village-bench_right'), (13, 29, 'village-bench_left'), (8, 31, 'village-bench_right'), (13, 31, 'village-bench_left')):
        r.obj(bx, by, b)
    r.obj(6, 26, 'village-crate'); r.obj(7, 26, 'village-small_crate'); r.obj(15, 33, 'village-three_boxes')
    r.sprinkle(6, 25, 16, 33, FLOWERS, 6)
    # south-east: Team garden (fenced flower beds, a trough and benches)
    r.wall(32, 25, 46, 34, keep=((39, 25), (40, 25)))
    for y in (27, 29, 31, 33):
        for x in range(34, 45):
            if x in (39, 40): continue
            r.obj(x, y, random.choice(FLOWERS[:6] if y in (27, 31) else FLOWERS[12:]))
    r.pave(39, 26, 40, 33)
    r.obj(41, 23, 'village-mailbox'); r.obj(33, 23, 'village-bench_right'); r.obj(45, 23, 'village-bench_left')
    # nature
    r.forest(-1, 2, W, 4, 0.95); r.forest(-1, H - 1, W, H - 1, 0.95)
    r.forest(-1, 6, 3, H - 2, 0.95); r.forest(W - 5, 6, W - 1, H - 2, 0.95)
    for x, y in ((17, 6), (30, 8), (19, 34), (30, 36)): r.obj(x, y, random.choice(TREES))
    for x, y in ((14, 5), (31, 22), (44, 22), (4, 19)): r.obj(x, y, 'grasslands-big_rock_%d' % random.randint(1, 6))
    r.sprinkle(3, 3, W - 4, H - 4, FLOWERS, 60)
    r.sprinkle(3, 3, W - 4, H - 4, SMALL, 40)
    return {'spawnpoint': {'roomIndex': 0, 'x': 24, 'y': 28}, 'rooms': [r.json()]}


def market():
    W, H = 38, 31
    r = Room('Market Square', W, H, pad=12)
    spots = {}
    # building sites for the team projects (see LANDMARKS in backend/src/village/marketRoom.ts): fountain mid-plaza,
    # bridge and well either side of the exit road. Nothing is placed on them.
    keep_clear = {(x, y) for x in range(20, 26) for y in range(16, 22)} | {(x, y) for x in range(11, 17) for y in range(26, 31)} | {(x, y) for x in range(22, 26) for y in range(26, 31)}
    for (x, y) in keep_clear: r.used.add((x, y))
    r.pave(11, 12, 34, 22); r.pave(18, 23, 20, H - 1)
    # shop row: a stone wall behind the shop lane, each shop with crates, a sign and a lamp
    r.floor(1, 7, 36, 11, 'ground-detailed_dirt')
    stone_wall(r, 1, 6, 36, 6)
    for sid, x in (('farmer', 3), ('baker', 11), ('smith', 20), ('tailor', 28)):
        spots[sid] = (x + 3, 11)
        r.obj(x + 1, 8, 'village-three_boxes'); r.obj(x + 5, 8, 'village-crate'); r.obj(x + 5, 9, 'village-small_crate')
        r.obj(x + 3, 8, 'village-sign_%d' % random.randint(1, 4))
    for x in (9, 18, 26, 34): r.obj(x, 11, 'village-lamp_post_right_on')
    # wheat field: fenced, rows of green shoots
    r.floor(1, 13, 9, 20, 'ground-detailed_dirt')
    r.wall(1, 13, 9, 20, keep=((9, 17), (9, 18)))
    for y in (15, 17, 19):
        for x in range(2, 9):
            r.obj(x, y, random.choice(['grasslands-foliage_2', 'grasslands-foliage_3', 'grasslands-foliage_4', 'grasslands-iight_green_flower_2']))
    spots['field'] = (10, 17)
    # iron mine: rocky outcrop
    for x, y, n in ((30, 15, 1), (32, 15, 3), (34, 16, 5), (31, 17, 6), (35, 18, 2), (33, 13, 4), (35, 21, 1)):
        r.obj(x, y, 'grasslands-big_rock_%d' % n, force=True)
    r.obj(29, 18, 'grasslands-stone_tall_1'); r.obj(36, 14, 'grasslands-stone_tall_2')
    spots['mine'] = (28, 19)
    # fishing pond + Nell's corner
    for x in (2, 4, 6):
        r.obj(x, 29, 'village-well_no_top_filled', force=True); r.mark(x, 28, x + 1, 29, impassable=True)
    r.obj(1, 26, 'village-crate'); r.obj(1, 27, 'village-small_crate'); r.obj(7, 23, 'village-three_boxes'); r.obj(3, 23, 'village-sign_1')
    spots['fishmonger'] = (5, 25)
    spots['dock'] = (9, 28)
    # sheep pasture
    r.wall(27, 24, 36, 29, keep=((27, 26), (27, 27)))
    r.sprinkle(28, 25, 35, 28, FLOWERS, 10)
    r.obj(32, 27, 'village-filled_water_trough')
    spots['pasture'] = (26, 26)
    # plaza life
    for x, y, n in ((13, 15, 'village-bench_right'), (13, 19, 'village-bench_right'), (31, 21, 'village-bench_left'), (16, 22, 'village-sign_4')): r.obj(x, y, n)
    for x, y in ((12, 13), (17, 13), (25, 13), (12, 21), (27, 22), (33, 22)): r.obj(x, y, random.choice(FLOWERS))
    r.mark(19, H - 1, 19, H - 1, villageExit=True)
    r.obj(16, H - 2, 'village-lamp_post_right_on'); r.obj(21, H - 2, 'village-lamp_post_right_on')
    r.forest(-12, -12, W + 10, -1, 0.9); r.forest(-12, 0, -2, H + 10, 0.9); r.forest(W + 1, 0, W + 10, H + 10, 0.9)
    r.forest(-12, H + 2, 15, H + 10, 0.9); r.forest(23, H + 2, W + 10, H + 10, 0.9)
    r.sprinkle(1, 13, W - 2, H - 2, FLOWERS, 25); r.sprinkle(1, 13, W - 2, H - 2, SMALL, 15)
    for (x, y) in keep_clear: r.used.discard((x, y))
    # players stay inside the square (the wood around it is scenery); the exit road stays open
    for x in range(-12, W + 12):
        for y in range(-12, H + 12):
            if (x < 0 or x >= W or y < 0 or y >= H) and not (y == H and 18 <= x <= 20): r.tile(x, y)['impassable'] = True
    for sid, (x, y) in spots.items(): r.tile(x, y)['villageSpot'] = sid
    return r.json(market=True), spots



if __name__ == '__main__':
    import sys
    random.seed(11)
    o = office()
    m, spots = market()
    for room in o['rooms'] + [m]:  # only tiles every editor already has
        for t in room['tilemap'].values():
            assert not t.get('object', '').split('-', 1)[-1].startswith(('house_', 'stall_', 'wheat_', 'pier', 'deck', 'log_pile')), t
    out = sys.argv[1] if len(sys.argv) > 1 else None
    if out:  # preview only
        json.dump(o, open(os.path.join(out, 'office-new.json'), 'w'))
        json.dump({'spawnpoint': {'roomIndex': 0, 'x': 0, 'y': 0}, 'rooms': [m]}, open(os.path.join(out, 'market-new.json'), 'w'))
    else:
        json.dump(o, open(os.path.join(ROOT, 'frontend/utils/defaultmap.json'), 'w'), separators=(',', ':'))
        json.dump(m, open(os.path.join(ROOT, 'backend/src/village/defaultMarket.json'), 'w'), separators=(',', ':'))
    print('spots', spots)
