"""Fuzz reference for the Delaunay triangulation of homr's staff dewarping (js/omr/staff_dewarping.js:
_Subdiv2D, DelaunayTriangulation, PiecewiseAffineTransform; tests/omr-read.test.js).

usage: python -I tools/omr/dump_read_delaunay.py FIXTURES [--n 400] [--seed 7]

homr triangulates the dewarp grid with cv2.Subdiv2D (opencv.js has no Subdiv2D, the JS port is a
line-by-line port of OpenCV 5's subdivision2d.cpp). warp_image paints triangle after triangle and
inverse_transform_point takes the first triangle that holds the point, so the ORDER of the triangle
list matters, not only the set. This writes FIXTURES/40-read-delaunay-fuzz.json: for each point
set the raw Subdiv2D run (rect, insert ids, getTriangleList in order), DelaunayTriangulation's
simplices and PiecewiseAffineTransform's matrices onto displaced points, plus inverse_transform_point
on probe points. Point sets: dewarp grids like calculate_dewarp_transformation builds (image edges,
first/last points, rows every 80 px with staff-curve offsets), lattices with jitter (near-cocircular
cells), random integers, random floats, clusters with duplicates.
"""
import argparse
import json
import os
import random

import cv2
import numpy as np

from homr import staff_dewarping as SDW

ap = argparse.ArgumentParser()
ap.add_argument('fixtures')
ap.add_argument('--n', type=int, default=400)
ap.add_argument('--seed', type=int, default=7)
A = ap.parse_args()


def F(x):
    return float(x)


def subdiv(points):
    points = np.array(points, dtype=np.float32)
    rect = cv2.boundingRect(points.reshape(-1, 1, 2))
    rect = (rect[0] - 10, rect[1] - 10, rect[2] + 20, rect[3] + 20)
    s = cv2.Subdiv2D(rect)
    ids = [int(s.insert((float(p[0]), float(p[1])))) for p in points]
    return {'rect': [int(v) for v in rect], 'ids': ids, 'list': [[F(v) for v in t] for t in s.getTriangleList()]}


def dewarp_grid(rng):
    w = rng.randint(300, 1500)
    h = rng.randint(60, 320)
    rows = rng.randint(0, 6)
    src, dst = [], []
    for r in range(rows):
        y = 2 + r * max(1, h // 6)
        line_s, line_d = [], []
        drift = rng.uniform(-3, 3)
        for x in range(2, w, 80):
            if x < 10 or x > w - 10:
                continue
            dy = int(drift * (x / 300.0) + rng.choice((0, 0, 0, 1, -1)))
            line_s.append((x, y + dy))
        if len(line_s) > 2:
            avg = int(sum(p[1] for p in line_s) / len(line_s))
            line_d = [(p[0], avg) for p in line_s]
            src.append(line_s)
            dst.append(line_d)
    for lines in (src, dst):
        for line in lines:
            line.insert(0, (0, line[0][1]))
            line.append((w, line[-1][1]))
        lines.insert(0, [(0, 0), (w, 0)])
        lines.append([(0, h), (w, h)])
    return [list(p) for line in src for p in line], [list(p) for line in dst for p in line], (h, w)


def main():
    rng = random.Random(A.seed)
    cases = []
    kinds = ['dewarp', 'dewarp', 'dewarp', 'lattice', 'int', 'float', 'cluster']
    for k in range(A.n):
        kind = kinds[k % len(kinds)]
        if kind == 'dewarp':
            pts, dst, _hw = dewarp_grid(rng)
        elif kind == 'lattice':
            nx, ny, sx, sy = rng.randint(2, 12), rng.randint(2, 7), rng.choice((40, 50, 80)), rng.choice((30, 50))
            j = rng.choice((0, 0, 1, 2))
            pts = [[x * sx + rng.randint(-j, j), y * sy + rng.randint(-j, j)] for y in range(ny) for x in range(nx)]
            dst = [[p[0] + rng.randint(-4, 4), p[1] + rng.randint(-4, 4)] for p in pts]
        elif kind == 'int':
            n = rng.randint(3, 80)
            pts = [[rng.randint(0, 1400), rng.randint(0, 300)] for _ in range(n)]
            dst = [[p[0] + rng.randint(-5, 5), p[1] + rng.randint(-5, 5)] for p in pts]
        elif kind == 'float':
            n = rng.randint(3, 60)
            pts = [[rng.uniform(0, 900), rng.uniform(0, 250)] for _ in range(n)]
            dst = [[p[0] + rng.uniform(-5, 5), p[1] + rng.uniform(-5, 5)] for p in pts]
        else:
            n = rng.randint(3, 40)
            cx, cy = rng.randint(50, 500), rng.randint(50, 200)
            pts = [[cx + rng.randint(-6, 6), cy + rng.randint(-6, 6)] for _ in range(n)]
            dst = [[p[0] + rng.randint(-2, 2), p[1] + rng.randint(-2, 2)] for p in pts]
        case = {'kind': kind, 'points': [[F(v) for v in p] for p in pts], 'dst': [[F(v) for v in p] for p in dst]}
        try:
            t = SDW.PiecewiseAffineTransform()
            t.estimate(np.array(pts), np.array(dst))
        except Exception as e:  # noqa: BLE001
            case['raises'] = type(e).__name__
            cases.append(case)
            continue
        case['triangles'] = subdiv(pts)
        case['simplices'] = [[int(v) for v in s] for s in t.triangulation.simplices]
        case['mats'] = [None if m is None else [[F(v) for v in r] for r in m] for m in t.affine_matrices]
        arr = np.array(dst, dtype=np.float64)
        lo, hi = arr.min(axis=0), arr.max(axis=0)
        probes = [[float(lo[0] + (hi[0] - lo[0]) * rng.random()), float(lo[1] + (hi[1] - lo[1]) * rng.random())] for _ in range(12)]
        case['probes'] = probes
        case['inverse'] = [[F(v) for v in t.inverse_transform_point((np.float64(p[0]), np.float64(p[1])))] for p in probes]
        cases.append(case)
    out = os.path.join(A.fixtures, '40-read-delaunay-fuzz.json')
    with open(out, 'w') as f:
        json.dump({'seed': A.seed, 'cases': cases}, f, separators=(',', ':'))
    print(out, len(cases), 'cases,', sum(len(c.get('simplices', [])) for c in cases), 'triangles')


if __name__ == '__main__':
    main()
