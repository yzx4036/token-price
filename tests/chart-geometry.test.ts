import { describe, expect, it } from 'vitest';
import { logTicks, mapLinear, mapLog, paretoFrontier, polylineIntersections, stackSegments, toSvgPath } from '../src/lib/chart-geometry';

describe('坐标与对数刻度', () => {
  it('线性、反向 range、负值和单点域', () => {
    expect(mapLinear(5, [0, 10], [10, 30])).toBe(20);
    expect(mapLinear(-5, [-10, 0], [100, 0])).toBe(50);
    expect(mapLinear(4, [4, 4], [10, 30])).toBe(20);
  });
  it.each([NaN, Infinity, -Infinity, null])('非法线性输入 %s 不生成坐标', (v) => {
    expect(mapLinear(v as number, [0, 10], [0, 100])).toBeNull();
    expect(mapLinear(1, [0, v as number], [0, 100])).toBeNull();
    expect(mapLinear(1, [0, 10], [0, v as number])).toBeNull();
  });
  it('1/10/100 对数等距；单点映射中点', () => {
    expect([1, 10, 100].map((v) => mapLog(v, [1, 100], [0, 100]))).toEqual([0, 50, 100]);
    expect(mapLog(10, [10, 10], [0, 100])).toBe(50);
  });
  it.each([0, -1, NaN, Infinity, null])('非法对数输入 %s 不生成坐标', (v) => {
    expect(mapLog(v as number, [1, 100], [0, 100])).toBeNull();
    expect(mapLog(10, [v as number, 100], [0, 100])).toBeNull();
  });
  it('1/2/5 刻度、限量和无效域', () => {
    expect(logTicks([1, 100], 20)).toEqual([1, 2, 5, 10, 20, 50, 100]);
    expect(logTicks([1, 100], 3)).toEqual([1, 10, 100]);
    expect(logTicks([3, 3], 5)).toEqual([3]);
    for (const d of [[0, 10], [-1, 10], [10, 1], [NaN, 10]] as const) expect(logTicks(d, 5)).toEqual([]);
    expect(logTicks([1, 10], 0)).toEqual([]);
  });
});

describe('同币种 Pareto', () => {
  const frontier = (v: Array<[number | null, number | null, string]>) => paretoFrontier(v, (p) => p[0], (p) => p[1]).map((p) => p[2]);
  it('支配、同价最高分、同分低价、稳定首项', () => {
    expect(frontier([[2, 5, 'a'], [1, 3, 'b'], [2, 6, 'c'], [3, 6, 'd'], [2, 6, 'e'], [4, 9, 'f']])).toEqual(['b', 'c', 'f']);
  });
  it('空、缺失、非正价、负分、单点', () => {
    expect(frontier([])).toEqual([]);
    expect(frontier([[null, 2, 'a'], [2, null, 'b'], [0, 3, 'c'], [-1, 3, 'd'], [2, -1, 'e']])).toEqual([]);
    expect(frontier([[2, 0, 'zero-score']])).toEqual(['zero-score']);
  });
  it('paretoFrontier 不认币种：混币种同调会丢掉其中一个（隔离靠调用方分组）', () => {
    // 反例：把 USD 与 CNY 塞进同一次调用，价格与评分被直接比大小，CNY 点被判「更贵更低分」而丢弃。
    expect(frontier([[1, 10, 'usd'], [10, 5, 'cny']])).toEqual(['usd']);
    // 真正的币种隔离在调用侧：buildScatterChart 先按币种分组再各求一次前沿，
    // 断言见 tests/pricing-chart-data.test.ts 的「前沿 ID 精确」用例。
  });
});

describe('静态路径', () => {
  it('line、水平后垂直 step、空、单点和非法点', () => {
    const points = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
    expect(toSvgPath(points, 'line')).toBe('M1,2L3,4');
    expect(toSvgPath(points, 'step')).toBe('M1,2H3V4');
    expect(toSvgPath([], 'line')).toBeNull();
    expect(toSvgPath([{ x: 1, y: 2 }], 'line')).toBe('M1,2');
    expect(toSvgPath([{ x: NaN, y: 0 }, ...points], 'line')).toBe('M1,2L3,4');
    expect(toSvgPath([{ x: 0, y: Infinity }], 'line')).toBeNull();
  });
});

describe('堆叠几何', () => {
  it('正常四段、缺段不占宽度、零段保留', () => {
    expect(stackSegments([1, 2, 3, 4], (v) => v).map((s) => [s.x0, s.x1])).toEqual([[0, 1], [1, 3], [3, 6], [6, 10]]);
    expect(stackSegments([2, null, 3], (v) => v)).toEqual([{ index: 0, x0: 0, x1: 2, value: 2 }, { index: 2, x0: 2, x1: 5, value: 3 }]);
    expect(stackSegments([0], (v) => v)).toEqual([{ index: 0, x0: 0, x1: 0, value: 0 }]);
  });
  it('负值、非法值、全缺和非法 scale', () => {
    expect(stackSegments([null, -1, NaN, Infinity], (v) => v)).toEqual([]);
    expect(stackSegments([3], (v) => 10 + v)).toEqual([{ index: 0, x0: 10, x1: 13, value: 3 }]);
    expect(stackSegments([1], () => null)).toEqual([]);
  });
});

describe('折线交点', () => {
  it('交叉给出精确交点，负坐标不丢', () => {
    expect(polylineIntersections([{ x: -10, y: -10 }, { x: 0, y: 0 }], [{ x: -10, y: 0 }, { x: 0, y: -10 }]))
      .toEqual([{ x: -5, y: -5 }]);
  });
  it('多交点按首次出现顺序返回', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }];
    const b = [{ x: 0, y: 5 }, { x: 20, y: 5 }];
    expect(polylineIntersections(a, b)).toEqual([{ x: 5, y: 5 }, { x: 15, y: 5 }]);
  });
  it('平行与共线重叠都不伪造交点', () => {
    expect(polylineIntersections([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }])).toEqual([]);
    expect(polylineIntersections([{ x: 0, y: 0 }, { x: 10, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 0 }])).toEqual([]);
    expect(polylineIntersections([{ x: 0, y: 0 }, { x: 10, y: 10 }], [{ x: 5, y: 5 }, { x: 15, y: 15 }])).toEqual([]);
  });
  it('单点、零长线段与空折线无交点', () => {
    expect(polylineIntersections([{ x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual([]);
    expect(polylineIntersections([{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 5 }, { x: 10, y: 5 }])).toEqual([]);
    expect(polylineIntersections([], [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual([]);
  });
  it('同一位置的重复交点去重：折返线只留一个点', () => {
    const a = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }];
    const b = [{ x: 0, y: 10 }, { x: 10, y: 0 }];
    expect(polylineIntersections(a, b)).toEqual([{ x: 5, y: 5 }]);
  });
  it('非有限坐标的线段被跳过，其余线段照常求交', () => {
    const a = [{ x: NaN, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }];
    const b = [{ x: 0, y: 10 }, { x: 10, y: 0 }];
    expect(polylineIntersections(a, b)).toEqual([{ x: 5, y: 5 }]);
  });
});
