// 生成 drift 测试夹具：只保留「本地 official 条目 + 聚合映射」真正会对拍上的模型，
// 避免把 6MB 全量快照塞进仓库。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { normalizeModelName } from '../../src/lib/schema.ts';

const read = (p) => JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8'));
const cache = read('.cache/models-dev.json');
const providers = read('src/data/providers.json');
const entries = read('src/data/entries/api.json');

const aggMap = new Map(providers.filter((p) => p.aggregateProvider).map((p) => [p.id, p.aggregateProvider]));

// 每个厂商要保留哪些模型：只有 official 条目的模型名
const wanted = new Map();
for (const e of entries) {
  if (e.provenance !== 'official') continue;
  const agg = aggMap.get(e.providerId);
  if (!agg) continue;
  if (!wanted.has(agg)) wanted.set(agg, new Set());
  wanted.get(agg).add(normalizeModelName(e.model));
}

const fixture = {};
let kept = 0;
for (const [agg, names] of wanted) {
  const src = cache[agg];
  if (!src) continue;
  const models = {};
  for (const [id, model] of Object.entries(src.models ?? {})) {
    const keys = [normalizeModelName(String(model.id ?? '')), normalizeModelName(String(model.name ?? ''))];
    if (!keys.some((k) => names.has(k))) continue;
    models[id] = {
      id: model.id,
      name: model.name,
      cost: model.cost ? { input: model.cost.input, output: model.cost.output, cache_read: model.cost.cache_read } : undefined,
    };
    kept += 1;
  }
  if (Object.keys(models).length) fixture[agg] = { models };
}

mkdirSync(new URL('../../tests/fixtures/', import.meta.url), { recursive: true });
const out = new URL('../../tests/fixtures/models-dev.drift.json', import.meta.url);
writeFileSync(out, JSON.stringify(fixture, null, 2) + '\n');
console.log(`providers=${Object.keys(fixture).length} models=${kept} bytes=${JSON.stringify(fixture).length}`);
