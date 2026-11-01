import type { TokenPlan } from './schema';

export type AllowanceNature = TokenPlan['allowanceNature'];

/**
 * 额度性质的一行说明。
 *
 * 「不限量」在订阅制里是最容易误导的三个字：ChatGPT Pro 的日常文本对话确实不限量，
 * 可它最新的 GPT-6 全系在 Pro 上只是「扩展额度」——读者看到「不限量」就去买，
 * 结果想用的那个模型反而最受限。所以这里把话说到「哪部分不限量、哪部分有天花板」。
 */
export const NATURE_LABEL: Record<AllowanceNature, string> = {
  mixed: '部分不限量',
  quota: '纯额度',
  undisclosed: '额度未披露',
};

export const NATURE_HINT: Record<AllowanceNature, string> = {
  mixed: '有某项功能不限量（如日常文本对话、代码补全），但模型或其它功能另有额度天花板 —— 具体限在哪一部分见额度说明',
  quota: '积分 / 请求次数 / 相对倍率，全部有上限，没有不限量项',
  undisclosed: '官方只给「更高」「更多」这类定性描述，未披露具体数值，也无法折算',
};

/** 只有 mixed 值得在列表里打标：quota 是默认形态，undisclosed 已有「待核验」的观感 */
export function natureBadge(nature: AllowanceNature): string | null {
  return nature === 'mixed' ? NATURE_LABEL.mixed : null;
}

export function natureHint(nature: AllowanceNature): string {
  return NATURE_HINT[nature];
}

/** 全站统计：有多少档存在不限量项 —— 结论卡与测试都用它 */
export function countMixed(plans: readonly TokenPlan[]): number {
  return plans.filter((p) => p.allowanceNature === 'mixed').length;
}
