import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from './cn';
import { Tip } from './Tooltip';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'record';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-onprimary hover:bg-primaryh border border-transparent',
  secondary: 'bg-surface text-fg border border-line2 hover:bg-surface3',
  ghost: 'bg-transparent text-muted border border-transparent hover:bg-surface3 hover:text-fg',
  danger: 'bg-danger text-white border border-transparent hover:brightness-110',
  record: 'bg-rec text-white border border-transparent hover:brightness-110',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  icon?: LucideIcon;
  loading?: boolean;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon: Icon, loading, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,filter,border-color,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-9 px-3.5 text-base' : 'h-7 px-2.5 text-sm',
        VARIANT[variant],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="acs-spin" /> : Icon ? <Icon size={size === 'md' ? 16 : 14} strokeWidth={2.1} /> : null}
      {children}
    </button>
  );
});

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  label: string;
  hint?: ReactNode;
  active?: boolean;
  size?: 'sm' | 'md';
  tipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export function IconButton({ icon: Icon, label, hint, active, size = 'md', tipSide = 'bottom', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <Tip content={label} hint={hint} side={tipSide}>
      <button
        type={type}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          'inline-flex items-center justify-center rounded-md border border-transparent text-muted transition-colors duration-150 hover:bg-surface3 hover:text-fg disabled:cursor-not-allowed disabled:opacity-45',
          size === 'md' ? 'h-8 w-8' : 'h-7 w-7',
          active && 'bg-primarys text-primary hover:bg-primarys hover:text-primary',
          className,
        )}
        {...rest}
      >
        <Icon size={size === 'md' ? 17 : 15} strokeWidth={2} />
      </button>
    </Tip>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'primary' | 'rec' | 'done' | 'silence' | 'proc'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-surface3 text-muted',
    primary: 'bg-primarys text-primary',
    rec: 'bg-recs text-rec',
    done: 'bg-dones text-done',
    silence: 'bg-silences text-silence',
    proc: 'bg-procs text-proc',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide', tones[tone], className)}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-lg border border-line bg-surface shadow-soft', className)}>{children}</section>;
}

export function SectionTitle({ icon: Icon, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-faint">
        {Icon ? <Icon size={14} strokeWidth={2.2} /> : null}
        {children}
      </h3>
      {action}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-base font-medium">{label}</span>
        {hint ? <span className="block text-sm text-faint">{hint}</span> : null}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50', checked ? 'bg-primary' : 'bg-line2')}
      >
        <span className={cn('absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-soft transition-transform duration-150', checked && 'translate-x-4')} />
      </button>
    </div>
  );
}

export interface SegOption<T extends string | number> { value: T; label: ReactNode; hint?: ReactNode; disabled?: boolean }

export function Segmented<T extends string | number>({ value, onChange, options, disabled, label, className }: { value: T; onChange: (v: T) => void; options: SegOption<T>[]; disabled?: boolean; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex w-full rounded-md border border-line bg-surface2 p-0.5', className)}>
      {options.map((o) => {
        const on = o.value === value;
        const btn = (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled || o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex-1 whitespace-nowrap rounded-sm px-2 py-1 text-sm font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
              on ? 'bg-surface text-primary shadow-soft ring-1 ring-primaryl' : 'text-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
        return o.hint ? <Tip key={String(o.value)} content={o.hint} className="flex flex-1">{btn}</Tip> : btn;
      })}
    </div>
  );
}

export function Slider({ label, value, min, max, step = 1, unit, onChange, disabled, hint, format }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean; hint?: string; format?: (v: number) => string }) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-base font-medium">{label}</label>
        <span className="num text-sm text-primary">{format ? format(value) : value}{unit ? ` ${unit}` : ''}</span>
      </div>
      <input id={id} type="range" className="acs-range" style={{ ['--p' as string]: `${pct}%` }} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      {hint ? <p className="text-sm text-faint">{hint}</p> : null}
    </div>
  );
}

export function Select({ label, children, hint, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-base font-medium">{label}</label>
      <select id={id} {...rest} className="h-9 w-full rounded-md border border-line2 bg-surface px-2 text-base outline-none transition-colors focus:border-primary disabled:opacity-50">
        {children}
      </select>
      {hint ? <p className="mt-1 text-sm text-faint">{hint}</p> : null}
    </div>
  );
}

export function NumberField({ label, value, min, max, step = 1, unit, onChange, disabled, className }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; disabled?: boolean; className?: string }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-base font-medium">{label}</label>
      <div className="flex h-9 items-center rounded-md border border-line2 bg-surface focus-within:border-primary">
        <input id={id} type="number" disabled={disabled} min={min} max={max} step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n))); }} className="num w-full min-w-0 bg-transparent px-2 text-base outline-none" />
        {unit ? <span className="pr-2 text-sm text-faint">{unit}</span> : null}
      </div>
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, type = 'text', hint, disabled, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string; disabled?: boolean; mono?: boolean }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-base font-medium">{label}</label>
      <input id={id} type={type} disabled={disabled} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" spellCheck={false} className={cn('h-9 w-full rounded-md border border-line2 bg-surface px-2.5 text-base outline-none transition-colors focus:border-primary disabled:opacity-50', mono && 'num text-sm')} />
      {hint ? <p className="mt-1 text-sm text-faint">{hint}</p> : null}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-faint">{label}</div>
      <div className={cn('num truncate text-xl font-semibold leading-tight', tone)}>{value}</div>
      {sub ? <div className="truncate text-xs text-faint">{sub}</div> : null}
    </div>
  );
}

export function KV({ k, v, mono = true, tone }: { k: string; v: ReactNode; mono?: boolean; tone?: 'detected' | 'config' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="flex items-center gap-1.5 text-sm text-muted">
        {tone ? <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'detected' ? 'bg-done' : 'bg-primary')} /> : null}
        {k}
      </dt>
      <dd className={cn('min-w-0 truncate text-right text-sm font-medium', mono && 'num')}>{v}</dd>
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 size={15} className="acs-spin text-primary" />
      {label}
    </div>
  );
}

export function IndeterminateBar() {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-surface3" role="progressbar" aria-label="Procesando">
      <div className="h-full w-2/5 rounded-full bg-primary" style={{ animation: 'acs-indeterminate 1.2s ease-in-out infinite' }} />
    </div>
  );
}
