<script setup lang="ts">
import { aggregateFile, AGGREGATE_FETCHED_AT, AGGREGATE_SOURCE, apiPrices, DATA_VERIFIED_AT, fxRate } from '../lib/data';
import { RATE_DISCLAIMER, formatRate } from '../lib/fx';
import { computeStats } from '../lib/stats';
import { SITE_DISCLAIMER } from '../lib/site-meta';

const stats = computeStats(apiPrices);
</script>

<template>
  <article class="page prose">
    <section class="hero">
      <p class="eyebrow">Methodology</p>
      <h1>数据口径与免责声明</h1>
      <p class="lede">这里解释一个数字为何出现、何时失效，以及哪些成本没有被它覆盖。</p>
    </section>

    <section>
      <h2>来源与核验</h2>
      <p>
        只采用厂商官方定价或文档页面，以及明确标注的第三方聚合源；不采用搜索摘要、媒体文章、中转商价格或模型记忆。当前官方条目核验日期为
        <strong>{{ DATA_VERIFIED_AT }}</strong>，来源链接随每条记录展示。页面可访问不代表价格永久有效，使用前应再次查看官方页面。
      </p>
    </section>

    <section>
      <h2>溯源分级：official 与 aggregate</h2>
      <p>每条价格必须声明溯源等级：</p>
      <ul>
        <li>
          <strong>official（官方页抓取）</strong>：爬虫从厂商官方定价页抓取输入价、输出价、缓存价与适用条件，页面标「官方页抓取 · 抓取日期」。共 {{ stats.official }} 条。
        </li>
        <li>
          <strong>aggregate（聚合数据）</strong>：取自第三方聚合源（{{ AGGREGATE_SOURCE }}），<em>未逐条核对官方页</em>，页面标「聚合数据 · 未核官方页 · 抓取于 YYYY-MM-DD」。共 {{ stats.aggregate }} 条。
        </li>
      </ul>
      <p>同一模型同时存在两种来源时以 official 为准，aggregate 只补空缺，绝不允许聚合值静默覆盖官方值。排行榜与「最便宜」类结论只基于 official 条目，并且排除 0 元免费档——免费档会让「最低价」永远是 0、失去比较意义，它们仍在表格与详情里完整保留，只是不参与结论。官方样本不足时页面不给出结论。</p>
      <p>
        为什么有些厂商仍只走聚合：很多定价页是 JavaScript 渲染的，但这批文档站同时提供 Markdown 原文——在页面 URL 后加 <code>.md</code>，或先读站点的
        <code>llms.txt</code> 索引，就能直接拿到官方价格表。本期用这个方法核到官方的有 OpenAI、智谱、xAI、Mistral（以及 DeepSeek、MiniMax、Anthropic、Google）。仍只走聚合的是：Kimi、小米、阶跃、Cohere（其 Standard Vault 按实例小时计费，与 per-token 不可比）、Meta。这类厂商宁可标 aggregate 并注明，也不把推测写成 official。
      </p>
      <p>
        国内厂商的聚合条目要额外说明一句：聚合源对国内厂商同样以 USD 发布，数值是按汇率从厂商人民币挂牌价折算来的。所以这些条目的<strong>账单币种是 CNY、报价币种是 USD</strong>，页面标「聚合数据 · 聚合源 USD 折算」，绝不标「官方标价」。
      </p>
    </section>

    <section>
      <h2>币种：账单币种决定主列，人民币只是估算副列</h2>
      <p>每条记录有三个概念，不能混用：</p>
      <ul>
        <li><strong>billingCurrency</strong>：厂商实际账单币种，这是账单真相，也是价格主列的币种。国内厂商为 CNY，国际厂商为 USD。</li>
        <li><strong>reportedCurrency</strong>：这条数字本身以什么币种表达。官方条目必须与账单币种一致；聚合条目由聚合源以 USD 发布，因此国内厂商的聚合条目是「账单 CNY + 报价 USD」。</li>
        <li><strong>展示用人民币值</strong>：只在国际厂商行作为副行出现，由美元标价乘汇率得到，必须带「≈」与「估算」；国内厂商行不出现美元。</li>
      </ul>
      <p>
        因此页面标注分四类：official + CNY 标「官方标价」，主列是人民币；official + USD 主列是美元标价，副行标「≈ ¥… · 按 {{ formatRate(fxRate.rate) }} 估算（{{ fxRate.date }}）」，<strong>不出现「官方标价 ¥」这类写法</strong>；聚合 + 账单 CNY + 报价 USD 标「聚合数据 · 聚合源 USD 折算 · 汇率 …」，同样<strong>不出现「官方标价」字样</strong>；聚合 + USD 主列仍是美元标价，副行标聚合来源与估算人民币。schema 强制「official 条目的 reportedCurrency 必须等于 billingCurrency」，写错即校验失败。
      </p>
      <p>排序不做跨币种合并：表格先按账单币种分组（美元组在前、人民币组在后），组内再按原币种价格升序，因此不存在一个把美元条目和人民币条目混在一起的「最便宜」榜首。</p>
    </section>

    <section>
      <h2>汇率口径</h2>
      <p>
        汇率来自 <a :href="fxRate.sourceUrl" rel="noreferrer" target="_blank">{{ fxRate.source }}</a>，本次为 1 USD =
        <strong>{{ fxRate.rate }}</strong> CNY，汇率日期 <strong>{{ fxRate.date }}</strong>，抓取时间 <code>{{ fxRate.fetchedAt }}</code>。页面只读
        <code>src/data/generated/fx.generated.json</code>，文件缺失时构建直接失败；代码里没有把汇率写死成常量充当唯一来源。
      </p>
      <p><strong>{{RATE_DISCLAIMER}}</strong>本站不承诺实时汇率，也不做跨币种套利或结算建议。缺汇率时美元标价照常展示，人民币位置明确写「汇率数据缺失」，不给 0，也不退回过期数值。</p>
    </section>

    <section>
      <h2>API 与 Plan 分开</h2>
      <p>API 是按使用量计费，Token/Coding Plan 通常还包含周期、额度语义、公平使用和用途限制。两者不进入同一个「最便宜」排行。</p>
      <p>
        <strong>反推的等效用量不算「换算成每 1M Token」。</strong>套餐详情与计算器里的「等效 API 用量」，回答的是「同样这些 token 按量买要多少钱」，
        即用该厂商自己的 API 单价反推出的<strong>保本点</strong>；它<strong>不是</strong>厂商公布的额度，也不代表套餐一定够用。
        这条界线守三件事：①只用本厂商、同币种、官方页的 API 单价，不跨厂商借价（否则百度套餐按智谱的低价算会得出「¥9.9 ≈ 99M」这种假结论）；
        ②基准模型取该厂商<strong>输出单价中位数</strong>那档，不取最便宜的小模型（否则会系统性高估套餐价值）；
        ③输入输出按 <strong>3:1</strong> 混合计权，不按纯输出价算（纯输出忽略输入成本，会把保本点算高）。
        页面上凡是反推值，标题固定为「等效 API 用量」，并与「完整额度（官方披露）」分列显示、加左侧竖线区分；
        厂商没公布月费、或没有同厂商按量条目时，明确写「不做等效折算」，不给数。
      </p>
    </section>

    <section>
      <h2>计算公式与缺价</h2>
      <p>估算成本 = Σ（某类 Token 数量 ÷ 1,000,000 × 该类单价）。若某类用量大于 0，而对应价格为空，计算器会 fail closed，不输出部分总价。结果不含税费、缓存存储、搜索、工具调用及官方另行列示的费用。</p>
    </section>

    <section>
      <h2>峰谷价、阶梯价与批量价</h2>
      <p>
        DeepSeek 按请求时段区分峰谷价，本项目拆成独立条目并在模型名与口径里重复标明。阿里百炼、火山方舟、MiniMax 的部分模型按输入长度阶梯计价，本项目收录最低一档并在口径里写明其他档位价格；批量（Batch）、优先服务、长上下文溢价同样写在口径列，不用最低条件代表全部请求。
      </p>
    </section>

    <section>
      <h2>聚合源说明</h2>
      <p>
        聚合快照 <strong>{{ AGGREGATE_FETCHED_AT }}</strong>，来自
        <a :href="aggregateFile.sourceUrl" rel="noreferrer" target="_blank">{{ AGGREGATE_SOURCE }}</a>（{{ aggregateFile.providerStats.providers }} 个 provider / {{ aggregateFile.providerStats.models }} 个模型）。聚合条目的数字由聚合源以 USD 发布，可能与厂商官网人民币挂牌价不同；本站照抄聚合值并标注来源，人民币值只在估算副列出现，不回写数据、不修补聚合值。
      </p>
    </section>

    <section>
      <h2>数据更新方式</h2>
      <p>
        汇率、聚合快照、新增条目都由 <code>scripts/data/cli.mjs</code> 维护：<code>rate</code> / <code>pull</code> / <code>add</code> / <code>verify</code> /
        <code>drift</code> / <code>publish</code>。写文件命令一律先校验后原子落盘，非法输入不会污染数据文件。
      </p>
    </section>

    <section>
      <h2>免责声明</h2>
      <p>{{ SITE_DISCLAIMER }}</p>
      <p>官方可能随时调整模型、价格、时间窗口或计费规则；最终账单以厂商页面与账单为准。</p>
    </section>
  </article>
</template>
