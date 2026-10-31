import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { slugify } from '../../../src/lib/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** 仓库根目录（scripts/data/lib -> ../../..） */
export const ROOT = resolve(here, '..', '..', '..');

export const PATHS = {
  providers: resolve(ROOT, 'src/data/providers.json'),
  apiEntries: resolve(ROOT, 'src/data/entries/api.json'),
  planEntries: resolve(ROOT, 'src/data/entries/plans.json'),
  fx: resolve(ROOT, 'src/data/generated/fx.generated.json'),
  aggregate: resolve(ROOT, 'src/data/generated/aggregate.generated.json'),
  modelsDevCache: resolve(ROOT, '.cache/models-dev.json'),
  deployScript: resolve(ROOT, 'scripts/deploy-site.sh'),
};

export class CliError extends Error {
  constructor(message, { code = 'CLI_ERROR', exitCode = 1 } = {}) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

export function fail(message, options) {
  throw new CliError(message, options);
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function readJsonIfExists(file) {
  return existsSync(file) ? readJson(file) : null;
}

/**
 * 原子写入：先写同目录临时文件，再 rename 覆盖。
 * 校验失败时调用方不会进入本函数，因此原文件字节不变。
 */
export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
  return file;
}

export function relative(file) {
  return file.slice(ROOT.length + 1).replaceAll('\\', '/');
}

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export { slugify };

/** 解析 --key value / --key=value / --flag；返回 { values, flags, rest } */
export function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      rest.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq >= 0) {
      values[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values[body] = next;
      index += 1;
    } else {
      flags.add(body);
    }
  }
  return { values, flags, rest };
}

export function numberArg(values, key, { required = false } = {}) {
  const raw = values[key];
  if (raw === undefined || raw === '') {
    if (required) fail(`缺少参数 --${key}`);
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) fail(`参数 --${key} 必须是数字，收到：${raw}`);
  return value;
}
