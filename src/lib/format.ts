export function fmtMoney(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('th-TH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}

export function fmtPct(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 6 });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

export function toneClass(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'text-forest/50';
  if (n > 0) return 'text-emerald-700';
  if (n < 0) return 'text-rose-600';
  return 'text-forest/60';
}
