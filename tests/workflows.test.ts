import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 工作流的结构不变量。
 *
 * 这里是文本级检查（不引 YAML 解析器，避免为一个测试加依赖），
 * 但每条断言对应的都是「错了就会在线上出事故」的点：
 * 权限不够推不上、整点 cron 容易被丢跑、先提交后校验会把坏数据写进仓库、
 * 明文 token 泄漏、CI 权限被顺手放大。
 */

const dir = join(process.cwd(), '.github', 'workflows');
const refresh = readFileSync(join(dir, 'data-refresh.yml'), 'utf8');
const ci = readFileSync(join(dir, 'ci.yml'), 'utf8');

describe('数据定时刷新工作流', () => {
  it('有定时触发，且分「每天汇率」与「每周聚合」两种', () => {
    const crons = [...refresh.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(crons.length).toBe(2);
    expect(crons.some((c) => c.endsWith('* * *'))).toBe(true); // 每天
    expect(crons.some((c) => c.endsWith('* * 1'))).toBe(true); // 每周一
  });

  it('cron 不落在整点（整点排队最挤，可能延迟或被丢）', () => {
    const crons = [...refresh.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
    for (const c of crons) {
      const minute = Number(c.split(' ')[0]);
      expect(minute, `${c} 落在整点`).not.toBe(0);
    }
  });

  it('要推送就必须有 contents: write', () => {
    expect(refresh).toMatch(/permissions:\s*\n\s*contents:\s*write/);
  });

  it('校验步骤排在提交之前（先验再落库）', () => {
    const verifyAt = refresh.indexOf('cli.mjs verify');
    const commitAt = refresh.indexOf('git commit');
    expect(verifyAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(-1);
    expect(verifyAt).toBeLessThan(commitAt);
  });

  it('跳过纯 fetchedAt 变化，避免每天为一行时间戳空提交', () => {
    expect(refresh).toContain('fetchedAt');
    // 判定方式必须是「排除 fetchedAt 后还有改动」，不能用字段白名单（会漏掉 models 这类子字段）
    expect(refresh).toMatch(/grep -v 'fetchedAt'/);
  });

  it('跨仓发布受 secret 门控，未配置时安全跳过', () => {
    expect(refresh).toContain('SITE_PUSH_TOKEN');
    expect(refresh).toMatch(/env\.SITE_PUSH_TOKEN != ''/);
  });

  it('不出现明文密钥：token 只能来自 secrets 上下文', () => {
    expect(refresh).not.toMatch(/ghp_[A-Za-z0-9]{20,}/);
    expect(refresh).not.toMatch(/github_pat_[A-Za-z0-9_]{20,}/);
    expect(refresh).not.toMatch(/password\s*[:=]\s*\S+/i);
  });

  it('有并发保护，避免两次定时任务同时写同一份数据', () => {
    expect(refresh).toMatch(/concurrency:/);
  });
});

describe('CI 工作流', () => {
  it('保持最小权限 contents: read（定时任务才需要 write）', () => {
    expect(ci).toMatch(/permissions:\s*\n\s*contents:\s*read/);
  });

  it('仍然只做门禁、不在 CI 里发布', () => {
    // 注释里可以提到发布脚本（用来解释为什么不在这里发布），但 run 行里不许真调用
    const runs = [...ci.matchAll(/^\s*run:\s*(.+)$/gm)].map((m) => m[1]);
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r).not.toContain('deploy-site.sh');
      expect(r).not.toContain('site-publish.mjs');
    }
  });
});
