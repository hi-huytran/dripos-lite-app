export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatCentsDelta(cents: number): string {
  if (cents === 0) return '';
  const sign = cents > 0 ? '+' : '-';
  return `${sign}${formatCents(Math.abs(cents))}`;
}
