/** 无业务语义的 SVG 几何。非法输入不制造坐标。 */
export type Point = { x: number; y: number };
export type Domain = readonly [number, number];
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function mapLinear(value: number, domain: Domain, range: Domain): number | null {
  if (![value, ...domain, ...range].every(finite)) return null;
  if (domain[0] === domain[1]) return (range[0] + range[1]) / 2;
  return range[0] + (value - domain[0]) / (domain[1] - domain[0]) * (range[1] - range[0]);
}

export function mapLog(value: number, domain: Domain, range: Domain): number | null {
  if (![value, ...domain].every((v) => finite(v) && v > 0)) return null;
  return mapLinear(Math.log10(value), [Math.log10(domain[0]), Math.log10(domain[1])], range);
}

export function logTicks(domain: Domain, maxTicks: number): number[] {
  const [lo, hi] = domain;
  if (![lo, hi].every((v) => finite(v) && v > 0) || lo > hi || !finite(maxTicks) || maxTicks < 1) return [];
  if (lo === hi) return [lo];
  const ticks: number[] = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const n of [1, 2, 5]) {
      const v = Number(`${n}e${e}`);
      if (v >= lo && v <= hi && finite(v)) ticks.push(v);
    }
  }
  const limit = Math.floor(maxTicks);
  if (ticks.length <= limit) return ticks;
  if (limit === 1) return [ticks[0]!];
  return Array.from({ length: limit }, (_, i) => ticks[Math.round(i * (ticks.length - 1) / (limit - 1))]!);
}

export function paretoFrontier<T>(items: readonly T[], priceOf: (item: T) => number | null, scoreOf: (item: T) => number | null): T[] {
  const valid = items.map((item, index) => ({ item, index, price: priceOf(item), score: scoreOf(item) }))
    .filter((p): p is typeof p & { price: number; score: number } => finite(p.price) && p.price > 0 && finite(p.score) && p.score >= 0)
    .sort((a, b) => a.price - b.price || b.score - a.score || a.index - b.index);
  let best = -Infinity;
  return valid.filter((p) => {
    if (p.score <= best) return false;
    best = p.score;
    return true;
  }).map((p) => p.item);
}

export function toSvgPath(points: readonly Point[], mode: 'line' | 'step'): string | null {
  const valid = points.filter((p) => finite(p.x) && finite(p.y));
  if (!valid.length) return null;
  const n = (v: number) => Number(v.toFixed(2));
  return valid.map((p, i) => i === 0 ? `M${n(p.x)},${n(p.y)}` : mode === 'step'
    ? `H${n(p.x)}V${n(p.y)}` : `L${n(p.x)},${n(p.y)}`).join('');
}

export function stackSegments(values: readonly (number | null)[], scale: (value: number) => number | null): Array<{ index: number; x0: number; x1: number; value: number }> {
  let total = 0;
  return values.flatMap((value, index) => {
    if (!finite(value) || value < 0) return [];
    const x0 = scale(total);
    total += value;
    const x1 = scale(total);
    return finite(x0) && finite(x1) ? [{ index, x0, x1, value }] : [];
  });
}

export function polylineIntersections(a: readonly Point[], b: readonly Point[]): Point[] {
  const points: Point[] = [];
  const cross = (x1: number, y1: number, x2: number, y2: number) => x1 * y2 - y1 * x2;
  const epsilon = 1e-9;
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const p = a[i - 1]!; const q = b[j - 1]!;
      const endA = a[i]!; const endB = b[j]!;
      if (![p.x, p.y, q.x, q.y, endA.x, endA.y, endB.x, endB.y].every(finite)) continue;
      const rx = endA.x - p.x; const ry = endA.y - p.y;
      const sx = endB.x - q.x; const sy = endB.y - q.y;
      const denominator = cross(rx, ry, sx, sy);
      // 平行、共线、零长线段均无唯一交点。
      if (Math.abs(denominator) <= epsilon) continue;
      const t = cross(q.x - p.x, q.y - p.y, sx, sy) / denominator;
      const u = cross(q.x - p.x, q.y - p.y, rx, ry) / denominator;
      if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) continue;
      const point = { x: p.x + Math.min(1, Math.max(0, t)) * rx, y: p.y + Math.min(1, Math.max(0, t)) * ry };
      if (!points.some((v) => Math.abs(v.x - point.x) <= epsilon && Math.abs(v.y - point.y) <= epsilon)) points.push(point);
    }
  }
  return points;
}
