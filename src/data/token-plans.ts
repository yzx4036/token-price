import type { TokenPlan } from '../lib/schema';

// 首版没有满足核价纪律的订阅型 Token/Coding Plan，禁止用演示数据填充。
export const rawTokenPlans = [] satisfies TokenPlan[];
