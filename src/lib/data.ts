import { rawApiPrices } from '../data/api-prices';
import { rawTokenPlans } from '../data/token-plans';
import { parseApiPrices, parseTokenPlans } from './schema';

export const apiPrices = parseApiPrices(rawApiPrices);
export const tokenPlans = parseTokenPlans(rawTokenPlans);
export const DATA_VERIFIED_AT = '2026-10-31';
