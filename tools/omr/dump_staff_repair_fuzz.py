"""system_repair fuzz for the JS port (js/omr/system_repair.js; tests/omr-staff.test.js, audit).

usage:
  python -I tools/omr/dump_staff_repair_fuzz.py FIXTURES

Writes FIXTURES/15-staff-repair-fuzz.json: random pages of synthetic staffs (grids of StaffPoints
with numpy float64 y values like detect_staff's) - voice + piano systems, quartets, grand
staffs, single staffs, staffs of other widths / shifted / without a shared x position (no
vertical gap), x positions on .5 (round() keys), different unit sizes, tilted - grouped
into random systems (grand staffs merged), and homr's system_repair on each: the helpers
(_possible_grandstaffs strict and not, _vertical_gap, _common_layout, _find_periodic_core,
_regroup_by_pattern, _unify_grand_staffs, _repair_systems, _repair_score) and repair_systems.
"""
import json
import math
import random
import sys

import numpy as np

from homr import system_repair as SR
from homr.debug import Debug
from homr.model import MultiStaff, Staff, StaffPoint

FIX = sys.argv[1]


def F(x):
    if x is None:
        return None
    x = float(x)
    return 'nan' if math.isnan(x) else x


def stf_short(s):
    return {'min_x': F(s.min_x), 'max_x': F(s.max_x), 'min_y': F(s.min_y), 'max_y': F(s.max_y),
            'avg': F(s.average_unit_size), 'grand': bool(s.is_grandstaff), 'n_grid': len(s.grid),
            'n_symbols': len(s.symbols), 'y0': [F(y) for y in s.grid[0].y], 'x0': F(s.grid[0].x)}


def rows(multi):
    return [[stf_short(s) for s in row.staffs] for row in multi]


def repair_info(multi):
    flat = SR._flatten_staffs(multi)
    index = {id(s): i for i, s in enumerate(flat)}
    info = {'flat': len(flat)}
    for strict in (False, True):
        pairs = SR._possible_grandstaffs(multi, strict)
        info['grandstaffs_strict' if strict else 'grandstaffs'] = sorted([index[a], index[b]] for a, b in pairs)
    info['vertical_gaps'] = [F(SR._vertical_gap(u, lo)) for u, lo in zip(flat, flat[1:])]
    layout = SR._common_layout(multi)
    info['common_layout'] = None if layout is None else list(layout)
    core = SR._find_periodic_core(flat)
    info['periodic_core'] = None if core is None else list(core)
    regrouped = SR._regroup_by_pattern(multi)
    info['regrouped'] = None if regrouped is None else rows(regrouped)
    info['unified'] = rows(SR._unify_grand_staffs(multi))
    if layout is not None:
        info['repaired_layout'] = rows(SR._repair_systems(multi, layout))
        info['repair_score'] = F(SR._repair_score(multi, layout))
    return info


def make_page(rnd):
    """-> list of staffs as [[x, [y * 5], angle], ...] (plain floats, written to JSON)"""
    kinds = rnd.choice(['piano', 'voice-piano', 'quartet', 'singles', 'mixed', 'trio-piano'])
    pattern = {'piano': [2], 'voice-piano': [1, 2], 'quartet': [1, 1, 1, 1], 'singles': [1],
               'mixed': None, 'trio-piano': [1, 1, 2]}[kinds]
    n_systems = rnd.randint(1, 5)
    unit = rnd.uniform(8, 22)
    staffs = []
    top = rnd.uniform(40, 200)
    for s in range(n_systems):
        groups = pattern or [rnd.choice([1, 2]) for _ in range(rnd.randint(1, 3))]
        for g in groups:
            for k in range(g):
                u = unit * rnd.uniform(0.93, 1.07)
                x0 = rnd.choice([100] * 8 + [160, 300, 1000]) + (rnd.choice([5, 2.5, 12.5]) if rnd.random() < 0.08 else 0)
                x1 = rnd.choice([1800] * 8 + [1500, 900, 600])
                if x1 <= x0 + 40:
                    x1 = x0 + 200
                tilt = rnd.choice([0.0, 0.0, 0.01, -0.02])
                grid = []
                x = x0
                while x < x1:
                    base = top + tilt * (x - x0)
                    ys = [base + u * i + rnd.choice([0.0, 0.0, rnd.uniform(-0.6, 0.6)]) for i in range(5)]
                    grid.append([x, ys, rnd.choice([0.0, 0.0, rnd.uniform(-1, 1)])])
                    x += 10
                staffs.append(grid)
                top += 4 * u + (rnd.uniform(4, 7) * u if k + 1 < g else rnd.uniform(3, 6) * u)
            top += rnd.uniform(0, 4) * unit
        top += rnd.uniform(2, 10) * unit
    return staffs


def to_staff(grid):
    return Staff([StaffPoint(x, [np.float64(y) for y in ys], angle) for x, ys, angle in grid])


def random_systems(n, rnd):
    systems, row, i = [], [], 0
    while i < n:
        if i + 1 < n and rnd.random() < 0.35:
            row.append([i, i + 1])
            i += 2
        else:
            row.append(i)
            i += 1
        if rnd.random() < 0.5:
            systems.append(row)
            row = []
    if row:
        systems.append(row)
    return systems


def main():
    rnd = random.Random(2026)
    pages = []
    for _ in range(200):
        grids = make_page(rnd)
        staffs = [to_staff(g) for g in grids]
        cases = []
        for _ in range(6):
            systems = random_systems(len(staffs), rnd)
            try:
                multi = [MultiStaff([staffs[it[0]].merge(staffs[it[1]]) if isinstance(it, list) else staffs[it]
                                     for it in row], []) for row in systems]
            except IndexError:
                cases.append({'systems': systems, 'build_error': 'IndexError'})
                continue
            case = {'systems': systems, 'input': rows(multi), 'info': repair_info(multi)}
            try:
                case['repaired'] = rows(SR.repair_systems(Debug(None, 'x.png', False), multi))
            except Exception as e:  # noqa: BLE001
                case['error'] = type(e).__name__ + ': ' + str(e)
            cases.append(case)
        pages.append({'staffs': grids, 'cases': cases})
    with open(FIX + '/15-staff-repair-fuzz.json', 'w') as f:
        json.dump({'pages': pages}, f, separators=(',', ':'))
    n = sum(len(p['cases']) for p in pages)
    print('wrote', n, 'cases on', len(pages), 'pages', file=sys.stderr)


main()
