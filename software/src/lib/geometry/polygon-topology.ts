/**
 * Documented 2D polygon topology for catalog inspect and map decode.
 * Matches python/science/polygon_topology.py: even-odd + segment intersection.
 * Ring roles come from nesting, not orientation. No GEOS/Shapely.
 */

export const TOPOLOGY_ENGINE = "g-aid-evenodd-segment";
export const TOPOLOGY_ENGINE_VERSION = "1.0";
export const TOPOLOGY_METHOD =
  "even-odd point-in-ring with hole exclusion; segment-segment intersection; ring nesting by containment (not orientation)";
export const TOPOLOGY_EPS = 1e-9;

export type Ring = { x: number; y: number }[];
export type PolygonPart = Ring[];

export interface AssembledPolygon {
  ok: boolean;
  parts: PolygonPart[];
  geometryType: "Polygon" | "MultiPolygon";
  holeCount: number;
  partCount: number;
  errors: string[];
  classification: "nesting-containment";
  engine: typeof TOPOLOGY_ENGINE;
}

function same(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return a.x === b.x && a.y === b.y;
}

export function asRing(values: { x: number; y: number }[]): Ring {
  const out: Ring = [];
  for (const pt of values) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
    if (out.length && same(pt, out[out.length - 1])) continue;
    out.push({ x: pt.x, y: pt.y });
  }
  return out;
}

export function uniqueVerts(ring: Ring): Ring {
  const pts = ring.slice();
  if (pts.length >= 2 && same(pts[0], pts[pts.length - 1])) pts.pop();
  return pts;
}

export function ringClosed(ring: Ring): boolean {
  return ring.length >= 4 && same(ring[0], ring[ring.length - 1]);
}

function ringEdges(ring: Ring): Array<[{ x: number; y: number }, { x: number; y: number }]> {
  const pts = uniqueVerts(ring);
  return pts.map((pt, i) => [pt, pts[(i + 1) % pts.length]]);
}

function orient(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  if (Math.abs(orient(a, b, p)) > TOPOLOGY_EPS) return false;
  return (
    Math.min(a.x, b.x) - TOPOLOGY_EPS <= p.x &&
    p.x <= Math.max(a.x, b.x) + TOPOLOGY_EPS &&
    Math.min(a.y, b.y) - TOPOLOGY_EPS <= p.y &&
    p.y <= Math.max(a.y, b.y) + TOPOLOGY_EPS
  );
}

function properIntersect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  if (Math.abs(o1) <= TOPOLOGY_EPS || Math.abs(o2) <= TOPOLOGY_EPS || Math.abs(o3) <= TOPOLOGY_EPS || Math.abs(o4) <= TOPOLOGY_EPS) {
    return false;
  }
  return o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0;
}

function collinearOverlap(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
  d: { x: number; y: number }
): boolean {
  if (Math.abs(orient(a, b, c)) > TOPOLOGY_EPS || Math.abs(orient(a, b, d)) > TOPOLOGY_EPS) return false;
  if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - TOPOLOGY_EPS || Math.max(c.x, d.x) < Math.min(a.x, b.x) - TOPOLOGY_EPS) return false;
  if (Math.max(a.y, b.y) < Math.min(c.y, d.y) - TOPOLOGY_EPS || Math.max(c.y, d.y) < Math.min(a.y, b.y) - TOPOLOGY_EPS) return false;
  const shared = [a, b].filter((p) => [c, d].some((q) => same(p, q)));
  if (shared.length === 1) {
    const otherA = same(a, shared[0]) ? b : a;
    const otherC = same(c, shared[0]) ? d : c;
    return same(otherA, otherC);
  }
  return !same(a, b) && !same(c, d);
}

function pointOnRing(p: { x: number; y: number }, ring: Ring): boolean {
  return ringEdges(ring).some(([a, b]) => onSegment(p, a, b));
}

function pointInRingEvenOdd(p: { x: number; y: number }, ring: Ring): boolean {
  if (pointOnRing(p, ring)) return false;
  let inside = false;
  for (const [a, b] of ringEdges(ring)) {
    if (a.y > p.y === b.y > p.y) continue;
    const denom = b.y - a.y || 1e-18;
    const xinters = ((b.x - a.x) * (p.y - a.y)) / denom + a.x;
    if (p.x < xinters) inside = !inside;
  }
  return inside;
}

