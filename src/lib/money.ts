import Big from 'big.js';

/**
 * Formats a decimal amount given as a string (as APIs should send money)
 * without passing through a float. Rounds half-up to `decimals` places.
 */
export function formatAmount(amount: string, currency: string, decimals = 2, locale = 'en-US'): string {
  const fixed = new Big(amount).toFixed(decimals, Big.roundHalfUp);
  const [intPart, fracPart] = fixed.split('.');
  const negative = intPart.startsWith('-');
  const digits = negative ? intPart.slice(1) : intPart;
  const group = new Intl.NumberFormat(locale).formatToParts(1000).find((p) => p.type === 'group')?.value ?? ',';
  const decimal = new Intl.NumberFormat(locale).formatToParts(1.1).find((p) => p.type === 'decimal')?.value ?? '.';
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const number = fracPart ? `${grouped}${decimal}${fracPart}` : grouped;
  return `${negative ? '-' : ''}${number} ${currency}`;
}
