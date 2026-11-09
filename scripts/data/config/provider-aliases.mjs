/** 人工确认的 discover 覆盖归一；不参与 pull 来源选择与模型上限计算。 */
export const DISCOVER_PROVIDER_ALIASES = Object.freeze({
  // 快照 name: Z.AI / Zhipu AI；共同模型名: GLM-5.1、GLM-5.3-Flash；人工确认: 2026-11-09。
  zai: 'zhipuai',
  // 快照 name: MiniMax (minimax.io) / MiniMax (minimax.cn)；共同模型名: MiniMax-M2.7、MiniMax-M2.5；人工确认: 2026-11-09。
  minimax: 'minimax-cn',
  // 快照 name: Moonshot AI / Moonshot AI (China)；共同模型名: Kimi K2.7 Code、Kimi K3.1 Pro；人工确认: 2026-11-09。
  moonshotai: 'moonshotai-cn',
  // 快照 name: StepFun (Global) / StepFun (China)；共同模型名: Step 3.7 Flash；人工确认: 2026-11-09。
  'stepfun-ai': 'stepfun',
  // 快照 name: Alibaba / Alibaba (China)；共同模型名: Qwen3.6 Max Preview、Qwen-VL Plus；人工确认: 2026-11-09。
  alibaba: 'alibaba-cn',
});