function locateOnRing(p: { x: number; y: number }, ring: Ring): "interior" | "boundary" | "exterior" {
  if (pointOnRing(p, ring)) return "boundary";
  return pointInRingEvenOdd(p, ring) ? "interior" : "exterior";
}

function ringSelfIntersects(ring: Ring): boolean {
  const edges = ringEdges(ring);
  const n = edges.length;
  for (let i = 0; i < n; i++) {
    const [a, b] = edges[i];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const [c, d] = edges[j];
      if (properIntersect(a, b, c, d) || collinearOverlap(a, b, c, d)) return true;
    }
  }
  return false;
}

function ringsCross(a: Ring, b: Ring): boolean {
  for (const [p, q] of ringEdges(a)) {
    for (const [r, s] of ringEdges(b)) {
      if (properIntersect(p, q, r, s) || collinearOverlap(p, q, r, s)) return true;
    }
  }
  return false;
}

function ringContainsRing(outer: Ring, inner: Ring): boolean {
  if (ringsCross(outer, inner)) return false;
  const verts = uniqueVerts(inner);
  if (!verts.length) return false;
  const locs = verts.map((p) => locateOnRing(p, outer));
  if (locs.some((loc) => loc === "exterior")) return false;
  return locs.some((loc) => loc === "interior");
}

function fail(errors: string[]): AssembledPolygon {
  return {
    ok: false,
    parts: [],
    geometryType: "Polygon",
    holeCount: 0,
    partCount: 0,
    errors,
    classification: "nesting-containment",
    engine: TOPOLOGY_ENGINE,
  };
}

export function assemblePolygonParts(ringsIn: { x: number; y: number }[][]): AssembledPolygon {
  const rings = ringsIn.map(asRing).filter((ring) => uniqueVerts(ring).length);
  const errors: string[] = [];
  rings.forEach((ring, i) => {
    if (!ringClosed(ring)) errors.push(`Ring ${i + 1} must be closed with at least four finite positions.`);
    else if (ringSelfIntersects(ring)) {
      errors.push(`Ring ${i + 1} is self-intersecting. Overlap will not use an exterior-ring approximation.`);
    }
  });
  if (errors.length) return fail([...new Set(errors)]);

  const n = rings.length;
  const contains: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (ringContainsRing(rings[i], rings[j])) contains[i][j] = true;
      else if (ringsCross(rings[i], rings[j])) {
        errors.push(`Rings ${i + 1} and ${j + 1} cross. Hole/exterior relationships are invalid.`);
      }
    }
  }
  if (errors.length) return fail([...new Set(errors)]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && contains[i][j] && contains[j][i]) {
        errors.push(`Rings ${i + 1} and ${j + 1} mutually contain each other.`);
      }
    }
  }
  if (errors.length) return fail([...new Set(errors)]);

  const depth = rings.map((_, j) => contains.reduce((sum, row) => sum + (row[j] ? 1 : 0), 0));
  const parent = rings.map((_, j) => {
    const candidates = rings.map((_, i) => i).filter((i) => contains[i][j]);
    if (!candidates.length) return -1;
    return candidates.reduce((best, i) => (depth[i] > depth[best] ? i : best));
  });

  const parts: PolygonPart[] = [];
  const exteriorIndex = new Map<number, number>();
  rings.forEach((ring, i) => {
    if (depth[i] % 2 === 0) {
      exteriorIndex.set(i, parts.length);
      parts.push([ring]);
    } else {
      const outer = parent[i];
      if (outer < 0 || depth[outer] % 2 !== 0 || !exteriorIndex.has(outer)) {
        errors.push(
          `Ring ${i + 1} is nested as a hole but has no containing exterior. The dataset stays unusable for topology-aware overlap.`
        );
        return;
      }
      parts[exteriorIndex.get(outer)!].push(ring);
    }
  });
  if (errors.length) return fail([...new Set(errors)]);
  if (!parts.length) return fail(["Polygon has no exterior ring."]);
  const holeCount = parts.reduce((sum, part) => sum + Math.max(0, part.length - 1), 0);
  return {
    ok: true,
    parts,
    geometryType: parts.length > 1 ? "MultiPolygon" : "Polygon",
    holeCount,
    partCount: parts.length,
    errors: [],
    classification: "nesting-containment",
    engine: TOPOLOGY_ENGINE,
  };
}

export function flattenParts(parts: PolygonPart[]): Ring {
  return parts.flat(2);
}
