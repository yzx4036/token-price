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

  it('支持 force_deploy 手动重发，但必须仍受 secret 门控', () => {
    // 用途：数据没变但改了构建/页面时能重发一次；也是验证发布链路的入口。
    // 关键是不能因为加了 force 就绕过 token 判断，否则 CI 里会出现无权推送的失败。
    expect(refresh).toContain('force_deploy');
    // 必须定位到步骤定义，不能匹配到文件头的注释（那里也提到「发布到站点仓」）
    const deployStep = refresh.slice(refresh.indexOf('- name: 发布到站点仓'));
    const condition = deployStep.slice(0, deployStep.indexOf('run:'));
    expect(condition).toContain("env.SITE_PUSH_TOKEN != ''");
    expect(condition).toContain('force_deploy');
    // 定时事件没有 inputs，force_deploy 必须是「或」条件而不是必须条件
    expect(condition).toMatch(/\|\|\s*github\.event\.inputs\.force_deploy/);
  });

  it('强制发布时必须同时提交数据（否则线上时间戳在仓库里查不到）', () => {
    // 构建产物内嵌了汇率的 fetchedAt；只发不提交会让溯源链断裂。
    const commitStep = refresh.slice(refresh.indexOf('- name: 提交并推送'));
    const block = commitStep.slice(0, commitStep.indexOf('- name: 发布到站点仓'));
    expect(block).toMatch(/force_deploy == 'true'/);
    // 防止 force 之下没有任何 diff 时 git commit 直接报错
    expect(block).toContain('git diff --cached --quiet');
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

  it('失败必须可见：有 if: failure() 的告警步骤且能开 issue', () => {
    // 背景：定时任务挂掉时没人盯 Actions 页面，2026-11-01 连续失败数小时无人发现。
    // 判据是「有 failure() 步骤」+「它能写 issue」，缺任一条都等于没告警。
    expect(refresh).toMatch(/issues:\s*write/);
    const alertAt = refresh.indexOf('if: failure()');
    expect(alertAt, '缺少 if: failure() 的告警步骤').toBeGreaterThan(-1);
    const alertBlock = refresh.slice(alertAt, refresh.indexOf('- name: 恢复后关闭告警'));
    expect(alertBlock).toContain('gh issue create');
  });

  it('告警恢复后要能自动关闭（否则 issue 会越积越多）', () => {
    const block = refresh.slice(refresh.indexOf('- name: 恢复后关闭告警'));
    expect(block).toContain('gh issue close');
    expect(block).toMatch(/if: success\(\)/);
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
