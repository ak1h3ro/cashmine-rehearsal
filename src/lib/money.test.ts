import { describe, expect, it } from '@jest/globals';

import { formatAmount } from '@/lib/money';

describe('formatAmount', () => {
  it('groups thousands and rounds half-up', () => {
    expect(formatAmount('1234567.885', 'USDT', 2)).toBe('1,234,567.89 USDT');
  });

  it('keeps precision a float would lose', () => {
    expect(formatAmount('0.1', 'BTC', 8)).toBe('0.10000000 BTC');
    expect(formatAmount('9007199254740993.01', 'USD', 2)).toBe('9,007,199,254,740,993.01 USD');
  });

  it('handles negatives and zero decimals', () => {
    expect(formatAmount('-1000.4', 'USD', 0)).toBe('-1,000 USD');
  });
});
