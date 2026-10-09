import { z } from "zod";

export const MAX_MONEY_AMOUNT = 999_999_999.99;

export function moneyAmount() {
  return z.number().finite().min(0).max(MAX_MONEY_AMOUNT);
}

export function positiveMoneyAmount() {
  return z.number().finite().gt(0).max(MAX_MONEY_AMOUNT);
}
