import Big from 'big.js';
import { z } from 'zod';

/**
 * Money is decimal strings from the API and big.js for arithmetic, never
 * float. Sums keep full precision; rounding happens only in format functions.
 */

/** A non-negative decimal string as the API sends it, e.g. "820.413207". */
export const DecimalStringSchema = z.string().regex(/^\d+(\.\d+)?$/, 'Expected a decimal string');

/** A signed decimal string (activity amounts are negative for claims and reversals). */
export const SignedDecimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/, 'Expected a decimal string');

function separators(locale: string) {
  const group = new Intl.NumberFormat(locale).formatToParts(1000).find((p) => p.type === 'group')?.value ?? ',';
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.';
  return { group, decimal };
}

/** Groups the integer part of a plain decimal string ("-1234.5" -> "-1,234.5") without touching its digits. */
function groupDecimal(plain: string, locale: string): string {
  const [intPart, fracPart] = plain.split('.');
  const negative = intPart.startsWith('-');
  const digits = negative ? intPart.slice(1) : intPart;
  const { group, decimal } = separators(locale);
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const number = fracPart ? `${grouped}${decimal}${fracPart}` : grouped;
  return `${negative ? '-' : ''}${number}`;
}

/**
 * Formats a decimal amount without passing through a float.
 * Rounds half-up to `decimals` places.
 */
export function formatAmount(amount: Big | string, currency: string, decimals = 2, locale = 'en-US'): string {
  return `${groupDecimal(new Big(amount).toFixed(decimals, Big.roundHalfUp), locale)} ${currency}`;
}

/**
 * Formats an asset amount exactly as the server sent it: grouped, never
 * rounded, trailing zeros kept. Expects a string validated by the schemas above.
 */
export function formatAssetAmount(amount: string, asset: string, locale = 'en-US'): string {
  return `${groupDecimal(amount, locale)} ${asset}`;
}

/** USD for display: 2 dp, half-up. A non-zero value that rounds to 0.00 shows as "< 0.01 USD". */
export function formatUsd(value: Big | string, locale = 'en-US'): string {
  const usd = new Big(value);
  if (!usd.eq(0) && usd.abs().lt('0.005')) {
    return `${usd.lt(0) ? '> -' : '< '}${groupDecimal('0.01', locale)} USD`;
  }
  return formatAmount(usd, 'USD', 2, locale);
}

/** USD value of an amount at full precision. */
export function usdValue(amount: string, usdPrice: string): Big {
  return new Big(amount).times(usdPrice);
}

/** Sum of the USD values of `amount(item)` at full precision. */
export function sumUsd<T extends { usdPrice: string }>(items: readonly T[], amount: (item: T) => string): Big {
  return items.reduce((sum, item) => sum.plus(usdValue(amount(item), item.usdPrice)), new Big(0));
}

export function isZero(amount: string): boolean {
  return new Big(amount).eq(0);
}

export type ParsedAmount = { ok: true; value: string } | { ok: false; error: string };

/**
 * Turns what the user typed into the canonical form the API wants:
 * trimmed, "," accepted as the decimal separator, normalised by big.js
 * ("05" -> "5", "0.50" -> "0.5", ".5" -> "0.5"). Signs and exponents are rejected.
 */
export function parseAmountInput(input: string): ParsedAmount {
  const text = input.trim().replace(/,/g, '.');
  if (text === '') return { ok: false, error: 'Enter an amount.' };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(text)) return { ok: false, error: 'Enter a number like 0.5.' };
  return { ok: true, value: new Big(text).toFixed() };
}

type ClaimLimits = { asset: string; decimals: number; minAmount: string; available: string; fee: string };

/** Validates a canonical amount (from parseAmountInput) against the API rules. Returns an error or null. */
export function validateClaimAmount(amount: string, limits: ClaimLimits): string | null {
  const { asset, decimals, minAmount, available, fee } = limits;
  const places = amount.split('.')[1]?.length ?? 0;
  if (places > decimals) return `${asset} allows at most ${decimals} decimal places.`;
  const value = new Big(amount);
  if (value.lt(minAmount)) return `The minimum claim is ${formatAssetAmount(minAmount, asset)}.`;
  if (value.gt(available)) return `You have ${formatAssetAmount(available, asset)} available.`;
  if (value.lte(fee)) return `The amount must be more than the fee (${formatAssetAmount(fee, asset)}).`;
  return null;
}

/** What the user receives: the fee is taken from the claimed amount. */
export function receiveAmount(amount: string, fee: string): string {
  return new Big(amount).minus(fee).toFixed();
}
