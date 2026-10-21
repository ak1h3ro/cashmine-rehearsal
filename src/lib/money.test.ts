import { describe, expect, it } from '@jest/globals';

import {
  DecimalStringSchema,
  formatAmount,
  formatAssetAmount,
  formatUsd,
  isZero,
  parseAmountInput,
  receiveAmount,
  SignedDecimalStringSchema,
  sumUsd,
  usdValue,
  validateClaimAmount,
} from '@/lib/money';

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

describe('formatAssetAmount', () => {
  it('shows the server string grouped, never rounded', () => {
    expect(formatAssetAmount('820.413207', 'USDT')).toBe('820.413207 USDT');
    expect(formatAssetAmount('1234567.000000000000000001', 'ETH')).toBe('1,234,567.000000000000000001 ETH');
  });

  it('keeps trailing zeros and signs', () => {
    expect(formatAssetAmount('50.120', 'USDT')).toBe('50.120 USDT');
    expect(formatAssetAmount('-9.81', 'USDT')).toBe('-9.81 USDT');
    expect(formatAssetAmount('0', 'BTC')).toBe('0 BTC');
  });
});

describe('usdValue and formatUsd', () => {
  it('multiplies at full precision', () => {
    expect(usdValue('0.0005', '67000.12').toFixed()).toBe('33.50006');
    expect(usdValue('820.413207', '1.0002').toFixed()).toBe('820.5772896414');
  });

  it('rounds to 2 dp only for display', () => {
    expect(formatUsd(usdValue('820.413207', '1.0002'))).toBe('820.58 USD');
    expect(formatUsd('0.005')).toBe('0.01 USD');
    expect(formatUsd('0')).toBe('0.00 USD');
  });

  it('does not show a tiny non-zero value as zero', () => {
    expect(formatUsd(usdValue('0.00000001', '0.5'))).toBe('< 0.01 USD');
  });
});

describe('sumUsd', () => {
  const items = [
    { available: '0.1', usdPrice: '1' },
    { available: '0.2', usdPrice: '1' },
    { available: '0.0005', usdPrice: '67000.12' },
  ];

  it('sums without float error', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in float.
    expect(sumUsd(items.slice(0, 2), (b) => b.available).toFixed()).toBe('0.3');
    expect(sumUsd(items, (b) => b.available).toFixed()).toBe('33.80006');
  });

  it('rounds the total once, not each term', () => {
    // Each term rounds down to 0.00, but the sum is 0.012.
    const tiny = [1, 2, 3].map(() => ({ available: '0.004', usdPrice: '1' }));
    expect(formatUsd(sumUsd(tiny, (b) => b.available))).toBe('0.01 USD');
  });

  it('is zero for an empty list', () => {
    expect(sumUsd([], () => '0').toFixed()).toBe('0');
  });
});

describe('decimal string schemas', () => {
  it('accepts API amounts', () => {
    expect(DecimalStringSchema.safeParse('0.0005').success).toBe(true);
    expect(DecimalStringSchema.safeParse('12').success).toBe(true);
    expect(SignedDecimalStringSchema.safeParse('-9.81').success).toBe(true);
  });

  it('rejects numbers, exponents and malformed strings', () => {
    for (const bad of [0.5, '1e-3', '.5', '1.', '', ' 1', '-1']) {
      expect(DecimalStringSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('isZero handles any representation of zero', () => {
    expect(isZero('0')).toBe(true);
    expect(isZero('0.000000')).toBe(true);
    expect(isZero('0.000001')).toBe(false);
  });
});

describe('parseAmountInput', () => {
  it('normalises to the canonical form the API wants', () => {
    expect(parseAmountInput('05')).toEqual({ ok: true, value: '5' });
    expect(parseAmountInput('0.50')).toEqual({ ok: true, value: '0.5' });
    expect(parseAmountInput(' 1,5 ')).toEqual({ ok: true, value: '1.5' });
    expect(parseAmountInput('.5')).toEqual({ ok: true, value: '0.5' });
    expect(parseAmountInput('5.')).toEqual({ ok: true, value: '5' });
    expect(parseAmountInput('0.000000000000000001')).toEqual({ ok: true, value: '0.000000000000000001' });
  });

  it('rejects empty input, signs, exponents and garbage', () => {
    for (const bad of ['', '   ', '-1', '+1', '1e-3', '1E3', 'abc', '.', '1.2.3', '1,000.5', 'Infinity', 'NaN']) {
      expect(parseAmountInput(bad).ok).toBe(false);
    }
  });
});

describe('validateClaimAmount', () => {
  const limits = { asset: 'ETH', decimals: 4, minAmount: '0.01', available: '1.5', fee: '0.0012' };

  it('accepts amounts within the rules, including both bounds', () => {
    expect(validateClaimAmount('0.5', limits)).toBeNull();
    expect(validateClaimAmount('0.01', limits)).toBeNull();
    expect(validateClaimAmount('1.5', limits)).toBeNull();
  });

  it('enforces decimals on the canonical value', () => {
    expect(validateClaimAmount('0.12345', limits)).toMatch(/at most 4 decimal places/);
    // "0.50000" normalises to "0.5", so trailing zeros never count as extra places.
    const parsed = parseAmountInput('0.50000');
    expect(parsed.ok && validateClaimAmount(parsed.value, limits)).toBeNull();
  });

  it('enforces min and available', () => {
    expect(validateClaimAmount('0.0099', limits)).toMatch(/minimum/);
    expect(validateClaimAmount('1.5001', limits)).toMatch(/available/);
  });

  it('rejects an amount that does not cover the fee', () => {
    expect(validateClaimAmount('0.0012', { ...limits, minAmount: '0' })).toMatch(/more than the fee/);
  });
});

describe('receiveAmount', () => {
  it('is amount minus fee, exact', () => {
    expect(receiveAmount('0.5', '0.0012')).toBe('0.4988');
    expect(receiveAmount('0.3', '0.1')).toBe('0.2');
    expect(receiveAmount('1.000000000000000001', '0.000000000000000001')).toBe('1');
  });
});
