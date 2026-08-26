import Link from 'next/link';
import { fmtPct, toneClass } from '@/lib/format';

export function PageHeader({
  title,
  subtitle,
  emoji,
  action,
}: {
  title: string;
  subtitle?: string;
  emoji?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-forest sm:text-3xl">
          {emoji && <span className="text-3xl">{emoji}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-forest/60">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: number | null;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        'card card-pad',
        accent ? 'text-white border-transparent' : '',
      ].join(' ')}
      style={
        accent
          ? { backgroundImage: 'linear-gradient(135deg,#66BB6A 0%,#1B5E20 100%)' }
          : undefined
      }
    >
      <div
        className={[
          'text-[11px] font-semibold uppercase tracking-wider',
          accent ? 'text-white/70' : 'text-forest/55',
        ].join(' ')}
      >
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tabular-nums">{value}</div>
      {sub !== undefined && (
        <div
          className={[
            'mt-1 text-xs font-medium',
            accent ? 'text-white/80' : tone !== undefined ? toneClass(tone) : 'text-forest/55',
          ].join(' ')}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function Delta({ value, digits = 2 }: { value: number | null | undefined; digits?: number }) {
  return <span className={toneClass(value)}>{fmtPct(value, digits)}</span>;
}

export function Card({
  title,
  right,
  children,
  className = '',
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card card-pad ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="card-title">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({
  emoji = '🌱',
  title,
  hint,
  href,
  cta,
}: {
  emoji?: string;
  title: string;
  hint?: string;
  href?: string;
  cta?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-leaf bg-mist/40 px-6 py-12 text-center">
      <div className="text-4xl">{emoji}</div>
      <div className="font-semibold text-forest">{title}</div>
      {hint && <div className="max-w-md text-sm text-forest/55">{hint}</div>}
      {href && cta && (
        <Link href={href} className="btn-primary mt-3">
          {cta}
        </Link>
      )}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    hit: ['pill-hit', 'ถึงจุดแล้ว'],
    near: ['pill-near', 'ใกล้มาก'],
    watch: ['pill-watch', 'เฝ้าดู'],
    far: ['pill-far', 'ยังไกล'],
    unknown: ['pill-unknown', 'ไม่มีราคา'],
  };
  const [cls, label] = map[status] ?? map.unknown;
  return <span className={cls}>{label}</span>;
}
