/* soundLAB OMR: port of homr/staff_dewarping.py (AGPL-3.0, github.com/liebharc/homr).
   Straightens a staff image before the transformer reads it: points along the staff lines
   (span points) are mapped onto straight lines (optimal points) by a piecewise affine
   transformation over a Delaunay triangulation.

   homr triangulates with cv2.Subdiv2D, which opencv.js does not have. _Subdiv2D below is a
   line-by-line port of OpenCV 5.0.0's modules/geometry/src/subdivision2d.cpp (Apache-2.0; the
   quad-edge Delaunay insertion, its double-precision predicates and getTriangleList), so the
   triangles come out as the SAME list in the SAME order with the same vertex order: warp_image
   paints triangle after triangle (pixels on shared edges keep the last triangle's value) and
   inverse_transform_point takes the first triangle that contains the point, so the order matters.
   The random-warp training helpers (warp_image_randomly ...) are not ported. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const np = OMR.np, py = OMR.py;
  const cv2 = () => OMR.cv2;
  const fr = Math.fround;
  const FLT_EPSILON = 1.1920928955078125e-07;

  function eprint() {
    const sl = OMR.simple_logging;
    if (sl && sl.eprint) sl.eprint.apply(null, arguments);
  }
  function valueError(msg) { const e = new Error(msg); e.name = 'ValueError'; e.pyType = 'ValueError'; return e; }

  // ---- cv::Subdiv2D (OpenCV 5.0.0 geometry/src/subdivision2d.cpp), Delaunay part only ----
  const PTLOC_ERROR = -2, PTLOC_OUTSIDE_RECT = -1, PTLOC_INSIDE = 0, PTLOC_VERTEX = 1, PTLOC_ON_EDGE = 2;
  const NEXT_AROUND_ORG = 0x00, NEXT_AROUND_DST = 0x22, PREV_AROUND_ORG = 0x11, PREV_AROUND_DST = 0x33,
    NEXT_AROUND_LEFT = 0x13, NEXT_AROUND_RIGHT = 0x31, PREV_AROUND_LEFT = 0x20, PREV_AROUND_RIGHT = 0x02;

  function cvError(msg) {
    const E = OMR.cv2 && OMR.cv2.error;
    if (E) { try { return new E(msg); } catch (e) { /* plain Error below */ } }
    const e = new Error(msg); e.name = 'cv2.error'; return e;
  }

  // (double)b.x - a.x ... : the points are float32 values, the arithmetic is double
  function triangleArea(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  }
  function isPtInCircle3(pt, a, b, c) {
    const eps = FLT_EPSILON * 0.125;
    let val = (a[0] * a[0] + a[1] * a[1]) * triangleArea(b, c, pt);
    val -= (b[0] * b[0] + b[1] * b[1]) * triangleArea(a, c, pt);
    val += (c[0] * c[0] + c[1] * c[1]) * triangleArea(a, b, pt);
    val -= (pt[0] * pt[0] + pt[1] * pt[1]) * triangleArea(a, b, c);
    return val > eps ? 1 : val < -eps ? -1 : 0;
  }

  class _Subdiv2D {
    // Subdiv2D(Rect rect): rect = [x, y, width, height] (ints)
    constructor(rect) {
      this.validGeometry = false;
      this.freeQEdge = 0;
      this.freePoint = 0;
      this.recentEdge = 0;
      this.vtx = [];
      this.qedges = [];
      this.initDelaunay(rect);
    }
    _newQuadEdge(edgeidx) {
      if (edgeidx === undefined) return { next: [0, 0, 0, 0], pt: [0, 0, 0, 0] };
      return { next: [edgeidx, edgeidx + 3, edgeidx + 2, edgeidx + 1], pt: [0, 0, 0, 0] };
    }
    nextEdge(edge) { return this.qedges[edge >> 2].next[edge & 3]; }
    rotateEdge(edge, rotate) { return (edge & ~3) + ((edge + rotate) & 3); }
    symEdge(edge) { return edge ^ 2; }
    getEdge(edge, nextEdgeType) {
      edge = this.qedges[edge >> 2].next[(edge + nextEdgeType) & 3];
      return (edge & ~3) + ((edge + (nextEdgeType >> 4)) & 3);
    }
    edgeOrg(edge) { return this.qedges[edge >> 2].pt[edge & 3]; }
    edgeDst(edge) { return this.qedges[edge >> 2].pt[(edge + 2) & 3]; }
    splice(edgeA, edgeB) {
      const qa = this.qedges[edgeA >> 2].next, ia = edgeA & 3;
      const qb = this.qedges[edgeB >> 2].next, ib = edgeB & 3;
      const aRot = this.rotateEdge(qa[ia], 1), bRot = this.rotateEdge(qb[ib], 1);
      const qar = this.qedges[aRot >> 2].next, iar = aRot & 3;
      const qbr = this.qedges[bRot >> 2].next, ibr = bRot & 3;
      let t = qa[ia]; qa[ia] = qb[ib]; qb[ib] = t;
      t = qar[iar]; qar[iar] = qbr[ibr]; qbr[ibr] = t;
    }
    setEdgePoints(edge, orgPt, dstPt) {
      this.qedges[edge >> 2].pt[edge & 3] = orgPt;
      this.qedges[edge >> 2].pt[(edge + 2) & 3] = dstPt;
      this.vtx[orgPt].firstEdge = edge;
      this.vtx[dstPt].firstEdge = edge ^ 2;
    }
    connectEdges(edgeA, edgeB) {
      const edge = this.newEdge();
      this.splice(edge, this.getEdge(edgeA, NEXT_AROUND_LEFT));
      this.splice(this.symEdge(edge), edgeB);
      this.setEdgePoints(edge, this.edgeDst(edgeA), this.edgeOrg(edgeB));
      return edge;
    }
    swapEdges(edge) {
      const sedge = this.symEdge(edge);
      const a = this.getEdge(edge, PREV_AROUND_ORG);
      const b = this.getEdge(sedge, PREV_AROUND_ORG);
      this.splice(edge, a);
      this.splice(sedge, b);
      this.setEdgePoints(edge, this.edgeDst(a), this.edgeDst(b));
      this.splice(edge, this.getEdge(a, NEXT_AROUND_LEFT));
      this.splice(sedge, this.getEdge(b, NEXT_AROUND_LEFT));
    }
    isRightOf(pt, edge) {
      const org = this.vtx[this.edgeOrg(edge)].pt, dst = this.vtx[this.edgeDst(edge)].pt;
      const cwArea = triangleArea(pt, dst, org);
      return (cwArea > 0 ? 1 : 0) - (cwArea < 0 ? 1 : 0);
    }
    newEdge() {
      if (this.freeQEdge <= 0) {
        this.qedges.push(this._newQuadEdge());
        this.freeQEdge = this.qedges.length - 1;
      }
      const edge = this.freeQEdge * 4;
      this.freeQEdge = this.qedges[edge >> 2].next[1];
      this.qedges[edge >> 2] = this._newQuadEdge(edge);
      return edge;
    }
    deleteEdge(edge) {
      this.splice(edge, this.getEdge(edge, PREV_AROUND_ORG));
      const sedge = this.symEdge(edge);
      this.splice(sedge, this.getEdge(sedge, PREV_AROUND_ORG));
      edge >>= 2;
      this.qedges[edge].next[0] = 0;
      this.qedges[edge].next[1] = this.freeQEdge;
      this.freeQEdge = edge;
    }
    newPoint(pt, isvirtual, firstEdge) {
      if (this.freePoint === 0) {
        this.vtx.push({ firstEdge: 0, type: -1, pt: [0, 0] });
        this.freePoint = this.vtx.length - 1;
      }
      const vidx = this.freePoint;
      this.freePoint = this.vtx[vidx].firstEdge;
      this.vtx[vidx] = { firstEdge: firstEdge || 0, type: isvirtual ? 1 : 0, pt: pt };
      return vidx;
    }
    // -> [location, edge, vertex]
    locate(pt) {
      let vertex = 0;
      const maxEdges = this.qedges.length * 4;
      if (this.qedges.length < 4) throw cvError('Subdivision is empty');
      if (pt[0] < this.topLeft[0] || pt[1] < this.topLeft[1] || pt[0] >= this.bottomRight[0] || pt[1] >= this.bottomRight[1]) {
        throw cvError('Subdiv2D::locate: point outside the rectangle');
      }
      let edge = this.recentEdge;
      if (!(edge > 0)) throw cvError('Subdiv2D::locate: edge > 0');
      let location = PTLOC_ERROR;
      let rightOfCurr = this.isRightOf(pt, edge);
      if (rightOfCurr > 0) {
        edge = this.symEdge(edge);
        rightOfCurr = -rightOfCurr;
      }
      for (let i = 0; i < maxEdges; i++) {
        const onextEdge = this.nextEdge(edge);
        const dprevEdge = this.getEdge(edge, PREV_AROUND_DST);
        const rightOfOnext = this.isRightOf(pt, onextEdge);
        const rightOfDprev = this.isRightOf(pt, dprevEdge);
        if (rightOfDprev > 0) {
          if (rightOfOnext > 0 || (rightOfOnext === 0 && rightOfCurr === 0)) {
            location = PTLOC_INSIDE;
            break;
          } else {
            rightOfCurr = rightOfOnext;
            edge = onextEdge;
          }
        } else {
          if (rightOfOnext > 0) {
            if (rightOfDprev === 0 && rightOfCurr === 0) {
              location = PTLOC_INSIDE;
              break;
            } else {
              rightOfCurr = rightOfDprev;
              edge = dprevEdge;
            }
          } else if (rightOfCurr === 0 && this.isRightOf(this.vtx[this.edgeDst(onextEdge)].pt, edge) >= 0) {
            edge = this.symEdge(edge);
          } else {
            rightOfCurr = rightOfOnext;
            edge = onextEdge;
          }
        }
      }
      this.recentEdge = edge;
      if (location === PTLOC_INSIDE) {
        const orgPt = this.vtx[this.edgeOrg(edge)].pt, dstPt = this.vtx[this.edgeDst(edge)].pt;
        // fabs(pt.x - org_pt.x): a float subtraction, accumulated in double
        let t1 = Math.abs(fr(pt[0] - orgPt[0]));
        t1 += Math.abs(fr(pt[1] - orgPt[1]));
        let t2 = Math.abs(fr(pt[0] - dstPt[0]));
        t2 += Math.abs(fr(pt[1] - dstPt[1]));
        let t3 = Math.abs(fr(orgPt[0] - dstPt[0]));
        t3 += Math.abs(fr(orgPt[1] - dstPt[1]));
        if (t1 < FLT_EPSILON) {
          location = PTLOC_VERTEX;
          vertex = this.edgeOrg(edge);
          edge = 0;
        } else if (t2 < FLT_EPSILON) {
          location = PTLOC_VERTEX;
          vertex = this.edgeDst(edge);
          edge = 0;
        } else if ((t1 < t3 || t2 < t3) && Math.abs(triangleArea(pt, orgPt, dstPt)) < FLT_EPSILON) {
          location = PTLOC_ON_EDGE;
          vertex = 0;
        }
      }
      if (location === PTLOC_ERROR) {
        edge = 0;
        vertex = 0;
      }
      return [location, edge, vertex];
    }
    // insert(Point2f pt) -> the vertex id
    insert(pt) {
      pt = [fr(pt[0]), fr(pt[1])];
      let currPoint = 0, currEdge = 0, deletedEdge = 0;
      const loc = this.locate(pt);
      const location = loc[0];
      currEdge = loc[1]; currPoint = loc[2];
      if (location === PTLOC_ERROR) throw cvError('Subdiv2D::insert: PTLOC_ERROR');
      if (location === PTLOC_OUTSIDE_RECT) throw cvError('Subdiv2D::insert: PTLOC_OUTSIDE_RECT');
      if (location === PTLOC_VERTEX) return currPoint;
      if (location === PTLOC_ON_EDGE) {
        deletedEdge = currEdge;
        this.recentEdge = currEdge = this.getEdge(currEdge, PREV_AROUND_ORG);
        this.deleteEdge(deletedEdge);
      } else if (location === PTLOC_INSIDE) {
        // nothing
      } else {
        throw cvError('Subdiv2D::locate returned invalid location = ' + location);
      }
      if (currEdge === 0) throw cvError('Subdiv2D::insert: curr_edge != 0');
      this.validGeometry = false;

      currPoint = this.newPoint(pt, false);
      let baseEdge = this.newEdge();
      const firstPoint = this.edgeOrg(currEdge);
      this.setEdgePoints(baseEdge, firstPoint, currPoint);
      this.splice(baseEdge, currEdge);

      do {
        baseEdge = this.connectEdges(currEdge, this.symEdge(baseEdge));
        currEdge = this.getEdge(baseEdge, PREV_AROUND_ORG);
      } while (this.edgeDst(currEdge) !== firstPoint);

      currEdge = this.getEdge(baseEdge, PREV_AROUND_ORG);

      const maxEdges = this.qedges.length * 4;
      for (let i = 0; i < maxEdges; i++) {
        const tempEdge = this.getEdge(currEdge, PREV_AROUND_ORG);
        const tempDst = this.edgeDst(tempEdge);
        const currOrg = this.edgeOrg(currEdge);
        const currDst = this.edgeDst(currEdge);
        if (this.isRightOf(this.vtx[tempDst].pt, currEdge) > 0 &&
          isPtInCircle3(this.vtx[currOrg].pt, this.vtx[tempDst].pt, this.vtx[currDst].pt, this.vtx[currPoint].pt) < 0) {
          this.swapEdges(currEdge);
          currEdge = this.getEdge(currEdge, PREV_AROUND_ORG);
        } else if (currOrg === firstPoint) {
          break;
        } else {
          currEdge = this.getEdge(this.nextEdge(currEdge), PREV_AROUND_LEFT);
        }
      }
      return currPoint;
    }
    initDelaunay(rect) {
      // float big_coord = 6.f * MAX(rect.width, rect.height); the corners are float32
      const bigCoord = fr(6 * Math.max(rect[2], rect[3]));
      const rx = fr(rect[0]), ry = fr(rect[1]);
      this.vtx = [];
      this.qedges = [];
      this.recentEdge = 0;
      this.validGeometry = false;
      this.topLeft = [rx, ry];
      this.bottomRight = [fr(rx + rect[2]), fr(ry + rect[3])];
      const ppA = [fr(rx + bigCoord), ry];
      const ppB = [rx, fr(ry + bigCoord)];
      const ppC = [fr(rx - bigCoord), fr(ry - bigCoord)];
      this.vtx.push({ firstEdge: 0, type: -1, pt: [0, 0] });
      this.qedges.push(this._newQuadEdge());
      this.freeQEdge = 0;
      this.freePoint = 0;
      const pA = this.newPoint(ppA, false);
      const pB = this.newPoint(ppB, false);
      const pC = this.newPoint(ppC, false);
      const edgeAB = this.newEdge();
      const edgeBC = this.newEdge();
      const edgeCA = this.newEdge();
      this.setEdgePoints(edgeAB, pA, pB);
      this.setEdgePoints(edgeBC, pB, pC);
      this.setEdgePoints(edgeCA, pC, pA);
      this.splice(edgeAB, this.symEdge(edgeCA));
      this.splice(edgeBC, this.symEdge(edgeAB));
      this.splice(edgeCA, this.symEdge(edgeBC));
      this.recentEdge = edgeAB;
    }
    // -> [[ax, ay, bx, by, cx, cy], ...] (Vec6f), every triangle whose corners lie in the rect
    // (the ones touching the three outer virtual vertices are dropped)
    getTriangleList() {
      const out = [];
      const total = this.qedges.length * 4;
      const edgemask = new Uint8Array(total);
      // Rect2f(topLeft, bottomRight - topLeft).contains: x <= p.x < x + width (float32)
      const rx = this.topLeft[0], ry = this.topLeft[1];
      const rxw = fr(rx + fr(this.bottomRight[0] - this.topLeft[0]));
      const ryh = fr(ry + fr(this.bottomRight[1] - this.topLeft[1]));
      const contains = (p) => rx <= p[0] && p[0] < rxw && ry <= p[1] && p[1] < ryh;
      for (let i = 4; i < total; i += 2) {
        if (edgemask[i]) continue;
        const edgeA = i;
        const a = this.vtx[this.edgeOrg(edgeA)].pt;
        if (!contains(a)) continue;
        const edgeB = this.getEdge(edgeA, NEXT_AROUND_LEFT);
        const b = this.vtx[this.edgeOrg(edgeB)].pt;
        if (!contains(b)) continue;
        const edgeC = this.getEdge(edgeB, NEXT_AROUND_LEFT);
        const c = this.vtx[this.edgeOrg(edgeC)].pt;
        if (!contains(c)) continue;
        edgemask[edgeA] = 1;
        edgemask[edgeB] = 1;
        edgemask[edgeC] = 1;
        out.push([a[0], a[1], b[0], b[1], c[0], c[1]]);
      }
      return out;
    }
  }

  // np.array(points, dtype=np.float32) of an (n, 2) list / flat array -> [[x, y], ...] float32 values
  function toF32Points(points) {
    if (ArrayBuffer.isView(points)) {
      const out = [];
      for (let i = 0; i + 1 < points.length; i += 2) out.push([fr(points[i]), fr(points[i + 1])]);
      return out;
    }
    return points.map((p) => [fr(p[0]), fr(p[1])]);
  }
  function flat32(pts) {
    const a = new Float32Array(pts.length * 2);
    pts.forEach((p, i) => { a[2 * i] = p[0]; a[2 * i + 1] = p[1]; });
    return a;
  }

  // homr: staff_dewarping.py:11
  // OpenCV-based Delaunay triangulation using Subdiv2D. points: [[x, y], ...] (float32 values),
  // simplices: [[i1, i2, i3], ...] (np.int32 (n, 3); an empty list = numpy's shape (0,))
  class DelaunayTriangulation {
    constructor(points) {
      this.points = toF32Points(points);
      this.simplices = null;
      this._triangulate();
    }
    // homr: staff_dewarping.py:19
    // Perform Delaunay triangulation using OpenCV's Subdiv2D
    _triangulate() {
      const points = this.points;
      const n = points.length;
      if (n < 3) throw valueError('Need at least 3 points for triangulation');
      // Create subdivision with expanded bounding rectangle
      let rect = cv2().boundingRect(flat32(points));
      rect = [rect[0] - 10, rect[1] - 10, rect[2] + 20, rect[3] + 20];
      const subdiv = new _Subdiv2D(rect);
      // Insert all points
      for (const point of points) subdiv.insert([point[0], point[1]]);
      // Get triangles and convert from coordinates to point indices
      const triangleList = subdiv.getTriangleList();
      const triangles = [];
      for (const t of triangleList) {
        const idx1 = this._findPointIndex([t[0], t[1]], points);
        const idx2 = this._findPointIndex([t[2], t[3]], points);
        const idx3 = this._findPointIndex([t[4], t[5]], points);
        if (idx1 !== null && idx2 !== null && idx3 !== null) triangles.push([idx1, idx2, idx3]);
      }
      this.simplices = triangles;
    }
    // homr: staff_dewarping.py:51
    // Find the index of a point in the points array (np.linalg.norm in float32, first minimum)
    _findPointIndex(point, points, tolerance) {
      tolerance = tolerance === undefined ? 1e-3 : tolerance;
      let minIdx = 0, minD = Infinity;
      for (let i = 0; i < points.length; i++) {
        const dx = fr(points[i][0] - point[0]), dy = fr(points[i][1] - point[1]);
        const d = fr(Math.sqrt(fr(fr(dx * dx) + fr(dy * dy))));
        if (d !== d) { minIdx = i; minD = d; break; } // np.argmin stops at the first NaN
        if (d < minD) { minD = d; minIdx = i; }
      }
      if (minD < fr(tolerance)) return minIdx;
      return null;
    }
    // homr: staff_dewarping.py:61
    // Find which triangle contains each point -> Int32Array (-1 = none)
    findSimplex(points) {
      const pts = Array.isArray(points[0]) || ArrayBuffer.isView(points[0]) ? toF32Points(points) : toF32Points([points]);
      const result = new Int32Array(pts.length).fill(-1);
      if (this.simplices === null) return result;
      for (let i = 0; i < pts.length; i++) {
        for (let j = 0; j < this.simplices.length; j++) {
          const simplex = this.simplices[j];
          const triangle = [this.points[simplex[0]], this.points[simplex[1]], this.points[simplex[2]]];
          if (this._pointInTriangle(pts[i], triangle)) {
            result[i] = j;
            break;
          }
        }
      }
      return result;
    }
    // homr: staff_dewarping.py:77
    // Check if point is inside triangle using barycentric coordinates (all float32 arithmetic)
    _pointInTriangle(point, triangle) {
      const x = point[0], y = point[1];
      const x0 = triangle[0][0], y0 = triangle[0][1];
      const x1 = triangle[1][0], y1 = triangle[1][1];
      const x2 = triangle[2][0], y2 = triangle[2][1];
      const denom = fr(fr(fr(y1 - y2) * fr(x0 - x2)) + fr(fr(x2 - x1) * fr(y0 - y2)));
      if (Math.abs(denom) < fr(1e-10)) return false;
      const a = fr(fr(fr(fr(y1 - y2) * fr(x - x2)) + fr(fr(x2 - x1) * fr(y - y2))) / denom);
      const b = fr(fr(fr(fr(y2 - y0) * fr(x - x2)) + fr(fr(x0 - x2) * fr(y - y2))) / denom);
      const c = fr(fr(1 - a) - b);
      const eps = fr(-1e-10);
      return a >= eps && b >= eps && c >= eps;
    }
  }

  // homr: staff_dewarping.py:93
  // triangle: 3 float32 points, point: float64 (an np.float64 tuple): b[0] - a[0] is a float32
  // difference, point[1] - a[1] a float64 one
  function _isPointInTriangle(point, triangle) {
    function cross(a, b) {
      return fr(b[0] - a[0]) * (point[1] - a[1]) - fr(b[1] - a[1]) * (point[0] - a[0]);
    }
    const d1 = cross(triangle[0], triangle[1]);
    const d2 = cross(triangle[1], triangle[2]);
    const d3 = cross(triangle[2], triangle[0]);
    const hasNegative = d1 < 0 || d2 < 0 || d3 < 0;
    const hasPositive = d1 > 0 || d2 > 0 || d3 > 0;
    return !(hasNegative && hasPositive);
  }

  // ---- numpy's `mat @ np.array([x, y, 1.0], dtype=np.float32)` (2x3 float64 matrix) ----
  // numpy hands this matmul to OpenBLAS (cblas dgemv). Its x86 kernel (Haswell / SkylakeX, the
  // reference machine) evaluates every row as fma(m0, x, m1 * y) + m2: probed on 3000 random
  // matrices / points, every result equal; the plain sum (m0*x + m1*y) + m2 differs in ~35 % of
  // them by an ulp. Only image_coordinates (the MusicXML imgpos comments) see the difference.
  const F64 = new DataView(new ArrayBuffer(8));
  function decompose(x) { // a finite double -> [signed BigInt mantissa, exponent]: x = m * 2^e
    F64.setFloat64(0, x);
    const hi = F64.getUint32(0), lo = F64.getUint32(4);
    let exp = (hi >>> 20) & 0x7ff;
    let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
    if (exp === 0) exp = 1; else mant |= 1n << 52n;
    return [hi >>> 31 ? -mant : mant, exp - 1075];
  }
  function bigToDouble(m, e) { // m * 2^e rounded to the nearest double, ties to even (normal range)
    const neg = m < 0n;
    if (neg) m = -m;
    const shift = m.toString(2).length - 53;
    if (shift > 0) {
      const b = BigInt(shift), q = m >> b, r = m - (q << b), half = 1n << (b - 1n);
      m = (r > half || (r === half && (q & 1n))) ? q + 1n : q;
      e += shift;
    }
    let v = Number(m);
    while (e > 0) { const s = Math.min(e, 1000); v *= Math.pow(2, s); e -= s; }
    while (e < 0) { const s = Math.max(e, -1000); v *= Math.pow(2, s); e -= s; }
    return neg ? -v : v;
  }
  // fma(a, b, c) = a * b + c with ONE rounding (exact BigInt arithmetic)
  function fma64(a, b, c) {
    if (!isFinite(a) || !isFinite(b) || !isFinite(c) || a === 0 || b === 0) return a * b + c;
    if (c === 0) return a * b;
    const A = decompose(a), B = decompose(b), C = decompose(c);
    const pm = A[0] * B[0], pe = A[1] + B[1];
    const e = Math.min(pe, C[1]);
    const sum = (pm << BigInt(pe - e)) + (C[0] << BigInt(C[1] - e));
    if (sum === 0n) return 0;
    return bigToDouble(sum, e);
  }
  function applyMat(mat, x, y) {
    const v0 = fr(x), v1 = fr(y);
    return [fma64(mat[0][0], v0, mat[0][1] * v1) + mat[0][2], fma64(mat[1][0], v0, mat[1][1] * v1) + mat[1][2]];
  }

  function triangleOf(points, simplex) { return [points[simplex[0]], points[simplex[1]], points[simplex[2]]]; }

  // homr: staff_dewarping.py:106
  // Piecewise affine transformation using triangulation
  class PiecewiseAffineTransform {
    constructor() {
      this.srcPoints = null;
      this.dstPoints = null;
      this.triangulation = null;
      this.affineMatrices = [];
    }
    // homr: staff_dewarping.py:115
    // Estimate the piecewise affine transformation from source to destination points
    estimate(src, dst) {
      this.srcPoints = toF32Points(src);
      this.dstPoints = toF32Points(dst);
      this.triangulation = new DelaunayTriangulation(this.srcPoints);
      // Compute affine transform for each triangle
      this.affineMatrices = [];
      if (this.triangulation.simplices !== null) {
        for (const simplex of this.triangulation.simplices) {
          const srcTri = triangleOf(this.srcPoints, simplex);
          const dstTri = triangleOf(this.dstPoints, simplex);
          if (PiecewiseAffineTransform._isDegenerateTriangle(srcTri) || PiecewiseAffineTransform._isDegenerateTriangle(dstTri)) {
            this.affineMatrices.push(null);
            continue;
          }
          try {
            this.affineMatrices.push(cv2().getAffineTransform(srcTri, dstTri));
          } catch (e) {
            if (!(OMR.cv2.error && e instanceof OMR.cv2.error)) throw e;
            this.affineMatrices.push(null);
          }
        }
      }
    }
    // homr: staff_dewarping.py:139
    // Transform a single point using the piecewise affine transformation
    transformPoint(point) {
      if (this.triangulation === null) return point;
      const simplexIdx = this.triangulation.findSimplex([[point[0], point[1]]])[0];
      if (simplexIdx === -1 || simplexIdx >= this.affineMatrices.length) return point;
      const mat = this.affineMatrices[simplexIdx];
      if (mat === null) return point;
      return applyMat(mat, point[0], point[1]);
    }
    // homr: staff_dewarping.py:157
    // Maps a point of the warped image back to the source image. Uses the same
    // triangles as warp_image, only looked up by their destination corners.
    inverseTransformPoint(point) {
      if (this.triangulation === null || this.triangulation.simplices === null || this.dstPoints === null) return point;
      const simplices = this.triangulation.simplices;
      if (simplices.length !== this.affineMatrices.length) throw valueError('zip() argument 2 is shorter than argument 1');
      for (let i = 0; i < simplices.length; i++) {
        const mat = this.affineMatrices[i];
        if (mat === null || !_isPointInTriangle(point, triangleOf(this.dstPoints, simplices[i]))) continue;
        const inverse = cv2().invertAffineTransform(mat);
        return applyMat(inverse, point[0], point[1]);
      }
      return point;
    }
    // homr: staff_dewarping.py:175
    // Warp an image using the piecewise affine transformation
    warpImage(image, fillColor, order) {
      fillColor = fillColor === undefined ? 1 : fillColor;
      order = order === undefined ? 1 : order;
      if (this.triangulation === null || this.triangulation.simplices === null || this.srcPoints === null || this.dstPoints === null) {
        return image;
      }
      const srcPoints = this.srcPoints, dstPoints = this.dstPoints;
      const height = image.h, width = image.w, ch = image.c;
      const output = np.fullLike(image, fillColor);
      const simplices = this.triangulation.simplices;
      for (let simplexIdx = 0; simplexIdx < simplices.length; simplexIdx++) {
        if (this.affineMatrices[simplexIdx] === null) continue;
        const simplex = simplices[simplexIdx];
        const srcTri = triangleOf(srcPoints, simplex);
        const dstTri = triangleOf(dstPoints, simplex);
        if (PiecewiseAffineTransform._isDegenerateTriangle(srcTri) || PiecewiseAffineTransform._isDegenerateTriangle(dstTri)) continue;
        const srcRect = cv2().boundingRect(flat32(srcTri));
        const dstRect = cv2().boundingRect(flat32(dstTri));
        if (srcRect[2] <= 0 || srcRect[3] <= 0 || dstRect[2] <= 0 || dstRect[3] <= 0) continue;
        // Offset triangles to bounding rectangle origin
        const sx = fr(srcRect[0]), sy = fr(srcRect[1]), dx = fr(dstRect[0]), dy = fr(dstRect[1]);
        const srcTriCropped = srcTri.map((p) => [fr(p[0] - sx), fr(p[1] - sy)]);
        const dstTriCropped = dstTri.map((p) => [fr(p[0] - dx), fr(p[1] - dy)]);
        if (PiecewiseAffineTransform._isDegenerateTriangle(srcTriCropped) || PiecewiseAffineTransform._isDegenerateTriangle(dstTriCropped)) continue;
        let warpMat;
        try {
          warpMat = cv2().getAffineTransform(srcTriCropped, dstTriCropped);
        } catch (e) {
          if (OMR.cv2.error && e instanceof OMR.cv2.error) continue;
          throw e;
        }
        // image[y:y+h, x:x+w] (numpy slicing; the copy is what cv2 sees of the view)
        const srcCropped = np.crop(image, srcRect[1], srcRect[1] + srcRect[3], srcRect[0], srcRect[0] + srcRect[2]);
        if (np.size(srcCropped) === 0) continue;
        const interpolation = order === 0 ? cv2().INTER_NEAREST : cv2().INTER_LINEAR;
        const dstCropped = cv2().warpAffine(srcCropped, warpMat, [dstRect[2], dstRect[3]], {
          flags: interpolation, borderMode: cv2().BORDER_CONSTANT, borderValue: fillColor
        });
        // Create triangle mask
        const triangleMask = np.zeros([dstRect[3], dstRect[2]], 'uint8');
        cv2().fillConvexPoly(triangleMask, Int32Array.from(dstTriCropped.flat(), (v) => Math.trunc(v)), 255);
        // Clip to image bounds
        const y1 = dstRect[1], y2 = dstRect[1] + dstRect[3];
        const x1 = dstRect[0], x2 = dstRect[0] + dstRect[2];
        const y1Clip = Math.max(0, y1), y2Clip = Math.min(height, y2);
        const x1Clip = Math.max(0, x1), x2Clip = Math.min(width, x2);
        if (y2Clip <= y1Clip || x2Clip <= x1Clip) continue;
        const dy1 = y1Clip - y1, dx1 = x1Clip - x1;
        // output[y1c:y2c, x1c:x2c] = np.where(mask[...] > 0, dst_cropped[...], output[...])
        const mw = triangleMask.w, dw = dstCropped.w, out = output.data, dd = dstCropped.data, md = triangleMask.data;
        for (let yy = y1Clip; yy < y2Clip; yy++) {
          const my = yy - y1Clip + dy1;
          for (let xx = x1Clip; xx < x2Clip; xx++) {
            const mx = xx - x1Clip + dx1;
            if (md[my * mw + mx] > 0) {
              const o = (yy * width + xx) * ch, s = (my * dw + mx) * ch;
              for (let k = 0; k < ch; k++) out[o + k] = dd[s + k];
            }
          }
        }
      }
      return output;
    }
    // homr: staff_dewarping.py:269
    // Check if triangle has near-zero area (float32 arithmetic like numpy)
    static _isDegenerateTriangle(triangle) {
      const v1 = [fr(triangle[1][0] - triangle[0][0]), fr(triangle[1][1] - triangle[0][1])];
      const v2 = [fr(triangle[2][0] - triangle[0][0]), fr(triangle[2][1] - triangle[0][1])];
      const area = fr(Math.abs(fr(fr(v1[0] * v2[1]) - fr(v1[1] * v2[0]))) / 2.0);
      return area < fr(1e-6);
    }
    // homr: staff_dewarping.py:277
    // Calculate area of a triangle
    static _triangleArea(triangle) {
      const v1 = [fr(triangle[1][0] - triangle[0][0]), fr(triangle[1][1] - triangle[0][1])];
      const v2 = [fr(triangle[2][0] - triangle[0][0]), fr(triangle[2][1] - triangle[0][1])];
      return fr(Math.abs(fr(fr(v1[0] * v2[1]) - fr(v1[1] * v2[0]))) / 2.0);
    }
  }

  // homr: staff_dewarping.py:284
  class StaffDewarping {
    constructor(tform) { this.tform = tform; }
    dewarp(image, fillColor, order) {
      if (this.tform === null) return image;
      return this.tform.warpImage(image, fillColor === undefined ? 1 : fillColor, order === undefined ? 1 : order);
    }
    dewarpPoint(point) {
      if (this.tform === null) return point;
      return this.tform.transformPoint(point);
    }
    undewarpPoint(point) {
      if (this.tform === null) return point;
      return this.tform.inverseTransformPoint(point);
    }
  }

  // homr: staff_dewarping.py:304
  function isPointOnImage(pts, image) {
    const height = image.h, width = image.w;
    const margin = 10;
    if (pts[0] < margin || pts[0] > width - margin || pts[1] < margin || pts[1] > height - margin) return false;
    return true;
  }

  // homr: staff_dewarping.py:312
  // -> [spanPoints, optimalPoints]: lists of lines of [x, y] int points
  function calculateSpanAndOptimalPoints(staff, image) {
    const spanPoints = [];
    const optimalPoints = [];
    let firstYOffset = null;
    const numberOfYIntervals = 6;
    const yStep = py.int(image.h / numberOfYIntervals);
    if (yStep === 0) return [spanPoints, optimalPoints];
    for (let y = 2; y < image.h - 2; y += yStep) {
      const linePoints = [];
      for (let x = 2; x < image.w; x += 80) {
        const yValues = staff.getAt(x);
        if (yValues !== null) {
          const yOffset = yValues.y[2];
          let yDelta;
          // `not first_y_offset`: None and 0.0 (a NaN is truthy in Python)
          if (firstYOffset === null || firstYOffset === 0) {
            firstYOffset = yOffset;
            yDelta = 0;
          } else {
            yDelta = py.int(yOffset - firstYOffset);
          }
          const point = [x, y + yDelta];
          if (isPointOnImage(point, image)) linePoints.push(point);
        }
      }
      const minimumNumberOfPoints = 2;
      if (linePoints.length > minimumNumberOfPoints) {
        let s = 0;
        for (const p of linePoints) s += p[1];
        const averageY = s / linePoints.length;
        spanPoints.push(linePoints);
        optimalPoints.push(linePoints.map((p) => [p[0], py.int(averageY)]));
      }
    }
    return [spanPoints, optimalPoints];
  }

  // homr: staff_dewarping.py:347
  // source / destination: lists of lines of [x, y] (the lines are extended in place like Python's)
  function calculateDewarpTransformation(image, source, destination) {
    function addImageEdgesToLines(lines) {
      lines.unshift([[0, 0], [image.w, 0]]);
      lines.push([[0, image.h], [image.w, image.h]]);
      return lines;
    }
    function addFirstAndLastPointToEveryLine(lines) {
      for (const line of lines) {
        line.unshift([0, line[0][1]]);
        line.push([image.w, line[line.length - 1][1]]);
      }
      return lines;
    }
    source = addFirstAndLastPointToEveryLine(source);
    destination = addFirstAndLastPointToEveryLine(destination);
    source = addImageEdgesToLines(source);
    destination = addImageEdgesToLines(destination);
    const sourceConc = [].concat.apply([], source);
    const destinationConc = [].concat.apply([], destination);
    const tform = new PiecewiseAffineTransform();
    tform.estimate(sourceConc, destinationConc);
    return new StaffDewarping(tform);
  }

  // homr: staff_dewarping.py:377
  function dewarpStaffImage(image, staff, index, debug) {
    try {
      const so = calculateSpanAndOptimalPoints(staff, image);
      const spanPoints = so[0], optimalPoints = so[1];
      if (debug && debug.debug) {
        const debugImg = np.clone(image);
        for (const line of spanPoints) for (const point of line) cv2().circle(debugImg, [py.int(point[0]), py.int(point[1])], 5, [0, 0, 255], -1);
        for (const line of optimalPoints) for (const point of line) cv2().circle(debugImg, [py.int(point[0]), py.int(point[1])], 5, [255, 0, 0], -1);
        debug.writeImageWithFixedSuffix('_staff-' + index + '_debug_span_points.png', debugImg);
      }
      return calculateDewarpTransformation(image, spanPoints, optimalPoints);
    } catch (e) {
      eprint('Dewarping failed for staff', index, 'with error', e && e.message !== undefined ? e.message : e);
      return new StaffDewarping(null);
    }
  }

  OMR.staff_dewarping = {
    DelaunayTriangulation: DelaunayTriangulation, PiecewiseAffineTransform: PiecewiseAffineTransform,
    StaffDewarping: StaffDewarping, isPointOnImage: isPointOnImage,
    calculateSpanAndOptimalPoints: calculateSpanAndOptimalPoints,
    calculateDewarpTransformation: calculateDewarpTransformation, dewarpStaffImage: dewarpStaffImage,
    _isPointInTriangle: _isPointInTriangle, _Subdiv2D: _Subdiv2D, _fma64: fma64, _applyMat: applyMat
  };
})(typeof self !== 'undefined' ? self : globalThis);
