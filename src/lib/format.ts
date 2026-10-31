const PRICE_PLACEHOLDER = '待核验';

// 统一价格展示：null 一律渲染占位文案，绝不出现 $null / $undefined
export function formatUsdPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price) || price < 0) return PRICE_PLACEHOLDER;
  return `$${price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}

export function formatContextTokens(tokens: number | null): string {
  if (tokens === null || !Number.isFinite(tokens) || tokens <= 0) return PRICE_PLACEHOLDER;
  return `${(tokens / 1_000_000).toLocaleString('en-US')}M`;
}

// 首页摘要一行：只用于已核验条目，缺价同样走占位文案
export function formatPricePair(inputPrice: number | null, outputPrice: number | null): string {
  return `输入 ${formatUsdPrice(inputPrice)}/1M · 输出 ${formatUsdPrice(outputPrice)}/1M`;
}
