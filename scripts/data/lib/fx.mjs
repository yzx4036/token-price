import { fetchJson } from './http.mjs';
import { CliError, PATHS, readJsonIfExists, todayIso, writeJsonAtomic } from './io.mjs';

export const FX_SOURCES = [
  {
    name: 'open.er-api.com',
    url: 'https://open.er-api.com/v6/latest/USD',
    pick(payload, fallbackDate) {
      const rate = payload?.rates?.CNY;
      const raw = typeof payload?.time_last_update_utc === 'string' ? payload.time_last_update_utc : null;
      const parsed = raw ? new Date(raw) : null;
      const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : fallbackDate;
      return { rate, date };
    },
  },
  {
    name: 'api.frankfurter.app',
    url: 'https://api.frankfurter.app/latest?from=USD&to=CNY',
    pick(payload, fallbackDate) {
      const rate = payload?.rates?.CNY;
      const date = typeof payload?.date === 'string' ? payload.date : fallbackDate;
      return { rate, date };
    },
  },
];

export function validateRate(rate) {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
    throw new CliError('汇率必须是有限正数', { code: 'FX_INVALID_RATE' });
  }
  if (rate < 3 || rate > 15) {
    throw new CliError(`汇率 ${rate} 明显超出 USD→CNY 合理区间（3–15），拒绝写入`, { code: 'FX_OUT_OF_RANGE' });
  }
  return rate;
}

/** 主源失败自动回落备源；两源都失败则抛错，绝不写入假数据 */
export async function fetchFxRate({ now = new Date() } = {}) {
  const fallbackDate = todayIso(now);
  const attempts = [];
  for (const source of FX_SOURCES) {
    try {
      const payload = await fetchJson(source.url, { timeoutMs: 15000 });
      const { rate, date } = source.pick(payload, fallbackDate);
      validateRate(rate);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        throw new CliError(`汇率源返回的日期不是 YYYY-MM-DD：${date}`, { code: 'FX_INVALID_DATE' });
      }
      return {
        base: 'USD',
        quote: 'CNY',
        rate,
        source: source.name,
        sourceUrl: source.url,
        fetchedAt: now.toISOString(),
        date,
      };
    } catch (error) {
      attempts.push(`${source.name}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
    }
  }
  throw new CliError(`所有汇率源均失败：\n${attempts.map((line) => `  - ${line}`).join('\n')}`, {
    code: 'FX_ALL_FAILED',
  });
}

export async function runRateCommand({ now = new Date() } = {}) {
  const previous = readJsonIfExists(PATHS.fx);
  const fx = await fetchFxRate({ now });
  writeJsonAtomic(PATHS.fx, fx);
  return { fx, previous };
}

export async function refreshFxRate(options) {
  const { fx } = await runRateCommand(options);
  return fx;
}
